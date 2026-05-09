"""
Concrete AI Provider Implementations — REST via httpx.

Each provider implements BaseAIGateway using httpx to call the provider's
REST API directly, avoiding heavyweight SDK dependencies. All resilience
logic (timeouts, circuit breaking) is handled by the CircuitBreaker wrapper.

Supported providers:
  - OpenAIProvider:     POST v1/chat/completions (OpenAI-compatible)
  - AnthropicProvider:  POST v1/messages (Anthropic Messages API)
  - GeminiProvider:     POST v1beta/models/{model}:generateContent
  - OllamaProvider:     POST v1/chat/completions (OpenAI-compatible, local)
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any, Dict, Optional, Callable, List
from abc import abstractmethod

import httpx

from app.middleware import configure_json_logging
from app.services.ai import BaseAIGateway
from app.services.ai.prompts import get_enrich_prompt, get_heal_prompt, get_nl_prompt

logger = configure_json_logging("netflix.ai.providers")

MAX_TOKENS = 1024
TEMPERATURE = 0.0


# ═══════════════════════════════════════════════════════════════════
# Shared Utilities
# ═══════════════════════════════════════════════════════════════════


def _strip_code_fences(text: str) -> str:
    """Strip markdown code fences from LLM output."""
    text = text.strip()
    if text.startswith("```"):
        first_newline = text.index("\n") if "\n" in text else len(text)
        text = text[first_newline + 1:]
    if text.endswith("```"):
        text = text[:-3]
    return text.strip()


def _extract_xml_json(text: str) -> str:
    """Extract JSON from <json>...</json> XML tags (Claude)."""
    match = re.search(r"<json>\s*(.*?)\s*</json>", text, re.DOTALL)
    if match:
        return match.group(1).strip()
    return _strip_code_fences(text)


def _parse_and_validate_json(raw: str, validator: Callable[[Dict[str, Any]], Dict[str, Any]]) -> Dict[str, Any]:
    """Generic JSON parser and validator."""
    cleaned = _strip_code_fences(raw)
    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Failed to parse AI response as JSON: {exc}") from exc

    if not isinstance(data, dict):
        raise ValueError(f"Expected JSON object, got {type(data).__name__}")
    
    return validator(data)


def _validate_filters(data: Dict[str, Any]) -> Dict[str, Any]:
    """Normalize the LLM JSON for NL->API translation."""
    genres = _parse_genres(data.get("genres", []))
    min_rating = _normalize_rating(data.get("min_rating"))
    year = _parse_years(data.get("year"))

    title = data.get("title")
    title = title.strip() if isinstance(title, str) and title.strip() else None

    return {"title": title, "genres": genres, "min_rating": min_rating, "year": year}


def _validate_heal(data: Dict[str, Any]) -> Dict[str, Any]:
    """Normalize the LLM JSON for metadata healing."""
    title = data.get("title")
    title = str(title).strip() if title is not None else None

    genres = _parse_genres(data.get("genres", []))
    year = _parse_year(data.get("year"))
    rating = _normalize_rating(data.get("rating"))

    return {"title": title, "genres": genres, "year": year, "rating": rating}


def _validate_enrich(data: Dict[str, Any]) -> Dict[str, Any]:
    """Normalize the LLM JSON for metadata enrichment."""
    return {
        "overview": data.get("overview") or "Overview unavailable.",
        "tagline": data.get("tagline"),
        "director": data.get("director") or "Unknown Director",
        "cast": (data.get("cast") or [])[:5],
        "popularity": data.get("popularity"),
        "provider": data.get("provider", "AI Cinephile Insights"),
        "poster_url": data.get("poster_url"),
        "imdb_url": data.get("imdb_url"),
        "tmdb_url": data.get("tmdb_url"),
        "rotten_tomatoes_url": data.get("rotten_tomatoes_url"),
        "letterboxd_url": data.get("letterboxd_url"),
    }


def _parse_genres(genres_raw: Any) -> List[str]:
    if isinstance(genres_raw, str):
        genres = [g.strip().title() for g in genres_raw.split(",") if g.strip()]
    elif isinstance(genres_raw, list):
        genres = [str(g).strip().title() for g in genres_raw if g]
    else:
        genres = []
    return [g for g in genres if g]


def _normalize_rating(rating_raw: Any) -> Optional[float]:
    if rating_raw is not None:
        try:
            rating = float(rating_raw)
            return max(0.0, min(10.0, rating))
        except (TypeError, ValueError):
            pass
    return None


def _parse_year(year_raw: Any) -> Optional[int]:
    if year_raw is not None:
        try:
            # Handle decade strings like "90s" or "1990s"
            if isinstance(year_raw, str):
                s = year_raw.lower().strip()
                if s.endswith("s"):
                    # Extract numeric part, e.g., "1990s" -> 1990, "90s" -> 90
                    num_str = "".join(filter(str.isdigit, s))
                    if num_str:
                        y = int(num_str)
                        if y < 100: y += 1900 if y >= 20 else 2000
                        return y

            y = int(year_raw)
            if 1888 <= y <= 2030:
                return y
        except (TypeError, ValueError):
            pass
    return None


def _parse_years(year_raw: Any) -> Optional[List[int]]:
    if isinstance(year_raw, list):
        parsed = [_parse_year(y) for y in year_raw]
        years = [y for y in parsed if y is not None]
        return years if years else None
    y = _parse_year(year_raw)
    return [y] if y else None


# ═══════════════════════════════════════════════════════════════════
# Base Provider Class (DRY)
# ═══════════════════════════════════════════════════════════════════


class BaseRESTProvider(BaseAIGateway):
    """
    Base class for REST-based AI providers.
    Implements common contract methods and handles shared httpx/JSON logic.
    """
    def __init__(self, prompt_type: str) -> None:
        self._prompt_type = prompt_type

    async def translate_nl_to_api(self, query: str) -> Dict[str, Any]:
        return await self._execute_workflow(
            get_nl_prompt(self._prompt_type), 
            query, 
            _validate_filters
        )

    async def heal_metadata(self, raw_text: str) -> Dict[str, Any]:
        return await self._execute_workflow(
            get_heal_prompt(self._prompt_type), 
            raw_text, 
            _validate_heal
        )

    async def enrich_metadata(self, title: str, year: Optional[int]) -> Dict[str, Any]:
        ctx = f"Movie: {title}" + (f" ({year})" if year else "")
        data = await self._execute_workflow(
            get_enrich_prompt(self._prompt_type), 
            ctx, 
            _validate_enrich
        )
        # Inject provider name into the result
        if "provider" not in data or data["provider"] == "AI Cinephile Insights":
            data["provider"] = self.provider_name
        return data

    async def validate_connection(self) -> bool:
        """Default validation: try a minimal token call."""
        # Use a specific system prompt that triggers 1-token optimization in child providers
        await self._call_llm(system="Respond with only 'ok'", user="ping", json_mode=False)
        return True

    async def _execute_workflow(
        self, 
        system: str, 
        user: str, 
        validator: Callable[[Dict[str, Any]], Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Unified workflow: call -> preprocess -> parse -> validate."""
        raw = await self._call_llm(system, user, json_mode=True)
        return _parse_and_validate_json(self._preprocess_raw(raw), validator)

    def _preprocess_raw(self, raw: str) -> str:
        """Hook for providers to clean raw text before JSON parsing."""
        return raw

    @abstractmethod
    async def _call_llm(self, system: str, user: str, json_mode: bool = False) -> str:
        """Internal method to execute the LLM request."""
        ...

    def _get_common_headers(self) -> Dict[str, str]:
        """Returns standard headers used across most providers."""
        return {"Content-Type": "application/json"}

    async def _post(self, url: str, headers: Dict[str, str], payload: Dict[str, Any]) -> Dict[str, Any]:
        """Shared helper for httpx POST requests with unified timeout."""
        async with httpx.AsyncClient(timeout=120.0) as client:
            try:
                resp = await client.post(url, headers=headers, json=payload)
                resp.raise_for_status()
                return resp.json()
            except httpx.HTTPStatusError as exc:
                # Include the response body in the error for easier debugging
                body = exc.response.text
                try:
                    error_data = exc.response.json()
                    message = error_data.get("error", {}).get("message", body)
                except Exception:
                    message = body
                raise ValueError(f"API {exc.response.status_code} error: {message}") from exc


