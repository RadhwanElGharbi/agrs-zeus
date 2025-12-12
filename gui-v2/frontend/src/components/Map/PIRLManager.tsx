'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Route, Eye, EyeOff, Loader2, Minimize2, Expand, Brain, MapPin, Trash2, GitCompare, Check, FolderOpen, Table, DollarSign } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  listAgenticRoutes,
  getAgenticSegmentsGeometry,
  type AgenticRouteListItem
} from '@/lib/api/agenticClient'
import { CompareRoutesDialog } from './CompareRoutesDialog'
import { CostMatrixDialog } from './CostMatrixDialog'
import { useProject } from '@/lib/context/ProjectContext'

interface LoadedRoute {
  routeId: string
  visible: boolean
  segmentCount: number
}

interface ContextMenuState {
  x: number
  y: number
  routeId: string
}

interface PIRLManagerProps {
  loadedRoutes: LoadedRoute[]
  onLoadRoute: (routeId: string, geojson: GeoJSON.FeatureCollection) => void
  onToggleRouteVisibility: (routeId: string) => void
  onRemoveRoute: (routeId: string) => void
  onExpandDialog: () => void
  onOpenTable: (routeId: string) => void
  // Optional external control for collapsed state
  collapsed?: boolean
  onCollapsedChange?: (collapsed: boolean) => void
}

