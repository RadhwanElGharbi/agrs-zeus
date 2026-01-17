'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { BarChart3, Check, DollarSign, Eye, EyeOff, FileText, GitCompare, Layers, Loader2, Minimize2, Route as RouteIcon, Table, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useProject } from '@/lib/context/ProjectContext'
import { useMapView } from '@/lib/context/MapViewContext'
import { CompareRoutesDialog } from './CompareRoutesDialog'
import { CostMatrixDialog } from './CostMatrixDialog'
import { RouteAnalysisDialog } from './RouteAnalysisDialog'
import {
  previewAlignmentSheets,
  downloadAlignmentSheetsPDF,
  type AlignmentSheetPreset,
  type AlignmentSheetPreviewResponse
} from '@/lib/api/dataClient'

export interface LoadedRouteSummary {
  routeId: string
  visible: boolean
  segmentCount: number
}

interface RoutingRoutesPanelProps {
  loadedRoutes: LoadedRouteSummary[]
  onToggleRouteVisibility: (routeId: string) => void
  onRemoveRoute: (routeId: string) => void
  onOpenTable: (routeId: string) => void
  // Optional external control for collapsed state
  collapsed?: boolean
  onCollapsedChange?: (collapsed: boolean) => void
}

export function RoutingRoutesPanel({
  loadedRoutes,
  onToggleRouteVisibility,
  onRemoveRoute,
  onOpenTable,
  collapsed: externalCollapsed,
  onCollapsedChange
}: RoutingRoutesPanelProps) {
  const { currentProject } = useProject()
  const { routing } = useMapView()
  const [internalCollapsed, setInternalCollapsed] = useState(false)

  const isCollapsed = externalCollapsed !== undefined ? externalCollapsed : internalCollapsed
  const setIsCollapsed = (value: boolean) => {
    onCollapsedChange?.(value)
    setInternalCollapsed(value)
  }

  // Compare mode
  const [compareMode, setCompareMode] = useState(false)
  const [selectedForCompare, setSelectedForCompare] = useState<string[]>([])
  const [showCompareDialog, setShowCompareDialog] = useState(false)

  // Context menu
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; routeId: string } | null>(null)

  // Cost Matrix
  const [showCostMatrixDialog, setShowCostMatrixDialog] = useState(false)
  const [costMatrixRouteId, setCostMatrixRouteId] = useState<string | null>(null)

  // Analysis / Earthworks
  const [showAnalysisDialog, setShowAnalysisDialog] = useState(false)
  const [analysisRouteId, setAnalysisRouteId] = useState<string | null>(null)

  // Alignment Sheets
  const [alignmentSheetRoute, setAlignmentSheetRoute] = useState<string | null>(null)
  const [alignmentPreset, setAlignmentPreset] = useState<AlignmentSheetPreset>('standard')
  const [alignmentPreview, setAlignmentPreview] = useState<AlignmentSheetPreviewResponse | null>(null)
  const [alignmentError, setAlignmentError] = useState<string | null>(null)
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false)
  const [isLoadingPreview, setIsLoadingPreview] = useState(false)

  const formatRouteName = (routeId: string) => {
    // Keep stable: strip extension for display only.
    return routeId.replace(/\.geojson$/i, '').replace(/_/g, ' ')
  }

  const toggleCompareSelection = (routeId: string) => {
    setSelectedForCompare(prev => {
      if (prev.includes(routeId)) return prev.filter(id => id !== routeId)
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

  const handleContextMenu = useCallback((e: React.MouseEvent, routeId: string) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, routeId })
  }, [])

  const handleInspectLayer = useCallback(() => {
    if (!contextMenu) return
    onOpenTable(contextMenu.routeId)
    setContextMenu(null)
  }, [contextMenu, onOpenTable])

  const handleShowCostMatrix = useCallback(() => {
    if (!contextMenu) return
    setCostMatrixRouteId(contextMenu.routeId)
    setShowCostMatrixDialog(true)
    setContextMenu(null)
  }, [contextMenu])

  const handleShowAnalysis = useCallback(() => {
    if (!contextMenu) return
    setAnalysisRouteId(contextMenu.routeId)
    setShowAnalysisDialog(true)
    setContextMenu(null)
  }, [contextMenu])

  const handleAlignmentSheets = useCallback(() => {
    if (!contextMenu) return
    setAlignmentSheetRoute(contextMenu.routeId)
    setContextMenu(null)
  }, [contextMenu])

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return
    const handleClick = () => setContextMenu(null)
    window.addEventListener('click', handleClick)
    return () => window.removeEventListener('click', handleClick)
  }, [contextMenu])

  // Preview alignment sheets when route/preset changes
  useEffect(() => {
    if (!alignmentSheetRoute || !currentProject) return

    const fetchPreview = async () => {
      setIsLoadingPreview(true)
      setAlignmentError(null)
      try {
        const preview = await previewAlignmentSheets(
          currentProject,
          alignmentSheetRoute.replace('.geojson', ''),
          alignmentPreset
        )
        setAlignmentPreview(preview)
      } catch (err) {
        setAlignmentError(err instanceof Error ? err.message : 'Failed to load preview')
      } finally {
        setIsLoadingPreview(false)
      }
    }

    fetchPreview()
  }, [alignmentSheetRoute, alignmentPreset, currentProject])

  const handleGeneratePDF = async () => {
    if (!alignmentSheetRoute || !currentProject) return

    setIsGeneratingPDF(true)
    setAlignmentError(null)
    try {
      await downloadAlignmentSheetsPDF(
        currentProject,
        alignmentSheetRoute.replace('.geojson', ''),
        alignmentPreset
      )
      setAlignmentSheetRoute(null)
    } catch (err) {
      setAlignmentError(err instanceof Error ? err.message : 'Failed to generate PDF')
    } finally {
      setIsGeneratingPDF(false)
    }
  }

  if (isCollapsed) {
    return (
      <div className="relative bg-black/80 backdrop-blur-md border border-white/20 rounded-sm p-2 shadow-[0_0_20px_-5px_rgba(0,0,0,0.5)] group hover:border-purple-500/50 transition-colors">
        <button
          onClick={() => setIsCollapsed(false)}
          className="flex items-center justify-center p-1 hover:bg-purple-500/10 rounded-sm transition-colors text-purple-400/70 hover:text-purple-400"
          title="Expand Routes"
        >
          <RouteIcon className="w-5 h-5 group-hover:animate-pulse" />
        </button>
        {loadedRoutes.length > 0 && (
          <div className="absolute -top-1 -right-1 w-4 h-4 bg-purple-500 rounded-full flex items-center justify-center shadow-[0_0_8px_rgba(147,51,234,0.8)]">
            <span className="text-[9px] font-bold text-white">{loadedRoutes.length}</span>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="w-[320px] xl:w-[380px] font-mono">
      <div className="bg-[#0a0a0a]/95 backdrop-blur-xl border border-purple-500/20 rounded-sm shadow-[0_0_30px_-10px_rgba(147,51,234,0.3)] flex flex-col overflow-hidden max-h-[calc(100vh-450px)] xl:max-h-[calc(100vh-500px)]">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-3 border-b border-purple-500/20 bg-purple-900/10">
          <div className="flex items-center gap-2">
            <div className="p-1 bg-purple-500/20 rounded-sm">
              <RouteIcon className="w-3.5 h-3.5 text-purple-400" />
            </div>
            <span className="text-xs font-bold text-white uppercase tracking-wider">Routes</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => routing.openPirlManager()}
              className="flex items-center gap-1.5 px-2 py-1 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/20 hover:border-purple-500/30 rounded text-[9px] font-medium text-purple-300 transition-colors"
              title="Open Routes Manager"
            >
              <Layers className="w-3 h-3" />
              Manager
            </button>

            {!compareMode && loadedRoutes.length >= 2 && (
              <button
                onClick={() => setCompareMode(true)}
                className="flex items-center gap-1.5 px-2 py-1 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 hover:border-blue-500/30 rounded text-[9px] font-medium text-blue-400 transition-colors"
                title="Compare routes"
              >
                <GitCompare className="w-3 h-3" />
                Compare
              </button>
            )}

            <button
              onClick={() => setIsCollapsed(true)}
              className="p-1 hover:bg-white/10 rounded-sm transition-colors text-white/50 hover:text-white"
              title="Collapse Routes"
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

        {/* Loaded Routes */}
        <div className="flex-1 overflow-hidden flex flex-col">
          <div className="px-3 py-1.5 bg-white/[0.02] border-b border-white/5">
            <span className="text-[9px] font-bold text-white/40 uppercase tracking-wider">Loaded</span>
          </div>

          {loadedRoutes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 px-4 text-white/30">
              <RouteIcon className="w-7 h-7 mb-2 opacity-40" />
              <p className="text-[11px] font-medium text-center">No Routes Loaded</p>
              <p className="text-[10px] text-center mt-1 text-white/20">
                Use PIRL → MANAGER (top bar) to load routes
              </p>
            </div>
          ) : (
            <div className="p-1 space-y-0.5 max-h-[320px] xl:max-h-[380px] overflow-y-auto">
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
                    title={route.routeId}
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
                        title={isSelectedForCompare ? 'Remove from comparison' : 'Select for comparison'}
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
                        title={route.visible ? 'Hide route' : 'Show route'}
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

                    {/* Table */}
                    {!compareMode && (
                      <button
                        onClick={() => onOpenTable(route.routeId)}
                        className="p-1 opacity-0 group-hover:opacity-100 hover:bg-white/10 rounded-sm transition-all text-white/40 hover:text-white"
                        title="Inspect layer"
                      >
                        <Table className="w-3 h-3" />
                      </button>
                    )}

                    {/* Remove */}
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
          style={{ left: contextMenu.x, top: contextMenu.y }}
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
          <button
            onClick={handleShowAnalysis}
            className="w-full flex items-center gap-2 px-3 py-2 text-left text-[11px] text-white hover:bg-cyan-500/20 transition-colors"
          >
            <BarChart3 className="w-3.5 h-3.5 text-cyan-400" />
            <span>Analysis (Earthworks)</span>
          </button>
          <button
            onClick={handleAlignmentSheets}
            className="w-full flex items-center gap-2 px-3 py-2 text-left text-[11px] text-white hover:bg-amber-500/20 transition-colors"
          >
            <FileText className="w-3.5 h-3.5 text-amber-400" />
            <span>Generate Alignment Sheets</span>
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

      {/* Route Analysis Dialog */}
      {analysisRouteId && currentProject && (
        <RouteAnalysisDialog
          isOpen={showAnalysisDialog}
          onClose={() => {
            setShowAnalysisDialog(false)
            setAnalysisRouteId(null)
          }}
          routeId={analysisRouteId}
          project={currentProject}
        />
      )}

      {/* Alignment Sheets Dialog */}
      {alignmentSheetRoute && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-[#0a0a0a] border border-amber-500/30 rounded-lg shadow-[0_0_50px_-20px_rgba(245,158,11,0.3)] overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-amber-500/20 bg-amber-900/10">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-amber-500" />
                <h3 className="text-sm font-bold text-white">Generate Alignment Sheets</h3>
              </div>
              <button onClick={() => setAlignmentSheetRoute(null)} className="text-white/50 hover:text-white">
                ✕
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div>
                <label className="text-[10px] uppercase text-white/40 font-bold tracking-wider mb-1.5 block">Target Route</label>
                <div className="px-3 py-2 bg-white/5 rounded border border-white/10">
                  <div className="text-xs text-white font-mono truncate">{formatRouteName(alignmentSheetRoute)}</div>
                </div>
              </div>

              <div>
                <label className="text-[10px] uppercase text-white/40 font-bold tracking-wider mb-1.5 block">Sheet Preset</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['detail', 'standard', 'overview'] as AlignmentSheetPreset[]).map((preset) => (
                    <button
                      key={preset}
                      onClick={() => setAlignmentPreset(preset)}
                      className={cn(
                        "px-3 py-2 rounded border text-[10px] font-bold uppercase tracking-wider transition-colors",
                        alignmentPreset === preset
                          ? "bg-amber-500/20 border-amber-500/40 text-amber-300"
                          : "bg-white/5 border-white/10 text-white/50 hover:bg-amber-500/10 hover:border-amber-500/20 hover:text-white"
                      )}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-3 bg-white/5 border border-white/10 rounded">
                {isLoadingPreview ? (
                  <div className="flex items-center justify-center gap-2 text-[11px] text-white/50">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading preview...
                  </div>
                ) : alignmentPreview ? (
                  <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-[11px]">
                    <div className="text-white/40">Length</div>
                    <div className="text-white font-mono text-right">{(alignmentPreview.total_length_m / 1000).toFixed(1)} km</div>
                    <div className="text-white/40">Sheets</div>
                    <div className="text-white font-mono text-amber-400 text-right">{alignmentPreview.sheet_count} sheets</div>
                    <div className="text-white/40">H Scale</div>
                    <div className="text-white font-mono text-right">1:{alignmentPreview.h_scale}</div>
                    <div className="text-white/40">V Scale</div>
                    <div className="text-white font-mono text-right">1:{alignmentPreview.v_scale}</div>
                    {alignmentPreview.pipeline_diameter_mm !== undefined && (
                      <>
                        <div className="text-white/40">Diameter</div>
                        <div className="text-white font-mono text-right">{alignmentPreview.pipeline_diameter_mm}mm</div>
                      </>
                    )}
                    {alignmentPreview.depth_of_cover_m !== undefined && (
                      <>
                        <div className="text-white/40">Depth cover</div>
                        <div className="text-white font-mono text-right">{alignmentPreview.depth_of_cover_m}m</div>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="text-[11px] text-white/40">No preview available.</div>
                )}
              </div>

              {alignmentError && (
                <div className="text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 rounded px-3 py-2">
                  {alignmentError}
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => setAlignmentSheetRoute(null)}
                  className="flex-1 px-3 py-2 bg-white/5 border border-white/10 hover:bg-white/10 rounded text-[10px] font-bold uppercase tracking-wider text-white/60 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleGeneratePDF}
                  disabled={isLoadingPreview || isGeneratingPDF || !alignmentPreview}
                  className={cn(
                    "flex-1 px-3 py-2 bg-amber-500/20 border border-amber-500/30 hover:bg-amber-500/30 rounded text-[10px] font-bold uppercase tracking-wider text-amber-200 transition-colors flex items-center justify-center gap-2",
                    (isLoadingPreview || isGeneratingPDF || !alignmentPreview) && "opacity-50 cursor-not-allowed"
                  )}
                >
                  {isGeneratingPDF ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Generate PDF
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


