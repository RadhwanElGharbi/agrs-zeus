/**
 * AGRS ZEUS GUI v2 - Project Selector
 * 
 * Dropdown component to select the active project.
 */

'use client'

import React from 'react'
import { useProject } from '@/lib/context/ProjectContext'
import { ChevronDown, Folder, RefreshCw } from 'lucide-react'

export function ProjectSelector() {
  const {
    currentProject,
    setCurrentProject,
    projects,
    projectMetadata,
    isLoading,
    error,
    refreshProjects
  } = useProject()

  const [isOpen, setIsOpen] = React.useState(false)

  const handleSelect = (projectName: string) => {
    setCurrentProject(projectName)
    setIsOpen(false)
  }

  const currentProjectData = projects.find(p => p.project_name === currentProject)

  return (
    <div className="relative">
      {/* Dropdown Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isLoading}
        className="w-full flex items-center justify-between p-3 bg-card border border-border rounded-lg hover:bg-accent transition-colors disabled:opacity-50"
      >
        <div className="flex items-center gap-2">
          <Folder className="w-4 h-4" />
          <div className="text-left">
            <div className="text-sm font-medium">
              {currentProjectData?.project_name || 'Select Project'}
            </div>
            {currentProjectData?.client && (
              <div className="text-xs text-muted-foreground">
                {currentProjectData.client}
              </div>
            )}
          </div>
        </div>
        <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute top-full mt-2 w-full bg-card border border-border rounded-lg shadow-lg z-50 max-h-96 overflow-y-auto">
          {/* Refresh Button */}
          <div className="p-2 border-b border-border">
            <button
              onClick={() => {
                refreshProjects()
                setIsOpen(false)
              }}
              className="w-full flex items-center gap-2 p-2 hover:bg-accent rounded-md transition-colors text-sm"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh Projects
            </button>
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3 text-xs text-destructive border-b border-border">
              {error}
            </div>
          )}

          {/* Projects List */}
          {projects.length === 0 && !isLoading && !error && (
            <div className="p-3 text-xs text-muted-foreground text-center">
              No projects found
            </div>
          )}

          {projects.map((project) => (
            <button
              key={project.project_name}
              onClick={() => handleSelect(project.project_name)}
              className={`w-full flex items-start gap-2 p-3 hover:bg-accent transition-colors text-left border-b border-border last:border-b-0 ${
                currentProject === project.project_name ? 'bg-accent/50' : ''
              }`}
            >
              <Folder className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">
                  {project.project_name}
                </div>
                {project.client && (
                  <div className="text-xs text-muted-foreground truncate">
                    {project.client}
                  </div>
                )}
                {project.crs && (
                  <div className="text-xs text-muted-foreground mt-1">
                    {project.crs.name} ({project.crs.epsg})
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Project Metadata Summary */}
      {projectMetadata && !isOpen && (
        <div className="mt-2 p-2 bg-card border border-border rounded-lg text-xs">
          <div className="space-y-1">
            {projectMetadata.crs && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">CRS:</span>
                <span className="font-mono">EPSG:{projectMetadata.crs.epsg}</span>
              </div>
            )}
            {projectMetadata.aoi && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">AOI Area:</span>
                <span>{projectMetadata.aoi.area_km2.toFixed(1)} km²</span>
              </div>
            )}
            {projectMetadata.date_created && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Created:</span>
                <span>{new Date(projectMetadata.date_created).toLocaleDateString()}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Click Outside Handler */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  )
}

