import api from './api';

const PREFIX = '/users';

export interface UserListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  isActive?: boolean;
  roleId?: string;
}

export const userService = {
  /**
   * List users. Returns the raw backend envelope
   * ({ success, data: [items, total], message }) so callers across the app
   * can keep using the `res.data` tuple destructure they already rely on.
   */
  async getAll(params?: UserListParams): Promise<any> {
    const response = await api.get(PREFIX, {
      params: {
        page: params?.page,
        page_size: params?.pageSize,
        search: params?.search,
        is_active: params?.isActive,
        role_id: params?.roleId,
      },
    });
    return response.data;
  },

  async getById(id: string): Promise<any> {
    const response = await api.get(`${PREFIX}/${id}`);
    return response.data.data;
  },

  async getMe(): Promise<any> {
    const response = await api.get(`${PREFIX}/me`);
    return response.data.data;
  },

  async create(payload: {
    email: string;
    password: string;
    full_name: string;
    role_id: string;
    is_active?: boolean;
  }): Promise<any> {
    const response = await api.post(PREFIX, payload);
    return response.data.data;
  },

  async update(
    id: string,
    payload: Partial<{ full_name: string; role_id: string; is_active: boolean }>,
  ): Promise<any> {
    const response = await api.put(`${PREFIX}/${id}`, payload);
    return response.data.data;
  },

  async delete(id: string): Promise<void> {
    await api.delete(`${PREFIX}/${id}`);
  },

  async activate(id: string): Promise<any> {
    const response = await api.post(`${PREFIX}/${id}/activate`);
    return response.data.data;
  },

  async deactivate(id: string): Promise<any> {
    const response = await api.post(`${PREFIX}/${id}/deactivate`);
    return response.data.data;
  },

  async resetPassword(id: string, newPassword: string): Promise<void> {
    await api.post(`${PREFIX}/${id}/reset-password`, { new_password: newPassword });
  },

  async changeMyPassword(currentPassword: string, newPassword: string): Promise<void> {
    await api.post(`${PREFIX}/me/change-password`, {
      current_password: currentPassword,
      new_password: newPassword,
    });
  },
};

export default userService;
