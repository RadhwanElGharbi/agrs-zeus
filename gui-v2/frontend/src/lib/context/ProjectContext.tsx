/**
 * AGRS ZEUS GUI v2 - Project Context
 * 
 * Provides global state management for the currently active project.
 */

'use client'

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import {
  ProjectMetadata,
  ProjectDatasets,
  fetchProjects,
  fetchProjectMetadata,
  fetchProjectDatasets
} from '@/lib/api/dataClient'

// ============================================================================
// Context Interface
// ============================================================================

interface ProjectContextType {
  currentProject: string | null;
  setCurrentProject: (project: string | null) => void;
  projects: ProjectMetadata[];
  projectMetadata: ProjectMetadata | null;
  datasets: ProjectDatasets | null;
  isLoading: boolean;
  error: string | null;
  refreshProjects: () => Promise<void>;
}

// ============================================================================
// Context Creation
// ============================================================================

const ProjectContext = createContext<ProjectContextType | undefined>(undefined)

// ============================================================================
// Provider Component
// ============================================================================

interface ProjectProviderProps {
  children: ReactNode;
}

export function ProjectProvider({ children }: ProjectProviderProps) {
  const [currentProject, setCurrentProjectState] = useState<string | null>(null)
  const [projects, setProjects] = useState<ProjectMetadata[]>([])
  const [projectMetadata, setProjectMetadata] = useState<ProjectMetadata | null>(null)
  const [datasets, setDatasets] = useState<ProjectDatasets | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load projects on mount
  useEffect(() => {
    loadProjects()
  }, [])

  // Load saved project from localStorage on mount
  useEffect(() => {
    const savedProject = localStorage.getItem('agrs_current_project')
    if (savedProject && projects.length > 0) {
      // Verify project still exists
      const projectExists = projects.some(p => p.project_name === savedProject)
      if (projectExists) {
        setCurrentProjectState(savedProject)
      }
    }
  }, [projects])

  // Load project metadata and datasets when current project changes
  useEffect(() => {
    if (currentProject) {
      loadProjectData(currentProject)
    } else {
      setProjectMetadata(null)
      setDatasets(null)
    }
  }, [currentProject])

  /**
   * Load list of all projects
   */
  const loadProjects = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const projectsList = await fetchProjects()
      setProjects(projectsList)

      // If no project is selected and projects exist, select the first one
      if (!currentProject && projectsList.length > 0) {
        setCurrentProjectState(projectsList[0].project_name)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load projects')
      console.error('Failed to load projects:', err)
    } finally {
      setIsLoading(false)
    }
  }

  /**
   * Load metadata and datasets for a specific project
   */
  const loadProjectData = async (projectName: string) => {
    setIsLoading(true)
    setError(null)

    try {
      const [metadata, datasetsData] = await Promise.all([
        fetchProjectMetadata(projectName),
        fetchProjectDatasets(projectName)
      ])

      setProjectMetadata(metadata)
      setDatasets(datasetsData)
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to load data for ${projectName}`)
      console.error(`Failed to load project data for ${projectName}:`, err)
    } finally {
      setIsLoading(false)
    }
  }

  /**
   * Set current project and persist to localStorage
   */
  const setCurrentProject = (project: string | null) => {
    setCurrentProjectState(project)

    if (project) {
      localStorage.setItem('agrs_current_project', project)
    } else {
      localStorage.removeItem('agrs_current_project')
    }
  }

  /**
   * Refresh projects list
   */
  const refreshProjects = async () => {
    await loadProjects()
  }

  const value: ProjectContextType = {
    currentProject,
    setCurrentProject,
    projects,
    projectMetadata,
    datasets,
    isLoading,
    error,
    refreshProjects
  }

  return (
    <ProjectContext.Provider value={value}>
      {children}
    </ProjectContext.Provider>
  )
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook to access project context
 */
export function useProject() {
  const context = useContext(ProjectContext)

  if (context === undefined) {
    throw new Error('useProject must be used within a ProjectProvider')
  }

  return context
}



