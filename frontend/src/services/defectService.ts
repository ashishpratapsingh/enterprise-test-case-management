import api from './api';

const PREFIX = '/defects';

export const defectService = {
  async getAll(params?: {
    page?: number;
    pageSize?: number;
    project_id?: string;
    severity?: string;
    priority?: string;
    status?: string;
    search?: string;
    assigned_to?: string;
  }): Promise<{ items: any[]; total: number }> {
    const queryParams: Record<string, any> = {};
    if (params?.page) queryParams.page = params.page;
    if (params?.pageSize) queryParams.page_size = params.pageSize;
    if (params?.project_id) queryParams.project_id = params.project_id;
    if (params?.severity) queryParams.severity = params.severity;
    if (params?.priority) queryParams.priority = params.priority;
    if (params?.status) queryParams.status = params.status;
    if (params?.search) queryParams.search = params.search;
    if (params?.assigned_to) queryParams.assigned_to = params.assigned_to;

    const response = await api.get(PREFIX, { params: queryParams });
    const data = response.data?.data;
    // API returns [items, total] tuple
    if (Array.isArray(data) && data.length === 2 && Array.isArray(data[0])) {
      return { items: data[0], total: data[1] };
    }
    if (Array.isArray(data)) return { items: data, total: data.length };
    return { items: [], total: 0 };
  },

  async getById(id: string): Promise<any> {
    const response = await api.get(`${PREFIX}/${id}`);
    return response.data.data;
  },

  async create(defect: Record<string, any>): Promise<any> {
    const response = await api.post(PREFIX, defect);
    return response.data.data;
  },

  async update(id: string, defect: Record<string, any>): Promise<any> {
    const response = await api.put(`${PREFIX}/${id}`, defect);
    return response.data.data;
  },

  async delete(id: string): Promise<void> {
    await api.delete(`${PREFIX}/${id}`);
  },

  async transitionStatus(id: string, status: string): Promise<any> {
    const response = await api.post(`${PREFIX}/${id}/transition`, { status });
    return response.data.data;
  },

  async uploadAttachment(
    defectId: string,
    file: File
  ): Promise<{ id: string; url: string; filename: string; size: number }> {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post(
      `${PREFIX}/${defectId}/upload`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    return response.data.data;
  },

  async getAttachments(defectId: string): Promise<any[]> {
    const response = await api.get(`${PREFIX}/${defectId}/attachments`);
    return response.data.data || [];
  },

  async deleteAttachment(defectId: string, attachmentId: string): Promise<void> {
    await api.delete(`${PREFIX}/${defectId}/attachments/${attachmentId}`);
  },
};

export default defectService;
