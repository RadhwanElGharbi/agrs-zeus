'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, ChevronRight, ExternalLink, Loader2, Plus, Search, Trash2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fetchDatasetCoverage, type DatasetCoverageEntry, type DatasetCoverageResponse } from '@/lib/api/dataClient'

type DigitalTwinLayerKey =
  | 'parcels'
  | 'zoning'
  | 'protected_areas'
  | 'pipelines'
  | 'powerlines'
  | 'railways'
  | 'roads'
  | 'geotechnical'
  | 'geohazards'
  | 'landslides'
  | 'hydrology'
  | 'wetlands'
  | 'population'
  | 'landcover'
  | 'dem'
  | 'imagery'
  | 'basemap'

type LayerDef = {
  key: DigitalTwinLayerKey
  label: string
  subtitle: string
  required?: boolean
  keywords: string[]
}

type GroupDef = {
  key: string
  label: string
  subtitle: string
  layers: LayerDef[]
}

type VisibleItem =
  | { type: 'group'; key: string; group: GroupDef }
  | { type: 'layer'; key: DigitalTwinLayerKey; layer: LayerDef; groupKey: string }

type TwinAssignments = Partial<Record<DigitalTwinLayerKey, string>>
type FetchState = 'idle' | 'loading' | 'ready' | 'error'

type LayerStatus = 'none' | 'good' | 'warn' | 'confirmed'

const STATUS_THEME: Record<
  LayerStatus,
  {
    plateBg: string
    plateBorder: string
    plateGlow: string
    labelText: string
    control: string
    line: string
  }
> = {
  none: {
    plateBg: 'bg-gradient-to-br from-white/[0.05] to-white/[0.01]',
    plateBorder: 'border-white/10',
    plateGlow: '',
    labelText: 'text-white/45',
    control: 'border-white/20 text-white/45 hover:text-white/80 hover:border-white/40',
    line: 'rgba(255,255,255,0.14)'
  },
  good: {
    plateBg: 'bg-gradient-to-br from-emerald-500/[0.18] to-emerald-500/[0.04]',
    plateBorder: 'border-emerald-500/45',
    plateGlow: 'shadow-[0_0_55px_rgba(16,185,129,0.18)]',
    labelText: 'text-emerald-300/90',
    control: 'border-emerald-500/50 text-emerald-300 hover:bg-emerald-500/10 hover:border-emerald-500/70',
    line: 'rgba(16,185,129,0.55)'
  },
  warn: {
    plateBg: 'bg-gradient-to-br from-amber-500/[0.22] to-amber-500/[0.06]',
    plateBorder: 'border-amber-500/45',
    plateGlow: 'shadow-[0_0_55px_rgba(245,158,11,0.18)]',
    labelText: 'text-amber-300/90',
    control: 'border-amber-500/55 text-amber-300 hover:bg-amber-500/10 hover:border-amber-500/75',
    line: 'rgba(245,158,11,0.62)'
  },
  confirmed: {
    plateBg: 'bg-gradient-to-br from-purple-500/[0.24] to-purple-500/[0.06]',
    plateBorder: 'border-purple-500/55',
    plateGlow: 'shadow-[0_0_65px_rgba(168,85,247,0.22)]',
    labelText: 'text-purple-300/90',
    control: 'border-purple-500/60 text-purple-300 hover:bg-purple-500/10 hover:border-purple-500/80',
    line: 'rgba(168,85,247,0.7)'
  }
}

const DIGITAL_TWIN_MODEL: GroupDef[] = [
  {
    key: 'subsurface',
    label: 'Subsurface',
    subtitle: 'Geology & Geohazards',
    layers: [
      {
        key: 'geohazards',
        label: 'Seismic / Geohazards',
        subtitle: 'Deep subsurface risk & seismic zones',
        required: true,
        keywords: ['geohazard', 'seismic', 'hazard', 'pga', 'earthquake', 'fault', 'gem', 'usgs']
      },
      {
        key: 'geotechnical',
        label: 'Geotechnical',
        subtitle: 'Subsurface soils & engineering properties',
        required: true,
        keywords: ['geotechnical', 'geotech', 'soil', 'soilgrids', 'bearing', 'lithology', 'geology', 'subsurface']
      }
    ]
  },
  {
    key: 'terrain',
    label: 'Terrain & Water',
    subtitle: 'Elevation, Hydrology, Wetlands',
    layers: [
      {
        key: 'dem',
        label: 'Elevation (DEM)',
        subtitle: 'Terrain surface model',
        required: true,
        keywords: ['dem', 'elevation', 'terrain', 'lidar', 'dtm', 'dsm', 'topography', 'srtm', 'copernicus']
      },
      {
        key: 'landslides',
        label: 'Landslides',
        subtitle: 'Slope stability & mass movement',
        keywords: ['landslide', 'landslides', 'mass movement', 'susceptibility', 'inventory', 'slope stability']
      },
      {
        key: 'hydrology',
        label: 'Hydrology',
        subtitle: 'Rivers, basins, floodplains',
        required: true,
        keywords: ['hydrology', 'river', 'stream', 'basin', 'watershed', 'drainage', 'flood']
      },
      {
        key: 'wetlands',
        label: 'Wetlands',
        subtitle: 'Sensitive aquatic habitats',
        keywords: ['wetland', 'wetlands', 'peat', 'marsh', 'mangrove', 'hydric', 'swamp']
      }
    ]
  },
  {
    key: 'nature',
    label: 'Nature & Imagery',
    subtitle: 'Land cover + satellite context',
    layers: [
      {
        key: 'landcover',
        label: 'Land Cover',
        subtitle: 'Vegetation & surface material',
        required: true,
        keywords: ['landcover', 'land cover', 'lulc', 'worldcover', 'corine', 'vegetation']
      },
      {
        key: 'imagery',
        label: 'Satellite Imagery',
        subtitle: 'Visual context & orthophotos',
        keywords: ['imagery', 'satellite', 'aerial', 'orthophoto', 'sentinel', 'landsat', 'planet', 'maxar']
      }
    ]
  },
  {
    key: 'built',
    label: 'Built Environment',
    subtitle: 'Parcels, zoning, constraints',
    layers: [
      {
        key: 'parcels',
        label: 'Parcels',
        subtitle: 'Cadastral boundaries & ownership',
        keywords: ['parcel', 'parcels', 'cadastral', 'cadastre', 'property', 'registry', 'land parcel']
      },
      {
        key: 'zoning',
        label: 'Zoning',
        subtitle: 'Land use regulation',
        keywords: ['zoning', 'land use', 'planning', 'landuse', 'development plan']
      },
      {
        key: 'protected_areas',
        label: 'Protected Areas',
        subtitle: 'Conservation & restricted zones',
        keywords: ['protected', 'reserve', 'park', 'natura', 'heritage', 'conservation']
      },
      {
        key: 'population',
        label: 'Population',
        subtitle: 'Human settlement density',
        keywords: ['population', 'demographic', 'worldpop', 'ghsl', 'settlement', 'density', 'census']
      }
    ]
  },
  {
    key: 'infrastructure',
    label: 'Infrastructure',
    subtitle: 'Transport + utilities',
    layers: [
      {
        key: 'roads',
        label: 'Roads',
        subtitle: 'Transportation network',
        required: true,
        keywords: ['road', 'roads', 'highway', 'motorway', 'street', 'transport', 'osm road']
      },
      {
        key: 'railways',
        label: 'Railways',
        subtitle: 'Rail corridors',
        keywords: ['rail', 'railway', 'train', 'rail corridor']
      },
      {
        key: 'powerlines',
        label: 'Power Lines',
        subtitle: 'Transmission & distribution',
        keywords: ['power', 'powerline', 'power lines', 'transmission', 'grid', 'electric']
      },
      {
        key: 'pipelines',
        label: 'Pipelines',
        subtitle: 'Existing energy infrastructure',
        required: true,
        keywords: ['pipeline', 'pipelines', 'oil pipeline', 'gas pipeline', 'midstream']
      }
    ]
  },
  {
    key: 'atmosphere',
    label: 'Atmosphere',
    subtitle: 'Climate & weather context',
    layers: [
      {
        key: 'basemap',
        label: 'Weather / Climate',
        subtitle: 'Atmospheric conditions',
        keywords: ['weather', 'climate', 'era5', 'worldclim', 'precipitation', 'temperature', 'wind']
      }
    ]
  }
]

