import React, { useEffect, useState, useCallback } from 'react';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Alert,
} from '@mui/material';
import {
  Folder as FolderIcon,
  Description as DescriptionIcon,
  PlayArrow as RunIcon,
  BugReport as BugIcon,
} from '@mui/icons-material';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import testCaseService from '../services/testCaseService';
import testRunService from '../services/testRunService';
import executionService from '../services/executionService';
import defectService from '../services/defectService';
import { useProjects } from '../contexts/ProjectContext';

const COLORS = ['#f57c00', '#1a237e', '#ffb74d', '#5c6bc0', '#e65100', '#9fa8da'];

const StatCard: React.FC<{
  title: string;
  value: number;
  icon: React.ReactNode;
  color: string;
}> = ({ title, value, icon, color }) => (
  <Card>
    <CardContent>
      <Box display="flex" justifyContent="space-between" alignItems="center">
        <Box>
          <Typography color="text.secondary" variant="body2" gutterBottom>
            {title}
          </Typography>
          <Typography variant="h4" fontWeight={600}>
            {value}
          </Typography>
        </Box>
        <Box sx={{ color, opacity: 0.8, fontSize: 48 }}>{icon}</Box>
      </Box>
    </CardContent>
  </Card>
);

const DashboardPage: React.FC = () => {
  const { projects, refreshProjects } = useProjects();

  useEffect(() => {
    refreshProjects();
  }, [refreshProjects]);
  const [loading, setLoading] = useState(true);
  const [totalTestCases, setTotalTestCases] = useState(0);
  const [testCasesByStatus, setTestCasesByStatus] = useState<{ status: string; count: number }[]>([]);
  const [automationCoverage, setAutomationCoverage] = useState({ automated: 0, manual: 0 });
  const [totalTestRuns, setTotalTestRuns] = useState(0);
  const [executionResults, setExecutionResults] = useState<{ status: string; count: number }[]>([]);
  const [totalDefects, setTotalDefects] = useState(0);
  const [defectsBySeverity, setDefectsBySeverity] = useState<{ name: string; count: number }[]>([]);

  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch test cases (max allowed page size)
      const tcRes = await testCaseService.getAll({ page: 1, pageSize: 100 });
      const tcData = (tcRes as any)?.data;
      if (Array.isArray(tcData)) {
        const items: any[] = tcData[0] || [];
        const total: number = tcData[1] || 0;
        setTotalTestCases(total);

        // Compute test cases by status
        const statusCounts: Record<string, number> = {};
        let automated = 0;
        let manual = 0;
        for (const tc of items) {
          const st = tc.status || 'Unknown';
          // Capitalize first letter for display
          const displayStatus = st.charAt(0).toUpperCase() + st.slice(1);
          statusCounts[displayStatus] = (statusCounts[displayStatus] || 0) + 1;

          // Automation coverage
          if (tc.isAutomated || tc.automationStatus === 'Automated') {
            automated++;
          } else {
            manual++;
          }
        }
        setTestCasesByStatus(
          Object.entries(statusCounts).map(([status, count]) => ({ status, count }))
        );
        setAutomationCoverage({ automated, manual });
      }
    } catch {
      // Silently fail — dashboard shows zeros
    }

    // Fetch test runs
    let runs: any[] = [];
    try {
      const runRes = await testRunService.getAll({ page: 1, pageSize: 100 });
      const runData = (runRes as any)?.data;
      if (Array.isArray(runData)) {
        runs = runData[0] || [];
        setTotalTestRuns(runData[1] || 0);
      }
    } catch {
      // Silently fail
    }

    // Fetch execution results
    try {
      const execStatusCounts: Record<string, number> = {
        Passed: 0,
        Failed: 0,
        Blocked: 0,
        Skipped: 0,
        'Not Run': 0,
      };

      const runsWithExecs = runs.filter(
        (r) => r.status === 'In Progress' || r.status === 'Completed' || r.status === 'Blocked' || r.status === 'Cancelled'
      );

      const allExecResults = await Promise.all(
        runsWithExecs.map((r) => executionService.getByRunId(r.id).catch(() => []))
      );

      for (const execs of allExecResults) {
        for (const exec of execs) {
          const s = (exec.status || '').toLowerCase().replace(/\s+/g, '_');
          if (s === 'pass' || s === 'passed') execStatusCounts['Passed']++;
          else if (s === 'fail' || s === 'failed') execStatusCounts['Failed']++;
          else if (s === 'blocked') execStatusCounts['Blocked']++;
          else if (s === 'skipped') execStatusCounts['Skipped']++;
          else execStatusCounts['Not Run']++;
        }
      }

      setExecutionResults(
        Object.entries(execStatusCounts)
          .map(([status, count]) => ({ status, count }))
      );
    } catch {
      // Silently fail
    }

    // Fetch defects
    try {
      const defRes = await defectService.getAll({ page: 1, pageSize: 100 });
      setTotalDefects(defRes.total);
      const severityCounts: Record<string, number> = {};
      for (const d of defRes.items) {
        const sev = d.severity || 'Unknown';
        severityCounts[sev] = (severityCounts[sev] || 0) + 1;
      }
      setDefectsBySeverity(
        Object.entries(severityCounts).map(([name, count]) => ({ name, count }))
      );
    } catch {
      // Silently fail
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  useAutoRefresh(fetchDashboardData);

  const automationData = [
    { name: 'Automated', value: automationCoverage.automated },
    { name: 'Manual', value: automationCoverage.manual },
  ];
  const hasAutomationData = automationCoverage.automated > 0 || automationCoverage.manual > 0;

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4" fontWeight={600}>
          Dashboard
        </Typography>
      </Box>

      <Alert
        severity="info"
        sx={{
          mb: 3,
          borderRadius: 2,
          backgroundColor: 'rgba(26, 35, 126, 0.04)',
          color: 'secondary.main',
          '& .MuiAlert-icon': { color: 'secondary.main' },
          border: '1px solid rgba(26, 35, 126, 0.1)',
        }}
      >
        Welcome to SabPaisa Test Case Management. Start by creating projects, Requirements and test cases.
      </Alert>

      {/* Summary Cards */}
      <Grid container spacing={3} mb={3}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Total Projects"
            value={projects.length}
            icon={<FolderIcon fontSize="inherit" />}
            color="#1a237e"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Total Test Cases"
            value={totalTestCases}
            icon={<DescriptionIcon fontSize="inherit" />}
            color="#f57c00"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Total Test Runs"
            value={totalTestRuns}
            icon={<RunIcon fontSize="inherit" />}
            color="#ffb74d"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Total Defects"
            value={totalDefects}
            icon={<BugIcon fontSize="inherit" />}
            color="#e65100"
          />
        </Grid>
      </Grid>

      {/* Charts Row */}
      <Grid container spacing={3} mb={3}>
        {/* Test Cases by Status */}
        <Grid item xs={12} md={4}>
          <Card sx={{ height: 380 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Test Cases by Status
              </Typography>
              <ResponsiveContainer width="100%" height={300}>
                {testCasesByStatus.length > 0 ? (
                  <PieChart>
                    <Pie
                      data={testCasesByStatus}
                      dataKey="count"
                      nameKey="status"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      label={false}
                    >
                      {testCasesByStatus.map((_, idx) => (
                        <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                ) : (
                  <Box display="flex" alignItems="center" justifyContent="center" height="100%">
                    <Typography color="text.secondary">No test cases yet</Typography>
                  </Box>
                )}
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Grid>

        {/* Execution Results */}
        <Grid item xs={12} md={4}>
          <Card sx={{ height: 380 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Test Cases by Execution Status
              </Typography>
              <ResponsiveContainer width="100%" height={300}>
                {executionResults.some((e) => e.count > 0) ? (
                  <PieChart>
                    <Pie
                      data={executionResults}
                      dataKey="count"
                      nameKey="status"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      label={false}
                    >
                      {executionResults.map((entry, idx) => {
                        const colorMap: Record<string, string> = {
                          Passed: '#4caf50',
                          Failed: '#f44336',
                          Blocked: '#ff9800',
                          Skipped: '#607d8b',
                          'Not Run': '#9e9e9e',
                        };
                        return <Cell key={idx} fill={colorMap[entry.status] || COLORS[idx % COLORS.length]} />;
                      })}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                ) : (
                  <Box display="flex" alignItems="center" justifyContent="center" height="100%">
                    <Typography color="text.secondary">No execution data yet</Typography>
                  </Box>
                )}
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Grid>

        {/* Automation Coverage */}
        <Grid item xs={12} md={4}>
          <Card sx={{ height: 380 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Automation Coverage
              </Typography>
              <ResponsiveContainer width="100%" height={300}>
                {hasAutomationData ? (
                  <PieChart>
                    <Pie
                      data={automationData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      label={false}
                    >
                      <Cell fill="#f57c00" />
                      <Cell fill="#1a237e" />
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                ) : (
                  <Box display="flex" alignItems="center" justifyContent="center" height="100%">
                    <Typography color="text.secondary">No test cases yet</Typography>
                  </Box>
                )}
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Defects by Severity */}
      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Card sx={{ height: 380 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Defects by Severity
              </Typography>
              <ResponsiveContainer width="100%" height={300}>
                {defectsBySeverity.length > 0 ? (
                  <BarChart data={defectsBySeverity}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="count" name="Defects">
                      {defectsBySeverity.map((entry, idx) => {
                        const colorMap: Record<string, string> = {
                          Critical: '#dc2626',
                          High: '#d97706',
                          Medium: '#3b82f6',
                          Low: '#10b981',
                        };
                        return <Cell key={idx} fill={colorMap[entry.name] || COLORS[idx % COLORS.length]} />;
                      })}
                    </Bar>
                  </BarChart>
                ) : (
                  <Box display="flex" alignItems="center" justifyContent="center" height="100%">
                    <Typography color="text.secondary">No defects yet</Typography>
                  </Box>
                )}
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default DashboardPage;
