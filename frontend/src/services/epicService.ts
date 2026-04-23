import api from './api';

const PREFIX = '/epics';

export const epicService = {
  async getAll(params?: {
    page?: number;
    pageSize?: number;
    priority?: string;
    projectId?: string;
    assignedTo?: string;
    search?: string;
  }): Promise<any> {
    const response = await api.get(PREFIX, {
      params: {
        page: params?.page,
        page_size: params?.pageSize,
        priority: params?.priority,
        project_id: params?.projectId,
        assigned_to: params?.assignedTo,
        search: params?.search,
      },
    });
    return response.data;
  },

  async getById(id: string | number): Promise<any> {
    const response = await api.get(`${PREFIX}/${id}`);
    return response.data.data;
  },

  async create(epic: any): Promise<any> {
    const response = await api.post(PREFIX, epic);
    return response.data.data;
  },

  async update(id: string | number, epic: any): Promise<any> {
    const response = await api.put(`${PREFIX}/${id}`, epic);
    return response.data.data;
  },

  async delete(id: string | number): Promise<void> {
    await api.delete(`${PREFIX}/${id}`);
  },
};

export default epicService;
