import React, { useEffect, useState, useCallback } from 'react';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import useIsMobile from '../hooks/useIsMobile';
import {
  Box,
  Button,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Grid,
  Checkbox,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  IconButton,
  InputAdornment,
  Divider,
  Switch,
  FormControlLabel,
  FormHelperText,
  Tooltip,
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Search as SearchIcon,
  FilterList as FilterIcon,
  Clear as ClearIcon,
  Close as CloseIcon,
  Edit as EditIcon,
} from '@mui/icons-material';
import { GridColDef, GridPaginationModel } from '../components/common/DataTable';
import { useSnackbar } from 'notistack';
import DataTable from '../components/common/DataTable';
import ConfirmDialog from '../components/common/ConfirmDialog';
import ViewDialog from '../components/common/ViewDialog';
import testSuiteService from '../services/testSuiteService';
import testCaseService from '../services/testCaseService';
import epicService from '../services/epicService';
import userStoryService from '../services/userStoryService';
import { Project } from '../types';
import { useAuth } from '../hooks/useAuth';
import { canEdit } from '../utils/roleGuard';
import { format } from 'date-fns';
import { useProjects } from '../contexts/ProjectContext';

interface SuiteRow {
  id: string;
  name: string;
  description: string;
  project_id: string;
  test_suite_cases?: any[];
  created_at?: string;
  [key: string]: any;
}

interface TestCaseOption {
  id: string;
  test_case_id?: string;
  title: string;
  type: string;
  priority: string;
  status: string;
  epic_title?: string;
  user_story_title?: string;
}

