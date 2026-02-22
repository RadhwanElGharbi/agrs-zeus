/**
 * AGRS ZEUS GUI v2 - Project Selection Dialog
 * 
 * High-fidelity interface for project selection with "futuristic/exclusive" aesthetic.
 * Supports project folders (superadmin CRUD) and per-project visibility control.
 */

'use client'

import React, { useEffect, useState, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import {
  X, Folder, Calendar, MapPin, Globe, User, RefreshCw, Loader2,
  ChevronRight, Terminal, Activity, ShieldCheck, Database, Plus,
  FolderPlus, Eye, EyeOff, Lock, Pencil, Trash2,
  FolderOpen, Users, UserPlus,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  ProjectMetadata,
  ProjectFolder,
  fetchProjectFolders,
  createProjectFolder,
  updateProjectFolder,
  deleteProjectFolder,
  assignProjectFolder,
  setProjectVisibility,
  addProjectMember,
  listProjectMembers,
  removeProjectMember,
  searchUserDirectory,
  type ProjectMember,
  type UserProfile,
} from '@/lib/api/dataClient'
import { useProject } from '@/lib/context/ProjectContext'
import { useAuth } from '@/lib/context/AuthContext'
import { useOnboarding } from '@/lib/context/OnboardingContext'
import { trackEvent } from '@/lib/analytics'
import { CreateProjectWizard } from './CreateProjectWizard'

interface ProjectSelectionDialogProps {
  open: boolean
  projects: ProjectMetadata[]
  isLoading: boolean
  onSelect: (projectName: string) => void
  onClose: () => void
  onRefresh: () => void
}

export function ProjectSelectionDialog({
  open,
  projects,
  isLoading,
  onSelect,
  onClose,
  onRefresh
}: ProjectSelectionDialogProps) {
  const [selectedProject, setSelectedProject] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  const [isClosing, setIsClosing] = useState(false)
  const [wizardOpen, setWizardOpen] = useState(false)
  const { refreshProjects, setCurrentProject } = useProject()
  const { user } = useAuth()
  const { reportAction } = useOnboarding()
  const prevOpenRef = useRef(open)
  const isSuperadmin = user?.role === 'superadmin'

  // Folder state
  const [folders, setFolders] = useState<ProjectFolder[]>([])
  const [activeFolder, setActiveFolder] = useState<string | null>(null) // null = "All"
  const [folderDialogOpen, setFolderDialogOpen] = useState(false)
  const [editingFolder, setEditingFolder] = useState<ProjectFolder | null>(null)
  const [contextMenu, setContextMenu] = useState<{ project: string; x: number; y: number } | null>(null)
  const [visibilityDialogProject, setVisibilityDialogProject] = useState<ProjectMetadata | null>(null)

  useEffect(() => { setMounted(true) }, [])

  const loadFolders = useCallback(async () => {
    try {
      const f = await fetchProjectFolders()
      setFolders(f)
    } catch {
      // silent - folders are supplementary
    }
  }, [])

  useEffect(() => {
    if (prevOpenRef.current !== open) {
      if (open) {
        trackEvent('dialog', 'ProjectSelectionDialog', 'open_project_index_dialog')
      }
      prevOpenRef.current = open
    }
    if (open) {
      setSelectedProject(null)
      setIsClosing(false)
      loadFolders()
    }
  }, [open, loadFolders])

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return
    const handler = () => setContextMenu(null)
    window.addEventListener('click', handler)
    return () => window.removeEventListener('click', handler)
  }, [contextMenu])

  const handleClose = () => {
    trackEvent('dialog', 'ProjectSelectionDialog', 'close_project_index_dialog')
    setIsClosing(true)
    setTimeout(() => { onClose() }, 150)
  }

  const handleProjectCreated = async (projectName: string) => {
    trackEvent('project', 'ProjectSelectionDialog', 'project_created_from_wizard', { project_name: projectName })
    await refreshProjects()
    setCurrentProject(projectName)
    onSelect(projectName)
    setWizardOpen(false)
    handleClose()
  }

  if (!open || !mounted) return null

  const handleProjectClick = (projectName: string) => { setSelectedProject(projectName) }

  const handleConfirm = () => {
    if (selectedProject) onSelect(selectedProject)
  }

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'N/A'
    try {
      return new Date(dateStr).toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric'
      }).toUpperCase()
    } catch { return dateStr }
  }

  const getProjectLocation = (project: ProjectMetadata): string => {
    if (project.aoi?.countries && project.aoi.countries.length > 0) return project.aoi.countries.join(', ')
    if (project.country) return project.country
    return 'UNDEFINED'
  }

  // --- Folder-based filtering ---
  const filteredProjects = activeFolder === null
    ? projects
    : activeFolder === '__uncategorized__'
      ? projects.filter(p => !p.folder_id)
      : projects.filter(p => p.folder_id === activeFolder)

  const uncategorizedCount = projects.filter(p => !p.folder_id).length

  // --- Superadmin: visibility settings dialog ---
  const handleOpenVisibilityDialog = (project: ProjectMetadata) => {
    trackEvent('dialog', 'ProjectSelectionDialog', 'open_project_visibility_dialog', {
      project_name: project.project_name,
      visibility: project.visibility
    })
    setVisibilityDialogProject(project)
  }

  // --- Superadmin: folder assignment ---
  const handleAssignFolder = async (projectName: string, folderId: string | null) => {
    try {
      trackEvent('project', 'ProjectSelectionDialog', 'assign_project_folder', {
        project_name: projectName,
        folder_id: folderId
      })
      await assignProjectFolder(projectName, folderId)
      onRefresh()
      loadFolders()
    } catch (err) {
      console.error('Failed to assign folder:', err)
    }
    setContextMenu(null)
  }

  // --- Superadmin: folder CRUD ---
  const handleCreateFolder = () => {
    trackEvent('dialog', 'ProjectSelectionDialog', 'open_folder_form_dialog_create')
    setEditingFolder(null)
    setFolderDialogOpen(true)
  }

  const handleEditFolder = (folder: ProjectFolder) => {
    trackEvent('dialog', 'ProjectSelectionDialog', 'open_folder_form_dialog_edit', {
      folder_id: folder.id,
      folder_name: folder.name
    })
    setEditingFolder(folder)
    setFolderDialogOpen(true)
  }

  const handleDeleteFolder = async (folderId: string) => {
    try {
      trackEvent('project', 'ProjectSelectionDialog', 'delete_project_folder', { folder_id: folderId })
      await deleteProjectFolder(folderId)
      if (activeFolder === folderId) setActiveFolder(null)
      loadFolders()
      onRefresh()
    } catch (err) {
      console.error('Failed to delete folder:', err)
    }
  }

  const handleFolderSaved = async () => {
    setFolderDialogOpen(false)
    setEditingFolder(null)
    await loadFolders()
  }

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className={cn(
          "fixed inset-0 bg-black/80 backdrop-blur-md z-[100]",
          isClosing ? "animate-fade-out" : "animate-fade-in"
        )}
        onClick={handleClose}
      >
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:40px_40px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,black_100%)]" />
      </div>

      {/* Dialog */}
      <div className="fixed inset-0 flex items-center justify-center z-[101] p-4 md:p-8 pointer-events-none">
        <div
          className={cn(
            "relative bg-[#0a0a0a]/90 border border-white/10 rounded-sm shadow-[0_0_50px_-12px_rgba(0,0,0,0.9)] w-full max-w-6xl max-h-[90vh] flex flex-col pointer-events-auto overflow-hidden",
            isClosing ? "animate-fade-out" : "animate-fade-in"
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Decorative Top Line */}
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-primary/50 to-transparent" />

          {/* Header */}
          <div className="flex items-center justify-between px-8 py-6 border-b border-white/10 bg-black/20">
            <div className="flex items-center gap-4">
              <div className="relative p-3 bg-primary/5 border border-primary/20 rounded-sm">
                <Database className="w-6 h-6 text-primary" />
                <div className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full shadow-[0_0_10px_rgba(var(--primary),1)] animate-pulse" />
              </div>
              <div>
                <h2 className="text-xl font-bold tracking-widest uppercase text-white font-mono">
                  Project Index <span className="text-primary">v2.0</span>
                </h2>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-mono uppercase tracking-wider mt-1">
                  <span className="text-emerald-500">● System Online</span>
                  <span>|</span>
                  <span>Secure Connection</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Stats Pill */}
              <div className="hidden md:flex items-center gap-4 px-4 py-2 bg-white/5 border border-white/5 rounded-sm mr-4">
                <div className="flex flex-col items-end">
                  <span className="text-[10px] text-muted-foreground font-mono uppercase">Total Projects</span>
                  <span className="text-sm font-mono font-bold text-white">{projects.length.toString().padStart(2, '0')}</span>
                </div>
                <div className="w-px h-6 bg-white/10" />
                <div className="flex flex-col items-end">
                  <span className="text-[10px] text-muted-foreground font-mono uppercase">Status</span>
                  <span className="text-sm font-mono font-bold text-emerald-400">ACTIVE</span>
                </div>
              </div>

              <button
                onClick={onRefresh}
                disabled={isLoading}
                className="group p-2 hover:bg-primary/10 border border-transparent hover:border-primary/20 rounded-sm transition-all disabled:opacity-50"
                title="Refresh Index"
              >
                <RefreshCw className={cn("w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors", isLoading && "animate-spin")} />
              </button>
              <button
                onClick={handleClose}
                className="group p-2 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 rounded-sm transition-all"
              >
                <X className="w-5 h-5 text-muted-foreground group-hover:text-red-400 transition-colors" />
              </button>
            </div>
          </div>

          {/* Folder Tabs */}
          <FolderBar
            folders={folders}
            activeFolder={activeFolder}
            onSelect={setActiveFolder}
            uncategorizedCount={uncategorizedCount}
            totalCount={projects.length}
            isSuperadmin={isSuperadmin}
            onCreateFolder={handleCreateFolder}
            onEditFolder={handleEditFolder}
            onDeleteFolder={handleDeleteFolder}
          />

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-8 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:20px_20px]">
            {isLoading && projects.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-20 text-muted-foreground">
                <div className="relative">
                  <div className="w-16 h-16 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Loader2 className="w-6 h-6 text-primary animate-pulse" />
                  </div>
                </div>
                <p className="mt-6 text-sm font-mono tracking-widest uppercase animate-pulse">Retrieving Project Data...</p>
              </div>
            ) : filteredProjects.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-20 text-muted-foreground">
                <Terminal className="w-16 h-16 mb-6 opacity-20" />
                <p className="text-xl font-light tracking-wider uppercase text-white/50">
                  {activeFolder ? 'No Projects in this Folder' : 'No Projects Detected'}
                </p>
                <p className="text-xs font-mono mt-2 text-white/30">
                  {activeFolder ? 'Assign projects to this folder via the context menu' : 'Initiate new project sequence in root directory'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredProjects.map((project) => (
                  <ProjectCard
                    key={project.project_name}
                    project={project}
                    isSelected={selectedProject === project.project_name}
                    onClick={() => handleProjectClick(project.project_name)}
                    onDoubleClick={() => onSelect(project.project_name)}
                    formatDate={formatDate}
                    getProjectLocation={getProjectLocation}
                    isSuperadmin={isSuperadmin}
                    onToggleVisibility={() => handleOpenVisibilityDialog(project)}
                    onContextMenu={(e) => {
                      if (!isSuperadmin) return
                      e.preventDefault()
                      setContextMenu({ project: project.project_name, x: e.clientX, y: e.clientY })
                    }}
                  />
                ))}

                {/* Create New Project Card */}
                <button
                  onClick={() => {
                    reportAction('click-create-project')
                    setWizardOpen(true)
                  }}
                  data-tour="create-project-btn"
                  className="group relative p-6 border border-dashed border-white/10 bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/20 rounded-sm flex flex-col items-center justify-center gap-4 transition-all min-h-[240px]"
                >
                  <div className="p-4 rounded-full bg-white/5 border border-white/10 group-hover:border-primary/50 group-hover:bg-primary/10 transition-all">
                    <Plus className="w-8 h-8 text-white/30 group-hover:text-primary transition-colors" />
                  </div>
                  <div className="text-center">
                    <div className="text-sm font-bold text-white uppercase tracking-wide group-hover:text-primary transition-colors">Create New Project</div>
                    <div className="text-[10px] font-mono text-white/30 mt-1">Initiate Setup Sequence</div>
                  </div>
                </button>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-8 py-6 border-t border-white/10 bg-black/40 backdrop-blur-sm">
            <div className="flex items-center gap-2 text-[10px] text-white/30 font-mono uppercase tracking-widest">
              <Activity className="w-3 h-3" />
              <span>System Ready // Waiting for input</span>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={handleClose}
                className="px-6 py-2.5 text-xs font-mono uppercase tracking-wider text-white/60 hover:text-white hover:bg-white/5 border border-transparent hover:border-white/10 rounded-sm transition-all"
              >
                Abort
              </button>
              <button
                onClick={handleConfirm}
                disabled={!selectedProject}
                className={cn(
                  "relative group px-8 py-2.5 text-xs font-mono uppercase tracking-wider font-bold transition-all duration-300 rounded-sm",
                  selectedProject
                    ? "bg-primary text-black hover:bg-primary/90 shadow-[0_0_20px_-5px_rgba(var(--primary),0.5)]"
                    : "bg-white/5 text-white/20 cursor-not-allowed"
                )}
              >
                <span className="relative z-10 flex items-center gap-2">
                  Initialize Project
                  <ChevronRight className={cn("w-3 h-3 transition-transform", selectedProject && "group-hover:translate-x-1")} />
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Context Menu (superadmin: folder assignment) */}
      {contextMenu && isSuperadmin && (
        <ProjectContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          projectName={contextMenu.project}
          currentFolderId={projects.find(p => p.project_name === contextMenu.project)?.folder_id ?? null}
          folders={folders}
          onAssign={handleAssignFolder}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Folder Create/Edit Dialog */}
      {folderDialogOpen && (
        <FolderFormDialog
          folder={editingFolder}
          onSave={handleFolderSaved}
          onClose={() => { setFolderDialogOpen(false); setEditingFolder(null) }}
        />
      )}

      {/* Visibility Dialog */}
      {visibilityDialogProject && isSuperadmin && (
        <ProjectVisibilityDialog
          projectName={visibilityDialogProject.project_name}
          initialVisibility={(visibilityDialogProject.visibility === 'restricted' ? 'restricted' : 'public')}
          onClose={() => {
            trackEvent('dialog', 'ProjectSelectionDialog', 'close_project_visibility_dialog', {
              project_name: visibilityDialogProject.project_name
            })
            setVisibilityDialogProject(null)
          }}
          onSaved={async () => {
            await refreshProjects()
            onRefresh()
          }}
        />
      )}

      <CreateProjectWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onCreated={handleProjectCreated}
      />
    </>,
    document.body
  )
}


