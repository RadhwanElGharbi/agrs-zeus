'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronRight, Loader2, MapPin, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useMapView } from '@/lib/context/MapViewContext'
import {
  fetchCreatorGeoJSON,
  getCreatorAttachmentUrl,
  getCreatorEntry,
  getCreatorEntryChangelog,
  updateCreatorEntry,
  type CreatorEntry,
  type CreatorGeoJSONFeatureCollection
} from '@/lib/api/dataClient'

type EntryTypeFilter = 'all' | 'AOI' | 'POI'
type EntryStatusFilter = 'all' | 'active' | 'deleted'

type EntryRow = {
  id: string
  type: 'AOI' | 'POI' | string
  status: 'active' | 'deleted' | string
  title: string
  category: string
  categoryOther: string | null
  comment: string | null
  createdAt: string | null
  updatedAt: string | null
  createdBy: string | null
  updatedBy: string | null
  geometryWgs84: GeoJSON.Geometry | null
}

type EntrySectionState = {
  geometryOpen: boolean
  geometryJsonOpen: boolean
  fullEntryOpen: boolean
  fullEntryJsonOpen: boolean
}

const DEFAULT_SECTIONS: EntrySectionState = {
  geometryOpen: false,
  geometryJsonOpen: false,
  fullEntryOpen: false,
  fullEntryJsonOpen: false
}

interface OperatorEntriesDialogProps {
  open: boolean
  onClose: () => void
  projectName: string | null
}

