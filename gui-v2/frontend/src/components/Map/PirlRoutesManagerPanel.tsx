'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Brain, CheckCircle2, Eye, EyeOff, Loader2, Route, Search, Trash2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useProject } from '@/lib/context/ProjectContext'
import {
  listAgenticRoutes,
  getAgenticSegmentsGeometry,
  type AgenticRouteListItem
} from '@/lib/api/agenticClient'
import {
  fetchPIRLRoutes,
  fetchPIRLRoute,
  fetchPIRLRouteMetadata,
  type RouteMetadata,
  type RouteDetailedMetadata
} from '@/lib/api/dataClient'
import type { LoadedRouteSummary } from './RoutingRoutesPanel'

type RouteListItem = AgenticRouteListItem

interface PirlRoutesManagerPanelProps {
  open: boolean
  onClose: () => void
  loadedRoutes: LoadedRouteSummary[]
  onLoadRoute: (routeId: string, geojson: GeoJSON.FeatureCollection) => void
  onToggleRouteVisibility: (routeId: string) => void
  onRemoveRoute: (routeId: string) => void
}

type RouteInspectorState =
  | { status: 'idle' }
  | { status: 'loading'; routeId: string }
  | { status: 'ready'; routeId: string; metadata: RouteDetailedMetadata | any }
  | { status: 'error'; routeId: string; error: string }

