# Deployment runbook

End-to-end checklist for shipping this stack to a real environment.
Tested with the bundled `docker-compose.yml` against a single VM and
against k8s; the steps are the same, only the orchestrator differs.

---

## 1. Prerequisites

- **Container runtime** — Docker 24+ or Kubernetes 1.27+.
- **Postgres 14+** — bundled in the prod compose, or use a managed
  service (RDS / Cloud SQL / Aiven).
- **Reverse proxy with TLS termination** — nginx, caddy, an ingress
  controller, or a managed LB (ALB / GCP LB).
- **SMTP relay** — for password-reset emails. Use SES, Mailgun,
  Postmark, or your corporate relay.
- **DNS record** pointing your chosen hostname at the LB.

Optional but strongly recommended:

- **Sentry** project for error reporting.
- **OIDC IdP** (Okta / Azure AD / Google / Keycloak) if you want SSO
  instead of local password auth.
- **Object storage** (S3 / GCS) for backups and uploads — see §6.

---

## 2. Generate secrets

```bash
# 32-byte secret for JWT signing. Keep this safe — leaking it lets
# someone forge tokens.
openssl rand -hex 32
```

Stash the output in your secrets manager (Vault, AWS Secrets Manager,
k8s Secret, …) under the key `SECRET_KEY`. **Don't reuse across
environments** — staging and prod each get their own.

Other secrets to gather, in priority order:

| Variable | Source |
|----------|--------|
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | Pick or get from your DB provider |
| `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD` | SMTP relay |
| `SENTRY_DSN` | sentry.io project settings |
| `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_DISCOVERY_URL` | IdP app registration |
| `JIRA_API_TOKEN`, `GITHUB_TOKEN` | Service-account in each tool |

---

## 3. Configure environment

Copy `.env.example` to `.env` (or feed equivalent vars into your
orchestrator). Critical settings that **must** be set in production:

```bash
DEBUG=false
SECRET_KEY=<32-byte hex from §2>
DATABASE_URL=postgresql+asyncpg://USER:PASS@host:5432/DBNAME
APP_BASE_URL=https://tcm.your-org.com
CORS_ORIGINS=https://tcm.your-org.com   # comma-sep if multiple
MAIL_BACKEND=smtp
SMTP_HOST=...
SENTRY_DSN=...
SENTRY_ENVIRONMENT=production
```

Leave everything else (JIRA / GitHub / OIDC) blank to disable; fill
in only what you'll use.

The app **refuses to start** with a placeholder `SECRET_KEY` when
`DEBUG=false` — this is by design. Look at the boot logs for
`config_secret_key_invalid` if it crashes.

---

## 4. Run the database migration

The image runs `alembic upgrade head` automatically at startup
(`app.db.migrate.ensure_columns`). On the very first boot against an
empty DB, this builds every table.

If you prefer to migrate before bringing up the app workers:

```bash
docker compose run --rm backend alembic upgrade head
```

For zero-downtime deploys later, follow the standard pattern:
**migrate first, deploy second**, only run additive migrations from
the same release as the code.

---

## 5. Seed the first admin

The app needs at least one user before anyone can sign in. Run the
seed script once:

```bash
docker compose run --rm backend python seed.py
```

Default credentials it creates:

- Email: `ashish.pratap@sabpaisa.in`
- Password: `Admin@123`
- Role: Admin

**Change this password immediately** after first login (or use an
env-driven `seed_admin.py` variant if you want to set a unique
password at deploy time).

---

## 6. Bring up the stack

```bash
# Production-shaped (no source mounts, no relaxed defaults)
docker compose -f docker-compose.yml up -d

# Verify the health probes
curl -f https://tcm.your-org.com/livez   # process up
curl -f https://tcm.your-org.com/readyz  # DB + config OK
```

Both should return 200 with `{"status":"alive"}` / `{"status":"ready"}`.

---

## 7. Reverse proxy + TLS

The frontend container listens on port **8080** (unprivileged nginx).
Map it to 80/443 at your edge LB. Required headers your proxy should
add or pass through:

- `X-Real-IP` — keeps audit logs honest about the source IP.
- `X-Forwarded-For` — same.
- `X-Forwarded-Proto` — so `Strict-Transport-Security` sees `https`.
- `X-Request-ID` — optional. If your LB already injects trace ids,
  forward them; the backend will reuse the value instead of
  generating its own (great for cross-system log correlation).

The bundled `frontend/nginx.conf` proxies `/api/` to the backend
container — so a single hostname serves both UI and API. You can also
deploy them on separate subdomains; just adjust `CORS_ORIGINS`
accordingly.

---

## 8. Backups

Daily Postgres dump via cron / a sidecar:

```bash
docker compose exec -T db pg_dump \
    -U "$POSTGRES_USER" -F c -d "$POSTGRES_DB" \
    | gzip > tcm-$(date +%F).sql.gz
```

Push the resulting file to S3/GCS and retain at least 30 days. Test
**restore** quarterly — a backup you've never restored isn't a
backup.

The backend `/app/uploads` volume contains user-uploaded attachments
(defect screenshots, etc.). Back it up the same way.

---

## 9. Monitoring & log aggregation

The backend already emits structured JSON logs to stdout, every line
tagged with `request_id` thanks to the request-id middleware. Pipe
the docker / k8s log stream into your aggregator (ELK, Loki,
Datadog, CloudWatch, etc.).

Key log fields:

- `request_id` — correlate a single request across middleware →
  service → repository layers.
- `duration_ms` — `request_completed` events carry per-route latency.
- `status_code` — easy 4xx / 5xx alerting.

For metrics, the simplest path is to point Prometheus at
`/livez` + `/readyz` for blackbox monitoring; for richer per-request
metrics, a `prometheus-fastapi-instrumentator` middleware can be
added later if you need it.

Sentry will autocapture exceptions once `SENTRY_DSN` is set. Useful
default alerts:

- Any new error fingerprint hit > 5 times in 5 minutes.
- Any 5xx whose count exceeds 0.1% of requests over a 10-minute
  window.

---

## 10. Day-2 operations

| Task | Command |
|------|---------|
| Tail logs | `docker compose logs -f backend` |
| Migrate the DB | `docker compose run --rm backend alembic upgrade head` |
| Open a Python shell against the DB | `docker compose run --rm backend python` |
| Run tests in the prod image | `docker compose run --rm backend pytest -q` |
| Rotate the JWT secret | Generate new `SECRET_KEY`, update env, redeploy. **All issued tokens become invalid** — tell users in advance. |
| Disable a user | UI → Users → Deactivate. |
| Audit a defect's history | UI → Audit → filter by `entity_type=defect`. Or hit `/api/v1/audit/entity/defect/{id}`. |

---

## 11. Pre-launch checklist

Tick before flipping the DNS:

- [ ] `pip-audit` and `npm audit` reviewed; runtime CVEs (if any)
      have an action plan.
- [ ] Fresh `SECRET_KEY` set; not the one from staging.
- [ ] `DEBUG=false`, `MAIL_BACKEND=smtp`, `SENTRY_DSN` set.
- [ ] `CORS_ORIGINS` contains only the prod hostname.
- [ ] TLS termination working; `https://tcm.your-org.com/livez`
      returns 200 from outside the cluster.
- [ ] Postgres backups scheduled and a restore has been tested.
- [ ] First admin password changed.
- [ ] At least one non-admin role + user created so support can sign
      in without escalating.
- [ ] Sentry receiving events (trigger a test 500 to confirm).
- [ ] Log aggregator showing the `request_id` field.
- [ ] Runbook (this file) saved somewhere your on-call can find it
      at 3 am.