const GROUP_ORDER = Object.fromEntries(DIGITAL_TWIN_MODEL.map((g, i) => [g.key, i])) as Record<string, number>

const ALL_LAYERS: LayerDef[] = DIGITAL_TWIN_MODEL.flatMap((g) => g.layers)
const LAYER_KEYS = new Set<DigitalTwinLayerKey>(ALL_LAYERS.map((l) => l.key))

function isLayerKey(key: string): key is DigitalTwinLayerKey {
  return LAYER_KEYS.has(key as DigitalTwinLayerKey)
}

function normalizeText(entry: DatasetCoverageEntry): string {
  return [
    entry.dataset,
    entry.source,
    entry.data_type,
    entry.access,
    entry.coverage,
    entry.temporal_start,
    entry.temporal_end,
    entry.frequency
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function formatTemporalSpan(entry: DatasetCoverageEntry): string {
  const start = (entry.temporal_start || '').trim()
  const end = (entry.temporal_end || '').trim()
  if (start && end) return start === end ? start : `${start} → ${end}`
  return start || end || '-'
}

function extractResolutionMeters(text: string): number | null {
  const lowered = (text || '').toLowerCase()
  if (!lowered) return null
  if (/(sub[-\s]?met(er|re)|sub[-\s]?meter)/.test(lowered)) return 0.5

  const cm = lowered.match(/(\d+(?:\.\d+)?)\s*(cm|centimeter|centimetre)\b/)
  if (cm) return parseFloat(cm[1]) / 100

  const mm = lowered.match(/(\d+(?:\.\d+)?)\s*(mm|millimeter|millimetre)\b/)
  if (mm) return parseFloat(mm[1]) / 1000

  const m = lowered.match(/(\d+(?:\.\d+)?)\s*(m|meter|metre)\b/)
  if (m) return parseFloat(m[1])

  const km = lowered.match(/(\d+(?:\.\d+)?)\s*(km|kilometer|kilometre)\b/)
  if (km) return parseFloat(km[1]) * 1000

  const arc = lowered.match(/(\d+(?:\.\d+)?)\s*(arc-?second|arcsec)\b/)
  if (arc) return parseFloat(arc[1]) * 30

  return null
}

function extractYear(text: string): number | null {
  const match = (text || '').match(/\b(19\d{2}|20\d{2})\b/)
  if (!match) return null
  const year = parseInt(match[1], 10)
  if (!Number.isFinite(year)) return null
  return year
}

type PirlQuality = { verdict: 'good' | 'warn'; reasons: string[]; resolution_m: number | null; year: number | null }

function evaluatePirlQuality(layerKey: DigitalTwinLayerKey, entry: DatasetCoverageEntry | null): PirlQuality {
  if (!entry) {
    return { verdict: 'warn', reasons: ['Dataset details not found in catalogue'], resolution_m: null, year: null }
  }

  const blob = `${entry.dataset} ${entry.source || ''} ${entry.data_type || ''} ${entry.coverage || ''} ${entry.access || ''} ${entry.temporal_start || ''} ${entry.temporal_end || ''}`
  const lowered = blob.toLowerCase()
  const resolution_m = extractResolutionMeters(`${entry.coverage || ''} ${entry.dataset || ''}`) ?? extractResolutionMeters(blob)

  const isCurrent = /(current|present|ongoing|latest)/i.test(`${entry.temporal_end || ''}`)
  const year = extractYear(entry.temporal_end || '') ?? extractYear(entry.temporal_start || '') ?? extractYear(blob)

  const reasons: string[] = []
  let ok = true

  const requireRasterResolution = (max_m: number) => {
    if (resolution_m === null) {
      ok = false
      reasons.push('Resolution not specified')
      return
    }
    if (resolution_m > max_m) {
      ok = false
      reasons.push(`Resolution ${Math.round(resolution_m)}m exceeds target ${max_m}m`)
    }
  }

  const requireRecent = (min_year: number) => {
    if (isCurrent) return
    if (year === null) {
      ok = false
      reasons.push('Temporal coverage not specified')
      return
    }
    if (year < min_year) {
      ok = false
      reasons.push(`Temporal end ${year} older than ${min_year}`)
    }
  }

  switch (layerKey) {
    case 'dem':
      requireRasterResolution(30)
      break
    case 'landcover':
      requireRasterResolution(30)
      break
    case 'geotechnical':
      requireRasterResolution(250)
      break
    case 'geohazards':
      requireRasterResolution(1000)
      break
    case 'landslides':
      requireRasterResolution(250)
      break
    case 'population':
      requireRasterResolution(1000)
      requireRecent(2015)
      break
    case 'imagery':
      requireRasterResolution(2)
      requireRecent(2018)
      break
    case 'wetlands':
      requireRasterResolution(100)
      break
    case 'pipelines':
      if (lowered.includes('openstreetmap') || lowered.includes('osm')) {
        ok = false
        reasons.push('OSM pipeline completeness varies by region')
      }
      break
    case 'parcels':
    case 'zoning':
      if (!/(gov|government|official|authority|cadastre|cadastral|registry)/.test(lowered)) {
        ok = false
        reasons.push('Not clearly authoritative for parcels/zoning')
      }
      break
    case 'roads':
    case 'railways':
    case 'powerlines':
    case 'hydrology':
    case 'protected_areas':
    case 'basemap':
    default:
      if (!isCurrent && year !== null && year < 2005) {
        ok = false
        reasons.push('Dataset appears very old')
      }
      break
  }

  if (ok) return { verdict: 'good', reasons: [], resolution_m, year }
  return { verdict: 'warn', reasons: reasons.length ? reasons : ['Not suitable by heuristic checks'], resolution_m, year }
}

function findEntryByDataset(entries: DatasetCoverageEntry[], datasetName: string): DatasetCoverageEntry | null {
  const key = (datasetName || '').trim().toLowerCase()
  if (!key) return null
  return entries.find((e) => (e.dataset || '').trim().toLowerCase() === key) ?? null
}

function scoreEntry(layer: LayerDef, entry: DatasetCoverageEntry): number {
  const text = normalizeText(entry)
  const typeText = (entry.data_type || '').toLowerCase()
  let score = 0
  for (const kw of layer.keywords) {
    if (!kw) continue
    if (text.includes(kw.toLowerCase())) score += 10
  }
  if (typeText) {
    if (layer.key === 'dem' && (typeText.includes('dem') || typeText.includes('elevation') || typeText.includes('terrain'))) score += 18
    if (layer.key === 'landcover' && (typeText.includes('land') || typeText.includes('cover'))) score += 14
    if (layer.key === 'population' && (typeText.includes('population') || typeText.includes('demograph'))) score += 14
    if (layer.key === 'imagery' && (typeText.includes('imagery') || typeText.includes('satellite') || typeText.includes('aerial'))) score += 14
    if (layer.key === 'pipelines' && typeText.includes('pipeline')) score += 14
    if (layer.key === 'roads' && typeText.includes('road')) score += 14
    if (layer.key === 'hydrology' && (typeText.includes('hydro') || typeText.includes('water'))) score += 14
  }
  if (!entry.applies_globally) score += 2
  return score
}

function computeGroupStatus(group: GroupDef, statusByLayer: Partial<Record<DigitalTwinLayerKey, LayerStatus>>, assignments: TwinAssignments): LayerStatus {
  let anyAssigned = false
  let anyWarn = false
  let anyGood = false
  let anyConfirmed = false

  for (const layer of group.layers) {
    const assigned = !!assignments[layer.key]
    if (assigned) anyAssigned = true
    const st = statusByLayer[layer.key] || 'none'
    if (st === 'confirmed') anyConfirmed = true
    if (st === 'warn') anyWarn = true
    if (st === 'good') anyGood = true
  }

  if (anyConfirmed) return 'confirmed'
  if (!anyAssigned) return 'none'
  if (anyWarn) return 'warn'
  if (anyGood) return 'good'
  return 'none'
}

type HoverState = { key: string; source: 'plate' | 'rail' } | null

export function DatasetDigitalTwinDialog({
  open,
  onClose,
  projectName
}: {
  open: boolean
  onClose: () => void
  projectName: string | null
}) {
  const [mounted, setMounted] = useState(false)
  // No entry/exit animations; close is immediate.

  const [coverageState, setCoverageState] = useState<FetchState>('idle')
  const [coverageError, setCoverageError] = useState<string | null>(null)
  const [coverage, setCoverage] = useState<DatasetCoverageResponse | null>(null)

  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [hovered, setHovered] = useState<HoverState>(null)
  const [expandedGroupKey, setExpandedGroupKey] = useState<string | null>(null)
  const [pickerLayerKey, setPickerLayerKey] = useState<DigitalTwinLayerKey | null>(null)

  const [assignments, setAssignments] = useState<TwinAssignments>({})
  const [confirmed, setConfirmed] = useState<Partial<Record<DigitalTwinLayerKey, boolean>>>({})

  const [query, setQuery] = useState('')
  const [showAll, setShowAll] = useState(false)

  const headerRef = useRef<HTMLDivElement | null>(null)
  const stackRef = useRef<HTMLDivElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const plateRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const controlRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  const [plateAnchors, setPlateAnchors] = useState<Record<string, { x: number; y: number }>>({})
  const [connections, setConnections] = useState<Array<{ key: string; x1: number; y1: number; x2: number; y2: number }>>([])

  const [stackScale, setStackScale] = useState(1.12)
  const [stackOffsetY, setStackOffsetY] = useState(260)

  const storageKey = useMemo(() => {
    const p = (projectName || '').trim()
    return p ? `agrs.dataset_digital_twin.assignments.${p}` : null
  }, [projectName])

  const entries = coverage?.entries ?? []

  const statusByLayer = useMemo(() => {
    const out: Partial<Record<DigitalTwinLayerKey, LayerStatus>> = {}
    for (const layer of ALL_LAYERS) {
      const name = assignments[layer.key]
      if (!name) {
        out[layer.key] = 'none'
        continue
      }
      if (confirmed[layer.key]) {
        out[layer.key] = 'confirmed'
        continue
      }
      const entry = findEntryByDataset(entries, name)
      const quality = evaluatePirlQuality(layer.key, entry)
      out[layer.key] = quality.verdict === 'good' ? 'good' : 'warn'
    }
    return out
  }, [assignments, confirmed, entries])

  const visibleItems = useMemo<VisibleItem[]>(() => {
    const items: VisibleItem[] = []
    for (const group of DIGITAL_TWIN_MODEL) {
      // Parent plate is always visible; children appear only when expanded.
      items.push({ type: 'group', key: group.key, group })
      if (expandedGroupKey === group.key) {
        for (const layer of group.layers) {
          items.push({ type: 'layer', key: layer.key, layer, groupKey: group.key })
        }
      }
    }
    return items
  }, [expandedGroupKey])

  const selectedCount = useMemo(() => Object.values(assignments).filter(Boolean).length, [assignments])
  const requiredMissing = useMemo(() => {
    let missing = 0
    for (const layer of ALL_LAYERS) {
      if (!layer.required) continue
      if (!assignments[layer.key]) missing += 1
    }
    return missing
  }, [assignments])

  const panelLayerKey: DigitalTwinLayerKey | null = useMemo(() => {
    if (pickerLayerKey) return pickerLayerKey
    if (selectedKey && isLayerKey(selectedKey)) return selectedKey
    return null
  }, [pickerLayerKey, selectedKey])

  const panelLayer = useMemo(() => {
    if (!panelLayerKey) return null
    return ALL_LAYERS.find((l) => l.key === panelLayerKey) ?? null
  }, [panelLayerKey])

  const panelAssignedName = panelLayerKey ? assignments[panelLayerKey] || '' : ''
  const panelAssignedEntry = useMemo(() => {
    if (!panelLayerKey) return null
    if (!panelAssignedName) return null
    return findEntryByDataset(entries, panelAssignedName)
  }, [entries, panelAssignedName, panelLayerKey])

  const panelQuality = useMemo(() => {
    if (!panelLayerKey) return null
    if (!panelAssignedName) return null
    return evaluatePirlQuality(panelLayerKey, panelAssignedEntry)
  }, [panelAssignedEntry, panelAssignedName, panelLayerKey])

  const candidates = useMemo(() => {
    if (!panelLayer) return []
    if (!entries.length) return []
    const scored = entries
      .map((entry) => ({ entry, score: scoreEntry(panelLayer, entry) }))
      .filter((row) => showAll || row.score > 0)
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return (a.entry.dataset || '').localeCompare(b.entry.dataset || '')
    })
    const q = query.trim().toLowerCase()
    if (!q) return scored
    return scored.filter(({ entry }) => normalizeText(entry).includes(q))
  }, [entries, panelLayer, query, showAll])

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (!open) return
    setSelectedKey(null)
    setHovered(null)
    setExpandedGroupKey(null)
    setPickerLayerKey(null)
    setQuery('')
    setShowAll(false)
    setStackScale(1.12)
    setStackOffsetY(260)
  }, [open])

  useEffect(() => {
    if (!open) return
    if (!projectName) return

    setCoverageState('loading')
    setCoverageError(null)
    fetchDatasetCoverage(projectName)
      .then((resp) => {
        setCoverage(resp)
        setCoverageState('ready')
      })
      .catch((err) => {
        setCoverage(null)
        setCoverageError(err?.message || 'Failed to load dataset catalogue.')
        setCoverageState('error')
      })
  }, [open, projectName])

  useEffect(() => {
    if (!open) return
    if (!storageKey) return
    try {
      const raw = localStorage.getItem(storageKey)
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object') return
      if ('assignments' in (parsed as any) || 'confirmed' in (parsed as any)) {
        const nextAssignments = (parsed as any).assignments
        const nextConfirmed = (parsed as any).confirmed
        if (nextAssignments && typeof nextAssignments === 'object') setAssignments(nextAssignments as TwinAssignments)
        if (nextConfirmed && typeof nextConfirmed === 'object') setConfirmed(nextConfirmed as Partial<Record<DigitalTwinLayerKey, boolean>>)
        return
      }
      setAssignments(parsed as TwinAssignments)
    } catch (_) {
      // ignore corrupt storage
    }
  }, [open, storageKey])

  useEffect(() => {
    if (!open) return
    if (!storageKey) return
    try {
      localStorage.setItem(storageKey, JSON.stringify({ assignments, confirmed }))
    } catch (_) {}
  }, [assignments, confirmed, open, storageKey])

  const handleClose = () => onClose()

  const closePicker = () => {
    setHovered(null)
    setPickerLayerKey(null)
  }

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (pickerLayerKey) {
        closePicker()
        return
      }
      handleClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, pickerLayerKey])

  const scrollToCandidatesTop = () => {
    listRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const toggleGroup = (group: GroupDef) => {
    const isOpen = expandedGroupKey === group.key
    setPickerLayerKey(null)
    setHovered(null)
    if (isOpen) {
      setExpandedGroupKey(null)
      setSelectedKey(group.key)
      return
    }
    setExpandedGroupKey(group.key)
    // Focus stays on the parent plate; children become accessible after expansion.
    setSelectedKey(group.key)
  }

  // No focus zoom animations; expansion should not move the whole model.

  const selectLayer = (layerKey: DigitalTwinLayerKey) => {
    setSelectedKey(layerKey)
    // If picker open, allow switching focus.
    if (pickerLayerKey) {
      setPickerLayerKey(layerKey)
      scrollToCandidatesTop()
    }
  }

  const openPickerFor = (layerKey: DigitalTwinLayerKey) => {
    setSelectedKey(layerKey)
    setHovered(null)
    setPickerLayerKey(layerKey)
    scrollToCandidatesTop()
  }

  const handleAssign = (layerKey: DigitalTwinLayerKey, datasetName: string) => {
    const trimmed = datasetName.trim()
    if (!trimmed) return
    setAssignments((prev) => ({ ...prev, [layerKey]: trimmed }))
    setConfirmed((prev) => {
      if (!prev[layerKey]) return prev
      const next = { ...prev }
      delete next[layerKey]
      return next
    })
  }

  const handleClear = (layerKey: DigitalTwinLayerKey) => {
    setAssignments((prev) => {
      const next = { ...prev }
      delete next[layerKey]
      return next
    })
    setConfirmed((prev) => {
      if (!prev[layerKey]) return prev
      const next = { ...prev }
      delete next[layerKey]
      return next
    })
  }

  const toggleConfirmed = (layerKey: DigitalTwinLayerKey) => {
    if (!assignments[layerKey]) return
    setConfirmed((prev) => ({ ...prev, [layerKey]: !prev[layerKey] }))
  }

  // Responsive fit: keep stack within viewport bounds. (No clipping on small screens.)
  useLayoutEffect(() => {
    if (!open) return
    if (!stackRef.current) return
    let raf = 0
    let iterations = 0
    const fit = () => {
      iterations += 1
      const stack = stackRef.current
      if (!stack) return
      const headerH = headerRef.current?.getBoundingClientRect().height ?? 0
      const topLimit = Math.max(16, headerH + 18)
      const bottomLimit = window.innerHeight - 16
      const availH = Math.max(120, bottomLimit - topLimit)

      const rect = stack.getBoundingClientRect()
      let changed = false

      const maxScale = expandedGroupKey ? 1.22 : 1.12
      if (rect.height > availH + 2) {
        const factor = availH / rect.height
        const nextScale = Math.max(0.62, Math.min(maxScale, stackScale * factor * 0.98))
        if (Math.abs(nextScale - stackScale) > 0.01) {
          setStackScale(nextScale)
          changed = true
        }
      }

      let dy = 0
      if (rect.top < topLimit) dy = topLimit - rect.top
      if (rect.bottom > bottomLimit) dy = Math.min(dy, bottomLimit - rect.bottom) || bottomLimit - rect.bottom
      if (Math.abs(dy) > 1) {
        setStackOffsetY((prev) => Math.round(prev + dy))
        changed = true
      }

      if (changed && iterations < 10) {
        raf = requestAnimationFrame(fit)
      }
    }

    raf = requestAnimationFrame(fit)
    const onResize = () => {
      iterations = 0
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(fit)
    }
    window.addEventListener('resize', onResize)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
    }
  }, [open, expandedGroupKey, pickerLayerKey, visibleItems.length, stackScale])

  // Measure plate and control positions for connectors + rail alignment.
  useEffect(() => {
    if (!open) return
    if (pickerLayerKey) {
      setPlateAnchors({})
      setConnections([])
      return
    }

    let raf = 0
    let ticks = 0
    const update = () => {
      ticks += 1
      const nextAnchors: Record<string, { x: number; y: number }> = {}
      const nextConnections: Array<{ key: string; x1: number; y1: number; x2: number; y2: number }> = []

      for (const item of visibleItems) {
        const plate = plateRefs.current[item.key]
        if (!plate) continue
        const rect = plate.getBoundingClientRect()
        nextAnchors[item.key] = { x: rect.right - 12, y: rect.top + rect.height / 2 }
      }

      for (const item of visibleItems) {
        const ctrl = controlRefs.current[item.key]
        const anchor = nextAnchors[item.key]
        if (!ctrl || !anchor) continue
        const pr = ctrl.getBoundingClientRect()
        nextConnections.push({
          key: item.key,
          x1: pr.left + pr.width / 2,
          y1: pr.top + pr.height / 2,
          x2: anchor.x,
          y2: anchor.y
        })
      }

      setPlateAnchors(nextAnchors)
      setConnections(nextConnections)

      if (ticks < 10) raf = requestAnimationFrame(update)
    }

    raf = requestAnimationFrame(update)
    const onResize = () => {
      ticks = 0
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(update)
    }
    window.addEventListener('resize', onResize)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
    }
  }, [open, pickerLayerKey, visibleItems, hovered, selectedKey, stackScale, stackOffsetY])

  if (!open || !mounted) return null

  return createPortal(
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[120]" onClick={handleClose}>
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none" />
      </div>

      {/* Dialog */}
      <div className="fixed inset-0 z-[121] pointer-events-none">
        <div
          className="relative w-full h-full bg-[#0a0a0a]/95 flex flex-col pointer-events-auto overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <header
            ref={headerRef}
            className="px-4 py-4 sm:px-8 sm:py-6 absolute top-0 left-0 right-0 z-30 flex items-start justify-between pointer-events-none"
          >
            <div className="pointer-events-auto bg-black/40 backdrop-blur-md px-4 py-3 rounded-lg border border-white/10 max-w-[min(560px,70vw)]">
              <div className="text-[10px] font-mono text-white/40 uppercase tracking-[0.2em] mb-1">Dataset Digital Twin</div>
              <div className="text-[11px] text-white/55 font-mono">
                {projectName ? (
                  <>
                    Project: <span className="text-white/80">{projectName}</span> • {selectedCount}/{ALL_LAYERS.length} attached
                    {requiredMissing > 0 && <span className="ml-2 text-amber-400">• {requiredMissing} required missing</span>}
                  </>
                ) : (
                  'Select a project to use the dataset catalogue.'
                )}
              </div>
            </div>

            <div className="pointer-events-auto flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setAssignments({})
                  setConfirmed({})
                }}
                className="p-3 border border-white/15 text-white/50 hover:text-white hover:border-white/30 hover:bg-white/[0.03] rounded-lg bg-black/40 backdrop-blur-md"
                title="Clear all attachments"
              >
                <Trash2 className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={handleClose}
                className="p-3 hover:bg-white/10 border border-white/10 hover:border-white/30 rounded-lg text-white shrink-0 bg-black/40 backdrop-blur-md"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </header>

          {/* Body */}
          <div className="flex-1 relative overflow-hidden bg-[#050505]">
            {/* Background vignette + grid */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.05)_0%,rgba(0,0,0,0.9)_65%,rgba(0,0,0,1)_100%)] pointer-events-none" />
            <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:60px_60px] [mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,black_45%,transparent_100%)] pointer-events-none" />

            {/* Main stage */}
            <div className="absolute inset-0">
              {/* Stack + rail stage */}
              <div className="absolute inset-0 flex items-center justify-center">
                {/* Click-off area (only closes selection; not the whole dialog) */}
                <div
                  className="absolute inset-0"
                  onMouseLeave={() => setHovered(null)}
                  onClick={(e) => {
                    if (e.target !== e.currentTarget) return
                    setSelectedKey(null)
                    setHovered(null)
                    closePicker()
                  }}
                />

                {/* 3D stack container */}
                <div
                  className="relative flex items-center justify-center"
                  style={{ perspective: '2200px', perspectiveOrigin: '50% 50%' }}
                >
                  <div
                    ref={stackRef}
                    className="relative w-[clamp(320px,46vw,560px)] h-[clamp(380px,62vh,680px)]"
                    style={{
                      transform: `translateY(${stackOffsetY}px) rotateX(58deg) rotateZ(-25deg) scale(${stackScale})`,
                      transformStyle: 'preserve-3d'
                    }}
                  >
                    {/* Base platform */}
                    <div
                      className="absolute inset-0 bg-white/[0.02] border border-white/5 rounded-2xl shadow-[0_0_150px_rgba(0,0,0,0.9)]"
                      style={{ transform: 'translateZ(-140px)' }}
                    />

                    {visibleItems.map((item, idx) => {
                      const key = item.key
                      const isGroup = item.type === 'group'
                      const group = item.type === 'group' ? item.group : DIGITAL_TWIN_MODEL.find((g) => g.key === item.groupKey)!
                      const baseStatus = isGroup ? computeGroupStatus(group, statusByLayer, assignments) : statusByLayer[item.key as DigitalTwinLayerKey] || 'none'
                      const theme = STATUS_THEME[baseStatus]

                      const isSelected = selectedKey === key
                      const isHovered = hovered?.key === key

                      // Ordering: lower idx = deeper; higher idx = higher.
                      const baseY = -idx * 36
                      const baseZ = idx * 28
                      const baseScale = isGroup ? 1.0 : 0.84
                      const yOffset = baseY
                      const zOffset = baseZ
                      const scale = baseScale

                      const plateLabel = isGroup ? group.label : (item as any).layer.label
                      const plateSubtitle = isGroup ? group.subtitle : (item as any).layer.subtitle

                      return (
                        <div
                          key={key}
                          ref={(el) => {
                            plateRefs.current[key] = el
                          }}
                          onMouseEnter={() => setHovered({ key, source: 'plate' })}
                          onMouseLeave={() => setHovered((prev) => (prev?.key === key ? null : prev))}
                          onClick={(e) => {
                            e.stopPropagation()
                            if (isGroup) {
                              // Single click selects only. Expand is double-click only.
                              setSelectedKey(group.key)
                              return
                            }
                            selectLayer(key as DigitalTwinLayerKey)
                          }}
                          onDoubleClick={(e) => {
                            e.stopPropagation()
                            if (!isGroup) return
                            toggleGroup(group)
                          }}
                          className={cn(
                            'absolute inset-0 rounded-xl border cursor-pointer group',
                            theme.plateBg,
                            theme.plateBorder,
                            theme.plateGlow,
                            'backdrop-blur-sm',
                            isSelected && 'border-primary/70 shadow-[0_0_60px_rgba(var(--primary),0.28)]',
                            isHovered && !isSelected && 'border-white/30 shadow-[0_0_40px_rgba(255,255,255,0.14)]'
                          )}
                          style={{
                            transform: `translate3d(0, ${yOffset}px, ${zOffset}px) scale(${scale})`,
                            transformStyle: 'preserve-3d',
                            // Maintain plate stacking order at all times.
                            zIndex: idx
                          }}
                        >
                          {/* glass sheen */}
                          <div className="absolute inset-0 bg-gradient-to-br from-white/6 to-transparent rounded-xl pointer-events-none" />

                          {/* pins */}
                          <span className="absolute -left-1 -top-1 h-2.5 w-2.5 bg-white/15 border border-white/20 rotate-45" />
                          <span className="absolute -right-1 -top-1 h-2.5 w-2.5 bg-white/15 border border-white/20 rotate-45" />
                          <span className="absolute -left-1 -bottom-1 h-2.5 w-2.5 bg-white/15 border border-white/20 rotate-45" />
                          <span className="absolute -right-1 -bottom-1 h-2.5 w-2.5 bg-white/15 border border-white/20 rotate-45" />

                          {/* printed label (bottom right) */}
                          <div className="absolute right-6 bottom-6 pointer-events-none select-none text-right">
                            <div
                              className={cn(
                                'text-[18px] font-black uppercase tracking-[0.22em]',
                                baseStatus === 'good'
                                  ? 'text-emerald-200/22'
                                  : baseStatus === 'warn'
                                    ? 'text-amber-200/22'
                                    : baseStatus === 'confirmed'
                                      ? 'text-purple-200/25'
                                      : 'text-white/16',
                                isSelected && 'text-primary/60'
                              )}
                            >
                              {plateLabel}
                            </div>
                            <div className="text-[10px] font-mono text-white/25 uppercase tracking-widest mt-1">
                              {isGroup ? 'Category' : plateSubtitle}
                            </div>
                          </div>

                          {/* surface pattern */}
                          {!isGroup && assignments[key as DigitalTwinLayerKey] ? (
                            <div
                              className={cn(
                                'absolute inset-4 rounded-lg border border-dashed opacity-40 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.05)_25%,rgba(255,255,255,0.05)_50%,transparent_50%,transparent_75%,rgba(255,255,255,0.05)_75%,rgba(255,255,255,0.05)_100%)] bg-[size:20px_20px]'
                              )}
                            />
                          ) : (
                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100">
                              <div className="text-[10px] font-mono uppercase tracking-widest text-white/30">
                                {isGroup ? 'Click to expand' : 'Use + to attach'}
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Right rail + connectors */}
                {!pickerLayerKey && (
                  <>
                    {/* Connectors */}
                    <svg className="absolute inset-0 z-20 pointer-events-none" width="100%" height="100%">
                      {connections.map((c) => {
                        const item = visibleItems.find((v) => v.key === c.key)
                        if (!item) return null
                        const status =
                          item.type === 'group'
                            ? computeGroupStatus(item.group, statusByLayer, assignments)
                            : statusByLayer[item.key] || 'none'
                        const theme = STATUS_THEME[status]
                        return (
                          <line
                            key={c.key}
                            x1={c.x1}
                            y1={c.y1}
                            x2={c.x2}
                            y2={c.y2}
                            stroke={theme.line}
                            strokeWidth={1}
                            strokeDasharray="6 8"
                            opacity={0.55}
                          />
                        )
                      })}
                    </svg>

                    {/* Rail */}
                    <div className="absolute inset-0 z-30 pointer-events-none">
                      {visibleItems.map((item) => {
                        const anchor = plateAnchors[item.key]
                        if (!anchor) return null

                        const isGroup = item.type === 'group'
                        const isSelected = selectedKey === item.key
                        const isHovered = hovered?.key === item.key

                        const status = isGroup
                          ? computeGroupStatus(item.group, statusByLayer, assignments)
                          : statusByLayer[item.key] || 'none'
                        const theme = STATUS_THEME[status]

                        const label = isGroup ? item.group.label : item.layer.label
                        const subtitle = isGroup ? item.group.subtitle : item.layer.subtitle
                        const isExpanded = isGroup ? expandedGroupKey === item.group.key : false

                        return (
                          <div
                            key={item.key}
                            className="absolute right-4 sm:right-10 flex items-center gap-2 sm:gap-3 pointer-events-auto"
                            style={{ top: anchor.y, transform: 'translateY(-50%)' }}
                            onMouseEnter={() => setHovered({ key: item.key, source: 'rail' })}
                            onMouseLeave={() => setHovered((prev) => (prev?.key === item.key ? null : prev))}
                          >
                            <button
                              ref={(el) => {
                                controlRefs.current[item.key] = el
                              }}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                if (isGroup) {
                                  // Single click selects only. Expand is double-click only.
                                  setSelectedKey(item.group.key)
                                  return
                                }
                                openPickerFor(item.key)
                              }}
                              onDoubleClick={(e) => {
                                e.stopPropagation()
                                if (!isGroup) return
                                toggleGroup(item.group)
                              }}
                              className={cn(
                                'h-8 w-8 sm:h-9 sm:w-9 rounded-full border flex items-center justify-center',
                                'bg-black/25 backdrop-blur-md',
                                theme.control,
                                isSelected && 'border-primary/60 text-primary',
                                isHovered && !isSelected && 'border-white/35 text-white/80'
                              )}
                              title={
                                isGroup
                                  ? isExpanded
                                    ? 'Double-click to collapse'
                                    : 'Double-click to expand'
                                  : `Attach dataset to ${label}`
                              }
                            >
                              {isGroup ? (
                                isExpanded ? (
                                  <ChevronDown className="w-4 h-4" />
                                ) : (
                                  <ChevronRight className="w-4 h-4" />
                                )
                              ) : (
                                <Plus className="w-4 h-4" />
                              )}
                            </button>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                if (isGroup) {
                                  setSelectedKey(item.group.key)
                                  return
                                }
                                selectLayer(item.key)
                              }}
                              onDoubleClick={(e) => {
                                e.stopPropagation()
                                if (!isGroup) return
                                toggleGroup(item.group)
                              }}
                              className={cn(
                                'w-[clamp(160px,18vw,240px)] text-right text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.18em] select-none',
                                theme.labelText,
                                isSelected && 'text-white',
                                isHovered && !isSelected && 'text-white/85'
                              )}
                              title={subtitle}
                            >
                              {label}
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}

                {/* Dataset picker panel (overlay, responsive width) */}
                <div
                  className={cn(
                    'absolute top-0 right-0 h-full w-[min(520px,100vw)] border-l border-white/10 bg-[#0a0a0a]/95 backdrop-blur-xl',
                    pickerLayerKey ? 'translate-x-0 pointer-events-auto' : 'translate-x-full pointer-events-none'
                  )}
                >
                  <div className="h-full flex flex-col p-4 sm:p-8">
                    <div className="flex items-start justify-between gap-3 mb-6">
                      <div className="min-w-0">
                        <div className="text-[10px] font-mono text-white/40 uppercase tracking-widest">Attach dataset</div>
                        <div className="text-2xl font-bold text-white uppercase tracking-wide font-mono truncate">
                          {panelLayer?.label || 'Layer'}
                        </div>
                        <div className="text-sm text-white/50 truncate">{panelLayer?.subtitle || ''}</div>
                      </div>
                      <button
                        type="button"
                        onClick={closePicker}
                        className="p-2 rounded-md border border-white/10 text-white/30 hover:text-white hover:border-white/30 hover:bg-white/[0.03]"
                        title="Close picker"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>

                    {/* Attached */}
                    <div className="mb-4 p-4 border border-white/10 bg-white/[0.02] rounded-md">
                      <div className="text-[9px] font-mono text-white/40 uppercase tracking-wider mb-2">Attached</div>
                      {panelLayerKey && panelAssignedName ? (
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-[12px] font-bold text-white truncate">{panelAssignedName}</div>
                            {panelAssignedEntry?.source && (
                              <div className="text-[10px] text-white/50 font-mono truncate">{panelAssignedEntry.source}</div>
                            )}
                            <div className="mt-2 flex items-center gap-2 flex-wrap">
                              <span
                                className={cn(
                                  'text-[9px] font-mono uppercase tracking-widest',
                                  confirmed[panelLayerKey]
                                    ? 'text-purple-300'
                                    : (panelQuality?.verdict ?? 'warn') === 'good'
                                      ? 'text-emerald-300'
                                      : 'text-amber-300'
                                )}
                              >
                                {confirmed[panelLayerKey]
                                  ? 'Confirmed for PIRL'
                                  : (panelQuality?.verdict ?? 'warn') === 'good'
                                    ? 'PIRL-ready (heuristic)'
                                    : 'Needs review (heuristic)'}
                              </span>
                              <button
                                type="button"
                                onClick={() => toggleConfirmed(panelLayerKey)}
                                className={cn(
                                  'px-2 py-1 border rounded-sm text-[9px] font-mono uppercase tracking-wider',
                                  confirmed[panelLayerKey]
                                    ? 'border-purple-500/40 text-purple-300 hover:bg-purple-500/10'
                                    : 'border-white/15 text-white/50 hover:text-white hover:border-white/30 hover:bg-white/[0.03]'
                                )}
                                title="Manually confirm this dataset is acceptable for PIRL (turns plate purple)"
                              >
                                {confirmed[panelLayerKey] ? 'Unconfirm' : 'Confirm'}
                              </button>
                            </div>
                            {panelQuality?.reasons?.length ? (
                              <div className="mt-2 text-[10px] text-white/35 font-mono">
                                {panelQuality.reasons.slice(0, 2).join(' • ')}
                              </div>
                            ) : null}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleClear(panelLayerKey)}
                            className="px-3 py-1.5 border border-white/15 text-white/50 hover:text-white hover:border-white/30 hover:bg-white/[0.03] rounded-sm text-[10px] font-mono uppercase tracking-wider"
                          >
                            Clear
                          </button>
                        </div>
                      ) : (
                        <div className="text-[10px] font-mono text-white/30 italic">No dataset attached yet.</div>
                      )}
                    </div>

                    {/* Search */}
                    <div className="mb-3 relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                      <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search catalogue…"
                        className="w-full bg-white/5 border border-white/10 rounded-md pl-10 pr-4 py-3 text-xs font-mono text-white focus:border-primary/50 focus:ring-0 outline-none"
                      />
                    </div>

                    <label className="flex items-center gap-2 mb-4 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        className="appearance-none w-3.5 h-3.5 border border-white/30 rounded-sm checked:bg-primary checked:border-primary"
                        checked={showAll}
                        onChange={(e) => setShowAll(e.target.checked)}
                      />
                      <span className="text-[10px] font-mono uppercase tracking-wider text-white/50">
                        Show all datasets (ignore matching)
                      </span>
                    </label>

                    {/* Catalogue */}
                    <div ref={listRef} className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
                      {coverageState === 'loading' ? (
                        <div className="flex items-center justify-center gap-3 py-16 text-white/40 font-mono text-xs uppercase tracking-widest">
                          <Loader2 className="w-5 h-5 text-primary" />
                          <span>Loading catalogue…</span>
                        </div>
                      ) : coverageState === 'error' ? (
                        <div className="border border-red-500/30 bg-red-500/10 text-red-400 rounded-md p-4 text-xs font-mono">
                          ERROR: {coverageError || 'Failed to load dataset catalogue.'}
                        </div>
                      ) : candidates.length === 0 ? (
                        <div className="py-12 text-center">
                          <div className="text-white/20 font-mono text-xs uppercase tracking-widest mb-2">No matching datasets</div>
                          <p className="text-white/10 text-xs">Try enabling “Show all datasets”.</p>
                        </div>
                      ) : (
                        candidates.map(({ entry, score }, idx) => {
                          const layerKey = panelLayerKey
                          const isAttached =
                            !!layerKey &&
                            (assignments[layerKey] || '').trim().toLowerCase() === (entry.dataset || '').trim().toLowerCase()

                          const quality =
                            layerKey && isAttached ? evaluatePirlQuality(layerKey, entry) : layerKey ? evaluatePirlQuality(layerKey, entry) : null

                          return (
                            <div
                              key={`${entry.dataset}-${idx}`}
                              className={cn(
                                'group p-4 border rounded-md',
                                isAttached
                                  ? 'bg-primary/[0.08] border-primary/40 shadow-[0_0_20px_rgba(var(--primary),0.1)]'
                                  : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.04] hover:border-white/20'
                              )}
                            >
                              <div className="flex items-start justify-between gap-4">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="text-sm font-bold text-white truncate group-hover:text-primary">
                                      {entry.dataset}
                                    </span>
                                    {score > 15 && (
                                      <span className="px-1.5 py-0.5 bg-primary/20 text-primary text-[9px] font-mono uppercase rounded-sm">
                                        Rec
                                      </span>
                                    )}
                                  </div>
                                  {entry.source && <div className="text-[10px] text-white/45 font-mono truncate">{entry.source}</div>}

                                  <div className="mt-3 flex flex-wrap gap-2">
                                    {entry.data_type && (
                                      <span className="px-2 py-1 bg-white/5 rounded-sm text-[10px] text-white/60 font-mono">
                                        {entry.data_type}
                                      </span>
                                    )}
                                    {entry.coverage && (
                                      <span className="px-2 py-1 bg-white/5 rounded-sm text-[10px] text-white/60 font-mono">
                                        {entry.coverage}
                                      </span>
                                    )}
                                    <span className="px-2 py-1 bg-white/5 rounded-sm text-[10px] text-white/60 font-mono">
                                      {formatTemporalSpan(entry)}
                                    </span>
                                    {quality && (
                                      <span
                                        className={cn(
                                          'px-2 py-1 rounded-sm text-[10px] font-mono uppercase tracking-wider',
                                          quality.verdict === 'good' ? 'bg-emerald-500/10 text-emerald-300' : 'bg-amber-500/10 text-amber-300'
                                        )}
                                      >
                                        {quality.verdict === 'good' ? 'Good' : 'Warn'}
                                      </span>
                                    )}
                                  </div>
                                </div>

                                <div className="flex flex-col gap-2 shrink-0 items-end">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (!panelLayerKey) return
                                      if (isAttached) handleClear(panelLayerKey)
                                      else handleAssign(panelLayerKey, entry.dataset)
                                    }}
                                    className={cn(
                                      'px-4 py-2 text-[10px] font-bold uppercase tracking-wider rounded-sm',
                                      isAttached
                                        ? 'bg-transparent border border-primary/50 text-primary hover:bg-primary/10'
                                        : 'bg-white/10 text-white hover:bg-white/20'
                                    )}
                                  >
                                    {isAttached ? 'Remove' : 'Add'}
                                  </button>
                                  {entry.url && (
                                    <a
                                      href={entry.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="flex items-center justify-center p-2 text-white/20 hover:text-white"
                                      title="Open source"
                                    >
                                      <ExternalLink className="w-3 h-3" />
                                    </a>
                                  )}
                                </div>
                              </div>
                            </div>
                          )
                        })
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body
  )
}


