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

  // ── Bulk operations ─────────────────────────────────────────────────
  async bulkDelete(
    ids: string[],
  ): Promise<{ succeeded: string[]; failed: { id: string; error: string }[] }> {
    const response = await api.post(`${PREFIX}/bulk-delete`, { ids });
    return response.data.data;
  },

  /** Plain-field bulk edit. ``unassign`` / ``clear_epic`` /
   * ``clear_story_points`` force the matching column to null;
   * otherwise omit the key to leave it untouched on every selected
   * story. */
  async bulkUpdate(
    ids: string[],
    fields: {
      status?: string;
      priority?: string;
      epic_id?: string;
      clear_epic?: boolean;
      assigned_to?: string;
      unassign?: boolean;
      story_points?: number;
      clear_story_points?: boolean;
    },
  ): Promise<{ succeeded: string[]; failed: { id: string; error: string }[] }> {
    const payload: Record<string, any> = { ids };
    if (fields.status) payload.status = fields.status;
    if (fields.priority) payload.priority = fields.priority;
    if (fields.clear_epic) payload.clear_epic = true;
    else if (fields.epic_id) payload.epic_id = fields.epic_id;
    if (fields.unassign) payload.unassign = true;
    else if (fields.assigned_to) payload.assigned_to = fields.assigned_to;
    if (fields.clear_story_points) payload.clear_story_points = true;
    else if (typeof fields.story_points === 'number') payload.story_points = fields.story_points;
    const response = await api.post(`${PREFIX}/bulk-update`, payload);
    return response.data.data;
  },
};

export default userStoryService;
