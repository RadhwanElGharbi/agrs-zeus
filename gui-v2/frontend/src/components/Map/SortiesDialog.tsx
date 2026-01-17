'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronRight, Loader2, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useMapView } from '@/lib/context/MapViewContext'
import {
  archiveProjectSortie,
  createProjectSortie,
  fetchCreatorGeoJSON,
  fetchProjectDatasets,
  fetchProjectSorties,
  searchUserDirectory,
  updateCreatorEntry,
  updateProjectSortie,
  type CreatorCategory,
  type CreatorDatasetRef,
  type CreatorGeoJSONFeatureCollection,
  type Sortie,
  type UpdateSortieRequest,
  type UserProfile
} from '@/lib/api/dataClient'

type SortieStatus = 'planned' | 'active' | 'completed' | 'archived'

type ExternalParticipant = {
  full_name: string
  organization: string
  department: string
  job_title: string
  contact: string
  direct_superior: string
}

type SortieEditorState = {
  mode: 'create' | 'edit'
  sortieId: string | null
  code: string
  name: string
  status: SortieStatus
  startedAtLocal: string
  endedAtLocal: string
  notes: string
  whyCategory: CreatorCategory
  whyCategoryOther: string
  whyComments: string
  transportation: { walkover: boolean; vehicle: boolean; uav: boolean; other: boolean; other_text: string }
  tools: string
  resources: string
  software: string
  geometryWgs84: GeoJSON.Geometry | null
  selectedDatasets: CreatorDatasetRef[]
  selectedCreatorEntryIds: string[]
  registeredParticipants: UserProfile[]
  externalParticipants: ExternalParticipant[]
  saving: boolean
  error: string | null
}

interface SortiesDialogProps {
  open: boolean
  onClose: () => void
  projectName: string | null
  initialView?: 'index' | 'create'
}

