import React, { useEffect, useState, useCallback } from 'react';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import {
  Alert,
  Box,
  Typography,
  Tabs,
  Tab,
  Button,
  Chip,
  Checkbox,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  FormControlLabel,
  InputLabel,
  Select,
  MenuItem,
  Grid,
  FormHelperText,
  Divider,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  Add as AddIcon,
  FilterList as FilterIcon,
  Search as SearchIcon,
  Clear as ClearIcon,
  FileDownload as ExportIcon,
  Close as CloseIcon,
  Edit as EditIcon,
} from '@mui/icons-material';
import * as XLSX from 'xlsx';
import { GridColDef, GridPaginationModel } from '../components/common/DataTable';
import DataTable from '../components/common/DataTable';
import useBulkEdit, { BulkFieldSpec } from '../hooks/useBulkEdit';
import BulkEditDialog from '../components/common/BulkEditDialog';
import ViewDialog from '../components/common/ViewDialog';
import ConfirmDialog from '../components/common/ConfirmDialog';
import epicService from '../services/epicService';
import userStoryService from '../services/userStoryService';
import userService from '../services/userService';
import { useProjects } from '../contexts/ProjectContext';
import { useSnackbar } from 'notistack';
import { useAuth } from '../hooks/useAuth';
import { canEdit } from '../utils/roleGuard';
import { format } from 'date-fns';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

const TabPanel: React.FC<TabPanelProps> = ({ children, value, index }) => (
  <Box role="tabpanel" hidden={value !== index} sx={{ pt: 3 }}>
    {value === index && children}
  </Box>
);

const PRIORITY_CONFIG: Record<string, { bg: string; color: string; border: string }> = {
  critical: { bg: 'rgba(239,68,68,0.08)', color: '#dc2626', border: 'rgba(239,68,68,0.3)' },
  high: { bg: 'rgba(245,158,11,0.08)', color: '#d97706', border: 'rgba(245,158,11,0.3)' },
  medium: { bg: 'rgba(59,130,246,0.08)', color: '#2563eb', border: 'rgba(59,130,246,0.3)' },
  low: { bg: 'rgba(16,185,129,0.08)', color: '#059669', border: 'rgba(16,185,129,0.3)' },
};

// Agile estimation Fibonacci scale up to 13. Used by both the per-story
// create/edit dialog and the User Stories bulk-edit dialog so the
// allowed set is consistent. Backend mirrors this in
// ``app/services/user_story_service.py``.
const ALLOWED_STORY_POINTS: number[] = [0, 1, 2, 3, 5, 8, 13];

interface UserOption {
  id: string;
  full_name: string;
  email: string;
}

