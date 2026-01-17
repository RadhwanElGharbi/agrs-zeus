'use client'

import React, { useMemo, useState } from 'react'
import { Eye, EyeOff, Layers, MapPin, Minimize2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CATEGORY_COLORS } from '@/lib/map-utils'
import type { LoadedRouteSummary } from './RoutingRoutesPanel'
import type { RouteCrossingRecord } from '@/lib/api/dataClient'

interface RoutingCrossingsPanelProps {
  loadedRoutes: LoadedRouteSummary[]
  crossingsByRouteId: Record<string, RouteCrossingRecord[]>
  onOpenManager: () => void
  hiddenCategories: Record<string, boolean>
  onToggleCategory: (category: string) => void
  // Optional external control for collapsed state
  collapsed?: boolean
  onCollapsedChange?: (collapsed: boolean) => void
}

export function RoutingCrossingsPanel({
  loadedRoutes,
  crossingsByRouteId,
  onOpenManager,
  hiddenCategories,
  onToggleCategory,
  collapsed: externalCollapsed,
  onCollapsedChange
}: RoutingCrossingsPanelProps) {
  const [internalCollapsed, setInternalCollapsed] = useState(true)
  const isCollapsed = externalCollapsed !== undefined ? externalCollapsed : internalCollapsed
  const setIsCollapsed = (value: boolean) => {
    onCollapsedChange?.(value)
    setInternalCollapsed(value)
  }

  const totalCrossings = useMemo(() => {
    if (!loadedRoutes.length) return 0
    let sum = 0
    for (const r of loadedRoutes) {
      sum += crossingsByRouteId[r.routeId]?.length ?? 0
    }
    return sum
  }, [loadedRoutes, crossingsByRouteId])

  const badge = totalCrossings > 99 ? '99+' : String(totalCrossings)

  const formatRouteName = (routeId: string) => routeId.replace(/\.geojson$/i, '').replace(/_/g, ' ')

  const routeRows = useMemo(() => {
    return loadedRoutes.map((r) => {
      const crossings = crossingsByRouteId[r.routeId] ?? []
      const byCategory = crossings.reduce<Record<string, number>>((acc, c) => {
        const key = String(c.category || 'unknown').toLowerCase()
        acc[key] = (acc[key] ?? 0) + 1
        return acc
      }, {})

      const categories = Object.entries(byCategory)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5) // keep compact

      return {
        routeId: r.routeId,
        visible: r.visible,
        count: crossings.length,
        categories
      }
    })
  }, [loadedRoutes, crossingsByRouteId])

  const categoryRows = useMemo(() => {
    const counts: Record<string, number> = {}
    const visibleRouteIds = new Set(loadedRoutes.filter((r) => r.visible).map((r) => r.routeId))
    for (const routeId of visibleRouteIds) {
      const crossings = crossingsByRouteId[routeId] ?? []
      for (const c of crossings) {
        const key = String(c.category || 'unknown').trim().toLowerCase() || 'unknown'
        counts[key] = (counts[key] ?? 0) + 1
      }
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1])
  }, [crossingsByRouteId, loadedRoutes])

  if (isCollapsed) {
    return (
      <div className="relative bg-black/80 backdrop-blur-md border border-white/20 rounded-sm p-2 shadow-[0_0_20px_-5px_rgba(0,0,0,0.5)] group hover:border-purple-500/50 transition-colors">
        <button
          onClick={() => setIsCollapsed(false)}
          className="flex items-center justify-center p-1 hover:bg-purple-500/10 rounded-sm transition-colors text-purple-400/70 hover:text-purple-300"
          title="Expand Crossings"
        >
          <MapPin className="w-5 h-5 group-hover:animate-pulse" />
        </button>

        {totalCrossings > 0 && (
          <div className="absolute -top-1 -right-1 min-w-4 h-4 px-1 bg-purple-500 rounded-full flex items-center justify-center shadow-[0_0_8px_rgba(147,51,234,0.8)]">
            <span className="text-[9px] font-bold text-white tabular-nums">{badge}</span>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="w-[320px] xl:w-[380px] font-mono">
      <div className="bg-[#0a0a0a]/95 backdrop-blur-xl border border-purple-500/20 rounded-sm shadow-[0_0_30px_-10px_rgba(147,51,234,0.3)] flex flex-col overflow-hidden max-h-[calc(100vh-520px)] xl:max-h-[calc(100vh-560px)]">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-3 border-b border-purple-500/20 bg-purple-900/10">
          <div className="flex items-center gap-2 min-w-0">
            <div className="p-1 bg-purple-500/20 rounded-sm shrink-0">
              <MapPin className="w-3.5 h-3.5 text-purple-400" />
            </div>
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs font-bold text-white uppercase tracking-wider">Crossings</span>
              <span className="text-[9px] font-mono text-white/40 tabular-nums">
                {totalCrossings} total
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={onOpenManager}
              className="flex items-center gap-1.5 px-2 py-1 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/20 hover:border-purple-500/30 rounded text-[9px] font-medium text-purple-300 transition-colors"
              title="Open Crossings Manager"
            >
              <Layers className="w-3 h-3" />
              Manager
            </button>

            <button
              onClick={() => setIsCollapsed(true)}
              className="p-1 hover:bg-white/10 rounded-sm transition-colors text-white/50 hover:text-white"
              title="Collapse Crossings"
            >
              <Minimize2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden flex flex-col">
          <div className="px-3 py-1.5 bg-white/[0.02] border-b border-white/5">
            <span className="text-[9px] font-bold text-white/40 uppercase tracking-wider">Loaded routes</span>
          </div>

          {routeRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 px-4 text-white/30">
              <MapPin className="w-7 h-7 mb-2 opacity-40" />
              <p className="text-[11px] font-medium text-center">No Routes Loaded</p>
              <p className="text-[10px] text-center mt-1 text-white/20">
                Load routes to compute and view crossings
              </p>
            </div>
          ) : (
            <div className="p-1 space-y-0.5 overflow-y-auto">
              {routeRows.map((row) => (
                <div
                  key={row.routeId}
                  className={cn(
                    "group flex items-start gap-2 p-2 rounded-sm transition-all duration-200",
                    row.count > 0
                      ? "bg-purple-500/5 border border-purple-500/20 hover:border-purple-500/40"
                      : "bg-white/[0.02] border border-white/10 hover:border-white/20"
                  )}
                  title={row.routeId}
                >
                  <div className="mt-0.5 shrink-0">
                    <MapPin className={cn("w-3.5 h-3.5", row.count > 0 ? "text-purple-300/80" : "text-white/20")} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[10px] font-medium text-white truncate">
                        {formatRouteName(row.routeId)}
                      </p>
                      <span className={cn(
                        "text-[10px] font-mono tabular-nums shrink-0",
                        row.count > 0 ? "text-purple-200" : "text-white/30"
                      )}>
                        {row.count}
                      </span>
                    </div>

                    {row.categories.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {row.categories.map(([category, count]) => {
                          const color = (CATEGORY_COLORS as any)[category] || '#a855f7'
                          return (
                            <span
                              key={category}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-white/10 bg-black/30 text-[9px] text-white/70"
                              title={category}
                            >
                              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
                              <span className="uppercase tracking-wider">{category}</span>
                              <span className="font-mono tabular-nums text-white/50">{count}</span>
                            </span>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="px-3 py-1.5 bg-white/[0.02] border-t border-white/10">
            <span className="text-[9px] font-bold text-white/40 uppercase tracking-wider">Marker visibility</span>
          </div>

          {categoryRows.length === 0 ? (
            <div className="px-3 py-3 text-[10px] text-white/30">No crossings loaded yet.</div>
          ) : (
            <div className="p-1 space-y-0.5 overflow-y-auto max-h-[160px]">
              {categoryRows.map(([category, count]) => {
                const hidden = Boolean(hiddenCategories[category])
                const color = (CATEGORY_COLORS as any)[category] || '#a855f7'
                return (
                  <div
                    key={category}
                    className={cn(
                      'flex items-center justify-between gap-2 px-2 py-1.5 rounded-sm border transition-colors',
                      hidden ? 'bg-white/[0.02] border-white/10' : 'bg-purple-500/5 border-purple-500/20'
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                      <span className={cn('text-[10px] font-mono uppercase tracking-wider truncate', hidden ? 'text-white/40' : 'text-white/75')}>
                        {category}
                      </span>
                      <span className="text-[10px] font-mono tabular-nums text-white/30">{count}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => onToggleCategory(category)}
                      className={cn(
                        'p-1 rounded-sm border transition-colors',
                        hidden
                          ? 'border-white/10 bg-white/5 text-white/30 hover:text-white/60 hover:border-white/20'
                          : 'border-purple-500/20 bg-purple-500/10 text-purple-200 hover:bg-purple-500/20 hover:border-purple-500/30'
                      )}
                      title={hidden ? 'Show markers for this category' : 'Hide markers for this category'}
                    >
                      {hidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}



