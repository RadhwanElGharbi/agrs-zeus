'use client'

import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X, Route, Loader2, MapPin, CheckCircle2, RefreshCw, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  listAgenticRoutes,
  getAgenticSegmentsGeometry,
  type AgenticRouteListItem
} from '@/lib/api/agenticClient'

interface AgenticRoutesDialogProps {
  open: boolean
  onClose: () => void
  onLoadRoute: (routeId: string, geojson: GeoJSON.FeatureCollection) => void
}

export function AgenticRoutesDialog({ open, onClose, onLoadRoute }: AgenticRoutesDialogProps) {
  const [routes, setRoutes] = useState<AgenticRouteListItem[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingRouteId, setLoadingRouteId] = useState<string | null>(null)
  const [loadedRoutes, setLoadedRoutes] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [isClosing, setIsClosing] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const fetchRoutes = useCallback(() => {
    setLoading(true)
    setError(null)
    listAgenticRoutes()
      .then(setRoutes)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (open) {
      setIsClosing(false)
      fetchRoutes()
    }
  }, [open, fetchRoutes])

  const handleClose = () => {
    setIsClosing(true)
    setTimeout(() => {
      onClose()
    }, 300)
  }

  const handleLoadRoute = useCallback(async (routeId: string) => {
    setLoadingRouteId(routeId)
    setError(null)
    try {
      const geojson = await getAgenticSegmentsGeometry(routeId)
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
  }, [onLoadRoute])

  if (!mounted || !open) return null

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 font-mono">
      {/* Backdrop */}
      <div
        className={cn(
          "absolute inset-0 bg-black/90 backdrop-blur-sm transition-opacity duration-300",
          isClosing ? "opacity-0" : "opacity-100"
        )}
        onClick={handleClose}
      />

      {/* Dialog */}
      <div
        className={cn(
          "relative z-10 w-[600px] max-w-[95vw] max-h-[85vh] bg-[#0a0a0a]/95 backdrop-blur-xl border border-red-500/20 rounded-lg shadow-[0_0_50px_-20px_rgba(239,68,68,0.5)] flex flex-col overflow-hidden transition-all duration-300",
          isClosing ? "scale-95 opacity-0" : "scale-100 opacity-100"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-red-500/20 bg-red-900/10">
          <div className="flex items-center gap-4">
            <div className="p-2 rounded-md bg-red-500/20 text-red-400 shadow-[0_0_15px_-3px_rgba(239,68,68,0.4)]">
              <Route className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-wide uppercase">Agentic Routes</h2>
              <p className="text-xs text-red-200/50 font-mono">Load AI-analyzed routes onto map</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={fetchRoutes}
              disabled={loading}
              title="Refresh routes"
              className="text-white/50 hover:text-red-400 hover:bg-red-500/10"
            >
              <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClose}
              className="text-white/50 hover:text-white hover:bg-white/10"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-transparent">
          {loading && routes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <Loader2 className="w-8 h-8 animate-spin text-red-500" />
              <span className="text-sm text-red-200/50 font-mono uppercase tracking-wider">Scanning for routes...</span>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <div className="p-3 bg-red-500/10 rounded-full border border-red-500/20">
                <X className="w-6 h-6 text-red-400" />
              </div>
              <p className="text-red-400 text-sm font-mono">{error}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchRoutes}
                className="border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300 bg-transparent"
              >
                RETRY CONNECTION
              </Button>
            </div>
          ) : routes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-4 text-white/30">
              <div className="p-4 bg-white/5 rounded-full">
                <MapPin className="w-8 h-8 opacity-50" />
              </div>
              <p className="font-mono text-sm uppercase tracking-wider">No agentic routes found</p>
            </div>
          ) : (
            <div className="space-y-3">
              {routes.map(route => {
                const isLoaded = loadedRoutes.has(route.route_id)
                const isLoading = loadingRouteId === route.route_id

                return (
                  <div
                    key={route.route_id}
                    className={cn(
                      "group flex items-center justify-between p-4 rounded-md border transition-all duration-200",
                      isLoaded
                        ? "bg-red-500/10 border-red-500/30 shadow-[0_0_15px_-5px_rgba(239,68,68,0.2)]"
                        : "bg-white/[0.02] border-white/5 hover:border-red-500/30 hover:bg-red-500/5"
                    )}
                  >
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "p-2 rounded-md transition-colors",
                        isLoaded ? "bg-red-500/20 text-red-400" : "bg-white/5 text-white/30 group-hover:text-red-400 group-hover:bg-red-500/10"
                      )}>
                        {isLoaded ? (
                          <CheckCircle2 className="w-5 h-5" />
                        ) : (
                          <Route className="w-5 h-5" />
                        )}
                      </div>
                      <div>
                        <h3 className={cn(
                          "text-sm font-bold font-mono transition-colors",
                          isLoaded ? "text-white" : "text-white/70 group-hover:text-white"
                        )}>
                          {route.route_id.replace(/_/g, ' ')}
                        </h3>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-[10px] text-white/40 font-mono bg-white/5 px-1.5 py-0.5 rounded border border-white/5">
                            {route.segment_count ?? '?'} SEGMENTS
                          </span>
                          {isLoaded && (
                            <span className="text-[10px] text-red-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                              Active
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isLoading}
                      onClick={() => handleLoadRoute(route.route_id)}
                      className={cn(
                        "min-w-[90px] transition-all font-mono text-xs border",
                        isLoaded
                          ? "border-transparent text-white/30 hover:text-white hover:bg-white/5"
                          : "border-red-500/30 text-red-400 hover:bg-red-500/20 hover:text-red-300 opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0"
                      )}
                    >
                      {isLoading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : isLoaded ? (
                        'RELOAD'
                      ) : (
                        <span className="flex items-center gap-1.5">
                          LOAD <ArrowRight className="w-3 h-3" />
                        </span>
                      )}
                    </Button>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-red-500/20 bg-red-900/5">
          <div className="flex items-center justify-between text-xs text-white/40 font-mono">
            <span className="flex items-center gap-2">
              <div className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </div>
              SYSTEM ONLINE
            </span>
            <span className="opacity-50">
              {routes.length} ROUTES DETECTED
            </span>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