function normalize(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase()
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

function formatLocalDateTimeWithOffset(isoTimestamp: string | null | undefined): string {
  if (!isoTimestamp) return '—'
  const date = new Date(isoTimestamp)
  if (Number.isNaN(date.getTime())) return String(isoTimestamp)
  const dt = `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`
  const offsetMinutes = -date.getTimezoneOffset()
  if (!Number.isFinite(offsetMinutes) || offsetMinutes === 0) return `${dt} UTC`
  const sign = offsetMinutes >= 0 ? '+' : '-'
  const abs = Math.abs(offsetMinutes)
  const hours = Math.floor(abs / 60)
  const mins = abs % 60
  const tz = mins === 0 ? `UTC${sign}${hours}` : `UTC${sign}${hours}:${pad2(mins)}`
  return `${dt} ${tz}`
}

function toIsoFromDatetimeLocal(value: string): string | null {
  const v = (value || '').trim()
  if (!v) return null
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

function datetimeLocalFromIso(value: string | null | undefined): string {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

function statusFromSortie(sortie: Sortie): SortieStatus {
  const m = sortie?.metadata
  const raw = typeof m?.status === 'string' ? String(m.status).toLowerCase() : ''
  if (raw === 'planned' || raw === 'active' || raw === 'completed' || raw === 'archived') return raw
  // fallback heuristic from times
  const started = sortie.started_at ? new Date(sortie.started_at) : null
  const ended = sortie.ended_at ? new Date(sortie.ended_at) : null
  const now = new Date()
  if (ended && !Number.isNaN(ended.getTime()) && ended <= now) return 'completed'
  if (started && !Number.isNaN(started.getTime()) && started > now) return 'planned'
  if (started && !Number.isNaN(started.getTime()) && started <= now && !ended) return 'active'
  return 'planned'
}

function defaultEditor(): SortieEditorState {
  return {
    mode: 'create',
    sortieId: null,
    code: '',
    name: '',
    status: 'planned',
    startedAtLocal: '',
    endedAtLocal: '',
    notes: '',
    whyCategory: 'Engineering',
    whyCategoryOther: '',
    whyComments: '',
    transportation: { walkover: false, vehicle: false, uav: false, other: false, other_text: '' },
    tools: '',
    resources: '',
    software: '',
    geometryWgs84: null,
    selectedDatasets: [],
    selectedCreatorEntryIds: [],
    registeredParticipants: [],
    externalParticipants: [],
    saving: false,
    error: null
  }
}

export function SortiesDialog({ open, onClose, projectName, initialView = 'index' }: SortiesDialogProps) {
  const { operator } = useMapView()
  const [isClosing, setIsClosing] = useState(false)
  const [view, setView] = useState<'index' | 'editor'>('index')
  const [editorDocked, setEditorDocked] = useState(false)
  const [dockHeight, setDockHeight] = useState(45)
  const dockHeightRef = useRef(dockHeight)
  const dockContainerRef = useRef<HTMLDivElement | null>(null)

  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sorties, setSorties] = useState<Sortie[]>([])
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [showJson, setShowJson] = useState<Record<string, boolean>>({})

  const [creatorGeojson, setCreatorGeojson] = useState<CreatorGeoJSONFeatureCollection | null>(null)
  const [creatorGeojsonLoading, setCreatorGeojsonLoading] = useState(false)

  const [datasets, setDatasets] = useState<CreatorDatasetRef[]>([])
  const [datasetsLoading, setDatasetsLoading] = useState(false)

  const [editor, setEditor] = useState<SortieEditorState>(() => defaultEditor())

  const [userQuery, setUserQuery] = useState('')
  const [userLoading, setUserLoading] = useState(false)
  const [userError, setUserError] = useState<string | null>(null)
  const [userOptions, setUserOptions] = useState<UserProfile[]>([])

  useEffect(() => {
    if (open) {
      setIsClosing(false)
      return
    }
    const t = setTimeout(() => {
      setQuery('')
      setLoading(false)
      setError(null)
      setSorties([])
      setExpanded({})
      setShowJson({})
      setCreatorGeojson(null)
      setCreatorGeojsonLoading(false)
      setView('index')
      setEditor(defaultEditor())
      setDatasets([])
      setDatasetsLoading(false)
      setUserQuery('')
      setUserLoading(false)
      setUserError(null)
      setUserOptions([])
      setEditorDocked(false)
      setDockHeight(45)
      dockHeightRef.current = 45
    }, 200)
    return () => clearTimeout(t)
  }, [open])

  // Allow parent to open directly into the create workflow or the index.
  useEffect(() => {
    if (!open) return
    if (initialView === 'create') {
      setEditor(defaultEditor())
      setView('editor')
    } else if (initialView === 'index') {
      setView('index')
    }
  }, [initialView, open])

  const handleClose = useCallback(() => {
    setIsClosing(true)
    setTimeout(() => onClose(), 150)
  }, [onClose])

  const docked = editorDocked && view === 'editor'

  useEffect(() => {
    dockHeightRef.current = dockHeight
  }, [dockHeight])

  const handleDockResizeMouseDown = useCallback((event: React.MouseEvent) => {
    event.preventDefault()
    const startY = event.clientY
    const startHeight = dockHeightRef.current
    let frame: number | null = null
    let nextHeight = startHeight

    const applyHeight = () => {
      const el = dockContainerRef.current
      if (el) {
        el.style.height = `${nextHeight}vh`
        el.style.maxHeight = `${nextHeight}vh`
      }
      frame = null
    }

    const move = (ev: MouseEvent) => {
      const deltaY = ev.clientY - startY
      const vhDelta = (deltaY / (window.innerHeight || 1)) * 100
      nextHeight = Math.max(20, Math.min(80, startHeight - vhDelta))
      dockHeightRef.current = nextHeight
      if (frame === null) {
        frame = requestAnimationFrame(applyHeight)
      }
    }

    const up = () => {
      if (frame !== null) {
        cancelAnimationFrame(frame)
        applyHeight()
      }
      setDockHeight(dockHeightRef.current)
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }

    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }, [])

  const handleToggleDock = useCallback(() => setEditorDocked((prev) => !prev), [])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, handleClose])

  const loadSorties = useCallback(
    async (q?: string) => {
      if (!projectName) return
      setLoading(true)
      setError(null)
      try {
        const resp = await fetchProjectSorties(projectName, { q: (q || '').trim() || undefined, limit: 200 })
        setSorties(Array.isArray(resp?.sorties) ? resp.sorties : [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load sorties.')
        setSorties([])
      } finally {
        setLoading(false)
      }
    },
    [projectName]
  )

  useEffect(() => {
    if (!open || !projectName) return
    const t = setTimeout(() => void loadSorties(query), 250)
    return () => clearTimeout(t)
  }, [open, projectName, loadSorties, query])

  useEffect(() => {
    if (!open || !projectName) return
    setCreatorGeojsonLoading(true)
    fetchCreatorGeoJSON(projectName, { includeDeleted: true })
      .then((resp) => setCreatorGeojson(resp))
      .catch(() => setCreatorGeojson(null))
      .finally(() => setCreatorGeojsonLoading(false))
  }, [open, projectName])

  useEffect(() => {
    if (!open || !projectName) return
    setDatasetsLoading(true)
    fetchProjectDatasets(projectName)
      .then((resp) => {
        const refs: CreatorDatasetRef[] = []
        for (const v of resp?.vectors ?? []) refs.push({ name: v.name, type: 'vector' })
        for (const r of resp?.rasters ?? []) refs.push({ name: r.name, type: 'raster' })
        setDatasets(refs)
      })
      .catch(() => setDatasets([]))
      .finally(() => setDatasetsLoading(false))
  }, [open, projectName])

  useEffect(() => {
    if (!open || view !== 'editor') return
    const q = userQuery.trim()
    if (!q) {
      setUserOptions([])
      setUserError(null)
      return
    }
    const t = setTimeout(async () => {
      setUserLoading(true)
      setUserError(null)
      try {
        const resp = await searchUserDirectory(q, 50, 0)
        setUserOptions(Array.isArray(resp?.users) ? resp.users : [])
      } catch (err) {
        setUserOptions([])
        setUserError(err instanceof Error ? err.message : 'Failed to search users.')
      } finally {
        setUserLoading(false)
      }
    }, 250)
    return () => clearTimeout(t)
  }, [open, userQuery, view])

  const counts = useMemo(() => {
    const total = sorties.length
    const archived = sorties.filter((s) => statusFromSortie(s) === 'archived').length
    return { total, archived }
  }, [sorties])

  const filteredSorties = useMemo(() => {
    const q = normalize(query)
    if (!q) return sorties
    return sorties.filter((s) => normalize(s.code).includes(q) || normalize(s.name ?? '').includes(q) || normalize((s.metadata as any)?.status).includes(q))
  }, [query, sorties])

  const creatorRows = useMemo(() => {
    const feats = (creatorGeojson?.features ?? []) as any[]
    return feats
      .map((f) => {
        const props = f?.properties ?? {}
        const id = String(props.creator_id ?? f?.id ?? '')
        return {
          id,
          title: String(props.title ?? id),
          type: String(props.creator_type ?? ''),
          status: String(props.status ?? ''),
          sortieId: props.sortie_id ? String(props.sortie_id) : null
        }
      })
      .filter((r) => Boolean(r.id))
  }, [creatorGeojson])

  const linkedCreatorEntriesForSortie = useCallback(
    (sortieId: string) => creatorRows.filter((r) => r.sortieId === sortieId),
    [creatorRows]
  )

  const toggleExpanded = useCallback((id: string) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] })), [])
  const toggleJson = useCallback((id: string) => setShowJson((prev) => ({ ...prev, [id]: !prev[id] })), [])

  const startCreate = useCallback(() => {
    setEditor(defaultEditor())
    setView('editor')
  }, [])

  const startEdit = useCallback((sortie: Sortie) => {
    const m: any = sortie.metadata && typeof sortie.metadata === 'object' ? sortie.metadata : {}
    const who = m?.who && typeof m.who === 'object' ? m.who : {}
    const what = m?.what && typeof m.what === 'object' ? m.what : {}
    const where = m?.where && typeof m.where === 'object' ? m.where : {}
    const why = m?.why && typeof m.why === 'object' ? m.why : {}

    const reg = Array.isArray(who?.registered_participants) ? (who.registered_participants as UserProfile[]) : []
    const ext = Array.isArray(who?.external_participants) ? (who.external_participants as ExternalParticipant[]) : []
    const transport = what?.transportation && typeof what.transportation === 'object' ? what.transportation : {}

    setEditor({
      mode: 'edit',
      sortieId: sortie.id,
      code: sortie.code,
      name: sortie.name ?? '',
      status: statusFromSortie(sortie),
      startedAtLocal: datetimeLocalFromIso(sortie.started_at ?? null),
      endedAtLocal: datetimeLocalFromIso(sortie.ended_at ?? null),
      notes: sortie.notes ?? '',
      whyCategory: (why?.category as CreatorCategory) ?? 'Engineering',
      whyCategoryOther: String(why?.category_other ?? ''),
      whyComments: String(why?.comments ?? ''),
      transportation: {
        walkover: Boolean(transport.walkover),
        vehicle: Boolean(transport.vehicle),
        uav: Boolean(transport.uav),
        other: Boolean(transport.other),
        other_text: String(transport.other_text ?? '')
      },
      tools: String(what?.tools ?? ''),
      resources: String(what?.resources ?? ''),
      software: String(what?.software ?? ''),
      geometryWgs84: (where?.geometry_wgs84 as GeoJSON.Geometry) ?? null,
      selectedDatasets: Array.isArray(what?.datasets) ? (what.datasets as CreatorDatasetRef[]) : [],
      selectedCreatorEntryIds: Array.isArray(what?.associated_creator_entry_ids) ? (what.associated_creator_entry_ids as string[]) : [],
      registeredParticipants: reg,
      externalParticipants: ext,
      saving: false,
      error: null
    })
    setView('editor')
  }, [])

  const handleArchive = useCallback(
    async (sortieId: string) => {
      if (!projectName) return
      if (!confirm('Archive this sortie?')) return
      try {
        await archiveProjectSortie(projectName, sortieId)
        await loadSorties(query)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to archive sortie.')
      }
    },
    [loadSorties, projectName, query]
  )

  const handleUnlinkCreatorEntry = useCallback(
    async (entryId: string) => {
      if (!projectName) return
      try {
        const fd = new FormData()
        fd.append('sortie_id', '')
        await updateCreatorEntry(projectName, entryId, fd)
        const resp = await fetchCreatorGeoJSON(projectName, { includeDeleted: true })
        setCreatorGeojson(resp)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to unlink operator entry.')
      }
    },
    [projectName]
  )

  const handleSaveSortie = useCallback(async () => {
    if (!projectName) return
    setEditor((prev) => ({ ...prev, saving: true, error: null }))
    try {
      const started_at = toIsoFromDatetimeLocal(editor.startedAtLocal)
      const ended_at = toIsoFromDatetimeLocal(editor.endedAtLocal)

      const metadata = {
        status: editor.status,
        who: {
          registered_participants: editor.registeredParticipants,
          external_participants: editor.externalParticipants
        },
        what: {
          transportation: editor.transportation,
          tools: editor.tools,
          resources: editor.resources,
          software: editor.software,
          associated_creator_entry_ids: editor.selectedCreatorEntryIds,
          datasets: editor.selectedDatasets
        },
        where: {
          geometry_wgs84: editor.geometryWgs84
        },
        why: {
          category: editor.whyCategory,
          category_other: editor.whyCategory === 'Other' ? editor.whyCategoryOther : '',
          comments: editor.whyComments
        }
      }

      let saved: Sortie
      if (editor.mode === 'create') {
        const code = editor.code.trim()
        if (!code) throw new Error('SortieID (code) is required.')
        saved = await createProjectSortie(projectName, {
          code,
          name: editor.name.trim() || undefined,
          started_at: started_at ?? undefined,
          ended_at: ended_at ?? undefined,
          notes: editor.notes.trim() || undefined,
          metadata
        })
        // Link any selected operator entries to this sortie
        if (editor.selectedCreatorEntryIds.length > 0) {
          await Promise.all(
            editor.selectedCreatorEntryIds.map(async (entryId) => {
              const fd = new FormData()
              fd.append('sortie_id', saved.id)
              await updateCreatorEntry(projectName, entryId, fd)
            })
          )
        }
      } else {
        if (!editor.sortieId) throw new Error('Missing sortie id.')
        const payload: UpdateSortieRequest = {
          name: editor.name.trim() || null,
          started_at: started_at,
          ended_at: ended_at,
          notes: editor.notes.trim() || null,
          metadata
        }
        saved = await updateProjectSortie(projectName, editor.sortieId, payload)
        // Link/unlink operator entries based on selection
        const currentLinked = new Set(linkedCreatorEntriesForSortie(editor.sortieId).map((r) => r.id))
        const desiredLinked = new Set(editor.selectedCreatorEntryIds)
        const toLink = [...desiredLinked].filter((id) => !currentLinked.has(id))
        const toUnlink = [...currentLinked].filter((id) => !desiredLinked.has(id))
        await Promise.all([
          ...toLink.map(async (entryId) => {
            const fd = new FormData()
            fd.append('sortie_id', editor.sortieId || '')
            await updateCreatorEntry(projectName, entryId, fd)
          }),
          ...toUnlink.map(async (entryId) => {
            const fd = new FormData()
            fd.append('sortie_id', '')
            await updateCreatorEntry(projectName, entryId, fd)
          })
        ])
      }

      await loadSorties(query)
      const refreshedCreator = await fetchCreatorGeoJSON(projectName, { includeDeleted: true })
      setCreatorGeojson(refreshedCreator)

      // Jump back to index and expand the saved sortie
      setView('index')
      setExpanded((prev) => ({ ...prev, [saved.id]: true }))
      setEditor(defaultEditor())
    } catch (err) {
      setEditor((prev) => ({ ...prev, saving: false, error: err instanceof Error ? err.message : 'Save failed.' }))
      return
    } finally {
      setEditor((prev) => ({ ...prev, saving: false }))
    }
  }, [editor, linkedCreatorEntriesForSortie, loadSorties, projectName, query])

  const handlePickGeometry = useCallback(
    async (kind: 'point' | 'polygon') => {
      setEditor((prev) => ({ ...prev, error: null }))
      try {
        const geom = await operator.captureGeometry(kind)
        setEditor((prev) => ({ ...prev, geometryWgs84: geom }))
      } catch (err) {
        setEditor((prev) => ({ ...prev, error: err instanceof Error ? err.message : 'Failed to capture geometry.' }))
      }
    },
    [operator]
  )

  const toggleDataset = useCallback((ref: CreatorDatasetRef) => {
    setEditor((prev) => {
      const key = `${ref.type ?? 'dataset'}:${ref.name}`
      const has = prev.selectedDatasets.some((d) => `${d.type ?? 'dataset'}:${d.name}` === key)
      return {
        ...prev,
        selectedDatasets: has ? prev.selectedDatasets.filter((d) => `${d.type ?? 'dataset'}:${d.name}` !== key) : [...prev.selectedDatasets, ref]
      }
    })
  }, [])

  const toggleCreatorEntrySelected = useCallback((entryId: string) => {
    setEditor((prev) => {
      const has = prev.selectedCreatorEntryIds.includes(entryId)
      return {
        ...prev,
        selectedCreatorEntryIds: has ? prev.selectedCreatorEntryIds.filter((id) => id !== entryId) : [...prev.selectedCreatorEntryIds, entryId]
      }
    })
  }, [])

  const addRegisteredParticipant = useCallback((u: UserProfile) => {
    setEditor((prev) => {
      if (prev.registeredParticipants.some((p) => p.id === u.id)) return prev
      return { ...prev, registeredParticipants: [...prev.registeredParticipants, u] }
    })
    setUserQuery('')
    setUserOptions([])
  }, [])

  const removeRegisteredParticipant = useCallback((userId: string) => {
    setEditor((prev) => ({ ...prev, registeredParticipants: prev.registeredParticipants.filter((u) => u.id !== userId) }))
  }, [])

  const addExternalParticipant = useCallback(() => {
    setEditor((prev) => ({
      ...prev,
      externalParticipants: [
        ...prev.externalParticipants,
        { full_name: '', organization: '', department: '', job_title: '', contact: '', direct_superior: '' }
      ]
    }))
  }, [])

  const updateExternalParticipant = useCallback((idx: number, patch: Partial<ExternalParticipant>) => {
    setEditor((prev) => {
      const next = [...prev.externalParticipants]
      next[idx] = { ...next[idx], ...patch }
      return { ...prev, externalParticipants: next }
    })
  }, [])

  const removeExternalParticipant = useCallback((idx: number) => {
    setEditor((prev) => ({ ...prev, externalParticipants: prev.externalParticipants.filter((_, i) => i !== idx) }))
  }, [])

  if (!open) return null

  return (
    <div className={cn('fixed inset-0 z-[110] pointer-events-none', isClosing ? 'animate-fade-out' : 'animate-fade-in')}>
      <div
        className={cn(
          'absolute inset-0 pointer-events-none',
          docked
            ? 'bg-[radial-gradient(circle_at_bottom,rgba(245,158,11,0.10),transparent_55%)]'
            : 'bg-[radial-gradient(circle_at_top,rgba(245,158,11,0.10),transparent_55%)]'
        )}
      />

      <div
        ref={dockContainerRef}
        className={cn(
          'pointer-events-auto absolute bg-[#0a0a0a]/95 border border-white/10 shadow-[0_0_50px_-10px_rgba(0,0,0,0.8)] flex flex-col overflow-hidden font-mono',
          docked
            ? 'bottom-0 left-0 right-0 w-full rounded-none border-x-0 border-b-0'
            : 'left-1/2 top-[76px] -translate-x-1/2 w-[980px] max-w-[96vw] max-h-[calc(100vh-100px)] rounded-sm'
        )}
        style={
          docked
            ? {
                margin: 0,
                borderRadius: 0,
                height: `${dockHeight}vh`,
                maxHeight: `${dockHeight}vh`
              }
            : undefined
        }
        onClick={(e) => e.stopPropagation()}
      >
        {docked && (
          <div
            className="absolute top-0 left-0 right-0 h-2 cursor-ns-resize hover:bg-amber-500/20 transition-colors z-50"
            style={{ transform: 'translateY(-2px)' }}
            onMouseDown={handleDockResizeMouseDown}
            title="Drag to resize height"
          />
        )}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-amber-500/40 to-transparent" />

        <header className="px-8 py-6 border-b border-white/10 flex items-center justify-between bg-black/20 shrink-0">
          <div className="flex flex-col gap-1 min-w-0">
            <div className="flex items-center gap-2 text-[10px] text-white/40 uppercase tracking-[0.2em]">
              <span>Operator</span>
              <span className="text-white/20">|</span>
              <span className="text-white/50 truncate">{projectName ?? 'NO PROJECT'}</span>
            </div>
            <div className="flex items-center gap-3 min-w-0">
              <h2 className="text-xl font-bold text-white uppercase tracking-wide truncate">
                {view === 'index' ? 'Sortie Entry Index' : editor.mode === 'create' ? 'New Sortie' : 'Edit Sortie'}
              </h2>
              {view === 'index' && (
                <div className="flex items-center gap-2 px-2 py-0.5 bg-white/5 border border-white/10 rounded-sm shrink-0">
                  <span className="text-[9px] text-white/50 uppercase tracking-wider">
                    Total: <span className="text-white">{counts.total}</span>
                  </span>
                  <span className="text-white/20">|</span>
                  <span className="text-[9px] text-white/50 uppercase tracking-wider">
                    Archived: <span className="text-white">{counts.archived}</span>
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {view === 'editor' ? (
              <>
                <button
                  type="button"
                  onClick={handleToggleDock}
                  className="px-4 py-2 border border-amber-500/30 text-amber-200/80 hover:bg-amber-500/10 hover:text-amber-200 rounded-sm text-[10px] uppercase font-bold tracking-wider transition-all"
                  title={docked ? 'Undock (open as a modal)' : 'Dock to bottom'}
                >
                  {docked ? 'Undock' : 'Dock to bottom'}
                </button>
                <button
                  type="button"
                  onClick={() => setView('index')}
                  className="px-4 py-2 border border-white/10 text-white/70 hover:text-white hover:border-white/20 hover:bg-white/5 rounded-sm text-[10px] uppercase font-bold tracking-wider transition-all"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleSaveSortie}
                  disabled={editor.saving || !projectName}
                  className={cn(
                    'px-4 py-2 border rounded-sm text-[10px] uppercase font-bold tracking-wider transition-all',
                    editor.saving
                      ? 'bg-white/5 border-white/10 text-white/30 cursor-not-allowed'
                      : 'bg-amber-500/10 border-amber-500/30 text-amber-200 hover:bg-amber-500/15 hover:border-amber-500/40'
                  )}
                  title="Save sortie"
                >
                  {editor.saving ? 'Saving…' : 'Save'}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={startCreate}
                disabled={!projectName}
                className="px-4 py-2 border border-amber-500/30 text-amber-200/80 hover:bg-amber-500/10 hover:text-amber-200 rounded-sm text-[10px] uppercase font-bold tracking-wider transition-all disabled:opacity-40 disabled:pointer-events-none"
              >
                New Sortie
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

        {view === 'index' && (
          <>
            <div className="px-6 py-4 border-b border-white/10 bg-white/[0.02] shrink-0">
              <div className="flex flex-col md:flex-row md:items-center gap-3">
                <div className="flex-1 flex items-center gap-2 px-3 py-2 bg-black/40 border border-white/10 rounded-sm">
                  <Search className="w-4 h-4 text-white/30" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search code, name, status..."
                    className="w-full bg-transparent outline-none text-xs text-white/80 placeholder:text-white/30"
                  />
                </div>
                <div className="text-[10px] text-white/40 font-mono">
                  {loading ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Loading…
                    </span>
                  ) : (
                    <span>{filteredSorties.length} results</span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-8 bg-[linear-gradient(to_right,#ffffff02_1px,transparent_1px),linear-gradient(to_bottom,#ffffff02_1px,transparent_1px)] bg-[size:20px_20px]">
              {!projectName && (
                <div className="p-6 text-center text-white/30 text-xs border border-white/10 rounded-sm bg-black/40">
                  Select a project to view its sorties.
                </div>
              )}

              {projectName && !loading && error && (
                <div className="p-4 border border-red-500/20 bg-red-500/5 rounded-sm text-xs text-red-300 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 mt-0.5" />
                  <div>{error}</div>
                </div>
              )}

              {projectName && !loading && !error && filteredSorties.length === 0 && (
                <div className="p-6 text-center text-white/30 text-xs border border-white/10 rounded-sm bg-black/40">
                  No sorties match your query.
                </div>
              )}

              <div className="space-y-3">
                {filteredSorties.map((s) => {
                  const isOpen = Boolean(expanded[s.id])
                  const status = statusFromSortie(s)
                  const badge =
                    status === 'archived'
                      ? 'bg-red-500/10 border-red-500/30 text-red-400'
                      : status === 'completed'
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                        : status === 'active'
                          ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                          : 'bg-white/5 border-white/10 text-white/60'
                  const linked = linkedCreatorEntriesForSortie(s.id)

                  return (
                    <div key={s.id} className="border border-white/10 bg-black/30 rounded-sm overflow-hidden">
                      <button
                        type="button"
                        onClick={() => toggleExpanded(s.id)}
                        className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/[0.03] transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="text-white/40">{isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}</div>
                          <div className="min-w-0 flex flex-col items-start gap-1">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-xs font-bold text-white truncate">{s.code}</span>
                              <span className={cn('px-2 py-0.5 text-[9px] uppercase tracking-wider border rounded-sm', badge)}>{status.toUpperCase()}</span>
                              {s.name ? (
                                <span className="text-[10px] text-white/40 truncate max-w-[320px]">{s.name}</span>
                              ) : null}
                            </div>
                            <div className="text-[10px] text-white/40 flex flex-wrap gap-x-3 gap-y-1">
                              <span>
                                Started: <span className="text-white/60">{formatLocalDateTimeWithOffset(s.started_at)}</span>
                              </span>
                              <span>
                                Ended: <span className="text-white/60">{formatLocalDateTimeWithOffset(s.ended_at)}</span>
                              </span>
                              <span>
                                Linked Entries: <span className="text-white/60">{linked.length}</span>
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="text-[10px] text-white/30 font-mono truncate max-w-[260px]" title={s.id}>
                          {s.id}
                        </div>
                      </button>

                      {isOpen && (
                        <div className="px-4 pb-4 pt-2 border-t border-white/10 space-y-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => startEdit(s)}
                              className="px-3 py-2 border border-white/10 bg-white/5 text-white/70 hover:text-white hover:border-white/20 hover:bg-white/10 rounded-sm text-[10px] uppercase font-bold tracking-wider transition-all"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleArchive(s.id)}
                              className="px-3 py-2 border border-red-500/20 bg-red-500/5 text-red-300 hover:text-red-200 hover:border-red-500/30 hover:bg-red-500/10 rounded-sm text-[10px] uppercase font-bold tracking-wider transition-all"
                            >
                              Archive
                            </button>
                            <button
                              type="button"
                              onClick={() => toggleJson(s.id)}
                              className="px-3 py-2 border border-white/10 bg-black/30 text-white/60 hover:text-white hover:border-white/20 rounded-sm text-[10px] uppercase font-bold tracking-wider transition-all"
                            >
                              {showJson[s.id] ? 'Hide JSON' : 'Show JSON'}
                            </button>
                          </div>

                          {showJson[s.id] && (
                            <pre className="text-[10px] text-white/80 bg-black/40 border border-white/10 rounded-sm p-3 overflow-auto max-h-[320px]">
                              {JSON.stringify(s.metadata, null, 2)}
                            </pre>
                          )}

                          <div className="border border-white/10 bg-black/30 rounded-sm p-4">
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-[10px] text-white/40 uppercase tracking-[0.2em]">Linked Operator Entries</div>
                              <div className="text-[10px] text-white/30 font-mono">
                                {creatorGeojsonLoading ? 'loading…' : `${linked.length} linked`}
                              </div>
                            </div>

                            {creatorGeojsonLoading && (
                              <div className="mt-2 flex items-center gap-2 text-white/50 text-xs">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Loading Operator entries…
                              </div>
                            )}

                            {!creatorGeojsonLoading && linked.length === 0 && (
                              <div className="mt-2 text-xs text-white/40">No Operator entries linked to this sortie.</div>
                            )}

                            {!creatorGeojsonLoading && linked.length > 0 && (
                              <div className="mt-3 space-y-2">
                                {linked.slice(0, 12).map((row) => (
                                  <div key={row.id} className="flex items-center justify-between gap-3 border border-white/10 bg-black/30 rounded-sm px-3 py-2">
                                    <div className="min-w-0">
                                      <div className="text-xs text-white/80 truncate">{row.title}</div>
                                      <div className="text-[10px] text-white/40 font-mono">
                                        {row.type} · {row.status}
                                      </div>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => handleUnlinkCreatorEntry(row.id)}
                                      className="px-2 py-1 text-[10px] uppercase font-bold tracking-wider border border-white/10 bg-white/5 text-white/60 hover:text-white hover:border-white/20 rounded-sm"
                                    >
                                      Unlink
                                    </button>
                                  </div>
                                ))}
                                {linked.length > 12 && <div className="text-[10px] text-white/30">Showing first 12 entries.</div>}
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
          </>
        )}

        {view === 'editor' && (
          <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">
            {!projectName && (
              <div className="p-4 border border-white/10 bg-black/30 rounded-sm text-xs text-white/50">Select a project first.</div>
            )}

            {editor.error && (
              <div className="p-4 border border-red-500/20 bg-red-500/5 rounded-sm text-xs text-red-300 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5" />
                <div>{editor.error}</div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-mono text-white/40 uppercase tracking-widest">SortieID (code)</label>
                <input
                  value={editor.code}
                  disabled={editor.mode === 'edit'}
                  onChange={(e) => setEditor((prev) => ({ ...prev, code: e.target.value }))}
                  className={cn(
                    'w-full bg-black/50 border border-white/10 rounded-sm px-3 py-2 text-xs font-mono focus:outline-none focus:border-amber-500/50',
                    editor.mode === 'edit' ? 'text-white/30' : 'text-white'
                  )}
                  placeholder="e.g. SRT-ITA-2026-001"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-mono text-white/40 uppercase tracking-widest">Name (optional)</label>
                <input
                  value={editor.name}
                  onChange={(e) => setEditor((prev) => ({ ...prev, name: e.target.value }))}
                  className="w-full bg-black/50 border border-white/10 rounded-sm px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-amber-500/50"
                  placeholder="e.g. River crossing site visit"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-mono text-white/40 uppercase tracking-widest">Status</label>
                <select
                  value={editor.status}
                  onChange={(e) => setEditor((prev) => ({ ...prev, status: e.target.value as SortieStatus }))}
                  className="w-full bg-black/50 border border-white/10 rounded-sm px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-amber-500/50"
                >
                  <option value="planned">planned</option>
                  <option value="active">active</option>
                  <option value="completed">completed</option>
                  <option value="archived">archived</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-mono text-white/40 uppercase tracking-widest">Start</label>
                <input
                  type="datetime-local"
                  value={editor.startedAtLocal}
                  onChange={(e) => setEditor((prev) => ({ ...prev, startedAtLocal: e.target.value }))}
                  className="w-full bg-black/50 border border-white/10 rounded-sm px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-amber-500/50"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-mono text-white/40 uppercase tracking-widest">End</label>
                <input
                  type="datetime-local"
                  value={editor.endedAtLocal}
                  onChange={(e) => setEditor((prev) => ({ ...prev, endedAtLocal: e.target.value }))}
                  className="w-full bg-black/50 border border-white/10 rounded-sm px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-amber-500/50"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-mono text-white/40 uppercase tracking-widest">Why · Category</label>
                <select
                  value={editor.whyCategory}
                  onChange={(e) => setEditor((prev) => ({ ...prev, whyCategory: e.target.value as CreatorCategory }))}
                  className="w-full bg-black/50 border border-white/10 rounded-sm px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-amber-500/50"
                >
                  <option>Geological</option>
                  <option>Environmental</option>
                  <option>Engineering</option>
                  <option>Regulatory</option>
                  <option>Crossing</option>
                  <option>Other</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-mono text-white/40 uppercase tracking-widest">Why · Other</label>
                <input
                  value={editor.whyCategoryOther}
                  onChange={(e) => setEditor((prev) => ({ ...prev, whyCategoryOther: e.target.value }))}
                  disabled={editor.whyCategory !== 'Other'}
                  className={cn(
                    'w-full bg-black/50 border border-white/10 rounded-sm px-3 py-2 text-xs font-mono focus:outline-none focus:border-amber-500/50',
                    editor.whyCategory !== 'Other' ? 'text-white/30' : 'text-white'
                  )}
                  placeholder={editor.whyCategory === 'Other' ? 'Specify…' : '—'}
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-mono text-white/40 uppercase tracking-widest">Why · Purpose comments</label>
              <textarea
                value={editor.whyComments}
                onChange={(e) => setEditor((prev) => ({ ...prev, whyComments: e.target.value }))}
                className="w-full min-h-[80px] bg-black/50 border border-white/10 rounded-sm px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-amber-500/50"
                placeholder="Purpose, objectives, on-site questions…"
              />
            </div>

            <div className="space-y-2 border border-white/10 bg-black/30 rounded-sm p-4">
              <div className="text-[10px] text-white/40 uppercase tracking-[0.2em]">Who · Participants</div>

              <div className="space-y-2">
                <div className="text-[10px] text-white/40 uppercase tracking-widest">Add ZEUS user</div>
                <input
                  value={userQuery}
                  onChange={(e) => setUserQuery(e.target.value)}
                  className="w-full bg-black/50 border border-white/10 rounded-sm px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-amber-500/50"
                  placeholder="Search users…"
                />
                <div className="max-h-[140px] overflow-auto border border-white/10 rounded-sm bg-black/30">
                  {userLoading ? (
                    <div className="px-3 py-2 text-xs font-mono text-white/50">Loading…</div>
                  ) : userError ? (
                    <div className="px-3 py-2 text-xs font-mono text-red-300">{userError}</div>
                  ) : userOptions.length === 0 ? (
                    <div className="px-3 py-2 text-xs font-mono text-white/50">{userQuery.trim() ? 'No users found.' : 'Type to search…'}</div>
                  ) : (
                    userOptions.map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => addRegisteredParticipant(u)}
                        className="w-full text-left px-3 py-2 text-xs font-mono border-b border-white/5 last:border-b-0 text-white/75 hover:bg-white/[0.03] hover:text-white transition-colors"
                        title={u.email}
                      >
                        <span className="truncate">{u.full_name}</span>
                        <span className="text-[10px] text-white/40 ml-2">{u.organization ?? u.company ?? ''}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>

              {editor.registeredParticipants.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[10px] text-white/40 uppercase tracking-widest">Registered participants</div>
                  <div className="space-y-2">
                    {editor.registeredParticipants.map((u) => (
                      <div key={u.id} className="border border-white/10 bg-black/30 rounded-sm p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-xs text-white/85 truncate">{u.full_name}</div>
                            <div className="text-[10px] text-white/40 font-mono">
                              {u.organization ?? '—'} · {u.department ?? '—'} · {u.position ?? '—'}
                            </div>
                            <div className="text-[10px] text-white/40 font-mono">
                              {u.email} {u.work_phone ? `· ${u.work_phone}` : ''}
                            </div>
                            {u.superior?.full_name ? (
                              <div className="text-[10px] text-white/40 font-mono">Superior: {u.superior.full_name}</div>
                            ) : null}
                          </div>
                          <button
                            type="button"
                            onClick={() => removeRegisteredParticipant(u.id)}
                            className="px-2 py-1 text-[10px] uppercase font-bold tracking-wider border border-white/10 bg-white/5 text-white/60 hover:text-white hover:border-white/20 rounded-sm"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between gap-3 pt-2">
                <div className="text-[10px] text-white/40 uppercase tracking-widest">External participants</div>
                <button
                  type="button"
                  onClick={addExternalParticipant}
                  className="px-3 py-2 border border-white/10 bg-white/5 text-white/60 hover:text-white hover:border-white/20 rounded-sm text-[10px] uppercase font-bold tracking-wider transition-all"
                >
                  Add external
                </button>
              </div>

              {editor.externalParticipants.length > 0 && (
                <div className="space-y-3">
                  {editor.externalParticipants.map((p, idx) => (
                    <div key={idx} className="border border-white/10 bg-black/30 rounded-sm p-3 space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-[10px] text-white/40 uppercase tracking-widest">External #{idx + 1}</div>
                        <button
                          type="button"
                          onClick={() => removeExternalParticipant(idx)}
                          className="px-2 py-1 text-[10px] uppercase font-bold tracking-wider border border-white/10 bg-white/5 text-white/60 hover:text-white hover:border-white/20 rounded-sm"
                        >
                          Remove
                        </button>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <input
                          value={p.full_name}
                          onChange={(e) => updateExternalParticipant(idx, { full_name: e.target.value })}
                          className="w-full bg-black/50 border border-white/10 rounded-sm px-3 py-2 text-xs font-mono text-white focus:outline-none"
                          placeholder="Full name"
                        />
                        <input
                          value={p.organization}
                          onChange={(e) => updateExternalParticipant(idx, { organization: e.target.value })}
                          className="w-full bg-black/50 border border-white/10 rounded-sm px-3 py-2 text-xs font-mono text-white focus:outline-none"
                          placeholder="Organization"
                        />
                        <input
                          value={p.department}
                          onChange={(e) => updateExternalParticipant(idx, { department: e.target.value })}
                          className="w-full bg-black/50 border border-white/10 rounded-sm px-3 py-2 text-xs font-mono text-white focus:outline-none"
                          placeholder="Department"
                        />
                        <input
                          value={p.job_title}
                          onChange={(e) => updateExternalParticipant(idx, { job_title: e.target.value })}
                          className="w-full bg-black/50 border border-white/10 rounded-sm px-3 py-2 text-xs font-mono text-white focus:outline-none"
                          placeholder="Job title"
                        />
                        <input
                          value={p.contact}
                          onChange={(e) => updateExternalParticipant(idx, { contact: e.target.value })}
                          className="w-full bg-black/50 border border-white/10 rounded-sm px-3 py-2 text-xs font-mono text-white focus:outline-none"
                          placeholder="Contact (phone/email)"
                        />
                        <input
                          value={p.direct_superior}
                          onChange={(e) => updateExternalParticipant(idx, { direct_superior: e.target.value })}
                          className="w-full bg-black/50 border border-white/10 rounded-sm px-3 py-2 text-xs font-mono text-white focus:outline-none"
                          placeholder="Direct superior"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2 border border-white/10 bg-black/30 rounded-sm p-4">
              <div className="text-[10px] text-white/40 uppercase tracking-[0.2em]">What</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="text-[10px] text-white/40 uppercase tracking-widest">Transportation</div>
                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    {[
                      { key: 'walkover', label: 'Walkover' },
                      { key: 'vehicle', label: 'Vehicle' },
                      { key: 'uav', label: 'UAV' },
                      { key: 'other', label: 'Other' }
                    ].map((opt) => (
                      <label key={opt.key} className="flex items-center gap-2 text-white/70">
                        <input
                          type="checkbox"
                          checked={(editor.transportation as any)[opt.key]}
                          onChange={(e) =>
                            setEditor((prev) => ({
                              ...prev,
                              transportation: { ...prev.transportation, [opt.key]: e.target.checked }
                            }))
                          }
                        />
                        {opt.label}
                      </label>
                    ))}
                  </div>
                  {editor.transportation.other && (
                    <input
                      value={editor.transportation.other_text}
                      onChange={(e) =>
                        setEditor((prev) => ({ ...prev, transportation: { ...prev.transportation, other_text: e.target.value } }))
                      }
                      className="w-full bg-black/50 border border-white/10 rounded-sm px-3 py-2 text-xs font-mono text-white focus:outline-none"
                      placeholder="Other transport details…"
                    />
                  )}
                </div>
                <div className="space-y-2">
                  <div className="text-[10px] text-white/40 uppercase tracking-widest">Tools / Resources / Software</div>
                  <textarea
                    value={editor.tools}
                    onChange={(e) => setEditor((prev) => ({ ...prev, tools: e.target.value }))}
                    className="w-full min-h-[70px] bg-black/50 border border-white/10 rounded-sm px-3 py-2 text-xs font-mono text-white focus:outline-none"
                    placeholder="Tools…"
                  />
                  <textarea
                    value={editor.resources}
                    onChange={(e) => setEditor((prev) => ({ ...prev, resources: e.target.value }))}
                    className="w-full min-h-[70px] bg-black/50 border border-white/10 rounded-sm px-3 py-2 text-xs font-mono text-white focus:outline-none"
                    placeholder="Resources…"
                  />
                  <textarea
                    value={editor.software}
                    onChange={(e) => setEditor((prev) => ({ ...prev, software: e.target.value }))}
                    className="w-full min-h-[70px] bg-black/50 border border-white/10 rounded-sm px-3 py-2 text-xs font-mono text-white focus:outline-none"
                    placeholder="Software…"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2 border border-white/10 bg-black/30 rounded-sm p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[10px] text-white/40 uppercase tracking-[0.2em]">What · Dataset context</div>
                <div className="text-[10px] text-white/30 font-mono">
                  {datasetsLoading ? 'loading…' : `${editor.selectedDatasets.length} selected`}
                </div>
              </div>
              {datasetsLoading ? (
                <div className="flex items-center gap-2 text-white/50 text-xs">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading datasets…
                </div>
              ) : datasets.length === 0 ? (
                <div className="text-xs text-white/40">No datasets found for this project.</div>
              ) : (
                <div className="max-h-[180px] overflow-auto border border-white/10 rounded-sm bg-black/30">
                  {datasets.map((d) => {
                    const key = `${d.type ?? 'dataset'}:${d.name}`
                    const selected = editor.selectedDatasets.some((x) => `${x.type ?? 'dataset'}:${x.name}` === key)
                    return (
                      <label
                        key={key}
                        className={cn(
                          'flex items-center justify-between gap-3 px-3 py-2 border-b border-white/5 last:border-b-0 text-xs font-mono cursor-pointer',
                          selected ? 'bg-amber-500/10 text-white' : 'text-white/70 hover:bg-white/[0.03] hover:text-white'
                        )}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <input type="checkbox" checked={selected} onChange={() => toggleDataset(d)} />
                          <span className="truncate">{d.name}</span>
                        </div>
                        <span className="text-[10px] text-white/40">{d.type ?? 'dataset'}</span>
                      </label>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="space-y-2 border border-white/10 bg-black/30 rounded-sm p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[10px] text-white/40 uppercase tracking-[0.2em]">What · Associated Operator Entries</div>
                <div className="text-[10px] text-white/30 font-mono">
                  {creatorGeojsonLoading ? 'loading…' : `${editor.selectedCreatorEntryIds.length} selected`}
                </div>
              </div>
              {creatorGeojsonLoading ? (
                <div className="flex items-center gap-2 text-white/50 text-xs">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading Operator entries…
                </div>
              ) : creatorRows.length === 0 ? (
                <div className="text-xs text-white/40">No Operator entries in this project yet.</div>
              ) : (
                <div className="max-h-[220px] overflow-auto border border-white/10 rounded-sm bg-black/30">
                  {creatorRows.map((r) => {
                    const selected = editor.selectedCreatorEntryIds.includes(r.id)
                    const alreadyLinkedToOther = r.sortieId && editor.sortieId && r.sortieId !== editor.sortieId
                    return (
                      <label
                        key={r.id}
                        className={cn(
                          'flex items-center justify-between gap-3 px-3 py-2 border-b border-white/5 last:border-b-0 text-xs font-mono cursor-pointer',
                          selected ? 'bg-amber-500/10 text-white' : 'text-white/70 hover:bg-white/[0.03] hover:text-white'
                        )}
                        title={alreadyLinkedToOther ? `Linked to another sortie (${r.sortieId})` : r.id}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleCreatorEntrySelected(r.id)}
                          />
                          <span className="truncate">{r.title}</span>
                        </div>
                        <span className="text-[10px] text-white/40">
                          {r.type} {r.sortieId ? '· linked' : ''}
                        </span>
                      </label>
                    )
                  })}
                </div>
              )}
              <div className="text-[10px] text-white/30">
                Note: saving will (re)assign the selected Operator entries to this sortie.
              </div>
            </div>

            <div className="space-y-2 border border-white/10 bg-black/30 rounded-sm p-4">
              <div className="text-[10px] text-white/40 uppercase tracking-[0.2em]">Where</div>
              <div className="text-[10px] text-white/30">
                Use the buttons below to set point/area on the main map (Operator Mode), or paste GeoJSON geometry.
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handlePickGeometry('point')}
                  disabled={!projectName || operator.geometryEditActive}
                  className="px-3 py-2 border border-white/10 bg-white/5 text-white/70 hover:text-white hover:border-white/20 hover:bg-white/10 rounded-sm text-[10px] uppercase font-bold tracking-wider transition-all disabled:opacity-40 disabled:pointer-events-none"
                  title="Set sortie location (Point) on the map"
                >
                  Set point on map
                </button>
                <button
                  type="button"
                  onClick={() => void handlePickGeometry('polygon')}
                  disabled={!projectName || operator.geometryEditActive}
                  className="px-3 py-2 border border-white/10 bg-white/5 text-white/70 hover:text-white hover:border-white/20 hover:bg-white/10 rounded-sm text-[10px] uppercase font-bold tracking-wider transition-all disabled:opacity-40 disabled:pointer-events-none"
                  title="Set sortie location (Area) on the map"
                >
                  Set area on map
                </button>
                {operator.geometryEditActive && (
                  <>
                    <button
                      type="button"
                      onClick={() => operator.cancel()}
                      className="px-3 py-2 border border-red-500/20 bg-red-500/5 text-red-300 hover:text-red-200 hover:border-red-500/30 hover:bg-red-500/10 rounded-sm text-[10px] uppercase font-bold tracking-wider transition-all"
                      title="Cancel map drawing"
                    >
                      Cancel draw
                    </button>
                    <div className="text-[10px] text-amber-200/70 font-mono">Map drawing active — finish or cancel the draw.</div>
                  </>
                )}
              </div>
              <textarea
                value={editor.geometryWgs84 ? JSON.stringify(editor.geometryWgs84, null, 2) : ''}
                onChange={(e) => {
                  const text = e.target.value
                  if (!text.trim()) {
                    setEditor((prev) => ({ ...prev, geometryWgs84: null }))
                    return
                  }
                  try {
                    const parsed = JSON.parse(text)
                    if (parsed && typeof parsed === 'object' && typeof parsed.type === 'string') {
                      setEditor((prev) => ({ ...prev, geometryWgs84: parsed as GeoJSON.Geometry }))
                    }
                  } catch {
                    // keep current value; user may be mid-edit
                  }
                }}
                className="w-full min-h-[120px] bg-black/50 border border-white/10 rounded-sm px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-amber-500/50"
                placeholder='{"type":"Point","coordinates":[lon,lat]}'
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-mono text-white/40 uppercase tracking-widest">Notes (optional)</label>
              <textarea
                value={editor.notes}
                onChange={(e) => setEditor((prev) => ({ ...prev, notes: e.target.value }))}
                className="w-full min-h-[90px] bg-black/50 border border-white/10 rounded-sm px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-amber-500/50"
                placeholder="General notes…"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}