// ============================================================================
// Folder Bar (horizontal tabs above project grid)
// ============================================================================

const FOLDER_COLORS: Record<string, string> = {
  red: 'bg-red-500', orange: 'bg-orange-500', amber: 'bg-amber-500',
  yellow: 'bg-yellow-500', lime: 'bg-lime-500', green: 'bg-green-500',
  emerald: 'bg-emerald-500', teal: 'bg-teal-500', cyan: 'bg-cyan-500',
  sky: 'bg-sky-500', blue: 'bg-blue-500', indigo: 'bg-indigo-500',
  violet: 'bg-violet-500', purple: 'bg-purple-500', fuchsia: 'bg-fuchsia-500',
  pink: 'bg-pink-500', rose: 'bg-rose-500',
}

function folderDotClass(color?: string | null): string {
  if (!color) return 'bg-white/40'
  return FOLDER_COLORS[color] ?? 'bg-white/40'
}

interface FolderBarProps {
  folders: ProjectFolder[]
  activeFolder: string | null
  onSelect: (id: string | null) => void
  uncategorizedCount: number
  totalCount: number
  isSuperadmin: boolean
  onCreateFolder: () => void
  onEditFolder: (f: ProjectFolder) => void
  onDeleteFolder: (id: string) => void
}

function FolderBar({
  folders, activeFolder, onSelect, uncategorizedCount, totalCount,
  isSuperadmin, onCreateFolder, onEditFolder, onDeleteFolder
}: FolderBarProps) {
  const [hoveredFolder, setHoveredFolder] = useState<string | null>(null)

  if (folders.length === 0 && !isSuperadmin) return null

  return (
    <div className="flex items-center gap-2 px-8 py-3 border-b border-white/5 bg-black/30 overflow-x-auto scrollbar-thin scrollbar-thumb-white/10">
      <div className="flex items-center gap-1 text-[10px] text-white/30 font-mono uppercase tracking-widest mr-2 shrink-0">
        <FolderOpen className="w-3 h-3" />
        <span>Folders</span>
      </div>

      {/* "All" tab */}
      <button
        onClick={() => onSelect(null)}
        className={cn(
          "shrink-0 flex items-center gap-2 px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider rounded-sm border transition-all",
          activeFolder === null
            ? "bg-primary/10 border-primary/30 text-primary"
            : "bg-white/[0.02] border-white/5 text-white/50 hover:text-white/80 hover:border-white/15"
        )}
      >
        All
        <span className="text-[9px] opacity-60">{totalCount.toString().padStart(2, '0')}</span>
      </button>

      {/* Folder tabs */}
      {folders.map(folder => (
        <div
          key={folder.id}
          className="relative shrink-0 group/tab"
          onMouseEnter={() => setHoveredFolder(folder.id)}
          onMouseLeave={() => setHoveredFolder(null)}
        >
          <button
            onClick={() => onSelect(folder.id)}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider rounded-sm border transition-all",
              activeFolder === folder.id
                ? "bg-primary/10 border-primary/30 text-primary"
                : "bg-white/[0.02] border-white/5 text-white/50 hover:text-white/80 hover:border-white/15"
            )}
          >
            <span className={cn("w-2 h-2 rounded-full shrink-0", folderDotClass(folder.color))} />
            {folder.name}
            <span className="text-[9px] opacity-60">{folder.project_count.toString().padStart(2, '0')}</span>
          </button>

          {/* Edit/Delete (superadmin hover) */}
          {isSuperadmin && hoveredFolder === folder.id && (
            <div className="absolute -top-1 -right-1 flex items-center gap-0.5 z-10">
              <button
                onClick={(e) => { e.stopPropagation(); onEditFolder(folder) }}
                className="p-0.5 bg-black/80 border border-white/10 rounded-sm hover:border-primary/30 transition-all"
                title="Edit folder"
              >
                <Pencil className="w-2.5 h-2.5 text-white/60 hover:text-primary" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onDeleteFolder(folder.id) }}
                className="p-0.5 bg-black/80 border border-white/10 rounded-sm hover:border-red-500/30 transition-all"
                title="Delete folder"
              >
                <Trash2 className="w-2.5 h-2.5 text-white/60 hover:text-red-400" />
              </button>
            </div>
          )}
        </div>
      ))}

      {/* Uncategorized tab (only if there are folders) */}
      {folders.length > 0 && (
        <button
          onClick={() => onSelect('__uncategorized__')}
          className={cn(
            "shrink-0 flex items-center gap-2 px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider rounded-sm border transition-all",
            activeFolder === '__uncategorized__'
              ? "bg-white/10 border-white/20 text-white/80"
              : "bg-white/[0.02] border-white/5 text-white/30 hover:text-white/60 hover:border-white/10"
          )}
        >
          Uncategorized
          <span className="text-[9px] opacity-60">{uncategorizedCount.toString().padStart(2, '0')}</span>
        </button>
      )}

      {/* Create folder button (superadmin) */}
      {isSuperadmin && (
        <button
          onClick={onCreateFolder}
          className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider rounded-sm border border-dashed border-white/10 text-white/30 hover:text-primary hover:border-primary/30 transition-all"
          title="Create folder"
        >
          <FolderPlus className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  )
}


