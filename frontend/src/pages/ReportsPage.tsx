import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Grid,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Divider,
  Chip,
  CircularProgress,
  Stack,
} from '@mui/material';
import {
  PictureAsPdf as PdfIcon,
  TableChart as CsvIcon,
  Assessment as AssessmentIcon,
  BugReport as BugIcon,
  PlaylistAddCheck as ChecklistIcon,
  SpeedOutlined as SpeedIcon,
  FilterList as FilterIcon,
  Clear as ClearIcon,
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import reportService from '../services/reportService';
import testRunService from '../services/testRunService';
import { useProjects } from '../contexts/ProjectContext';

interface ReportAction {
  label: 'CSV' | 'PDF';
  key: string;
  fn: () => Promise<void>;
  disabled?: boolean;
  disabledReason?: string;
}

interface ReportCard {
  key: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  accent: string;
  scopeChip?: { label: string; tone: 'info' | 'warning' | 'default' };
  actions: ReportAction[];
}

const labelStyle = {
  fontWeight: 600,
  color: 'text.primary',
  '&.Mui-focused': { color: 'primary.main' },
  '&.MuiInputLabel-shrink': { fontWeight: 700, fontSize: '0.95rem' },
};

const ReportsPage: React.FC = () => {
  const { enqueueSnackbar } = useSnackbar();
  const { projects } = useProjects();

  const [selectedProject, setSelectedProject] = useState<string>('');
  const [selectedRun, setSelectedRun] = useState<string>('');
  const [runs, setRuns] = useState<Array<{ id: string; name: string; status: string; test_suite_id: string }>>([]);
  const [runsLoading, setRunsLoading] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);

  // Load test runs, filtered by selected project when set
  useEffect(() => {
    setRunsLoading(true);
    testRunService
      .getAll({ pageSize: 100, projectId: selectedProject || undefined })
      .then((res: any) => {
        const data = res?.data;
        const items = Array.isArray(data) && Array.isArray(data[0]) ? data[0] : [];
        setRuns(items.map((r: any) => ({
          id: r.id,
          name: r.name,
          status: r.status,
          test_suite_id: r.test_suite_id,
        })));
      })
      .catch(() => setRuns([]))
      .finally(() => setRunsLoading(false));
  }, [selectedProject]);

  // Clear the selected run if it's no longer in the filtered list
  useEffect(() => {
    if (selectedRun && !runs.find((r) => r.id === selectedRun)) {
      setSelectedRun('');
    }
  }, [runs, selectedRun]);

  const currentProject = useMemo(
    () => projects.find((p) => String(p.id) === selectedProject),
    [projects, selectedProject],
  );
  const currentRun = useMemo(() => runs.find((r) => r.id === selectedRun), [runs, selectedRun]);

  const runExport = async (key: string, fn: () => Promise<void>) => {
    setExporting(key);
    try {
      await fn();
      enqueueSnackbar('Export downloaded', { variant: 'success' });
    } catch (err: any) {
      enqueueSnackbar(err?.response?.data?.message || 'Export failed', { variant: 'error' });
    } finally {
      setExporting(null);
    }
  };

  const projectScopeChip = selectedProject
    ? { label: currentProject ? `${currentProject.code} — ${currentProject.name}` : 'Selected project', tone: 'info' as const }
    : { label: 'All Projects', tone: 'default' as const };

  const cards: ReportCard[] = [
    {
      key: 'test-cases',
      title: 'Test Cases',
      description: 'Full catalogue of test cases with type, priority, automation status, and assignee.',
      icon: <ChecklistIcon />,
      accent: '#1a237e',
      scopeChip: projectScopeChip,
      actions: [
        { label: 'CSV', key: 'tc-csv', fn: () => reportService.exportTestCasesCsv({ projectId: selectedProject || null }) },
        { label: 'PDF', key: 'tc-pdf', fn: () => reportService.exportTestCasesPdf({ projectId: selectedProject || null }) },
      ],
    },
    {
      key: 'defects',
      title: 'Defects',
      description: 'Bug list with severity, priority, status, reporter, assignee, and linked test case.',
      icon: <BugIcon />,
      accent: '#d32f2f',
      scopeChip: projectScopeChip,
      actions: [
        { label: 'CSV', key: 'def-csv', fn: () => reportService.exportDefectsCsv({ projectId: selectedProject || null }) },
        { label: 'PDF', key: 'def-pdf', fn: () => reportService.exportDefectsPdf({ projectId: selectedProject || null }) },
      ],
    },
    {
      key: 'test-run',
      title: 'Test Run Results',
      description: 'Per-test-case status, executor, and timing for a specific test run.',
      icon: <SpeedIcon />,
      accent: '#2563eb',
      scopeChip: currentRun
        ? { label: `Run: ${currentRun.name}`, tone: 'info' }
        : { label: 'Select a run', tone: 'warning' },
      actions: [
        {
          label: 'CSV',
          key: 'run-csv',
          fn: () => reportService.exportTestRunResultsCsv(selectedRun),
          disabled: !selectedRun,
          disabledReason: 'Pick a test run above',
        },
        {
          label: 'PDF',
          key: 'run-pdf',
          fn: () => reportService.exportTestRunResultsPdf(selectedRun),
          disabled: !selectedRun,
          disabledReason: 'Pick a test run above',
        },
      ],
    },
    {
      key: 'dashboard',
      title: 'Dashboard Summary',
      description: selectedProject
        ? 'Coverage, pass/fail ratio, automation %, defect density for the selected project.'
        : 'One section per project: coverage, pass/fail ratio, automation %, defect density.',
      icon: <AssessmentIcon />,
      accent: '#059669',
      scopeChip: projectScopeChip,
      actions: [
        {
          label: 'PDF',
          key: 'dash-pdf',
          fn: () => reportService.exportDashboardPdf(selectedProject || null),
        },
      ],
    },
  ];

  const hasFilters = selectedProject || selectedRun;
  const clearFilters = () => {
    setSelectedProject('');
    setSelectedRun('');
  };

  return (
    <Box>
      {/* Header */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography
          variant="h4"
          fontWeight={600}
          sx={(theme) => ({
            color: theme.palette.mode === 'dark' ? theme.palette.text.primary : theme.palette.secondary.main,
          })}
        >
          Reports
        </Typography>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Download test cases, defects, run results, and dashboard metrics as CSV or PDF.
      </Typography>

      {/* Filters */}
      <Paper elevation={0} sx={{ p: 2, mb: 3, border: '1px solid', borderColor: 'rgba(0,0,0,0.08)', borderRadius: 2 }}>
        <Box display="flex" gap={2} flexWrap="wrap" alignItems="center">
          <FilterIcon color="action" />
          <FormControl size="small" sx={{ minWidth: 220 }}>
            <InputLabel sx={labelStyle}>Project</InputLabel>
            <Select
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              label="Project"
            >
              <MenuItem value="">All Projects</MenuItem>
              {projects.map((p) => (
                <MenuItem key={p.id} value={String(p.id)}>
                  {p.code} — {p.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 260 }} disabled={runsLoading}>
            <InputLabel sx={labelStyle}>Test Run</InputLabel>
            <Select
              value={selectedRun}
              onChange={(e) => setSelectedRun(e.target.value)}
              label="Test Run"
            >
              <MenuItem value="">
                <em>
                  {runsLoading
                    ? 'Loading…'
                    : runs.length === 0
                      ? (selectedProject ? 'No test runs for this project' : 'No test runs')
                      : 'Select a test run'}
                </em>
              </MenuItem>
              {runs.map((r) => (
                <MenuItem key={r.id} value={r.id}>
                  {r.name}
                  <Chip
                    label={r.status}
                    size="small"
                    sx={{ ml: 1, fontSize: 10, height: 18 }}
                    variant="outlined"
                  />
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {hasFilters && (
            <Button size="small" startIcon={<ClearIcon />} onClick={clearFilters}>
              Clear Filters
            </Button>
          )}

          <Box flexGrow={1} />
          {runsLoading && <CircularProgress size={18} />}
        </Box>
      </Paper>

      {/* Cards */}
      <Grid container spacing={2.5}>
        {cards.map((c) => (
          <Grid item xs={12} md={6} lg={6} key={c.key}>
            <Paper
              elevation={0}
              sx={{
                p: 2.5,
                height: '100%',
                border: '1px solid',
                borderColor: 'rgba(0,0,0,0.08)',
                borderRadius: 2,
                display: 'flex',
                flexDirection: 'column',
                transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
                '&:hover': {
                  borderColor: c.accent,
                  boxShadow: `0 6px 20px -12px ${c.accent}80`,
                },
              }}
            >
              <Box display="flex" alignItems="flex-start" gap={1.5} mb={1}>
                <Box
                  sx={{
                    width: 40,
                    height: 40,
                    borderRadius: 1.5,
                    bgcolor: `${c.accent}15`,
                    color: c.accent,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {c.icon}
                </Box>
                <Box flexGrow={1}>
                  <Typography variant="h6" fontWeight={700} sx={{ color: 'secondary.main', lineHeight: 1.2 }}>
                    {c.title}
                  </Typography>
                  {c.scopeChip && (
                    <Chip
                      label={c.scopeChip.label}
                      size="small"
                      sx={{
                        mt: 0.5,
                        fontSize: 11,
                        fontWeight: 600,
                        bgcolor:
                          c.scopeChip.tone === 'info' ? `${c.accent}14`
                            : c.scopeChip.tone === 'warning' ? 'rgba(245,158,11,0.12)'
                            : 'rgba(107,114,128,0.1)',
                        color:
                          c.scopeChip.tone === 'info' ? c.accent
                            : c.scopeChip.tone === 'warning' ? '#d97706'
                            : '#6b7280',
                        border: '1px solid',
                        borderColor:
                          c.scopeChip.tone === 'info' ? `${c.accent}40`
                            : c.scopeChip.tone === 'warning' ? 'rgba(245,158,11,0.4)'
                            : 'rgba(107,114,128,0.25)',
                        maxWidth: 280,
                        '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis' },
                      }}
                    />
                  )}
                </Box>
              </Box>

              <Typography variant="body2" color="text.secondary" sx={{ mb: 2, flexGrow: 1 }}>
                {c.description}
              </Typography>

              <Divider sx={{ mb: 1.5 }} />

              <Stack direction="row" spacing={1} flexWrap="wrap">
                {c.actions.map((action) => {
                  const isBusy = exporting === action.key;
                  const isCsv = action.label === 'CSV';
                  return (
                    <Button
                      key={action.key}
                      variant="outlined"
                      startIcon={
                        isBusy ? <CircularProgress size={14} /> : isCsv ? <CsvIcon /> : <PdfIcon />
                      }
                      disabled={Boolean(action.disabled) || isBusy}
                      onClick={() => runExport(action.key, action.fn)}
                      title={action.disabled ? action.disabledReason : undefined}
                      sx={{
                        fontWeight: 600,
                        borderColor: `${c.accent}55`,
                        color: c.accent,
                        '&:hover': {
                          bgcolor: `${c.accent}0a`,
                          borderColor: c.accent,
                        },
                      }}
                    >
                      {isBusy ? 'Exporting…' : action.label}
                    </Button>
                  );
                })}
              </Stack>
              {c.actions.some((a) => a.disabled) && (
                <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
                  {c.actions.find((a) => a.disabled)?.disabledReason}
                </Typography>
              )}
            </Paper>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
};

export default ReportsPage;
