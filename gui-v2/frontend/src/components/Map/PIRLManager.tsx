'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Route, Eye, EyeOff, Loader2, Minimize2, Expand, Brain, MapPin, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  listAgenticRoutes,
  getAgenticSegmentsGeometry,
  type AgenticRouteListItem
} from '@/lib/api/agenticClient'

interface LoadedRoute {
  routeId: string
  visible: boolean
  segmentCount: number
}

interface PIRLManagerProps {
  loadedRoutes: LoadedRoute[]
  onLoadRoute: (routeId: string, geojson: GeoJSON.FeatureCollection) => void
  onToggleRouteVisibility: (routeId: string) => void
  onRemoveRoute: (routeId: string) => void
  onExpandDialog: () => void
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
  collapsed: externalCollapsed,
  onCollapsedChange
}: PIRLManagerProps) {
  const [internalCollapsed, setInternalCollapsed] = useState(true) // Start collapsed by default
  const [routes, setRoutes] = useState<AgenticRouteListItem[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingRouteId, setLoadingRouteId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Use external control if provided, otherwise use internal state
  const isCollapsed = externalCollapsed !== undefined ? externalCollapsed : internalCollapsed
  const setIsCollapsed = (value: boolean) => {
    if (onCollapsedChange) {
      onCollapsedChange(value)
    }
    setInternalCollapsed(value)
  }

  // Fetch routes when expanded
  useEffect(() => {
    if (!isCollapsed) {
      setLoading(true)
      setError(null)
      listAgenticRoutes()
        .then(setRoutes)
        .catch(err => setError(err.message))
        .finally(() => setLoading(false))
    }
  }, [isCollapsed])

  const handleLoadRoute = useCallback(async (routeId: string) => {
    // Check if already loaded
    if (loadedRoutes.some(r => r.routeId === routeId)) {
      return
    }

    setLoadingRouteId(routeId)
    setError(null)
    try {
      const geojson = await getAgenticSegmentsGeometry(routeId)
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
  }, [loadedRoutes, onLoadRoute])

  // Collapsed state - show button
  if (isCollapsed) {
    return (
      <div className="relative bg-black/80 backdrop-blur-md border border-purple-500/20 rounded-sm p-2 shadow-[0_0_20px_-5px_rgba(147,51,234,0.3)] group hover:border-purple-500/50 transition-colors">
        <button
          onClick={() => setIsCollapsed(false)}
          className="flex items-center justify-center p-1 hover:bg-purple-500/10 rounded-sm transition-colors text-purple-400/70 hover:text-purple-400"
          title="Expand PIRL Routes Manager"
        >
          <Brain className="w-5 h-5 group-hover:animate-pulse" />
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

      {/* Error State */}
      {error && (
        <div className="px-3 py-2 bg-red-500/10 border-b border-red-500/20">
          <p className="text-[10px] text-red-400">{error}</p>
        </div>
      )}

      {/* Loaded Routes Section */}
      {loadedRoutes.length > 0 && (
        <div className="border-b border-purple-500/10">
          <div className="px-3 py-1.5 bg-purple-900/5">
            <span className="text-[9px] font-bold text-purple-400/70 uppercase tracking-wider">Active Routes</span>
          </div>
          <div className="p-1 space-y-0.5 max-h-[150px] overflow-y-auto">
            {loadedRoutes.map((route) => (
              <div
                key={route.routeId}
                className={cn(
                  "group flex items-center gap-2 p-2 rounded-sm transition-all duration-200",
                  "bg-purple-500/5 border border-purple-500/20 hover:border-purple-500/40"
                )}
              >
                {/* Visibility Toggle */}
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

                {/* Route Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-medium text-white truncate">
                    {route.routeId.replace(/test_project2_/g, '').replace(/_/g, ' ')}
                  </p>
                  <p className="text-[9px] text-purple-400/60 font-mono">
                    {route.segmentCount} segments
                  </p>
                </div>

                {/* Remove Button */}
                <button
                  onClick={() => onRemoveRoute(route.routeId)}
                  className="p-1 opacity-0 group-hover:opacity-100 hover:bg-red-500/20 rounded-sm transition-all text-white/30 hover:text-red-400"
                  title="Remove route from map"
                >
                  <Trash2 className="w-3 h-3" />
                </button>

                {/* Status Indicator */}
                <div className={cn(
                  "w-1.5 h-1.5 rounded-full shrink-0",
                  route.visible ? "bg-purple-400 shadow-[0_0_6px_rgba(147,51,234,0.8)]" : "bg-white/10"
                )} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Available Routes Section */}
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

              return (
                <button
                  key={route.route_id}
                  onClick={() => handleLoadRoute(route.route_id)}
                  disabled={isLoaded || isLoading}
                  className={cn(
                    "w-full flex items-center gap-2 p-2 rounded-sm transition-all duration-200 text-left",
                    isLoaded
                      ? "bg-purple-500/10 border border-purple-500/30 cursor-default"
                      : "bg-white/[0.02] border border-transparent hover:bg-purple-900/20 hover:border-purple-500/20",
                    isLoading && "opacity-70 cursor-wait"
                  )}
                >
                  {isLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-400 shrink-0" />
                  ) : (
                    <Route className={cn(
                      "w-3.5 h-3.5 shrink-0",
                      isLoaded ? "text-purple-400" : "text-white/30"
                    )} />
                  )}

                  <div className="flex-1 min-w-0">
                    <p className={cn(
                      "text-[10px] font-medium truncate",
                      isLoaded ? "text-purple-300" : "text-white/70"
                    )}>
                      {route.route_id.replace(/test_project2_/g, '').replace(/_/g, ' ')}
                    </p>
                    <p className="text-[9px] text-white/30 font-mono">
                      {route.segment_count ?? '?'} segments
                    </p>
                  </div>

                  {isLoaded && (
                    <span className="text-[8px] font-bold text-purple-400 uppercase px-1.5 py-0.5 bg-purple-500/20 rounded-sm">
                      Loaded
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-2 border-t border-purple-500/10 bg-purple-900/5">
        <p className="text-[9px] text-purple-400/50 text-center">
          Click to load route onto map
        </p>
      </div>
      </div>
    </div>
  )
}