export function PirlRoutesManagerPanel({
  open,
  onClose,
  loadedRoutes,
  onLoadRoute,
  onToggleRouteVisibility,
  onRemoveRoute
}: PirlRoutesManagerPanelProps) {
  const { currentProject } = useProject()
  const currentProjectRef = useRef<string | null>(null)
  const [mounted, setMounted] = useState(false)
  const [isClosing, setIsClosing] = useState(false)

  const [routes, setRoutes] = useState<RouteListItem[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingRouteId, setLoadingRouteId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null)
  const [inspector, setInspector] = useState<RouteInspectorState>({ status: 'idle' })

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    currentProjectRef.current = currentProject
  }, [currentProject])

  const formatRouteName = useCallback((routeId: string) => {
    let name = routeId
    if (currentProject) {
      const prefix = `${currentProject}_`
      if (name.startsWith(prefix)) name = name.substring(prefix.length)
    }
    return name.replace(/\.geojson$/i, '').replace(/_/g, ' ')
  }, [currentProject])

  const fetchRoutes = useCallback(async () => {
    if (!currentProject) {
      setRoutes([])
      setError('No project loaded')
      return
    }

    const projectAtStart = currentProject
    setLoading(true)
    setError(null)

    try {
      const agenticRoutes = await listAgenticRoutes(projectAtStart)
      if (currentProjectRef.current !== projectAtStart) return

      if (agenticRoutes && agenticRoutes.length > 0) {
        setRoutes(agenticRoutes)
        return
      }

      const pirlRoutes: RouteMetadata[] = await fetchPIRLRoutes(projectAtStart)
      if (currentProjectRef.current !== projectAtStart) return

      // Convert PIRL routes to AgenticRouteListItem shape.
      const converted: RouteListItem[] = pirlRoutes.map((r) => ({
        route_id: r.filename,
        segment_count: r.num_segments ?? null,
        total_length_m: r.total_length_m ?? undefined,
        cost_per_km: r.cost_per_km ?? undefined,
        is_real_route: r.is_real_route ?? false,
        generation_method: r.generation_method ?? undefined,
        constraint_compliant: r.constraint_compliant ?? undefined
      }))
      setRoutes(converted)
    } catch (err) {
      if (currentProjectRef.current === projectAtStart) {
        setError(err instanceof Error ? err.message : 'Failed to load routes')
      }
    } finally {
      if (currentProjectRef.current === projectAtStart) {
        setLoading(false)
      }
    }
  }, [currentProject])

  useEffect(() => {
    if (!open) return
    setIsClosing(false)
    fetchRoutes()
  }, [open, fetchRoutes])

  useEffect(() => {
    // Reset selection when closing or project changes.
    if (!open) {
      setSelectedRouteId(null)
      setInspector({ status: 'idle' })
    }
  }, [open, currentProject])

  useEffect(() => {
    if (!open || !currentProject || !selectedRouteId) return

    const projectAtStart = currentProject
    const routeId = selectedRouteId
    setInspector({ status: 'loading', routeId })

    fetchPIRLRouteMetadata(projectAtStart, routeId)
      .then((meta) => {
        if (currentProjectRef.current !== projectAtStart) return
        setInspector({ status: 'ready', routeId, metadata: meta })
      })
      .catch((err) => {
        if (currentProjectRef.current !== projectAtStart) return
        setInspector({
          status: 'error',
          routeId,
          error: err instanceof Error ? err.message : 'Failed to load route metadata'
        })
      })
  }, [open, currentProject, selectedRouteId])

  const filteredRoutes = useMemo(() => {
    if (!searchQuery.trim()) return routes
    const q = searchQuery.toLowerCase().trim()
    return routes.filter((r) => {
      const name = formatRouteName(r.route_id).toLowerCase()
      return name.includes(q) || r.route_id.toLowerCase().includes(q)
    })
  }, [routes, searchQuery, formatRouteName])

  const existingRoutes = useMemo(() => filteredRoutes.filter(r => Boolean(r.is_real_route)), [filteredRoutes])
  const generatedRoutes = useMemo(() => filteredRoutes.filter(r => !r.is_real_route), [filteredRoutes])

  const isLoaded = useCallback((routeId: string) => {
    return loadedRoutes.some(r => r.routeId === routeId)
  }, [loadedRoutes])

  const loadedState = useCallback((routeId: string) => {
    return loadedRoutes.find(r => r.routeId === routeId) ?? null
  }, [loadedRoutes])

  const handleClose = () => {
    setIsClosing(true)
    setTimeout(() => onClose(), 150)
  }

  const handleLoadRoute = useCallback(async (routeId: string) => {
    if (!currentProject) {
      setError('No project loaded')
      return
    }
    if (isLoaded(routeId)) return

    const projectAtStart = currentProject
    setLoadingRouteId(routeId)
    setError(null)

    try {
      // Try agentic API first for segmented geometry
      let geojson = await getAgenticSegmentsGeometry(routeId, projectAtStart)
      if (currentProjectRef.current !== projectAtStart) return

      // Fall back to PIRL API if agentic fails
      if (!geojson) {
        const pirlGeojson = await fetchPIRLRoute(projectAtStart, routeId)
        if (currentProjectRef.current !== projectAtStart) return
        if (pirlGeojson) geojson = pirlGeojson as GeoJSON.FeatureCollection
      }

      if (geojson) {
        if (currentProjectRef.current !== projectAtStart) return
        onLoadRoute(routeId, geojson)
      } else {
        if (currentProjectRef.current === projectAtStart) {
          setError(`Failed to load geometry for ${routeId}`)
        }
      }
    } catch (err) {
      if (currentProjectRef.current === projectAtStart) {
        setError(err instanceof Error ? err.message : 'Failed to load route')
      }
    } finally {
      setLoadingRouteId(null)
    }
  }, [currentProject, isLoaded, onLoadRoute])

  const formatInspectorRows = (metadata: any): Array<{ label: string; value: string }> => {
    if (!metadata || typeof metadata !== 'object') return []
    const rows: Array<{ label: string; value: string }> = []
    const push = (label: string, value: any) => {
      if (value === undefined || value === null) return
      const v = typeof value === 'string' ? value.trim() : String(value)
      if (!v) return
      rows.push({ label, value: v })
    }

    const gen = metadata.generation_method
    if (gen && typeof gen === 'object') {
      push('Generation', gen.method)
      push('Real route', gen.is_real_route ? 'Yes' : 'No')
    }
    const info = metadata.route_info
    if (info && typeof info === 'object') {
      push('Length (m)', info.length_m)
      push('Segments', info.num_segments)
      push('Points', info.num_points)
    }
    const compliance = metadata.constraint_compliance
    if (compliance && typeof compliance === 'object') {
      const overall = compliance.overall_compliant
      if (overall !== undefined) push('Constraint compliant', overall ? 'Yes' : 'No')
    }
    const cost = metadata.cost_breakdown
    if (cost && typeof cost === 'object') {
      push('Total cost', cost.total)
      push('Cost per km', cost.cost_per_km)
    }
    if (metadata.timestamp) push('Timestamp', metadata.timestamp)
    if (metadata.route_file) push('Route file', metadata.route_file)

    return rows
  }

  const selectedSummary = useMemo(() => {
    if (!selectedRouteId) return null
    return routes.find(r => r.route_id === selectedRouteId) ?? null
  }, [routes, selectedRouteId])

  const selectedLoaded = selectedRouteId ? loadedState(selectedRouteId) : null

  if (!mounted || !open) return null

  return createPortal(
    <>
      <div
        className={cn(
          "fixed inset-0 bg-black/80 backdrop-blur-md z-[100]",
          isClosing ? "animate-fade-out" : "animate-fade-in"
        )}
        onClick={handleClose}
      >
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none" />
      </div>

      <div className="fixed inset-0 z-[101] flex items-center justify-center p-4 pointer-events-none font-mono">
        <div
          className={cn(
            "relative z-10 w-[980px] max-w-[96vw] max-h-[86vh] bg-[#0a0a0a]/95 border border-purple-500/20 rounded-sm shadow-[0_0_50px_-10px_rgba(147,51,234,0.35)] flex flex-col pointer-events-auto overflow-hidden",
            isClosing ? "animate-fade-out" : "animate-fade-in"
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <header className="px-5 py-4 border-b border-purple-500/20 flex items-center justify-between bg-purple-900/10 shrink-0">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500/15 rounded-sm border border-purple-500/20">
                <Brain className="w-5 h-5 text-purple-300" />
              </div>
              <div className="flex flex-col">
                <div className="text-[10px] text-white/40 uppercase tracking-[0.2em]">
                  Routing Mode
                </div>
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-bold text-white uppercase tracking-wide">PIRL Manager</h2>
                  {currentProject && (
                    <div className="px-2 py-0.5 bg-purple-500/10 border border-purple-500/20 rounded-sm text-[10px] text-purple-200">
                      {currentProject}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={fetchRoutes}
                disabled={loading}
                className="px-3 py-2 text-[10px] uppercase tracking-widest text-white/60 hover:text-white hover:bg-white/5 border border-transparent hover:border-white/10 rounded-sm transition-all disabled:opacity-50"
                title="Refresh routes"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Refresh'}
              </button>
              <button
                onClick={handleClose}
                className="p-2 hover:bg-white/5 border border-transparent hover:border-white/10 rounded-sm text-white/50 hover:text-white transition-all"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </header>

          {/* Body */}
          <div className="flex-1 min-h-0 flex">
            {/* Left: Route list */}
            <div className="w-[420px] border-r border-purple-500/15 min-h-0 flex flex-col">
              <div className="p-4 border-b border-white/10">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search routes..."
                    className="w-full pl-10 pr-3 py-2 bg-black/40 border border-white/10 rounded-sm text-xs text-white/80 placeholder:text-white/30 focus:outline-none focus:border-purple-500/40"
                  />
                </div>
                {error && (
                  <div className="mt-3 text-[10px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-sm px-3 py-2">
                    {error}
                  </div>
                )}
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-2">
                {/* Existing */}
                <div className="px-2 py-1 text-[9px] font-bold text-yellow-300/70 uppercase tracking-wider">
                  Existing ({existingRoutes.length})
                </div>
                {existingRoutes.length === 0 ? (
                  <div className="px-2 py-2 text-[10px] text-white/30">No existing routes</div>
                ) : (
                  existingRoutes.map((r) => {
                    const loaded = isLoaded(r.route_id)
                    const st = loadedState(r.route_id)
                    const isSelected = selectedRouteId === r.route_id
                    const isLoadingRow = loadingRouteId === r.route_id
                    return (
                      <button
                        key={r.route_id}
                        onClick={() => setSelectedRouteId(r.route_id)}
                        className={cn(
                          "w-full text-left flex items-center gap-3 p-2 rounded-sm border transition-all",
                          isSelected
                            ? "bg-yellow-500/10 border-yellow-500/30"
                            : "bg-black/20 border-transparent hover:bg-yellow-500/5 hover:border-yellow-500/20"
                        )}
                      >
                        <Route className="w-4 h-4 text-yellow-300 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-[11px] text-white truncate">{formatRouteName(r.route_id)}</div>
                          <div className="text-[9px] text-white/30 font-mono">
                            {(r.segment_count ?? st?.segmentCount ?? '?')} segments
                          </div>
                        </div>

                        {loaded && st && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              onToggleRouteVisibility(r.route_id)
                            }}
                            className={cn(
                              "p-1 rounded-sm transition-colors",
                              st.visible
                                ? "text-emerald-400 bg-emerald-400/10 hover:bg-emerald-400/20"
                                : "text-white/20 hover:text-white/40 hover:bg-white/5"
                            )}
                            title={st.visible ? 'Hide' : 'Show'}
                          >
                            {st.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                          </button>
                        )}

                        {!loaded && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              if (!isLoadingRow) handleLoadRoute(r.route_id)
                            }}
                            className={cn(
                              "px-2 py-1 rounded-sm border text-[9px] font-bold uppercase tracking-widest transition-all",
                              "bg-yellow-500/10 border-yellow-500/20 text-yellow-200 hover:bg-yellow-500/15 hover:border-yellow-500/30",
                              isLoadingRow && "opacity-70 cursor-wait"
                            )}
                            title="Load to map"
                          >
                            {isLoadingRow ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Load'}
                          </button>
                        )}

                        {loaded && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              onRemoveRoute(r.route_id)
                            }}
                            className="p-1 rounded-sm transition-colors text-white/30 hover:text-red-400 hover:bg-red-500/15"
                            title="Remove from map"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </button>
                    )
                  })
                )}

                {/* Generated */}
                <div className="px-2 pt-3 pb-1 text-[9px] font-bold text-purple-300/70 uppercase tracking-wider">
                  PIRL Generated ({generatedRoutes.length})
                </div>
                {generatedRoutes.length === 0 ? (
                  <div className="px-2 py-2 text-[10px] text-white/30">No generated routes</div>
                ) : (
                  generatedRoutes.map((r) => {
                    const loaded = isLoaded(r.route_id)
                    const st = loadedState(r.route_id)
                    const isSelected = selectedRouteId === r.route_id
                    const isLoadingRow = loadingRouteId === r.route_id
                    return (
                      <button
                        key={r.route_id}
                        onClick={() => setSelectedRouteId(r.route_id)}
                        className={cn(
                          "w-full text-left flex items-center gap-3 p-2 rounded-sm border transition-all",
                          isSelected
                            ? "bg-purple-500/10 border-purple-500/30"
                            : "bg-black/20 border-transparent hover:bg-purple-500/5 hover:border-purple-500/20"
                        )}
                      >
                        <Route className="w-4 h-4 text-purple-300 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-[11px] text-white truncate">{formatRouteName(r.route_id)}</div>
                          <div className="text-[9px] text-white/30 font-mono">
                            {(r.segment_count ?? st?.segmentCount ?? '?')} segments
                          </div>
                        </div>

                        {loaded && st && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              onToggleRouteVisibility(r.route_id)
                            }}
                            className={cn(
                              "p-1 rounded-sm transition-colors",
                              st.visible
                                ? "text-emerald-400 bg-emerald-400/10 hover:bg-emerald-400/20"
                                : "text-white/20 hover:text-white/40 hover:bg-white/5"
                            )}
                            title={st.visible ? 'Hide' : 'Show'}
                          >
                            {st.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                          </button>
                        )}

                        {!loaded && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              if (!isLoadingRow) handleLoadRoute(r.route_id)
                            }}
                            className={cn(
                              "px-2 py-1 rounded-sm border text-[9px] font-bold uppercase tracking-widest transition-all",
                              "bg-purple-500/10 border-purple-500/20 text-purple-200 hover:bg-purple-500/15 hover:border-purple-500/30",
                              isLoadingRow && "opacity-70 cursor-wait"
                            )}
                            title="Load to map"
                          >
                            {isLoadingRow ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Load'}
                          </button>
                        )}

                        {loaded && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              onRemoveRoute(r.route_id)
                            }}
                            className="p-1 rounded-sm transition-colors text-white/30 hover:text-red-400 hover:bg-red-500/15"
                            title="Remove from map"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </button>
                    )
                  })
                )}
              </div>
            </div>

            {/* Right: Inspector */}
            <div className="flex-1 min-h-0 flex flex-col">
              <div className="px-4 py-3 border-b border-white/10 bg-white/[0.02] flex items-center justify-between">
                <div className="text-[10px] font-bold text-white uppercase tracking-wider">Inspector</div>
                {selectedRouteId && (
                  <div className="text-[9px] font-mono text-white/40 truncate max-w-[420px]" title={selectedRouteId}>
                    {selectedRouteId}
                  </div>
                )}
              </div>

              {!selectedRouteId && (
                <div className="flex-1 flex flex-col items-center justify-center text-white/20 p-8">
                  <Route className="w-10 h-10 mb-3 opacity-20" />
                  <div className="text-[10px] uppercase tracking-widest">Select a route</div>
                </div>
              )}

              {selectedRouteId && (
                <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
                  {/* Basic */}
                  <div className="border border-white/10 rounded-sm bg-black/20 overflow-hidden">
                    <div className="px-3 py-2 border-b border-white/10 bg-white/[0.02] text-[10px] text-white/40 uppercase tracking-widest">
                      Properties
                    </div>
                    <div className="p-3 grid grid-cols-2 gap-2 text-[10px]">
                      <div className="text-white/50">Name</div>
                      <div className="text-white/80 font-mono truncate" title={selectedRouteId}>
                        {formatRouteName(selectedRouteId)}
                      </div>

                      <div className="text-white/50">Category</div>
                      <div className={selectedSummary?.is_real_route ? 'text-yellow-300' : 'text-purple-300'}>
                        {selectedSummary?.is_real_route ? 'Existing' : 'PIRL Generated'}
                      </div>

                      <div className="text-white/50">Loaded</div>
                      <div className={selectedLoaded ? 'text-emerald-400' : 'text-white/40'}>
                        {selectedLoaded ? 'Yes' : 'No'}
                      </div>

                      <div className="text-white/50">Segments</div>
                      <div className="text-white/80 font-mono">
                        {selectedSummary?.segment_count ?? selectedLoaded?.segmentCount ?? '?'}
                      </div>

                      <div className="text-white/50">Length</div>
                      <div className="text-white/80 font-mono">
                        {typeof selectedSummary?.total_length_m === 'number'
                          ? `${Math.round(selectedSummary.total_length_m).toLocaleString()} m`
                          : '—'}
                      </div>

                      <div className="text-white/50">Cost / km</div>
                      <div className="text-white/80 font-mono">
                        {typeof selectedSummary?.cost_per_km === 'number'
                          ? selectedSummary.cost_per_km.toLocaleString()
                          : '—'}
                      </div>

                      <div className="text-white/50">Constraint compliant</div>
                      <div className={selectedSummary?.constraint_compliant ? 'text-emerald-400' : 'text-amber-500'}>
                        {selectedSummary?.constraint_compliant === undefined ? '—' : (selectedSummary.constraint_compliant ? 'Yes' : 'No')}
                      </div>
                    </div>
                  </div>

                  {/* Metadata */}
                  <div className="border border-white/10 rounded-sm bg-black/20 overflow-hidden">
                    <div className="px-3 py-2 border-b border-white/10 bg-white/[0.02] text-[10px] text-white/40 uppercase tracking-widest flex items-center justify-between">
                      <span>Metadata</span>
                      {inspector.status === 'loading' && inspector.routeId === selectedRouteId && (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-400" />
                      )}
                      {inspector.status === 'ready' && inspector.routeId === selectedRouteId && (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      )}
                    </div>

                    <div className="p-3">
                      {inspector.status === 'error' && inspector.routeId === selectedRouteId && (
                        <div className="text-[10px] text-red-400">
                          {inspector.error}
                        </div>
                      )}

                      {inspector.status === 'ready' && inspector.routeId === selectedRouteId && (
                        (() => {
                          const rows = formatInspectorRows(inspector.metadata)
                          if (rows.length === 0) {
                            return (
                              <pre className="bg-black/40 p-2 rounded-sm border border-white/5 text-[9px] text-white/60 overflow-auto max-h-56 font-mono">
                                {JSON.stringify(inspector.metadata, null, 2)}
                              </pre>
                            )
                          }
                          return (
                            <div className="overflow-auto max-h-56 border border-white/5 rounded-sm bg-black/40">
                              <table className="w-full text-left border-collapse text-[10px]">
                                <tbody>
                                  {rows.map((row, idx) => (
                                    <tr key={idx} className="border-b border-white/5 last:border-0 hover:bg-white/5">
                                      <td className="py-1 px-2 font-medium text-white/50 border-r border-white/5 whitespace-nowrap w-36 bg-white/[0.02]">
                                        {row.label}
                                      </td>
                                      <td className="py-1 px-2 text-white/80 break-all font-mono">
                                        {row.value}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )
                        })()
                      )}

                      {inspector.status !== 'ready' && inspector.status !== 'error' && (
                        <div className="text-[10px] text-white/30">
                          {inspector.status === 'loading' ? 'Loading…' : 'Select a route to view metadata.'}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body
  )
}

















