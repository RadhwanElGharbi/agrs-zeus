'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Loader2,
  Globe,
  Layers,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  PlayCircle,
  Database,
  Terminal,
  Server,
  Cpu,
  X
} from 'lucide-react'

import { useProject } from '@/lib/context/ProjectContext'
import { useOnboarding } from '@/lib/context/OnboardingContext'
import {
  DatasetCoverageEntry,
  DatasetCoverageResponse,
  DatasetStatusResponse,
  DatasetCategory,
  DatasetCategoryStatus,
  DatasetFetchJob,
  ProjectDatasets,
  DatasetInfo,
  fetchDatasetCoverage,
  fetchProjectDatasetStatus,
  startDatasetFetch,
  fetchProjectDatasets
} from '@/lib/api/dataClient'
import { MarkdownRenderer } from '@/components/shared/MarkdownRenderer'
import { Button } from '@/components/ui/button'
import { DatasetFetchProgressDialog } from './DatasetFetchProgressDialog'
import { cn } from '@/lib/utils'

type DatasetCoverageDialogProps = {
  open: boolean
  onClose: () => void
  onRunInBackground?: (jobId: string) => void
}

type FetchState = 'idle' | 'loading' | 'ready' | 'error'
type JobBanner = { kind: 'success' | 'error'; message: string } | null

const DATASET_ORDER: DatasetCategory[] = [
  'dem',
  'landcover',
  'soil',
  'geohazard',
  'roads',
  'railways',
  'powerlines',
  'waterways',
  'pipelines'
]

const CATEGORY_LABELS: Record<DatasetCategory, string> = {
  dem: 'Digital Elevation Model (DEM)',
  landcover: 'Landcover (10m)',
  soil: 'Soils / Geotechnical',
  geohazard: 'Geohazards / Seismic',
  roads: 'Road Network',
  railways: 'Rail Network',
  powerlines: 'Power Transmission',
  waterways: 'Waterways / Hydrology',
  pipelines: 'Existing Pipelines'
}

const CATEGORY_TYPES: Record<DatasetCategory, 'raster' | 'vector'> = {
  dem: 'raster',
  landcover: 'raster',
  soil: 'raster',
  geohazard: 'raster',
  roads: 'vector',
  railways: 'vector',
  powerlines: 'vector',
  waterways: 'vector',
  pipelines: 'vector'
}

const CATEGORY_KEYWORDS: Record<DatasetCategory, string[]> = {
  dem: ['dem', 'elevation', 'terrain', 'tinitaly', 'copernicus', 'srtm'],
  landcover: ['landcover', 'land cover', 'worldcover', 'esa', 'corine'],
  soil: ['soil', 'soilgrids', 'geotech', 'isric', 'fao'],
  geohazard: ['seismic', 'hazard', 'geohazard', 'earthquake', 'pga', 'landslide'],
  roads: ['road', 'highway', 'osm road'],
  railways: ['rail', 'railway', 'train'],
  powerlines: ['power', 'transmission', 'grid', 'powerline'],
  waterways: ['waterway', 'river', 'hydro', 'hydrosheds'],
  pipelines: ['pipeline', 'gas pipeline', 'scigrid']
}

const FALLBACK_PROTOCOL = '/opt/agrs/docs/Project Instructions/DATASET_FETCHING_PROTOCOLS.md'

function getDefaultSourceLabel(category: DatasetCategory, iso3?: string | null): string | null {
  switch (category) {
    case 'dem':
      return iso3 === 'ITA' ? 'TINITALY DEM v1.1' : 'Copernicus DEM GLO-30'
    case 'landcover':
      return 'ESA WorldCover 10m (latest)'
    case 'soil':
      return 'ISRIC SoilGrids v2.0 (0-30cm SOC)'
    case 'geohazard':
      return 'GEM / USGS PGA Hazard Map'
    case 'roads':
      return 'OSM Road Network'
    case 'railways':
      return 'OSM Rail Network'
    case 'powerlines':
      return 'OSM Power Transmission'
    case 'waterways':
      return 'OSM Waterways'
    case 'pipelines':
      return 'OSM Pipelines'
    default:
      return null
  }
}

