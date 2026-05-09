"""
Pydantic models for movie data and API schemas.

Design Decision: RawMovieMetadata uses a permissive schema with model_validator
to handle the deeply nested, inconsistent JSON structures from Google Drive.
Fields are normalized during validation — not at query time — front-loading
the compute cost once during ingestion to guarantee O(1) reads later.
"""

from __future__ import annotations

import re
import uuid
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field, HttpUrl, model_validator 

class ExternalData(BaseModel):
    """
    Metadata retrieved from external providers (TMDB, IMDB, Rotten Tomatoes, Letterboxd, AI Insights).
    """
    overview: Optional[str] = Field(default=None, description="Detailed plot summary")
    tagline: Optional[str] = Field(default=None, description="Catchy movie tagline")
    director: Optional[str] = Field(default=None, description="Movie director")
    cast: List[str] = Field(default_factory=list, description="Top cast members")
    popularity: Optional[float] = Field(default=None, description="Popularity score")
    provider: str = Field(default="AI Enrichment", description="Source of the external data")
    poster_url: Optional[str] = Field(default=None, description="URL to movie poster")
    imdb_url: Optional[str] = Field(default=None, description="Direct link to movie on IMDB or search result")
    tmdb_url: Optional[str] = Field(default=None, description="Direct link to movie on TMDB or search result")
    rotten_tomatoes_url: Optional[str] = Field(default=None, description="Direct link to movie on Rotten Tomatoes or search result")
    letterboxd_url: Optional[str] = Field(default=None, description="Direct link to movie on Letterboxd or search result")

class RawMovieMetadata(BaseModel):
    """
    Ingestion-layer model that accepts raw, potentially messy JSON from
    Google Drive and normalizes it into a clean, queryable shape.
    """
    title: str = Field(..., description="Normalized movie title")
    genre: List[str] = Field(default_factory=list, description="Normalized list of genres")
    rating: Optional[float] = Field(default=None, ge=0.0, le=10.0, description="Rating on a 0–10 scale")
    year: Optional[int] = Field(default=None, ge=1888, le=2030, description="Release year")
    drive_url: Optional[str] = Field(default=None, description="Direct link to the source file on Google Drive")
    extra_fields: Dict[str, Any] = Field(default_factory=dict, description="Any non-standard fields from the raw JSON")

    model_config = {"populate_by_name": True}

    @model_validator(mode="before")
    @classmethod
    def normalize_raw_input(cls, data: Any) -> Dict[str, Any]:
        if not isinstance(data, dict):
            raise ValueError(f"Expected dict, got {type(data).__name__}")

        # Extract folder context if provided (passed in during ingestion)
        folder_genre = data.pop("_folder_genre", None)
        folder_year = data.pop("_folder_year", None)
        file_id = data.pop("_drive_file_id", None)

        flat = _flatten_movie_dict(data)
        lookup = {k.lower().strip(): v for k, v in flat.items()}

        title = _extract_string(lookup, ["title", "name", "movie_title", "movie_name"])
        if not title:
            raise ValueError("No 'title' field found in movie data")

        genre = _extract_genre(lookup, ["genre", "genres", "category", "categories"])
        # Use folder genre as fallback
        if not genre and folder_genre:
            genre = [folder_genre.strip().title()]

        rating = _extract_float(lookup, ["rating", "score", "imdb_rating", "imdb_score"])
        
        year = _extract_int(lookup, ["year", "release_year", "released", "release_date"])
        # Use folder year as fallback
        if year is None and folder_year:
            try:
                val = int(folder_year)
                if 1888 <= val <= 2030:
                    year = val
            except (ValueError, TypeError):
                pass

        known_keys = {
            "title", "name", "movie_title", "movie_name",
            "genre", "genres", "category", "categories",
            "rating", "score", "imdb_rating", "imdb_score",
            "year", "release_year", "released", "release_date",
        }
        extra = {k: v for k, v in lookup.items() if k not in known_keys}

        drive_url = f"https://drive.google.com/file/d/{file_id}/view" if file_id else None

        return {
            "title": title,
            "genre": genre,
            "rating": rating,
            "year": year,
            "drive_url": drive_url,
            "extra_fields": extra,
        }



class AddMovieRequest(BaseModel):
    """Request body for POST /api/movies/add."""
    title: str = Field(..., min_length=1, max_length=500)
    genre: List[str] = Field(default_factory=list)
    rating: Optional[float] = Field(default=None, ge=0.0, le=10.0)
    year: Optional[int] = Field(default=None, ge=1888, le=2030)
    extra_fields: Dict[str, Any] = Field(default_factory=dict)


