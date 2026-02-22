'use client'

import React, { useMemo, useState } from 'react'
import { ChevronDown, Eye, EyeOff, Layers, MapPin, Minimize2 } from 'lucide-react'
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
      <div className="w-full border-b border-white/[0.06] bg-white/[0.02] group hover:bg-white/[0.04] transition-colors">
        <button
          onClick={() => setIsCollapsed(false)}
          className="w-full flex items-center gap-2.5 px-4 py-2.5 text-white/50 hover:text-purple-300 transition-colors"
          title="Expand Crossings"
        >
          <MapPin className="w-4 h-4 shrink-0" />
          <span className="text-[10px] font-mono font-medium uppercase tracking-wider">Crossings</span>
          {totalCrossings > 0 && (
            <span className="text-[9px] font-bold text-purple-400 bg-purple-500/15 px-1.5 py-0.5 rounded-sm tabular-nums">{badge}</span>
          )}
          <ChevronDown className="w-3 h-3 ml-auto" />
        </button>
      </div>
    )
  }

  return (
    <div className="w-full font-mono">
      <div className="bg-transparent flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
          <div className="flex items-center gap-2 min-w-0">
            <div className="p-1 bg-purple-500/20 rounded-sm shrink-0">
              <MapPin className="w-3.5 h-3.5 text-purple-400" />
            </div>
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[11px] font-semibold text-white/90 uppercase tracking-wider">Crossings</span>
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
              className="p-1 hover:bg-white/10 rounded-sm transition-colors text-white/40 hover:text-white"
              title="Collapse Crossings"
            >
              <ChevronDown className="w-3.5 h-3.5 rotate-180" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-col">
          <div className="px-4 py-1.5 border-b border-white/[0.04]">
            <span className="text-[9px] font-bold text-white/35 uppercase tracking-wider">Loaded routes</span>
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
            <div className="px-2 py-2 space-y-1">
              {routeRows.map((row) => (
                <div
                  key={row.routeId}
                  className={cn(
                    "group flex items-start gap-2.5 px-3 py-2.5 border rounded-none transition-all duration-150",
                    row.count > 0
                      ? "bg-white/[0.02] border-white/[0.05] hover:bg-white/[0.05] hover:border-white/[0.1]"
                      : "bg-white/[0.01] border-white/[0.04]"
                  )}
                  title={row.routeId}
                >
                  <div className="mt-0.5 shrink-0">
                    <MapPin className={cn("w-3.5 h-3.5", row.count > 0 ? "text-purple-300/70" : "text-white/15")} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] font-medium text-white/90 truncate leading-tight">
                        {formatRouteName(row.routeId)}
                      </p>
                      <span className={cn(
                        "text-[9px] font-mono tabular-nums shrink-0 px-1.5 py-0.5 rounded-sm",
                        row.count > 0 ? "text-purple-300 bg-purple-500/10" : "text-white/25"
                      )}>
                        {row.count}
                      </span>
                    </div>

                    {row.categories.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {row.categories.map(([category, count]) => {
                          const color = (CATEGORY_COLORS as any)[category] || '#a855f7'
                          return (
                            <span
                              key={category}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm border border-white/[0.06] bg-white/[0.02] text-[8px] text-white/60"
                              title={category}
                            >
                              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
                              <span className="uppercase tracking-wider">{category}</span>
                              <span className="font-mono tabular-nums text-white/40">{count}</span>
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

          <div className="px-4 py-1.5 border-t border-white/[0.06]">
            <span className="text-[9px] font-bold text-white/35 uppercase tracking-wider">Marker visibility</span>
          </div>

          {categoryRows.length === 0 ? (
            <div className="px-4 py-3 text-[10px] text-white/30">No crossings loaded yet.</div>
          ) : (
            <div className="px-2 py-1 space-y-1">
              {categoryRows.map(([category, count]) => {
                const hidden = Boolean(hiddenCategories[category])
                const color = (CATEGORY_COLORS as any)[category] || '#a855f7'
                return (
                  <div
                    key={category}
                    className={cn(
                      'flex items-center justify-between gap-2 px-3 py-2 rounded-none border transition-colors',
                      hidden ? 'bg-white/[0.01] border-white/[0.04]' : 'bg-white/[0.02] border-white/[0.05]'
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                      <span className={cn('text-[10px] font-mono uppercase tracking-wider truncate', hidden ? 'text-white/30' : 'text-white/70')}>
                        {category}
                      </span>
                      <span className="text-[9px] font-mono tabular-nums text-white/25">{count}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => onToggleCategory(category)}
                      className={cn(
                        'p-1 rounded transition-colors',
                        hidden
                          ? 'text-white/20 hover:text-white/50'
                          : 'text-purple-300/70 hover:text-purple-300'
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



