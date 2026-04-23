import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  Drawer,
  FormControl,
  IconButton,
  InputAdornment,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Clear as ClearIcon,
  Close as CloseIcon,
  FilterList as FilterIcon,
  OpenInNew,
  Refresh as RefreshIcon,
  Search as SearchIcon,
  AddCircleOutline,
  RemoveCircleOutline,
  SwapHoriz,
  ExpandMore as ExpandMoreIcon,
  Code as CodeIcon,
} from '@mui/icons-material';
import { Accordion, AccordionSummary, AccordionDetails } from '@mui/material';
import DataTable, { GridColDef, GridPaginationModel } from '../components/common/DataTable';
import { useSnackbar } from 'notistack';
import auditService from '../services/auditService';
import userService from '../services/userService';
import { AuditLog } from '../types';
import { format } from 'date-fns';

const labelStyle = {
  fontWeight: 600,
  color: 'text.primary',
  '&.Mui-focused': { color: 'primary.main' },
  '&.MuiInputLabel-shrink': { fontWeight: 700, fontSize: '0.95rem' },
};

const ENTITY_TYPES = [
  'test_case', 'test_suite', 'test_run', 'execution',
  'project', 'module', 'release', 'requirement',
  'defect', 'user', 'role', 'epic', 'user_story',
];

const ACTIONS = [
  'CREATE', 'UPDATE', 'DELETE',
  'ACTIVATE', 'DEACTIVATE', 'RESET_PASSWORD',
  'START', 'COMPLETE', 'ABORT', 'BLOCK',
  'TRANSITION', 'UPLOAD', 'LOGIN', 'LOGOUT',
];

const ACTION_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  CREATE: { bg: 'rgba(16,185,129,0.10)', color: '#059669', border: 'rgba(16,185,129,0.3)' },
  UPDATE: { bg: 'rgba(59,130,246,0.10)', color: '#2563eb', border: 'rgba(59,130,246,0.3)' },
  DELETE: { bg: 'rgba(239,68,68,0.10)', color: '#dc2626', border: 'rgba(239,68,68,0.35)' },
  ACTIVATE: { bg: 'rgba(16,185,129,0.10)', color: '#059669', border: 'rgba(16,185,129,0.3)' },
  DEACTIVATE: { bg: 'rgba(245,158,11,0.10)', color: '#d97706', border: 'rgba(245,158,11,0.3)' },
  RESET_PASSWORD: { bg: 'rgba(168,85,247,0.10)', color: '#7e22ce', border: 'rgba(168,85,247,0.35)' },
  LOGIN: { bg: 'rgba(26,35,126,0.08)', color: '#1a237e', border: 'rgba(26,35,126,0.25)' },
  LOGOUT: { bg: 'rgba(107,114,128,0.08)', color: '#6b7280', border: 'rgba(107,114,128,0.25)' },
  _default: { bg: 'rgba(107,114,128,0.08)', color: '#6b7280', border: 'rgba(107,114,128,0.25)' },
};

const actionStyleFor = (a: string) => ACTION_STYLE[a] || ACTION_STYLE._default;

function initialsOf(name: string): string {
  return (name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join('');
}

const prettyEntity = (type: string) =>
  type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const prettyField = (key: string) =>
  key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/** Fields that are noisy or never meaningful in a human-facing diff. */
const DIFF_IGNORED_FIELDS = new Set(['updated_at']);

/** Compare two JSON-safe values deeply. */
function deepEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (a === null || b === null) return a === b;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return a === b;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  return ak.every((k) => deepEqual(a[k], b[k]));
}

interface FieldChange {
  field: string;
  kind: 'added' | 'removed' | 'modified' | 'unchanged';
  oldValue?: any;
  newValue?: any;
}