# ═══════════════════════════════════════════════════════════════════
# OpenAI Provider
# ═══════════════════════════════════════════════════════════════════


class OpenAIProvider(BaseRESTProvider):
    def __init__(
        self,
        api_key: str,
        model: str = "gpt-4o-mini",
        base_url: Optional[str] = None,
        prompt_type: str = "openai",
        provider_name: str = "OpenAI",
    ) -> None:
        super().__init__(prompt_type)
        self._api_key = api_key
        self._model = model
        self._base_url = (base_url or "https://api.openai.com").rstrip("/")
        self._provider_name = provider_name
        logger.info("%s Provider initialized", provider_name, extra={
            "json_fields": {"component": "openai_provider", "model": model, "base_url": self._base_url}
        })

    @property
    def provider_name(self) -> str:
        return self._provider_name

    async def _call_llm(self, system: str, user: str, json_mode: bool = False) -> str:
        payload = {
            "model": self._model,
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
            "temperature": TEMPERATURE,
            "max_tokens": 1 if (system == "Respond with only 'ok'" or user == "ping") else MAX_TOKENS,
        }
        
        # Check for local servers (LM Studio, Ollama)
        is_local = any(x in self._base_url for x in ["localhost", "127.0.0.1", "192.168."]) or not self._api_key
        if json_mode and not is_local:
            payload["response_format"] = {"type": "json_object"}

        base_url = self._base_url
        if not base_url.endswith("/v1"):
            base_url = f"{base_url}/v1"
        endpoint = f"{base_url}/chat/completions"
        headers = self._get_common_headers()
        if self._api_key and self._api_key.lower() not in ("not-needed", "none", "lm-studio"):
            headers["Authorization"] = f"Bearer {self._api_key}"

        data = await self._post(endpoint, headers, payload)
        return data["choices"][0]["message"]["content"]


