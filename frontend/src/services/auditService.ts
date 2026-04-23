import api from './api';
import { AuditLog } from '../types';

const PREFIX = '/audit';

export interface AuditListParams {
  page?: number;
  pageSize?: number;
  userId?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
}

export const auditService = {
  /**
   * List audit logs. Returns { items, total } for convenience.
   */
  async getAll(params?: AuditListParams): Promise<{ items: AuditLog[]; total: number }> {
    const response = await api.get(PREFIX, {
      params: {
        page: params?.page,
        page_size: params?.pageSize,
        user_id: params?.userId,
        action: params?.action,
        entity_type: params?.entityType,
        entity_id: params?.entityId,
        start_date: params?.startDate,
        end_date: params?.endDate,
        search: params?.search,
      },
    });
    const data = response.data?.data;
    if (Array.isArray(data) && Array.isArray(data[0])) {
      return { items: data[0], total: data[1] ?? data[0].length };
    }
    return { items: [], total: 0 };
  },

  async getByEntity(entityType: string, entityId: string): Promise<AuditLog[]> {
    const response = await api.get(`${PREFIX}/entity/${entityType}/${entityId}`);
    const data = response.data?.data;
    if (Array.isArray(data) && Array.isArray(data[0])) return data[0];
    return [];
  },

  async stats(days = 7): Promise<{ days: number; total: number; by_action: Record<string, number> }> {
    const response = await api.get(`${PREFIX}/stats`, { params: { days } });
    return response.data?.data || { days, total: 0, by_action: {} };
  },
};

export default auditService;
