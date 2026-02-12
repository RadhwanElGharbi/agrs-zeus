'use client'

import { useEffect, useRef, useState } from 'react'
import { Bell, User, Truck, Cpu, GitCommit, FileText, MapPin, Square, Brain, Layers, Download } from 'lucide-react'
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
  onDevModeChange: (value: boolean) => void
  activeView: 'map' | 'digital-twin' | 'project-management'
  onSupplierSearch?: () => void
}

export function Header({ devMode, onDevModeChange, activeView, onSupplierSearch }: HeaderProps) {
  const { user } = useAuth()
  const { currentProject } = useProject()
  const { mapMode, operator, gis, pirl, routing, registerOperatorDialogActions } = useMapView()
  const [isCreateDropdownOpen, setIsCreateDropdownOpen] = useState(false)
  const [isDatasetsDropdownOpen, setIsDatasetsDropdownOpen] = useState(false)
  const [isManageDialogOpen, setIsManageDialogOpen] = useState(false)
  const [isSortiesDialogOpen, setIsSortiesDialogOpen] = useState(false)
  const [sortiesDialogInitialView, setSortiesDialogInitialView] = useState<'index' | 'create'>('index')
  const [isPirlDropdownOpen, setIsPirlDropdownOpen] = useState(false)
  const [isUserProfileOpen, setIsUserProfileOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const datasetsDropdownRef = useRef<HTMLDivElement>(null)
  const datasetsButtonRef = useRef<HTMLButtonElement>(null)
  const pirlDropdownRef = useRef<HTMLDivElement>(null)
  const pirlButtonRef = useRef<HTMLButtonElement>(null)

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

  // Auto-close when leaving Operator context or entering geometry editing
  useEffect(() => {
    if (activeView !== 'map' || mapMode !== 'operator' || !currentProject || operator.geometryEditActive) {
      setIsCreateDropdownOpen(false)
    }
    if (activeView !== 'map' || mapMode !== 'gis' || !currentProject) {
      setIsDatasetsDropdownOpen(false)
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

  // Show Dev Mode toggle only for admin role users
  const showDevMode = user?.role === 'admin' || user?.role === 'superadmin'
  const showDevOnlyActions = !!showDevMode && devMode
  return (
    <>
      <header className="relative h-14 border-b border-white/10 bg-[#0a0a0a]/95 backdrop-blur-xl px-6 flex items-center justify-between z-50 shadow-md">
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
                    title="Experimental: Dataset Digital Twin (stacked layer model)"
                  >
                    <Cpu className="w-3.5 h-3.5 text-primary/80" />
                    Digital Twin
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

        <Button variant="ghost" size="icon" className="text-white/60 hover:text-white hover:bg-white/10">
          <Bell className="w-4 h-4" />
        </Button>
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
