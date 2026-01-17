'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import {
  Map,
  Layers,
  Settings,
  ChevronLeft,
  ChevronRight,
  Terminal,
  Cpu,
  ShieldCheck,
  Target,
  MonitorPlay,
  LayoutDashboard,
  Brain,
  ClipboardList
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useProject } from '@/lib/context/ProjectContext'
import { useMapView } from '@/lib/context/MapViewContext'
import { useOnboarding, TourAction } from '@/lib/context/OnboardingContext'
import { ProjectSelector } from '@/components/Project/ProjectSelector'
import { ProjectProfileDialog } from '@/components/Project/ProjectProfileDialog'
import { DatasetCoverageDialog } from '@/components/Project/DatasetCoverageDialog'
import { PirlAiDialog } from '@/components/Pirl/PirlAiDialog'
import { ZeusLoadingDialog } from '@/components/shared/ZeusLoadingDialog'
import { fetchActiveDatasetJobs, subscribeToDatasetJob, type DatasetCategory, type DatasetFetchJob } from '@/lib/api/dataClient'
import { ProjectAuditDialog } from '@/components/Project/ProjectAuditDialog'
// removed DigitalTwinView import

interface SidebarProps {
  className?: string
  devMode?: boolean
  activeView: 'map' | 'digital-twin' | 'project-management'
  onViewChange: (view: 'map' | 'digital-twin' | 'project-management') => void
  onDatasetRunInBackground?: (jobId: string) => void
}

