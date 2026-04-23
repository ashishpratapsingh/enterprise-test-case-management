import api from './api';

const PREFIX = '/reports';

function downloadBlob(data: Blob, filename: string) {
  const url = window.URL.createObjectURL(data);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

type ProjectParam = { projectId?: string | null };

function projectParams(params?: ProjectParam): Record<string, string> | undefined {
  if (!params?.projectId) return undefined;
  return { project_id: String(params.projectId) };
}

export const reportService = {
  async exportTestCasesCsv(params?: ProjectParam): Promise<void> {
    const response = await api.get(`${PREFIX}/test-cases/csv`, {
      params: projectParams(params),
      responseType: 'blob',
    });
    downloadBlob(response.data, 'test-cases.csv');
  },

  async exportTestCasesPdf(params?: ProjectParam): Promise<void> {
    const response = await api.get(`${PREFIX}/test-cases/pdf`, {
      params: projectParams(params),
      responseType: 'blob',
    });
    downloadBlob(response.data, 'test-cases.pdf');
  },

  async exportDefectsCsv(params?: ProjectParam): Promise<void> {
    const response = await api.get(`${PREFIX}/defects/csv`, {
      params: projectParams(params),
      responseType: 'blob',
    });
    downloadBlob(response.data, 'defects.csv');
  },

  async exportDefectsPdf(params?: ProjectParam): Promise<void> {
    const response = await api.get(`${PREFIX}/defects/pdf`, {
      params: projectParams(params),
      responseType: 'blob',
    });
    downloadBlob(response.data, 'defects.pdf');
  },

  async exportTestRunResultsCsv(runId: string): Promise<void> {
    const response = await api.get(`${PREFIX}/test-runs/${runId}/csv`, {
      responseType: 'blob',
    });
    downloadBlob(response.data, `test-run-${runId}.csv`);
  },

  async exportTestRunResultsPdf(runId: string): Promise<void> {
    const response = await api.get(`${PREFIX}/test-runs/${runId}/pdf`, {
      responseType: 'blob',
    });
    downloadBlob(response.data, `test-run-${runId}.pdf`);
  },

  async exportDashboardPdf(projectId?: string | null): Promise<void> {
    const response = await api.get(`${PREFIX}/dashboard/pdf`, {
      params: projectId ? { project_id: String(projectId) } : undefined,
      responseType: 'blob',
    });
    downloadBlob(response.data, 'dashboard-summary.pdf');
  },
};

export default reportService;
