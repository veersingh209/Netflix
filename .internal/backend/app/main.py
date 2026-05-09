"""
Netflix Movie Library Explorer — FastAPI Application Entry Point.

This is the application factory. It wires together:
  - CORS (for the React frontend)
  - Observability middleware (latency tracking)
  - Startup lifecycle (Google Drive ingestion)
  - AI Gateway Factory (provider-agnostic, per-provider circuit breakers)
  - API Routers (Movies, Stats, Magic Search)
  - Health/status endpoints
"""

from __future__ import annotations

import logging
import psutil
import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Callable

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.config import settings
from app.services.ingestion import GoogleDriveService, IngestionResult, ingest_from_google_drive
from app.repository import MovieRepository
from app.api.routes import router
from app.middleware import ObservabilityMiddleware

# ─── Logging Configuration ────────────────────────────────────────
logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(asctime)s │ %(name)-28s │ %(levelname)-5s │ %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("netflix.app")

# ─── Application State (module-level singletons) ──────────────────
# These will be populated during the lifespan startup
_ingestion_result: Optional[IngestionResult] = None
_drive_service: Optional[GoogleDriveService] = None

# ─── In-Memory Repository (single source of truth) ───────────────
movie_repo = MovieRepository()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifecycle manager.

    Startup:
      1. Initialize AI Gateway via Factory (provider-agnostic)
      2. Initialize Google Drive client
      3. Run full ingestion pipeline (fetch → validate → transform)

    Shutdown:
      - Cleanup resources (minimal for in-memory architecture)
    """
    global _ingestion_result, _drive_service

    logger.info("=" * 60)
    logger.info("🎬 Netflix Movie Library Explorer — Starting Up")
    logger.info("=" * 60)

    # ── Initialize AI Gateway via Factory ──────────────────────
    from app.services.ai import AIGatewayFactory
    gateway = AIGatewayFactory.get_gateway(settings)
    logger.info(
        "✅ AI Gateway initialized (provider=%s, active=%s, timeout=%.1fs)",
        settings.ai_provider,
        gateway.provider_name,
        settings.ai_timeout_seconds,
    )

    # ── Initialize Google Drive Service ────────────────────────
    try:
        _drive_service = GoogleDriveService()
        await _drive_service.initialize()
        logger.info("✅ Google Drive service initialized")

        # ── Run Ingestion Pipeline in Background ──────────────────
        async def run_ingestion():
            global _ingestion_result
            try:
                _ingestion_result = await ingest_from_google_drive(
                    drive_service=_drive_service,
                    movie_repo=movie_repo,
                )
                logger.info(
                    "✅ Ingestion complete: %d movies loaded → %d indexed in repository",
                    _ingestion_result.total_valid,
                    movie_repo.total_movies,
                )
            except Exception as e:
                logger.error("❌ Ingestion background task failed: %s", e)
                _ingestion_result = IngestionResult()

        asyncio.create_task(run_ingestion())
        logger.info("📡 Ingestion started in background task")
        
    except FileNotFoundError:
        logger.warning(
            "⚠️  Google Drive credentials not found at '%s'. "
            "Running in offline mode — no movie data ingested. "
            "Place your OAuth client_secret.json at that path and restart.",
            settings.google_client_secret_file,
        )
        _ingestion_result = IngestionResult()
    except Exception as e:
        logger.error("❌ Ingestion initialization failed: %s. Running in offline mode.", e)
        _ingestion_result = IngestionResult()

    logger.info("🚀 Application ready on %s:%d", settings.app_host, settings.app_port)

    yield  # ← Application runs here

    # ── Shutdown ───────────────────────────────────────────────
    logger.info("🛑 Netflix Movie Library Explorer — Shutting Down")


# ═══════════════════════════════════════════════════════════════════
# Application Factory
# ═══════════════════════════════════════════════════════════════════

app = FastAPI(
    title="Netflix Movie Library Explorer",
    description=(
        "High-performance movie library system with in-memory data structures, "
        "Google Drive ingestion, and AI-powered Magic Search (provider-agnostic + Circuit Breaker)."
    ),
    version="2.0.0",
    lifespan=lifespan,
)

# ── CORS Middleware (must be added before custom middleware) ───────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID", "X-Response-Time"],
)

# ── Observability Middleware ──────────────────────────────────────
app.add_middleware(ObservabilityMiddleware)

# ── API Router ───────────────────────────────────────────────────
app.include_router(router, prefix="/api", tags=["API"])


# ═══════════════════════════════════════════════════════════════════
# Health, Status, and Diagnostics Endpoints
# ═══════════════════════════════════════════════════════════════════


@app.get("/", tags=["Health"])
async def root() -> Dict[str, str]:
    """Root endpoint — application identity."""
    return {
        "service": "Netflix Movie Library Explorer",
        "version": "2.0.0",
        "status": "operational",
    }


@app.get("/health", tags=["Health"])
def health_check(ai_provider: Optional[str] = None) -> Dict[str, Any]:
    """
    Health check endpoint with system diagnostics.
    Reports per-provider circuit breaker status for the active AI gateway.
    """
    from app.services.ai import AIGatewayFactory

    process = psutil.Process()
    mem_info = process.memory_info()

    ingestion_stats = (
        _ingestion_result.to_dict() if _ingestion_result else {"status": "not_started"}
    )

    return {
        "status": "healthy",
        "system": {
            "memory_rss_mb": round(mem_info.rss / (1024 * 1024), 2),
            "memory_vms_mb": round(mem_info.vms / (1024 * 1024), 2),
            "cpu_percent": process.cpu_percent(interval=0.1),
        },
        "ingestion": ingestion_stats,
        "repository": {
            "total_movies": movie_repo.total_movies,
        },
        "ai_gateway": AIGatewayFactory.get_active_status(settings, provider_override=ai_provider),
        "config": {
            "ai_provider": settings.ai_provider,
            "ai_timeout_seconds": settings.ai_timeout_seconds,
            "google_drive_folder_id": settings.google_drive_folder_id,
            "cors_origins": settings.cors_origins,
        },
        "external_services": {
            "tmdb_configured": bool(settings.tmdb_api_key),
            "omdb_configured": bool(settings.omdb_api_key),
        }
    }