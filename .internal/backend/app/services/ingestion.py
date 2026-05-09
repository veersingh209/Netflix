"""
Ingestion Service — Consolidated Google Drive I/O and Orchestration.

This module owns the full ingestion pipeline:
  1. Auth & Fetch raw JSON dicts from Google Drive (GoogleDriveService)
  2. Validate + normalize each dict through RawMovieMetadata
  3. Convert to MovieRecord (with unique IDs)
  4. Stream clean records into MovieRepository for indexing

Separation of Concerns:
    - GoogleDriveService handles I/O (auth, HTTP, pagination, retry)
    - ingest_from_google_drive handles pipeline sequencing and error collection
"""

from __future__ import annotations

import asyncio
import io
import json
import logging
import os
import random
import re
import time
from typing import Any, Dict, List, Optional, Tuple, Callable

from google.auth.transport.requests import Request as GoogleAuthRequest
from google.oauth2 import service_account
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload
from googleapiclient.errors import HttpError
from cryptography.fernet import Fernet

from app.api.schemas import RawMovieMetadata, MovieRecord
from app.config import settings

# TYPE_CHECKING avoids circular import at runtime; only used for type hints
from typing import TYPE_CHECKING
if TYPE_CHECKING:
    from app.repository import MovieRepository

logger = logging.getLogger("netflix.ingestion")

# ─── Constants ──────────────────────────────────────────────────────────
SCOPES = ["https://www.googleapis.com/auth/drive.readonly"]
FOLDER_MIME = "application/vnd.google-apps.folder"
JSON_MIME = "application/json"
_MAX_CONCURRENT_REQUESTS = 5
_REQUEST_DELAY_SECONDS = 0.1

# ─── Resilience Layer ───────────────────────────────────────────────────

def async_retry(
    max_retries: int = 3,
    initial_delay: float = 1.0,
    backoff_factor: float = 2.0,
    exceptions: Tuple[type, ...] = (HttpError, asyncio.TimeoutError),
):
    """Decorator for retrying async functions with exponential backoff and jitter."""
    def decorator(func: Callable):
        async def wrapper(*args, **kwargs):
            delay = initial_delay
            for attempt in range(max_retries + 1):
                try:
                    return await func(*args, **kwargs)
                except exceptions as e:
                    if attempt == max_retries:
                        logger.error("Max retries (%d) reached for %s: %s", max_retries, func.__name__, e)
                        raise
                    if isinstance(e, HttpError) and e.resp.status not in [429, 500, 502, 503, 504]:
                        raise
                    jitter = random.uniform(0, 0.1 * delay)
                    sleep_time = delay + jitter
                    logger.warning("Retrying %s in %.2fs (Attempt %d/%d)", func.__name__, sleep_time, attempt + 1, max_retries)
                    await asyncio.sleep(sleep_time)
                    delay *= backoff_factor
            return await func(*args, **kwargs)
        return wrapper
    return decorator

# ─── Google Drive Client ────────────────────────────────────────────────

