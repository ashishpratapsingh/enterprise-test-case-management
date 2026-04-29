"""Per-request context propagation.

A single ``ContextVar`` carries the request ID across the async stack
so every log line emitted while processing a request automatically
gets tagged with the same id. The middleware sets it on entry; the
JSON formatter reads it on every record.
"""

from __future__ import annotations

import contextvars
import logging

# Default empty so log lines emitted outside a request (boot, jobs)
# don't blow up the formatter.
request_id_var: contextvars.ContextVar[str] = contextvars.ContextVar(
    "request_id", default=""
)


class RequestIDFilter(logging.Filter):
    """Inject the current request_id into every log record."""

    def filter(self, record: logging.LogRecord) -> bool:
        # Only set the attribute when one is actually in scope —
        # leaves boot-time and background-task records clean.
        rid = request_id_var.get()
        if rid:
            record.request_id = rid
        return True
