import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormHelperText,
  Grid,
  IconButton,
  InputAdornment,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Add as AddIcon,
  Clear as ClearIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  FilterList as FilterIcon,
  InfoOutlined,
  Key as KeyIcon,
  PersonAdd,
  PersonOff,
  Search as SearchIcon,
  Visibility,
  VisibilityOff,
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import { format } from 'date-fns';
import DataTable, { GridColDef, GridPaginationModel } from '../components/common/DataTable';
import ConfirmDialog from '../components/common/ConfirmDialog';
import ViewDialog from '../components/common/ViewDialog';
import userService from '../services/userService';
import roleService from '../services/roleService';
import { useAuth } from '../hooks/useAuth';
import { canManageUsers, roleSlug } from '../utils/roleGuard';
import { Role, User } from '../types';

const labelStyle = {
  fontWeight: 600,
  color: 'text.primary',
  '&.Mui-focused': { color: 'primary.main' },
  '&.MuiInputLabel-shrink': { fontWeight: 700, fontSize: '0.95rem' },
};

const ROLE_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  admin: { bg: 'rgba(239,68,68,0.10)', color: '#dc2626', border: 'rgba(239,68,68,0.35)' },
  qa_head: { bg: 'rgba(26,35,126,0.10)', color: 'secondary.main', border: 'rgba(26,35,126,0.35)' },
  qa_engineer: { bg: 'rgba(59,130,246,0.10)', color: '#2563eb', border: 'rgba(59,130,246,0.3)' },
  developer: { bg: 'rgba(16,185,129,0.10)', color: '#059669', border: 'rgba(16,185,129,0.3)' },
  viewer: { bg: 'rgba(107,114,128,0.10)', color: '#6b7280', border: 'rgba(107,114,128,0.25)' },
  auditor: { bg: 'rgba(245,158,11,0.10)', color: '#d97706', border: 'rgba(245,158,11,0.3)' },
};