# ═══════════════════════════════════════════════════════════════════
# Anthropic Provider
# ═══════════════════════════════════════════════════════════════════


class AnthropicProvider(BaseRESTProvider):
    def __init__(self, api_key: str, model: str = "claude-3-5-sonnet-latest") -> None:
        super().__init__("anthropic")
        self._api_key = api_key
        self._model = model
        self._base_url = "https://api.anthropic.com"

    @property
    def provider_name(self) -> str: return "Claude"

    def _preprocess_raw(self, raw: str) -> str:
        return _extract_xml_json(raw)

    async def _call_llm(self, system: str, user: str, json_mode: bool = False) -> str:
        payload = {
            "model": self._model,
            "max_tokens": 1 if (system == "Respond with only 'ok'" or user == "ping") else MAX_TOKENS,
            "system": system,
            "messages": [{"role": "user", "content": user}],
            "temperature": TEMPERATURE,
        }
        headers = self._get_common_headers()
        headers.update({
            "x-api-key": self._api_key,
            "anthropic-version": "2023-06-01",
        })
        data = await self._post(f"{self._base_url}/v1/messages", headers, payload)
        return "\n".join([b["text"] for b in data.get("content", []) if b.get("type") == "text"])


# ═══════════════════════════════════════════════════════════════════
# Gemini Provider
# ═══════════════════════════════════════════════════════════════════


