'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, ChevronRight, Eye, EyeOff, MapPin, Route, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { LoadedRouteSummary } from './RoutingRoutesPanel'
import type { RouteCrossingRecord } from '@/lib/api/dataClient'

interface RouteCrossingsManagerPanelProps {
  open: boolean
  onClose: () => void
  loadedRoutes: LoadedRouteSummary[]
  crossingsByRouteId: Record<string, RouteCrossingRecord[]>
  onZoomToCrossing: (lng: number, lat: number) => void
  hiddenCategories: Record<string, boolean>
  hiddenCrossingKeys: Record<string, boolean>
  onToggleCategory: (category: string) => void
  onToggleCrossing: (routeId: string, crossingId: string) => void
}

type SelectedCrossing = {
  routeId: string
  crossing: RouteCrossingRecord
}

export function RouteCrossingsManagerPanel({
  open,
  onClose,
  loadedRoutes,
  crossingsByRouteId,
  onZoomToCrossing,
  hiddenCategories,
  hiddenCrossingKeys,
  onToggleCategory,
  onToggleCrossing
}: RouteCrossingsManagerPanelProps) {
  const [mounted, setMounted] = useState(false)
  const [isClosing, setIsClosing] = useState(false)
  const [collapsedRoutes, setCollapsedRoutes] = useState<Record<string, boolean>>({})
  const [selected, setSelected] = useState<SelectedCrossing | null>(null)

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (!open) {
      setSelected(null)
      setCollapsedRoutes({})
      setIsClosing(false)
    }
  }, [open])

  const handleClose = () => {
    setIsClosing(true)
    setTimeout(() => onClose(), 150)
  }

  const formatRouteName = (routeId: string) => routeId.replace(/\.geojson$/i, '').replace(/_/g, ' ')
  const catKey = (value: any) => String(value || 'unknown').trim().toLowerCase() || 'unknown'
  const crossingKey = (routeId: string, crossingId: string) => `${routeId}:${crossingId}`

  const routesWithCrossings = useMemo(() => {
    return loadedRoutes.map(r => ({
      ...r,
      crossings: crossingsByRouteId[r.routeId] ?? []
    }))
  }, [loadedRoutes, crossingsByRouteId])

  const totalCrossings = useMemo(() => {
    return routesWithCrossings.reduce((sum, r) => sum + r.crossings.length, 0)
  }, [routesWithCrossings])

  const formatPropsRows = (obj: Record<string, any> | undefined) => {
    if (!obj) return []
    return Object.keys(obj)
      .sort((a, b) => a.localeCompare(b))
      .map((k) => ({ key: k, value: obj[k] }))
  }

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
                <MapPin className="w-5 h-5 text-purple-200" />
              </div>
              <div className="flex flex-col">
                <div className="text-[10px] text-white/40 uppercase tracking-[0.2em]">
                  Routing Mode
                </div>
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-bold text-white uppercase tracking-wide">Crossings</h2>
                  <div className="px-2 py-0.5 bg-purple-500/10 border border-purple-500/20 rounded-sm text-[10px] text-purple-200">
                    {totalCrossings} total
                  </div>
                </div>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="p-2 hover:bg-white/5 border border-transparent hover:border-white/10 rounded-sm text-white/50 hover:text-white transition-all"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </header>

          {/* Body */}
          <div className="flex-1 min-h-0 flex">
            {/* Left: list */}
            <div className="w-[520px] border-r border-purple-500/15 min-h-0 flex flex-col">
              <div className="px-4 py-3 border-b border-white/10 bg-white/[0.02] text-[10px] text-white/40 uppercase tracking-wider">
                By route
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-2">
                {routesWithCrossings.length === 0 && (
                  <div className="p-6 text-center text-white/30 text-[11px]">
                    No routes loaded.
                  </div>
                )}

                {routesWithCrossings.map((route) => {
                  const isCollapsed = collapsedRoutes[route.routeId] ?? false
                  const groups = route.crossings.reduce<Record<string, RouteCrossingRecord[]>>((acc, c) => {
                    const k = c.category || 'unknown'
                    if (!acc[k]) acc[k] = []
                    acc[k].push(c)
                    return acc
                  }, {})

                  return (
                    <div key={route.routeId} className="border border-white/10 rounded-sm bg-black/20 overflow-hidden">
                      <button
                        type="button"
                        onClick={() =>
                          setCollapsedRoutes(prev => ({ ...prev, [route.routeId]: !isCollapsed }))
                        }
                        className="w-full flex items-center justify-between px-3 py-2 bg-white/[0.02] hover:bg-white/[0.04] transition-colors"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {isCollapsed ? (
                            <ChevronRight className="w-4 h-4 text-white/30 shrink-0" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-white/30 shrink-0" />
                          )}
                          <Route className={cn("w-4 h-4 shrink-0", route.visible ? "text-purple-300" : "text-white/20")} />
                          <span className="text-[11px] text-white truncate">
                            {formatRouteName(route.routeId)}
                          </span>
                        </div>
                        <div className="text-[9px] font-mono text-white/40 tabular-nums">
                          {route.crossings.length} crossings
                        </div>
                      </button>

                      {!isCollapsed && (
                        <div className="p-2 space-y-2">
                          {route.crossings.length === 0 ? (
                            <div className="px-2 py-2 text-[10px] text-white/30">
                              No crossings computed yet for this route.
                            </div>
                          ) : (
                            Object.entries(groups)
                              .sort(([a], [b]) => a.localeCompare(b))
                              .map(([category, items]) => (
                                <div key={category} className="border border-white/5 rounded-sm overflow-hidden">
                                  <div className="px-3 py-1.5 bg-black/30 flex items-center justify-between">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          onToggleCategory(catKey(category))
                                        }}
                                        className={cn(
                                          'p-1 rounded-sm border transition-colors',
                                          hiddenCategories[catKey(category)]
                                            ? 'border-white/10 bg-white/5 text-white/30 hover:text-white/60 hover:border-white/20'
                                            : 'border-purple-500/20 bg-purple-500/10 text-purple-200 hover:bg-purple-500/20 hover:border-purple-500/30'
                                        )}
                                        title={
                                          hiddenCategories[catKey(category)]
                                            ? 'Show markers for this category'
                                            : 'Hide markers for this category'
                                        }
                                      >
                                        {hiddenCategories[catKey(category)] ? (
                                          <EyeOff className="w-3.5 h-3.5" />
                                        ) : (
                                          <Eye className="w-3.5 h-3.5" />
                                        )}
                                      </button>
                                      <span className="text-[9px] font-bold uppercase tracking-wider text-white/40 truncate">
                                        {category}
                                      </span>
                                    </div>
                                    <span className="text-[9px] font-mono text-white/30 tabular-nums">{items.length}</span>
                                  </div>
                                  <div className="p-1 space-y-0.5">
                                    {items.map((c) => {
                                      const coord = c.point
                                      const isSelected =
                                        selected?.crossing.id === c.id && selected?.routeId === route.routeId
                                      const key = crossingKey(route.routeId, String(c.id))
                                      const hidden = Boolean(hiddenCategories[catKey(c.category)] || hiddenCrossingKeys[key])
                                      const label =
                                        (c.derived && (c.derived.name || c.derived.highway || c.derived.waterway || c.derived.railway)) ||
                                        c.feature_properties?.name ||
                                        c.feature_properties?.ref ||
                                        c.feature_id

                                      return (
                                        <div
                                          key={c.id}
                                          role="button"
                                          tabIndex={0}
                                          onClick={() => {
                                            setSelected({ routeId: route.routeId, crossing: c })
                                            if (Array.isArray(coord) && coord.length === 2) {
                                              onZoomToCrossing(coord[0], coord[1])
                                            }
                                          }}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                              e.preventDefault()
                                              setSelected({ routeId: route.routeId, crossing: c })
                                              if (Array.isArray(coord) && coord.length === 2) {
                                                onZoomToCrossing(coord[0], coord[1])
                                              }
                                            }
                                          }}
                                          className={cn(
                                            "w-full text-left flex items-center gap-2 p-2 rounded-sm border transition-all",
                                            isSelected
                                              ? "bg-purple-500/10 border-purple-500/30"
                                              : "bg-transparent border-transparent hover:bg-white/[0.03] hover:border-white/10",
                                            hidden && "opacity-50"
                                          )}
                                        >
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              onToggleCrossing(route.routeId, String(c.id))
                                            }}
                                            className={cn(
                                              'p-1 rounded-sm border transition-colors shrink-0',
                                              hidden
                                                ? 'border-white/10 bg-white/5 text-white/30 hover:text-white/60 hover:border-white/20'
                                                : 'border-purple-500/20 bg-purple-500/10 text-purple-200 hover:bg-purple-500/20 hover:border-purple-500/30'
                                            )}
                                            title={hidden ? 'Show this marker' : 'Hide this marker'}
                                          >
                                            {hidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                          </button>
                                          <MapPin className="w-3.5 h-3.5 text-purple-300/70 shrink-0" />
                                          <div className="flex-1 min-w-0">
                                            <div className="text-[10px] text-white/80 truncate" title={String(label)}>
                                              {String(label)}
                                            </div>
                                            <div className="text-[9px] font-mono text-white/30">
                                              {coord && coord.length === 2
                                                ? `${coord[1].toFixed(6)}, ${coord[0].toFixed(6)}`
                                                : '—'}
                                            </div>
                                          </div>
                                          {c.derived?.width_m !== undefined && (
                                            <div className="text-[9px] font-mono text-white/40 tabular-nums">
                                              {Number(c.derived.width_m).toFixed(1)} m
                                            </div>
                                          )}
                                        </div>
                                      )
                                    })}
                                  </div>
                                </div>
                              ))
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Right: inspector */}
            <div className="flex-1 min-h-0 flex flex-col">
              <div className="px-4 py-3 border-b border-white/10 bg-white/[0.02] flex items-center justify-between">
                <div className="text-[10px] font-bold text-white uppercase tracking-wider">Inspector</div>
                {selected && (
                  <div className="text-[9px] font-mono text-white/40 truncate max-w-[420px]" title={selected.crossing.id}>
                    {selected.crossing.id}
                  </div>
                )}
              </div>

              {!selected && (
                <div className="flex-1 flex flex-col items-center justify-center text-white/20 p-8">
                  <MapPin className="w-10 h-10 mb-3 opacity-20" />
                  <div className="text-[10px] uppercase tracking-widest">Select a crossing</div>
                </div>
              )}

              {selected && (
                <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
                  <div className="border border-white/10 rounded-sm bg-black/20 overflow-hidden">
                    <div className="px-3 py-2 border-b border-white/10 bg-white/[0.02] text-[10px] text-white/40 uppercase tracking-widest">
                      Properties
                    </div>
                    <div className="p-3 grid grid-cols-2 gap-2 text-[10px]">
                      <div className="text-white/50">Route</div>
                      <div className="text-white/80 font-mono truncate" title={selected.routeId}>
                        {formatRouteName(selected.routeId)}
                      </div>

                      <div className="text-white/50">Category</div>
                      <div className="text-purple-300 font-mono">{selected.crossing.category}</div>

                      <div className="text-white/50">Dataset</div>
                      <div className="text-white/70 font-mono break-all">{selected.crossing.dataset_layer}</div>

                      <div className="text-white/50">Feature ID</div>
                      <div className="text-white/70 font-mono break-all">{selected.crossing.feature_id}</div>

                      <div className="text-white/50">Coordinate</div>
                      <div className="text-white/80 font-mono">
                        {selected.crossing.point?.length === 2
                          ? `${selected.crossing.point[1].toFixed(6)}, ${selected.crossing.point[0].toFixed(6)}`
                          : '—'}
                      </div>
                    </div>
                  </div>

                  {selected.crossing.derived && Object.keys(selected.crossing.derived).length > 0 && (
                    <div className="border border-white/10 rounded-sm bg-black/20 overflow-hidden">
                      <div className="px-3 py-2 border-b border-white/10 bg-white/[0.02] text-[10px] text-white/40 uppercase tracking-widest">
                        Derived
                      </div>
                      <div className="p-3 overflow-auto max-h-48 border-t border-white/5">
                        <table className="w-full text-left border-collapse text-[10px]">
                          <tbody>
                            {formatPropsRows(selected.crossing.derived).map((row) => (
                              <tr key={row.key} className="border-b border-white/5 last:border-0 hover:bg-white/5">
                                <td className="py-1 px-2 font-medium text-white/50 border-r border-white/5 whitespace-nowrap w-40 bg-white/[0.02]">
                                  {row.key}
                                </td>
                                <td className="py-1 px-2 text-white/80 break-all font-mono">
                                  {typeof row.value === 'object' ? JSON.stringify(row.value) : String(row.value)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  <div className="border border-white/10 rounded-sm bg-black/20 overflow-hidden">
                    <div className="px-3 py-2 border-b border-white/10 bg-white/[0.02] text-[10px] text-white/40 uppercase tracking-widest">
                      Feature attributes
                    </div>
                    <div className="p-3">
                      {Object.keys(selected.crossing.feature_properties || {}).length === 0 ? (
                        <div className="text-[10px] text-white/30">No attributes.</div>
                      ) : (
                        <div className="overflow-auto max-h-64 border border-white/5 rounded-sm bg-black/40">
                          <table className="w-full text-left border-collapse text-[10px]">
                            <tbody>
                              {formatPropsRows(selected.crossing.feature_properties).map((row) => (
                                <tr key={row.key} className="border-b border-white/5 last:border-0 hover:bg-white/5">
                                  <td className="py-1 px-2 font-medium text-white/50 border-r border-white/5 whitespace-nowrap w-44 bg-white/[0.02]">
                                    {row.key}
                                  </td>
                                  <td className="py-1 px-2 text-white/80 break-all font-mono">
                                    {typeof row.value === 'object' ? JSON.stringify(row.value) : String(row.value)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="border border-white/10 rounded-sm bg-black/20 overflow-hidden">
                    <div className="px-3 py-2 border-b border-white/10 bg-white/[0.02] text-[10px] text-white/40 uppercase tracking-widest">
                      Intersection geometry
                    </div>
                    <pre className="bg-black/40 p-3 text-[9px] text-white/60 overflow-auto max-h-64 font-mono">
{JSON.stringify(selected.crossing.intersection, null, 2)}
                    </pre>
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




