'use client'

import React from 'react'
import { Eye, EyeOff, Layers, Maximize2, Minimize2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface RouteStyleState {
  visible: boolean
  opacity: number
  color: string
}

interface PirlRouteManagerProps {
  routes: Array<{
    name: string
    style: RouteStyleState
  }>
  selectedRouteId: string | null
  onSelectRoute: (name: string) => void
  onToggleVisibility: (name: string) => void
  onOpacityChange: (name: string, opacity: number) => void
  onZoomToRoute: (name: string) => void
}

export function PirlRouteManager({
  routes,
  selectedRouteId,
  onSelectRoute,
  onToggleVisibility,
  onOpacityChange,
  onZoomToRoute
}: PirlRouteManagerProps) {
  const [isCollapsed, setIsCollapsed] = React.useState(false)

  if (isCollapsed) {
    return (
      <div className="absolute top-4 right-4 z-10">
        <div className="bg-black/80 backdrop-blur-md border border-white/20 rounded-sm p-2 shadow-[0_0_20px_-5px_rgba(0,0,0,0.5)] group hover:border-primary/50 transition-colors">
          <button
            onClick={() => setIsCollapsed(false)}
            className="flex items-center justify-center p-1 hover:bg-white/10 rounded-sm transition-colors text-white/70 hover:text-primary"
            title="Expand Route Manager"
          >
            <Layers className="w-5 h-5 group-hover:animate-pulse" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="absolute top-4 right-4 z-10 w-[300px] max-h-[calc(100%-2rem)] overflow-hidden font-mono">
      <div className="bg-[#0a0a0a]/95 backdrop-blur-xl border border-white/10 rounded-sm shadow-[0_0_30px_-10px_rgba(0,0,0,0.8)] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-3 py-3 border-b border-white/10 bg-white/[0.02]">
          <div className="flex items-center gap-2">
            <div className="p-1 bg-primary/10 rounded-sm">
              <Layers className="w-3.5 h-3.5 text-primary" />
            </div>
            <span className="text-xs font-bold text-white uppercase tracking-wider">Route Manager</span>
          </div>
          <button
            onClick={() => setIsCollapsed(true)}
            className="p-1 hover:bg-white/10 rounded-sm transition-colors text-white/50 hover:text-white"
            title="Collapse Route Manager"
          >
            <Minimize2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Route List */}
        <div className="p-1 space-y-0.5 overflow-y-auto max-h-[400px] bg-black/20">
          {routes.length === 0 ? (
            <div className="p-4 text-center text-white/40 text-xs">
              NO ROUTES LOADED
            </div>
          ) : (
            routes.map((route) => {
              const isSelected = selectedRouteId === route.name
              return (
                <div
                  key={route.name}
                  className={cn(
                    "group relative flex items-center gap-2 p-1.5 border transition-all duration-200 cursor-pointer select-none",
                    isSelected
                      ? "bg-white/[0.08] border-primary/40 shadow-[inset_2px_0_0_rgba(var(--primary),1)]"
                      : "bg-transparent border-transparent hover:bg-white/[0.04] hover:border-white/10"
                  )}
                  onClick={() => onSelectRoute(route.name)}
                  onDoubleClick={() => onZoomToRoute(route.name)}
                >
                  {/* Color Indicator */}
                  <div
                    className="w-3 h-3 rounded-sm shrink-0"
                    style={{ backgroundColor: route.style.color }}
                  />

                  {/* Visibility Toggle */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onToggleVisibility(route.name)
                    }}
                    className={cn(
                      "p-1 rounded-sm transition-colors shrink-0 z-10",
                      route.style.visible
                        ? "text-emerald-400 bg-emerald-400/10 hover:bg-emerald-400/20"
                        : "text-white/20 hover:text-white/40 hover:bg-white/5"
                    )}
                  >
                    {route.style.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                  </button>

                  {/* Content */}
                  <div className="flex-1 min-w-0 flex flex-col gap-0.5 z-10">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={cn(
                          "text-[11px] font-medium truncate tracking-wide",
                          isSelected ? "text-white" : "text-white/70 group-hover:text-white"
                        )}
                        title={route.name}
                      >
                        {route.name}
                      </span>
                      <div
                        className={cn(
                          "w-1.5 h-1.5 rounded-sm transition-colors",
                          route.style.visible ? "bg-emerald-500 shadow-[0_0_4px_rgba(16,185,129,0.8)]" : "bg-white/10"
                        )}
                      />
                    </div>

                    {/* Opacity Bar */}
                    <div className="relative h-1 w-full bg-white/5 rounded-full overflow-hidden">
                      <div
                        className={cn(
                          "absolute top-0 left-0 bottom-0 transition-all duration-300",
                          route.style.visible ? "bg-primary" : "bg-white/20"
                        )}
                        style={{ width: `${route.style.opacity * 100}%` }}
                      />
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={route.style.opacity}
                        onChange={(e) => onOpacityChange(route.name, Number(e.target.value))}
                        onClick={(e) => e.stopPropagation()}
                        className="absolute inset-0 w-full opacity-0 cursor-pointer"
                      />
                    </div>
                  </div>

                  <span className="text-[9px] w-7 text-right tabular-nums text-white/30 shrink-0 z-10">
                    {Math.round(route.style.opacity * 100)}%
                  </span>

                  {/* Zoom Button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onZoomToRoute(route.name)
                    }}
                    className="p-1 opacity-0 group-hover:opacity-100 hover:bg-white/10 rounded-sm transition-all text-white/50 hover:text-primary shrink-0 z-10"
                    title="Zoom to route"
                  >
                    <Maximize2 className="w-3 h-3" />
                  </button>
                </div>
              )
            })
          )}
        </div>

        {/* Footer Info */}
        {routes.length > 0 && (
          <div className="px-3 py-2 border-t border-white/10 bg-white/[0.02]">
            <div className="text-[9px] text-white/40 uppercase tracking-wider">
              {routes.length} Route{routes.length !== 1 ? 's' : ''} Loaded
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
