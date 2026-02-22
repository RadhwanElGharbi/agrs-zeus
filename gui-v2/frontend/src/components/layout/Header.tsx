'use client'

import { useEffect, useRef, useState } from 'react'
import { Bell, User, Truck, Cpu, GitCommit, FileText, MapPin, Square, Brain, Layers, Download, Ruler, Pentagon, Mountain } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/context/AuthContext'
import { useProject } from '@/lib/context/ProjectContext'
import { useMapView } from '@/lib/context/MapViewContext'
import { OperatorEntriesDialog } from '@/components/Map/OperatorEntriesDialog'
import { SortiesDialog } from '@/components/Map/SortiesDialog'
import { UserProfileDialog } from '@/components/auth/UserProfileDialog'

interface HeaderProps {
  devMode: boolean
  isBackendOnline: boolean
  onDevModeChange: (value: boolean) => void
  activeView: 'map' | 'digital-twin' | 'project-management'
  onSupplierSearch?: () => void
  className?: string
}

interface TopbarNotification {
  id: string
  title: string
  message: string
  createdAt: number
  unread: boolean
  level: 'warning' | 'success'
}

function formatNotificationAge(createdAt: number): string {
  const elapsedMs = Date.now() - createdAt
  if (elapsedMs < 60_000) return 'just now'
  const minutes = Math.floor(elapsedMs / 60_000)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ago`
}

export function Header({ devMode, isBackendOnline, onDevModeChange, activeView, onSupplierSearch, className }: HeaderProps) {
  const { user } = useAuth()
  const { currentProject } = useProject()
  const { mapMode, operator, gis, pirl, routing, registerOperatorDialogActions } = useMapView()
  const [isCreateDropdownOpen, setIsCreateDropdownOpen] = useState(false)
  const [isDatasetsDropdownOpen, setIsDatasetsDropdownOpen] = useState(false)
  const [isManageDialogOpen, setIsManageDialogOpen] = useState(false)
  const [isSortiesDialogOpen, setIsSortiesDialogOpen] = useState(false)
  const [sortiesDialogInitialView, setSortiesDialogInitialView] = useState<'index' | 'create'>('index')
  const [isPirlDropdownOpen, setIsPirlDropdownOpen] = useState(false)
  const [isToolsDropdownOpen, setIsToolsDropdownOpen] = useState(false)
  const [isUserProfileOpen, setIsUserProfileOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const datasetsDropdownRef = useRef<HTMLDivElement>(null)
  const datasetsButtonRef = useRef<HTMLButtonElement>(null)
  const pirlDropdownRef = useRef<HTMLDivElement>(null)
  const pirlButtonRef = useRef<HTMLButtonElement>(null)
  const toolsDropdownRef = useRef<HTMLDivElement>(null)
  const toolsButtonRef = useRef<HTMLButtonElement>(null)
  const notificationsDropdownRef = useRef<HTMLDivElement>(null)
  const notificationsButtonRef = useRef<HTMLButtonElement>(null)
  const previousBackendOnlineRef = useRef(isBackendOnline)
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false)
  const [notifications, setNotifications] = useState<TopbarNotification[]>([])

  // Close dropdown if clicked outside
  useEffect(() => {
    if (!isCreateDropdownOpen) return
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsCreateDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isCreateDropdownOpen])

  // Close PIRL dropdown if clicked outside
  useEffect(() => {
    if (!isPirlDropdownOpen) return
    const handleClickOutside = (event: MouseEvent) => {
      if (
        pirlDropdownRef.current &&
        !pirlDropdownRef.current.contains(event.target as Node) &&
        pirlButtonRef.current &&
        !pirlButtonRef.current.contains(event.target as Node)
      ) {
        setIsPirlDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isPirlDropdownOpen])

  // Close Datasets dropdown if clicked outside
  useEffect(() => {
    if (!isDatasetsDropdownOpen) return
    const handleClickOutside = (event: MouseEvent) => {
      if (
        datasetsDropdownRef.current &&
        !datasetsDropdownRef.current.contains(event.target as Node) &&
        datasetsButtonRef.current &&
        !datasetsButtonRef.current.contains(event.target as Node)
      ) {
        setIsDatasetsDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isDatasetsDropdownOpen])

  // Close Tools dropdown if clicked outside
  useEffect(() => {
    if (!isToolsDropdownOpen) return
    const handleClickOutside = (event: MouseEvent) => {
      if (
        toolsDropdownRef.current &&
        !toolsDropdownRef.current.contains(event.target as Node) &&
        toolsButtonRef.current &&
        !toolsButtonRef.current.contains(event.target as Node)
      ) {
        setIsToolsDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isToolsDropdownOpen])

  // Close Notifications dropdown if clicked outside
  useEffect(() => {
    if (!isNotificationsOpen) return
    const handleClickOutside = (event: MouseEvent) => {
      if (
        notificationsDropdownRef.current &&
        !notificationsDropdownRef.current.contains(event.target as Node) &&
        notificationsButtonRef.current &&
        !notificationsButtonRef.current.contains(event.target as Node)
      ) {
        setIsNotificationsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isNotificationsOpen])

  // Mark notifications as read whenever the menu is visible.
  useEffect(() => {
    if (!isNotificationsOpen) return
    setNotifications((current) => current.map((item) => (
      item.unread ? { ...item, unread: false } : item
    )))
  }, [isNotificationsOpen])

  // Auto-close when leaving Operator context or entering geometry editing
  useEffect(() => {
    if (activeView !== 'map' || mapMode !== 'operator' || !currentProject || operator.geometryEditActive) {
      setIsCreateDropdownOpen(false)
    }
    if (activeView !== 'map' || mapMode !== 'gis' || !currentProject) {
      setIsDatasetsDropdownOpen(false)
      setIsToolsDropdownOpen(false)
    }
    if (activeView !== 'map' || mapMode !== 'operator' || !currentProject) {
      setIsManageDialogOpen(false)
    }
    if (activeView !== 'map' || mapMode !== 'operator' || !currentProject) {
      setIsSortiesDialogOpen(false)
    }
    if (activeView !== 'map' || mapMode !== 'routing' || !currentProject) {
      setIsPirlDropdownOpen(false)
    }
  }, [activeView, currentProject, mapMode, operator.geometryEditActive])

  // Allow MapViewer (right-click context menu) to open Operator managers.
  useEffect(() => {
    registerOperatorDialogActions({
      openOperatorEntriesIndex: () => {
        setIsCreateDropdownOpen(false)
        setIsSortiesDialogOpen(false)
        setIsManageDialogOpen(true)
      },
      openSortiesIndex: () => {
        setIsCreateDropdownOpen(false)
        setIsManageDialogOpen(false)
        setSortiesDialogInitialView('index')
        setIsSortiesDialogOpen(true)
      },
      openSortiesCreate: () => {
        setIsCreateDropdownOpen(false)
        setIsManageDialogOpen(false)
        setSortiesDialogInitialView('create')
        setIsSortiesDialogOpen(true)
      }
    })
  }, [registerOperatorDialogActions])

  // Push an alert when backend connectivity state changes.
  useEffect(() => {
    const wasOnline = previousBackendOnlineRef.current
    previousBackendOnlineRef.current = isBackendOnline

    if (wasOnline === isBackendOnline) return

    const createdAt = Date.now()
    const wentOffline = !isBackendOnline
    const statusNotification: TopbarNotification = {
      id: `backend-${wentOffline ? 'offline' : 'online'}-${createdAt}`,
      title: wentOffline ? 'ZEUS Backend Offline' : 'ZEUS Backend Online',
      message: wentOffline
        ? 'Connection to the backend was lost. Features may be unavailable until service is restored.'
        : 'Connection to the backend has been restored. Services are available again.',
      createdAt,
      unread: true,
      level: wentOffline ? 'warning' : 'success'
    }

    setNotifications((current) => ([statusNotification, ...current]).slice(0, 8))
    setIsNotificationsOpen(true)

    const timeout = setTimeout(() => {
      setIsNotificationsOpen(false)
    }, 5000)

    return () => clearTimeout(timeout)
  }, [isBackendOnline])

  // Show Dev Mode toggle only for admin role users
  const showDevMode = user?.role === 'admin' || user?.role === 'superadmin'
  const showDevOnlyActions = !!showDevMode && devMode
  const unreadNotificationCount = notifications.reduce((count, item) => count + (item.unread ? 1 : 0), 0)
  return (
    <>
      <header className={cn("relative h-14 border-b border-white/10 bg-[#0a0a0a]/95 backdrop-blur-xl px-6 flex items-center justify-between z-50 shadow-md", className)}>
        {/* Technical Background Grid */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff03_1px,transparent_1px),linear-gradient(to_bottom,#ffffff03_1px,transparent_1px)] bg-[size:20px_20px] pointer-events-none" />

      {/* View-Specific Action Buttons */}
      <div className="flex-1 flex items-center gap-2 relative z-10">
        {activeView === 'project-management' && (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={onSupplierSearch}
              className="h-8 px-3 gap-2 text-white/70 hover:text-white hover:bg-white/10 border border-white/10 hover:border-primary/30 transition-all"
              data-tour="supplier-btn"
            >
              <Truck className="w-3.5 h-3.5" />
              <span className="text-xs font-medium">Suppliers</span>
            </Button>
            
            {showDevOnlyActions && (
              <>
                <Button 
                  variant="ghost" 
                  size="sm"
                  disabled
                  className="h-8 px-3 gap-2 text-white/40 border border-white/5 bg-white/[0.02] cursor-not-allowed relative overflow-hidden group"
                >
                  <GitCommit className="w-3.5 h-3.5" />
                  <span className="text-xs font-medium">Phases</span>
                  <div className="absolute -right-3 -top-3 bg-amber-500/20 text-amber-500 text-[8px] font-bold px-4 py-3 rotate-45 border border-amber-500/20 shadow-sm translate-x-1 translate-y-1">
                    DEV
                  </div>
                </Button>

                <Button 
                  variant="ghost" 
                  size="sm"
                  disabled
                  className="h-8 px-3 gap-2 text-white/40 border border-white/5 bg-white/[0.02] cursor-not-allowed relative overflow-hidden group"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span className="text-xs font-medium">RFP Manager</span>
                  <div className="absolute -right-3 -top-3 bg-amber-500/20 text-amber-500 text-[8px] font-bold px-4 py-3 rotate-45 border border-amber-500/20 shadow-sm translate-x-1 translate-y-1">
                    DEV
                  </div>
                </Button>
              </>
            )}
          </>
        )}

        {activeView === 'map' && currentProject && mapMode === 'operator' && (
          <div className="flex items-center gap-2">
            <div className="text-[10px] font-mono text-white/40 uppercase tracking-widest">Operator</div>
            <div className="h-5 w-px bg-white/10 mx-1" />

            <div className="relative">
              <Button
                ref={buttonRef}
                variant="ghost"
                size="sm"
                onClick={() => setIsCreateDropdownOpen((prev) => !prev)}
                disabled={operator.geometryEditActive}
                className={cn(
                  'h-9 px-6 gap-2 text-white/90 hover:text-white hover:bg-white/10 border border-white/20 hover:border-amber-500/50 transition-all rounded-none bg-white/5',
                  isCreateDropdownOpen && 'bg-amber-500/20 border-amber-500/50 text-white'
                )}
                title="AOI/POI tools"
              >
                <span className="text-xs font-bold tracking-widest">AOI/POI</span>
              </Button>

              {isCreateDropdownOpen && (
                <div
                  ref={dropdownRef}
                  className="absolute top-full left-0 mt-2 w-52 bg-black border border-white/10 rounded-sm shadow-xl overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => {
                      operator.startTool('create_poi')
                      setIsCreateDropdownOpen(false)
                    }}
                    disabled={operator.geometryEditActive}
                    className="flex items-center gap-2 w-full px-3 py-2 text-left text-xs font-medium text-white/70 hover:text-white hover:bg-amber-500/10 border border-transparent border-b-red-500/30 transition-all disabled:opacity-50 disabled:pointer-events-none"
                  >
                    <MapPin className="w-3.5 h-3.5" />
                    Point of Interest
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      operator.startTool('create_aoi')
                      setIsCreateDropdownOpen(false)
                    }}
                    disabled={operator.geometryEditActive}
                    className="flex items-center gap-2 w-full px-3 py-2 text-left text-xs font-medium text-white/70 hover:text-white hover:bg-amber-500/10 border border-transparent transition-all disabled:opacity-50 disabled:pointer-events-none"
                  >
                    <Square className="w-3.5 h-3.5" />
                    Area of Interest
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsCreateDropdownOpen(false)
                      setIsManageDialogOpen(true)
                    }}
                    disabled={operator.geometryEditActive}
                    className="flex items-center gap-2 w-full px-3 py-2 text-left text-xs font-medium text-white/60 hover:text-white hover:bg-amber-500/10 border-t border-white/10 transition-all disabled:opacity-50 disabled:pointer-events-none pl-10"
                    title="Open Operator Entry Index"
                  >
                    Manage AOI/POIs
                  </button>
                </div>
              )}
            </div>

            <Button
              variant="ghost"
              size="sm"
              disabled={operator.geometryEditActive}
              onClick={() => {
                setIsCreateDropdownOpen(false)
                setIsManageDialogOpen(false)
                setSortiesDialogInitialView('index')
                setIsSortiesDialogOpen(true)
              }}
              className={cn(
                'h-9 px-6 text-white/70 hover:text-white border border-white/20 hover:border-amber-500/40 transition-all rounded-none bg-transparent hover:bg-white/5 disabled:opacity-40 disabled:pointer-events-none',
                isSortiesDialogOpen && 'bg-amber-500/20 border-amber-500/50 text-white'
              )}
              title="Create and manage project sorties"
            >
              <span className="text-xs font-bold tracking-widest">SORTIES</span>
            </Button>

            {(operator.tool !== 'none' || operator.geometryEditActive) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => operator.cancel()}
                className="h-8 px-3 text-white/70 hover:text-white hover:bg-red-500/10 border border-white/10 hover:border-red-500/40 transition-all"
                title="Cancel Operator drawing"
              >
                <span className="text-xs font-medium">Cancel</span>
              </Button>
            )}
          </div>
        )}

        {activeView === 'map' && currentProject && mapMode === 'gis' && (
          <div className="flex items-center gap-2">
            <div className="text-[10px] font-mono text-white/40 uppercase tracking-widest">GIS</div>
            <div className="h-5 w-px bg-white/10 mx-1" />

            <div className="relative">
              <Button
                ref={datasetsButtonRef}
                variant="ghost"
                size="sm"
                onClick={() => setIsDatasetsDropdownOpen((prev) => !prev)}
                className={cn(
                  'h-9 px-6 gap-2 text-white/90 hover:text-white hover:bg-white/10 border border-white/20 hover:border-primary/50 transition-all rounded-none bg-white/5',
                  isDatasetsDropdownOpen && 'bg-primary/20 border-primary/50 text-white'
                )}
                title="Dataset tools"
              >
                <span className="text-xs font-bold tracking-widest">DATASETS</span>
              </Button>

              {isDatasetsDropdownOpen && (
                <div
                  ref={datasetsDropdownRef}
                  className="absolute top-full left-0 mt-2 w-64 bg-black border border-white/10 rounded-sm shadow-xl overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setIsDatasetsDropdownOpen(false)
                      gis.openFetchDatasets()
                    }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-left text-xs font-medium text-white/70 hover:text-white hover:bg-primary/10 border border-transparent border-b border-white/10 transition-all"
                    title="Fetch datasets (opens the Datasets dialog)"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Fetch
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsDatasetsDropdownOpen(false)
                      gis.openDatasetIndex()
                    }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-left text-xs font-medium text-white/70 hover:text-white hover:bg-primary/10 border border-transparent transition-all"
                    title="Manage datasets (opens Project Dataset Index)"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    Manage
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsDatasetsDropdownOpen(false)
                      gis.openDatasetDigitalTwin()
                    }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-left text-xs font-medium text-white/70 hover:text-white hover:bg-primary/10 border border-transparent border-t border-white/10 transition-all"
                    title="Dataset Digital Twin: Visual layer stack for infrastructure planning datasets"
                  >
                    <Cpu className="w-3.5 h-3.5 text-primary/80" />
                    Digital Twin
                  </button>
                </div>
              )}
            </div>

            <div className="relative">
              <Button
                ref={toolsButtonRef}
                variant="ghost"
                size="sm"
                onClick={() => setIsToolsDropdownOpen((prev) => !prev)}
                className={cn(
                  'h-9 px-6 gap-2 text-white/90 hover:text-white hover:bg-white/10 border border-white/20 hover:border-emerald-500/50 transition-all rounded-none bg-white/5',
                  isToolsDropdownOpen && 'bg-emerald-500/20 border-emerald-500/50 text-white'
                )}
                title="Geoprocessing tools"
              >
                <span className="text-xs font-bold tracking-widest">TOOLS</span>
              </Button>

              {isToolsDropdownOpen && (
                <div
                  ref={toolsDropdownRef}
                  className="absolute top-full left-0 mt-2 w-56 bg-black border border-white/10 rounded-sm shadow-xl overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setIsToolsDropdownOpen(false)
                      gis.openMeasureTool('distance')
                    }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-left text-xs font-medium text-white/70 hover:text-white hover:bg-emerald-500/10 border border-transparent border-b border-white/10 transition-all"
                    title="Measure distance between points on the map"
                  >
                    <Ruler className="w-3.5 h-3.5" />
                    Measure Distance
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsToolsDropdownOpen(false)
                      gis.openMeasureTool('area')
                    }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-left text-xs font-medium text-white/70 hover:text-white hover:bg-emerald-500/10 border border-transparent border-b border-white/10 transition-all"
                    title="Measure area of a polygon on the map"
                  >
                    <Pentagon className="w-3.5 h-3.5" />
                    Measure Area
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsToolsDropdownOpen(false)
                      gis.openMeasureTool('elevation')
                    }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-left text-xs font-medium text-white/70 hover:text-white hover:bg-emerald-500/10 border border-transparent transition-all"
                    title="Measure elevation profile along a line (requires DEM)"
                  >
                    <Mountain className="w-3.5 h-3.5" />
                    Elevation Profile
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {activeView === 'map' && currentProject && mapMode === 'routing' && (
          <div className="flex items-center gap-2">
            <div className="text-[10px] font-mono text-white/40 uppercase tracking-widest">Routing</div>
            <div className="h-5 w-px bg-white/10 mx-1" />

            <div className="relative">
              <Button
                ref={pirlButtonRef}
                variant="ghost"
                size="sm"
                onClick={() => setIsPirlDropdownOpen((prev) => !prev)}
                className={cn(
                  'h-9 px-6 gap-2 text-white/90 hover:text-white hover:bg-white/10 border border-white/20 hover:border-purple-500/50 transition-all rounded-none bg-white/5',
                  isPirlDropdownOpen && 'bg-purple-500/20 border-purple-500/50 text-white'
                )}
                title="PIRL tools"
              >
                <Brain className="w-3.5 h-3.5 text-purple-300" />
                <span className="text-xs font-bold tracking-widest">PIRL</span>
              </Button>

              {isPirlDropdownOpen && (
                <div
                  ref={pirlDropdownRef}
                  className="absolute top-full left-0 mt-2 w-44 bg-black border border-white/10 rounded-sm shadow-xl overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setIsPirlDropdownOpen(false)
                      pirl.openPirlAi()
                    }}
                    className="flex items-center justify-between w-full px-3 py-2 text-left text-xs font-medium text-white/70 hover:text-white hover:bg-purple-500/10 border border-transparent transition-all"
                  >
                    <span>LAUNCH</span>
                    <span className="text-[10px] text-purple-300/70 font-mono">AI</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsPirlDropdownOpen(false)
                      routing.openPirlManager()
                    }}
                    className="flex items-center justify-between w-full px-3 py-2 text-left text-xs font-medium text-white/70 hover:text-white hover:bg-purple-500/10 border border-transparent border-t border-white/10 transition-all"
                  >
                    <span>MANAGER</span>
                    <span className="text-[10px] text-purple-300/70 font-mono">Routes</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {activeView === 'digital-twin' && (
          <>
            <Button 
              variant="ghost" 
              size="sm"
              className="h-8 px-3 gap-2 text-white/70 hover:text-white hover:bg-white/10 border border-white/10 hover:border-primary/30 transition-all"
            >
              <Cpu className="w-3.5 h-3.5" />
              <span className="text-xs font-medium">Simulation</span>
            </Button>
          </>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-4 relative z-10">
        {/* Dev Mode Toggle - Hidden for yc-demo users */}
        {showDevMode && (
          <>
            <div className="flex items-center gap-3 px-3 py-1.5 bg-white/5 border border-white/5 rounded-full">
              <span className="hidden sm:inline text-[10px] uppercase tracking-widest text-white/40 font-mono">Dev Mode</span>
              <button
                type="button"
                role="switch"
                aria-checked={devMode}
                onClick={() => onDevModeChange(!devMode)}
                className={cn(
                  'relative inline-flex h-5 w-9 items-center rounded-full transition-all focus:outline-none',
                  devMode ? 'bg-primary shadow-[0_0_10px_rgba(var(--primary),0.5)]' : 'bg-white/10'
                )}
              >
                <span
                  className={cn(
                    'inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform',
                    devMode ? 'translate-x-5' : 'translate-x-1'
                  )}
                />
              </button>
              <span className={cn(
                "text-[10px] font-mono font-bold uppercase w-6",
                devMode ? "text-primary" : "text-white/20"
              )}>{devMode ? 'ON' : 'OFF'}</span>
            </div>

            <div className="h-6 w-px bg-white/10 mx-1" />
          </>
        )}

        <div className="relative">
          <Button
            ref={notificationsButtonRef}
            variant="ghost"
            size="icon"
            className="text-white/60 hover:text-white hover:bg-white/10 relative"
            onClick={() => setIsNotificationsOpen((prev) => !prev)}
            title="Notifications"
          >
            <Bell className="w-4 h-4" />
            {unreadNotificationCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-mono leading-4 text-center border border-black">
                {unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}
              </span>
            )}
          </Button>

          {isNotificationsOpen && (
            <div
              ref={notificationsDropdownRef}
              className="absolute right-0 top-full mt-2 w-80 bg-black/95 border border-white/10 rounded-sm shadow-xl overflow-hidden"
            >
              <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 bg-white/[0.03]">
                <span className="text-[10px] uppercase tracking-widest text-white/50 font-mono">Notifications</span>
                {notifications.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setNotifications([])}
                    className="text-[10px] text-white/40 hover:text-white transition-colors uppercase tracking-wider font-mono"
                  >
                    Clear
                  </button>
                )}
              </div>

              {notifications.length === 0 ? (
                <div className="px-3 py-4 text-xs text-white/40">No notifications.</div>
              ) : (
                <div className="max-h-72 overflow-y-auto">
                  {notifications.map((item) => (
                    <div
                      key={item.id}
                      className={cn(
                        'px-3 py-2 border-b border-white/5 last:border-b-0',
                        item.level === 'warning' ? 'bg-red-500/5' : 'bg-white/[0.01]'
                      )}
                    >
                      <div className="flex items-start gap-2">
                        <div
                          className={cn(
                            'mt-1.5 h-2 w-2 rounded-full flex-shrink-0',
                            item.level === 'warning'
                              ? 'bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.75)]'
                              : 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.75)]'
                          )}
                        />
                        <div className="min-w-0">
                          <div className="text-[11px] font-semibold text-white/90">{item.title}</div>
                          <div className="text-[10px] text-white/60 leading-snug mt-0.5">{item.message}</div>
                          <div className="text-[9px] text-white/35 uppercase tracking-wider font-mono mt-1">
                            {formatNotificationAge(item.createdAt)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="text-white/60 hover:text-white hover:bg-white/10"
          onClick={() => setIsUserProfileOpen(true)}
          title="User profile"
        >
          <User className="w-4 h-4" />
        </Button>
      </div>
      </header>

      <OperatorEntriesDialog
        open={isManageDialogOpen}
        onClose={() => setIsManageDialogOpen(false)}
        projectName={currentProject}
      />

      <SortiesDialog
        open={isSortiesDialogOpen}
        onClose={() => setIsSortiesDialogOpen(false)}
        projectName={currentProject}
        initialView={sortiesDialogInitialView}
      />

      <UserProfileDialog open={isUserProfileOpen} onClose={() => setIsUserProfileOpen(false)} />
    </>
  )
}
