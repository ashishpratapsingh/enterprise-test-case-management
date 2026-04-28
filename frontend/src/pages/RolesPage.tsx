import React, { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  LockOpen as LockOpenIcon,
  Close as CloseIcon,
} from '@mui/icons-material';
import { format } from 'date-fns';
import { useSnackbar } from 'notistack';
import DataTable, {
  GridColDef,
  GridPaginationModel,
} from '../components/common/DataTable';
import ConfirmDialog from '../components/common/ConfirmDialog';
import ViewDialog from '../components/common/ViewDialog';
import PermissionMatrix, { Permissions } from '../components/roles/PermissionMatrix';
import roleService, {
  RoleCreatePayload,
  RoleUpdatePayload,
} from '../services/roleService';
import { Role } from '../types';
import { useAuth } from '../hooks/useAuth';
import { canManageUsers } from '../utils/roleGuard';
import useIsMobile from '../hooks/useIsMobile';

interface EditingRole {
  id?: string;
  name: string;
  description: string;
  permissions: Permissions;
}

const EMPTY: EditingRole = { name: '', description: '', permissions: {} };

const RolesPage: React.FC = () => {
  const { enqueueSnackbar } = useSnackbar();
  const { user } = useAuth();
  const userIsAdmin = user ? canManageUsers(user.role) : false;
  const isMobile = useIsMobile();

  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  // Default to 10 rows per page to match the other list pages.
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({
    page: 0,
    pageSize: 10,
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<EditingRole>(EMPTY);
  const [saving, setSaving] = useState(false);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Read-only detail dialog opened on row double-click. Holds the row
  // directly — no extra fetch needed since the listing returns full
  // permissions.
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [viewRole, setViewRole] = useState<Role | null>(null);

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
    setDialogOpen(true);
  };

  const openEdit = (row: Role) => {
    setEditing({
      id: row.id,
      name: row.name,
      description: row.description || '',
      permissions: (row.permissions as Permissions) || {},
    });
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditing(EMPTY);
  };

  const handleSave = async () => {
    if (!editing.name.trim()) {
      enqueueSnackbar('Name is required', { variant: 'warning' });
      return;
    }

    const permissions: Permissions | null =
      Object.keys(editing.permissions).length === 0 ? null : editing.permissions;

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

  /**
   * List-cell summary mirrors what AWS IAM / Auth0 / Okta show in a
   * roles table: a small icon + a "M permissions across N resources"
   * one-liner. Hovering or focusing the summary reveals a read-only
   * permission matrix in a Tooltip — same component used by the edit
   * dialog, just disabled. Tooltip closes on blur / mouse-leave; Esc
   * dismisses if it has focus.
   */
  const renderPermissionsSummary = (perms: Permissions | null | undefined) => {
    if (!perms || Object.keys(perms).length === 0) {
      return (
        <Typography variant="body2" color="text.secondary">
          No permissions
        </Typography>
      );
    }
    const resourceCount = Object.keys(perms).length;
    const actionCount = Object.values(perms).reduce(
      (sum, list) => sum + (list?.length || 0),
      0,
    );
    return (
      <Tooltip
        arrow
        placement="left"
        enterDelay={150}
        leaveDelay={100}
        title={
          <Box sx={{ width: 'min(720px, 80vw)', maxHeight: '60vh', overflow: 'auto' }}>
            <PermissionMatrix
              value={perms}
              onChange={() => { /* read-only preview */ }}
              disabled
            />
          </Box>
        }
        slotProps={{
          tooltip: {
            sx: {
              maxWidth: 'none',
              bgcolor: 'background.paper',
              color: 'text.primary',
              p: 1,
              boxShadow: 6,
              border: 1,
              borderColor: 'divider',
            },
          },
          arrow: {
            sx: {
              color: 'background.paper',
              '&::before': {
                border: 1,
                borderColor: 'divider',
              },
            },
          },
        }}
      >
        <Box
          tabIndex={0}
          aria-label={`Show permissions: ${actionCount} permissions across ${resourceCount} resources`}
          display="inline-flex"
          alignItems="center"
          gap={1}
          sx={{
            cursor: 'help',
            outline: 'none',
            borderRadius: 1,
            px: 0.5,
            '&:hover, &:focus-visible': {
              bgcolor: 'action.hover',
            },
            '&:focus-visible': {
              boxShadow: (t) => `0 0 0 2px ${t.palette.primary.main}`,
            },
          }}
        >
          <LockOpenIcon fontSize="small" sx={{ color: 'primary.main' }} />
          <Typography variant="body2">
            <Box component="strong" sx={{ color: 'text.primary' }}>
              {actionCount}
            </Box>{' '}
            permission{actionCount === 1 ? '' : 's'} across{' '}
            <Box component="strong" sx={{ color: 'text.primary' }}>
              {resourceCount}
            </Box>{' '}
            resource{resourceCount === 1 ? '' : 's'}
          </Typography>
        </Box>
      </Tooltip>
    );
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
      flex: 1.5,
      minWidth: 280,
      renderCell: (params) =>
        renderPermissionsSummary(params.value as Permissions | null),
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
      {/* Heading + action bar layout matches the other list pages. */}
      <Typography
        variant="h4"
        fontWeight={600}
        sx={(theme) => ({
          color: theme.palette.mode === 'dark' ? theme.palette.text.primary : theme.palette.secondary.main,
          mb: 2,
        })}
      >
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

      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: 'block', mb: 1, fontStyle: 'italic' }}
      >
        Tip: double-click a row to open role details.
      </Typography>
      <DataTable
        rows={roles}
        columns={columns}
        loading={loading}
        paginationModel={paginationModel}
        onPaginationModelChange={setPaginationModel}
        onRowDoubleClick={({ row }) => {
          setViewRole(row as Role);
          setViewDialogOpen(true);
        }}
      />

      {/* ── Create / Edit dialog ──────────────────────────────────────────── */}
      <Dialog
        open={dialogOpen}
        onClose={closeDialog}
        maxWidth="md"
        fullWidth
        fullScreen={isMobile}
      >
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
          <Box mt={2}>
            <Typography variant="subtitle2" fontWeight={600} mb={0.5}>
              Permissions
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Tick the boxes for each resource × action combination this role
              should grant. The leftmost checkbox per row toggles the whole
              row at once.
            </Typography>
            <PermissionMatrix
              value={editing.permissions}
              onChange={(next) =>
                setEditing((p) => ({ ...p, permissions: next }))
              }
            />
          </Box>
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

      {/* ── Role Detail (read-only) ───────────────────────────────────────── */}
      <ViewDialog
        open={viewDialogOpen}
        onClose={() => setViewDialogOpen(false)}
        fullScreen={isMobile}
        title={
          <>
            <Typography variant="h6" fontWeight={700} component="span">
              {viewRole?.name || 'Role'}
            </Typography>
            {viewRole && (() => {
              const perms = (viewRole.permissions as Permissions) || {};
              const resourceCount = Object.keys(perms).length;
              const actionCount = Object.values(perms).reduce(
                (sum, list) => sum + (list?.length || 0),
                0,
              );
              return (
                <Chip
                  label={`${actionCount} permission${actionCount === 1 ? '' : 's'} · ${resourceCount} resource${resourceCount === 1 ? '' : 's'}`}
                  size="small"
                  sx={{ fontWeight: 600, bgcolor: 'action.selected' }}
                />
              );
            })()}
          </>
        }
        onEdit={
          userIsAdmin && viewRole
            ? () => {
                setViewDialogOpen(false);
                openEdit(viewRole);
              }
            : undefined
        }
      >
        {viewRole && (
          <Box>
            <Box mb={2}>
              <Typography
                variant="caption"
                fontWeight={700}
                color="text.secondary"
                sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}
              >
                Description
              </Typography>
              <Typography variant="body2" sx={{ mt: 0.3, whiteSpace: 'pre-wrap' }}>
                {viewRole.description || '—'}
              </Typography>
            </Box>

            {((viewRole as any).created_at || (viewRole as any).updated_at) && (
              <Box mb={2} display="flex" gap={3} flexWrap="wrap">
                {(viewRole as any).created_at && (
                  <Box>
                    <Typography
                      variant="caption"
                      fontWeight={700}
                      color="text.secondary"
                      sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}
                    >
                      Created
                    </Typography>
                    <Typography variant="body2" sx={{ mt: 0.3 }}>
                      {(() => {
                        try {
                          return format(new Date((viewRole as any).created_at), 'MMM dd, yyyy HH:mm');
                        } catch {
                          return '—';
                        }
                      })()}
                    </Typography>
                  </Box>
                )}
                {(viewRole as any).updated_at && (
                  <Box>
                    <Typography
                      variant="caption"
                      fontWeight={700}
                      color="text.secondary"
                      sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}
                    >
                      Last Updated
                    </Typography>
                    <Typography variant="body2" sx={{ mt: 0.3 }}>
                      {(() => {
                        try {
                          return format(new Date((viewRole as any).updated_at), 'MMM dd, yyyy HH:mm');
                        } catch {
                          return '—';
                        }
                      })()}
                    </Typography>
                  </Box>
                )}
              </Box>
            )}

            <Divider sx={{ my: 1.5 }} />
            <Typography
              variant="caption"
              fontWeight={700}
              color="text.secondary"
              sx={{ textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', mb: 1 }}
            >
              Permissions
            </Typography>
            <PermissionMatrix
              value={(viewRole.permissions as Permissions) || {}}
              onChange={() => { /* read-only */ }}
              disabled
            />
          </Box>
        )}
      </ViewDialog>
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
