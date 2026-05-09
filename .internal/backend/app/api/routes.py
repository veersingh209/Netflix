"""
API Router — Consolidated endpoints for the Netflix Movie Library Explorer.

Endpoints:
    GET  /movies/search — Trie-backed prefix search (autocomplete)
    GET  /movies/filter — Inverted index multi-criteria filter (Technical API)
    POST /movies/add    — Add a new movie to the in-memory repository
    GET  /stats         — Aggregated statistics for the dashboard
    GET  /magic-search  — AI-powered natural language movie search
"""

from __future__ import annotations

import logging
import subprocess
import time
from typing import List, Optional, TYPE_CHECKING
from app.api.schemas import (
    MovieRecord,
    AddMovieRequest,
    StatsResponse,
    MagicSearchResponse,
    AIMetadata,
    IngestionStatusResponse,
    ExternalData,
)
from app.services.tmdb import fetch_movie_poster_with_backup
from fastapi import APIRouter, Query, status, HTTPException, Depends

if TYPE_CHECKING:
    from app.services.ai import AIGatewayContract

logger = logging.getLogger("netflix.api")
router = APIRouter()


async def get_ai_gateway(
    ai_provider: Optional[str] = Query(default=None),
):
    """Dependency to retrieve the active AI gateway."""
    from app.config import settings
    from app.services.ai import AIGatewayFactory
    return AIGatewayFactory.get_gateway(settings, provider_override=ai_provider)


@router.get(
    "/movies/search",
    response_model=List[MovieRecord],
    response_model_exclude={"extra_fields"},
)
async def search_movies(
    q: str = Query(..., min_length=1, max_length=200),
    max_results: int = Query(20, ge=1, le=100),
):
    from app.main import movie_repo
    return await movie_repo.search_titles(q, max_results=max_results)


@router.get(
    "/movies/filter",
    response_model=List[MovieRecord],
    response_model_exclude={"extra_fields"},
)
async def filter_movies(
    genres: Optional[List[str]] = Query(default=None),
    min_rating: Optional[float] = Query(default=None, ge=0.0, le=10.0),
    year: Optional[List[int]] = Query(default=None),
    title: Optional[str] = Query(default=None),
    max_results: int = Query(100, ge=1, le=500),
):
    from app.main import movie_repo
    return await movie_repo.filter_movies(
        genres=genres,
        min_rating=min_rating,
        year=year,
        title=title,
        max_results=max_results,
    )


@router.post(
    "/movies/add",
    response_model=MovieRecord,
    response_model_exclude={"extra_fields"},
    status_code=status.HTTP_201_CREATED,
)
async def add_movie(request: AddMovieRequest):
    from app.main import movie_repo
    
    record = MovieRecord(
        title=request.title,
        genre=[g.strip().title() for g in request.genre],
        rating=request.rating,
        year=request.year,
        extra_fields=request.extra_fields,
    )
    await movie_repo.add_movie(record)
    logger.info("Added movie: id=%s title=%r", record.id, record.title)
    return record


@router.get("/stats", response_model=StatsResponse)
async def get_stats():
    return await _fetch_stats()


@router.get("/stats/genres", response_model=List[str])
async def get_all_genres():
    from app.main import movie_repo
    # Return all unique genres from the repository
    return sorted([g.title() for g in movie_repo._genre_counter.keys()])


@router.post(
    "/movies/{movie_id}/enrich",
    response_model=MovieRecord,
    response_model_exclude={"extra_fields"},
)
async def enrich_movie(
    movie_id: str,
    force: bool = False,
    gateway: AIGatewayContract = Depends(get_ai_gateway),
):
    """
    Triggers AI-powered enrichment for a specific movie.
    Retrieves overview, tagline, director, and popularity metrics.
    """
    from app.main import movie_repo

    movie = await movie_repo.get_movie(movie_id)
    if not movie:
        raise HTTPException(status_code=404, detail="Movie not found")

    # If already fully enriched and not forcing, return early
    if movie.external_data and not force and movie.external_data.poster_url:
        return movie

    try:
        # 1. AI Enrichment (Deep insights)
        # Only call AI if we don't have external data yet OR if force=True
        if not movie.external_data or force:
            enrichment_raw = await gateway.enrich_metadata(movie.title, movie.year)
            
            # Validate AI status (uses local _validate_ai_status)
            ai_status = enrichment_raw.pop("_ai_status", "unknown")
            _validate_ai_status(ai_status, "Enrichment")

            # Create or update the ExternalData object
            movie.external_data = ExternalData(**enrichment_raw)

        # 2. Poster Enrichment (Images)
        # ALWAYS attempt poster fetch if missing OR if force=True
        if movie.external_data and (not movie.external_data.poster_url or force):
            try:
                poster_url = await fetch_movie_poster_with_backup(movie.title, movie.year)
                if poster_url:
                    movie.external_data.poster_url = poster_url
            except Exception as poster_exc:
                logger.warning("Poster fetch failed for %s: %s", movie.title, poster_exc)
                # We don't fail the whole request for a missing poster
                pass

        return movie
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Enrichment failed for %s: %s", movie.title, exc)
        raise HTTPException(status_code=500, detail=f"Internal enrichment error: {str(exc)}")


