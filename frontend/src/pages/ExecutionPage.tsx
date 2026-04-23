import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  TextField,
  Chip,
  Divider,
  Grid,
  Paper,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  ListItemIcon,
  LinearProgress,
  Alert,
  IconButton,
  Tooltip,
  Badge,
  Collapse,
} from '@mui/material';
import {
  ArrowBack,
  CheckCircle,
  Cancel,
  Block,
  SkipNext,
  RadioButtonUnchecked,
  CloudUpload,
  Delete as DeleteIcon,
  ExpandMore,
  ExpandLess,
  NavigateNext,
  NavigateBefore,
  PlayArrow,
  Image as ImageIcon,
  Videocam,
  InsertDriveFile,
  SaveAlt,
  DoneAll,
  BugReport,
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import executionService from '../services/executionService';
import testRunService from '../services/testRunService';
import LoadingSpinner from '../components/common/LoadingSpinner';
import StepDefectDialog from '../components/executions/StepDefectDialog';
import { severityColor } from '../utils/statusColors';

type ExecStatus = 'not_run' | 'pass' | 'fail' | 'blocked' | 'skipped' | 'Not Run' | 'Pass' | 'Fail' | 'Blocked' | 'Skipped';

const normalizeStatus = (s: string | undefined): string => {
  if (!s) return 'not_run';
  const lower = s.toLowerCase().replace(/\s+/g, '_');
  if (lower === 'not_run') return 'not_run';
  if (lower === 'pass' || lower === 'passed') return 'pass';
  if (lower === 'fail' || lower === 'failed') return 'fail';
  if (lower === 'blocked') return 'blocked';
  if (lower === 'skipped') return 'skipped';
  return 'not_run';
};

const statusConfig: Record<string, { icon: React.ReactNode; color: string; label: string; bg: string }> = {
  not_run: { icon: <RadioButtonUnchecked />, color: '#9e9e9e', label: 'Not Run', bg: 'rgba(158,158,158,0.08)' },
  pass: { icon: <CheckCircle />, color: '#4caf50', label: 'Pass', bg: 'rgba(76,175,80,0.08)' },
  fail: { icon: <Cancel />, color: '#f44336', label: 'Fail', bg: 'rgba(244,67,54,0.08)' },
  blocked: { icon: <Block />, color: '#ff9800', label: 'Blocked', bg: 'rgba(255,152,0,0.08)' },
  skipped: { icon: <SkipNext />, color: '#607d8b', label: 'Skipped', bg: 'rgba(96,125,139,0.08)' },
};

const getConfig = (s: string) => statusConfig[normalizeStatus(s)] || statusConfig.not_run;

interface StepState {
  status: string;
  actualResult: string;
  notes: string;
  attachments: Array<{ url: string; filename: string; isNew?: boolean; file?: File }>;
}

interface StepDefect {
  id: string;
  defect_id: string;
  title: string;
  severity: string;
  priority: string;
  status: string;
  step_number: number | null;
}

const ExecutionPage: React.FC = () => {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();

  const [testRun, setTestRun] = useState<any>(null);
  const [executions, setExecutions] = useState<any[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Per-step state for the current execution
  const [stepStates, setStepStates] = useState<Record<number, StepState>>({});
  const [overallNotes, setOverallNotes] = useState('');
  const [expandedSteps, setExpandedSteps] = useState<Record<number, boolean>>({});

  // Defects attached to the current execution, grouped by step_number
  const [stepDefects, setStepDefects] = useState<Record<number, StepDefect[]>>({});
  const [defectDialog, setDefectDialog] = useState<{ open: boolean; stepNumber: number }>({
    open: false,
    stepNumber: 0,
  });

  const fileInputRefs = useRef<Record<number, HTMLInputElement | null>>({});

  // Load data
  const loadData = useCallback(async () => {
    if (!runId) return;
    setLoading(true);
    try {
      const [run, execs] = await Promise.all([
        testRunService.getById(runId),
        executionService.getByRunId(runId),
      ]);
      setTestRun(run);
      setExecutions(execs);
      if (execs.length > 0) {
        loadExecutionState(execs[0]);
      }
    } catch {
      enqueueSnackbar('Failed to load execution data', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [runId, enqueueSnackbar]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const loadExecutionState = (exec: any) => {
    const states: Record<number, StepState> = {};
    const expanded: Record<number, boolean> = {};
    const steps = exec?.test_case?.steps || [];
    const existingResults = exec?.step_results || [];

    steps.forEach((step: any, idx: number) => {
      const stepNum = step.step_number || idx + 1;
      const existing = existingResults.find((sr: any) => sr.step_number === stepNum);
      states[stepNum] = {
        status: existing ? normalizeStatus(existing.status) : 'not_run',
        actualResult: existing?.actual_result || '',
        notes: existing?.notes || '',
        attachments: existing?.attachments || [],
      };
      expanded[stepNum] = true;
    });

    setStepStates(states);
    setExpandedSteps(expanded);
    setOverallNotes(exec?.notes || '');

    if (exec?.id) {
      loadStepDefects(exec.id);
    } else {
      setStepDefects({});
    }
  };

  const loadStepDefects = async (execId: string) => {
    try {
      const defects = await executionService.listDefects(execId);
      const grouped: Record<number, StepDefect[]> = {};
      (defects || []).forEach((d: any) => {
        const sn = d.step_number ?? 0;
        if (!grouped[sn]) grouped[sn] = [];
        grouped[sn].push(d);
      });
      setStepDefects(grouped);
    } catch {
      setStepDefects({});
    }
  };

  const handleUnlinkDefect = async (stepNumber: number, defectId: string, defectCode: string) => {
    const exec = executions[selectedIndex];
    if (!exec) return;
    try {
      await executionService.detachStepDefect(exec.id, stepNumber, defectId);
      enqueueSnackbar(`Unlinked ${defectCode}`, { variant: 'success' });
      await loadStepDefects(exec.id);
    } catch {
      enqueueSnackbar('Failed to unlink bug', { variant: 'error' });
    }
  };

  const handleSelectExecution = (index: number) => {
    setSelectedIndex(index);
    loadExecutionState(executions[index]);
  };

  const handleStepStatusChange = (stepNum: number, status: string) => {
    setStepStates((prev) => ({
      ...prev,
      [stepNum]: { ...prev[stepNum], status: prev[stepNum]?.status === status ? 'not_run' : status },
    }));
  };

  const handleStepFieldChange = (stepNum: number, field: 'actualResult' | 'notes', value: string) => {
    setStepStates((prev) => ({
      ...prev,
      [stepNum]: { ...prev[stepNum], [field]: value },
    }));
  };

  const handleFileUpload = async (stepNum: number, files: FileList | null) => {
    if (!files || files.length === 0) return;
    const exec = executions[selectedIndex];
    if (!exec) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const result = await executionService.uploadAttachment(exec.id, stepNum, file);
        setStepStates((prev) => ({
          ...prev,
          [stepNum]: {
            ...prev[stepNum],
            attachments: [
              ...(prev[stepNum]?.attachments || []),
              { url: result.url, filename: result.filename, isNew: true },
            ],
          },
        }));
        enqueueSnackbar(`Uploaded: ${file.name}`, { variant: 'success' });
      } catch {
        enqueueSnackbar(`Failed to upload: ${file.name}`, { variant: 'error' });
      }
    }
  };

  const handleRemoveAttachment = (stepNum: number, idx: number) => {
    setStepStates((prev) => ({
      ...prev,
      [stepNum]: {
        ...prev[stepNum],
        attachments: prev[stepNum].attachments.filter((_, i) => i !== idx),
      },
    }));
  };

  const toggleStep = (stepNum: number) => {
    setExpandedSteps((prev) => ({ ...prev, [stepNum]: !prev[stepNum] }));
  };

  const handleSave = async () => {
    const exec = executions[selectedIndex];
    if (!exec) return;

    setSaving(true);
    try {
      const steps = exec.test_case?.steps || [];
      const stepResults = steps.map((step: any, idx: number) => {
        const stepNum = step.step_number || idx + 1;
        const state = stepStates[stepNum] || {};
        return {
          step_number: stepNum,
          status: state.status || 'not_run',
          actual_result: state.actualResult || '',
          notes: state.notes || '',
          attachments: (state.attachments || []).map((att: any) => ({
            url: att.url,
            filename: att.filename,
          })),
        };
      });

      // Determine overall status from steps
      const allStatuses = stepResults.map((s: any) => s.status);
      let overallStatus = 'pass';
      if (allStatuses.some((s: string) => s === 'fail')) overallStatus = 'fail';
      else if (allStatuses.some((s: string) => s === 'blocked')) overallStatus = 'blocked';
      else if (allStatuses.every((s: string) => s === 'skipped')) overallStatus = 'skipped';
      else if (allStatuses.some((s: string) => s === 'not_run')) overallStatus = 'not_run';

      await executionService.updateExecution(exec.id, {
        status: overallStatus,
        notes: overallNotes,
        step_results: stepResults,
      });

      enqueueSnackbar('Execution saved successfully', { variant: 'success' });

      // Refresh data
      const updatedExecs = await executionService.getByRunId(runId!);
      setExecutions(updatedExecs);
      loadExecutionState(updatedExecs[selectedIndex]);
    } catch {
      enqueueSnackbar('Failed to save execution', { variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAndNext = async () => {
    await handleSave();
    if (selectedIndex < executions.length - 1) {
      const nextIdx = selectedIndex + 1;
      setSelectedIndex(nextIdx);
      loadExecutionState(executions[nextIdx]);
    }
  };

  const [completing, setCompleting] = useState(false);

  const handleCompleteRun = async () => {
    setCompleting(true);
    try {
      await testRunService.complete(runId!);
      enqueueSnackbar('Test run completed successfully', { variant: 'success' });
      navigate('/test-runs', { replace: true });
    } catch (err: any) {
      enqueueSnackbar(err.response?.data?.message || 'Failed to complete test run', { variant: 'error' });
    } finally {
      setCompleting(false);
    }
  };

  if (loading) return <LoadingSpinner />;
  if (!testRun) return <Alert severity="error">Test run not found</Alert>;

  const currentExec = executions[selectedIndex];
  const testCase = currentExec?.test_case;
  const steps = testCase?.steps || [];

  // Progress stats
  const totalExecs = executions.length;
  const passCount = executions.filter((e) => normalizeStatus(e.status) === 'pass').length;
  const failCount = executions.filter((e) => normalizeStatus(e.status) === 'fail').length;
  const blockedCount = executions.filter((e) => normalizeStatus(e.status) === 'blocked').length;
  const skippedCount = executions.filter((e) => normalizeStatus(e.status) === 'skipped').length;
  const executedCount = passCount + failCount + blockedCount + skippedCount;
  const progressPct = totalExecs > 0 ? (executedCount / totalExecs) * 100 : 0;

  const getAttachmentIcon = (filename: string) => {
    const ext = filename.toLowerCase().split('.').pop() || '';
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) return <ImageIcon fontSize="small" />;
    if (['mp4', 'mov', 'avi', 'webm', 'mkv'].includes(ext)) return <Videocam fontSize="small" />;
    return <InsertDriveFile fontSize="small" />;
  };

  return (
    <Box sx={{ height: 'calc(100vh - 100px)', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Box display="flex" alignItems="center" gap={2} mb={1.5}>
        <Button startIcon={<ArrowBack />} onClick={() => navigate('/test-runs')} size="small">
          Back
        </Button>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h5" fontWeight={700} sx={{ color: '#1a237e' }}>
            {testRun.name}
          </Typography>
          {testRun.environment && (
            <Typography variant="caption" color="text.secondary">
              Environment: {testRun.environment}
            </Typography>
          )}
        </Box>
        <Chip label={testRun.status} color={testRun.status === 'In Progress' ? 'primary' : 'default'} size="small" />
        {testRun.status === 'In Progress' && (
          <Button
            variant="contained"
            color="success"
            startIcon={<DoneAll />}
            onClick={handleCompleteRun}
            disabled={completing}
            size="small"
          >
            {completing ? 'Completing...' : 'Complete Test Run'}
          </Button>
        )}
      </Box>

      {/* Progress bar + stats */}
      <Paper sx={{ p: 1.5, mb: 1.5 }}>
        <Box display="flex" alignItems="center" gap={2} mb={0.5}>
          <Typography variant="body2" fontWeight={600} sx={{ minWidth: 80 }}>
            Progress
          </Typography>
          <Box sx={{ flexGrow: 1 }}>
            <LinearProgress
              variant="determinate"
              value={progressPct}
              sx={{
                height: 8,
                borderRadius: 4,
                bgcolor: 'rgba(0,0,0,0.06)',
                '& .MuiLinearProgress-bar': {
                  borderRadius: 4,
                  background: progressPct === 100 ? '#4caf50' : 'linear-gradient(90deg, #1a237e, #3f51b5)',
                },
              }}
            />
          </Box>
          <Typography variant="body2" fontWeight={600} sx={{ minWidth: 60, textAlign: 'right' }}>
            {executedCount}/{totalExecs}
          </Typography>
        </Box>
        <Box display="flex" gap={1.5} justifyContent="center">
          {[
            { label: 'Pass', count: passCount, color: '#4caf50' },
            { label: 'Fail', count: failCount, color: '#f44336' },
            { label: 'Blocked', count: blockedCount, color: '#ff9800' },
            { label: 'Skipped', count: skippedCount, color: '#607d8b' },
            { label: 'Not Run', count: totalExecs - executedCount, color: '#9e9e9e' },
          ].map((stat) => (
            <Chip
              key={stat.label}
              label={`${stat.label}: ${stat.count}`}
              size="small"
              sx={{
                fontWeight: 600,
                fontSize: 11,
                bgcolor: `${stat.color}14`,
                color: stat.color,
                border: `1px solid ${stat.color}40`,
              }}
            />
          ))}
        </Box>
      </Paper>

      {/* Main content: split pane */}
      <Grid container spacing={1.5} sx={{ flexGrow: 1, minHeight: 0 }}>
        {/* Left panel: test case list */}
        <Grid item xs={12} md={3}>
          <Paper
            sx={{
              height: 'calc(100vh - 290px)',
              overflow: 'auto',
              border: '1px solid',
              borderColor: 'divider',
            }}
          >
            <Box sx={{ p: 1, bgcolor: '#f5f5f5', borderBottom: '1px solid', borderColor: 'divider' }}>
              <Typography variant="subtitle2" fontWeight={700} color="text.secondary">
                Test Cases ({totalExecs})
              </Typography>
            </Box>
            <List dense disablePadding>
              {executions.map((exec, idx) => {
                const config = getConfig(exec.status);
                const tcTitle = exec.test_case?.title || exec.test_case?.test_case_id || `Case #${idx + 1}`;
                return (
                  <ListItem key={exec.id} disablePadding sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
                    <ListItemButton
                      selected={idx === selectedIndex}
                      onClick={() => handleSelectExecution(idx)}
                      sx={{
                        py: 1,
                        '&.Mui-selected': {
                          bgcolor: 'rgba(26, 35, 126, 0.06)',
                          borderLeft: '3px solid #1a237e',
                        },
                      }}
                    >
                      <ListItemIcon sx={{ minWidth: 32 }}>
                        <Tooltip title={config.label}>
                          <Box sx={{ color: config.color, display: 'flex' }}>{config.icon}</Box>
                        </Tooltip>
                      </ListItemIcon>
                      <ListItemText
                        primary={tcTitle}
                        primaryTypographyProps={{
                          variant: 'body2',
                          noWrap: true,
                          fontWeight: idx === selectedIndex ? 600 : 400,
                        }}
                        secondary={exec.test_case?.type ? (
                          <Chip label={exec.test_case.type} size="small" sx={{ fontSize: 10, height: 18, mt: 0.3 }} />
                        ) : null}
                      />
                      <Badge
                        badgeContent={
                          (exec.step_results || []).filter((sr: any) => normalizeStatus(sr.status) !== 'not_run').length
                        }
                        color="primary"
                        sx={{ mr: 0.5, '& .MuiBadge-badge': { fontSize: 10, minWidth: 16, height: 16 } }}
                        max={99}
                      />
                    </ListItemButton>
                  </ListItem>
                );
              })}
            </List>
          </Paper>
        </Grid>

        {/* Right panel: execution detail */}
        <Grid item xs={12} md={9}>
          {currentExec && testCase ? (
            <Paper
              sx={{
                height: 'calc(100vh - 290px)',
                overflow: 'auto',
                border: '1px solid',
                borderColor: 'divider',
              }}
            >
              {/* Test case header */}
              <Box sx={{ p: 2, bgcolor: '#fafafa', borderBottom: '1px solid', borderColor: 'divider' }}>
                <Box display="flex" alignItems="flex-start" justifyContent="space-between">
                  <Box sx={{ flexGrow: 1 }}>
                    <Box display="flex" alignItems="center" gap={1} mb={0.5}>
                      {testCase.test_case_id && (
                        <Chip label={testCase.test_case_id} size="small" variant="outlined" sx={{ fontWeight: 600, fontSize: 11 }} />
                      )}
                      <Typography variant="h6" fontWeight={700} sx={{ color: '#1a237e' }}>
                        {testCase.title}
                      </Typography>
                    </Box>
                    {testCase.description && (
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                        {testCase.description}
                      </Typography>
                    )}
                    <Box display="flex" gap={0.5}>
                      {testCase.type && <Chip label={testCase.type} size="small" sx={{ fontSize: 11 }} />}
                      {testCase.priority && (
                        <Chip
                          label={testCase.priority}
                          size="small"
                          sx={{
                            fontSize: 11,
                            bgcolor: testCase.priority === 'Critical' ? 'rgba(244,67,54,0.1)' :
                                     testCase.priority === 'High' ? 'rgba(255,152,0,0.1)' : 'rgba(0,0,0,0.04)',
                            color: testCase.priority === 'Critical' ? '#f44336' :
                                   testCase.priority === 'High' ? '#ff9800' : 'text.secondary',
                          }}
                        />
                      )}
                      <Chip
                        label={getConfig(currentExec.status).label}
                        size="small"
                        sx={{
                          fontSize: 11,
                          fontWeight: 700,
                          bgcolor: getConfig(currentExec.status).bg,
                          color: getConfig(currentExec.status).color,
                          border: `1px solid ${getConfig(currentExec.status).color}40`,
                        }}
                      />
                    </Box>
                  </Box>
                  <Box display="flex" alignItems="center" gap={0.5}>
                    <Typography variant="caption" color="text.secondary" sx={{ mr: 1 }}>
                      {selectedIndex + 1} of {totalExecs}
                    </Typography>
                    <IconButton
                      size="small"
                      disabled={selectedIndex === 0}
                      onClick={() => handleSelectExecution(selectedIndex - 1)}
                    >
                      <NavigateBefore />
                    </IconButton>
                    <IconButton
                      size="small"
                      disabled={selectedIndex >= totalExecs - 1}
                      onClick={() => handleSelectExecution(selectedIndex + 1)}
                    >
                      <NavigateNext />
                    </IconButton>
                  </Box>
                </Box>
              </Box>

              {/* Preconditions */}
              {testCase.preconditions && (
                <Alert severity="info" sx={{ mx: 2, mt: 1.5, borderRadius: 2 }}>
                  <Typography variant="subtitle2" fontWeight={600}>Preconditions</Typography>
                  <Typography variant="body2">{testCase.preconditions}</Typography>
                </Alert>
              )}

              {/* Steps */}
              <Box sx={{ p: 2 }}>
                <Box display="flex" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
                  <Typography variant="subtitle1" fontWeight={700} sx={{ color: '#1a237e' }}>
                    Test Steps ({steps.length})
                  </Typography>
                  {steps.length > 0 && (
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<CheckCircle />}
                      onClick={() => {
                        setStepStates((prev) => {
                          const updated = { ...prev };
                          steps.forEach((step: any, idx: number) => {
                            const stepNum = step.step_number || idx + 1;
                            updated[stepNum] = { ...updated[stepNum], status: 'pass' };
                          });
                          return updated;
                        });
                      }}
                      sx={{
                        color: '#4caf50',
                        borderColor: '#4caf50',
                        '&:hover': { bgcolor: '#4caf50', color: '#fff', borderColor: '#4caf50' },
                      }}
                    >
                      Pass All Steps
                    </Button>
                  )}
                </Box>

                {steps.length === 0 ? (
                  <Alert severity="warning">No test steps defined for this test case.</Alert>
                ) : (
                  steps.map((step: any, idx: number) => {
                    const stepNum = step.step_number || idx + 1;
                    const state = stepStates[stepNum] || { status: 'not_run', actualResult: '', notes: '', attachments: [] };
                    const config = getConfig(state.status);
                    const isExpanded = expandedSteps[stepNum] !== false;

                    return (
                      <Card
                        key={stepNum}
                        variant="outlined"
                        sx={{
                          mb: 1.5,
                          borderColor: state.status !== 'not_run' ? `${config.color}60` : 'divider',
                          borderLeft: `4px solid ${config.color}`,
                        }}
                      >
                        {/* Step header */}
                        <Box
                          display="flex"
                          alignItems="center"
                          sx={{ px: 2, py: 1, cursor: 'pointer', bgcolor: config.bg }}
                          onClick={() => toggleStep(stepNum)}
                        >
                          <Box sx={{ color: config.color, mr: 1, display: 'flex' }}>{config.icon}</Box>
                          <Typography variant="subtitle2" fontWeight={700} sx={{ flexGrow: 1 }}>
                            Step {stepNum}
                          </Typography>
                          {(stepDefects[stepNum] || []).length > 0 && (
                            <Tooltip title={`${stepDefects[stepNum].length} bug(s) attached`}>
                              <Chip
                                icon={<BugReport sx={{ fontSize: 14 }} />}
                                label={stepDefects[stepNum].length}
                                size="small"
                                sx={{
                                  height: 22,
                                  mr: 1,
                                  bgcolor: 'rgba(244,67,54,0.12)',
                                  color: '#d32f2f',
                                  fontWeight: 700,
                                  border: '1px solid rgba(244,67,54,0.4)',
                                }}
                              />
                            </Tooltip>
                          )}
                          <Box display="flex" gap={0.5} mr={1}>
                            {(['pass', 'fail', 'blocked', 'skipped'] as string[]).map((s) => {
                              const sc = statusConfig[s];
                              const isActive = state.status === s;
                              return (
                                <Tooltip key={s} title={sc.label}>
                                  <IconButton
                                    size="small"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleStepStatusChange(stepNum, s);
                                    }}
                                    sx={{
                                      width: 28,
                                      height: 28,
                                      bgcolor: isActive ? sc.color : 'transparent',
                                      color: isActive ? '#fff' : sc.color,
                                      border: `1.5px solid ${sc.color}`,
                                      '&:hover': { bgcolor: sc.color, color: '#fff' },
                                    }}
                                  >
                                    {React.cloneElement(sc.icon as React.ReactElement, { sx: { fontSize: 16 } })}
                                  </IconButton>
                                </Tooltip>
                              );
                            })}
                          </Box>
                          {isExpanded ? <ExpandLess /> : <ExpandMore />}
                        </Box>

                        <Collapse in={isExpanded}>
                          <CardContent sx={{ pt: 1 }}>
                            {/* Action */}
                            <Box sx={{ mb: 1.5 }}>
                              <Typography variant="caption" fontWeight={700} color="text.secondary">
                                ACTION
                              </Typography>
                              <Typography variant="body2" sx={{ mt: 0.3, whiteSpace: 'pre-wrap' }}>
                                {step.action}
                              </Typography>
                            </Box>

                            {/* Expected Result */}
                            <Box sx={{ mb: 1.5 }}>
                              <Typography variant="caption" fontWeight={700} color="text.secondary">
                                EXPECTED RESULT
                              </Typography>
                              <Typography variant="body2" sx={{ mt: 0.3, whiteSpace: 'pre-wrap' }}>
                                {step.expected_result}
                              </Typography>
                            </Box>

                            {/* Test Data */}
                            {step.test_data && (
                              <Box sx={{ mb: 1.5 }}>
                                <Typography variant="caption" fontWeight={700} color="text.secondary">
                                  TEST DATA
                                </Typography>
                                <Typography variant="body2" sx={{ mt: 0.3, fontFamily: 'monospace', bgcolor: 'rgba(0,0,0,0.03)', p: 0.5, borderRadius: 1 }}>
                                  {step.test_data}
                                </Typography>
                              </Box>
                            )}

                            <Divider sx={{ my: 1.5 }} />

                            {/* Actual Result */}
                            <TextField
                              label="Actual Result"
                              size="small"
                              fullWidth
                              multiline
                              minRows={2}
                              maxRows={5}
                              value={state.actualResult}
                              onChange={(e) => handleStepFieldChange(stepNum, 'actualResult', e.target.value)}
                              sx={{ mb: 1.5 }}
                              placeholder="Enter the actual result observed..."
                            />

                            {/* Notes */}
                            <TextField
                              label="Notes"
                              size="small"
                              fullWidth
                              multiline
                              minRows={1}
                              maxRows={3}
                              value={state.notes}
                              onChange={(e) => handleStepFieldChange(stepNum, 'notes', e.target.value)}
                              sx={{ mb: 1.5 }}
                              placeholder="Any additional notes..."
                            />

                            {/* Bugs for this step */}
                            <Box sx={{ mb: 1.5 }}>
                              <Box display="flex" alignItems="center" gap={1} mb={1}>
                                <Typography variant="caption" fontWeight={700} color="text.secondary">
                                  BUGS
                                </Typography>
                                <Button
                                  size="small"
                                  variant="outlined"
                                  color="error"
                                  startIcon={<BugReport />}
                                  onClick={() => setDefectDialog({ open: true, stepNumber: stepNum })}
                                  sx={{ fontSize: 11, py: 0.3 }}
                                >
                                  Attach Bug
                                </Button>
                              </Box>
                              {(stepDefects[stepNum] || []).length > 0 && (
                                <Box display="flex" gap={0.75} flexWrap="wrap">
                                  {(stepDefects[stepNum] || []).map((d) => (
                                    <Chip
                                      key={d.id}
                                      icon={<BugReport sx={{ fontSize: 14 }} />}
                                      label={`${d.defect_id} · ${d.title}`}
                                      size="small"
                                      onClick={() => navigate(`/defects?edit=${d.id}`)}
                                      onDelete={() => handleUnlinkDefect(stepNum, d.id, d.defect_id)}
                                      deleteIcon={<DeleteIcon fontSize="small" />}
                                      sx={{
                                        maxWidth: 360,
                                        bgcolor: `${severityColor(d.severity)}14`,
                                        color: severityColor(d.severity),
                                        border: `1px solid ${severityColor(d.severity)}60`,
                                        fontWeight: 600,
                                        '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis' },
                                      }}
                                    />
                                  ))}
                                </Box>
                              )}
                            </Box>

                            {/* File Upload */}
                            <Box>
                              <Box display="flex" alignItems="center" gap={1} mb={1}>
                                <Typography variant="caption" fontWeight={700} color="text.secondary">
                                  ATTACHMENTS
                                </Typography>
                                <input
                                  type="file"
                                  accept="image/*,video/*,.pdf,.doc,.docx"
                                  multiple
                                  style={{ display: 'none' }}
                                  ref={(el) => { fileInputRefs.current[stepNum] = el; }}
                                  onChange={(e) => handleFileUpload(stepNum, e.target.files)}
                                />
                                <Button
                                  size="small"
                                  variant="outlined"
                                  startIcon={<CloudUpload />}
                                  onClick={() => fileInputRefs.current[stepNum]?.click()}
                                  sx={{ fontSize: 11, py: 0.3 }}
                                >
                                  Upload Screenshot / Video
                                </Button>
                              </Box>

                              {/* Attachment list */}
                              {state.attachments.length > 0 && (
                                <Box display="flex" gap={1} flexWrap="wrap">
                                  {state.attachments.map((att, attIdx) => (
                                    <Chip
                                      key={attIdx}
                                      icon={getAttachmentIcon(att.filename)}
                                      label={att.filename}
                                      size="small"
                                      variant="outlined"
                                      onClick={() => {
                                        const baseUrl = process.env.REACT_APP_API_BASE_URL?.replace('/api/v1', '') || 'http://localhost:8000';
                                        window.open(`${baseUrl}${att.url}`, '_blank');
                                      }}
                                      onDelete={() => handleRemoveAttachment(stepNum, attIdx)}
                                      deleteIcon={<DeleteIcon fontSize="small" />}
                                      sx={{
                                        maxWidth: 220,
                                        '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis' },
                                      }}
                                    />
                                  ))}
                                </Box>
                              )}
                            </Box>
                          </CardContent>
                        </Collapse>
                      </Card>
                    );
                  })
                )}

                {/* Overall Notes */}
                <Divider sx={{ my: 2 }} />
                <TextField
                  label="Overall Execution Notes"
                  fullWidth
                  multiline
                  rows={2}
                  value={overallNotes}
                  onChange={(e) => setOverallNotes(e.target.value)}
                  placeholder="Overall observations, environment issues, etc..."
                  sx={{ mb: 2 }}
                />

                {/* Action buttons */}
                <Box display="flex" justifyContent="space-between" alignItems="center">
                  <Box display="flex" gap={1}>
                    <Button
                      size="small"
                      disabled={selectedIndex === 0}
                      startIcon={<NavigateBefore />}
                      onClick={() => handleSelectExecution(selectedIndex - 1)}
                    >
                      Previous
                    </Button>
                    <Button
                      size="small"
                      disabled={selectedIndex >= totalExecs - 1}
                      endIcon={<NavigateNext />}
                      onClick={() => handleSelectExecution(selectedIndex + 1)}
                    >
                      Next
                    </Button>
                  </Box>
                  <Box display="flex" gap={1}>
                    <Button
                      variant="contained"
                      startIcon={<SaveAlt />}
                      onClick={handleSave}
                      disabled={saving}
                    >
                      {saving ? 'Saving...' : 'Save Results'}
                    </Button>
                    {selectedIndex < totalExecs - 1 && (
                      <Button
                        variant="contained"
                        color="secondary"
                        endIcon={<PlayArrow />}
                        onClick={handleSaveAndNext}
                        disabled={saving}
                      >
                        Save & Next
                      </Button>
                    )}
                  </Box>
                </Box>
              </Box>
            </Paper>
          ) : (
            <Paper sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Typography color="text.secondary">No test cases to execute</Typography>
            </Paper>
          )}
        </Grid>
      </Grid>

      {currentExec && (
        <StepDefectDialog
          open={defectDialog.open}
          onClose={() => setDefectDialog({ open: false, stepNumber: 0 })}
          onSaved={() => loadStepDefects(currentExec.id)}
          executionId={currentExec.id}
          stepNumber={defectDialog.stepNumber}
          projectId={testCase?.project_id}
          testCase={{
            id: testCase?.id,
            test_case_id: testCase?.test_case_id,
            title: testCase?.title,
          }}
          stepContext={(() => {
            const step = steps.find((s: any, idx: number) =>
              (s.step_number || idx + 1) === defectDialog.stepNumber,
            );
            return {
              action: step?.action,
              expected_result: step?.expected_result,
              actual_result: stepStates[defectDialog.stepNumber]?.actualResult,
              environment: testRun?.environment,
            };
          })()}
        />
      )}
    </Box>
  );
};

export default ExecutionPage;
