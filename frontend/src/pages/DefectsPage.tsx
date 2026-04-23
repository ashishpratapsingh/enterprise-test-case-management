import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import useDefectAttachments from '../hooks/useDefectAttachments';
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
  Divider,
  IconButton,
  InputAdornment,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Radio,
  Tooltip,
  FormHelperText,
} from '@mui/material';
import {
  Add as AddIcon,
  Search as SearchIcon,
  FilterList as FilterIcon,
  Clear as ClearIcon,
  Close as CloseIcon,
  BugReport as BugIcon,
  CloudUpload,
  Delete as DeleteIcon,
  Image as ImageIcon,
  Videocam,
  InsertDriveFile,
} from '@mui/icons-material';
import { GridColDef, GridPaginationModel } from '../components/common/DataTable';
import { useSnackbar } from 'notistack';
import DataTable from '../components/common/DataTable';
import ConfirmDialog from '../components/common/ConfirmDialog';
import defectService from '../services/defectService';
import testCaseService from '../services/testCaseService';
import epicService from '../services/epicService';
import userStoryService from '../services/userStoryService';
import userService from '../services/userService';
import { useAuth } from '../hooks/useAuth';
import { canEdit } from '../utils/roleGuard';
import { useProjects } from '../contexts/ProjectContext';
import { format } from 'date-fns';

// Backend-aligned enums
const SEVERITIES = ['Critical', 'High', 'Medium', 'Low'];
const PRIORITIES = ['Critical', 'High', 'Medium', 'Low'];
const STATUSES = ['Open', 'In Progress', 'Fixed', 'Verified', 'Closed', 'Reopened', "Won't Fix", 'Duplicate'];