// ============================================================================
// Project Card Component
// ============================================================================

interface ProjectCardProps {
  project: ProjectMetadata
  isSelected: boolean
  onClick: () => void
  onDoubleClick: () => void
  formatDate: (date?: string) => string
  getProjectLocation: (project: ProjectMetadata) => string
  isSuperadmin: boolean
  onToggleVisibility: () => void
  onContextMenu: (e: React.MouseEvent) => void
}

function ProjectCard({
  project, isSelected, onClick, onDoubleClick, formatDate, getProjectLocation,
  isSuperadmin, onToggleVisibility, onContextMenu,
}: ProjectCardProps) {
  const isRestricted = project.visibility === 'restricted'

  return (
    <div
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      className={cn(
        "group relative p-6 border cursor-pointer transition-all duration-300 overflow-hidden",
        isSelected
          ? "bg-primary/5 border-primary/50 shadow-[0_0_30px_-10px_rgba(var(--primary),0.3)]"
          : "bg-black/20 border-white/5 hover:border-white/20 hover:bg-white/5"
      )}
    >
      {/* Technical Corner Markers */}
      <div className={cn("absolute top-0 left-0 w-2 h-2 border-t border-l transition-colors", isSelected ? "border-primary" : "border-white/20 group-hover:border-white/40")} />
      <div className={cn("absolute top-0 right-0 w-2 h-2 border-t border-r transition-colors", isSelected ? "border-primary" : "border-white/20 group-hover:border-white/40")} />
      <div className={cn("absolute bottom-0 left-0 w-2 h-2 border-b border-l transition-colors", isSelected ? "border-primary" : "border-white/20 group-hover:border-white/40")} />
      <div className={cn("absolute bottom-0 right-0 w-2 h-2 border-b border-r transition-colors", isSelected ? "border-primary" : "border-white/20 group-hover:border-white/40")} />

      {/* Top-right badges */}
      <div className="absolute top-2 right-2 flex items-center gap-1.5">
        {/* Visibility badge */}
        {isRestricted && (
          <div className="flex items-center gap-1 px-1.5 py-0.5 bg-amber-500/10 border border-amber-500/20 rounded-sm" title="Restricted visibility">
            <Lock className="w-2.5 h-2.5 text-amber-500" />
            <span className="text-[8px] font-mono uppercase text-amber-500/80">Restricted</span>
          </div>
        )}

        {/* Folder badge */}
        {project.folder_name && (
          <div className="flex items-center gap-1 px-1.5 py-0.5 bg-white/5 border border-white/10 rounded-sm">
            <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", folderDotClass(project.folder_color))} />
            <span className="text-[8px] font-mono uppercase text-white/50 max-w-[80px] truncate">{project.folder_name}</span>
          </div>
        )}

        {/* Superadmin: visibility toggle */}
        {isSuperadmin && (
          <button
            onClick={(e) => { e.stopPropagation(); onToggleVisibility() }}
            className={cn(
              "p-1 rounded-sm border transition-all opacity-0 group-hover:opacity-100",
              isRestricted
                ? "bg-amber-500/10 border-amber-500/20 hover:bg-amber-500/20"
                : "bg-white/5 border-white/10 hover:bg-white/10"
            )}
            title={isRestricted ? "Make public" : "Make restricted"}
          >
            {isRestricted
              ? <EyeOff className="w-3 h-3 text-amber-500" />
              : <Eye className="w-3 h-3 text-white/40" />
            }
          </button>
        )}
      </div>

      {/* Header Section */}
      <div className="flex justify-between items-start mb-6">
        <div className="flex items-start gap-4">
          <div className={cn(
            "p-2.5 rounded-sm border transition-all duration-300",
            isSelected
              ? "bg-primary/10 border-primary/30 text-primary"
              : "bg-white/5 border-white/10 text-muted-foreground group-hover:text-white group-hover:border-white/20"
          )}>
            <Folder className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h3 className={cn(
                "font-bold text-sm tracking-wide uppercase transition-colors",
                isSelected ? "text-white" : "text-white/80 group-hover:text-white"
              )}>
                {project.project_name}
              </h3>
              {isSelected && <span className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />}
            </div>
            <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">
              {project.client || 'Internal Project'}
            </p>
          </div>
        </div>
        {project.aoi?.area_km2 && (
          <div className={cn(
            "px-2 py-1 text-[10px] font-mono border rounded-sm transition-colors mt-4",
            isSelected ? "border-primary/30 text-primary bg-primary/5" : "border-white/10 text-muted-foreground bg-white/5"
          )}>
            {project.aoi.area_km2.toFixed(0)} KM²
          </div>
        )}
      </div>

      {/* Data Grid */}
      <div className="grid grid-cols-2 gap-y-4 gap-x-8">
        <InfoBlock
          label="Location"
          value={getProjectLocation(project)}
          icon={MapPin}
          colSpan={2}
        />
        <InfoBlock
          label="CRS / EPSG"
          value={project.crs ? `${project.crs.name}` : 'N/A'}
          subValue={project.crs ? `EPSG:${project.crs.epsg}` : undefined}
          icon={Globe}
        />
        <InfoBlock
          label="Created"
          value={formatDate(project.date_created)}
          icon={Calendar}
        />

        <div className="col-span-2 h-px bg-white/5 my-1 group-hover:bg-white/10 transition-colors" />

        <InfoBlock
          label="Creator"
          value={project.project_creator || 'UNASSIGNED'}
          icon={User}
          dim={!project.project_creator}
        />
        <InfoBlock
          label="Division"
          value={project.department || 'R&D'}
          icon={ShieldCheck}
          dim={!project.department}
        />
      </div>

      {/* Selection Overlay (Scan effect) */}
      {isSelected && (
        <div className="absolute inset-0 bg-gradient-to-b from-primary/0 via-primary/5 to-primary/0 animate-scan pointer-events-none" />
      )}
    </div>
  )
}