class MovieRecord(AddMovieRequest):
    """
    The canonical, immutable movie record stored in-memory after ingestion.
    """
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    drive_url: Optional[str] = Field(default=None)
    extra_fields: Dict[str, Any] = Field(default_factory=dict, exclude=True)
    external_data: Optional[ExternalData] = Field(default=None, description="Enriched metadata from external sources")
    
    model_config = {"populate_by_name": True}

    @classmethod
    def from_raw(cls, raw: RawMovieMetadata) -> "MovieRecord":
        return cls(
            title=raw.title,
            genre=raw.genre,
            rating=raw.rating,
            year=raw.year,
            drive_url=raw.drive_url,
            extra_fields=raw.extra_fields,
        )


# ═══════════════════════════════════════════════════════════════════
# API Response Schemas
# ═══════════════════════════════════════════════════════════════════


class UserInfo(BaseModel):
    name: str = Field(default="Explorer")
    picture: Optional[str] = Field(default=None)
    email: Optional[str] = Field(default=None)


class IngestionStatusResponse(BaseModel):
    is_ingesting: bool = Field(..., description="Whether ingestion is currently running")
    total_movies: int = Field(..., description="Current total number of movies ingested")
    logs: Optional[List[str]] = Field(default=None, description="Recent logs from the ingestion process")
    drive_stats: Optional[Dict[str, Any]] = Field(default=None, description="Google Drive API specific statistics")
    user: Optional[UserInfo] = Field(default=None, description="Authenticated user information")
    summary: Optional[Dict[str, Any]] = Field(default=None, description="Pipeline summary (counts, errors)")
    status: str = Field(default="unknown", description="Overall pipeline status (not_started, ingesting, complete, error)")


class GenreStats(BaseModel):
    genre: str
    count: int


class StatsResponse(BaseModel):
    total_movies: int = Field(..., description="Total number of movies in library")
    average_rating: float = Field(..., description="Mean rating across all rated movies")
    rated_count: int = Field(..., description="Number of movies with a rating")
    total_genres: int = Field(..., description="Number of unique genres")
    top_genres: List[GenreStats] = Field(default_factory=list, description="Top 5 genres by frequency")
    year_distribution: Dict[str, int] = Field(default_factory=dict, description="Movie count per release year")
    top_rated_movies: List[MovieRecord] = Field(default_factory=list, description="Top 10 highest-rated movies")


class AIMetadata(BaseModel):
    """Encapsulates AI interpretation details for UI display."""

    status: str = Field(..., description="Success/error status of the AI call")
    parsed_filters: Dict[str, Any] = Field(
        ...,
        description="The raw parameters extracted by AI (genres, title, etc.)",
    )
    provider: str = Field(..., description="Name of the AI provider used")
    title: Optional[str] = Field(default=None, description="AI-generated title for the search query")


class MagicSearchResponse(BaseModel):
    movies: List[MovieRecord] = Field(default_factory=list, description="Matched movies")
    ai_metadata: AIMetadata = Field(..., description="AI interpretation details")
    total_results: int = Field(0, description="Total number of movies returned")


# ═══════════════════════════════════════════════════════════════════
# Private Helper Functions
# ═══════════════════════════════════════════════════════════════════


def _flatten_movie_dict(data: Dict[str, Any], max_depth: int = 3) -> Dict[str, Any]:
    flat = {}
    for key, value in data.items():
        if isinstance(value, dict) and max_depth > 0:
            wrapper_keys = {"movie", "data", "details", "info", "metadata", "result"}
            if key.lower().strip() in wrapper_keys:
                nested = _flatten_movie_dict(value, max_depth - 1)
                flat.update(nested)
            else:
                flat[key] = value
        else:
            flat[key] = value
    return flat

def _extract_string(lookup: Dict[str, Any], candidates: List[str]) -> Optional[str]:
    for key in candidates:
        if key in lookup and lookup[key] is not None:
            val = str(lookup[key]).strip()
            if val:
                return val
    return None

def _extract_genre(lookup: Dict[str, Any], candidates: List[str]) -> List[str]:
    for key in candidates:
        if key in lookup and lookup[key] is not None:
            val = lookup[key]
            if isinstance(val, list):
                return [g.strip().title() for g in val if isinstance(g, str) and g.strip()]
            if isinstance(val, str):
                for delimiter in [",", "|", "/"]:
                    if delimiter in val:
                        return [g.strip().title() for g in val.split(delimiter) if g.strip()]
                return [val.strip().title()] if val.strip() else []
    return []

def _extract_float(lookup: Dict[str, Any], candidates: List[str]) -> Optional[float]:
    for key in candidates:
        if key in lookup and lookup[key] is not None:
            try:
                val = float(lookup[key])
                return max(0.0, min(10.0, val))
            except (ValueError, TypeError):
                continue
    return None

def _extract_int(lookup: Dict[str, Any], candidates: List[str]) -> Optional[int]:
    year_re = re.compile(r"(\d{4})")
    for key in candidates:
        if key in lookup and lookup[key] is not None:
            raw = str(lookup[key])
            match = year_re.search(raw)
            if match:
                try:
                    val = int(match.group(1))
                    if 1888 <= val <= 2030:
                        return val
                except (ValueError, TypeError):
                    continue
    return None
