'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Layers, MapPin, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { RouteCrossingRecord } from '@/lib/api/dataClient'

interface CrossingInfoDialogProps {
  open: boolean
  onClose: () => void
  routeId: string
  crossing: RouteCrossingRecord
  onOpenManager?: () => void
  onZoomToCrossing?: (lng: number, lat: number) => void
}

export function CrossingInfoDialog({
  open,
  onClose,
  routeId,
  crossing,
  onOpenManager,
  onZoomToCrossing
}: CrossingInfoDialogProps) {
  const [mounted, setMounted] = useState(false)
  const [isClosing, setIsClosing] = useState(false)

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (!open) {
      setIsClosing(false)
    }
  }, [open])

  const handleClose = () => {
    setIsClosing(true)
    setTimeout(() => onClose(), 150)
  }

  const formatRouteName = (value: string) => value.replace(/\.geojson$/i, '').replace(/_/g, ' ')

  const coord = crossing.point

  const formatPropsRows = (obj: Record<string, any> | undefined) => {
    if (!obj) return []
    return Object.keys(obj)
      .sort((a, b) => a.localeCompare(b))
      .map((k) => ({ key: k, value: obj[k] }))
  }

  const label = useMemo(() => {
    return (
      (crossing.derived && (crossing.derived.name || crossing.derived.highway || crossing.derived.waterway || crossing.derived.railway)) ||
      crossing.feature_properties?.name ||
      crossing.feature_properties?.ref ||
      crossing.feature_id
    )
  }, [crossing])

  if (!mounted || !open) return null

  return createPortal(
    <>
      <div
        className={cn(
          "fixed inset-0 bg-black/80 backdrop-blur-md z-[120]",
          isClosing ? "animate-fade-out" : "animate-fade-in"
        )}
        onClick={handleClose}
      />

      <div className="fixed inset-0 z-[121] flex items-center justify-center p-4 pointer-events-none font-mono">
        <div
          className={cn(
            "relative z-10 w-[760px] max-w-[96vw] max-h-[86vh] bg-[#0a0a0a]/95 border border-purple-500/20 rounded-sm shadow-[0_0_50px_-10px_rgba(147,51,234,0.35)] flex flex-col pointer-events-auto overflow-hidden",
            isClosing ? "animate-fade-out" : "animate-fade-in"
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <header className="px-5 py-4 border-b border-purple-500/20 flex items-center justify-between bg-purple-900/10 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2 bg-purple-500/15 rounded-sm border border-purple-500/20 shrink-0">
                <MapPin className="w-5 h-5 text-purple-200" />
              </div>
              <div className="flex flex-col min-w-0">
                <div className="text-[10px] text-white/40 uppercase tracking-[0.2em]">Routing Mode</div>
                <div className="flex items-center gap-3 min-w-0">
                  <h2 className="text-sm font-bold text-white uppercase tracking-wide truncate" title={String(label)}>
                    {String(label)}
                  </h2>
                  <div className="px-2 py-0.5 bg-purple-500/10 border border-purple-500/20 rounded-sm text-[10px] text-purple-200">
                    {crossing.category}
                  </div>
                </div>
                <div className="text-[9px] font-mono text-white/40 truncate" title={crossing.id}>
                  {crossing.id}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {Array.isArray(coord) && coord.length === 2 && onZoomToCrossing && (
                <button
                  onClick={() => onZoomToCrossing(coord[0], coord[1])}
                  className="px-2 py-1 bg-white/5 hover:bg-white/10 border border-white/10 rounded text-[9px] font-bold uppercase tracking-wider text-white/70 hover:text-white transition-colors"
                  title="Zoom to crossing"
                >
                  Zoom
                </button>
              )}

              {onOpenManager && (
                <button
                  onClick={() => onOpenManager()}
                  className="flex items-center gap-1.5 px-2 py-1 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/20 hover:border-purple-500/30 rounded text-[9px] font-medium text-purple-300 transition-colors"
                  title="Open Crossings Manager"
                >
                  <Layers className="w-3 h-3" />
                  Manager
                </button>
              )}

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
          <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
            <div className="border border-white/10 rounded-sm bg-black/20 overflow-hidden">
              <div className="px-3 py-2 border-b border-white/10 bg-white/[0.02] text-[10px] text-white/40 uppercase tracking-widest">
                Properties
              </div>
              <div className="p-3 grid grid-cols-2 gap-2 text-[10px]">
                <div className="text-white/50">Route</div>
                <div className="text-white/80 font-mono truncate" title={routeId}>
                  {formatRouteName(routeId)}
                </div>

                <div className="text-white/50">Category</div>
                <div className="text-purple-300 font-mono">{crossing.category}</div>

                <div className="text-white/50">Dataset</div>
                <div className="text-white/70 font-mono break-all">{crossing.dataset_layer}</div>

                <div className="text-white/50">Feature ID</div>
                <div className="text-white/70 font-mono break-all">{crossing.feature_id}</div>

                <div className="text-white/50">Coordinate</div>
                <div className="text-white/80 font-mono">
                  {coord?.length === 2 ? `${coord[1].toFixed(6)}, ${coord[0].toFixed(6)}` : '—'}
                </div>
              </div>
            </div>

            {crossing.derived && Object.keys(crossing.derived).length > 0 && (
              <div className="border border-white/10 rounded-sm bg-black/20 overflow-hidden">
                <div className="px-3 py-2 border-b border-white/10 bg-white/[0.02] text-[10px] text-white/40 uppercase tracking-widest">
                  Derived
                </div>
                <div className="p-3 overflow-auto max-h-56 border-t border-white/5">
                  <table className="w-full text-left border-collapse text-[10px]">
                    <tbody>
                      {formatPropsRows(crossing.derived).map((row) => (
                        <tr key={row.key} className="border-b border-white/5 last:border-0 hover:bg-white/5">
                          <td className="py-1 px-2 font-medium text-white/50 border-r border-white/5 whitespace-nowrap w-48 bg-white/[0.02]">
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
                {Object.keys(crossing.feature_properties || {}).length === 0 ? (
                  <div className="text-[10px] text-white/30">No attributes.</div>
                ) : (
                  <div className="overflow-auto max-h-64 border border-white/5 rounded-sm bg-black/40">
                    <table className="w-full text-left border-collapse text-[10px]">
                      <tbody>
                        {formatPropsRows(crossing.feature_properties).map((row) => (
                          <tr key={row.key} className="border-b border-white/5 last:border-0 hover:bg-white/5">
                            <td className="py-1 px-2 font-medium text-white/50 border-r border-white/5 whitespace-nowrap w-52 bg-white/[0.02]">
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
{JSON.stringify(crossing.intersection, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body
  )
}



