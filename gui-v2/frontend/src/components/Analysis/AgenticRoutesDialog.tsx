'use client'

import { useState, useEffect, useCallback } from 'react'
import { X, Route, Loader2, MapPin, CheckCircle2 } from 'lucide-react'
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

  useEffect(() => {
    if (open) {
      setLoading(true)
      setError(null)
      listAgenticRoutes()
        .then(setRoutes)
        .catch(err => setError(err.message))
        .finally(() => setLoading(false))
    }
  }, [open])

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

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative w-[500px] max-h-[80vh] bg-[#0a0a0a]/95 border border-white/10 rounded-sm shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10 bg-black/40">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500/10 rounded-sm">
              <Route className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Agentic Routes</h2>
              <p className="text-xs text-white/50 font-mono">Load AI-analyzed routes onto map</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="p-4 max-h-[60vh] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
              <span className="ml-3 text-white/60">Loading routes...</span>
            </div>
          ) : error ? (
            <div className="text-center py-8">
              <p className="text-red-400 text-sm">{error}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => {
                  setLoading(true)
                  listAgenticRoutes()
                    .then(setRoutes)
                    .catch(err => setError(err.message))
                    .finally(() => setLoading(false))
                }}
              >
                Retry
              </Button>
            </div>
          ) : routes.length === 0 ? (
            <div className="text-center py-8 text-white/50">
              <MapPin className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No routes available</p>
            </div>
          ) : (
            <div className="space-y-2">
              {routes.map(route => {
                const isLoaded = loadedRoutes.has(route.route_id)
                const isLoading = loadingRouteId === route.route_id
                return (
                  <div
                    key={route.route_id}
                    className={cn(
                      "flex items-center justify-between p-3 rounded-sm border transition-all",
                      isLoaded
                        ? "bg-green-500/10 border-green-500/30"
                        : "bg-white/5 border-white/10 hover:border-white/20"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      {isLoaded ? (
                        <CheckCircle2 className="w-5 h-5 text-green-400" />
                      ) : (
                        <Route className="w-5 h-5 text-white/40" />
                      )}
                      <div>
                        <p className="text-sm font-medium text-white">
                          {route.route_id.replace(/_/g, ' ')}
                        </p>
                        <p className="text-xs text-white/50 font-mono">
                          {route.segment_count ?? '?'} segments
                        </p>
                      </div>
                    </div>
                    <Button
                      variant={isLoaded ? "outline" : "default"}
                      size="sm"
                      disabled={isLoading}
                      onClick={() => handleLoadRoute(route.route_id)}
                      className={cn(
                        isLoaded && "border-green-500/30 text-green-400 hover:bg-green-500/10"
                      )}
                    >
                      {isLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : isLoaded ? (
                        'Reload'
                      ) : (
                        'Load'
                      )}
                    </Button>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/10 bg-black/20">
          <p className="text-xs text-white/40 text-center font-mono">
            Routes loaded will appear as clickable segments on the map
          </p>
        </div>
      </div>
    </div>
  )
}
