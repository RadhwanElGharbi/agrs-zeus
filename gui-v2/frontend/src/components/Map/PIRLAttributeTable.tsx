'use client'

import React, { useRef, useState, useMemo, useEffect } from 'react'
import { Table, Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { listAgenticSegments } from '@/lib/api/agenticClient'
import { useProject } from '@/lib/context/ProjectContext'

interface PIRLSegment {
  segment_id: string
  length_m: number | null
  start_coord: [number, number] | null
  end_coord: [number, number] | null
}

interface PIRLAttributeTableProps {
  routeId: string
  isDocked: boolean
  dockHeight: number
  onClose: () => void
  onToggleDock: () => void
  onResizeStart: (event: React.MouseEvent) => void
  onRowDoubleClick?: (segment: PIRLSegment) => void
  dockContainerRef: React.RefObject<HTMLDivElement | null> | React.MutableRefObject<HTMLDivElement | null>
}

const ROW_HEIGHT = 32
const BUFFER = 15

// Properties to display in the table
const DISPLAY_PROPERTIES = [
  'segment_id',
  'length_m',
  'start_x',
  'start_y',
  'end_x',
  'end_y',
]

export const PIRLAttributeTable = React.memo(function PIRLAttributeTable({
  routeId,
  isDocked,
  dockHeight,
  onClose,
  onToggleDock,
  onResizeStart,
  onRowDoubleClick,
  dockContainerRef
}: PIRLAttributeTableProps) {
  const { currentProject } = useProject()
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [containerHeight, setContainerHeight] = useState(400)
  const [isClosing, setIsClosing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [segments, setSegments] = useState<PIRLSegment[]>([])
  const [sortConfig, setSortConfig] = useState<{ column: string | null; direction: 'asc' | 'desc' }>({
    column: 'segment_id',
    direction: 'asc'
  })

  // Fetch segments when component mounts
  useEffect(() => {
    if (!currentProject) {
      setError('No project loaded')
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    listAgenticSegments(routeId, 10000, 0, currentProject)
      .then((data) => {
        // Filter out "full_route" segment
        const filteredSegments = data.filter(s => s.segment_id !== 'full_route')
        setSegments(filteredSegments)
        setLoading(false)
      })
      .catch((err) => {
        setError(err.message || 'Failed to load segments')
        setLoading(false)
      })
  }, [routeId, currentProject])

  const handleClose = () => {
    setIsClosing(true)
    setTimeout(onClose, 150)
  }

  // Measure container height for virtualization
  useEffect(() => {
    if (!scrollContainerRef.current) return
    const updateHeight = () => {
      if (scrollContainerRef.current) {
        setContainerHeight(scrollContainerRef.current.clientHeight)
      }
    }
    updateHeight()
    const observer = new ResizeObserver(updateHeight)
    observer.observe(scrollContainerRef.current)
    return () => observer.disconnect()
  }, [isDocked, dockHeight])

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop)
  }

  const handleSort = (column: string) => {
    setSortConfig((prev) => ({
      column,
      direction: prev.column === column && prev.direction === 'asc' ? 'desc' : 'asc'
    }))
  }

  // Transform segments to rows with flattened coordinates
  const rows = useMemo(() => {
    return segments.map((segment) => ({
      segment,
      row: {
        segment_id: segment.segment_id,
        length_m: segment.length_m?.toFixed(2) ?? 'N/A',
        start_x: segment.start_coord?.[0]?.toFixed(2) ?? 'N/A',
        start_y: segment.start_coord?.[1]?.toFixed(2) ?? 'N/A',
        end_x: segment.end_coord?.[0]?.toFixed(2) ?? 'N/A',
        end_y: segment.end_coord?.[1]?.toFixed(2) ?? 'N/A',
      }
    }))
  }, [segments])

  // Sort rows
  const sortedRows = useMemo(() => {
    if (!sortConfig.column) return rows

    return [...rows].sort((a, b) => {
      const aVal = a.row[sortConfig.column as keyof typeof a.row]
      const bVal = b.row[sortConfig.column as keyof typeof b.row]

      // Try numeric comparison
      const aNum = parseFloat(String(aVal))
      const bNum = parseFloat(String(bVal))

      if (!isNaN(aNum) && !isNaN(bNum)) {
        return sortConfig.direction === 'asc' ? aNum - bNum : bNum - aNum
      }

      // Fall back to string comparison
      const aStr = String(aVal)
      const bStr = String(bVal)
      return sortConfig.direction === 'asc'
        ? aStr.localeCompare(bStr)
        : bStr.localeCompare(aStr)
    })
  }, [rows, sortConfig])

  const totalCount = sortedRows.length
  const startIndex = Math.floor(scrollTop / ROW_HEIGHT)
  const endIndex = Math.min(
    totalCount,
    Math.floor((scrollTop + containerHeight) / ROW_HEIGHT) + BUFFER
  )

  const visibleRows = useMemo(() => {
    const start = Math.max(0, startIndex - BUFFER)
    const end = Math.min(totalCount, endIndex)
    return sortedRows.slice(start, end).map((row, index) => ({
      ...row,
      virtualIndex: start + index
    }))
  }, [sortedRows, startIndex, endIndex, totalCount])

  const paddingTop = Math.max(0, startIndex - BUFFER) * ROW_HEIGHT
  const paddingBottom = Math.max(0, totalCount - endIndex) * ROW_HEIGHT

  // Format route name for display
  const formatRouteName = (id: string) => {
    let name = id
    if (currentProject) {
      const prefix = `${currentProject}_`
      if (name.startsWith(prefix)) {
        name = name.substring(prefix.length)
      }
    }
    return name.replace(/_/g, ' ')
  }

  return (
    <div
      className={cn(
        "fixed",
        isDocked
          ? 'absolute z-40 bottom-0 left-0 right-0'
          : 'inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4',
        isClosing ? "animate-fade-out" : "animate-fade-in"
      )}
      style={!isDocked ? { position: 'fixed' } : { position: 'absolute' }}
    >
      <div
        className={`bg-[#0a0a0a] text-white border border-purple-500/30 rounded-lg shadow-[0_0_30px_-10px_rgba(147,51,234,0.5)] overflow-hidden flex flex-col ${
          isDocked ? 'w-full rounded-none border-x-0 border-b-0' : 'max-w-5xl w-full max-h-[80vh]'
        }`}
        style={
          isDocked
            ? {
                margin: 0,
                borderRadius: 0,
                height: `${dockHeight}vh`,
                maxHeight: `${dockHeight}vh`
              }
            : undefined
        }
        ref={isDocked ? (dockContainerRef as React.RefObject<HTMLDivElement>) : undefined}
      >
        {isDocked && (
          <div
            className="absolute top-0 left-0 right-0 h-2 cursor-ns-resize hover:bg-purple-500/20 transition-colors z-50"
            style={{ transform: 'translateY(-2px)' }}
            onMouseDown={onResizeStart}
            title="Drag to resize height"
          />
        )}
        <div className="flex items-center justify-between px-4 py-3 border-b border-purple-500/20 bg-purple-900/10 flex-shrink-0 h-[50px]">
          <div className="flex items-center gap-2">
            <Table className="w-4 h-4 text-purple-400" />
            <div className="text-sm font-semibold font-mono">
              {formatRouteName(routeId)} · segments ({segments.length} rows)
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onToggleDock}
              className="text-xs font-medium text-purple-400 hover:text-purple-300 transition-colors"
            >
              {isDocked ? 'Undock' : 'Dock to bottom'}
            </button>
            <button
              onClick={handleClose}
              className="p-1 hover:bg-white/10 rounded transition-colors text-white/50 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
            <span className="ml-3 text-sm text-white/50">Loading segments...</span>
          </div>
        ) : error ? (
          <div className="flex-1 flex items-center justify-center py-16">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        ) : (
          <div
            className="flex-1 overflow-auto bg-[#0a0a0a]"
            ref={scrollContainerRef}
            onScroll={handleScroll}
          >
            <table className="min-w-full text-[11px] font-mono table-fixed">
              <thead className="bg-[#0a0a0a] sticky top-0 z-10 shadow-sm h-[32px]">
                <tr>
                  {DISPLAY_PROPERTIES.map((prop) => {
                    const isActive = sortConfig.column === prop
                    const direction = isActive ? sortConfig.direction : null
                    return (
                      <th
                        key={prop}
                        className="px-2 py-1 text-left font-semibold cursor-pointer select-none hover:bg-purple-500/10 transition-colors bg-[#0a0a0a] text-purple-300"
                        onClick={() => handleSort(prop)}
                        style={{ height: ROW_HEIGHT }}
                      >
                        <div className="flex items-center gap-1">
                          <span>{prop}</span>
                          {direction && <span className="text-[10px] text-purple-400">{direction === 'asc' ? '▲' : '▼'}</span>}
                        </div>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {paddingTop > 0 && (
                  <tr>
                    <td style={{ height: paddingTop }} colSpan={DISPLAY_PROPERTIES.length} />
                  </tr>
                )}
                {visibleRows.map((entry) => (
                  <tr
                    key={entry.virtualIndex}
                    className="odd:bg-[#0a0a0a] even:bg-purple-500/5 hover:bg-purple-500/10 cursor-pointer transition-colors"
                    style={{ height: ROW_HEIGHT }}
                    onDoubleClick={() => onRowDoubleClick?.(entry.segment)}
                  >
                    {DISPLAY_PROPERTIES.map((prop) => (
                      <td key={prop} className="px-2 py-1 whitespace-nowrap max-w-[200px] truncate border-b border-purple-500/10 text-white/80">
                        {entry.row[prop as keyof typeof entry.row] ?? ''}
                      </td>
                    ))}
                  </tr>
                ))}
                {paddingBottom > 0 && (
                  <tr>
                    <td style={{ height: paddingBottom }} colSpan={DISPLAY_PROPERTIES.length} />
                  </tr>
                )}
                {visibleRows.length === 0 && (
                  <tr>
                    <td className="px-2 py-2 text-white/30" colSpan={DISPLAY_PROPERTIES.length}>
                      No segment rows available.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
})
