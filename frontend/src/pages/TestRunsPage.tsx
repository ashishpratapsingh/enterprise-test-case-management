import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
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
  Paper,
  LinearProgress,
  Divider,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Collapse,
  Alert,
  FormHelperText,
} from '@mui/material';
import {
  Add as AddIcon,
  FilterList as FilterIcon,
  Search as SearchIcon,
  Clear as ClearIcon,
  Visibility as ViewIcon,
  Close as CloseIcon,
  CheckCircle,
  Cancel as CancelIcon,
  Block as BlockIcon,
  SkipNext as SkipIcon,
  RadioButtonUnchecked,
  KeyboardArrowDown,
  KeyboardArrowUp,
  Image as ImageIcon,
  BugReport,
} from '@mui/icons-material';
import { GridColDef, GridPaginationModel } from '../components/common/DataTable';
import { useSnackbar } from 'notistack';
import DataTable from '../components/common/DataTable';
import ConfirmDialog from '../components/common/ConfirmDialog';
import testRunService from '../services/testRunService';
import testSuiteService from '../services/testSuiteService';
import executionService from '../services/executionService';
import StepDefectDialog from '../components/executions/StepDefectDialog';
import { useAuth } from '../hooks/useAuth';
import { canEdit, canExecute } from '../utils/roleGuard';
import { useProjects } from '../contexts/ProjectContext';
import { format } from 'date-fns';
import { severityColor } from '../utils/statusColors';

interface RunRow {
  id: string;
  name: string;
  status: string;
  environment: string | null;
  test_suite_id: string;
  created_by: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  [key: string]: any;
}

interface SuiteOption {
  id: string;
  name: string;
  project_id: string;
  is_active?: boolean;
  test_suite_cases?: any[];
}

// ── Xray-style status config ─────────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { label: string; bg: string; color: string; border: string }> = {
  'Not Started': {
    label: 'TODO',
    bg: 'rgba(107, 114, 128, 0.08)',
    color: '#6b7280',
    border: 'rgba(107, 114, 128, 0.25)',
  },
  'In Progress': {
    label: 'EXECUTING',
    bg: 'rgba(59, 130, 246, 0.08)',
    color: '#2563eb',
    border: 'rgba(59, 130, 246, 0.3)',
  },
  Completed: {
    label: 'DONE',
    bg: 'rgba(16, 185, 129, 0.08)',
    color: '#059669',
    border: 'rgba(16, 185, 129, 0.3)',
  },
  Blocked: {
    label: 'BLOCKED',
    bg: 'rgba(245, 158, 11, 0.08)',
    color: '#d97706',
    border: 'rgba(245, 158, 11, 0.3)',
  },
  Cancelled: {
    label: 'ABORTED',
    bg: 'rgba(239, 68, 68, 0.08)',
    color: '#dc2626',
    border: 'rgba(239, 68, 68, 0.3)',
  },
};

const getStatusConfig = (status: string) =>
  STATUS_CONFIG[status] || STATUS_CONFIG['Not Started'];

// ── Summary stat cards ────────────────────────────────────────────────────────
const STAT_CARDS = [
  { key: 'all', label: 'All', color: '#1a237e' },
  { key: 'Not Started', label: 'TODO', color: '#6b7280' },
  { key: 'In Progress', label: 'Executing', color: '#2563eb' },
  { key: 'Blocked', label: 'Blocked', color: '#d97706' },
  { key: 'Completed', label: 'Done', color: '#059669' },
  { key: 'Cancelled', label: 'Aborted', color: '#dc2626' },
];