const TestSuitesPage: React.FC = () => {
  const { enqueueSnackbar } = useSnackbar();
  const { user } = useAuth();
  const userCanEdit = user ? canEdit(user.role) : false;
  const isMobile = useIsMobile();

  const { projects } = useProjects();
  const [suites, setSuites] = useState<SuiteRow[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [loading, setLoading] = useState(true);
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({
    page: 0,
    pageSize: 10,
  });

  // Filters
  const [filterProjectId, setFilterProjectId] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Epics & User Stories for dropdowns
  const [allEpics, setAllEpics] = useState<{ id: string; title: string; project_id: string }[]>([]);
  const [allStories, setAllStories] = useState<{ id: string; title: string; epic_id: string; project_id: string }[]>([]);

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

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSuite, setEditingSuite] = useState<{
    id?: string;
    name: string;
    description: string;
    projectId: string;
    epicId: string;
    userStoryId: string;
    isActive: boolean;
    selectedTestCaseIds: string[];
  }>({
    name: '',
    description: '',
    projectId: '',
    epicId: '',
    userStoryId: '',
    isActive: true,
    selectedTestCaseIds: [],
  });

  // Available test cases for selection
  const [availableTestCases, setAvailableTestCases] = useState<TestCaseOption[]>([]);
  const [tcSearchQuery, setTcSearchQuery] = useState('');

  // Read-only detail dialog (opened via row double-click). Fetches the
  // suite by id on open so the included test cases come back with titles
  // — list rows include the junction rows but not always the hydrated
  // case payload.
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [viewSuite, setViewSuite] = useState<any>(null);
  const [viewSuiteCases, setViewSuiteCases] = useState<any[]>([]);
  const [viewLoading, setViewLoading] = useState(false);

  // Delete
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // ── Bulk operations (JIRA-style) ───────────────────────────────────────
  // Suites have a much simpler bulk surface than defects/test-cases:
  // there's no field-by-field edit because suite metadata (name,
  // description) is not the kind of thing you mass-update. The only
  // useful bulk ops are Activate / Deactivate and Delete — surfaced
  // inline on the action bar.
  const [selectedSuiteIds, setSelectedSuiteIds] = useState<string[]>([]);
  const [suiteBulkBusy, setSuiteBulkBusy] = useState(false);
  const [suiteBulkDeleteConfirm, setSuiteBulkDeleteConfirm] = useState(false);

  // Fetch suites
  const fetchSuites = useCallback(async () => {
    setLoading(true);
    try {
      const res = await testSuiteService.getAll({
        page: paginationModel.page + 1,
        pageSize: paginationModel.pageSize,
        projectId: filterProjectId || undefined,
        isActive: filterStatus === '' ? undefined : filterStatus === 'true',
        search: searchQuery || undefined,
      });
      const apiData = (res as any)?.data;
      if (Array.isArray(apiData)) {
        setSuites(apiData[0] || []);
        setTotalRows(apiData[1] || 0);
      } else {
        setSuites([]);
        setTotalRows(0);
      }
    } catch {
      enqueueSnackbar('Failed to load test suites', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [paginationModel, filterProjectId, filterStatus, searchQuery, enqueueSnackbar]);

  useEffect(() => {
    fetchSuites();
  }, [fetchSuites]);

  useAutoRefresh(fetchSuites, [paginationModel, filterProjectId, filterStatus, searchQuery]);

  // Load test cases when project changes in dialog
  const fetchTestCases = useCallback(async (projectId: string, epicId?: string, userStoryId?: string) => {
    if (!projectId) {
      setAvailableTestCases([]);
      return;
    }
    try {
      const params: any = { pageSize: 100, projectId };
      if (epicId) params.epicId = epicId;
      if (userStoryId) params.userStoryId = userStoryId;
      const res = await testCaseService.getAll(params);
      const apiData = (res as any)?.data;
      if (Array.isArray(apiData)) {
        setAvailableTestCases(
          (apiData[0] || []).map((tc: any) => ({
            id: tc.id,
            test_case_id: tc.test_case_id || '',
            title: tc.title,
            type: tc.type,
            priority: tc.priority,
            status: tc.status,
            epic_title: tc.epic_title || tc.epicTitle || '',
            user_story_title: tc.user_story_title || tc.userStoryTitle || '',
          }))
        );
      }
    } catch {
      setAvailableTestCases([]);
    }
  }, []);

  // Open New dialog
  const handleNewSuite = () => {
    setEditingSuite({
      name: '',
      description: '',
      projectId: '',
      epicId: '',
      userStoryId: '',
      isActive: true,
      selectedTestCaseIds: [],
    });
    setAvailableTestCases([]);
    setTcSearchQuery('');
    setDialogOpen(true);
  };

  // Open Edit dialog — fetch the suite's detail to get its current test cases
  const handleEditSuite = async (row: SuiteRow) => {
    try {
      const detail = await testSuiteService.getById(row.id);
      const existingCaseIds = (detail?.test_suite_cases || []).map(
        (sc: any) => sc.test_case_id || sc.test_case?.id
      ).filter(Boolean);

      const rawPid = detail?.project_id || row.project_id || '';
      const projectId = rawPid && projects.some((p) => String(p.id) === String(rawPid) && p.is_active !== false) ? rawPid : '';

      // Fetch available test cases first to filter out deleted ones
      let validCaseIds = existingCaseIds;
      if (projectId) {
        const eid = projectId ? (detail?.epic_id || '') : '';
        const sid = projectId ? (detail?.user_story_id || '') : '';
        const res = await testCaseService.getAll({ pageSize: 100, projectId, epicId: eid || undefined, userStoryId: sid || undefined });
        const apiData = (res as any)?.data;
        if (Array.isArray(apiData)) {
          const availableIds = (apiData[0] || []).map((tc: any) => tc.id);
          validCaseIds = existingCaseIds.filter((id: string) => availableIds.includes(id));
          setAvailableTestCases(
            (apiData[0] || []).map((tc: any) => ({
              id: tc.id,
              test_case_id: tc.test_case_id || '',
              title: tc.title,
              type: tc.type,
              priority: tc.priority,
              status: tc.status,
              epic_title: tc.epic_title || tc.epicTitle || '',
              user_story_title: tc.user_story_title || tc.userStoryTitle || '',
            }))
          );
        }
      }

      setEditingSuite({
        id: row.id,
        name: detail?.name || row.name || '',
        description: detail?.description || row.description || '',
        projectId,
        epicId: projectId ? (detail?.epic_id || '') : '',
        userStoryId: projectId ? (detail?.user_story_id || '') : '',
        isActive: detail?.is_active ?? row.is_active ?? true,
        selectedTestCaseIds: validCaseIds,
      });
      setTcSearchQuery('');
      setDialogOpen(true);
    } catch {
      enqueueSnackbar('Failed to load suite details', { variant: 'error' });
    }
  };

  // Toggle test case selection
  const handleToggleTestCase = (testCaseId: string) => {
    setEditingSuite((prev) => {
      const ids = prev.selectedTestCaseIds;
      if (ids.includes(testCaseId)) {
        return { ...prev, selectedTestCaseIds: ids.filter((id) => id !== testCaseId) };
      }
      return { ...prev, selectedTestCaseIds: [...ids, testCaseId] };
    });
  };

  // Save
  const handleSave = async () => {
    if (!editingSuite.projectId) {
      enqueueSnackbar('Project is required', { variant: 'warning' });
      return;
    }
    if (!editingSuite.name.trim()) {
      enqueueSnackbar('Suite Title is required', { variant: 'warning' });
      return;
    }
    if (!editingSuite.id) {
      const duplicate = suites.find(
        (s) =>
          s.name?.toLowerCase() === editingSuite.name.trim().toLowerCase() &&
          s.project_id === editingSuite.projectId
      );
      if (duplicate) {
        enqueueSnackbar('A suite with this title already exists in the selected project', { variant: 'warning' });
        return;
      }
    }
    try {
      const payload: Record<string, any> = {
        name: editingSuite.name.trim(),
        description: editingSuite.description || null,
        project_id: editingSuite.projectId,
        epic_id: editingSuite.epicId || null,
        user_story_id: editingSuite.userStoryId || null,
        is_active: editingSuite.isActive,
        test_case_ids: editingSuite.selectedTestCaseIds,
      };

      if (editingSuite.id) {
        await testSuiteService.update(editingSuite.id, payload);
        enqueueSnackbar('Suite updated', { variant: 'success' });
      } else {
        await testSuiteService.create(payload);
        enqueueSnackbar('Suite created', { variant: 'success' });
      }
      setDialogOpen(false);
      fetchSuites();
    } catch (err: any) {
      enqueueSnackbar(err.response?.data?.message || 'Failed to save suite', {
        variant: 'error',
      });
    }
  };

  // ── Bulk handlers ────────────────────────────────────────────────────
  const reportBulkResult = (
    label: string,
    r: { succeeded: string[]; failed: { id: string; error: string }[] },
  ) => {
    if (r.succeeded.length > 0) {
      enqueueSnackbar(`${r.succeeded.length} suite(s) ${label}`, { variant: 'success' });
    }
    if (r.failed.length > 0) {
      enqueueSnackbar(
        `${r.failed.length} suite(s) skipped: ${r.failed[0].error}`,
        { variant: 'warning' },
      );
    }
  };

  const handleSuiteBulkSetActive = async (isActive: boolean) => {
    if (selectedSuiteIds.length === 0) return;
    setSuiteBulkBusy(true);
    try {
      const r = await testSuiteService.bulkSetActive(selectedSuiteIds, isActive);
      reportBulkResult(isActive ? 'activated' : 'deactivated', r);
      setSelectedSuiteIds([]);
      fetchSuites();
    } catch {
      enqueueSnackbar('Bulk update failed', { variant: 'error' });
    } finally {
      setSuiteBulkBusy(false);
    }
  };

  const handleSuiteBulkDelete = async () => {
    if (selectedSuiteIds.length === 0) return;
    setSuiteBulkBusy(true);
    try {
      const r = await testSuiteService.bulkDelete(selectedSuiteIds);
      reportBulkResult('deleted', r);
      setSelectedSuiteIds([]);
      setSuiteBulkDeleteConfirm(false);
      fetchSuites();
    } catch {
      enqueueSnackbar('Bulk delete failed', { variant: 'error' });
    } finally {
      setSuiteBulkBusy(false);
    }
  };

  // Delete
  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await testSuiteService.delete(deleteId);
      enqueueSnackbar('Suite deleted', { variant: 'success' });
      setDeleteDialogOpen(false);
      setDeleteId(null);
      fetchSuites();
    } catch {
      enqueueSnackbar('Failed to delete suite', { variant: 'error' });
    }
  };

  // Filter test cases by search
  const filteredTestCases = availableTestCases.filter((tc) =>
    !tcSearchQuery || tc.title.toLowerCase().includes(tcSearchQuery.toLowerCase())
  );

  // Find project name for display
  const getProject = (projectId: string) => {
    return projects.find((proj) => String(proj.id) === String(projectId));
  };

  const DetailRow = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <Box sx={{ mb: 1.5 }}>
      <Typography
        variant="caption"
        fontWeight={700}
        color="text.secondary"
        sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}
      >
        {label}
      </Typography>
      <Typography variant="body2" sx={{ mt: 0.3, whiteSpace: 'pre-wrap' }}>
        {value || '—'}
      </Typography>
    </Box>
  );

  const formatDateTime = (raw: string | null | undefined) => {
    if (!raw) return null;
    try {
      return format(new Date(raw), 'MMM dd, yyyy HH:mm');
    } catch {
      return null;
    }
  };

  // Color codes mirror TestCasesPage so the same test case looks the
  // same wherever it appears (test cases list, suite detail, etc.).
  const FALLBACK_STYLE = { bg: 'rgba(107, 114, 128, 0.08)', color: '#6b7280', border: 'rgba(107, 114, 128, 0.2)' };

  const priorityStyle = (priority: string) => {
    const styles: Record<string, { bg: string; color: string; border: string }> = {
      critical: { bg: 'rgba(239, 68, 68, 0.1)',   color: '#ef4444', border: 'rgba(239, 68, 68, 0.3)' },
      high:     { bg: 'rgba(245, 158, 11, 0.1)',  color: '#d97706', border: 'rgba(245, 158, 11, 0.3)' },
      medium:   { bg: 'rgba(59, 130, 246, 0.1)',  color: '#3b82f6', border: 'rgba(59, 130, 246, 0.3)' },
      low:      { bg: 'rgba(16, 185, 129, 0.1)',  color: '#10b981', border: 'rgba(16, 185, 129, 0.3)' },
    };
    return styles[(priority || '').toLowerCase()] || FALLBACK_STYLE;
  };

  const statusStyle = (status: string) => {
    const styles: Record<string, { bg: string; color: string; border: string }> = {
      passed:      { bg: 'rgba(16, 185, 129, 0.1)',  color: '#10b981', border: 'rgba(16, 185, 129, 0.3)' },
      approved:    { bg: 'rgba(16, 185, 129, 0.1)',  color: '#10b981', border: 'rgba(16, 185, 129, 0.3)' },
      failed:      { bg: 'rgba(239, 68, 68, 0.1)',   color: '#ef4444', border: 'rgba(239, 68, 68, 0.3)' },
      blocked:     { bg: 'rgba(245, 158, 11, 0.1)',  color: '#d97706', border: 'rgba(245, 158, 11, 0.3)' },
      in_progress: { bg: 'rgba(59, 130, 246, 0.1)',  color: '#3b82f6', border: 'rgba(59, 130, 246, 0.3)' },
      skipped:     { bg: 'rgba(107, 114, 128, 0.1)', color: '#6b7280', border: 'rgba(107, 114, 128, 0.3)' },
      draft:       { bg: 'rgba(26, 35, 126, 0.08)',  color: '#1a237e', border: 'rgba(26, 35, 126, 0.2)' },
      review:      { bg: 'rgba(245, 124, 0, 0.1)',   color: '#f57c00', border: 'rgba(245, 124, 0, 0.3)' },
      deprecated:  { bg: 'rgba(107, 114, 128, 0.08)',color: '#9ca3af', border: 'rgba(107, 114, 128, 0.2)' },
    };
    return styles[(status || '').toLowerCase()] || FALLBACK_STYLE;
  };

  const typeStyle = (type: string) => {
    const styles: Record<string, { bg: string; color: string; border: string }> = {
      functional:     { bg: 'rgba(59, 130, 246, 0.1)', color: '#2563eb', border: 'rgba(59, 130, 246, 0.3)' },
      'non-functional': { bg: 'rgba(124, 58, 237, 0.1)', color: '#7c3aed', border: 'rgba(124, 58, 237, 0.3)' },
      smoke:          { bg: 'rgba(245, 158, 11, 0.1)', color: '#d97706', border: 'rgba(245, 158, 11, 0.3)' },
      regression:     { bg: 'rgba(239, 68, 68, 0.1)',  color: '#ef4444', border: 'rgba(239, 68, 68, 0.3)' },
      integration:    { bg: 'rgba(20, 184, 166, 0.1)', color: '#0d9488', border: 'rgba(20, 184, 166, 0.3)' },
      unit:           { bg: 'rgba(16, 185, 129, 0.1)', color: '#10b981', border: 'rgba(16, 185, 129, 0.3)' },
      performance:    { bg: 'rgba(245, 124, 0, 0.1)',  color: '#f57c00', border: 'rgba(245, 124, 0, 0.3)' },
      security:       { bg: 'rgba(220, 38, 38, 0.1)',  color: '#dc2626', border: 'rgba(220, 38, 38, 0.3)' },
      ui:             { bg: 'rgba(236, 72, 153, 0.1)', color: '#db2777', border: 'rgba(236, 72, 153, 0.3)' },
      api:            { bg: 'rgba(99, 102, 241, 0.1)', color: '#6366f1', border: 'rgba(99, 102, 241, 0.3)' },
      acceptance:     { bg: 'rgba(168, 85, 247, 0.1)', color: '#a855f7', border: 'rgba(168, 85, 247, 0.3)' },
    };
    return styles[(type || '').toLowerCase()] || FALLBACK_STYLE;
  };

  const titleCase = (raw: string) =>
    String(raw || '').replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());

  const handleViewSuite = async (row: SuiteRow) => {
    setViewSuite(row);
    setViewSuiteCases([]);
    setViewDialogOpen(true);
    // Junction rows from /test-suites only carry { id, test_case_id, ... }
    // — no title / epic / user story. Fetch the suite (for the canonical
    // junction list) and the project's enriched test cases (for title +
    // epic_title + user_story_title), then join.
    setViewLoading(true);
    try {
      const [detail, casesRes] = await Promise.all([
        testSuiteService.getById(row.id),
        testCaseService.getAll({ projectId: row.project_id, pageSize: 1000 }),
      ]);
      if (detail) {
        // Preserve list-row creator if detail's is missing (defensive —
        // older list rows had it populated; getById didn't until backend
        // fix landed).
        setViewSuite({
          ...detail,
          creator: detail.creator || (row as any).creator || null,
        });
      }

      const apiData = (casesRes as any)?.data;
      const allCases = Array.isArray(apiData) ? apiData[0] || [] : [];
      const byId = new Map<string, any>(allCases.map((tc: any) => [tc.id, tc]));

      const junctions = (detail?.test_suite_cases || row.test_suite_cases || []) as any[];
      const enriched = junctions.map((sc: any) => {
        const tc = byId.get(sc.test_case_id) || sc.test_case || {};
        return {
          ...sc,
          test_case: {
            id: tc.id,
            title: tc.title,
            test_case_id: tc.test_case_id,
            priority: tc.priority,
            status: tc.status,
            type: tc.type,
            epic_title: tc.epic_title || tc.epicTitle || null,
            user_story_title: tc.user_story_title || tc.userStoryTitle || null,
          },
        };
      });
      setViewSuiteCases(enriched);
    } catch {
      // Keep whatever we have so far; read-only view shouldn't spam errors.
    } finally {
      setViewLoading(false);
    }
  };

  const columns: GridColDef[] = [
    { field: 'id', headerName: 'ID', width: 90, renderCell: (params) => params.value ? String(params.value).substring(0, 8) : '—' },
    {
      field: 'project_code',
      headerName: 'Project Code',
      width: 120,
      renderCell: (params) => getProject(params.row.project_id)?.code || '—',
    },
    {
      field: 'project_id',
      headerName: 'Project',
      width: 160,
      renderCell: (params) => getProject(params.value)?.name || params.value,
    },
    { field: 'name', headerName: 'Title', flex: 1, minWidth: 200 },
    { field: 'description', headerName: 'Description', flex: 1, minWidth: 200 },
    {
      field: 'is_active',
      headerName: 'Status',
      width: 110,
      renderCell: (params) => (
        <Chip
          label={params.value ? 'Active' : 'Inactive'}
          size="small"
          sx={{
            fontWeight: 600,
            backgroundColor: params.value ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
            color: params.value ? '#10b981' : '#ef4444',
            border: `1px solid ${params.value ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
          }}
        />
      ),
    },
    {
      // `test_suite_cases` on the row is an array; pointing `field` at it
      // makes AG Grid infer an object cell type and emit warning #48.
      // Use a synthetic field name (not present in rowData) so AG Grid
      // sees no object — the renderer still reads the array off the row.
      field: 'test_suite_cases_count',
      headerName: 'Test Cases',
      width: 100,
      renderCell: (params) => {
        const arr = params.row?.test_suite_cases;
        const count = Array.isArray(arr) ? arr.length : 0;
        return (
          <Chip
            label={count}
            size="small"
            sx={{
              fontWeight: 600,
              backgroundColor: count > 0 ? 'rgba(245, 124, 0, 0.1)' : 'rgba(107,114,128,0.08)',
              color: count > 0 ? '#f57c00' : '#6b7280',
              border: `1px solid ${count > 0 ? 'rgba(245,124,0,0.3)' : 'rgba(107,114,128,0.2)'}`,
            }}
          />
        );
      },
    },
    {
      // Same pattern as TestRunsPage: point field at the primitive `created_by`
      // so AG Grid doesn't infer "object" from the nested `creator` User.
      field: 'created_by',
      headerName: 'Created By',
      width: 130,
      renderCell: (params) => params.row?.creator?.full_name || '—',
    },
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
            width: 180,
            sortable: false,
            renderCell: (params: any) => (
              <Box display="flex" gap={0.5}>
                <Button
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleEditSuite(params.row);
                  }}
                >
                  Edit
                </Button>
                <Button
                  size="small"
                  color="error"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteId(params.row.id);
                    setDeleteDialogOpen(true);
                  }}
                >
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
        Test Suites
      </Typography>

      {/* Filters */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
        <Box display="flex" gap={2} flexWrap="wrap" alignItems="center">
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
            <Select value={filterProjectId} onChange={(e) => setFilterProjectId(e.target.value)} label="Project">
              <MenuItem value="">All</MenuItem>
              {projects.map((p) => (
                <MenuItem key={p.id} value={String(p.id)}>{p.code} - {p.name}{p.is_active === false ? ' (Inactive)' : ''}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel sx={{ fontWeight: 600, color: 'text.primary', '&.Mui-focused': { color: 'primary.main' }, '&.MuiInputLabel-shrink': { fontWeight: 700, fontSize: '0.95rem' } }}>Status</InputLabel>
            <Select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} label="Status">
              <MenuItem value="">All</MenuItem>
              <MenuItem value="true">Active</MenuItem>
              <MenuItem value="false">Inactive</MenuItem>
            </Select>
          </FormControl>
          {(searchQuery || filterProjectId || filterStatus) && (
            <Button
              size="small"
              startIcon={<ClearIcon />}
              onClick={() => {
                setSearchQuery('');
                setFilterProjectId('');
                setFilterStatus('');
              }}
            >
              Clear Filters
            </Button>
          )}
        </Box>
        <Box display="flex" gap={1} flexShrink={0} alignItems="center">
          {userCanEdit && (
            <Button variant="contained" startIcon={<AddIcon />} onClick={handleNewSuite} sx={{ whiteSpace: 'nowrap' }}>
              New Suite
            </Button>
          )}
        </Box>
      </Box>

      {/* Bulk action bar — Activate / Deactivate / Delete are the only
          useful suite-level bulk ops; metadata edits make less sense
          here. Keep them inline (no per-field dialog). */}
      {userCanEdit && selectedSuiteIds.length > 0 && (
        <Box
          role="toolbar"
          aria-label="Suite bulk actions"
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
            {selectedSuiteIds.length} selected
          </Typography>
          <Button
            size="small"
            variant="outlined"
            color="success"
            onClick={() => handleSuiteBulkSetActive(true)}
            disabled={suiteBulkBusy}
          >
            Activate
          </Button>
          <Button
            size="small"
            variant="outlined"
            color="warning"
            onClick={() => handleSuiteBulkSetActive(false)}
            disabled={suiteBulkBusy}
          >
            Deactivate
          </Button>
          <Button
            size="small"
            variant="outlined"
            color="error"
            onClick={() => setSuiteBulkDeleteConfirm(true)}
            disabled={suiteBulkBusy}
          >
            Delete
          </Button>
          <Box flexGrow={1} />
          <Button
            size="small"
            onClick={() => setSelectedSuiteIds([])}
            disabled={suiteBulkBusy}
          >
            Clear
          </Button>
        </Box>
      )}

      <ConfirmDialog
        open={suiteBulkDeleteConfirm}
        title={`Delete ${selectedSuiteIds.length} suite(s)?`}
        message="This soft-deletes every selected test suite. The action is reversible only via direct DB access. Test cases attached to these suites are not affected."
        confirmLabel="Delete"
        confirmColor="error"
        onCancel={() => setSuiteBulkDeleteConfirm(false)}
        onConfirm={handleSuiteBulkDelete}
      />

      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: 'block', mb: 1, fontStyle: 'italic' }}
      >
        Tip: double-click a row to open suite details.
      </Typography>
      <DataTable
        rows={suites}
        columns={columns}
        totalRows={totalRows}
        loading={loading}
        paginationModel={paginationModel}
        onPaginationModelChange={setPaginationModel}
        getRowId={(row) => row.id}
        onRowDoubleClick={({ row }) => handleViewSuite(row as SuiteRow)}
        checkboxSelection={userCanEdit}
        rowSelectionModel={selectedSuiteIds}
        onRowSelectionModelChange={setSelectedSuiteIds}
      />

      {/* Create/Edit Dialog */}
      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        maxWidth="md"
        fullWidth
        fullScreen={isMobile}
      >
        <DialogTitle sx={{ fontWeight: 600, color: 'secondary.main' }}>{editingSuite.id ? 'Edit Test Suite' : 'New Test Suite'}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth required error={dialogOpen && !editingSuite.projectId}>
                <InputLabel>Project</InputLabel>
                <Select
                  value={editingSuite.projectId}
                  onChange={(e) => {
                    const pid = e.target.value;
                    setEditingSuite((prev) => ({
                      ...prev,
                      projectId: pid,
                      epicId: '',
                      userStoryId: '',
                      selectedTestCaseIds: [],
                    }));
                    fetchTestCases(pid);
                  }}
                  label="Project"
                >
                  <MenuItem value="" disabled>— None —</MenuItem>
                  {projects.filter((p) => p.is_active !== false).map((p) => (
                    <MenuItem key={p.id} value={String(p.id)}>
                      {p.code} - {p.name}
                    </MenuItem>
                  ))}
                </Select>
                {dialogOpen && !editingSuite.projectId && (
                  <FormHelperText>Project is required</FormHelperText>
                )}
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControlLabel
                control={
                  <Switch
                    checked={editingSuite.isActive}
                    onChange={(e) =>
                      setEditingSuite((prev) => ({ ...prev, isActive: e.target.checked }))
                    }
                  />
                }
                label="Active"
                sx={{ mt: 1 }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth disabled={!editingSuite.projectId}>
                <InputLabel>Epic</InputLabel>
                <Select
                  value={editingSuite.epicId}
                  onChange={(e) => {
                    const eid = e.target.value;
                    setEditingSuite((prev) => ({ ...prev, epicId: eid, userStoryId: '', selectedTestCaseIds: [] }));
                    fetchTestCases(editingSuite.projectId, eid || undefined);
                  }}
                  label="Epic"
                >
                  <MenuItem value="">— None —</MenuItem>
                  {allEpics.filter((ep) => ep.project_id === editingSuite.projectId).map((ep) => (
                    <MenuItem key={ep.id} value={ep.id}>{ep.title}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth disabled={!editingSuite.epicId}>
                <InputLabel>User Story</InputLabel>
                <Select
                  value={editingSuite.userStoryId}
                  onChange={(e) => {
                    const sid = e.target.value;
                    setEditingSuite((prev) => ({ ...prev, userStoryId: sid, selectedTestCaseIds: [] }));
                    fetchTestCases(editingSuite.projectId, editingSuite.epicId || undefined, sid || undefined);
                  }}
                  label="User Story"
                >
                  <MenuItem value="">— None —</MenuItem>
                  {allStories.filter((s) => s.epic_id === editingSuite.epicId).map((s) => (
                    <MenuItem key={s.id} value={s.id}>{s.title}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Suite Title"
                fullWidth
                required
                value={editingSuite.name}
                onChange={(e) => setEditingSuite((prev) => ({ ...prev, name: e.target.value }))}
                error={
                  !!(dialogOpen &&
                  (!editingSuite.name.trim() ||
                    (!editingSuite.id &&
                      editingSuite.projectId &&
                      suites.find(
                        (s) =>
                          s.name?.toLowerCase() === editingSuite.name.trim().toLowerCase() &&
                          s.project_id === editingSuite.projectId
                      ))))
                }
                helperText={
                  dialogOpen && !editingSuite.name.trim()
                    ? 'Suite Title is required'
                    : !editingSuite.id &&
                        editingSuite.projectId &&
                        suites.find(
                          (s) =>
                            s.name?.toLowerCase() === editingSuite.name.trim().toLowerCase() &&
                            s.project_id === editingSuite.projectId
                        )
                      ? 'A suite with this title already exists in the selected project'
                      : ''
                }
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Description"
                fullWidth
                multiline
                rows={2}
                value={editingSuite.description}
                onChange={(e) =>
                  setEditingSuite((prev) => ({ ...prev, description: e.target.value }))
                }
              />
            </Grid>

            {/* Test Case Selection */}
            {editingSuite.projectId && (
              <Grid item xs={12}>
                <Divider sx={{ mb: 2 }} />
                <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                  <Box display="flex" alignItems="center" gap={1}>
                    <Checkbox
                      checked={filteredTestCases.length > 0 && filteredTestCases.every((tc) => editingSuite.selectedTestCaseIds.includes(tc.id))}
                      indeterminate={filteredTestCases.some((tc) => editingSuite.selectedTestCaseIds.includes(tc.id)) && !filteredTestCases.every((tc) => editingSuite.selectedTestCaseIds.includes(tc.id))}
                      onChange={(e) => {
                        if (e.target.checked) {
                          const allIds = filteredTestCases.map((tc) => tc.id);
                          setEditingSuite((prev) => {
                            const merged = prev.selectedTestCaseIds.concat(allIds);
                            return { ...prev, selectedTestCaseIds: merged.filter((id, i) => merged.indexOf(id) === i) };
                          });
                        } else {
                          const filteredIds = filteredTestCases.map((tc) => tc.id);
                          setEditingSuite((prev) => ({
                            ...prev,
                            selectedTestCaseIds: prev.selectedTestCaseIds.filter((id) => !filteredIds.includes(id)),
                          }));
                        }
                      }}
                      sx={{ color: '#f57c00', '&.Mui-checked': { color: '#f57c00' }, '&.MuiCheckbox-indeterminate': { color: '#f57c00' } }}
                    />
                    <Typography variant="subtitle1" fontWeight={600}>
                      Select All ({editingSuite.selectedTestCaseIds.length} of {filteredTestCases.length} selected)
                    </Typography>
                  </Box>
                  <TextField
                    size="small"
                    placeholder="Search test cases..."
                    value={tcSearchQuery}
                    onChange={(e) => setTcSearchQuery(e.target.value)}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <SearchIcon fontSize="small" />
                        </InputAdornment>
                      ),
                    }}
                    sx={{ width: 260 }}
                  />
                </Box>
                {availableTestCases.length === 0 ? (
                  <Typography color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                    No test cases found for this project
                  </Typography>
                ) : (
                  <Box
                    sx={{
                      maxHeight: 300,
                      overflow: 'auto',
                      border: '1px solid',
                      borderColor: 'divider',
                      borderRadius: 2,
                    }}
                  >
                    <List dense disablePadding>
                      {filteredTestCases.map((tc) => {
                        const isSelected = editingSuite.selectedTestCaseIds.includes(tc.id);
                        return (
                          <ListItem
                            key={tc.id}
                            dense
                            component="div"
                            onClick={() => handleToggleTestCase(tc.id)}
                            sx={{
                              cursor: 'pointer',
                              borderBottom: '1px solid',
                              borderColor: 'divider',
                              bgcolor: isSelected ? 'rgba(245, 124, 0, 0.04)' : 'transparent',
                              '&:hover': {
                                bgcolor: isSelected
                                  ? 'rgba(245, 124, 0, 0.08)'
                                  : 'rgba(0,0,0,0.02)',
                              },
                            }}
                          >
                            <ListItemIcon sx={{ minWidth: 36 }}>
                              <Checkbox
                                edge="start"
                                checked={isSelected}
                                tabIndex={-1}
                                disableRipple
                                sx={{
                                  color: '#f57c00',
                                  '&.Mui-checked': { color: '#f57c00' },
                                }}
                              />
                            </ListItemIcon>
                            <ListItemText
                              primary={
                                <Box display="flex" alignItems="center" gap={0.5}>
                                  {tc.test_case_id && (
                                    <Chip label={tc.test_case_id} size="small" variant="outlined" sx={{ fontSize: 11, fontWeight: 600, height: 20 }} />
                                  )}
                                  {tc.title}
                                </Box>
                              }
                              secondary={
                                <Box display="flex" gap={0.5} mt={0.3} flexWrap="wrap">
                                  <Chip label={tc.type} size="small" variant="outlined" sx={{ fontSize: 11 }} />
                                  <Chip label={tc.priority} size="small" sx={{ fontSize: 11 }} />
                                  <Chip label={tc.status} size="small" variant="outlined" sx={{ fontSize: 11 }} />
                                  {tc.epic_title && (
                                    <Tooltip title={`Epic: ${tc.epic_title}`} arrow>
                                      <Chip label={`Epic: ${tc.epic_title.length > 20 ? tc.epic_title.substring(0, 20) + '...' : tc.epic_title}`} size="small" sx={{ fontSize: 11, maxWidth: 180, backgroundColor: 'rgba(26, 35, 126, 0.08)', color: 'secondary.main', border: '1px solid rgba(26, 35, 126, 0.2)' }} />
                                    </Tooltip>
                                  )}
                                  {tc.user_story_title && (
                                    <Tooltip title={`Story: ${tc.user_story_title}`} arrow>
                                      <Chip label={`Story: ${tc.user_story_title.length > 20 ? tc.user_story_title.substring(0, 20) + '...' : tc.user_story_title}`} size="small" sx={{ fontSize: 11, maxWidth: 180, backgroundColor: 'rgba(245, 124, 0, 0.08)', color: '#f57c00', border: '1px solid rgba(245, 124, 0, 0.25)' }} />
                                    </Tooltip>
                                  )}
                                </Box>
                              }
                            />
                          </ListItem>
                        );
                      })}
                    </List>
                  </Box>
                )}
              </Grid>
            )}
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={
              !editingSuite.projectId ||
              !editingSuite.name.trim() ||
              (!editingSuite.id && availableTestCases.length === 0) ||
              (!editingSuite.id && editingSuite.selectedTestCaseIds.length === 0) ||
              (!editingSuite.id && !!suites.find(
                (s) =>
                  s.name?.toLowerCase() === editingSuite.name.trim().toLowerCase() &&
                  s.project_id === editingSuite.projectId
              ))
            }
          >
            {editingSuite.id ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Suite Detail (read-only). Double-clicking a row opens this. */}
      <ViewDialog
        open={viewDialogOpen}
        onClose={() => setViewDialogOpen(false)}
        fullScreen={isMobile}
        title={
          <>
            <Typography variant="h6" fontWeight={700} component="span">
              {viewSuite?.name || 'Test Suite'}
            </Typography>
            {viewSuite && (
              <Chip
                label={viewSuite.is_active ? 'Active' : 'Inactive'}
                size="small"
                sx={{
                  fontWeight: 600,
                  backgroundColor: viewSuite.is_active ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                  color: viewSuite.is_active ? '#10b981' : '#ef4444',
                  border: `1px solid ${viewSuite.is_active ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                }}
              />
            )}
            {viewSuite && getProject(viewSuite.project_id)?.code && (
              <Chip
                label={getProject(viewSuite.project_id)?.code}
                size="small"
                sx={{ fontWeight: 600, bgcolor: 'action.selected' }}
              />
            )}
          </>
        }
        onEdit={
          userCanEdit && viewSuite
            ? () => {
                setViewDialogOpen(false);
                handleEditSuite(viewSuite as SuiteRow);
              }
            : undefined
        }
      >
        {viewSuite && (
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <DetailRow
                label="Project"
                value={getProject(viewSuite.project_id)?.name || viewSuite.project_id}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <DetailRow
                label="Test Cases"
                value={
                  <Chip
                    label={viewSuiteCases.length}
                    size="small"
                    sx={{
                      fontWeight: 600,
                      backgroundColor: viewSuiteCases.length > 0 ? 'rgba(245, 124, 0, 0.1)' : 'rgba(107,114,128,0.08)',
                      color: viewSuiteCases.length > 0 ? '#f57c00' : '#6b7280',
                      border: `1px solid ${viewSuiteCases.length > 0 ? 'rgba(245,124,0,0.3)' : 'rgba(107,114,128,0.2)'}`,
                    }}
                  />
                }
              />
            </Grid>
            <Grid item xs={12}>
              <DetailRow label="Description" value={viewSuite.description} />
            </Grid>
            <Grid item xs={12}>
              <Divider sx={{ my: 1 }} />
              <Typography
                variant="caption"
                fontWeight={700}
                color="text.secondary"
                sx={{ textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', mb: 1 }}
              >
                Included Test Cases ({viewSuiteCases.length})
              </Typography>
              {viewLoading && viewSuiteCases.length === 0 ? (
                <Typography variant="body2" color="text.secondary">Loading…</Typography>
              ) : viewSuiteCases.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No test cases attached to this suite.
                </Typography>
              ) : (
                <List dense disablePadding>
                  {viewSuiteCases.map((sc: any, i: number) => {
                    const tc = sc.test_case || {};
                    const title = tc.title || '—';
                    const tcId = tc.test_case_id || '';
                    const pri = priorityStyle(tc.priority);
                    const stat = statusStyle(tc.status);
                    const ty = typeStyle(tc.type);
                    return (
                      <ListItem
                        key={sc.id || sc.test_case_id || i}
                        sx={{
                          borderBottom: 1,
                          borderColor: 'divider',
                          py: 1,
                          alignItems: 'flex-start',
                          flexDirection: 'column',
                        }}
                      >
                        <Box width="100%" minWidth={0}>
                          <Typography variant="body2" fontWeight={600} noWrap>
                            {title}
                          </Typography>
                          {tcId && (
                            <Typography variant="caption" color="text.secondary">
                              {tcId}
                            </Typography>
                          )}
                        </Box>
                        <Box display="flex" gap={0.75} flexWrap="wrap" sx={{ mt: 0.75 }}>
                          {tc.type && (
                            <Chip
                              label={`Type: ${titleCase(tc.type)}`}
                              size="small"
                              variant="outlined"
                              sx={{
                                fontSize: 11,
                                fontWeight: 600,
                                backgroundColor: 'transparent',
                                color: ty.color,
                                borderColor: ty.color,
                                borderWidth: 1.5,
                              }}
                            />
                          )}
                          {tc.priority && (
                            <Chip
                              label={`Priority: ${titleCase(tc.priority)}`}
                              size="small"
                              sx={{
                                fontSize: 11,
                                fontWeight: 600,
                                backgroundColor: pri.bg,
                                color: pri.color,
                                border: `1px solid ${pri.border}`,
                              }}
                            />
                          )}
                          {tc.status && (
                            <Chip
                              label={`Status: ${titleCase(tc.status)}`}
                              size="small"
                              sx={{
                                fontSize: 11,
                                fontWeight: 600,
                                backgroundColor: stat.bg,
                                color: stat.color,
                                border: `1px solid ${stat.border}`,
                              }}
                            />
                          )}
                          {tc.user_story_title && (
                            <Chip
                              label={`Story: ${tc.user_story_title}`}
                              size="small"
                              sx={{
                                fontSize: 11,
                                fontWeight: 600,
                                backgroundColor: 'rgba(59,130,246,0.08)',
                                color: '#2563eb',
                                border: '1px solid rgba(59,130,246,0.25)',
                              }}
                            />
                          )}
                          {tc.epic_title && (
                            <Chip
                              label={`Epic: ${tc.epic_title}`}
                              size="small"
                              sx={{
                                fontSize: 11,
                                fontWeight: 600,
                                backgroundColor: 'rgba(124,58,237,0.08)',
                                color: '#7c3aed',
                                border: '1px solid rgba(124,58,237,0.25)',
                              }}
                            />
                          )}
                        </Box>
                      </ListItem>
                    );
                  })}
                </List>
              )}
            </Grid>
            <Grid item xs={12}>
              <Divider sx={{ my: 1 }} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <DetailRow label="Created By" value={viewSuite.creator?.full_name} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <DetailRow label="Created" value={formatDateTime(viewSuite.created_at)} />
            </Grid>
            {viewSuite.updated_at && (
              <Grid item xs={12} sm={6}>
                <DetailRow label="Last Updated" value={formatDateTime(viewSuite.updated_at)} />
              </Grid>
            )}
          </Grid>
        )}
      </ViewDialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteDialogOpen}
        title="Delete Suite"
        message="Are you sure you want to delete this test suite? This action cannot be undone."
        confirmLabel="Delete"
        confirmColor="error"
        onConfirm={handleDelete}
        onCancel={() => {
          setDeleteDialogOpen(false);
          setDeleteId(null);
        }}
      />
    </Box>
  );
};

export default TestSuitesPage;
