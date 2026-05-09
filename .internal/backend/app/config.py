"""
Application configuration using Pydantic Settings.

Centralizes all environment-driven config with validation and type safety.
"""

from __future__ import annotations
from typing import List, Optional

from pydantic import Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables or .env file."""

    # Google Drive
    google_drive_folder_id: str = Field(
        default="1Z-Bqt69UgrGkwo0ArjHaNrA7uUmUm2r6",
        description="Root Google Drive folder ID to recursively fetch movie data from.",
    )
    google_client_secret_file: str = Field(
        default="credentials/client_secret.json",
        description="Path to the Google OAuth 2.0 client secret JSON file.",
    )
    google_service_account_file: str = Field(
        default="credentials/service_account.json",
        description="Path to the Google Service Account JSON file (for scalable non-interactive auth).",
    )
    google_token_file: str = Field(
        default="credentials/token.json",
        description="Path to the cached OAuth 2.0 token (auto-generated on first auth).",
    )

    # AI Provider Selection
    log_level: str = Field(
        default="DEBUG",
        description="Logging level: 'debug', 'info', 'warning', 'error', 'critical'.",
    )
    ai_provider: str = Field(
        default="openai",
        description="Active AI provider: 'openai', 'anthropic', 'gemini', 'lm_studio', or 'local'.",
    )
    ai_timeout_seconds: float = Field(
        default=15.0,
        description="Maximum seconds to wait for an AI response before circuit breaker trips.",
    )

    # OpenAI
    openai_api_key: Optional[str] = Field(
        default=None,
        description="OpenAI API key. Optional — system degrades gracefully without it.",
    )
    openai_model: str = Field(
        default="gpt-4o-mini",
        description="OpenAI model identifier (gpt-4o-mini for cost efficiency).",
    )

    # Anthropic
    anthropic_api_key: Optional[str] = Field(
        default=None,
        description="Anthropic API key.",
    )
    anthropic_model: str = Field(
        default="claude-3-5-sonnet-latest",
        description="Anthropic model identifier.",
    )

    # LM Studio (OpenAI-compatible local endpoint)
    lm_studio_base_url: str = Field(
        default="http://localhost:1234/v1",
        description="Base URL for LM Studio's OpenAI-compatible API endpoint.",
    )
    lm_studio_api_key: Optional[str] = Field(
        default="",
        description="Optional API key for LM Studio (usually not required, but used to track connection status).",
    )
    lm_studio_model: str = Field(
        default="local-model",
        description="Model identifier for LM Studio (usually doesn't matter, but kept for consistency).",
    )

    # Gemini
    gemini_api_key: Optional[str] = Field(
        default=None,
        description="Google Gemini API key.",
    )
    gemini_model: str = Field(
        default="gemini-2.0-flash",
        description="Google Gemini model identifier (e.g. 'gemini-2.0-flash').",
    )

    # Local Ollama
    local_base_url: str = Field(
        default="http://localhost:11434",
        description="Base URL for the local Ollama LLM server.",
    )
    ollama_api_key: Optional[str] = Field(
        default="",
        description="Optional API key for Ollama (usually not required, but used to track connection status).",
    )
    ollama_model: str = Field(
        default="llama3",
        description="Model name for local Ollama inference.",
    )

    # OpenRouter
    openrouter_api_key: Optional[str] = Field(
        default=None,
        description="OpenRouter API key. Provides access to a wide range of LLMs through a unified interface.",
    )
    openrouter_model: str = Field(
        default="google/gemini-2.0-flash-001",
        description="OpenRouter model identifier (e.g. 'google/gemini-2.0-flash-001', 'anthropic/claude-3.5-sonnet').",
    )

    # TMDB
    tmdb_api_key: Optional[str] = Field(
        default="",
        description="TMDB API key for fetching movie poster images. Get one at https://www.themoviedb.org/settings/api",
    )
    omdb_api_key: Optional[str] = Field(
        default="",
        description="OMDB API key for fetching movie metadata. Get one at http://www.omdbapi.com/",
    )

    # Security
    encryption_key: str = Field(
        description="Encryption key for sensitive data operations.",
    )

    # Application
    app_host: str = Field(default="0.0.0.0")
    app_port: int = Field(default=8002)
    cors_origins: List[str] = Field(
        default=["http://localhost:3000", "http://localhost:7173", "http://localhost:9000", "file://"],
        description="Allowed CORS origins for React frontend and splash screen.",
    )

    
    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "case_sensitive": False,
    }


settings = Settings()
