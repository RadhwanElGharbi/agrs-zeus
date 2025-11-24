import React, { useState } from 'react'
import { Layers, Eye, EyeOff, ArrowUp, ArrowDown, Info, Loader2, Table, ExternalLink, Paintbrush, Minimize2, Maximize2 } from 'lucide-react'
import { ManagedLayer, VectorDetail, formatMetadata } from '@/lib/map-utils'

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
  onOpenTable: (layerId: string) => void
  onOpenStyle: (layerId: string) => void
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
  onOpenTable,
  onOpenStyle
}: LayerManagerProps) {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const selectedLayer = layers.find(layer => layer.id === selectedLayerId)
  const selectedDetails = selectedLayer ? vectorDetails[selectedLayer.id] : null
  // Sort layers descending by order (Highest order = Top of list = Top of map)
  const orderedLayers = [...layers].sort((a, b) => b.order - a.order)

  if (isCollapsed) {
    return (
      <div className="absolute top-4 right-4 z-10 flex flex-col gap-3">
        <div className="bg-card border border-border rounded-lg p-2 shadow-xl">
          <button
            onClick={() => setIsCollapsed(false)}
            className="flex items-center justify-center p-1 hover:bg-accent rounded transition-colors"
            title="Expand Layer Manager"
          >
            <Layers className="w-5 h-5" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="absolute top-4 right-4 z-10 flex flex-col gap-3 w-[380px] max-h-[calc(100%-2rem)] overflow-hidden">
      <div className="bg-card/95 border border-border rounded-lg p-4 shadow-xl space-y-3 text-xs">
        <div className="flex items-center justify-between">
          <div className="font-semibold text-sm flex items-center gap-2">
            <Layers className="w-4 h-4" />
            Layer Manager
          </div>
          <div className="flex items-center gap-2">
            {loadingMessage && (
              <div className="flex items-center gap-1 text-amber-500 text-[11px]">
                <Loader2 className="w-3 h-3 animate-spin" />
                {loadingMessage}
              </div>
            )}
            <button
              onClick={() => setIsCollapsed(true)}
              className="p-1 hover:bg-accent rounded transition-colors"
              title="Collapse Layer Manager"
            >
              <Minimize2 className="w-3 h-3" />
            </button>
          </div>
        </div>

        {!currentProject && (
          <div className="text-muted-foreground text-xs">Select a project to load datasets.</div>
        )}

        {currentProject && orderedLayers.length === 0 && (
          <div className="text-muted-foreground text-xs">
            No datasets discovered yet. The project folder must follow the standard.
          </div>
        )}

        <div className="space-y-2 overflow-y-auto pr-1" style={{ maxHeight: '320px' }}>
          {orderedLayers.map((layer) => (
            <div
              key={layer.id}
              className={`border rounded-md p-2 transition-colors ${selectedLayerId === layer.id ? 'border-primary bg-primary/5' : 'border-border bg-card/80 hover:border-primary/40'}`}
              onClick={() => onSelectLayer(layer.id)}
            >
              <div className="flex items-start gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggleVisibility(layer.id)
                  }}
                  className="p-1 rounded hover:bg-accent"
                >
                  {layer.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4 text-muted-foreground" />}
                </button>
                <div className="flex-1 space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium truncate">{layer.name}</div>
                    <span className="text-[11px] uppercase text-muted-foreground">{layer.type}</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground flex items-center gap-2">
                    <span className={layer.status === 'ready' ? 'text-emerald-400' : layer.status === 'error' ? 'text-destructive' : 'text-amber-500'}>
                      {layer.status}
                    </span>
                    {layer.featureCount !== undefined && (
                      <span>· {layer.featureCount} features</span>
                    )}
                    {layer.message && <span>· {layer.message}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={layer.opacity}
                      onChange={(e) => onOpacityChange(layer.id, Number(e.target.value))}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full"
                    />
                    <span className="text-[11px] w-10 text-right">{Math.round(layer.opacity * 100)}%</span>
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onMoveLayer(layer.id, 'up')
                    }}
                    className="p-1 rounded hover:bg-accent disabled:opacity-40"
                    // Disabled if already at top (highest order)
                    disabled={orderedLayers[0]?.id === layer.id}
                    title="Move up (bring forward)"
                  >
                    <ArrowUp className="w-4 h-4" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onMoveLayer(layer.id, 'down')
                    }}
                    className="p-1 rounded hover:bg-accent disabled:opacity-40"
                    // Disabled if at bottom (lowest order)
                    disabled={orderedLayers[orderedLayers.length - 1]?.id === layer.id}
                    title="Move down (send backward)"
                  >
                    <ArrowDown className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Layer Detail + Attributes */}
      <div className="bg-card/95 border border-border rounded-lg p-4 shadow-xl space-y-3 text-xs overflow-hidden flex-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Info className="w-4 h-4" />
            Layer Details
          </div>
          {selectedLayer && (
            <span className="text-[11px] text-muted-foreground uppercase">
              {selectedLayer.type}
            </span>
          )}
        </div>

        {!selectedLayer && (
          <div className="text-muted-foreground text-xs">
            Select a layer above to inspect its properties and attributes.
          </div>
        )}

        {selectedLayer && (
          <div className="space-y-2">
            <div className="text-sm font-medium">{selectedLayer.name}</div>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="text-muted-foreground">Visibility</div>
              <div>{selectedLayer.visible ? 'On' : 'Off'}</div>
              <div className="text-muted-foreground">Opacity</div>
              <div>{Math.round(selectedLayer.opacity * 100)}%</div>
              {selectedLayer.featureCount !== undefined && (
                <>
                  <div className="text-muted-foreground">Features</div>
                  <div>{selectedLayer.featureCount}</div>
                </>
              )}
              {selectedLayer.geometryType && (
                <>
                  <div className="text-muted-foreground">Geometry</div>
                  <div>{selectedLayer.geometryType}</div>
                </>
              )}
            </div>
            {selectedLayer.path && (
              <div className="text-[11px]">
                <span className="text-muted-foreground">Path: </span>
                <span className="break-all">{selectedLayer.path}</span>
              </div>
            )}
            {selectedLayer.metadata && (
              <div className="text-[11px] space-y-1 border-t border-border pt-2 mt-2">
                <div className="text-muted-foreground mb-1">Metadata</div>
                {formatMetadata(selectedLayer.metadata).length > 0 ? (
                  <div className="overflow-auto max-h-40 border border-border rounded-md">
                    <table className="w-full text-left border-collapse">
                      <tbody>
                        {formatMetadata(selectedLayer.metadata).map((row, idx) => (
                          <tr key={idx} className="border-b border-border/50 last:border-0 hover:bg-muted/30">
                            <td className="py-1.5 px-2 font-medium text-muted-foreground whitespace-nowrap align-top w-24 bg-muted/10">
                              {row.label}
                            </td>
                            <td className="py-1.5 px-2 break-words">
                              {row.value}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <pre className="bg-muted/60 p-2 rounded-md max-h-32 overflow-auto text-[11px] whitespace-pre-wrap">
                    {JSON.stringify(selectedLayer.metadata, null, 2)}
                  </pre>
                )}
              </div>
            )}

            {selectedDetails && selectedDetails.properties.length > 0 && (
              <div className="border-t border-border pt-2 space-y-2">
                <div className="flex items-center justify-between text-sm font-semibold">
                  <div className="flex items-center gap-2">
                    <Table className="w-4 h-4" />
                    Attribute sample
                  </div>
                  <button
                    onClick={() => onOpenTable(selectedLayer.id)}
                    className="text-xs font-medium flex items-center gap-1 text-foreground hover:underline"
                  >
                    Open full table
                    <ExternalLink className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => onOpenStyle(selectedLayer.id)}
                    className="text-xs font-medium flex items-center gap-1 text-foreground hover:underline"
                  >
                    Style layer
                    <Paintbrush className="w-3 h-3" />
                  </button>
                </div>
                <div className="overflow-auto border border-border rounded-md max-h-56">
                  <table className="min-w-full text-[11px]">
                    <thead className="bg-muted/60 sticky top-0">
                      <tr>
                        {selectedDetails.properties.slice(0, 10).map((prop) => (
                          <th key={prop} className="px-2 py-1 text-left font-semibold">
                            {prop}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {selectedDetails.sample.map((row, idx) => (
                        <tr key={idx} className="odd:bg-background even:bg-muted/30">
                          {selectedDetails.properties.slice(0, 10).map((prop) => (
                            <td key={prop} className="px-2 py-1 whitespace-nowrap">
                              {row?.[prop] !== undefined ? String(row[prop]) : ''}
                            </td>
                          ))}
                        </tr>
                      ))}
                      {selectedDetails.sample.length === 0 && (
                        <tr>
                          <td className="px-2 py-2 text-muted-foreground" colSpan={selectedDetails.properties.length}>
                            No attribute rows available for this layer.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
