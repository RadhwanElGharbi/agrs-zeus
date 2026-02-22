import React, { useEffect, useRef, useState } from 'react'
import { Box, Eye, EyeOff, ArrowUp, ArrowDown, Info, Loader2, MapPin, ChevronDown, Minus, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

export type CreatorManagerEntry = {
  id: string
  entryType: string
  title: string
  category: string
  categoryOther?: string | null
  comment?: string | null
  status?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  createdBy?: string | null
  updatedBy?: string | null
  visible: boolean
  opacity: number
  order: number
}

interface CreatorManagerProps {
  entries: CreatorManagerEntry[]
  selectedEntryId: string | null
  loadingMessage: string | null
  currentProject: string | null
  onSelectEntry: (id: string) => void
  onToggleVisibility: (id: string) => void
  onOpacityChange: (id: string, value: number) => void
  onMoveEntry: (id: string, direction: 'up' | 'down') => void
  onReorderEntries: (draggedId: string, targetId: string, position: 'above' | 'below') => void
  onOpenEntry: (id: string, x: number, y: number) => void
  onZoomToEntry: (id: string) => void
  // Optional external control for collapsed state
  collapsed?: boolean
  onCollapsedChange?: (collapsed: boolean) => void
}

export function CreatorManager({
  entries,
  selectedEntryId,
  loadingMessage,
  currentProject,
  onSelectEntry,
  onToggleVisibility,
  onOpacityChange,
  onMoveEntry,
  onReorderEntries,
  onOpenEntry,
  onZoomToEntry,
  collapsed: externalCollapsed,
  onCollapsedChange
}: CreatorManagerProps) {
  const [internalCollapsed, setInternalCollapsed] = useState(false)

  const isCollapsed = externalCollapsed !== undefined ? externalCollapsed : internalCollapsed
  const setIsCollapsed = (value: boolean) => {
    onCollapsedChange?.(value)
    setInternalCollapsed(value)
  }

  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<{ id: string; position: 'above' | 'below' } | null>(null)
  const inspectorScrollRef = useRef<HTMLDivElement | null>(null)

  const selectedEntry = entries.find((e) => e.id === selectedEntryId) ?? null
  const orderedEntries = [...entries].sort((a, b) => b.order - a.order)

  useEffect(() => {
    if (!selectedEntry?.id) return
    if (!inspectorScrollRef.current) return
    inspectorScrollRef.current.scrollTop = 0
  }, [selectedEntry?.id])

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedId(id)
    e.dataTransfer.effectAllowed = 'move'
    const ghost = document.createElement('div')
    ghost.style.width = '220px'
    ghost.style.height = '40px'
    ghost.style.backgroundColor = '#333'
    ghost.style.opacity = '0.8'
    ghost.innerText = orderedEntries.find((en) => en.id === id)?.title || 'Operator Entry'
    ghost.style.position = 'absolute'
    ghost.style.top = '-1000px'
    document.body.appendChild(ghost)
    e.dataTransfer.setDragImage(ghost, 0, 0)
    setTimeout(() => document.body.removeChild(ghost), 0)
  }

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault()
    if (id === draggedId) {
      setDropTarget(null)
      return
    }

    const rect = e.currentTarget.getBoundingClientRect()
    const midY = rect.top + rect.height / 2
    const position = e.clientY < midY ? 'above' : 'below'
    setDropTarget({ id, position })
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    if (draggedId && dropTarget) {
      onReorderEntries(draggedId, dropTarget.id, dropTarget.position)
    }
    setDraggedId(null)
    setDropTarget(null)
  }

  const clampOpacity = (value: number) => {
    return Math.min(1, Math.max(0, Math.round(value * 100) / 100))
  }

  if (isCollapsed) {
    return (
      <div className="w-full border-b border-white/[0.06] bg-white/[0.02] group hover:bg-white/[0.04] transition-colors">
        <button
          onClick={() => setIsCollapsed(false)}
          className="w-full flex items-center gap-2.5 px-4 py-2.5 text-white/50 hover:text-amber-300 transition-colors"
          title="Expand Operator Manager"
        >
          <Box className="w-4 h-4 shrink-0" />
          <span className="text-[10px] font-mono font-medium uppercase tracking-wider">Operator Control</span>
          <ChevronDown className="w-3 h-3 ml-auto" />
        </button>
      </div>
    )
  }

  return (
    <div className="w-full h-full min-h-0 font-mono flex flex-col">
      {/* Main List Panel */}
      <div className={cn("bg-transparent flex flex-col min-h-0", selectedEntry ? "h-2/3" : "flex-1")}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
          <div className="flex items-center gap-2">
            <div className="p-1 bg-amber-500/10 rounded-sm">
              <Box className="w-3.5 h-3.5 text-amber-300" />
            </div>
            <span className="text-[11px] font-semibold text-white/90 uppercase tracking-wider">Operator Control</span>
          </div>
          <div className="flex items-center gap-2">
            {loadingMessage && (
              <div className="flex items-center gap-1.5 px-2 py-0.5 bg-amber-500/10 border border-amber-500/20 rounded-sm">
                <Loader2 className="w-3 h-3 animate-spin text-amber-500" />
                <span className="text-[10px] text-amber-500 uppercase tracking-wider">{loadingMessage}</span>
              </div>
            )}
            <button
              onClick={() => setIsCollapsed(true)}
              className="p-1 hover:bg-white/10 rounded-sm transition-colors text-white/40 hover:text-white"
              title="Collapse Operator Manager"
            >
              <ChevronDown className="w-3.5 h-3.5 rotate-180" />
            </button>
          </div>
        </div>

        {/* Status / Empty State */}
        {!currentProject && (
          <div className="p-4 text-center text-white/40 text-xs border-b border-white/5">
            <Box className="w-8 h-8 mx-auto mb-2 opacity-20" />
            NO ACTIVE PROJECT LINKED
          </div>
        )}

        {currentProject && orderedEntries.length === 0 && (
          <div className="p-4 text-center text-white/40 text-xs border-b border-white/5">
            NO OPERATOR ENTRIES
          </div>
        )}

        {/* Entry List */}
        <div
          className="px-2 py-2 space-y-1 flex-1 min-h-0 overflow-y-auto"
          onMouseLeave={() => setDropTarget(null)}
        >
          {orderedEntries.map((entry) => {
            const isSelected = selectedEntryId === entry.id
            const isDragged = draggedId === entry.id
            const isDeleted = (entry.status ?? '').toLowerCase() === 'deleted'

            return (
              <div
                key={entry.id}
                draggable
                onDragStart={(e) => handleDragStart(e, entry.id)}
                onDragOver={(e) => handleDragOver(e, entry.id)}
                onDrop={handleDrop}
                title={entry.title || entry.id}
                className={cn(
                  "group relative flex items-start gap-2.5 px-3 py-2.5 border rounded-none transition-all duration-150 cursor-pointer select-none",
                  isSelected
                    ? "bg-amber-500/[0.08] border-amber-500/25"
                    : "bg-white/[0.02] border-white/[0.05] hover:bg-white/[0.05] hover:border-white/[0.1]",
                  isDeleted && "bg-destructive/[0.06] border-destructive/20",
                  isDragged && "opacity-40 scale-[0.98]"
                )}
                onClick={(e) => {
                  onSelectEntry(entry.id)
                }}
                onDoubleClick={() => onZoomToEntry(entry.id)}
              >
                {/* Drop Indicators */}
                {dropTarget?.id === entry.id && (
                  <div
                    className={cn(
                      "absolute left-0 right-0 h-0.5 bg-amber-400 z-50 shadow-[0_0_8px_rgba(245,158,11,0.6)]",
                      dropTarget.position === 'above' ? "top-0" : "bottom-0"
                    )}
                  />
                )}

                {/* Left accent bar for selected */}
                {isSelected && (
                  <div className="absolute left-0 top-1.5 bottom-1.5 w-[2px] bg-amber-400 rounded-full" />
                )}

                {/* Visibility Toggle */}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggleVisibility(entry.id)
                  }}
                  className={cn(
                    "mt-0.5 p-1 rounded transition-colors shrink-0 z-10",
                    entry.visible
                      ? "text-emerald-400 bg-emerald-500/10"
                      : "text-white/20 hover:text-white/40"
                  )}
                >
                  {entry.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                </button>

                {/* Content */}
                <div className="flex-1 min-w-0 flex flex-col gap-1.5 z-10">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={cn(
                        "text-[11px] font-medium truncate leading-tight",
                        isDeleted ? "text-destructive" : isSelected ? "text-white" : "text-white/80 group-hover:text-white"
                      )}
                    >
                      {entry.title || entry.id}
                    </span>

                    {/* Type badge */}
                    <span className="text-[8px] uppercase font-bold px-1.5 py-0.5 rounded-sm shrink-0 bg-amber-500/10 text-amber-400/70 border border-amber-500/15">
                      {entry.entryType || 'ENTRY'}
                    </span>
                  </div>

                  {/* Category subtitle */}
                  {entry.category && (
                    <span className="text-[9px] text-white/35 truncate leading-none">
                      {entry.category}{entry.categoryOther ? ` · ${entry.categoryOther}` : ''}
                    </span>
                  )}

                  {isSelected && (
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          onOpacityChange(entry.id, clampOpacity(entry.opacity - 0.1))
                        }}
                        className="p-0.5 rounded-sm text-white/35 hover:text-white/70 hover:bg-white/10 transition-colors shrink-0"
                        title="Decrease opacity"
                      >
                        <Minus className="w-3 h-3" />
                      </button>

                      <div className="relative h-5 flex-1">
                        <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-1 rounded-full bg-white/[0.08]" />
                        <div
                          className={cn(
                            "absolute left-0 top-1/2 -translate-y-1/2 h-1 rounded-full transition-all duration-200",
                            entry.visible ? "bg-amber-400/75" : "bg-white/20"
                          )}
                          style={{ width: `${entry.opacity * 100}%` }}
                        />
                        <div
                          className={cn(
                            "absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full border shadow-sm transition-colors",
                            entry.visible
                              ? "bg-amber-400 border-amber-300 shadow-[0_0_8px_rgba(245,158,11,0.35)]"
                              : "bg-white/20 border-white/30"
                          )}
                          style={{ left: `${entry.opacity * 100}%` }}
                        />
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.05}
                          value={entry.opacity}
                          onChange={(e) => onOpacityChange(entry.id, Number(e.target.value))}
                          onClick={(e) => e.stopPropagation()}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize"
                          title="Entry opacity"
                        />
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          onOpacityChange(entry.id, clampOpacity(entry.opacity + 0.1))
                        }}
                        className="p-0.5 rounded-sm text-white/35 hover:text-white/70 hover:bg-white/10 transition-colors shrink-0"
                        title="Increase opacity"
                      >
                        <Plus className="w-3 h-3" />
                      </button>

                      <span className="text-[8px] w-7 text-right tabular-nums text-white/35 shrink-0">
                        {Math.round(entry.opacity * 100)}%
                      </span>
                    </div>
                  )}
                </div>

                {/* Reorder Controls */}
                <div className="flex flex-col -space-y-px opacity-0 group-hover:opacity-100 transition-opacity shrink-0 z-10 mt-0.5">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onMoveEntry(entry.id, 'up')
                    }}
                    className="p-0.5 hover:bg-white/10 rounded-t-sm disabled:opacity-20 text-white/30 hover:text-amber-300"
                    disabled={orderedEntries[0]?.id === entry.id}
                  >
                    <ArrowUp className="w-2.5 h-2.5" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onMoveEntry(entry.id, 'down')
                    }}
                    className="p-0.5 hover:bg-white/10 rounded-b-sm disabled:opacity-20 text-white/30 hover:text-amber-300"
                    disabled={orderedEntries[orderedEntries.length - 1]?.id === entry.id}
                  >
                    <ArrowDown className="w-2.5 h-2.5" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {selectedEntry && (
        <div className="h-1/3 min-h-[180px] border-t border-white/[0.06] bg-transparent flex flex-col">
          <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 bg-white/[0.02]">
            <div className="flex items-center gap-2 text-xs font-bold text-white uppercase tracking-wider">
              <Info className="w-3.5 h-3.5 text-amber-300" />
              <span>Inspector</span>
            </div>
            <span className="text-[9px] font-mono text-white/40 uppercase px-1.5 py-0.5 border border-white/10 rounded-sm">
              {selectedEntry.entryType}
            </span>
          </div>

          <div ref={inspectorScrollRef} className="flex-1 min-h-0 overflow-y-auto p-3 bg-black/20 flex flex-col gap-4">
            {/* Basic Info */}
            <div className="space-y-2 shrink-0">
              <div className="text-[10px] text-white/30 font-mono uppercase tracking-widest border-b border-white/5 pb-1">Properties</div>
              <div className="grid grid-cols-2 gap-2 text-[10px]">
                <div className="text-white/50">Visibility State</div>
                <div className={selectedEntry.visible ? "text-emerald-400" : "text-amber-500"}>
                  {selectedEntry.visible ? 'ACTIVE' : 'HIDDEN'}
                </div>

                <div className="text-white/50">Opacity Level</div>
                <div className="font-mono">{Math.round(selectedEntry.opacity * 100)}%</div>

                <div className="text-white/50">Category</div>
                <div className="font-mono text-white/80">
                  {selectedEntry.category}
                  {selectedEntry.category === 'Other' && selectedEntry.categoryOther ? ` (${selectedEntry.categoryOther})` : ''}
                </div>

                {selectedEntry.status && (
                  <>
                    <div className="text-white/50">Status</div>
                    <div className="font-mono text-white/80 uppercase">{selectedEntry.status}</div>
                  </>
                )}

                {selectedEntry.updatedAt && (
                  <>
                    <div className="text-white/50">Updated</div>
                    <div className="font-mono text-white/70">{selectedEntry.updatedAt}</div>
                  </>
                )}
              </div>
            </div>

            {/* Comment */}
            {selectedEntry.comment && (
              <div className="space-y-2">
                <div className="text-[10px] text-white/30 font-mono uppercase tracking-widest border-b border-white/5 pb-1">Comment</div>
                <pre className="bg-black/40 p-2 rounded-sm border border-white/5 text-[10px] text-white/70 overflow-x-auto font-mono whitespace-pre-wrap">
                  {selectedEntry.comment}
                </pre>
              </div>
            )}

            {/* Actions */}
            <div className="space-y-2 pt-2 shrink-0">
              <div className="text-[10px] text-white/30 font-mono uppercase tracking-widest">Entry Actions</div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const x = typeof window !== 'undefined' ? Math.max(16, window.innerWidth - 460) : 0
                    const y = 120
                    onOpenEntry(selectedEntry.id, x, y)
                  }}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-white/5 border border-white/10 hover:bg-amber-500/10 hover:border-amber-500/30 hover:text-white text-white/70 rounded-sm transition-all text-[10px] uppercase font-bold tracking-wide"
                >
                  <Box className="w-3 h-3" />
                  Open
                </button>
                <button
                  onClick={() => onZoomToEntry(selectedEntry.id)}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-white/5 border border-white/10 hover:bg-amber-500/10 hover:border-amber-500/30 hover:text-white text-white/70 rounded-sm transition-all text-[10px] uppercase font-bold tracking-wide"
                >
                  <MapPin className="w-3 h-3" />
                  Zoom
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


