import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import projectService from '../services/projectService';

export interface ProjectOption {
  id: string;
  name: string;
  code: string;
  category?: string;
  is_active?: boolean;
  [key: string]: any;
}

interface ProjectContextValue {
  /** All projects (active only by default) */
  projects: ProjectOption[];
  /** Whether the initial load is still in progress */
  loading: boolean;
  /** Re-fetch the project list — call after create / update / delete */
  refreshProjects: () => Promise<void>;
}

const ProjectContext = createContext<ProjectContextValue>({
  projects: [],
  loading: true,
  refreshProjects: async () => {},
});

export const useProjects = () => useContext(ProjectContext);

export const ProjectProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshProjects = useCallback(async () => {
    try {
      const res = await projectService.getAll({ pageSize: 100 });
      const apiData = (res as any)?.data;
      if (Array.isArray(apiData)) {
        setProjects(apiData[0] || []);
      } else {
        setProjects([]);
      }
    } catch {
      // keep previous data on error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshProjects();
  }, [refreshProjects]);

  return (
    <ProjectContext.Provider value={{ projects, loading, refreshProjects }}>
      {children}
    </ProjectContext.Provider>
  );
};

export default ProjectContext;