// ── Styled chip helpers (matching TestCasesPage patterns) ────────────────────
const severityStyle = (severity: string): { bg: string; color: string; border: string } => {
  const styles: Record<string, { bg: string; color: string; border: string }> = {
    Critical: { bg: 'rgba(239, 68, 68, 0.1)', color: '#dc2626', border: 'rgba(239, 68, 68, 0.3)' },
    High:     { bg: 'rgba(245, 158, 11, 0.1)', color: '#d97706', border: 'rgba(245, 158, 11, 0.3)' },
    Medium:   { bg: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', border: 'rgba(59, 130, 246, 0.3)' },
    Low:      { bg: 'rgba(16, 185, 129, 0.1)', color: '#10b981', border: 'rgba(16, 185, 129, 0.3)' },
  };
  return styles[severity] || { bg: 'rgba(107, 114, 128, 0.08)', color: '#6b7280', border: 'rgba(107, 114, 128, 0.2)' };
};

const priorityStyle = (priority: string): { bg: string; color: string; border: string } => {
  const styles: Record<string, { bg: string; color: string; border: string }> = {
    Critical: { bg: 'rgba(239, 68, 68, 0.1)', color: '#dc2626', border: 'rgba(239, 68, 68, 0.3)' },
    High:     { bg: 'rgba(245, 158, 11, 0.1)', color: '#d97706', border: 'rgba(245, 158, 11, 0.3)' },
    Medium:   { bg: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', border: 'rgba(59, 130, 246, 0.3)' },
    Low:      { bg: 'rgba(16, 185, 129, 0.1)', color: '#10b981', border: 'rgba(16, 185, 129, 0.3)' },
  };
  return styles[priority] || { bg: 'rgba(107, 114, 128, 0.08)', color: '#6b7280', border: 'rgba(107, 114, 128, 0.2)' };
};

const defectStatusStyle = (status: string): { bg: string; color: string; border: string } => {
  const styles: Record<string, { bg: string; color: string; border: string }> = {
    'Open':        { bg: 'rgba(239, 68, 68, 0.1)',   color: '#ef4444', border: 'rgba(239, 68, 68, 0.3)' },
    'In Progress': { bg: 'rgba(59, 130, 246, 0.1)',   color: '#2563eb', border: 'rgba(59, 130, 246, 0.3)' },
    'Fixed':       { bg: 'rgba(16, 185, 129, 0.1)',   color: '#059669', border: 'rgba(16, 185, 129, 0.3)' },
    'Verified':    { bg: 'rgba(34, 197, 94, 0.1)',    color: '#16a34a', border: 'rgba(34, 197, 94, 0.3)' },
    'Closed':      { bg: 'rgba(107, 114, 128, 0.1)',  color: '#6b7280', border: 'rgba(107, 114, 128, 0.3)' },
    'Reopened':    { bg: 'rgba(245, 158, 11, 0.1)',   color: '#d97706', border: 'rgba(245, 158, 11, 0.3)' },
    "Won't Fix":   { bg: 'rgba(107, 114, 128, 0.1)',  color: '#9ca3af', border: 'rgba(107, 114, 128, 0.3)' },
    'Duplicate':   { bg: 'rgba(139, 92, 246, 0.1)',   color: '#7c3aed', border: 'rgba(139, 92, 246, 0.3)' },
  };
  return styles[status] || { bg: 'rgba(107, 114, 128, 0.08)', color: '#6b7280', border: 'rgba(107, 114, 128, 0.2)' };
};

const labelStyle = {
  fontWeight: 600,
  color: 'text.primary',
  '&.Mui-focused': { color: 'primary.main' },
  '&.MuiInputLabel-shrink': { fontWeight: 700, fontSize: '0.95rem' },
};

const DefectsPage: React.FC = () => {
  const { enqueueSnackbar } = useSnackbar();
  const { user } = useAuth();
  const userCanEdit = user ? canEdit(user.role) : false;
  const { projects } = useProjects();

  // Data
  const [defects, setDefects] = useState<any[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [loading, setLoading] = useState(true);
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({ page: 0, pageSize: 10 });

  // Filters
  const [filterProjectId, setFilterProjectId] = useState('');
  const [filterSeverity, setFilterSeverity] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterAssignee, setFilterAssignee] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Create/Edit dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingDefect, setEditingDefect] = useState<Record<string, any> | null>(null);

  // View dialog
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [viewDefect, setViewDefect] = useState<any>(null);

  // Delete dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

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

  // Users for assignee dropdown
  const [users, setUsers] = useState<{ id: string; full_name: string; email: string }[]>([]);

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

  // Test case selection for dialog
  const [availableTestCases, setAvailableTestCases] = useState<any[]>([]);
  const [tcSearchQuery, setTcSearchQuery] = useState('');

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
            epic_title: tc.epic_title || '',
            user_story_title: tc.user_story_title || '',
          }))
        );
      }
    } catch {
      setAvailableTestCases([]);
    }
  }, []);

  const filteredTestCases = availableTestCases.filter((tc) =>
    !tcSearchQuery || tc.title.toLowerCase().includes(tcSearchQuery.toLowerCase()) || (tc.test_case_id || '').toLowerCase().includes(tcSearchQuery.toLowerCase())
  );

  const handleSelectTestCase = (testCaseId: string) => {
    setEditingDefect((prev) => {
      if (!prev) return null;
      // Toggle: deselect if already selected
      return { ...prev, test_case_id: prev.test_case_id === testCaseId ? null : testCaseId };
    });
  };

  // Attachments — state & handlers live in useDefectAttachments
  const {
    attachments,
    setAttachments,
    pendingFiles,
    setPendingFiles,
    uploadingFile,
    fileInputRef,
    handleStageFiles,
    removePendingFile,
    uploadPendingFiles,
    handleFileUpload,
    handleRemoveAttachment,
    loadAttachments,
  } = useDefectAttachments();

  const getAttachmentIcon = (filename: string) => {
    const ext = filename.toLowerCase().split('.').pop() || '';
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) return <ImageIcon fontSize="small" />;
    if (['mp4', 'mov', 'avi', 'webm', 'mkv'].includes(ext)) return <Videocam fontSize="small" />;
    return <InsertDriveFile fontSize="small" />;
  };

  const getFullUrl = (url: string) => {
    const baseUrl = process.env.REACT_APP_API_BASE_URL?.replace('/api/v1', '') || 'http://localhost:8000';
    return `${baseUrl}${url}`;
  };

  // ── Data loading ──────────────────────────────────────────────────────────
  const fetchDefects = useCallback(async () => {
    setLoading(true);
    try {
      const res = await defectService.getAll({
        page: paginationModel.page + 1,
        pageSize: paginationModel.pageSize,
        project_id: filterProjectId || undefined,
        severity: filterSeverity || undefined,
        priority: filterPriority || undefined,
        status: filterStatus || undefined,
        assigned_to: filterAssignee || undefined,
        search: searchQuery || undefined,
      });
      setDefects(res.items);
      setTotalRows(res.total);
    } catch {
      enqueueSnackbar('Failed to load defects', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [paginationModel, filterProjectId, filterSeverity, filterPriority, filterStatus, filterAssignee, searchQuery, enqueueSnackbar]);

  useEffect(() => { fetchDefects(); }, [fetchDefects]);
  useAutoRefresh(fetchDefects, [paginationModel, filterProjectId, filterSeverity, filterPriority, filterStatus, filterAssignee, searchQuery]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!editingDefect) return;
    try {
      if (editingDefect.id) {
        const { id, reporter, assignee, project, created_at, updated_at, ...payload } = editingDefect;
        await defectService.update(id, payload);
        enqueueSnackbar('Defect updated', { variant: 'success' });
      } else {
        const created = await defectService.create(editingDefect);
        enqueueSnackbar('Defect created', { variant: 'success' });
        // Upload any pending files
        if (pendingFiles.length > 0 && created?.id) {
          await uploadPendingFiles(created.id);
        }
      }
      setDialogOpen(false);
      setEditingDefect(null);
      setPendingFiles([]);
      fetchDefects();
    } catch (err: any) {
      enqueueSnackbar(err.response?.data?.message || 'Failed to save defect', { variant: 'error' });
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await defectService.delete(deleteId);
      enqueueSnackbar('Defect deleted', { variant: 'success' });
      setDeleteDialogOpen(false);
      setDeleteId(null);
      fetchDefects();
    } catch {
      enqueueSnackbar('Failed to delete defect', { variant: 'error' });
    }
  };

  const handleTransition = async (id: string, newStatus: string) => {
    try {
      await defectService.transitionStatus(id, newStatus);
      enqueueSnackbar('Status updated', { variant: 'success' });
      fetchDefects();
      // Also update view dialog if open
      if (viewDefect?.id === id) {
        setViewDefect((prev: any) => prev ? { ...prev, status: newStatus } : prev);
      }
    } catch (err: any) {
      enqueueSnackbar(err.response?.data?.message || 'Invalid status transition', { variant: 'error' });
    }
  };

  const [viewAttachments, setViewAttachments] = useState<any[]>([]);

  const handleView = async (row: any) => {
    setViewDefect(row);
    setViewDialogOpen(true);
    if (row.id) {
      try {
        const atts = await defectService.getAttachments(row.id);
        setViewAttachments(atts);
      } catch {
        setViewAttachments([]);
      }
    }
  };

  const openCreateDialog = () => {
    const pid = filterProjectId || '';
    setEditingDefect({
      title: '',
      description: '',
      severity: 'Medium',
      priority: 'Medium',
      project_id: pid,
      epic_id: '',
      user_story_id: '',
      test_case_id: null,
      jira_ticket_id: '',
    });
    setTcSearchQuery('');
    setAttachments([]);
    setPendingFiles([]);
    if (pid) fetchTestCases(pid);
    else setAvailableTestCases([]);
    setDialogOpen(true);
  };

  const openEditDialog = (row: any) => {
    const pid = row.project_id || '';
    setEditingDefect({
      id: row.id,
      title: row.title || '',
      description: row.description || '',
      severity: row.severity || 'Medium',
      priority: row.priority || 'Medium',
      status: row.status || 'Open',
      project_id: pid,
      epic_id: row.epic_id || '',
      user_story_id: row.user_story_id || '',
      test_case_id: row.test_case_id || null,
      assigned_to: row.assigned_to || '',
      jira_ticket_id: row.jira_ticket_id || '',
    });
    setTcSearchQuery('');
    if (pid) fetchTestCases(pid);
    else setAvailableTestCases([]);
    if (row.id) loadAttachments(row.id);
    else setAttachments([]);
    setDialogOpen(true);
  };

  // Deep-link: /defects?edit=<id> opens the edit dialog for that defect.
  // Used when a bug chip is clicked from another page (e.g., Test Run details).
  const [searchParams, setSearchParams] = useSearchParams();
  const handledEditIdRef = useRef<string | null>(null);
  useEffect(() => {
    const editId = searchParams.get('edit');
    if (!editId || handledEditIdRef.current === editId) return;
    handledEditIdRef.current = editId;
    (async () => {
      try {
        const defect = await defectService.getById(editId);
        if (defect) openEditDialog(defect);
      } catch {
        enqueueSnackbar('Could not load this bug', { variant: 'error' });
      } finally {
        setSearchParams((prev) => {
          const next = new URLSearchParams(prev);
          next.delete('edit');
          return next;
        }, { replace: true });
      }
    })();
  }, [searchParams, enqueueSnackbar, setSearchParams]);

  const hasFilters = searchQuery || filterProjectId || filterSeverity || filterStatus || filterPriority || filterAssignee;
  const clearFilters = () => {
    setSearchQuery('');
    setFilterProjectId('');
    setFilterSeverity('');
    setFilterStatus('');
    setFilterPriority('');
    setFilterAssignee('');
  };

  // Helper: get project from id
  const getProject = (projectId: string) => projects.find((proj) => proj.id === projectId);
  const getProjectLabel = (projectId: string) => {
    const p = getProject(projectId);
    return p ? `${p.code} - ${p.name}` : '—';
  };

  // ── Table columns ─────────────────────────────────────────────────────────
  const columns: GridColDef[] = [
    { field: 'id', headerName: 'ID', width: 70 },
    { field: 'defect_id', headerName: 'Defect ID', width: 150 },
    { field: 'title', headerName: 'Title', flex: 1, minWidth: 250 },
    { field: 'project_code', headerName: 'Project Code', width: 120 },
    {
      field: 'project_id',
      headerName: 'Project',
      width: 180,
      renderCell: (params) => {
        const proj = getProject(params.value);
        if (!proj) return '—';
        const inactive = proj.is_active === false;
        return (
          <Box display="flex" alignItems="center" gap={0.5} sx={{ pt: '4px' }}>
            <Typography variant="body2" sx={inactive ? { color: '#ef4444', fontWeight: 600 } : {}}>
              {proj.code} - {proj.name}
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
    {
      field: 'test_case_display_id',
      headerName: 'Test Case ID',
      width: 140,
      renderCell: (params) => {
        if (!params.value) return '—';
        return (
          <Chip
            label={params.value}
            size="small"
            variant="outlined"
            sx={{ fontWeight: 600, fontSize: 11 }}
          />
        );
      },
    },
    {
      field: 'severity',
      headerName: 'Severity',
      width: 110,
      renderCell: (params) => {
        const s = severityStyle(params.value);
        return (
          <Chip label={params.value || '—'} size="small" sx={{ fontWeight: 600, backgroundColor: s.bg, color: s.color, border: `1px solid ${s.border}` }} />
        );
      },
    },
    {
      field: 'priority',
      headerName: 'Priority',
      width: 110,
      renderCell: (params) => {
        const p = priorityStyle(params.value);
        return (
          <Chip label={params.value || '—'} size="small" sx={{ fontWeight: 600, backgroundColor: p.bg, color: p.color, border: `1px solid ${p.border}` }} />
        );
      },
    },
    {
      field: 'status',
      headerName: 'Status',
      width: 130,
      renderCell: (params) => {
        const s = defectStatusStyle(params.value);
        return (
          <Chip label={params.value || '—'} size="small" sx={{ fontWeight: 600, backgroundColor: s.bg, color: s.color, border: `1px solid ${s.border}` }} />
        );
      },
    },
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
    {
      field: 'actions',
      headerName: 'Actions',
      width: 160,
      sortable: false,
      renderCell: (params: any) => (
        <Box display="flex" gap={0.5}>
          {userCanEdit && (
            <>
              <Button size="small" onClick={(e) => { e.stopPropagation(); openEditDialog(params.row); }}>
                Edit
              </Button>
              <Button size="small" color="error" onClick={(e) => { e.stopPropagation(); setDeleteId(params.row.id); setDeleteDialogOpen(true); }}>
                Delete
              </Button>
            </>
          )}
        </Box>
      ),
    },
  ];

  // ── Detail row for view dialog ────────────────────────────────────────────
  const DetailRow = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <Box sx={{ mb: 1.5 }}>
      <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ mt: 0.3, whiteSpace: 'pre-wrap' }}>
        {value || '—'}
      </Typography>
    </Box>
  );

  return (
    <Box>
      <Typography variant="h4" fontWeight={600} sx={{ color: '#1a237e', mb: 2 }}>
        Defects
      </Typography>

      {/* Action buttons */}
      <Box display="flex" justifyContent="flex-end" gap={1} mb={2}>
        {userCanEdit && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={openCreateDialog} sx={{ whiteSpace: 'nowrap' }}>
            New Defect
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
          <InputLabel sx={labelStyle}>Project</InputLabel>
          <Select value={filterProjectId} onChange={(e) => setFilterProjectId(e.target.value)} label="Project">
            <MenuItem value="">All</MenuItem>
            {projects.map((p) => (
              <MenuItem key={p.id} value={String(p.id)}>{p.code} - {p.name}{p.is_active === false ? ' (Inactive)' : ''}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel sx={labelStyle}>Severity</InputLabel>
          <Select value={filterSeverity} onChange={(e) => setFilterSeverity(e.target.value)} label="Severity">
            <MenuItem value="">All</MenuItem>
            {SEVERITIES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel sx={labelStyle}>Priority</InputLabel>
          <Select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)} label="Priority">
            <MenuItem value="">All</MenuItem>
            {PRIORITIES.map((p) => <MenuItem key={p} value={p}>{p}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 130 }}>
          <InputLabel sx={labelStyle}>Status</InputLabel>
          <Select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} label="Status">
            <MenuItem value="">All</MenuItem>
            {STATUSES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel sx={labelStyle}>Assignee</InputLabel>
          <Select value={filterAssignee} onChange={(e) => setFilterAssignee(e.target.value)} label="Assignee">
            <MenuItem value="">All</MenuItem>
            {users.map((u) => (
              <MenuItem key={u.id} value={u.id}>{u.full_name || u.email}</MenuItem>
            ))}
          </Select>
        </FormControl>
        {hasFilters && (
          <Button size="small" startIcon={<ClearIcon />} onClick={clearFilters}>
            Clear Filters
          </Button>
        )}
      </Box>

      {/* Data Table */}
      <DataTable
        rows={defects}
        columns={columns}
        totalRows={totalRows}
        loading={loading}
        paginationModel={paginationModel}
        onPaginationModelChange={setPaginationModel}
        onRowClick={(params) => handleView(params)}
        getRowId={(row) => row.id}
      />

      {/* ── Create/Edit Dialog ─────────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ fontWeight: 600, color: '#1a237e', display: 'flex', alignItems: 'center', gap: 1 }}>
          <BugIcon />
          {editingDefect?.id ? 'Edit Defect' : 'New Defect'}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid item xs={12}>
              <TextField
                label="Title"
                fullWidth
                required
                value={editingDefect?.title || ''}
                onChange={(e) => setEditingDefect((prev) => prev ? { ...prev, title: e.target.value } : null)}
                error={
                  !!(dialogOpen &&
                  (!(editingDefect?.title || '').trim() ||
                    (!editingDefect?.id &&
                      editingDefect?.project_id &&
                      defects.find(
                        (d) =>
                          d.title?.toLowerCase() === (editingDefect?.title || '').trim().toLowerCase() &&
                          d.project_id === editingDefect?.project_id
                      ))))
                }
                helperText={
                  dialogOpen && !(editingDefect?.title || '').trim()
                    ? 'Title is required'
                    : !editingDefect?.id &&
                        editingDefect?.project_id &&
                        defects.find(
                          (d: any) =>
                            d.title?.toLowerCase() === (editingDefect?.title || '').trim().toLowerCase() &&
                            d.project_id === editingDefect?.project_id
                        )
                      ? 'A defect with this title already exists in the selected project'
                      : ''
                }/>
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth required error={!!(dialogOpen && !editingDefect?.project_id)}>
                <InputLabel>Project</InputLabel>
                <Select
                  value={editingDefect?.project_id || ''}
                  onChange={(e) => {
                    const pid = e.target.value;
                    setEditingDefect((prev) => prev ? { ...prev, project_id: pid, epic_id: '', user_story_id: '', test_case_id: null } : null);
                    setTcSearchQuery('');
                    fetchTestCases(pid);
                  }}
                  label="Project"
                >
                  {projects.map((p) => <MenuItem key={p.id} value={String(p.id)}>{p.code} - {p.name}{p.is_active === false ? ' (Inactive)' : ''}</MenuItem>)}
                </Select>
                {dialogOpen && !editingDefect?.project_id && (
                  <FormHelperText>Project is required</FormHelperText>
                )}
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth disabled={!editingDefect?.project_id}>
                <InputLabel>Epic</InputLabel>
                <Select
                  value={editingDefect?.epic_id || ''}
                  onChange={(e) => {
                    const eid = e.target.value;
                    setEditingDefect((prev) => prev ? { ...prev, epic_id: eid, user_story_id: '', test_case_id: null } : null);
                    fetchTestCases(editingDefect?.project_id || '', eid || undefined);
                  }}
                  label="Epic"
                >
                  <MenuItem value="">— None —</MenuItem>
                  {allEpics.filter((ep) => ep.project_id === editingDefect?.project_id).map((ep) => (
                    <MenuItem key={ep.id} value={ep.id}>{ep.title}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth disabled={!editingDefect?.epic_id}>
                <InputLabel>User Story</InputLabel>
                <Select
                  value={editingDefect?.user_story_id || ''}
                  onChange={(e) => {
                    const sid = e.target.value;
                    setEditingDefect((prev) => prev ? { ...prev, user_story_id: sid, test_case_id: null } : null);
                    fetchTestCases(editingDefect?.project_id || '', editingDefect?.epic_id || undefined, sid || undefined);
                  }}
                  label="User Story"
                >
                  <MenuItem value="">— None —</MenuItem>
                  {allStories.filter((s) => s.epic_id === editingDefect?.epic_id).map((s) => (
                    <MenuItem key={s.id} value={s.id}>{s.title}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={3}>
              <FormControl fullWidth>
                <InputLabel>Severity</InputLabel>
                <Select
                  value={editingDefect?.severity || 'Medium'}
                  onChange={(e) => setEditingDefect((prev) => prev ? { ...prev, severity: e.target.value } : null)}
                  label="Severity"
                >
                  {SEVERITIES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={3}>
              <FormControl fullWidth>
                <InputLabel>Priority</InputLabel>
                <Select
                  value={editingDefect?.priority || 'Medium'}
                  onChange={(e) => setEditingDefect((prev) => prev ? { ...prev, priority: e.target.value } : null)}
                  label="Priority"
                >
                  {PRIORITIES.map((p) => <MenuItem key={p} value={p}>{p}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            {editingDefect?.id && (
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth>
                  <InputLabel>Status</InputLabel>
                  <Select
                    value={editingDefect?.status || 'Open'}
                    onChange={(e) => setEditingDefect((prev) => prev ? { ...prev, status: e.target.value } : null)}
                    label="Status"
                  >
                    {STATUSES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
                  </Select>
                </FormControl>
              </Grid>
            )}
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth required error={!!(dialogOpen && !editingDefect?.assigned_to)}>
                <InputLabel>Assignee</InputLabel>
                <Select
                  value={editingDefect?.assigned_to || ''}
                  onChange={(e) => setEditingDefect((prev) => prev ? { ...prev, assigned_to: e.target.value } : null)}
                  label="Assignee"
                >
                  {users.map((u) => (
                    <MenuItem key={u.id} value={u.id}>
                      {u.full_name || u.email}
                    </MenuItem>
                  ))}
                </Select>
                {dialogOpen && !editingDefect?.assigned_to && (
                  <FormHelperText>Assignee is required</FormHelperText>
                )}
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={editingDefect?.id ? 6 : 6}>
              <TextField
                label="Jira Ticket ID"
                fullWidth
                value={editingDefect?.jira_ticket_id || ''}
                onChange={(e) => setEditingDefect((prev) => prev ? { ...prev, jira_ticket_id: e.target.value } : null)}
                helperText="e.g., PROJ-123"
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Steps to Replicate"
                fullWidth
                multiline
                rows={3}
                value={editingDefect?.description || ''}
                onChange={(e) => setEditingDefect((prev) => prev ? { ...prev, description: e.target.value } : null)}
              />
            </Grid>

            {/* Attachments */}
            <Grid item xs={12}>
              <Divider sx={{ mb: 2 }} />
              <Box display="flex" alignItems="center" gap={1} mb={1}>
                <Typography variant="subtitle1" fontWeight={600}>
                  Attachments
                </Typography>
                <input
                  type="file"
                  accept="image/*,video/*,.pdf,.doc,.docx"
                  multiple
                  style={{ display: 'none' }}
                  ref={fileInputRef}
                  onChange={(e) => {
                    if (editingDefect?.id) {
                      handleFileUpload(editingDefect.id, e.target.files);
                    } else {
                      handleStageFiles(e.target.files);
                    }
                    e.target.value = '';
                  }}
                />
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<CloudUpload />}
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingFile}
                  sx={{ fontSize: 12 }}
                >
                  {uploadingFile ? 'Uploading...' : 'Upload Screenshot / Video'}
                </Button>
              </Box>

              {/* Saved attachments (edit mode) */}
              {attachments.length > 0 && (
                <Box display="flex" gap={1} flexWrap="wrap" mb={pendingFiles.length > 0 ? 1 : 0}>
                  {attachments.map((att, idx) => (
                    <Chip
                      key={att.id || idx}
                      icon={getAttachmentIcon(att.filename)}
                      label={att.filename}
                      size="small"
                      variant="outlined"
                      onClick={() => window.open(getFullUrl(att.url), '_blank')}
                      onDelete={() => {
                        if (editingDefect?.id) handleRemoveAttachment(editingDefect.id, att, idx);
                      }}
                      deleteIcon={<DeleteIcon fontSize="small" />}
                      sx={{
                        maxWidth: 240,
                        '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis' },
                      }}
                    />
                  ))}
                </Box>
              )}

              {/* Pending files (create mode) */}
              {pendingFiles.length > 0 && (
                <Box display="flex" gap={1} flexWrap="wrap">
                  {pendingFiles.map((file, idx) => (
                    <Chip
                      key={idx}
                      icon={getAttachmentIcon(file.name)}
                      label={file.name}
                      size="small"
                      variant="outlined"
                      onDelete={() => removePendingFile(idx)}
                      deleteIcon={<DeleteIcon fontSize="small" />}
                      sx={{
                        maxWidth: 240,
                        bgcolor: 'rgba(245, 124, 0, 0.04)',
                        borderColor: 'rgba(245, 124, 0, 0.3)',
                        '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis' },
                      }}
                    />
                  ))}
                </Box>
              )}

              {attachments.length === 0 && pendingFiles.length === 0 && (
                <Typography variant="body2" color="text.secondary">
                  No attachments yet
                </Typography>
              )}
            </Grid>

            {/* Test Case Selection */}
            {editingDefect?.project_id && (
              <Grid item xs={12}>
                <Divider sx={{ mb: 2 }} />
                <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                  <Typography variant="subtitle1" fontWeight={600}>
                    Link Test Case {editingDefect?.test_case_id ? '(1 selected)' : ''} <span style={{ color: '#ef4444' }}>*</span>
                  </Typography>
                  <Box display="flex" gap={1} alignItems="center">
                    {editingDefect?.test_case_id && (
                      <Button
                        size="small"
                        startIcon={<ClearIcon />}
                        onClick={() => setEditingDefect((prev) => prev ? { ...prev, test_case_id: null } : null)}
                      >
                        Clear
                      </Button>
                    )}
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
                        const isSelected = editingDefect?.test_case_id === tc.id;
                        return (
                          <ListItem
                            key={tc.id}
                            dense
                            component="div"
                            onClick={() => handleSelectTestCase(tc.id)}
                            sx={{
                              cursor: 'pointer',
                              borderBottom: '1px solid',
                              borderColor: 'divider',
                              bgcolor: isSelected ? 'rgba(245, 124, 0, 0.04)' : 'transparent',
                              '&:hover': {
                                bgcolor: isSelected ? 'rgba(245, 124, 0, 0.08)' : 'rgba(0,0,0,0.02)',
                              },
                            }}
                          >
                            <ListItemIcon sx={{ minWidth: 36 }}>
                              <Radio
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
                                      <Chip label={`Epic: ${tc.epic_title.length > 20 ? tc.epic_title.substring(0, 20) + '...' : tc.epic_title}`} size="small" sx={{ fontSize: 11, maxWidth: 180, backgroundColor: 'rgba(26, 35, 126, 0.08)', color: '#1a237e', border: '1px solid rgba(26, 35, 126, 0.2)' }} />
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
                {dialogOpen && !editingDefect?.test_case_id && (
                  <Typography variant="caption" color="error" sx={{ mt: 1, display: 'block' }}>
                    Linking a test case is required
                  </Typography>
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
              !editingDefect?.project_id ||
              !(editingDefect?.title || '').trim() ||
              !editingDefect?.assigned_to ||
              !editingDefect?.test_case_id ||
              (!editingDefect?.id && !!defects.find(
                (d: any) =>
                  d.title?.toLowerCase() === (editingDefect?.title || '').trim().toLowerCase() &&
                  d.project_id === editingDefect?.project_id
              ))
            }
          >
            {editingDefect?.id ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── View Detail Dialog ─────────────────────────────────────────────── */}
      <Dialog
        open={viewDialogOpen}
        onClose={() => setViewDialogOpen(false)}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { maxHeight: '85vh' } }}
      >
        <DialogTitle sx={{ fontWeight: 600, color: '#1a237e', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box display="flex" alignItems="center" gap={1}>
            <BugIcon />
            Defect Details
          </Box>
          <IconButton size="small" onClick={() => setViewDialogOpen(false)}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        {viewDefect && (
          <DialogContent dividers>
            {/* Header info */}
            <Typography variant="h6" fontWeight={700} sx={{ mb: 1, color: '#1a237e' }}>
              {viewDefect.title}
            </Typography>

            <Box display="flex" gap={1} flexWrap="wrap" mb={2}>
              {(() => {
                const sv = severityStyle(viewDefect.severity);
                return <Chip label={`Severity: ${viewDefect.severity}`} size="small" sx={{ fontWeight: 600, backgroundColor: sv.bg, color: sv.color, border: `1px solid ${sv.border}` }} />;
              })()}
              {(() => {
                const pv = priorityStyle(viewDefect.priority);
                return <Chip label={`Priority: ${viewDefect.priority}`} size="small" sx={{ fontWeight: 600, backgroundColor: pv.bg, color: pv.color, border: `1px solid ${pv.border}` }} />;
              })()}
              {(() => {
                const st = defectStatusStyle(viewDefect.status);
                return <Chip label={viewDefect.status} size="small" sx={{ fontWeight: 700, backgroundColor: st.bg, color: st.color, border: `1px solid ${st.border}` }} />;
              })()}
            </Box>

            {/* Status transition buttons */}
            {userCanEdit && (
              <Box sx={{ mb: 2, p: 1.5, bgcolor: 'rgba(26, 35, 126, 0.04)', borderRadius: 2 }}>
                <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                  TRANSITION STATUS
                </Typography>
                <Box display="flex" gap={1} flexWrap="wrap">
                  {STATUSES.filter((s) => s !== viewDefect.status).map((s) => {
                    const st = defectStatusStyle(s);
                    return (
                      <Chip
                        key={s}
                        label={s}
                        size="small"
                        variant="outlined"
                        clickable
                        onClick={() => handleTransition(viewDefect.id, s)}
                        sx={{
                          fontWeight: 600,
                          color: st.color,
                          borderColor: st.border,
                          '&:hover': { backgroundColor: st.bg },
                        }}
                      />
                    );
                  })}
                </Box>
              </Box>
            )}

            <Divider sx={{ mb: 2 }} />

            {/* Detail fields */}
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <DetailRow label="Project" value={getProjectLabel(viewDefect.project_id)} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <DetailRow
                  label="Test Case"
                  value={viewDefect.test_case_display_id ? `${viewDefect.test_case_display_id}${viewDefect.test_case_title ? ' — ' + viewDefect.test_case_title : ''}` : null}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <DetailRow label="Jira Ticket" value={viewDefect.jira_ticket_id} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <DetailRow label="Assignee" value={viewDefect.assigned_to_name} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <DetailRow label="Epic" value={viewDefect.epic_title} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <DetailRow label="User Story" value={viewDefect.user_story_title} />
              </Grid>
              <Grid item xs={12}>
                <DetailRow label="Steps to Replicate" value={viewDefect.description} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <DetailRow
                  label="Created"
                  value={viewDefect.created_at ? format(new Date(viewDefect.created_at), 'MMM dd, yyyy HH:mm') : '—'}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <DetailRow
                  label="Updated"
                  value={viewDefect.updated_at ? format(new Date(viewDefect.updated_at), 'MMM dd, yyyy HH:mm') : '—'}
                />
              </Grid>
              {viewAttachments.length > 0 && (
                <Grid item xs={12}>
                  <Divider sx={{ my: 1 }} />
                  <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Attachments
                  </Typography>
                  <Box display="flex" gap={1} flexWrap="wrap" mt={0.5}>
                    {viewAttachments.map((att: any, idx: number) => {
                      const isImage = /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(att.filename || '');
                      const fileUrl = getFullUrl(att.url);
                      return (
                        <Box key={att.id || idx}>
                          {isImage ? (
                            <Box
                              component="a"
                              href={fileUrl}
                              target="_blank"
                              rel="noopener noreferrer"
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
                                }}
                              />
                              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.3, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {att.filename}
                              </Typography>
                            </Box>
                          ) : (
                            <Chip
                              icon={getAttachmentIcon(att.filename)}
                              label={att.filename}
                              size="small"
                              variant="outlined"
                              onClick={() => window.open(fileUrl, '_blank')}
                              sx={{ maxWidth: 200, cursor: 'pointer', '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis' } }}
                            />
                          )}
                        </Box>
                      );
                    })}
                  </Box>
                </Grid>
              )}
            </Grid>
          </DialogContent>
        )}
        <DialogActions>
          {userCanEdit && viewDefect && (
            <Button onClick={() => { setViewDialogOpen(false); openEditDialog(viewDefect); }}>
              Edit
            </Button>
          )}
          <Button onClick={() => setViewDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* ── Delete Confirmation ────────────────────────────────────────────── */}
      <ConfirmDialog
        open={deleteDialogOpen}
        title="Delete Defect"
        message="Are you sure you want to delete this defect? This action cannot be undone."
        confirmLabel="Delete"
        confirmColor="error"
        onConfirm={handleDelete}
        onCancel={() => { setDeleteDialogOpen(false); setDeleteId(null); }}
      />
    </Box>
  );
};

export default DefectsPage;
