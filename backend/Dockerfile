# syntax=docker/dockerfile:1.6
#
# Two-stage build:
#   1. ``deps`` installs pip dependencies in a layer that has the
#      compilers it needs.
#   2. ``runtime`` copies just the resulting ``site-packages`` into a
#      slim image — no gcc / libpq-dev shipped to prod, smaller image,
#      smaller attack surface.

# ── Stage 1: build dependencies ───────────────────────────────────────
FROM python:3.11-slim AS deps

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Build deps for asyncpg / bcrypt-style native extensions.
RUN apt-get update \
    && apt-get install -y --no-install-recommends gcc libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
# Install into a known prefix so we can copy the bare directory into
# the runtime stage without dragging build artifacts.
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir --prefix=/install -r requirements.txt


# ── Stage 2: runtime ──────────────────────────────────────────────────
FROM python:3.11-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH=/usr/local/bin:$PATH

# Runtime needs ``libpq5`` for asyncpg's libpq linkage and ``curl``
# only for the HEALTHCHECK probe.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libpq5 curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 10001 --shell /bin/false tcm

WORKDIR /app

# Pull installed packages from the deps stage.
COPY --from=deps /install /usr/local

# Copy app code last so day-to-day code edits don't bust the deps
# layer cache.
COPY --chown=tcm:tcm . .

# Logs / uploads need to be writable by the non-root user.
RUN mkdir -p /app/logs /app/uploads \
    && chown -R tcm:tcm /app/logs /app/uploads

USER tcm

EXPOSE 8000

# k8s / load balancer / docker compose all use HEALTHCHECK; failure
# triggers a restart. We probe /livez (not /readyz) so a transient
# DB blip doesn't kill the container.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://localhost:8000/livez || exit 1

CMD ["gunicorn", "app.main:app", \
     "--bind", "0.0.0.0:8000", \
     "--workers", "4", \
     "--worker-class", "uvicorn.workers.UvicornWorker", \
     "--access-logfile", "-", \
     "--error-logfile", "-"]
