# syntax=docker/dockerfile:1.6
#
# Two-stage:
#   1. ``build`` runs ``npm ci && npm run build``.
#   2. ``runtime`` is the unprivileged nginx image serving the static
#      output. ``nginxinc/nginx-unprivileged`` runs as UID 101 and
#      doesn't need root to bind port 8080.
#
# We use port 8080 inside the container (not 80) because the
# unprivileged image can't bind to <1024. Map however you like at the
# orchestration layer.

# ── Stage 1: build ─────────────────────────────────────────────────────
FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
# CRA outputs to ``build/`` (not ``dist/``). The previous Dockerfile
# had this wrong and silently shipped an empty image.
RUN npm run build


# ── Stage 2: serve ─────────────────────────────────────────────────────
FROM nginxinc/nginx-unprivileged:1.25-alpine

WORKDIR /usr/share/nginx/html

# nginx-unprivileged ships its own /etc/nginx/conf.d/default.conf;
# overwrite it with ours.
COPY --chown=nginx:nginx nginx.conf /etc/nginx/conf.d/default.conf

# Wipe and replace the static content. ``--chown`` ensures nginx
# (UID 101) can read everything we just dropped in.
RUN rm -rf /usr/share/nginx/html/*
COPY --from=build --chown=nginx:nginx /app/build/ /usr/share/nginx/html/

EXPOSE 8080

# Pick an arbitrary index path that always 200s for the LB probe.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost:8080/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
