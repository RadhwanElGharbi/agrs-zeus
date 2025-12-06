import React, { useState } from 'react'
import { Layers, Eye, EyeOff, ArrowUp, ArrowDown, Info, Loader2, Table, Paintbrush, Minimize2, Box, Terminal } from 'lucide-react'
import { ManagedLayer, VectorDetail, formatMetadata } from '@/lib/map-utils'
import { cn } from '@/lib/utils'

interface LayerManagerProps {
  layers: ManagedLayer[]
  selectedLayerId: string | null
  loadingMessage: string | null
  currentProject: string | null
  vectorDetails: Record<string, VectorDetail>
  onSelectLayer: (id: string) => void
  onToggleVisibility: (id: string) => void
  onOpacityChange: (id: string, value: number) => void
  onMoveLayer: (id: string, direction: 'up' | 'down') => void
  onReorderLayers: (draggedId: string, targetId: string, position: 'above' | 'below') => void
  onOpenTable: (layerId: string) => void
  onOpenStyle: (layerId: string) => void
  onZoomToLayer: (layerId: string) => void
}

export function LayerManager({
  layers,
  selectedLayerId,
  loadingMessage,
  currentProject,
  vectorDetails,
  onSelectLayer,
  onToggleVisibility,
  onOpacityChange,
  onMoveLayer,
  onReorderLayers,
  onOpenTable,
  onOpenStyle,
  onZoomToLayer
}: LayerManagerProps) {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<{ id: string; position: 'above' | 'below' } | null>(null)

  const selectedLayer = layers.find(layer => layer.id === selectedLayerId)
  const selectedDetails = selectedLayer ? vectorDetails[selectedLayer.id] : null
  // Sort layers descending by order (Highest order = Top of list = Top of map)
  const orderedLayers = [...layers].sort((a, b) => b.order - a.order)

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedId(id)
    e.dataTransfer.effectAllowed = 'move'
    // Ghost image
    const ghost = document.createElement('div')
    ghost.style.width = '200px'
    ghost.style.height = '40px'
    ghost.style.backgroundColor = '#333'
    ghost.style.opacity = '0.8'
    ghost.innerText = layers.find(l => l.id === id)?.name || 'Layer'
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

  const handleDragLeave = () => {
    // Optional: Clear drop target if leaving the container, but tricky with child elements.
    // keeping simple for now.
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    if (draggedId && dropTarget) {
        onReorderLayers(draggedId, dropTarget.id, dropTarget.position)
    }
    setDraggedId(null)
    setDropTarget(null)
  }

  if (isCollapsed) {
    return (
      <div className="absolute top-4 right-4 z-10 flex flex-col gap-3">
        <div className="bg-black/80 backdrop-blur-md border border-white/20 rounded-sm p-2 shadow-[0_0_20px_-5px_rgba(0,0,0,0.5)] group hover:border-primary/50 transition-colors">
          <button
            onClick={() => setIsCollapsed(false)}
            className="flex items-center justify-center p-1 hover:bg-white/10 rounded-sm transition-colors text-white/70 hover:text-primary"
            title="Expand Layer Manager"
          >
            <Layers className="w-5 h-5 group-hover:animate-pulse" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="absolute top-4 right-4 z-10 flex flex-col gap-3 w-[380px] max-h-[calc(100%-2rem)] overflow-hidden font-mono">
      {/* Main Layer List Panel */}
      <div className="bg-[#0a0a0a]/95 backdrop-blur-xl border border-white/10 rounded-sm shadow-[0_0_30px_-10px_rgba(0,0,0,0.8)] flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-3 border-b border-white/10 bg-white/[0.02]">
          <div className="flex items-center gap-2">
            <div className="p-1 bg-primary/10 rounded-sm">
                <Layers className="w-3.5 h-3.5 text-primary" />
            </div>
            <span className="text-xs font-bold text-white uppercase tracking-wider">Layer Control</span>
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
              title="Collapse Layer Manager"
            >
              <Minimize2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Status / Empty State */}
        {!currentProject && (
          <div className="p-4 text-center text-white/40 text-xs border-b border-white/5">
            <Terminal className="w-8 h-8 mx-auto mb-2 opacity-20" />
            NO ACTIVE PROJECT LINKED
          </div>
        )}

        {currentProject && orderedLayers.length === 0 && (
          <div className="p-4 text-center text-white/40 text-xs border-b border-white/5">
            NO DATASETS IN BUFFER
          </div>
        )}

        {/* Layer List */}
        <div 
            className="p-1 space-y-0.5 overflow-y-auto max-h-[320px] bg-black/20"
            onMouseLeave={() => setDropTarget(null)}
        >
          {orderedLayers.map((layer) => {
            const isSelected = selectedLayerId === layer.id
            const isError = layer.status === 'error'
            const isDragged = draggedId === layer.id
            
            return (
            <div
              key={layer.id}
              draggable
              onDragStart={(e) => handleDragStart(e, layer.id)}
              onDragOver={(e) => handleDragOver(e, layer.id)}
              onDrop={handleDrop}
              title={layer.message || layer.name}
              className={cn(
                "group relative flex items-center gap-2 p-1.5 border transition-all duration-200 cursor-pointer select-none overflow-visible",
                isSelected 
                    ? "bg-white/[0.08] border-primary/40 shadow-[inset_2px_0_0_rgba(var(--primary),1)]" 
                    : "bg-transparent border-transparent hover:bg-white/[0.04] hover:border-white/10",
                isError && "bg-destructive/5 border-destructive/20",
                isDragged && "opacity-50"
              )}
              onClick={() => onSelectLayer(layer.id)}
              onDoubleClick={() => onZoomToLayer(layer.id)}
            >
              {/* Drop Indicators */}
              {dropTarget?.id === layer.id && (
                  <div 
                    className={cn(
                        "absolute left-0 right-0 h-0.5 bg-primary z-50 shadow-[0_0_8px_rgba(var(--primary),0.8)]",
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
                  onToggleVisibility(layer.id)
                }}
                className={cn(
                    "p-1 rounded-sm transition-colors shrink-0 z-10",
                    layer.visible 
                        ? "text-emerald-400 bg-emerald-400/10 hover:bg-emerald-400/20" 
                        : "text-white/20 hover:text-white/40 hover:bg-white/5"
                )}
              >
                {layer.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              </button>

              {/* Content */}
              <div className="flex-1 min-w-0 flex flex-col gap-0.5 z-10">
                <div className="flex items-center justify-between gap-2">
                    <span className={cn(
                        "text-[11px] font-medium truncate tracking-wide",
                        isError ? "text-destructive" : isSelected ? "text-white" : "text-white/70 group-hover:text-white"
                    )}>
                        {layer.name}
                    </span>
                    
                    {/* Status Indicator */}
                    {layer.status !== 'ready' ? (
                       <span className={cn(
                           "text-[9px] uppercase font-bold px-1 rounded-[2px]",
                           isError ? "bg-destructive/20 text-destructive" : "bg-amber-500/20 text-amber-500"
                       )}>
                          {isError ? "ERR" : "LOAD"}
                       </span>
                    ) : (
                        <div className={cn(
                            "w-1.5 h-1.5 rounded-sm transition-colors",
                            layer.visible ? "bg-emerald-500 shadow-[0_0_4px_rgba(16,185,129,0.8)]" : "bg-white/10"
                        )} />
                    )}
                </div>
                
                {/* Opacity Bar */}
                <div className="relative h-1 w-full bg-white/5 rounded-full overflow-hidden">
                    <div 
                        className={cn("absolute top-0 left-0 bottom-0 transition-all duration-300", layer.visible ? "bg-primary" : "bg-white/20")}
                        style={{ width: `${layer.opacity * 100}%` }}
                    />
                    <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={layer.opacity}
                        onChange={(e) => onOpacityChange(layer.id, Number(e.target.value))}
                        onClick={(e) => e.stopPropagation()}
                        className="absolute inset-0 w-full opacity-0 cursor-pointer"
                    />
                </div>
              </div>
              
              <span className="text-[9px] w-7 text-right tabular-nums text-white/30 shrink-0 z-10">
                  {Math.round(layer.opacity * 100)}%
              </span>

              {/* Reorder Controls */}
              <div className="flex flex-col -space-y-px opacity-0 group-hover:opacity-100 transition-opacity shrink-0 z-10">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onMoveLayer(layer.id, 'up')
                  }}
                  className="p-0.5 hover:bg-white/10 rounded-t-sm disabled:opacity-20 text-white/50 hover:text-primary"
                  disabled={orderedLayers[0]?.id === layer.id}
                >
                  <ArrowUp className="w-2.5 h-2.5" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onMoveLayer(layer.id, 'down')
                  }}
                  className="p-0.5 hover:bg-white/10 rounded-b-sm disabled:opacity-20 text-white/50 hover:text-primary"
                  disabled={orderedLayers[orderedLayers.length - 1]?.id === layer.id}
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
      <div className="bg-[#0a0a0a]/95 backdrop-blur-xl border border-white/10 rounded-sm shadow-xl flex-1 overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 bg-white/[0.02]">
          <div className="flex items-center gap-2 text-xs font-bold text-white uppercase tracking-wider">
            <Info className="w-3.5 h-3.5 text-primary" />
            <span>Inspector</span>
          </div>
          {selectedLayer && (
            <span className="text-[9px] font-mono text-white/40 uppercase px-1.5 py-0.5 border border-white/10 rounded-sm">
              {selectedLayer.type}
            </span>
          )}
        </div>

        {!selectedLayer && (
            <div className="flex-1 flex flex-col items-center justify-center text-white/20 p-6">
                <Box className="w-8 h-8 mb-2 opacity-20" />
                <span className="text-[10px] uppercase tracking-widest">Awaiting Selection</span>
            </div>
        )}

        {selectedLayer && (
          <div className="flex-1 overflow-y-auto p-3 space-y-4 bg-black/20">
            
            {/* Basic Info */}
            <div className="space-y-2">
                <div className="text-[10px] text-white/30 font-mono uppercase tracking-widest border-b border-white/5 pb-1">Properties</div>
                <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div className="text-white/50">Visibility State</div>
                    <div className={selectedLayer.visible ? "text-emerald-400" : "text-amber-500"}>{selectedLayer.visible ? 'ACTIVE' : 'HIDDEN'}</div>
                    
                    <div className="text-white/50">Opacity Level</div>
                    <div className="font-mono">{Math.round(selectedLayer.opacity * 100)}%</div>
                    
                    {selectedLayer.featureCount !== undefined && (
                        <>
                            <div className="text-white/50">Feature Count</div>
                            <div className="font-mono text-primary">{selectedLayer.featureCount}</div>
                        </>
                    )}
                    {selectedLayer.geometryType && (
                        <>
                            <div className="text-white/50">Geometry</div>
                            <div className="font-mono uppercase">{selectedLayer.geometryType}</div>
                        </>
                    )}
                </div>
            </div>

            {/* Metadata Table */}
            {selectedLayer.metadata && (
              <div className="space-y-2">
                <div className="text-[10px] text-white/30 font-mono uppercase tracking-widest border-b border-white/5 pb-1">Metadata</div>
                {formatMetadata(selectedLayer.metadata).length > 0 ? (
                  <div className="overflow-auto max-h-32 border border-white/5 rounded-sm bg-black/40">
                    <table className="w-full text-left border-collapse text-[10px]">
                      <tbody>
                        {formatMetadata(selectedLayer.metadata).map((row, idx) => (
                          <tr key={idx} className="border-b border-white/5 last:border-0 hover:bg-white/5">
                            <td className="py-1 px-2 font-medium text-white/50 border-r border-white/5 whitespace-nowrap w-20 bg-white/[0.02]">
                              {row.label}
                            </td>
                            <td className="py-1 px-2 text-white/80 break-all font-mono">
                              {row.value}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <pre className="bg-black/40 p-2 rounded-sm border border-white/5 text-[9px] text-white/60 overflow-x-auto font-mono">
                    {JSON.stringify(selectedLayer.metadata, null, 2)}
                  </pre>
                )}
              </div>
            )}

            {/* Actions */}
            {selectedDetails && selectedDetails.properties.length > 0 && (
              <div className="space-y-2 pt-2">
                 <div className="flex items-center justify-between">
                    <div className="text-[10px] text-white/30 font-mono uppercase tracking-widest">Data Actions</div>
                 </div>
                 <div className="flex gap-2">
                    <button
                        onClick={() => onOpenTable(selectedLayer.id)}
                        className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-white/5 border border-white/10 hover:bg-primary/10 hover:border-primary/30 hover:text-white text-white/70 rounded-sm transition-all text-[10px] uppercase font-bold tracking-wide"
                    >
                        <Table className="w-3 h-3" />
                        Data Table
                    </button>
                    <button
                        onClick={() => onOpenStyle(selectedLayer.id)}
                        className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-white/5 border border-white/10 hover:bg-primary/10 hover:border-primary/30 hover:text-white text-white/70 rounded-sm transition-all text-[10px] uppercase font-bold tracking-wide"
                    >
                        <Paintbrush className="w-3 h-3" />
                        Styler
                    </button>
                 </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
