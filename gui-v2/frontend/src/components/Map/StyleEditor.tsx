import React from 'react'
import { Paintbrush } from 'lucide-react'
import { LayerStyleOptions } from '@/lib/map-utils'

interface StyleEditorProps {
  styleDraft: LayerStyleOptions
  onChange: (style: LayerStyleOptions) => void
  onApply: () => void
  onReset: () => void
  onCancel: () => void
}

export function StyleEditor({
  styleDraft,
  onChange,
  onApply,
  onReset,
  onCancel
}: StyleEditorProps) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card text-foreground border border-border rounded-lg shadow-2xl max-w-lg w-full max-h-[80vh] overflow-auto p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold flex items-center gap-2">
            <Paintbrush className="w-4 h-4" />
            Layer style
          </div>
          <div className="flex items-center gap-3 text-xs">
            <button
              onClick={onReset}
              className="text-primary hover:underline"
            >
              Reset
            </button>
            <button
              onClick={onCancel}
              className="text-primary hover:underline"
            >
              Close
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <label className="flex flex-col gap-1">
            <span className="text-muted-foreground">Fill color</span>
            <input
              type="color"
              value={styleDraft.fillColor ?? '#22d3ee'}
              onChange={(e) => onChange({ ...styleDraft, fillColor: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-muted-foreground">Fill opacity</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={styleDraft.opacity ?? 1}
              onChange={(e) => onChange({ ...styleDraft, opacity: Number(e.target.value) })}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-muted-foreground">Line color</span>
            <input
              type="color"
              value={styleDraft.lineColor ?? '#06b6d4'}
              onChange={(e) => onChange({ ...styleDraft, lineColor: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-muted-foreground">Line width</span>
            <input
              type="range"
              min={0.5}
              max={6}
              step={0.1}
              value={styleDraft.lineWidth ?? 2}
              onChange={(e) => onChange({ ...styleDraft, lineWidth: Number(e.target.value) })}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-muted-foreground">Point color</span>
            <input
              type="color"
              value={styleDraft.pointColor ?? '#22d3ee'}
              onChange={(e) => onChange({ ...styleDraft, pointColor: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-muted-foreground">Point size</span>
            <input
              type="range"
              min={2}
              max={12}
              step={0.5}
              value={styleDraft.pointSize ?? 6}
              onChange={(e) => onChange({ ...styleDraft, pointSize: Number(e.target.value) })}
            />
          </label>
        </div>

        <div className="flex justify-end gap-2">
          <button
            className="px-3 py-1 text-xs rounded-md border border-border hover:bg-accent"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="px-3 py-1 text-xs rounded-md bg-primary text-primary-foreground hover:brightness-105"
            onClick={onApply}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  )
}

