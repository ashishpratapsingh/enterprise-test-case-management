# Security Notes

Brief security audit notes. Last reviewed 2026-04-29.

## Backend (`pip-audit`)

```
pip-audit -r backend/requirements.txt
→ No known vulnerabilities found
```

Re-run before each release.

## Frontend (`npm audit`)

`npm audit` reports **38 vulnerabilities** as of last check, all
inherited from `react-scripts` (Create React App's build toolchain).

### What we actually ship

The 38 advisories are split into:

| Category                                | Reaches the browser? | Action |
|-----------------------------------------|----------------------|--------|
| Build-time only (svgo, workbox, etc.)   | No                   | None   |
| Webpack / picomatch / serialize-js      | No                   | None   |
| `lodash` (transitive)                   | We don't import it directly. CRA uses it at build time. | None |
| `xlsx`                                  | **Yes**, but we only use the **write** path (`json_to_sheet`, `writeFile`). The known CVEs are in `XLSX.read()` / parsing — we never call those. | Zero runtime exposure today. Re-audit if anyone adds a "paste an Excel file in the browser" feature. |

So although `npm audit` looks alarming, **none of the listed CVEs are
exploitable through the running app**.

### Long-term plan

CRA is on life support and dragging in pinned-old dependencies that
the wider ecosystem has long since moved past. The only durable fix
is migrating off CRA — typically to **Vite** — which would let
modern, patched versions of these transitive deps flow in. Sized as
a separate ~1-day refactor; not blocking this release.

## Authentication

- **Local login**: bcrypt-hashed passwords; JWT (HS256) access + refresh tokens.
- **SSO (OIDC)**: signed-state CSRF protection; auto-provisioning gated by `OIDC_DEFAULT_ROLE_NAME`.
- **Service-account tokens** (CI ingest): standard JWT — same auth surface as a human user. Rotate regularly.

## Authorization

- `RoleChecker(["admin", ...])` dependency on every mutating route.
- Self-protection rules on user actions (an admin can never deactivate / role-change / delete themselves).
- Audit middleware records who did what, with before/after diffs.

## Secrets handling

- `SECRET_KEY` validation in production: refuses to start with placeholder values or short strings.
- All third-party tokens (`JIRA_API_TOKEN`, `GITHUB_TOKEN`, `OIDC_CLIENT_SECRET`, `SENTRY_DSN`, SMTP creds) read from env, **never** committed.
- `.env` is in `.gitignore`. `.env.example` is the documented template.

## Transport

- Backend doesn't terminate TLS — assumes a reverse proxy (nginx / caddy / k8s ingress / cloudfront / ALB) handles HTTPS. Document this in your deploy.
- CORS allowlist via `CORS_ORIGINS` env var.

## Outbound integrations

- All outbound HTTP (JIRA, GitHub, OIDC IdP) goes through `httpx.AsyncClient` with a 10-second timeout.
- Upstream errors are wrapped in `IntegrationError` → HTTP 502; the verbatim upstream response body is **never** echoed back to the API caller (could leak hostnames, partial tokens). Full body is logged internally for debugging.
- Repo slugs (GitHub) are validated as strict `owner/repo`; URL injection paths are blocked at the service layer.

## Recommended pre-prod checklist

1. Rotate `SECRET_KEY` for the prod environment (never share with dev/staging).
2. Set `DEBUG=false`, `MAIL_BACKEND=smtp`, `SENTRY_DSN=...`.
3. Configure `CORS_ORIGINS` to only the frontend's prod URL.
4. Run `pip-audit -r backend/requirements.txt` in CI; gate the build on a clean pass.
5. Verify your reverse proxy adds standard security headers (HSTS, X-Frame-Options) — middleware adds some, the proxy should add transport-level ones.
6. Set up a backup schedule for the Postgres DB.