function normalize(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase()
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let v = bytes
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i += 1
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`
}

function iterXY(geom: GeoJSON.Geometry): Array<[number, number]> {
  const out: Array<[number, number]> = []
  const coords: any = (geom as any)?.coordinates

  const walk = (node: any) => {
    if (Array.isArray(node) && node.length >= 2 && typeof node[0] === 'number' && typeof node[1] === 'number') {
      out.push([node[0], node[1]])
      return
    }
    if (Array.isArray(node)) {
      for (const child of node) walk(child)
    }
  }

  walk(coords)
  return out
}

function geometrySummary(geom: GeoJSON.Geometry | null): { vertexCount: number; bbox: string | null } {
  if (!geom) return { vertexCount: 0, bbox: null }
  const pts = iterXY(geom)
  if (!pts.length) return { vertexCount: 0, bbox: null }
  const xs = pts.map((p) => p[0])
  const ys = pts.map((p) => p[1])
  const minx = Math.min(...xs)
  const miny = Math.min(...ys)
  const maxx = Math.max(...xs)
  const maxy = Math.max(...ys)
  return { vertexCount: pts.length, bbox: `[${minx.toFixed(6)}, ${miny.toFixed(6)}] → [${maxx.toFixed(6)}, ${maxy.toFixed(6)}]` }
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

function utcOffsetLabelForDate(date: Date): string {
  const offsetMinutes = -date.getTimezoneOffset()
  if (!Number.isFinite(offsetMinutes) || offsetMinutes === 0) return 'UTC'
  const sign = offsetMinutes >= 0 ? '+' : '-'
  const abs = Math.abs(offsetMinutes)
  const hours = Math.floor(abs / 60)
  const mins = abs % 60
  if (mins === 0) return `UTC${sign}${hours}`
  return `UTC${sign}${hours}:${pad2(mins)}`
}

function formatLocalDateTimeWithOffset(isoTimestamp: string | null | undefined): string {
  if (!isoTimestamp) return '—'
  const date = new Date(isoTimestamp)
  if (Number.isNaN(date.getTime())) return String(isoTimestamp)
  const dt = `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`
  const tz = utcOffsetLabelForDate(date)
  return `${dt} ${tz}`
}

function formatBbox(value: any): string | null {
  if (!value) return null
  if (typeof value === 'string') return value
  if (typeof value === 'object') {
    const minx = value.minx
    const miny = value.miny
    const maxx = value.maxx
    const maxy = value.maxy
    if ([minx, miny, maxx, maxy].every((v) => typeof v === 'number' && Number.isFinite(v))) {
      return `[${minx.toFixed(6)}, ${miny.toFixed(6)}] → [${maxx.toFixed(6)}, ${maxy.toFixed(6)}]`
    }
  }
  return null
}

function FieldRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-3 text-[10px]">
      <div className="text-white/50 uppercase tracking-wider">{label}</div>
      <div className="col-span-2 text-white/80 font-mono break-words">{value}</div>
    </div>
  )
}

function ChangeValue({ value }: { value: any }) {
  if (value === null || value === undefined || value === '') {
    return <span className="text-white/30">—</span>
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return <span className="text-white/80 font-mono break-all">{String(value)}</span>
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-white/30">—</span>
    return (
      <ul className="space-y-1">
        {value.map((item, idx) => (
          <li key={idx} className="text-white/70 font-mono break-all text-[10px]">
            {typeof item === 'string' ? item : JSON.stringify(item)}
          </li>
        ))}
      </ul>
    )
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, any>)
    if (entries.length === 0) return <span className="text-white/30">—</span>
    return (
      <div className="space-y-1">
        {entries.map(([k, v]) => (
          <div key={k} className="grid grid-cols-3 gap-3 text-[10px]">
            <div className="text-white/50 uppercase tracking-wider">{k}</div>
            <div className="col-span-2">
              <ChangeValue value={v} />
            </div>
          </div>
        ))}
      </div>
    )
  }
  return <span className="text-white/70 font-mono break-all">{String(value)}</span>
}

function ChangelogDetails({ record }: { record: any }) {
  const action = String(record?.action ?? '')
  const actor = record?.actor && typeof record.actor === 'object' ? record.actor : null
  const changes = record?.changes && typeof record.changes === 'object' ? record.changes : null
  const sortie = record?.sortie && typeof record.sortie === 'object' ? record.sortie : null
  const survey = record?.survey && typeof record.survey === 'object' ? record.survey : null
  const datasetFeatures = Array.isArray(record?.dataset_features) ? record.dataset_features : null

  const renderFields = (fields: any) => {
    const fmt = (value: any) => {
      if (value === null || value === undefined || value === '') return '—'
      if (typeof value === 'string') return value
      if (typeof value === 'number' || typeof value === 'boolean') return String(value)
      try {
        return JSON.stringify(value)
      } catch {
        return String(value)
      }
    }
    if (!Array.isArray(fields) || fields.length === 0) return <div className="text-xs text-white/30">No field changes.</div>
    return (
      <div className="space-y-1">
        {fields.map((f, idx) => {
          const name = String(f?.field ?? '')
          const hasFrom = Object.prototype.hasOwnProperty.call(f ?? {}, 'from')
          const from = (f as any)?.from
          const to = (f as any)?.to
          return (
            <div key={`${name}-${idx}`} className="grid grid-cols-3 gap-3 text-[10px]">
              <div className="text-white/50 uppercase tracking-wider">{name || 'field'}</div>
              <div className="col-span-2 font-mono break-all">
                {hasFrom ? (
                  <span className="text-white/70">
                    <span className="text-red-300/80">{fmt(from)}</span>
                    <span className="text-white/30"> → </span>
                    <span className="text-emerald-200/90">{fmt(to)}</span>
                  </span>
                ) : (
                  <span className="text-emerald-200/90">{fmt(to)}</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  const renderGeometryCreate = (geom: any) => {
    if (!geom || typeof geom !== 'object') return <div className="text-xs text-white/30">No geometry summary.</div>
    return (
      <div className="space-y-1">
        <FieldRow label="Type" value={<ChangeValue value={geom.type} />} />
        <FieldRow label="Vertex Count" value={<ChangeValue value={geom.vertex_count} />} />
        <FieldRow label="BBox" value={formatBbox(geom.bbox) ?? '—'} />
      </div>
    )
  }

  const renderGeometryUpdate = (geom: any) => {
    if (!geom) return <div className="text-xs text-white/30">Geometry unchanged.</div>
    const before = geom?.before
    const after = geom?.after
    if (!before || !after) return <div className="text-xs text-white/30">Geometry details unavailable.</div>
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1">
          <div className="text-[10px] text-white/40 uppercase tracking-[0.2em]">Before</div>
          <FieldRow label="Type" value={<ChangeValue value={before.type} />} />
          <FieldRow label="Vertex Count" value={<ChangeValue value={before.vertex_count} />} />
          <FieldRow label="BBox" value={formatBbox(before.bbox) ?? '—'} />
        </div>
        <div className="space-y-1">
          <div className="text-[10px] text-white/40 uppercase tracking-[0.2em]">After</div>
          <FieldRow label="Type" value={<ChangeValue value={after.type} />} />
          <FieldRow label="Vertex Count" value={<ChangeValue value={after.vertex_count} />} />
          <FieldRow label="BBox" value={formatBbox(after.bbox) ?? '—'} />
        </div>
      </div>
    )
  }

  if (!changes) {
    return (
      <div className="space-y-2">
        <div className="text-xs text-white/30">No detailed change payload recorded.</div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <div className="text-[10px] text-white/40 uppercase tracking-[0.2em]">Actor</div>
        {actor ? (
          <div className="space-y-1">
            <FieldRow label="Username" value={actor.username ?? '—'} />
            <FieldRow label="Name" value={actor.name ?? '—'} />
            <FieldRow label="Role" value={actor.role ?? '—'} />
            <FieldRow label="Company" value={actor.company ?? '—'} />
          </div>
        ) : (
          <div className="text-xs text-white/30">—</div>
        )}
      </div>

      <div className="space-y-1">
        <div className="text-[10px] text-white/40 uppercase tracking-[0.2em]">Changes</div>

        {action === 'delete' && (
          <div className="space-y-1">
            <FieldRow
              label="Status"
              value={
                changes?.status ? (
                  <span className="font-mono text-[10px]">
                    <span className="text-red-300/80">{String(changes.status.from ?? '—')}</span>
                    <span className="text-white/30"> → </span>
                    <span className="text-emerald-200/90">{String(changes.status.to ?? '—')}</span>
                  </span>
                ) : (
                  <span className="text-white/30">—</span>
                )
              }
            />
          </div>
        )}

        {(action === 'create' || action === 'update') && (
          <div className="space-y-3">
            <div className="space-y-1">
              <div className="text-[10px] text-white/40 uppercase tracking-[0.2em]">Sortie</div>
              {sortie ? (
                <div className="space-y-1">
                  <FieldRow label="Code" value={<ChangeValue value={(sortie as any).code} />} />
                  <FieldRow label="ID" value={<ChangeValue value={(sortie as any).id} />} />
                  {(sortie as any).name ? <FieldRow label="Name" value={<ChangeValue value={(sortie as any).name} />} /> : null}
                </div>
              ) : (
                <div className="text-xs text-white/30">—</div>
              )}
            </div>

            <div className="space-y-1">
              <div className="text-[10px] text-white/40 uppercase tracking-[0.2em]">Survey</div>
              {survey ? <ChangeValue value={survey} /> : <div className="text-xs text-white/30">—</div>}
            </div>

            <div className="space-y-1">
              <div className="text-[10px] text-white/40 uppercase tracking-[0.2em]">Dataset Features</div>
              {datasetFeatures ? <ChangeValue value={datasetFeatures} /> : <div className="text-xs text-white/30">—</div>}
            </div>

            <div className="space-y-1">
              <div className="text-[10px] text-white/40 uppercase tracking-[0.2em]">Fields</div>
              {renderFields(changes.fields)}
            </div>

            <div className="space-y-1">
              <div className="text-[10px] text-white/40 uppercase tracking-[0.2em]">Geometry</div>
              {action === 'create' ? renderGeometryCreate(changes.geometry) : renderGeometryUpdate(changes.geometry)}
            </div>

            <div className="space-y-1">
              <div className="text-[10px] text-white/40 uppercase tracking-[0.2em]">Attachments</div>
              <FieldRow label="Added" value={<ChangeValue value={changes.attachments_added} />} />
              <FieldRow label="Removed" value={<ChangeValue value={changes.attachments_removed} />} />
            </div>
          </div>
        )}

        {action !== 'create' && action !== 'update' && action !== 'delete' && (
          <div className="space-y-1">
            <ChangeValue value={changes} />
          </div>
        )}
      </div>
    </div>
  )
}

function datasetFeaturesToFeatureCollection(selections: any): GeoJSON.FeatureCollection | null {
  if (!Array.isArray(selections)) return null
  const features: any[] = []
  for (const sel of selections) {
    const f = (sel as any)?.feature
    if (f && typeof f === 'object' && f.type === 'Feature' && f.geometry) {
      features.push(f)
    }
  }
  if (features.length === 0) return null
  return { type: 'FeatureCollection', features } as any
}

export function OperatorEntriesDialog({ open, onClose, projectName }: OperatorEntriesDialogProps) {
  const { operator } = useMapView()
  const [isClosing, setIsClosing] = useState(false)
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<EntryTypeFilter>('all')
  const [statusFilter, setStatusFilter] = useState<EntryStatusFilter>('all')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [sectionsById, setSectionsById] = useState<Record<string, EntrySectionState>>({})
  const [changelogExpandedByKey, setChangelogExpandedByKey] = useState<Record<string, boolean>>({})

  const [geojson, setGeojson] = useState<CreatorGeoJSONFeatureCollection | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [detailsById, setDetailsById] = useState<Record<string, CreatorEntry | null | undefined>>({})
  const [detailsLoadingById, setDetailsLoadingById] = useState<Record<string, boolean>>({})
  const [changelogById, setChangelogById] = useState<Record<string, any[] | null | undefined>>({})
  const [changelogLoadingById, setChangelogLoadingById] = useState<Record<string, boolean>>({})

  const [postTextById, setPostTextById] = useState<Record<string, string>>({})
  const [postFilesById, setPostFilesById] = useState<Record<string, File[]>>({})
  const [postSavingById, setPostSavingById] = useState<Record<string, boolean>>({})
  const [postErrorById, setPostErrorById] = useState<Record<string, string | null>>({})

  useEffect(() => {
    if (open) {
      setIsClosing(false)
      return
    }
    const t = setTimeout(() => {
      setQuery('')
      setTypeFilter('all')
      setStatusFilter('all')
      setExpanded({})
      setSectionsById({})
      setChangelogExpandedByKey({})
      setGeojson(null)
      setLoading(false)
      setError(null)
      setDetailsById({})
      setDetailsLoadingById({})
      setChangelogById({})
      setChangelogLoadingById({})
      setPostTextById({})
      setPostFilesById({})
      setPostSavingById({})
      setPostErrorById({})
    }, 200)
    return () => clearTimeout(t)
  }, [open])

  useEffect(() => {
    if (!open || !projectName) return
    setLoading(true)
    setError(null)
    fetchCreatorGeoJSON(projectName, { includeDeleted: true })
      .then((resp) => setGeojson(resp))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load Operator entries.'))
      .finally(() => setLoading(false))
  }, [open, projectName])

  const handleClose = useCallback(() => {
    setIsClosing(true)
    setTimeout(() => onClose(), 150)
  }, [onClose])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, handleClose])

  const rows = useMemo<EntryRow[]>(() => {
    const features = (geojson?.features ?? []) as any[]
    return features
      .map((f) => {
        const props = f?.properties ?? {}
        const id = String(props.creator_id ?? f?.id ?? '')
        return {
          id,
          type: String(props.creator_type ?? ''),
          status: String(props.status ?? ''),
          title: String(props.title ?? id),
          category: String(props.category ?? ''),
          categoryOther: props.category_other ?? null,
          comment: props.comment ?? null,
          createdAt: props.created_at ?? null,
          updatedAt: props.updated_at ?? null,
          createdBy: props.created_by ?? null,
          updatedBy: props.updated_by ?? null,
          geometryWgs84: (f?.geometry as GeoJSON.Geometry) ?? null
        } as EntryRow
      })
      .filter((r) => Boolean(r.id))
  }, [geojson])

  const counts = useMemo(() => {
    const total = rows.length
    const aois = rows.filter((r) => r.type === 'AOI').length
    const pois = rows.filter((r) => r.type === 'POI').length
    const deleted = rows.filter((r) => r.status === 'deleted').length
    return { total, aois, pois, deleted }
  }, [rows])

  const filtered = useMemo(() => {
    const q = normalize(query)
    const matchQuery = (row: EntryRow) => {
      if (!q) return true
      return (
        normalize(row.id).includes(q) ||
        normalize(row.title).includes(q) ||
        normalize(row.category).includes(q) ||
        normalize(row.categoryOther).includes(q) ||
        normalize(row.comment).includes(q) ||
        normalize(row.createdBy).includes(q) ||
        normalize(row.updatedBy).includes(q)
      )
    }

    return rows
      .filter((row) => {
        if (typeFilter !== 'all' && row.type !== typeFilter) return false
        if (statusFilter !== 'all' && row.status !== statusFilter) return false
        return matchQuery(row)
      })
      .sort((a, b) => {
        const ta = Date.parse(String(a.updatedAt ?? a.createdAt ?? '')) || 0
        const tb = Date.parse(String(b.updatedAt ?? b.createdAt ?? '')) || 0
        return tb - ta
      })
  }, [query, rows, statusFilter, typeFilter])

  const ensureDetailsLoaded = useCallback(
    async (id: string) => {
      if (!projectName) return
      if (detailsById[id] !== undefined) return
      setDetailsLoadingById((prev) => ({ ...prev, [id]: true }))
      try {
        const entry = await getCreatorEntry(projectName, id)
        setDetailsById((prev) => ({ ...prev, [id]: entry }))
      } catch {
        setDetailsById((prev) => ({ ...prev, [id]: null }))
      } finally {
        setDetailsLoadingById((prev) => ({ ...prev, [id]: false }))
      }
    },
    [detailsById, projectName]
  )

  const ensureChangelogLoaded = useCallback(
    async (id: string) => {
      if (!projectName) return
      if (changelogById[id] !== undefined) return
      setChangelogLoadingById((prev) => ({ ...prev, [id]: true }))
      try {
        const rows = await getCreatorEntryChangelog(projectName, id)
        setChangelogById((prev) => ({ ...prev, [id]: rows }))
      } catch {
        setChangelogById((prev) => ({ ...prev, [id]: null }))
      } finally {
        setChangelogLoadingById((prev) => ({ ...prev, [id]: false }))
      }
    },
    [changelogById, projectName]
  )

  const toggleExpanded = useCallback(
    (id: string) => {
      setExpanded((prev) => {
        const next = !prev[id]
        // fire and forget loads
        if (next) {
          setSectionsById((current) => (current[id] ? current : { ...current, [id]: { ...DEFAULT_SECTIONS } }))
          void ensureDetailsLoaded(id)
          void ensureChangelogLoaded(id)
        }
        return { ...prev, [id]: next }
      })
    },
    [ensureChangelogLoaded, ensureDetailsLoaded]
  )

  const toggleSection = useCallback((id: string, key: keyof EntrySectionState) => {
    setSectionsById((prev) => {
      const current = prev[id] ?? DEFAULT_SECTIONS
      return { ...prev, [id]: { ...current, [key]: !current[key] } }
    })
  }, [])

  const toggleChangelogEntry = useCallback((key: string) => {
    setChangelogExpandedByKey((prev) => ({ ...prev, [key]: !prev[key] }))
  }, [])

  const postToThread = useCallback(
    async (entryId: string) => {
      if (!projectName) return
      const text = (postTextById[entryId] ?? '').trim()
      const files = postFilesById[entryId] ?? []
      if (!text && files.length === 0) return

      setPostSavingById((prev) => ({ ...prev, [entryId]: true }))
      setPostErrorById((prev) => ({ ...prev, [entryId]: null }))

      try {
        const fd = new FormData()
        if (text) fd.append('comment', text)
        for (const f of files) fd.append('attachments', f)

        const updated = await updateCreatorEntry(projectName, entryId, fd)

        setDetailsById((prev) => ({ ...prev, [entryId]: updated }))
        setPostTextById((prev) => ({ ...prev, [entryId]: '' }))
        setPostFilesById((prev) => ({ ...prev, [entryId]: [] }))

        // Keep the summary list in sync (updated_at / updated_by / comment).
        setGeojson((prev) => {
          if (!prev || !Array.isArray((prev as any).features)) return prev
          const features = (prev as any).features.map((feat: any) => {
            const props = feat?.properties ?? {}
            const id = String(props.creator_id ?? feat?.id ?? '')
            if (id !== entryId) return feat
            return {
              ...feat,
              properties: {
                ...props,
                comment: (updated as any).comment ?? props.comment,
                updated_at: (updated as any).updated_at ?? props.updated_at,
                updated_by: ((updated as any).updated_by?.username ?? props.updated_by) as any
              }
            }
          })
          return { ...(prev as any), features } as any
        })

        // Refresh thread history for this entry.
        try {
          const rows = await getCreatorEntryChangelog(projectName, entryId)
          setChangelogById((prev) => ({ ...prev, [entryId]: Array.isArray(rows) ? rows : [] }))
        } catch {
          // ignore
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to post to thread.'
        setPostErrorById((prev) => ({ ...prev, [entryId]: message }))
      } finally {
        setPostSavingById((prev) => ({ ...prev, [entryId]: false }))
      }
    },
    [postFilesById, postTextById, projectName]
  )

  if (!open) return null

  return (
    <div className={cn('fixed inset-0 z-[100] flex items-center justify-center p-4', isClosing ? 'animate-fade-out' : 'animate-fade-in')}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/85 backdrop-blur-md" onClick={handleClose}>
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none" />
      </div>

      <div
        className="relative w-[900px] max-w-[95vw] max-h-[90vh] rounded-sm bg-[#0a0a0a]/95 border border-white/10 shadow-[0_0_50px_-10px_rgba(0,0,0,0.8)] flex flex-col pointer-events-auto overflow-hidden font-mono"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Decorative Top Line */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-amber-500/40 to-transparent" />

        {/* Header */}
        <header className="px-8 py-6 border-b border-white/10 flex items-center justify-between bg-black/20 shrink-0">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2 text-[10px] text-white/40 uppercase tracking-[0.2em]">
              <span>Operator</span>
              <span className="text-white/20">|</span>
              <span className="text-white/50">{projectName ?? 'NO PROJECT'}</span>
            </div>
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold text-white uppercase tracking-wide">Operator Entry Index</h2>
              <div className="flex items-center gap-2 px-2 py-0.5 bg-white/5 border border-white/10 rounded-sm">
                <span className="text-[9px] text-white/50 uppercase tracking-wider">
                  Total: <span className="text-white">{counts.total}</span>
                </span>
                <span className="text-white/20">|</span>
                <span className="text-[9px] text-white/50 uppercase tracking-wider">
                  AOIs: <span className="text-white">{counts.aois}</span>
                </span>
                <span className="text-white/20">|</span>
                <span className="text-[9px] text-white/50 uppercase tracking-wider">
                  POIs: <span className="text-white">{counts.pois}</span>
                </span>
                <span className="text-white/20">|</span>
                <span className="text-[9px] text-white/50 uppercase tracking-wider">
                  Deleted: <span className="text-white">{counts.deleted}</span>
                </span>
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

        {/* Controls */}
        <div className="px-6 py-4 border-b border-white/10 bg-white/[0.02] shrink-0">
          <div className="flex flex-col md:flex-row md:items-center gap-3">
            <div className="flex-1 flex items-center gap-2 px-3 py-2 bg-black/40 border border-white/10 rounded-sm">
              <Search className="w-4 h-4 text-white/30" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search title, category, author, id..."
                className="w-full bg-transparent outline-none text-xs text-white/80 placeholder:text-white/30"
              />
            </div>

            <div className="flex items-center gap-2">
              {(['all', 'AOI', 'POI'] as EntryTypeFilter[]).map((id) => (
                <button
                  key={id}
                  onClick={() => setTypeFilter(id)}
                  className={cn(
                    'px-3 py-2 border rounded-sm text-[10px] uppercase font-bold tracking-wider transition-all',
                    typeFilter === id
                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                      : 'bg-white/5 border-white/10 text-white/50 hover:text-white hover:border-white/20'
                  )}
                >
                  {id === 'all' ? 'All' : id}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              {(['all', 'active', 'deleted'] as EntryStatusFilter[]).map((id) => (
                <button
                  key={id}
                  onClick={() => setStatusFilter(id)}
                  className={cn(
                    'px-3 py-2 border rounded-sm text-[10px] uppercase font-bold tracking-wider transition-all',
                    statusFilter === id
                      ? id === 'deleted'
                        ? 'bg-red-500/10 border-red-500/30 text-red-400'
                        : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                      : 'bg-white/5 border-white/10 text-white/50 hover:text-white hover:border-white/20'
                  )}
                >
                  {id === 'all' ? 'All' : id}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-8 bg-[linear-gradient(to_right,#ffffff02_1px,transparent_1px),linear-gradient(to_bottom,#ffffff02_1px,transparent_1px)] bg-[size:20px_20px]">
          {!projectName && (
            <div className="p-6 text-center text-white/30 text-xs border border-white/10 rounded-sm bg-black/40">
              Select a project to view its Operator entries.
            </div>
          )}

          {projectName && loading && (
            <div className="flex items-center gap-2 text-white/50 text-xs">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading Operator entries…
            </div>
          )}

          {projectName && !loading && error && (
            <div className="p-4 border border-red-500/20 bg-red-500/5 rounded-sm text-xs text-red-300 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5" />
              <div>{error}</div>
            </div>
          )}

          {projectName && !loading && !error && filtered.length === 0 && (
            <div className="p-6 text-center text-white/30 text-xs border border-white/10 rounded-sm bg-black/40">
              No Operator entries match your filters.
            </div>
          )}

          <div className="space-y-3">
            {filtered.map((row) => {
              const isOpen = Boolean(expanded[row.id])
              const detail = detailsById[row.id]
              const detailLoading = Boolean(detailsLoadingById[row.id])
              const log = changelogById[row.id]
              const logLoading = Boolean(changelogLoadingById[row.id])
              const geom = geometrySummary(row.geometryWgs84 ?? ({ type: 'Point', coordinates: [] } as any))
              const statusBadge =
                row.status === 'deleted'
                  ? 'bg-red-500/10 border-red-500/30 text-red-400'
                  : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              const attachedFeaturesFc = datasetFeaturesToFeatureCollection((detail as any)?.dataset_features)
              const postText = postTextById[row.id] ?? ''
              const postFiles = postFilesById[row.id] ?? []
              const postSaving = Boolean(postSavingById[row.id])
              const postErr = postErrorById[row.id]

              return (
                <div key={row.id} className="border border-white/10 bg-black/30 rounded-sm overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleExpanded(row.id)}
                    className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/[0.03] transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="text-white/40">
                        {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </div>
                      <div className="min-w-0 flex flex-col items-start gap-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-xs font-bold text-white truncate">{row.title || row.id}</span>
                          <span className={cn('px-2 py-0.5 text-[9px] uppercase tracking-wider border rounded-sm', statusBadge)}>
                            {row.status === 'deleted' ? 'DELETED' : 'ACTIVE'}
                          </span>
                          <span className="px-2 py-0.5 text-[9px] uppercase tracking-wider border border-white/10 rounded-sm text-white/60 bg-white/5">
                            {row.type || 'ENTRY'}
                          </span>
                        </div>
                        <div className="text-[10px] text-white/40 flex flex-wrap gap-x-3 gap-y-1">
                          <span>
                            Category: <span className="text-white/60">{row.category || '—'}</span>
                          </span>
                          {row.categoryOther ? (
                            <span>
                              Other: <span className="text-white/60">{row.categoryOther}</span>
                            </span>
                          ) : null}
                          <span>
                            Updated: <span className="text-white/60">{row.updatedAt || row.createdAt || '—'}</span>
                          </span>
                          <span>
                            Vertices: <span className="text-white/60">{geom.vertexCount}</span>
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="text-[10px] text-white/30 font-mono truncate max-w-[260px]" title={row.id}>
                      {row.id}
                    </div>
                  </button>

                  {isOpen && (
                    <div className="px-4 pb-4 pt-2 border-t border-white/10 space-y-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (row.geometryWgs84) {
                              operator.zoomToGeoJSON(row.geometryWgs84)
                              handleClose()
                            }
                          }}
                          className="px-3 py-2 border rounded-sm text-[10px] uppercase font-bold tracking-wider transition-all bg-white/5 border-white/10 text-white/60 hover:text-white hover:border-white/20 hover:bg-white/10 flex items-center gap-2"
                          title="Zoom to entry geometry"
                        >
                          <MapPin className="w-3 h-3" />
                          Zoom Entry
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (attachedFeaturesFc) {
                              operator.zoomToGeoJSON(attachedFeaturesFc)
                              handleClose()
                            }
                          }}
                          disabled={!attachedFeaturesFc}
                          className={cn(
                            'px-3 py-2 border rounded-sm text-[10px] uppercase font-bold tracking-wider transition-all flex items-center gap-2',
                            attachedFeaturesFc
                              ? 'bg-amber-500/10 border-amber-500/30 text-amber-200 hover:bg-amber-500/15'
                              : 'bg-white/5 border-white/10 text-white/20 cursor-not-allowed'
                          )}
                          title={attachedFeaturesFc ? 'Zoom to linked dataset features' : 'No linked dataset features'}
                        >
                          <MapPin className="w-3 h-3" />
                          Zoom Features
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <div className="text-[10px] text-white/40 uppercase tracking-[0.2em]">Entry</div>
                          <FieldRow label="ID" value={row.id} />
                          <FieldRow label="Type" value={row.type || '—'} />
                          <FieldRow label="Status" value={row.status || '—'} />
                          <FieldRow label="Title" value={row.title || '—'} />
                          <FieldRow label="Category" value={row.category || '—'} />
                          {row.categoryOther ? <FieldRow label="Category Other" value={row.categoryOther} /> : null}
                        </div>

                        <div className="space-y-2">
                          <div className="text-[10px] text-white/40 uppercase tracking-[0.2em]">Audit</div>
                          <FieldRow label="Created At" value={row.createdAt || '—'} />
                          <FieldRow label="Created By" value={row.createdBy || '—'} />
                          <FieldRow label="Updated At" value={row.updatedAt || '—'} />
                          <FieldRow label="Updated By" value={row.updatedBy || '—'} />
                          {detail?.deleted_at ? <FieldRow label="Deleted At" value={detail.deleted_at} /> : null}
                          {detail?.deleted_by?.username ? <FieldRow label="Deleted By" value={detail.deleted_by.username} /> : null}
                        </div>
                      </div>

                      {/* Thread (append-only) */}
                      <div className="border border-amber-500/20 bg-amber-500/5 rounded-sm p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-[10px] text-amber-200 uppercase tracking-[0.2em]">Thread</div>
                          <div className="text-[10px] text-white/30 font-mono">
                            {Array.isArray(log) ? `${log.length} events` : logLoading ? 'loading…' : '—'}
                          </div>
                        </div>

                        {logLoading && (
                          <div className="mt-2 flex items-center gap-2 text-white/50 text-xs">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Loading thread…
                          </div>
                        )}

                        {log === null && !logLoading && (
                          <div className="mt-2 text-xs text-white/40">Failed to load thread.</div>
                        )}

                        {Array.isArray(log) && log.length === 0 && !logLoading && (
                          <div className="mt-2 text-xs text-white/40">No thread entries yet.</div>
                        )}

                        {Array.isArray(log) && log.length > 0 && (
                          <div className="mt-3 space-y-2 max-h-[260px] overflow-auto">
                            {log.slice(-12).map((rec, idx) => {
                              const action = String((rec as any)?.action ?? 'event')
                              const ts = formatLocalDateTimeWithOffset((rec as any)?.timestamp)
                              const actor = (rec as any)?.actor ?? {}
                              const actorLabel = String(actor?.name || actor?.username || 'unknown')
                              const changes = (rec as any)?.changes ?? {}
                              const fields = Array.isArray(changes?.fields) ? changes.fields : []
                              const commentChange = fields.find((f: any) => f?.field === 'comment')
                              const message = typeof commentChange?.to === 'string' ? commentChange.to : ''
                              const added = Array.isArray(changes?.attachments_added) ? changes.attachments_added : []
                              const hasGeometry = Boolean(changes?.geometry)
                              const otherFields = fields.filter((f: any) => f?.field && f.field !== 'comment')

                              const fallbackText =
                                action === 'create'
                                  ? 'Created entry.'
                                  : added.length > 0
                                    ? 'Added files.'
                                    : hasGeometry
                                      ? 'Updated geometry.'
                                      : otherFields.length > 0
                                        ? 'Updated entry.'
                                        : ''

                              const show = Boolean(message?.trim() || added.length || hasGeometry || otherFields.length || action === 'create' || action === 'delete')
                              if (!show) return null

                              return (
                                <div key={`${row.id}:${String((rec as any)?.timestamp ?? idx)}:${action}`} className="border border-white/10 bg-black/30 rounded-sm p-3">
                                  <div className="flex items-center justify-between gap-3 text-[10px] font-mono text-white/40">
                                    <div className="truncate">
                                      <span className="text-white/60">{actorLabel}</span>{' '}
                                      <span className="text-white/30">·</span>{' '}
                                      <span className="uppercase tracking-widest">{action}</span>
                                    </div>
                                    <div className="shrink-0">{ts}</div>
                                  </div>
                                  <div className="mt-2 text-xs text-white/85 whitespace-pre-wrap leading-relaxed font-sans">
                                    {message?.trim() ? message : fallbackText}
                                  </div>
                                  {added.length > 0 && (
                                    <div className="mt-2 flex flex-wrap gap-2">
                                      {added.map((fname: any) => {
                                        const filename = String(fname)
                                        return (
                                          <a
                                            key={filename}
                                            className="text-[10px] font-mono text-amber-300 hover:text-amber-200 underline underline-offset-2 break-all"
                                            href={getCreatorAttachmentUrl(projectName || '', row.id, filename)}
                                            target="_blank"
                                            rel="noreferrer"
                                            title={filename}
                                          >
                                            {filename}
                                          </a>
                                        )
                                      })}
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )}

                        <div className="mt-3 border-t border-white/10 pt-3 space-y-2">
                          <div className="text-[10px] text-white/40 uppercase tracking-[0.2em]">Add Comment / Files</div>
                          <textarea
                            value={postText}
                            onChange={(e) => setPostTextById((prev) => ({ ...prev, [row.id]: e.target.value }))}
                            placeholder="Write a note (optional)…"
                            className="w-full min-h-[70px] bg-black/40 border border-white/10 rounded-sm p-2 text-xs text-white/80 placeholder:text-white/30 outline-none focus:border-amber-500/40 font-sans"
                          />
                          <div className="flex items-center justify-between gap-3">
                            <input
                              type="file"
                              multiple
                              onChange={(e) => {
                                const files = Array.from(e.target.files || [])
                                if (files.length === 0) return
                                setPostFilesById((prev) => ({ ...prev, [row.id]: [...(prev[row.id] ?? []), ...files] }))
                                e.currentTarget.value = ''
                              }}
                              className="text-xs text-white/60"
                            />
                            <div className="flex items-center gap-2">
                              {postFiles.length > 0 && <div className="text-[10px] text-white/40 font-mono">{postFiles.length} file(s)</div>}
                              <button
                                type="button"
                                onClick={() => void postToThread(row.id)}
                                disabled={postSaving || (!postText.trim() && postFiles.length === 0)}
                                className={cn(
                                  'px-3 py-2 border rounded-sm text-[10px] uppercase font-bold tracking-wider transition-all',
                                  postSaving || (!postText.trim() && postFiles.length === 0)
                                    ? 'bg-white/5 border-white/10 text-white/20 cursor-not-allowed'
                                    : 'bg-amber-500/10 border-amber-500/30 text-amber-200 hover:bg-amber-500/15'
                                )}
                                title="Post to thread"
                              >
                                {postSaving ? 'Posting…' : 'Post'}
                              </button>
                            </div>
                          </div>
                          {postErr && (
                            <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-sm px-3 py-2">
                              {postErr}
                            </div>
                          )}
                          <div className="text-[10px] text-white/30 font-mono">Posts are appended; history is preserved.</div>
                        </div>
                      </div>

                      {/* Geometry */}
                      {(() => {
                        const sections = sectionsById[row.id] ?? DEFAULT_SECTIONS
                        return (
                          <div className="border border-white/10 bg-black/30 rounded-sm overflow-hidden">
                            <button
                              type="button"
                              onClick={() => toggleSection(row.id, 'geometryOpen')}
                              className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/[0.03] transition-colors"
                            >
                              <div className="flex items-center gap-2">
                                <div className="text-white/40">
                                  {sections.geometryOpen ? (
                                    <ChevronDown className="w-4 h-4" />
                                  ) : (
                                    <ChevronRight className="w-4 h-4" />
                                  )}
                                </div>
                                <div className="text-[10px] text-white/40 uppercase tracking-[0.2em]">Geometry (WGS84)</div>
                              </div>
                              <div className="text-[10px] text-white/40 font-mono">
                                Vertices: <span className="text-white/70">{geom.vertexCount}</span>
                              </div>
                            </button>

                            {sections.geometryOpen && (
                              <div className="px-4 pb-4 pt-3 border-t border-white/10 space-y-3">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <div className="space-y-2">
                                    <FieldRow label="Vertex Count" value={String(geom.vertexCount)} />
                                    <FieldRow label="BBox" value={geom.bbox ?? '—'} />
                                  </div>
                                  <div className="space-y-2">
                                    <button
                                      type="button"
                                      onClick={() => toggleSection(row.id, 'geometryJsonOpen')}
                                      className={cn(
                                        'px-3 py-2 border rounded-sm text-[10px] uppercase font-bold tracking-wider transition-all',
                                        sections.geometryJsonOpen
                                          ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                                          : 'bg-white/5 border-white/10 text-white/50 hover:text-white hover:border-white/20'
                                      )}
                                    >
                                      {sections.geometryJsonOpen ? 'Hide GeoJSON' : 'Show GeoJSON'}
                                    </button>
                                    {sections.geometryJsonOpen && (
                                      <pre className="text-[10px] text-white/80 bg-black/40 border border-white/10 rounded-sm p-3 overflow-auto max-h-[220px]">
                                        {JSON.stringify(row.geometryWgs84, null, 2)}
                                      </pre>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })()}

                      {/* Full Entry */}
                      {(() => {
                        const sections = sectionsById[row.id] ?? DEFAULT_SECTIONS
                        return (
                          <div className="border border-white/10 bg-black/30 rounded-sm overflow-hidden">
                            <button
                              type="button"
                              onClick={() => toggleSection(row.id, 'fullEntryOpen')}
                              className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/[0.03] transition-colors"
                            >
                              <div className="flex items-center gap-2">
                                <div className="text-white/40">
                                  {sections.fullEntryOpen ? (
                                    <ChevronDown className="w-4 h-4" />
                                  ) : (
                                    <ChevronRight className="w-4 h-4" />
                                  )}
                                </div>
                                <div className="text-[10px] text-white/40 uppercase tracking-[0.2em]">Full Entry</div>
                              </div>
                              <div className="text-[10px] text-white/40 font-mono">
                                {detail?.attachments?.length ? (
                                  <>
                                    Attachments: <span className="text-white/70">{detail.attachments.length}</span>
                                  </>
                                ) : (
                                  <>Attachments: <span className="text-white/70">0</span></>
                                )}
                              </div>
                            </button>

                            {sections.fullEntryOpen && (
                              <div className="px-4 pb-4 pt-3 border-t border-white/10 space-y-3">
                                {detailLoading && (
                                  <div className="flex items-center gap-2 text-white/50 text-xs">
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Loading entry details…
                                  </div>
                                )}
                                {detail === null && !detailLoading && (
                                  <div className="text-xs text-white/40">Failed to load entry JSON.</div>
                                )}
                                {detail && (
                                  <div className="space-y-2">
                                    <FieldRow label="Project EPSG" value={String(detail.project_epsg)} />
                                    <FieldRow label="Datasets" value={`${detail.datasets?.length ?? 0}`} />
                                    <FieldRow label="Attachments" value={`${detail.attachments?.length ?? 0}`} />
                                    <button
                                      type="button"
                                      onClick={() => toggleSection(row.id, 'fullEntryJsonOpen')}
                                      className={cn(
                                        'px-3 py-2 border rounded-sm text-[10px] uppercase font-bold tracking-wider transition-all',
                                        sections.fullEntryJsonOpen
                                          ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                                          : 'bg-white/5 border-white/10 text-white/50 hover:text-white hover:border-white/20'
                                      )}
                                    >
                                      {sections.fullEntryJsonOpen ? 'Hide Entry JSON' : 'Show Entry JSON'}
                                    </button>
                                    {sections.fullEntryJsonOpen && (
                                      <pre className="text-[10px] text-white/80 bg-black/40 border border-white/10 rounded-sm p-3 overflow-auto max-h-[320px]">
                                        {JSON.stringify(detail, null, 2)}
                                      </pre>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })()}

                      {detail?.attachments?.length ? (
                        <div className="space-y-2">
                          <div className="text-[10px] text-white/40 uppercase tracking-[0.2em]">Attachments</div>
                          <div className="space-y-2">
                            {detail.attachments.map((a) => (
                              <div key={a.filename} className="p-3 bg-black/30 border border-white/10 rounded-sm">
                                <div className="flex items-center justify-between gap-3">
                                  <a
                                    className="text-xs text-amber-300 hover:text-amber-200 underline underline-offset-2 break-all"
                                    href={getCreatorAttachmentUrl(detail.project_name, detail.id, a.filename)}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    {a.filename}
                                  </a>
                                  <div className="text-[10px] text-white/40 font-mono">
                                    {formatBytes(a.size_bytes)} • {a.mime}
                                  </div>
                                </div>
                                <div className="text-[10px] text-white/30 font-mono mt-1">Uploaded: {a.uploaded_at}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      <div className="space-y-2">
                        <div className="text-[10px] text-white/40 uppercase tracking-[0.2em]">Changelog</div>
                        {logLoading && (
                          <div className="flex items-center gap-2 text-white/50 text-xs">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Loading changelog…
                          </div>
                        )}
                        {log === null && !logLoading && <div className="text-xs text-white/40">Failed to load changelog.</div>}
                        {Array.isArray(log) && log.length === 0 && !logLoading && (
                          <div className="text-xs text-white/40">No changelog records.</div>
                        )}
                        {Array.isArray(log) && log.length > 0 && (
                          <div className="space-y-2">
                            {log
                              .slice()
                              .reverse()
                              .slice(0, 10)
                              .map((rec, idx) => {
                                const action = String(rec?.action ?? 'event')
                                const ts = formatLocalDateTimeWithOffset(rec?.timestamp)
                                const recKey = `${row.id}:${String(rec?.timestamp ?? idx)}:${action}`
                                const isRecOpen = Boolean(changelogExpandedByKey[recKey])
                                const badge =
                                  action === 'delete'
                                    ? 'bg-red-500/10 border-red-500/30 text-red-400'
                                    : action === 'update'
                                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                                      : action === 'create'
                                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                                        : 'bg-white/5 border-white/10 text-white/60'

                                return (
                                  <div key={recKey} className="border border-white/10 bg-black/30 rounded-sm overflow-hidden">
                                    <button
                                      type="button"
                                      onClick={() => toggleChangelogEntry(recKey)}
                                      className="w-full px-3 py-2 flex items-center justify-between hover:bg-white/[0.03] transition-colors"
                                      title={isRecOpen ? 'Collapse details' : 'Expand details'}
                                    >
                                      <div className="flex items-center gap-2">
                                        <div className="text-white/40">
                                          {isRecOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                        </div>
                                        <span className={cn('px-2 py-0.5 text-[9px] uppercase tracking-wider border rounded-sm', badge)}>
                                          {action.toUpperCase()}
                                        </span>
                                      </div>
                                      <div className="text-[10px] text-white/40 font-mono">{ts}</div>
                                    </button>

                                    {isRecOpen && (
                                      <div className="px-3 pb-3 pt-2 border-t border-white/10">
                                        <ChangelogDetails record={rec} />
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                            {log.length > 10 && (
                              <div className="text-[10px] text-white/30">
                                Showing latest 10 records (total: {log.length}).
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}