function initialsOf(name: string): string {
  return (name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join('') || '?';
}

interface UserRow extends User {}

interface EditState {
  id?: string;
  email: string;
  full_name: string;
  role_id: string;
  is_active: boolean;
  password?: string;
}

const EMPTY_EDIT: EditState = {
  email: '',
  full_name: '',
  role_id: '',
  is_active: true,
  password: '',
};

const UsersPage: React.FC = () => {
  const { enqueueSnackbar } = useSnackbar();
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser ? canManageUsers(currentUser.role) : false;

  // Data state
  const [users, setUsers] = useState<UserRow[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<Role[]>([]);
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({ page: 0, pageSize: 10 });

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterStatus, setFilterStatus] = useState<'' | 'active' | 'inactive'>('');

  // Create/Edit dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<EditState>(EMPTY_EDIT);
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);

  // Reset-password dialog
  const [resetDialog, setResetDialog] = useState<{ open: boolean; user: UserRow | null }>({ open: false, user: null });
  const [newPassword, setNewPassword] = useState('');
  const [resetSaving, setResetSaving] = useState(false);

  // Activate/deactivate confirm
  const [toggleDialog, setToggleDialog] = useState<{ open: boolean; user: UserRow | null }>({ open: false, user: null });

  // Delete confirm
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; user: UserRow | null }>({ open: false, user: null });

  // Read-only detail dialog opened on row double-click. Holds the row
  // directly — no extra fetch needed.
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [viewUser, setViewUser] = useState<UserRow | null>(null);

  // ── Bulk operations (admin-only) ───────────────────────────────────────
  // Backend self-protection rules apply: an admin can never deactivate /
  // role-change / delete themselves; that row lands in `failed`.
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [userBulkBusy, setUserBulkBusy] = useState(false);
  const [userBulkDeleteConfirm, setUserBulkDeleteConfirm] = useState(false);
  const [userBulkRoleOpen, setUserBulkRoleOpen] = useState(false);
  const [userBulkRoleId, setUserBulkRoleId] = useState('');

  // Load roles once
  useEffect(() => {
    roleService.getAll().then(setRoles).catch(() => setRoles([]));
  }, []);

  const roleById = useMemo(() => Object.fromEntries(roles.map((r) => [r.id, r])), [roles]);

  // Fetch users
  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await userService.getAll({
        page: paginationModel.page + 1,
        pageSize: paginationModel.pageSize,
        search: searchQuery || undefined,
        roleId: filterRole || undefined,
        isActive: filterStatus === '' ? undefined : filterStatus === 'active',
      });
      const apiData = (res as any)?.data;
      if (Array.isArray(apiData)) {
        const items: UserRow[] = (apiData[0] || []).map((u: any) => ({
          ...u,
          role: roleSlug(u.role_name || ''),
        }));
        setUsers(items);
        setTotalRows(apiData[1] || 0);
      } else {
        setUsers([]);
        setTotalRows(0);
      }
    } catch {
      enqueueSnackbar('Failed to load users', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [paginationModel, searchQuery, filterRole, filterStatus, enqueueSnackbar]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // ── Handlers ────────────────────────────────────────────────────────────

  const openNewUserDialog = () => {
    const defaultRole = roles.find((r) => r.name === 'QA Engineer') || roles[0];
    setEditingUser({ ...EMPTY_EDIT, role_id: defaultRole?.id || '' });
    setShowPassword(false);
    setDialogOpen(true);
  };

  const openEditDialog = (row: UserRow) => {
    setEditingUser({
      id: row.id,
      email: row.email,
      full_name: row.full_name,
      role_id: row.role_id,
      is_active: row.is_active,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!editingUser.full_name.trim()) {
      enqueueSnackbar('Full name is required', { variant: 'warning' });
      return;
    }
    if (!editingUser.role_id) {
      enqueueSnackbar('Please select a role', { variant: 'warning' });
      return;
    }
    setSaving(true);
    try {
      if (editingUser.id) {
        await userService.update(editingUser.id, {
          full_name: editingUser.full_name.trim(),
          role_id: editingUser.role_id,
          is_active: editingUser.is_active,
        });
        enqueueSnackbar('User updated', { variant: 'success' });
      } else {
        if (!editingUser.email.trim() || !editingUser.password) {
          enqueueSnackbar('Email and password are required', { variant: 'warning' });
          setSaving(false);
          return;
        }
        await userService.create({
          email: editingUser.email.trim(),
          password: editingUser.password,
          full_name: editingUser.full_name.trim(),
          role_id: editingUser.role_id,
          is_active: editingUser.is_active,
        });
        enqueueSnackbar('User created', { variant: 'success' });
      }
      setDialogOpen(false);
      fetchUsers();
    } catch (err: any) {
      const detail = err?.response?.data?.message
        || err?.response?.data?.detail
        || err?.response?.data?.errors?.[0]
        || 'Failed to save user';
      enqueueSnackbar(typeof detail === 'string' ? detail : 'Failed to save user', { variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async () => {
    const target = toggleDialog.user;
    if (!target) return;
    try {
      if (target.is_active) {
        await userService.deactivate(target.id);
        enqueueSnackbar('User deactivated', { variant: 'warning' });
      } else {
        await userService.activate(target.id);
        enqueueSnackbar('User activated', { variant: 'success' });
      }
      setToggleDialog({ open: false, user: null });
      fetchUsers();
    } catch (err: any) {
      enqueueSnackbar(err?.response?.data?.message || 'Failed to update status', { variant: 'error' });
    }
  };

  const handleDelete = async () => {
    const target = deleteDialog.user;
    if (!target) return;
    try {
      await userService.delete(target.id);
      enqueueSnackbar('User deleted', { variant: 'success' });
      setDeleteDialog({ open: false, user: null });
      fetchUsers();
    } catch (err: any) {
      enqueueSnackbar(err?.response?.data?.message || 'Failed to delete user', { variant: 'error' });
    }
  };

  // ── Bulk handlers ────────────────────────────────────────────────────
  const reportUserBulkResult = (
    label: string,
    r: { succeeded: string[]; failed: { id: string; error: string }[] },
  ) => {
    if (r.succeeded.length > 0) {
      enqueueSnackbar(`${r.succeeded.length} user(s) ${label}`, { variant: 'success' });
    }
    if (r.failed.length > 0) {
      // Self-protection failures are common ("You cannot deactivate
      // your own account"); show the first message verbatim.
      enqueueSnackbar(
        `${r.failed.length} user(s) skipped: ${r.failed[0].error}`,
        { variant: 'warning' },
      );
    }
  };

  const handleUserBulkSetActive = async (isActive: boolean) => {
    if (selectedUserIds.length === 0) return;
    setUserBulkBusy(true);
    try {
      const r = await userService.bulkSetActive(selectedUserIds, isActive);
      reportUserBulkResult(isActive ? 'activated' : 'deactivated', r);
      setSelectedUserIds([]);
      fetchUsers();
    } catch {
      enqueueSnackbar('Bulk update failed', { variant: 'error' });
    } finally {
      setUserBulkBusy(false);
    }
  };

  const openUserBulkRole = () => {
    setUserBulkRoleId('');
    setUserBulkRoleOpen(true);
  };

  const handleUserBulkRoleApply = async () => {
    if (selectedUserIds.length === 0 || !userBulkRoleId) return;
    setUserBulkBusy(true);
    try {
      const r = await userService.bulkSetRole(selectedUserIds, userBulkRoleId);
      reportUserBulkResult('updated', r);
      setSelectedUserIds([]);
      setUserBulkRoleOpen(false);
      fetchUsers();
    } catch (err: any) {
      enqueueSnackbar(
        err?.response?.data?.message || 'Bulk role assignment failed',
        { variant: 'error' },
      );
    } finally {
      setUserBulkBusy(false);
    }
  };

  const handleUserBulkDelete = async () => {
    if (selectedUserIds.length === 0) return;
    setUserBulkBusy(true);
    try {
      const r = await userService.bulkDelete(selectedUserIds);
      reportUserBulkResult('deleted', r);
      setSelectedUserIds([]);
      setUserBulkDeleteConfirm(false);
      fetchUsers();
    } catch {
      enqueueSnackbar('Bulk delete failed', { variant: 'error' });
    } finally {
      setUserBulkBusy(false);
    }
  };

  const handleResetPassword = async () => {
    if (!resetDialog.user) return;
    if (newPassword.length < 8 || !/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) {
      enqueueSnackbar('Password must be 8+ chars with a letter and a digit.', { variant: 'warning' });
      return;
    }
    setResetSaving(true);
    try {
      await userService.resetPassword(resetDialog.user.id, newPassword);
      enqueueSnackbar(`Password reset for ${resetDialog.user.email}`, { variant: 'success' });
      setResetDialog({ open: false, user: null });
      setNewPassword('');
    } catch (err: any) {
      enqueueSnackbar(err?.response?.data?.message || 'Failed to reset password', { variant: 'error' });
    } finally {
      setResetSaving(false);
    }
  };

  const clearFilters = () => {
    setSearchQuery('');
    setFilterRole('');
    setFilterStatus('');
  };
  const hasFilters = searchQuery || filterRole || filterStatus;

  // ── Stat cards by role ──────────────────────────────────────────────────
  const statCards = useMemo(() => {
    const roleCounts: Record<string, number> = {};
    for (const u of users) {
      roleCounts[u.role_name] = (roleCounts[u.role_name] || 0) + 1;
    }
    const baseCards = [{ key: '__total', label: 'All', count: totalRows, color: 'secondary.main' }];
    const perRole = roles.map((r) => ({
      key: r.id,
      label: r.name,
      count: roleCounts[r.name] || 0,
      color: ROLE_STYLE[roleSlug(r.name)]?.color || '#6b7280',
    }));
    return [...baseCards, ...perRole];
  }, [users, roles, totalRows]);

  // ── Columns ─────────────────────────────────────────────────────────────
  const columns: GridColDef[] = [
    {
      field: 'full_name',
      headerName: 'Name',
      flex: 1.4,
      minWidth: 280,
      renderCell: (params: any) => {
        const row = params.row as UserRow;
        const style = ROLE_STYLE[roleSlug(row.role_name)] || ROLE_STYLE.viewer;
        return (
          <Box
            display="flex"
            alignItems="center"
            gap={1.5}
            sx={{ py: 0.75, height: '100%', width: '100%' }}
          >
            <Avatar sx={{
              width: 36,
              height: 36,
              bgcolor: style.bg,
              color: style.color,
              fontSize: 13,
              fontWeight: 700,
              border: `1px solid ${style.border}`,
              flexShrink: 0,
            }}>
              {initialsOf(row.full_name)}
            </Avatar>
            <Box sx={{ minWidth: 0, flexGrow: 1, lineHeight: 1.3 }}>
              <Typography
                variant="body2"
                fontWeight={600}
                noWrap
                sx={{ color: 'secondary.main', fontSize: 14 }}
              >
                {row.full_name}
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block', fontSize: 12 }}>
                {row.email}
              </Typography>
            </Box>
          </Box>
        );
      },
    },
    {
      field: 'role_name',
      headerName: 'Role',
      width: 140,
      renderCell: (params: any) => {
        const style = ROLE_STYLE[roleSlug(params.value)] || ROLE_STYLE.viewer;
        const role = roles.find((r) => r.name === params.value);
        return (
          <Tooltip title={role?.description || ''} arrow disableInteractive>
            <Chip
              label={params.value}
              size="small"
              sx={{
                fontWeight: 700,
                fontSize: 11,
                bgcolor: style.bg,
                color: style.color,
                border: `1px solid ${style.border}`,
              }}
            />
          </Tooltip>
        );
      },
    },
    {
      field: 'is_active',
      headerName: 'Status',
      width: 110,
      renderCell: (params: any) => (
        <Chip
          label={params.value ? 'Active' : 'Inactive'}
          size="small"
          sx={{
            fontWeight: 700,
            fontSize: 11,
            bgcolor: params.value ? 'rgba(16,185,129,0.1)' : 'rgba(107,114,128,0.1)',
            color: params.value ? '#059669' : '#6b7280',
            border: `1px solid ${params.value ? 'rgba(16,185,129,0.3)' : 'rgba(107,114,128,0.25)'}`,
          }}
        />
      ),
    },
    {
      field: 'created_at',
      headerName: 'Created',
      width: 150,
      renderCell: (params: any) => {
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
      field: 'updated_at',
      headerName: 'Updated',
      width: 150,
      renderCell: (params: any) => {
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
    ...(isAdmin ? [{
      field: 'actions',
      headerName: 'Actions',
      width: 360,
      sortable: false,
      renderCell: (params: any) => {
        const row = params.row as UserRow;
        const isSelf = currentUser && String(currentUser.id) === String(row.id);
        return (
          <Box display="flex" gap={0.5}>
            <Tooltip title="Edit user">
              <Button size="small" startIcon={<EditIcon />} onClick={(e) => { e.stopPropagation(); openEditDialog(row); }}>
                Edit
              </Button>
            </Tooltip>
            <Tooltip title="Reset password">
              <Button
                size="small"
                startIcon={<KeyIcon />}
                color="info"
                onClick={(e) => { e.stopPropagation(); setResetDialog({ open: true, user: row }); setNewPassword(''); }}
              >
                Reset PW
              </Button>
            </Tooltip>
            <Tooltip title={isSelf ? "You can't deactivate yourself" : (row.is_active ? 'Deactivate user' : 'Activate user')}>
              <span>
                <Button
                  size="small"
                  color={row.is_active ? 'warning' : 'success'}
                  startIcon={row.is_active ? <PersonOff /> : <PersonAdd />}
                  disabled={Boolean(isSelf && row.is_active)}
                  onClick={(e) => { e.stopPropagation(); setToggleDialog({ open: true, user: row }); }}
                >
                  {row.is_active ? 'Deactivate' : 'Activate'}
                </Button>
              </span>
            </Tooltip>
            <Tooltip title={isSelf ? "You can't delete yourself" : 'Delete user'}>
              <span>
                <IconButton
                  size="small"
                  color="error"
                  disabled={Boolean(isSelf)}
                  onClick={(e) => { e.stopPropagation(); setDeleteDialog({ open: true, user: row }); }}
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          </Box>
        );
      },
    } as GridColDef] : []),
  ];

  if (!isAdmin && currentUser?.role !== 'qa_head') {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="warning">
          <Typography variant="subtitle2" fontWeight={700}>Access restricted</Typography>
          <Typography variant="body2">
            Only administrators and QA Heads can view user management.
          </Typography>
        </Alert>
      </Box>
    );
  }

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography
          variant="h4"
          fontWeight={600}
          sx={(theme) => ({
            color: theme.palette.mode === 'dark' ? theme.palette.text.primary : theme.palette.secondary.main,
          })}
        >
          User Management
        </Typography>
        {isAdmin && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={openNewUserDialog}>
            New User
          </Button>
        )}
      </Box>

      {/* Stat cards */}
      <Box display="flex" gap={1.5} mb={3} flexWrap="wrap">
        {statCards.map((card) => (
          <Paper
            key={card.key}
            elevation={0}
            onClick={() => {
              if (card.key === '__total') setFilterRole('');
              else setFilterRole((prev) => (prev === card.key ? '' : card.key));
              setPaginationModel((p) => ({ ...p, page: 0 }));
            }}
            sx={{
              px: 2.5,
              py: 1,
              borderRadius: 2,
              cursor: 'pointer',
              border: '1px solid',
              borderColor: filterRole === card.key ? card.color : 'rgba(0,0,0,0.08)',
              bgcolor: filterRole === card.key ? `${card.color}10` : 'background.paper',
              minWidth: 110,
              textAlign: 'center',
              transition: 'all 0.15s ease',
              '&:hover': { borderColor: card.color, bgcolor: `${card.color}08` },
            }}
          >
            <Typography variant="h6" fontWeight={700} sx={{ color: card.color, lineHeight: 1.1 }}>
              {card.count}
            </Typography>
            <Typography variant="caption" color="text.secondary" fontWeight={600}>
              {card.label}
            </Typography>
          </Paper>
        ))}
      </Box>

      {/* Filters */}
      <Paper elevation={0} sx={{ p: 2, mb: 2, border: '1px solid', borderColor: 'rgba(0,0,0,0.08)', borderRadius: 2 }}>
        <Box display="flex" gap={2} flexWrap="wrap" alignItems="center">
          <FilterIcon color="action" />
          <TextField
            size="small"
            placeholder="Search by name or email…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            InputProps={{ startAdornment: <SearchIcon sx={{ mr: 1, color: 'action.active' }} /> }}
            sx={{ minWidth: 260 }}
          />
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel sx={labelStyle}>Role</InputLabel>
            <Select value={filterRole} onChange={(e) => setFilterRole(e.target.value)} label="Role">
              <MenuItem value="">All roles</MenuItem>
              {roles.map((r) => <MenuItem key={r.id} value={r.id}>{r.name}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel sx={labelStyle}>Status</InputLabel>
            <Select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as any)} label="Status">
              <MenuItem value="">All</MenuItem>
              <MenuItem value="active">Active</MenuItem>
              <MenuItem value="inactive">Inactive</MenuItem>
            </Select>
          </FormControl>
          {hasFilters && (
            <Button size="small" startIcon={<ClearIcon />} onClick={clearFilters}>
              Clear Filters
            </Button>
          )}
        </Box>
      </Paper>

      {/* Bulk action bar — admin-only. Backend self-protection still
          applies, so the admin can never accidentally lock themselves
          out via bulk actions. */}
      {isAdmin && selectedUserIds.length > 0 && (
        <Box
          role="toolbar"
          aria-label="User bulk actions"
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
            {selectedUserIds.length} selected
          </Typography>
          <Button
            size="small"
            variant="outlined"
            color="success"
            onClick={() => handleUserBulkSetActive(true)}
            disabled={userBulkBusy}
          >
            Activate
          </Button>
          <Button
            size="small"
            variant="outlined"
            color="warning"
            onClick={() => handleUserBulkSetActive(false)}
            disabled={userBulkBusy}
          >
            Deactivate
          </Button>
          <Button
            size="small"
            variant="outlined"
            onClick={openUserBulkRole}
            disabled={userBulkBusy}
          >
            Change role…
          </Button>
          <Button
            size="small"
            variant="outlined"
            color="error"
            onClick={() => setUserBulkDeleteConfirm(true)}
            disabled={userBulkBusy}
          >
            Delete
          </Button>
          <Box flexGrow={1} />
          <Button
            size="small"
            onClick={() => setSelectedUserIds([])}
            disabled={userBulkBusy}
          >
            Clear
          </Button>
        </Box>
      )}

      <ConfirmDialog
        open={userBulkDeleteConfirm}
        title={`Delete ${selectedUserIds.length} user(s)?`}
        message="This soft-deletes every selected user. Your own account will be skipped automatically. The action is reversible only via direct DB access."
        confirmLabel="Delete"
        confirmColor="error"
        onCancel={() => setUserBulkDeleteConfirm(false)}
        onConfirm={handleUserBulkDelete}
      />

      {/* Bulk role-change dialog */}
      <Dialog
        open={userBulkRoleOpen}
        onClose={() => !userBulkBusy && setUserBulkRoleOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          Change role for {selectedUserIds.length} user{selectedUserIds.length === 1 ? '' : 's'}
        </DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            All selected users (except your own account) will be reassigned to the role below.
          </Typography>
          <FormControl fullWidth size="small" required>
            <InputLabel sx={labelStyle}>Role</InputLabel>
            <Select
              label="Role"
              value={userBulkRoleId}
              onChange={(e) => setUserBulkRoleId(e.target.value)}
            >
              {roles.map((r) => (
                <MenuItem key={r.id} value={r.id}>{r.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUserBulkRoleOpen(false)} disabled={userBulkBusy}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleUserBulkRoleApply}
            disabled={userBulkBusy || !userBulkRoleId}
          >
            {userBulkBusy ? 'Applying…' : `Apply to ${selectedUserIds.length}`}
          </Button>
        </DialogActions>
      </Dialog>

      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: 'block', mb: 1, fontStyle: 'italic' }}
      >
        Tip: double-click a row to open user details.
      </Typography>
      {/* Table */}
      <DataTable
        rows={users}
        columns={columns}
        totalRows={totalRows}
        loading={loading}
        paginationModel={paginationModel}
        onPaginationModelChange={setPaginationModel}
        getRowId={(row: any) => row.id}
        density="comfortable"
        onRowDoubleClick={({ row }) => {
          setViewUser(row as UserRow);
          setViewDialogOpen(true);
        }}
        checkboxSelection={isAdmin}
        rowSelectionModel={selectedUserIds}
        onRowSelectionModelChange={setSelectedUserIds}
      />

      {/* ── User Detail (read-only) ────────────────────────────────────── */}
      <ViewDialog
        open={viewDialogOpen}
        onClose={() => setViewDialogOpen(false)}
        maxWidth="sm"
        title={
          viewUser
            ? (() => {
                const style = ROLE_STYLE[roleSlug(viewUser.role_name)] || ROLE_STYLE.viewer;
                return (
                  <Box display="flex" alignItems="center" gap={1.5} flex={1}>
                    <Avatar
                      sx={{
                        width: 44,
                        height: 44,
                        bgcolor: style.bg,
                        color: style.color,
                        fontSize: 14,
                        fontWeight: 700,
                        border: `1px solid ${style.border}`,
                      }}
                    >
                      {initialsOf(viewUser.full_name)}
                    </Avatar>
                    <Box minWidth={0} flex={1}>
                      <Typography variant="h6" fontWeight={700} noWrap>
                        {viewUser.full_name || '—'}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                        {viewUser.email}
                      </Typography>
                    </Box>
                  </Box>
                );
              })()
            : 'User'
        }
        onEdit={
          isAdmin && viewUser
            ? () => {
                setViewDialogOpen(false);
                openEditDialog(viewUser);
              }
            : undefined
        }
      >
        {viewUser && (
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <Typography
                variant="caption"
                fontWeight={700}
                color="text.secondary"
                sx={{ textTransform: 'uppercase', letterSpacing: 0.5, display: 'block' }}
              >
                Role
              </Typography>
              {(() => {
                const style = ROLE_STYLE[roleSlug(viewUser.role_name)] || ROLE_STYLE.viewer;
                return (
                  <Chip
                    label={viewUser.role_name || '—'}
                    size="small"
                    sx={{
                      mt: 0.5,
                      fontWeight: 700,
                      fontSize: 11,
                      bgcolor: style.bg,
                      color: style.color,
                      border: `1px solid ${style.border}`,
                    }}
                  />
                );
              })()}
            </Grid>
            <Grid item xs={12} sm={6}>
              <Typography
                variant="caption"
                fontWeight={700}
                color="text.secondary"
                sx={{ textTransform: 'uppercase', letterSpacing: 0.5, display: 'block' }}
              >
                Status
              </Typography>
              <Chip
                label={viewUser.is_active ? 'Active' : 'Inactive'}
                size="small"
                sx={{
                  mt: 0.5,
                  fontWeight: 700,
                  fontSize: 11,
                  bgcolor: viewUser.is_active ? 'rgba(16,185,129,0.1)' : 'rgba(107,114,128,0.1)',
                  color: viewUser.is_active ? '#059669' : '#6b7280',
                  border: `1px solid ${viewUser.is_active ? 'rgba(16,185,129,0.3)' : 'rgba(107,114,128,0.25)'}`,
                }}
              />
            </Grid>
            {(() => {
              const role = roleById[viewUser.role_id];
              return role?.description ? (
                <Grid item xs={12}>
                  <Typography
                    variant="caption"
                    fontWeight={700}
                    color="text.secondary"
                    sx={{ textTransform: 'uppercase', letterSpacing: 0.5, display: 'block' }}
                  >
                    Role Description
                  </Typography>
                  <Typography variant="body2" sx={{ mt: 0.3, whiteSpace: 'pre-wrap' }}>
                    {role.description}
                  </Typography>
                </Grid>
              ) : null;
            })()}
            <Grid item xs={12}>
              <Divider />
            </Grid>
            <Grid item xs={12} sm={6}>
              <Typography
                variant="caption"
                fontWeight={700}
                color="text.secondary"
                sx={{ textTransform: 'uppercase', letterSpacing: 0.5, display: 'block' }}
              >
                Created
              </Typography>
              <Typography variant="body2" sx={{ mt: 0.3 }}>
                {(() => {
                  if (!viewUser.created_at) return '—';
                  try {
                    return format(new Date(viewUser.created_at), 'MMM dd, yyyy HH:mm');
                  } catch {
                    return '—';
                  }
                })()}
              </Typography>
            </Grid>
            {viewUser.updated_at && (
              <Grid item xs={12} sm={6}>
                <Typography
                  variant="caption"
                  fontWeight={700}
                  color="text.secondary"
                  sx={{ textTransform: 'uppercase', letterSpacing: 0.5, display: 'block' }}
                >
                  Last Updated
                </Typography>
                <Typography variant="body2" sx={{ mt: 0.3 }}>
                  {(() => {
                    try {
                      return format(new Date(viewUser.updated_at), 'MMM dd, yyyy HH:mm');
                    } catch {
                      return '—';
                    }
                  })()}
                </Typography>
              </Grid>
            )}
          </Grid>
        )}
      </ViewDialog>

      {/* ── Create / Edit Dialog ───────────────────────────────────────── */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700, color: 'secondary.main' }}>
          {editingUser.id ? 'Edit User' : 'New User'}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid item xs={12}>
              <TextField
                label="Email"
                type="email"
                fullWidth
                required
                disabled={Boolean(editingUser.id)}
                value={editingUser.email}
                onChange={(e) => setEditingUser((prev) => ({ ...prev, email: e.target.value }))}
                helperText={editingUser.id ? 'Email cannot be changed after creation.' : undefined}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Full Name"
                fullWidth
                required
                value={editingUser.full_name}
                onChange={(e) => setEditingUser((prev) => ({ ...prev, full_name: e.target.value }))}
              />
            </Grid>
            {!editingUser.id && (
              <Grid item xs={12}>
                <TextField
                  label="Temporary Password"
                  fullWidth
                  required
                  type={showPassword ? 'text' : 'password'}
                  value={editingUser.password || ''}
                  onChange={(e) => setEditingUser((prev) => ({ ...prev, password: e.target.value }))}
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          onClick={() => setShowPassword((s) => !s)}
                          edge="end"
                          size="small"
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                        >
                          {showPassword ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                  helperText="Min 8 chars, include a letter and a digit. User can change it after first login."
                />
              </Grid>
            )}
            <Grid item xs={12} sm={8}>
              <FormControl fullWidth required error={!editingUser.role_id}>
                <InputLabel sx={labelStyle}>Role</InputLabel>
                <Select
                  value={editingUser.role_id}
                  onChange={(e) => setEditingUser((prev) => ({ ...prev, role_id: e.target.value }))}
                  label="Role"
                >
                  {roles.map((r) => (
                    <MenuItem key={r.id} value={r.id}>
                      <Box>
                        <Typography variant="body2" fontWeight={600}>{r.name}</Typography>
                        {r.description && (
                          <Typography variant="caption" color="text.secondary">{r.description}</Typography>
                        )}
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
                {!editingUser.role_id && <FormHelperText>Role is required</FormHelperText>}
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={4}>
              <Box display="flex" alignItems="center" gap={1} height="100%">
                <Switch
                  checked={editingUser.is_active}
                  onChange={(e) => setEditingUser((prev) => ({ ...prev, is_active: e.target.checked }))}
                />
                <Typography variant="body2">{editingUser.is_active ? 'Active' : 'Inactive'}</Typography>
              </Box>
            </Grid>

            {/* Role description */}
            {editingUser.role_id && roleById[editingUser.role_id]?.permissions && (
              <Grid item xs={12}>
                <Alert severity="info" icon={<InfoOutlined fontSize="inherit" />} sx={{ borderRadius: 2 }}>
                  <Typography variant="caption" fontWeight={700} sx={{ textTransform: 'uppercase' }}>
                    Permissions for {roleById[editingUser.role_id]?.name}
                  </Typography>
                  <Stack direction="row" flexWrap="wrap" gap={0.5} mt={0.5}>
                    {Object.entries(roleById[editingUser.role_id]?.permissions || {}).flatMap(([area, actions]) =>
                      (actions as string[]).map((a) => (
                        <Chip
                          key={`${area}:${a}`}
                          label={`${area}: ${a}`}
                          size="small"
                          sx={{ fontSize: 10, height: 20 }}
                          variant="outlined"
                        />
                      ))
                    )}
                  </Stack>
                </Alert>
              </Grid>
            )}
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : editingUser.id ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Reset password dialog ──────────────────────────────────────── */}
      <Dialog open={resetDialog.open} onClose={() => setResetDialog({ open: false, user: null })} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Reset Password</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Set a new temporary password for <b>{resetDialog.user?.email}</b>. They should change it on next login.
          </Typography>
          <TextField
            label="New Password"
            type={showPassword ? 'text' : 'password'}
            fullWidth
            autoFocus
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    onClick={() => setShowPassword((s) => !s)}
                    edge="end"
                    size="small"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
            helperText="Min 8 chars, include a letter and a digit."
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResetDialog({ open: false, user: null })} disabled={resetSaving}>Cancel</Button>
          <Button variant="contained" color="info" onClick={handleResetPassword} disabled={resetSaving}>
            {resetSaving ? 'Saving…' : 'Reset Password'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Activate/Deactivate confirm ─────────────────────────────────── */}
      <ConfirmDialog
        open={toggleDialog.open}
        title={toggleDialog.user?.is_active ? 'Deactivate User' : 'Activate User'}
        message={
          toggleDialog.user?.is_active
            ? `Deactivate ${toggleDialog.user?.full_name}? They will no longer be able to log in.`
            : `Activate ${toggleDialog.user?.full_name}? They will regain login access.`
        }
        confirmLabel={toggleDialog.user?.is_active ? 'Deactivate' : 'Activate'}
        confirmColor={toggleDialog.user?.is_active ? 'error' : 'primary'}
        onConfirm={handleToggleActive}
        onCancel={() => setToggleDialog({ open: false, user: null })}
      />

      {/* ── Delete confirm ──────────────────────────────────────────────── */}
      <ConfirmDialog
        open={deleteDialog.open}
        title="Delete User"
        message={`Delete ${deleteDialog.user?.full_name || 'this user'}? This is a soft delete and can be restored by an admin.`}
        confirmLabel="Delete"
        confirmColor="error"
        onConfirm={handleDelete}
        onCancel={() => setDeleteDialog({ open: false, user: null })}
      />
    </Box>
  );
};

export default UsersPage;