class GoogleDriveService:
    """Async Google Drive client for recursive JSON fetching."""

    def __init__(self):
        self._service_account_path = settings.google_service_account_file
        self._client_secret_path = settings.google_client_secret_file
        self._token_path = settings.google_token_file
        self._service = None
        self._semaphore = asyncio.Semaphore(_MAX_CONCURRENT_REQUESTS)
        self._files_fetched = 0
        self._errors: List[str] = []
        self._fernet: Optional[Fernet] = None
        self._auth_status: Dict[str, Any] = {"initialized": False, "status": "pending", "method": "unknown"}
        self._user_info: Optional[Dict[str, str]] = None

    async def initialize(self) -> None:
        self._service = await asyncio.to_thread(self._build_service)
        await self._fetch_user_info()
        logger.info("Google Drive service initialized via %s", self._auth_status.get("method"))

    async def _fetch_user_info(self) -> None:
        """Fetch user profile information from Google Drive API."""
        if not self._service: return
        try:
            # We use about().get() to get user info. 
            # Note: requires 'user' field in fields parameter.
            about = await asyncio.to_thread(
                lambda: self._service.about().get(fields="user(displayName, photoLink, emailAddress)").execute()
            )
            user = about.get("user", {})
            self._user_info = {
                "name": user.get("displayName", "Explorer"),
                "picture": user.get("photoLink", ""),
                "email": user.get("emailAddress", "")
            }
            logger.info("Authenticated as: %s (%s)", self._user_info["name"], self._user_info["email"])
        except Exception as e:
            logger.warning("Failed to fetch user info: %s", e)
            self._user_info = {"name": "Explorer", "picture": "", "email": ""}

    def _build_service(self):
        # 1. Service Account
        if os.path.exists(self._service_account_path):
            try:
                creds = service_account.Credentials.from_service_account_file(self._service_account_path, scopes=SCOPES)
                self._auth_status.update({"initialized": True, "status": "authenticated", "method": "service_account"})
                return build("drive", "v3", credentials=creds)
            except Exception as e:
                logger.warning("Service Account init failed: %s", e)

        # 2. OAuth 2.0 Fallback
        if not os.path.exists(self._client_secret_path):
            self._auth_status.update({"status": "error", "reason": "No credentials found"})
            raise FileNotFoundError(f"No credentials found at {self._client_secret_path}")

        creds: Optional[Credentials] = None
        if os.path.exists(self._token_path):
            try:
                fernet = self._get_fernet()
                with open(self._token_path, "rb") as f:
                    encrypted_data = f.read()
                decrypted_data = fernet.decrypt(encrypted_data).decode()
                creds = Credentials.from_authorized_user_info(json.loads(decrypted_data), SCOPES)
            except Exception:
                creds = None

        if creds and creds.expired and creds.refresh_token:
            try: creds.refresh(GoogleAuthRequest())
            except Exception: creds = None

        if not creds or not creds.valid:
            flow = InstalledAppFlow.from_client_secrets_file(self._client_secret_path, SCOPES)
            creds = flow.run_local_server(port=0)

        # Cache encrypted token
        fernet = self._get_fernet()
        encrypted_token = fernet.encrypt(creds.to_json().encode())
        with open(self._token_path, "wb") as f:
            f.write(encrypted_token)

        self._auth_status.update({"initialized": True, "status": "authenticated", "method": "oauth2"})
        return build("drive", "v3", credentials=creds)

    def _get_fernet(self) -> Fernet:
        if self._fernet: return self._fernet
        # Use the persistent encryption key from settings
        key = settings.encryption_key
        self._fernet = Fernet(key.encode())
        return self._fernet

    async def fetch_all_movie_data(self, folder_id: Optional[str] = None) -> List[Dict[str, Any]]:
        if self._service is None: await self.initialize()
        target_folder = folder_id or settings.google_drive_folder_id
        all_movies: List[Dict[str, Any]] = []
        logger.info("Starting recursive fetch from Google Drive folder: %s", target_folder)
        await self._fetch_folder_recursive(target_folder, all_movies, depth=0)
        logger.info("Fetch complete: found %d movie data files", len(all_movies))
        return all_movies

    async def _fetch_folder_recursive(self, folder_id: str, results: List[Dict[str, Any]], depth: int = 0, parent_context: Optional[Dict[str, Any]] = None) -> None:
        if depth > 10: return
        
        folder_name = f"depth {depth}" if depth == 0 else f"depth {depth}"
        logger.debug("Exploring folder %s at %s", folder_id, folder_name)
        
        page_token: Optional[str] = None
        files_in_folder = 0
        while True:
            items, page_token = await self._list_folder_children(folder_id, page_token)
            for item in items:
                mime_type = item.get("mimeType", "")
                name, file_id = item.get("name", "unknown"), item["id"]
                current_context = (parent_context or {}).copy()
                if mime_type == FOLDER_MIME:
                    if re.match(r"^\d{4}$", name): current_context["_folder_year"] = name
                    elif len(name) > 2: current_context["_folder_genre"] = name
                    await self._fetch_folder_recursive(file_id, results, depth + 1, current_context)
                elif name.lower().endswith(".json") or mime_type == JSON_MIME:
                    data = await self._download_json_file(file_id, name)
                    if data is not None:
                        if isinstance(data, list):
                            for d in data: 
                                if isinstance(d, dict): 
                                    d.update(current_context)
                                    d["_drive_file_id"] = file_id
                            results.extend(data)
                        elif isinstance(data, dict):
                            list_val = _extract_list_from_wrapper(data)
                            if list_val:
                                for d in list_val: 
                                    if isinstance(d, dict): 
                                        d.update(current_context)
                                        d["_drive_file_id"] = file_id
                                results.extend(list_val)
                            else:
                                data.update(current_context)
                                data["_drive_file_id"] = file_id
                                results.append(data)
                        files_in_folder += 1
                        
                        # Log progress every 5 files
                        if len(results) % 5 == 0:
                            logger.info("Downloaded %d movie files so far...", len(results))
                            
            if not page_token: 
                break
                
        if files_in_folder > 0:
            logger.debug("Found %d movie files in folder at depth %d", files_in_folder, depth)

    @async_retry()
    async def _list_folder_children(self, folder_id: str, page_token: Optional[str] = None) -> Tuple[List[Dict[str, Any]], Optional[str]]:
        async with self._semaphore:
            await asyncio.sleep(_REQUEST_DELAY_SECONDS)
            response = await asyncio.to_thread(lambda: self._service.files().list(
                q=f"'{folder_id}' in parents and trashed = false",
                fields="nextPageToken, files(id, name, mimeType)",
                pageSize=100, pageToken=page_token, supportsAllDrives=True, includeItemsFromAllDrives=True
            ).execute())
            self._files_fetched += 1
            return response.get("files", []), response.get("nextPageToken")

    @async_retry()
    async def _download_json_file(self, file_id: str, filename: str) -> Optional[Any]:
        async with self._semaphore:
            await asyncio.sleep(_REQUEST_DELAY_SECONDS)
            try:
                content = await asyncio.to_thread(self._download_file_bytes, file_id)
                self._files_fetched += 1
                return json.loads(content)
            except Exception as e:
                self._errors.append(f"Error in {filename}: {e}")
                return None

    def _download_file_bytes(self, file_id: str) -> bytes:
        request = self._service.files().get_media(fileId=file_id)
        buffer = io.BytesIO()
        downloader = MediaIoBaseDownload(buffer, request)
        done = False
        while not done: _, done = downloader.next_chunk()
        return buffer.getvalue()

    @property
    def stats(self) -> Dict[str, Any]:
        return {
            "files_fetched": self._files_fetched, 
            "errors": self._errors, 
            "error_count": len(self._errors), 
            "auth": self._auth_status,
            "user": self._user_info
        }

