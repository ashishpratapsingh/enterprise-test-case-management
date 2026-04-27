import React, { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import DataTable, { GridColDef } from '../components/common/DataTable';
import ConfirmDialog from '../components/common/ConfirmDialog';
import roleService, {
  RoleCreatePayload,
  RoleUpdatePayload,
} from '../services/roleService';
import { Role } from '../types';
import { useAuth } from '../hooks/useAuth';
import { canManageUsers } from '../utils/roleGuard';

interface EditingRole {
  id?: string;
  name: string;
  description: string;
  permissionsText: string;
}

const EMPTY: EditingRole = { name: '', description: '', permissionsText: '' };

const RolesPage: React.FC = () => {
  const { enqueueSnackbar } = useSnackbar();
  const { user } = useAuth();
  const userIsAdmin = user ? canManageUsers(user.role) : false;

  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<EditingRole>(EMPTY);
  const [permissionsError, setPermissionsError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const fetchRoles = useCallback(async () => {
    setLoading(true);
    try {
      const list = await roleService.getAll();
      setRoles(list);
    } catch {
      enqueueSnackbar('Failed to load roles', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [enqueueSnackbar]);

  useEffect(() => {
    fetchRoles();
  }, [fetchRoles]);

  const openCreate = () => {
    setEditing(EMPTY);
    setPermissionsError(null);
    setDialogOpen(true);
  };

  const openEdit = (row: Role) => {
    setEditing({
      id: row.id,
      name: row.name,
      description: row.description || '',
      permissionsText: row.permissions
        ? JSON.stringify(row.permissions, null, 2)
        : '',
    });
    setPermissionsError(null);
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditing(EMPTY);
    setPermissionsError(null);
  };

  const parsePermissions = (): Record<string, string[]> | null | undefined => {
    const trimmed = editing.permissionsText.trim();
    if (!trimmed) return null;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, string[]>;
      }
      throw new Error('Permissions must be a JSON object.');
    } catch (err: any) {
      setPermissionsError(
        err?.message || 'Permissions must be valid JSON, e.g. {"users": ["read"]}',
      );
      return undefined;
    }
  };

  const handleSave = async () => {
    if (!editing.name.trim()) {
      enqueueSnackbar('Name is required', { variant: 'warning' });
      return;
    }
    const permissions = parsePermissions();
    if (permissions === undefined) return;

    const payload: RoleCreatePayload | RoleUpdatePayload = {
      name: editing.name.trim(),
      description: editing.description.trim() || null,
      permissions,
    };

    setSaving(true);
    try {
      if (editing.id) {
        await roleService.update(editing.id, payload);
        enqueueSnackbar('Role updated', { variant: 'success' });
      } else {
        await roleService.create(payload as RoleCreatePayload);
        enqueueSnackbar('Role created', { variant: 'success' });
      }
      closeDialog();
      await fetchRoles();
    } catch (err: any) {
      enqueueSnackbar(
        err.response?.data?.message ||
          err.response?.data?.detail ||
          'Failed to save role',
        { variant: 'error' },
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDeleteId) return;
    try {
      await roleService.delete(confirmDeleteId);
      enqueueSnackbar('Role deleted', { variant: 'success' });
      setConfirmDeleteId(null);
      await fetchRoles();
    } catch (err: any) {
      enqueueSnackbar(
        err.response?.data?.detail ||
          err.response?.data?.message ||
          'Failed to delete role',
        { variant: 'error' },
      );
      setConfirmDeleteId(null);
    }
  };

  const columns: GridColDef[] = [
    { field: 'name', headerName: 'Name', flex: 1, minWidth: 160 },
    {
      field: 'description',
      headerName: 'Description',
      flex: 2,
      minWidth: 240,
      renderCell: (params) => params.value || '—',
    },
    {
      field: 'permissions',
      headerName: 'Permissions',
      flex: 3,
      minWidth: 320,
      // Let AG Grid grow the row when the chip list wraps so long
      // permission sets stay legible instead of clipping.
      autoHeight: true,
      wrapText: true,
      renderCell: (params) => {
        const perms = params.value as Record<string, string[]> | null;
        if (!perms || Object.keys(perms).length === 0) return '—';
        return (
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              gap: 0.5,
              // Vertical padding gives each row breathing room — without
              // it, chips sit flush against the cell edges and the
              // resource:actions text becomes hard to scan.
              py: 1,
            }}
          >
            {Object.entries(perms).map(([resource, actions]) => (
              <Chip
                key={resource}
                size="small"
                label={
                  <Box component="span" sx={{ fontSize: '0.75rem' }}>
                    <Box component="strong" sx={{ color: 'primary.main' }}>
                      {resource}
                    </Box>
                    {actions && actions.length > 0
                      ? `: ${actions.join(', ')}`
                      : ''}
                  </Box>
                }
                sx={{
                  height: 'auto',
                  alignSelf: 'flex-start',
                  py: 0.5,
                  '& .MuiChip-label': {
                    whiteSpace: 'normal',
                    lineHeight: 1.45,
                    px: 1,
                  },
                }}
              />
            ))}
          </Box>
        );
      },
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 110,
      sortable: false,
      renderCell: (params) =>
        userIsAdmin ? (
          <Box>
            <Tooltip title="Edit">
              <IconButton size="small" onClick={() => openEdit(params.row)}>
                <EditIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Delete">
              <IconButton
                size="small"
                onClick={() => setConfirmDeleteId(params.row.id)}
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        ) : null,
    },
  ];

  return (
    <Box>
      {/* Heading + action bar layout matches DefectsPage / TestCasesPage /
          TestRunsPage: page title on its own row, then a right-aligned
          action row, then the table. Title color matches the indigo
          used across the other list pages. */}
      <Typography variant="h4" fontWeight={600} sx={{ color: '#1a237e', mb: 2 }}>
        Roles
      </Typography>

      <Box display="flex" justifyContent="flex-end" gap={1} mb={2}>
        {userIsAdmin && (
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={openCreate}
            sx={{ whiteSpace: 'nowrap' }}
          >
            New Role
          </Button>
        )}
      </Box>

      <DataTable rows={roles} columns={columns} loading={loading} />

      {/* ── Create / Edit dialog ──────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onClose={closeDialog} maxWidth="sm" fullWidth>
        <DialogTitle>{editing.id ? 'Edit Role' : 'New Role'}</DialogTitle>
        <DialogContent dividers>
          <TextField
            label="Name"
            fullWidth
            required
            value={editing.name}
            onChange={(e) => setEditing((p) => ({ ...p, name: e.target.value }))}
            margin="normal"
            autoFocus
          />
          <TextField
            label="Description"
            fullWidth
            multiline
            minRows={2}
            value={editing.description}
            onChange={(e) =>
              setEditing((p) => ({ ...p, description: e.target.value }))
            }
            margin="normal"
          />
          <TextField
            label="Permissions (JSON)"
            fullWidth
            multiline
            minRows={6}
            value={editing.permissionsText}
            onChange={(e) =>
              setEditing((p) => ({ ...p, permissionsText: e.target.value }))
            }
            placeholder='{"users": ["create", "read", "update", "delete"]}'
            margin="normal"
            error={!!permissionsError}
            helperText={
              permissionsError ||
              'Resource → list-of-actions map. Leave empty to clear.'
            }
            sx={{ '& textarea': { fontFamily: 'monospace', fontSize: '0.85rem' } }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialog} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} variant="contained" disabled={saving}>
            {editing.id ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={!!confirmDeleteId}
        title="Delete role?"
        message="This soft-deletes the role. Users currently assigned to it must be reassigned first — the API will reject the delete otherwise."
        confirmLabel="Delete"
        onCancel={() => setConfirmDeleteId(null)}
        onConfirm={handleDelete}
      />
    </Box>
  );
};

export default RolesPage;
