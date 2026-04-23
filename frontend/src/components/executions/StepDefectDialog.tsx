import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  MenuItem,
  Tabs,
  Tab,
  Box,
  Typography,
  Autocomplete,
  CircularProgress,
  Chip,
  Alert,
  FormControl,
  InputLabel,
  Select,
} from '@mui/material';
import { BugReport, Link as LinkIcon } from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import executionService from '../../services/executionService';
import defectService from '../../services/defectService';
import userService from '../../services/userService';
import { useAuth } from '../../hooks/useAuth';

const SEVERITIES = ['Critical', 'High', 'Medium', 'Low'];
const PRIORITIES = ['Critical', 'High', 'Medium', 'Low'];

export interface StepDefectDialogProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  executionId: string;
  stepNumber: number;
  projectId?: string | null;
  testCase?: {
    id?: string;
    test_case_id?: string;
    title?: string;
  };
  stepContext?: {
    action?: string;
    expected_result?: string;
    actual_result?: string;
    environment?: string;
  };
}

const StepDefectDialog: React.FC<StepDefectDialogProps> = ({
  open,
  onClose,
  onSaved,
  executionId,
  stepNumber,
  projectId,
  testCase,
  stepContext,
}) => {
  const { enqueueSnackbar } = useSnackbar();
  const { user } = useAuth();
  const [tab, setTab] = useState<'new' | 'existing'>('new');
  const [saving, setSaving] = useState(false);

  // "Report new" state
  const defaultTitle = useMemo(() => {
    const tcLabel = testCase?.test_case_id || testCase?.title || 'Test case';
    return `[${tcLabel}] Step ${stepNumber} failed`;
  }, [testCase, stepNumber]);

  const defaultDescription = useMemo(() => {
    const lines: string[] = [];
    if (testCase?.title) lines.push(`Test Case: ${testCase.title}`);
    lines.push(`Step ${stepNumber}`);
    if (stepContext?.action) lines.push(`\nAction:\n${stepContext.action}`);
    if (stepContext?.expected_result) lines.push(`\nExpected:\n${stepContext.expected_result}`);
    if (stepContext?.actual_result) lines.push(`\nActual:\n${stepContext.actual_result}`);
    if (stepContext?.environment) lines.push(`\nEnvironment: ${stepContext.environment}`);
    return lines.join('\n');
  }, [testCase, stepNumber, stepContext]);

  const [title, setTitle] = useState(defaultTitle);
  const [description, setDescription] = useState(defaultDescription);
  const [severity, setSeverity] = useState('Medium');
  const [priority, setPriority] = useState('Medium');
  const [jiraTicketId, setJiraTicketId] = useState('');
  const [assignedTo, setAssignedTo] = useState<string>('');

  // Users for assignee dropdown (same pattern as DefectsPage)
  const [users, setUsers] = useState<Array<{ id: string; full_name: string; email: string }>>([]);

  // "Link existing" state
  const [searchInput, setSearchInput] = useState('');
  const [options, setOptions] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(defaultTitle);
    setDescription(defaultDescription);
    setSeverity('Medium');
    setPriority('Medium');
    setJiraTicketId('');
    setAssignedTo('');
    setSelected(null);
    setSearchInput('');
    setOptions([]);
    setTab('new');
  }, [open, defaultTitle, defaultDescription]);

  // Load users once (same pattern as DefectsPage — falls back to current user on 403)
  useEffect(() => {
    if (!open) return;
    const fallbackUsers = user
      ? [{ id: String(user.id), full_name: user.full_name || user.email, email: user.email }]
      : [];
    userService
      .getAll({ pageSize: 100, isActive: true })
      .then((res: any) => {
        const apiData = res?.data;
        let userList: Array<{ id: string; full_name: string; email: string }> = [];
        if (Array.isArray(apiData)) {
          userList = (apiData[0] || []).map((u: any) => ({
            id: u.id,
            full_name: u.full_name,
            email: u.email,
          }));
        }
        setUsers(userList.length > 0 ? userList : fallbackUsers);
      })
      .catch(() => {
        setUsers(fallbackUsers);
      });
  }, [open, user]);

  useEffect(() => {
    if (tab !== 'existing' || !open) return;
    let active = true;
    setSearching(true);
    defectService
      .getAll({
        pageSize: 20,
        project_id: projectId || undefined,
        search: searchInput || undefined,
      })
      .then((res) => {
        if (active) setOptions(res.items || []);
      })
      .catch(() => {
        if (active) setOptions([]);
      })
      .finally(() => {
        if (active) setSearching(false);
      });
    return () => {
      active = false;
    };
  }, [tab, searchInput, projectId, open]);

  const canSubmit = tab === 'new'
    ? Boolean(title.trim() && projectId)
    : Boolean(selected?.id);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      if (tab === 'new') {
        const payload: Record<string, any> = {
          title: title.trim(),
          description,
          severity,
          priority,
          project_id: projectId,
        };
        if (assignedTo) payload.assigned_to = assignedTo;
        if (jiraTicketId.trim()) payload.jira_ticket_id = jiraTicketId.trim();
        await executionService.attachStepDefect(executionId, stepNumber, payload);
        enqueueSnackbar('Bug reported and linked to step', { variant: 'success' });
      } else {
        await executionService.attachStepDefect(executionId, stepNumber, {
          defect_id: selected.id,
        });
        enqueueSnackbar(`Linked ${selected.defect_id || 'bug'} to step`, { variant: 'success' });
      }
      onSaved();
      onClose();
    } catch (err: any) {
      enqueueSnackbar(err.response?.data?.message || 'Failed to attach bug', {
        variant: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <BugReport sx={{ color: '#f44336' }} />
        Attach Bug to Step {stepNumber}
      </DialogTitle>
      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        sx={{ px: 3, borderBottom: 1, borderColor: 'divider' }}
      >
        <Tab label="Report New Bug" value="new" icon={<BugReport />} iconPosition="start" />
        <Tab label="Link Existing Bug" value="existing" icon={<LinkIcon />} iconPosition="start" />
      </Tabs>

      <DialogContent sx={{ pt: 2 }}>
        {tab === 'new' && (
          <Box display="flex" flexDirection="column" gap={2}>
            {!projectId && (
              <Alert severity="warning">
                No project context on this test case — bug can't be created. Link an existing bug instead.
              </Alert>
            )}
            <TextField
              label="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              fullWidth
              autoFocus
              required
            />
            <TextField
              label="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              fullWidth
              multiline
              minRows={5}
            />
            <Box display="flex" gap={2}>
              <TextField
                select
                label="Severity"
                value={severity}
                onChange={(e) => setSeverity(e.target.value)}
                sx={{ flex: 1 }}
              >
                {SEVERITIES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
              </TextField>
              <TextField
                select
                label="Priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                sx={{ flex: 1 }}
              >
                {PRIORITIES.map((p) => <MenuItem key={p} value={p}>{p}</MenuItem>)}
              </TextField>
            </Box>

            <FormControl fullWidth>
              <InputLabel>Assignee</InputLabel>
              <Select
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
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

            <TextField
              label="Jira Ticket ID"
              value={jiraTicketId}
              onChange={(e) => setJiraTicketId(e.target.value)}
              placeholder="e.g., PROJ-1234"
              fullWidth
            />
          </Box>
        )}

        {tab === 'existing' && (
          <Box display="flex" flexDirection="column" gap={2}>
            <Autocomplete
              options={options}
              value={selected}
              onChange={(_, v) => setSelected(v)}
              inputValue={searchInput}
              onInputChange={(_, v) => setSearchInput(v)}
              loading={searching}
              getOptionLabel={(o: any) =>
                o ? `${o.defect_id || ''} — ${o.title || ''}` : ''
              }
              renderOption={(props, option: any) => (
                <li {...props} key={option.id}>
                  <Box>
                    <Box display="flex" alignItems="center" gap={1}>
                      <Chip label={option.defect_id} size="small" />
                      <Typography variant="body2" fontWeight={600}>{option.title}</Typography>
                    </Box>
                    <Box display="flex" gap={1} mt={0.5}>
                      <Chip label={option.severity} size="small" variant="outlined" />
                      <Chip label={option.status} size="small" variant="outlined" />
                    </Box>
                  </Box>
                </li>
              )}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Search bugs"
                  placeholder="Type to search by title or description"
                  InputProps={{
                    ...params.InputProps,
                    endAdornment: (
                      <>
                        {searching ? <CircularProgress size={16} /> : null}
                        {params.InputProps.endAdornment}
                      </>
                    ),
                  }}
                />
              )}
            />
            {!projectId && (
              <Typography variant="caption" color="text.secondary">
                Showing bugs across all projects — no project context on the test case.
              </Typography>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={saving || !canSubmit}
          startIcon={tab === 'new' ? <BugReport /> : <LinkIcon />}
        >
          {saving ? 'Saving...' : tab === 'new' ? 'Report & Attach' : 'Link Bug'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default StepDefectDialog;
