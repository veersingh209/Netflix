"""
Observability Middleware — Structured JSON Logging.

Design Rationale (Context, Not Control):
    By introducing this middleware immediately in Phase 1, every single request
    is instrumented from day one. This gives us:
      1. Request latency tracking (p50/p95/p99 awareness)
      2. Request correlation via unique request IDs

    This is a deliberate 'Observability First' decision — we can always remove
    noise, but we can never retroactively add telemetry to past requests.

Structured Logging:
    All request logs are emitted as single-line JSON objects, ready for
    ingestion into aggregators like Datadog, ELK, or Splunk. The custom
    JSONFormatter ensures machine-parseable output without adding any
    third-party logging libraries.
"""

from __future__ import annotations
import json
import time
import uuid
import logging
from datetime import datetime, timezone
from typing import Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

# ─── Structured JSON Formatter ────────────────────────────────────────
# Uses Python's built-in logging — zero external dependencies.


class JSONFormatter(logging.Formatter):
    """
    Custom log formatter that outputs structured JSON strings.

    Each log record is serialized as a single JSON line, making it
    trivially parseable by log aggregation pipelines (Datadog, ELK,
    Splunk, CloudWatch, etc.).
    """

    def format(self, record: logging.LogRecord) -> str:
        log_entry = {
            "timestamp": datetime.fromtimestamp(
                record.created, tz=timezone.utc
            ).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }

        # Merge any structured fields attached to the LogRecord
        if hasattr(record, "json_fields"):
            log_entry.update(record.json_fields)

        return json.dumps(log_entry, default=str)


def configure_json_logging(logger_name: str = "netflix.observability") -> logging.Logger:
    """
    Configure a logger with structured JSON output.

    This replaces the default text formatter on the target logger so that
    every message emitted through it is a valid JSON string. It is safe
    to call multiple times — duplicate handlers are avoided.
    """
    obs_logger = logging.getLogger(logger_name)

    # Avoid adding duplicate handlers on hot-reload
    if not any(isinstance(h, logging.StreamHandler) and
               isinstance(getattr(h, "formatter", None), JSONFormatter)
               for h in obs_logger.handlers):
        handler = logging.StreamHandler()
        handler.setFormatter(JSONFormatter())
        obs_logger.addHandler(handler)
        obs_logger.propagate = False  # Prevent double-logging via root logger

    return obs_logger


# ─── Module-level setup ───────────────────────────────────────────────

logger_obs = configure_json_logging()


class ObservabilityMiddleware(BaseHTTPMiddleware):
    """
    ASGI middleware that wraps every request with timing
    and a unique correlation ID.

    Log Output (JSON):
        Each request produces a single structured JSON log line with:
            timestamp, request_id, method, path, status_code,
            process_time_ms, latency_tier

    Response Headers Injected:
        X-Request-ID:      Unique UUID for log correlation
        X-Response-Time:   Request duration in milliseconds
    """

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # ── Generate a unique request ID for correlation ────────────
        request_id = str(uuid.uuid4())
        request.state.request_id = request_id

        # ── Time the request ───────────────────────────────────────
        start_time = time.perf_counter()

        try:
            response = await call_next(request)
        except Exception as exc:
            # Log the failure as structured JSON, then re-raise
            elapsed_ms = (time.perf_counter() - start_time) * 1000

            logger_obs.error(
                "Request failed with exception",
                extra={
                    "json_fields": {
                        "request_id": request_id,
                        "method": request.method,
                        "path": request.url.path,
                        "status_code": 500,
                        "process_time_ms": round(elapsed_ms, 2),
                        "latency_tier": _classify_latency(elapsed_ms),
                        "error": str(exc),
                    }
                },
            )
            raise

        # ── Calculate metrics ──────────────────────────────────────
        elapsed_ms = (time.perf_counter() - start_time) * 1000
        latency_tier = _classify_latency(elapsed_ms)

        # ── Determine log level based on latency thresholds ────────
        log_fn = logger_obs.warning if elapsed_ms > 2000 else logger_obs.info

        log_fn(
            "%s %s → %d",
            request.method,
            request.url.path,
            response.status_code,
            extra={
                "json_fields": {
                    "request_id": request_id,
                    "method": request.method,
                    "path": request.url.path,
                    "status_code": response.status_code,
                    "process_time_ms": round(elapsed_ms, 2),
                    "latency_tier": latency_tier,
                }
            },
        )

        # ── Inject metrics into response headers ──────────────────
        response.headers["X-Request-ID"] = request_id
        response.headers["X-Response-Time"] = f"{elapsed_ms:.2f}ms"

        return response


def _classify_latency(elapsed_ms: float) -> str:
    """Classify request latency into tiers for alerting and dashboards."""
    if elapsed_ms > 2000:
        return "SLOW"
    elif elapsed_ms > 500:
        return "MODERATE"
    return "OK"
