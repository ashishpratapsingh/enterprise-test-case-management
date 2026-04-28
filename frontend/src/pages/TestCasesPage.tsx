import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import useIsMobile from '../hooks/useIsMobile';
import {
  Alert,
  Box,
  Button,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  IconButton,
  Switch,
  FormControlLabel,
  FormHelperText,
  Checkbox,
  Tooltip,
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Search as SearchIcon,
  FilterList as FilterIcon,
  Clear as ClearIcon,
  Upload as UploadIcon,
  Download as DownloadIcon,
  Close as CloseIcon,
} from '@mui/icons-material';
import { GridColDef, GridPaginationModel } from '../components/common/DataTable';
import { useSnackbar } from 'notistack';
import DataTable from '../components/common/DataTable';
import ConfirmDialog from '../components/common/ConfirmDialog';
import testCaseService from '../services/testCaseService';
import epicService from '../services/epicService';
import userStoryService from '../services/userStoryService';
import userService from '../services/userService';
import useBulkEdit, { BulkFieldSpec } from '../hooks/useBulkEdit';
import BulkEditDialog from '../components/common/BulkEditDialog';
import { TestCase, TestStep, Project, TestCaseType, TestCasePriority, TestCaseStatus } from '../types';
import { useAuth } from '../hooks/useAuth';
import { canEdit, canApprove } from '../utils/roleGuard';
import { useProjects } from '../contexts/ProjectContext';
import { format } from 'date-fns';

const TYPES: TestCaseType[] = ['functional', 'regression', 'smoke', 'integration', 'performance', 'security', 'usability', 'api'];
const PRIORITIES: TestCasePriority[] = ['low', 'medium', 'high', 'critical'];
const STATUSES: TestCaseStatus[] = ['passed', 'failed', 'blocked', 'in_progress', 'skipped', 'draft'];
const EDITABLE_STATUSES: string[] = ['draft', 'blocked', 'in_progress', 'skipped', 'ready_for_review', 'in_progress_review', 'ready_to_test'];
// Approval workflow values offered by the bulk-edit dialog. Backend's
// ``_APPROVAL_TRANSITIONS`` enforces Draft → Ready → Approved (with
// allowed reverse moves); illegal transitions land in ``failed`` per id.
const APPROVAL_STATUSES: string[] = ['Draft', 'Ready', 'Approved'];
const AUTOMATION_OPTIONS: string[] = ['Manual', 'Automated'];
const BULK_MAX = 500;