/** Diff two flat-ish payload dicts. */
function computeDiff(
  oldVals: Record<string, any> | null | undefined,
  newVals: Record<string, any> | null | undefined,
): FieldChange[] {
  const changes: FieldChange[] = [];
  const allKeys = new Set<string>([
    ...Object.keys(oldVals || {}),
    ...Object.keys(newVals || {}),
  ]);
  for (const key of Array.from(allKeys).sort()) {
    if (DIFF_IGNORED_FIELDS.has(key)) continue;
    const inOld = oldVals && Object.prototype.hasOwnProperty.call(oldVals, key);
    const inNew = newVals && Object.prototype.hasOwnProperty.call(newVals, key);
    const oldVal = inOld ? oldVals![key] : undefined;
    const newVal = inNew ? newVals![key] : undefined;

    if (inOld && inNew) {
      if (deepEqual(oldVal, newVal)) {
        changes.push({ field: key, kind: 'unchanged', oldValue: oldVal, newValue: newVal });
      } else {
        changes.push({ field: key, kind: 'modified', oldValue: oldVal, newValue: newVal });
      }
    } else if (inNew) {
      changes.push({ field: key, kind: 'added', newValue: newVal });
    } else if (inOld) {
      changes.push({ field: key, kind: 'removed', oldValue: oldVal });
    }
  }
  return changes;
}

function formatValue(v: any): string {
  if (v === null) return 'null';
  if (v === undefined) return '—';
  if (typeof v === 'string') return v === '' ? '""' : v;
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v) || typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/** Render a single field change as a card-like row. */
const ChangeRow: React.FC<{ change: FieldChange }> = ({ change }) => {
  const isAdded = change.kind === 'added';
  const isRemoved = change.kind === 'removed';
  const isModified = change.kind === 'modified';

  const accent = isAdded ? '#059669' : isRemoved ? '#dc2626' : isModified ? '#2563eb' : '#6b7280';
  const icon = isAdded ? <AddCircleOutline sx={{ fontSize: 14 }} />
    : isRemoved ? <RemoveCircleOutline sx={{ fontSize: 14 }} />
    : <SwapHoriz sx={{ fontSize: 14 }} />;
  const label = isAdded ? 'Added' : isRemoved ? 'Removed' : 'Changed';

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 1.25,
        mb: 1,
        borderRadius: 1.5,
        borderColor: `${accent}40`,
        bgcolor: `${accent}08`,
      }}
    >
      <Box display="flex" alignItems="center" gap={1} mb={0.75}>
        <Chip
          icon={icon}
          label={label}
          size="small"
          sx={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 0.3,
            bgcolor: `${accent}15`,
            color: accent,
            border: `1px solid ${accent}40`,
            '& .MuiChip-icon': { color: accent },
          }}
        />
        <Typography variant="body2" fontWeight={700} sx={{ color: '#1a237e' }}>
          {prettyField(change.field)}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace', fontSize: 10 }}>
          {change.field}
        </Typography>
      </Box>
      {isModified && (
        <Box display="grid" gridTemplateColumns="1fr auto 1fr" gap={1} alignItems="center">
          <Box
            sx={{
              p: 0.75, borderRadius: 1,
              bgcolor: 'rgba(239,68,68,0.06)',
              border: '1px solid rgba(239,68,68,0.2)',
              fontFamily: 'monospace', fontSize: 12,
              color: '#dc2626',
              textDecoration: 'line-through',
              wordBreak: 'break-word',
              whiteSpace: 'pre-wrap',
              minHeight: 26,
            }}
          >
            {formatValue(change.oldValue)}
          </Box>
          <SwapHoriz sx={{ fontSize: 18, color: '#6b7280' }} />
          <Box
            sx={{
              p: 0.75, borderRadius: 1,
              bgcolor: 'rgba(16,185,129,0.06)',
              border: '1px solid rgba(16,185,129,0.2)',
              fontFamily: 'monospace', fontSize: 12,
              color: '#047857',
              fontWeight: 600,
              wordBreak: 'break-word',
              whiteSpace: 'pre-wrap',
              minHeight: 26,
            }}
          >
            {formatValue(change.newValue)}
          </Box>
        </Box>
      )}
      {isAdded && (
        <Box
          sx={{
            p: 0.75, borderRadius: 1,
            bgcolor: 'rgba(16,185,129,0.06)',
            border: '1px solid rgba(16,185,129,0.2)',
            fontFamily: 'monospace', fontSize: 12,
            color: '#047857',
            fontWeight: 600,
            wordBreak: 'break-word',
            whiteSpace: 'pre-wrap',
          }}
        >
          {formatValue(change.newValue)}
        </Box>
      )}
      {isRemoved && (
        <Box
          sx={{
            p: 0.75, borderRadius: 1,
            bgcolor: 'rgba(239,68,68,0.06)',
            border: '1px solid rgba(239,68,68,0.2)',
            fontFamily: 'monospace', fontSize: 12,
            color: '#dc2626',
            textDecoration: 'line-through',
            wordBreak: 'break-word',
            whiteSpace: 'pre-wrap',
          }}
        >
          {formatValue(change.oldValue)}
        </Box>
      )}
    </Paper>
  );
};