const TestRunsPage: React.FC = () => {
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const { user } = useAuth();
  const userCanEdit = user ? canEdit(user.role) : false;
  const userCanExecute = user ? canExecute(user.role) : false;
  const { projects } = useProjects();

  // Data state
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [loading, setLoading] = useState(true);
  const [suites, setSuites] = useState<SuiteOption[]>([]);
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({
    page: 0,
    pageSize: 10,
  });

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterProjectId, setFilterProjectId] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterSuiteId, setFilterSuiteId] = useState<string>('');

  // Create/Edit dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRun, setEditingRun] = useState<{
    id?: string;
    name: string;
    description: string;
    environment: string;
    testSuiteId: string;
  }>({
    name: '',
    description: '',
    environment: '',
    testSuiteId: '',
  });

  // Delete dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // View dialog
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [viewRun, setViewRun] = useState<RunRow | null>(null);
  const [viewExecs, setViewExecs] = useState<any[]>([]);
  const [viewLoading, setViewLoading] = useState(false);
  const [expandedExecId, setExpandedExecId] = useState<string | null>(null);
  // { executionId: { stepNumber: defect[] } }  — stepNumber 0 bucket = not-step-scoped
  const [execDefects, setExecDefects] = useState<Record<string, Record<number, any[]>>>({});

  // In-view bug attach dialog
  const [bugDialog, setBugDialog] = useState<{
    open: boolean;
    execId: string;
    stepNumber: number;
    projectId?: string | null;
    testCase?: any;
    stepContext?: any;
  }>({ open: false, execId: '', stepNumber: 0 });

  const refreshOneExecDefects = useCallback(async (execId: string) => {
    try {
      const defects = await executionService.listDefects(execId);
      const grouped: Record<number, any[]> = {};
      (defects || []).forEach((d: any) => {
        const sn = d.step_number ?? 0;
        if (!grouped[sn]) grouped[sn] = [];
        grouped[sn].push(d);
      });
      setExecDefects((prev) => ({ ...prev, [execId]: grouped }));
    } catch {
      // ignore
    }
  }, []);

  // Image hover preview
  const [imgPreview, setImgPreview] = useState<{ url: string; filename: string; x: number; y: number } | null>(null);
  const imgPreviewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showImgPreview = (e: React.MouseEvent, url: string, filename: string) => {
    if (imgPreviewTimer.current) clearTimeout(imgPreviewTimer.current);
    const rect = e.currentTarget.getBoundingClientRect();
    setImgPreview({
      url,
      filename,
      x: Math.min(rect.left, window.innerWidth - 530),
      y: Math.max(rect.top - 10, 10),
    });
  };

  const hideImgPreview = () => {
    imgPreviewTimer.current = setTimeout(() => setImgPreview(null), 200);
  };

  const onPreviewBoxEnter = () => {
    if (imgPreviewTimer.current) clearTimeout(imgPreviewTimer.current);
  };

  const onPreviewBoxLeave = () => {
    setImgPreview(null);
  };

  // Abort dialog
  const [abortDialogOpen, setAbortDialogOpen] = useState(false);
  const [abortRunId, setAbortRunId] = useState<string | null>(null);
  const [abortReason, setAbortReason] = useState('');

  // Load suites
  useEffect(() => {
    testSuiteService.getAll({ pageSize: 100 }).then((res) => {
      const apiData = (res as any)?.data;
      if (Array.isArray(apiData)) {
        setSuites(apiData[0] || []);
      }
    });
  }, []);

  // Fetch runs
  const fetchRuns = useCallback(async () => {
    setLoading(true);
    try {
      const res = await testRunService.getAll({
        page: paginationModel.page + 1,
        pageSize: paginationModel.pageSize,
        projectId: filterProjectId || undefined,
        status: filterStatus || undefined,
        testSuiteId: filterSuiteId || undefined,
        search: searchQuery || undefined,
      });
      const apiData = (res as any)?.data;
      if (Array.isArray(apiData)) {
        setRuns(apiData[0] || []);
        setTotalRows(apiData[1] || 0);
      } else {
        setRuns([]);
        setTotalRows(0);
      }
    } catch {
      enqueueSnackbar('Failed to load test runs', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [paginationModel, searchQuery, filterProjectId, filterStatus, filterSuiteId, enqueueSnackbar]);

  useEffect(() => {
    fetchRuns();
  }, [fetchRuns]);

  useAutoRefresh(fetchRuns, [paginationModel, searchQuery, filterProjectId, filterStatus, filterSuiteId]);

  // Status counts for summary cards
  const statusCounts = runs.reduce<Record<string, number>>(
    (acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1;
      return acc;
    },
    {},
  );

  // Get suite name
  const getSuiteName = (suiteId: string) => {
    const s = suites.find((suite) => String(suite.id) === String(suiteId));
    return s?.name || '—';
  };

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handleNewRun = () => {
    setEditingRun({
      name: '',
      description: '',
      environment: '',
      testSuiteId: '',
    });
    setDialogOpen(true);
  };

  const handleEditRun = (row: RunRow) => {
    setEditingRun({
      id: row.id,
      name: row.name || '',
      description: row.description || '',
      environment: row.environment || '',
      testSuiteId: row.test_suite_id || '',
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    try {
      const payload: Record<string, any> = {
        name: editingRun.name,
        description: editingRun.description || null,
        environment: editingRun.environment || null,
        test_suite_id: editingRun.testSuiteId,
      };

      if (editingRun.id) {
        await testRunService.update(editingRun.id, payload);
        enqueueSnackbar('Test run updated', { variant: 'success' });
      } else {
        await testRunService.create(payload);
        enqueueSnackbar('Test run created', { variant: 'success' });
      }
      setDialogOpen(false);
      fetchRuns();
    } catch (err: any) {
      enqueueSnackbar(err.response?.data?.message || 'Failed to save test run', {
        variant: 'error',
      });
    }
  };

  const handleStart = async (id: string) => {
    try {
      await testRunService.start(id);
      enqueueSnackbar('Test run started', { variant: 'success' });
      navigate(`/executions/${id}`);
    } catch (err: any) {
      enqueueSnackbar(err.response?.data?.message || 'Failed to start run', { variant: 'error' });
    }
  };

  const handleComplete = async (id: string) => {
    try {
      await testRunService.complete(id);
      enqueueSnackbar('Test run completed', { variant: 'success' });
      fetchRuns();
    } catch (err: any) {
      enqueueSnackbar(err.response?.data?.message || 'Failed to complete run', {
        variant: 'error',
      });
    }
  };

  const openAbortDialog = (id: string) => {
    setAbortRunId(id);
    setAbortReason('');
    setAbortDialogOpen(true);
  };

  const handleAbortConfirm = async () => {
    if (!abortRunId) return;
    try {
      await testRunService.abort(abortRunId, abortReason.trim() || undefined);
      enqueueSnackbar('Test run aborted', { variant: 'warning' });
      setAbortDialogOpen(false);
      setAbortRunId(null);
      setAbortReason('');
      fetchRuns();
    } catch (err: any) {
      enqueueSnackbar(err.response?.data?.message || 'Failed to abort run', { variant: 'error' });
    }
  };

  const handleBlock = async (id: string) => {
    try {
      await testRunService.block(id);
      enqueueSnackbar('Test run blocked', { variant: 'warning' });
      fetchRuns();
    } catch (err: any) {
      enqueueSnackbar(err.response?.data?.message || 'Failed to block run', { variant: 'error' });
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await testRunService.delete(deleteId);
      enqueueSnackbar('Test run deleted', { variant: 'success' });
      setDeleteDialogOpen(false);
      setDeleteId(null);
      fetchRuns();
    } catch {
      enqueueSnackbar('Failed to delete test run', { variant: 'error' });
    }
  };

  const handleViewRun = async (row: RunRow) => {
    setViewRun(row);
    setViewDialogOpen(true);
    setViewLoading(true);
    setExecDefects({});
    try {
      const execs = await executionService.getByRunId(row.id);
      setViewExecs(execs);
      // Fetch defects for each execution in parallel, group by step_number
      const defectEntries = await Promise.all(
        execs.map(async (e: any) => {
          try {
            const defects = await executionService.listDefects(e.id);
            const grouped: Record<number, any[]> = {};
            (defects || []).forEach((d: any) => {
              const sn = d.step_number ?? 0;
              if (!grouped[sn]) grouped[sn] = [];
              grouped[sn].push(d);
            });
            return [e.id, grouped] as const;
          } catch {
            return [e.id, {} as Record<number, any[]>] as const;
          }
        })
      );
      const map: Record<string, Record<number, any[]>> = {};
      defectEntries.forEach(([id, g]) => { map[id] = g; });
      setExecDefects(map);
    } catch {
      enqueueSnackbar('Failed to load execution details', { variant: 'error' });
      setViewExecs([]);
    } finally {
      setViewLoading(false);
    }
  };

  const countDefects = (execId: string): number => {
    const g = execDefects[execId];
    if (!g) return 0;
    return Object.values(g).reduce((sum, arr) => sum + arr.length, 0);
  };

  // Filter by clicking a stat card
  const handleStatCardClick = (key: string) => {
    if (key === 'all') {
      setFilterStatus('');
    } else {
      setFilterStatus((prev) => (prev === key ? '' : key));
    }
    setPaginationModel((prev) => ({ ...prev, page: 0 }));
  };

  // ── Column definitions ───────────────────────────────────────────────────────

  const columns: GridColDef[] = [
    { field: 'id', headerName: 'ID', width: 90, renderCell: (params) => params.value ? String(params.value).substring(0, 8) : '—' },
    {
      field: 'project_code',
      headerName: 'Project Code',
      width: 120,
      renderCell: (params) => {
        const suite = suites.find((s) => String(s.id) === String(params.row.test_suite_id));
        const project = suite ? projects.find((p) => String(p.id) === String(suite.project_id)) : null;
        return project?.code || '—';
      },
    },
    {
      field: 'project_name',
      headerName: 'Project',
      width: 160,
      renderCell: (params) => {
        const suite = suites.find((s) => String(s.id) === String(params.row.test_suite_id));
        const project = suite ? projects.find((p) => String(p.id) === String(suite.project_id)) : null;
        return project?.name || '—';
      },
    },
    {
      field: 'name',
      headerName: 'Test Run',
      flex: 1,
      minWidth: 250,
      renderCell: (params) => (
        <Typography
          variant="body2"
          fontWeight={600}
          sx={{ color: '#1a237e' }}
        >
          {params.value}
        </Typography>
      ),
    },
    {
      field: 'status',
      headerName: 'Status',
      width: 130,
      renderCell: (params) => {
        const cfg = getStatusConfig(params.value);
        return (
          <Chip
            label={cfg.label}
            size="small"
            sx={{
              fontWeight: 700,
              fontSize: 11,
              letterSpacing: '0.5px',
              backgroundColor: cfg.bg,
              color: cfg.color,
              border: `1px solid ${cfg.border}`,
              borderRadius: '4px',
            }}
          />
        );
      },
    },
    {
      field: 'test_suite_id',
      headerName: 'Test Suite',
      width: 180,
      renderCell: (params) => (
        <Typography variant="body2" sx={{ color: '#1a237e' }}>
          {getSuiteName(params.value)}
        </Typography>
      ),
    },
    {
      field: 'environment',
      headerName: 'Environment',
      width: 150,
      renderCell: (params) =>
        params.value ? (
          <Chip
            label={params.value}
            size="small"
            variant="outlined"
            sx={{ fontSize: 12, borderColor: 'rgba(26,35,126,0.2)', color: '#1a237e' }}
          />
        ) : (
          <Typography variant="body2" color="text.secondary">
            —
          </Typography>
        ),
    },
    {
      // Point field at the primitive `created_by` UUID so AG Grid doesn't
      // infer an "object" cell type from the full nested `creator` user
      // object the backend returns. The cell renderer still reads from
      // creator.full_name on the row — the field is only used for
      // sorting/filtering/type inference by AG Grid.
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
        try {
          return (
            <Typography variant="body2" color="text.secondary">
              {format(new Date(params.value), 'MMM dd, yyyy')}
            </Typography>
          );
        } catch {
          return '—';
        }
      },
    },
    {
      field: 'started_at',
      headerName: 'Started',
      width: 190,
      renderCell: (params) => {
        if (!params.value) {
          return (
            <Chip
              label="Not Started"
              size="small"
              sx={{
                fontSize: 11,
                fontWeight: 600,
                backgroundColor: 'rgba(107,114,128,0.08)',
                color: '#9ca3af',
                border: '1px solid rgba(107,114,128,0.15)',
              }}
            />
          );
        }
        try {
          return (
            <Typography variant="body2" sx={{ color: '#2563eb', fontWeight: 500 }}>
              {format(new Date(params.value), 'MMM dd, yyyy hh:mm a')}
            </Typography>
          );
        } catch {
          return '—';
        }
      },
    },
    {
      field: 'completed_at',
      headerName: 'Completed',
      width: 190,
      renderCell: (params) => {
        if (!params.value) {
          const status = params.row?.status;
          if (status === 'In Progress') {
            return (
              <Chip
                label="Running..."
                size="small"
                sx={{
                  fontSize: 11,
                  fontWeight: 600,
                  backgroundColor: 'rgba(59,130,246,0.08)',
                  color: '#2563eb',
                  border: '1px solid rgba(59,130,246,0.2)',
                }}
              />
            );
          }
          return (
            <Typography variant="body2" color="text.secondary">
              —
            </Typography>
          );
        }
        try {
          return (
            <Typography variant="body2" sx={{ color: '#059669', fontWeight: 500 }}>
              {format(new Date(params.value), 'MMM dd, yyyy hh:mm a')}
            </Typography>
          );
        } catch {
          return '—';
        }
      },
    },
    ...(userCanEdit || userCanExecute
      ? [
          {
            field: 'actions',
            headerName: 'Actions',
            width: 450,
            sortable: false,
            renderCell: (params: any) => {
              const row = params.row as RunRow;
              const status = row.status;
              return (
                <Box display="flex" gap={0.5} flexWrap="wrap">
                  {(status === 'In Progress' || status === 'Blocked' || status === 'Completed' || status === 'Cancelled') && (
                    <Button
                      size="small"
                      color="info"
                      startIcon={<ViewIcon />}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleViewRun(row);
                      }}
                    >
                      View
                    </Button>
                  )}
                  {userCanEdit && status === 'Not Started' && (
                    <Button
                      size="small"
                      color="primary"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStart(row.id);
                      }}
                    >
                      Start
                    </Button>
                  )}
                  {status === 'In Progress' && (
                    <Button
                      size="small"
                      variant="contained"
                      color="primary"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/executions/${row.id}`);
                      }}
                    >
                      Execute
                    </Button>
                  )}
                  {userCanEdit && status === 'In Progress' && (
                    <Button
                      size="small"
                      color="success"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleComplete(row.id);
                      }}
                    >
                      Complete
                    </Button>
                  )}
                  {userCanEdit && status === 'In Progress' && (
                    <Button
                      size="small"
                      sx={{ color: '#d97706', borderColor: '#d97706' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleBlock(row.id);
                      }}
                    >
                      Block
                    </Button>
                  )}
                  {userCanEdit && status === 'Blocked' && (
                    <Button
                      size="small"
                      color="primary"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStart(row.id);
                      }}
                    >
                      Resume
                    </Button>
                  )}
                  {userCanEdit &&
                    (status === 'Not Started' || status === 'In Progress' || status === 'Blocked') && (
                      <Button
                        size="small"
                        color="warning"
                        onClick={(e) => {
                          e.stopPropagation();
                          openAbortDialog(row.id);
                        }}
                      >
                        Abort
                      </Button>
                    )}
                  {userCanEdit && status === 'Not Started' && (
                    <Button
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEditRun(row);
                      }}
                    >
                      Edit
                    </Button>
                  )}
                  {userCanEdit && (
                    <Button
                      size="small"
                      color="error"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteId(row.id);
                        setDeleteDialogOpen(true);
                      }}
                    >
                      Delete
                    </Button>
                  )}
                </Box>
              );
            },
          } as GridColDef,
        ]
      : []),
  ];

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <Box>
      {/* Page header */}
      <Typography variant="h4" fontWeight={600} sx={{ color: '#1a237e', mb: 2 }}>
        Test Runs
      </Typography>

      {/* Xray-style summary stat cards */}
      <Box display="flex" gap={2} mb={3} flexWrap="wrap">
        {STAT_CARDS.map((card) => {
          const count =
            card.key === 'all' ? totalRows : statusCounts[card.key] || 0;
          const isActive =
            card.key === 'all' ? filterStatus === '' : filterStatus === card.key;
          return (
            <Paper
              key={card.key}
              elevation={0}
              onClick={() => handleStatCardClick(card.key)}
              sx={{
                px: 3,
                py: 1.5,
                borderRadius: 2,
                cursor: 'pointer',
                border: '1px solid',
                borderColor: isActive ? card.color : 'rgba(0,0,0,0.08)',
                backgroundColor: isActive ? `${card.color}08` : '#fff',
                transition: 'all 0.15s ease',
                minWidth: 120,
                textAlign: 'center',
                '&:hover': {
                  borderColor: card.color,
                  backgroundColor: `${card.color}0a`,
                },
              }}
            >
              <Typography
                variant="h5"
                fontWeight={700}
                sx={{ color: card.color, lineHeight: 1.2 }}
              >
                {count}
              </Typography>
              <Typography
                variant="caption"
                fontWeight={600}
                sx={{
                  color: isActive ? card.color : '#6b7280',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  fontSize: 11,
                }}
              >
                {card.label}
              </Typography>
            </Paper>
          );
        })}
      </Box>

      {/* Filters row */}
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
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel sx={{ fontWeight: 600, color: 'text.primary', '&.Mui-focused': { color: 'primary.main' }, '&.MuiInputLabel-shrink': { fontWeight: 700, fontSize: '0.95rem' } }}>Test Suite</InputLabel>
            <Select value={filterSuiteId} onChange={(e) => setFilterSuiteId(e.target.value)} label="Test Suite">
              <MenuItem value="">All</MenuItem>
              {suites.map((s) => (
                <MenuItem key={s.id} value={String(s.id)}>{s.name}{s.is_active === false ? ' (Inactive)' : ''}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel sx={{ fontWeight: 600, color: 'text.primary', '&.Mui-focused': { color: 'primary.main' }, '&.MuiInputLabel-shrink': { fontWeight: 700, fontSize: '0.95rem' } }}>Status</InputLabel>
            <Select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} label="Status">
              <MenuItem value="">All</MenuItem>
              {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                <MenuItem key={key} value={key}>{cfg.label}</MenuItem>
              ))}
            </Select>
          </FormControl>
          {(searchQuery || filterProjectId || filterSuiteId || filterStatus) && (
            <Button
              size="small"
              startIcon={<ClearIcon />}
              onClick={() => {
                setSearchQuery('');
                setFilterProjectId('');
                setFilterSuiteId('');
                setFilterStatus('');
              }}
            >
              Clear Filters
            </Button>
          )}
        </Box>
        <Box display="flex" gap={1} flexShrink={0} alignItems="center">
          {userCanEdit && (
            <Button variant="contained" startIcon={<AddIcon />} onClick={handleNewRun} sx={{ whiteSpace: 'nowrap' }}>
              New Test Run
            </Button>
          )}
        </Box>
      </Box>

      {/* AG Grid table */}
      <DataTable
        rows={runs}
        columns={columns}
        totalRows={totalRows}
        loading={loading}
        paginationModel={paginationModel}
        onPaginationModelChange={setPaginationModel}
        getRowId={(row) => row.id}
      />

      {/* ── Create / Edit Dialog ──────────────────────────────────────────────── */}
      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 600, color: '#1a237e' }}>
          {editingRun.id ? 'Edit Test Run' : 'New Test Run'}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid item xs={12}>
              <TextField
                label="Run Name"
                fullWidth
                required
                value={editingRun.name}
                onChange={(e) =>
                  setEditingRun((prev) => ({ ...prev, name: e.target.value }))
                }
                error={
                  !!(dialogOpen &&
                  (!editingRun.name.trim() ||
                    (!editingRun.id &&
                      editingRun.testSuiteId &&
                      runs.find(
                        (r) =>
                          r.name?.toLowerCase() === editingRun.name.trim().toLowerCase() &&
                          r.test_suite_id === editingRun.testSuiteId
                      ))))
                }
                helperText={
                  dialogOpen && !editingRun.name.trim()
                    ? 'Run Name is required'
                    : !editingRun.id &&
                        editingRun.testSuiteId &&
                        runs.find(
                          (r) =>
                            r.name?.toLowerCase() === editingRun.name.trim().toLowerCase() &&
                            r.test_suite_id === editingRun.testSuiteId
                        )
                      ? 'A test run with this name already exists for the selected suite'
                      : ''
                }
              />
            </Grid>
            <Grid item xs={12}>
              <FormControl fullWidth required error={!!(dialogOpen && !editingRun.testSuiteId)}>
                <InputLabel>Test Suite</InputLabel>
                <Select
                  value={editingRun.testSuiteId}
                  onChange={(e) =>
                    setEditingRun((prev) => ({
                      ...prev,
                      testSuiteId: e.target.value,
                    }))
                  }
                  label="Test Suite"
                >
                  {suites.filter((s) => s.is_active !== false).map((s) => (
                    <MenuItem key={s.id} value={String(s.id)}>
                      {s.name}
                    </MenuItem>
                  ))}
                </Select>
                {dialogOpen && !editingRun.testSuiteId && (
                  <FormHelperText>Test Suite is required</FormHelperText>
                )}
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Environment"
                fullWidth
                placeholder="e.g., Chrome 120 / Windows 11 / Staging"
                value={editingRun.environment}
                onChange={(e) =>
                  setEditingRun((prev) => ({ ...prev, environment: e.target.value }))
                }
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Description"
                fullWidth
                multiline
                rows={3}
                value={editingRun.description}
                onChange={(e) =>
                  setEditingRun((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={
              !editingRun.name.trim() ||
              !editingRun.testSuiteId ||
              (!editingRun.id && !!runs.find(
                (r) =>
                  r.name?.toLowerCase() === editingRun.name.trim().toLowerCase() &&
                  r.test_suite_id === editingRun.testSuiteId
              ))
            }
          >
            {editingRun.id ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Delete Confirmation ───────────────────────────────────────────────── */}
      <ConfirmDialog
        open={deleteDialogOpen}
        title="Delete Test Run"
        message="Are you sure you want to delete this test run? This action cannot be undone."
        confirmLabel="Delete"
        confirmColor="error"
        onConfirm={handleDelete}
        onCancel={() => {
          setDeleteDialogOpen(false);
          setDeleteId(null);
        }}
      />

      {/* ── Abort Reason Dialog ───────────────────────────────────────────────── */}
      <Dialog
        open={abortDialogOpen}
        onClose={() => { setAbortDialogOpen(false); setAbortRunId(null); setAbortReason(''); }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 700, color: '#dc2626' }}>Abort Test Run</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Please provide a reason for aborting this test run.
          </Typography>
          <TextField
            label="Abort Reason"
            fullWidth
            required
            multiline
            rows={3}
            value={abortReason}
            onChange={(e) => setAbortReason(e.target.value)}
            placeholder="e.g., Environment is down, blocking issue found, requirements changed..."
            autoFocus
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setAbortDialogOpen(false); setAbortRunId(null); setAbortReason(''); }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleAbortConfirm}
            disabled={!abortReason.trim()}
          >
            Abort Test Run
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── View Test Run Details Dialog ────────────────────────────────────────── */}
      <Dialog
        open={viewDialogOpen}
        onClose={() => setViewDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 700, color: '#1a237e', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box>
            Test Run Details
            {viewRun && (
              <Chip
                label={getStatusConfig(viewRun.status).label}
                size="small"
                sx={{
                  ml: 1.5,
                  fontWeight: 700,
                  fontSize: 11,
                  bgcolor: getStatusConfig(viewRun.status).bg,
                  color: getStatusConfig(viewRun.status).color,
                  border: `1px solid ${getStatusConfig(viewRun.status).border}`,
                }}
              />
            )}
          </Box>
          <IconButton
            size="small"
            onClick={() => setViewDialogOpen(false)}
            aria-label="Close"
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          {viewRun && (
            <>
              {/* Run info */}
              <Grid container spacing={2} sx={{ mb: 2 }}>
                <Grid item xs={12} sm={6}>
                  <Typography variant="caption" color="text.secondary" fontWeight={700}>NAME</Typography>
                  <Typography variant="body1" fontWeight={600}>{viewRun.name}</Typography>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography variant="caption" color="text.secondary" fontWeight={700}>TEST SUITE</Typography>
                  <Typography variant="body1">
                    {suites.find((s) => String(s.id) === String(viewRun.test_suite_id))?.name || viewRun.test_suite_id || '—'}
                  </Typography>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography variant="caption" color="text.secondary" fontWeight={700}>PROJECT</Typography>
                  <Typography variant="body1">
                    {(() => {
                      const suite = suites.find((s) => String(s.id) === String(viewRun.test_suite_id));
                      const project = suite ? projects.find((p) => String(p.id) === String(suite.project_id)) : null;
                      return project ? `${project.code} - ${project.name}` : '—';
                    })()}
                  </Typography>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography variant="caption" color="text.secondary" fontWeight={700}>ENVIRONMENT</Typography>
                  <Typography variant="body1">{viewRun.environment || '—'}</Typography>
                </Grid>
                {viewRun.started_at && (
                  <Grid item xs={12} sm={6}>
                    <Typography variant="caption" color="text.secondary" fontWeight={700}>STARTED AT</Typography>
                    <Typography variant="body1">
                      {(() => { try { return format(new Date(viewRun.started_at), 'MMM dd, yyyy hh:mm a'); } catch { return '—'; } })()}
                    </Typography>
                  </Grid>
                )}
                {viewRun.completed_at && (
                  <Grid item xs={12} sm={6}>
                    <Typography variant="caption" color="text.secondary" fontWeight={700}>COMPLETED AT</Typography>
                    <Typography variant="body1">
                      {(() => { try { return format(new Date(viewRun.completed_at), 'MMM dd, yyyy hh:mm a'); } catch { return '—'; } })()}
                    </Typography>
                  </Grid>
                )}
                {viewRun.description && (
                  <Grid item xs={12}>
                    <Typography variant="caption" color="text.secondary" fontWeight={700}>DESCRIPTION</Typography>
                    <Typography variant="body2">{viewRun.description}</Typography>
                  </Grid>
                )}
              </Grid>

              {/* Abort reason banner */}
              {viewRun.status === 'Cancelled' && viewRun.abort_reason && (
                <Alert
                  severity="error"
                  sx={{ mt: 2, borderRadius: 2, border: '1px solid rgba(239, 68, 68, 0.3)' }}
                >
                  <Typography variant="caption" fontWeight={700}>ABORT REASON</Typography>
                  <Typography variant="body2">{viewRun.abort_reason}</Typography>
                </Alert>
              )}

              <Divider sx={{ my: 2 }} />

              {/* Execution summary */}
              {viewLoading ? (
                <Box sx={{ py: 3 }}>
                  <LinearProgress />
                  <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ mt: 1 }}>
                    Loading execution details...
                  </Typography>
                </Box>
              ) : (
                <>
                  {/* Stats */}
                  {(() => {
                    const normalize = (s: string) => {
                      const l = (s || '').toLowerCase().replace(/\s+/g, '_');
                      if (l === 'pass' || l === 'passed') return 'pass';
                      if (l === 'fail' || l === 'failed') return 'fail';
                      if (l === 'blocked') return 'blocked';
                      if (l === 'skipped') return 'skipped';
                      return 'not_run';
                    };
                    const total = viewExecs.length;
                    const passCount = viewExecs.filter((e) => normalize(e.status) === 'pass').length;
                    const failCount = viewExecs.filter((e) => normalize(e.status) === 'fail').length;
                    const blockedCount = viewExecs.filter((e) => normalize(e.status) === 'blocked').length;
                    const skippedCount = viewExecs.filter((e) => normalize(e.status) === 'skipped').length;
                    const notRunCount = viewExecs.filter((e) => normalize(e.status) === 'not_run').length;
                    const executed = total - notRunCount;
                    const progressPct = total > 0 ? (executed / total) * 100 : 0;

                    const stats = [
                      { label: 'Total', count: total, color: '#1a237e', icon: null },
                      { label: 'Passed', count: passCount, color: '#4caf50', icon: <CheckCircle sx={{ fontSize: 18 }} /> },
                      { label: 'Failed', count: failCount, color: '#f44336', icon: <CancelIcon sx={{ fontSize: 18 }} /> },
                      { label: 'Blocked', count: blockedCount, color: '#ff9800', icon: <BlockIcon sx={{ fontSize: 18 }} /> },
                      { label: 'Skipped', count: skippedCount, color: '#607d8b', icon: <SkipIcon sx={{ fontSize: 18 }} /> },
                      { label: 'Not Run', count: notRunCount, color: '#9e9e9e', icon: <RadioButtonUnchecked sx={{ fontSize: 18 }} /> },
                    ];

                    return (
                      <>
                        <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1, color: '#1a237e' }}>
                          Execution Summary
                        </Typography>

                        {/* Progress bar */}
                        <Box sx={{ mb: 2 }}>
                          <Box display="flex" justifyContent="space-between" mb={0.5}>
                            <Typography variant="body2" color="text.secondary">
                              Executed: {executed} / {total}
                            </Typography>
                            <Typography variant="body2" fontWeight={600}>
                              {Math.round(progressPct)}%
                            </Typography>
                          </Box>
                          <LinearProgress
                            variant="determinate"
                            value={progressPct}
                            sx={{
                              height: 10,
                              borderRadius: 5,
                              bgcolor: 'rgba(0,0,0,0.06)',
                              '& .MuiLinearProgress-bar': {
                                borderRadius: 5,
                                background: progressPct === 100 ? '#4caf50' : 'linear-gradient(90deg, #1a237e, #3f51b5)',
                              },
                            }}
                          />
                        </Box>

                        {/* Stat chips */}
                        <Box display="flex" gap={1} flexWrap="wrap" sx={{ mb: 2 }}>
                          {stats.map((s) => (
                            <Paper
                              key={s.label}
                              variant="outlined"
                              sx={{
                                px: 2,
                                py: 1,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 1,
                                borderColor: `${s.color}40`,
                                bgcolor: `${s.color}08`,
                                minWidth: 100,
                              }}
                            >
                              {s.icon && <Box sx={{ color: s.color, display: 'flex' }}>{s.icon}</Box>}
                              <Box>
                                <Typography variant="h6" fontWeight={700} sx={{ color: s.color, lineHeight: 1.2 }}>
                                  {s.count}
                                </Typography>
                                <Typography variant="caption" color="text.secondary" fontWeight={600}>
                                  {s.label}
                                </Typography>
                              </Box>
                            </Paper>
                          ))}
                        </Box>

                        {/* Pass rate */}
                        {executed > 0 && (
                          <Box sx={{ mb: 2, p: 1.5, bgcolor: 'rgba(26, 35, 126, 0.04)', borderRadius: 2 }}>
                            <Typography variant="body2">
                              <strong>Pass Rate:</strong>{' '}
                              <span style={{ color: passCount / executed >= 0.8 ? '#4caf50' : passCount / executed >= 0.5 ? '#ff9800' : '#f44336', fontWeight: 700 }}>
                                {Math.round((passCount / executed) * 100)}%
                              </span>
                              {' '}({passCount} passed out of {executed} executed)
                            </Typography>
                          </Box>
                        )}
                      </>
                    );
                  })()}

                  {/* Test case details table with expandable step details */}
                  {viewExecs.length > 0 && (
                    <>
                      <Divider sx={{ my: 2 }} />
                      <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1, color: '#1a237e' }}>
                        Test Case Results
                      </Typography>
                      <TableContainer sx={{ maxHeight: 500, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
                        <Table size="small" stickyHeader>
                          <TableHead>
                            <TableRow>
                              <TableCell sx={{ fontWeight: 700, bgcolor: '#f5f5f5', width: 40 }} />
                              <TableCell sx={{ fontWeight: 700, bgcolor: '#f5f5f5', width: 40 }}>#</TableCell>
                              <TableCell sx={{ fontWeight: 700, bgcolor: '#f5f5f5' }}>Test Case</TableCell>
                              <TableCell sx={{ fontWeight: 700, bgcolor: '#f5f5f5' }}>Type</TableCell>
                              <TableCell sx={{ fontWeight: 700, bgcolor: '#f5f5f5' }}>Priority</TableCell>
                              <TableCell sx={{ fontWeight: 700, bgcolor: '#f5f5f5' }}>Status</TableCell>
                              <TableCell sx={{ fontWeight: 700, bgcolor: '#f5f5f5', width: 80 }}>Bugs</TableCell>
                              <TableCell sx={{ fontWeight: 700, bgcolor: '#f5f5f5' }}>Notes</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {viewExecs.map((exec, idx) => {
                              const normalize = (s: string) => {
                                const l = (s || '').toLowerCase().replace(/\s+/g, '_');
                                if (l === 'pass' || l === 'passed') return 'pass';
                                if (l === 'fail' || l === 'failed') return 'fail';
                                if (l === 'blocked') return 'blocked';
                                if (l === 'skipped') return 'skipped';
                                return 'not_run';
                              };
                              const ns = normalize(exec.status);
                              const statusMap: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
                                pass: { label: 'Passed', color: '#4caf50', icon: <CheckCircle sx={{ fontSize: 16 }} /> },
                                fail: { label: 'Failed', color: '#f44336', icon: <CancelIcon sx={{ fontSize: 16 }} /> },
                                blocked: { label: 'Blocked', color: '#ff9800', icon: <BlockIcon sx={{ fontSize: 16 }} /> },
                                skipped: { label: 'Skipped', color: '#607d8b', icon: <SkipIcon sx={{ fontSize: 16 }} /> },
                                not_run: { label: 'Not Run', color: '#9e9e9e', icon: <RadioButtonUnchecked sx={{ fontSize: 16 }} /> },
                              };
                              const sc = statusMap[ns] || statusMap.not_run;
                              const tc = exec.test_case;
                              const isExpanded = expandedExecId === exec.id;
                              const steps = tc?.steps || [];
                              const stepResults = exec.step_results || [];

                              return (
                                <React.Fragment key={exec.id}>
                                  {/* Main row */}
                                  <TableRow
                                    hover
                                    sx={{ cursor: 'pointer', '& > *': { borderBottom: isExpanded ? 'none' : undefined } }}
                                    onClick={() => setExpandedExecId(isExpanded ? null : exec.id)}
                                  >
                                    <TableCell sx={{ width: 40 }}>
                                      <IconButton
                                        size="small"
                                        aria-label={isExpanded ? 'Collapse step results' : 'Expand step results'}
                                      >
                                        {isExpanded ? <KeyboardArrowUp /> : <KeyboardArrowDown />}
                                      </IconButton>
                                    </TableCell>
                                    <TableCell>{idx + 1}</TableCell>
                                    <TableCell>
                                      <Box>
                                        <Typography variant="body2" fontWeight={600}>
                                          {tc?.title || `Case #${idx + 1}`}
                                        </Typography>
                                        {tc?.test_case_id && (
                                          <Typography variant="caption" color="text.secondary">
                                            {tc.test_case_id}
                                          </Typography>
                                        )}
                                      </Box>
                                    </TableCell>
                                    <TableCell>
                                      {tc?.type ? <Chip label={tc.type} size="small" sx={{ fontSize: 11 }} /> : '—'}
                                    </TableCell>
                                    <TableCell>
                                      {tc?.priority ? (
                                        <Chip
                                          label={tc.priority}
                                          size="small"
                                          sx={{
                                            fontSize: 11,
                                            bgcolor: tc.priority === 'Critical' ? 'rgba(244,67,54,0.1)' :
                                                     tc.priority === 'High' ? 'rgba(255,152,0,0.1)' : 'rgba(0,0,0,0.04)',
                                            color: tc.priority === 'Critical' ? '#f44336' :
                                                   tc.priority === 'High' ? '#ff9800' : 'text.secondary',
                                          }}
                                        />
                                      ) : '—'}
                                    </TableCell>
                                    <TableCell>
                                      <Chip
                                        icon={sc.icon as React.ReactElement}
                                        label={sc.label}
                                        size="small"
                                        sx={{
                                          fontWeight: 700,
                                          fontSize: 11,
                                          bgcolor: `${sc.color}14`,
                                          color: sc.color,
                                          border: `1px solid ${sc.color}40`,
                                          '& .MuiChip-icon': { color: sc.color },
                                        }}
                                      />
                                    </TableCell>
                                    <TableCell>
                                      {(() => {
                                        const count = countDefects(exec.id);
                                        if (count === 0) {
                                          return <Typography variant="body2" color="text.disabled">—</Typography>;
                                        }
                                        return (
                                          <Chip
                                            icon={<BugReport sx={{ fontSize: 14 }} />}
                                            label={count}
                                            size="small"
                                            sx={{
                                              fontWeight: 700,
                                              fontSize: 11,
                                              bgcolor: 'rgba(244,67,54,0.12)',
                                              color: '#d32f2f',
                                              border: '1px solid rgba(244,67,54,0.4)',
                                              '& .MuiChip-icon': { color: '#d32f2f' },
                                            }}
                                          />
                                        );
                                      })()}
                                    </TableCell>
                                    <TableCell>
                                      <Typography variant="caption" color="text.secondary" sx={{ maxWidth: 150, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {exec.notes || '—'}
                                      </Typography>
                                    </TableCell>
                                  </TableRow>

                                  {/* Expandable detail row */}
                                  <TableRow>
                                    <TableCell colSpan={8} sx={{ py: 0, px: 0 }}>
                                      <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                                        <Box sx={{ p: 2, bgcolor: 'rgba(26, 35, 126, 0.02)' }}>
                                          {/* Preconditions */}
                                          {tc?.preconditions && (
                                            <Alert severity="info" sx={{ mb: 2, borderRadius: 1 }}>
                                              <Typography variant="caption" fontWeight={700}>PRECONDITIONS</Typography>
                                              <Typography variant="body2">{tc.preconditions}</Typography>
                                            </Alert>
                                          )}

                                          {/* Overall notes */}
                                          {exec.notes && (
                                            <Box sx={{ mb: 2, p: 1.5, bgcolor: 'rgba(255, 152, 0, 0.06)', borderRadius: 1, border: '1px solid rgba(255, 152, 0, 0.2)' }}>
                                              <Typography variant="caption" fontWeight={700} color="text.secondary">EXECUTION NOTES</Typography>
                                              <Typography variant="body2">{exec.notes}</Typography>
                                            </Box>
                                          )}

                                          {/* Steps detail */}
                                          {steps.length > 0 ? (
                                            <Table size="small" sx={{ bgcolor: '#fff', borderRadius: 1, border: '1px solid', borderColor: 'divider' }}>
                                              <TableHead>
                                                <TableRow>
                                                  <TableCell sx={{ fontWeight: 700, bgcolor: '#fafafa', width: 60 }}>Step</TableCell>
                                                  <TableCell sx={{ fontWeight: 700, bgcolor: '#fafafa' }}>Action</TableCell>
                                                  <TableCell sx={{ fontWeight: 700, bgcolor: '#fafafa' }}>Expected Result</TableCell>
                                                  <TableCell sx={{ fontWeight: 700, bgcolor: '#fafafa' }}>Actual Result</TableCell>
                                                  <TableCell sx={{ fontWeight: 700, bgcolor: '#fafafa', width: 100 }}>Status</TableCell>
                                                  <TableCell sx={{ fontWeight: 700, bgcolor: '#fafafa' }}>Notes</TableCell>
                                                  <TableCell sx={{ fontWeight: 700, bgcolor: '#fafafa' }}>Attachments</TableCell>
                                                  <TableCell sx={{ fontWeight: 700, bgcolor: '#fafafa' }}>Bugs</TableCell>
                                                </TableRow>
                                              </TableHead>
                                              <TableBody>
                                                {steps.map((step: any, sIdx: number) => {
                                                  const stepNum = step.step_number || sIdx + 1;
                                                  const sr = stepResults.find((r: any) => r.step_number === stepNum);
                                                  const stepStatus = sr ? normalize(sr.status) : 'not_run';
                                                  const stepSc = statusMap[stepStatus] || statusMap.not_run;
                                                  return (
                                                    <TableRow key={sIdx} sx={{ bgcolor: stepStatus === 'fail' ? 'rgba(244,67,54,0.04)' : stepStatus === 'blocked' ? 'rgba(255,152,0,0.04)' : 'transparent' }}>
                                                      <TableCell>
                                                        <Typography variant="body2" fontWeight={600}>{stepNum}</Typography>
                                                      </TableCell>
                                                      <TableCell>
                                                        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{step.action || '—'}</Typography>
                                                        {step.test_data && (
                                                          <Typography variant="caption" sx={{ display: 'block', mt: 0.5, fontFamily: 'monospace', color: '#6b7280', bgcolor: 'rgba(0,0,0,0.03)', p: 0.5, borderRadius: 0.5 }}>
                                                            Test Data: {step.test_data}
                                                          </Typography>
                                                        )}
                                                      </TableCell>
                                                      <TableCell>
                                                        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{step.expected_result || '—'}</Typography>
                                                      </TableCell>
                                                      <TableCell>
                                                        {sr?.actual_result ? (
                                                          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', color: stepStatus === 'fail' ? '#f44336' : 'text.primary', fontWeight: stepStatus === 'fail' ? 600 : 400 }}>
                                                            {sr.actual_result}
                                                          </Typography>
                                                        ) : (
                                                          <Typography variant="body2" color="text.disabled">—</Typography>
                                                        )}
                                                      </TableCell>
                                                      <TableCell>
                                                        <Chip
                                                          icon={stepSc.icon as React.ReactElement}
                                                          label={stepSc.label}
                                                          size="small"
                                                          sx={{
                                                            fontWeight: 700,
                                                            fontSize: 10,
                                                            bgcolor: `${stepSc.color}14`,
                                                            color: stepSc.color,
                                                            border: `1px solid ${stepSc.color}40`,
                                                            '& .MuiChip-icon': { color: stepSc.color },
                                                          }}
                                                        />
                                                      </TableCell>
                                                      <TableCell>
                                                        <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'pre-wrap' }}>
                                                          {sr?.notes || '—'}
                                                        </Typography>
                                                      </TableCell>
                                                      <TableCell>
                                                        {sr?.attachments && sr.attachments.length > 0 ? (
                                                          <Box display="flex" flexDirection="column" gap={1}>
                                                            {sr.attachments.map((att: any, attIdx: number) => {
                                                              const baseUrl = process.env.REACT_APP_API_BASE_URL?.replace('/api/v1', '') || 'http://localhost:8000';
                                                              const fileUrl = `${baseUrl}${att.url}`;
                                                              const isImage = /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(att.filename || att.url);
                                                              return (
                                                                <Box key={attIdx}>
                                                                  {isImage ? (
                                                                    <Box
                                                                      component="a"
                                                                      href={fileUrl}
                                                                      target="_blank"
                                                                      rel="noopener noreferrer"
                                                                      onMouseEnter={(e: React.MouseEvent) => showImgPreview(e, fileUrl, att.filename)}
                                                                      onMouseLeave={hideImgPreview}
                                                                      sx={{ display: 'block', cursor: 'pointer' }}
                                                                    >
                                                                      <Box
                                                                        component="img"
                                                                        src={fileUrl}
                                                                        alt={att.filename}
                                                                        sx={{
                                                                          maxWidth: 120,
                                                                          maxHeight: 80,
                                                                          borderRadius: 1,
                                                                          border: '1px solid',
                                                                          borderColor: 'divider',
                                                                          objectFit: 'cover',
                                                                          transition: 'box-shadow 0.2s, border-color 0.2s',
                                                                          '&:hover': {
                                                                            borderColor: '#1a237e',
                                                                            boxShadow: '0 0 0 2px rgba(26,35,126,0.25)',
                                                                          },
                                                                        }}
                                                                      />
                                                                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.3, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                        {att.filename}
                                                                      </Typography>
                                                                    </Box>
                                                                  ) : (
                                                                    <Chip
                                                                      icon={<ImageIcon fontSize="small" />}
                                                                      label={att.filename}
                                                                      size="small"
                                                                      variant="outlined"
                                                                      onClick={() => window.open(fileUrl, '_blank')}
                                                                      sx={{
                                                                        maxWidth: 160,
                                                                        cursor: 'pointer',
                                                                        '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis' },
                                                                      }}
                                                                    />
                                                                  )}
                                                                </Box>
                                                              );
                                                            })}
                                                          </Box>
                                                        ) : (
                                                          <Typography variant="body2" color="text.disabled">—</Typography>
                                                        )}
                                                      </TableCell>
                                                      <TableCell>
                                                        {(() => {
                                                          const stepBugs = execDefects[exec.id]?.[stepNum] || [];
                                                          const suite = suites.find((s) => String(s.id) === String(viewRun?.test_suite_id));
                                                          const projId = tc?.project_id || suite?.project_id;
                                                          return (
                                                            <Box display="flex" flexDirection="column" gap={0.5}>
                                                              {stepBugs.map((d: any) => (
                                                                <Chip
                                                                  key={d.id}
                                                                  icon={<BugReport sx={{ fontSize: 13 }} />}
                                                                  label={`${d.defect_id} · ${d.title}`}
                                                                  size="small"
                                                                  onClick={() => {
                                                                    setViewDialogOpen(false);
                                                                    navigate(`/defects?edit=${d.id}`);
                                                                  }}
                                                                  sx={{
                                                                    maxWidth: 260,
                                                                    cursor: 'pointer',
                                                                    fontSize: 10,
                                                                    fontWeight: 600,
                                                                    bgcolor: `${severityColor(d.severity)}14`,
                                                                    color: severityColor(d.severity),
                                                                    border: `1px solid ${severityColor(d.severity)}55`,
                                                                    '& .MuiChip-icon': { color: severityColor(d.severity) },
                                                                    '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis' },
                                                                  }}
                                                                />
                                                              ))}
                                                              {stepBugs.length === 0 && (
                                                                <Typography variant="body2" color="text.disabled">—</Typography>
                                                              )}
                                                              {userCanExecute && (
                                                                <Button
                                                                  size="small"
                                                                  variant="outlined"
                                                                  color="error"
                                                                  startIcon={<BugReport sx={{ fontSize: 12 }} />}
                                                                  onClick={() => setBugDialog({
                                                                    open: true,
                                                                    execId: exec.id,
                                                                    stepNumber: stepNum,
                                                                    projectId: projId,
                                                                    testCase: { id: tc?.id, test_case_id: tc?.test_case_id, title: tc?.title },
                                                                    stepContext: {
                                                                      action: step.action,
                                                                      expected_result: step.expected_result,
                                                                      actual_result: sr?.actual_result,
                                                                      environment: viewRun?.environment,
                                                                    },
                                                                  })}
                                                                  sx={{ fontSize: 10, py: 0.2, mt: 0.25, alignSelf: 'flex-start', minWidth: 0 }}
                                                                >
                                                                  Attach
                                                                </Button>
                                                              )}
                                                            </Box>
                                                          );
                                                        })()}
                                                      </TableCell>
                                                    </TableRow>
                                                  );
                                                })}
                                              </TableBody>
                                            </Table>
                                          ) : (
                                            <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                                              No test steps defined for this test case.
                                            </Typography>
                                          )}

                                          {/* Step summary */}
                                          {stepResults.length > 0 && (
                                            <Box display="flex" gap={1} mt={1.5} flexWrap="wrap">
                                              {(() => {
                                                const counts: Record<string, number> = { pass: 0, fail: 0, blocked: 0, skipped: 0, not_run: 0 };
                                                for (const sr of stepResults) {
                                                  const sn = normalize(sr.status);
                                                  counts[sn] = (counts[sn] || 0) + 1;
                                                }
                                                return Object.entries(counts)
                                                  .filter(([, c]) => c > 0)
                                                  .map(([s, c]) => {
                                                    const sm = statusMap[s] || statusMap.not_run;
                                                    return (
                                                      <Chip
                                                        key={s}
                                                        label={`${sm.label}: ${c}/${stepResults.length}`}
                                                        size="small"
                                                        sx={{ fontSize: 11, fontWeight: 600, bgcolor: `${sm.color}14`, color: sm.color, border: `1px solid ${sm.color}40` }}
                                                      />
                                                    );
                                                  });
                                              })()}
                                            </Box>
                                          )}
                                        </Box>
                                      </Collapse>
                                    </TableCell>
                                  </TableRow>
                                </React.Fragment>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    </>
                  )}
                </>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setViewDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Step bug attach dialog (invoked from view details) */}
      <StepDefectDialog
        open={bugDialog.open}
        onClose={() => setBugDialog((prev) => ({ ...prev, open: false }))}
        onSaved={() => {
          if (bugDialog.execId) refreshOneExecDefects(bugDialog.execId);
        }}
        executionId={bugDialog.execId}
        stepNumber={bugDialog.stepNumber}
        projectId={bugDialog.projectId || null}
        testCase={bugDialog.testCase}
        stepContext={bugDialog.stepContext}
      />

      {/* Image Hover Preview */}
      {imgPreview && (
        <Box
          onMouseEnter={onPreviewBoxEnter}
          onMouseLeave={onPreviewBoxLeave}
          sx={{
            position: 'fixed',
            left: imgPreview.x,
            top: imgPreview.y,
            transform: 'translateY(-100%)',
            zIndex: 2000,
            borderRadius: 3,
            boxShadow: '0 12px 40px rgba(0,0,0,0.3)',
            overflow: 'hidden',
            bgcolor: '#1e1e1e',
            maxWidth: 520,
            animation: 'imgPreviewIn 0.15s ease-out',
            '@keyframes imgPreviewIn': {
              from: { opacity: 0, transform: 'translateY(calc(-100% + 8px))' },
              to: { opacity: 1, transform: 'translateY(-100%)' },
            },
          }}
        >
          <Box sx={{ p: 1, bgcolor: '#fafafa' }}>
            <Box
              component="img"
              src={imgPreview.url}
              alt={imgPreview.filename}
              sx={{
                display: 'block',
                maxWidth: 500,
                maxHeight: 360,
                objectFit: 'contain',
                borderRadius: 1.5,
              }}
            />
          </Box>
          <Box
            sx={{
              px: 1.5,
              py: 0.75,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Typography variant="caption" sx={{ color: '#e0e0e0', fontWeight: 500 }} noWrap>
              {imgPreview.filename}
            </Typography>
            <Typography variant="caption" sx={{ color: '#888', ml: 1, whiteSpace: 'nowrap' }}>
              Click to open full size
            </Typography>
          </Box>
        </Box>
      )}
    </Box>
  );
};

export default TestRunsPage;