const TestCasesPage: React.FC = () => {
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const { user } = useAuth();
  const userCanEdit = user ? canEdit(user.role) : false;
  const userCanApprove = user ? canApprove(user.role) : false;
  const isMobile = useIsMobile();

  const { projects } = useProjects();
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [loading, setLoading] = useState(true);
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({
    page: 0,
    pageSize: 10,
  });

  // Filters
  const [filterProjectId, setFilterProjectId] = useState<string>('');
  const [filterEpicId, setFilterEpicId] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterType, setFilterType] = useState<string>('');
  const [filterPriority, setFilterPriority] = useState<string>('');
  const [filterAutomated, setFilterAutomated] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');

  // ── Bulk operations (JIRA-style) ───────────────────────────────────────
  // Same shape as DefectsPage: single dialog with per-field "change?"
  // checkboxes, partial-success result panel, and an inline destructive
  // Delete button outside the dialog.
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkResult, setBulkResult] = useState<null | {
    perField: { field: string; succeeded: number; failed: number; firstError?: string }[];
  }>(null);

  // Users for assignee dropdown
  const [users, setUsers] = useState<{ id: string; full_name: string; email: string }[]>([]);

  // Epics & User Stories for dropdowns
  const [allEpics, setAllEpics] = useState<{ id: string; title: string; project_id: string }[]>([]);
  const [allStories, setAllStories] = useState<{ id: string; title: string; epic_id: string; project_id: string }[]>([]);

  useEffect(() => {
    const fallbackUsers = user
      ? [{ id: String(user.id), full_name: user.full_name || user.email, email: user.email }]
      : [];
    userService.getAll({ pageSize: 100, isActive: true }).then((res) => {
      const apiData = (res as any)?.data;
      let userList: any[] = [];
      if (Array.isArray(apiData)) {
        userList = (apiData[0] || []).map((u: any) => ({
          id: u.id,
          full_name: u.full_name,
          email: u.email,
        }));
      }
      setUsers(userList.length > 0 ? userList : fallbackUsers);
    }).catch(() => {
      setUsers(fallbackUsers);
    });
  }, [user]);

  useEffect(() => {
    epicService.getAll({ page: 1, pageSize: 10000 }).then((res) => {
      const apiData = (res as any)?.data;
      if (Array.isArray(apiData)) {
        setAllEpics((apiData[0] || []).map((e: any) => ({ id: e.id, title: e.title, project_id: e.project_id })));
      }
    }).catch(() => {});
    userStoryService.getAll({ page: 1, pageSize: 10000 }).then((res) => {
      const apiData = (res as any)?.data;
      if (Array.isArray(apiData)) {
        setAllStories((apiData[0] || []).map((s: any) => ({ id: s.id, title: s.title, epic_id: s.epic_id, project_id: s.project_id })));
      }
    }).catch(() => {});
  }, []);

  // Dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTestCaseId, setEditingTestCaseId] = useState('');
  const [editingCase, setEditingCase] = useState<Partial<TestCase> & { steps: TestStep[] }>({
    title: '',
    description: '',
    preconditions: '',
    type: 'functional',
    priority: 'medium',
    status: 'draft',
    isAutomated: false,
    steps: [],
    tags: [],
  });
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleteTestCaseId, setDeleteTestCaseId] = useState('');

  // Upload dialog
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploadProjectId, setUploadProjectId] = useState('');
  const [uploadEpicId, setUploadEpicId] = useState('');
  const [uploadUserStoryId, setUploadUserStoryId] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const fetchTestCases = useCallback(async () => {
    setLoading(true);
    try {
      const res = await testCaseService.getAll({
        page: paginationModel.page + 1,
        pageSize: paginationModel.pageSize,
        projectId: filterProjectId || undefined,
        epicId: filterEpicId || undefined,
        status: filterStatus || undefined,
        type: filterType || undefined,
        priority: filterPriority || undefined,
        automationStatus: filterAutomated || undefined,
        search: searchQuery || undefined,
      });
      const apiData = (res as any)?.data;
      if (Array.isArray(apiData)) {
        setTestCases(apiData[0] || []);
        setTotalRows(apiData[1] || 0);
      } else {
        setTestCases([]);
        setTotalRows(0);
      }
    } catch {
      enqueueSnackbar('Failed to load test cases', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [paginationModel, filterProjectId, filterEpicId, filterStatus, filterType, filterPriority, filterAutomated, searchQuery, enqueueSnackbar]);

  useEffect(() => {
    fetchTestCases();
  }, [fetchTestCases]);

  useAutoRefresh(fetchTestCases, [paginationModel, filterProjectId, filterEpicId, filterStatus, filterType, filterPriority, filterAutomated, searchQuery]);

  const handleAddStep = () => {
    setEditingCase((prev) => ({
      ...prev,
      steps: [
        ...prev.steps,
        {
          id: 0,
          testCaseId: 0,
          stepNumber: prev.steps.length + 1,
          action: '',
          expectedResult: '',
          testData: '',
        },
      ],
    }));
  };

  const handleStepChange = (index: number, field: keyof TestStep, value: string) => {
    setEditingCase((prev) => {
      const steps = [...prev.steps];
      steps[index] = { ...steps[index], [field]: value };
      return { ...prev, steps };
    });
  };

  const handleRemoveStep = (index: number) => {
    setEditingCase((prev) => {
      const steps = prev.steps.filter((_, i) => i !== index);
      return { ...prev, steps: steps.map((s, i) => ({ ...s, stepNumber: i + 1 })) };
    });
  };

  const handleSave = async () => {
    if (!editingCase.projectId) {
      enqueueSnackbar('Project is required', { variant: 'warning' });
      return;
    }
    if (!(editingCase as any).epic_id) {
      enqueueSnackbar('Epic is required', { variant: 'warning' });
      return;
    }
    if (!(editingCase as any).user_story_id) {
      enqueueSnackbar('User Story is required', { variant: 'warning' });
      return;
    }
    if (!editingCase.title?.trim()) {
      enqueueSnackbar('Title is required', { variant: 'warning' });
      return;
    }
    if (!editingCase.type) {
      enqueueSnackbar('Type is required', { variant: 'warning' });
      return;
    }
    if (!editingCase.priority) {
      enqueueSnackbar('Priority is required', { variant: 'warning' });
      return;
    }
    if (!editingCase.status) {
      enqueueSnackbar('Status is required', { variant: 'warning' });
      return;
    }
    if (editingCase.steps.length > 0 && editingCase.steps.some((s) => !s.action?.trim() || !s.expectedResult?.trim())) {
      enqueueSnackbar('All test steps must have Action and Expected Result filled', { variant: 'warning' });
      return;
    }
    if (!editingCase.id) {
      const duplicate = testCases.find(
        (tc) =>
          tc.title?.toLowerCase() === (editingCase.title || '').trim().toLowerCase() &&
          (tc.projectId || (tc as any).project_id) === editingCase.projectId
      );
      if (duplicate) {
        enqueueSnackbar('A test case with this title already exists in the selected project', { variant: 'warning' });
        return;
      }
    }
    try {
      const payload: Record<string, any> = {
        title: editingCase.title?.trim(),
        description: editingCase.description || null,
        preconditions: editingCase.preconditions || null,
        type: editingCase.type,
        priority: editingCase.priority,
        status: editingCase.status,
        automation_status: editingCase.isAutomated ? 'Automated' : 'Manual',
        project_id: editingCase.projectId || undefined,
        epic_id: (editingCase as any).epic_id || null,
        user_story_id: (editingCase as any).user_story_id || null,
        assigned_to: (editingCase as any).assigned_to || null,
        version: editingCase.version ?? 1,
        steps: editingCase.steps?.map((s, i) => ({
          step_number: i + 1,
          action: s.action,
          expected_result: s.expectedResult,
          test_data: s.testData || '',
        })),
        tags: editingCase.tags || [],
      };
      if (editingCase.id) {
        await testCaseService.update(editingCase.id, payload);
        enqueueSnackbar('Test case updated', { variant: 'success' });
      } else {
        await testCaseService.create(payload);
        enqueueSnackbar('Test case created', { variant: 'success' });
      }
      setDialogOpen(false);
      fetchTestCases();
    } catch (err: any) {
      enqueueSnackbar(err.response?.data?.message || 'Failed to save test case', {
        variant: 'error',
      });
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await testCaseService.delete(deleteId);
      enqueueSnackbar('Test case deleted', { variant: 'success' });
      setDeleteDialogOpen(false);
      setDeleteId(null);
      fetchTestCases();
    } catch {
      enqueueSnackbar('Failed to delete test case', { variant: 'error' });
    }
  };

  // ── Bulk handlers ───────────────────────────────────────────────────────

  const reportBulkResult = (
    label: string,
    result: { succeeded: string[]; failed: { id: string; error: string }[] },
  ) => {
    if (result.succeeded.length > 0) {
      enqueueSnackbar(`${result.succeeded.length} test case(s) ${label}`, { variant: 'success' });
    }
    if (result.failed.length > 0) {
      enqueueSnackbar(
        `${result.failed.length} test case(s) skipped: ${result.failed[0].error}`,
        { variant: 'warning' },
      );
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    setBulkBusy(true);
    try {
      const r = await testCaseService.bulkDelete(selectedIds);
      reportBulkResult('deleted', r);
      setSelectedIds([]);
      setBulkDeleteConfirm(false);
      fetchTestCases();
    } catch {
      enqueueSnackbar('Bulk delete failed', { variant: 'error' });
    } finally {
      setBulkBusy(false);
    }
  };

  // ── Bulk-update field spec ──────────────────────────────────────────────
  // Status uses the approval workflow; everything else is a plain
  // bulkUpdate. The dialog component handles all the validation /
  // error / Apply gating; we just translate ``bulk.changedFields``
  // into the right endpoints below.
  const bulkFields: BulkFieldSpec[] = [
    {
      key: 'status',
      label: 'Change status',
      type: 'select',
      options: APPROVAL_STATUSES.map((s) => ({ value: s, label: s })),
      helperText:
        'Approval workflow: Draft → Ready → Approved (and the legal reverse moves). Illegal transitions are skipped per row.',
    },
    {
      key: 'priority',
      label: 'Change priority',
      type: 'select',
      options: PRIORITIES.map((p) => ({
        value: p,
        label: p.charAt(0).toUpperCase() + p.slice(1),
      })),
    },
    {
      key: 'type',
      label: 'Change type',
      type: 'select',
      options: TYPES.map((t) => ({
        value: t,
        label: t.charAt(0).toUpperCase() + t.slice(1),
      })),
    },
    {
      key: 'automation',
      label: 'Change automation',
      type: 'select',
      options: AUTOMATION_OPTIONS.map((a) => ({ value: a, label: a })),
    },
    {
      key: 'assignedTo',
      label: 'Change assignee',
      type: 'select',
      required: false,
      options: [
        { value: '', label: 'Unassigned' },
        ...users.map((u) => ({ value: u.id, label: u.full_name || u.email })),
      ],
    },
  ];
  const bulkEdit = useBulkEdit(bulkFields);

  const openBulkEdit = () => {
    bulkEdit.reset();
    setBulkResult(null);
    setBulkEditOpen(true);
  };

  // Translate ``bulk.changedFields`` into the relevant backend calls.
  // Status flows through bulkTransitionApproval (workflow rules);
  // everything else is bulkUpdate.
  const handleBulkApply = async () => {
    if (selectedIds.length === 0) return;
    type FieldResult = { field: string; succeeded: number; failed: number; firstError?: string };
    const summarize = (
      label: string,
      r: { succeeded: string[]; failed: { id: string; error: string }[] },
    ): FieldResult => ({
      field: label,
      succeeded: r.succeeded.length,
      failed: r.failed.length,
      firstError: r.failed[0]?.error,
    });

    const changes = bulkEdit.changedFields;
    setBulkBusy(true);
    const perField: FieldResult[] = [];
    try {
      if (changes.status) {
        const r = await testCaseService.bulkTransitionApproval(selectedIds, changes.status);
        perField.push(summarize(`Status → ${changes.status}`, r));
      }
      if ('assignedTo' in changes) {
        const target = changes.assignedTo
          ? users.find((u) => u.id === changes.assignedTo)?.full_name ||
            users.find((u) => u.id === changes.assignedTo)?.email ||
            'user'
          : 'Unassigned';
        const r = await testCaseService.bulkUpdate(
          selectedIds,
          changes.assignedTo
            ? { assigned_to: changes.assignedTo }
            : { unassign: true },
        );
        perField.push(summarize(`Assignee → ${target}`, r));
      }
      const updatePayload: {
        priority?: string; type?: string; automation_status?: string;
      } = {};
      if (changes.priority) updatePayload.priority = changes.priority;
      if (changes.type) updatePayload.type = changes.type;
      if (changes.automation) updatePayload.automation_status = changes.automation;
      if (Object.keys(updatePayload).length > 0) {
        const r = await testCaseService.bulkUpdate(selectedIds, updatePayload);
        const labels = [
          updatePayload.priority ? `Priority → ${updatePayload.priority}` : '',
          updatePayload.type ? `Type → ${updatePayload.type}` : '',
          updatePayload.automation_status ? `Automation → ${updatePayload.automation_status}` : '',
        ].filter(Boolean).join(' / ');
        perField.push(summarize(labels, r));
      }
      setBulkResult({ perField });
      setSelectedIds([]);
      fetchTestCases();
    } catch {
      enqueueSnackbar('Bulk update failed', { variant: 'error' });
    } finally {
      setBulkBusy(false);
    }
  };

  const handleApprove = async (id: number) => {
    try {
      await testCaseService.approve(id);
      enqueueSnackbar('Test case approved', { variant: 'success' });
      fetchTestCases();
    } catch {
      enqueueSnackbar('Failed to approve test case', { variant: 'error' });
    }
  };

  const handleClone = async (id: number) => {
    try {
      await testCaseService.clone(id);
      enqueueSnackbar('Test case cloned', { variant: 'success' });
      fetchTestCases();
    } catch {
      enqueueSnackbar('Failed to clone test case', { variant: 'error' });
    }
  };

  const handleDownloadTemplate = () => {
    const XLSX = require('xlsx');
    const templateData = [
      {
        title: 'Sample Login Test',
        description: 'Verify user can login with valid credentials',
        preconditions: 'User must be registered',
        type: 'functional',
        priority: 'high',
        status: 'draft',
        isAutomated: false,
        version: 1,
        steps: '[{"step_number":1,"action":"Open login page","expected_result":"Login page displayed","test_data":"URL: https://example.com/login"},{"step_number":2,"action":"Enter credentials","expected_result":"Credentials accepted","test_data":"user: admin, pass: Admin@123"}]',
      },
      {
        title: '',
        description: '',
        preconditions: '',
        type: '',
        priority: '',
        status: '',
        isAutomated: '',
        version: '',
        steps: '',
      },
    ];
    const ws = XLSX.utils.json_to_sheet(templateData);
    ws['!cols'] = [
      { wch: 30 }, { wch: 50 }, { wch: 30 }, { wch: 15 },
      { wch: 12 }, { wch: 10 }, { wch: 15 }, { wch: 10 }, { wch: 80 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Test Cases');
    XLSX.writeFile(wb, 'test_case_upload_template.xlsx');
  };

  const handleUpload = async () => {
    if (!uploadProjectId) {
      enqueueSnackbar('Please select a project', { variant: 'warning' });
      return;
    }
    if (!uploadEpicId) {
      enqueueSnackbar('Please select an epic', { variant: 'warning' });
      return;
    }
    if (!uploadUserStoryId) {
      enqueueSnackbar('Please select a user story', { variant: 'warning' });
      return;
    }
    if (!uploadFile) {
      enqueueSnackbar('Please select a file', { variant: 'warning' });
      return;
    }
    setUploading(true);
    try {
      const res = await testCaseService.bulkUpload(uploadProjectId, uploadFile, uploadEpicId || undefined, uploadUserStoryId || undefined);
      const data = res?.data;
      if (data?.failed > 0) {
        enqueueSnackbar(`${data.created} created, ${data.failed} failed`, { variant: 'warning' });
      } else {
        enqueueSnackbar(`${data?.created || 0} test case(s) uploaded successfully`, { variant: 'success' });
      }
      setUploadDialogOpen(false);
      setUploadFile(null);
      setUploadProjectId('');
      setUploadEpicId('');
      setUploadUserStoryId('');
      fetchTestCases();
    } catch (err: any) {
      enqueueSnackbar(err.response?.data?.message || 'Upload failed', { variant: 'error' });
    } finally {
      setUploading(false);
    }
  };

  const priorityStyle = (priority: string): { bg: string; color: string; border: string } => {
    const styles: Record<string, { bg: string; color: string; border: string }> = {
      critical: { bg: 'rgba(239, 68, 68, 0.1)',   color: '#ef4444', border: 'rgba(239, 68, 68, 0.3)' },
      high:     { bg: 'rgba(245, 158, 11, 0.1)',  color: '#d97706', border: 'rgba(245, 158, 11, 0.3)' },
      medium:   { bg: 'rgba(59, 130, 246, 0.1)',  color: '#3b82f6', border: 'rgba(59, 130, 246, 0.3)' },
      low:      { bg: 'rgba(16, 185, 129, 0.1)',  color: '#10b981', border: 'rgba(16, 185, 129, 0.3)' },
    };
    return styles[priority] || { bg: 'rgba(107, 114, 128, 0.08)', color: '#6b7280', border: 'rgba(107, 114, 128, 0.2)' };
  };

  const statusStyle = (status: string): { bg: string; color: string; border: string } => {
    const styles: Record<string, { bg: string; color: string; border: string }> = {
      passed:      { bg: 'rgba(16, 185, 129, 0.1)',  color: '#10b981', border: 'rgba(16, 185, 129, 0.3)' },
      approved:    { bg: 'rgba(16, 185, 129, 0.1)',  color: '#10b981', border: 'rgba(16, 185, 129, 0.3)' },
      failed:      { bg: 'rgba(239, 68, 68, 0.1)',   color: '#ef4444', border: 'rgba(239, 68, 68, 0.3)' },
      blocked:     { bg: 'rgba(245, 158, 11, 0.1)',  color: '#d97706', border: 'rgba(245, 158, 11, 0.3)' },
      in_progress: { bg: 'rgba(59, 130, 246, 0.1)',  color: '#3b82f6', border: 'rgba(59, 130, 246, 0.3)' },
      skipped:     { bg: 'rgba(107, 114, 128, 0.1)', color: '#6b7280', border: 'rgba(107, 114, 128, 0.3)' },
      draft:       { bg: 'rgba(26, 35, 126, 0.08)',  color: 'secondary.main', border: 'rgba(26, 35, 126, 0.2)' },
      review:      { bg: 'rgba(245, 124, 0, 0.1)',  color: '#f57c00', border: 'rgba(245, 124, 0, 0.3)' },
      deprecated:  { bg: 'rgba(107, 114, 128, 0.08)',color: '#9ca3af', border: 'rgba(107, 114, 128, 0.2)' },
    };
    return styles[status] || { bg: 'rgba(107, 114, 128, 0.08)', color: '#6b7280', border: 'rgba(107, 114, 128, 0.2)' };
  };

  const columns: GridColDef[] = [
    { field: 'id', headerName: 'ID', width: 70 },
    { field: 'test_case_id', headerName: 'Test Case ID', width: 150 },
    { field: 'project_code', headerName: 'Project Code', width: 120 },
    {
      field: 'project_name',
      headerName: 'Project',
      width: 180,
      renderCell: (params) => {
        const inactive = params.row.project_is_active === false;
        return (
          <Box display="flex" alignItems="center" gap={0.5} sx={{ pt: '4px' }}>
            <Typography variant="body2" sx={inactive ? { color: '#ef4444', fontWeight: 600 } : {}}>
              {params.value || '—'}
            </Typography>
            {inactive && (
              <Chip
                label="Inactive"
                size="small"
                sx={{
                  fontSize: 10,
                  height: 20,
                  fontWeight: 600,
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  color: '#ef4444',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                }}
              />
            )}
          </Box>
        );
      },
    },
    { field: 'epic_title', headerName: 'Epic', width: 160 },
    { field: 'user_story_title', headerName: 'User Story', width: 180 },
    { field: 'title', headerName: 'Title', flex: 1, minWidth: 200 },
    { field: 'type', headerName: 'Type', width: 120 },
    {
      field: 'priority',
      headerName: 'Priority',
      width: 110,
      renderCell: (params) => {
        const p = priorityStyle(params.value);
        const label = (params.value || '').charAt(0).toUpperCase() + (params.value || '').slice(1);
        return (
          <Chip
            label={label}
            size="small"
            sx={{
              fontWeight: 600,
              backgroundColor: p.bg,
              color: p.color,
              border: `1px solid ${p.border}`,
            }}
          />
        );
      },
    },
    {
      field: 'status',
      headerName: 'Status',
      width: 110,
      renderCell: (params) => {
        const s = statusStyle(params.value);
        const label = (params.value || '').replace('_', ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
        return (
          <Chip
            label={label}
            size="small"
            sx={{
              fontWeight: 600,
              backgroundColor: s.bg,
              color: s.color,
              border: `1px solid ${s.border}`,
            }}
          />
        );
      },
    },
    {
      field: 'isAutomated',
      headerName: 'Automated',
      width: 100,
      renderCell: (params) => (params.value ? 'Yes' : 'No'),
    },
    { field: 'version', headerName: 'Ver', width: 60 },
    { field: 'assigned_to_name', headerName: 'Assignee', width: 130 },
    { field: 'created_by_name', headerName: 'Created By', width: 130 },
    {
      field: 'created_at',
      headerName: 'Created',
      width: 120,
      renderCell: (params) => {
        if (!params.value) return '—';
        try { return format(new Date(params.value), 'MMM dd, yyyy'); } catch { return '—'; }
      },
    },
    ...(userCanEdit
      ? [
          {
            field: 'actions',
            headerName: 'Actions',
            width: 280,
            sortable: false,
            renderCell: (params: any) => (
              <Box display="flex" gap={0.5}>
                <Button size="small" onClick={(e) => {
                  e.stopPropagation();
                  const row = params.row;
                  setEditingTestCaseId(row.test_case_id || '');
                  setEditingCase({
                    id: row.id,
                    title: row.title || '',
                    description: row.description || '',
                    preconditions: row.preconditions || '',
                    type: row.type || 'functional',
                    priority: row.priority || 'medium',
                    status: row.status || 'draft',
                    isAutomated: row.isAutomated ?? (row.automation_status === 'Automated') ?? false,
                    version: row.version ?? 1,
                    projectId: (() => {
                      const pid = row.projectId || row.project_id;
                      return pid && projects.some((p) => p.id === pid && p.is_active !== false) ? pid : '';
                    })(),
                    epic_id: (() => {
                      const pid = row.projectId || row.project_id;
                      const isActive = pid && projects.some((p) => p.id === pid && p.is_active !== false);
                      return isActive ? (row.epic_id || '') : '';
                    })(),
                    user_story_id: (() => {
                      const pid = row.projectId || row.project_id;
                      const isActive = pid && projects.some((p) => p.id === pid && p.is_active !== false);
                      return isActive ? (row.user_story_id || '') : '';
                    })(),
                    moduleId: row.moduleId || row.module_id || null,
                    assigned_to: row.assigned_to || '',
                    tags: row.tags || [],
                    steps: Array.isArray(row.steps)
                      ? row.steps.map((s: any, i: number) => ({
                          id: s.id || 0,
                          testCaseId: s.testCaseId || s.test_case_id || row.id,
                          stepNumber: s.stepNumber ?? s.step_number ?? i + 1,
                          action: s.action || '',
                          expectedResult: s.expectedResult ?? s.expected_result ?? '',
                          testData: s.testData ?? s.test_data ?? '',
                        }))
                      : [],
                  } as any);
                  setDialogOpen(true);
                }}>
                  Edit
                </Button>
                <Button size="small" onClick={(e) => { e.stopPropagation(); handleClone(params.row.id); }}>
                  Clone
                </Button>
                {userCanApprove && params.row.status === 'review' && (
                  <Button size="small" color="success" onClick={(e) => { e.stopPropagation(); handleApprove(params.row.id); }}>
                    Approve
                  </Button>
                )}
                <Button size="small" color="error" onClick={(e) => { e.stopPropagation(); setDeleteId(params.row.id); setDeleteTestCaseId(params.row.test_case_id || ''); setDeleteDialogOpen(true); }}>
                  Delete
                </Button>
              </Box>
            ),
          } as GridColDef,
        ]
      : []),
  ];

  return (
    <Box>
      <Typography
        variant="h4"
        fontWeight={600}
        sx={(theme) => ({
          color: theme.palette.mode === 'dark' ? theme.palette.text.primary : theme.palette.secondary.main,
          mb: 2,
        })}
      >
        Test Cases
      </Typography>

      {/* Action Buttons */}
      <Box display="flex" justifyContent="flex-end" gap={1} mb={2}>
        {userCanEdit && (
          <Button
            variant="outlined"
            startIcon={<UploadIcon />}
            onClick={() => setUploadDialogOpen(true)}
            sx={{ whiteSpace: 'nowrap' }}
          >
            Upload Test Cases
          </Button>
        )}
        {userCanEdit && (
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            sx={{ whiteSpace: 'nowrap' }}
            onClick={() => {
              setEditingTestCaseId('');
              setEditingCase({
                title: '',
                description: '',
                preconditions: '',
                type: 'functional',
                priority: 'medium',
                status: 'draft',
                isAutomated: false,
                assigned_to: '',
                steps: [],
                tags: [],
              } as any);
              setDialogOpen(true);
            }}
          >
            New Test Case
          </Button>
        )}
      </Box>

      {/* Filters */}
      <Box display="flex" gap={2} flexWrap="wrap" alignItems="center" mb={2}>
        <FilterIcon color="action" />
        <TextField
          size="small"
          placeholder="Search title..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          InputProps={{ startAdornment: <SearchIcon sx={{ mr: 1, color: 'action.active' }} /> }}
          sx={{ minWidth: 220 }}
        />
        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel sx={{ fontWeight: 600, color: 'text.primary', '&.Mui-focused': { color: 'primary.main' }, '&.MuiInputLabel-shrink': { fontWeight: 700, fontSize: '0.95rem' } }}>Project</InputLabel>
          <Select value={filterProjectId} onChange={(e) => { setFilterProjectId(e.target.value); setFilterEpicId(''); }} label="Project">
            <MenuItem value="">All</MenuItem>
            {projects.map((p) => (
              <MenuItem key={p.id} value={String(p.id)}>{p.code} - {p.name}{p.is_active === false ? ' (Inactive)' : ''}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel sx={{ fontWeight: 600, color: 'text.primary', '&.Mui-focused': { color: 'primary.main' }, '&.MuiInputLabel-shrink': { fontWeight: 700, fontSize: '0.95rem' } }}>Epic</InputLabel>
          <Select value={filterEpicId} onChange={(e) => setFilterEpicId(e.target.value)} label="Epic">
            <MenuItem value="">All</MenuItem>
            {(filterProjectId ? allEpics.filter((e) => e.project_id === filterProjectId) : allEpics).map((e) => (
              <MenuItem key={e.id} value={e.id}>{e.title}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 110 }}>
          <InputLabel sx={{ fontWeight: 600, color: 'text.primary', '&.Mui-focused': { color: 'primary.main' }, '&.MuiInputLabel-shrink': { fontWeight: 700, fontSize: '0.95rem' } }}>Status</InputLabel>
          <Select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} label="Status">
            <MenuItem value="">All</MenuItem>
            {EDITABLE_STATUSES.map((s) => {
              const labels: Record<string, string> = {
                draft: 'Draft',
                blocked: 'Blocked',
                in_progress: 'In Progress',
                skipped: 'Skipped',
                ready_for_review: 'Ready for Review',
                in_progress_review: 'In Progress Review',
                ready_to_test: 'Ready to Test',
              };
              return <MenuItem key={s} value={s}>{labels[s] || s}</MenuItem>;
            })}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 110 }}>
          <InputLabel sx={{ fontWeight: 600, color: 'text.primary', '&.Mui-focused': { color: 'primary.main' }, '&.MuiInputLabel-shrink': { fontWeight: 700, fontSize: '0.95rem' } }}>Type</InputLabel>
          <Select value={filterType} onChange={(e) => setFilterType(e.target.value)} label="Type">
            <MenuItem value="">All</MenuItem>
            {TYPES.map((t) => (
              <MenuItem key={t} value={t}>{t.replace(/\b\w/g, (c) => c.toUpperCase())}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 110 }}>
          <InputLabel sx={{ fontWeight: 600, color: 'text.primary', '&.Mui-focused': { color: 'primary.main' }, '&.MuiInputLabel-shrink': { fontWeight: 700, fontSize: '0.95rem' } }}>Priority</InputLabel>
          <Select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)} label="Priority">
            <MenuItem value="">All</MenuItem>
            {PRIORITIES.map((p) => (
              <MenuItem key={p} value={p}>{p.replace(/\b\w/g, (c) => c.toUpperCase())}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel sx={{ fontWeight: 600, color: 'text.primary', '&.Mui-focused': { color: 'primary.main' }, '&.MuiInputLabel-shrink': { fontWeight: 700, fontSize: '0.95rem' } }}>Automated</InputLabel>
          <Select value={filterAutomated} onChange={(e) => setFilterAutomated(e.target.value)} label="Automated">
            <MenuItem value="">All</MenuItem>
            <MenuItem value="Automated">Yes</MenuItem>
            <MenuItem value="Manual">No</MenuItem>
          </Select>
        </FormControl>
        {(searchQuery || filterProjectId || filterEpicId || filterStatus || filterType || filterPriority || filterAutomated) && (
          <Button
            size="small"
            startIcon={<ClearIcon />}
            onClick={() => {
              setSearchQuery('');
              setFilterProjectId('');
              setFilterEpicId('');
              setFilterStatus('');
              setFilterType('');
              setFilterPriority('');
              setFilterAutomated('');
            }}
          >
            Clear Filters
          </Button>
        )}
      </Box>

      {/* Bulk action bar — visible only when rows are selected. Same
          JIRA-style two-button layout as DefectsPage: a primary "Bulk
          update" opens the multi-field modal; "Delete" is destructive
          with its own confirm. */}
      {userCanEdit && selectedIds.length > 0 && (
        <Box
          role="toolbar"
          aria-label="Bulk actions"
          mb={1.5}
          px={2}
          py={1}
          display="flex"
          alignItems="center"
          gap={1.5}
          sx={{
            borderRadius: 2,
            backgroundColor: 'rgba(245, 124, 0, 0.08)',
            border: '1px solid rgba(245, 124, 0, 0.3)',
          }}
        >
          <Typography variant="body2" fontWeight={600}>
            {selectedIds.length} selected
          </Typography>
          <Button
            size="small"
            variant="contained"
            onClick={openBulkEdit}
            disabled={bulkBusy}
          >
            Bulk update…
          </Button>
          <Button
            size="small"
            variant="outlined"
            color="error"
            onClick={() => setBulkDeleteConfirm(true)}
            disabled={bulkBusy}
          >
            Delete
          </Button>
          <Box flexGrow={1} />
          <Button
            size="small"
            onClick={() => setSelectedIds([])}
            disabled={bulkBusy}
          >
            Clear
          </Button>
        </Box>
      )}

      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: 'block', mb: 1, fontStyle: 'italic' }}
      >
        Tip: double-click a row to open the test case.
      </Typography>
      <DataTable
        rows={testCases}
        columns={columns}
        totalRows={totalRows}
        loading={loading}
        paginationModel={paginationModel}
        onPaginationModelChange={setPaginationModel}
        onRowDoubleClick={({ id }) => navigate(`/test-cases/${id}`)}
        getRowId={(row) => row.id}
        checkboxSelection={userCanEdit}
        rowSelectionModel={selectedIds}
        onRowSelectionModelChange={setSelectedIds}
      />

      {/* Bulk-delete confirmation */}
      <ConfirmDialog
        open={bulkDeleteConfirm}
        title={`Delete ${selectedIds.length} test case(s)?`}
        message="This soft-deletes every selected test case and unlinks them from any test suites. The action is reversible only via direct DB access."
        confirmLabel="Delete"
        confirmColor="error"
        onCancel={() => setBulkDeleteConfirm(false)}
        onConfirm={handleBulkDelete}
      />

      <BulkEditDialog
        open={bulkEditOpen}
        onClose={() => setBulkEditOpen(false)}
        entityLabel="test case"
        entityPlural="test cases"
        selectionCount={selectedIds.length}
        bulkMax={BULK_MAX}
        fields={bulkFields}
        bulk={bulkEdit}
        busy={bulkBusy}
        onApply={handleBulkApply}
        result={bulkResult}
      />

      {/* Create/Edit Dialog */}
      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        maxWidth="md"
        fullWidth
        fullScreen={isMobile}
      >
        <DialogTitle sx={{ fontWeight: 600, color: 'secondary.main', display: 'flex', alignItems: 'center', gap: 1 }}>
          {editingCase.id ? 'Edit Test Case' : 'New Test Case'}
          {editingCase.id && editingTestCaseId && (
            <Chip label={editingTestCaseId} size="small" variant="outlined" sx={{ fontWeight: 700, fontSize: 12 }} />
          )}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth required error={dialogOpen && !editingCase.projectId}>
                <InputLabel>Project</InputLabel>
                <Select
                  value={editingCase.projectId ? String(editingCase.projectId) : ''}
                  onChange={(e) => setEditingCase((prev) => ({ ...prev, projectId: e.target.value, epic_id: '', user_story_id: '' }))}
                  label="Project"
                >
                  <MenuItem value="" disabled>— None —</MenuItem>
                  {projects.filter((p) => p.is_active !== false).map((p) => (
                    <MenuItem key={p.id} value={String(p.id)}>{p.code} - {p.name}</MenuItem>
                  ))}
                </Select>
                {dialogOpen && !editingCase.projectId && (
                  <FormHelperText>Project is required</FormHelperText>
                )}
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={3}>
              <FormControl fullWidth required disabled={!editingCase.projectId} error={dialogOpen && !!editingCase.projectId && !(editingCase as any).epic_id}>
                <InputLabel>Epic</InputLabel>
                <Select
                  value={(editingCase as any).epic_id || ''}
                  onChange={(e) => setEditingCase((prev) => ({ ...prev, epic_id: e.target.value, user_story_id: '' }))}
                  label="Epic"
                >
                  <MenuItem value="" disabled>— None —</MenuItem>
                  {allEpics.filter((ep) => ep.project_id === editingCase.projectId).map((ep) => (
                    <MenuItem key={ep.id} value={ep.id}>{ep.title}</MenuItem>
                  ))}
                </Select>
                {dialogOpen && !!editingCase.projectId && !(editingCase as any).epic_id && (
                  <FormHelperText>Epic is required</FormHelperText>
                )}
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={3}>
              <FormControl fullWidth required disabled={!(editingCase as any).epic_id} error={dialogOpen && !!(editingCase as any).epic_id && !(editingCase as any).user_story_id}>
                <InputLabel>User Story</InputLabel>
                <Select
                  value={(editingCase as any).user_story_id || ''}
                  onChange={(e) => setEditingCase((prev) => ({ ...prev, user_story_id: e.target.value }))}
                  label="User Story"
                >
                  <MenuItem value="" disabled>— None —</MenuItem>
                  {allStories.filter((s) => s.epic_id === (editingCase as any).epic_id).map((s) => (
                    <MenuItem key={s.id} value={s.id}>{s.title}</MenuItem>
                  ))}
                </Select>
                {dialogOpen && !!(editingCase as any).epic_id && !(editingCase as any).user_story_id && (
                  <FormHelperText>User Story is required</FormHelperText>
                )}
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Title"
                fullWidth
                required
                value={editingCase.title || ''}
                onChange={(e) => setEditingCase((prev) => ({ ...prev, title: e.target.value }))}
                error={
                  !!(dialogOpen &&
                  (!editingCase.title?.trim() ||
                    (!editingCase.id &&
                      editingCase.projectId &&
                      testCases.find(
                        (tc) =>
                          tc.title?.toLowerCase() === (editingCase.title || '').trim().toLowerCase() &&
                          (tc.projectId || (tc as any).project_id) === editingCase.projectId
                      ))))
                }
                helperText={
                  dialogOpen && !editingCase.title?.trim()
                    ? 'Title is required'
                    : !editingCase.id &&
                        editingCase.projectId &&
                        testCases.find(
                          (tc) =>
                            tc.title?.toLowerCase() === (editingCase.title || '').trim().toLowerCase() &&
                            (tc.projectId || (tc as any).project_id) === editingCase.projectId
                        )
                      ? 'A test case with this title already exists in the selected project'
                      : ''
                }
              />
            </Grid>
            <Grid item xs={12} sm={3}>
              <FormControl fullWidth required error={dialogOpen && !editingCase.type}>
                <InputLabel>Type</InputLabel>
                <Select
                  value={editingCase.type || 'functional'}
                  onChange={(e) => setEditingCase((prev) => ({ ...prev, type: e.target.value as TestCaseType }))}
                  label="Type"
                >
                  {TYPES.map((t) => (
                    <MenuItem key={t} value={t}>{t.replace(/\b\w/g, (c) => c.toUpperCase())}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={3}>
              <FormControl fullWidth required error={dialogOpen && !editingCase.priority}>
                <InputLabel>Priority</InputLabel>
                <Select
                  value={editingCase.priority || 'medium'}
                  onChange={(e) => setEditingCase((prev) => ({ ...prev, priority: e.target.value as TestCasePriority }))}
                  label="Priority"
                >
                  {PRIORITIES.map((p) => (
                    <MenuItem key={p} value={p}>{p.replace(/\b\w/g, (c) => c.toUpperCase())}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={3}>
              <FormControl fullWidth required error={dialogOpen && !editingCase.status}>
                <InputLabel>Status</InputLabel>
                <Select
                  value={editingCase.status || 'draft'}
                  onChange={(e) => setEditingCase((prev) => ({ ...prev, status: e.target.value as TestCaseStatus }))}
                  label="Status"
                >
                  {EDITABLE_STATUSES.map((s) => {
                    const labels: Record<string, string> = {
                      draft: 'Draft',
                      blocked: 'Blocked',
                      in_progress: 'In Progress',
                      skipped: 'Skipped',
                      ready_for_review: 'Ready for Review',
                      in_progress_review: 'In Progress Review',
                      ready_to_test: 'Ready to Test',
                    };
                    return <MenuItem key={s} value={s}>{labels[s] || s}</MenuItem>;
                  })}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={6} sm={3}>
              <TextField
                label="Version"
                type="number"
                fullWidth
                value={editingCase.version ?? 1}
                onChange={(e) => setEditingCase((prev) => ({ ...prev, version: parseInt(e.target.value, 10) || 1 }))}
                inputProps={{ min: 1 }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Assignee</InputLabel>
                <Select
                  value={(editingCase as any).assigned_to || ''}
                  onChange={(e) =>
                    setEditingCase((prev) => ({ ...prev, assigned_to: e.target.value } as any))
                  }
                  label="Assignee"
                >
                  <MenuItem value="">— None —</MenuItem>
                  {users.map((u) => (
                    <MenuItem key={u.id} value={u.id}>
                      {u.full_name || u.email}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={6} sm={3}>
              <FormControlLabel
                control={
                  <Switch
                    checked={editingCase.isAutomated || false}
                    onChange={(e) => setEditingCase((prev) => ({ ...prev, isAutomated: e.target.checked }))}
                  />
                }
                label="Automated"
                sx={{ mt: 1 }}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Description"
                fullWidth
                multiline
                rows={3}
                value={editingCase.description || ''}
                onChange={(e) => setEditingCase((prev) => ({ ...prev, description: e.target.value }))}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Preconditions"
                fullWidth
                multiline
                rows={2}
                value={editingCase.preconditions || ''}
                onChange={(e) => setEditingCase((prev) => ({ ...prev, preconditions: e.target.value }))}
              />
            </Grid>
            {/* Steps */}
            <Grid item xs={12}>
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                <Typography variant="subtitle1" fontWeight={500}>
                  Test Steps
                </Typography>
                <Button size="small" startIcon={<AddIcon />} onClick={handleAddStep}>
                  Add Step
                </Button>
              </Box>
              {editingCase.steps.map((step, idx) => (
                <Box key={idx} display="flex" gap={1} mb={1} alignItems="flex-start">
                  <Typography variant="body2" sx={{ mt: 2, minWidth: 30 }}>
                    #{step.stepNumber}
                  </Typography>
                  <TextField
                    label="Action"
                    size="small"
                    fullWidth
                    required
                    value={step.action || ''}
                    onChange={(e) => handleStepChange(idx, 'action', e.target.value)}
                    error={dialogOpen && !step.action?.trim()}
                    helperText={dialogOpen && !step.action?.trim() ? 'Required' : ''}
                  />
                  <TextField
                    label="Expected Result"
                    size="small"
                    fullWidth
                    required
                    value={step.expectedResult || ''}
                    onChange={(e) => handleStepChange(idx, 'expectedResult', e.target.value)}
                    error={dialogOpen && !step.expectedResult?.trim()}
                    helperText={dialogOpen && !step.expectedResult?.trim() ? 'Required' : ''}
                  />
                  <TextField
                    label="Test Data"
                    size="small"
                    sx={{ minWidth: 150 }}
                    value={step.testData || ''}
                    onChange={(e) => handleStepChange(idx, 'testData', e.target.value)}
                  />
                  <IconButton
                    onClick={() => handleRemoveStep(idx)}
                    color="error"
                    sx={{ mt: 0.5 }}
                    aria-label={`Remove step ${idx + 1}`}
                  >
                    <DeleteIcon />
                  </IconButton>
                </Box>
              ))}
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={
              !editingCase.projectId ||
              !(editingCase as any).epic_id ||
              !(editingCase as any).user_story_id ||
              !editingCase.title?.trim() ||
              !editingCase.type ||
              !editingCase.priority ||
              !editingCase.status ||
              (editingCase.steps.length > 0 && editingCase.steps.some((s) => !s.action?.trim() || !s.expectedResult?.trim())) ||
              (!editingCase.id && !!testCases.find(
                (tc) =>
                  tc.title?.toLowerCase() === (editingCase.title || '').trim().toLowerCase() &&
                  (tc.projectId || (tc as any).project_id) === editingCase.projectId
              ))
            }
          >
            {editingCase.id ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={deleteDialogOpen}
        title="Delete Test Case"
        message={`Are you sure you want to delete test case${deleteTestCaseId ? ` ${deleteTestCaseId}` : ''}? This action cannot be undone.`}
        confirmLabel="Delete"
        confirmColor="error"
        onConfirm={handleDelete}
        onCancel={() => { setDeleteDialogOpen(false); setDeleteId(null); setDeleteTestCaseId(''); }}
      />

      {/* Upload Test Cases Dialog */}
      <Dialog open={uploadDialogOpen} onClose={() => { setUploadDialogOpen(false); setUploadFile(null); setUploadProjectId(''); setUploadEpicId(''); setUploadUserStoryId(''); }} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 600, color: 'secondary.main' }}>Upload Test Cases</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid item xs={12}>
              <FormControl fullWidth required error={uploadDialogOpen && !uploadProjectId}>
                <InputLabel>Project</InputLabel>
                <Select
                  value={uploadProjectId}
                  onChange={(e) => { setUploadProjectId(e.target.value); setUploadEpicId(''); setUploadUserStoryId(''); }}
                  label="Project"
                >
                  <MenuItem value="" disabled>— Select Project —</MenuItem>
                  {projects.filter((p) => p.is_active !== false).map((p) => (
                    <MenuItem key={p.id} value={String(p.id)}>{p.code} - {p.name}</MenuItem>
                  ))}
                </Select>
                {uploadDialogOpen && !uploadProjectId && (
                  <FormHelperText>Project is required</FormHelperText>
                )}
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth required disabled={!uploadProjectId} error={uploadDialogOpen && !!uploadProjectId && !uploadEpicId}>
                <InputLabel>Epic</InputLabel>
                <Select
                  value={uploadEpicId}
                  onChange={(e) => { setUploadEpicId(e.target.value); setUploadUserStoryId(''); }}
                  label="Epic"
                >
                  <MenuItem value="" disabled>— None —</MenuItem>
                  {allEpics.filter((ep) => ep.project_id === uploadProjectId).map((ep) => (
                    <MenuItem key={ep.id} value={ep.id}>{ep.title}</MenuItem>
                  ))}
                </Select>
                {uploadDialogOpen && !!uploadProjectId && !uploadEpicId && (
                  <FormHelperText>Epic is required</FormHelperText>
                )}
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth required disabled={!uploadEpicId} error={uploadDialogOpen && !!uploadEpicId && !uploadUserStoryId}>
                <InputLabel>User Story</InputLabel>
                <Select
                  value={uploadUserStoryId}
                  onChange={(e) => setUploadUserStoryId(e.target.value)}
                  label="User Story"
                >
                  <MenuItem value="" disabled>— None —</MenuItem>
                  {allStories.filter((s) => s.epic_id === uploadEpicId).map((s) => (
                    <MenuItem key={s.id} value={s.id}>{s.title}</MenuItem>
                  ))}
                </Select>
                {uploadDialogOpen && !!uploadEpicId && !uploadUserStoryId && (
                  <FormHelperText>User Story is required</FormHelperText>
                )}
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <Button
                variant="text"
                startIcon={<DownloadIcon />}
                onClick={handleDownloadTemplate}
                sx={{ mb: 1, textTransform: 'none' }}
              >
                Download Excel Template
              </Button>
              <Box
                sx={{
                  border: '2px dashed',
                  borderColor: uploadFile ? 'success.main' : 'divider',
                  borderRadius: 2,
                  p: 3,
                  textAlign: 'center',
                  backgroundColor: uploadFile ? 'rgba(16, 185, 129, 0.04)' : 'transparent',
                  cursor: 'pointer',
                  '&:hover': { borderColor: 'primary.main', backgroundColor: 'rgba(245, 124, 0, 0.04)' },
                }}
                onClick={() => document.getElementById('tc-upload-input')?.click()}
              >
                <input
                  id="tc-upload-input"
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) setUploadFile(file);
                    e.target.value = '';
                  }}
                />
                <UploadIcon sx={{ fontSize: 40, color: uploadFile ? 'success.main' : 'action.disabled', mb: 1 }} />
                <Typography variant="body1" color={uploadFile ? 'success.main' : 'text.secondary'} fontWeight={500}>
                  {uploadFile ? uploadFile.name : 'Click to select Excel or CSV file'}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Supported formats: .xlsx, .xls, .csv
                </Typography>
              </Box>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setUploadDialogOpen(false); setUploadFile(null); setUploadProjectId(''); }}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleUpload}
            disabled={!uploadProjectId || !uploadEpicId || !uploadUserStoryId || !uploadFile || uploading}
            startIcon={uploading ? undefined : <UploadIcon />}
          >
            {uploading ? 'Uploading...' : 'Upload'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default TestCasesPage;