export function Sidebar({ className, devMode = false, activeView, onViewChange, onDatasetRunInBackground }: SidebarProps) {
  const { currentProject, isProjectLoading } = useProject()
  const { registerGisActions, registerPirlActions } = useMapView()
  const { reportAction } = useOnboarding()
  const [collapsed, setCollapsed] = useState(false)
  const [showDatasets, setShowDatasets] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const [showPirlAi, setShowPirlAi] = useState(false)
  const [showAudit, setShowAudit] = useState(false)
  const [isZeusAnalyzing, setIsZeusAnalyzing] = useState(false)

  // Background activity signals (used to drive the "System Load" UI)
  const [activeDatasetJobId, setActiveDatasetJobId] = useState<string | null>(null)
  const [activeDatasetJobProgress, setActiveDatasetJobProgress] = useState(0)
  const [activeDatasetJobStatus, setActiveDatasetJobStatus] = useState<DatasetFetchJob['status'] | null>(null)
  const [activeDatasetJobCategory, setActiveDatasetJobCategory] = useState<DatasetCategory | null>(null)

  // Poll for active dataset jobs for the selected project, so the UI reflects
  // backgrounded / long-running fetches even after navigation or reload.
  useEffect(() => {
    setActiveDatasetJobId(null)
    setActiveDatasetJobProgress(0)
    setActiveDatasetJobStatus(null)
    setActiveDatasetJobCategory(null)

    if (!currentProject) return

    let cancelled = false

    const refreshActiveJob = async () => {
      try {
        const resp = await fetchActiveDatasetJobs()
        if (cancelled) return

        const active = resp?.active_jobs?.[currentProject]
        if (!active) {
          setActiveDatasetJobId(null)
          setActiveDatasetJobProgress(0)
          setActiveDatasetJobStatus(null)
          setActiveDatasetJobCategory(null)
          return
        }

        setActiveDatasetJobId(active.job_id)
        setActiveDatasetJobProgress(active.progress ?? 0)
        setActiveDatasetJobStatus(active.status as DatasetFetchJob['status'])
        setActiveDatasetJobCategory(active.current_category ?? null)
      } catch {
        // Non-fatal: keep last known state.
      }
    }

    void refreshActiveJob()

    const interval = setInterval(() => {
      void refreshActiveJob()
    }, 6000)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [currentProject])

  // Subscribe for live progress updates once we know the active job id.
  useEffect(() => {
    if (!activeDatasetJobId) return

    const unsubscribe = subscribeToDatasetJob(
      activeDatasetJobId,
      (job) => {
        setActiveDatasetJobProgress(job.progress ?? 0)
        setActiveDatasetJobStatus(job.status)
        setActiveDatasetJobCategory(job.current_category ?? null)

        if (job.status === 'succeeded' || job.status === 'failed' || job.status === 'partial') {
          setActiveDatasetJobId(null)
          setActiveDatasetJobProgress(0)
          setActiveDatasetJobStatus(null)
          setActiveDatasetJobCategory(null)
        }
      },
      () => {
        // Ignore stream errors; the active-job poll keeps us in sync.
      }
    )

    return () => unsubscribe()
  }, [activeDatasetJobId])

  const systemLoad = useMemo(() => {
    // Only show a meaningful load once a project is selected, per requirements.
    const baseLoad = currentProject ? 0.08 : 0
    const activity: string[] = []

    let load = baseLoad

    if (currentProject) {
      if (isProjectLoading) {
        load += 0.22
        activity.push('Loading project data')
      }

      if (isZeusAnalyzing) {
        load += 0.18
        activity.push('Preparing dataset manager')
      }

      if (activeDatasetJobId) {
        load += 0.65
        const pct = Math.round((activeDatasetJobProgress ?? 0) * 100)
        activity.push(`Dataset fetch: ${pct}%${activeDatasetJobCategory ? ` (${activeDatasetJobCategory})` : ''}`)
      }
    }

    load = Math.max(0, Math.min(1, load))
    const percent = Math.round(load * 100)

    const hasWork = activity.length > 0

    let colorClass = 'bg-white/20'
    let glowClass = ''
    if (currentProject) {
      if (percent >= 75) {
        colorClass = 'bg-red-500/70'
        glowClass = 'shadow-[0_0_6px_rgba(239,68,68,0.5)]'
      } else if (percent >= 45) {
        colorClass = 'bg-amber-500/70'
        glowClass = 'shadow-[0_0_6px_rgba(245,158,11,0.45)]'
      } else {
        colorClass = 'bg-emerald-500/60'
        glowClass = 'shadow-[0_0_6px_rgba(16,185,129,0.35)]'
      }
    }

    const title = !currentProject
      ? 'Select a project to enable system activity monitoring.'
      : hasWork
        ? `System Load: ${percent}% • ${activity.join(' • ')}`
        : `System Load: ${percent}% • Idle`

    return {
      percent,
      colorClass,
      glowClass,
      shouldPulse: hasWork,
      title
    }
  }, [
    currentProject,
    isProjectLoading,
    isZeusAnalyzing,
    activeDatasetJobId,
    activeDatasetJobProgress,
    activeDatasetJobCategory
  ])

  const handleDatasetsClick = useCallback(() => {
    reportAction('click-datasets')
    if (devMode) {
      setShowDatasets(true)
      return
    }
    setIsZeusAnalyzing(true)
  }, [devMode, reportAction])

  const handleAnalysisComplete = useCallback(() => {
    setIsZeusAnalyzing(false)
    setShowDatasets(true)
  }, [])

  // Allow the global Header GIS "FETCH" button to open the existing Sidebar dataset fetch dialog.
  useEffect(() => {
    registerGisActions({
      openFetchDatasets: () => {
        if (!currentProject) return
        handleDatasetsClick()
      }
    })
  }, [currentProject, handleDatasetsClick, registerGisActions])

  // Allow Map View to launch the same PIRL AI dialog used by the global sidebar.
  useEffect(() => {
    registerPirlActions({
      openPirlAi: () => {
        if (!currentProject) return
        setShowPirlAi(true)
      }
    })
  }, [currentProject, registerPirlActions])

  const handleNavClick = (onClick: (() => void) | undefined, tourAction?: TourAction) => {
    if (tourAction) {
      reportAction(tourAction)
    }
    onClick?.()
  }

  const navigationItems = [
    { icon: Target, label: 'Project Profile', onClick: () => currentProject && setShowProfile(true), description: 'Metadata & CRS', disabled: !currentProject, tourId: 'sidebar-profile' },
    { icon: Map, label: 'Map View', active: activeView === 'map', onClick: () => onViewChange('map'), description: 'Main Interface', tourId: 'sidebar-map' },
    { icon: LayoutDashboard, label: 'Project Management', active: activeView === 'project-management', onClick: () => currentProject && onViewChange('project-management'), description: 'Resource Planning', disabled: !currentProject, tourId: 'sidebar-project-management', tourAction: 'click-project-management' as TourAction },
    { icon: MonitorPlay, label: 'Digital Twin', active: activeView === 'digital-twin', onClick: () => currentProject && onViewChange('digital-twin'), description: 'Live Visualization', disabled: !currentProject, tourId: 'sidebar-digital-twin', tourAction: 'click-digital-twin' as TourAction },
    { icon: Layers, label: 'Datasets', onClick: () => currentProject && handleDatasetsClick(), description: 'Acquisition & Mgmt', disabled: !currentProject, tourId: 'sidebar-datasets' },
    { icon: ClipboardList, label: 'Changelog', onClick: () => currentProject && setShowAudit(true), description: 'Audit Timeline', disabled: !currentProject, tourId: 'sidebar-audit' },
    { icon: Brain, label: 'PIRL AI', description: 'Model Status', onClick: () => currentProject && setShowPirlAi(true), disabled: !currentProject, tourId: 'sidebar-pirl-ai', tourAction: 'click-pirl-ai' as TourAction },
    { icon: Settings, label: 'Settings', description: 'System Config', tourId: 'sidebar-settings' },
  ]

  return (
    <div
      className={cn(
        "relative flex flex-col bg-[#0a0a0a]/95 backdrop-blur-xl border-r border-white/10 transition-all duration-300 overflow-hidden shadow-[10px_0_30px_-10px_rgba(0,0,0,0.5)]",
        collapsed ? "w-20" : "w-80",
        className
      )}
      data-sidebar="main"
      data-tour="sidebar"
    >
      {/* Technical Background Grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff03_1px,transparent_1px),linear-gradient(to_bottom,#ffffff03_1px,transparent_1px)] bg-[size:20px_20px] pointer-events-none" />
      
      {/* Header */}
      <div className="relative flex items-center justify-between px-5 py-6 border-b border-white/10 bg-black/20 z-10 h-[88px]">
        {!collapsed ? (
          <div className="relative h-16 w-full max-w-[200px] transition-opacity duration-300">
            <Image
              src="/logo.png"
              alt="Artemis Global Research"
              fill
              className="object-contain object-left"
              priority
            />
          </div>
        ) : (
          <div className="w-full flex justify-center">
            <div className="relative h-10 w-10 transition-all duration-300 hover:scale-110 cursor-pointer">
              <Image
                src="/logo_torch.png"
                alt="Artemis"
                fill
                className="object-contain drop-shadow-[0_0_10px_rgba(255,255,255,0.2)]"
                title="Artemis"
              />
            </div>
          </div>
        )}
        
        {/* Futuristic Collapse Button */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute -right-3 top-10 p-1.5 bg-[#0a0a0a] border border-white/10 text-white/40 hover:text-primary hover:border-primary/50 hover:bg-primary/5 rounded-sm rotate-45 transition-all duration-300 shadow-lg z-50 group"
        >
          <div className="-rotate-45">
            {collapsed ? (
              <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
            ) : (
              <ChevronLeft className="w-3 h-3 group-hover:-translate-x-0.5 transition-transform" />
            )}
          </div>
        </button>
      </div>

      {/* Project Selector */}
      {!collapsed && (
        <div className="p-4 border-b border-white/5 bg-white/[0.01] relative z-10" data-tour="project-selector">
          <div className="flex items-center gap-2 mb-2 pl-1">
            <Terminal className="w-3 h-3 text-primary/50" />
            <span className="text-[10px] text-white/30 font-mono uppercase tracking-widest">Active Operation</span>
          </div>
          <ProjectSelector />
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1.5 overflow-y-auto relative z-10">
        {navigationItems.map((item, index) => {
          const Icon = item.icon
          return (
            <button
              key={index}
              className={cn(
                "group relative w-full flex items-center gap-3 px-3 py-2.5 rounded-sm transition-all duration-300 border border-transparent",
                item.active
                  ? "bg-primary/10 border-primary/20 text-white"
                  : item.disabled
                  ? "cursor-not-allowed opacity-50"
                  : "hover:bg-white/5 hover:border-white/10 text-muted-foreground hover:text-white"
              )}
              title={collapsed ? item.label : undefined}
              onClick={() => handleNavClick(item.onClick, item.tourAction)}
              disabled={item.disabled}
              data-tour={item.tourId}
            >
              {/* Active Indicator Line */}
              {item.active && (
                <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-primary shadow-[0_0_10px_rgba(var(--primary),0.8)]" />
              )}

              <div className={cn(
                "p-1.5 rounded-sm transition-colors duration-300",
                item.active ? "text-primary" : "text-white/40 group-hover:text-white/80"
              )}>
                <Icon className="w-5 h-5 flex-shrink-0" />
              </div>
              
              {!collapsed && (
                <div className="flex flex-col items-start text-left">
                  <span className={cn(
                    "text-sm font-medium tracking-wide transition-colors",
                    item.active ? "text-white" : "group-hover:text-white"
                  )}>{item.label}</span>
                  <span className="text-[10px] font-mono text-white/30 uppercase tracking-wider group-hover:text-white/50 transition-colors">
                    {item.description}
                  </span>
                </div>
              )}

              {/* Status Tag */}
              {(item as { tag?: string }).tag && !collapsed && (
                 <div className="ml-auto pl-2">
                    <div className="px-1.5 py-0.5 rounded-sm bg-red-500/10 border border-red-500/30 shadow-[0_0_5px_rgba(239,68,68,0.4)] animate-pulse">
                      <span className="text-[8px] font-bold font-mono text-red-500 uppercase tracking-wider whitespace-nowrap block transform scale-90">{(item as { tag?: string }).tag}</span>
                    </div>
                 </div>
              )}

              {/* Hover Glow Effect */}
              {!item.active && (
                <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
              )}
            </button>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-white/10 bg-black/20 relative z-10 backdrop-blur-sm">
        {!collapsed ? (
          <div className="space-y-3">
             {/* System Status */}
            <div className="flex items-center justify-between p-2 bg-black/40 border border-white/5 rounded-sm">
              <div className="flex items-center gap-2">
                <Cpu className="w-3 h-3 text-white/40" />
                <span className="text-[10px] text-white/60 font-mono uppercase tracking-wider">System Load</span>
              </div>
              <div className="w-16 h-1 bg-white/10 rounded-full overflow-hidden" title={systemLoad.title}>
                <div
                  className={cn(
                    'h-full transition-all duration-500',
                    systemLoad.colorClass,
                    systemLoad.glowClass,
                    systemLoad.shouldPulse && 'animate-pulse'
                  )}
                  style={{ width: `${systemLoad.percent}%` }}
                />
              </div>
            </div>

            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <div className="relative">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)] animate-pulse" />
                  <div className="absolute inset-0 w-2 h-2 rounded-full bg-emerald-500 opacity-50 animate-ping" />
                </div>
                <span className="text-white/60 font-mono uppercase tracking-widest text-[10px]">Online</span>
              </div>
              <div className="text-[10px] text-white/30 font-mono">
                AGRS-ZEUS <span className="text-white/50">v2.0</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex justify-center">
             <div className="relative group cursor-help">
                <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)] animate-pulse" />
                <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-2 py-1 bg-black border border-white/20 text-[10px] text-white opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none">
                    System Operational
                </div>
            </div>
          </div>
        )}
      </div>

      {!devMode && (
        <ZeusLoadingDialog open={isZeusAnalyzing} onComplete={handleAnalysisComplete} />
      )}
      <DatasetCoverageDialog
        open={showDatasets}
        onClose={() => setShowDatasets(false)}
        onRunInBackground={onDatasetRunInBackground}
      />
      <ProjectProfileDialog open={showProfile} onClose={() => setShowProfile(false)} />
      <ProjectAuditDialog open={showAudit} onClose={() => setShowAudit(false)} projectName={currentProject} />
      <PirlAiDialog open={showPirlAi} onClose={() => setShowPirlAi(false)} />
    </div>
  )
}