export function PIRLManager({
  loadedRoutes,
  onLoadRoute,
  onToggleRouteVisibility,
  onRemoveRoute,
  onExpandDialog,
  onOpenTable,
  collapsed: externalCollapsed,
  onCollapsedChange
}: PIRLManagerProps) {
  const { currentProject } = useProject()
  const [internalCollapsed, setInternalCollapsed] = useState(true) // Start collapsed by default
  const [routes, setRoutes] = useState<AgenticRouteListItem[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingRouteId, setLoadingRouteId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Compare mode state
  const [compareMode, setCompareMode] = useState(false)
  const [selectedForCompare, setSelectedForCompare] = useState<string[]>([])
  const [showCompareDialog, setShowCompareDialog] = useState(false)

  // Cost matrix dialog state
  const [showCostMatrixDialog, setShowCostMatrixDialog] = useState(false)
  const [costMatrixRouteId, setCostMatrixRouteId] = useState<string | null>(null)

  // Context menu state
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)

  // Use external control if provided, otherwise use internal state
  const isCollapsed = externalCollapsed !== undefined ? externalCollapsed : internalCollapsed
  const setIsCollapsed = (value: boolean) => {
    if (onCollapsedChange) {
      onCollapsedChange(value)
    }
    setInternalCollapsed(value)
  }

  // Fetch routes when expanded and project is loaded
  useEffect(() => {
    if (!isCollapsed && currentProject) {
      setLoading(true)
      setError(null)
      listAgenticRoutes(currentProject)
        .then(setRoutes)
        .catch(err => setError(err.message))
        .finally(() => setLoading(false))
    } else if (!currentProject) {
      setRoutes([])
    }
  }, [isCollapsed, currentProject])

  const handleLoadRoute = useCallback(async (routeId: string) => {
    // Check if already loaded
    if (loadedRoutes.some(r => r.routeId === routeId)) {
      return
    }

    if (!currentProject) {
      setError('No project loaded')
      return
    }

    setLoadingRouteId(routeId)
    setError(null)
    try {
      const geojson = await getAgenticSegmentsGeometry(routeId, currentProject)
      if (geojson) {
        onLoadRoute(routeId, geojson)
      } else {
        setError(`Failed to load geometry for ${routeId}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load route')
    } finally {
      setLoadingRouteId(null)
    }
  }, [loadedRoutes, onLoadRoute, currentProject])

  const toggleCompareSelection = (routeId: string) => {
    setSelectedForCompare(prev => {
      if (prev.includes(routeId)) {
        return prev.filter(id => id !== routeId)
      }
      return [...prev, routeId]
    })
  }

  const handleCompare = () => {
    if (selectedForCompare.length >= 2) {
      setShowCompareDialog(true)
    }
  }

  const exitCompareMode = () => {
    setCompareMode(false)
    setSelectedForCompare([])
  }

  // Context menu handlers
  const handleContextMenu = useCallback((e: React.MouseEvent, routeId: string) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      routeId
    })
  }, [])

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(null)
  }, [])

  const handleInspectLayer = useCallback(() => {
    if (contextMenu) {
      onOpenTable(contextMenu.routeId)
      setContextMenu(null)
    }
  }, [contextMenu, onOpenTable])

  const handleShowCostMatrix = useCallback(() => {
    if (contextMenu) {
      setCostMatrixRouteId(contextMenu.routeId)
      setShowCostMatrixDialog(true)
      setContextMenu(null)
    }
  }, [contextMenu])

  // Close context menu on outside click
  useEffect(() => {
    if (contextMenu) {
      const handleClick = () => setContextMenu(null)
      window.addEventListener('click', handleClick)
      return () => window.removeEventListener('click', handleClick)
    }
  }, [contextMenu])

  // Format route name by removing project prefix and underscores
  const formatRouteName = (routeId: string) => {
    let name = routeId
    // Remove project prefix if present
    if (currentProject) {
      const prefix = `${currentProject}_`
      if (name.startsWith(prefix)) {
        name = name.substring(prefix.length)
      }
    }
    // Replace underscores with spaces
    return name.replace(/_/g, ' ')
  }

  // Collapsed state - show button (greyed out if no project)
  if (isCollapsed) {
    const isDisabled = !currentProject
    return (
      <div className={cn(
        "relative bg-black/80 backdrop-blur-md border rounded-sm p-2 transition-colors",
        isDisabled
          ? "border-white/10 opacity-50 cursor-not-allowed"
          : "border-purple-500/20 shadow-[0_0_20px_-5px_rgba(147,51,234,0.3)] group hover:border-purple-500/50"
      )}>
        <button
          onClick={() => !isDisabled && setIsCollapsed(false)}
          disabled={isDisabled}
          className={cn(
            "flex items-center justify-center p-1 rounded-sm transition-colors",
            isDisabled
              ? "text-white/30 cursor-not-allowed"
              : "hover:bg-purple-500/10 text-purple-400/70 hover:text-purple-400"
          )}
          title={isDisabled ? "Load a project to access PIRL Routes" : "Expand PIRL Routes Manager"}
        >
          <Brain className={cn("w-5 h-5", !isDisabled && "group-hover:animate-pulse")} />
        </button>
        {/* Badge showing loaded routes count */}
        {loadedRoutes.length > 0 && (
          <div className="absolute -top-1 -right-1 w-4 h-4 bg-purple-500 rounded-full flex items-center justify-center shadow-[0_0_8px_rgba(147,51,234,0.8)]">
            <span className="text-[9px] font-bold text-white">{loadedRoutes.length}</span>
          </div>
        )}
      </div>
    )
  }

  // Expanded state - full panel
  return (
    <>
      <div className="w-[380px] max-h-[50vh] overflow-hidden font-mono">
        <div className="bg-[#0a0a0a]/95 backdrop-blur-xl border border-purple-500/20 rounded-sm shadow-[0_0_30px_-10px_rgba(147,51,234,0.3)] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-3 py-3 border-b border-purple-500/20 bg-purple-900/10">
          <div className="flex items-center gap-2">
            <div className="p-1 bg-purple-500/20 rounded-sm">
              <Brain className="w-3.5 h-3.5 text-purple-400" />
            </div>
            <span className="text-xs font-bold text-white uppercase tracking-wider">PIRL Routes</span>
          </div>
          <div className="flex items-center gap-1">
            {loading && (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-400" />
            )}
            <button
              onClick={onExpandDialog}
              className="p-1 hover:bg-purple-500/20 rounded-sm transition-colors text-white/50 hover:text-purple-400"
              title="Open Full Route Dialog"
            >
              <Expand className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setIsCollapsed(true)}
              className="p-1 hover:bg-white/10 rounded-sm transition-colors text-white/50 hover:text-white"
              title="Collapse PIRL Manager"
            >
              <Minimize2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Compare Mode Banner */}
        {compareMode && (
          <div className="px-3 py-2 bg-blue-500/10 border-b border-blue-500/20 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <GitCompare className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-[10px] text-blue-400">
                Select {selectedForCompare.length < 2 ? `${2 - selectedForCompare.length} more` : selectedForCompare.length} routes to compare
              </span>
            </div>
            <div className="flex items-center gap-1">
              {selectedForCompare.length >= 2 && (
                <button
                  onClick={handleCompare}
                  className="px-2 py-1 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 rounded text-[9px] font-bold text-blue-300 transition-colors"
                >
                  Compare ({selectedForCompare.length})
                </button>
              )}
              <button
                onClick={exitCompareMode}
                className="px-2 py-1 hover:bg-white/10 rounded text-[9px] text-white/50 hover:text-white transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="px-3 py-2 bg-red-500/10 border-b border-red-500/20">
            <p className="text-[10px] text-red-400">{error}</p>
          </div>
        )}

        {/* No Project Message */}
        {!currentProject && (
          <div className="flex flex-col items-center justify-center py-8 px-4 text-white/30">
            <FolderOpen className="w-8 h-8 mb-3 opacity-50" />
            <p className="text-[11px] font-medium text-center">No Project Loaded</p>
            <p className="text-[10px] text-center mt-1 text-white/20">
              Load a project to view and manage PIRL routes
            </p>
          </div>
        )}

        {/* Loaded Routes Section */}
        {loadedRoutes.length > 0 && (
          <div className="border-b border-purple-500/10">
            <div className="px-3 py-1.5 bg-purple-900/5">
              <span className="text-[9px] font-bold text-purple-400/70 uppercase tracking-wider">Active Routes</span>
            </div>
            <div className="p-1 space-y-0.5 max-h-[150px] overflow-y-auto">
              {loadedRoutes.map((route) => {
                const isSelectedForCompare = selectedForCompare.includes(route.routeId)
                return (
                  <div
                    key={route.routeId}
                    onContextMenu={(e) => handleContextMenu(e, route.routeId)}
                    className={cn(
                      "group flex items-center gap-2 p-2 rounded-sm transition-all duration-200 cursor-context-menu",
                      compareMode && isSelectedForCompare
                        ? "bg-blue-500/20 border border-blue-500/40"
                        : "bg-purple-500/5 border border-purple-500/20 hover:border-purple-500/40"
                    )}
                  >
                    {/* Compare Checkbox */}
                    {compareMode && (
                      <button
                        onClick={() => toggleCompareSelection(route.routeId)}
                        className={cn(
                          "w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors",
                          isSelectedForCompare
                            ? "bg-blue-500 border-blue-500 text-white"
                            : "border-white/30 hover:border-blue-400"
                        )}
                      >
                        {isSelectedForCompare && <Check className="w-3 h-3" />}
                      </button>
                    )}

                    {/* Visibility Toggle */}
                    {!compareMode && (
                      <button
                        onClick={() => onToggleRouteVisibility(route.routeId)}
                        className={cn(
                          "p-1 rounded-sm transition-colors shrink-0",
                          route.visible
                            ? "text-purple-400 bg-purple-400/20 hover:bg-purple-400/30"
                            : "text-white/20 hover:text-white/40 hover:bg-white/5"
                        )}
                      >
                        {route.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                      </button>
                    )}

                    {/* Route Info */}
                    <div
                      className={cn("flex-1 min-w-0", compareMode && "cursor-pointer")}
                      onClick={compareMode ? () => toggleCompareSelection(route.routeId) : undefined}
                    >
                      <p className="text-[10px] font-medium text-white truncate">
                        {formatRouteName(route.routeId)}
                      </p>
                      <p className="text-[9px] text-purple-400/60 font-mono">
                        {route.segmentCount} segments
                      </p>
                    </div>

                    {/* Remove Button */}
                    {!compareMode && (
                      <button
                        onClick={() => onRemoveRoute(route.routeId)}
                        className="p-1 opacity-0 group-hover:opacity-100 hover:bg-red-500/20 rounded-sm transition-all text-white/30 hover:text-red-400"
                        title="Remove route from map"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}

                    {/* Status Indicator */}
                    {!compareMode && (
                      <div className={cn(
                        "w-1.5 h-1.5 rounded-full shrink-0",
                        route.visible ? "bg-purple-400 shadow-[0_0_6px_rgba(147,51,234,0.8)]" : "bg-white/10"
                      )} />
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Available Routes Section - only show when project is loaded */}
        {currentProject && (
        <div className="flex-1 overflow-hidden flex flex-col">
          <div className="px-3 py-1.5 bg-white/[0.02]">
            <span className="text-[9px] font-bold text-white/40 uppercase tracking-wider">Available Routes</span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-purple-400" />
            </div>
          ) : routes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-white/30">
              <MapPin className="w-6 h-6 mb-2 opacity-50" />
              <p className="text-[10px]">No routes available</p>
            </div>
          ) : (
            <div className="p-1 space-y-0.5 max-h-[200px] overflow-y-auto">
              {routes.map((route) => {
                const isLoaded = loadedRoutes.some(r => r.routeId === route.route_id)
                const isLoading = loadingRouteId === route.route_id
                const isSelectedForCompare = selectedForCompare.includes(route.route_id)

                return (
                  <div
                    key={route.route_id}
                    className={cn(
                      "w-full flex items-center gap-2 p-2 rounded-sm transition-all duration-200 text-left",
                      compareMode && isSelectedForCompare
                        ? "bg-blue-500/20 border border-blue-500/40"
                        : route.is_real_route
                          ? "bg-yellow-500/10 border border-yellow-500/30 hover:bg-yellow-500/20 hover:border-yellow-500/40"
                          : isLoaded
                            ? "bg-purple-500/10 border border-purple-500/30"
                            : "bg-white/[0.02] border border-transparent hover:bg-purple-900/20 hover:border-purple-500/20",
                      isLoading && "opacity-70"
                    )}
                  >
                    {/* Compare Checkbox */}
                    {compareMode && (
                      <button
                        onClick={() => toggleCompareSelection(route.route_id)}
                        className={cn(
                          "w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors",
                          isSelectedForCompare
                            ? "bg-blue-500 border-blue-500 text-white"
                            : "border-white/30 hover:border-blue-400"
                        )}
                      >
                        {isSelectedForCompare && <Check className="w-3 h-3" />}
                      </button>
                    )}

                    {/* Route Icon / Loading */}
                    {!compareMode && (
                      isLoading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-400 shrink-0" />
                      ) : (
                        <Route className={cn(
                          "w-3.5 h-3.5 shrink-0",
                          route.is_real_route ? "text-yellow-400" : isLoaded ? "text-purple-400" : "text-white/30"
                        )} />
                      )
                    )}

                    {/* Route Info - Clickable */}
                    <button
                      onClick={() => {
                        if (compareMode) {
                          toggleCompareSelection(route.route_id)
                        } else if (!isLoaded && !isLoading) {
                          handleLoadRoute(route.route_id)
                        }
                      }}
                      disabled={!compareMode && (isLoaded || isLoading)}
                      className="flex-1 min-w-0 text-left"
                    >
                      <p className={cn(
                        "text-[10px] font-medium truncate",
                        route.is_real_route ? "text-yellow-300" : isLoaded ? "text-purple-300" : "text-white/70"
                      )}>
                        {formatRouteName(route.route_id)}
                      </p>
                      <p className={cn(
                        "text-[9px] font-mono",
                        route.is_real_route ? "text-yellow-400/60" : "text-white/30"
                      )}>
                        {route.is_real_route ? "Real Infrastructure" : `${route.segment_count ?? '?'} segments`}
                      </p>
                    </button>

                    {/* Real Route Badge */}
                    {!compareMode && route.is_real_route && (
                      <span className="text-[8px] font-bold text-yellow-400 uppercase px-1.5 py-0.5 bg-yellow-500/20 rounded-sm border border-yellow-500/30">
                        Real
                      </span>
                    )}

                    {/* Loaded Badge */}
                    {!compareMode && isLoaded && !route.is_real_route && (
                      <span className="text-[8px] font-bold text-purple-400 uppercase px-1.5 py-0.5 bg-purple-500/20 rounded-sm">
                        Loaded
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
        )}

        {/* Footer with Compare Button - only show when project is loaded */}
        {currentProject && (
        <div className="px-3 py-2 border-t border-purple-500/10 bg-purple-900/5 flex items-center justify-between">
          <p className="text-[9px] text-purple-400/50">
            {compareMode ? 'Select routes to compare' : 'Click to load route onto map'}
          </p>
          {!compareMode && routes.length >= 2 && (
            <button
              onClick={() => setCompareMode(true)}
              className="flex items-center gap-1.5 px-2 py-1 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 hover:border-blue-500/30 rounded text-[9px] font-medium text-blue-400 transition-colors"
            >
              <GitCompare className="w-3 h-3" />
              Compare
            </button>
          )}
        </div>
        )}
        </div>
      </div>

      {/* Compare Dialog */}
      <CompareRoutesDialog
        isOpen={showCompareDialog}
        onClose={() => {
          setShowCompareDialog(false)
          exitCompareMode()
        }}
        selectedRouteIds={selectedForCompare}
      />

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed z-[100] bg-black/95 backdrop-blur-md border border-purple-500/30 rounded-lg shadow-[0_0_20px_-5px_rgba(147,51,234,0.5)] py-1 min-w-[180px]"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={handleInspectLayer}
            className="w-full flex items-center gap-2 px-3 py-2 text-left text-[11px] text-white hover:bg-purple-500/20 transition-colors"
          >
            <Table className="w-3.5 h-3.5 text-purple-400" />
            <span>Inspect layer</span>
          </button>
          <button
            onClick={handleShowCostMatrix}
            className="w-full flex items-center gap-2 px-3 py-2 text-left text-[11px] text-white hover:bg-green-500/20 transition-colors"
          >
            <DollarSign className="w-3.5 h-3.5 text-green-400" />
            <span>Show cost matrix</span>
          </button>
        </div>
      )}

      {/* Cost Matrix Dialog */}
      {costMatrixRouteId && currentProject && (
        <CostMatrixDialog
          isOpen={showCostMatrixDialog}
          onClose={() => {
            setShowCostMatrixDialog(false)
            setCostMatrixRouteId(null)
          }}
          routeId={costMatrixRouteId}
          project={currentProject}
        />
      )}
    </>
  )
}