# ─── Orchestration ──────────────────────────────────────────────────────

class IngestionResult:
    """Container for ingestion outcome with diagnostics."""
    def __init__(self):
        self.records: List[MovieRecord] = []
        self.validation_errors: List[Dict[str, Any]] = []
        self.logs: List[str] = []
        self.total_raw: int = 0
        self.total_valid: int = 0
        self.total_invalid: int = 0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "total_raw_documents": self.total_raw,
            "total_valid_records": self.total_valid,
            "total_invalid_records": self.total_invalid,
            "validation_errors": self.validation_errors[:20],
            "logs": self.logs,
        }

async def ingest_from_google_drive(
    drive_service: Optional[GoogleDriveService] = None,
    folder_id: Optional[str] = None,
    movie_repo: Optional[MovieRepository] = None,
) -> IngestionResult:
    """Full ingestion pipeline: Fetch → Validate → Transform → Index."""
    result = IngestionResult()
    if movie_repo: movie_repo.is_ingesting = True

    log_buffer: List[str] = movie_repo.ingestion_logs if movie_repo else []
    handler = _LogBufferHandler(log_buffer)
    handler.setFormatter(logging.Formatter("%(asctime)s │ %(message)s", datefmt="%H:%M:%S"))
    netflix_logger = logging.getLogger("netflix")
    netflix_logger.addHandler(handler)
    result.logs = log_buffer

    try:
        logger.info("Starting ingestion pipeline...")
        service = drive_service or GoogleDriveService()
        if service._service is None: await service.initialize()

        logger.info("Fetching data from Google Drive...")
        raw_data = await service.fetch_all_movie_data(folder_id)
        result.total_raw = len(raw_data)
        logger.info("Fetched %d raw documents", result.total_raw)

        logger.info("Validating and transforming %d documents...", result.total_raw)
        for idx, raw_dict in enumerate(raw_data):
            try:
                raw_movie = RawMovieMetadata.model_validate(raw_dict)
                record = MovieRecord.from_raw(raw_movie)
                result.records.append(record)
                result.total_valid += 1
                
                # Log progress every 10 documents
                if (idx + 1) % 10 == 0:
                    logger.info("Processed %d/%d documents (%d valid so far)", idx + 1, result.total_raw, result.total_valid)
                    
            except Exception as e:
                result.total_invalid += 1
                result.validation_errors.append({"index": idx, "error": str(e)})
                logger.warning("Validation failed for document %d: %s", idx, e)

        logger.info("Validation complete: %d valid, %d invalid", result.total_valid, result.total_invalid)
        
        if movie_repo and result.records:
            logger.info("Indexing %d valid movies into repository...", len(result.records))
            await movie_repo.add_movies_bulk(result.records)
            logger.info("Indexing complete")
            
        logger.info("Ingestion pipeline completed successfully")
        return result
    finally:
        netflix_logger.removeHandler(handler)
        if movie_repo: movie_repo.is_ingesting = False

class _LogBufferHandler(logging.Handler):
    def __init__(self, buffer: List[str]):
        super().__init__()
        self.buffer = buffer
    def emit(self, record):
        try:
            self.buffer.append(self.format(record))
            if len(self.buffer) > 500: self.buffer.pop(0)
        except Exception: self.handleError(record)

def _extract_list_from_wrapper(data: Dict[str, Any]) -> Optional[List[Dict[str, Any]]]:
    for key in {"movies", "data", "results", "items", "records"}:
        if key in data and isinstance(data[key], list): return data[key]
    return None
