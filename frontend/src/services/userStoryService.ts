import api from './api';

const PREFIX = '/user-stories';

export const userStoryService = {
  async getAll(params?: {
    page?: number;
    pageSize?: number;
    epicId?: string;
    projectId?: string;
    priority?: string;
    status?: string;
    search?: string;
  }): Promise<any> {
    const response = await api.get(PREFIX, {
      params: {
        page: params?.page,
        page_size: params?.pageSize,
        epic_id: params?.epicId,
        project_id: params?.projectId,
        priority: params?.priority,
        status: params?.status,
        search: params?.search,
      },
    });
    return response.data;
  },

  async getById(id: string | number): Promise<any> {
    const response = await api.get(`${PREFIX}/${id}`);
    return response.data.data;
  },

  async create(story: any): Promise<any> {
    const response = await api.post(PREFIX, story);
    return response.data.data;
  },

  async update(id: string | number, story: any): Promise<any> {
    const response = await api.put(`${PREFIX}/${id}`, story);
    return response.data.data;
  },

  async delete(id: string | number): Promise<void> {
    await api.delete(`${PREFIX}/${id}`);
  },
};

export default userStoryService;