// ============================================================================
// Info Block Component
// ============================================================================

interface InfoBlockProps {
  label: string
  value: string
  subValue?: string
  icon: React.ElementType
  colSpan?: number
  dim?: boolean
}

function InfoBlock({ label, value, subValue, icon: Icon, colSpan, dim }: InfoBlockProps) {
  return (
    <div className={cn("space-y-1", colSpan && `col-span-${colSpan}`)}>
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-mono uppercase tracking-wider">
        <Icon className="w-3 h-3 opacity-70" />
        <span>{label}</span>
      </div>
      <div className={cn(
        "font-mono text-xs truncate",
        dim ? "text-white/30 italic" : "text-white/90"
      )}>
        {value}
      </div>
      {subValue && (
        <div className="text-[10px] font-mono text-primary/80 truncate">
          {subValue}
        </div>
      )}
    </div>
  )
}


// ============================================================================
// Project Context Menu (superadmin: right-click to assign folder)
// ============================================================================

interface ProjectContextMenuProps {
  x: number
  y: number
  projectName: string
  currentFolderId: string | null
  folders: ProjectFolder[]
  onAssign: (projectName: string, folderId: string | null) => void
  onClose: () => void
}

function ProjectContextMenu({ x, y, projectName, currentFolderId, folders, onAssign, onClose }: ProjectContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuRef.current) return
    const rect = menuRef.current.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    if (rect.right > vw) menuRef.current.style.left = `${x - rect.width}px`
    if (rect.bottom > vh) menuRef.current.style.top = `${y - rect.height}px`
  }, [x, y])

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-[200] bg-[#111]/95 border border-white/10 rounded-sm shadow-xl min-w-[200px] py-1 backdrop-blur-lg"
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="px-3 py-1.5 text-[9px] font-mono uppercase tracking-widest text-white/30 border-b border-white/5">
        Move to Folder
      </div>

      {/* "No folder" option */}
      <button
        onClick={() => onAssign(projectName, null)}
        className={cn(
          "w-full flex items-center gap-2 px-3 py-2 text-[11px] font-mono text-left transition-colors",
          !currentFolderId ? "text-primary bg-primary/5" : "text-white/60 hover:text-white hover:bg-white/5"
        )}
      >
        <X className="w-3 h-3 opacity-50" />
        None (Uncategorized)
        {!currentFolderId && <span className="ml-auto text-[9px] text-primary">●</span>}
      </button>

      {folders.map(folder => (
        <button
          key={folder.id}
          onClick={() => onAssign(projectName, folder.id)}
          className={cn(
            "w-full flex items-center gap-2 px-3 py-2 text-[11px] font-mono text-left transition-colors",
            currentFolderId === folder.id ? "text-primary bg-primary/5" : "text-white/60 hover:text-white hover:bg-white/5"
          )}
        >
          <span className={cn("w-2 h-2 rounded-full shrink-0", folderDotClass(folder.color))} />
          {folder.name}
          {currentFolderId === folder.id && <span className="ml-auto text-[9px] text-primary">●</span>}
        </button>
      ))}
    </div>,
    document.body
  )
}


