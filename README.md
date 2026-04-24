# Enterprise Test Case Management

[![CI](https://github.com/ashishpratapsingh/enterprise-test-case-management/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/ashishpratapsingh/enterprise-test-case-management/actions/workflows/ci.yml)

A multi-team test-case & defect-tracking tool for the SDLC/STLC — the
internal answer to "where do our test cases, test runs, defects, epics
and user stories live?" Think JIRA, but focused on testing.

---

## Features

- Projects / Modules / Releases
- Epics → User Stories → Test Cases with requirement traceability
- Test Suites, Test Runs, step-level Test Executions
- Defects with status-transition workflow and attachments
- Dashboards (pass/fail trends, automation coverage, release readiness)
- CSV bulk upload + CSV/PDF reporting
- JWT auth with refresh tokens + forgot/reset password (email-based)
- Role-based access control (Admin, QA Head, QA Engineer, Developer,
  Viewer, Auditor)
- Full audit log for regulated / reviewable environments
- OpenAPI docs at `/docs` when the backend runs

## Tech stack

| Layer     | Choice                                                          |
|-----------|-----------------------------------------------------------------|
| Backend   | Python 3.11+, FastAPI, async SQLAlchemy 2, Alembic, Pydantic v2 |
| Database  | SQLite for local dev, PostgreSQL for everything else            |
| Auth      | JWT (access + refresh), bcrypt, OIDC-ready                      |
| Email     | `MailService` abstraction — console (dev) or SMTP (prod)        |
| Frontend  | React 18 + TypeScript, MUI 5, AG Grid, Recharts, Axios          |
| Tests     | pytest + pytest-asyncio (backend), Jest + RTL (frontend)        |
| Ops       | Docker, Docker Compose, GitHub Actions CI                       |

## Architecture

```
                ┌────────────────┐
                │  React (MUI)   │  browser — :3000
                └───────┬────────┘
                        │  REST (JSON)
                        ▼
          ┌──────────────────────────┐
          │  FastAPI routes          │  uvicorn — :8000
          │    └── Services (biz)    │
          │          └── Repos       │  /api/v1
          └───────────────┬──────────┘
                          │  async SQLAlchemy
                          ▼
                ┌───────────────────┐
                │  Postgres / SQLite│
                └───────────────────┘

Cross-cutting middleware:
  AuditMiddleware  → records before/after snapshots
  RateLimit        → per-IP token bucket (bypassed when DEBUG=true)
  SecurityHeaders  → X-Content-Type-Options, X-Frame-Options, etc.
  CORS             → origins from CORS_ORIGINS setting
```

---

## Quick start — local development

### Prerequisites

- Python 3.11 or 3.12
- Node 20+
- (optional) Docker + Docker Compose for the one-command path below

### 1. Clone & copy env template

```bash
git clone https://github.com/ashishpratapsingh/enterprise-test-case-management.git
cd enterprise-test-case-management
cp .env.example backend/.env
```

Edit `backend/.env`:

- Set `DEBUG=true` for local dev.
- Generate a real `SECRET_KEY`:
  ```bash
  openssl rand -hex 32
  ```
  The app will refuse to start in production mode (`DEBUG=false`) if the
  key looks like a placeholder or is shorter than 32 chars.
- Leave `MAIL_BACKEND=console` — password-reset emails land in the backend log.

### 2. Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate           # Windows: venv\Scripts\activate
pip install -r requirements.txt
python seed.py                     # creates admin user + default roles
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

On first boot Alembic will auto-migrate the schema. Existing SQLite
files from before Alembic was introduced are auto-stamped at head — no
manual action needed.

Backend is live at http://localhost:8000 ; OpenAPI at http://localhost:8000/docs.

### 3. Frontend

In a second terminal:

```bash
cd frontend
npm install
npm start
```

Frontend is live at http://localhost:3000.

### 4. Log in

Use the seed credentials:

- **Email:** `admin@tcm.com`
- **Password:** `Admin@123`

Change the password immediately in any environment that isn't your laptop.

---

## Quick start — Docker

```bash
cp .env.example backend/.env
# edit backend/.env — at minimum, set SECRET_KEY
docker compose up --build
```

Brings up Postgres, the backend (port 8000), and the frontend (port 80).

---

## Running the tests

### Backend

```bash
cd backend
source venv/bin/activate
pytest -q                                 # quick run
pytest --cov=app --cov-report=term-missing  # with coverage
```

Current coverage: **~64%** (services, routes, auth flows).
CI enforces a **60%** floor.

### Frontend

```bash
cd frontend
CI=true npm test -- --watchAll=false       # single pass, non-interactive
CI=true npm test -- --watchAll=false --coverage   # with coverage
```

### Everything (CI simulation)

What GitHub Actions runs per PR is in [`.github/workflows/ci.yml`](.github/workflows/ci.yml).
You can run the same commands locally in each directory.

---

## Database migrations

Alembic is wired for both fresh and legacy databases. The app runs
`alembic upgrade head` automatically on startup; you normally don't run
it by hand.

When you add or change a model column:

```bash
cd backend
source venv/bin/activate
alembic revision --autogenerate -m "add_xyz_to_test_cases"
# review the generated file under alembic/versions/
# if the autogen diff is wrong, hand-edit it
alembic upgrade head    # apply locally
```

Commit the generated migration file alongside the model change.

The **initial baseline** migration uses `Base.metadata.create_all` under
the hood (see `alembic/versions/2026_04_24_*_initial_schema.py`) because
the schema has a legitimate cycle between `defects` and `test_executions`
that defeats Alembic's alphabetical autogenerate. Subsequent migrations
autogenerate cleanly.

---

## Environment variables

Everything the backend reads is documented in [`.env.example`](.env.example).
Summary of the ones most people change:

| Var            | Purpose                                                     |
|----------------|-------------------------------------------------------------|
| `DEBUG`        | `true` for dev — bypasses rate limiting, warns on weak secrets |
| `SECRET_KEY`   | JWT signing key — **must** be random in prod (`openssl rand -hex 32`) |
| `DATABASE_URL` | `sqlite+aiosqlite:///./tcm.db` or `postgresql+asyncpg://…`  |
| `CORS_ORIGINS` | Comma-separated origins allowed to call the API             |
| `MAIL_BACKEND` | `console` (log only) or `smtp`                              |
| `SMTP_HOST`..  | Only when `MAIL_BACKEND=smtp`                               |
| `APP_BASE_URL` | Public URL the frontend is served from; used in email links |

---

## Email (password-reset flow)

- **Dev** (`MAIL_BACKEND=console`): submit the forgot-password form and
  grep the backend log for `mail_sent_console` — the reset URL is in
  the `body_preview` field. Copy it into your browser.
- **Prod** (`MAIL_BACKEND=smtp`): set `SMTP_HOST/PORT/USER/PASSWORD`
  and `MAIL_FROM`; the email is delivered for real.

The API response is the same generic message in either case — we never
leak whether the email was registered, and we never echo the token
back over HTTP.

---

## Default roles

Seeded by `seed.py`:

| Role          | What it can do                                                   |
|---------------|------------------------------------------------------------------|
| Admin         | Everything, including user + role management                     |
| QA Head       | Create / approve test cases, manage releases                     |
| QA Engineer   | Create / execute test cases, log defects                         |
| Developer     | View test cases, update linked defects                           |
| Viewer        | Read-only                                                        |
| Auditor       | Read + view audit logs                                           |

---

## Project layout

```
.
├── backend/
│   ├── app/
│   │   ├── api/            # FastAPI route handlers
│   │   ├── core/           # config, security, middleware, exceptions
│   │   ├── db/             # session, base model, startup migrations
│   │   ├── models/         # SQLAlchemy ORM
│   │   ├── repositories/   # DB access layer
│   │   ├── schemas/        # Pydantic request/response shapes
│   │   ├── services/       # business logic
│   │   └── utils/          # helpers
│   ├── alembic/            # migrations
│   ├── tests/              # pytest suites (unit + integration)
│   └── seed.py
├── frontend/
│   └── src/
│       ├── components/
│       ├── contexts/
│       ├── hooks/
│       ├── pages/
│       ├── services/       # axios API clients
│       ├── test-utils/     # shared Jest helpers
│       └── utils/
├── .github/workflows/      # CI
└── docker-compose.yml
```

---

## Contributing

1. **Branch from `dev`**, not `main`. Naming: `feature/<short-name>`,
   `fix/<short-name>`, `chore/<short-name>`.
2. **CI must be green.** The workflow in `.github/workflows/ci.yml`
   runs pytest + Jest + `tsc --noEmit` on every PR. Coverage floor: 60%.
3. **Keep commits self-contained.** A refactor and a feature don't
   belong in the same commit.
4. **Don't add deps without a reason.** If you add one, pin a floor
   version in the matching requirements file.
5. **When changing a model**, include the Alembic migration in the
   same PR.
6. **Never commit** `.env`, `tcm.db*`, `backend/uploads/`, or
   `backend/logs/` — `.gitignore` covers these but double-check.

---

## Roadmap

Non-functional work is grouped into milestones:

- **Milestone 1** — CI, Alembic migrations, SECRET_KEY fail-fast, real
  email, this README. **Current.**
- **Milestone 2** — JIRA integration, CI-results ingest endpoint, SSO (OIDC).
- **Milestone 3** — async job queue (Celery + Redis), Sentry, metrics,
  frontend code-splitting.
- **Milestone 4+** — bulk UI ops, full-text search, notifications,
  accessibility audit, i18n, dark mode.

---

## License

Internal tool — no public license attached.
