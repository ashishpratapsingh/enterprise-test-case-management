import api from './api';
import { Role } from '../types';

const PREFIX = '/roles';

export const roleService = {
  async getAll(): Promise<Role[]> {
    const response = await api.get(PREFIX);
    return response.data?.data || [];
  },
};

export default roleService;
