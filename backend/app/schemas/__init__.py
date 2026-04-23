"""Pydantic v2 schemas for the Enterprise Test Case Management system."""

from app.schemas.attachment import AttachmentListResponse, AttachmentResponse
from app.schemas.audit import (
    AuditLogFilter,
    AuditLogListResponse,
    AuditLogResponse,
)
from app.schemas.auth import LoginRequest, RefreshTokenRequest, TokenResponse
from app.schemas.common import (
    MessageResponse,
    PaginatedResponse,
    PaginationParams,
    SortParams,
)
from app.schemas.dashboard import (
    AutomationCoverageResponse,
    DefectDensityResponse,
    ExecutionTrendDataPoint,
    ExecutionTrendResponse,
    PassFailRatioResponse,
    ReleaseReadinessResponse,
    TestCoverageResponse,
)
from app.schemas.defect import (
    DefectCreate,
    DefectListResponse,
    DefectPriority,
    DefectResponse,
    DefectSeverity,
    DefectStatus,
    DefectUpdate,
)
from app.schemas.execution import (
    ExecutionCreate,
    ExecutionListResponse,
    ExecutionResponse,
    ExecutionStatus,
    ExecutionUpdate,
    StepResult,
)
from app.schemas.module import (
    ModuleCreate,
    ModuleListResponse,
    ModuleResponse,
    ModuleUpdate,
)
from app.schemas.project import (
    ProjectCreate,
    ProjectListResponse,
    ProjectResponse,
    ProjectUpdate,
)
from app.schemas.release import (
    ReleaseCreate,
    ReleaseListResponse,
    ReleaseResponse,
    ReleaseStatus,
    ReleaseUpdate,
)
from app.schemas.requirement import (
    RequirementCreate,
    RequirementListResponse,
    RequirementPriority,
    RequirementResponse,
    RequirementStatus,
    RequirementUpdate,
)
from app.schemas.test_case import (
    AutomationStatus,
    TestCaseBulkUploadResponse,
    TestCaseCloneRequest,
    TestCaseCreate,
    TestCaseListResponse,
    TestCasePriority,
    TestCaseResponse,
    TestCaseSeverity,
    TestCaseStatus,
    TestCaseType,
    TestCaseUpdate,
    TestStep,
)
from app.schemas.test_run import (
    TestRunCreate,
    TestRunListResponse,
    TestRunResponse,
    TestRunStatus,
    TestRunUpdate,
)
from app.schemas.test_suite import (
    AddTestCaseRequest,
    ReorderRequest,
    TestSuiteCreate,
    TestSuiteListResponse,
    TestSuiteResponse,
    TestSuiteUpdate,
)
from app.schemas.user import (
    UserCreate,
    UserListResponse,
    UserResponse,
    UserUpdate,
)

__all__ = [
    # Auth
    "LoginRequest",
    "RefreshTokenRequest",
    "TokenResponse",
    # User
    "UserCreate",
    "UserListResponse",
    "UserResponse",
    "UserUpdate",
    # Project
    "ProjectCreate",
    "ProjectListResponse",
    "ProjectResponse",
    "ProjectUpdate",
    # Module
    "ModuleCreate",
    "ModuleListResponse",
    "ModuleResponse",
    "ModuleUpdate",
    # Release
    "ReleaseCreate",
    "ReleaseListResponse",
    "ReleaseResponse",
    "ReleaseStatus",
    "ReleaseUpdate",
    # Requirement
    "RequirementCreate",
    "RequirementListResponse",
    "RequirementPriority",
    "RequirementResponse",
    "RequirementStatus",
    "RequirementUpdate",
    # Test Case
    "AutomationStatus",
    "TestCaseBulkUploadResponse",
    "TestCaseCloneRequest",
    "TestCaseCreate",
    "TestCaseListResponse",
    "TestCasePriority",
    "TestCaseResponse",
    "TestCaseSeverity",
    "TestCaseStatus",
    "TestCaseType",
    "TestCaseUpdate",
    "TestStep",
    # Test Suite
    "AddTestCaseRequest",
    "ReorderRequest",
    "TestSuiteCreate",
    "TestSuiteListResponse",
    "TestSuiteResponse",
    "TestSuiteUpdate",
    # Test Run
    "TestRunCreate",
    "TestRunListResponse",
    "TestRunResponse",
    "TestRunStatus",
    "TestRunUpdate",
    # Execution
    "ExecutionCreate",
    "ExecutionListResponse",
    "ExecutionResponse",
    "ExecutionStatus",
    "ExecutionUpdate",
    "StepResult",
    # Defect
    "DefectCreate",
    "DefectListResponse",
    "DefectPriority",
    "DefectResponse",
    "DefectSeverity",
    "DefectStatus",
    "DefectUpdate",
    # Attachment
    "AttachmentListResponse",
    "AttachmentResponse",
    # Audit
    "AuditLogFilter",
    "AuditLogListResponse",
    "AuditLogResponse",
    # Dashboard
    "AutomationCoverageResponse",
    "DefectDensityResponse",
    "ExecutionTrendDataPoint",
    "ExecutionTrendResponse",
    "PassFailRatioResponse",
    "ReleaseReadinessResponse",
    "TestCoverageResponse",
    # Common
    "MessageResponse",
    "PaginatedResponse",
    "PaginationParams",
    "SortParams",
]
