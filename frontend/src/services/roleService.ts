import api from './api';
import { Role } from '../types';

const PREFIX = '/roles';

export interface RoleCreatePayload {
  name: string;
  description?: string | null;
  permissions?: Record<string, string[]> | null;
}

export type RoleUpdatePayload = Partial<RoleCreatePayload>;

export const roleService = {
  async getAll(): Promise<Role[]> {
    const response = await api.get(PREFIX);
    return response.data?.data || [];
  },

  async create(payload: RoleCreatePayload): Promise<Role> {
    const response = await api.post(PREFIX, payload);
    return response.data?.data;
  },

  async update(id: string, payload: RoleUpdatePayload): Promise<Role> {
    const response = await api.put(`${PREFIX}/${id}`, payload);
    return response.data?.data;
  },

  async delete(id: string): Promise<void> {
    await api.delete(`${PREFIX}/${id}`);
  },
};

export default roleService;
