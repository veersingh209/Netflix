"""
TMDB API Service — Fetches real movie poster images from The Movie Database.

This service searches TMDB for a movie and returns the poster image URL.
Requires TMDB_API_KEY in .env file or environment variable.
"""

from __future__ import annotations

import logging
from typing import Optional

import httpx

logger = logging.getLogger("netflix.tmdb")

TMDB_BASE_URL = "https://api.themoviedb.org/3"
TMDB_IMAGE_BASE_URL = "https://image.tmdb.org/t/p"
OMDB_BASE_URL = "https://www.omdbapi.com"


def get_tmdb_api_key() -> Optional[str]:
    """Get TMDB API key from config (loaded from .env file)."""
    from app.config import settings
    return settings.tmdb_api_key


def get_omdb_api_key() -> Optional[str]:
    """Get OMDb API key from config (loaded from .env file)."""
    from app.config import settings
    return getattr(settings, 'omdb_api_key', None)


async def fetch_movie_poster(title: str, year: Optional[int] = None) -> Optional[str]:
    """
    Search TMDB for a movie and return its poster image URL.
    
    Args:
        title: Movie title to search for
        year: Optional release year for better matching
        
    Returns:
        Full URL to the movie poster (w500 size), or None if not found
    """
    api_key = get_tmdb_api_key()
    if not api_key:
        logger.debug("TMDB API key not configured, skipping poster fetch")
        return None
    
    try:
        # Search for the movie
        search_params = {
            "api_key": api_key,
            "query": title,
            "language": "en-US",
        }
        if year:
            search_params["year"] = str(year)
        
        async with httpx.AsyncClient(timeout=10.0) as client:
            search_resp = await client.get(
                f"{TMDB_BASE_URL}/search/movie",
                params=search_params
            )
            search_resp.raise_for_status()
            search_data = search_resp.json()
            
            results = search_data.get("results", [])
            if not results:
                logger.debug(f"No TMDB results for: {title}")
                return None
            
            # Get the first result (best match)
            movie = results[0]
            poster_path = movie.get("poster_path")
            
            if not poster_path:
                logger.debug(f"No poster available for: {title}")
                return None
            
            # Construct full poster URL (w500 is a good size for modal display)
            poster_url = f"{TMDB_IMAGE_BASE_URL}/w500{poster_path}"
            
            logger.info(f"Found TMDB poster for '{title}': {poster_url}")
            return poster_url
            
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 401:
            logger.warning("TMDB API key invalid or expired")
        else:
            logger.warning(f"TMDB API error {e.response.status_code}: {e}")
        return None
    except Exception as e:
        logger.warning(f"Failed to fetch TMDB poster for '{title}': {e}")
        return None


async def fetch_movie_poster_backup(title: str, year: Optional[int] = None) -> Optional[str]:
    """
    Search OMDb for a movie as backup when TMDB fails and return its poster image URL.
    
    Args:
        title: Movie title to search for
        year: Optional release year for better matching
        
    Returns:
        Full URL to the movie poster, or None if not found
    """
    api_key = get_omdb_api_key()
    if not api_key:
        logger.debug("OMDb API key not configured, skipping backup poster fetch")
        return None
    
    try:
        # Search for the movie
        search_params = {
            "apikey": api_key,
            "t": title,
            "type": "movie",
        }
        if year:
            search_params["y"] = str(year)
        
        async with httpx.AsyncClient(timeout=10.0) as client:
            search_resp = await client.get(
                OMDB_BASE_URL,
                params=search_params
            )
            search_resp.raise_for_status()
            search_data = search_resp.json()
            
            # Check if search was successful
            if search_data.get("Response") != "True":
                logger.debug(f"No OMDb results for: {title}")
                return None
            
            # Get poster URL
            poster_url = search_data.get("Poster")
            
            if not poster_url or poster_url == "N/A":
                logger.debug(f"No poster available in OMDb for: {title}")
                return None
            
            logger.info(f"Found OMDb backup poster for '{title}': {poster_url}")
            return poster_url
            
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 401:
            logger.warning("OMDb API key invalid or expired")
        else:
            logger.warning(f"OMDb API error {e.response.status_code}: {e}")
        return None
    except Exception as e:
        logger.warning(f"Failed to fetch OMDb backup poster for '{title}': {e}")
        return None


async def fetch_movie_poster_with_backup(title: str, year: Optional[int] = None) -> Optional[str]:
    """
    Try TMDB first, then fallback to OMDb if TMDB fails.
    
    Args:
        title: Movie title to search for
        year: Optional release year for better matching
        
    Returns:
        Full URL to the movie poster, or None if not found in either service
    """
    # Try TMDB first
    tmdb_poster = await fetch_movie_poster(title, year)
    if tmdb_poster:
        return tmdb_poster
    
    logger.debug(f"TMDB failed for '{title}', trying OMDb backup...")
    # Try OMDb as backup
    omdb_poster = await fetch_movie_poster_backup(title, year)
    return omdb_poster
