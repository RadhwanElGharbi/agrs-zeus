'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  ExternalLink,
  Layers,
  Loader2,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  X,
  XCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  fetchDatasetCoverage,
  fetchProjectDatasets,
  fetchProjectDatasetStatus,
  type DatasetCoverageEntry,
  type DatasetCoverageResponse,
  type DatasetInfo,
  type DatasetStatusResponse,
  type ProjectDatasets,
} from '@/lib/api/dataClient'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
  color: string
  layers: LayerDef[]
}

type TwinAssignments = Partial<Record<DigitalTwinLayerKey, string>>
type FetchState = 'idle' | 'loading' | 'ready' | 'error'
type LayerStatus = 'none' | 'good' | 'warn' | 'confirmed'

type PirlQuality = {
  verdict: 'good' | 'warn'
  reasons: string[]
  resolution_m: number | null
  year: number | null
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<
  LayerStatus,
  { bg: string; border: string; text: string; dot: string; badge: string }
> = {
  none: {
    bg: 'bg-white/[0.02]',
    border: 'border-white/[0.06]',
    text: 'text-white/40',
    dot: 'bg-white/15',
    badge: 'bg-white/5 text-white/30',
  },
  good: {
    bg: 'bg-emerald-500/[0.06]',
    border: 'border-emerald-500/25',
    text: 'text-emerald-300',
    dot: 'bg-emerald-500',
    badge: 'bg-emerald-500/15 text-emerald-300',
  },
  warn: {
    bg: 'bg-amber-500/[0.06]',
    border: 'border-amber-500/25',
    text: 'text-amber-300',
    dot: 'bg-amber-500',
    badge: 'bg-amber-500/15 text-amber-300',
  },
  confirmed: {
    bg: 'bg-purple-500/[0.06]',
    border: 'border-purple-500/25',
    text: 'text-purple-300',
    dot: 'bg-purple-500',
    badge: 'bg-purple-500/15 text-purple-300',
  },
}

const DIGITAL_TWIN_MODEL: GroupDef[] = [
  {
    key: 'atmosphere',
    label: 'Atmosphere',
    subtitle: 'Climate & weather context',
    color: 'sky',
    layers: [
      {
        key: 'basemap',
        label: 'Weather / Climate',
        subtitle: 'Atmospheric conditions',
        keywords: ['weather', 'climate', 'era5', 'worldclim', 'precipitation', 'temperature', 'wind'],
      },
    ],
  },
  {
    key: 'infrastructure',
    label: 'Infrastructure',
    subtitle: 'Transport + utilities',
    color: 'orange',
    layers: [
      {
        key: 'roads',
        label: 'Roads',
        subtitle: 'Transportation network',
        required: true,
        keywords: ['road', 'roads', 'highway', 'motorway', 'street', 'transport', 'osm road'],
      },
      {
        key: 'railways',
        label: 'Railways',
        subtitle: 'Rail corridors',
        keywords: ['rail', 'railway', 'train', 'rail corridor'],
      },
      {
        key: 'powerlines',
        label: 'Power Lines',
        subtitle: 'Transmission & distribution',
        keywords: ['power', 'powerline', 'power lines', 'transmission', 'grid', 'electric'],
      },
      {
        key: 'pipelines',
        label: 'Pipelines',
        subtitle: 'Existing energy infrastructure',
        required: true,
        keywords: ['pipeline', 'pipelines', 'oil pipeline', 'gas pipeline', 'midstream'],
      },
    ],
  },
  {
    key: 'built',
    label: 'Built Environment',
    subtitle: 'Parcels, zoning, constraints',
    color: 'violet',
    layers: [
      {
        key: 'parcels',
        label: 'Parcels',
        subtitle: 'Cadastral boundaries & ownership',
        keywords: ['parcel', 'parcels', 'cadastral', 'cadastre', 'property', 'registry', 'land parcel'],
      },
      {
        key: 'zoning',
        label: 'Zoning',
        subtitle: 'Land use regulation',
        keywords: ['zoning', 'land use', 'planning', 'landuse', 'development plan'],
      },
      {
        key: 'protected_areas',
        label: 'Protected Areas',
        subtitle: 'Conservation & restricted zones',
        keywords: ['protected', 'reserve', 'park', 'natura', 'heritage', 'conservation'],
      },
      {
        key: 'population',
        label: 'Population',
        subtitle: 'Human settlement density',
        keywords: ['population', 'demographic', 'worldpop', 'ghsl', 'settlement', 'density', 'census'],
      },
    ],
  },
  {
    key: 'nature',
    label: 'Nature & Imagery',
    subtitle: 'Land cover + satellite context',
    color: 'green',
    layers: [
      {
        key: 'landcover',
        label: 'Land Cover',
        subtitle: 'Vegetation & surface material',
        required: true,
        keywords: ['landcover', 'land cover', 'lulc', 'worldcover', 'corine', 'vegetation'],
      },
      {
        key: 'imagery',
        label: 'Satellite Imagery',
        subtitle: 'Visual context & orthophotos',
        keywords: ['imagery', 'satellite', 'aerial', 'orthophoto', 'sentinel', 'landsat', 'planet', 'maxar'],
      },
    ],
  },
  {
    key: 'terrain',
    label: 'Terrain & Water',
    subtitle: 'Elevation, Hydrology, Wetlands',
    color: 'cyan',
    layers: [
      {
        key: 'dem',
        label: 'Elevation (DEM)',
        subtitle: 'Terrain surface model',
        required: true,
        keywords: ['dem', 'elevation', 'terrain', 'lidar', 'dtm', 'dsm', 'topography', 'srtm', 'copernicus'],
      },
      {
        key: 'landslides',
        label: 'Landslides',
        subtitle: 'Slope stability & mass movement',
        keywords: ['landslide', 'landslides', 'mass movement', 'susceptibility', 'inventory', 'slope stability'],
      },
      {
        key: 'hydrology',
        label: 'Hydrology',
        subtitle: 'Rivers, basins, floodplains',
        required: true,
        keywords: ['hydrology', 'river', 'stream', 'basin', 'watershed', 'drainage', 'flood'],
      },
      {
        key: 'wetlands',
        label: 'Wetlands',
        subtitle: 'Sensitive aquatic habitats',
        keywords: ['wetland', 'wetlands', 'peat', 'marsh', 'mangrove', 'hydric', 'swamp'],
      },
    ],
  },
  {
    key: 'subsurface',
    label: 'Subsurface',
    subtitle: 'Geology & Geohazards',
    color: 'rose',
    layers: [
      {
        key: 'geohazards',
        label: 'Seismic / Geohazards',
        subtitle: 'Deep subsurface risk & seismic zones',
        required: true,
        keywords: ['geohazard', 'seismic', 'hazard', 'pga', 'earthquake', 'fault', 'gem', 'usgs'],
      },
      {
        key: 'geotechnical',
        label: 'Geotechnical',
        subtitle: 'Subsurface soils & engineering properties',
        required: true,
        keywords: ['geotechnical', 'geotech', 'soil', 'soilgrids', 'bearing', 'lithology', 'geology', 'subsurface'],
      },
    ],
  },
]

const ALL_LAYERS: LayerDef[] = DIGITAL_TWIN_MODEL.flatMap((g) => g.layers)
const LAYER_KEYS = new Set<DigitalTwinLayerKey>(ALL_LAYERS.map((l) => l.key))

const BACKEND_CATEGORY_TO_LAYER: Record<string, DigitalTwinLayerKey> = {
  dem: 'dem',
  landcover: 'landcover',
  soil: 'geotechnical',
  roads: 'roads',
  railways: 'railways',
  powerlines: 'powerlines',
  waterways: 'hydrology',
  geohazard: 'geohazards',
  pipelines: 'pipelines',
  protected_areas: 'protected_areas',
  indigenous_lands: 'zoning',
}

const DATASET_NAME_PATTERNS: [RegExp, DigitalTwinLayerKey][] = [
  [/\bdem\b/i, 'dem'],
  [/\blandcover\b/i, 'landcover'],
  [/\bsoil/i, 'geotechnical'],
  [/\broad/i, 'roads'],
  [/\brailway/i, 'railways'],
  [/\bpowerline/i, 'powerlines'],
  [/\bwaterway/i, 'hydrology'],
  [/\bgeohazard/i, 'geohazards'],
  [/\bpipeline/i, 'pipelines'],
  [/\bprotected/i, 'protected_areas'],
  [/\bpopulation\b/i, 'population'],
  [/\bparcel/i, 'parcels'],
  [/\bwetland/i, 'wetlands'],
  [/\blandslide/i, 'landslides'],
  [/\bimagery\b/i, 'imagery'],
  [/\bweather\b|climate/i, 'basemap'],
]

function isLayerKey(key: string): key is DigitalTwinLayerKey {
  return LAYER_KEYS.has(key as DigitalTwinLayerKey)
}

// ---------------------------------------------------------------------------
// Quality Evaluation
// ---------------------------------------------------------------------------

function normalizeText(entry: DatasetCoverageEntry): string {
  return [entry.dataset, entry.source, entry.data_type, entry.access, entry.coverage, entry.temporal_start, entry.temporal_end, entry.frequency]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function formatTemporalSpan(entry: DatasetCoverageEntry): string {
  const start = (entry.temporal_start || '').trim()
  const end = (entry.temporal_end || '').trim()
  if (start && end) return start === end ? start : `${start} \u2192 ${end}`
  return start || end || '\u2013'
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
  return Number.isFinite(year) ? year : null
}

function evaluatePirlQuality(layerKey: DigitalTwinLayerKey, entry: DatasetCoverageEntry | null): PirlQuality {
  if (!entry) return { verdict: 'warn', reasons: ['Dataset details not found in catalogue'], resolution_m: null, year: null }

  const blob = `${entry.dataset} ${entry.source || ''} ${entry.data_type || ''} ${entry.coverage || ''} ${entry.access || ''} ${entry.temporal_start || ''} ${entry.temporal_end || ''}`
  const lowered = blob.toLowerCase()
  const resolution_m = extractResolutionMeters(`${entry.coverage || ''} ${entry.dataset || ''}`) ?? extractResolutionMeters(blob)
  const isCurrent = /(current|present|ongoing|latest)/i.test(`${entry.temporal_end || ''}`)
  const year = extractYear(entry.temporal_end || '') ?? extractYear(entry.temporal_start || '') ?? extractYear(blob)
  const reasons: string[] = []
  let ok = true

  const requireRasterResolution = (max_m: number) => {
    if (resolution_m === null) { ok = false; reasons.push('Resolution not specified'); return }
    if (resolution_m > max_m) { ok = false; reasons.push(`Resolution ${Math.round(resolution_m)}m exceeds target ${max_m}m`) }
  }
  const requireRecent = (min_year: number) => {
    if (isCurrent) return
    if (year === null) { ok = false; reasons.push('Temporal coverage not specified'); return }
    if (year < min_year) { ok = false; reasons.push(`Temporal end ${year} older than ${min_year}`) }
  }

  switch (layerKey) {
    case 'dem': requireRasterResolution(30); break
    case 'landcover': requireRasterResolution(30); break
    case 'geotechnical': requireRasterResolution(250); break
    case 'geohazards': requireRasterResolution(1000); break
    case 'landslides': requireRasterResolution(250); break
    case 'population': requireRasterResolution(1000); requireRecent(2015); break
    case 'imagery': requireRasterResolution(2); requireRecent(2018); break
    case 'wetlands': requireRasterResolution(100); break
    case 'pipelines':
      if (lowered.includes('openstreetmap') || lowered.includes('osm')) { ok = false; reasons.push('OSM pipeline completeness varies by region') }
      break
    case 'parcels':
    case 'zoning':
      if (!/(gov|government|official|authority|cadastre|cadastral|registry)/.test(lowered)) { ok = false; reasons.push('Not clearly authoritative for parcels/zoning') }
      break
    default:
      if (!isCurrent && year !== null && year < 2005) { ok = false; reasons.push('Dataset appears very old') }
      break
  }

  return ok
    ? { verdict: 'good', reasons: [], resolution_m, year }
    : { verdict: 'warn', reasons: reasons.length ? reasons : ['Not suitable by heuristic checks'], resolution_m, year }
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

// Match a project dataset to a Digital Twin layer key by filename patterns
function matchDatasetToLayer(dataset: DatasetInfo): DigitalTwinLayerKey | null {
  const name = (dataset.name || '').toLowerCase()
  for (const [pattern, layerKey] of DATASET_NAME_PATTERNS) {
    if (pattern.test(name)) return layerKey
  }
  return null
}

// Build auto-assignments from real project datasets
function buildAutoAssignments(
  projectDatasets: ProjectDatasets | null,
  datasetStatus: DatasetStatusResponse | null
): { assignments: TwinAssignments; presentLayers: Set<DigitalTwinLayerKey>; datasetsByLayer: Partial<Record<DigitalTwinLayerKey, DatasetInfo>> } {
  const assignments: TwinAssignments = {}
  const presentLayers = new Set<DigitalTwinLayerKey>()
  const datasetsByLayer: Partial<Record<DigitalTwinLayerKey, DatasetInfo>> = {}

  if (datasetStatus) {
    for (const cat of datasetStatus.categories) {
      if (!cat.present) continue
      const layerKey = BACKEND_CATEGORY_TO_LAYER[cat.category]
      if (layerKey) presentLayers.add(layerKey)
    }
  }

  if (projectDatasets) {
    const allDatasets = [...projectDatasets.rasters, ...projectDatasets.vectors]
    for (const ds of allDatasets) {
      const layerKey = matchDatasetToLayer(ds)
      if (!layerKey) continue
      if (!assignments[layerKey]) {
        assignments[layerKey] = ds.name
        datasetsByLayer[layerKey] = ds
        presentLayers.add(layerKey)
      }
    }
  }

  return { assignments, presentLayers, datasetsByLayer }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DatasetDigitalTwinDialog({
  open,
  onClose,
  projectName,
}: {
  open: boolean
  onClose: () => void
  projectName: string | null
}) {
  const [mounted, setMounted] = useState(false)

  // Backend data
  const [coverageState, setCoverageState] = useState<FetchState>('idle')
  const [coverageError, setCoverageError] = useState<string | null>(null)
  const [coverage, setCoverage] = useState<DatasetCoverageResponse | null>(null)
  const [projectDatasets, setProjectDatasets] = useState<ProjectDatasets | null>(null)
  const [datasetStatus, setDatasetStatus] = useState<DatasetStatusResponse | null>(null)
  const [datasetsLoading, setDatasetsLoading] = useState(false)

  // UI state
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [selectedLayerKey, setSelectedLayerKey] = useState<DigitalTwinLayerKey | null>(null)
  const [pickerLayerKey, setPickerLayerKey] = useState<DigitalTwinLayerKey | null>(null)

  // Assignments
  const [assignments, setAssignments] = useState<TwinAssignments>({})
  const [confirmed, setConfirmed] = useState<Partial<Record<DigitalTwinLayerKey, boolean>>>({})
  const [autoDetected, setAutoDetected] = useState<Set<DigitalTwinLayerKey>>(new Set())
  const [presentLayers, setPresentLayers] = useState<Set<DigitalTwinLayerKey>>(new Set())

  // Picker state
  const [query, setQuery] = useState('')
  const [showAll, setShowAll] = useState(false)
  const listRef = useRef<HTMLDivElement | null>(null)

  const storageKey = useMemo(() => {
    const p = (projectName || '').trim()
    return p ? `agrs.dataset_digital_twin.assignments.${p}` : null
  }, [projectName])

  const entries = coverage?.entries ?? []

  // Derived status for each layer
  const statusByLayer = useMemo(() => {
    const out: Partial<Record<DigitalTwinLayerKey, LayerStatus>> = {}
    for (const layer of ALL_LAYERS) {
      const name = assignments[layer.key]
      if (!name) { out[layer.key] = 'none'; continue }
      if (confirmed[layer.key]) { out[layer.key] = 'confirmed'; continue }
      const entry = findEntryByDataset(entries, name)
      const quality = evaluatePirlQuality(layer.key, entry)
      out[layer.key] = quality.verdict === 'good' ? 'good' : 'warn'
    }
    return out
  }, [assignments, confirmed, entries])

  // Summary stats
  const stats = useMemo(() => {
    let total = ALL_LAYERS.length
    let assigned = 0
    let good = 0
    let warn = 0
    let requiredTotal = 0
    let requiredPresent = 0
    let present = 0
    for (const layer of ALL_LAYERS) {
      if (layer.required) requiredTotal++
      if (assignments[layer.key]) {
        assigned++
        const st = statusByLayer[layer.key]
        if (st === 'good' || st === 'confirmed') good++
        else if (st === 'warn') warn++
      }
      if (presentLayers.has(layer.key)) {
        present++
        if (layer.required) requiredPresent++
      }
    }
    return { total, assigned, good, warn, requiredTotal, requiredPresent, present, requiredMissing: requiredTotal - requiredPresent }
  }, [assignments, statusByLayer, presentLayers])

  // Group summary status
  const groupStatus = useMemo(() => {
    const out: Record<string, { assigned: number; total: number; present: number; anyWarn: boolean }> = {}
    for (const group of DIGITAL_TWIN_MODEL) {
      let assigned = 0, present = 0, anyWarn = false
      for (const layer of group.layers) {
        if (assignments[layer.key]) assigned++
        if (presentLayers.has(layer.key)) present++
        if (statusByLayer[layer.key] === 'warn') anyWarn = true
      }
      out[group.key] = { assigned, total: group.layers.length, present, anyWarn }
    }
    return out
  }, [assignments, statusByLayer, presentLayers])

  // Active detail layer
  const activeLayerKey = pickerLayerKey ?? selectedLayerKey
  const activeLayer = useMemo(() => {
    if (!activeLayerKey) return null
    return ALL_LAYERS.find((l) => l.key === activeLayerKey) ?? null
  }, [activeLayerKey])

  const activeAssignedName = activeLayerKey ? assignments[activeLayerKey] || '' : ''
  const activeAssignedEntry = useMemo(() => {
    if (!activeLayerKey || !activeAssignedName) return null
    return findEntryByDataset(entries, activeAssignedName)
  }, [entries, activeAssignedName, activeLayerKey])

  const activeQuality = useMemo(() => {
    if (!activeLayerKey || !activeAssignedName) return null
    return evaluatePirlQuality(activeLayerKey, activeAssignedEntry)
  }, [activeAssignedEntry, activeAssignedName, activeLayerKey])

  // Catalogue candidates for picker
  const candidates = useMemo(() => {
    if (!activeLayer || !entries.length) return []
    const scored = entries
      .map((entry) => ({ entry, score: scoreEntry(activeLayer, entry) }))
      .filter((row) => showAll || row.score > 0)
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return (a.entry.dataset || '').localeCompare(b.entry.dataset || '')
    })
    const q = query.trim().toLowerCase()
    if (!q) return scored
    return scored.filter(({ entry }) => normalizeText(entry).includes(q))
  }, [entries, activeLayer, query, showAll])

  // Mount
  useEffect(() => setMounted(true), [])

  // Reset on open
  useEffect(() => {
    if (!open) return
    setSelectedLayerKey(null)
    setPickerLayerKey(null)
    setQuery('')
    setShowAll(false)
    setExpandedGroups(new Set())
  }, [open])

  // Fetch backend data
  useEffect(() => {
    if (!open || !projectName) return
    let cancelled = false

    setCoverageState('loading')
    setCoverageError(null)
    setDatasetsLoading(true)

    const fetchAll = async () => {
      const results = await Promise.allSettled([
        fetchDatasetCoverage(projectName),
        fetchProjectDatasets(projectName),
        fetchProjectDatasetStatus(projectName),
      ])

      if (cancelled) return

      // Coverage catalogue
      if (results[0].status === 'fulfilled') {
        setCoverage(results[0].value)
        setCoverageState('ready')
      } else {
        setCoverageError(results[0].reason?.message || 'Failed to load dataset catalogue.')
        setCoverageState('error')
      }

      // Project datasets
      const pds = results[1].status === 'fulfilled' ? results[1].value : null
      setProjectDatasets(pds)

      // Dataset status
      const ds = results[2].status === 'fulfilled' ? results[2].value : null
      setDatasetStatus(ds)

      setDatasetsLoading(false)

      // Auto-detect assignments from real project data
      const auto = buildAutoAssignments(pds, ds)
      setPresentLayers(auto.presentLayers)

      // Merge auto-detected with saved (saved takes precedence)
      setAssignments((prev) => {
        const merged = { ...auto.assignments }
        for (const [k, v] of Object.entries(prev)) {
          if (v) merged[k as DigitalTwinLayerKey] = v
        }
        return merged
      })
      setAutoDetected(new Set(Object.keys(auto.assignments) as DigitalTwinLayerKey[]))
    }

    fetchAll()
    return () => { cancelled = true }
  }, [open, projectName])

  // Load saved assignments from localStorage
  useEffect(() => {
    if (!open || !storageKey) return
    try {
      const raw = localStorage.getItem(storageKey)
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object') return
      if ('assignments' in parsed || 'confirmed' in parsed) {
        if (parsed.assignments && typeof parsed.assignments === 'object') setAssignments((prev) => ({ ...prev, ...parsed.assignments }))
        if (parsed.confirmed && typeof parsed.confirmed === 'object') setConfirmed(parsed.confirmed as Partial<Record<DigitalTwinLayerKey, boolean>>)
        return
      }
      setAssignments((prev) => ({ ...prev, ...(parsed as TwinAssignments) }))
    } catch {
      // ignore corrupt storage
    }
  }, [open, storageKey])

  // Persist assignments
  useEffect(() => {
    if (!open || !storageKey) return
    try {
      localStorage.setItem(storageKey, JSON.stringify({ assignments, confirmed }))
    } catch { /* quota exceeded */ }
  }, [assignments, confirmed, open, storageKey])

  // Escape key
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (pickerLayerKey) { setPickerLayerKey(null); return }
      onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, pickerLayerKey, onClose])

  // Handlers
  const toggleGroup = (groupKey: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(groupKey)) next.delete(groupKey)
      else next.add(groupKey)
      return next
    })
  }

  const selectLayer = (layerKey: DigitalTwinLayerKey) => {
    setSelectedLayerKey(layerKey)
    if (pickerLayerKey) {
      setPickerLayerKey(layerKey)
      listRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  const openPickerFor = (layerKey: DigitalTwinLayerKey) => {
    setSelectedLayerKey(layerKey)
    setPickerLayerKey(layerKey)
    setQuery('')
    listRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
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
    setAssignments((prev) => { const next = { ...prev }; delete next[layerKey]; return next })
    setConfirmed((prev) => { if (!prev[layerKey]) return prev; const next = { ...prev }; delete next[layerKey]; return next })
  }

  const toggleConfirmed = (layerKey: DigitalTwinLayerKey) => {
    if (!assignments[layerKey]) return
    setConfirmed((prev) => ({ ...prev, [layerKey]: !prev[layerKey] }))
  }

  const clearAll = () => { setAssignments({}); setConfirmed({}); setAutoDetected(new Set()) }

  if (!open || !mounted) return null

  const isLoading = coverageState === 'loading' || datasetsLoading
  const progressPct = stats.total > 0 ? Math.round((stats.present / stats.total) * 100) : 0

  // Render layer row
  const renderLayerRow = (layer: LayerDef, groupKey: string) => {
    const status = statusByLayer[layer.key] || 'none'
    const colors = STATUS_COLORS[status]
    const isPresent = presentLayers.has(layer.key)
    const isSelected = selectedLayerKey === layer.key || pickerLayerKey === layer.key
    const isAuto = autoDetected.has(layer.key)
    const assignedName = assignments[layer.key]

    return (
      <div
        key={layer.key}
        onClick={() => selectLayer(layer.key)}
        className={cn(
          'group flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-all duration-150 border-l-2',
          isSelected
            ? 'bg-primary/[0.08] border-l-primary'
            : `hover:bg-white/[0.03] ${isPresent ? 'border-l-emerald-500/40' : 'border-l-transparent'}`,
        )}
      >
        {/* Presence dot */}
        <div className={cn('w-2 h-2 rounded-full shrink-0 transition-colors', isPresent ? colors.dot : 'bg-white/10 ring-1 ring-white/10')} />

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={cn('text-[11px] font-medium truncate', isSelected ? 'text-white' : isPresent ? 'text-white/80' : 'text-white/40')}>
              {layer.label}
            </span>
            {layer.required && (
              <span className="text-[8px] font-bold uppercase tracking-wider text-amber-400/60 shrink-0">REQ</span>
            )}
            {isAuto && assignedName && (
              <span className="text-[8px] font-mono uppercase tracking-wider text-primary/50 shrink-0">AUTO</span>
            )}
          </div>
          {assignedName && (
            <div className="text-[9px] font-mono text-white/30 truncate mt-0.5">{assignedName}</div>
          )}
        </div>

        {/* Status badge */}
        <div className="flex items-center gap-1.5 shrink-0">
          {status === 'good' && <Check className="w-3 h-3 text-emerald-400" />}
          {status === 'warn' && <Circle className="w-3 h-3 text-amber-400" />}
          {status === 'confirmed' && <ShieldCheck className="w-3 h-3 text-purple-400" />}
          {status === 'none' && !isPresent && <XCircle className="w-3 h-3 text-white/15" />}
        </div>

        {/* Picker button */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); openPickerFor(layer.key) }}
          className={cn(
            'p-1 rounded-sm opacity-0 group-hover:opacity-100 transition-opacity shrink-0',
            'text-white/30 hover:text-primary hover:bg-primary/10',
          )}
          title={`Assign dataset to ${layer.label}`}
        >
          <Plus className="w-3 h-3" />
        </button>
      </div>
    )
  }

  return createPortal(
    <div className="fixed inset-0 z-[120] flex">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/85 backdrop-blur-lg" onClick={onClose} />

      {/* Dialog container */}
      <div className="relative z-10 flex w-full h-full" onClick={(e) => e.stopPropagation()}>

        {/* ============================================================= */}
        {/* LEFT PANEL: Layer Stack                                        */}
        {/* ============================================================= */}
        <div className={cn(
          'flex flex-col h-full transition-all duration-300',
          pickerLayerKey ? 'w-[55%]' : selectedLayerKey ? 'w-[62%]' : 'w-full',
        )}>

          {/* Header */}
          <header className="shrink-0 px-6 py-5 border-b border-white/[0.06] bg-[#0a0a0a]/95">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-3 mb-1.5">
                  <Layers className="w-5 h-5 text-primary shrink-0" />
                  <h1 className="text-sm font-bold text-white uppercase tracking-[0.15em]">Dataset Digital Twin</h1>
                </div>
                <div className="text-[11px] text-white/50 font-mono">
                  {projectName ? (
                    <>
                      Project: <span className="text-white/80">{projectName}</span>
                      {isLoading && <span className="ml-2 text-primary/70">(loading...)</span>}
                    </>
                  ) : 'Select a project to use the dataset catalogue.'}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={clearAll}
                  className="p-2 border border-white/10 text-white/40 hover:text-white hover:border-white/25 hover:bg-white/[0.03] rounded-md"
                  title="Clear all assignments"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="p-2 border border-white/10 text-white/40 hover:text-white hover:border-white/25 hover:bg-white/[0.03] rounded-md"
                  title="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Summary strip */}
            <div className="mt-4 flex items-center gap-4 flex-wrap">
              {/* Progress ring */}
              <div className="relative w-10 h-10 shrink-0">
                <svg className="w-10 h-10 -rotate-90" viewBox="0 0 36 36">
                  <circle cx="18" cy="18" r="14" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
                  <circle
                    cx="18" cy="18" r="14" fill="none"
                    stroke={stats.requiredMissing > 0 ? 'rgb(245,158,11)' : 'rgb(16,185,129)'}
                    strokeWidth="3" strokeDasharray={`${(progressPct / 100) * 88} 88`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-white/70">{progressPct}%</div>
              </div>

              <div className="flex flex-wrap gap-x-5 gap-y-1 text-[10px] font-mono">
                <span className="text-white/40">
                  <span className="text-emerald-400 font-bold">{stats.present}</span>/{stats.total} layers present
                </span>
                {stats.requiredMissing > 0 && (
                  <span className="text-amber-400">
                    {stats.requiredMissing} required missing
                  </span>
                )}
                {stats.good > 0 && <span className="text-emerald-400/70">{stats.good} PIRL-ready</span>}
                {stats.warn > 0 && <span className="text-amber-400/70">{stats.warn} need review</span>}
                {datasetStatus && (
                  <span className="text-white/25">
                    CRS: EPSG:{datasetStatus.target_epsg}
                  </span>
                )}
              </div>
            </div>
          </header>

          {/* Layer stack */}
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            <div className="py-2">
              {DIGITAL_TWIN_MODEL.map((group) => {
                const isExpanded = expandedGroups.has(group.key)
                const gs = groupStatus[group.key]
                const groupHasPresent = gs && gs.present > 0
                const groupComplete = gs && gs.present === gs.total

                return (
                  <div key={group.key} className="border-b border-white/[0.04] last:border-b-0">
                    {/* Group header */}
                    <button
                      type="button"
                      onClick={() => toggleGroup(group.key)}
                      className={cn(
                        'w-full flex items-center gap-3 px-5 py-3.5 text-left transition-colors',
                        'hover:bg-white/[0.03]',
                        isExpanded && 'bg-white/[0.02]',
                      )}
                    >
                      {/* Expand chevron */}
                      <span className="text-white/30 shrink-0">
                        {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                      </span>

                      {/* Group badge - stacked layer icon */}
                      <div className={cn(
                        'w-7 h-7 rounded-md flex items-center justify-center shrink-0',
                        groupComplete ? 'bg-emerald-500/15 text-emerald-400' :
                        groupHasPresent ? 'bg-amber-500/10 text-amber-400' :
                        'bg-white/[0.04] text-white/20',
                      )}>
                        <Layers className="w-3.5 h-3.5" />
                      </div>

                      {/* Group label */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            'text-[11px] font-bold uppercase tracking-[0.12em]',
                            groupComplete ? 'text-emerald-300/80' :
                            groupHasPresent ? 'text-white/70' : 'text-white/35',
                          )}>
                            {group.label}
                          </span>
                          <span className="text-[9px] font-mono text-white/25">{group.subtitle}</span>
                        </div>
                      </div>

                      {/* Group stats */}
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={cn(
                          'text-[9px] font-mono',
                          groupComplete ? 'text-emerald-400/60' :
                          groupHasPresent ? 'text-white/30' : 'text-white/15',
                        )}>
                          {gs?.present ?? 0}/{gs?.total ?? 0}
                        </span>

                        {/* Mini dots for each layer */}
                        <div className="flex gap-1">
                          {group.layers.map((layer) => {
                            const st = statusByLayer[layer.key] || 'none'
                            return (
                              <div
                                key={layer.key}
                                className={cn(
                                  'w-1.5 h-1.5 rounded-full',
                                  st === 'good' || st === 'confirmed' ? 'bg-emerald-500' :
                                  st === 'warn' ? 'bg-amber-500' :
                                  presentLayers.has(layer.key) ? 'bg-white/30' : 'bg-white/10',
                                )}
                                title={`${layer.label}: ${st}`}
                              />
                            )
                          })}
                        </div>
                      </div>
                    </button>

                    {/* Expanded layers */}
                    {isExpanded && (
                      <div className="pb-1 border-t border-white/[0.03]">
                        {group.layers.map((layer) => renderLayerRow(layer, group.key))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Backend status detail */}
            {datasetStatus && !isLoading && (
              <div className="mx-5 mb-4 mt-2 p-4 border border-white/[0.06] rounded-md bg-white/[0.015]">
                <div className="text-[9px] font-mono uppercase tracking-widest text-white/25 mb-2">Backend Dataset Status</div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {datasetStatus.categories.map((cat) => {
                    const layerKey = BACKEND_CATEGORY_TO_LAYER[cat.category]
                    return (
                      <div
                        key={cat.category}
                        className={cn(
                          'flex items-center gap-2 px-2.5 py-1.5 rounded-sm text-[10px] font-mono border',
                          cat.present
                            ? 'border-emerald-500/20 bg-emerald-500/[0.04] text-emerald-300/80'
                            : 'border-white/[0.06] bg-white/[0.01] text-white/30',
                        )}
                        onClick={() => { if (layerKey && isLayerKey(layerKey)) selectLayer(layerKey) }}
                        role="button"
                        tabIndex={0}
                      >
                        <div className={cn('w-1.5 h-1.5 rounded-full shrink-0', cat.present ? 'bg-emerald-500' : 'bg-white/15')} />
                        <span className="truncate">{cat.label}</span>
                        {cat.required && <span className="text-[7px] text-amber-400/50 shrink-0">REQ</span>}
                      </div>
                    )
                  })}
                </div>
                <div className="mt-2 text-[9px] font-mono text-white/20">
                  Minimum requirements: {datasetStatus.minimum_requirements_met ? (
                    <span className="text-emerald-400/60">MET</span>
                  ) : (
                    <span className="text-amber-400/60">NOT MET</span>
                  )}
                </div>
              </div>
            )}

            {/* Loading state */}
            {isLoading && (
              <div className="flex items-center justify-center gap-3 py-16 text-white/40 font-mono text-xs uppercase tracking-widest">
                <Loader2 className="w-5 h-5 text-primary animate-spin" />
                <span>Loading project datasets...</span>
              </div>
            )}
          </div>
        </div>

        {/* ============================================================= */}
        {/* RIGHT PANEL: Detail / Picker                                   */}
        {/* ============================================================= */}
        <div className={cn(
          'h-full border-l border-white/[0.06] bg-[#080808]/98 flex flex-col transition-all duration-300',
          pickerLayerKey ? 'w-[45%]' : selectedLayerKey ? 'w-[38%]' : 'w-0 overflow-hidden',
        )}>
          {pickerLayerKey && activeLayer && (
            <div className="h-full flex flex-col">
              {/* Panel header */}
              <div className="shrink-0 px-6 py-5 border-b border-white/[0.06]">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[9px] font-mono text-white/30 uppercase tracking-widest mb-1">Assign dataset</div>
                    <div className="text-lg font-bold text-white uppercase tracking-wide truncate">{activeLayer.label}</div>
                    <div className="text-[11px] text-white/40 truncate">{activeLayer.subtitle}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPickerLayerKey(null)}
                    className="p-2 rounded-md border border-white/10 text-white/30 hover:text-white hover:border-white/25"
                    title="Close picker"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Assigned dataset info */}
              <div className="shrink-0 mx-5 mt-4 p-4 border border-white/[0.06] bg-white/[0.015] rounded-md">
                <div className="text-[9px] font-mono text-white/30 uppercase tracking-wider mb-2">Currently Assigned</div>
                {activeAssignedName ? (
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[12px] font-bold text-white truncate">{activeAssignedName}</div>
                      {activeAssignedEntry?.source && (
                        <div className="text-[10px] text-white/40 font-mono truncate mt-0.5">{activeAssignedEntry.source}</div>
                      )}
                      {presentLayers.has(pickerLayerKey) && (
                        <div className="mt-1.5 flex items-center gap-1.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          <span className="text-[9px] font-mono text-emerald-400/70 uppercase">Present in project</span>
                        </div>
                      )}
                      <div className="mt-2 flex items-center gap-2 flex-wrap">
                        <span className={cn(
                          'text-[9px] font-mono uppercase tracking-widest',
                          confirmed[pickerLayerKey]
                            ? 'text-purple-300'
                            : (activeQuality?.verdict ?? 'warn') === 'good' ? 'text-emerald-300' : 'text-amber-300',
                        )}>
                          {confirmed[pickerLayerKey]
                            ? 'Confirmed for PIRL'
                            : (activeQuality?.verdict ?? 'warn') === 'good' ? 'PIRL-ready (heuristic)' : 'Needs review'}
                        </span>
                        <button
                          type="button"
                          onClick={() => toggleConfirmed(pickerLayerKey)}
                          className={cn(
                            'px-2 py-0.5 border rounded-sm text-[9px] font-mono uppercase tracking-wider',
                            confirmed[pickerLayerKey]
                              ? 'border-purple-500/40 text-purple-300 hover:bg-purple-500/10'
                              : 'border-white/15 text-white/40 hover:text-white hover:border-white/25',
                          )}
                        >
                          {confirmed[pickerLayerKey] ? 'Unconfirm' : 'Confirm'}
                        </button>
                      </div>
                      {activeQuality?.reasons?.length ? (
                        <div className="mt-1.5 text-[9px] text-white/30 font-mono">{activeQuality.reasons.slice(0, 2).join(' \u2022 ')}</div>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleClear(pickerLayerKey)}
                      className="px-3 py-1.5 border border-white/10 text-white/40 hover:text-white hover:border-white/25 rounded-sm text-[10px] font-mono uppercase"
                    >
                      Clear
                    </button>
                  </div>
                ) : (
                  <div className="text-[10px] font-mono text-white/25 italic">No dataset assigned yet. Select from the catalogue below.</div>
                )}
              </div>

              {/* Search */}
              <div className="shrink-0 mx-5 mt-3 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search catalogue\u2026"
                  className="w-full bg-white/[0.03] border border-white/[0.08] rounded-md pl-10 pr-4 py-2.5 text-xs font-mono text-white focus:border-primary/40 focus:ring-0 outline-none"
                />
              </div>

              <label className="flex items-center gap-2 mx-5 mt-2 mb-1 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="appearance-none w-3 h-3 border border-white/25 rounded-sm checked:bg-primary checked:border-primary"
                  checked={showAll}
                  onChange={(e) => setShowAll(e.target.checked)}
                />
                <span className="text-[9px] font-mono uppercase tracking-wider text-white/35">Show all datasets</span>
              </label>

              {/* Catalogue list */}
              <div ref={listRef} className="flex-1 overflow-y-auto px-5 pb-5 space-y-2 custom-scrollbar">
                {coverageState === 'loading' ? (
                  <div className="flex items-center justify-center gap-3 py-16 text-white/40 font-mono text-xs uppercase tracking-widest">
                    <Loader2 className="w-5 h-5 text-primary animate-spin" />
                    <span>Loading catalogue...</span>
                  </div>
                ) : coverageState === 'error' ? (
                  <div className="border border-red-500/20 bg-red-500/[0.06] text-red-400 rounded-md p-4 text-xs font-mono">
                    {coverageError || 'Failed to load dataset catalogue.'}
                  </div>
                ) : candidates.length === 0 ? (
                  <div className="py-12 text-center">
                    <div className="text-white/15 font-mono text-xs uppercase tracking-widest mb-2">No matching datasets</div>
                    <p className="text-white/10 text-[10px]">Try enabling &quot;Show all datasets&quot;.</p>
                  </div>
                ) : (
                  candidates.map(({ entry, score }, idx) => {
                    const isAttached = !!pickerLayerKey &&
                      (assignments[pickerLayerKey] || '').trim().toLowerCase() === (entry.dataset || '').trim().toLowerCase()
                    const quality = pickerLayerKey ? evaluatePirlQuality(pickerLayerKey, entry) : null

                    return (
                      <div
                        key={`${entry.dataset}-${idx}`}
                        className={cn(
                          'group p-3.5 border rounded-md transition-colors',
                          isAttached
                            ? 'bg-primary/[0.06] border-primary/30'
                            : 'bg-white/[0.015] border-white/[0.05] hover:bg-white/[0.03] hover:border-white/[0.12]',
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-[12px] font-semibold text-white truncate group-hover:text-primary">{entry.dataset}</span>
                              {score > 15 && (
                                <span className="px-1.5 py-0.5 bg-primary/15 text-primary text-[8px] font-mono uppercase rounded-sm shrink-0">Rec</span>
                              )}
                            </div>
                            {entry.source && <div className="text-[9px] text-white/35 font-mono truncate">{entry.source}</div>}
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {entry.data_type && (
                                <span className="px-1.5 py-0.5 bg-white/[0.04] rounded-sm text-[9px] text-white/50 font-mono">{entry.data_type}</span>
                              )}
                              {entry.coverage && (
                                <span className="px-1.5 py-0.5 bg-white/[0.04] rounded-sm text-[9px] text-white/50 font-mono">{entry.coverage}</span>
                              )}
                              <span className="px-1.5 py-0.5 bg-white/[0.04] rounded-sm text-[9px] text-white/50 font-mono">{formatTemporalSpan(entry)}</span>
                              {quality && (
                                <span className={cn(
                                  'px-1.5 py-0.5 rounded-sm text-[9px] font-mono uppercase',
                                  quality.verdict === 'good' ? 'bg-emerald-500/10 text-emerald-300' : 'bg-amber-500/10 text-amber-300',
                                )}>
                                  {quality.verdict === 'good' ? 'Good' : 'Warn'}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex flex-col gap-1.5 shrink-0 items-end">
                            <button
                              type="button"
                              onClick={() => {
                                if (!pickerLayerKey) return
                                if (isAttached) handleClear(pickerLayerKey)
                                else handleAssign(pickerLayerKey, entry.dataset)
                              }}
                              className={cn(
                                'px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-sm transition-colors',
                                isAttached
                                  ? 'border border-primary/40 text-primary hover:bg-primary/10'
                                  : 'bg-white/[0.06] text-white/70 hover:bg-white/[0.12] hover:text-white',
                              )}
                            >
                              {isAttached ? 'Remove' : 'Add'}
                            </button>
                            {entry.url && (
                              <a
                                href={entry.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1 text-white/15 hover:text-white/50"
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
          )}

          {/* Detail view when layer is selected but picker is not open */}
          {!pickerLayerKey && selectedLayerKey && activeLayer && (() => {
            const st = statusByLayer[selectedLayerKey] || 'none'
            const isPresent = presentLayers.has(selectedLayerKey)
            const assignedName = assignments[selectedLayerKey]
            const assignedEntry = assignedName ? findEntryByDataset(entries, assignedName) : null
            const quality = assignedName ? evaluatePirlQuality(selectedLayerKey, assignedEntry) : null
            const matchedBackendCat = datasetStatus?.categories.find((c) => BACKEND_CATEGORY_TO_LAYER[c.category] === selectedLayerKey)

            return (
              <div className="h-full flex flex-col">
                <div className="shrink-0 px-6 py-5 border-b border-white/[0.06]">
                  <div className="text-[9px] font-mono text-white/30 uppercase tracking-widest mb-1">Layer Detail</div>
                  <div className="text-lg font-bold text-white uppercase tracking-wide">{activeLayer.label}</div>
                  <div className="text-[11px] text-white/40">{activeLayer.subtitle}</div>
                  {activeLayer.required && (
                    <div className="mt-1.5 text-[9px] font-mono text-amber-400/60 uppercase tracking-wider">Required for PIRL</div>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
                  {/* Presence status */}
                  <div className="p-4 border border-white/[0.06] bg-white/[0.015] rounded-md">
                    <div className="text-[9px] font-mono text-white/30 uppercase tracking-wider mb-3">Status</div>
                    <div className="flex items-center gap-3 mb-2">
                      <div className={cn('w-3 h-3 rounded-full', isPresent ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]' : 'bg-white/10 ring-1 ring-white/15')} />
                      <span className={cn('text-[12px] font-semibold', isPresent ? 'text-emerald-300' : 'text-white/35')}>
                        {isPresent ? 'Dataset Present' : 'Not Available'}
                      </span>
                    </div>
                    {matchedBackendCat && (
                      <div className="text-[10px] text-white/30 font-mono space-y-1 mt-3">
                        <div>Category: <span className="text-white/50">{matchedBackendCat.label}</span></div>
                        <div>Type: <span className="text-white/50">{matchedBackendCat.dataset_type}</span></div>
                        {matchedBackendCat.last_modified && (
                          <div>Modified: <span className="text-white/50">{new Date(matchedBackendCat.last_modified).toLocaleDateString()}</span></div>
                        )}
                        {matchedBackendCat.description && (
                          <div>Note: <span className="text-white/50">{matchedBackendCat.description}</span></div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Assignment */}
                  <div className="p-4 border border-white/[0.06] bg-white/[0.015] rounded-md">
                    <div className="text-[9px] font-mono text-white/30 uppercase tracking-wider mb-3">Assignment</div>
                    {assignedName ? (
                      <>
                        <div className="text-[12px] font-bold text-white truncate mb-1">{assignedName}</div>
                        {assignedEntry?.source && (
                          <div className="text-[10px] text-white/40 font-mono truncate">{assignedEntry.source}</div>
                        )}
                        {autoDetected.has(selectedLayerKey) && (
                          <div className="mt-1.5 text-[9px] font-mono text-primary/50 uppercase">Auto-detected from project</div>
                        )}
                        <div className="mt-3 flex items-center gap-2 flex-wrap">
                          <span className={cn(
                            'px-2 py-1 rounded-sm text-[9px] font-mono uppercase tracking-wider',
                            st === 'confirmed' ? 'bg-purple-500/15 text-purple-300' :
                            st === 'good' ? 'bg-emerald-500/15 text-emerald-300' :
                            'bg-amber-500/15 text-amber-300',
                          )}>
                            {st === 'confirmed' ? 'Confirmed' : quality?.verdict === 'good' ? 'PIRL-ready' : 'Needs review'}
                          </span>
                          <button
                            type="button"
                            onClick={() => toggleConfirmed(selectedLayerKey)}
                            className="px-2 py-1 border border-white/10 rounded-sm text-[9px] font-mono uppercase text-white/35 hover:text-white hover:border-white/25"
                          >
                            {confirmed[selectedLayerKey] ? 'Unconfirm' : 'Confirm'}
                          </button>
                        </div>
                        {quality?.reasons?.length ? (
                          <div className="mt-2 text-[9px] text-white/25 font-mono">{quality.reasons.join(' \u2022 ')}</div>
                        ) : null}
                      </>
                    ) : (
                      <div className="text-[10px] font-mono text-white/25 italic">No dataset assigned to this layer.</div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => openPickerFor(selectedLayerKey)}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-primary/[0.08] border border-primary/25 hover:bg-primary/[0.15] hover:border-primary/40 text-primary rounded-md text-[10px] font-bold uppercase tracking-wider transition-colors"
                    >
                      <Search className="w-3.5 h-3.5" />
                      {assignedName ? 'Change Dataset' : 'Assign Dataset'}
                    </button>
                    {assignedName && (
                      <button
                        type="button"
                        onClick={() => handleClear(selectedLayerKey)}
                        className="px-4 py-3 border border-white/10 text-white/40 hover:text-white hover:border-white/25 rounded-md text-[10px] font-mono uppercase"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })()}
        </div>
      </div>
    </div>,
    document.body,
  )
}
