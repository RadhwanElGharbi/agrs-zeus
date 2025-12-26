'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { X, Route, Loader2, MapPin, CheckCircle2, RefreshCw, ArrowRight, Brain, Search, ExternalLink, Cpu, Server, GitBranch } from 'lucide-react'
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
  type RouteMetadata
} from '@/lib/api/dataClient'

interface AgenticRoutesDialogProps {
  open: boolean
  onClose: () => void
  onLoadRoute: (routeId: string, geojson: GeoJSON.FeatureCollection) => void
}

export function AgenticRoutesDialog({ open, onClose, onLoadRoute }: AgenticRoutesDialogProps) {
  const { currentProject } = useProject()
  const [routes, setRoutes] = useState<AgenticRouteListItem[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingRouteId, setLoadingRouteId] = useState<string | null>(null)
  const [loadedRoutes, setLoadedRoutes] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [isClosing, setIsClosing] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    setMounted(true)
  }, [])

  const fetchRoutes = useCallback(() => {
    if (!currentProject) {
      setError('No project loaded')
      return
    }

    setLoading(true)
    setError(null)

    // Try agentic API first
    listAgenticRoutes(currentProject)
      .then(agenticRoutes => {
        if (agenticRoutes && agenticRoutes.length > 0) {
          setRoutes(agenticRoutes)
          setLoading(false)
        } else {
          // Fall back to PIRL API
          return fetchPIRLRoutes(currentProject)
            .then(pirlRoutes => {
              const convertedRoutes: AgenticRouteListItem[] = pirlRoutes.map(r => ({
                route_id: r.filename,
                segment_count: r.num_segments || 0,
                total_length_m: r.total_length_m || undefined,
                total_cost_usd: r.total_cost_usd || undefined,
                is_real_route: r.is_real_route || false,
                generation_method: r.generation_method || undefined,
                constraint_compliant: r.constraint_compliant || undefined,
                cost_per_km: r.cost_per_km || undefined
              }))
              setRoutes(convertedRoutes)
            })
            .finally(() => setLoading(false))
        }
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
  }, [currentProject])

  useEffect(() => {
    if (open && currentProject) {
      setIsClosing(false)
      fetchRoutes()
    }
  }, [open, currentProject, fetchRoutes])

  const handleClose = () => {
    setIsClosing(true)
    setTimeout(() => {
      onClose()
    }, 150)
  }

  const handleLoadRoute = useCallback(async (routeId: string) => {
    if (!currentProject) {
      setError('No project loaded')
      return
    }

    setLoadingRouteId(routeId)
    setError(null)
    try {
      // Try agentic API first for segmented geometry
      let geojson = await getAgenticSegmentsGeometry(routeId, currentProject)

      // Fall back to PIRL API if agentic fails
      if (!geojson) {
        const pirlGeojson = await fetchPIRLRoute(currentProject, routeId)
        if (pirlGeojson) {
          geojson = pirlGeojson as GeoJSON.FeatureCollection
        }
      }

      if (geojson) {
        onLoadRoute(routeId, geojson)
        setLoadedRoutes(prev => new Set([...prev, routeId]))
      } else {
        setError(`Failed to load geometry for ${routeId}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load route')
    } finally {
      setLoadingRouteId(null)
    }
  }, [currentProject, onLoadRoute])

  // Format route name by removing project prefix and underscores
  const formatRouteName = (routeId: string) => {
    let name = routeId
    if (currentProject) {
      const prefix = `${currentProject}_`
      if (name.startsWith(prefix)) {
        name = name.substring(prefix.length)
      }
    }
    return name.replace(/_/g, ' ')
  }

  // Filter routes by search query
  const filteredRoutes = useMemo(() => {
    if (!searchQuery.trim()) return routes
    const query = searchQuery.toLowerCase().trim()
    return routes.filter(route => {
      const name = formatRouteName(route.route_id).toLowerCase()
      return name.includes(query) || route.route_id.toLowerCase().includes(query)
    })
  }, [routes, searchQuery, currentProject])

  // Separate real routes and generated routes
  const realRoutes = useMemo(() => filteredRoutes.filter(r => r.is_real_route), [filteredRoutes])
  const generatedRoutes = useMemo(() => filteredRoutes.filter(r => !r.is_real_route), [filteredRoutes])

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
            "relative z-10 w-[800px] max-w-[95vw] max-h-[85vh] bg-[#0a0a0a]/95 border border-white/10 rounded-sm shadow-[0_0_50px_-10px_rgba(0,0,0,0.8)] flex flex-col pointer-events-auto overflow-hidden",
            isClosing ? "animate-fade-out" : "animate-fade-in"
          )}
        >
          {/* Header */}
          <header className="px-6 py-5 border-b border-white/10 flex items-center justify-between bg-black/20 shrink-0">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2 text-[10px] text-white/40 uppercase tracking-[0.2em]">
                <Brain className="w-3 h-3 text-purple-400" />
                <span>Pipeline Intelligence & Route Learning</span>
              </div>
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-bold text-white uppercase tracking-wide">
                  PIRL AI Studio
                </h2>
                {currentProject && (
                  <div className="px-2 py-0.5 bg-purple-500/10 border border-purple-500/20 rounded-sm text-[10px] text-purple-300">
                    {currentProject}
                  </div>
                )}
              </div>
            </div>
            <button
              onClick={handleClose}
              className="p-2 hover:bg-white/5 border border-transparent hover:border-white/10 rounded-sm text-white/50 hover:text-white transition-all"
            >
              <X className="w-5 h-5" />
            </button>
          </header>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6 bg-[linear-gradient(to_right,#ffffff02_1px,transparent_1px),linear-gradient(to_bottom,#ffffff02_1px,transparent_1px)] bg-[size:20px_20px]">

            {/* Status Bar */}
            <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-white/[0.02] border border-white/10 rounded-sm">
              <div className="flex items-center gap-4">
                <div className="p-2 bg-purple-500/10 rounded-sm border border-purple-500/20">
                  <Server className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">Route Analysis Engine</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <div className={cn("w-2 h-2 rounded-full", routes.length > 0 ? "bg-emerald-500 animate-pulse" : "bg-amber-500")} />
                    <span className={cn("text-xs uppercase", routes.length > 0 ? "text-emerald-500" : "text-amber-500")}>
                      {routes.length > 0 ? `${routes.length} Routes Available` : 'No Routes Detected'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={fetchRoutes}
                  disabled={loading}
                  className="flex items-center gap-2 px-3 py-1.5 text-[10px] uppercase tracking-wider text-white/60 hover:text-white hover:bg-white/5 border border-transparent hover:border-white/10 rounded-sm transition-all disabled:opacity-50"
                >
                  <RefreshCw className={cn("w-3 h-3", loading && "animate-spin")} />
                  Refresh
                </button>
              </div>
            </div>

            {/* Search Bar */}
            {routes.length > 0 && (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                <input
                  type="text"
                  placeholder="Search routes..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-black/50 border border-white/10 rounded-sm pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-purple-500/50 focus:ring-0 outline-none transition-colors"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}

            {/* Error State */}
            {error && (
              <div className="p-3 border border-red-500/30 bg-red-500/10 rounded-sm text-xs flex items-center gap-3 text-red-400">
                <X className="w-4 h-4" />
                {error}
              </div>
            )}

            {/* Loading State */}
            {loading && routes.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 space-y-4">
                <div className="p-4 bg-purple-500/10 rounded-full border border-purple-500/20">
                  <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
                </div>
                <span className="text-sm text-white/40 uppercase tracking-wider">Scanning Route Database...</span>
              </div>
            )}

            {/* No Project State */}
            {!currentProject && (
              <div className="flex flex-col items-center justify-center py-16 space-y-4 text-white/30">
                <div className="p-4 bg-white/5 rounded-full border border-white/10">
                  <MapPin className="w-8 h-8 opacity-50" />
                </div>
                <p className="text-sm uppercase tracking-wider">No Project Loaded</p>
                <p className="text-xs text-white/20">Load a project to access PIRL routes</p>
              </div>
            )}

            {/* Empty State */}
            {currentProject && !loading && routes.length === 0 && !error && (
              <div className="flex flex-col items-center justify-center py-16 space-y-4 text-white/30">
                <div className="p-4 bg-white/5 rounded-full border border-white/10">
                  <GitBranch className="w-8 h-8 opacity-50" />
                </div>
                <p className="text-sm uppercase tracking-wider">No Routes Found</p>
                <p className="text-xs text-white/20">Generate routes using the PIRL engine</p>
              </div>
            )}

            {/* Real Infrastructure Routes */}
            {realRoutes.length > 0 && (
              <section className="border border-white/5 bg-white/[0.01] rounded-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-white/5 bg-yellow-500/5">
                  <div className="flex items-center gap-2">
                    <Route className="w-4 h-4 text-yellow-400" />
                    <span className="text-xs font-bold text-white uppercase tracking-wider">Real Infrastructure</span>
                    <span className="text-[10px] text-yellow-400/60 ml-auto">{realRoutes.length} routes</span>
                  </div>
                </div>
                <div className="p-2 space-y-1 max-h-[200px] overflow-y-auto">
                  {realRoutes.map(route => (
                    <RouteItem
                      key={route.route_id}
                      route={route}
                      isLoaded={loadedRoutes.has(route.route_id)}
                      isLoading={loadingRouteId === route.route_id}
                      formatName={formatRouteName}
                      onLoad={handleLoadRoute}
                      variant="real"
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Generated Routes */}
            {generatedRoutes.length > 0 && (
              <section className="border border-white/5 bg-white/[0.01] rounded-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-white/5 bg-purple-500/5">
                  <div className="flex items-center gap-2">
                    <Brain className="w-4 h-4 text-purple-400" />
                    <span className="text-xs font-bold text-white uppercase tracking-wider">AI-Generated Routes</span>
                    <span className="text-[10px] text-purple-400/60 ml-auto">{generatedRoutes.length} routes</span>
                  </div>
                </div>
                <div className="p-2 space-y-1 max-h-[300px] overflow-y-auto">
                  {generatedRoutes.map(route => (
                    <RouteItem
                      key={route.route_id}
                      route={route}
                      isLoaded={loadedRoutes.has(route.route_id)}
                      isLoading={loadingRouteId === route.route_id}
                      formatName={formatRouteName}
                      onLoad={handleLoadRoute}
                      variant="generated"
                    />
                  ))}
                </div>
              </section>
            )}

            {/* No Search Results */}
            {searchQuery && filteredRoutes.length === 0 && routes.length > 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-white/30">
                <Search className="w-8 h-8 mb-3 opacity-30" />
                <p className="text-sm uppercase tracking-wider">No routes match &quot;{searchQuery}&quot;</p>
              </div>
            )}
          </div>

          {/* Footer */}
          <footer className="px-6 py-4 border-t border-white/10 bg-black/20 shrink-0">
            <div className="flex items-center justify-between text-xs text-white/40">
              <div className="flex items-center gap-2">
                <div className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </div>
                <span>PIRL ENGINE ONLINE</span>
              </div>
              <div className="flex items-center gap-4">
                <span>{loadedRoutes.size} loaded</span>
                <span className="text-white/20">|</span>
                <span>{routes.length} total routes</span>
              </div>
            </div>
          </footer>
        </div>
      </div>
    </>,
    document.body
  )
}

// Route Item Component
function RouteItem({
  route,
  isLoaded,
  isLoading,
  formatName,
  onLoad,
  variant
}: {
  route: AgenticRouteListItem
  isLoaded: boolean
  isLoading: boolean
  formatName: (id: string) => string
  onLoad: (id: string) => void
  variant: 'real' | 'generated'
}) {
  const accentColor = variant === 'real' ? 'yellow' : 'purple'

  return (
    <div
      className={cn(
        "group flex items-center justify-between p-3 rounded-sm border transition-all duration-200",
        isLoaded
          ? `bg-${accentColor}-500/10 border-${accentColor}-500/30`
          : "bg-white/[0.02] border-transparent hover:border-white/10 hover:bg-white/[0.03]"
      )}
      style={{
        backgroundColor: isLoaded ? (variant === 'real' ? 'rgba(234, 179, 8, 0.1)' : 'rgba(168, 85, 247, 0.1)') : undefined,
        borderColor: isLoaded ? (variant === 'real' ? 'rgba(234, 179, 8, 0.3)' : 'rgba(168, 85, 247, 0.3)') : undefined
      }}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className={cn(
          "p-1.5 rounded-sm transition-colors",
          isLoaded
            ? variant === 'real' ? "bg-yellow-500/20 text-yellow-400" : "bg-purple-500/20 text-purple-400"
            : "bg-white/5 text-white/30 group-hover:text-white/50"
        )}>
          {isLoaded ? (
            <CheckCircle2 className="w-4 h-4" />
          ) : (
            <Route className="w-4 h-4" />
          )}
        </div>
        <div className="min-w-0">
          <p className={cn(
            "text-[11px] font-medium truncate transition-colors",
            isLoaded ? "text-white" : "text-white/70 group-hover:text-white"
          )}>
            {formatName(route.route_id)}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[9px] text-white/40 bg-white/5 px-1.5 py-0.5 rounded-sm border border-white/5">
              {route.segment_count ?? '?'} segments
            </span>
            {route.total_length_m && (
              <span className="text-[9px] text-white/40">
                {(route.total_length_m / 1000).toFixed(1)} km
              </span>
            )}
            {route.constraint_compliant && (
              <span className="text-[9px] text-emerald-400">
                ✓ Compliant
              </span>
            )}
            {isLoaded && (
              <span className={cn(
                "text-[9px] font-bold uppercase flex items-center gap-1",
                variant === 'real' ? "text-yellow-400" : "text-purple-400"
              )}>
                <span className={cn(
                  "w-1 h-1 rounded-full animate-pulse",
                  variant === 'real' ? "bg-yellow-400" : "bg-purple-400"
                )} />
                Active
              </span>
            )}
          </div>
        </div>
      </div>

      <button
        onClick={() => onLoad(route.route_id)}
        disabled={isLoading}
        className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-sm border transition-all",
          isLoading && "opacity-50 cursor-wait",
          isLoaded
            ? "border-transparent text-white/40 hover:text-white hover:bg-white/5"
            : variant === 'real'
              ? "border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10 opacity-0 group-hover:opacity-100"
              : "border-purple-500/30 text-purple-400 hover:bg-purple-500/10 opacity-0 group-hover:opacity-100"
        )}
      >
        {isLoading ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : isLoaded ? (
          'Reload'
        ) : (
          <>
            Load <ArrowRight className="w-3 h-3" />
          </>
        )}
      </button>
    </div>
  )
}
