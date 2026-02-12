import React, { useState } from 'react'
import { Box, Eye, EyeOff, ArrowUp, ArrowDown, Info, Loader2, Minimize2, MapPin } from 'lucide-react'
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

  const selectedEntry = entries.find((e) => e.id === selectedEntryId) ?? null
  const orderedEntries = [...entries].sort((a, b) => b.order - a.order)

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

  if (isCollapsed) {
    return (
      <div className="relative bg-black/80 backdrop-blur-md border border-white/20 rounded-sm p-2 shadow-[0_0_20px_-5px_rgba(0,0,0,0.5)] group hover:border-amber-500/40 transition-colors">
        <button
          onClick={() => setIsCollapsed(false)}
          className="flex items-center justify-center p-1 hover:bg-white/10 rounded-sm transition-colors text-white/70 hover:text-amber-300"
          title="Expand Operator Manager"
        >
          <Box className="w-5 h-5 group-hover:animate-pulse" />
        </button>
      </div>
    )
  }

  return (
    <div className="w-[320px] xl:w-[380px] max-h-[calc(100vh-200px)] overflow-hidden font-mono flex flex-col">
      {/* Main List Panel */}
      <div className="bg-[#0a0a0a]/95 backdrop-blur-xl border border-white/10 rounded-sm shadow-[0_0_30px_-10px_rgba(0,0,0,0.8)] flex flex-col overflow-hidden flex-shrink-0">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-3 border-b border-white/10 bg-white/[0.02]">
          <div className="flex items-center gap-2">
            <div className="p-1 bg-amber-500/10 rounded-sm">
              <Box className="w-3.5 h-3.5 text-amber-300" />
            </div>
            <span className="text-xs font-bold text-white uppercase tracking-wider">Operator Control</span>
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
              className="p-1 hover:bg-white/10 rounded-sm transition-colors text-white/50 hover:text-white"
              title="Collapse Operator Manager"
            >
              <Minimize2 className="w-3.5 h-3.5" />
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
          className="p-1 space-y-0.5 overflow-y-auto max-h-[200px] xl:max-h-[280px] bg-black/20"
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
                  "group relative flex items-center gap-2 p-1.5 border transition-all duration-200 cursor-pointer select-none overflow-visible",
                  isSelected
                    ? "bg-white/[0.08] border-amber-500/40 shadow-[inset_2px_0_0_rgba(245,158,11,1)]"
                    : "bg-transparent border-transparent hover:bg-white/[0.04] hover:border-white/10",
                  isDeleted && "bg-destructive/5 border-destructive/20",
                  isDragged && "opacity-50"
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

                {/* Scan line overlay for selected item */}
                {isSelected && (
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.02] to-transparent pointer-events-none" />
                )}

                {/* Visibility Toggle */}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggleVisibility(entry.id)
                  }}
                  className={cn(
                    "p-1 rounded-sm transition-colors shrink-0 z-10",
                    entry.visible
                      ? "text-emerald-400 bg-emerald-400/10 hover:bg-emerald-400/20"
                      : "text-white/20 hover:text-white/40 hover:bg-white/5"
                  )}
                >
                  {entry.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                </button>

                {/* Content */}
                <div className="flex-1 min-w-0 flex flex-col gap-0.5 z-10">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={cn(
                        "text-[11px] font-medium truncate tracking-wide",
                        isDeleted ? "text-destructive" : isSelected ? "text-white" : "text-white/70 group-hover:text-white"
                      )}
                    >
                      {entry.title || entry.id}
                    </span>

                    {/* Type/Status */}
                    <span className="text-[9px] uppercase font-bold px-1 rounded-[2px] bg-white/5 text-white/60 border border-white/10">
                      {entry.entryType || 'ENTRY'}
                    </span>
                  </div>

                  {/* Opacity Bar */}
                  <div className="relative h-1 w-full bg-white/5 rounded-full overflow-hidden">
                    <div
                      className={cn("absolute top-0 left-0 bottom-0 transition-all duration-300", entry.visible ? "bg-amber-400" : "bg-white/20")}
                      style={{ width: `${entry.opacity * 100}%` }}
                    />
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={entry.opacity}
                      onChange={(e) => onOpacityChange(entry.id, Number(e.target.value))}
                      onClick={(e) => e.stopPropagation()}
                      className="absolute inset-0 w-full opacity-0 cursor-pointer"
                    />
                  </div>
                </div>

                <span className="text-[9px] w-7 text-right tabular-nums text-white/30 shrink-0 z-10">
                  {Math.round(entry.opacity * 100)}%
                </span>

                {/* Reorder Controls */}
                <div className="flex flex-col -space-y-px opacity-0 group-hover:opacity-100 transition-opacity shrink-0 z-10">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onMoveEntry(entry.id, 'up')
                    }}
                    className="p-0.5 hover:bg-white/10 rounded-t-sm disabled:opacity-20 text-white/50 hover:text-amber-300"
                    disabled={orderedEntries[0]?.id === entry.id}
                  >
                    <ArrowUp className="w-2.5 h-2.5" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onMoveEntry(entry.id, 'down')
                    }}
                    className="p-0.5 hover:bg-white/10 rounded-b-sm disabled:opacity-20 text-white/50 hover:text-amber-300"
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

      {/* Detail Inspector Panel */}
      <div className="mt-3 bg-[#0a0a0a]/95 backdrop-blur-xl border border-white/10 rounded-sm shadow-xl flex-1 overflow-hidden flex flex-col min-h-0">
        <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 bg-white/[0.02]">
          <div className="flex items-center gap-2 text-xs font-bold text-white uppercase tracking-wider">
            <Info className="w-3.5 h-3.5 text-amber-300" />
            <span>Inspector</span>
          </div>
          {selectedEntry && (
            <span className="text-[9px] font-mono text-white/40 uppercase px-1.5 py-0.5 border border-white/10 rounded-sm">
              {selectedEntry.entryType}
            </span>
          )}
        </div>

        {!selectedEntry && (
          <div className="flex-1 flex flex-col items-center justify-center text-white/20 p-6">
            <Box className="w-8 h-8 mb-2 opacity-20" />
            <span className="text-[10px] uppercase tracking-widest">Awaiting Selection</span>
          </div>
        )}

        {selectedEntry && (
          <div className="flex-1 p-3 bg-black/20 overflow-hidden flex flex-col gap-4 min-h-0">
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
              <div className="space-y-2 flex-1 min-h-0 overflow-hidden">
                <div className="text-[10px] text-white/30 font-mono uppercase tracking-widest border-b border-white/5 pb-1">Comment</div>
                <pre className="flex-1 min-h-0 bg-black/40 p-2 rounded-sm border border-white/5 text-[10px] text-white/70 overflow-auto font-mono whitespace-pre-wrap">
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
        )}
      </div>
    </div>
  )
}