@router.get("/stats/filter", response_model=StatsResponse)
async def get_filtered_stats(
    genres: Optional[List[str]] = Query(default=None),
    min_rating: Optional[float] = Query(default=None, ge=0.0, le=10.0),
    year: Optional[List[int]] = Query(default=None),
    title: Optional[str] = Query(default=None),
):
    return await _fetch_stats(genres, min_rating, year, title)


async def _fetch_stats(
    genres: Optional[List[str]] = None,
    min_rating: Optional[float] = None,
    year: Optional[List[int]] = None,
    title: Optional[str] = None,
) -> StatsResponse:
    """Unified helper to fetch statistics, optimized for global vs filtered views."""
    from app.main import movie_repo
    
    # If no filters, use pre-calculated global stats (O(1))
    if not any([genres, min_rating, year, title]):
        stats = await movie_repo.get_stats()
    else:
        # Otherwise compute scoped stats over candidate IDs
        stats = await movie_repo.get_filtered_stats(
            genres=genres,
            min_rating=min_rating,
            year=year,
            title=title,
        )
    return StatsResponse(**stats)


# Track if we've already tried to close the splash screen to avoid redundant AppleScript calls
_splash_closed = False

@router.get("/ingestion/status", response_model=IngestionStatusResponse)
async def get_ingestion_status():
    global _splash_closed
    import app.main as main_module
    
    repo = main_module.movie_repo
    ingestion_result = main_module._ingestion_result
    drive_service = main_module._drive_service
    
    status = "not_started"
    if repo.is_ingesting:
        status = "ingesting"
    elif ingestion_result:
        status = "complete"
    
    # Check for critical auth errors in drive stats
    drive_stats = drive_service.stats if drive_service else {}
    if drive_stats.get("auth", {}).get("status") == "reauth_required":
        status = "error"
        logger.error("Ingestion reporting error status due to auth failure: %s", drive_stats["auth"].get("reason"))

    user_info = drive_stats.get("user")
    
    # Auth detection log
    if user_info is not None and not _splash_closed:
        _splash_closed = True
        logger.info("Auth detected! Authentication is complete.")

    return IngestionStatusResponse(
        is_ingesting=repo.is_ingesting,
        total_movies=repo.total_movies,
        logs=repo.ingestion_logs,
        drive_stats=drive_stats,
        user=drive_stats.get("user"),
        summary=ingestion_result.to_dict() if ingestion_result else None,
        status=status
    )


@router.post("/config/api-key", tags=["Configuration"])
async def update_api_key(
    provider: str = Query(..., description="AI provider: openai, anthropic, gemini, lm_studio"),
    api_key: str = Query(..., description="New API key value"),
):
    """Update API key for a specific AI provider."""
    from app.config import settings
    from app.services.ai import AIGatewayFactory
    
    try:
        # Normalize "NONE" or empty to signify no key required (for local/manual bypass)
        actual_key = None if api_key.upper() == "NONE" or not api_key.strip() else api_key

        # Update the appropriate API key in settings
        if provider == "openai":
            settings.openai_api_key = actual_key
        elif provider == "anthropic":
            settings.anthropic_api_key = actual_key
        elif provider == "gemini":
            settings.gemini_api_key = actual_key
        elif provider == "lm_studio":
            settings.lm_studio_api_key = actual_key
            # For local providers, only update base_url if it explicitly looks like a URL
            if actual_key and (actual_key.startswith("http://") or actual_key.startswith("https://")):
                settings.lm_studio_base_url = actual_key
        elif provider == "ollama":
            settings.ollama_api_key = actual_key
            # For Ollama, only update base_url if it explicitly looks like a URL
            if actual_key and (actual_key.startswith("http://") or actual_key.startswith("https://")):
                settings.local_base_url = actual_key
        elif provider == "openrouter":
            settings.openrouter_api_key = actual_key
        elif provider == "tmdb":
            settings.tmdb_api_key = actual_key
        elif provider == "omdb":
            settings.omdb_api_key = actual_key
        else:
            raise HTTPException(
                status_code=400, 
                detail=f"Unsupported provider: {provider}. Supported: openai, anthropic, gemini, openrouter, lm_studio, ollama, tmdb, omdb"
            )
        
        # If it's an AI provider, reinitialize and validate
        if provider not in ("tmdb", "omdb"):
            # Reinitialize the AI gateway with new API key
            AIGatewayFactory._register_provider(provider, settings)
            
            # NEW: Validate the connection before confirming
            gateway = AIGatewayFactory.get_gateway(settings, provider_override=provider, allow_fallback=False)
            is_valid = await gateway.validate_connection()
            
            if not is_valid:
                # If we have a failure reason in the gateway status, use it
                status = gateway.status if hasattr(gateway, "status") else {}
                error_msg = status.get("last_error")
                detail = f"Failed to connect to {provider}: {error_msg}" if error_msg else f"Failed to connect to {provider}. Please verify your API key or server status."
                raise HTTPException(status_code=400, detail=detail)
        else:
            # For TMDB/OMDb, we just assume it's "valid" if provided, or we could do a simple test call.
            # For now, let's just return success if it's set.
            logger.info(f"Updated {provider} API key")
            return {"message": f"Successfully updated {provider} key", "provider": provider}

        logger.info(f"Successfully validated and updated API key for provider: {provider}")
        return {"message": f"Successfully connected to {provider}", "provider": provider}
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Failed to update API key for {provider}: {exc}")
        raise HTTPException(status_code=500, detail=f"Failed to update API key: {str(exc)}")