class GeminiProvider(BaseRESTProvider):
    def __init__(self, api_key: str, model: str = "gemini-2.0-flash") -> None:
        super().__init__("gemini")
        self._api_key = api_key
        self._model = model
        self._base_url = "https://generativelanguage.googleapis.com"

    @property
    def provider_name(self) -> str: return "Gemini"

    async def _call_llm(self, system: str, user: str, json_mode: bool = False) -> str:
        # Normalize model name (e.g. "Gemini 2.0 Flash" -> "gemini-2.0-flash")
        model_id = self._model.lower().strip().replace(" ", "-")
        # Direct users to supported models, including upgrading deprecated identifiers
        if model_id in ("gemini", "gemini-2", "gemini-1.5-flash", "gemini-1.5-pro"):
            model_id = "gemini-2.0-flash"

        gen_config: Dict[str, Any] = {
            "temperature": TEMPERATURE,
            "maxOutputTokens": 100 if user == "ping" else MAX_TOKENS,
        }
        if json_mode:
            gen_config["responseMimeType"] = "application/json"

        payload: Dict[str, Any] = {
            "contents": [{"parts": [{"text": user}]}],
            "generationConfig": gen_config,
        }
        
        if system:
            payload["systemInstruction"] = {"parts": [{"text": system}]}

        # v1beta is the most compatible endpoint for AI Studio keys across all model versions
        api_version = "v1beta"
        url = f"{self._base_url}/{api_version}/models/{model_id}:generateContent"
        
        headers = self._get_common_headers()
        if self._api_key:
            headers["x-goog-api-key"] = self._api_key
        
        # Log payload for debugging (masking sensitive info if needed, but here we need to see structure)
        logger.debug("Gemini payload: %s", json.dumps(payload))
        
        data = await self._post(url, headers, payload)
        
        candidates = data.get("candidates", [])
        if not candidates:
            raise ValueError("Gemini returned no candidates.")
        
        parts = candidates[0].get("content", {}).get("parts", [])
        if not parts:
            raise ValueError("Gemini returned no content parts.")
            
        return "".join(p.get("text", "") for p in parts)


# ═══════════════════════════════════════════════════════════════════
# Ollama Provider (Local)
# ═══════════════════════════════════════════════════════════════════


class OllamaProvider(OpenAIProvider):
    """Ollama is OpenAI-compatible, so we inherit from OpenAIProvider."""
    def __init__(self, base_url: str = "http://localhost:11434", model: str = "llama3") -> None:
        super().__init__(
            api_key="not-needed",
            model=model,
            base_url=base_url,
            prompt_type="local",
            provider_name="Ollama"
        )


# ═══════════════════════════════════════════════════════════════════
# OpenRouter Provider
# ═══════════════════════════════════════════════════════════════════


class OpenRouterProvider(OpenAIProvider):
    """
    OpenRouter is OpenAI-compatible but requires specific headers for 
    ranking and tracking.
    """
    def __init__(
        self, 
        api_key: str, 
        model: str = "google/gemini-2.0-flash-001"
    ) -> None:
        super().__init__(
            api_key=api_key,
            model=model,
            base_url="https://openrouter.ai/api/v1",
            prompt_type="openai",  # OpenRouter handles various models but we use OpenAI prompt style
            provider_name="OpenRouter"
        )

    async def _call_llm(self, system: str, user: str, json_mode: bool = False) -> str:
        """Override to add OpenRouter-specific headers."""
        # OpenRouter prefers response_format for JSON mode
        # We reuse the logic from OpenAIProvider but ensure headers are correct
        payload = {
            "model": self._model,
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
            "temperature": TEMPERATURE,
            "max_tokens": 1 if (system == "Respond with only 'ok'" or user == "ping") else MAX_TOKENS,
        }
        
        if json_mode:
            payload["response_format"] = {"type": "json_object"}

        endpoint = f"{self._base_url}/chat/completions"
        headers = self._get_common_headers()
        headers.update({
            "Authorization": f"Bearer {self._api_key}",
            "HTTP-Referer": "https://github.com/veersingh/netflix-movie-explorer", # Metadata
            "X-Title": "Netflix Movie Library Explorer",
        })

        data = await self._post(endpoint, headers, payload)
        
        if "choices" not in data or not data["choices"]:
            # Handle OpenRouter error format if needed
            if "error" in data:
                raise ValueError(f"OpenRouter error: {data['error'].get('message', 'Unknown error')}")
            raise ValueError(f"Unexpected OpenRouter response: {json.dumps(data)}")
            
        return data["choices"][0]["message"]["content"]

