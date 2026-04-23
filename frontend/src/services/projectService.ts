import api from './api';

const PREFIX = '/projects';

export const projectService = {
  async getAll(params?: {
    page?: number;
    pageSize?: number;
    search?: string;
    category?: string;
    isActive?: boolean;
  }): Promise<any> {
    const response = await api.get(PREFIX, {
      params: {
        page: params?.page,
        page_size: params?.pageSize,
        search: params?.search,
        category: params?.category,
        is_active: params?.isActive,
      },
    });
    return response.data;
  },

  async getById(id: string): Promise<any> {
    const response = await api.get(`${PREFIX}/${id}`);
    return response.data.data;
  },

  async create(project: any): Promise<any> {
    const response = await api.post(PREFIX, project);
    return response.data.data;
  },

  async update(id: string | number, project: any): Promise<any> {
    const response = await api.put(`${PREFIX}/${id}`, project);
    return response.data.data;
  },

  async delete(id: string | number): Promise<void> {
    await api.delete(`${PREFIX}/${id}`);
  },
};

export default projectService;
