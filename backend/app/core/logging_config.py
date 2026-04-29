"""Structured JSON logging configuration."""

import logging
import logging.handlers
import json
import os
import sys
from datetime import datetime, timezone

from app.core.config import get_settings
from app.core.request_context import RequestIDFilter

settings = get_settings()


class JSONFormatter(logging.Formatter):
    """Emit each log record as a single JSON object."""

    def format(self, record: logging.LogRecord) -> str:
        log_entry: dict[str, object] = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno,
        }

        if record.exc_info and record.exc_info[1] is not None:
            log_entry["exception"] = self.formatException(record.exc_info)

        # Merge any extra fields attached to the record
        extra_keys = set(record.__dict__) - set(logging.LogRecord("", 0, "", 0, None, None, None).__dict__)
        for key in extra_keys:
            if key not in ("message", "asctime"):
                log_entry[key] = getattr(record, key)

        return json.dumps(log_entry, default=str)


def setup_logging() -> None:
    """Configure root logger with console and rotating file handlers."""

    root_logger = logging.getLogger()
    root_logger.setLevel(getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO))

    # Clear existing handlers to avoid duplicates on re-init
    root_logger.handlers.clear()

    json_formatter = JSONFormatter()
    request_id_filter = RequestIDFilter()

    # --- Console handler ---
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(json_formatter)
    console_handler.setLevel(logging.DEBUG)
    console_handler.addFilter(request_id_filter)
    root_logger.addHandler(console_handler)

    # --- File handler (rotating) ---
    log_dir = os.path.dirname(settings.LOG_FILE)
    if log_dir:
        os.makedirs(log_dir, exist_ok=True)

    file_handler = logging.handlers.RotatingFileHandler(
        filename=settings.LOG_FILE,
        maxBytes=10 * 1024 * 1024,  # 10 MB
        backupCount=5,
        encoding="utf-8",
    )
    file_handler.setFormatter(json_formatter)
    file_handler.setLevel(logging.DEBUG)
    file_handler.addFilter(request_id_filter)
    root_logger.addHandler(file_handler)

    # Quiet noisy third-party loggers
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)


def get_logger(name: str) -> logging.Logger:
    """Return a named logger, ensuring logging is initialised."""
    return logging.getLogger(name)
