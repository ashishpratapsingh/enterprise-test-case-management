import React, { useEffect, useState, useCallback } from 'react';
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
  Switch,
  FormControlLabel,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormHelperText,
  Grid,
  Divider,
  IconButton,
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
import Chip from '@mui/material/Chip';
import { GridColDef, GridPaginationModel } from '../components/common/DataTable';
import { useSnackbar } from 'notistack';
import DataTable from '../components/common/DataTable';
import ConfirmDialog from '../components/common/ConfirmDialog';
import ViewDialog from '../components/common/ViewDialog';
import projectService from '../services/projectService';
import { Project } from '../types';
import { useAuth } from '../hooks/useAuth';
import { canEdit, canDelete } from '../utils/roleGuard';
import { useProjects } from '../contexts/ProjectContext';
import { format } from 'date-fns';

const ProjectsPage: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [loading, setLoading] = useState(true);
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({
    page: 0,
    pageSize: 10,
  });
  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterActive, setFilterActive] = useState('');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Partial<Project> | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  // Read-only view dialog opened on row double-click. Holds the row data
  // directly — no extra fetch needed since the listing returns full rows.
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [viewProject, setViewProject] = useState<any>(null);

  const { enqueueSnackbar } = useSnackbar();
  const { user } = useAuth();
  const { refreshProjects } = useProjects();
  const userCanEdit = user ? canEdit(user.role) : false;
  const userCanDelete = user ? canDelete(user.role) : false;

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    try {
      const res = await projectService.getAll({
        page: paginationModel.page + 1,
        pageSize: paginationModel.pageSize,
        search: searchQuery || undefined,
        category: filterCategory || undefined,
        isActive: filterActive === '' ? undefined : filterActive === 'true',
      });
      // Backend returns { success, data: [items, total], message }
      const apiData = (res as any)?.data;
      if (Array.isArray(apiData)) {
        // data is [items_list, total_count]
        setProjects(apiData[0] || []);
        setTotalRows(apiData[1] || 0);
      } else if (apiData?.items) {
        setProjects(apiData.items);
        setTotalRows(apiData.total || 0);
      } else {
        setProjects([]);
        setTotalRows(0);
      }
    } catch {
      enqueueSnackbar('Failed to load projects', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [paginationModel, searchQuery, filterCategory, filterActive, enqueueSnackbar]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  useAutoRefresh(fetchProjects, [paginationModel, searchQuery, filterCategory, filterActive]);

  const handleSave = async () => {
    if (!editingProject) return;
    if (!editingProject.name?.trim()) {
      enqueueSnackbar('Name is required', { variant: 'warning' });
      return;
    }
    if (!editingProject.code?.trim()) {
      enqueueSnackbar('Code is required', { variant: 'warning' });
      return;
    }
    if (!editingProject.id) {
      const duplicate = projects.find(
        (p) => p.code?.toUpperCase() === editingProject.code?.trim().toUpperCase()
      );
      if (duplicate) {
        enqueueSnackbar('A project with this code already exists', { variant: 'warning' });
        return;
      }
    }
    if (!(editingProject as any).category) {
      enqueueSnackbar('Category is required', { variant: 'warning' });
      return;
    }
    try {
      const payload: Record<string, any> = {
        name: editingProject.name,
        code: editingProject.code,
        description: editingProject.description || null,
        category: (editingProject as any).category || null,
        is_active: editingProject.isActive ?? true,
      };
      if (editingProject.id) {
        await projectService.update(editingProject.id, payload);
        enqueueSnackbar('Project updated', { variant: 'success' });
      } else {
        await projectService.create(payload);
        enqueueSnackbar('Project created', { variant: 'success' });
      }
      setDialogOpen(false);
      setEditingProject(null);
      fetchProjects();
      refreshProjects();
    } catch (err: any) {
      enqueueSnackbar(err.response?.data?.message || 'Failed to save project', {
        variant: 'error',
      });
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await projectService.delete(deleteId);
      enqueueSnackbar('Project deleted', { variant: 'success' });
      setDeleteDialogOpen(false);
      setDeleteId(null);
      fetchProjects();
      refreshProjects();
    } catch {
      enqueueSnackbar('Failed to delete project', { variant: 'error' });
    }
  };

  const columns: GridColDef[] = [
    {
      field: 'id',
      headerName: 'ID',
      width: 90,
      renderCell: (params) => params.value ? params.value.substring(0, 8) : '—',
    },
    { field: 'name', headerName: 'Name', flex: 1, minWidth: 200 },
    { field: 'code', headerName: 'Code', width: 120 },
    {
      field: 'description',
      headerName: 'Description',
      flex: 1,
      minWidth: 200,
      renderCell: (params) => (
        <Box
          title={params.value || ''}
          sx={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            width: '100%',
          }}
        >
          {params.value || ''}
        </Box>
      ),
    },
    {
      field: 'category',
      headerName: 'Category',
      width: 160,
      renderCell: (params) =>
        params.value ? (
          <Chip
            label={params.value}
            size="small"
            sx={{
              fontWeight: 600,
              backgroundColor: params.value === 'IT Services' ? 'rgba(59,130,246,0.08)' : 'rgba(139,92,246,0.08)',
              color: params.value === 'IT Services' ? '#2563eb' : '#7c3aed',
              border: `1px solid ${params.value === 'IT Services' ? 'rgba(59,130,246,0.3)' : 'rgba(139,92,246,0.3)'}`,
            }}
          />
        ) : (
          <Typography variant="body2" color="text.secondary">—</Typography>
        ),
    },
    {
      field: 'is_active',
      headerName: 'Active',
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
      field: 'creator_name',
      headerName: 'Created By',
      width: 180,
      renderCell: (params) => {
        if (params.row.creator_name) return params.row.creator_name;
        if (params.row.creator_email) return params.row.creator_email;
        if (user && String(params.row.created_by) === String(user.id))
          return user.full_name || user.email;
        return params.row.created_by || '-';
      },
    },
    {
      field: 'created_at',
      headerName: 'Created',
      width: 160,
      renderCell: (params) =>
        params.value ? format(new Date(params.value), 'MMM dd, yyyy') : '',
    },
    ...(userCanEdit
      ? [
          {
            field: 'actions',
            headerName: 'Actions',
            width: 180,
            sortable: false,
            renderCell: (params: any) => (
              <Box display="flex" gap={1}>
                <Button
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingProject({
                      ...params.row,
                      isActive: params.row.is_active ?? params.row.isActive ?? true,
                      category: params.row.category || '',
                    });
                    setDialogOpen(true);
                  }}
                >
                  Edit
                </Button>
                {userCanDelete && (
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
                )}
              </Box>
            ),
          } as GridColDef,
        ]
      : []),
  ];

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

  const handleExportExcel = async () => {
    try {
      const res = await projectService.getAll({
        page: 1,
        pageSize: 10000,
        search: searchQuery || undefined,
        category: filterCategory || undefined,
        isActive: filterActive === '' ? undefined : filterActive === 'true',
      });
      const apiData = (res as any)?.data;
      const allProjects = Array.isArray(apiData) ? apiData[0] || [] : [];
      const exportData = allProjects.map((p: any) => ({
        Name: p.name || '',
        Code: p.code || '',
        Description: p.description || '',
        Category: p.category || '',
        Active: p.is_active ? 'Yes' : 'No',
        'Created By': p.creator_name || p.creator_email || '',
        'Created At': p.created_at ? new Date(p.created_at).toLocaleDateString() : '',
      }));
      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Projects');
      XLSX.writeFile(wb, 'Projects.xlsx');
    } catch {
      enqueueSnackbar('Failed to export projects', { variant: 'error' });
    }
  };

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography
          variant="h4"
          fontWeight={600}
          sx={(theme) => ({
            color: theme.palette.mode === 'dark' ? theme.palette.text.primary : theme.palette.secondary.main,
          })}
        >
          Projects
        </Typography>
        <Box display="flex" gap={1}>
          <Button
            variant="outlined"
            startIcon={<ExportIcon />}
            onClick={handleExportExcel}
          >
            Export to Excel
          </Button>
          {userCanEdit && (
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => {
                setEditingProject({ name: '', code: '', description: '', isActive: true, category: '' } as any);
                setDialogOpen(true);
              }}
            >
              New Project
            </Button>
          )}
        </Box>
      </Box>

      {/* Filters */}
      <Box display="flex" gap={2} mb={2} flexWrap="wrap" alignItems="center">
        <FilterIcon color="action" />
        <TextField
          size="small"
          placeholder="Search name, code, description..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          InputProps={{ startAdornment: <SearchIcon sx={{ mr: 1, color: 'action.active' }} /> }}
          sx={{ minWidth: 260 }}
        />
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>Category</InputLabel>
          <Select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            label="Category"
          >
            <MenuItem value="">All</MenuItem>
            <MenuItem value="IT Services">IT Services</MenuItem>
            <MenuItem value="Technical Services">Technical Services</MenuItem>
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>Active</InputLabel>
          <Select
            value={filterActive}
            onChange={(e) => setFilterActive(e.target.value)}
            label="Active"
          >
            <MenuItem value="">All</MenuItem>
            <MenuItem value="true">Active</MenuItem>
            <MenuItem value="false">Inactive</MenuItem>
          </Select>
        </FormControl>
        {(searchQuery || filterCategory || filterActive) && (
          <Button
            size="small"
            startIcon={<ClearIcon />}
            onClick={() => {
              setSearchQuery('');
              setFilterCategory('');
              setFilterActive('');
            }}
          >
            Clear Filters
          </Button>
        )}
      </Box>

      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: 'block', mb: 1, fontStyle: 'italic' }}
      >
        Tip: double-click a row to open project details.
      </Typography>
      <DataTable
        rows={projects}
        columns={columns}
        totalRows={totalRows}
        loading={loading}
        paginationModel={paginationModel}
        onPaginationModelChange={setPaginationModel}
        getRowId={(row) => row.id}
        onRowDoubleClick={({ row }) => {
          setViewProject(row);
          setViewDialogOpen(true);
        }}
      />

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingProject?.id ? 'Edit Project' : 'New Project'}</DialogTitle>
        <DialogContent>
          <TextField
            label="Name"
            fullWidth
            required
            margin="normal"
            value={editingProject?.name || ''}
            onChange={(e) =>
              setEditingProject((prev) => (prev ? { ...prev, name: e.target.value } : null))
            }
            error={dialogOpen && !editingProject?.name?.trim()}
            helperText={dialogOpen && !editingProject?.name?.trim() ? 'Name is required' : ''}
          />
          <TextField
            label="Code"
            fullWidth
            required
            margin="normal"
            value={editingProject?.code || ''}
            disabled={!!editingProject?.id}
            onChange={(e) =>
              setEditingProject((prev) =>
                prev ? { ...prev, code: e.target.value.toUpperCase() } : null
              )
            }
            error={
              dialogOpen &&
              !editingProject?.id &&
              (
                !editingProject?.code?.trim() ||
                !!projects.find((p) => p.code?.toUpperCase() === editingProject?.code?.trim().toUpperCase())
              )
            }
            helperText={
              editingProject?.id
                ? 'Code cannot be changed after creation'
                : !editingProject?.code?.trim()
                  ? 'Code is required'
                  : projects.find((p) => p.code?.toUpperCase() === editingProject?.code?.trim().toUpperCase())
                    ? 'A project with this code already exists'
                    : 'Short unique code, e.g. PROJ'
            }
          />
          <FormControl fullWidth margin="normal" required error={dialogOpen && !(editingProject as any)?.category}>
            <InputLabel>Category</InputLabel>
            <Select
              value={(editingProject as any)?.category || ''}
              onChange={(e) =>
                setEditingProject((prev) =>
                  prev ? { ...prev, category: e.target.value } : null
                )
              }
              label="Category"
            >
              <MenuItem value="" disabled>— None —</MenuItem>
              <MenuItem value="IT Services">IT Services</MenuItem>
              <MenuItem value="Technical Services">Technical Services</MenuItem>
            </Select>
            {dialogOpen && !(editingProject as any)?.category && (
              <FormHelperText>Category is required</FormHelperText>
            )}
          </FormControl>
          <TextField
            label="Description"
            fullWidth
            multiline
            rows={3}
            margin="normal"
            value={editingProject?.description || ''}
            onChange={(e) =>
              setEditingProject((prev) =>
                prev ? { ...prev, description: e.target.value } : null
              )
            }
          />
          <FormControlLabel
            control={
              <Switch
                checked={editingProject?.isActive ?? true}
                onChange={(e) =>
                  setEditingProject((prev) =>
                    prev ? { ...prev, isActive: e.target.checked } : null
                  )
                }
              />
            }
            label="Active"
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={
              !editingProject?.name?.trim() ||
              !editingProject?.code?.trim() ||
              !(editingProject as any)?.category ||
              (!editingProject?.id && !!projects.find((p) => p.code?.toUpperCase() === editingProject?.code?.trim().toUpperCase()))
            }
          >
            {editingProject?.id ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Project Detail (read-only). Double-clicking a row opens this. */}
      <ViewDialog
        open={viewDialogOpen}
        onClose={() => setViewDialogOpen(false)}
        title={
          <>
            <Typography variant="h6" fontWeight={700} component="span">
              {viewProject?.name || 'Project'}
            </Typography>
            {viewProject?.code && (
              <Chip
                label={viewProject.code}
                size="small"
                sx={{ fontWeight: 600, bgcolor: 'action.selected' }}
              />
            )}
            {viewProject && (
              <Chip
                label={viewProject.is_active ? 'Active' : 'Inactive'}
                size="small"
                sx={{
                  fontWeight: 600,
                  backgroundColor: viewProject.is_active ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                  color: viewProject.is_active ? '#10b981' : '#ef4444',
                  border: `1px solid ${viewProject.is_active ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                }}
              />
            )}
          </>
        }
        onEdit={
          userCanEdit && viewProject
            ? () => {
                setEditingProject({
                  ...viewProject,
                  isActive: viewProject.is_active ?? viewProject.isActive ?? true,
                  category: viewProject.category || '',
                });
                setViewDialogOpen(false);
                setDialogOpen(true);
              }
            : undefined
        }
      >
        {viewProject && (
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <DetailRow label="Category" value={viewProject.category} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <DetailRow
                label="Created By"
                value={
                  viewProject.creator_name ||
                  viewProject.creator_email ||
                  (user && String(viewProject.created_by) === String(user.id)
                    ? user.full_name || user.email
                    : viewProject.created_by)
                }
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <DetailRow
                label="Created"
                value={
                  viewProject.created_at
                    ? format(new Date(viewProject.created_at), 'MMM dd, yyyy HH:mm')
                    : null
                }
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <DetailRow
                label="Last Updated"
                value={
                  viewProject.updated_at
                    ? format(new Date(viewProject.updated_at), 'MMM dd, yyyy HH:mm')
                    : null
                }
              />
            </Grid>
            <Grid item xs={12}>
              <Divider sx={{ my: 1 }} />
              <DetailRow label="Description" value={viewProject.description} />
            </Grid>
          </Grid>
        )}
      </ViewDialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteDialogOpen}
        title="Delete Project"
        message="Are you sure you want to delete this project? This action cannot be undone."
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

export default ProjectsPage;
