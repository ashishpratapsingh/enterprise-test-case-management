"""API route aggregation."""

from fastapi import APIRouter

from app.api.routes.audit import router as audit_router
from app.api.routes.epics import router as epics_router
from app.api.routes.auth import router as auth_router
from app.api.routes.dashboard import router as dashboard_router
from app.api.routes.defects import router as defects_router
from app.api.routes.executions import router as executions_router
from app.api.routes.integrations import router as integrations_router
from app.api.routes.modules import router as modules_router
from app.api.routes.projects import router as projects_router
from app.api.routes.releases import router as releases_router
from app.api.routes.reports import router as reports_router
from app.api.routes.requirements import router as requirements_router
from app.api.routes.roles import router as roles_router
from app.api.routes.test_cases import router as test_cases_router
from app.api.routes.test_runs import router as test_runs_router
from app.api.routes.test_suites import router as test_suites_router
from app.api.routes.user_stories import router as user_stories_router
from app.api.routes.users import router as users_router

router = APIRouter()

router.include_router(auth_router)
router.include_router(users_router)
router.include_router(roles_router)
router.include_router(projects_router)
router.include_router(modules_router)
router.include_router(releases_router)
router.include_router(requirements_router)
router.include_router(test_cases_router)
router.include_router(test_suites_router)
router.include_router(test_runs_router)
router.include_router(executions_router)
router.include_router(defects_router)
router.include_router(audit_router)
router.include_router(dashboard_router)
router.include_router(reports_router)
router.include_router(epics_router)
router.include_router(user_stories_router)
router.include_router(integrations_router)