// ============================================================================
// Visibility Dialog (superadmin)
// ============================================================================

interface ProjectVisibilityDialogProps {
  projectName: string
  initialVisibility: 'public' | 'restricted'
  onClose: () => void
  onSaved: () => Promise<void> | void
}

function ProjectVisibilityDialog({ projectName, initialVisibility, onClose, onSaved }: ProjectVisibilityDialogProps) {
  const [mode, setMode] = useState<'public' | 'restricted'>(initialVisibility)
  const [savingMode, setSavingMode] = useState(false)
  const [members, setMembers] = useState<ProjectMember[]>([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [membersError, setMembersError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<UserProfile[]>([])
  const [actionError, setActionError] = useState<string | null>(null)
  const [busyUserId, setBusyUserId] = useState<string | null>(null)

  const loadMembers = useCallback(async () => {
    setMembersLoading(true)
    setMembersError(null)
    try {
      const resp = await listProjectMembers(projectName)
      setMembers(resp.members || [])
    } catch (err) {
      setMembersError(err instanceof Error ? err.message : 'Failed to load members')
    } finally {
      setMembersLoading(false)
    }
  }, [projectName])

  useEffect(() => {
    if (mode === 'restricted') {
      void loadMembers()
    }
  }, [mode, loadMembers])

  useEffect(() => {
    if (mode !== 'restricted') {
      setSearchResults([])
      return
    }
    const q = searchTerm.trim()
    if (q.length < 2) {
      setSearchResults([])
      return
    }

    let cancelled = false
    const timer = setTimeout(async () => {
      setSearching(true)
      try {
        const resp = await searchUserDirectory(q, 20, 0)
        if (!cancelled) {
          const existingIds = new Set(members.map(m => m.user_id))
          setSearchResults((resp.users || []).filter(u => !!u.id && !existingIds.has(String(u.id))))
        }
      } catch {
        if (!cancelled) setSearchResults([])
      } finally {
        if (!cancelled) setSearching(false)
      }
    }, 250)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [mode, searchTerm, members])

  const handleAddMember = async (candidate: UserProfile) => {
    if (!candidate.email || !candidate.id) return
    setBusyUserId(String(candidate.id))
    setActionError(null)
    try {
      await addProjectMember(projectName, candidate.email)
      await loadMembers()
      setSearchTerm('')
      setSearchResults([])
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to add member')
    } finally {
      setBusyUserId(null)
    }
  }

  const handleRemoveMember = async (member: ProjectMember) => {
    setBusyUserId(member.user_id)
    setActionError(null)
    try {
      await removeProjectMember(projectName, member.user_id)
      await loadMembers()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to remove member')
    } finally {
      setBusyUserId(null)
    }
  }

  const handleSave = async () => {
    setSavingMode(true)
    setActionError(null)
    try {
      if (mode === 'restricted' && members.length === 0) {
        setActionError('Choose at least one member when visibility is restricted.')
        return
      }
      await setProjectVisibility(projectName, mode)
      await onSaved()
      onClose()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to update visibility')
    } finally {
      setSavingMode(false)
    }
  }

  return createPortal(
    <>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[320]" onClick={onClose} />
      <div className="fixed inset-0 z-[321] flex items-center justify-center p-4 pointer-events-none">
        <div
          className="w-full max-w-xl rounded-sm border border-white/10 bg-[#0c0c0c]/95 shadow-2xl pointer-events-auto overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-5 py-4 border-b border-white/10 bg-black/30 flex items-center justify-between">
            <div>
              <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/40">Project Visibility</div>
              <div className="text-sm font-semibold text-white mt-0.5">{projectName}</div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-sm text-white/40 hover:text-white hover:bg-white/5 border border-transparent hover:border-white/10 transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-5 space-y-4">
            <button
              onClick={() => setMode('public')}
              className={cn(
                'w-full text-left p-3 rounded-sm border transition-all',
                mode === 'public'
                  ? 'border-primary/40 bg-primary/10'
                  : 'border-white/10 bg-white/[0.02] hover:border-white/20'
              )}
            >
              <div className="flex items-center gap-2">
                <Eye className={cn('w-4 h-4', mode === 'public' ? 'text-primary' : 'text-white/50')} />
                <span className="text-sm font-medium text-white">Visible to everyone</span>
              </div>
              <div className="text-[11px] text-white/45 mt-1">Any authenticated user can see this project.</div>
            </button>

            <button
              onClick={() => setMode('restricted')}
              className={cn(
                'w-full text-left p-3 rounded-sm border transition-all',
                mode === 'restricted'
                  ? 'border-primary/40 bg-primary/10'
                  : 'border-white/10 bg-white/[0.02] hover:border-white/20'
              )}
            >
              <div className="flex items-center gap-2">
                <Users className={cn('w-4 h-4', mode === 'restricted' ? 'text-primary' : 'text-white/50')} />
                <span className="text-sm font-medium text-white">Select who can see the project</span>
              </div>
              <div className="text-[11px] text-white/45 mt-1">Only selected members (and superadmins) can access.</div>
            </button>

            {mode === 'restricted' && (
              <div className="rounded-sm border border-white/10 bg-black/30 p-3 space-y-3">
                <div className="text-[10px] font-mono uppercase tracking-wider text-white/50">Allowed Members</div>

                <div className="relative">
                  <input
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search user by email or name"
                    className="w-full bg-black/50 border border-white/10 rounded-sm px-3 py-2 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-primary/50"
                  />
                  {searching && (
                    <Loader2 className="absolute right-2 top-2.5 w-4 h-4 animate-spin text-white/40" />
                  )}
                </div>

                {searchResults.length > 0 && (
                  <div className="max-h-36 overflow-auto rounded-sm border border-white/10">
                    {searchResults.map((u) => (
                      <div key={u.id} className="px-3 py-2 border-b last:border-b-0 border-white/5 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-xs text-white truncate">{u.full_name || u.name || u.email}</div>
                          <div className="text-[10px] text-white/45 truncate">{u.email}</div>
                        </div>
                        <button
                          onClick={() => { void handleAddMember(u) }}
                          disabled={busyUserId === u.id}
                          className="px-2 py-1 text-[10px] font-mono uppercase rounded-sm border border-primary/30 text-primary hover:bg-primary/10 disabled:opacity-50"
                        >
                          <span className="inline-flex items-center gap-1">
                            <UserPlus className="w-3 h-3" />
                            Add
                          </span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {membersLoading && (
                  <div className="text-[11px] text-white/45">Loading members...</div>
                )}
                {membersError && (
                  <div className="text-[11px] text-red-300">{membersError}</div>
                )}

                {!membersLoading && members.length === 0 && (
                  <div className="text-[11px] text-amber-300/80">
                    No members selected yet.
                  </div>
                )}

                {members.length > 0 && (
                  <div className="max-h-40 overflow-auto rounded-sm border border-white/10">
                    {members.map((m) => (
                      <div key={m.user_id} className="px-3 py-2 border-b last:border-b-0 border-white/5 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-xs text-white truncate">{m.full_name || m.email}</div>
                          <div className="text-[10px] text-white/45 truncate">{m.email}</div>
                        </div>
                        <button
                          onClick={() => { void handleRemoveMember(m) }}
                          disabled={busyUserId === m.user_id}
                          className="px-2 py-1 text-[10px] font-mono uppercase rounded-sm border border-red-500/30 text-red-300 hover:bg-red-500/10 disabled:opacity-50"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {actionError && <div className="text-[11px] text-red-300">{actionError}</div>}
          </div>

          <div className="px-5 py-4 border-t border-white/10 bg-black/20 flex items-center justify-end gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-[11px] font-mono uppercase tracking-wider text-white/50 hover:text-white border border-transparent hover:border-white/10 rounded-sm transition-all"
            >
              Cancel
            </button>
            <button
              onClick={() => { void handleSave() }}
              disabled={savingMode}
              className="px-5 py-2 text-[11px] font-mono uppercase tracking-wider font-bold rounded-sm transition-all bg-primary text-black hover:bg-primary/90 disabled:opacity-60"
            >
              {savingMode ? 'Saving...' : 'Apply'}
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body
  )
}


// ============================================================================
// Folder Form Dialog (create / edit)
// ============================================================================

const COLOR_OPTIONS = [
  'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal',
  'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose',
]

interface FolderFormDialogProps {
  folder: ProjectFolder | null
  onSave: () => void
  onClose: () => void
}

function FolderFormDialog({ folder, onSave, onClose }: FolderFormDialogProps) {
  const [name, setName] = useState(folder?.name ?? '')
  const [color, setColor] = useState(folder?.color ?? 'blue')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setError(null)
    try {
      if (folder) {
        await updateProjectFolder(folder.id, { name: name.trim(), color })
      } else {
        await createProjectFolder({ name: name.trim(), color })
      }
      onSave()
    } catch (err: any) {
      setError(err?.message || 'Failed to save folder')
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[300]" onClick={onClose} />
      <div className="fixed inset-0 flex items-center justify-center z-[301] pointer-events-none">
        <form
          onSubmit={handleSubmit}
          className="bg-[#0e0e0e] border border-white/10 rounded-sm shadow-2xl w-full max-w-sm pointer-events-auto p-6 space-y-5"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/5 border border-primary/20 rounded-sm">
              <FolderPlus className="w-5 h-5 text-primary" />
            </div>
            <h3 className="text-sm font-bold font-mono uppercase tracking-widest text-white">
              {folder ? 'Edit Folder' : 'New Folder'}
            </h3>
          </div>

          {/* Name input */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-mono uppercase tracking-widest text-white/40">Folder Name</label>
            <input
              ref={inputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={128}
              placeholder="e.g. TC Energy Projects"
              className="w-full bg-black/50 border border-white/10 rounded-sm px-3 py-2 text-sm font-mono text-white placeholder:text-white/20 focus:outline-none focus:border-primary/50 transition-colors"
            />
          </div>

          {/* Color picker */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-mono uppercase tracking-widest text-white/40">Color</label>
            <div className="flex flex-wrap gap-1.5">
              {COLOR_OPTIONS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={cn(
                    "w-5 h-5 rounded-full transition-all",
                    FOLDER_COLORS[c],
                    color === c
                      ? "ring-2 ring-white ring-offset-2 ring-offset-[#0e0e0e] scale-110"
                      : "opacity-50 hover:opacity-80"
                  )}
                />
              ))}
            </div>
          </div>

          {error && (
            <p className="text-[11px] font-mono text-red-400">{error}</p>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-[11px] font-mono uppercase tracking-wider text-white/50 hover:text-white border border-transparent hover:border-white/10 rounded-sm transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || saving}
              className={cn(
                "px-5 py-2 text-[11px] font-mono uppercase tracking-wider font-bold rounded-sm transition-all",
                name.trim() && !saving
                  ? "bg-primary text-black hover:bg-primary/90"
                  : "bg-white/5 text-white/20 cursor-not-allowed"
              )}
            >
              {saving ? 'Saving...' : folder ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </>,
    document.body
  )
}
