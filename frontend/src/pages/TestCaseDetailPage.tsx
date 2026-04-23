import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Chip,
  Divider,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Tab,
  Tabs,
  List,
  ListItem,
  ListItemText,
} from '@mui/material';
import { ArrowBack, ContentCopy, CheckCircle } from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import testCaseService from '../services/testCaseService';
import { TestCase, TestCaseVersion } from '../types';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { useAuth } from '../hooks/useAuth';
import { canApprove } from '../utils/roleGuard';
import { format } from 'date-fns';

const TestCaseDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const { user } = useAuth();

  const [testCase, setTestCase] = useState<TestCase | null>(null);
  const [versions, setVersions] = useState<TestCaseVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [tabValue, setTabValue] = useState(0);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([testCaseService.getById(id), testCaseService.getVersions(id)])
      .then(([tc, ver]) => {
        setTestCase(tc);
        setVersions(ver);
      })
      .catch(() => enqueueSnackbar('Failed to load test case', { variant: 'error' }))
      .finally(() => setLoading(false));
  }, [id, enqueueSnackbar]);

  const handleApprove = async () => {
    if (!testCase) return;
    try {
      const updated = await testCaseService.approve(testCase.id);
      setTestCase(updated);
      enqueueSnackbar('Test case approved', { variant: 'success' });
    } catch {
      enqueueSnackbar('Failed to approve', { variant: 'error' });
    }
  };

  const handleClone = async () => {
    if (!testCase) return;
    try {
      const cloned = await testCaseService.clone(testCase.id);
      enqueueSnackbar('Test case cloned', { variant: 'success' });
      navigate(`/test-cases/${cloned.id}`);
    } catch {
      enqueueSnackbar('Failed to clone', { variant: 'error' });
    }
  };

  if (loading || !testCase) return <LoadingSpinner />;

  const priorityColor = (p: string) => {
    const m: Record<string, 'error' | 'warning' | 'info' | 'success'> = {
      critical: 'error', high: 'warning', medium: 'info', low: 'success',
    };
    return m[p] || 'default';
  };

  return (
    <Box>
      <Box display="flex" alignItems="center" gap={2} mb={3}>
        <Button startIcon={<ArrowBack />} onClick={() => navigate('/test-cases')}>
          Back
        </Button>
        <Typography variant="h5" fontWeight={600} sx={{ flexGrow: 1 }}>
          {testCase.title}
        </Typography>
        <Button startIcon={<ContentCopy />} onClick={handleClone}>
          Clone
        </Button>
        {user && canApprove(user.role) && testCase.status === 'review' && (
          <Button variant="contained" color="success" startIcon={<CheckCircle />} onClick={handleApprove}>
            Approve
          </Button>
        )}
      </Box>

      {/* Metadata */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={2}>
            <Grid item xs={6} sm={3}>
              <Typography variant="caption" color="text.secondary">Status</Typography>
              <Box><Chip label={testCase.status} size="small" color={testCase.status === 'approved' ? 'success' : 'default'} /></Box>
            </Grid>
            <Grid item xs={6} sm={3}>
              <Typography variant="caption" color="text.secondary">Priority</Typography>
              <Box><Chip label={testCase.priority} size="small" color={priorityColor(testCase.priority)} /></Box>
            </Grid>
            <Grid item xs={6} sm={3}>
              <Typography variant="caption" color="text.secondary">Type</Typography>
              <Typography variant="body2">{testCase.type}</Typography>
            </Grid>
            <Grid item xs={6} sm={3}>
              <Typography variant="caption" color="text.secondary">Version</Typography>
              <Typography variant="body2">v{testCase.version}</Typography>
            </Grid>
            <Grid item xs={6} sm={3}>
              <Typography variant="caption" color="text.secondary">Automated</Typography>
              <Typography variant="body2">{testCase.isAutomated ? 'Yes' : 'No'}</Typography>
            </Grid>
            <Grid item xs={6} sm={3}>
              <Typography variant="caption" color="text.secondary">Created</Typography>
              <Typography variant="body2">{testCase.createdAt ? format(new Date(testCase.createdAt), 'MMM dd, yyyy') : '-'}</Typography>
            </Grid>
            <Grid item xs={6} sm={3}>
              <Typography variant="caption" color="text.secondary">Updated</Typography>
              <Typography variant="body2">{testCase.updatedAt ? format(new Date(testCase.updatedAt), 'MMM dd, yyyy') : '-'}</Typography>
            </Grid>
            <Grid item xs={6} sm={3}>
              <Typography variant="caption" color="text.secondary">Assignee</Typography>
              <Typography variant="body2">
                {(testCase as any).assignee?.full_name || '—'}
              </Typography>
            </Grid>
            <Grid item xs={6} sm={3}>
              <Typography variant="caption" color="text.secondary">Created By</Typography>
              <Typography variant="body2">
                {typeof testCase.createdBy === 'object' && testCase.createdBy
                  ? testCase.createdBy.full_name
                  : (testCase as any).createdById && user && String((testCase as any).createdById) === String(user.id)
                    ? user.email
                    : (testCase as any).createdById || '-'}
              </Typography>
            </Grid>
            {testCase.tags && testCase.tags.length > 0 && (
              <Grid item xs={12}>
                <Typography variant="caption" color="text.secondary">Tags</Typography>
                <Box display="flex" gap={0.5} mt={0.5}>
                  {testCase.tags.map((tag) => (
                    <Chip key={tag} label={tag} size="small" variant="outlined" />
                  ))}
                </Box>
              </Grid>
            )}
          </Grid>
          {testCase.description && (
            <>
              <Divider sx={{ my: 2 }} />
              <Typography variant="subtitle2" gutterBottom>Description</Typography>
              <Typography variant="body2" whiteSpace="pre-wrap">{testCase.description}</Typography>
            </>
          )}
          {testCase.preconditions && (
            <>
              <Divider sx={{ my: 2 }} />
              <Typography variant="subtitle2" gutterBottom>Preconditions</Typography>
              <Typography variant="body2" whiteSpace="pre-wrap">{testCase.preconditions}</Typography>
            </>
          )}
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)} sx={{ mb: 2 }}>
        <Tab label="Steps" />
        <Tab label={`Version History (${versions.length})`} />
      </Tabs>

      {tabValue === 0 && (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell width={60}>#</TableCell>
                <TableCell>Action</TableCell>
                <TableCell>Expected Result</TableCell>
                <TableCell>Test Data</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {testCase.steps && testCase.steps.length > 0 ? (
                testCase.steps.map((step) => (
                  <TableRow key={step.id || step.stepNumber}>
                    <TableCell>{step.stepNumber}</TableCell>
                    <TableCell>{step.action}</TableCell>
                    <TableCell>{step.expectedResult}</TableCell>
                    <TableCell>{step.testData || '-'}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} align="center">No steps defined</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {tabValue === 1 && (
        <Card>
          <CardContent>
            {versions.length > 0 ? (
              <List>
                {versions.map((ver) => (
                  <ListItem key={ver.id} divider>
                    <ListItemText
                      primary={`Version ${ver.version} - ${ver.title}`}
                      secondary={
                        <>
                          {ver.changeNote && <span>{ver.changeNote} | </span>}
                          {ver.changedBy
                            ? ver.changedBy.full_name
                            : 'Unknown'}{' '}
                          - {ver.createdAt ? format(new Date(ver.createdAt), 'MMM dd, yyyy HH:mm') : '-'}
                        </>
                      }
                    />
                  </ListItem>
                ))}
              </List>
            ) : (
              <Typography color="text.secondary" textAlign="center">No version history</Typography>
            )}
          </CardContent>
        </Card>
      )}
    </Box>
  );
};

export default TestCaseDetailPage;
