import api from './api';

const PREFIX = '/executions';

export const executionService = {
  async getByRunId(runId: string | number): Promise<any[]> {
    const response = await api.get(`/testruns/${runId}/executions`, {
      params: { page_size: 200 },
    });
    const data = response.data?.data;
    // Backend returns [items, total] tuple
    if (Array.isArray(data) && data.length === 2 && Array.isArray(data[0])) {
      return data[0];
    }
    if (Array.isArray(data)) return data;
    return [];
  },

  async getById(id: string | number): Promise<any> {
    const response = await api.get(`${PREFIX}/${id}`);
    return response.data.data;
  },

  async updateExecution(
    executionId: string | number,
    payload: {
      status: string;
      notes?: string;
      step_results?: Array<{
        step_number: number;
        status: string;
        actual_result?: string;
        notes?: string;
        attachments?: Array<{ url: string; filename: string }>;
      }>;
      duration_seconds?: number;
    }
  ): Promise<any> {
    const response = await api.put(`${PREFIX}/${executionId}`, payload);
    return response.data.data;
  },

  async listDefects(executionId: string | number): Promise<any[]> {
    const response = await api.get(`${PREFIX}/${executionId}/defects`);
    return response.data?.data || [];
  },

  async attachStepDefect(
    executionId: string | number,
    stepNumber: number,
    payload: Record<string, any>,
  ): Promise<any> {
    const response = await api.post(
      `${PREFIX}/${executionId}/steps/${stepNumber}/defects`,
      payload,
    );
    return response.data?.data;
  },

  async detachStepDefect(
    executionId: string | number,
    stepNumber: number,
    defectId: string,
  ): Promise<void> {
    await api.delete(
      `${PREFIX}/${executionId}/steps/${stepNumber}/defects/${defectId}`,
    );
  },

  async uploadAttachment(
    executionId: string | number,
    stepNumber: number,
    file: File
  ): Promise<{ url: string; filename: string; size: number }> {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post(
      `${PREFIX}/${executionId}/upload?step_number=${stepNumber}`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    return response.data.data;
  },

  // Legacy methods for backward compatibility
  async updateStatus(
    id: number,
    payload: { status: string; notes?: string; defectId?: number | null }
  ): Promise<any> {
    const response = await api.put(`${PREFIX}/${id}`, payload);
    return response.data.data;
  },

  async submitAllStepResults(
    executionId: string | number,
    stepResults: Array<{
      stepId: string | number;
      status: string;
      actualResult?: string;
      notes?: string;
    }>
  ): Promise<any> {
    const response = await api.put(`${PREFIX}/${executionId}`, {
      step_results: stepResults.map((sr) => ({
        step_number: sr.stepId,
        status: sr.status,
        actual_result: sr.actualResult,
        notes: sr.notes,
      })),
    });
    return response.data.data;
  },

  async uploadScreenshot(executionId: number, stepId: number, file: File): Promise<string> {
    const result = await executionService.uploadAttachment(executionId, stepId, file);
    return result.url;
  },
};

export default executionService;
