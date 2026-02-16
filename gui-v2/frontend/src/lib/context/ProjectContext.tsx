/**
 * AGRS ZEUS GUI v2 - Project Context
 * 
 * Provides global state management for the currently active project.
 */

'use client'

import React, { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from 'react'
import {
  ProjectMetadata,
  ProjectDatasets,
  fetchProjects,
  fetchProjectMetadata,
  fetchProjectDatasets,
  fetchDatasetFingerprint,
  getProjectLocalCacheConfig,
  ensureProjectLocalCacheRuntime,
  clearProjectLocalCacheRuntime
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
  isProjectLoading: boolean;  // True while loading project data (for map overlay)
  error: string | null;
  refreshProjects: () => Promise<void>;
  refreshProjectData: () => Promise<void>;
  hasNewDatasets: boolean;  // True when new datasets detected but not yet loaded
  dismissNewDatasets: () => void;  // Dismiss the notification without refreshing
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

const PROJECTS_CACHE_KEY = 'agrs_projects_cache'

const parseProjectsCache = (value: string | null): ProjectMetadata[] => {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed)) {
      return parsed.filter((entry): entry is ProjectMetadata => typeof entry?.project_name === 'string')
    }
  } catch (error) {
    console.warn('Failed to parse cached projects', error)
  }
  return []
}

export function ProjectProvider({ children }: ProjectProviderProps) {
  const [currentProject, setCurrentProjectState] = useState<string | null>(null)
  const [projects, setProjects] = useState<ProjectMetadata[]>([])
  const [projectMetadata, setProjectMetadata] = useState<ProjectMetadata | null>(null)
  const [datasets, setDatasets] = useState<ProjectDatasets | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isProjectLoading, setIsProjectLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasNewDatasets, setHasNewDatasets] = useState(false)

  // Seed projects from cache (if available) before hitting API
  useEffect(() => {
    if (typeof window === 'undefined') return
    const cached = parseProjectsCache(localStorage.getItem(PROJECTS_CACHE_KEY))
    if (cached.length > 0) {
      setProjects((prev) => (prev.length === 0 ? cached : prev))
    }
  }, [])

  // Load projects on mount
  useEffect(() => {
    loadProjects()
  }, [])

  // NOTE: We no longer auto-load from localStorage.
  // User must explicitly select a project via the ProjectSelectionDialog.

  // Load project metadata and datasets when current project changes
  useEffect(() => {
    // Reset notification flag when project changes
    setHasNewDatasets(false)

    if (currentProject) {
      loadProjectData(currentProject)
    } else {
      clearProjectLocalCacheRuntime()
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
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(PROJECTS_CACHE_KEY, JSON.stringify(projectsList))
        } catch (storageError) {
          console.warn('Failed to cache projects list', storageError)
        }
      }
      // NOTE: We no longer auto-select the first project.
      // User must explicitly select via ProjectSelectionDialog.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load projects')
      console.error('Failed to load projects:', err)
      if (typeof window !== 'undefined') {
        const cached = parseProjectsCache(localStorage.getItem(PROJECTS_CACHE_KEY))
        if (cached.length > 0) {
          setProjects(cached)
        }
      }
    } finally {
      setIsLoading(false)
    }
  }

  /**
   * Load metadata and datasets for a specific project
   */
  const loadProjectData = async (projectName: string) => {
    setIsLoading(true)
    setIsProjectLoading(true)  // Signal that project is loading (for map overlay)
    setError(null)

    try {
      const localCacheConfig = getProjectLocalCacheConfig(projectName)
      if (localCacheConfig?.enabled && localCacheConfig.base_directory) {
        await ensureProjectLocalCacheRuntime(projectName, localCacheConfig)
      } else {
        clearProjectLocalCacheRuntime(projectName)
      }

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
      setIsProjectLoading(false)
    }
  }

  const refreshProjectData = async () => {
    if (!currentProject) return
    setHasNewDatasets(false)  // Clear the notification flag
    await loadProjectData(currentProject)
  }

  const dismissNewDatasets = () => {
    setHasNewDatasets(false)
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

  // ============================================================================
  // Background Dataset Polling (every 10 seconds)
  // ============================================================================

  const lastFingerprintRef = useRef<string | null>(null)
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Memoize the check function to avoid recreating on every render
  const checkForDatasetChanges = useCallback(async () => {
    if (!currentProject || isLoading || isProjectLoading) return

    try {
      const fingerprint = await fetchDatasetFingerprint(currentProject)

      // If fingerprint changed, notify user (don't auto-refresh)
      if (lastFingerprintRef.current !== null && lastFingerprintRef.current !== fingerprint.fingerprint) {
        console.log('[ProjectContext] Dataset fingerprint changed, notifying user...')
        setHasNewDatasets(true)
      }

      // Update the stored fingerprint
      lastFingerprintRef.current = fingerprint.fingerprint
    } catch (err) {
      // Silent fail for polling - don't spam console
      // Only log in development
      if (process.env.NODE_ENV === 'development') {
        console.debug('[ProjectContext] Fingerprint poll failed:', err)
      }
    }
  }, [currentProject, isLoading, isProjectLoading])

  // Set up polling when project changes
  useEffect(() => {
    // Clear any existing interval
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }

    // Reset fingerprint when project changes
    lastFingerprintRef.current = null

    if (!currentProject) return

    // Start polling every 10 seconds
    pollIntervalRef.current = setInterval(() => {
      checkForDatasetChanges()
    }, 10000)

    // Cleanup on unmount or project change
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
      }
    }
  }, [currentProject, checkForDatasetChanges])

  const value: ProjectContextType = {
    currentProject,
    setCurrentProject,
    projects,
    projectMetadata,
    datasets,
    isLoading,
    isProjectLoading,
    error,
    refreshProjects,
    refreshProjectData,
    hasNewDatasets,
    dismissNewDatasets
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



