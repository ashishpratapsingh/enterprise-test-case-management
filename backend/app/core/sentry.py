"""Sentry initialisation.

The init is **dormant by default** — when ``SENTRY_DSN`` is unset (the
shipped default), this module makes no outbound calls and adds zero
overhead to the request path. Once you drop a DSN into ``.env`` and
restart, the SDK auto-instruments FastAPI + SQLAlchemy + httpx through
the integrations bundled with ``sentry-sdk[fastapi]``.

We don't pin the integration list explicitly; the SDK auto-discovers
the relevant ones at startup. Pinning them creates a maintenance
burden every time we add a new instrumented library.
"""

from __future__ import annotations

import logging

from app.core.config import Settings

logger = logging.getLogger(__name__)


def init_sentry(settings: Settings) -> bool:
    """Wire Sentry if a DSN is configured. Returns True when the SDK
    was actually initialised, False when dormant.

    Safe to call multiple times — the SDK guards against double init,
    but we also short-circuit on the DSN check before importing the
    SDK so process startup stays cheap when reporting is off.
    """
    dsn = (settings.SENTRY_DSN or "").strip()
    if not dsn:
        return False

    # Defer the import until we're actually going to use it. Keeps the
    # cold-start path cheap on boxes where Sentry is intentionally off.
    try:
        import sentry_sdk
    except ImportError:
        logger.warning(
            "sentry_dsn_set_but_sdk_missing",
            extra={"hint": "pip install 'sentry-sdk[fastapi]'"},
        )
        return False

    sentry_sdk.init(
        dsn=dsn,
        environment=settings.SENTRY_ENVIRONMENT,
        release=settings.SENTRY_RELEASE or None,
        traces_sample_rate=settings.SENTRY_TRACES_SAMPLE_RATE,
        # Privacy-conscious default. Flip to True in environments
        # where user identification is fine and you need it for
        # debugging.
        send_default_pii=False,
    )
    logger.info(
        "sentry_initialised",
        extra={
            "environment": settings.SENTRY_ENVIRONMENT,
            "traces_sample_rate": settings.SENTRY_TRACES_SAMPLE_RATE,
        },
    )
    return True