interface DiffSummary {
  added: number;
  removed: number;
  modified: number;
  unchanged: number;
}

function summarize(changes: FieldChange[]): DiffSummary {
  return changes.reduce(
    (acc, c) => ({
      ...acc,
      [c.kind]: acc[c.kind] + 1,
    }),
    { added: 0, removed: 0, modified: 0, unchanged: 0 } as DiffSummary,
  );
}

const AuditPage: React.FC = () => {
  const { enqueueSnackbar } = useSnackbar();

  // Data
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [loading, setLoading] = useState(true);
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({ page: 0, pageSize: 10 });
  const [stats, setStats] = useState<{ total: number; by_action: Record<string, number> }>({ total: 0, by_action: {} });
  const [users, setUsers] = useState<Array<{ id: string; full_name: string; email: string }>>([]);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [filterEntityType, setFilterEntityType] = useState('');
  const [filterUser, setFilterUser] = useState('');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');

  // Drawer state for showing full details of a selected log
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  // Load users for the "Actor" filter
  useEffect(() => {
    userService.getAll({ pageSize: 100 }).then((res: any) => {
      const data = res?.data;
      const items = Array.isArray(data) && Array.isArray(data[0]) ? data[0] : [];
      setUsers(items.map((u: any) => ({ id: u.id, full_name: u.full_name, email: u.email })));
    }).catch(() => setUsers([]));
  }, []);

  // Load 7-day stats
  const loadStats = useCallback(() => {
    auditService.stats(7).then((s) => setStats({ total: s.total, by_action: s.by_action })).catch(() => {});
  }, []);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const { items, total } = await auditService.getAll({
        page: paginationModel.page + 1,
        pageSize: paginationModel.pageSize,
        action: filterAction || undefined,
        entityType: filterEntityType || undefined,
        userId: filterUser || undefined,
        startDate: filterStartDate || undefined,
        endDate: filterEndDate || undefined,
        search: searchQuery || undefined,
      });
      setLogs(items);
      setTotalRows(total);
    } catch {
      enqueueSnackbar('Failed to load audit logs', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [paginationModel, filterAction, filterEntityType, filterUser, filterStartDate, filterEndDate, searchQuery, enqueueSnackbar]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);
  useEffect(() => { loadStats(); }, [loadStats, logs.length]);

  const clearFilters = () => {
    setSearchQuery('');
    setFilterAction('');
    setFilterEntityType('');
    setFilterUser('');
    setFilterStartDate('');
    setFilterEndDate('');
  };
  const hasFilters = searchQuery || filterAction || filterEntityType || filterUser || filterStartDate || filterEndDate;

  // Top stat chips (last 7 days)
  const statChips = useMemo(() => {
    const ordered = Object.entries(stats.by_action).sort(([, a], [, b]) => b - a);
    return [{ key: 'all', label: 'Last 7d', count: stats.total, color: '#1a237e' }, ...ordered.map(([action, count]) => {
      const s = actionStyleFor(action);
      return { key: action, label: action, count, color: s.color };
    })];
  }, [stats]);

  // ── Columns ─────────────────────────────────────────────────────────────
  const columns: GridColDef[] = [
    {
      field: 'created_at',
      headerName: 'Timestamp',
      width: 200,
      renderCell: (params: any) => {
        try {
          return (
            <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: 12.5, color: '#1a237e' }}>
              {format(new Date(params.value), 'MMM dd, yyyy HH:mm:ss')}
            </Typography>
          );
        } catch { return '—'; }
      },
    },
    {
      field: 'user_name',
      headerName: 'Actor',
      flex: 1.3,
      minWidth: 280,
      renderCell: (params: any) => {
        const row = params.row as AuditLog;
        if (!row.user_id) {
          return <Typography variant="body2" color="text.secondary">System</Typography>;
        }
        return (
          <Box
            display="flex"
            alignItems="center"
            gap={1.25}
            sx={{ py: 0.75, height: '100%', width: '100%' }}
          >
            <Avatar sx={{
              width: 34, height: 34, fontSize: 12, fontWeight: 700,
              bgcolor: 'rgba(26,35,126,0.1)', color: '#1a237e',
              border: '1px solid rgba(26,35,126,0.25)',
              flexShrink: 0,
            }}>
              {initialsOf(row.user_name || row.user_email || '')}
            </Avatar>
            <Box sx={{ minWidth: 0, flexGrow: 1, lineHeight: 1.3 }}>
              <Typography variant="body2" fontWeight={600} noWrap sx={{ color: '#1a237e', fontSize: 13.5 }}>
                {row.user_name || '—'}
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block', fontSize: 12 }}>
                {row.user_email || ''}
              </Typography>
            </Box>
          </Box>
        );
      },
    },
    {
      field: 'action',
      headerName: 'Action',
      width: 170,
      renderCell: (params: any) => {
        const style = actionStyleFor(params.value);
        return (
          <Chip
            label={params.value}
            size="small"
            sx={{ fontWeight: 700, fontSize: 11, letterSpacing: 0.4, bgcolor: style.bg, color: style.color, border: `1px solid ${style.border}` }}
          />
        );
      },
    },
    {
      field: 'entity_type',
      headerName: 'Entity',
      flex: 1.1,
      minWidth: 240,
      renderCell: (params: any) => {
        const row = params.row as AuditLog;
        return (
          <Box sx={{ py: 0.75, minWidth: 0, lineHeight: 1.3 }}>
            <Typography variant="body2" fontWeight={600} noWrap sx={{ color: '#1a237e', fontSize: 13.5 }}>
              {prettyEntity(row.entity_type)}
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              noWrap
              sx={{ display: 'block', fontFamily: 'monospace', fontSize: 11.5 }}
            >
              {row.entity_id || '(new)'}
            </Typography>
          </Box>
        );
      },
    },
    {
      field: 'ip_address',
      headerName: 'IP Address',
      width: 160,
      renderCell: (params: any) => (
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ fontFamily: 'monospace', fontSize: 12.5 }}
        >
          {params.value || ''}
        </Typography>
      ),
    },
    {
      field: 'id',
      headerName: 'Details',
      width: 120,
      sortable: false,
      renderCell: (params: any) => (
        <Button
          size="small"
          variant="outlined"
          startIcon={<OpenInNew sx={{ fontSize: 14 }} />}
          onClick={(e) => { e.stopPropagation(); setSelectedLog(params.row as AuditLog); }}
          sx={{ fontSize: 11, fontWeight: 600 }}
        >
          View
        </Button>
      ),
    },
  ];

  return (
    <Box>
      {/* Header */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
        <Box>
          <Typography variant="h4" fontWeight={600} sx={{ color: '#1a237e' }}>
            Audit Log
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Immutable record of every state-changing action — filtered by who, what, and when.
          </Typography>
        </Box>
        <Button startIcon={<RefreshIcon />} onClick={fetchLogs} disabled={loading}>
          Refresh
        </Button>
      </Box>

      {/* Stat chips */}
      <Box display="flex" gap={1.5} mb={3} flexWrap="wrap">
        {statChips.map((chip) => (
          <Paper
            key={chip.key}
            elevation={0}
            onClick={() => {
              if (chip.key === 'all') setFilterAction('');
              else setFilterAction((prev) => (prev === chip.key ? '' : chip.key));
              setPaginationModel((p) => ({ ...p, page: 0 }));
            }}
            sx={{
              px: 2.5, py: 1, borderRadius: 2, cursor: 'pointer',
              border: '1px solid',
              borderColor: filterAction === chip.key ? chip.color : 'rgba(0,0,0,0.08)',
              bgcolor: filterAction === chip.key ? `${chip.color}10` : '#fff',
              minWidth: 110, textAlign: 'center',
              transition: 'all 0.15s ease',
              '&:hover': { borderColor: chip.color, bgcolor: `${chip.color}08` },
            }}
          >
            <Typography variant="h6" fontWeight={700} sx={{ color: chip.color, lineHeight: 1.1 }}>
              {chip.count}
            </Typography>
            <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ textTransform: 'uppercase', letterSpacing: 0.5, fontSize: 10 }}>
              {chip.label}
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
            placeholder="Search entity type / id / action…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
            sx={{ minWidth: 260 }}
          />
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel sx={labelStyle}>Action</InputLabel>
            <Select value={filterAction} onChange={(e) => setFilterAction(e.target.value)} label="Action">
              <MenuItem value="">All</MenuItem>
              {ACTIONS.map((a) => <MenuItem key={a} value={a}>{a}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel sx={labelStyle}>Entity</InputLabel>
            <Select value={filterEntityType} onChange={(e) => setFilterEntityType(e.target.value)} label="Entity">
              <MenuItem value="">All entities</MenuItem>
              {ENTITY_TYPES.map((t) => <MenuItem key={t} value={t}>{prettyEntity(t)}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel sx={labelStyle}>Actor</InputLabel>
            <Select value={filterUser} onChange={(e) => setFilterUser(e.target.value)} label="Actor">
              <MenuItem value="">Anyone</MenuItem>
              {users.map((u) => (
                <MenuItem key={u.id} value={u.id}>{u.full_name || u.email}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            size="small"
            type="date"
            label="From"
            InputLabelProps={{ shrink: true }}
            value={filterStartDate}
            onChange={(e) => setFilterStartDate(e.target.value)}
          />
          <TextField
            size="small"
            type="date"
            label="To"
            InputLabelProps={{ shrink: true }}
            value={filterEndDate}
            onChange={(e) => setFilterEndDate(e.target.value)}
          />
          {hasFilters && (
            <Button size="small" startIcon={<ClearIcon />} onClick={clearFilters}>
              Clear Filters
            </Button>
          )}
        </Box>
      </Paper>

      {/* Table */}
      <DataTable
        rows={logs}
        columns={columns}
        totalRows={totalRows}
        loading={loading}
        paginationModel={paginationModel}
        onPaginationModelChange={setPaginationModel}
        getRowId={(row: any) => row.id}
        density="comfortable"
        onRowClick={(p) => setSelectedLog(p.row as AuditLog)}
      />

      {/* Detail drawer */}
      <Drawer
        anchor="right"
        open={Boolean(selectedLog)}
        onClose={() => setSelectedLog(null)}
        PaperProps={{ sx: { width: { xs: '100%', md: 520 } } }}
      >
        {selectedLog && (
          <Box sx={{ p: 3, height: '100%', overflow: 'auto' }}>
            <Box display="flex" alignItems="flex-start" justifyContent="space-between" mb={2}>
              <Box>
                <Typography variant="overline" color="text.secondary" fontWeight={700}>
                  Audit Event
                </Typography>
                <Box display="flex" alignItems="center" gap={1} mt={0.5}>
                  {(() => {
                    const s = actionStyleFor(selectedLog.action);
                    return (
                      <Chip
                        label={selectedLog.action}
                        size="small"
                        sx={{ fontWeight: 700, fontSize: 12, bgcolor: s.bg, color: s.color, border: `1px solid ${s.border}` }}
                      />
                    );
                  })()}
                  <Typography variant="h6" fontWeight={700} sx={{ color: '#1a237e' }}>
                    {prettyEntity(selectedLog.entity_type)}
                  </Typography>
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace', display: 'block', mt: 0.5 }}>
                  {selectedLog.entity_id || '(new resource)'}
                </Typography>
              </Box>
              <IconButton size="small" onClick={() => setSelectedLog(null)}><CloseIcon /></IconButton>
            </Box>

            <Stack spacing={1.5} sx={{ mb: 2 }}>
              <Box display="flex" justifyContent="space-between">
                <Typography variant="caption" fontWeight={700} color="text.secondary">TIMESTAMP</Typography>
                <Typography variant="body2">
                  {(() => {
                    try { return format(new Date(selectedLog.created_at), 'MMM dd, yyyy HH:mm:ss'); }
                    catch { return '—'; }
                  })()}
                </Typography>
              </Box>
              <Box display="flex" justifyContent="space-between">
                <Typography variant="caption" fontWeight={700} color="text.secondary">ACTOR</Typography>
                <Typography variant="body2">
                  {selectedLog.user_name
                    ? `${selectedLog.user_name} (${selectedLog.user_email || ''})`
                    : selectedLog.user_id || 'System'}
                </Typography>
              </Box>
              <Box display="flex" justifyContent="space-between">
                <Typography variant="caption" fontWeight={700} color="text.secondary">IP</Typography>
                <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                  {selectedLog.ip_address || '—'}
                </Typography>
              </Box>
              {selectedLog.user_agent && (
                <Box>
                  <Typography variant="caption" fontWeight={700} color="text.secondary">USER AGENT</Typography>
                  <Typography variant="caption" sx={{ display: 'block', wordBreak: 'break-all', color: 'text.secondary' }}>
                    {selectedLog.user_agent}
                  </Typography>
                </Box>
              )}
            </Stack>

            {/* ── Changes (diff view) ─────────────────────────────────── */}
            {(() => {
              const oldVals = selectedLog.old_values as Record<string, any> | null;
              const newVals = selectedLog.new_values as Record<string, any> | null;

              if (!oldVals && !newVals) {
                return (
                  <Alert severity="info" sx={{ mt: 0.5 }}>
                    No payload captured (read-only or non-body action).
                  </Alert>
                );
              }

              const diff = computeDiff(oldVals, newVals);
              const summary = summarize(diff);
              const changed = diff.filter((d) => d.kind !== 'unchanged');
              const unchanged = diff.filter((d) => d.kind === 'unchanged');

              return (
                <Box sx={{ mb: 2 }}>
                  <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
                    <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ letterSpacing: 0.5 }}>
                      CHANGES
                    </Typography>
                    <Stack direction="row" spacing={0.75}>
                      {summary.modified > 0 && (
                        <Chip
                          size="small"
                          icon={<SwapHoriz sx={{ fontSize: 12 }} />}
                          label={`${summary.modified} changed`}
                          sx={{
                            height: 22, fontSize: 10, fontWeight: 700,
                            bgcolor: 'rgba(37,99,235,0.1)', color: '#2563eb',
                            border: '1px solid rgba(37,99,235,0.3)',
                            '& .MuiChip-icon': { color: '#2563eb' },
                          }}
                        />
                      )}
                      {summary.added > 0 && (
                        <Chip
                          size="small"
                          icon={<AddCircleOutline sx={{ fontSize: 12 }} />}
                          label={`${summary.added} added`}
                          sx={{
                            height: 22, fontSize: 10, fontWeight: 700,
                            bgcolor: 'rgba(16,185,129,0.1)', color: '#059669',
                            border: '1px solid rgba(16,185,129,0.3)',
                            '& .MuiChip-icon': { color: '#059669' },
                          }}
                        />
                      )}
                      {summary.removed > 0 && (
                        <Chip
                          size="small"
                          icon={<RemoveCircleOutline sx={{ fontSize: 12 }} />}
                          label={`${summary.removed} removed`}
                          sx={{
                            height: 22, fontSize: 10, fontWeight: 700,
                            bgcolor: 'rgba(239,68,68,0.1)', color: '#dc2626',
                            border: '1px solid rgba(239,68,68,0.35)',
                            '& .MuiChip-icon': { color: '#dc2626' },
                          }}
                        />
                      )}
                    </Stack>
                  </Box>

                  {changed.length === 0 ? (
                    <Alert severity="success" variant="outlined" sx={{ mt: 0.5 }}>
                      No effective changes — values are identical.
                    </Alert>
                  ) : (
                    <Box>
                      {changed.map((c) => <ChangeRow key={c.field} change={c} />)}
                    </Box>
                  )}

                  {/* Unchanged fields — collapsed to keep the diff focused */}
                  {unchanged.length > 0 && (
                    <Accordion
                      disableGutters
                      elevation={0}
                      sx={{
                        mt: 1, border: '1px solid rgba(0,0,0,0.08)', borderRadius: 1.5,
                        '&:before': { display: 'none' },
                      }}
                    >
                      <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 36, '& .MuiAccordionSummary-content': { my: 0.5 } }}>
                        <Typography variant="caption" fontWeight={700} color="text.secondary">
                          {unchanged.length} unchanged field{unchanged.length === 1 ? '' : 's'}
                        </Typography>
                      </AccordionSummary>
                      <AccordionDetails sx={{ pt: 0 }}>
                        <Box display="grid" gridTemplateColumns="max-content 1fr" gap={0.75}>
                          {unchanged.map((c) => (
                            <React.Fragment key={c.field}>
                              <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                                {c.field}
                              </Typography>
                              <Typography variant="caption" sx={{ fontFamily: 'monospace', wordBreak: 'break-word' }}>
                                {formatValue(c.newValue ?? c.oldValue)}
                              </Typography>
                            </React.Fragment>
                          ))}
                        </Box>
                      </AccordionDetails>
                    </Accordion>
                  )}

                  {/* Raw payload — always available via an expander for auditors */}
                  <Accordion
                    disableGutters
                    elevation={0}
                    sx={{
                      mt: 1, border: '1px solid rgba(0,0,0,0.08)', borderRadius: 1.5,
                      '&:before': { display: 'none' },
                    }}
                  >
                    <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 36, '& .MuiAccordionSummary-content': { my: 0.5 } }}>
                      <CodeIcon sx={{ fontSize: 16, mr: 1, color: 'text.secondary' }} />
                      <Typography variant="caption" fontWeight={700} color="text.secondary">
                        Raw payload (JSON)
                      </Typography>
                    </AccordionSummary>
                    <AccordionDetails sx={{ pt: 0 }}>
                      {oldVals && (
                        <Paper
                          variant="outlined"
                          sx={{ p: 1.25, mb: 1, bgcolor: 'rgba(239,68,68,0.04)', borderColor: 'rgba(239,68,68,0.25)' }}
                        >
                          <Typography variant="caption" fontWeight={700} sx={{ color: '#dc2626' }}>
                            BEFORE
                          </Typography>
                          <Box
                            component="pre"
                            sx={{ fontFamily: 'monospace', fontSize: 11.5, m: 0, mt: 0.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
                          >
                            {JSON.stringify(oldVals, null, 2)}
                          </Box>
                        </Paper>
                      )}
                      {newVals && (
                        <Paper
                          variant="outlined"
                          sx={{ p: 1.25, bgcolor: 'rgba(16,185,129,0.04)', borderColor: 'rgba(16,185,129,0.25)' }}
                        >
                          <Typography variant="caption" fontWeight={700} sx={{ color: '#059669' }}>
                            AFTER
                          </Typography>
                          <Box
                            component="pre"
                            sx={{ fontFamily: 'monospace', fontSize: 11.5, m: 0, mt: 0.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
                          >
                            {JSON.stringify(newVals, null, 2)}
                          </Box>
                        </Paper>
                      )}
                    </AccordionDetails>
                  </Accordion>
                </Box>
              );
            })()}
          </Box>
        )}
      </Drawer>
    </Box>
  );
};

export default AuditPage;
