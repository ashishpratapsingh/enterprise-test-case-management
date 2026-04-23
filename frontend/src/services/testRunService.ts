import api from './api';

const PREFIX = '/testruns';

export const testRunService = {
  async getAll(params?: {
    page?: number;
    pageSize?: number;
    projectId?: string;
    status?: string;
    testSuiteId?: string;
    search?: string;
  }): Promise<any> {
    const response = await api.get(PREFIX, {
      params: {
        page: params?.page,
        page_size: params?.pageSize,
        project_id: params?.projectId,
        status: params?.status,
        test_suite_id: params?.testSuiteId,
        search: params?.search,
      },
    });
    return response.data;
  },

  async getById(id: string | number): Promise<any> {
    const response = await api.get(`${PREFIX}/${id}`);
    return response.data.data;
  },

  async create(run: any): Promise<any> {
    const response = await api.post(PREFIX, run);
    return response.data.data;
  },

  async update(id: string | number, run: any): Promise<any> {
    const response = await api.put(`${PREFIX}/${id}`, run);
    return response.data.data;
  },

  async delete(id: string | number): Promise<void> {
    await api.delete(`${PREFIX}/${id}`);
  },

  async start(id: string | number): Promise<any> {
    const response = await api.post(`${PREFIX}/${id}/start`);
    return response.data.data;
  },

  async complete(id: string | number): Promise<any> {
    const response = await api.post(`${PREFIX}/${id}/complete`);
    return response.data.data;
  },

  async abort(id: string | number, abortReason?: string): Promise<any> {
    const response = await api.post(`${PREFIX}/${id}/abort`, { abort_reason: abortReason || null });
    return response.data.data;
  },

  async block(id: string | number): Promise<any> {
    const response = await api.post(`${PREFIX}/${id}/block`);
    return response.data.data;
  },
};

export default testRunService;
