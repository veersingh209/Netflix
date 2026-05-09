"""
AI Gateway Factory & Resilience Layer.

This module consolidates the AI service infrastructure, including:
  1. BaseAIGateway (ABC) — the provider contract
  2. CircuitBreaker — the resilience decorator
  3. AIGatewayFactory — the singleton registry for provider instances

Design Rationale:
    Consolidating these into a single module reduces file fragmentation and
    improves navigational clarity while maintaining strict separation of concerns
    between the contract (ABC), the implementation (Providers), and the registry.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from abc import ABC, abstractmethod
from typing import Any, Callable, Coroutine, Dict, Optional, Protocol, runtime_checkable, TYPE_CHECKING

import httpx

from app.middleware import configure_json_logging

if TYPE_CHECKING:
    from app.config import Settings

# ─── Safe Fallback Schemas ────────────────────────────────────────────
SAFE_FALLBACK: Dict[str, Any] = {
    "genres": [],
    "min_rating": None,
    "year": None,
}

HEAL_FALLBACK: Dict[str, Any] = {
    "title": None,
    "genres": [],
    "year": None,
    "rating": None,
}

ENRICH_FALLBACK: Dict[str, Any] = {
    "overview": "Information unavailable.",
    "tagline": None,
    "director": "Unknown",
    "cast": [],
    "popularity": None,
    "provider": "Offline Fallback",
}

# ─── Configuration Constants ─────────────────────────────────────────
MAX_CONSECUTIVE_FAILURES: int = 5
COOLDOWN_SECONDS: float = 30.0

logger = configure_json_logging("netflix.ai.service")


@runtime_checkable
class AIGatewayContract(Protocol):
    """
    Structural contract for all AI gateway implementations.
    Allows for static and runtime verification without requiring inheritance.
    """
    async def translate_nl_to_api(self, query: str) -> Dict[str, Any]: ...
    async def heal_metadata(self, raw_text: str) -> Dict[str, Any]: ...
    async def enrich_metadata(self, title: str, year: Optional[int]) -> Dict[str, Any]: ...
    async def validate_connection(self) -> bool: ...
    
    @property
    def provider_name(self) -> str: ...


class BaseAIGateway(ABC, AIGatewayContract):
    """
    Abstract base class that implements the AIGatewayContract.
    Used for concrete provider implementations.
    """

    @abstractmethod
    async def translate_nl_to_api(self, query: str) -> Dict[str, Any]:
        """Translate natural language to structured API parameters."""
        ...

    @abstractmethod
    async def heal_metadata(self, raw_text: str) -> Dict[str, Any]:
        """Extract metadata from unstructured text."""
        ...

    @abstractmethod
    async def validate_connection(self) -> bool:
        """Verify the provider is reachable and authentication is valid."""
        ...

    @property
    def provider_name(self) -> str:
        """Human-readable provider name."""
        return self.__class__.__name__


class CircuitBreaker(BaseAIGateway):
    """Resilience wrapper that protects providers with circuit breaker logic."""

    def __init__(
        self,
        inner: BaseAIGateway,
        api_key: Optional[str] = None,
        timeout: float = 2.5,
    ) -> None:
        self._inner = inner
        self._api_key = api_key
        self._timeout = timeout
        self._consecutive_failures: int = 0
        self._circuit_open: bool = False
        self._last_failure_time: Optional[float] = None
        self._last_error: Optional[str] = None

    @property
    def provider_name(self) -> str:
        return self._inner.provider_name

    async def translate_nl_to_api(self, query: str) -> Dict[str, Any]:
        return await self._protected_call(
            method_name="translate_nl_to_api",
            coro_factory=lambda: self._inner.translate_nl_to_api(query),
            fallback=dict(SAFE_FALLBACK),
            context={"query": query},
        )

    async def heal_metadata(self, raw_text: str) -> Dict[str, Any]:
        return await self._protected_call(
            method_name="heal_metadata",
            coro_factory=lambda: self._inner.heal_metadata(raw_text),
            fallback=dict(HEAL_FALLBACK),
            context={"raw_text_length": len(raw_text)},
        )

    async def enrich_metadata(self, title: str, year: Optional[int]) -> Dict[str, Any]:
        return await self._protected_call(
            method_name="enrich_metadata",
            coro_factory=lambda: self._inner.enrich_metadata(title, year),
            fallback=dict(ENRICH_FALLBACK),
            context={"title": title, "year": year},
        )

    async def validate_connection(self) -> bool:
        """Execute validation without circuit breaker logic (to allow recovery)."""
        try:
            # We don't use _protected_call here because validation is used to 
            # explicitly RESET the circuit or verify a new key.
            is_valid = await asyncio.wait_for(self._inner.validate_connection(), timeout=self._timeout)
            if is_valid:
                self._on_success()
                logger.info("Connection validated for %s. Circuit reset.", self.provider_name)
            else:
                self._on_failure("validate_connection", "Explicit validation failure", {}, {}, "failed")
            return is_valid
        except Exception as exc:
            self._last_error = str(exc)
            logger.warning("Connection validation failed for %s: %s", self.provider_name, exc)
            self._on_failure("validate_connection", str(exc), {}, {}, "failed")
            return False

    async def _protected_call(
        self,
        method_name: str,
        coro_factory: Callable[[], Coroutine],
        fallback: Dict[str, Any],
        context: Dict[str, Any],
    ) -> Dict[str, Any]:
        if self._circuit_open:
            if not self._should_attempt_reset():
                self._log_bypass(method_name, "Circuit OPEN", context)
                fallback["_ai_status"] = "circuit_open"
                return fallback

        if self._api_key is not None and (not self._api_key or self._api_key.strip() == ""):
            fallback["_ai_status"] = "no_api_key"
            return fallback

        try:
            result = await asyncio.wait_for(coro_factory(), timeout=self._timeout)
            if not isinstance(result, dict):
                raise ValueError(f"AI returned non-dict: {type(result).__name__}")
            self._on_success()
            result["_ai_status"] = "success"
            return result
        except asyncio.TimeoutError:
            return self._on_failure(method_name, "Timeout", context, fallback, "timeout")
        except Exception as exc:
            reason = self._classify_error(exc)
            return self._on_failure(method_name, reason, context, fallback, reason.lower().replace(" ", "_"))

    @staticmethod
    def _classify_error(exc: Exception) -> str:
        if isinstance(exc, httpx.TimeoutException): return "Timeout"
        if isinstance(exc, httpx.HTTPStatusError):
            status = exc.response.status_code
            if status == 401: return "Authentication error"
            if status == 429: return "Rate limit exceeded"
            if status >= 500: return "Provider server error"
            return f"HTTP {status} error"
        if isinstance(exc, httpx.ConnectError): return "Connection error"
        if isinstance(exc, (json.JSONDecodeError, ValueError)): return "Invalid JSON response"
        return "Unexpected error"

    def _on_success(self) -> None:
        self._consecutive_failures = 0
        self._circuit_open = False
        self._last_failure_time = None

    def _on_failure(self, method_name: str, reason: str, context: Dict[str, Any], fallback: Dict[str, Any], status: str) -> Dict[str, Any]:
        self._consecutive_failures += 1
        self._last_failure_time = time.monotonic()
        if self._consecutive_failures >= MAX_CONSECUTIVE_FAILURES:
            self._circuit_open = True
        self._log_bypass(method_name, f"{reason} (failure {self._consecutive_failures})", context)
        fallback["_ai_status"] = status
        return fallback

    def _should_attempt_reset(self) -> bool:
        if self._last_failure_time is None: return True
        return (time.monotonic() - self._last_failure_time) >= COOLDOWN_SECONDS

    def _log_bypass(self, method: str, reason: str, context: Dict[str, Any]) -> None:
        logger.warning(f"AI Bypass: {method} - {reason}", extra={"json_fields": {"method": method, "reason": reason, **context}})

    @property
    def status(self) -> Dict[str, Any]:
        return {
            "provider": self.provider_name,
            "circuit_open": self._circuit_open,
            "consecutive_failures": self._consecutive_failures,
            "api_key_configured": self._api_key is None or bool(self._api_key and self._api_key.strip()),
            "timeout_seconds": self._timeout,
            "last_error": self._last_error,
        }


class AIGatewayFactory:
    """Registry-based factory for AI gateway instantiation."""
    _registry: Dict[str, CircuitBreaker] = {}

    @classmethod
    def get_gateway(
        cls, 
        settings: Settings, 
        provider_override: Optional[str] = None,
        allow_fallback: bool = True
    ) -> AIGatewayContract:
        """
        Retrieves the requested AI gateway, or falls back to a local/offline alternative.
        
        If allow_fallback is False, it will strictly return the requested provider 
        (or a fallback gateway if it doesn't exist) without trying Ollama/Local.
        """
        provider = (provider_override or settings.ai_provider).lower()
        if provider not in cls._registry:
            cls._register_provider(provider, settings)
        
        gateway = cls._registry.get(provider)
        
        # If we have the requested gateway and it's healthy, use it.
        # If allow_fallback is False, we return it regardless of health so the caller can validate it.
        if gateway:
            if not allow_fallback:
                return gateway
            if not gateway.status["circuit_open"] and gateway.status["api_key_configured"]:
                return gateway

        # If strict mode, don't try local fallbacks
        if not allow_fallback:
            return _SafeFallbackGateway()

        # Fallback 1: Local Ollama
        if "ollama" not in cls._registry:
            cls._register_provider("ollama", settings)
        local_gw = cls._registry.get("ollama")
        if local_gw and not local_gw.status["circuit_open"] and local_gw.status["api_key_configured"]:
            return local_gw

        return _SafeFallbackGateway()

    @classmethod
    def _register_provider(cls, provider: str, settings: Settings) -> None:
        from app.services.ai.providers import AnthropicProvider, GeminiProvider, OllamaProvider, OpenAIProvider, OpenRouterProvider
        
        # Mapping of provider identifiers to their concrete class and configuration builder
        PROVIDERS: Dict[str, Any] = {
            "openai": lambda: (OpenAIProvider(api_key=settings.openai_api_key, model=settings.openai_model), settings.openai_api_key or ""),
            "lm_studio": lambda: (OpenAIProvider(
                api_key=settings.lm_studio_api_key, 
                model=settings.lm_studio_model, 
                base_url=settings.lm_studio_base_url, 
                prompt_type="local", 
                provider_name="LM Studio"
            ), settings.lm_studio_api_key or ""),
            "anthropic": lambda: (AnthropicProvider(api_key=settings.anthropic_api_key, model=settings.anthropic_model), settings.anthropic_api_key or ""),
            "gemini": lambda: (GeminiProvider(api_key=settings.gemini_api_key, model=settings.gemini_model), settings.gemini_api_key or ""),
            "ollama": lambda: (OllamaProvider(base_url=settings.local_base_url, model=settings.ollama_model), settings.ollama_api_key or ""),
            "openrouter": lambda: (OpenRouterProvider(api_key=settings.openrouter_api_key, model=settings.openrouter_model), settings.openrouter_api_key or ""),
        }

        if provider not in PROVIDERS:
            logger.error("Attempted to register unknown AI provider: %s", provider)
            return

        try:
            builder = PROVIDERS[provider]
            instance, api_key = builder()
            
            if instance:
                timeout = 90.0 if provider in ("ollama", "lm_studio") else settings.ai_timeout_seconds
                cls._registry[provider] = CircuitBreaker(inner=instance, api_key=api_key, timeout=timeout)
                logger.info("Registered AI provider: %s", provider)
        except Exception as exc:
            logger.error("Failed to initialize AI provider %s: %s", provider, exc)

    @classmethod
    def get_active_status(cls, settings: Any, provider_override: Optional[str] = None) -> Dict[str, Any]:
        provider = (provider_override or settings.ai_provider).lower()
        gateway = cls._registry.get(provider)
        return gateway.status if gateway else {"status": "not_initialized", "provider": provider}


class _SafeFallbackGateway(BaseAIGateway):
    @property
    def provider_name(self) -> str: return "Fallback (Offline)"
    async def translate_nl_to_api(self, query: str) -> Dict[str, Any]: return {**SAFE_FALLBACK, "_ai_status": "all_providers_down"}
    async def heal_metadata(self, raw_text: str) -> Dict[str, Any]: return {**HEAL_FALLBACK, "_ai_status": "all_providers_down"}
    async def enrich_metadata(self, title: str, year: Optional[int]) -> Dict[str, Any]: return {**ENRICH_FALLBACK, "_ai_status": "all_providers_down"}
    async def validate_connection(self) -> bool:
        raise ValueError("AI Gateway is in fallback mode. Registration failed or provider is unavailable.")
