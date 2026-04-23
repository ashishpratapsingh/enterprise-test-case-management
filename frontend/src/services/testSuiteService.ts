import api from './api';

const PREFIX = '/testsuites';

export const testSuiteService = {
  async getAll(params?: {
    page?: number;
    pageSize?: number;
    projectId?: string;
    isActive?: boolean;
    search?: string;
  }): Promise<any> {
    const response = await api.get(PREFIX, {
      params: {
        page: params?.page,
        page_size: params?.pageSize,
        project_id: params?.projectId,
        is_active: params?.isActive,
        search: params?.search,
      },
    });
    return response.data;
  },

  async getById(id: string | number): Promise<any> {
    const response = await api.get(`${PREFIX}/${id}`);
    return response.data.data;
  },

  async create(suite: any): Promise<any> {
    const response = await api.post(PREFIX, suite);
    return response.data.data;
  },

  async update(id: string | number, suite: any): Promise<any> {
    const response = await api.put(`${PREFIX}/${id}`, suite);
    return response.data.data;
  },

  async delete(id: string | number): Promise<void> {
    await api.delete(`${PREFIX}/${id}`);
  },

  async addTestCases(suiteId: string | number, testCaseIds: (string | number)[]): Promise<any> {
    const response = await api.post(`${PREFIX}/${suiteId}/cases`, {
      test_case_ids: testCaseIds,
    });
    return response.data.data;
  },

  async removeTestCase(suiteId: string | number, testCaseId: string | number): Promise<void> {
    await api.delete(`${PREFIX}/${suiteId}/cases/${testCaseId}`);
  },
};

export default testSuiteService;