@router.post("/system/shutdown", tags=["System"])
async def shutdown_system():
    """Shutdown both backend and frontend services."""
    logger.info("🛑 Shutdown requested from UI. Closing browser and killing all services...")
    
    # AppleScript to close the browser tab in Chrome or Safari after a delay
    # This allows users to see the goodbye message before the tab closes
    # We match localhost, 127.0.0.1, and the app title
    # Explicitly identify as Netflix Explorer to fix permission dialog app name
    applescript = """
    tell application "System Events"
        set processName to name of first process whose frontmost is true
    end tell
    
    delay 5
    try
        tell application "Google Chrome"
            activate
            repeat with w in windows
                repeat with t in tabs of w
                    set theUrl to URL of t
                    if theUrl contains "localhost:7173" or theUrl contains "127.0.0.1:7173" then
                        close t
                    end if
                end repeat
            end repeat
        end tell
    end try
    try
        tell application "Safari"
            activate
            repeat with w in windows
                repeat with t in tabs of w
                    set theUrl to URL of t
                    if theUrl contains "localhost:7173" or theUrl contains "127.0.0.1:7173" then
                        close t
                    end if
                end repeat
            end repeat
        end tell
    end try
    """
    
    # Execute AppleScript in background to delay closing the tab
    # Use open command with bundle identifier to ensure permission dialogs show "Netflix Explorer"
    script_path = "/tmp/netflix_explorer_shutdown.scpt"
    with open(script_path, "w") as f:
        f.write(applescript)
    
    # Run the script using the Netflix Explorer app identity
    subprocess.Popen(["open", "-b", "com.netflixexplorer.app", script_path])
    
    # Run the kill command in a separate process with a delay
    # We kill everything on 8002 (us) and 7173 (frontend)
    # The sleep ensures the response is sent back to the client before the server dies
    cmd = "sleep 8 && lsof -ti:8002,7173 | xargs kill -9"
    subprocess.Popen(cmd, shell=True)
    
    return {"message": "Shutdown initiated. Goodbye!"}


@router.get("/magic-search", response_model=MagicSearchResponse)
async def magic_search(
    q: str = Query(..., min_length=1, max_length=500),
    gateway: AIGatewayContract = Depends(get_ai_gateway),
):
    from app.main import movie_repo
    
    start_time = time.perf_counter()
    ai_result = await gateway.translate_nl_to_api(q)
    latency_ms = (time.perf_counter() - start_time) * 1000
    
    ai_status = ai_result.pop("_ai_status", "unknown")
    _validate_ai_status(ai_status, "Magic Search")
    
    # Normalize filters using shared utility logic
    filters = _normalize_ai_filters(ai_result)

    records = await movie_repo.filter_movies(
        genres=filters["genres"],
        min_rating=filters["min_rating"],
        year=filters["year"],
        title=filters["title"],
    )
    
    return MagicSearchResponse(
        movies=records,
        ai_metadata=AIMetadata(
            status=ai_status,
            parsed_filters=filters,
            provider=gateway.provider_name,
            title=filters["title"],
        ),
        total_results=len(records),
    )


# ─── Private Helpers ──────────────────────────────────────────────────


def _validate_ai_status(status: str, context: str):
    """Raise appropriate HTTPException based on AI status."""
    if status == "success":
        return
    
    status_map = {
        "circuit_open": (503, f"{context} is currently unavailable (Circuit Breaker)"),
        "no_api_key": (401, f"{context} requires an API key which is not configured"),
        "timeout": (504, f"{context} request timed out"),
        "rate_limit_exceeded": (429, f"{context} rate limit exceeded"),
    }
    
    code, detail = status_map.get(status, (500, f"{context} failed: {status}"))
    raise HTTPException(status_code=code, detail=detail)


def _normalize_ai_filters(ai_result: dict) -> dict:
    """Normalize AI output into repository-compatible filter parameters."""
    parsed_year = ai_result.get("year")
    if isinstance(parsed_year, list):
        filter_year = [int(y) for y in parsed_year]
    elif parsed_year is not None:
        filter_year = [int(parsed_year)]
    else:
        filter_year = None

    return {
        "title": ai_result.get("title"),
        "genres": ai_result.get("genres") or None,
        "min_rating": float(ai_result["min_rating"]) if ai_result.get("min_rating") is not None else None,
        "year": filter_year,
    }
