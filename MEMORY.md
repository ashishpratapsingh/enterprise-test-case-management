# PROJECT: Enterprise Test Case Management System (FastAPI - Fintech Grade)

## ROLE

You are a Principal Software Architect and Senior Backend Engineer specializing in Python enterprise systems.

Your objective is to generate a fully functional, production-ready Test Case Management (TCM) system using:

- Python 3.12+
- FastAPI
- PostgreSQL
- SQLAlchemy (2.0 async)
- Alembic (migrations)
- Pydantic v2
- JWT Authentication
- Dockerized deployment
- React + TypeScript frontend

Generate real, working code. Do NOT generate pseudo code.

---

# 1. BUSINESS CONTEXT

This system will be used in a fintech organization with:

- Multi-product structure
- Regulated audit requirements
- Release-based execution
- JIRA integration capability
- Bitbucket linking capability
- Role-based access

Users:
- Admin
- QA Head
- QA Engineer
- Developer
- Viewer
- Compliance Auditor

The system must support traceability, auditability, and release governance.

---

# 2. SYSTEM ARCHITECTURE

Use clean architecture:

backend/
  app/
    api/
    core/
    models/
    schemas/
    services/
    repositories/
    db/
    utils/
  tests/

frontend/
  src/

Separate layers:

- API Layer (routers)
- Service Layer (business logic)
- Repository Layer (database abstraction)
- Core (security, config)
- Models (SQLAlchemy)
- Schemas (Pydantic)

Use async everywhere (async SQLAlchemy + async FastAPI).

---

# 3. DATABASE DESIGN (PostgreSQL)

Use UUID primary keys.

Tables:

1. users
2. roles
3. projects
4. modules
5. releases
6. requirements
7. test_cases
8. test_case_versions
9. test_suites
10. test_suite_cases
11. test_runs
12. test_executions
13. defects
14. attachments
15. audit_logs

Requirements:

- Soft delete via `is_deleted`
- Created_at, updated_at timestamps
- Proper foreign keys
- Index frequently queried fields
- Store JSON snapshots in audit_logs
- Versioning support for test cases

Generate full SQLAlchemy models.

---

# 4. AUTHENTICATION & SECURITY

Implement:

- OAuth2 password flow
- JWT tokens (access + refresh)
- Role-Based Access Control (RBAC)
- Password hashing (bcrypt via passlib)
- Dependency-based permission guards
- Input validation
- CORS configuration
- Secure headers
- API rate limiting

Roles:

- Admin (full access)
- QA Head (approve & manage)
- QA Engineer (create & execute)
- Developer (view & link defects)
- Viewer (read-only)
- Auditor (read + audit logs)

---

# 5. CORE FEATURES

## 5.1 Project Management
- CRUD projects
- Associate modules
- Associate releases

## 5.2 Test Case Management

Fields:

- Auto-generated Test Case ID (TC-00001 format)
- Title
- Description
- Preconditions
- Structured test steps (JSON array)
- Expected results
- Priority
- Severity
- Type (Functional, API, Regression, Performance, Security, UAT)
- Automation status
- Linked requirement
- Linked JIRA ticket ID
- Version
- Status (Draft/Ready/Approved/Deprecated)
- Tags
- Attachments

Features:

- Clone test case
- Bulk upload (CSV)
- Versioning
- Approval workflow
- Soft delete
- Audit trail

---

## 5.3 Test Suite Management
- Create suite
- Add/remove test cases
- Reorder
- Associate with release

---

## 5.4 Test Execution

- Create test run
- Assign tester
- Step-level execution
- Status (Pass/Fail/Blocked/Skipped)
- Defect linking
- Execution environment
- Execution timestamps

---

## 5.5 Dashboard Metrics

Provide APIs for:

- Test coverage by requirement
- Pass/fail ratio
- Automation coverage %
- Execution trend
- Defect density
- Release readiness score

---

# 6. API DESIGN

Organize routes:

/auth
/users
/projects
/modules
/releases
/requirements
/testcases
/testsuites
/testruns
/executions
/defects
/audit

Include:

- Pagination
- Filtering
- Sorting
- Standardized response format:

{
  "success": true,
  "data": {},
  "message": "",
  "errors": []
}

Generate OpenAPI documentation automatically via FastAPI.

---

# 7. INTEGRATION LAYER

Create service stubs for:

- JIRA REST API integration
- Bitbucket commit linking
- Future AI-based test case generator

Keep integration configurable via environment variables.

---

# 8. FRONTEND (React + TypeScript)

Generate:

- Authentication pages
- Dashboard with charts
- Project management UI
- Test case listing with filters
- Test case form
- Drag-drop suite builder
- Step-based execution screen
- Reports page
- User management
- Audit log viewer

Use:

- React 18
- TypeScript
- Material UI
- Axios
- React Router
- Chart library

Implement:

- Role-based rendering
- Token storage
- Axios interceptors
- Error handling

---

# 9. TESTING

Backend:

- Pytest
- Async test client
- Coverage > 75%
- Unit tests for services
- Integration tests for APIs

Frontend:

- Basic component tests
- API mocking

---

# 10. DEVOPS & DEPLOYMENT

Generate:

- Dockerfile (backend)
- Dockerfile (frontend)
- docker-compose.yml
- PostgreSQL service
- Alembic migration setup
- Seed script
- Production config
- .env.example

Include:

- Gunicorn + Uvicorn workers
- Health check endpoint
- Logging configuration
- Structured logging

---

# 11. AUDIT & COMPLIANCE

Implement:

- Audit middleware
- Log before/after state
- Store user + timestamp
- Immutable audit records

Must support compliance review access.

---

# 12. REPORTING

Generate:

- CSV export endpoint
- PDF report generation endpoint
- Release readiness report API
- Automation coverage report API

---

# 13. PERFORMANCE

Implement:

- Pagination on all list endpoints
- Indexed search fields
- Avoid N+1 queries
- Async DB operations
- Efficient joins

---

# 14. DELIVERABLE FORMAT

Output must include:

1. Complete folder structure
2. All backend source files
3. All frontend source files
4. SQLAlchemy models
5. Alembic migration config
6. Docker configs
7. README with setup steps
8. Example environment variables
9. Seed data
10. API test examples

This must be a fully runnable production-ready application.

Do not summarize.
Do not skip implementation.
Generate complete working code.