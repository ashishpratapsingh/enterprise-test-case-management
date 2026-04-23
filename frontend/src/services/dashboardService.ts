import api from './api';
import { ApiResponse, DashboardMetrics } from '../types';

const PREFIX = '/dashboard';

export const dashboardService = {
  async getMetrics(projectId?: number): Promise<DashboardMetrics> {
    const response = await api.get<ApiResponse<DashboardMetrics>>(PREFIX, {
      params: projectId ? { projectId } : undefined,
    });
    return response.data.data;
  },

  async getTestCoverageByModule(projectId: number): Promise<{ module: string; covered: number; total: number }[]> {
    const response = await api.get<ApiResponse<{ module: string; covered: number; total: number }[]>>(
      `${PREFIX}/coverage/module`,
      { params: { projectId } }
    );
    return response.data.data;
  },

  async getDefectDensity(projectId: number): Promise<{ module: string; defects: number; testCases: number }[]> {
    const response = await api.get<ApiResponse<{ module: string; defects: number; testCases: number }[]>>(
      `${PREFIX}/defect-density`,
      { params: { projectId } }
    );
    return response.data.data;
  },

  async getExecutionTrend(params: {
    projectId?: number;
    days?: number;
  }): Promise<{ date: string; passed: number; failed: number; blocked: number }[]> {
    const response = await api.get<
      ApiResponse<{ date: string; passed: number; failed: number; blocked: number }[]>
    >(`${PREFIX}/execution-trend`, { params });
    return response.data.data;
  },

  async getReleaseReadiness(projectId: number): Promise<
    { release: string; total: number; passed: number; failed: number; remaining: number }[]
  > {
    const response = await api.get<
      ApiResponse<{ release: string; total: number; passed: number; failed: number; remaining: number }[]>
    >(`${PREFIX}/release-readiness`, { params: { projectId } });
    return response.data.data;
  },
};

export default dashboardService;