const RequirementsPage: React.FC = () => {
  const [tabIndex, setTabIndex] = useState(0);
  const { enqueueSnackbar } = useSnackbar();
  const { user } = useAuth();
  const userCanEdit = user ? canEdit(user.role) : false;
  const { projects } = useProjects();

  // Users for assignee dropdown
  const [users, setUsers] = useState<UserOption[]>([]);

  // All epics for User Story epic filter dropdown
  const [allEpics, setAllEpics] = useState<{ id: string; title: string; project_id: string }[]>([]);

  // Epics state
  const [epics, setEpics] = useState<any[]>([]);
  const [epicsTotalRows, setEpicsTotalRows] = useState(0);
  const [epicsLoading, setEpicsLoading] = useState(false);
  const [epicsPaginationModel, setEpicsPaginationModel] = useState<GridPaginationModel>({
    page: 0,
    pageSize: 10,
  });

  // Epic filters
  const [epicSearch, setEpicSearch] = useState('');
  const [epicFilterPriority, setEpicFilterPriority] = useState('');
  const [epicFilterProject, setEpicFilterProject] = useState('');
  const [epicFilterAssignee, setEpicFilterAssignee] = useState('');

  // Epic dialog
  const [epicDialogOpen, setEpicDialogOpen] = useState(false);
  const [editingEpic, setEditingEpic] = useState<{
    id?: string;
    projectId: string;
    title: string;
    labels: string;
    startDate: string;
    dueDate: string;
    priority: string;
    assignedTo: string;
  }>({
    projectId: '',
    title: '',
    labels: '',
    startDate: '',
    dueDate: '',
    priority: 'medium',
    assignedTo: '',
  });

  // User Stories state
  const [userStories, setUserStories] = useState<any[]>([]);
  const [storiesTotalRows, setStoriesTotalRows] = useState(0);
  const [storiesLoading, setStoriesLoading] = useState(false);
  const [storiesPaginationModel, setStoriesPaginationModel] = useState<GridPaginationModel>({
    page: 0,
    pageSize: 10,
  });

  // User Story filters
  const [storySearch, setStorySearch] = useState('');
  const [storyFilterPriority, setStoryFilterPriority] = useState('');
  const [storyFilterStatus, setStoryFilterStatus] = useState('');
  const [storyFilterProject, setStoryFilterProject] = useState('');
  const [storyFilterEpic, setStoryFilterEpic] = useState('');

  // User Story dialog
  const [storyDialogOpen, setStoryDialogOpen] = useState(false);
  const [editingStory, setEditingStory] = useState<{
    id?: string;
    epicId: string;
    projectId: string;
    title: string;
    description: string;
    acceptanceCriteria: string;
    priority: string;
    status: string;
    storyPoints: string;
    assignedTo: string;
  }>({
    epicId: '',
    projectId: '',
    title: '',
    description: '',
    acceptanceCriteria: '',
    priority: 'medium',
    status: 'open',
    storyPoints: '',
    assignedTo: '',
  });

  // Read-only detail dialogs (opened via row double-click). Hold the
  // raw row data — no second fetch needed since list rows include
  // everything the detail view shows.
  const [epicViewDialogOpen, setEpicViewDialogOpen] = useState(false);
  const [viewEpic, setViewEpic] = useState<any>(null);
  const [storyViewDialogOpen, setStoryViewDialogOpen] = useState(false);
  const [viewStory, setViewStory] = useState<any>(null);

  // Delete dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteType, setDeleteType] = useState<'epic' | 'story'>('epic');

  // ── User-stories bulk operations (JIRA-style) ─────────────────────────
  // Same shape as DefectsPage / TestCasesPage: a single dialog with
  // per-field "change?" checkboxes, partial-success result panel, and an
  // inline destructive Delete button outside the dialog.
  const STORY_BULK_MAX = 500;
  const [selectedStoryIds, setSelectedStoryIds] = useState<string[]>([]);
  const [storyBulkBusy, setStoryBulkBusy] = useState(false);
  const [storyBulkDeleteConfirm, setStoryBulkDeleteConfirm] = useState(false);
  const [storyBulkEditOpen, setStoryBulkEditOpen] = useState(false);
  const [storyBulkResult, setStoryBulkResult] = useState<null | {
    perField: { field: string; succeeded: number; failed: number; firstError?: string }[];
  }>(null);

  // Load users
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

  // Fetch all epics for the User Story epic dropdowns (both filter + create/edit).
  // Must be refreshed after any epic create/update/delete so newly-created epics
  // show up immediately when the user then opens the User Story dialog.
  const refreshAllEpics = useCallback(async () => {
    try {
      const res = await epicService.getAll({ page: 1, pageSize: 10000 });
      const apiData = (res as any)?.data;
      if (Array.isArray(apiData)) {
        setAllEpics(
          (apiData[0] || []).map((e: any) => ({
            id: e.id,
            title: e.title,
            project_id: e.project_id,
          })),
        );
      }
    } catch {
      // Silent — dropdown will just be empty; fetchEpics will surface errors.
    }
  }, []);

  useEffect(() => {
    refreshAllEpics();
  }, [refreshAllEpics]);

  // Fetch epics
  const fetchEpics = useCallback(async () => {
    setEpicsLoading(true);
    try {
      const res = await epicService.getAll({
        page: epicsPaginationModel.page + 1,
        pageSize: epicsPaginationModel.pageSize,
        priority: epicFilterPriority || undefined,
        projectId: epicFilterProject || undefined,
        assignedTo: epicFilterAssignee || undefined,
        search: epicSearch || undefined,
      });
      const apiData = (res as any)?.data;
      if (Array.isArray(apiData)) {
        setEpics(apiData[0] || []);
        setEpicsTotalRows(apiData[1] || 0);
      } else {
        setEpics([]);
        setEpicsTotalRows(0);
      }
    } catch {
      enqueueSnackbar('Failed to load epics', { variant: 'error' });
    } finally {
      setEpicsLoading(false);
    }
  }, [epicsPaginationModel, epicFilterPriority, epicFilterProject, epicFilterAssignee, epicSearch, enqueueSnackbar]);

  useEffect(() => {
    fetchEpics();
  }, [fetchEpics]);

  useAutoRefresh(fetchEpics, [epicsPaginationModel, epicFilterPriority, epicFilterProject, epicFilterAssignee, epicSearch]);

  // Handlers
  const handleNewEpic = () => {
    setEditingEpic({
      projectId: '',
      title: '',
      labels: '',
      startDate: '',
      dueDate: '',
      priority: 'medium',
      assignedTo: '',
    });
    setEpicDialogOpen(true);
  };

  const handleEditEpic = (row: any) => {
    setEditingEpic({
      id: row.id,
      projectId: row.project_id || '',
      title: row.title || '',
      labels: row.labels || '',
      startDate: row.start_date || '',
      dueDate: row.due_date || '',
      priority: row.priority || 'medium',
      assignedTo: row.assigned_to || '',
    });
    setEpicDialogOpen(true);
  };

  const handleSaveEpic = async () => {
    if (!editingEpic.projectId) {
      enqueueSnackbar('Project is required', { variant: 'warning' });
      return;
    }
    if (!editingEpic.title.trim()) {
      enqueueSnackbar('Title is required', { variant: 'warning' });
      return;
    }
    if (!editingEpic.id) {
      const duplicate = epics.find(
        (e) =>
          e.title?.toLowerCase() === editingEpic.title.trim().toLowerCase() &&
          e.project_id === editingEpic.projectId
      );
      if (duplicate) {
        enqueueSnackbar('An epic with this title already exists in the selected project', { variant: 'warning' });
        return;
      }
    }
    if (!editingEpic.priority) {
      enqueueSnackbar('Priority is required', { variant: 'warning' });
      return;
    }
    if (!editingEpic.startDate) {
      enqueueSnackbar('Start date is required', { variant: 'warning' });
      return;
    }
    if (!editingEpic.dueDate) {
      enqueueSnackbar('Due date is required', { variant: 'warning' });
      return;
    }
    if (editingEpic.startDate && editingEpic.dueDate && editingEpic.dueDate < editingEpic.startDate) {
      enqueueSnackbar('Due date must be greater than or equal to start date', { variant: 'warning' });
      return;
    }
    try {
      const payload: Record<string, any> = {
        project_id: editingEpic.projectId || null,
        title: editingEpic.title,
        labels: editingEpic.labels || null,
        start_date: editingEpic.startDate || null,
        due_date: editingEpic.dueDate || null,
        priority: editingEpic.priority,
        assigned_to: editingEpic.assignedTo || null,
      };

      if (editingEpic.id) {
        await epicService.update(editingEpic.id, payload);
        enqueueSnackbar('Epic updated', { variant: 'success' });
      } else {
        await epicService.create(payload);
        enqueueSnackbar('Epic created', { variant: 'success' });
      }
      setEpicDialogOpen(false);
      fetchEpics();
      // Also refresh the full epic list so the User Story dialog picks up
      // newly-created / renamed epics without needing a page reload.
      refreshAllEpics();
    } catch (err: any) {
      enqueueSnackbar(err.response?.data?.message || 'Failed to save epic', {
        variant: 'error',
      });
    }
  };

  const handleDeleteEpic = async () => {
    if (!deleteId) return;
    try {
      await epicService.delete(deleteId);
      enqueueSnackbar('Epic deleted', { variant: 'success' });
      setDeleteDialogOpen(false);
      setDeleteId(null);
      fetchEpics();
      refreshAllEpics();
    } catch {
      enqueueSnackbar('Failed to delete epic', { variant: 'error' });
    }
  };

  // ── User Stories fetch & handlers ──────────────────────────────────────
  const fetchUserStories = useCallback(async () => {
    setStoriesLoading(true);
    try {
      const res = await userStoryService.getAll({
        page: storiesPaginationModel.page + 1,
        pageSize: storiesPaginationModel.pageSize,
        priority: storyFilterPriority || undefined,
        status: storyFilterStatus || undefined,
        projectId: storyFilterProject || undefined,
        epicId: storyFilterEpic || undefined,
        search: storySearch || undefined,
      });
      const apiData = (res as any)?.data;
      if (Array.isArray(apiData)) {
        setUserStories(apiData[0] || []);
        setStoriesTotalRows(apiData[1] || 0);
      } else {
        setUserStories([]);
        setStoriesTotalRows(0);
      }
    } catch {
      enqueueSnackbar('Failed to load user stories', { variant: 'error' });
    } finally {
      setStoriesLoading(false);
    }
  }, [storiesPaginationModel, storyFilterPriority, storyFilterStatus, storyFilterProject, storyFilterEpic, storySearch, enqueueSnackbar]);

  useEffect(() => {
    fetchUserStories();
  }, [fetchUserStories]);

  useAutoRefresh(fetchUserStories, [storiesPaginationModel, storyFilterPriority, storyFilterStatus, storyFilterProject, storyFilterEpic, storySearch]);

  const handleNewStory = () => {
    setEditingStory({
      epicId: '',
      projectId: '',
      title: '',
      description: '',
      acceptanceCriteria: '',
      priority: 'medium',
      status: 'open',
      storyPoints: '',
      assignedTo: '',
    });
    setStoryDialogOpen(true);
  };

  const handleEditStory = (row: any) => {
    setEditingStory({
      id: row.id,
      epicId: row.epic_id || '',
      projectId: row.project_id && projects.some((p) => p.id === row.project_id && p.is_active !== false) ? row.project_id : '',
      title: row.title || '',
      description: row.description || '',
      acceptanceCriteria: row.acceptance_criteria || '',
      priority: row.priority || 'medium',
      status: row.status || 'open',
      storyPoints: row.story_points != null ? String(row.story_points) : '',
      assignedTo: row.assigned_to || '',
    });
    setStoryDialogOpen(true);
  };

  const handleSaveStory = async () => {
    if (!editingStory.projectId) {
      enqueueSnackbar('Project is required', { variant: 'warning' });
      return;
    }
    if (!editingStory.epicId) {
      enqueueSnackbar('Epic is required', { variant: 'warning' });
      return;
    }
    if (!editingStory.title.trim()) {
      enqueueSnackbar('Title is required', { variant: 'warning' });
      return;
    }
    if (!editingStory.priority) {
      enqueueSnackbar('Priority is required', { variant: 'warning' });
      return;
    }
    if (!editingStory.status) {
      enqueueSnackbar('Status is required', { variant: 'warning' });
      return;
    }
    if (!editingStory.id) {
      const duplicate = userStories.find(
        (s) =>
          s.title?.toLowerCase() === editingStory.title.trim().toLowerCase() &&
          s.epic_id === editingStory.epicId &&
          s.project_id === editingStory.projectId
      );
      if (duplicate) {
        enqueueSnackbar('A user story with this title already exists in the selected epic', { variant: 'warning' });
        return;
      }
    }
    try {
      const payload: Record<string, any> = {
        epic_id: editingStory.epicId || null,
        project_id: editingStory.projectId || null,
        title: editingStory.title.trim(),
        description: editingStory.description || null,
        acceptance_criteria: editingStory.acceptanceCriteria || null,
        priority: editingStory.priority,
        status: editingStory.status,
        story_points: editingStory.storyPoints ? parseInt(editingStory.storyPoints, 10) : null,
        assigned_to: editingStory.assignedTo || null,
      };

      if (editingStory.id) {
        await userStoryService.update(editingStory.id, payload);
        enqueueSnackbar('User story updated', { variant: 'success' });
      } else {
        await userStoryService.create(payload);
        enqueueSnackbar('User story created', { variant: 'success' });
      }
      setStoryDialogOpen(false);
      fetchUserStories();
    } catch (err: any) {
      enqueueSnackbar(err.response?.data?.message || 'Failed to save user story', {
        variant: 'error',
      });
    }
  };

  const handleDeleteStory = async () => {
    if (!deleteId) return;
    try {
      await userStoryService.delete(deleteId);
      enqueueSnackbar('User story deleted', { variant: 'success' });
      setDeleteDialogOpen(false);
      setDeleteId(null);
      fetchUserStories();
    } catch {
      enqueueSnackbar('Failed to delete user story', { variant: 'error' });
    }
  };

  // ── User-stories bulk handlers ──────────────────────────────────────────

  const reportStoryBulkResult = (
    label: string,
    r: { succeeded: string[]; failed: { id: string; error: string }[] },
  ) => {
    if (r.succeeded.length > 0) {
      enqueueSnackbar(`${r.succeeded.length} user story(ies) ${label}`, { variant: 'success' });
    }
    if (r.failed.length > 0) {
      enqueueSnackbar(
        `${r.failed.length} user story(ies) skipped: ${r.failed[0].error}`,
        { variant: 'warning' },
      );
    }
  };

  const handleStoryBulkDelete = async () => {
    if (selectedStoryIds.length === 0) return;
    setStoryBulkBusy(true);
    try {
      const r = await userStoryService.bulkDelete(selectedStoryIds);
      reportStoryBulkResult('deleted', r);
      setSelectedStoryIds([]);
      setStoryBulkDeleteConfirm(false);
      fetchUserStories();
    } catch {
      enqueueSnackbar('Bulk delete failed', { variant: 'error' });
    } finally {
      setStoryBulkBusy(false);
    }
  };

  // Story points input is a select restricted to the Fibonacci scale.
  // Empty value = clear; the apply handler maps that to the
  // ``clear_story_points`` flag. The custom validate is defensive —
  // the dropdown already prevents typos.
  const validateStoryPoints = (raw: string): string | undefined => {
    if (raw === '') return undefined; // clears — legitimate
    if (!ALLOWED_STORY_POINTS.includes(Number(raw))) {
      return `Must be one of: ${ALLOWED_STORY_POINTS.join(', ')}`;
    }
    return undefined;
  };

  const storyBulkFields: BulkFieldSpec[] = [
    {
      key: 'status',
      label: 'Change status',
      type: 'select',
      options: [
        { value: 'open', label: 'Open' },
        { value: 'in_progress', label: 'In Progress' },
        { value: 'done', label: 'Done' },
        { value: 'closed', label: 'Closed' },
      ],
    },
    {
      key: 'priority',
      label: 'Change priority',
      type: 'select',
      options: [
        { value: 'low', label: 'Low' },
        { value: 'medium', label: 'Medium' },
        { value: 'high', label: 'High' },
        { value: 'critical', label: 'Critical' },
      ],
    },
    {
      key: 'storyPoints',
      label: 'Change story points',
      type: 'select',
      // Empty value = clear story points; Fibonacci-only otherwise.
      required: false,
      validate: validateStoryPoints,
      helperText: `Fibonacci scale: ${ALLOWED_STORY_POINTS.join(', ')}`,
      options: [
        { value: '', label: 'None (clear)' },
        ...ALLOWED_STORY_POINTS.map((sp) => ({ value: String(sp), label: String(sp) })),
      ],
    },
    {
      key: 'epicId',
      label: 'Change epic',
      type: 'select',
      // Empty value = clear epic linkage.
      required: false,
      options: [
        { value: '', label: 'No epic' },
        ...allEpics.map((e) => ({ value: e.id, label: e.title })),
      ],
    },
    {
      key: 'assignedTo',
      label: 'Change assignee',
      type: 'select',
      required: false, // empty = unassign
      options: [
        { value: '', label: 'Unassigned' },
        ...users.map((u) => ({ value: u.id, label: u.full_name || u.email })),
      ],
    },
  ];
  const storyBulkEdit = useBulkEdit(storyBulkFields);

  const openStoryBulkEdit = () => {
    storyBulkEdit.reset();
    setStoryBulkResult(null);
    setStoryBulkEditOpen(true);
  };

  const handleStoryBulkApply = async () => {
    if (selectedStoryIds.length === 0) return;
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

    const changes = storyBulkEdit.changedFields;
    setStoryBulkBusy(true);
    const perField: FieldResult[] = [];
    try {
      const fields: {
        status?: string; priority?: string;
        epic_id?: string; clear_epic?: boolean;
        assigned_to?: string; unassign?: boolean;
        story_points?: number; clear_story_points?: boolean;
      } = {};
      const labels: string[] = [];
      if (changes.status) {
        fields.status = changes.status;
        labels.push(`Status → ${changes.status}`);
      }
      if (changes.priority) {
        fields.priority = changes.priority;
        labels.push(`Priority → ${changes.priority}`);
      }
      if ('epicId' in changes) {
        if (changes.epicId) {
          fields.epic_id = changes.epicId;
          const ep = allEpics.find((e) => e.id === changes.epicId);
          labels.push(`Epic → ${ep?.title || changes.epicId}`);
        } else {
          fields.clear_epic = true;
          labels.push('Epic → (none)');
        }
      }
      if ('assignedTo' in changes) {
        if (changes.assignedTo) {
          fields.assigned_to = changes.assignedTo;
          const u = users.find((u) => u.id === changes.assignedTo);
          labels.push(`Assignee → ${u?.full_name || u?.email || changes.assignedTo}`);
        } else {
          fields.unassign = true;
          labels.push('Assignee → Unassigned');
        }
      }
      if ('storyPoints' in changes) {
        if (changes.storyPoints === '') {
          fields.clear_story_points = true;
          labels.push('Story Points → (none)');
        } else {
          const n = Number(changes.storyPoints);
          fields.story_points = n;
          labels.push(`Story Points → ${n}`);
        }
      }
      if (Object.keys(fields).length > 0) {
        const r = await userStoryService.bulkUpdate(selectedStoryIds, fields);
        perField.push(summarize(labels.join(' / '), r));
      }
      setStoryBulkResult({ perField });
      setSelectedStoryIds([]);
      fetchUserStories();
    } catch {
      enqueueSnackbar('Bulk update failed', { variant: 'error' });
    } finally {
      setStoryBulkBusy(false);
    }
  };

  const handleCloneStory = async (row: any) => {
    try {
      const payload = {
        epic_id: row.epic_id || null,
        project_id: row.project_id || null,
        title: `${row.title} (Copy)`,
        description: row.description || null,
        acceptance_criteria: row.acceptance_criteria || null,
        priority: row.priority || 'medium',
        status: 'open',
        story_points: row.story_points || null,
        assigned_to: null,
      };
      await userStoryService.create(payload);
      enqueueSnackbar('User story cloned', { variant: 'success' });
      fetchUserStories();
    } catch {
      enqueueSnackbar('Failed to clone user story', { variant: 'error' });
    }
  };

  const handleExportEpics = async () => {
    try {
      const res = await epicService.getAll({
        page: 1,
        pageSize: 10000,
        priority: epicFilterPriority || undefined,
        projectId: epicFilterProject || undefined,
        assignedTo: epicFilterAssignee || undefined,
        search: epicSearch || undefined,
      });
      const apiData = (res as any)?.data;
      const allEpics = Array.isArray(apiData) ? apiData[0] || [] : [];
      const exportData = allEpics.map((e: any) => ({
        Title: e.title || '',
        'Project Code': e.project_code || '',
        Project: e.project_name || '',
        Labels: e.labels || '',
        'Start Date': e.start_date || '',
        'Due Date': e.due_date || '',
        Priority: e.priority || '',
        Assignee: e.assignee || '',
        'Created By': e.created_by_name || '',
        'Created At': e.created_at ? new Date(e.created_at).toLocaleDateString() : '',
      }));
      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Epics');
      XLSX.writeFile(wb, 'Epics.xlsx');
    } catch {
      enqueueSnackbar('Failed to export epics', { variant: 'error' });
    }
  };

  const handleExportUserStories = async () => {
    try {
      const res = await userStoryService.getAll({
        page: 1,
        pageSize: 10000,
        priority: storyFilterPriority || undefined,
        status: storyFilterStatus || undefined,
        projectId: storyFilterProject || undefined,
        epicId: storyFilterEpic || undefined,
        search: storySearch || undefined,
      });
      const apiData = (res as any)?.data;
      const allStories = Array.isArray(apiData) ? apiData[0] || [] : [];
      const exportData = allStories.map((s: any) => ({
        Title: s.title || '',
        Project: s.project_name || '',
        Epic: s.epic_title || '',
        Description: s.description || '',
        'Acceptance Criteria': s.acceptance_criteria || '',
        Priority: s.priority || '',
        Status: s.status || '',
        'Story Points': s.story_points ?? '',
        Assignee: s.assignee || '',
        'Created By': s.created_by_name || '',
        'Created At': s.created_at ? new Date(s.created_at).toLocaleDateString() : '',
      }));
      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'User Stories');
      XLSX.writeFile(wb, 'User_Stories.xlsx');
    } catch {
      enqueueSnackbar('Failed to export user stories', { variant: 'error' });
    }
  };

  // Columns
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

  const formatDateOnly = (raw: string | null | undefined) => {
    if (!raw) return null;
    try {
      return format(new Date(raw), 'MMM dd, yyyy');
    } catch {
      return null;
    }
  };

  const formatDateTime = (raw: string | null | undefined) => {
    if (!raw) return null;
    try {
      return format(new Date(raw), 'MMM dd, yyyy HH:mm');
    } catch {
      return null;
    }
  };

  const epicColumns: GridColDef[] = [
    {
      field: 'id',
      headerName: 'ID',
      width: 90,
      renderCell: (params) => (
        <Typography variant="body2" color="text.secondary" sx={{ pt: 1 }}>
          {params.value ? params.value.substring(0, 8) : '—'}
        </Typography>
      ),
    },
    { field: 'project_code', headerName: 'Project Code', width: 120 },
    {
      field: 'project_name',
      headerName: 'Project',
      width: 180,
      renderCell: (params) => {
        const inactive = params.row.is_project_active === false;
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
    { field: 'title', headerName: 'Title', flex: 1, minWidth: 160 },
    {
      field: 'labels',
      headerName: 'Labels',
      minWidth: 180,
      flex: 0.5,
      autoHeight: true,
      wrapText: true,
      renderCell: (params) => {
        if (!params.value) {
          return <Typography variant="body2" color="text.secondary">—</Typography>;
        }
        const arr = String(params.value).split(',').map((s: string) => s.trim()).filter(Boolean);
        return (
          <Box display="flex" gap={0.5} flexWrap="wrap" alignItems="center" sx={{ py: 1, lineHeight: 1.8 }}>
            {arr.map((label: string, i: number) => (
              <Chip
                key={i}
                label={label}
                size="small"
                sx={{
                  fontSize: 11,
                  fontWeight: 600,
                  backgroundColor: 'rgba(245,124,0,0.08)',
                  color: '#f57c00',
                  border: '1px solid rgba(245,124,0,0.25)',
                }}
              />
            ))}
          </Box>
        );
      },
    },
    {
      field: 'start_date',
      headerName: 'Start Date',
      width: 110,
      renderCell: (params) => {
        if (!params.value) return <Typography variant="body2" color="text.secondary">—</Typography>;
        try {
          return format(new Date(params.value), 'MMM dd, yyyy');
        } catch {
          return '—';
        }
      },
    },
    {
      field: 'due_date',
      headerName: 'Due Date',
      width: 110,
      renderCell: (params) => {
        if (!params.value) return <Typography variant="body2" color="text.secondary">—</Typography>;
        try {
          return format(new Date(params.value), 'MMM dd, yyyy');
        } catch {
          return '—';
        }
      },
    },
    {
      field: 'priority',
      headerName: 'Priority',
      width: 100,
      renderCell: (params) => {
        const val = (params.value || '').toLowerCase();
        const cfg = PRIORITY_CONFIG[val];
        if (!cfg) return params.value || '—';
        return (
          <Chip
            label={params.value}
            size="small"
            sx={{
              fontWeight: 600,
              fontSize: 11,
              textTransform: 'capitalize',
              backgroundColor: cfg.bg,
              color: cfg.color,
              border: `1px solid ${cfg.border}`,
            }}
          />
        );
      },
    },
    { field: 'assignee', headerName: 'Assignee', width: 120, renderCell: (params) => params.value || 'N/A' },
    { field: 'created_by_name', headerName: 'Created By', width: 120 },
    {
      field: 'created_at',
      headerName: 'Created',
      width: 110,
      renderCell: (params) => {
        if (!params.value) return '—';
        try {
          return format(new Date(params.value), 'MMM dd, yyyy');
        } catch {
          return '—';
        }
      },
    },
    ...(userCanEdit
      ? [
          {
            field: 'actions',
            headerName: 'Actions',
            width: 150,
            sortable: false,
            pinned: 'right',
            renderCell: (params: any) => (
              <Box display="flex" gap={0.5}>
                <Button
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleEditEpic(params.row);
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
                    setDeleteType('epic');
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

  const STATUS_CONFIG: Record<string, { bg: string; color: string; border: string }> = {
    open: { bg: 'rgba(59,130,246,0.08)', color: '#2563eb', border: 'rgba(59,130,246,0.3)' },
    in_progress: { bg: 'rgba(245,124,0,0.08)', color: '#f57c00', border: 'rgba(245,124,0,0.3)' },
    done: { bg: 'rgba(16,185,129,0.08)', color: '#059669', border: 'rgba(16,185,129,0.3)' },
    closed: { bg: 'rgba(107,114,128,0.08)', color: '#6b7280', border: 'rgba(107,114,128,0.3)' },
  };

  const storyColumns: GridColDef[] = [
    {
      field: 'id',
      headerName: 'ID',
      width: 90,
      renderCell: (params) => (
        <Typography variant="body2" color="text.secondary" sx={{ pt: 1 }}>
          {params.value ? params.value.substring(0, 8) : '—'}
        </Typography>
      ),
    },
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
    { field: 'title', headerName: 'Title', flex: 1, minWidth: 200 },
    {
      field: 'priority',
      headerName: 'Priority',
      width: 100,
      renderCell: (params) => {
        const val = (params.value || '').toLowerCase();
        const cfg = PRIORITY_CONFIG[val];
        if (!cfg) return params.value || '—';
        return (
          <Chip
            label={params.value}
            size="small"
            sx={{
              fontWeight: 600,
              fontSize: 11,
              textTransform: 'capitalize',
              backgroundColor: cfg.bg,
              color: cfg.color,
              border: `1px solid ${cfg.border}`,
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
        const val = (params.value || '').toLowerCase();
        const cfg = STATUS_CONFIG[val] || { bg: 'rgba(107,114,128,0.08)', color: '#6b7280', border: 'rgba(107,114,128,0.3)' };
        const label = (params.value || '').replace('_', ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
        return (
          <Chip
            label={label}
            size="small"
            sx={{
              fontWeight: 600,
              fontSize: 11,
              backgroundColor: cfg.bg,
              color: cfg.color,
              border: `1px solid ${cfg.border}`,
            }}
          />
        );
      },
    },
    { field: 'story_points', headerName: 'Points', width: 80, renderCell: (params) => params.value != null ? String(params.value) : '' },
    { field: 'assignee', headerName: 'Assignee', width: 120, renderCell: (params) => params.value || 'N/A' },
    { field: 'created_by_name', headerName: 'Created By', width: 120 },
    {
      field: 'created_at',
      headerName: 'Created',
      width: 110,
      renderCell: (params) => {
        if (!params.value) return '—';
        try {
          return format(new Date(params.value), 'MMM dd, yyyy');
        } catch {
          return '—';
        }
      },
    },
    ...(userCanEdit
      ? [
          {
            field: 'actions',
            headerName: 'Actions',
            width: 210,
            sortable: false,
            renderCell: (params: any) => (
              <Box display="flex" gap={0.5}>
                <Button
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleEditStory(params.row);
                  }}
                >
                  Edit
                </Button>
                <Button
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCloneStory(params.row);
                  }}
                >
                  Clone
                </Button>
                <Button
                  size="small"
                  color="error"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteId(params.row.id);
                    setDeleteType('story');
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
        Requirements
      </Typography>

      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs
          value={tabIndex}
          onChange={(_, newValue) => setTabIndex(newValue)}
          sx={{
            '& .MuiTab-root': {
              fontWeight: 600,
              textTransform: 'none',
              fontSize: '0.95rem',
              minHeight: 48,
            },
            '& .Mui-selected': {
              color: '#f57c00',
            },
            '& .MuiTabs-indicator': {
              backgroundColor: '#f57c00',
              height: 3,
              borderRadius: '3px 3px 0 0',
            },
          }}
        >
          <Tab label="Epics" />
          <Tab label="User Stories" />
        </Tabs>
      </Box>

      {/* ── Epics Tab ──────────────────────────────────────────────────────── */}
      <TabPanel value={tabIndex} index={0}>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
          <Box display="flex" gap={2} flexWrap="wrap" alignItems="center">
            <FilterIcon color="action" />
            <TextField
              size="small"
              placeholder="Search title..."
              value={epicSearch}
              onChange={(e) => setEpicSearch(e.target.value)}
              InputProps={{ startAdornment: <SearchIcon sx={{ mr: 1, color: 'action.active' }} /> }}
              sx={{ minWidth: 220 }}
            />
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel sx={{ fontWeight: 600, color: 'text.primary', '&.Mui-focused': { color: 'primary.main' }, '&.MuiInputLabel-shrink': { fontWeight: 700, fontSize: '0.95rem' } }}>Project</InputLabel>
              <Select value={epicFilterProject} onChange={(e) => setEpicFilterProject(e.target.value)} label="Project">
                <MenuItem value="">All</MenuItem>
                {projects.map((p) => (
                  <MenuItem key={p.id} value={p.id}>{p.code} - {p.name}{p.is_active === false ? ' (Inactive)' : ''}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel sx={{ fontWeight: 600, color: 'text.primary', '&.Mui-focused': { color: 'primary.main' }, '&.MuiInputLabel-shrink': { fontWeight: 700, fontSize: '0.95rem' } }}>Priority</InputLabel>
              <Select value={epicFilterPriority} onChange={(e) => setEpicFilterPriority(e.target.value)} label="Priority">
                <MenuItem value="">All</MenuItem>
                <MenuItem value="low">Low</MenuItem>
                <MenuItem value="medium">Medium</MenuItem>
                <MenuItem value="high">High</MenuItem>
                <MenuItem value="critical">Critical</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel sx={{ fontWeight: 600, color: 'text.primary', '&.Mui-focused': { color: 'primary.main' }, '&.MuiInputLabel-shrink': { fontWeight: 700, fontSize: '0.95rem' } }}>Assignee</InputLabel>
              <Select value={epicFilterAssignee} onChange={(e) => setEpicFilterAssignee(e.target.value)} label="Assignee">
                <MenuItem value="">All</MenuItem>
                <MenuItem value="unassigned">Unassigned</MenuItem>
                {users.map((u) => (
                  <MenuItem key={u.id} value={u.id}>{u.full_name || u.email}</MenuItem>
                ))}
              </Select>
            </FormControl>
            {(epicSearch || epicFilterPriority || epicFilterProject || epicFilterAssignee) && (
              <Button
                size="small"
                startIcon={<ClearIcon />}
                onClick={() => {
                  setEpicSearch('');
                  setEpicFilterPriority('');
                  setEpicFilterProject('');
                  setEpicFilterAssignee('');
                }}
              >
                Clear Filters
              </Button>
            )}
          </Box>
          <Box display="flex" gap={1}>
            <Button variant="outlined" startIcon={<ExportIcon />} onClick={handleExportEpics}>
              Export to Excel
            </Button>
            {userCanEdit && (
              <Button variant="contained" startIcon={<AddIcon />} onClick={handleNewEpic}>
                New Epic
              </Button>
            )}
          </Box>
        </Box>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: 'block', mb: 1, fontStyle: 'italic' }}
        >
          Tip: double-click a row to open epic details.
        </Typography>
        <DataTable
          rows={epics}
          columns={epicColumns}
          totalRows={epicsTotalRows}
          loading={epicsLoading}
          paginationModel={epicsPaginationModel}
          onPaginationModelChange={setEpicsPaginationModel}
          getRowId={(row) => row.id}
          onRowDoubleClick={({ row }) => {
            setViewEpic(row);
            setEpicViewDialogOpen(true);
          }}
        />
      </TabPanel>

      {/* ── User Stories Tab ───────────────────────────────────────────────── */}
      <TabPanel value={tabIndex} index={1}>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
          <Box display="flex" gap={2} flexWrap="wrap" alignItems="center">
            <FilterIcon color="action" />
            <TextField
              size="small"
              placeholder="Search title..."
              value={storySearch}
              onChange={(e) => setStorySearch(e.target.value)}
              InputProps={{ startAdornment: <SearchIcon sx={{ mr: 1, color: 'action.active' }} /> }}
              sx={{ minWidth: 220 }}
            />
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel sx={{ fontWeight: 600, color: 'text.primary', '&.Mui-focused': { color: 'primary.main' }, '&.MuiInputLabel-shrink': { fontWeight: 700, fontSize: '0.95rem' } }}>Project</InputLabel>
              <Select value={storyFilterProject} onChange={(e) => { setStoryFilterProject(e.target.value); setStoryFilterEpic(''); }} label="Project">
                <MenuItem value="">All</MenuItem>
                {projects.map((p) => (
                  <MenuItem key={p.id} value={p.id}>{p.code} - {p.name}{p.is_active === false ? ' (Inactive)' : ''}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel sx={{ fontWeight: 600, color: 'text.primary', '&.Mui-focused': { color: 'primary.main' }, '&.MuiInputLabel-shrink': { fontWeight: 700, fontSize: '0.95rem' } }}>Epic</InputLabel>
              <Select value={storyFilterEpic} onChange={(e) => setStoryFilterEpic(e.target.value)} label="Epic">
                <MenuItem value="">All</MenuItem>
                {(storyFilterProject ? allEpics.filter((e) => e.project_id === storyFilterProject) : allEpics).map((e) => (
                  <MenuItem key={e.id} value={e.id}>{e.title}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel sx={{ fontWeight: 600, color: 'text.primary', '&.Mui-focused': { color: 'primary.main' }, '&.MuiInputLabel-shrink': { fontWeight: 700, fontSize: '0.95rem' } }}>Priority</InputLabel>
              <Select value={storyFilterPriority} onChange={(e) => setStoryFilterPriority(e.target.value)} label="Priority">
                <MenuItem value="">All</MenuItem>
                <MenuItem value="low">Low</MenuItem>
                <MenuItem value="medium">Medium</MenuItem>
                <MenuItem value="high">High</MenuItem>
                <MenuItem value="critical">Critical</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel sx={{ fontWeight: 600, color: 'text.primary', '&.Mui-focused': { color: 'primary.main' }, '&.MuiInputLabel-shrink': { fontWeight: 700, fontSize: '0.95rem' } }}>Status</InputLabel>
              <Select value={storyFilterStatus} onChange={(e) => setStoryFilterStatus(e.target.value)} label="Status">
                <MenuItem value="">All</MenuItem>
                <MenuItem value="open">Open</MenuItem>
                <MenuItem value="in_progress">In Progress</MenuItem>
                <MenuItem value="done">Done</MenuItem>
                <MenuItem value="closed">Closed</MenuItem>
              </Select>
            </FormControl>
          </Box>
          <Box display="flex" gap={1} flexShrink={0} alignItems="center">
            {(storySearch || storyFilterPriority || storyFilterStatus || storyFilterProject || storyFilterEpic) && (
              <Button
                size="small"
                startIcon={<ClearIcon />}
                sx={{ whiteSpace: 'nowrap' }}
                onClick={() => {
                  setStorySearch('');
                  setStoryFilterPriority('');
                  setStoryFilterStatus('');
                  setStoryFilterProject('');
                  setStoryFilterEpic('');
                }}
              >
                Clear Filters
              </Button>
            )}
            <Button variant="outlined" startIcon={<ExportIcon />} onClick={handleExportUserStories} sx={{ whiteSpace: 'nowrap' }}>
              Export to Excel
            </Button>
            {userCanEdit && (
              <Button variant="contained" startIcon={<AddIcon />} onClick={handleNewStory}>
                New User Story
              </Button>
            )}
          </Box>
        </Box>
        {/* Bulk action bar — visible only when stories are selected. */}
        {userCanEdit && selectedStoryIds.length > 0 && (
          <Box
            role="toolbar"
            aria-label="User story bulk actions"
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
              {selectedStoryIds.length} selected
            </Typography>
            <Button
              size="small"
              variant="contained"
              onClick={openStoryBulkEdit}
              disabled={storyBulkBusy}
            >
              Bulk update…
            </Button>
            <Button
              size="small"
              variant="outlined"
              color="error"
              onClick={() => setStoryBulkDeleteConfirm(true)}
              disabled={storyBulkBusy}
            >
              Delete
            </Button>
            <Box flexGrow={1} />
            <Button
              size="small"
              onClick={() => setSelectedStoryIds([])}
              disabled={storyBulkBusy}
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
          Tip: double-click a row to open user story details.
        </Typography>
        <DataTable
          rows={userStories}
          columns={storyColumns}
          totalRows={storiesTotalRows}
          loading={storiesLoading}
          paginationModel={storiesPaginationModel}
          onPaginationModelChange={setStoriesPaginationModel}
          getRowId={(row) => row.id}
          onRowDoubleClick={({ row }) => {
            setViewStory(row);
            setStoryViewDialogOpen(true);
          }}
          checkboxSelection={userCanEdit}
          rowSelectionModel={selectedStoryIds}
          onRowSelectionModelChange={setSelectedStoryIds}
        />
      </TabPanel>

      {/* ── Create / Edit Epic Dialog ──────────────────────────────────────── */}
      <Dialog
        open={epicDialogOpen}
        onClose={() => setEpicDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 600, color: 'secondary.main' }}>
          {editingEpic.id ? 'Edit Epic' : 'New Epic'}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid item xs={12}>
              <FormControl fullWidth required error={epicDialogOpen && !editingEpic.projectId}>
                <InputLabel>Project</InputLabel>
                <Select
                  value={editingEpic.projectId}
                  onChange={(e) =>
                    setEditingEpic((prev) => ({ ...prev, projectId: e.target.value }))
                  }
                  label="Project"
                >
                  <MenuItem value="" disabled>— None —</MenuItem>
                  {projects.filter((p) => p.is_active !== false).map((p) => (
                    <MenuItem key={p.id} value={p.id}>
                      {p.code} - {p.name}
                    </MenuItem>
                  ))}
                </Select>
                {epicDialogOpen && !editingEpic.projectId && (
                  <FormHelperText>Project is required</FormHelperText>
                )}
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Title"
                fullWidth
                required
                value={editingEpic.title}
                onChange={(e) =>
                  setEditingEpic((prev) => ({ ...prev, title: e.target.value }))
                }
                error={
                  !!(epicDialogOpen &&
                  (!editingEpic.title.trim() ||
                    (!editingEpic.id &&
                      editingEpic.projectId &&
                      epics.find(
                        (e) =>
                          e.title?.toLowerCase() === editingEpic.title.trim().toLowerCase() &&
                          e.project_id === editingEpic.projectId
                      ))))
                }
                helperText={
                  epicDialogOpen && !editingEpic.title.trim()
                    ? 'Title is required'
                    : !editingEpic.id &&
                        editingEpic.projectId &&
                        epics.find(
                          (e) =>
                            e.title?.toLowerCase() === editingEpic.title.trim().toLowerCase() &&
                            e.project_id === editingEpic.projectId
                        )
                      ? 'An epic with this title already exists in the selected project'
                      : ''
                }
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Labels"
                fullWidth
                placeholder="e.g. backend, auth, sprint-1 (comma separated)"
                value={editingEpic.labels}
                onChange={(e) =>
                  setEditingEpic((prev) => ({ ...prev, labels: e.target.value }))
                }
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                label="Start Date"
                type="date"
                fullWidth
                required
                InputLabelProps={{ shrink: true }}
                value={editingEpic.startDate}
                onChange={(e) =>
                  setEditingEpic((prev) => ({ ...prev, startDate: e.target.value }))
                }
                error={epicDialogOpen && !editingEpic.startDate}
                helperText={epicDialogOpen && !editingEpic.startDate ? 'Start date is required' : ''}
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                label="Due Date"
                type="date"
                fullWidth
                required
                InputLabelProps={{ shrink: true }}
                inputProps={{ min: editingEpic.startDate || undefined }}
                value={editingEpic.dueDate}
                onChange={(e) =>
                  setEditingEpic((prev) => ({ ...prev, dueDate: e.target.value }))
                }
                error={!!(epicDialogOpen && (!editingEpic.dueDate || (editingEpic.startDate && editingEpic.dueDate && editingEpic.dueDate < editingEpic.startDate)))}
                helperText={
                  epicDialogOpen && !editingEpic.dueDate
                    ? 'Due date is required'
                    : editingEpic.startDate && editingEpic.dueDate && editingEpic.dueDate < editingEpic.startDate
                      ? 'Due date must be greater than or equal to start date'
                      : ''
                }
              />
            </Grid>
            <Grid item xs={6}>
              <FormControl fullWidth required error={epicDialogOpen && !editingEpic.priority}>
                <InputLabel>Priority</InputLabel>
                <Select
                  value={editingEpic.priority}
                  onChange={(e) =>
                    setEditingEpic((prev) => ({ ...prev, priority: e.target.value }))
                  }
                  label="Priority"
                >
                  <MenuItem value="low">Low</MenuItem>
                  <MenuItem value="medium">Medium</MenuItem>
                  <MenuItem value="high">High</MenuItem>
                  <MenuItem value="critical">Critical</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={6}>
              <FormControl fullWidth>
                <InputLabel>Assignee</InputLabel>
                <Select
                  value={editingEpic.assignedTo}
                  onChange={(e) =>
                    setEditingEpic((prev) => ({ ...prev, assignedTo: e.target.value }))
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
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEpicDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSaveEpic}
            disabled={
              !editingEpic.projectId ||
              !editingEpic.title.trim() ||
              !editingEpic.priority ||
              !editingEpic.startDate ||
              !editingEpic.dueDate ||
              (!editingEpic.id && !!epics.find(
                (e) =>
                  e.title?.toLowerCase() === editingEpic.title.trim().toLowerCase() &&
                  e.project_id === editingEpic.projectId
              )) ||
              !!(editingEpic.startDate && editingEpic.dueDate && editingEpic.dueDate < editingEpic.startDate)
            }
          >
            {editingEpic.id ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Create / Edit User Story Dialog ─────────────────────────────── */}
      <Dialog
        open={storyDialogOpen}
        onClose={() => setStoryDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 600, color: 'secondary.main' }}>
          {editingStory.id ? 'Edit User Story' : 'New User Story'}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth required error={storyDialogOpen && !editingStory.projectId}>
                <InputLabel>Project</InputLabel>
                <Select
                  value={editingStory.projectId}
                  onChange={(e) =>
                    setEditingStory((prev) => ({ ...prev, projectId: e.target.value, epicId: '' }))
                  }
                  label="Project"
                >
                  <MenuItem value="" disabled>— None —</MenuItem>
                  {projects.filter((p) => p.is_active !== false).map((p) => (
                    <MenuItem key={p.id} value={p.id}>
                      {p.code} - {p.name}
                    </MenuItem>
                  ))}
                </Select>
                {storyDialogOpen && !editingStory.projectId && (
                  <FormHelperText>Project is required</FormHelperText>
                )}
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth required error={storyDialogOpen && !editingStory.epicId} disabled={!editingStory.projectId}>
                <InputLabel>Epic</InputLabel>
                <Select
                  value={editingStory.epicId}
                  onChange={(e) =>
                    setEditingStory((prev) => ({ ...prev, epicId: e.target.value }))
                  }
                  label="Epic"
                >
                  <MenuItem value="" disabled>— None —</MenuItem>
                  {allEpics
                    .filter((ep) => ep.project_id === editingStory.projectId)
                    .map((ep) => (
                      <MenuItem key={ep.id} value={ep.id}>
                        {ep.title}
                      </MenuItem>
                    ))}
                </Select>
                {storyDialogOpen && !editingStory.epicId && (
                  <FormHelperText>Epic is required</FormHelperText>
                )}
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Title"
                fullWidth
                required
                value={editingStory.title}
                onChange={(e) =>
                  setEditingStory((prev) => ({ ...prev, title: e.target.value }))
                }
                error={
                  !!(storyDialogOpen &&
                  (!editingStory.title.trim() ||
                    (!editingStory.id &&
                      editingStory.epicId &&
                      editingStory.projectId &&
                      userStories.find(
                        (s) =>
                          s.title?.toLowerCase() === editingStory.title.trim().toLowerCase() &&
                          s.epic_id === editingStory.epicId &&
                          s.project_id === editingStory.projectId
                      ))))
                }
                helperText={
                  storyDialogOpen && !editingStory.title.trim()
                    ? 'Title is required'
                    : !editingStory.id &&
                        editingStory.epicId &&
                        editingStory.projectId &&
                        userStories.find(
                          (s) =>
                            s.title?.toLowerCase() === editingStory.title.trim().toLowerCase() &&
                            s.epic_id === editingStory.epicId &&
                            s.project_id === editingStory.projectId
                        )
                      ? 'A user story with this title already exists in the selected epic'
                      : ''
                }
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Description"
                fullWidth
                multiline
                rows={3}
                value={editingStory.description}
                onChange={(e) =>
                  setEditingStory((prev) => ({ ...prev, description: e.target.value }))
                }
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Acceptance Criteria"
                fullWidth
                multiline
                rows={3}
                value={editingStory.acceptanceCriteria}
                onChange={(e) =>
                  setEditingStory((prev) => ({ ...prev, acceptanceCriteria: e.target.value }))
                }
              />
            </Grid>
            <Grid item xs={6} sm={4}>
              <FormControl fullWidth required error={storyDialogOpen && !editingStory.priority}>
                <InputLabel>Priority</InputLabel>
                <Select
                  value={editingStory.priority}
                  onChange={(e) =>
                    setEditingStory((prev) => ({ ...prev, priority: e.target.value }))
                  }
                  label="Priority"
                >
                  <MenuItem value="low">Low</MenuItem>
                  <MenuItem value="medium">Medium</MenuItem>
                  <MenuItem value="high">High</MenuItem>
                  <MenuItem value="critical">Critical</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={6} sm={4}>
              <FormControl fullWidth required error={storyDialogOpen && !editingStory.status}>
                <InputLabel>Status</InputLabel>
                <Select
                  value={editingStory.status}
                  onChange={(e) =>
                    setEditingStory((prev) => ({ ...prev, status: e.target.value }))
                  }
                  label="Status"
                >
                  <MenuItem value="open">Open</MenuItem>
                  <MenuItem value="in_progress">In Progress</MenuItem>
                  <MenuItem value="done">Done</MenuItem>
                  <MenuItem value="closed">Closed</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={6} sm={4}>
              <FormControl fullWidth>
                <InputLabel>Story Points</InputLabel>
                <Select
                  label="Story Points"
                  value={editingStory.storyPoints}
                  onChange={(e) =>
                    setEditingStory((prev) => ({ ...prev, storyPoints: e.target.value as string }))
                  }
                >
                  <MenuItem value="">None</MenuItem>
                  {ALLOWED_STORY_POINTS.map((point) => (
                    <MenuItem key={point} value={String(point)}>
                      {point}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Assignee</InputLabel>
                <Select
                  value={editingStory.assignedTo}
                  onChange={(e) =>
                    setEditingStory((prev) => ({ ...prev, assignedTo: e.target.value }))
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
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStoryDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSaveStory}
            disabled={
              !editingStory.projectId ||
              !editingStory.epicId ||
              !editingStory.title.trim() ||
              !editingStory.priority ||
              !editingStory.status ||
              (!editingStory.id && !!userStories.find(
                (s) =>
                  s.title?.toLowerCase() === editingStory.title.trim().toLowerCase() &&
                  s.epic_id === editingStory.epicId &&
                  s.project_id === editingStory.projectId
              ))
            }
          >
            {editingStory.id ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Epic Detail (read-only) ────────────────────────────────────────── */}
      <ViewDialog
        open={epicViewDialogOpen}
        onClose={() => setEpicViewDialogOpen(false)}
        title={
          <>
            <Typography variant="h6" fontWeight={700} component="span">
              {viewEpic?.title || 'Epic'}
            </Typography>
            {viewEpic?.priority && (() => {
              const cfg = PRIORITY_CONFIG[(viewEpic.priority || '').toLowerCase()];
              return cfg ? (
                <Chip
                  label={viewEpic.priority}
                  size="small"
                  sx={{
                    fontWeight: 600,
                    textTransform: 'capitalize',
                    backgroundColor: cfg.bg,
                    color: cfg.color,
                    border: `1px solid ${cfg.border}`,
                  }}
                />
              ) : null;
            })()}
            {viewEpic?.project_code && (
              <Chip
                label={viewEpic.project_code}
                size="small"
                sx={{ fontWeight: 600, bgcolor: 'action.selected' }}
              />
            )}
          </>
        }
        onEdit={
          userCanEdit && viewEpic
            ? () => {
                setEpicViewDialogOpen(false);
                handleEditEpic(viewEpic);
              }
            : undefined
        }
      >
        {viewEpic && (
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <DetailRow label="Project" value={viewEpic.project_name} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <DetailRow label="Assignee" value={viewEpic.assignee} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <DetailRow label="Start Date" value={formatDateOnly(viewEpic.start_date)} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <DetailRow label="Due Date" value={formatDateOnly(viewEpic.due_date)} />
            </Grid>
            <Grid item xs={12}>
              <DetailRow
                label="Labels"
                value={
                  viewEpic.labels ? (
                    <Box display="flex" gap={0.5} flexWrap="wrap" sx={{ mt: 0.5 }}>
                      {String(viewEpic.labels)
                        .split(',')
                        .map((l: string) => l.trim())
                        .filter(Boolean)
                        .map((label: string, i: number) => (
                          <Chip
                            key={i}
                            label={label}
                            size="small"
                            sx={{
                              fontSize: 11,
                              fontWeight: 600,
                              backgroundColor: 'rgba(245,124,0,0.08)',
                              color: '#f57c00',
                              border: '1px solid rgba(245,124,0,0.25)',
                            }}
                          />
                        ))}
                    </Box>
                  ) : null
                }
              />
            </Grid>
            <Grid item xs={12}>
              <Divider sx={{ my: 1 }} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <DetailRow label="Created By" value={viewEpic.created_by_name} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <DetailRow label="Created" value={formatDateTime(viewEpic.created_at)} />
            </Grid>
            {viewEpic.updated_at && (
              <Grid item xs={12} sm={6}>
                <DetailRow label="Last Updated" value={formatDateTime(viewEpic.updated_at)} />
              </Grid>
            )}
          </Grid>
        )}
      </ViewDialog>

      {/* ── User Story Detail (read-only) ──────────────────────────────────── */}
      <ViewDialog
        open={storyViewDialogOpen}
        onClose={() => setStoryViewDialogOpen(false)}
        title={
          <>
            <Typography variant="h6" fontWeight={700} component="span">
              {viewStory?.title || 'User Story'}
            </Typography>
            {viewStory?.priority && (() => {
              const cfg = PRIORITY_CONFIG[(viewStory.priority || '').toLowerCase()];
              return cfg ? (
                <Chip
                  label={viewStory.priority}
                  size="small"
                  sx={{
                    fontWeight: 600,
                    textTransform: 'capitalize',
                    backgroundColor: cfg.bg,
                    color: cfg.color,
                    border: `1px solid ${cfg.border}`,
                  }}
                />
              ) : null;
            })()}
            {viewStory?.status && (() => {
              const val = (viewStory.status || '').toLowerCase();
              const cfg = STATUS_CONFIG[val] || { bg: 'rgba(107,114,128,0.08)', color: '#6b7280', border: 'rgba(107,114,128,0.3)' };
              const label = String(viewStory.status).replace('_', ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
              return (
                <Chip
                  label={label}
                  size="small"
                  sx={{
                    fontWeight: 600,
                    backgroundColor: cfg.bg,
                    color: cfg.color,
                    border: `1px solid ${cfg.border}`,
                  }}
                />
              );
            })()}
            {viewStory?.project_code && (
              <Chip
                label={viewStory.project_code}
                size="small"
                sx={{ fontWeight: 600, bgcolor: 'action.selected' }}
              />
            )}
          </>
        }
        onEdit={
          userCanEdit && viewStory
            ? () => {
                setStoryViewDialogOpen(false);
                handleEditStory(viewStory);
              }
            : undefined
        }
      >
        {viewStory && (
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <DetailRow label="Project" value={viewStory.project_name} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <DetailRow label="Epic" value={viewStory.epic_title} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <DetailRow label="Assignee" value={viewStory.assignee} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <DetailRow
                label="Story Points"
                value={viewStory.story_points != null ? String(viewStory.story_points) : null}
              />
            </Grid>
            <Grid item xs={12}>
              <DetailRow label="Description" value={viewStory.description} />
            </Grid>
            <Grid item xs={12}>
              <DetailRow
                label="Acceptance Criteria"
                value={viewStory.acceptance_criteria}
              />
            </Grid>
            <Grid item xs={12}>
              <Divider sx={{ my: 1 }} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <DetailRow label="Created By" value={viewStory.created_by_name} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <DetailRow label="Created" value={formatDateTime(viewStory.created_at)} />
            </Grid>
            {viewStory.updated_at && (
              <Grid item xs={12} sm={6}>
                <DetailRow label="Last Updated" value={formatDateTime(viewStory.updated_at)} />
              </Grid>
            )}
          </Grid>
        )}
      </ViewDialog>

      {/* ── User Stories: bulk-delete confirm ────────────────────────────── */}
      <ConfirmDialog
        open={storyBulkDeleteConfirm}
        title={`Delete ${selectedStoryIds.length} user story(ies)?`}
        message="This soft-deletes every selected user story. The action is reversible only via direct DB access."
        confirmLabel="Delete"
        confirmColor="error"
        onCancel={() => setStoryBulkDeleteConfirm(false)}
        onConfirm={handleStoryBulkDelete}
      />

      <BulkEditDialog
        open={storyBulkEditOpen}
        onClose={() => setStoryBulkEditOpen(false)}
        entityLabel="user story"
        entityPlural="user stories"
        selectionCount={selectedStoryIds.length}
        bulkMax={STORY_BULK_MAX}
        fields={storyBulkFields}
        bulk={storyBulkEdit}
        busy={storyBulkBusy}
        onApply={handleStoryBulkApply}
        result={storyBulkResult}
      />

      {/* ── Delete Confirmation ────────────────────────────────────────────── */}
      <ConfirmDialog
        open={deleteDialogOpen}
        title={deleteType === 'epic' ? 'Delete Epic' : 'Delete User Story'}
        message={
          deleteType === 'epic'
            ? 'Are you sure you want to delete this epic? This action cannot be undone.'
            : 'Are you sure you want to delete this user story? This action cannot be undone.'
        }
        confirmLabel="Delete"
        confirmColor="error"
        onConfirm={deleteType === 'epic' ? handleDeleteEpic : handleDeleteStory}
        onCancel={() => {
          setDeleteDialogOpen(false);
          setDeleteId(null);
        }}
      />
    </Box>
  );
};

export default RequirementsPage;
