import api from './api';

const PREFIX = '/testcases';

/** Convert a snake_case test case from the backend into camelCase for the frontend. */
function normalizeTestCase(tc: any): any {
  if (!tc) return tc;
  return {
    ...tc,
    id: tc.id,
    testCaseId: tc.test_case_id ?? tc.testCaseId,
    title: tc.title,
    description: tc.description,
    preconditions: tc.preconditions,
    projectId: tc.project_id ?? tc.projectId,
    moduleId: tc.module_id ?? tc.moduleId,
    requirementId: tc.requirement_id ?? tc.requirementId,
    type: tc.type,
    priority: tc.priority,
    severity: tc.severity,
    status: tc.status,
    automationStatus: tc.automation_status ?? tc.automationStatus,
    isAutomated: (tc.automation_status ?? tc.automationStatus) === 'Automated',
    version: tc.version,
    tags: tc.tags,
    createdById: tc.created_by ?? tc.createdById,
    createdBy: typeof tc.createdBy === 'object' ? tc.createdBy : undefined,
    createdAt: tc.created_at ?? tc.createdAt,
    updatedAt: tc.updated_at ?? tc.updatedAt,
    jiraTicketId: tc.jira_ticket_id ?? tc.jiraTicketId,
    expectedResult: tc.expected_result ?? tc.expectedResult,
    steps: Array.isArray(tc.steps)
      ? tc.steps.map((s: any) => ({
          ...s,
          stepNumber: s.step_number ?? s.stepNumber,
          expectedResult: s.expected_result ?? s.expectedResult,
          testData: s.test_data ?? s.testData ?? '',
          action: s.action,
        }))
      : tc.steps,
  };
}

export const testCaseService = {
  async getAll(params?: {
    page?: number;
    pageSize?: number;
    projectId?: string;
    moduleId?: string;
    epicId?: string;
    userStoryId?: string;
    status?: string;
    type?: string;
    priority?: string;
    automationStatus?: string;
    search?: string;
  }): Promise<any> {
    const response = await api.get(PREFIX, {
      params: {
        page: params?.page,
        page_size: params?.pageSize,
        project_id: params?.projectId,
        module_id: params?.moduleId,
        epic_id: params?.epicId,
        user_story_id: params?.userStoryId,
        status: params?.status,
        type: params?.type,
        priority: params?.priority,
        automation_status: params?.automationStatus,
        search: params?.search,
      },
    });
    const raw = response.data;
    // Normalize the items in the paginated tuple [items, total]
    if (raw?.data && Array.isArray(raw.data) && Array.isArray(raw.data[0])) {
      raw.data[0] = raw.data[0].map(normalizeTestCase);
    }
    return raw;
  },

  async getById(id: string): Promise<any> {
    const response = await api.get(`${PREFIX}/${id}`);
    return normalizeTestCase(response.data.data);
  },

  async create(testCase: any): Promise<any> {
    const response = await api.post(PREFIX, testCase);
    return normalizeTestCase(response.data.data);
  },

  async update(id: string | number, testCase: any): Promise<any> {
    const response = await api.put(`${PREFIX}/${id}`, testCase);
    return normalizeTestCase(response.data.data);
  },

  async delete(id: string | number): Promise<void> {
    await api.delete(`${PREFIX}/${id}`);
  },

  async clone(id: string | number): Promise<any> {
    const response = await api.post(`${PREFIX}/${id}/clone`);
    return normalizeTestCase(response.data.data);
  },

  async getVersions(id: string | number): Promise<any[]> {
    const response = await api.get(`${PREFIX}/${id}/versions`);
    return response.data.data;
  },

  async approve(id: string | number): Promise<any> {
    const response = await api.post(`${PREFIX}/${id}/approve`, { action: 'approve' });
    return normalizeTestCase(response.data.data);
  },

  async bulkUpload(projectId: string, file: File, epicId?: string, userStoryId?: string): Promise<any> {
    const formData = new FormData();
    formData.append('file', file);
    let url = `${PREFIX}/bulk-upload?project_id=${projectId}`;
    if (epicId) url += `&epic_id=${epicId}`;
    if (userStoryId) url += `&user_story_id=${userStoryId}`;
    const response = await api.post(url, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  // ── Bulk operations (JIRA-style multi-select edit) ──────────────────
  async bulkDelete(
    ids: string[],
  ): Promise<{ succeeded: string[]; failed: { id: string; error: string }[] }> {
    const response = await api.post(`${PREFIX}/bulk-delete`, { ids });
    return response.data.data;
  },

  /** Run the approval workflow (Draft → Ready → Approved) on many test
   * cases. Invalid transitions land in `failed` per id. */
  async bulkTransitionApproval(
    ids: string[],
    status: string,
  ): Promise<{ succeeded: string[]; failed: { id: string; error: string }[] }> {
    const response = await api.post(`${PREFIX}/bulk-transition`, { ids, status });
    return response.data.data;
  },

  /** Plain-field bulk edit. Pass at least one of priority / type /
   * automation_status / assigned_to / unassign. ``unassign: true``
   * forces assignee → null (since we can't tell "leave unchanged"
   * from "set null" with just `assigned_to`). */
  async bulkUpdate(
    ids: string[],
    fields: {
      priority?: string;
      type?: string;
      automation_status?: string;
      assigned_to?: string;
      unassign?: boolean;
    },
  ): Promise<{ succeeded: string[]; failed: { id: string; error: string }[] }> {
    const payload: Record<string, any> = { ids };
    if (fields.priority) payload.priority = fields.priority;
    if (fields.type) payload.type = fields.type;
    if (fields.automation_status) payload.automation_status = fields.automation_status;
    if (fields.unassign) {
      payload.unassign = true;
    } else if (fields.assigned_to) {
      payload.assigned_to = fields.assigned_to;
    }
    const response = await api.post(`${PREFIX}/bulk-update`, payload);
    return response.data.data;
  },
};

export default testCaseService;