function normalizeCoverageText(entry: DatasetCoverageEntry): string {
  return [entry.dataset, entry.data_type, entry.source, entry.coverage]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function extractResolutionMeters(value?: string | null): number | null {
  if (!value) return null
  const lowered = value.toLowerCase()
  const meterMatch = lowered.match(/(\d+(?:\.\d+)?)\s*(m|meter|metre)/)
  if (meterMatch) {
    return parseFloat(meterMatch[1])
  }
  const kmMatch = lowered.match(/(\d+(?:\.\d+)?)\s*(km|kilometer|kilometre)/)
  if (kmMatch) {
    return parseFloat(kmMatch[1]) * 1000
  }
  const arcMatch = lowered.match(/(\d+(?:\.\d+)?)\s*(arc-?second)/)
  if (arcMatch) {
    const arc = parseFloat(arcMatch[1])
    return arc * 30
  }
  return null
}

function extractYear(value?: string | null): number | null {
  if (!value) return null
  const match = value.match(/(20\d{2})/)
  if (!match) return null
  const year = parseInt(match[1], 10)
  if (year < 1980 || year > new Date().getFullYear() + 1) return null
  return year
}

function scoreCoverageEntry(category: DatasetCategory, entry: DatasetCoverageEntry): number {
  const haystack = normalizeCoverageText(entry)
  const keywords = CATEGORY_KEYWORDS[category]
  let score = keywords.reduce((acc, keyword) => (haystack.includes(keyword) ? acc + 10 : acc), 0)
  if (!entry.applies_globally) {
    score += 8
  }
  const resolutionHints = [entry.coverage, entry.dataset, entry.access]
  for (const hint of resolutionHints) {
    const res = extractResolutionMeters(hint)
    if (res) {
      score += Math.max(0, 200 - res)
      break
    }
  }
  const yearHints = [entry.coverage, entry.dataset]
  for (const hint of yearHints) {
    const year = extractYear(hint)
    if (year) {
      score += Math.max(0, year - 2000)
      break
    }
  }
  if (haystack.includes('tinitaly')) {
    score += 50
  }
  return score
}

function inferCategoryFromEntry(entry: DatasetCoverageEntry): DatasetCategory | null {
  const haystack = normalizeCoverageText(entry)
  let bestCategory: DatasetCategory | null = null
  let bestScore = 0
  for (const category of DATASET_ORDER) {
    const keywords = CATEGORY_KEYWORDS[category]
    const score = keywords.reduce((acc, keyword) => (haystack.includes(keyword) ? acc + 1 : acc), 0)
    if (score > bestScore) {
      bestScore = score
      bestCategory = category
    }
  }
  return bestScore > 0 ? bestCategory : null
}

function pickCoverageCandidate(category: DatasetCategory, entries: DatasetCoverageEntry[]): DatasetCoverageEntry | undefined {
  const localEntries = entries.filter((entry) => !entry.applies_globally)
  const pool = localEntries.length > 0 ? localEntries : entries

  let best: DatasetCoverageEntry | undefined
  let bestScore = -Infinity

  for (const entry of pool) {
    const score = scoreCoverageEntry(category, entry)
    if (score > bestScore) {
      bestScore = score
      best = entry
    }
  }

  return best
}

function buildFallbackStatus(
  project: string,
  coverage: DatasetCoverageResponse,
  projectDatasets?: ProjectDatasets | null
): DatasetStatusResponse {
  const categories: DatasetCategoryStatus[] = DATASET_ORDER.map((category) => {
    const candidate = pickCoverageCandidate(category, coverage.entries)
    const datasetType: 'raster' | 'vector' =
      candidate?.data_type?.toLowerCase().includes('vector') ? 'vector' : CATEGORY_TYPES[category]

    return {
      category,
      label: candidate?.dataset || CATEGORY_LABELS[category],
      dataset_type: datasetType,
      required: true,
      present: false,
      description: candidate?.coverage || candidate?.access || candidate?.source || undefined,
      raw_path: undefined,
      processed_path: undefined,
      metadata_path: undefined,
      last_modified: undefined
    }
  })

  const status: DatasetStatusResponse = {
    project,
    target_epsg: 0,
    minimum_requirements_met: false,
    categories,
    protocol_reference: coverage.protocol_reference || FALLBACK_PROTOCOL
  }

  return mergeStatusWithProjectDatasets(status, projectDatasets)
}

function mergeStatusWithProjectDatasets(
  status: DatasetStatusResponse,
  projectDatasets?: ProjectDatasets | null
): DatasetStatusResponse {
  if (!projectDatasets) return status
  let changed = false
  const categories = status.categories.map((entry) => {
    if (entry.present) {
      return entry
    }
    const category = entry.category as DatasetCategory
    const match = findProjectDatasetMatch(category, projectDatasets, entry.dataset_type)
    if (!match) {
      return entry
    }
    changed = true
    return {
      ...entry,
      present: true,
      processed_path: match.path,
      description: entry.description || match.metadata?.description || match.metadata?.dataset_name || entry.description
    }
  })

  if (!changed) {
    return status
  }

  return {
    ...status,
    categories,
    minimum_requirements_met: categories.every((entry) => !entry.required || entry.present)
  }
}

function findProjectDatasetMatch(
  category: DatasetCategory,
  projectDatasets: ProjectDatasets,
  expectedType?: 'raster' | 'vector'
): DatasetInfo | undefined {
  const pools: DatasetInfo[] = []
  if (!expectedType || expectedType === 'raster') {
    pools.push(...projectDatasets.rasters)
  }
  if (!expectedType || expectedType === 'vector') {
    pools.push(...projectDatasets.vectors)
  }

  const keywords = CATEGORY_KEYWORDS[category]
  let best: { info: DatasetInfo; score: number } | undefined
  for (const dataset of pools) {
    if (expectedType && dataset.type !== expectedType) continue
    const score = scoreDatasetMatch(dataset, keywords)
    if (score > (best?.score ?? 0)) {
      best = { info: dataset, score }
    }
  }
  return best && best.score > 0 ? best.info : undefined
}

function scoreDatasetMatch(dataset: DatasetInfo, keywords: string[]): number {
  const haystack = `${dataset.name} ${dataset.path}`.toLowerCase()
  let score = 0
  for (const keyword of keywords) {
    if (haystack.includes(keyword)) {
      score += keyword === 'tinitaly' ? 20 : 10
    }
  }
  if (haystack.includes('processed')) {
    score += 2
  }
  return score
}

export function DatasetCoverageDialog({ open, onClose, onRunInBackground }: DatasetCoverageDialogProps) {
  const { currentProject, refreshProjectData } = useProject()
  const { reportAction } = useOnboarding()
  const coverageCache = useRef<Record<string, DatasetCoverageResponse>>({})

  const [coverageState, setCoverageState] = useState<FetchState>('idle')
  const [coverageError, setCoverageError] = useState<string | null>(null)
  const [coverageData, setCoverageData] = useState<DatasetCoverageResponse | null>(null)

  const [readinessState, setReadinessState] = useState<FetchState>('idle')
  const [readinessError, setReadinessError] = useState<string | null>(null)
  const [datasetStatus, setDatasetStatus] = useState<DatasetStatusResponse | null>(null)
  const [projectDatasets, setProjectDatasets] = useState<ProjectDatasets | null>(null)

  const [selectedCategories, setSelectedCategories] = useState<Set<DatasetCategory>>(new Set<DatasetCategory>())
  const [forceRefetch, setForceRefetch] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [jobId, setJobId] = useState<string | null>(null)
  const [progressDialogOpen, setProgressDialogOpen] = useState(false)
  const [jobBanner, setJobBanner] = useState<JobBanner>(null)
  const [categoryOverrides, setCategoryOverrides] = useState<Partial<Record<DatasetCategory, string | null>>>({})
  
  const [mounted, setMounted] = useState(false)
  const [isClosing, setIsClosing] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (open) {
      setIsClosing(false)
    }
  }, [open])

  const handleClose = () => {
    setIsClosing(true)
    setTimeout(() => {
      onClose()
    }, 150)
  }

  useEffect(() => {
    if (!open) return

    if (!currentProject) {
      setCoverageError('Select or load a project to inspect dataset coverage.')
      setCoverageState('error')
      setCoverageData(null)
      return
    }

    const cached = coverageCache.current[currentProject]
    if (cached) {
      setCoverageData(cached)
      setCoverageError(null)
      setCoverageState('ready')
      return
    }

    let cancelled = false
    setCoverageState('loading')
    setCoverageError(null)

    fetchDatasetCoverage(currentProject)
      .then((resp) => {
        if (cancelled) return
        coverageCache.current[currentProject] = resp
        setCoverageData(resp)
        setCoverageState('ready')
      })
      .catch((err) => {
        if (cancelled) return
        setCoverageError(err?.message || 'Failed to load coverage catalog.')
        setCoverageState('error')
        setCoverageData(null)
      })

    return () => {
      cancelled = true
    }
  }, [currentProject, open])

  useEffect(() => {
    if (!open) return

    if (!currentProject) {
      setProjectDatasets(null)
      return
    }

    let cancelled = false
    fetchProjectDatasets(currentProject)
      .then((resp) => {
        if (cancelled) return
        setProjectDatasets(resp)
      })
      .catch(() => {
        if (cancelled) return
        setProjectDatasets(null)
      })

    return () => {
      cancelled = true
    }
  }, [currentProject, open, refreshKey, setProjectDatasets])

  useEffect(() => {
    if (!datasetStatus || !projectDatasets) return
    setDatasetStatus((prev) => {
      if (!prev) return prev
      const merged = mergeStatusWithProjectDatasets(prev, projectDatasets)
      return merged === prev ? prev : merged
    })
  }, [projectDatasets, datasetStatus])

  useEffect(() => {
    if (!open) return

    if (!currentProject) {
      setReadinessError('Select a project to manage dataset fetching.')
      setReadinessState('error')
      setDatasetStatus(null)
      return
    }

    let cancelled = false
    setReadinessState('loading')
    setReadinessError(null)

    fetchProjectDatasetStatus(currentProject)
      .then((resp) => {
        if (cancelled) return
        setDatasetStatus(resp)
        setReadinessState('ready')
      })
      .catch((err) => {
        if (cancelled) return
        setReadinessError(err?.message || 'Failed to inspect dataset readiness.')
        setReadinessState('error')
        setDatasetStatus(null)
      })

    return () => {
      cancelled = true
    }
  }, [currentProject, open, refreshKey])

  useEffect(() => {
    if (readinessState !== 'error' || !coverageData || !currentProject) {
      return
    }
    const fallback = buildFallbackStatus(currentProject, coverageData, projectDatasets)
    setDatasetStatus(fallback)
    setReadinessState('ready')
    setReadinessError(null)
  }, [readinessState, coverageData, currentProject, projectDatasets])

  useEffect(() => {
    if (!datasetStatus) return
    setSelectedCategories((prev) => {
      if (prev.size > 0) return prev
      const missing = datasetStatus.categories
        .filter((entry) => !entry.present)
        .map((entry) => entry.category as DatasetCategory)
      return new Set<DatasetCategory>(missing)
    })
  }, [datasetStatus])



  const datasetList = useMemo(() => {
    if (!datasetStatus) return []
    const orderMap = DATASET_ORDER.reduce<Record<string, number>>((acc, key, idx) => {
      acc[key] = idx
      return acc
    }, {})
    return [...datasetStatus.categories].sort((a, b) => {
      const aIdx = orderMap[a.category] ?? 99
      const bIdx = orderMap[b.category] ?? 99
      return aIdx - bIdx
    })
  }, [datasetStatus])

  const missingCategories = useMemo(
    () => datasetList.filter((entry) => !entry.present).map((entry) => entry.category as DatasetCategory),
    [datasetList]
  )

  const labelMap = useMemo(() => {
    const map: Record<string, string> = {}
    datasetList.forEach((entry) => {
      const category = entry.category as DatasetCategory
      map[category] = categoryOverrides[category] || entry.label
    })
    return map
  }, [datasetList, categoryOverrides])

  const categoryCandidates = useMemo(() => {
    const map: Record<DatasetCategory, DatasetCoverageEntry[]> = DATASET_ORDER.reduce((acc, category) => {
      acc[category] = []
      return acc
    }, {} as Record<DatasetCategory, DatasetCoverageEntry[]>)

    if (coverageData) {
      coverageData.entries.forEach((entry) => {
        const category = inferCategoryFromEntry(entry)
        if (category) {
          map[category].push(entry)
        }
      })

      DATASET_ORDER.forEach((category) => {
        map[category].sort((a, b) => scoreCoverageEntry(category, b) - scoreCoverageEntry(category, a))
        map[category] = map[category].slice(0, 10)
      })
    }

    return map
  }, [coverageData])

  const recommendedSources = useMemo(() => {
    const map: Partial<Record<DatasetCategory, string>> = {}
    DATASET_ORDER.forEach((category) => {
      const top = (categoryCandidates[category] || [])[0]
      const label = top?.dataset || top?.source
      if (label) {
        map[category] = label
      }
    })
    return map
  }, [categoryCandidates])


  const localEntries = useMemo(() => {
    return (coverageData?.entries || []).filter((entry) => !entry.applies_globally)
  }, [coverageData])

  const globalEntries = useMemo(() => {
    return (coverageData?.entries || []).filter((entry) => entry.applies_globally)
  }, [coverageData])

  if (!open || !mounted) return null

  const handleToggleCategory = (category: DatasetCategory) => {
    setSelectedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(category)) {
        next.delete(category)
      } else {
        next.add(category)
      }
      return next
    })
  }

  const handleSelectMissing = () => {
    setSelectedCategories(new Set(missingCategories))
  }

  const handleOverrideChange = (category: DatasetCategory, datasetName: string) => {
    setCategoryOverrides((prev) => {
      if (!datasetName) {
        const next = { ...prev }
        delete next[category]
        return next
      }
      return {
        ...prev,
        [category]: datasetName
      }
    })
  }

  const handleCatalogDatasetSelect = (entry: DatasetCoverageEntry) => {
    const category = inferCategoryFromEntry(entry)
    if (!category) {
      setJobBanner({ kind: 'error', message: 'Unable to map dataset to PIRL category automatically.' })
      return
    }
    const datasetName = entry.dataset || entry.source
    if (!datasetName) {
      setJobBanner({ kind: 'error', message: 'Selected dataset is missing a name to send to ZEUS tools.' })
      return
    }
    handleOverrideChange(category, datasetName)
    setSelectedCategories((prev) => {
      const next = new Set(prev)
      next.add(category)
      return next
    })
    setJobBanner({
      kind: 'success',
      message: `${datasetName} pinned for ${CATEGORY_LABELS[category]}`
    })
  }

  const handleStartFetch = () => {
    if (!currentProject) return
    if (selectedCategories.size === 0) {
      setJobBanner({ kind: 'error', message: 'Select at least one dataset category to fetch.' })
      return
    }
    setJobBanner(null)

    const overridesPayload: Partial<Record<DatasetCategory, string>> = {}
    selectedCategories.forEach((category) => {
      const override = categoryOverrides[category]
      if (override) {
        overridesPayload[category] = override
      }
    })

    startDatasetFetch(currentProject, Array.from(selectedCategories), forceRefetch, overridesPayload)
      .then((resp) => {
        setJobId(resp.job_id)
        setProgressDialogOpen(true)
        // Report action for tour auto-advance
        reportAction('click-fetch-datasets')
      })
      .catch((err) => {
        setJobBanner({ kind: 'error', message: err?.message || 'Failed to start dataset fetch.' })
      })
  }

  const handleJobFinished = (result?: DatasetFetchJob) => {
    setSelectedCategories(new Set())
    setRefreshKey((key) => key + 1)
    void refreshProjectData()
    if (!result) return
    if (result.status === 'succeeded') {
      setJobBanner({ kind: 'success', message: 'Dataset fetch completed successfully.' })
    } else if (result.status === 'failed') {
      setJobBanner({ kind: 'error', message: result.error || 'Dataset fetch failed. Check logs for details.' })
    }
  }

  const handleProgressDialogClose = () => {
    setProgressDialogOpen(false)
    setJobId(null)
  }

  const handleRunInBackground = () => {
    if (jobId && onRunInBackground) {
      onRunInBackground(jobId)
      setProgressDialogOpen(false)
      // Close the coverage dialog too
      handleClose()
    }
  }

  const minimumMet = datasetStatus?.minimum_requirements_met
  const readinessLoading = readinessState === 'loading'

  const actionsFooter = readinessState === 'ready' && datasetList.length > 0 && (
    <div className="bg-[#0a0a0a] border-t border-white/10 p-4 flex items-center justify-between z-20 shadow-[0_-10px_30px_rgba(0,0,0,0.8)] shrink-0">
      <div className="flex items-center gap-4">
          <button
              onClick={handleSelectMissing}
              disabled={missingCategories.length === 0 || !!jobId}
              className="text-[10px] font-mono uppercase tracking-wider text-white/50 hover:text-primary transition-colors disabled:opacity-30"
          >
              [Select Missing Categories]
          </button>
          <label className="flex items-center gap-2 cursor-pointer group">
              <input
                  type="checkbox"
                  className="appearance-none w-3 h-3 border border-white/30 rounded-sm checked:bg-primary checked:border-primary transition-all"
                  checked={forceRefetch}
                  disabled={!!jobId}
                  onChange={(event) => setForceRefetch(event.target.checked)}
              />
              <span className="text-[10px] font-mono uppercase tracking-wider text-white/50 group-hover:text-white transition-colors">Force Overwrite</span>
          </label>
      </div>

      <div className="flex items-center gap-4">
          <span className="text-xs font-mono text-white/60">
              {selectedCategories.size} SELECTED
          </span>
          <button
              onClick={handleStartFetch}
              disabled={selectedCategories.size === 0 || readinessLoading || readinessState !== 'ready' || !!jobId || !currentProject}
              data-tour="fetch-datasets-btn"
              className={cn(
                  "px-6 py-2 bg-primary text-black text-xs font-bold uppercase tracking-wider rounded-sm transition-all hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2",
                  !jobId && selectedCategories.size > 0 && "shadow-[0_0_15px_rgba(var(--primary),0.4)]"
              )}
          >
              <PlayCircle className="w-4 h-4" />
              Execute Fetch Protocol
          </button>
      </div>
    </div>
  )

  return createPortal(
    <>
      {!progressDialogOpen && (
        <>
          <div 
            className={cn(
              "fixed inset-0 bg-black/80 backdrop-blur-md z-[100]",
              isClosing ? "animate-fade-out" : "animate-fade-in"
            )} 
            onClick={handleClose}
          >
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none" />
          </div>
          
          <div className="fixed inset-0 z-[101] flex items-center justify-center p-4 pointer-events-none">
            <div
              data-tour="dataset-dialog"
              className={cn(
              "relative z-10 w-[1000px] max-w-[95vw] max-h-[90vh] bg-[#0a0a0a]/95 border border-white/10 rounded-sm shadow-[0_0_50px_-10px_rgba(0,0,0,0.8)] flex flex-col pointer-events-auto overflow-hidden",
              isClosing ? "animate-fade-out" : "animate-fade-in"
            )}>
              
              {/* Header */}
              <header className="px-6 py-5 border-b border-white/10 flex items-center justify-between bg-black/20 shrink-0">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2 text-[10px] text-white/40 uppercase tracking-[0.2em] font-mono">
                <Database className="w-3 h-3" />
                <span>Acquisition Protocol</span>
              </div>
                <div className="flex items-center gap-3">
                <h2 className="text-xl font-bold text-white uppercase tracking-wide font-mono">
                  Dataset Manager
                </h2>
                {currentProject && (
                  <div className="px-2 py-0.5 bg-white/5 border border-white/10 rounded-sm text-[10px] font-mono text-white/70">
                    {currentProject}
                  </div>
                )}
              </div>
              {coverageData?.country && (
                <div className="flex items-center gap-1.5 mt-1 text-xs text-white/50 font-mono">
                  <Globe className="w-3 h-3 text-primary/50" />
                  <span>AOI LOC:</span>
                  <span className="text-primary">{coverageData.country.toUpperCase()}</span>
                  <span className="text-white/30">({coverageData.iso3})</span>
                </div>
              )}
            </div>
            <button 
              onClick={handleClose}
              className="p-2 hover:bg-white/5 border border-transparent hover:border-white/10 rounded-sm text-white/50 hover:text-white transition-all"
            >
              <X className="w-5 h-5" />
            </button>
          </header>

          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8 bg-[linear-gradient(to_right,#ffffff02_1px,transparent_1px),linear-gradient(to_bottom,#ffffff02_1px,transparent_1px)] bg-[size:20px_20px]">
            
            {/* Status & Action Section */}
            <section className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-white/[0.02] border border-white/10 rounded-sm">
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-white/5 rounded-sm border border-white/5">
                    <Server className="w-5 h-5 text-white/70" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">PIRL Readiness Status</h3>
                    <div className="flex items-center gap-2 mt-1">
                        <div className={cn("w-2 h-2 rounded-full animate-pulse", minimumMet ? "bg-emerald-500" : "bg-amber-500")} />
                        <span className={cn("text-xs font-mono uppercase", minimumMet ? "text-emerald-500" : "text-amber-500")}>
                            {minimumMet ? 'Minimum Requirements Met' : 'Critical Datasets Missing'}
                        </span>
                  </div>
                  </div>
                </div>
                
              <div className="flex items-center gap-3">
                  <button
                  onClick={() => setRefreshKey((key) => key + 1)}
                  disabled={readinessLoading || !!jobId}
                    className="flex items-center gap-2 px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-white/60 hover:text-white hover:bg-white/5 border border-transparent hover:border-white/10 rounded-sm transition-all disabled:opacity-50"
                  >
                    <RefreshCw className={cn("w-3 h-3", readinessLoading && "animate-spin")} />
                    Refresh Status
                  </button>
                </div>
            </div>

            {jobBanner && (
                <div className={cn(
                    "p-3 border rounded-sm text-xs font-mono flex items-center gap-3",
                  jobBanner.kind === 'success'
                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" 
                        : "bg-red-500/10 border-red-500/30 text-red-400"
                )}>
                    {jobBanner.kind === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                {jobBanner.message}
              </div>
            )}

            {readinessState === 'loading' && (
                <div className="flex items-center justify-center gap-3 py-12 text-white/40 font-mono text-xs uppercase tracking-widest">
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                  <span>Scanning Project Architecture...</span>
              </div>
            )}

            {readinessState === 'error' && readinessError && (
                <div className="border border-red-500/30 bg-red-500/10 text-red-400 rounded-sm p-4 text-xs font-mono">
                  ERROR: {readinessError}
              </div>
            )}

            {readinessState === 'ready' && datasetList.length > 0 && (
              <>
                <div className="space-y-3">
                  {datasetList.map((entry) => {
                      const category = entry.category as DatasetCategory
                      const isSelected = selectedCategories.has(category)
                      const overrideValue = categoryOverrides[category] || null
                      const defaultSource = recommendedSources[category] || getDefaultSourceLabel(category, coverageData?.iso3) || null
                      
                      // Options logic
                      const candidates = categoryCandidates[category] || []
                      const optionNames = candidates
                        .map((candidate) => candidate.dataset || candidate.source || '')
                        .filter((name): name is string => Boolean(name))
                      const uniqueOptions = Array.from(new Set(optionNames))
                      const filteredOptions = uniqueOptions.filter((name) => name !== defaultSource)
                      if (overrideValue && overrideValue !== defaultSource && !filteredOptions.includes(overrideValue)) {
                        filteredOptions.unshift(overrideValue)
                      }

                    return (
                        <div
                        key={entry.category}
                          className={cn(
                            "group relative flex gap-4 p-4 border rounded-sm transition-all duration-200 hover:bg-white/[0.02]",
                            entry.present ? "border-emerald-500/20 bg-emerald-500/[0.02]" : "border-white/10 bg-black/20",
                            isSelected && "border-primary/50 bg-primary/[0.02]"
                          )}
                        >
                          {/* Selection Toggle */}
                          <div className="pt-1">
                             <button
                                onClick={() => handleToggleCategory(category)}
                          disabled={!!jobId || readinessLoading}
                                className={cn(
                                    "w-5 h-5 border rounded-sm flex items-center justify-center transition-all",
                                    isSelected 
                                        ? "bg-primary border-primary text-black" 
                                        : "border-white/20 hover:border-white/40 bg-black/40"
                                )}
                             >
                                {isSelected && <CheckCircle2 className="w-3.5 h-3.5" />}
                             </button>
                          </div>

                          <div className="flex-1 space-y-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-3">
                                    <span className="font-bold text-sm text-white uppercase tracking-wide">{CATEGORY_LABELS[category]}</span>
                                    <span className="text-[9px] font-mono text-white/30 border border-white/10 px-1.5 py-0.5 rounded-sm">
                              {entry.dataset_type.toUpperCase()}
                            </span>
                          </div>
                                <div className={cn(
                                    "text-[9px] font-bold px-2 py-0.5 rounded-sm uppercase tracking-wider border",
                                    entry.present 
                                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-500" 
                                        : "bg-amber-500/10 border-amber-500/30 text-amber-500"
                                )}>
                                    {entry.present ? 'AVAILABLE' : 'MISSING'}
                                </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-4 text-xs">
                                <div className="flex-1 min-w-[200px]">
                                    {defaultSource ? (
                                        <div className="flex flex-col">
                                            <span className="text-[9px] text-white/40 font-mono uppercase">Recommendation</span>
                                            <span className="text-white/80">{defaultSource}</span>
                                        </div>
                                    ) : (
                                        <span className="text-white/40 italic">No recommendation</span>
                                    )}
                                </div>
                                
                                {/* Source Override Selector */}
                                {(Boolean(defaultSource) || filteredOptions.length > 0) && (
                                    <div className="flex items-center gap-2">
                                        <span className="text-[9px] text-white/40 font-mono uppercase">Source Override</span>
                                        <select
                                            className="bg-black border border-white/20 rounded-sm px-2 py-1 text-[10px] text-white focus:border-primary focus:ring-0 outline-none min-w-[150px]"
                                            value={overrideValue || ''}
                                            disabled={!!jobId}
                                            onChange={(event) => handleOverrideChange(category, event.target.value)}
                                        >
                                            <option value="">{defaultSource ? 'Auto (Recommended)' : 'Select Source'}</option>
                                            {filteredOptions.map((option, idx) => (
                                                <option key={`${category}-${option || idx}`} value={option}>{option}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                            </div>

                            {/* Path / Info */}
                            <div className="pt-2 border-t border-white/5 flex items-center justify-between">
                                <div className="font-mono text-[10px] text-white/40 truncate max-w-[400px]">
                                    {entry.processed_path || 'No processed artifact'}
                                </div>
                            {entry.last_modified && (
                                    <div className="font-mono text-[10px] text-white/30">
                                        {new Date(entry.last_modified).toLocaleDateString()}
                                    </div>
                            )}
                            </div>
                          </div>
                        </div>
                    )
                  })}
                </div>
              </>
            )}
          </section>

            {/* Reference Catalog */}
            <section className="space-y-4 pt-8 border-t border-white/10">
              <div className="flex items-center gap-2 text-white/50">
                 <Database className="w-4 h-4" />
                 <h3 className="text-sm font-bold uppercase tracking-wide">Global Reference Catalog</h3>
              </div>
              
              {coverageState === 'loading' && (
                <div className="text-center py-8 text-white/30 font-mono text-xs uppercase tracking-widest">
                    Accessing Global Index...
                  </div>
                )}

              {coverageState === 'ready' && (
                <div className="grid grid-cols-1 gap-8">
                <CoverageSection
                      title="AOI-Aligned Sources"
                      subtitle="High-precision datasets overlapping target coordinates."
                  entries={localEntries}
                      onSelectDataset={handleCatalogDatasetSelect}
                />
                <CoverageSection
                      title="Baseline Global Sources"
                      subtitle="Standard fallback datasets."
                  entries={globalEntries}
                      onSelectDataset={handleCatalogDatasetSelect}
                />
                </div>
            )}
          </section>
          </div>

          {/* Fixed Footer */}
          {actionsFooter}

        </div>
      </div>
      </>
    )}
    <DatasetFetchProgressDialog
        jobId={jobId}
        open={progressDialogOpen && Boolean(jobId)}
        onClose={handleProgressDialogClose}
        onJobFinished={handleJobFinished}
        onRunInBackground={onRunInBackground ? handleRunInBackground : undefined}
      />
    </>,
    document.body
  )
}

function CoverageSection({
  title,
  subtitle,
  entries,
  onSelectDataset
}: {
  title: string
  subtitle: string
  entries: DatasetCoverageEntry[]
  onSelectDataset?: (entry: DatasetCoverageEntry) => void
}) {
  return (
    <section className="border border-white/5 bg-white/[0.01] rounded-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-white/5 bg-white/[0.02]">
        <div className="text-xs font-bold text-white uppercase tracking-wider">{title}</div>
        <div className="text-[10px] font-mono text-white/40">{subtitle}</div>
      </div>
      {entries.length === 0 ? (
        <div className="p-4 text-[10px] font-mono text-white/30 text-center uppercase">
          No matching sources found
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[10px] font-mono">
            <thead className="bg-white/[0.03] text-white/40 uppercase tracking-wider">
              <tr>
                <th className="px-4 py-2 font-normal">Source</th>
                <th className="px-4 py-2 font-normal">Type</th>
                <th className="px-4 py-2 font-normal">Access</th>
                <th className="px-4 py-2 font-normal">Coverage</th>
                <th className="px-4 py-2 font-normal">Category Mapping</th>
                <th className="px-4 py-2 font-normal text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-white/70">
              {entries.map((entry, i) => {
                const inferredCategory = inferCategoryFromEntry(entry)
                return (
                  <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-2">
                      <div className="font-bold text-white">{entry.dataset}</div>
                      {entry.source && <div className="text-white/40">{entry.source}</div>}
                    </td>
                    <td className="px-4 py-2">{entry.data_type || '-'}</td>
                    <td className="px-4 py-2">{entry.access || '-'}</td>
                    <td className="px-4 py-2">{entry.coverage || 'Global'}</td>
                    <td className="px-4 py-2">
                        {inferredCategory ? (
                            <span className="text-primary">{CATEGORY_LABELS[inferredCategory].split('(')[0]}</span>
                        ) : (
                            <span className="text-white/20">Unmapped</span>
                    )}
                  </td>
                    <td className="px-4 py-2 text-right">
                        {inferredCategory && onSelectDataset && (
                            <button 
                                onClick={() => onSelectDataset(entry)}
                                className="px-2 py-1 border border-white/20 rounded-sm hover:bg-primary/10 hover:border-primary/50 hover:text-primary transition-all"
                            >
                                USE
                            </button>
                    )}
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
