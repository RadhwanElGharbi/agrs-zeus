'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { LayerSpecification, Map as MapLibreMap, MapMouseEvent, MapOptions } from 'maplibre-gl'
import { Maximize2, Loader2, RefreshCw, Layers, Mountain, Brain, X } from 'lucide-react'
import MapboxDraw from '@mapbox/mapbox-gl-draw'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useProject } from '@/lib/context/ProjectContext'
import {
  fetchVectorData,
  fetchNearestVectorFeatures,
  getTileUrl,
  getVectorTileUrl,
  getTerrainTileUrl,
  getAoiFileUrl,
  fetchPIRLRouteCrossings,
  fetchPIRLRoute,
  fetchCreatorGeoJSON,
  createCreatorEntry,
  updateCreatorEntry,
  deleteCreatorEntry,
  getCreatorEntry,
  getCreatorEntryChangelog,
  getCreatorAttachmentUrl,
  fetchProjectSorties,
  createProjectSortie,
  type RouteCrossingRecord,
  type CreatorEntry,
  type CreatorAttachment,
  type CreatorCategory,
  type CreatorDatasetRef,
  type CreatorDatasetFeatureSelection,
  type CreatorEntryType,
  type DatasetInfo,
  type CreatorSurvey,
  type NearestVectorFeatureCandidate,
  type SurveyObservationType,
  type SurveyConfidence,
  type SurveyMethod,
  type SurveyStatus,
  type SurveyGpsQuality,
  type Sortie
} from '@/lib/api/dataClient'
import { TerrainSampler } from '@/lib/terrainSampler'
import { createCrossingMarkerImageData } from '@/lib/map/crossingMarkerImage'
import { createStarSkyboxLayer, type StarSkyboxLayer } from '@/lib/map/createSkyboxLayer'
import {
  ManagedLayer,
  VectorDetail,
  LayerStyleOptions,
  LngLatBounds,
  AOI_LAYER_HINTS,
  colorForLayer,
  getGeoJSONBounds,
  inferGeometryType,
  buildPropertySummary,
  getRasterBounds,
  featureBounds,
  getDasharrayForWidth,
  LineStyle
} from '@/lib/map-utils'
import { LayerManager } from './LayerManager'
import { RoutingRoutesPanel } from './RoutingRoutesPanel'
import { CreatorManager, type CreatorManagerEntry } from './CreatorManager'
import { AttributeTable } from './AttributeTable'
import { PIRLAttributeTable } from './PIRLAttributeTable'
import { StyleEditor } from './StyleEditor'
import { ProjectDatasetsDialog } from './ProjectDatasetsDialog'
import { DatasetDigitalTwinDialog } from './DatasetDigitalTwinDialog'
import { Compass } from './Compass'
import { GoToCoordinatesBar } from './GoToCoordinatesBar'
import { ExplanationPanel, DecisionsPanel } from '@/components/Analysis'
import { analyzeSegments, getRouteDecisions, getSegmentDecisions, getAssessmentMapColor, getAgenticSegmentsGeometry, type ExplainResponse, type AssessmentLevel, type SegmentDecisions } from '@/lib/api/agenticClient'
import { useMapView, type OperatorGeometryKind, readSession, writeSession } from '@/lib/context/MapViewContext'
import { PirlRoutesManagerPanel } from './PirlRoutesManagerPanel'
import { RouteCrossingsManagerPanel } from './RouteCrossingsManagerPanel'
import { RoutingCrossingsPanel } from './RoutingCrossingsPanel'
import { CrossingInfoDialog } from './CrossingInfoDialog'
import { MeasureToolPanel } from './GeoprocessingToolsPanel'

const BASEMAP_FALLBACK_DEFAULT_OPACITY = 1
const BASEMAP_FALLBACK_FAILURE_OPACITY = 1
const BASEMAP_LOWRES_MAXZOOM = 5
const BASEMAP_FAILURE_WINDOW_MS = 5000
const BASEMAP_FAILURE_THRESHOLD = 3
const BASEMAP_RECOVERY_DEBOUNCE_MS = 1500
const BASEMAP_STALL_CHECK_MS = 900
const BASEMAP_STALL_RELOAD_COOLDOWN_MS = 2500
const CURSOR_UPDATE_THROTTLE_MS = 80

// ---------------------------------------------------------------------------
// Session persistence for per-project layer visibility / opacity
// ---------------------------------------------------------------------------
type LayerSessionState = Record<string, { visible: boolean; opacity: number }>

function layerSessionKey(project: string): string {
  return `layer_state_${project}`
}

function saveLayerSession(project: string | null, layers: ManagedLayer[]): void {
  if (!project) return
  const state: LayerSessionState = {}
  for (const l of layers) {
    state[l.id] = { visible: l.visible, opacity: l.opacity }
  }
  writeSession(layerSessionKey(project), state)
}

function restoreLayerSession(project: string | null): LayerSessionState {
  if (!project) return {}
  return readSession<LayerSessionState>(layerSessionKey(project), {})
}

// ---------------------------------------------------------------------------
// Session persistence for map viewport
// ---------------------------------------------------------------------------
type ViewportState = { center: [number, number]; zoom: number; bearing: number; pitch: number }

const DEFAULT_VIEWPORT: ViewportState = {
  center: [-80.5449, 43.4723], // University of Waterloo
  zoom: 14.5,
  bearing: 0,
  pitch: 0
}

function saveViewport(vp: ViewportState): void {
  writeSession('map_viewport', vp)
}

function restoreViewport(): ViewportState {
  return readSession<ViewportState>('map_viewport', DEFAULT_VIEWPORT)
}

// ---------------------------------------------------------------------------
// Session persistence for loaded PIRL routes (per project)
// ---------------------------------------------------------------------------
type RouteSessionEntry = { routeId: string; visible: boolean }

function routeSessionKey(project: string): string {
  return `loaded_routes_${project}`
}

function saveRouteSession(project: string | null, routes: { routeId: string; visible: boolean }[]): void {
  if (!project) return
  const entries: RouteSessionEntry[] = routes.map(r => ({ routeId: r.routeId, visible: r.visible }))
  writeSession(routeSessionKey(project), entries)
}

function restoreRouteSession(project: string | null): RouteSessionEntry[] {
  if (!project) return []
  return readSession<RouteSessionEntry[]>(routeSessionKey(project), [])
}

// Route crossings (Route ∩ vectors) overlay
const ROUTE_CROSSINGS_SOURCE_ID = 'route-crossings'
const ROUTE_CROSSINGS_LAYER_SHADOW_ID = 'route-crossings-shadow'
const ROUTE_CROSSINGS_LAYER_GLOW_ID = 'route-crossings-glow'
const ROUTE_CROSSINGS_LAYER_MARKER_ID = 'route-crossings-marker'

const CREATOR_SOURCE_ID = 'creator-source'
const CREATOR_LAYER_FILL_ID = 'creator-fill'
const CREATOR_LAYER_LINE_ID = 'creator-line'
const CREATOR_LAYER_POINT_ID = 'creator-points'
const CREATOR_MANAGED_LAYER_ID = 'creator-annotations'

// Sortie "where" preview overlay (shown while editing sorties)
const SORTIE_PREVIEW_SOURCE_ID = 'sortie-preview'
const SORTIE_PREVIEW_LAYER_FILL_ID = 'sortie-preview-fill'
const SORTIE_PREVIEW_LAYER_LINE_ID = 'sortie-preview-line'
const SORTIE_PREVIEW_LAYER_POINT_ID = 'sortie-preview-point'

function svgCursor(svg: string, hotspotX: number, hotspotY: number, fallback: string): string {
  const encoded = encodeURIComponent(svg)
  return `url("data:image/svg+xml;charset=utf-8,${encoded}") ${hotspotX} ${hotspotY}, ${fallback}`
}

function geometryToFeatureCollection(geometry: GeoJSON.Geometry | null): GeoJSON.FeatureCollection {
  const empty: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }
  if (!geometry || typeof geometry !== 'object') return empty

  const features: GeoJSON.Feature[] = []

  const pushGeometry = (g: any) => {
    if (!g || typeof g !== 'object' || typeof g.type !== 'string') return

    const type = String(g.type)
    if (type === 'GeometryCollection') {
      const geometries = Array.isArray(g.geometries) ? (g.geometries as any[]) : []
      geometries.forEach(pushGeometry)
      return
    }

    if (type === 'MultiPoint') {
      const coords = Array.isArray(g.coordinates) ? (g.coordinates as any[]) : []
      coords.forEach((pt) => {
        if (!Array.isArray(pt) || pt.length < 2) return
        features.push({
          type: 'Feature',
          id: `sortie-preview-${features.length}`,
          properties: {},
          geometry: { type: 'Point', coordinates: pt } as any
        })
      })
      return
    }

    if (type === 'MultiLineString') {
      const coords = Array.isArray(g.coordinates) ? (g.coordinates as any[]) : []
      coords.forEach((line) => {
        if (!Array.isArray(line) || line.length < 2) return
        features.push({
          type: 'Feature',
          id: `sortie-preview-${features.length}`,
          properties: {},
          geometry: { type: 'LineString', coordinates: line } as any
        })
      })
      return
    }

    if (type === 'MultiPolygon') {
      const coords = Array.isArray(g.coordinates) ? (g.coordinates as any[]) : []
      coords.forEach((poly) => {
        if (!Array.isArray(poly) || poly.length < 1) return
        features.push({
          type: 'Feature',
          id: `sortie-preview-${features.length}`,
          properties: {},
          geometry: { type: 'Polygon', coordinates: poly } as any
        })
      })
      return
    }

    // Assume it's already a valid single-geometry GeoJSON object.
    features.push({
      type: 'Feature',
      id: `sortie-preview-${features.length}`,
      properties: {},
      geometry: g as GeoJSON.Geometry
    })
  }

  pushGeometry(geometry as any)
  return { type: 'FeatureCollection', features }
}

// Distinct cursors for Operator "Create POI" vs "Create AOI"
const CREATOR_CURSOR_POI = svgCursor(
  `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <line x1="16" y1="2" x2="16" y2="30" stroke="#000000" stroke-width="4" stroke-linecap="round"/>
    <line x1="2" y1="16" x2="30" y2="16" stroke="#000000" stroke-width="4" stroke-linecap="round"/>
    <line x1="16" y1="2" x2="16" y2="30" stroke="#f59e0b" stroke-width="2" stroke-linecap="round"/>
    <line x1="2" y1="16" x2="30" y2="16" stroke="#f59e0b" stroke-width="2" stroke-linecap="round"/>
    <circle cx="16" cy="16" r="5" fill="none" stroke="#000000" stroke-width="3"/>
    <circle cx="16" cy="16" r="5" fill="none" stroke="#ffffff" stroke-width="1.5"/>
  </svg>`,
  16,
  16,
  'crosshair'
)

const CREATOR_CURSOR_AOI = svgCursor(
  `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <path d="M8 10 L16 6 L24 10 L22 22 L10 22 Z" fill="none" stroke="#000000" stroke-width="4" stroke-linejoin="round"/>
    <path d="M8 10 L16 6 L24 10 L22 22 L10 22 Z" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linejoin="round"/>
    <circle cx="8" cy="10" r="2.2" fill="#000000"/>
    <circle cx="16" cy="6" r="2.2" fill="#000000"/>
    <circle cx="24" cy="10" r="2.2" fill="#000000"/>
    <circle cx="22" cy="22" r="2.2" fill="#000000"/>
    <circle cx="10" cy="22" r="2.2" fill="#000000"/>
    <circle cx="8" cy="10" r="1.4" fill="#ffffff"/>
    <circle cx="16" cy="6" r="1.4" fill="#ffffff"/>
    <circle cx="24" cy="10" r="1.4" fill="#ffffff"/>
    <circle cx="22" cy="22" r="1.4" fill="#ffffff"/>
    <circle cx="10" cy="22" r="1.4" fill="#ffffff"/>
  </svg>`,
  16,
  16,
  'crosshair'
)

type CursorElevationStatus = 'idle' | 'loading' | 'ready' | 'unavailable' | 'error' | 'no-dem'

type CursorElevationState = {
  value: number | null
  status: CursorElevationStatus
}

type IdentifyPopupState = {
  x: number
  y: number
  lat: number
  lng: number
  title: string
  featureId: string | null
  geometryType: string | null
  rows: { key: string; value: string }[]
}

type CreatorTool = 'none' | 'create_poi' | 'create_aoi'

type CreatorEditorSection = 'info' | 'notes' | 'files'

type CreatorEditorState = {
  mode: 'create' | 'edit'
  section: CreatorEditorSection
  x: number
  y: number
  entryId?: string
  entryType: CreatorEntryType
  geometryWgs84: GeoJSON.Geometry
  title: string
  category: CreatorCategory
  categoryOther: string
  comment: string
  datasets: CreatorDatasetRef[]
  datasetFeatures: CreatorDatasetFeatureSelection[]
  sortie: { id: string; code: string; name?: string | null } | null
  survey: CreatorSurvey
  existingAttachments: CreatorAttachment[]
  removedAttachments: string[]
  newFiles: File[]
  loading: boolean
  saving: boolean
  error: string | null
  changelogOpen: boolean
  changelog: any[] | null
}

type CreatorGeometryConfirmState = {
  entryType: CreatorEntryType
  geometryWgs84: GeoJSON.Geometry
  x: number
  y: number
}

type CreatorGeometryEditState = {
  entryId: string
  entryType: CreatorEntryType
  drawId: string
  x: number
  y: number
} | null

type CreatorThreadEntryDetailsState = {
  entryId: string
  record: any
} | null

const CATEGORY_FIELD_DEFS: Record<
  CreatorCategory,
  { key: string; label: string; placeholder: string }[]
> = {
  Geological: [
    { key: 'feature_type', label: 'Feature Type', placeholder: 'e.g. landslide, erosion, karst' },
    { key: 'activity', label: 'Activity', placeholder: 'e.g. active, dormant, uncertain' }
  ],
  Environmental: [
    { key: 'feature_type', label: 'Feature Type', placeholder: 'e.g. wetland, river, habitat' },
    { key: 'sensitivity', label: 'Sensitivity', placeholder: 'e.g. low, medium, high' }
  ],
  Engineering: [
    { key: 'asset_type', label: 'Asset Type', placeholder: 'e.g. culvert, roadcut, retaining wall' },
    { key: 'condition', label: 'Condition', placeholder: 'e.g. good, fair, poor' }
  ],
  Regulatory: [
    { key: 'jurisdiction', label: 'Jurisdiction', placeholder: 'e.g. agency, state, municipality' },
    { key: 'reference_id', label: 'Reference ID', placeholder: 'e.g. permit/case #' }
  ],
  Crossing: [
    { key: 'crossing_type', label: 'Crossing Type', placeholder: 'e.g. road, rail, river' },
    { key: 'key_constraint', label: 'Key Constraint', placeholder: 'e.g. access, depth, ROW limits' }
  ],
  Other: [
    { key: 'field_1', label: 'Field 1', placeholder: 'Optional' },
    { key: 'field_2', label: 'Field 2', placeholder: 'Optional' }
  ]
}

export function MapViewer() {
  const { currentProject, datasets, isProjectLoading, hasNewDatasets, refreshProjectData, dismissNewDatasets } = useProject()
  const { mapMode, setMapMode, mapProjection, registerGisActions, registerOperatorActions, registerRoutingActions, setOperatorUiState, operatorDialogs, sortiePreviewGeometry } =
    useMapView()
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const goToMarkerRef = useRef<any | null>(null)
  const goToMarkerTimeoutsRef = useRef<{ fade: ReturnType<typeof setTimeout> | null; remove: ReturnType<typeof setTimeout> | null }>({
    fade: null,
    remove: null
  })
  const goToMarkerRequestIdRef = useRef(0)
  const creatorPopoverRef = useRef<HTMLDivElement | null>(null)
  const creatorPopoverDragRef = useRef<{
    pointerId: number
    startClientX: number
    startClientY: number
    startX: number
    startY: number
    width: number
    height: number
  } | null>(null)
  const creatorGeometryConfirmPopoverRef = useRef<HTMLDivElement | null>(null)
  const creatorGeometryConfirmDragRef = useRef<{
    pointerId: number
    startClientX: number
    startClientY: number
    startX: number
    startY: number
    width: number
    height: number
  } | null>(null)
  const contextMenuRef = useRef<HTMLDivElement | null>(null)
  const dynamicLayerIdsRef = useRef<string[]>([])
  const dynamicSourceIdsRef = useRef<string[]>([])
  // Guards async (re)builds of project layers so stale in-flight requests can't mutate the map.
  const projectLayersLoadIdRef = useRef(0)
  const isMiddleRotatingRef = useRef(false)
  const rotationStartRef = useRef<{
    x: number
    y: number
    bearing: number
    pitch: number
    around: [number, number]
  } | null>(null)
  const isRightZoomingRef = useRef(false)
  const hasMovedDuringRightClickRef = useRef(false)
  const zoomStartRef = useRef<{
    y: number
    zoom: number
    around: [number, number]
  } | null>(null)
  const rotateMarkerIdRef = useRef<string | null>(null)
  const terrainSamplerRef = useRef<TerrainSampler | null>(null)
  const elevationRequestIdRef = useRef(0)

  const [mapReady, setMapReady] = useState(false)
  const [mapLoaded, setMapLoaded] = useState(false)
  const [isBuffering, setIsBuffering] = useState(false)
  const [zoom, setZoom] = useState(4)
  const [managedLayers, setManagedLayers] = useState<ManagedLayer[]>([])
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null)
  const selectedLayerIdRef = useRef<string | null>(null)
  const [vectorDetails, setVectorDetails] = useState<Record<string, VectorDetail>>({})
  const [preloadedTables, setPreloadedTables] = useState<Record<string, VectorDetail>>({})
  const [loadingMessage, setLoadingMessage] = useState<string | null>(null)
  const [fullTableLayerId, setFullTableLayerId] = useState<string | null>(null)
  const [fullTableDocked, setFullTableDocked] = useState(false)
  const [dockHeight, setDockHeight] = useState(45)
  const [sortConfig, setSortConfig] = useState<{ column: string | null; direction: 'asc' | 'desc' }>({ column: null, direction: 'asc' })
  const [terrainEnabled, _setTerrainEnabled] = useState(() => readSession<boolean>('terrain_enabled', false))
  const setTerrainEnabled = useCallback((v: boolean | ((prev: boolean) => boolean)) => {
    _setTerrainEnabled(prev => {
      const next = typeof v === 'function' ? v(prev) : v
      writeSession('terrain_enabled', next)
      return next
    })
  }, [])
  const [styleLayerId, setStyleLayerId] = useState<string | null>(null)
  const [styleDraft, setStyleDraft] = useState<LayerStyleOptions>({})
  const [styleOverrides, setStyleOverrides] = useState<Record<string, LayerStyleOptions>>({})
  const [cursorPosition, setCursorPosition] = useState<{ lng: number; lat: number } | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; lat: number; lng: number } | null>(null)
  const [goToCoordinatesOpen, setGoToCoordinatesOpen] = useState(false)
  const [goToCoordinatesSeed, setGoToCoordinatesSeed] = useState<{ lng: number; lat: number } | null>(null)
  const [identifyPopup, setIdentifyPopup] = useState<IdentifyPopupState | null>(null)
  const [cursorElevation, setCursorElevation] = useState<CursorElevationState>({ value: null, status: 'idle' })
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' } | null>(null)
  const mapModeRef = useRef(mapMode)
  const creatorToolRef = useRef<CreatorTool>('none')
  const creatorCursorAppliedRef = useRef(false)
  const currentProjectRef = useRef<string | null>(null)
  const previousProjectRef = useRef<string | null>(null)
  const openCreatorEditEditorRef = useRef<(entryId: string, x: number, y: number) => void>(() => {})

  // Operator Mode state
  const creatorDrawRef = useRef<MapboxDraw | null>(null)
  const creatorInteractionLockRef = useRef(false)
  const creatorLayerHandlersAttachedRef = useRef(false)
  const creatorDrawCreateHandlerRef = useRef<((e: any) => void) | null>(null)
  const [creatorTool, setCreatorTool] = useState<CreatorTool>('none')
  const [creatorEditor, setCreatorEditor] = useState<CreatorEditorState | null>(null)
  const [creatorGeometryConfirm, setCreatorGeometryConfirm] = useState<CreatorGeometryConfirmState | null>(null)
  const [creatorGeometryEdit, setCreatorGeometryEdit] = useState<CreatorGeometryEditState>(null)
  const [selectedCreatorEntryId, setSelectedCreatorEntryId] = useState<string | null>(null)
  const [creatorThreadEntryDetails, setCreatorThreadEntryDetails] = useState<CreatorThreadEntryDetailsState>(null)
  const [creatorEntryUi, setCreatorEntryUi] = useState<Record<string, { visible: boolean; opacity: number; order: number }>>({})
  const [creatorManagerCollapsed, _setCreatorManagerCollapsed] = useState(() => readSession<boolean>('creator_manager_collapsed', false))
  const setCreatorManagerCollapsed = useCallback((v: boolean) => {
    _setCreatorManagerCollapsed(v)
    writeSession('creator_manager_collapsed', v)
  }, [])
  const [creatorDatasetQuery, setCreatorDatasetQuery] = useState('')
  const [datasetFeatureDataset, setDatasetFeatureDataset] = useState<string>('')
  const [datasetFeatureCandidates, setDatasetFeatureCandidates] = useState<NearestVectorFeatureCandidate[] | null>(null)
  const [datasetFeatureLoading, setDatasetFeatureLoading] = useState(false)
  const [datasetFeatureError, setDatasetFeatureError] = useState<string | null>(null)
  const [datasetFeatureInspect, setDatasetFeatureInspect] = useState<NearestVectorFeatureCandidate | null>(null)
  const [operatorGeometryCaptureActive, setOperatorGeometryCaptureActive] = useState(false)
  const operatorGeometryCaptureRef = useRef<{
    resolve: (geom: GeoJSON.Geometry) => void
    reject: (err: Error) => void
  } | null>(null)
  const [sortieQuery, setSortieQuery] = useState('')
  const [sortieOptions, setSortieOptions] = useState<Sortie[]>([])
  const [sortieLoading, setSortieLoading] = useState(false)
  const [sortieError, setSortieError] = useState<string | null>(null)
  const [sortieCreating, setSortieCreating] = useState(false)
  const sortieLoadIdRef = useRef(0)
  const datasetFeatureLoadIdRef = useRef(0)

  // Segment analysis state
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null)
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null)
  const [analysisResult, setAnalysisResult] = useState<ExplainResponse | null>(null)
  const [analysisLoading, setAnalysisLoading] = useState(false)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [showAnalysisPanel, setShowAnalysisPanel] = useState(false)
  const [showRoutesDialog, setShowRoutesDialog] = useState(false)
  const [loadedPirlRoutes, setLoadedPirlRoutes] = useState<{ routeId: string; visible: boolean; segmentCount: number }[]>([])
  const [routeCrossingsByRouteId, setRouteCrossingsByRouteId] = useState<Record<string, RouteCrossingRecord[]>>({})
  // Keep the actual GeoJSON objects around so we can update per-segment styling flags (e.g., violations)
  // without changing the underlying route geometry files.
  const loadedRouteGeojsonByRouteIdRef = useRef<Record<string, GeoJSON.FeatureCollection>>({})
  const [hiddenCrossingCategories, setHiddenCrossingCategories] = useState<Record<string, boolean>>({})
  const [hiddenCrossingKeys, setHiddenCrossingKeys] = useState<Record<string, boolean>>({})
  const [crossingsManagerOpen, setCrossingsManagerOpen] = useState(false)
  const crossingsMarkerImagesLoadedRef = useRef(false)
  const [selectedMapCrossing, setSelectedMapCrossing] = useState<{ routeId: string; crossing: RouteCrossingRecord } | null>(null)

  const totalLoadedCrossings = useMemo(() => {
    if (!loadedPirlRoutes.length) return 0
    let sum = 0
    for (const r of loadedPirlRoutes) {
      sum += routeCrossingsByRouteId[r.routeId]?.length ?? 0
    }
    return sum
  }, [loadedPirlRoutes, routeCrossingsByRouteId])

  const normalizeCrossingCategory = useCallback((value: any): string => {
    const raw = String(value ?? '').trim().toLowerCase()
    return raw || 'unknown'
  }, [])

  const crossingKey = useCallback((routeId: string, crossingId: string) => {
    return `${routeId}:${crossingId}`
  }, [])

  const toggleCrossingCategory = useCallback(
    (category: string) => {
      const key = normalizeCrossingCategory(category)
      setHiddenCrossingCategories((prev) => {
        const next = { ...prev }
        if (next[key]) delete next[key]
        else next[key] = true
        return next
      })
    },
    [normalizeCrossingCategory]
  )

  const toggleCrossingMarker = useCallback(
    (routeId: string, crossingId: string) => {
      const key = crossingKey(routeId, crossingId)
      setHiddenCrossingKeys((prev) => {
        const next = { ...prev }
        if (next[key]) delete next[key]
        else next[key] = true
        return next
      })
    },
    [crossingKey]
  )

  // Validated decisions data state
  const [decisionsData, setDecisionsData] = useState<SegmentDecisions | null>(null)
  const [decisionsLoading, setDecisionsLoading] = useState(false)
  const [decisionsError, setDecisionsError] = useState<string | null>(null)
  const [showDecisionsPanel, setShowDecisionsPanel] = useState(false)

  // PIRL Attribute Table state
  const [pirlTableRouteId, setPirlTableRouteId] = useState<string | null>(null)
  const [pirlTableDocked, setPirlTableDocked] = useState(false)
  const [datasetsDialogOpen, setDatasetsDialogOpen] = useState(false)
  const [datasetDigitalTwinOpen, setDatasetDigitalTwinOpen] = useState(false)
  const [measureDistanceOpen, setMeasureDistanceOpen] = useState(false)
  const [measureAreaOpen, setMeasureAreaOpen] = useState(false)
  const [elevationProfileOpen, setElevationProfileOpen] = useState(false)
  const [activeMeasureTool, setActiveMeasureTool] = useState<'distance' | 'area' | 'elevation' | null>(null)
  const [datasetsDialogDocked, setDatasetsDialogDocked] = useState(false)
  const [creatorEditorDocked, setCreatorEditorDocked] = useState(false)

  const dockHeightRef = useRef(dockHeight)
  const dockContainerRef = useRef<HTMLDivElement | null>(null)
  const highlightSourceId = useRef('selected-feature-source')
  const highlightLayerIds = useRef<string[]>(['selected-feature-fill', 'selected-feature-line', 'selected-feature-point'])
  const terrainSourceIdRef = useRef<string | null>(null)
  const imageryFailedRef = useRef(false)
  const basemapFailureTimestampsRef = useRef<number[]>([])
  const basemapRecoveryTimerRef = useRef<number | null>(null)
  const basemapStallCheckTimerRef = useRef<number | null>(null)
  const basemapLastReloadAtRef = useRef(0)
  const lastCursorUpdateAtRef = useRef(0)
  const starSkyboxRef = useRef<StarSkyboxLayer | null>(null)

  const clearFeatureHighlight = useCallback(() => {
    const map = mapRef.current
    if (!map) return
    const source = map.getSource(highlightSourceId.current) as any
    if (source?.setData) {
      source.setData({ type: 'FeatureCollection', features: [] })
    }
  }, [])

  const handleCloseIdentifyPopup = useCallback(() => {
    setIdentifyPopup(null)
    clearFeatureHighlight()
  }, [clearFeatureHighlight])
  const demLayerName = useMemo(() => {
    if (!datasets?.rasters?.length) return null
    const hints = ['dem', 'elevation', 'terrain', 'dtm', 'dsm']
    const match = datasets.rasters.find((raster) => {
      const name = raster.name.toLowerCase()
      return hints.some((hint) => name.includes(hint))
    })
    return match?.name ?? null
  }, [datasets])

  const creatorDatasetOptions = useMemo<CreatorDatasetRef[]>(() => {
    const opts: CreatorDatasetRef[] = []
    const vectors = datasets?.vectors ?? []
    const rasters = datasets?.rasters ?? []
    for (const v of vectors) {
      if (!v?.name) continue
      opts.push({ name: v.name, type: 'vector' })
    }
    for (const r of rasters) {
      if (!r?.name) continue
      opts.push({ name: r.name, type: 'raster' })
    }
    // De-dupe + stable sort
    const seen = new Set<string>()
    const unique: CreatorDatasetRef[] = []
    for (const o of opts) {
      const key = `${o.type ?? 'dataset'}:${o.name}`
      if (seen.has(key)) continue
      seen.add(key)
      unique.push(o)
    }
    unique.sort((a, b) => {
      const t = String(a.type ?? '').localeCompare(String(b.type ?? ''))
      if (t !== 0) return t
      return a.name.localeCompare(b.name)
    })
    return unique
  }, [datasets])

  const creatorEditorKey = creatorEditor ? `${creatorEditor.mode}:${creatorEditor.entryId ?? 'new'}` : 'closed'

  const loadSorties = useCallback(
    async (query?: string) => {
      if (!currentProject) return
      const loadId = ++sortieLoadIdRef.current
      setSortieLoading(true)
      setSortieError(null)
      try {
        const q = (query || '').trim()
        const resp = await fetchProjectSorties(currentProject, { q: q || undefined, limit: 50 })
        if (sortieLoadIdRef.current !== loadId) return
        setSortieOptions(Array.isArray(resp?.sorties) ? resp.sorties : [])
      } catch (err) {
        if (sortieLoadIdRef.current !== loadId) return
        setSortieError(err instanceof Error ? err.message : 'Failed to load sorties.')
        setSortieOptions([])
      } finally {
        if (sortieLoadIdRef.current !== loadId) return
        setSortieLoading(false)
      }
    },
    [currentProject]
  )

  const handleCreateSortieFromQuery = useCallback(async () => {
    if (!currentProject) return
    const code = sortieQuery.trim()
    if (!code) return
    setSortieCreating(true)
    setSortieError(null)
    try {
      const created = await createProjectSortie(currentProject, { code })
      setCreatorEditor((prev) => (prev ? { ...prev, sortie: { id: created.id, code: created.code, name: created.name ?? null } } : prev))
      setSortieQuery('')
      await loadSorties('')
    } catch (err) {
      setSortieError(err instanceof Error ? err.message : 'Failed to create sortie.')
    } finally {
      setSortieCreating(false)
    }
  }, [createProjectSortie, currentProject, loadSorties, sortieQuery])

  const loadNearestDatasetFeatures = useCallback(async () => {
    if (!currentProject || !creatorEditor) return
    const vectorNames = creatorEditor.datasets.filter((d) => d.type === 'vector').map((d) => d.name)
    const datasetName = datasetFeatureDataset.trim() || (vectorNames.length > 0 ? String(vectorNames[0]) : '')
    if (!datasetName) {
      setDatasetFeatureError('Select a vector dataset first.')
      return
    }
    // If we had to fall back, keep state in sync with what we're querying.
    if (datasetName !== datasetFeatureDataset) {
      setDatasetFeatureDataset(datasetName)
    }
    if (!creatorEditor.geometryWgs84) {
      setDatasetFeatureError('Entry geometry is missing. Draw an AOI/POI geometry first.')
      return
    }
    const loadId = ++datasetFeatureLoadIdRef.current
    setDatasetFeatureLoading(true)
    setDatasetFeatureError(null)
    setDatasetFeatureInspect(null)
    try {
      const res = await fetchNearestVectorFeatures(currentProject, datasetName, creatorEditor.geometryWgs84, 50)
      if (datasetFeatureLoadIdRef.current !== loadId) return
      setDatasetFeatureCandidates(Array.isArray(res?.candidates) ? (res.candidates as NearestVectorFeatureCandidate[]) : [])
    } catch (err) {
      if (datasetFeatureLoadIdRef.current !== loadId) return
      setDatasetFeatureError(err instanceof Error ? err.message : 'Failed to load nearest dataset features.')
      setDatasetFeatureCandidates([])
    } finally {
      if (datasetFeatureLoadIdRef.current !== loadId) return
      setDatasetFeatureLoading(false)
    }
  }, [creatorEditor, currentProject, datasetFeatureDataset])

  const prettyDatasetValue = useCallback((value: any) => {
    if (value === null || value === undefined || value === '') return '—'
    if (typeof value === 'string') return value
    if (typeof value === 'number' || typeof value === 'boolean') return String(value)
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }, [])

  useEffect(() => {
    setCreatorDatasetQuery('')
    setSortieQuery('')
    setSortieError(null)
    setDatasetFeatureDataset('')
    setDatasetFeatureCandidates(null)
    setDatasetFeatureLoading(false)
    setDatasetFeatureError(null)
    setDatasetFeatureInspect(null)
  }, [creatorEditorKey])

  // Load sortie options whenever the editor is open and the query changes (debounced).
  useEffect(() => {
    if (!currentProject || !creatorEditor) return
    const q = sortieQuery
    const t = setTimeout(() => {
      void loadSorties(q)
    }, 250)
    return () => clearTimeout(t)
  }, [creatorEditor, currentProject, loadSorties, sortieQuery])

  const filteredCreatorDatasetOptions = useMemo(() => {
    const q = creatorDatasetQuery.trim().toLowerCase()
    if (!q) return creatorDatasetOptions
    return creatorDatasetOptions.filter((o) => {
      const name = String(o.name ?? '').toLowerCase()
      const type = String(o.type ?? '').toLowerCase()
      return name.includes(q) || type.includes(q)
    })
  }, [creatorDatasetOptions, creatorDatasetQuery])

  useEffect(() => {
    if (!creatorEditor) return
    const vectorNames = creatorEditor.datasets.filter((d) => d.type === 'vector').map((d) => d.name)
    if (vectorNames.length === 0) {
      setDatasetFeatureDataset('')
      setDatasetFeatureCandidates(null)
      setDatasetFeatureInspect(null)
      return
    }
    if (!datasetFeatureDataset || !vectorNames.includes(datasetFeatureDataset)) {
      setDatasetFeatureDataset(vectorNames[0])
      setDatasetFeatureCandidates(null)
      setDatasetFeatureInspect(null)
      setDatasetFeatureError(null)
    }
  }, [creatorEditor, datasetFeatureDataset])
  const demAvailable = Boolean(currentProject && demLayerName)

  useEffect(() => {
    mapModeRef.current = mapMode
  }, [mapMode])

  useEffect(() => {
    creatorToolRef.current = creatorTool
  }, [creatorTool])

  // Keep global header Operator tool state in sync with MapViewer state.
  useEffect(() => {
    setOperatorUiState({
      tool: creatorTool,
      geometryEditActive: creatorGeometryEdit !== null || operatorGeometryCaptureActive
    })
  }, [creatorGeometryEdit, creatorTool, operatorGeometryCaptureActive, setOperatorUiState])

  // Cursor: show a distinct cursor icon while drawing AOI/POI.
  useEffect(() => {
    if (!mapReady || !mapRef.current) return
    const map = mapRef.current
    const canvas = map.getCanvas()

    const desiredCursor =
      mapMode === 'operator' && creatorTool === 'create_poi'
        ? CREATOR_CURSOR_POI
        : mapMode === 'operator' && creatorTool === 'create_aoi'
          ? CREATOR_CURSOR_AOI
          : ''

    if (desiredCursor) {
      canvas.style.cursor = desiredCursor
      creatorCursorAppliedRef.current = true
      return
    }

    if (creatorCursorAppliedRef.current) {
      canvas.style.cursor = ''
      creatorCursorAppliedRef.current = false
    }
  }, [creatorTool, mapMode, mapReady])

  useEffect(() => {
    currentProjectRef.current = currentProject
  }, [currentProject])

  useEffect(() => {
    if (demAvailable && currentProject && demLayerName) {
      const template = getTerrainTileUrl(currentProject, demLayerName)
      if (terrainSamplerRef.current) {
        terrainSamplerRef.current.updateTemplate(template)
      } else {
        terrainSamplerRef.current = new TerrainSampler(template)
      }
      setCursorElevation({ value: null, status: 'idle' })
    } else {
      terrainSamplerRef.current?.dispose()
      terrainSamplerRef.current = null
      setCursorElevation({ value: null, status: 'no-dem' })
    }
  }, [currentProject, demAvailable, demLayerName])

  useEffect(() => {
    return () => {
      terrainSamplerRef.current?.dispose()
    }
  }, [])

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [toast])

  const removeTerrainSource = useCallback(() => {
    const map = mapRef.current
    if (!map) return
    const sourceId = terrainSourceIdRef.current
    if (sourceId && map.getSource(sourceId)) {
      try {
        map.removeSource(sourceId)
      } catch {
        // ignore
      }
    }
    terrainSourceIdRef.current = null
  }, [])

  const ensureTerrainSource = useCallback(() => {
    if (!mapRef.current || !currentProject || !demLayerName) return null
    const map = mapRef.current
    const sourceId = `terrain-${demLayerName}`
    if (!map.getSource(sourceId)) {
      map.addSource(
        sourceId,
        {
          type: 'raster-dem',
          tiles: [getTerrainTileUrl(currentProject, demLayerName)],
          tileSize: 256,
          maxzoom: 14,
          encoding: 'mapbox'
        } as any
      )
    }
    terrainSourceIdRef.current = sourceId
    return sourceId
  }, [currentProject, demLayerName])

  const applySkyBackdrop = useCallback(() => {
    const map = mapRef.current
    if (!map) return

    const getBeforeId = () => {
      const layers = map.getStyle()?.layers
      // Insert before the first non-background layer
      const target = layers?.find(l => l.id !== 'background')
      return target?.id
    }

    const addLayerSafely = (layer: any) => {
      const beforeId = getBeforeId()
      if (beforeId) {
        map.addLayer(layer, beforeId)
      } else {
        map.addLayer(layer)
      }
    }

    const ensureGradientSky = () => {
      if (map.getLayer('sky-gradient-layer')) return
      // Google Earth / ArcGIS style sky gradient
      // Light blue at horizon, deeper blue at zenith
      const skyLayer: any = {
        id: 'sky-gradient-layer',
        type: 'sky',
        paint: {
          'sky-type': 'gradient',
          'sky-gradient': [
            'interpolate',
            ['linear'],
            ['sky-radial-progress'],
            0.0, '#87CEEB',   // Horizon: Sky blue
            0.1, '#7EC8E3',   // Light sky blue
            0.3, '#5DADE2',   // Medium sky blue
            0.5, '#3498DB',   // Deeper blue
            0.7, '#2980B9',   // Rich blue
            0.85, '#1F618D',  // Deep blue
            1.0, '#154360'    // Zenith: Dark blue
          ],
          'sky-gradient-center': [0, 0],
          'sky-gradient-radius': 90,
          'sky-opacity': 1
        }
      }
      addLayerSafely(skyLayer)
    }

    try {
      // Use atmospheric sky gradient
      ensureGradientSky()
      
      // Add fog for atmospheric perspective (subtle haze effect)
      if ((map as any).setFog) {
        ;(map as any).setFog({
          range: [0.5, 10],
          color: 'rgba(186, 210, 235, 0.4)',  // Light blue haze
          'horizon-blend': 0.08,
          'high-color': '#B4D7E8',  // Light sky color at horizon
          'space-color': '#1A5276', // Deep blue for upper atmosphere
          'star-intensity': 0.0     // No stars for daytime sky
        } as any)
      }
    } catch (error) {
      console.warn('Sky backdrop unavailable on this platform:', error)
      ensureGradientSky()
    }
  }, [])

  const setFallbackOpacity = useCallback((opacity: number) => {
    const map = mapRef.current
    if (!map) return
    if (!map.getLayer('basemap-fallback')) return

    const normalized = Math.max(0, Math.min(1, opacity))
    map.setLayoutProperty('basemap-fallback', 'visibility', normalized <= 0.001 ? 'none' : 'visible')
    map.setPaintProperty('basemap-fallback', 'raster-opacity', normalized)
  }, [])

  const resetBasemapFailureTracking = useCallback(() => {
    imageryFailedRef.current = false
    basemapFailureTimestampsRef.current = []
    basemapLastReloadAtRef.current = 0
    if (basemapRecoveryTimerRef.current !== null) {
      window.clearTimeout(basemapRecoveryTimerRef.current)
      basemapRecoveryTimerRef.current = null
    }
    if (basemapStallCheckTimerRef.current !== null) {
      window.clearTimeout(basemapStallCheckTimerRef.current)
      basemapStallCheckTimerRef.current = null
    }
    setFallbackOpacity(BASEMAP_FALLBACK_DEFAULT_OPACITY)
  }, [setFallbackOpacity])

  const removeBasemapLayers = useCallback((options?: { includeFallback?: boolean }) => {
    const map = mapRef.current
    if (!map) return
    const includeFallback = options?.includeFallback ?? false

    const layersToRemove = ['basemap-imagery', 'basemap-reference']
    if (includeFallback) layersToRemove.push('basemap-fallback')

    const sourcesToRemove = ['esriImagery', 'esriLabels']
    if (includeFallback) sourcesToRemove.push('esriLowRes')

    layersToRemove.forEach((layerId) => {
      if (map.getLayer(layerId)) {
        try {
          map.removeLayer(layerId)
        } catch (error) {
          console.warn(`Failed to remove layer ${layerId}`, error)
        }
      }
    })

    sourcesToRemove.forEach((sourceId) => {
      if (map.getSource(sourceId)) {
        try {
          map.removeSource(sourceId)
        } catch (error) {
          console.warn(`Failed to remove source ${sourceId}`, error)
        }
      }
    })
  }, [])

  const addBaseLayers = useCallback(() => {
    const map = mapRef.current
    if (!map) return

    const getBasemapInsertBeforeId = () => {
      const styleLayers = map.getStyle()?.layers ?? []
      for (const layer of styleLayers) {
        const id = String((layer as any)?.id ?? '')
        if (!id) continue
        if (id === 'background') continue
        if (id === 'sky-gradient-layer' || id === 'star-skybox') continue
        if (id === 'basemap-fallback' || id === 'basemap-imagery' || id === 'basemap-reference') continue
        const layerType = String((layer as any)?.type ?? '')
        if (layerType === 'background' || layerType === 'sky') continue
        return id
      }
      return undefined
    }

    const addBasemapLayer = (layerDef: any) => {
      const beforeId = getBasemapInsertBeforeId()
      if (beforeId) map.addLayer(layerDef, beforeId)
      else map.addLayer(layerDef)
    }

    const moveBasemapLayerUnderContent = (layerId: string) => {
      if (!map.getLayer(layerId)) return
      const beforeId = getBasemapInsertBeforeId()
      if (!beforeId) return
      try {
        map.moveLayer(layerId, beforeId)
      } catch {
        // ignore best-effort ordering adjustment
      }
    }

    if (!map.getSource('esriImagery')) {
      map.addSource('esriImagery', {
        type: 'raster',
        tiles: ['https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
        tileSize: 256,
        // Esri World Imagery can return "Map Data not available" placeholder tiles above the
        // highest populated zoom level in some regions. Setting maxzoom makes MapLibre overzoom
        // (scale) the last available tiles instead of requesting missing ones.
        maxzoom: 17,
        attribution: 'Esri, Maxar, Earthstar Geographics'
      })
    }
    if (!map.getSource('esriLabels')) {
      map.addSource('esriLabels', {
        type: 'raster',
        tiles: [
          'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'
        ],
        tileSize: 256,
        // Keep label requests aligned with imagery overzoom behavior.
        maxzoom: 17,
        attribution: 'Esri'
      })
    }
    if (!map.getSource('esriLowRes')) {
      map.addSource('esriLowRes', {
        type: 'raster',
        tiles: ['https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
        tileSize: 256,
        // Always-on low-res substrate for globe rotation. Using a low maxzoom keeps
        // requests light and fills the globe quickly while high-res tiles stream in.
        maxzoom: BASEMAP_LOWRES_MAXZOOM,
        attribution: 'Esri, Maxar, Earthstar Geographics'
      })
    }

    if (!map.getLayer('basemap-fallback')) {
      addBasemapLayer({
        id: 'basemap-fallback',
        type: 'raster',
        source: 'esriLowRes',
        paint: { 'raster-opacity': BASEMAP_FALLBACK_DEFAULT_OPACITY }
      })
    }
    if (!map.getLayer('basemap-imagery')) {
      addBasemapLayer({
        id: 'basemap-imagery',
        type: 'raster',
        source: 'esriImagery'
      })
    }
    if (!map.getLayer('basemap-reference')) {
      addBasemapLayer({
        id: 'basemap-reference',
        type: 'raster',
        source: 'esriLabels',
        paint: {
          'raster-opacity': 0.8
        }
      })
    }

    // Keep basemap under project overlays even after recovery re-adds.
    moveBasemapLayerUnderContent('basemap-fallback')
    moveBasemapLayerUnderContent('basemap-imagery')
    moveBasemapLayerUnderContent('basemap-reference')

    // Ensure visibility
    map.setLayoutProperty('basemap-fallback', 'visibility', 'visible')
    map.setLayoutProperty('basemap-imagery', 'visibility', 'visible')
    map.setLayoutProperty('basemap-reference', 'visibility', 'visible')
    map.setPaintProperty('basemap-imagery', 'raster-opacity', 1)
    map.setPaintProperty('basemap-imagery', 'raster-fade-duration', 400)
    map.setPaintProperty('basemap-reference', 'raster-opacity', 0.8)
    setFallbackOpacity(imageryFailedRef.current ? BASEMAP_FALLBACK_FAILURE_OPACITY : BASEMAP_FALLBACK_DEFAULT_OPACITY)
    applySkyBackdrop()
  }, [applySkyBackdrop, setFallbackOpacity])

  const scheduleBasemapRecovery = useCallback(() => {
    if (basemapRecoveryTimerRef.current !== null) {
      window.clearTimeout(basemapRecoveryTimerRef.current)
    }

    basemapRecoveryTimerRef.current = window.setTimeout(() => {
      basemapRecoveryTimerRef.current = null
      const map = mapRef.current
      if (!map) return

      const imageryLoaded = map.isSourceLoaded('esriImagery')
      const labelsLoaded = map.isSourceLoaded('esriLabels')
      if (imageryLoaded && labelsLoaded) {
        imageryFailedRef.current = false
        basemapFailureTimestampsRef.current = []
        setFallbackOpacity(BASEMAP_FALLBACK_DEFAULT_OPACITY)
      }
    }, BASEMAP_RECOVERY_DEBOUNCE_MS)
  }, [setFallbackOpacity])

  const refreshBasemapIfStalled = useCallback(() => {
    const map = mapRef.current
    if (!map) return
    if (!imageryFailedRef.current) return
    if (map.isMoving()) return
    const imageryLoaded = map.isSourceLoaded('esriImagery')
    const labelsLoaded = map.isSourceLoaded('esriLabels')
    if (imageryLoaded && labelsLoaded) return

    const now = Date.now()
    if (now - basemapLastReloadAtRef.current < BASEMAP_STALL_RELOAD_COOLDOWN_MS) {
      map.triggerRepaint()
      return
    }

    basemapLastReloadAtRef.current = now
    removeBasemapLayers()
    addBaseLayers()
    scheduleBasemapRecovery()
  }, [addBaseLayers, removeBasemapLayers, scheduleBasemapRecovery])

  const scheduleBasemapStallCheck = useCallback(() => {
    if (!imageryFailedRef.current) {
      if (basemapStallCheckTimerRef.current !== null) {
        window.clearTimeout(basemapStallCheckTimerRef.current)
        basemapStallCheckTimerRef.current = null
      }
      return
    }

    if (basemapStallCheckTimerRef.current !== null) {
      window.clearTimeout(basemapStallCheckTimerRef.current)
    }

    basemapStallCheckTimerRef.current = window.setTimeout(() => {
      basemapStallCheckTimerRef.current = null
      refreshBasemapIfStalled()
    }, BASEMAP_STALL_CHECK_MS)
  }, [refreshBasemapIfStalled])

  const handleBasemapFailure = useCallback(() => {
    const now = Date.now()
    const cutoff = now - BASEMAP_FAILURE_WINDOW_MS
    const recentFailures = basemapFailureTimestampsRef.current.filter((ts) => ts >= cutoff)
    recentFailures.push(now)
    basemapFailureTimestampsRef.current = recentFailures

    // Do not flip to fallback on single transient tile failures.
    if (recentFailures.length < BASEMAP_FAILURE_THRESHOLD) return

    imageryFailedRef.current = true
    setFallbackOpacity(BASEMAP_FALLBACK_FAILURE_OPACITY)
  }, [setFallbackOpacity])

  /**
   * Initialize MapLibre map instance (client side only)
   */
  useEffect(() => {
    let cancelled = false

    const initializeMap = async () => {
      if (mapRef.current || !mapContainerRef.current) {
        return
      }

      try {
        const maplibreModule = await import('maplibre-gl')
        if (cancelled) return

        const savedViewport = restoreViewport()

        const mapOptions: MapOptions & { fieldOfView?: number } = {
          container: mapContainerRef.current,
          style: {
            version: 8,
            sources: {},
            layers: [
              {
                id: 'background',
                type: 'background',
                paint: {
                  'background-color': '#87CEEB'  // Sky blue - matches horizon color
                }
              }
            ],
            glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf' // Ensure glyphs are available if needed
          },
          center: savedViewport.center,
          zoom: savedViewport.zoom,
          bearing: savedViewport.bearing,
          pitch: savedViewport.pitch,
          maxPitch: 85,
          fieldOfView: (85 * Math.PI) / 180,
          attributionControl: false,
          canvasContextAttributes: {
            failIfMajorPerformanceCaveat: false,
            preserveDrawingBuffer: false,
            antialias: true // Enable antialias for better quality
          }
        }

        const mapInstance = new maplibreModule.Map(mapOptions as MapOptions)

        // Workaround: @mapbox/mapbox-gl-draw passes an unsupported 3rd options arg
        // (e.g. { passive: true }) to map.on() which MapLibre v5 does not accept,
        // causing crashes on touch devices. Wrap map.on to silently drop the extra arg.
        const origOn = mapInstance.on.bind(mapInstance) as (...args: any[]) => any
        ;(mapInstance as any).on = (type: any, layerOrFn: any, fn?: any, opts?: any) => {
          if (typeof fn === 'function') return origOn(type, layerOrFn, fn)
          return origOn(type, layerOrFn)
        }

        mapInstance.on('load', () => {
          if (cancelled) return
          addBaseLayers()
          setMapReady(true)
          setMapLoaded(true)
        })

        mapInstance.on('zoom', () => {
          setZoom(Number(mapInstance.getZoom().toFixed(1)))
        })

        mapInstance.on('dataloading', () => setIsBuffering(true))
        mapInstance.on('idle', () => {
          setIsBuffering(false)
          scheduleBasemapRecovery()
        })
        mapInstance.on('movestart', () => {
          if (basemapStallCheckTimerRef.current !== null) {
            window.clearTimeout(basemapStallCheckTimerRef.current)
            basemapStallCheckTimerRef.current = null
          }
        })

        // Persist viewport to localStorage after every pan/zoom/rotate settles
        mapInstance.on('moveend', () => {
          const c = mapInstance.getCenter()
          saveViewport({
            center: [c.lng, c.lat],
            zoom: mapInstance.getZoom(),
            bearing: mapInstance.getBearing(),
            pitch: mapInstance.getPitch()
          })
          scheduleBasemapStallCheck()
          mapInstance.triggerRepaint()
        })

        mapInstance.on('error', (event) => {
          const e = event as any
          if (e?.sourceId && (e.sourceId === 'esriImagery' || e.sourceId === 'esriLabels')) {
            handleBasemapFailure()
            scheduleBasemapStallCheck()
          }
        })

        mapInstance.on('sourcedata', (event) => {
          const e = event as any
          if (!e?.isSourceLoaded) return
          if (e.sourceId === 'esriImagery' || e.sourceId === 'esriLabels') {
            if (basemapStallCheckTimerRef.current !== null) {
              window.clearTimeout(basemapStallCheckTimerRef.current)
              basemapStallCheckTimerRef.current = null
            }
            scheduleBasemapRecovery()
          }
        })

        // Keep the scale indicator, but omit other built-in MapLibre controls for this view.
        mapInstance.addControl(
          new maplibreModule.ScaleControl({
            maxWidth: 200,
            unit: 'metric'
          }),
          'bottom-right'
        )

        // Ensure expected interactions: left = pan, middle = rotate (custom), right = zoom (custom)
        // Keep a slight inertia so camera motion eases out instead of stopping abruptly.
        mapInstance.dragPan.enable({
          linearity: 0.2,
          maxSpeed: 900,
          deceleration: 3000
        } as any)
        mapInstance.dragRotate.disable()

        mapRef.current = mapInstance
      } catch (error) {
        console.error('Failed to initialize MapLibre map:', error)
      }
    }

    initializeMap()

    return () => {
      cancelled = true
      if (basemapRecoveryTimerRef.current !== null) {
        window.clearTimeout(basemapRecoveryTimerRef.current)
        basemapRecoveryTimerRef.current = null
      }
      if (basemapStallCheckTimerRef.current !== null) {
        window.clearTimeout(basemapStallCheckTimerRef.current)
        basemapStallCheckTimerRef.current = null
      }
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
    }
  }, [addBaseLayers, handleBasemapFailure, scheduleBasemapRecovery, scheduleBasemapStallCheck])

  /**
   * Handle container resizing to update map dimensions
   */
  useEffect(() => {
    if (!mapContainerRef.current) return

    const observer = new ResizeObserver(() => {
      if (mapRef.current) {
        mapRef.current.resize()
      }
    })
    observer.observe(mapContainerRef.current)

    return () => {
      observer.disconnect()
    }
  }, [mapReady])

  /**
   * Remove dynamically added layers and sources (vectors/rasters)
   */
  const clearDynamicLayers = useCallback(() => {
    const map = mapRef.current
    if (!map) return

    const layerIds = [...dynamicLayerIdsRef.current]
    const sourceIds = [...new Set(dynamicSourceIdsRef.current)]

    const removeLayerSafely = (layerId: string) => {
      if (!map.getLayer(layerId)) return
      try {
        map.removeLayer(layerId)
      } catch (error) {
        console.warn(`Failed to remove layer ${layerId}`, error)
      }
    }

    const removeSourceSafely = (sourceId: string) => {
      if (!map.getSource(sourceId)) return
      try {
        map.removeSource(sourceId)
      } catch (error) {
        console.warn(`Failed to remove source ${sourceId}`, error)
      }
    }

    // Remove known dynamic layers first (reverse order to respect style dependencies).
    for (const layerId of layerIds.reverse()) {
      removeLayerSafely(layerId)
    }

    // If the dynamic layer/source refs got out of sync (e.g., due to an async race),
    // make a best-effort pass to remove any remaining layers that still reference
    // our dynamic sources before removing those sources.
    for (const sourceId of sourceIds) {
      const dependentLayerIds =
        map
          .getStyle()
          ?.layers?.filter((layer: any) => layer?.source === sourceId)
          .map((layer: any) => String(layer.id)) ?? []

      for (const dependentLayerId of dependentLayerIds.reverse()) {
        removeLayerSafely(dependentLayerId)
      }
    }

    for (const sourceId of sourceIds) {
      removeSourceSafely(sourceId)
    }

    dynamicLayerIdsRef.current = []
    dynamicSourceIdsRef.current = []
  }, [])

  // ============================================================================
  // Operator Mode helpers
  // ============================================================================

  const getGeometryAnchorLngLat = useCallback((geometry: GeoJSON.Geometry): { lng: number; lat: number } | null => {
    const type = geometry?.type
    const coords: any = (geometry as any)?.coordinates
    if (!type || coords === undefined) return null

    if (type === 'Point' && Array.isArray(coords) && coords.length >= 2) {
      return { lng: Number(coords[0]), lat: Number(coords[1]) }
    }

    const pts: Array<{ lng: number; lat: number }> = []
    const walk = (node: any) => {
      if (Array.isArray(node) && node.length >= 2 && typeof node[0] === 'number' && typeof node[1] === 'number') {
        pts.push({ lng: node[0], lat: node[1] })
        return
      }
      if (Array.isArray(node)) {
        node.forEach(walk)
      }
    }
    walk(coords)
    if (pts.length === 0) return null

    const lngs = pts.map(p => p.lng)
    const lats = pts.map(p => p.lat)
    const minLng = Math.min(...lngs)
    const maxLng = Math.max(...lngs)
    const minLat = Math.min(...lats)
    const maxLat = Math.max(...lats)
    return { lng: (minLng + maxLng) / 2, lat: (minLat + maxLat) / 2 }
  }, [])

  const getGeometryConfirmLngLat = useCallback((geometry: GeoJSON.Geometry): { lng: number; lat: number } | null => {
    const type = geometry?.type
    const coords: any = (geometry as any)?.coordinates
    if (!type || coords === undefined) return null

    if (type === 'Point' && Array.isArray(coords) && coords.length >= 2) {
      return { lng: Number(coords[0]), lat: Number(coords[1]) }
    }

    // For AOI polygons, anchor near the last vertex (not the centroid).
    if (type === 'Polygon' && Array.isArray(coords) && Array.isArray(coords[0]) && coords[0].length >= 2) {
      const ring = coords[0]
      const first = ring[0]
      const last = ring[ring.length - 1]
      let idx = ring.length - 1
      if (
        Array.isArray(first) &&
        Array.isArray(last) &&
        first.length >= 2 &&
        last.length >= 2 &&
        first[0] === last[0] &&
        first[1] === last[1] &&
        ring.length >= 2
      ) {
        idx = ring.length - 2
      }
      const pt = ring[idx]
      if (Array.isArray(pt) && pt.length >= 2) return { lng: Number(pt[0]), lat: Number(pt[1]) }
    }

    // Fallback: last coordinate pair encountered.
    let lastPair: { lng: number; lat: number } | null = null
    const walk = (node: any) => {
      if (Array.isArray(node) && node.length >= 2 && typeof node[0] === 'number' && typeof node[1] === 'number') {
        lastPair = { lng: Number(node[0]), lat: Number(node[1]) }
        return
      }
      if (Array.isArray(node)) node.forEach(walk)
    }
    walk(coords)
    return lastPair
  }, [])

  const getPopoverAnchorFromGeometry = useCallback(
    (geometry: GeoJSON.Geometry): { x: number; y: number } | null => {
      const map = mapRef.current
      const container = mapContainerRef.current
      if (!map || !container) return null
      const center = getGeometryAnchorLngLat(geometry)
      if (!center) return null
      const projected = map.project([center.lng, center.lat] as any)
      const rect = container.getBoundingClientRect()
      return { x: rect.left + projected.x, y: rect.top + projected.y }
    },
    [getGeometryAnchorLngLat]
  )

  const getConfirmPopoverAnchorFromGeometry = useCallback(
    (geometry: GeoJSON.Geometry): { x: number; y: number } | null => {
      const map = mapRef.current
      const container = mapContainerRef.current
      if (!map || !container) return null
      const anchor = getGeometryConfirmLngLat(geometry)
      if (!anchor) return null
      const projected = map.project([anchor.lng, anchor.lat] as any)
      const rect = container.getBoundingClientRect()
      return { x: rect.left + projected.x, y: rect.top + projected.y }
    },
    [getGeometryConfirmLngLat]
  )

  const getSafeCreatorConfirmPosition = useCallback((x: number, y: number): { x: number; y: number } => {
    if (typeof window === 'undefined') return { x, y }
    const vw = window.innerWidth
    const vh = window.innerHeight
    const margin = 12
    const width = 300
    const height = 220

    // Default: open to the right/below the click.
    let nextX = x + 10
    let nextY = y + 10

    // Flip to the left if we'd overflow right edge.
    if (nextX + width + margin > vw) {
      nextX = x - width - 10
    }
    nextX = Math.max(margin, Math.min(nextX, vw - width - margin))

    // Clamp vertically (best-effort; height is approximate).
    nextY = Math.max(margin, Math.min(nextY, vh - height - margin))
    return { x: Math.round(nextX), y: Math.round(nextY) }
  }, [])

  // Keep the Operator entry popover fully on-screen.
  // Default behavior is "open to the right of the cursor", but if we're too close to the right edge,
  // we flip to open to the left of the cursor to avoid being cut off.
  const getSafeCreatorPopoverPosition = useCallback((x: number, y: number): { x: number; y: number } => {
    if (typeof window === 'undefined') return { x, y }
    const vw = window.innerWidth
    const vh = window.innerHeight
    const margin = 12

    // Matches popover styling: `w-[420px] max-w-[92vw]`
    const popoverWidth = Math.min(420, Math.floor(vw * 0.92))

    let nextX = x
    if (nextX + popoverWidth + margin > vw) {
      nextX = x - popoverWidth
    }
    nextX = Math.max(margin, Math.min(nextX, vw - popoverWidth - margin))

    // Only clamp top so it never renders off-screen above; height is dynamic so we avoid guessing bottom.
    const nextY = Math.max(margin, Math.min(y, vh - margin))

    return { x: nextX, y: nextY }
  }, [])

  // After the Operator create/edit popover renders, nudge it back on-screen if it would overflow
  // the viewport top/bottom (common when opening near screen edges on smaller displays).
  useLayoutEffect(() => {
    if (!creatorEditor) return
    const el = creatorPopoverRef.current
    if (!el || typeof window === 'undefined') return

    const margin = 12
    const rect = el.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight

    // Compute the final clamped position in one pass (idempotent).
    // This avoids infinite loops when animations/transforms cause tiny layout oscillations.
    const minX = margin
    const maxX = Math.max(minX, vw - rect.width - margin)
    const minY = margin
    const maxY = Math.max(minY, vh - rect.height - margin)

    setCreatorEditor((prev) => {
      if (!prev) return prev
      // Only apply to the currently open editor (avoid racing async loads).
      if (creatorEditor.entryId && prev.entryId && creatorEditor.entryId !== prev.entryId) return prev
      if (creatorEditor.mode !== prev.mode) return prev

      const nextX = Math.round(Math.max(minX, Math.min(prev.x, maxX)))
      const nextY = Math.round(Math.max(minY, Math.min(prev.y, maxY)))

      if (nextX === Math.round(prev.x) && nextY === Math.round(prev.y)) return prev
      return { ...prev, x: nextX, y: nextY }
    })
    // Important: do NOT depend on `creatorEditor.x/y` to avoid self-triggered loops.
  }, [creatorEditor?.entryId, creatorEditor?.loading, creatorEditor?.mode, creatorEditor?.section])

  // Same idea for the right-click context menu so it doesn't get cut off by top/bottom edges.
  useLayoutEffect(() => {
    if (!contextMenu) return
    const el = contextMenuRef.current
    if (!el || typeof window === 'undefined') return

    const margin = 12
    const rect = el.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight

    const minX = margin
    const maxX = Math.max(minX, vw - rect.width - margin)
    const minY = margin
    const maxY = Math.max(minY, vh - rect.height - margin)

    setContextMenu((prev) => {
      if (!prev) return prev
      const nextX = Math.round(Math.max(minX, Math.min(prev.x, maxX)))
      const nextY = Math.round(Math.max(minY, Math.min(prev.y, maxY)))
      if (nextX === Math.round(prev.x) && nextY === Math.round(prev.y)) return prev
      return { ...prev, x: nextX, y: nextY }
    })
  }, [contextMenu?.lat, contextMenu?.lng])

  // Make the Operator AOI/POI popover draggable by its header.
  useEffect(() => {
    const handleMove = (e: PointerEvent) => {
      const s = creatorPopoverDragRef.current
      if (!s) return
      if (e.pointerId !== s.pointerId) return
      if (typeof window === 'undefined') return

      const margin = 12
      const vw = window.innerWidth
      const vh = window.innerHeight

      const dx = e.clientX - s.startClientX
      const dy = e.clientY - s.startClientY

      let nextX = s.startX + dx
      let nextY = s.startY + dy

      const maxX = Math.max(margin, vw - s.width - margin)
      const maxY = Math.max(margin, vh - s.height - margin)

      nextX = Math.max(margin, Math.min(nextX, maxX))
      nextY = Math.max(margin, Math.min(nextY, maxY))

      setCreatorEditor((prev) => (prev ? { ...prev, x: Math.round(nextX), y: Math.round(nextY) } : prev))
    }

    const handleUp = (e: PointerEvent) => {
      const s = creatorPopoverDragRef.current
      if (!s) return
      if (e.pointerId !== s.pointerId) return
      creatorPopoverDragRef.current = null
    }

    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    window.addEventListener('pointercancel', handleUp)
    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
      window.removeEventListener('pointercancel', handleUp)
    }
  }, [])

  // Make the small Operator geometry confirmation popover draggable by its header.
  useEffect(() => {
    const handleMove = (e: PointerEvent) => {
      const s = creatorGeometryConfirmDragRef.current
      if (!s) return
      if (e.pointerId !== s.pointerId) return
      if (typeof window === 'undefined') return

      const margin = 12
      const vw = window.innerWidth
      const vh = window.innerHeight

      const dx = e.clientX - s.startClientX
      const dy = e.clientY - s.startClientY

      let nextX = s.startX + dx
      let nextY = s.startY + dy

      const maxX = Math.max(margin, vw - s.width - margin)
      const maxY = Math.max(margin, vh - s.height - margin)

      nextX = Math.max(margin, Math.min(nextX, maxX))
      nextY = Math.max(margin, Math.min(nextY, maxY))

      setCreatorGeometryConfirm((prev) => (prev ? { ...prev, x: Math.round(nextX), y: Math.round(nextY) } : prev))
    }

    const handleUp = (e: PointerEvent) => {
      const s = creatorGeometryConfirmDragRef.current
      if (!s) return
      if (e.pointerId !== s.pointerId) return
      creatorGeometryConfirmDragRef.current = null
    }

    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    window.addEventListener('pointercancel', handleUp)
    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
      window.removeEventListener('pointercancel', handleUp)
    }
  }, [])

  const handleCreatorPopoverHeaderPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!creatorEditor) return
    if (e.button !== 0) return

    const target = e.target as HTMLElement | null
    // Don't start a drag when interacting with controls inside the header.
    if (target?.closest('button, a, input, select, textarea, [data-no-drag]')) return

    e.preventDefault()
    e.stopPropagation()

    const rect = creatorPopoverRef.current?.getBoundingClientRect()
    const fallbackWidth = typeof window !== 'undefined' ? Math.min(420, Math.floor(window.innerWidth * 0.92)) : 420
    const width = rect?.width ?? fallbackWidth
    const height = rect?.height ?? 320

    creatorPopoverDragRef.current = {
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startX: creatorEditor.x,
      startY: creatorEditor.y,
      width,
      height
    }

    // Best-effort pointer capture so drag keeps working even if the cursor leaves the header.
    try {
      ;(e.currentTarget as any).setPointerCapture?.(e.pointerId)
    } catch {
      // ignore
    }
  }, [creatorEditor])

  const openCreatorCreateEditor = useCallback(
    (entryType: CreatorEntryType, geometryWgs84: GeoJSON.Geometry) => {
      const anchor = getPopoverAnchorFromGeometry(geometryWgs84) ?? {
        x: Math.round(window.innerWidth * 0.5),
        y: Math.round(window.innerHeight * 0.25)
      }
      const safe = getSafeCreatorPopoverPosition(anchor.x, anchor.y)
      setCreatorEditor({
        mode: 'create',
        section: 'info',
        x: safe.x,
        y: safe.y,
        entryType,
        geometryWgs84,
        title: '',
        category: 'Engineering',
        categoryOther: '',
        comment: '',
        datasets: [],
        datasetFeatures: [],
        sortie: null,
        survey: { category_fields: {} },
        existingAttachments: [],
        removedAttachments: [],
        newFiles: [],
        loading: false,
        saving: false,
        error: null,
        changelogOpen: false,
        changelog: null
      })
    },
    [getPopoverAnchorFromGeometry, getSafeCreatorPopoverPosition]
  )

  const handleCreatorGeometryConfirmHeaderPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!creatorGeometryConfirm) return
    if (e.button !== 0) return

    const target = e.target as HTMLElement | null
    // Don't start a drag when interacting with controls inside the header.
    if (target?.closest('button, a, input, select, textarea, [data-no-drag]')) return

    e.preventDefault()
    e.stopPropagation()

    const rect = creatorGeometryConfirmPopoverRef.current?.getBoundingClientRect()
    const width = rect?.width ?? 300
    const height = rect?.height ?? 220

    creatorGeometryConfirmDragRef.current = {
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startX: creatorGeometryConfirm.x,
      startY: creatorGeometryConfirm.y,
      width,
      height
    }

    // Best-effort pointer capture so drag keeps working even if the cursor leaves the header.
    try {
      ;(e.currentTarget as any).setPointerCapture?.(e.pointerId)
    } catch {
      // ignore
    }
  }, [creatorGeometryConfirm])

  const handleCancelCreatorGeometryConfirm = useCallback(() => {
    const map = mapRef.current
    const draw = creatorDrawRef.current
    if (map && creatorDrawCreateHandlerRef.current) {
      map.off('draw.create', creatorDrawCreateHandlerRef.current as any)
      creatorDrawCreateHandlerRef.current = null
    }
    draw?.deleteAll()
    creatorGeometryConfirmDragRef.current = null
    setCreatorGeometryConfirm(null)
    creatorInteractionLockRef.current = false
    setCreatorTool('none')
  }, [])

  const handleConfirmCreatorGeometryConfirm = useCallback(() => {
    if (!creatorGeometryConfirm) return
    const { entryType, geometryWgs84 } = creatorGeometryConfirm
    setCreatorGeometryConfirm(null)
    openCreatorCreateEditor(entryType, geometryWgs84)
  }, [creatorGeometryConfirm, openCreatorCreateEditor])

  useEffect(() => {
    if (!creatorGeometryConfirm) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleCancelCreatorGeometryConfirm()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [creatorGeometryConfirm, handleCancelCreatorGeometryConfirm])

  const openCreatorEditEditor = useCallback(
    async (entryId: string, x: number, y: number) => {
      if (!currentProject) return
      const safe = getSafeCreatorPopoverPosition(x, y)
      setCreatorEditor({
        mode: 'edit',
        section: 'info',
        x: safe.x,
        y: safe.y,
        entryId,
        entryType: 'POI',
        geometryWgs84: { type: 'Point', coordinates: [0, 0] } as any,
        title: '',
        category: 'Engineering',
        categoryOther: '',
        comment: '',
        datasets: [],
        datasetFeatures: [],
        sortie: null,
        survey: { category_fields: {} },
        existingAttachments: [],
        removedAttachments: [],
        newFiles: [],
        loading: true,
        saving: false,
        error: null,
        changelogOpen: false,
        changelog: null
      })

      try {
        const entry = await getCreatorEntry(currentProject, entryId)
        setCreatorEditor((prev) => {
          if (!prev || prev.entryId !== entryId) return prev
          return {
            ...prev,
            loading: false,
            entryType: entry.type,
            geometryWgs84: entry.geometry_wgs84,
            title: entry.title ?? '',
            category: entry.category ?? 'Engineering',
            categoryOther: entry.category_other ?? '',
            // In edit mode, `comment` is treated as a "new post" draft. We do NOT preload it.
            comment: '',
            datasets: Array.isArray((entry as any).datasets) ? ((entry as any).datasets as CreatorDatasetRef[]) : [],
            datasetFeatures: Array.isArray((entry as any).dataset_features)
              ? ((entry as any).dataset_features as CreatorDatasetFeatureSelection[])
              : [],
            survey: ((entry as any).survey && typeof (entry as any).survey === 'object'
              ? ((entry as any).survey as CreatorSurvey)
              : { category_fields: {} }),
            existingAttachments: entry.attachments ?? [],
            removedAttachments: [],
            newFiles: [],
            error: null
          }
        })

        // Load thread history (creator changelog) for this entry.
        try {
          const rows = await getCreatorEntryChangelog(currentProject, entryId)
          const list = Array.isArray(rows) ? rows : []

          // Use the latest record that has sortie/survey/dataset_features snapshots (not necessarily the last record).
          let lastSortie: any = null
          let lastSurvey: any = null
          let lastDatasetFeatures: any = null
          for (let i = list.length - 1; i >= 0; i--) {
            const rec = list[i] as any
            if (!lastSortie && rec?.sortie) lastSortie = rec.sortie
            if (!lastSurvey && rec?.survey) lastSurvey = rec.survey
            if (!lastDatasetFeatures && rec?.dataset_features) lastDatasetFeatures = rec.dataset_features
            if (lastSortie && lastSurvey && lastDatasetFeatures) break
          }

          const sortieRef =
            lastSortie && typeof lastSortie === 'object' && typeof (lastSortie as any).id === 'string' && typeof (lastSortie as any).code === 'string'
              ? { id: String((lastSortie as any).id), code: String((lastSortie as any).code), name: (lastSortie as any).name ?? null }
              : null
          const surveyRef =
            lastSurvey && typeof lastSurvey === 'object'
              ? (lastSurvey as CreatorSurvey)
              : null
          const datasetFeaturesRef =
            Array.isArray(lastDatasetFeatures) ? (lastDatasetFeatures as CreatorDatasetFeatureSelection[]) : null
          setCreatorEditor((prev) => {
            if (!prev || prev.entryId !== entryId) return prev
            return {
              ...prev,
              changelog: list,
              sortie: sortieRef ?? prev.sortie,
              survey: surveyRef ?? prev.survey,
              datasetFeatures: datasetFeaturesRef ?? prev.datasetFeatures
            }
          })
        } catch {
          setCreatorEditor((prev) => {
            if (!prev || prev.entryId !== entryId) return prev
            return { ...prev, changelog: [] }
          })
        }
      } catch (error) {
        setCreatorEditor((prev) => {
          if (!prev || prev.entryId !== entryId) return prev
          return {
            ...prev,
            loading: false,
            error: error instanceof Error ? error.message : 'Failed to load Operator entry.'
          }
        })
      }
    },
    [currentProject, getSafeCreatorPopoverPosition]
  )

  useEffect(() => {
    openCreatorEditEditorRef.current = (entryId: string, x: number, y: number) => {
      void openCreatorEditEditor(entryId, x, y)
    }
  }, [openCreatorEditEditor])

  const ensureCreatorLayers = useCallback(
    (featureCollection: GeoJSON.FeatureCollection) => {
      const map = mapRef.current
      if (!map) return

      const existing = map.getSource(CREATOR_SOURCE_ID) as any
      if (existing?.setData) {
        existing.setData(featureCollection as any)
      } else {
        map.addSource(CREATOR_SOURCE_ID, {
          type: 'geojson',
          data: featureCollection as any
        })
        dynamicSourceIdsRef.current.push(CREATOR_SOURCE_ID)
      }

      const ensureLayer = (id: string, layer: any) => {
        if (!map.getLayer(id)) {
          map.addLayer(layer)
          dynamicLayerIdsRef.current.push(id)
        }
      }

      ensureLayer(CREATOR_LAYER_FILL_ID, {
        id: CREATOR_LAYER_FILL_ID,
        type: 'fill',
        source: CREATOR_SOURCE_ID,
        filter: ['==', '$type', 'Polygon'],
        paint: {
          'fill-color': '#f59e0b',
          'fill-opacity': 0.25,
          'fill-outline-color': '#f59e0b'
        }
      })

      ensureLayer(CREATOR_LAYER_LINE_ID, {
        id: CREATOR_LAYER_LINE_ID,
        type: 'line',
        source: CREATOR_SOURCE_ID,
        filter: ['==', '$type', 'Polygon'],
        paint: {
          'line-color': '#f59e0b',
          'line-width': 2,
          'line-opacity': 0.9
        }
      })

      ensureLayer(CREATOR_LAYER_POINT_ID, {
        id: CREATOR_LAYER_POINT_ID,
        type: 'circle',
        source: CREATOR_SOURCE_ID,
        filter: ['==', '$type', 'Point'],
        paint: {
          'circle-radius': 6,
          'circle-color': '#f59e0b',
          'circle-stroke-width': 2,
          'circle-stroke-color': '#000000',
          'circle-opacity': 0.9
        }
      })

      if (!creatorLayerHandlersAttachedRef.current) {
        creatorLayerHandlersAttachedRef.current = true

        const setPointer = () => {
          if (mapModeRef.current !== 'operator') return
          if (creatorToolRef.current !== 'none') return
          map.getCanvas().style.cursor = 'pointer'
        }
        const unsetPointer = () => {
          if (creatorToolRef.current !== 'none') return
          map.getCanvas().style.cursor = ''
        }

        const handleClick = (e: any) => {
          if (mapModeRef.current !== 'operator') return
          if (!currentProjectRef.current) return
          const feature = e?.features?.[0]
          const entryId = feature?.properties?.creator_id ?? feature?.id
          if (!entryId) return
          const original = e.originalEvent as MouseEvent | undefined
          const x = original?.clientX ?? 0
          const y = original?.clientY ?? 0
          openCreatorEditEditorRef.current(String(entryId), x, y)
        }

        map.on('mouseenter', CREATOR_LAYER_FILL_ID, setPointer)
        map.on('mouseleave', CREATOR_LAYER_FILL_ID, unsetPointer)
        map.on('mouseenter', CREATOR_LAYER_LINE_ID, setPointer)
        map.on('mouseleave', CREATOR_LAYER_LINE_ID, unsetPointer)
        map.on('mouseenter', CREATOR_LAYER_POINT_ID, setPointer)
        map.on('mouseleave', CREATOR_LAYER_POINT_ID, unsetPointer)

        map.on('click', CREATOR_LAYER_FILL_ID, handleClick)
        map.on('click', CREATOR_LAYER_LINE_ID, handleClick)
        map.on('click', CREATOR_LAYER_POINT_ID, handleClick)
      }
    },
    []
  )

  const ensureSortiePreviewLayers = useCallback((featureCollection: GeoJSON.FeatureCollection) => {
    const map = mapRef.current
    if (!map) return

    const existing = map.getSource(SORTIE_PREVIEW_SOURCE_ID) as any
    if (existing?.setData) {
      existing.setData(featureCollection as any)
    } else {
      map.addSource(SORTIE_PREVIEW_SOURCE_ID, {
        type: 'geojson',
        data: featureCollection as any
      })
    }

    const ensureLayer = (id: string, layer: any) => {
      if (!map.getLayer(id)) {
        map.addLayer(layer)
      }
    }

    // Polygon/area preview
    ensureLayer(SORTIE_PREVIEW_LAYER_FILL_ID, {
      id: SORTIE_PREVIEW_LAYER_FILL_ID,
      type: 'fill',
      source: SORTIE_PREVIEW_SOURCE_ID,
      filter: ['in', '$type', 'Polygon', 'MultiPolygon'],
      paint: {
        'fill-color': '#10b981',
        'fill-opacity': 0.18,
        'fill-outline-color': '#10b981'
      }
    })

    // Line (polygons + line strings)
    ensureLayer(SORTIE_PREVIEW_LAYER_LINE_ID, {
      id: SORTIE_PREVIEW_LAYER_LINE_ID,
      type: 'line',
      source: SORTIE_PREVIEW_SOURCE_ID,
      filter: ['in', '$type', 'Polygon', 'MultiPolygon', 'LineString', 'MultiLineString'],
      paint: {
        'line-color': '#10b981',
        'line-width': 3,
        'line-opacity': 0.95
      }
    })

    // Point preview
    ensureLayer(SORTIE_PREVIEW_LAYER_POINT_ID, {
      id: SORTIE_PREVIEW_LAYER_POINT_ID,
      type: 'circle',
      source: SORTIE_PREVIEW_SOURCE_ID,
      filter: ['in', '$type', 'Point', 'MultiPoint'],
      paint: {
        'circle-radius': 7,
        'circle-color': '#10b981',
        'circle-stroke-width': 2,
        'circle-stroke-color': '#000000',
        'circle-opacity': 0.95
      }
    })

    // Keep it above other content; order matters (fill -> line -> point).
    ;[SORTIE_PREVIEW_LAYER_FILL_ID, SORTIE_PREVIEW_LAYER_LINE_ID, SORTIE_PREVIEW_LAYER_POINT_ID].forEach((layerId) => {
      if (map.getLayer(layerId)) {
        map.moveLayer(layerId)
      }
    })
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded) return

    const hasSource = Boolean(map.getSource(SORTIE_PREVIEW_SOURCE_ID))
    const shouldShow = Boolean(sortiePreviewGeometry)
    if (!shouldShow && !hasSource) return

    const fc = shouldShow ? geometryToFeatureCollection(sortiePreviewGeometry) : ({ type: 'FeatureCollection', features: [] } as any)
    ensureSortiePreviewLayers(fc)
  }, [ensureSortiePreviewLayers, mapLoaded, mapMode, sortiePreviewGeometry])

  const refreshCreatorLayer = useCallback(async () => {
    if (!currentProject) return
    try {
      const fc = await fetchCreatorGeoJSON(currentProject)
      ensureCreatorLayers(fc as any)
      const bounds = getGeoJSONBounds(fc as any)
      const count = (fc as any)?.features?.length ?? 0

      const rows = (fc as any)?.features?.map((f: any) => {
        const props = f?.properties || {}
        return {
          ID: props.creator_id ?? f.id ?? '',
          Type: props.creator_type ?? '',
          Title: props.title ?? '',
          Category: props.category ?? '',
          Status: props.status ?? ''
        }
      }) ?? []

      const detail: VectorDetail = {
        properties: ['ID', 'Type', 'Title', 'Category', 'Status'],
        sample: rows.slice(0, 25),
        rows,
        features: (fc as any)?.features ?? []
      }

      setVectorDetails(prev => ({ ...prev, [CREATOR_MANAGED_LAYER_ID]: detail }))
      setPreloadedTables(prev => ({ ...prev, [CREATOR_MANAGED_LAYER_ID]: detail }))

      setManagedLayers(prev =>
        prev.map(layer =>
          layer.id === CREATOR_MANAGED_LAYER_ID
            ? {
                ...layer,
                featureCount: count,
                bounds: bounds ?? layer.bounds
              }
            : layer
        )
      )
    } catch (error) {
      console.warn('Failed to load Operator features:', error)
    }
  }, [currentProject, ensureCreatorLayers])

  const creatorFeatures = useMemo<any[]>(() => {
    const detail = vectorDetails[CREATOR_MANAGED_LAYER_ID]
    return (detail?.features as any[]) ?? []
  }, [vectorDetails])

  const creatorFeatureById = useMemo(() => {
    const map = new Map<string, any>()
    for (const f of creatorFeatures) {
      const props = (f as any)?.properties || {}
      const id = String(props.creator_id ?? (f as any)?.id ?? '')
      if (id) map.set(id, f)
    }
    return map
  }, [creatorFeatures])

  // Keep Creator Manager per-entry UI state (visibility/opacity/order) in sync with loaded Creator features
  useEffect(() => {
    const rows: { id: string; sortKey: number }[] = []
    for (const f of creatorFeatures) {
      const props = (f as any)?.properties || {}
      const id = String(props.creator_id ?? (f as any)?.id ?? '')
      if (!id) continue
      const ts = Date.parse(String(props.updated_at ?? props.created_at ?? ''))
      rows.push({ id, sortKey: Number.isFinite(ts) ? ts : 0 })
    }

    const sortedIds = rows.sort((a, b) => b.sortKey - a.sortKey).map((r) => r.id)
    const idsSet = new Set(sortedIds)

    setCreatorEntryUi((prev) => {
      let changed = false
      const next: Record<string, { visible: boolean; opacity: number; order: number }> = { ...prev }

      // Remove stale entries
      for (const id of Object.keys(next)) {
        if (!idsSet.has(id)) {
          delete next[id]
          changed = true
        }
      }

      // Add new entries (ensure newest get highest order)
      let maxOrder = Math.max(0, ...Object.values(next).map((v) => v.order ?? 0))
      const newIds = sortedIds.filter((id) => !next[id])
      if (newIds.length) {
        for (const id of [...newIds].reverse()) {
          maxOrder += 1
          next[id] = { visible: true, opacity: 1, order: maxOrder }
        }
        changed = true
      }

      return changed ? next : prev
    })

    setSelectedCreatorEntryId((prev) => (prev && idsSet.has(prev) ? prev : null))
  }, [creatorFeatures])

  const creatorManagerEntries = useMemo<CreatorManagerEntry[]>(() => {
    const list: CreatorManagerEntry[] = []
    for (const f of creatorFeatures) {
      const props = (f as any)?.properties || {}
      const id = String(props.creator_id ?? (f as any)?.id ?? '')
      if (!id) continue
      const ui = creatorEntryUi[id] ?? { visible: true, opacity: 1, order: 0 }
      list.push({
        id,
        entryType: String(props.creator_type ?? ''),
        title: String(props.title ?? id),
        category: String(props.category ?? ''),
        categoryOther: props.category_other ?? null,
        comment: props.comment ?? null,
        status: props.status ?? null,
        createdAt: props.created_at ?? null,
        updatedAt: props.updated_at ?? null,
        createdBy: props.created_by ?? null,
        updatedBy: props.updated_by ?? null,
        visible: ui.visible ?? true,
        opacity: typeof ui.opacity === 'number' ? ui.opacity : 1,
        order: typeof ui.order === 'number' ? ui.order : 0
      })
    }
    return list
  }, [creatorFeatures, creatorEntryUi])

  // Apply per-entry visibility/opacity overrides to Creator layers
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded) return
    if (!map.getLayer(CREATOR_LAYER_FILL_ID) || !map.getLayer(CREATOR_LAYER_LINE_ID) || !map.getLayer(CREATOR_LAYER_POINT_ID)) return

    const ids = Object.keys(creatorEntryUi)
    const applyOpacity = (layerId: string, paintKey: string, base: number) => {
      if (ids.length === 0) {
        map.setPaintProperty(layerId, paintKey, base)
        return
      }
      const pairs: any[] = []
      for (const id of ids) {
        const st = creatorEntryUi[id]
        const visible = st?.visible ?? true
        const op = typeof st?.opacity === 'number' ? st.opacity : 1
        pairs.push(id, visible ? base * op : 0)
      }
      map.setPaintProperty(layerId, paintKey, ['match', ['get', 'creator_id'], ...pairs, base] as any)
    }

    try {
      applyOpacity(CREATOR_LAYER_FILL_ID, 'fill-opacity', 0.25)
      applyOpacity(CREATOR_LAYER_LINE_ID, 'line-opacity', 0.9)
      applyOpacity(CREATOR_LAYER_POINT_ID, 'circle-opacity', 0.9)
    } catch {
      // ignore
    }
  }, [creatorEntryUi, mapLoaded])

  const handleToggleCreatorEntryVisibility = useCallback((entryId: string) => {
    setCreatorEntryUi((prev) => {
      const current = prev[entryId]
      if (!current) return prev
      return { ...prev, [entryId]: { ...current, visible: !current.visible } }
    })
  }, [])

  const handleCreatorEntryOpacityChange = useCallback((entryId: string, value: number) => {
    const v = Math.max(0, Math.min(1, value))
    setCreatorEntryUi((prev) => {
      const current = prev[entryId]
      if (!current) return prev
      return { ...prev, [entryId]: { ...current, opacity: v } }
    })
  }, [])

  const handleMoveCreatorEntry = useCallback((entryId: string, direction: 'up' | 'down') => {
    setCreatorEntryUi((prev) => {
      const orderedIds = Object.keys(prev).sort((a, b) => (prev[b]?.order ?? 0) - (prev[a]?.order ?? 0))
      const idx = orderedIds.indexOf(entryId)
      if (idx < 0) return prev
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1
      if (swapIdx < 0 || swapIdx >= orderedIds.length) return prev
      const aId = orderedIds[idx]
      const bId = orderedIds[swapIdx]
      const aOrder = prev[aId]?.order ?? 0
      const bOrder = prev[bId]?.order ?? 0
      return {
        ...prev,
        [aId]: { ...prev[aId], order: bOrder },
        [bId]: { ...prev[bId], order: aOrder }
      }
    })
  }, [])

  const handleReorderCreatorEntries = useCallback((draggedId: string, targetId: string, position: 'above' | 'below') => {
    setCreatorEntryUi((prev) => {
      if (!prev[draggedId] || !prev[targetId]) return prev
      const orderedIds = Object.keys(prev).sort((a, b) => (prev[b]?.order ?? 0) - (prev[a]?.order ?? 0))
      const fromIdx = orderedIds.indexOf(draggedId)
      const targetIdx = orderedIds.indexOf(targetId)
      if (fromIdx < 0 || targetIdx < 0) return prev

      orderedIds.splice(fromIdx, 1)
      let insertAt = orderedIds.indexOf(targetId)
      if (insertAt < 0) return prev
      if (position === 'below') insertAt += 1
      orderedIds.splice(insertAt, 0, draggedId)

      const next: Record<string, { visible: boolean; opacity: number; order: number }> = { ...prev }
      const n = orderedIds.length
      orderedIds.forEach((id, idx) => {
        next[id] = { ...next[id], order: n - idx }
      })
      return next
    })
  }, [])

  const handleOpenCreatorEntryFromManager = useCallback((entryId: string, x: number, y: number) => {
    if (!currentProject) {
      setToast({ message: 'Select a project before opening Operator entries', type: 'info' })
      return
    }
    void openCreatorEditEditor(entryId, x, y)
  }, [currentProject, openCreatorEditEditor])

  const handleZoomToCreatorEntry = useCallback((entryId: string) => {
    const map = mapRef.current
    if (!map) return
    const feature = creatorFeatureById.get(entryId)
    const bounds = feature ? featureBounds(feature) : null
    if (!bounds) return
    map.fitBounds(bounds, { padding: 80, duration: 800 })
  }, [creatorFeatureById])

  const handleZoomToGeoJSON = useCallback((geojson: GeoJSON.Geometry | GeoJSON.Feature | GeoJSON.FeatureCollection) => {
    const map = mapRef.current
    if (!map || !geojson) return
    const bounds = getGeoJSONBounds(geojson as any)
    if (!bounds) return
    map.fitBounds(bounds as any, {
      padding: 80,
      duration: 800,
      maxZoom: Math.min(map.getMaxZoom(), 18)
    })
  }, [])

  const ensureCreatorDraw = useCallback(() => {
    const map = mapRef.current
    if (!map) return null
    if (creatorDrawRef.current) return creatorDrawRef.current

    const draw = new MapboxDraw({
      displayControlsDefault: false,
      controls: {
        polygon: false,
        point: false,
        trash: true
      }
    })

    map.addControl(draw as any, 'top-left')
    creatorDrawRef.current = draw
    return draw
  }, [])

  const cancelCreatorTool = useCallback(() => {
    const map = mapRef.current
    const draw = creatorDrawRef.current
    if (map && creatorDrawCreateHandlerRef.current) {
      map.off('draw.create', creatorDrawCreateHandlerRef.current as any)
      creatorDrawCreateHandlerRef.current = null
    }
    if (operatorGeometryCaptureRef.current) {
      try {
        operatorGeometryCaptureRef.current.reject(new Error('Geometry capture cancelled.'))
      } catch {
        // ignore
      }
      operatorGeometryCaptureRef.current = null
      setOperatorGeometryCaptureActive(false)
    }
    draw?.deleteAll()
    setCreatorGeometryConfirm(null)
    creatorInteractionLockRef.current = false
    setCreatorTool('none')
  }, [])

  // Mode switching is UI-only, but we proactively close mode-specific panels/tools when leaving a mode.
  useEffect(() => {
    if (mapMode !== 'operator') {
      cancelCreatorTool()
      setCreatorEditor(null)
      setCreatorGeometryEdit(null)
      setCreatorEditorDocked(false)
    }

    if (mapMode !== 'routing') {
      setShowAnalysisPanel(false)
      setShowDecisionsPanel(false)
      setShowRoutesDialog(false)
      setPirlTableRouteId(null)
      setSelectedSegmentId(null)
      setSelectedRouteId(null)
    }

    if (mapMode !== 'gis') {
      setDatasetsDialogOpen(false)
      setDatasetsDialogDocked(false)
      setFullTableLayerId(null)
      setStyleLayerId(null)
    }
  }, [cancelCreatorTool, mapMode])

  // If a project becomes unselected, hide/close all mode-specific UI.
  useEffect(() => {
    if (currentProject) return
    cancelCreatorTool()
    setCreatorEditor(null)
    setCreatorGeometryEdit(null)
    setSelectedCreatorEntryId(null)
    setShowAnalysisPanel(false)
    setShowDecisionsPanel(false)
    setShowRoutesDialog(false)
    setPirlTableRouteId(null)
    setSelectedSegmentId(null)
    setSelectedRouteId(null)
    setDatasetsDialogOpen(false)
    setDatasetsDialogDocked(false)
    setFullTableLayerId(null)
    setStyleLayerId(null)
    setHiddenCrossingCategories({})
    setHiddenCrossingKeys({})
  }, [cancelCreatorTool, currentProject])

  // When switching from one project to another, reset any project-scoped UI state so we
  // don't keep references to stale layers/routes/analysis outputs.
  useEffect(() => {
    const prev = previousProjectRef.current
    previousProjectRef.current = currentProject

    if (!prev || !currentProject || prev === currentProject) return

    // Invalidate any in-flight project layer loads immediately.
    projectLayersLoadIdRef.current += 1

    // Operator mode state
    cancelCreatorTool()
    setCreatorEditor(null)
    setCreatorGeometryEdit(null)
    setSelectedCreatorEntryId(null)
    setCreatorEntryUi({})

    // Routing/analysis state
    setLoadedPirlRoutes([])
    setRouteCrossingsByRouteId({})
    setCrossingsManagerOpen(false)
    setSelectedSegmentId(null)
    setSelectedRouteId(null)
    setAnalysisResult(null)
    setAnalysisError(null)
    setShowAnalysisPanel(false)
    setDecisionsData(null)
    setDecisionsError(null)
    setShowDecisionsPanel(false)
    setShowRoutesDialog(false)
    setPirlTableRouteId(null)
    setPirlTableDocked(false)
    setHiddenCrossingCategories({})
    setHiddenCrossingKeys({})

    // GIS state
    setDatasetsDialogOpen(false)
    setDatasetsDialogDocked(false)
    setFullTableLayerId(null)
    setFullTableDocked(false)
    setStyleLayerId(null)
    setStyleDraft({})
    setStyleOverrides({})

    // Popups/context
    setContextMenu(null)
    setIdentifyPopup(null)
    clearFeatureHighlight()
  }, [cancelCreatorTool, currentProject])

  const startCreatorTool = useCallback(
    (tool: CreatorTool) => {
      if (!currentProject) {
        setToast({ message: 'Select a project before using Operator Mode', type: 'info' })
        return
      }
      const map = mapRef.current
      if (!map) return
      const draw = ensureCreatorDraw()
      if (!draw) return

      // Reset any open editor state
      setCreatorEditor(null)
      setCreatorGeometryConfirm(null)
      setCreatorGeometryEdit(null)

      // Lock interactions while drawing so we don't conflict with identify/dblclick
      creatorInteractionLockRef.current = true
      setCreatorTool(tool)

      // Clear previous temp drawings and (re)bind create handler
      draw.deleteAll()
      if (creatorDrawCreateHandlerRef.current) {
        map.off('draw.create', creatorDrawCreateHandlerRef.current as any)
        creatorDrawCreateHandlerRef.current = null
      }

      const handleCreate = (e: any) => {
        const feature = e?.features?.[0]
        const geometry = feature?.geometry as GeoJSON.Geometry | undefined
        if (!geometry) return

        // Stop listening after first geometry capture
        if (creatorDrawCreateHandlerRef.current) {
          map.off('draw.create', creatorDrawCreateHandlerRef.current as any)
          creatorDrawCreateHandlerRef.current = null
        }

        creatorInteractionLockRef.current = false
        setCreatorTool('none')
        try {
          draw.changeMode('simple_select')
        } catch {
          // ignore
        }

        const entryType: CreatorEntryType = tool === 'create_aoi' ? 'AOI' : 'POI'
        const anchor = getConfirmPopoverAnchorFromGeometry(geometry) ?? {
          x: Math.round(window.innerWidth * 0.5),
          y: Math.round(window.innerHeight * 0.35)
        }
        const safe = getSafeCreatorConfirmPosition(anchor.x, anchor.y)
        setCreatorGeometryConfirm({
          entryType,
          geometryWgs84: geometry,
          x: safe.x,
          y: safe.y
        })
      }

      creatorDrawCreateHandlerRef.current = handleCreate
      map.on('draw.create', handleCreate)

      if (tool === 'create_aoi') {
        draw.changeMode('draw_polygon')
      } else if (tool === 'create_poi') {
        draw.changeMode('draw_point')
      }
    },
    [currentProject, ensureCreatorDraw, getConfirmPopoverAnchorFromGeometry, getSafeCreatorConfirmPosition]
  )

  const captureOperatorGeometry = useCallback(
    async (kind: OperatorGeometryKind): Promise<GeoJSON.Geometry> => {
      if (!currentProject) {
        throw new Error('Select a project before capturing geometry.')
      }
      if (creatorToolRef.current !== 'none') {
        throw new Error('Finish/cancel the current Operator drawing before setting sortie geometry.')
      }
      if (creatorGeometryEdit !== null) {
        throw new Error('Finish/cancel geometry editing before setting sortie geometry.')
      }
      if (creatorEditor) {
        throw new Error('Close the Operator entry editor before setting sortie geometry.')
      }
      if (operatorGeometryCaptureRef.current) {
        throw new Error('Geometry capture already in progress.')
      }

      const map = mapRef.current
      if (!map) {
        throw new Error('Map is not ready.')
      }
      const draw = ensureCreatorDraw()
      if (!draw) {
        throw new Error('Map draw tools unavailable.')
      }

      // Ensure we start clean (no leftover listeners or drawings).
      cancelCreatorTool()

      setOperatorGeometryCaptureActive(true)
      creatorInteractionLockRef.current = true
      draw.deleteAll()

      return await new Promise<GeoJSON.Geometry>((resolve, reject) => {
        operatorGeometryCaptureRef.current = { resolve, reject }

        const handleCreate = (e: any) => {
          const feature = e?.features?.[0]
          const geometry = feature?.geometry as GeoJSON.Geometry | undefined
          if (!geometry) return

          // Stop listening after first geometry capture
          if (creatorDrawCreateHandlerRef.current) {
            map.off('draw.create', creatorDrawCreateHandlerRef.current as any)
            creatorDrawCreateHandlerRef.current = null
          }

          creatorInteractionLockRef.current = false
          setOperatorGeometryCaptureActive(false)
          try {
            draw.changeMode('simple_select')
          } catch {
            // ignore
          }
          try {
            draw.deleteAll()
          } catch {
            // ignore
          }

          const pending = operatorGeometryCaptureRef.current
          operatorGeometryCaptureRef.current = null
          pending?.resolve(geometry)
        }

        // (Re)bind create handler
        if (creatorDrawCreateHandlerRef.current) {
          map.off('draw.create', creatorDrawCreateHandlerRef.current as any)
          creatorDrawCreateHandlerRef.current = null
        }
        creatorDrawCreateHandlerRef.current = handleCreate
        map.on('draw.create', handleCreate)

        if (kind === 'polygon') {
          draw.changeMode('draw_polygon')
        } else {
          draw.changeMode('draw_point')
        }
      })
    },
    [cancelCreatorTool, creatorEditor, creatorGeometryEdit, currentProject, ensureCreatorDraw]
  )

  // Register Operator tool actions so the global Header can trigger MapboxDraw actions.
  useEffect(() => {
    registerOperatorActions({
      startTool: (tool) => startCreatorTool(tool),
      cancel: cancelCreatorTool,
      captureGeometry: captureOperatorGeometry,
      zoomToCreatorEntry: handleZoomToCreatorEntry,
      zoomToGeoJSON: handleZoomToGeoJSON
    })
  }, [cancelCreatorTool, captureOperatorGeometry, handleZoomToCreatorEntry, handleZoomToGeoJSON, registerOperatorActions, startCreatorTool])

  // Register GIS actions so the global Header can open dataset tooling.
  useEffect(() => {
    registerGisActions({
      openDatasetIndex: () => setDatasetsDialogOpen(true),
      openDatasetDigitalTwin: () => setDatasetDigitalTwinOpen(true),
      openMeasureTool: (tool: 'distance' | 'area' | 'elevation') => {
        switch (tool) {
          case 'distance': setMeasureDistanceOpen(true); break
          case 'area':     setMeasureAreaOpen(true); break
          case 'elevation': setElevationProfileOpen(true); break
        }
        setActiveMeasureTool(tool)
      }
    })
  }, [registerGisActions])

  // Register Routing actions so the global Header can open PIRL tooling.
  useEffect(() => {
    registerRoutingActions({
      openPirlManager: () => {
        if (!currentProjectRef.current) return
        setShowRoutesDialog(true)
      },
      openCrossingsManager: () => {
        if (!currentProjectRef.current) return
        setCrossingsManagerOpen(true)
      }
    })
  }, [registerRoutingActions])

  const applyOpacityToMapLayer = useCallback((layer: ManagedLayer, opacity: number) => {
    const map = mapRef.current
    if (!map) return

    // Creator AOI/POI styling is driven by per-entry match expressions in
    // the creatorEntryUi effect. Re-applying a flat opacity here would
    // overwrite those expressions and make hidden entries reappear.
    if (layer.id === CREATOR_MANAGED_LAYER_ID) return

    layer.layerIds.forEach((layerId) => {
      const mapLayer = map.getLayer(layerId) as LayerSpecification | undefined
      if (!mapLayer) return

      switch (mapLayer.type ?? layer.type) {
        case 'raster':
          map.setPaintProperty(layerId, 'raster-opacity', opacity)
          break
        case 'fill':
          map.setPaintProperty(layerId, 'fill-opacity', opacity)
          break
        case 'line':
        case 'fill-extrusion':
          map.setPaintProperty(layerId, 'line-opacity', opacity)
          break
        case 'circle':
          map.setPaintProperty(layerId, 'circle-opacity', opacity)
          break
        case 'symbol':
          map.setPaintProperty(layerId, 'icon-opacity', opacity)
          map.setPaintProperty(layerId, 'text-opacity', opacity)
          break
        default:
          break
      }
    })
  }, [])

  const applyVisibilityToMapLayer = useCallback((layer: ManagedLayer, visible: boolean) => {
    const map = mapRef.current
    if (!map) return

    layer.layerIds.forEach((layerId) => {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none')
      }
    })
  }, [])

  const applyLayerOrder = useCallback((layers: ManagedLayer[]) => {
    const map = mapRef.current
    if (!map) return
    const orderedIds = [...layers]
      .sort((a, b) => a.order - b.order)
      .flatMap((layer) => layer.layerIds)

    for (let i = orderedIds.length - 1; i >= 0; i--) {
      const layerId = orderedIds[i]
      if (map.getLayer(layerId)) {
        const beforeId = orderedIds[i + 1]
        map.moveLayer(layerId, beforeId)
      }
    }

    // Always move PIRL AI route layers to the top (rendered last)
    // Find all agentic-route layers and move them to the very top
    const style = map.getStyle()
    if (style?.layers) {
      const pirlLayerIds = style.layers
        .filter(l => l.id.startsWith('agentic-route-'))
        .map(l => l.id)

      // Move each PIRL layer to the top (no beforeId = add to top)
      for (const pirlLayerId of pirlLayerIds) {
        if (map.getLayer(pirlLayerId)) {
          map.moveLayer(pirlLayerId)
        }
      }
    }

    // Keep Sortie preview overlay above managed layers (but still below crossings icons).
    try {
      if (map.getLayer(SORTIE_PREVIEW_LAYER_FILL_ID)) map.moveLayer(SORTIE_PREVIEW_LAYER_FILL_ID)
      if (map.getLayer(SORTIE_PREVIEW_LAYER_LINE_ID)) map.moveLayer(SORTIE_PREVIEW_LAYER_LINE_ID)
      if (map.getLayer(SORTIE_PREVIEW_LAYER_POINT_ID)) map.moveLayer(SORTIE_PREVIEW_LAYER_POINT_ID)
    } catch {
      // ignore
    }

    // Ensure MapboxDraw layers stay visible (layer ordering can bury them under managed layers).
    try {
      const style = map.getStyle()
      const drawLayerIds =
        style?.layers
          ?.map(l => String((l as any)?.id ?? ''))
          .filter(id => id.startsWith('gl-draw-') || id.startsWith('mapbox-gl-draw-')) ?? []
      // Move in style order to preserve relative draw layer ordering.
      for (const drawLayerId of drawLayerIds) {
        if (drawLayerId && map.getLayer(drawLayerId)) {
          map.moveLayer(drawLayerId)
        }
      }
    } catch {
      // ignore
    }

    // Keep Route Crossings overlays above everything else (icons must not be buried by layer reordering).
    try {
      if (map.getLayer(ROUTE_CROSSINGS_LAYER_SHADOW_ID)) {
        map.moveLayer(ROUTE_CROSSINGS_LAYER_SHADOW_ID)
      }
      if (map.getLayer(ROUTE_CROSSINGS_LAYER_MARKER_ID)) {
        map.moveLayer(ROUTE_CROSSINGS_LAYER_MARKER_ID)
      }
    } catch {
      // ignore
    }
  }, [])

  /**
   * Add a raster layer using API tile endpoint
   */
  const addRasterLayer = useCallback(
    (dataset: DatasetInfo) => {
      if (!currentProject || !mapRef.current) return null
      const map = mapRef.current

      const sourceId = `raster-${dataset.name}`
      const layerId = `${sourceId}-layer`

      if (map.getLayer(layerId)) {
        try {
          map.removeLayer(layerId)
        } catch (error) {
          console.warn(`Failed to remove layer ${layerId}`, error)
        }
      }
      if (map.getSource(sourceId)) {
        try {
          map.removeSource(sourceId)
        } catch (error) {
          console.warn(`Failed to remove source ${sourceId}`, error)
        }
      }

      map.addSource(sourceId, {
        type: 'raster',
        tiles: [getTileUrl(currentProject, dataset.name)],
        tileSize: 256
      })
      dynamicSourceIdsRef.current.push(sourceId)

      map.addLayer({
        id: layerId,
        type: 'raster',
        source: sourceId,
        paint: {
          'raster-opacity': 0.85
        }
      })

      dynamicLayerIdsRef.current.push(layerId)

      return {
        sourceId,
        layerIds: [layerId]
      }
    },
    [currentProject]
  )

  /**
   * Add GeoJSON layer with default styling
   */
  const addVectorLayer = useCallback(
    async (
      dataset: DatasetInfo,
      isAoi: boolean,
      options?: { loadId?: number; project?: string }
    ) => {
      const map = mapRef.current
      if (!map) return null

      const projectName = options?.project ?? currentProject
      if (!projectName) return null
      const expectedLoadId = options?.loadId

      // Large vectors (e.g., NHN waterways) cannot be loaded as full GeoJSON in MapLibre.
      // Use MVT vector tiles for performance + stability.
      const meta: any = (dataset as any)?.metadata || {}
      const fileSizeBytes = typeof meta?.file_size_bytes === 'number' ? Number(meta.file_size_bytes) : null
      const useVectorTiles = !isAoi && fileSizeBytes !== null && fileSizeBytes > 50 * 1024 * 1024

      const sourceId = `vector-${dataset.name}`

      // If a newer project layer load has started since this request began, ignore.
      if (expectedLoadId !== undefined && projectLayersLoadIdRef.current !== expectedLoadId) return null
      if (currentProjectRef.current !== projectName) return null

      const removeLayerSafely = (layerId: string) => {
        if (!map.getLayer(layerId)) return
        try {
          map.removeLayer(layerId)
        } catch (error) {
          console.warn(`Failed to remove layer ${layerId}`, error)
        }
      }

      // Remove known layer ids first, then any remaining dependent layers.
      const knownLayerIds = [
        `${sourceId}-fill`,
        `${sourceId}-outline`,
        `${sourceId}-line`,
        `${sourceId}-points`
      ]
      for (const layerId of knownLayerIds) {
        removeLayerSafely(layerId)
      }

      const dependentLayerIds =
        map
          .getStyle()
          ?.layers?.filter((layer: any) => layer?.source === sourceId)
          .map((layer: any) => String(layer.id)) ?? []

      for (const dependentLayerId of dependentLayerIds.reverse()) {
        removeLayerSafely(dependentLayerId)
      }

      if (map.getSource(sourceId)) {
        try {
          map.removeSource(sourceId)
        } catch (error) {
          console.warn(`Failed to remove source ${sourceId}`, error)
        }
      }

      // Re-check before mutating style further.
      if (expectedLoadId !== undefined && projectLayersLoadIdRef.current !== expectedLoadId) return null
      if (currentProjectRef.current !== projectName) return null

      const layerIds: string[] = []
      const color = isAoi ? '#2563eb' : colorForLayer(dataset.name)

      // Fast path: MVT tiles for huge vectors
      if (useVectorTiles) {
        map.addSource(sourceId, {
          type: 'vector',
          tiles: [getVectorTileUrl(projectName, dataset.name)],
          minzoom: 0,
          maxzoom: 11
        } as any)
        dynamicSourceIdsRef.current.push(sourceId)

        const lineLayerId = `${sourceId}-line`
        map.addLayer({
          id: lineLayerId,
          type: 'line',
          source: sourceId,
          // Must match backend tileset layer name (we set it to the requested dataset name).
          'source-layer': dataset.name,
          paint: {
            'line-color': color,
            'line-width': 1.8,
            'line-opacity': 0.9
          }
        } as any)
        layerIds.push(lineLayerId)
        dynamicLayerIdsRef.current.push(...layerIds)

        const bbox = meta?.bbox_wgs84
        const bounds =
          bbox &&
          typeof bbox.west === 'number' &&
          typeof bbox.south === 'number' &&
          typeof bbox.east === 'number' &&
          typeof bbox.north === 'number'
            ? ([[[bbox.west, bbox.south], [bbox.east, bbox.north]]] as any)[0]
            : null

        const featureCount = typeof meta?.feature_count === 'number' ? Number(meta.feature_count) : undefined

        const vectorDetail: VectorDetail = {
          properties: [],
          sample: [],
          rows: [],
          features: []
        }

        return {
          sourceId,
          layerIds,
          geometryType: 'line',
          bounds,
          vectorDetail,
          featureCount
        }
      }

      // Default: load full GeoJSON for small vectors
      const geojson = await fetchVectorData(projectName, dataset.name)

      // If a newer project layer load has started since this request began, ignore.
      if (expectedLoadId !== undefined && projectLayersLoadIdRef.current !== expectedLoadId) return null
      if (currentProjectRef.current !== projectName) return null

      map.addSource(sourceId, {
        type: 'geojson',
        data: geojson as any
      })
      dynamicSourceIdsRef.current.push(sourceId)

      const geometryType = inferGeometryType(geojson)
      const bounds = getGeoJSONBounds(geojson)

      if (geometryType === 'polygon' || geometryType === 'mixed') {
        map.addLayer({
          id: `${sourceId}-fill`,
          type: 'fill',
          source: sourceId,
          paint: {
            'fill-color': color,
            'fill-opacity': isAoi ? 0.2 : 0.35
          }
        })
        layerIds.push(`${sourceId}-fill`)

        map.addLayer({
          id: `${sourceId}-outline`,
          type: 'line',
          source: sourceId,
          paint: {
            'line-color': color,
            'line-width': isAoi ? 2.5 : 1.5,
            'line-opacity': isAoi ? 0.9 : 0.8
          }
        })
        layerIds.push(`${sourceId}-outline`)
      }

      if (geometryType === 'line' || geometryType === 'mixed') {
        map.addLayer({
          id: `${sourceId}-line`,
          type: 'line',
          source: sourceId,
          paint: {
            'line-color': color,
            'line-width': 2,
            'line-opacity': 0.9
          }
        })
        layerIds.push(`${sourceId}-line`)
      }

      if (geometryType === 'point' || geometryType === 'mixed') {
        map.addLayer({
          id: `${sourceId}-points`,
          type: 'circle',
          source: sourceId,
          paint: {
            'circle-radius': 4,
            'circle-color': color,
            'circle-stroke-width': 1,
            'circle-stroke-color': '#0f172a',
            'circle-opacity': 0.95
          }
        })
        layerIds.push(`${sourceId}-points`)
      }

      dynamicLayerIdsRef.current.push(...layerIds)

      const summary = buildPropertySummary(geojson)
      const features = Array.isArray((geojson as any)?.features) ? (geojson as any).features : []
      const rows: Record<string, any>[] = features.map((f: any) => f?.properties || {})
      const featureCount = features.length

      const vectorDetail: VectorDetail = {
        properties: summary.properties,
        sample: summary.sample,
        rows,
        features
      }

      return {
        sourceId,
        layerIds,
        geometryType,
        bounds,
        vectorDetail,
        featureCount
      }
    },
    [currentProject]
  )

  const addPointMarkerLayer = useCallback(
    (
      layerId: string,
      coordinates: [number, number],
      options: { label: string; color: string }
    ) => {
      if (!mapRef.current) return null
      const map = mapRef.current
      const sourceId = `${layerId}-source`
      const circleLayerId = `${layerId}-circle`
      const labelLayerId = `${layerId}-label`

      if (map.getLayer(circleLayerId)) {
        try {
          map.removeLayer(circleLayerId)
        } catch (error) {
          console.warn(`Failed to remove layer ${circleLayerId}`, error)
        }
      }
      if (map.getLayer(labelLayerId)) {
        try {
          map.removeLayer(labelLayerId)
        } catch (error) {
          console.warn(`Failed to remove layer ${labelLayerId}`, error)
        }
      }
      if (map.getSource(sourceId)) {
        try {
          map.removeSource(sourceId)
        } catch (error) {
          console.warn(`Failed to remove source ${sourceId}`, error)
        }
      }

      const feature = {
        type: 'Feature',
        geometry: { type: 'Point', coordinates },
        properties: { title: options.label }
      }

      map.addSource(sourceId, {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: [feature]
        } as any
      })

      map.addLayer({
        id: circleLayerId,
        type: 'circle',
        source: sourceId,
        paint: {
          'circle-radius': 8,
          'circle-color': options.color,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff'
        }
      })

      map.addLayer({
        id: labelLayerId,
        type: 'symbol',
        source: sourceId,
        layout: {
          'text-field': options.label,
          'text-offset': [0, 1.5],
          'text-size': 12,
          'text-anchor': 'top'
        },
        paint: {
          'text-color': '#ffffff',
          'text-halo-color': '#000000',
          'text-halo-width': 2
        }
      })

      dynamicSourceIdsRef.current.push(sourceId)
      dynamicLayerIdsRef.current.push(circleLayerId, labelLayerId)

      return { sourceId, layerIds: [circleLayerId, labelLayerId], feature }
    },
    []
  )

  /**
   * Load project rasters + vectors following AGRS project structure
   */
  const loadProjectLayers = useCallback(async () => {
    if (!mapReady || !mapRef.current) return

    const loadId = ++projectLayersLoadIdRef.current
    const projectName = currentProject
    const datasetsSnapshot = datasets

    const isActive = () =>
      projectLayersLoadIdRef.current === loadId && currentProjectRef.current === projectName

    clearDynamicLayers()
    setManagedLayers([])
    setVectorDetails({})
    setPreloadedTables({})
    setSelectedLayerId(null)
    setLoadingMessage(projectName ? `Loading ${projectName} datasets...` : null)

    if (!projectName || !datasetsSnapshot) {
      setLoadingMessage(null)
      return
    }

    if (!isActive()) return

    const nextLayers: ManagedLayer[] = []
    let order = 0
    let focusBounds: LngLatBounds | null = null

    // Load rasters first so they sit below vector overlays
    for (const raster of datasetsSnapshot.rasters) {
      if (!isActive()) return
      const layerId = `raster-${raster.name}`
      try {
        const added = addRasterLayer(raster)
        if (added) {
          const bounds = getRasterBounds(raster.metadata)
            const isDem = raster.name.toLowerCase().includes('dem')
          if (bounds) {
            if (!focusBounds || isDem) {
              focusBounds = bounds
            }
          }

          nextLayers.push({
            id: layerId,
            name: raster.name,
            type: 'raster',
            status: 'ready',
            sourceId: added.sourceId,
            layerIds: added.layerIds,
            visible: true,
            opacity: 0.6,
            order: order++,
            path: raster.path,
            metadata: raster.metadata,
            bounds: bounds || undefined
          })
        }
      } catch (error) {
        nextLayers.push({
          id: layerId,
          name: raster.name,
          type: 'raster',
          status: 'error',
          message: error instanceof Error ? error.message : 'Failed to load raster',
          sourceId: layerId,
          layerIds: [],
          visible: false,
          opacity: 1,
          order: order++,
          path: raster.path,
          metadata: raster.metadata
        })
      }
    }

    // Load vectors (including AOI)
    for (const vector of datasetsSnapshot.vectors) {
      if (!isActive()) return
      const isAoi = AOI_LAYER_HINTS.some(hint => vector.name.toLowerCase().includes(hint))
      const layerId = `vector-${vector.name}`
          nextLayers.push({
            id: layerId,
            name: vector.name,
            type: 'vector',
            status: 'loading',
            sourceId: layerId,
            layerIds: [],
            visible: true,
            opacity: isAoi ? 0.6 : 0.9,
            order: order,
            path: vector.path,
            metadata: vector.metadata,
            isAoi
          })

      try {
        const added = await addVectorLayer(vector, isAoi, { loadId, project: projectName })
        if (!isActive()) return
        if (added) {
          nextLayers[order] = {
            ...nextLayers[order],
            status: 'ready',
            sourceId: added.sourceId,
            layerIds: added.layerIds,
            geometryType: added.geometryType,
            featureCount: added.featureCount,
            bounds: added.bounds || undefined
          }

          if (added.bounds && isAoi) {
            mapRef.current?.fitBounds(added.bounds as any, { padding: 80, duration: 900 })
          }

          // Populate attribute cache for UI
          if (!isActive()) return
          setVectorDetails(prev => ({ ...prev, [layerId]: added.vectorDetail }))
          setPreloadedTables(prev => ({ ...prev, [layerId]: added.vectorDetail }))
        }
      } catch (error) {
        if (!isActive()) return
        nextLayers[order] = {
          ...nextLayers[order],
          status: 'error',
          message: error instanceof Error ? error.message : 'Failed to load vector layer',
          visible: false
        }
      }

      order += 1
    }

    // Load start/end AOI points as managed vector layers
    try {
      if (!isActive()) return
      const resp = await fetch(getAoiFileUrl(projectName, 'project_aoi.json'))
      if (!isActive()) return
      if (resp.ok) {
        const data = await resp.json()
        if (!isActive()) return
        const pointConfigs = [
          {
            key: 'start_point',
            id: 'start-point',
            name: 'Start Point',
            label: 'START',
            color: '#22c55e'
          },
          {
            key: 'end_point',
            id: 'end-point',
            name: 'End Point',
            label: 'END',
            color: '#ef4444'
          }
        ] as const

        for (const config of pointConfigs) {
          if (!isActive()) return
          const point = data?.[config.key]
          if (!point || typeof point.longitude !== 'number' || typeof point.latitude !== 'number') {
            continue
          }

          const added = addPointMarkerLayer(config.id, [point.longitude, point.latitude], {
            label: config.label,
            color: config.color
          })

          if (!added) continue

          const vectorDetail: VectorDetail = {
            properties: ['Label', 'Longitude', 'Latitude'],
            sample: [
              {
                Label: config.label,
                Longitude: point.longitude,
                Latitude: point.latitude
              }
            ],
            rows: [
              {
                Label: config.label,
                Longitude: point.longitude,
                Latitude: point.latitude
              }
            ],
            features: [
              {
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [point.longitude, point.latitude] },
                properties: {
                  Label: config.label,
                  Longitude: point.longitude,
                  Latitude: point.latitude
                }
              }
            ]
          }

          if (!isActive()) return
          setVectorDetails(prev => ({ ...prev, [config.id]: vectorDetail }))
          setPreloadedTables(prev => ({ ...prev, [config.id]: vectorDetail }))

          nextLayers.push({
            id: config.id,
            name: config.name,
            type: 'vector',
            status: 'ready',
            sourceId: added.sourceId,
            layerIds: added.layerIds,
            visible: true,
            opacity: 1,
            order: order++,
            path: getAoiFileUrl(projectName, 'project_aoi.json'),
            metadata: {
              description: `${config.name} from AOI`,
              longitude: point.longitude,
              latitude: point.latitude
            },
            geometryType: 'point',
            featureCount: 1,
            isAoi: true
          })
        }
      }
    } catch (error) {
      console.warn('Failed to load AOI point markers:', error)
    }

    // Load Operator Mode features (project data/creator) as a managed vector layer
    try {
      if (!isActive()) return
      const creatorFc = await fetchCreatorGeoJSON(projectName)
      if (!isActive()) return
      ensureCreatorLayers(creatorFc as any)

      const creatorRows =
        (creatorFc as any)?.features?.map((f: any) => {
          const props = f?.properties || {}
          return {
            ID: props.creator_id ?? f.id ?? '',
            Type: props.creator_type ?? '',
            Title: props.title ?? '',
            Category: props.category ?? '',
            Status: props.status ?? ''
          }
        }) ?? []

      const creatorDetail: VectorDetail = {
        properties: ['ID', 'Type', 'Title', 'Category', 'Status'],
        sample: creatorRows.slice(0, 25),
        rows: creatorRows,
        features: (creatorFc as any)?.features ?? []
      }

      if (!isActive()) return
      setVectorDetails(prev => ({ ...prev, [CREATOR_MANAGED_LAYER_ID]: creatorDetail }))
      setPreloadedTables(prev => ({ ...prev, [CREATOR_MANAGED_LAYER_ID]: creatorDetail }))

      nextLayers.push({
        id: CREATOR_MANAGED_LAYER_ID,
        name: 'Operator Annotations',
        type: 'vector',
        status: 'ready',
        sourceId: CREATOR_SOURCE_ID,
        layerIds: [CREATOR_LAYER_FILL_ID, CREATOR_LAYER_LINE_ID, CREATOR_LAYER_POINT_ID],
        visible: true,
        opacity: 0.9,
        order: order++,
        path: 'data/creator',
        metadata: {
          description: 'Operator Mode field geointelligence (AOI/POI) with attachments and audit trail'
        },
        geometryType: 'mixed',
        featureCount: (creatorFc as any)?.features?.length ?? 0,
        bounds: getGeoJSONBounds(creatorFc as any) || undefined,
        isAoi: false
      })
    } catch (error) {
      if (!isActive()) return
      // Ensure layers exist even if fetch fails, so Operator drawing can still work.
      try {
        ensureCreatorLayers({ type: 'FeatureCollection', features: [] } as any)
      } catch {
        // ignore
      }
      console.warn('Failed to load Operator Mode features:', error)
    }

    if (!isActive()) return
    const ordered = nextLayers.map((layer, idx) => ({ ...layer, order: idx }))

    // Restore per-layer visibility / opacity from the user's previous session
    const savedState = restoreLayerSession(currentProject)
    const restored = ordered.map(layer => {
      const saved = savedState[layer.id]
      if (!saved) return layer
      return { ...layer, visible: saved.visible, opacity: saved.opacity }
    })
    // Apply restored visibility/opacity to the map
    for (const layer of restored) {
      const saved = savedState[layer.id]
      if (saved) {
        applyVisibilityToMapLayer(layer, saved.visible)
        applyOpacityToMapLayer(layer, saved.opacity)
      }
    }

    setManagedLayers(restored)
    if (focusBounds) {
      mapRef.current?.fitBounds(focusBounds, { padding: 80, duration: 1000 })
    }
    if (!selectedLayerIdRef.current && ordered.length > 0) {
      // Prefer selecting a GIS layer (exclude Operator annotations from default GIS selection).
      const firstRenderable =
        ordered.find(layer => layer.status === 'ready' && layer.id !== CREATOR_MANAGED_LAYER_ID) ||
        ordered.find(layer => layer.status === 'ready') ||
        ordered[0]
      setSelectedLayerId(firstRenderable.id)
    }
    applyLayerOrder(ordered)
    setLoadingMessage(null)
  }, [
    addPointMarkerLayer,
    addRasterLayer,
    addVectorLayer,
    applyLayerOrder,
    clearDynamicLayers,
    currentProject,
    datasets,
    ensureCreatorLayers,
    mapReady
  ])

  useEffect(() => {
    if (!mapReady) return
    loadProjectLayers()
  }, [loadProjectLayers, mapReady])

  useEffect(() => {
    if (!mapReady) return
    resetBasemapFailureTracking()
    addBaseLayers()
  }, [addBaseLayers, mapReady, currentProject, resetBasemapFailureTracking])

  useEffect(() => {
    if (!mapReady || !mapRef.current) return
    const map = mapRef.current
    map.setTerrain(null)
  }, [mapReady])

  // ---------------------------------------------------------------------------
  // Map Projection – switch between mercator (2D) and globe (3D) with atmosphere
  // + star-field skybox that fades in when zoomed out past ~4.5
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!mapReady || !mapRef.current) return
    const map = mapRef.current

    try {
      if (mapProjection === 'globe') {
        ;(map as any).setProjection({ type: 'globe' })
        // Atmospheric haze that fades as you zoom in
        ;(map as any).setSky({
          'atmosphere-blend': [
            'interpolate',
            ['linear'],
            ['zoom'],
            0, 1,
            5, 1,
            7, 0
          ]
        })

        // ---- Star skybox ----
        if (!map.getLayer('star-skybox')) {
          const starLayer = createStarSkyboxLayer()
          starSkyboxRef.current = starLayer
          // Insert right above the background layer (below tile layers)
          const styleLayers = map.getStyle().layers
          const firstAboveBg = styleLayers.find((l: any) => l.id !== 'background')
          if (firstAboveBg) {
            map.addLayer(starLayer as any, firstAboveBg.id)
          } else {
            map.addLayer(starLayer as any)
          }
        }

        // Compute star opacity and background colour based on zoom.
        // Transition zone: zoom <=4 → full stars, zoom >=5 → no stars.
        const SKY_BLUE = { r: 135, g: 206, b: 235 }
        const DEEP_SPACE = { r: 2, g: 2, b: 8 }

        const updateStarVisibility = () => {
          const z = map.getZoom()
          const starOpacity = z <= 4.0 ? 1.0 : z >= 5.0 ? 0.0 : (5.0 - z) / 1.0
          starSkyboxRef.current?.setOpacity(starOpacity)

          // Smoothly transition background from sky-blue → near-black
          const t = 1 - starOpacity // 0 = dark, 1 = sky-blue
          const bgR = Math.round(DEEP_SPACE.r + (SKY_BLUE.r - DEEP_SPACE.r) * t)
          const bgG = Math.round(DEEP_SPACE.g + (SKY_BLUE.g - DEEP_SPACE.g) * t)
          const bgB = Math.round(DEEP_SPACE.b + (SKY_BLUE.b - DEEP_SPACE.b) * t)
          map.setPaintProperty('background', 'background-color', `rgb(${bgR},${bgG},${bgB})`)
        }

        map.on('zoom', updateStarVisibility)
        updateStarVisibility() // apply immediately for the current zoom

        return () => {
          map.off('zoom', updateStarVisibility)
        }
      } else {
        ;(map as any).setProjection({ type: 'mercator' })
        ;(map as any).setSky({})

        // Remove star skybox and restore background
        if (map.getLayer('star-skybox')) {
          try { map.removeLayer('star-skybox') } catch { /* ignore */ }
          starSkyboxRef.current = null
        }
        map.setPaintProperty('background', 'background-color', '#87CEEB')
      }
    } catch (err) {
      console.warn('[MapViewer] Failed to set projection:', err)
    }
  }, [mapReady, mapProjection])

  const requestElevationSample = useCallback(
    (lng: number, lat: number, zoomLevel: number) => {
      if (!terrainSamplerRef.current) {
        setCursorElevation(prev => ({
          value: prev.value,
          status: demAvailable ? 'idle' : 'no-dem'
        }))
        return
      }
      const sampler = terrainSamplerRef.current
      const requestId = ++elevationRequestIdRef.current
      setCursorElevation(prev => ({
        value: prev.value,
        status: prev.status === 'ready' ? 'ready' : 'loading'
      }))
      sampler
        .sample(lng, lat, zoomLevel)
        .then(value => {
          if (requestId !== elevationRequestIdRef.current) return
          setCursorElevation({
            value: value ?? null,
            status: value === null ? 'unavailable' : 'ready'
          })
        })
        .catch(() => {
          if (requestId !== elevationRequestIdRef.current) return
          setCursorElevation({ value: null, status: 'error' })
        })
    },
    [demAvailable]
  )

  useEffect(() => {
    selectedLayerIdRef.current = selectedLayerId
  }, [selectedLayerId])

  useEffect(() => {
    setTerrainEnabled(false)
    removeTerrainSource()
  }, [currentProject, demLayerName, removeTerrainSource])

  useEffect(() => {
    if (!mapReady || !mapRef.current) return
    const map = mapRef.current

    if (terrainEnabled) {
      const sourceId = ensureTerrainSource()
      if (!sourceId) return
      map.setTerrain({ source: sourceId, exaggeration: 1.2 })
      if (map.getPitch() < 55) {
        map.easeTo({ pitch: 55, duration: 900 })
      }
    } else {
      map.setTerrain(null)
      if (map.getPitch() > 0) {
        map.easeTo({ pitch: 0, duration: 700 })
      }
    }
  }, [terrainEnabled, ensureTerrainSource, mapReady])

  useEffect(() => {
    if (!mapReady || !mapRef.current) return
    const map = mapRef.current

    const handlePointerMove = (event: MapMouseEvent) => {
      if (map.isMoving()) return
      const now = performance.now()
      if (now - lastCursorUpdateAtRef.current < CURSOR_UPDATE_THROTTLE_MS) return
      lastCursorUpdateAtRef.current = now
      const { lng, lat } = event.lngLat
      setCursorPosition({ lng, lat })
      requestElevationSample(lng, lat, map.getZoom())
    }

    const handleMouseOut = () => {
      lastCursorUpdateAtRef.current = 0
      setCursorPosition(null)
      setCursorElevation(prev => ({
        value: prev.value,
        status: demAvailable ? 'idle' : 'no-dem'
      }))
    }

    map.on('mousemove', handlePointerMove)
    map.on('mouseout', handleMouseOut)

    return () => {
      map.off('mousemove', handlePointerMove)
      map.off('mouseout', handleMouseOut)
    }
  }, [demAvailable, mapReady, requestElevationSample])

  useEffect(() => {
    return () => {
      removeTerrainSource()
    }
  }, [removeTerrainSource])

  useEffect(() => {
    const handleGlobalClick = () => {
      setContextMenu(null)
      if (identifyPopup) {
        handleCloseIdentifyPopup()
      }
    }
    window.addEventListener('click', handleGlobalClick)
    return () => window.removeEventListener('click', handleGlobalClick)
  }, [handleCloseIdentifyPopup, identifyPopup])

  /**
   * Custom interaction bindings
   */
  useEffect(() => {
    if (!mapReady || !mapRef.current || !mapContainerRef.current) return
    const map = mapRef.current
    const container = map.getCanvasContainer()
    const rotationBearingFactor = 0.25
    const rotationPitchFactor = 0.15
    const zoomFactor = 0.0033
    const inertiaDurationMs = 170
    const inertiaScale = 0.45
    const velocityBlend = 0.35
    const minVelocityForInertia = 0.06 // px/ms
    const maxExtraBearing = 5.5
    const maxExtraPitch = 3.0
    const maxExtraZoom = 0.45
    const markerId = 'rotation-center-marker'

    let rotateVelocity = { x: 0, y: 0 }
    let rotateLastSample: { x: number; y: number; t: number } | null = null
    let zoomVelocityY = 0
    let zoomLastSample: { y: number; t: number } | null = null

    const easeOutQuad = (t: number) => 1 - (1 - t) * (1 - t)

    const toContainerPoint = (event: MouseEvent): [number, number] => {
      const rect = container.getBoundingClientRect()
      return [event.clientX - rect.left, event.clientY - rect.top]
    }

    const toLngLatArray = (value: any): [number, number] => {
      if (Array.isArray(value)) return [value[0], value[1]]
      if (value && typeof value.lng === 'number' && typeof value.lat === 'number') {
        return [value.lng, value.lat]
      }
      return [0, 0]
    }

    const ensureRotationMarker = (lngLat: [number, number]) => {
      if (rotateMarkerIdRef.current && map.getSource(rotateMarkerIdRef.current)) {
        map.removeLayer(markerId)
        map.removeSource(markerId)
        rotateMarkerIdRef.current = null
      }

      map.addSource(markerId, {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'Point',
            coordinates: lngLat
          }
        }
      })

      map.addLayer({
        id: markerId,
        type: 'circle',
        source: markerId,
        paint: {
          'circle-radius': 6,
          'circle-color': '#10b981',
          'circle-stroke-color': '#065f46',
          'circle-stroke-width': 2,
          'circle-opacity': 0.9
        }
      })

      rotateMarkerIdRef.current = markerId
    }

    const clearRotationMarker = () => {
      if (rotateMarkerIdRef.current) {
        if (map.getLayer(markerId)) map.removeLayer(markerId)
        if (map.getSource(markerId)) map.removeSource(markerId)
        rotateMarkerIdRef.current = null
      }
    }

    const handleMouseDown = (event: MouseEvent) => {
      if (event.button === 1) {
        event.preventDefault()
        map.stop()
        const point = toContainerPoint(event)
        const around = toLngLatArray(map.unproject(point))
        isMiddleRotatingRef.current = true
        rotateVelocity = { x: 0, y: 0 }
        rotateLastSample = { x: event.clientX, y: event.clientY, t: performance.now() }
        rotationStartRef.current = {
          x: event.clientX,
          y: event.clientY,
          bearing: map.getBearing(),
          pitch: map.getPitch(),
          around
        }
        container.style.cursor = 'grab'
        ensureRotationMarker(around)
      } else if (event.button === 2) {
        event.preventDefault()
        map.stop()
        const point = toContainerPoint(event)
        const around = toLngLatArray(map.unproject(point))
        isRightZoomingRef.current = true
        hasMovedDuringRightClickRef.current = false
        zoomVelocityY = 0
        zoomLastSample = { y: event.clientY, t: performance.now() }
        zoomStartRef.current = {
          y: event.clientY,
          zoom: map.getZoom(),
          around
        }
        container.style.cursor = 'zoom-in'
        ensureRotationMarker(around)
      }
    }

    const handleMouseMove = (event: MouseEvent) => {
      if (isMiddleRotatingRef.current && rotationStartRef.current) {
        const now = performance.now()
        if (rotateLastSample) {
          const dt = Math.max(1, now - rotateLastSample.t)
          const instVx = (event.clientX - rotateLastSample.x) / dt
          const instVy = (event.clientY - rotateLastSample.y) / dt
          rotateVelocity.x = rotateVelocity.x * (1 - velocityBlend) + instVx * velocityBlend
          rotateVelocity.y = rotateVelocity.y * (1 - velocityBlend) + instVy * velocityBlend
        }
        rotateLastSample = { x: event.clientX, y: event.clientY, t: now }

        const dx = event.clientX - rotationStartRef.current.x
        const dy = event.clientY - rotationStartRef.current.y
        const newBearing = rotationStartRef.current.bearing + dx * rotationBearingFactor
        const rawPitch = rotationStartRef.current.pitch - dy * rotationPitchFactor
        const newPitch = Math.min(85, Math.max(0, rawPitch))

        map.rotateTo(newBearing, { around: rotationStartRef.current.around, animate: false } as any)
        map.setPitch(newPitch)
      } else if (isRightZoomingRef.current && zoomStartRef.current) {
        const now = performance.now()
        if (zoomLastSample) {
          const dt = Math.max(1, now - zoomLastSample.t)
          const instVy = (event.clientY - zoomLastSample.y) / dt
          zoomVelocityY = zoomVelocityY * (1 - velocityBlend) + instVy * velocityBlend
        }
        zoomLastSample = { y: event.clientY, t: now }

        const dy = event.clientY - zoomStartRef.current.y
        if (Math.abs(dy) > 2) {
          hasMovedDuringRightClickRef.current = true
        }
        const newZoom = zoomStartRef.current.zoom - dy * zoomFactor
        map.zoomTo(newZoom, { around: zoomStartRef.current.around, animate: false } as any)
      }
    }

    const handleMouseUp = (event: MouseEvent) => {
      if (event.button === 1) {
        const start = rotationStartRef.current
        const around = start?.around
        const movedEnough = !!start && (
          Math.abs(event.clientX - start.x) > 2 ||
          Math.abs(event.clientY - start.y) > 2
        )
        const rotateSpeed = Math.hypot(rotateVelocity.x, rotateVelocity.y)

        if (movedEnough && rotateSpeed > minVelocityForInertia) {
          const extraBearing = Math.max(
            -maxExtraBearing,
            Math.min(maxExtraBearing, rotateVelocity.x * rotationBearingFactor * inertiaDurationMs * inertiaScale)
          )
          const extraPitch = Math.max(
            -maxExtraPitch,
            Math.min(maxExtraPitch, -rotateVelocity.y * rotationPitchFactor * inertiaDurationMs * inertiaScale)
          )
          const targetPitch = Math.min(85, Math.max(0, map.getPitch() + extraPitch))

          if (Math.abs(extraBearing) > 0.01 || Math.abs(targetPitch - map.getPitch()) > 0.01) {
            const easeOptions: any = {
              bearing: map.getBearing() + extraBearing,
              pitch: targetPitch,
              duration: inertiaDurationMs,
              easing: easeOutQuad
            }
            if (around) {
              easeOptions.around = around
            }
            map.easeTo(easeOptions)
          }
        }

        isMiddleRotatingRef.current = false
        rotationStartRef.current = null
        rotateVelocity = { x: 0, y: 0 }
        rotateLastSample = null
        clearRotationMarker()
      } else if (event.button === 2) {
        const start = zoomStartRef.current
        const around = start?.around
        const hasVelocity = Math.abs(zoomVelocityY) > minVelocityForInertia
        if (hasMovedDuringRightClickRef.current && hasVelocity) {
          const extraZoom = Math.max(
            -maxExtraZoom,
            Math.min(maxExtraZoom, -zoomVelocityY * zoomFactor * inertiaDurationMs * inertiaScale)
          )
          const targetZoom = Math.max(
            map.getMinZoom(),
            Math.min(map.getMaxZoom(), map.getZoom() + extraZoom)
          )
          if (Math.abs(targetZoom - map.getZoom()) > 0.001) {
            const easeOptions: any = {
              zoom: targetZoom,
              duration: inertiaDurationMs,
              easing: easeOutQuad
            }
            if (around) {
              easeOptions.around = around
            }
            map.easeTo(easeOptions)
          }
        }

        isRightZoomingRef.current = false
        zoomStartRef.current = null
        zoomVelocityY = 0
        zoomLastSample = null
        clearRotationMarker()
      }
      container.style.cursor = ''
    }

    const handleContextMenu = (event: MouseEvent) => {
      event.preventDefault()
      if (hasMovedDuringRightClickRef.current) return

      const point = toContainerPoint(event)
      const lngLat = map.unproject(point)
      
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        lat: lngLat.lat,
        lng: lngLat.lng
      })
    }

    container.addEventListener('mousedown', handleMouseDown)
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    container.addEventListener('contextmenu', handleContextMenu)

    return () => {
      container.removeEventListener('mousedown', handleMouseDown)
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
      container.removeEventListener('contextmenu', handleContextMenu)
      container.style.cursor = ''
      isMiddleRotatingRef.current = false
      rotationStartRef.current = null
      rotateVelocity = { x: 0, y: 0 }
      rotateLastSample = null
      isRightZoomingRef.current = false
      zoomStartRef.current = null
      zoomVelocityY = 0
      zoomLastSample = null
      clearRotationMarker()
    }
  }, [mapReady])

  useEffect(() => {
    if (!mapReady) return
    managedLayers.forEach(layer => {
      applyVisibilityToMapLayer(layer, layer.visible)
      applyOpacityToMapLayer(layer, layer.opacity)
    })
    applyLayerOrder(managedLayers)
  }, [applyLayerOrder, applyOpacityToMapLayer, applyVisibilityToMapLayer, managedLayers, mapReady])

  const handleResetView = () => {
    const map = mapRef.current
    if (!map) return

    // Find AOI layer and zoom to its bounds if available
    const aoiLayer = managedLayers.find(l => l.isAoi && l.bounds)
    if (aoiLayer && aoiLayer.bounds) {
      map.fitBounds(aoiLayer.bounds as any, {
        padding: 80,
        duration: 1200
      })
    } else {
      // Fallback to default view if no AOI
      map.flyTo({
        center: [0, 20],
        zoom: 2,
        duration: 1200
      })
    }
  }

  const handleGoToCoordinates = useCallback((lng: number, lat: number) => {
    const map = mapRef.current
    if (!map) return

    const targetZoom = Math.max(map.getZoom(), 16)

    goToMarkerRequestIdRef.current += 1
    const requestId = goToMarkerRequestIdRef.current

    const clearExistingMarker = () => {
      const timeouts = goToMarkerTimeoutsRef.current
      if (timeouts.fade) {
        clearTimeout(timeouts.fade)
        timeouts.fade = null
      }
      if (timeouts.remove) {
        clearTimeout(timeouts.remove)
        timeouts.remove = null
      }

      if (goToMarkerRef.current) {
        try {
          goToMarkerRef.current.remove()
        } catch {
          // no-op
        }
        goToMarkerRef.current = null
      }
    }

    // If a previous GOTO marker exists, clear it immediately.
    clearExistingMarker()

    // Some environments can make `flyTo` resolve immediately (e.g. reduced motion).
    // Register the completion handler BEFORE calling flyTo, and keep a timeout fallback.
    let dropped = false
    let fallback: ReturnType<typeof setTimeout> | null = null

    const dropMarker = () => {
      if (dropped) return
      dropped = true

      if (fallback) {
        clearTimeout(fallback)
        fallback = null
      }
      map.off('moveend', onMoveEnd)

      if (goToMarkerRequestIdRef.current !== requestId) return

      void (async () => {
        try {
          const maplibreModule = await import('maplibre-gl')
          if (goToMarkerRequestIdRef.current !== requestId) return

          const el = document.createElement('div')
          el.style.position = 'absolute'
          el.style.width = '26px'
          el.style.height = '26px'
          el.style.borderRadius = '9999px'
          el.style.boxSizing = 'border-box'
          el.style.border = '2px solid rgba(255,255,255,0.85)'
          el.style.background = 'rgba(0,0,0,0.25)'
          el.style.boxShadow = '0 0 22px rgba(0,0,0,0.65), inset 0 0 0 2px hsl(var(--primary))'
          el.style.opacity = '1'
          el.style.pointerEvents = 'none'
          el.style.zIndex = '999'

          const dot = document.createElement('div')
          dot.style.position = 'absolute'
          dot.style.left = '50%'
          dot.style.top = '50%'
          dot.style.width = '6px'
          dot.style.height = '6px'
          dot.style.borderRadius = '9999px'
          dot.style.transform = 'translate(-50%, -50%)'
          dot.style.background = 'rgba(255,255,255,0.9)'
          dot.style.boxShadow = '0 0 10px rgba(0,0,0,0.55)'
          el.appendChild(dot)

          // Ensure we don't keep an older marker around if multiple completions fired.
          clearExistingMarker()

          const marker = new maplibreModule.Marker({ element: el, anchor: 'center' }).setLngLat([lng, lat]).addTo(map)
          goToMarkerRef.current = marker

          // Fade out and remove within 10 seconds.
          goToMarkerTimeoutsRef.current.fade = setTimeout(() => {
            el.style.transition = 'opacity 9000ms ease-out'
            requestAnimationFrame(() => {
              el.style.opacity = '0'
            })
          }, 1000)

          goToMarkerTimeoutsRef.current.remove = setTimeout(() => {
            try {
              marker.remove()
            } catch {
              // no-op
            }
            if (goToMarkerRef.current === marker) goToMarkerRef.current = null
            goToMarkerTimeoutsRef.current.fade = null
            goToMarkerTimeoutsRef.current.remove = null
          }, 10000)
        } catch (e) {
          console.error('Failed to render GOTO marker:', e)
        }
      })()
    }

    const onMoveEnd = () => {
      dropMarker()
    }

    map.on('moveend', onMoveEnd)

    map.flyTo({
      center: [lng, lat],
      zoom: targetZoom,
      duration: 1200,
      essential: true
    })
    setToast({ message: 'Zoomed to Coordinates', type: 'info' })

    // Fallback in case we don't get a moveend (or it already fired).
    fallback = setTimeout(() => {
      dropMarker()
    }, 1400)
  }, [])

  const handleRefreshAll = () => {
    resetBasemapFailureTracking()
    removeBasemapLayers()
    addBaseLayers()
    loadProjectLayers()
  }

  const handleToggleVisibility = (layerId: string) => {
    const layer = managedLayers.find(l => l.id === layerId)
    if (!layer) return
    const nextVisible = !layer.visible
    applyVisibilityToMapLayer(layer, nextVisible)
    setManagedLayers(prev => {
      const next = prev.map(l => (l.id === layerId ? { ...l, visible: nextVisible } : l))
      saveLayerSession(currentProject, next)
      return next
    })
  }

  const handleOpacityChange = (layerId: string, value: number) => {
    const layer = managedLayers.find(l => l.id === layerId)
    if (!layer) return
    applyOpacityToMapLayer(layer, value)
    setManagedLayers(prev => {
      const next = prev.map(l => (l.id === layerId ? { ...l, opacity: value } : l))
      saveLayerSession(currentProject, next)
      return next
    })
  }

  const handleMoveLayer = (layerId: string, direction: 'up' | 'down') => {
    setManagedLayers(prev => {
      const index = prev.findIndex(l => l.id === layerId)
      if (index === -1) return prev

      const targetIndex = direction === 'up' ? index + 1 : index - 1
      if (targetIndex < 0 || targetIndex >= prev.length) return prev

      const updated = [...prev]
      const [removed] = updated.splice(index, 1)
      updated.splice(targetIndex, 0, removed)

      return updated.map((layer, idx) => ({ ...layer, order: idx }))
    })
  }

  const handleReorderLayers = (draggedId: string, targetId: string, dropPosition: 'above' | 'below') => {
    setManagedLayers(prev => {
      const draggedIndex = prev.findIndex(l => l.id === draggedId)
      const targetIndex = prev.findIndex(l => l.id === targetId)
      
      if (draggedIndex === -1 || targetIndex === -1 || draggedIndex === targetIndex) return prev

      const updated = [...prev]
      const [removed] = updated.splice(draggedIndex, 1)
      
      // We need to find the index of the target again because splice shifted things
      let newTargetIndex = updated.findIndex(l => l.id === targetId)
      
      // In managedLayers (ascending order), "above" in UI (top of stack) means HIGHER index.
      // "below" in UI means LOWER index.
      // If we drop "above" target, we want to insert AFTER target in the array (higher index).
      // If we drop "below" target, we want to insert BEFORE target in the array (lower index).
      
      if (dropPosition === 'above') {
        newTargetIndex += 1
      } 
      // if 'below', we insert at newTargetIndex (which puts it before/below the target in stack)

      updated.splice(newTargetIndex, 0, removed)

      return updated.map((layer, idx) => ({ ...layer, order: idx }))
    })
  }

  const handleZoomToLayer = (layerId: string) => {
    const layer = managedLayers.find(l => l.id === layerId)
    if (!layer || !layer.bounds || !mapRef.current) return
    
    mapRef.current.fitBounds(layer.bounds as any, {
        padding: 80,
        duration: 900,
        maxZoom: 16
    })
  }

  const handleZoomToCrossing = useCallback((lng: number, lat: number) => {
    const map = mapRef.current
    if (!map) return
    map.flyTo({
      center: [lng, lat],
      zoom: Math.max(map.getZoom(), 15),
      duration: 900
    })
  }, [])

  const projectSummary = useMemo(() => {
    return currentProject
      ? `${currentProject} · ${datasets?.vectors.length ?? 0} vectors · ${datasets?.rasters.length ?? 0} rasters`
      : 'Select a project to load datasets'
  }, [currentProject, datasets])

  const selectedLayer = managedLayers.find(layer => layer.id === selectedLayerId)
  const selectedDetails = selectedLayer ? vectorDetails[selectedLayer.id] : null
  const fullTableLayer = managedLayers.find(layer => layer.id === fullTableLayerId)
  const fullTableDetails = fullTableLayer
    ? preloadedTables[fullTableLayer.id] || vectorDetails[fullTableLayer.id]
    : null

  const sortedFullRows = useMemo(() => {
    if (!fullTableDetails) return []
    const { column, direction } = sortConfig
    const basePairs = fullTableDetails.rows.map((row, idx) => ({
      row,
      feature: fullTableDetails.features?.[idx]
    }))
    if (!column) return basePairs

    if (fullTableDetails.sortedCache && fullTableDetails.sortedCache.column === column && fullTableDetails.sortedCache.direction === direction) {
      return fullTableDetails.sortedCache.pairs
    }

    const pairs = [...basePairs]
    pairs.sort((a, b) => {
      const av = a.row?.[column]
      const bv = b.row?.[column]
      if (av === bv) return 0
      if (av === undefined || av === null) return 1
      if (bv === undefined || bv === null) return -1
      if (typeof av === 'number' && typeof bv === 'number') {
        return direction === 'asc' ? av - bv : bv - av
      }
      return direction === 'asc'
        ? String(av ?? '').localeCompare(String(bv ?? ''))
        : String(bv ?? '').localeCompare(String(av ?? ''))
    })
    return pairs
  }, [fullTableDetails, sortConfig])

  useEffect(() => {
    if (selectedLayer && selectedLayer.type === 'vector') {
      const details = vectorDetails[selectedLayer.id]
      if (details) {
        if (!details.sortedCache && details.properties.length > 0) {
          const column = details.properties[0]
          const pairs = details.rows.map((row, idx) => ({
            row,
            feature: details.features?.[idx]
          }))
          pairs.sort((a, b) => {
            const av = a.row?.[column]
            const bv = b.row?.[column]
            if (av === bv) return 0
            if (av === undefined || av === null) return 1
            if (bv === undefined || bv === null) return -1
            if (typeof av === 'number' && typeof bv === 'number') {
              return av - bv
            }
            return String(av ?? '').localeCompare(String(bv ?? ''))
          })
          details.sortedCache = { column, direction: 'asc', pairs }
        }

        setPreloadedTables((prev) => ({
          ...prev,
          [selectedLayer.id]: details
        }))
        if (!sortConfig.column && details.properties.length > 0) {
          setSortConfig({ column: details.properties[0], direction: 'asc' })
        }
      }
    }
  }, [selectedLayer, vectorDetails, sortConfig.column])

  const ensureHighlightLayers = useCallback(() => {
    const map = mapRef.current
    if (!map) return
    const sourceId = highlightSourceId.current
    if (!map.getSource(sourceId)) {
      map.addSource(sourceId, {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: []
        }
      })
      map.addLayer({
        id: highlightLayerIds.current[0],
        type: 'fill',
        source: sourceId,
        paint: {
          'fill-color': '#22d3ee',
          'fill-opacity': 0.35
        }
      })
      map.addLayer({
        id: highlightLayerIds.current[1],
        type: 'line',
        source: sourceId,
        paint: {
          'line-color': '#06b6d4',
          'line-width': 3,
          'line-opacity': 0.9
        }
      })
      map.addLayer({
        id: highlightLayerIds.current[2],
        type: 'circle',
        source: sourceId,
        paint: {
          'circle-radius': 6,
          'circle-color': '#22d3ee',
          'circle-stroke-color': '#0f172a',
          'circle-stroke-width': 2,
          'circle-opacity': 0.9
        }
      })
    }
  }, [])

  const showFeatureHighlight = useCallback((feature: any, fitBounds: boolean = true) => {
    const map = mapRef.current
    if (!map || !feature) return
    ensureHighlightLayers()
    // Ensure highlight stays above all other layers (especially dynamically added PIRL routes).
    // Order matters: fill -> line -> point so points render on top.
    highlightLayerIds.current.forEach((layerId) => {
      if (map.getLayer(layerId)) {
        map.moveLayer(layerId)
      }
    })
    const source = map.getSource(highlightSourceId.current) as any
    if (source?.setData) {
      source.setData({
        type: 'FeatureCollection',
        features: [feature]
      })
    }
    if (fitBounds) {
      const bounds = featureBounds(feature)
      if (bounds) {
        map.fitBounds(bounds as any, { padding: 60, duration: 350, maxZoom: Math.min(map.getMaxZoom(), 18) })
      }
    }
  }, [ensureHighlightLayers])

  const showGeojsonHighlight = useCallback((geojson: any, fitBounds: boolean = true) => {
    const map = mapRef.current
    if (!map || !geojson) return
    ensureHighlightLayers()
    // Keep highlight above all other layers.
    // Order matters: fill -> line -> point so points render on top.
    highlightLayerIds.current.forEach((layerId) => {
      if (map.getLayer(layerId)) {
        map.moveLayer(layerId)
      }
    })

    let fc: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }
    if (geojson?.type === 'FeatureCollection' && Array.isArray(geojson.features)) {
      fc = geojson as GeoJSON.FeatureCollection
    } else if (geojson?.type === 'Feature' && geojson?.geometry) {
      fc = { type: 'FeatureCollection', features: [geojson as GeoJSON.Feature] }
    } else if (geojson?.type) {
      // Assume Geometry
      fc = geometryToFeatureCollection(geojson as GeoJSON.Geometry)
    }

    const source = map.getSource(highlightSourceId.current) as any
    if (source?.setData) {
      source.setData(fc as any)
    }

    if (fitBounds) {
      const bounds = getGeoJSONBounds(fc as any)
      if (bounds) {
        map.fitBounds(bounds as any, { padding: 60, duration: 350, maxZoom: Math.min(map.getMaxZoom(), 18) })
      }
    }
  }, [ensureHighlightLayers])

  const updateHighlightColor = useCallback((assessment: AssessmentLevel) => {
    const map = mapRef.current
    if (!map) return
    const color = getAssessmentMapColor(assessment)
    // Update highlight layer colors based on assessment
    if (map.getLayer(highlightLayerIds.current[0])) {
      map.setPaintProperty(highlightLayerIds.current[0], 'fill-color', color)
      map.setPaintProperty(highlightLayerIds.current[0], 'fill-opacity', 0.4)
    }
    if (map.getLayer(highlightLayerIds.current[1])) {
      map.setPaintProperty(highlightLayerIds.current[1], 'line-color', color)
      map.setPaintProperty(highlightLayerIds.current[1], 'line-width', 4)
    }
    if (map.getLayer(highlightLayerIds.current[2])) {
      map.setPaintProperty(highlightLayerIds.current[2], 'circle-color', color)
    }
  }, [])

  const handleRowDoubleClick = useCallback(
    (feature: any) => {
      if (!feature) return
      showFeatureHighlight(feature)
    },
    [showFeatureHighlight]
  )

  const applyStyleToMapLayer = useCallback(
    (layerId: string, opts: LayerStyleOptions) => {
      const map = mapRef.current
      if (!map) return
      const layer = managedLayers.find((l) => l.id === layerId)
      if (!layer) return

      if (layer.type === 'raster') {
        layer.layerIds.forEach((id) => {
          if (map.getLayer(id) && opts.opacity !== undefined) {
            map.setPaintProperty(id, 'raster-opacity', opts.opacity)
          }
        })
        return
      }

      layer.layerIds.forEach((id) => {
        if (!map.getLayer(id)) return
        if (id.includes('fill')) {
          if (opts.fillColor) map.setPaintProperty(id, 'fill-color', opts.fillColor)
          if (opts.opacity !== undefined) map.setPaintProperty(id, 'fill-opacity', opts.opacity)
        } else if (id.includes('line') || id.includes('outline')) {
          if (opts.lineColor) map.setPaintProperty(id, 'line-color', opts.lineColor)
          if (opts.lineWidth !== undefined) map.setPaintProperty(id, 'line-width', opts.lineWidth)
          if (opts.opacity !== undefined) map.setPaintProperty(id, 'line-opacity', opts.opacity)
          // Apply line dash pattern with fixed pixel distances
          if (opts.lineStyle !== undefined) {
            const lineWidth = opts.lineWidth ?? 2
            if (opts.lineStyle === 'solid') {
              // Solid line - remove dasharray by setting empty array
              map.setPaintProperty(id, 'line-dasharray', [])
            } else {
              // Calculate dasharray for fixed pixel appearance
              const dasharray = getDasharrayForWidth(opts.lineStyle as LineStyle, lineWidth)
              map.setPaintProperty(id, 'line-dasharray', dasharray)
            }
          }
        } else if (id.includes('points')) {
          if (opts.pointColor) map.setPaintProperty(id, 'circle-color', opts.pointColor)
          if (opts.pointSize !== undefined) map.setPaintProperty(id, 'circle-radius', opts.pointSize)
          if (opts.opacity !== undefined) map.setPaintProperty(id, 'circle-opacity', opts.opacity)
        }
      })
    },
    [managedLayers]
  )

  // Handlers
  const handleCloseTable = useCallback(() => setFullTableLayerId(null), [])
  const handleToggleDock = useCallback(() => setFullTableDocked(d => !d), [])
  const handleSort = useCallback((prop: string) => {
    setSortConfig((prev) => ({
      column: prop,
      direction: prev.column === prop && prev.direction === 'asc' ? 'desc' : 'asc'
    }))
  }, [])

  const handleOpenTable = useCallback((id: string) => {
    setFullTableLayerId(id)
    setVectorDetails(prev => {
      const details = prev[id]
      if (details?.properties.length) {
        setSortConfig({ column: details.properties[0], direction: 'asc' })
      }
      return prev
    })
  }, [])

  const handleOpenStyle = useCallback((id: string) => {
    setStyleLayerId(id)
    setStyleDraft(prev => {
      return prev
    })
  }, [])

  // ============================================================================
  // Operator Mode actions (CRUD + geometry editing)
  // ============================================================================

  const handleCloseCreatorEditor = useCallback(() => {
    setCreatorEditor(null)
    creatorDrawRef.current?.deleteAll()
  }, [])

  const handleCreatorSave = useCallback(async () => {
    if (!currentProject || !creatorEditor) return

    const editor = creatorEditor
    setCreatorEditor(prev => (prev ? { ...prev, saving: true, error: null } : prev))

    try {
      if (editor.mode === 'create') {
        const formData = new FormData()
        formData.append('entry_type', editor.entryType)
        formData.append('title', editor.title)
        formData.append('category', editor.category)
        if (editor.category === 'Other') {
          formData.append('category_other', editor.categoryOther)
        }
        formData.append('comment', editor.comment)
        formData.append('datasets', JSON.stringify(editor.datasets ?? []))
        if (editor.sortie?.id) {
          formData.append('sortie_id', editor.sortie.id)
        }
        formData.append('survey_json', JSON.stringify(editor.survey ?? {}))
        formData.append('dataset_features_json', JSON.stringify(editor.datasetFeatures ?? []))
        formData.append('geometry_wgs84', JSON.stringify(editor.geometryWgs84))
        editor.newFiles.forEach((file) => formData.append('attachments', file))

        const created = await createCreatorEntry(currentProject, formData)
        setToast({ message: 'Operator entry created', type: 'success' })

        // Keep the dialog open and transition into the "thread" (edit/info) view for the newly created entry.
        let log: any[] | null = null
        try {
          const rows = await getCreatorEntryChangelog(currentProject, created.id)
          log = Array.isArray(rows) ? rows : []
        } catch {
          log = []
        }

        setCreatorEditor((prev) => {
          if (!prev) return prev
          return {
            ...prev,
            mode: 'edit',
            section: 'info',
            entryId: created.id,
            entryType: created.type,
            geometryWgs84: created.geometry_wgs84,
            title: created.title ?? '',
            category: (created.category as CreatorCategory) ?? 'Engineering',
            categoryOther: created.category_other ?? '',
            // In edit mode we treat `comment` as a "new post" draft (thread). Clear after save.
            comment: '',
            datasets: Array.isArray((created as any).datasets) ? ((created as any).datasets as CreatorDatasetRef[]) : [],
            datasetFeatures: Array.isArray((created as any).dataset_features)
              ? ((created as any).dataset_features as CreatorDatasetFeatureSelection[])
              : [],
            survey: ((created as any).survey && typeof (created as any).survey === 'object'
              ? ((created as any).survey as CreatorSurvey)
              : prev.survey),
            existingAttachments: Array.isArray((created as any).attachments) ? ((created as any).attachments as CreatorAttachment[]) : [],
            removedAttachments: [],
            newFiles: [],
            loading: false,
            saving: false,
            error: null,
            changelogOpen: false,
            changelog: log
          }
        })

        await refreshCreatorLayer()
        return
      } else {
        if (!editor.entryId) throw new Error('Missing entryId')
        const formData = new FormData()
        formData.append('title', editor.title)
        formData.append('category', editor.category)
        formData.append('category_other', editor.category === 'Other' ? editor.categoryOther : '')
        const trimmedComment = (editor.comment || '').trim()
        // Thread semantics: only send comment when the user is posting a *new* note.
        // This avoids overwriting existing notes when the user is just attaching files.
        if (trimmedComment) {
          formData.append('comment', trimmedComment)
        }
        formData.append('datasets', JSON.stringify(editor.datasets ?? []))
        if (editor.sortie?.id) {
          formData.append('sortie_id', editor.sortie.id)
        }
        formData.append('survey_json', JSON.stringify(editor.survey ?? {}))
        formData.append('dataset_features_json', JSON.stringify(editor.datasetFeatures ?? []))
        if (editor.removedAttachments.length > 0) {
          formData.append('remove_attachments', JSON.stringify(editor.removedAttachments))
        }
        editor.newFiles.forEach((file) => formData.append('attachments', file))

        const updated = await updateCreatorEntry(currentProject, editor.entryId, formData)
        setToast({ message: 'Operator entry updated', type: 'success' })

        let log: any[] | null = null
        try {
          const rows = await getCreatorEntryChangelog(currentProject, editor.entryId)
          log = Array.isArray(rows) ? rows : []
        } catch {
          log = null
        }

        setCreatorEditor((prev) => {
          if (!prev || prev.entryId !== editor.entryId) return prev
          return {
            ...prev,
            section: 'info',
            // Clear draft inputs after posting
            comment: '',
            removedAttachments: [],
            newFiles: [],
            saving: false,
            error: null,
            // Refresh any server-updated fields
            title: updated.title ?? prev.title,
            category: ((updated as any).category as CreatorCategory) ?? prev.category,
            categoryOther: (updated as any).category_other ?? prev.categoryOther,
            geometryWgs84: (updated as any).geometry_wgs84 ?? prev.geometryWgs84,
            datasets: Array.isArray((updated as any).datasets) ? ((updated as any).datasets as CreatorDatasetRef[]) : prev.datasets,
            datasetFeatures: Array.isArray((updated as any).dataset_features)
              ? ((updated as any).dataset_features as CreatorDatasetFeatureSelection[])
              : prev.datasetFeatures,
            survey: ((updated as any).survey && typeof (updated as any).survey === 'object'
              ? ((updated as any).survey as CreatorSurvey)
              : prev.survey),
            existingAttachments: Array.isArray((updated as any).attachments) ? ((updated as any).attachments as CreatorAttachment[]) : prev.existingAttachments,
            changelog: Array.isArray(log) ? log : prev.changelog
          }
        })

        await refreshCreatorLayer()
        return
      }
    } catch (error) {
      setCreatorEditor(prev => (prev ? { ...prev, saving: false, error: error instanceof Error ? error.message : 'Save failed.' } : prev))
    }
  }, [currentProject, creatorEditor, refreshCreatorLayer])

  const handleCreatorDelete = useCallback(async () => {
    if (!currentProject || !creatorEditor || creatorEditor.mode !== 'edit' || !creatorEditor.entryId) return
    const entryId = creatorEditor.entryId
    setCreatorEditor(prev => (prev ? { ...prev, saving: true, error: null } : prev))
    try {
      await deleteCreatorEntry(currentProject, entryId)
      setToast({ message: 'Operator entry deleted (soft delete)', type: 'info' })
      setCreatorEditor(null)
      creatorDrawRef.current?.deleteAll()
      await refreshCreatorLayer()
    } catch (error) {
      setCreatorEditor(prev => (prev ? { ...prev, saving: false, error: error instanceof Error ? error.message : 'Delete failed.' } : prev))
    }
  }, [currentProject, creatorEditor, refreshCreatorLayer])

  const handleCreatorToggleChangelog = useCallback(async () => {
    if (!currentProject || !creatorEditor || creatorEditor.mode !== 'edit' || !creatorEditor.entryId) return

    // Close if open
    if (creatorEditor.changelogOpen) {
      setCreatorEditor(prev => (prev ? { ...prev, changelogOpen: false } : prev))
      return
    }

    setCreatorEditor(prev => (prev ? { ...prev, changelogOpen: true, changelog: prev.changelog } : prev))
    try {
      const rows = await getCreatorEntryChangelog(currentProject, creatorEditor.entryId)
      setCreatorEditor(prev => {
        if (!prev || prev.entryId !== creatorEditor.entryId) return prev
        return { ...prev, changelog: Array.isArray(rows) ? rows : [] }
      })
    } catch (error) {
      setCreatorEditor(prev => {
        if (!prev || prev.entryId !== creatorEditor.entryId) return prev
        return { ...prev, changelog: [], error: error instanceof Error ? error.message : 'Failed to load changelog.' }
      })
    }
  }, [currentProject, creatorEditor])

  const handleStartCreatorGeometryEdit = useCallback(() => {
    if (!currentProject || !creatorEditor || creatorEditor.mode !== 'edit' || !creatorEditor.entryId) return
    const map = mapRef.current
    if (!map) return
    const draw = ensureCreatorDraw()
    if (!draw) return

    creatorInteractionLockRef.current = true

    // Clear any pending create listeners
    if (creatorDrawCreateHandlerRef.current) {
      map.off('draw.create', creatorDrawCreateHandlerRef.current as any)
      creatorDrawCreateHandlerRef.current = null
    }

    draw.deleteAll()
    const feature: any = {
      type: 'Feature',
      properties: {},
      geometry: creatorEditor.geometryWgs84
    }
    const ids = draw.add(feature)
    const drawId = Array.isArray(ids) ? ids[0] : ids
    try {
      draw.changeMode('simple_select', { featureIds: [drawId] } as any)
    } catch {
      // ignore
    }

    setCreatorGeometryEdit({
      entryId: creatorEditor.entryId,
      entryType: creatorEditor.entryType,
      drawId: String(drawId),
      x: creatorEditor.x,
      y: creatorEditor.y
    })
    setCreatorEditor(null)
  }, [creatorEditor, currentProject, ensureCreatorDraw])

  const handleCancelCreatorGeometryEdit = useCallback(() => {
    const edit = creatorGeometryEdit
    creatorDrawRef.current?.deleteAll()
    creatorInteractionLockRef.current = false
    setCreatorGeometryEdit(null)
    if (edit) {
      void openCreatorEditEditor(edit.entryId, edit.x, edit.y)
    }
  }, [creatorGeometryEdit, openCreatorEditEditor])

  const handleSaveCreatorGeometryEdit = useCallback(async () => {
    if (!currentProject || !creatorGeometryEdit) return
    const draw = creatorDrawRef.current
    if (!draw) return

    const all = draw.getAll() as any
    const geometry = all?.features?.[0]?.geometry as GeoJSON.Geometry | undefined
    if (!geometry) {
      setToast({ message: 'No geometry to save', type: 'info' })
      return
    }

    try {
      const formData = new FormData()
      formData.append('geometry_wgs84', JSON.stringify(geometry))
      await updateCreatorEntry(currentProject, creatorGeometryEdit.entryId, formData)

      const { entryId, x, y } = creatorGeometryEdit
      creatorDrawRef.current?.deleteAll()
      creatorInteractionLockRef.current = false
      setCreatorGeometryEdit(null)
      await refreshCreatorLayer()
      setToast({ message: 'Geometry updated', type: 'success' })
      void openCreatorEditEditor(entryId, x, y)
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : 'Failed to update geometry', type: 'info' })
    }
  }, [creatorGeometryEdit, currentProject, refreshCreatorLayer, openCreatorEditEditor])

  // Segment analysis handlers
  const handleSegmentClick = useCallback((e: MapMouseEvent) => {
    // Don't treat the second click of a double-click as a "toggle off" click.
    const clickCount = (e.originalEvent as MouseEvent | undefined)?.detail
    if (typeof clickCount === 'number' && clickCount > 1) return
    if (mapMode !== 'routing') return
    if (creatorInteractionLockRef.current) return

    const map = mapRef.current
    if (!map) return

    // If the user clicked a crossing marker, do not treat this click as a segment selection.
    try {
      if (map.getLayer(ROUTE_CROSSINGS_LAYER_MARKER_ID)) {
        const crossingHits = map.queryRenderedFeatures(e.point, { layers: [ROUTE_CROSSINGS_LAYER_MARKER_ID] })
        if (Array.isArray(crossingHits) && crossingHits.length > 0) return
      }
    } catch {
      // ignore
    }

    // Only allow AI segment selection for PIRL/Agentic routes (rendered as agentic-route-* layers).
    const style = map.getStyle()
    const agenticLineLayerIds =
      style?.layers
        ?.map(l => l.id)
        .filter(id => id.startsWith('agentic-route-') && id.endsWith('-line')) ?? []

    if (agenticLineLayerIds.length === 0) return

    const features = map.queryRenderedFeatures(e.point, { layers: agenticLineLayerIds })

    // Find a feature that looks like a route segment (has segment_id or similar property)
    const segmentFeature = features.find(f => {
      const props = f.properties || {}
      return props.segment_id || props.segmentId || props.SEGMENT_ID || props.id || (f as any).id
    })

    if (segmentFeature) {
      const props = segmentFeature.properties || {}
      // Ensure segment_id is a string (GeoJSON may store it as a number)
      const rawSegmentId = props.segment_id ?? props.segmentId ?? props.SEGMENT_ID ?? props.id ?? segmentFeature.id
      const segmentId = String(rawSegmentId)

      const parseRouteId = (value: string): string | null => {
        if (!value.startsWith('agentic-route-')) return null
        let rest = value.slice('agentic-route-'.length)
        if (rest.endsWith('-line')) rest = rest.slice(0, -'-line'.length)
        if (rest.endsWith('-points')) rest = rest.slice(0, -'-points'.length)
        return rest || null
      }

      const routeId =
        parseRouteId(String((segmentFeature as any).source ?? '')) ??
        parseRouteId(String((segmentFeature.layer as any)?.id ?? '')) ??
        null

      if (!routeId) return

      // Toggle selection
      if (selectedSegmentId === segmentId && selectedRouteId === routeId) {
        setSelectedSegmentId(null)
        setSelectedRouteId(null)
        // Clear highlight
        const source = map.getSource(highlightSourceId.current) as any
        if (source?.setData) {
          source.setData({ type: 'FeatureCollection', features: [] })
        }
      } else {
        setSelectedSegmentId(segmentId)
        setSelectedRouteId(routeId)
        // Highlight the selected segment
        showFeatureHighlight(segmentFeature)
      }

      // Clear previous analysis and decisions when selection changes
      setAnalysisResult(null)
      setAnalysisError(null)
      setDecisionsData(null)
      setDecisionsError(null)
    }
  }, [mapMode, selectedRouteId, selectedSegmentId, showFeatureHighlight])

  const handleFeatureDoubleClick = useCallback((e: MapMouseEvent) => {
    if (creatorInteractionLockRef.current) return
    const map = mapRef.current
    if (!map) return

    const features = map.queryRenderedFeatures(e.point)
    const isAppVectorLayer = (layerId: string) => layerId.startsWith('vector-') || layerId.startsWith('agentic-route-')
    const isHighlightLayer = (layerId: string) => layerId.startsWith('selected-feature-')

    const candidates = features.filter((f) => {
      const layerId = String((f.layer as any)?.id ?? '')
      if (!layerId) return false
      if (isHighlightLayer(layerId)) return false
      return isAppVectorLayer(layerId)
    })

    if (candidates.length === 0) return

    // Prefer lines for "segment" interactions, then fall back to topmost.
    const target =
      candidates.find((f) => String((f.layer as any)?.type ?? '') === 'line') ??
      candidates[0]

    // Prevent default double-click zoom so we can "zoom to feature" instead.
    e.preventDefault()

    // Close other popups
    setContextMenu(null)

    // Highlight + zoom to clicked feature
    showFeatureHighlight(target, true)

    const props = (target.properties || {}) as Record<string, any>
    const layerId = String((target.layer as any)?.id ?? '')

    const pretty = (value: any) => {
      if (value === null || value === undefined) return '—'
      if (typeof value === 'string') return value
      if (typeof value === 'number' || typeof value === 'boolean') return String(value)
      try {
        return JSON.stringify(value)
      } catch {
        return String(value)
      }
    }

    const parseVectorDatasetName = (id: string): string | null => {
      if (!id.startsWith('vector-')) return null
      return id
        .slice('vector-'.length)
        .replace(/-(fill|outline|line|points)$/, '') || null
    }

    const parseAgenticRouteName = (id: string): string | null => {
      if (!id.startsWith('agentic-route-')) return null
      return id
        .slice('agentic-route-'.length)
        .replace(/-(line|points)$/, '') || null
    }

    const datasetName = parseVectorDatasetName(layerId)
    const routeName = parseAgenticRouteName(layerId) ?? parseAgenticRouteName(String((target as any).source ?? ''))

    const title = routeName ? `PIRL Route · ${routeName}` : (datasetName ? datasetName : (layerId || 'Feature'))

    const idCandidate =
      (target as any).id ??
      props.segment_id ??
      props.segmentId ??
      props.SEGMENT_ID ??
      props.id ??
      props.ID ??
      null
    const featureId = idCandidate !== null && idCandidate !== undefined ? String(idCandidate) : null

    const rows = Object.keys(props)
      .sort((a, b) => a.localeCompare(b))
      .map((key) => ({ key, value: pretty(props[key]) }))

    const rawX = (e.originalEvent as MouseEvent).clientX
    const rawY = (e.originalEvent as MouseEvent).clientY

    // Clamp popup to viewport using a conservative estimated size.
    const EST_W = 380
    const EST_H = 300
    const MARGIN = 12
    const offset = 10
    const maxX = Math.max(MARGIN, (window.innerWidth || 0) - EST_W - MARGIN)
    const maxY = Math.max(MARGIN, (window.innerHeight || 0) - EST_H - MARGIN)
    const x = Math.max(MARGIN, Math.min(rawX + offset, maxX))
    const y = Math.max(MARGIN, Math.min(rawY + offset, maxY))

    setIdentifyPopup({
      x,
      y,
      lat: e.lngLat.lat,
      lng: e.lngLat.lng,
      title,
      featureId,
      geometryType: (target.geometry as any)?.type ? String((target.geometry as any).type) : null,
      rows
    })
  }, [showFeatureHighlight])

  const handleAnalyze = useCallback(async () => {
    if (!selectedSegmentId || !selectedRouteId) return

    setAnalysisLoading(true)
    setAnalysisError(null)
    setShowAnalysisPanel(true)

    // Also fetch and show decisions data
    setDecisionsLoading(true)
    setDecisionsError(null)
    setShowDecisionsPanel(true)

    // Fetch AI analysis and decisions data in parallel
    const analysisPromise = analyzeSegments(selectedRouteId, [selectedSegmentId])
    const decisionsPromise = getSegmentDecisions(selectedRouteId, selectedSegmentId, currentProject || undefined)

    // Handle AI analysis
    try {
      const results = await analysisPromise
      if (results.length > 0) {
        setAnalysisResult(results[0])
        // Update highlight color based on assessment
        updateHighlightColor(results[0].overall_assessment)
      } else {
        setAnalysisError('No analysis results returned')
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Analysis failed'
      setAnalysisError(message)
    } finally {
      setAnalysisLoading(false)
    }

    // Handle decisions data
    try {
      const decisions = await decisionsPromise
      if (decisions) {
        setDecisionsData(decisions)
      } else {
        setDecisionsData(null)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load decisions data'
      setDecisionsError(message)
    } finally {
      setDecisionsLoading(false)
    }
  }, [selectedSegmentId, selectedRouteId, currentProject, updateHighlightColor])

  const resetHighlightColor = useCallback(() => {
    const map = mapRef.current
    if (!map) return
    // Reset to default cyan highlight
    if (map.getLayer(highlightLayerIds.current[0])) {
      map.setPaintProperty(highlightLayerIds.current[0], 'fill-color', '#22d3ee')
      map.setPaintProperty(highlightLayerIds.current[0], 'fill-opacity', 0.35)
    }
    if (map.getLayer(highlightLayerIds.current[1])) {
      map.setPaintProperty(highlightLayerIds.current[1], 'line-color', '#06b6d4')
      map.setPaintProperty(highlightLayerIds.current[1], 'line-width', 3)
    }
    if (map.getLayer(highlightLayerIds.current[2])) {
      map.setPaintProperty(highlightLayerIds.current[2], 'circle-color', '#22d3ee')
    }
  }, [])

  const handleCloseAnalysisPanel = useCallback(() => {
    setShowAnalysisPanel(false)
    setAnalysisResult(null)
    setAnalysisError(null)
    // Also close decisions panel when closing analysis
    setShowDecisionsPanel(false)
    setDecisionsData(null)
    setDecisionsError(null)
    resetHighlightColor()
  }, [resetHighlightColor])

  const handleCloseDecisionsPanel = useCallback(() => {
    setShowDecisionsPanel(false)
    setDecisionsData(null)
    setDecisionsError(null)
  }, [])

  // Load agentic route onto map
  const handleLoadAgenticRoute = useCallback((routeId: string, geojson: GeoJSON.FeatureCollection) => {
    const map = mapRef.current
    if (!map) return

    const sourceId = `agentic-route-${routeId}`
    const lineLayerId = `${sourceId}-line`
    const pointsLayerId = `${sourceId}-points`

    // Remove existing if present
    if (map.getLayer(lineLayerId)) {
      try {
        map.removeLayer(lineLayerId)
      } catch (error) {
        console.warn(`Failed to remove layer ${lineLayerId}`, error)
      }
    }
    if (map.getLayer(pointsLayerId)) {
      try {
        map.removeLayer(pointsLayerId)
      } catch (error) {
        console.warn(`Failed to remove layer ${pointsLayerId}`, error)
      }
    }
    if (map.getSource(sourceId)) {
      try {
        map.removeSource(sourceId)
      } catch (error) {
        console.warn(`Failed to remove source ${sourceId}`, error)
      }
    }

    // Add source
    map.addSource(sourceId, {
      type: 'geojson',
      data: geojson as any,
      // Important: keep routes visible when zoomed far out.
      // MapLibre's GeoJSON source is internally tiled + simplified; with highly segmented routes,
      // aggressive simplification at low zoom can drop tiny segments entirely (routes appear to "vanish"
      // around zoom ~6). Disabling simplification ensures the geometry continues to render at any zoom.
      tolerance: 0
    })

    // Keep a reference so we can later inject per-segment flags (e.g., constraint violations)
    // and update the MapLibre source without mutating route files on disk.
    loadedRouteGeojsonByRouteIdRef.current[routeId] = geojson

    // Add line layer for segments
    // Render violating segments in red while keeping the rest of the route purple.
    //
    // "Violations" are derived from per-segment properties embedded in the route GeoJSON.
    // We support both:
    // - `constraint_violation` (injected from decisions sidecar, best signal)
    // - fallback heuristics from existing segment properties (slope_percent / landcover)
    //
    // This does not alter route geometry and should not affect other behaviors.
    const violatingSegmentColorExpr = [
      'case',
      [
        'any',
        // Preferred: explicit per-segment violation flag (populated asynchronously from decisions sidecar)
        ['==', ['get', 'constraint_violation'], true],
        // Slope violation (pipeline_specs max_slope_percent for this project is 20)
        ['>', ['to-number', ['coalesce', ['get', 'slope_percent'], 0]], 20],
        // Built-up violation (ESA WorldCover class 50)
        ['==', ['to-number', ['coalesce', ['get', 'land_cover_class'], 0]], 50],
        // Some datasets encode as name instead of numeric class
        ['==', ['get', 'land_cover_name'], 'built_up']
      ],
      '#ef4444', // red
      '#a855f7'  // purple
    ] as any

    map.addLayer({
      id: lineLayerId,
      type: 'line',
      source: sourceId,
      paint: {
        'line-color': violatingSegmentColorExpr,
        'line-width': 4,
        'line-opacity': 0.9
      }
    })

    // Add circle layer for segment endpoints
    map.addLayer({
      id: pointsLayerId,
      type: 'circle',
      source: sourceId,
      paint: {
        'circle-radius': 3,
        'circle-color': '#a855f7',
        'circle-stroke-width': 1,
        'circle-stroke-color': '#ffffff',
        'circle-opacity': 0.8
      }
    })

    // Track for cleanup
    dynamicSourceIdsRef.current.push(sourceId)
    dynamicLayerIdsRef.current.push(lineLayerId, pointsLayerId)

    // Fit to route bounds
    const bounds = getGeoJSONBounds(geojson)
    if (bounds) {
      map.fitBounds(bounds as any, { padding: 60, duration: 800 })
    }

    // Track in loaded PIRL routes
    const segmentCount = geojson.features?.length || 0
    setLoadedPirlRoutes(prev => {
      // Don't add if already exists
      if (prev.some(r => r.routeId === routeId)) return prev
      const next = [...prev, { routeId, visible: true, segmentCount }]
      saveRouteSession(currentProjectRef.current, next)
      return next
    })

    // Compute/fetch crossings for this route (persisted into sidecar on backend)
    const projectName = currentProjectRef.current
    if (projectName) {
      fetchPIRLRouteCrossings(projectName, routeId, true)
        .then((resp) => {
          const crossings = resp?.crossings_detailed?.crossings ?? []
          setRouteCrossingsByRouteId((prev) => ({ ...prev, [routeId]: crossings }))
        })
        .catch((err) => {
          console.warn(`Failed to fetch crossings for route ${routeId}`, err)
        })

      // Fetch full route decisions (segment-level compliance) and mark violating segments for red styling.
      // The agentic framework uses route IDs without the .geojson suffix.
      const decisionsRouteId = routeId.endsWith('.geojson') ? routeId.slice(0, -'.geojson'.length) : routeId
      getRouteDecisions(decisionsRouteId, projectName)
        .then((decisions) => {
          const segs = (decisions as any)?.segment_decisions
          if (!Array.isArray(segs) || segs.length === 0) return

          // Build set of segment_ids that are non-compliant in any category.
          const violating = new Set<string>()
          for (const s of segs) {
            if (!s || typeof s !== 'object') continue
            const sid = (s as any).segment_id
            if (sid === null || sid === undefined) continue
            const blocks = ['slope', 'land_cover', 'soil', 'seismic', 'crossings', 'construction']
            let bad = false
            for (const key of blocks) {
              const v = (s as any)[key]
              if (v && typeof v === 'object' && (v as any).compliant === false) {
                bad = true
                break
              }
            }
            if (bad) violating.add(String(sid))
          }

          if (violating.size === 0) return
          if (currentProjectRef.current !== projectName) return

          // Update the in-memory GeoJSON used by the map source.
          const currentGeo = loadedRouteGeojsonByRouteIdRef.current[routeId]
          if (!currentGeo || !Array.isArray((currentGeo as any).features)) return

          let changed = false
          for (const feat of (currentGeo as any).features) {
            if (!feat || typeof feat !== 'object') continue
            const props = (feat.properties && typeof feat.properties === 'object') ? feat.properties : {}
            const rawSid =
              props.segment_id ?? props.segmentId ?? props.SEGMENT_ID ?? props.id ?? feat.id ?? null
            if (rawSid === null || rawSid === undefined) continue
            const isBad = violating.has(String(rawSid))
            if (props.constraint_violation !== isBad) {
              props.constraint_violation = isBad
              feat.properties = props
              changed = true
            }
          }

          if (!changed) return
          const src = map.getSource(sourceId) as any
          if (src && typeof src.setData === 'function') {
            src.setData(currentGeo as any)
          }
        })
        .catch((err) => {
          console.warn(`Failed to fetch decisions for route ${routeId}`, err)
        })
    }

    setToast({ message: `Route "${routeId}" loaded`, type: 'success' })
  }, [])

  // Toggle PIRL route visibility
  const handleTogglePirlRouteVisibility = useCallback((routeId: string) => {
    const map = mapRef.current
    if (!map) return

    setLoadedPirlRoutes(prev => {
      const next = prev.map(route => {
        if (route.routeId !== routeId) return route

        const newVisible = !route.visible
        const sourceId = `agentic-route-${routeId}`
        const lineLayerId = `${sourceId}-line`
        const pointsLayerId = `${sourceId}-points`

        if (map.getLayer(lineLayerId)) {
          map.setLayoutProperty(lineLayerId, 'visibility', newVisible ? 'visible' : 'none')
        }
        if (map.getLayer(pointsLayerId)) {
          map.setLayoutProperty(pointsLayerId, 'visibility', newVisible ? 'visible' : 'none')
        }

        return { ...route, visible: newVisible }
      })
      saveRouteSession(currentProjectRef.current, next)
      return next
    })
  }, [])

  // Remove PIRL route from map
  const handleRemovePirlRoute = useCallback((routeId: string) => {
    const map = mapRef.current
    if (!map) return

    const sourceId = `agentic-route-${routeId}`
    const lineLayerId = `${sourceId}-line`
    const pointsLayerId = `${sourceId}-points`

    if (map.getLayer(lineLayerId)) {
      try {
        map.removeLayer(lineLayerId)
      } catch (error) {
        console.warn(`Failed to remove layer ${lineLayerId}`, error)
      }
    }
    if (map.getLayer(pointsLayerId)) {
      try {
        map.removeLayer(pointsLayerId)
      } catch (error) {
        console.warn(`Failed to remove layer ${pointsLayerId}`, error)
      }
    }
    if (map.getSource(sourceId)) {
      try {
        map.removeSource(sourceId)
      } catch (error) {
        console.warn(`Failed to remove source ${sourceId}`, error)
      }
    }

    // Remove from tracking arrays
    dynamicSourceIdsRef.current = dynamicSourceIdsRef.current.filter(id => id !== sourceId)
    dynamicLayerIdsRef.current = dynamicLayerIdsRef.current.filter(id => id !== lineLayerId && id !== pointsLayerId)

    // Remove from loaded routes state
    setLoadedPirlRoutes(prev => {
      const next = prev.filter(r => r.routeId !== routeId)
      saveRouteSession(currentProjectRef.current, next)
      return next
    })

    // Remove crossings cached for this route
    setRouteCrossingsByRouteId(prev => {
      const next = { ...prev }
      delete next[routeId]
      return next
    })

    // Remove stored GeoJSON reference for this route
    try {
      delete loadedRouteGeojsonByRouteIdRef.current[routeId]
    } catch {
      // ignore
    }

    setToast({ message: `Route "${routeId}" removed`, type: 'info' })
  }, [])

  // Route Crossings overlay (floating markers): show crossings for loaded + visible routes in all modes
  // (GIS, Operator, Routing). Interaction (click-to-open details) can still be mode-gated elsewhere.
  useEffect(() => {
    if (!mapReady || !mapRef.current) return
    const map = mapRef.current

    const empty: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

    // Ensure source exists
    if (!map.getSource(ROUTE_CROSSINGS_SOURCE_ID)) {
      map.addSource(ROUTE_CROSSINGS_SOURCE_ID, {
        type: 'geojson',
        data: empty as any
      })
      dynamicSourceIdsRef.current.push(ROUTE_CROSSINGS_SOURCE_ID)
    }

    // Ensure layers exist: ground shadow + MapLibre symbol marker layer (no Three.js).
    if (!map.getLayer(ROUTE_CROSSINGS_LAYER_SHADOW_ID)) {
      map.addLayer({
        id: ROUTE_CROSSINGS_LAYER_SHADOW_ID,
        type: 'circle',
        source: ROUTE_CROSSINGS_SOURCE_ID,
        paint: {
          'circle-radius': 7,
          'circle-color': '#000000',
          'circle-opacity': 0.35,
          'circle-blur': 0.9
        }
      })
      dynamicLayerIdsRef.current.push(ROUTE_CROSSINGS_LAYER_SHADOW_ID)
    }

    // Remove legacy glow layer and any previously-added 3D custom layer.
    for (const legacyId of [ROUTE_CROSSINGS_LAYER_GLOW_ID, 'route-crossings-3d']) {
      if (map.getLayer(legacyId)) {
        try {
          map.removeLayer(legacyId)
        } catch {
          // ignore
        }
      }
    }

    // Ensure pin icons exist in the style sprite (generated as raster pixels; no SVG decode).
    // Also register a styleimagemissing handler so icons are always injected even if the style re-initializes.
    if (!crossingsMarkerImagesLoadedRef.current) {
      crossingsMarkerImagesLoadedRef.current = true

      const ensureIcon = (key: string, imageId: string) => {
        if (map.hasImage(imageId)) return
        const imageData = createCrossingMarkerImageData(key, 128)
        map.addImage(imageId, imageData, { pixelRatio: 2 })
      }

      try {
        ensureIcon('roads', 'crossing-icon-roads')
        ensureIcon('railways', 'crossing-icon-railways')
        ensureIcon('waterways', 'crossing-icon-waterways')
        ensureIcon('hydrology', 'crossing-icon-hydrology')
        ensureIcon('powerlines', 'crossing-icon-powerlines')
        ensureIcon('pipelines', 'crossing-icon-pipelines')
        ensureIcon('default', 'crossing-icon-default')
      } catch (error) {
        console.warn('Failed to create crossing marker icons', error)
        crossingsMarkerImagesLoadedRef.current = false
      }

      // On-demand fallback: if MapLibre ever requests a missing icon, generate it immediately.
      try {
        map.on('styleimagemissing', (e: any) => {
          const id = String(e?.id || '')
          if (!id.startsWith('crossing-icon-')) return
          if (map.hasImage(id)) return
          const key = id.replace('crossing-icon-', '') || 'default'
          try {
            const imageData = createCrossingMarkerImageData(key, 128)
            map.addImage(id, imageData, { pixelRatio: 2 })
          } catch {
            // ignore
          }
        })
      } catch {
        // ignore
      }
    }

    // Ensure symbol layer exists (pins keyed by category).
    if (!map.getLayer(ROUTE_CROSSINGS_LAYER_MARKER_ID)) {
      const iconImage = [
        'match',
        ['get', 'category'],
        'roads', 'crossing-icon-roads',
        'railways', 'crossing-icon-railways',
        'waterways', 'crossing-icon-waterways',
        'hydrology', 'crossing-icon-hydrology',
        'powerlines', 'crossing-icon-powerlines',
        'pipelines', 'crossing-icon-pipelines',
        'crossing-icon-default'
      ] as any

      map.addLayer({
        id: ROUTE_CROSSINGS_LAYER_MARKER_ID,
        type: 'symbol',
        source: ROUTE_CROSSINGS_SOURCE_ID,
        layout: {
          'icon-image': iconImage,
          // Zoom-based scaling for cleaner visual balance across zoom levels.
          'icon-size': [
            'interpolate',
            ['linear'],
            ['zoom'],
            8, 0.45,
            12, 0.60,
            16, 0.80
          ] as any,
          'icon-anchor': 'bottom',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'icon-rotation-alignment': 'viewport',
          'icon-pitch-alignment': 'viewport'
        }
      })
      dynamicLayerIdsRef.current.push(ROUTE_CROSSINGS_LAYER_MARKER_ID)
    }

    // Hide markers flagged as hidden.
    try {
      const hideFilter = ['==', ['get', 'hidden'], false] as any
      if (map.getLayer(ROUTE_CROSSINGS_LAYER_SHADOW_ID)) {
        map.setFilter(ROUTE_CROSSINGS_LAYER_SHADOW_ID, hideFilter)
      }
      if (map.getLayer(ROUTE_CROSSINGS_LAYER_MARKER_ID)) {
        map.setFilter(ROUTE_CROSSINGS_LAYER_MARKER_ID, hideFilter)
      }
    } catch {
      // ignore
    }

    // Crossings markers should be visible in all modes.
    const desired: 'visible' | 'none' = 'visible'
    if (map.getLayer(ROUTE_CROSSINGS_LAYER_SHADOW_ID)) {
      map.setLayoutProperty(ROUTE_CROSSINGS_LAYER_SHADOW_ID, 'visibility', desired)
    }
    if (map.getLayer(ROUTE_CROSSINGS_LAYER_MARKER_ID)) {
      map.setLayoutProperty(ROUTE_CROSSINGS_LAYER_MARKER_ID, 'visibility', desired)
    }

    const src = map.getSource(ROUTE_CROSSINGS_SOURCE_ID) as any
    if (!src || typeof src.setData !== 'function') return

    const visibleRouteIds = new Set(loadedPirlRoutes.filter(r => r.visible).map(r => r.routeId))
    const features: any[] = []

    for (const routeId of visibleRouteIds) {
      const crossings = routeCrossingsByRouteId[routeId] ?? []
      for (const c of crossings) {
        const pt = c?.point
        if (!Array.isArray(pt) || pt.length !== 2) continue
        const [lng, lat] = pt
        if (typeof lng !== 'number' || typeof lat !== 'number') continue
        const category = normalizeCrossingCategory(c.category)
        const key = crossingKey(routeId, String(c.id))
        const hidden = Boolean(hiddenCrossingCategories[category] || hiddenCrossingKeys[key])
        features.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [lng, lat] },
          properties: {
            crossing_id: c.id,
            crossing_key: key,
            route_id: routeId,
            category,
            dataset_layer: c.dataset_layer,
            feature_id: c.feature_id,
            hidden
          }
        })
      }
    }

    src.setData({ type: 'FeatureCollection', features } as any)

    // Keep markers above route lines
    try {
      map.moveLayer(ROUTE_CROSSINGS_LAYER_SHADOW_ID)
      map.moveLayer(ROUTE_CROSSINGS_LAYER_MARKER_ID)
    } catch {
      // ignore
    }
  }, [
    crossingKey,
    hiddenCrossingCategories,
    hiddenCrossingKeys,
    loadedPirlRoutes,
    mapMode,
    mapReady,
    normalizeCrossingCategory,
    routeCrossingsByRouteId
  ])

  // Register segment click handler
  useEffect(() => {
    if (!mapReady || !mapRef.current) return
    const map = mapRef.current

    map.on('click', handleSegmentClick)

    return () => {
      map.off('click', handleSegmentClick)
    }
  }, [mapReady, handleSegmentClick])

  // Clicking a crossings marker opens an info dialog for that crossing.
  useEffect(() => {
    if (!mapReady || !mapRef.current) return
    const map = mapRef.current

    const handler = (e: any) => {
      if (mapMode !== 'routing') return
      const f = e?.features?.[0]
      const props = (f?.properties || {}) as Record<string, any>
      const routeId = typeof props.route_id === 'string' ? props.route_id : ''
      const crossingId = typeof props.crossing_id === 'string' ? props.crossing_id : ''

      // Stop other consumers from treating this as a generic click.
      try {
        e?.originalEvent?.stopPropagation?.()
      } catch {
        // ignore
      }

      let crossing: RouteCrossingRecord | null = null
      if (routeId && crossingId) {
        const list = routeCrossingsByRouteId[routeId] ?? []
        crossing = list.find((c) => c.id === crossingId) ?? null
      }

      // Fallback to minimal record derived from feature props.
      if (!crossing) {
        const coords = f?.geometry?.coordinates
        const lng = Array.isArray(coords) ? coords[0] : undefined
        const lat = Array.isArray(coords) ? coords[1] : undefined
        if (typeof lng !== 'number' || typeof lat !== 'number') return
        crossing = {
          id: crossingId || `${lng.toFixed(6)}:${lat.toFixed(6)}`,
          category: String(props.category || 'unknown'),
          dataset_layer: String(props.dataset_layer || ''),
          feature_id: String(props.feature_id || ''),
          point: [lng, lat],
          intersection: { type: 'Point', coordinates: [lng, lat] },
          feature_properties: {},
          derived: {}
        }
      }

      const finalRouteId = routeId || String(props.route_id || 'unknown')
      setSelectedMapCrossing({ routeId: finalRouteId, crossing })
    }

    const enter = () => {
      try {
        map.getCanvas().style.cursor = 'pointer'
      } catch {
        // ignore
      }
    }
    const leave = () => {
      try {
        map.getCanvas().style.cursor = ''
      } catch {
        // ignore
      }
    }

    map.on('click', ROUTE_CROSSINGS_LAYER_MARKER_ID, handler)
    map.on('mouseenter', ROUTE_CROSSINGS_LAYER_MARKER_ID, enter)
    map.on('mouseleave', ROUTE_CROSSINGS_LAYER_MARKER_ID, leave)

    return () => {
      map.off('click', ROUTE_CROSSINGS_LAYER_MARKER_ID, handler)
      map.off('mouseenter', ROUTE_CROSSINGS_LAYER_MARKER_ID, enter)
      map.off('mouseleave', ROUTE_CROSSINGS_LAYER_MARKER_ID, leave)
    }
  }, [mapMode, mapReady, routeCrossingsByRouteId])

  // Register feature identify handler (double-click)
  useEffect(() => {
    if (!mapReady || !mapRef.current) return
    const map = mapRef.current

    map.on('dblclick', handleFeatureDoubleClick)

    return () => {
      map.off('dblclick', handleFeatureDoubleClick)
    }
  }, [mapReady, handleFeatureDoubleClick])

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

  const handleToggleDatasetsDock = useCallback(() => {
    setDatasetsDialogDocked((prev) => {
      const next = !prev
      if (next) {
        // Prevent stacking multiple docked panels on the map
        setFullTableDocked(false)
        setPirlTableDocked(false)
      }
      return next
    })
  }, [])

  const handleToggleCreatorEditorDock = useCallback(() => {
    setCreatorEditorDocked((prev) => {
      const next = !prev
      if (next) {
        // Prevent stacking multiple docked panels on the map
        setFullTableDocked(false)
        setPirlTableDocked(false)
        setDatasetsDialogDocked(false)
      }
      return next
    })
  }, [])

  const latDisplay = cursorPosition
    ? `${Math.abs(cursorPosition.lat).toFixed(5)}° ${cursorPosition.lat >= 0 ? 'N' : 'S'}`
    : '--'
  const lonDisplay = cursorPosition
    ? `${Math.abs(cursorPosition.lng).toFixed(5)}° ${cursorPosition.lng >= 0 ? 'E' : 'W'}`
    : '--'

  const elevationDisplay = (() => {
    switch (cursorElevation.status) {
      case 'ready':
        return cursorElevation.value !== null ? `${cursorElevation.value.toFixed(1)} m` : 'Elevation —'
      case 'loading':
        return cursorElevation.value !== null ? `${cursorElevation.value.toFixed(1)} m` : 'Loading...'
      case 'unavailable':
        return 'No data'
      case 'error':
        return 'Elevation error'
      case 'no-dem':
        return 'DEM unavailable'
      default:
        return 'Elevation --'
    }
  })()

  const elevationLoading = cursorElevation.status === 'loading'
  const demDisplay = demLayerName ?? 'None'

  return (
    <div 
      className="relative w-full h-full" 
      style={{ 
        minHeight: '100%', 
        width: '100%', 
        height: '100%', 
        position: 'relative', 
        background: 'linear-gradient(to bottom, #154360 0%, #1F618D 20%, #2980B9 40%, #3498DB 60%, #5DADE2 80%, #87CEEB 100%)'
      }}
    >
      <div
        ref={mapContainerRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: '100%',
          height: '100%',
          background: 'transparent' // Let parent gradient show through during load
        }}
      />

      {/* Project Loading Overlay */}
      {isProjectLoading && (
        <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-md transition-all duration-300">
          <div className="flex flex-col items-center gap-4">
            <div className="relative">
              <div className="w-16 h-16 rounded-full border-4 border-primary/30 border-t-primary animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-8 h-8 rounded-full bg-primary/20" />
              </div>
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold text-white">Loading</p>
              <p className="text-sm text-white/70">Preparing project layers...</p>
            </div>
          </div>
        </div>
      )}

      <Compass map={mapRef.current} className="bottom-16 left-4" />

      <button
        onClick={handleRefreshAll}
        className="absolute bottom-3 left-3 z-20 h-9 w-9 bg-black/60 backdrop-blur-sm border border-white/10 rounded-sm flex items-center justify-center hover:bg-primary/20 hover:border-primary/50 transition-all group shadow-[0_0_10px_rgba(0,0,0,0.5)]"
        title="Refresh System"
      >
        <RefreshCw className="w-4 h-4 text-white/70 group-hover:text-primary group-hover:rotate-180 transition-all duration-500" />
      </button>

      {isBuffering && (
        <div className="absolute bottom-3 left-14 z-20 h-9 px-3 bg-black/60 backdrop-blur-sm border border-white/10 rounded-sm flex items-center gap-2 pointer-events-none shadow-[0_0_10px_rgba(0,0,0,0.5)]">
          <Loader2 className="w-3 h-3 animate-spin text-primary" />
          <span className="text-[10px] font-mono text-white/70 uppercase tracking-wider">Buffering...</span>
        </div>
      )}

      {/* Map Controls */}
      <div className="absolute top-4 left-4 z-10 space-y-3 max-h-[calc(100vh-100px)] overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
        {/* Status HUD */}
        <div className="bg-black/60 backdrop-blur-md border border-white/10 p-4 rounded-sm shadow-[0_0_20px_-5px_rgba(0,0,0,0.5)] w-[200px] xl:w-[240px] relative overflow-hidden group">
            {/* Scan line effect */}
            <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-50" />
            
            {/* Corner Markers */}
            <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-white/30" />
            <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-white/30" />
            <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-white/30" />
            <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-white/30" />

            <div className="space-y-3 relative z-10">
                <div className="flex items-center gap-2 border-b border-white/10 pb-2">
                    <div className="p-1 bg-primary/10 rounded-sm">
                        <Layers className="w-3 h-3 text-primary" />
                    </div>
                    <span className="text-xs font-bold text-white uppercase tracking-wider">Hybrid Satellite</span>
                </div>
                
                <div className="grid grid-cols-2 gap-x-2 gap-y-3">
                     <div className="space-y-0.5">
                         <span className="text-[9px] text-white/40 font-mono uppercase block tracking-widest">Zoom Level</span>
                         <span className="text-sm font-mono font-bold text-white/90">{zoom.toFixed(2)}x</span>
                     </div>
                     <div className="space-y-0.5">
                         <span className="text-[9px] text-white/40 font-mono uppercase block tracking-widest">System</span>
                         <div className="flex items-center gap-1.5 h-5">
                             {mapLoaded ? (
                                 <>
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_5px_rgba(16,185,129,0.8)]" />
                                    <span className="text-[10px] font-mono text-emerald-500 tracking-wide">READY</span>
                                 </>
                             ) : (
                                 <>
                                    <Loader2 className="w-3 h-3 animate-spin text-yellow-500" />
                                    <span className="text-[10px] font-mono text-yellow-500 tracking-wide">INIT</span>
                                 </>
                             )}
                         </div>
                     </div>
                </div>

                <div className="border-t border-white/10 pt-2">
                    <span className="text-[9px] text-white/40 font-mono uppercase block tracking-widest mb-0.5">Active Project</span>
                    <div className="text-[10px] font-mono text-white/70 uppercase truncate">
                        {projectSummary || 'NO DATA STREAM'}
                    </div>
                </div>
            </div>
        </div>

        {/* Control Module */}
        <div className="flex flex-col gap-1">
           {/* Reset View Button */}
           <button
              onClick={handleResetView}
              className="group w-[200px] xl:w-[240px] flex items-center gap-3 px-4 py-2 bg-black/40 backdrop-blur-sm border border-white/5 hover:border-white/20 hover:bg-white/5 rounded-sm transition-all duration-200"
           >
              <Maximize2 className="w-3 h-3 text-white/50 group-hover:text-primary transition-colors" />
              <span className="text-[10px] font-mono text-white/70 group-hover:text-white tracking-widest uppercase">RESET VIEW</span>
           </button>
           
           {/* Terrain Toggle */}
           <button
             onClick={() => setTerrainEnabled(prev => !prev)}
             disabled={!demLayerName}
             className={cn(
               "group w-[200px] xl:w-[240px] flex items-center gap-3 px-4 py-2 mt-1 backdrop-blur-sm border rounded-sm transition-all duration-200",
               terrainEnabled
                 ? "bg-primary/10 border-primary/30 text-white"
                 : "bg-black/40 border-white/5 hover:border-white/20 hover:bg-white/5 text-white/70",
               !demLayerName && "opacity-50 cursor-not-allowed"
             )}
             title={!demLayerName ? 'No DEM layer found in project' : 'Toggle 3D terrain using DEM'}
           >
              <Mountain className={cn("w-3 h-3 transition-colors", terrainEnabled ? "text-primary" : "text-white/50 group-hover:text-primary")} />
              <div className="flex flex-col items-start">
                  <span className={cn(
                    "text-[10px] font-mono tracking-widest uppercase",
                    terrainEnabled ? "text-white" : "group-hover:text-white"
                  )}>3D Terrain</span>
              </div>
              {terrainEnabled && (
                  <div className="ml-auto w-1.5 h-1.5 bg-primary rounded-full shadow-[0_0_5px_rgba(var(--primary),0.8)]" />
              )}
           </button>

           {/* AI Analyze Button - routing mode only */}
           {currentProject && mapMode === 'routing' && selectedSegmentId && selectedRouteId && (
             <button
               onClick={handleAnalyze}
               disabled={analysisLoading}
               className={cn(
                 "group w-[200px] xl:w-[240px] flex items-center gap-3 px-4 py-2 mt-2 backdrop-blur-sm border rounded-sm transition-all duration-200",
                 "bg-purple-900/40 border-purple-500/30 hover:border-purple-400/50 hover:bg-purple-800/40 text-white",
                 analysisLoading && "opacity-70 cursor-wait"
               )}
               title="Analyze selected segment with AI agents"
             >
               {analysisLoading ? (
                 <Loader2 className="w-3 h-3 animate-spin text-purple-400" />
               ) : (
                 <Brain className="w-3 h-3 text-purple-400 group-hover:text-purple-300 transition-colors" />
               )}
               <div className="flex flex-col items-start flex-1">
                 <span className="text-[10px] font-mono tracking-widest uppercase group-hover:text-white">
                   {analysisLoading ? 'Analyzing...' : 'AI Analysis'}
                 </span>
                 <span className="text-[8px] font-mono text-white/50 truncate max-w-[150px]">
                   Segment: {selectedSegmentId}
                 </span>
               </div>
               <div className="w-1.5 h-1.5 bg-purple-400 rounded-full shadow-[0_0_5px_rgba(168,85,247,0.8)] animate-pulse" />
             </button>
           )}

          {/* Map Mode (only when a project is selected) */}
          {currentProject && (
            <div className="mt-3 w-[200px] xl:w-[240px] border-t border-white/10 pt-3">
              <div className="text-[9px] font-mono text-white/40 uppercase tracking-widest mb-2">Mode</div>
              <button
                onClick={() => setMapMode('gis')}
                className={cn(
                  "group w-full flex items-center gap-3 px-4 py-2 backdrop-blur-sm border rounded-sm transition-all duration-200",
                  mapMode === 'gis'
                    ? "bg-blue-500/15 border-blue-500/40 text-white"
                    : "bg-black/40 border-white/5 hover:border-white/20 hover:bg-white/5 text-white/70"
                )}
                title="GIS Mode: manage GIS layers"
              >
                <span className="text-[10px] font-mono tracking-widest uppercase group-hover:text-white">GIS Mode</span>
              </button>
              <button
                onClick={() => setMapMode('operator')}
                className={cn(
                  "group w-full flex items-center gap-3 px-4 py-2 mt-1 backdrop-blur-sm border rounded-sm transition-all duration-200",
                  mapMode === 'operator'
                    ? "bg-amber-500/15 border-amber-500/40 text-white"
                    : "bg-black/40 border-white/5 hover:border-white/20 hover:bg-white/5 text-white/70"
                )}
                title="Operator Mode: manage AOI/POI annotations"
              >
                <span className="text-[10px] font-mono tracking-widest uppercase group-hover:text-white">Operator Mode</span>
              </button>
              <button
                onClick={() => setMapMode('routing')}
                className={cn(
                  "group w-full flex items-center gap-3 px-4 py-2 mt-1 backdrop-blur-sm border rounded-sm transition-all duration-200",
                  mapMode === 'routing'
                    ? "bg-purple-500/15 border-purple-500/40 text-white"
                    : "bg-black/40 border-white/5 hover:border-white/20 hover:bg-white/5 text-white/70"
                )}
                title="Routing Mode: PIRL routes + segment analysis"
              >
                <span className="text-[10px] font-mono tracking-widest uppercase group-hover:text-white">Routing Mode</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Right Side Panel Container - per-mode managers (only when a project is selected) */}
      {currentProject && (
        <div className="absolute top-4 right-4 z-10 flex flex-col gap-3 items-end overflow-x-visible">
          {mapMode === 'gis' && (
            <LayerManager
              // Operator annotations are managed via Operator Mode (not GIS Layer Manager).
              layers={managedLayers.filter((layer) => layer.id !== CREATOR_MANAGED_LAYER_ID)}
              selectedLayerId={selectedLayerId}
              loadingMessage={loadingMessage}
              currentProject={currentProject}
              vectorDetails={vectorDetails}
              onSelectLayer={setSelectedLayerId}
              onToggleVisibility={handleToggleVisibility}
              onOpacityChange={handleOpacityChange}
              onMoveLayer={handleMoveLayer}
              onReorderLayers={handleReorderLayers}
              onOpenTable={handleOpenTable}
              onOpenStyle={handleOpenStyle}
              onZoomToLayer={handleZoomToLayer}
            />
          )}

          {mapMode === 'operator' && (
            <>
              <CreatorManager
                entries={creatorManagerEntries}
                selectedEntryId={selectedCreatorEntryId}
                loadingMessage={null}
                currentProject={currentProject}
                onSelectEntry={setSelectedCreatorEntryId}
                onToggleVisibility={handleToggleCreatorEntryVisibility}
                onOpacityChange={handleCreatorEntryOpacityChange}
                onMoveEntry={handleMoveCreatorEntry}
                onReorderEntries={handleReorderCreatorEntries}
                onOpenEntry={handleOpenCreatorEntryFromManager}
                onZoomToEntry={handleZoomToCreatorEntry}
                collapsed={creatorManagerCollapsed}
                onCollapsedChange={setCreatorManagerCollapsed}
              />

              {loadedPirlRoutes.length > 0 && (
                <RoutingCrossingsPanel
                  loadedRoutes={loadedPirlRoutes}
                  crossingsByRouteId={routeCrossingsByRouteId}
                  onOpenManager={() => setCrossingsManagerOpen(true)}
                  hiddenCategories={hiddenCrossingCategories}
                  onToggleCategory={toggleCrossingCategory}
                />
              )}
            </>
          )}

          {mapMode === 'routing' && (
            <>
              <RoutingRoutesPanel
                loadedRoutes={loadedPirlRoutes}
                onToggleRouteVisibility={handleTogglePirlRouteVisibility}
                onRemoveRoute={handleRemovePirlRoute}
                onOpenTable={(routeId) => setPirlTableRouteId(routeId)}
              />
              <RoutingCrossingsPanel
                loadedRoutes={loadedPirlRoutes}
                crossingsByRouteId={routeCrossingsByRouteId}
                onOpenManager={() => setCrossingsManagerOpen(true)}
                hiddenCategories={hiddenCrossingCategories}
                onToggleCategory={toggleCrossingCategory}
              />
            </>
          )}
        </div>
      )}

      {currentProject && mapMode === 'gis' && (
        <ProjectDatasetsDialog
          open={datasetsDialogOpen}
          onClose={() => setDatasetsDialogOpen(false)}
          onToggleDock={handleToggleDatasetsDock}
          isDocked={datasetsDialogDocked}
          dockHeight={dockHeight}
          onResizeStart={handleDockResizeMouseDown}
          dockContainerRef={dockContainerRef}
          projectName={currentProject}
          datasets={datasets}
          loadedLayers={managedLayers}
        />
      )}

      {currentProject && mapMode === 'gis' && (
        <DatasetDigitalTwinDialog
          open={datasetDigitalTwinOpen}
          onClose={() => setDatasetDigitalTwinOpen(false)}
          projectName={currentProject}
        />
      )}

      {currentProject && mapMode === 'gis' && measureDistanceOpen && (
        <MeasureToolPanel
          tool="distance"
          map={mapRef.current}
          terrainSampler={terrainSamplerRef.current}
          demAvailable={!!demLayerName}
          active={activeMeasureTool === 'distance'}
          onActivate={() => setActiveMeasureTool('distance')}
          onClose={() => { setMeasureDistanceOpen(false); if (activeMeasureTool === 'distance') setActiveMeasureTool(null) }}
          initialPosition={{ x: 80, y: 80 }}
        />
      )}
      {currentProject && mapMode === 'gis' && measureAreaOpen && (
        <MeasureToolPanel
          tool="area"
          map={mapRef.current}
          terrainSampler={terrainSamplerRef.current}
          demAvailable={!!demLayerName}
          active={activeMeasureTool === 'area'}
          onActivate={() => setActiveMeasureTool('area')}
          onClose={() => { setMeasureAreaOpen(false); if (activeMeasureTool === 'area') setActiveMeasureTool(null) }}
          initialPosition={{ x: 120, y: 100 }}
        />
      )}
      {currentProject && mapMode === 'gis' && elevationProfileOpen && (
        <MeasureToolPanel
          tool="elevation"
          map={mapRef.current}
          terrainSampler={terrainSamplerRef.current}
          demAvailable={!!demLayerName}
          active={activeMeasureTool === 'elevation'}
          onActivate={() => setActiveMeasureTool('elevation')}
          onClose={() => { setElevationProfileOpen(false); if (activeMeasureTool === 'elevation') setActiveMeasureTool(null) }}
          initialPosition={{ x: 160, y: 120 }}
        />
      )}

      {currentProject && mapMode === 'gis' && fullTableLayer && fullTableDetails && (
        <AttributeTable
          layer={fullTableLayer}
          details={fullTableDetails}
          sortedRows={sortedFullRows}
          sortConfig={sortConfig}
          isDocked={fullTableDocked}
          dockHeight={dockHeight}
          onClose={handleCloseTable}
          onToggleDock={handleToggleDock}
          onSort={handleSort}
          onRowDoubleClick={handleRowDoubleClick}
          onResizeStart={handleDockResizeMouseDown}
          dockContainerRef={dockContainerRef}
        />
      )}

      {/* PIRL Attribute Table */}
      {currentProject && mapMode === 'routing' && pirlTableRouteId && (
        <PIRLAttributeTable
          routeId={pirlTableRouteId}
          isDocked={pirlTableDocked}
          dockHeight={dockHeight}
          onClose={() => setPirlTableRouteId(null)}
          onToggleDock={() => setPirlTableDocked(!pirlTableDocked)}
          onResizeStart={handleDockResizeMouseDown}
          dockContainerRef={dockContainerRef}
        />
      )}

      {currentProject && mapMode === 'gis' && styleLayerId && (() => {
        const styleLayer = managedLayers.find(l => l.id === styleLayerId)
        if (!styleLayer) return null
        return (
          <StyleEditor
            layer={{
              id: styleLayer.id,
              name: styleLayer.name,
              type: styleLayer.type,
              geometryType: styleLayer.geometryType
            }}
            styleDraft={styleDraft}
            onChange={setStyleDraft}
            onApply={() => {
               if (!styleLayerId) return
               setStyleOverrides((prev) => ({
                 ...prev,
                 [styleLayerId]: styleDraft
               }))
               applyStyleToMapLayer(styleLayerId, styleDraft)
               setStyleLayerId(null)
            }}
            onReset={() => {
                      const target = styleLayerId
                      if (!target) return
                      setStyleOverrides((prev) => {
                        const next = { ...prev }
                        delete next[target]
                        return next
                      })
                      applyStyleToMapLayer(target, { opacity: 1 })
                      setStyleLayerId(null)
                    }}
            onCancel={() => setStyleLayerId(null)}
          />
        )
      })()}

      {/* AI Analysis Panel */}
      {currentProject && mapMode === 'routing' && showAnalysisPanel && (
        <div className="absolute top-4 right-[340px] xl:right-[400px] z-40 w-[320px] xl:w-[400px] max-h-[calc(100vh-120px)] overflow-hidden">
          <ExplanationPanel
            result={analysisResult}
            loading={analysisLoading}
            error={analysisError}
            onClose={handleCloseAnalysisPanel}
            onRetry={handleAnalyze}
          />
        </div>
      )}

      {/* Validated Decisions Panel */}
      {currentProject && mapMode === 'routing' && showDecisionsPanel && (
        <div className="absolute top-4 right-[680px] xl:right-[820px] z-40 w-[320px] xl:w-[380px] max-h-[calc(100vh-120px)] overflow-hidden">
          <DecisionsPanel
            decisions={decisionsData}
            loading={decisionsLoading}
            error={decisionsError}
            onClose={handleCloseDecisionsPanel}
          />
        </div>
      )}

      {/* PIRL Routes Manager */}
      {currentProject && mapMode === 'routing' && (
        <PirlRoutesManagerPanel
          open={showRoutesDialog}
          onClose={() => setShowRoutesDialog(false)}
          loadedRoutes={loadedPirlRoutes}
          onLoadRoute={handleLoadAgenticRoute}
          onToggleRouteVisibility={handleTogglePirlRouteVisibility}
          onRemoveRoute={handleRemovePirlRoute}
        />
      )}

      {/* Route Crossings Manager */}
      {currentProject && (mapMode === 'routing' || mapMode === 'operator') && (
        <RouteCrossingsManagerPanel
          open={crossingsManagerOpen}
          onClose={() => setCrossingsManagerOpen(false)}
          loadedRoutes={loadedPirlRoutes}
          crossingsByRouteId={routeCrossingsByRouteId}
          onZoomToCrossing={handleZoomToCrossing}
          hiddenCategories={hiddenCrossingCategories}
          hiddenCrossingKeys={hiddenCrossingKeys}
          onToggleCategory={toggleCrossingCategory}
          onToggleCrossing={toggleCrossingMarker}
        />
      )}

      {/* Map click: Crossing details dialog */}
      {currentProject && mapMode === 'routing' && selectedMapCrossing && (
        <CrossingInfoDialog
          open={Boolean(selectedMapCrossing)}
          onClose={() => setSelectedMapCrossing(null)}
          routeId={selectedMapCrossing.routeId}
          crossing={selectedMapCrossing.crossing}
          onOpenManager={() => setCrossingsManagerOpen(true)}
          onZoomToCrossing={handleZoomToCrossing}
        />
      )}

      <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 z-30">
        <div className="bg-black/80 backdrop-blur-md border border-white/10 px-6 py-2 rounded-full shadow-[0_0_20px_-5px_rgba(0,0,0,0.5)] flex items-center gap-6 relative overflow-hidden group">
            {/* Scan line effect */}
            <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-50" />
            
            <div className="flex items-center gap-2">
                <span className="text-[9px] font-mono text-white/40 uppercase tracking-widest">LAT</span>
                <span className="text-xs font-mono font-bold text-white/90 min-w-[80px]">{latDisplay}</span>
            </div>

            <div className="w-px h-3 bg-white/10" />

            <div className="flex items-center gap-2">
                <span className="text-[9px] font-mono text-white/40 uppercase tracking-widest">LON</span>
                <span className="text-xs font-mono font-bold text-white/90 min-w-[80px]">{lonDisplay}</span>
            </div>

            <div className="w-px h-3 bg-white/10" />

            <div className="flex items-center gap-2">
                <span className="text-[9px] font-mono text-white/40 uppercase tracking-widest">ELEV</span>
                <div className="flex items-center gap-2 min-w-[70px]">
                    <span className={cn(
                        "text-xs font-mono font-bold",
                        cursorElevation.value !== null ? "text-primary" : "text-white/50"
                    )}>
                        {elevationDisplay}
                    </span>
                    {elevationLoading && <Loader2 className="w-2.5 h-2.5 animate-spin text-primary/70" />}
                </div>
            </div>

            <div className="w-px h-3 bg-white/10" />

            <div className="flex items-center gap-2">
                <span className="text-[9px] font-mono text-white/40 uppercase tracking-widest">DEM</span>
                <span className="text-[10px] font-mono text-white/60 max-w-[150px] truncate" title={demDisplay}>
                    {demDisplay}
                </span>
            </div>
        </div>
      </div>

      <GoToCoordinatesBar
        open={goToCoordinatesOpen}
        seed={goToCoordinatesSeed}
        onClose={() => setGoToCoordinatesOpen(false)}
        onGoTo={handleGoToCoordinates}
      />

      {/* New Datasets Available Notification */}
      {hasNewDatasets && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-5 fade-in duration-300">
          <div className="px-4 py-3 bg-black/80 backdrop-blur-md border border-primary/30 rounded-sm shadow-[0_0_30px_-5px_rgba(var(--primary),0.3)] flex items-center gap-4">
            {/* Pulsing indicator */}
            <div className="relative">
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse shadow-[0_0_8px_rgba(var(--primary),0.8)]" />
              <div className="absolute inset-0 w-2 h-2 rounded-full bg-primary/50 animate-ping" />
            </div>

            {/* Message */}
            <div className="flex flex-col">
              <span className="text-xs font-mono text-white uppercase tracking-wider">New Datasets Detected</span>
              <span className="text-[10px] font-mono text-white/50">Project data has been updated</span>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 ml-2">
              <button
                onClick={() => refreshProjectData()}
                className="px-3 py-1.5 bg-primary/20 hover:bg-primary/30 border border-primary/50 rounded-sm text-[10px] font-mono text-primary uppercase tracking-wider transition-all hover:shadow-[0_0_10px_rgba(var(--primary),0.3)] flex items-center gap-2"
              >
                <RefreshCw className="w-3 h-3" />
                Refresh
              </button>
              <button
                onClick={dismissNewDatasets}
                className="px-2 py-1.5 hover:bg-white/10 border border-transparent hover:border-white/20 rounded-sm text-[10px] font-mono text-white/50 hover:text-white/80 uppercase tracking-wider transition-all"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-20 right-4 z-50 animate-in slide-in-from-right-5 fade-in duration-300">
          <div className={cn(
            "px-4 py-2 rounded-sm border shadow-[0_0_20px_-5px_rgba(0,0,0,0.5)] flex items-center gap-3 backdrop-blur-md",
            toast.type === 'success' ? "bg-emerald-900/80 border-emerald-500/30 text-emerald-100" : "bg-blue-900/80 border-blue-500/30 text-blue-100"
          )}>
            <div className={cn(
              "w-2 h-2 rounded-full shadow-[0_0_5px_currentColor]",
              toast.type === 'success' ? "bg-emerald-400" : "bg-blue-400"
            )} />
            <span className="text-xs font-mono uppercase tracking-wide">{toast.message}</span>
          </div>
        </div>
      )}

      {/* Creator geometry editing bar */}
      {currentProject && mapMode === 'operator' && creatorGeometryEdit && (
        <div className={cn(
          "fixed left-1/2 -translate-x-1/2 z-50 animate-in fade-in zoom-in-95 duration-100",
          "top-16"
        )}>
          <div className="px-4 py-3 bg-black/80 backdrop-blur-md border border-amber-500/30 rounded-sm shadow-[0_0_30px_-5px_rgba(245,158,11,0.25)] flex items-center gap-4">
            <div className="flex flex-col">
              <span className="text-xs font-mono text-white uppercase tracking-wider">Geometry Edit</span>
              <span className="text-[10px] font-mono text-white/50">Drag vertices / point, then save</span>
            </div>
            <div className="flex items-center gap-2 ml-2">
              <button
                onClick={handleSaveCreatorGeometryEdit}
                className="px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/50 rounded-sm text-[10px] font-mono text-amber-300 uppercase tracking-wider transition-all"
              >
                Save Geometry
              </button>
              <button
                onClick={handleCancelCreatorGeometryEdit}
                className="px-2 py-1.5 hover:bg-white/10 border border-transparent hover:border-white/20 rounded-sm text-[10px] font-mono text-white/50 hover:text-white/80 uppercase tracking-wider transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Operator geometry confirmation popover (Create AOI/POI) */}
      {currentProject && mapMode === 'operator' && creatorGeometryConfirm && (
        <div
          ref={creatorGeometryConfirmPopoverRef}
          className="fixed z-[95] w-[300px] max-w-[85vw] bg-black/90 backdrop-blur-md border border-white/10 rounded-sm shadow-[0_0_24px_-8px_rgba(0,0,0,0.85)] overflow-hidden animate-in fade-in zoom-in-95 duration-100"
          style={{ top: creatorGeometryConfirm.y, left: creatorGeometryConfirm.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="flex items-center justify-between gap-2 px-3 py-2 border-b border-white/10 cursor-grab active:cursor-grabbing select-none touch-none"
            onPointerDown={handleCreatorGeometryConfirmHeaderPointerDown}
            title="Drag to move"
          >
            <div className="text-[10px] font-mono text-white/40 uppercase tracking-widest">
              Confirm {creatorGeometryConfirm.entryType}
            </div>
            <button
              onClick={handleCancelCreatorGeometryConfirm}
              data-no-drag
              className="p-1 rounded hover:bg-white/10 text-white/50 hover:text-white transition-colors"
              onPointerDown={(e) => e.stopPropagation()}
              title="Cancel"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-3 space-y-2">
            {(() => {
              const geom: any = creatorGeometryConfirm.geometryWgs84 as any
              const type = String(geom?.type ?? '')
              const coords = geom?.coordinates

              if (type === 'Point' && Array.isArray(coords) && coords.length >= 2) {
                const lng = Number(coords[0])
                const lat = Number(coords[1])
                return (
                  <div className="space-y-1">
                    <div className="text-[10px] font-mono text-white/40 uppercase tracking-widest">POI Coordinate</div>
                    <div className="text-xs font-mono text-white/80">
                      {lat.toFixed(6)}, {lng.toFixed(6)}
                    </div>
                  </div>
                )
              }

              if (type === 'Polygon' && Array.isArray(coords) && Array.isArray(coords[0])) {
                const ring = coords[0] as any[]
                let pts = ring
                if (ring.length >= 2) {
                  const first = ring[0]
                  const last = ring[ring.length - 1]
                  if (
                    Array.isArray(first) &&
                    Array.isArray(last) &&
                    first.length >= 2 &&
                    last.length >= 2 &&
                    first[0] === last[0] &&
                    first[1] === last[1]
                  ) {
                    pts = ring.slice(0, -1)
                  }
                }

                const rows = pts
                  .filter(
                    (p) => Array.isArray(p) && p.length >= 2 && typeof p[0] === 'number' && typeof p[1] === 'number'
                  )
                  .map((p, idx) => ({ idx: idx + 1, lng: Number(p[0]), lat: Number(p[1]) }))

                return (
                  <div className="space-y-1">
                    <div className="text-[10px] font-mono text-white/40 uppercase tracking-widest">
                      AOI Vertices ({rows.length})
                    </div>
                    <div className="max-h-[140px] overflow-auto border border-white/10 rounded-sm bg-black/30">
                      {rows.length === 0 ? (
                        <div className="px-2 py-2 text-xs font-mono text-white/50">No vertices.</div>
                      ) : (
                        rows.map((r) => (
                          <div
                            key={r.idx}
                            className="px-2 py-1 border-b border-white/5 last:border-b-0 text-[11px] font-mono text-white/80"
                          >
                            {r.idx}. {r.lat.toFixed(6)}, {r.lng.toFixed(6)}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )
              }

              return <div className="text-xs font-mono text-white/60">Geometry captured. Confirm to continue.</div>
            })()}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={handleCancelCreatorGeometryConfirm}
                className="px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest border border-white/15 text-white/60 hover:text-white hover:border-white/30 hover:bg-white/5 rounded-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmCreatorGeometryConfirm}
                className="px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest bg-amber-500 text-black rounded-sm hover:bg-amber-400"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Operator entry editor dialog (create/edit) */}
      {currentProject && mapMode === 'operator' && creatorEditor && (
        <div
          className={cn(
            'fixed',
            creatorEditorDocked
              ? 'absolute z-40 bottom-0 left-0 right-0'
              : 'inset-0 z-[100] flex items-center justify-center p-4',
            'animate-fade-in'
          )}
          style={!creatorEditorDocked ? { position: 'fixed' } : { position: 'absolute' }}
        >
          {/* Backdrop (modal only) */}
          {!creatorEditorDocked && (
            <div className="absolute inset-0 bg-black/85 backdrop-blur-md" onClick={handleCloseCreatorEditor}>
              <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none" />
            </div>
          )}

          <div
            ref={creatorEditorDocked ? dockContainerRef : creatorPopoverRef}
            className={cn(
              'relative bg-[#0a0a0a]/95 border border-white/10 shadow-[0_0_50px_-10px_rgba(0,0,0,0.8)] flex flex-col pointer-events-auto overflow-hidden font-mono',
              creatorEditorDocked
                ? 'w-full rounded-none border-x-0 border-b-0'
                : 'w-[900px] max-w-[95vw] h-[95vh] max-h-[95vh] rounded-sm'
            )}
            style={
              creatorEditorDocked
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
            {creatorEditorDocked && (
              <div
                className="absolute top-0 left-0 right-0 h-2 cursor-ns-resize hover:bg-amber-500/20 transition-colors z-50"
                style={{ transform: 'translateY(-2px)' }}
                onMouseDown={handleDockResizeMouseDown}
                title="Drag to resize height"
              />
            )}
            {/* Decorative Top Line */}
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-amber-500/40 to-transparent" />

            {/* Header */}
            <header className="px-8 py-6 border-b border-white/10 flex items-center justify-between bg-black/20 shrink-0">
              <div className="flex flex-col gap-1 min-w-0">
                <div className="flex items-center gap-2 text-[10px] text-white/40 uppercase tracking-[0.2em]">
                  <span>Operator</span>
                  <span className="text-white/20">|</span>
                  <span className="text-white/50 truncate">{currentProject ?? 'NO PROJECT'}</span>
                </div>
                <div className="flex items-center gap-3 min-w-0">
                  <h2 className="text-xl font-bold text-white uppercase tracking-wide truncate">
                    {creatorEditor.mode === 'create'
                      ? `Create ${creatorEditor.entryType}`
                      : creatorEditor.section === 'notes' || creatorEditor.section === 'files'
                        ? `New Entry · ${creatorEditor.entryType}`
                        : `${creatorEditor.entryType} Thread`}
                  </h2>
                  {creatorEditor.mode === 'edit' && creatorEditor.entryId && (
                    <div className="shrink-0 flex items-center gap-2 px-2 py-0.5 bg-white/5 border border-white/10 rounded-sm">
                      <span className="text-[9px] text-white/50 uppercase tracking-wider">
                        ID: <span className="text-white">{creatorEditor.entryId}</span>
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleToggleCreatorEditorDock}
                  className="px-4 py-2 border border-amber-500/30 text-amber-200/80 hover:bg-amber-500/10 hover:text-amber-200 rounded-sm text-[10px] uppercase font-bold tracking-wider transition-all"
                  title={creatorEditorDocked ? 'Undock (open as a modal)' : 'Dock to bottom'}
                >
                  {creatorEditorDocked ? 'Undock' : 'Dock to bottom'}
                </button>
                <button
                  onClick={handleCloseCreatorEditor}
                  className="p-2 hover:bg-white/5 border border-transparent hover:border-white/10 rounded-sm text-white/50 hover:text-white transition-all"
                  title="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </header>

            <div className={cn('flex-1 overflow-y-auto space-y-3', creatorEditorDocked ? 'px-4 py-3' : 'px-6 py-4')}>
            {creatorEditor.loading ? (
              <div className="flex items-center gap-2 text-xs font-mono text-white/60">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading Operator entry...
              </div>
            ) : creatorEditor.mode === 'create' ? (
              <>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-white/40 uppercase tracking-widest">Title</label>
                  <input
                    value={creatorEditor.title}
                    onChange={(e) =>
                      setCreatorEditor((prev) => (prev ? { ...prev, title: e.target.value } : prev))
                    }
                    className="w-full bg-black/50 border border-white/10 rounded-sm px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-amber-500/50"
                    placeholder="e.g. Landslide scarp observed"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-white/40 uppercase tracking-widest">Category</label>
                    <select
                      value={creatorEditor.category}
                      onChange={(e) =>
                        setCreatorEditor((prev) =>
                          prev ? { ...prev, category: e.target.value as CreatorCategory } : prev
                        )
                      }
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
                    <label className="text-[10px] font-mono text-white/40 uppercase tracking-widest">Other</label>
                    <input
                      value={creatorEditor.categoryOther}
                      onChange={(e) =>
                        setCreatorEditor((prev) => (prev ? { ...prev, categoryOther: e.target.value } : prev))
                      }
                      disabled={creatorEditor.category !== 'Other'}
                      className={cn(
                        "w-full bg-black/50 border border-white/10 rounded-sm px-3 py-2 text-xs font-mono focus:outline-none focus:border-amber-500/50",
                        creatorEditor.category !== 'Other' ? "text-white/30" : "text-white"
                      )}
                      placeholder={creatorEditor.category === 'Other' ? 'Specify...' : '—'}
                    />
                  </div>
                </div>

                {/* Sortie (optional) */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-[10px] font-mono text-white/40 uppercase tracking-widest">Sortie ID (optional)</label>
                    {creatorEditor.sortie && (
                      <button
                        type="button"
                        onClick={() => setCreatorEditor((prev) => (prev ? { ...prev, sortie: null } : prev))}
                        className="text-[10px] font-mono text-white/50 hover:text-white underline underline-offset-2"
                        title="Clear sortie"
                      >
                        Clear
                      </button>
                    )}
                  </div>

                  {creatorEditor.sortie && (
                    <div className="text-[10px] font-mono text-white/50">
                      Selected: <span className="text-white/80">{creatorEditor.sortie.code}</span>
                    </div>
                  )}

                  <input
                    value={sortieQuery}
                    onChange={(e) => setSortieQuery(e.target.value)}
                    className="w-full bg-black/50 border border-white/10 rounded-sm px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-amber-500/50"
                    placeholder="Search sorties…"
                  />

                  <div className="max-h-[140px] overflow-auto border border-white/10 rounded-sm bg-black/30">
                    {sortieLoading ? (
                      <div className="px-3 py-2 text-xs font-mono text-white/50">Loading…</div>
                    ) : sortieOptions.length === 0 ? (
                      <div className="px-3 py-2 text-xs font-mono text-white/50">No sorties found.</div>
                    ) : (
                      sortieOptions.map((s) => {
                        const selected = creatorEditor.sortie?.id === s.id
                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => {
                              setCreatorEditor((prev) => (prev ? { ...prev, sortie: { id: s.id, code: s.code, name: s.name ?? null } } : prev))
                              setSortieQuery('')
                            }}
                            className={cn(
                              "w-full text-left px-3 py-2 text-xs font-mono border-b border-white/5 last:border-b-0 transition-colors flex items-center justify-between gap-3",
                              selected ? "bg-amber-500/10 text-white" : "text-white/75 hover:bg-white/[0.03] hover:text-white"
                            )}
                            title={s.name ? `${s.code} · ${s.name}` : s.code}
                          >
                            <span className="truncate">{s.code}</span>
                            {s.name ? <span className="text-[10px] text-white/40 truncate max-w-[45%]">{s.name}</span> : null}
                          </button>
                        )
                      })
                    )}
                  </div>

                  {Boolean(sortieQuery.trim()) &&
                    !sortieLoading &&
                    !sortieCreating &&
                    !sortieOptions.some((s) => s.code.toLowerCase() === sortieQuery.trim().toLowerCase()) && (
                      <button
                        type="button"
                        onClick={handleCreateSortieFromQuery}
                        className="w-full px-3 py-2 text-[10px] font-mono uppercase tracking-widest bg-white/5 border border-white/10 text-white/70 hover:text-white hover:border-white/20 hover:bg-white/10 rounded-sm"
                      >
                        Create sortie “{sortieQuery.trim()}”
                      </button>
                    )}

                  {sortieCreating && (
                    <div className="flex items-center gap-2 text-xs font-mono text-white/50">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Creating sortie…
                    </div>
                  )}

                  {sortieError && (
                    <div className="text-xs font-mono text-red-300 bg-red-500/10 border border-red-500/20 rounded-sm px-3 py-2">
                      {sortieError}
                    </div>
                  )}
                </div>

                {/* Survey (minimal) */}
                <div className="space-y-2 border border-white/10 bg-black/30 rounded-sm p-3">
                  <div className="text-[10px] font-mono text-white/40 uppercase tracking-widest">Survey</div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-mono text-white/40 uppercase tracking-widest">Observation</label>
                      <select
                        value={creatorEditor.survey.observation_type ?? ''}
                        onChange={(e) =>
                          setCreatorEditor((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  survey: {
                                    ...prev.survey,
                                    observation_type: e.target.value ? (e.target.value as SurveyObservationType) : undefined
                                  }
                                }
                              : prev
                          )
                        }
                        className="w-full bg-black/50 border border-white/10 rounded-sm px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-amber-500/50"
                      >
                        <option value="">—</option>
                        <option>New</option>
                        <option>Confirm</option>
                        <option>Correct</option>
                        <option>Supersede</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-mono text-white/40 uppercase tracking-widest">Confidence</label>
                      <select
                        value={creatorEditor.survey.confidence ?? ''}
                        onChange={(e) =>
                          setCreatorEditor((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  survey: { ...prev.survey, confidence: e.target.value ? (e.target.value as SurveyConfidence) : undefined }
                                }
                              : prev
                          )
                        }
                        className="w-full bg-black/50 border border-white/10 rounded-sm px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-amber-500/50"
                      >
                        <option value="">—</option>
                        <option>Low</option>
                        <option>Med</option>
                        <option>High</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-mono text-white/40 uppercase tracking-widest">Method</label>
                      <select
                        value={creatorEditor.survey.method ?? ''}
                        onChange={(e) =>
                          setCreatorEditor((prev) =>
                            prev
                              ? { ...prev, survey: { ...prev.survey, method: e.target.value ? (e.target.value as SurveyMethod) : undefined } }
                              : prev
                          )
                        }
                        className="w-full bg-black/50 border border-white/10 rounded-sm px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-amber-500/50"
                      >
                        <option value="">—</option>
                        <option>Walkover</option>
                        <option>Vehicle</option>
                        <option>UAV</option>
                        <option>Other</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-mono text-white/40 uppercase tracking-widest">Status</label>
                      <select
                        value={creatorEditor.survey.status ?? ''}
                        onChange={(e) =>
                          setCreatorEditor((prev) =>
                            prev
                              ? { ...prev, survey: { ...prev.survey, status: e.target.value ? (e.target.value as SurveyStatus) : undefined } }
                              : prev
                          )
                        }
                        className="w-full bg-black/50 border border-white/10 rounded-sm px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-amber-500/50"
                      >
                        <option value="">—</option>
                        <option>Open</option>
                        <option>NeedsReview</option>
                        <option>Verified</option>
                        <option>Closed</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <label className="text-[10px] font-mono text-white/40 uppercase tracking-widest">Observed At (ISO)</label>
                        <button
                          type="button"
                          onClick={() =>
                            setCreatorEditor((prev) =>
                              prev ? { ...prev, survey: { ...prev.survey, observed_at: new Date().toISOString() } } : prev
                            )
                          }
                          className="text-[10px] font-mono text-white/50 hover:text-white underline underline-offset-2"
                          title="Set to current time"
                        >
                          Now
                        </button>
                      </div>
                      <input
                        value={creatorEditor.survey.observed_at ?? ''}
                        onChange={(e) =>
                          setCreatorEditor((prev) =>
                            prev ? { ...prev, survey: { ...prev.survey, observed_at: e.target.value || undefined } } : prev
                          )
                        }
                        className="w-full bg-black/50 border border-white/10 rounded-sm px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-amber-500/50"
                        placeholder="e.g. 2026-01-13T10:15:00Z"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-mono text-white/40 uppercase tracking-widest">GPS Quality</label>
                      <select
                        value={creatorEditor.survey.gps_quality ?? ''}
                        onChange={(e) =>
                          setCreatorEditor((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  survey: {
                                    ...prev.survey,
                                    gps_quality: e.target.value ? (e.target.value as SurveyGpsQuality) : undefined
                                  }
                                }
                              : prev
                          )
                        }
                        className="w-full bg-black/50 border border-white/10 rounded-sm px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-amber-500/50"
                      >
                        <option value="">—</option>
                        <option>Good</option>
                        <option>OK</option>
                        <option>Poor</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-2 pt-1">
                    <div className="text-[10px] font-mono text-white/40 uppercase tracking-widest">Category Fields</div>
                    <div className="grid grid-cols-2 gap-3">
                      {CATEGORY_FIELD_DEFS[creatorEditor.category].map((def) => {
                        const value = creatorEditor.survey.category_fields?.[def.key] ?? ''
                        return (
                          <div key={def.key} className="space-y-1">
                            <label className="text-[10px] font-mono text-white/40 uppercase tracking-widest">{def.label}</label>
                            <input
                              value={value}
                              onChange={(e) =>
                                setCreatorEditor((prev) => {
                                  if (!prev) return prev
                                  const current = prev.survey.category_fields ?? {}
                                  const nextFields = { ...current, [def.key]: e.target.value }
                                  return { ...prev, survey: { ...prev.survey, category_fields: nextFields } }
                                })
                              }
                              className="w-full bg-black/50 border border-white/10 rounded-sm px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-amber-500/50"
                              placeholder={def.placeholder}
                            />
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-white/40 uppercase tracking-widest">Comment</label>
                  <textarea
                    value={creatorEditor.comment}
                    onChange={(e) =>
                      setCreatorEditor((prev) => (prev ? { ...prev, comment: e.target.value } : prev))
                    }
                    rows={4}
                    className="w-full bg-black/50 border border-white/10 rounded-sm px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-amber-500/50"
                    placeholder="No word limit..."
                  />
                </div>

                {/* Include datasets (optional) */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-[10px] font-mono text-white/40 uppercase tracking-widest">Include Datasets</label>
                    {creatorEditor.datasets.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setCreatorEditor((prev) => (prev ? { ...prev, datasets: [] } : prev))}
                        className="text-[10px] font-mono text-white/50 hover:text-white underline underline-offset-2"
                        title="Clear selected datasets"
                      >
                        Clear
                      </button>
                    )}
                  </div>

                  {!datasets ? (
                    <div className="text-xs font-mono text-white/50">Datasets are still loading…</div>
                  ) : creatorDatasetOptions.length === 0 ? (
                    <div className="text-xs font-mono text-white/50">No datasets found for this project.</div>
                  ) : (
                    <>
                      <input
                        value={creatorDatasetQuery}
                        onChange={(e) => setCreatorDatasetQuery(e.target.value)}
                        className="w-full bg-black/50 border border-white/10 rounded-sm px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-amber-500/50"
                        placeholder="Search datasets…"
                      />

                      <div className="max-h-[140px] overflow-auto border border-white/10 rounded-sm bg-black/30">
                        {filteredCreatorDatasetOptions.length === 0 ? (
                          <div className="px-3 py-2 text-xs font-mono text-white/50">No matches.</div>
                        ) : (
                          filteredCreatorDatasetOptions.map((opt) => {
                            const key = `${opt.type ?? 'dataset'}:${opt.name}`
                            const checked = creatorEditor.datasets.some((d) => d.name === opt.name && d.type === opt.type)
                            return (
                              <label
                                key={key}
                                className="flex items-center justify-between gap-3 px-3 py-2 border-b border-white/5 last:border-b-0 hover:bg-white/[0.03] cursor-pointer"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => {
                                      setCreatorEditor((prev) => {
                                        if (!prev) return prev
                                        const exists = prev.datasets.some((d) => d.name === opt.name && d.type === opt.type)
                                        const next = exists
                                          ? prev.datasets.filter((d) => !(d.name === opt.name && d.type === opt.type))
                                          : [...prev.datasets, { name: opt.name, type: opt.type }]
                                        return { ...prev, datasets: next }
                                      })
                                    }}
                                    className="accent-amber-400"
                                  />
                                  <span className="text-xs font-mono text-white/80 truncate" title={opt.name}>
                                    {opt.name}
                                  </span>
                                </div>
                                <span className="shrink-0 text-[9px] font-mono uppercase tracking-widest text-white/50 border border-white/10 bg-white/5 px-1.5 py-0.5 rounded-[2px]">
                                  {opt.type ?? 'dataset'}
                                </span>
                              </label>
                            )
                          })
                        )}
                      </div>

                      <div className="text-[10px] font-mono text-white/50">
                        Selected: <span className="text-white/80">{creatorEditor.datasets.length}</span>
                      </div>
                    </>
                  )}
                </div>

                {/* Dataset attributes (vector features near this AOI/POI) */}
                <div className="space-y-2 border border-white/10 bg-black/30 rounded-sm p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[10px] font-mono text-white/40 uppercase tracking-widest">Dataset Attributes</div>
                    {creatorEditor.datasetFeatures.length > 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          setCreatorEditor((prev) => (prev ? { ...prev, datasetFeatures: [] } : prev))
                        }
                        className="text-[10px] font-mono text-white/50 hover:text-white underline underline-offset-2"
                        title="Clear selected dataset features"
                      >
                        Clear
                      </button>
                    )}
                  </div>

                  {(() => {
                    const vectorDatasets = creatorEditor.datasets.filter((d) => d.type === 'vector')
                    if (vectorDatasets.length === 0) {
                      return <div className="text-xs font-mono text-white/50">Select a vector dataset above to pick nearby features.</div>
                    }
                    const activeDataset = vectorDatasets.some((d) => d.name === datasetFeatureDataset)
                      ? datasetFeatureDataset
                      : vectorDatasets[0].name

                    return (
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-[10px] font-mono text-white/40 uppercase tracking-widest">Vector Dataset</label>
                            <select
                              value={activeDataset}
                              onChange={(e) => {
                                setDatasetFeatureDataset(e.target.value)
                                setDatasetFeatureCandidates(null)
                                setDatasetFeatureInspect(null)
                                setDatasetFeatureError(null)
                              }}
                              className="w-full bg-black/50 border border-white/10 rounded-sm px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-amber-500/50"
                            >
                              {vectorDatasets.map((d) => (
                                <option key={d.name} value={d.name}>
                                  {d.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="space-y-1 flex items-end">
                            <button
                              type="button"
                              onClick={loadNearestDatasetFeatures}
                              disabled={datasetFeatureLoading}
                              className="w-full px-3 py-2 text-[10px] font-mono uppercase tracking-widest bg-white/5 border border-white/10 text-white/70 hover:text-white hover:border-white/20 hover:bg-white/10 rounded-sm disabled:opacity-50"
                            >
                              {datasetFeatureLoading ? 'Searching…' : 'Find nearest 50'}
                            </button>
                          </div>
                        </div>

                        {datasetFeatureError && (
                          <div className="text-xs font-mono text-red-300 bg-red-500/10 border border-red-500/20 rounded-sm px-3 py-2">
                            {datasetFeatureError}
                          </div>
                        )}

                        {datasetFeatureCandidates && (
                          <div className="space-y-1">
                            <div className="text-[10px] font-mono text-white/40 uppercase tracking-widest">Candidates</div>
                            <div className="max-h-[180px] overflow-auto border border-white/10 rounded-sm bg-black/30">
                              {datasetFeatureCandidates.length === 0 ? (
                                <div className="px-3 py-2 text-xs font-mono text-white/50">No nearby features found.</div>
                              ) : (
                                datasetFeatureCandidates.map((cand) => {
                                  const fid = String((cand.feature as any)?.id ?? '')
                                  const checked = creatorEditor.datasetFeatures.some(
                                    (sel) =>
                                      sel.dataset === activeDataset && String((sel.feature as any)?.id ?? '') === fid
                                  )
                                  const props = ((cand.feature as any)?.properties || {}) as Record<string, any>
                                  const label = String((props.name ?? props.Name ?? props.id ?? props.ID ?? fid) || 'feature')
                                  return (
                                    <div
                                      key={`${activeDataset}:${fid}:${cand.rank}`}
                                      className="flex items-center justify-between gap-3 px-3 py-2 border-b border-white/5 last:border-b-0"
                                    >
                                      <label className="flex items-center gap-2 min-w-0 cursor-pointer">
                                        <input
                                          type="checkbox"
                                          checked={checked}
                                          onChange={() => {
                                            setCreatorEditor((prev) => {
                                              if (!prev) return prev
                                              const exists = prev.datasetFeatures.some(
                                                (sel) =>
                                                  sel.dataset === activeDataset &&
                                                  String((sel.feature as any)?.id ?? '') === fid
                                              )
                                              const next = exists
                                                ? prev.datasetFeatures.filter(
                                                    (sel) =>
                                                      !(
                                                        sel.dataset === activeDataset &&
                                                        String((sel.feature as any)?.id ?? '') === fid
                                                      )
                                                  )
                                                : [
                                                    ...prev.datasetFeatures,
                                                    {
                                                      dataset: activeDataset,
                                                      feature: cand.feature,
                                                      within_aoi: cand.within_aoi,
                                                      distance_m: cand.distance_m,
                                                      rank: cand.rank
                                                    }
                                                  ]
                                              return { ...prev, datasetFeatures: next }
                                            })
                                          }}
                                          className="accent-amber-400"
                                        />
                                        <span className="text-xs font-mono text-white/80 truncate" title={label}>
                                          {cand.rank}. {label}
                                        </span>
                                      </label>
                                      <div className="flex items-center gap-2 shrink-0">
                                        <span className="text-[9px] font-mono text-white/40 whitespace-nowrap">
                                          {creatorEditor.entryType === 'AOI' ? `${cand.within_aoi ? 'in' : 'out'} · ` : ''}
                                          {Math.round(cand.distance_m)}m
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            showFeatureHighlight(cand.feature, true)
                                            setDatasetFeatureInspect(cand)
                                          }}
                                          className="px-2 py-1 text-[10px] font-mono uppercase tracking-widest border border-white/15 text-white/60 hover:text-white hover:border-white/30 hover:bg-white/5 rounded-sm"
                                        >
                                          Zoom
                                        </button>
                                      </div>
                                    </div>
                                  )
                                })
                              )}
                            </div>
                          </div>
                        )}

                        {datasetFeatureInspect && (
                          <div className="space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-[10px] font-mono text-white/40 uppercase tracking-widest">Inspect</div>
                              <button
                                type="button"
                                onClick={() => setDatasetFeatureInspect(null)}
                                className="text-[10px] font-mono text-white/50 hover:text-white underline underline-offset-2"
                              >
                                Close
                              </button>
                            </div>
                            <div className="max-h-[160px] overflow-auto border border-white/10 rounded-sm bg-black/30 p-2">
                              {Object.entries(((datasetFeatureInspect.feature as any)?.properties || {}) as Record<string, any>)
                                .sort(([a], [b]) => a.localeCompare(b))
                                .map(([k, v]) => (
                                  <div key={k} className="grid grid-cols-3 gap-2 text-[10px] font-mono">
                                    <div className="text-white/50 uppercase tracking-wider truncate" title={k}>
                                      {k}
                                    </div>
                                    <div className="col-span-2 text-white/80 break-all">{prettyDatasetValue(v)}</div>
                                  </div>
                                ))}
                              {Object.keys(((datasetFeatureInspect.feature as any)?.properties || {}) as Record<string, any>).length ===
                                0 && <div className="text-xs font-mono text-white/50">No properties.</div>}
                            </div>
                          </div>
                        )}

                        <div className="space-y-1">
                          <div className="text-[10px] font-mono text-white/40 uppercase tracking-widest">Selected attributes</div>
                          {creatorEditor.datasetFeatures.length === 0 ? (
                            <div className="text-xs font-mono text-white/50">No features selected.</div>
                          ) : (
                            <div className="max-h-[260px] overflow-auto space-y-2">
                              {creatorEditor.datasetFeatures.map((sel, idx) => {
                                const fid = String((sel.feature as any)?.id ?? '')
                                const props = ((sel.feature as any)?.properties || {}) as Record<string, any>
                                const header = `${sel.dataset} · ${fid || 'feature'}`
                                return (
                                  <div key={`${sel.dataset}:${fid}:${idx}`} className="border border-white/10 bg-black/20 rounded-sm p-2">
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="min-w-0 text-[10px] font-mono text-white/70 truncate" title={header}>
                                        {header}
                                      </div>
                                      <div className="flex items-center gap-3 shrink-0">
                                        <button
                                          type="button"
                                          onClick={() => {
                                            showFeatureHighlight(sel.feature, true)
                                            setDatasetFeatureInspect({
                                              rank: sel.rank ?? 0,
                                              within_aoi: Boolean(sel.within_aoi),
                                              distance_m: Number(sel.distance_m ?? 0),
                                              feature: sel.feature
                                            })
                                          }}
                                          className="text-[10px] font-mono text-white/50 hover:text-white underline underline-offset-2"
                                        >
                                          Zoom
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setCreatorEditor((prev) => {
                                              if (!prev) return prev
                                              const next = prev.datasetFeatures.filter(
                                                (x) => !(x.dataset === sel.dataset && String((x.feature as any)?.id ?? '') === fid)
                                              )
                                              return { ...prev, datasetFeatures: next }
                                            })
                                          }}
                                          className="text-[10px] font-mono text-white/50 hover:text-white underline underline-offset-2"
                                        >
                                          Remove
                                        </button>
                                      </div>
                                    </div>
                                    <div className="mt-2 max-h-[160px] overflow-auto border border-white/10 rounded-sm bg-black/30 p-2">
                                      {Object.entries(props)
                                        .sort(([a], [b]) => a.localeCompare(b))
                                        .map(([k, v]) => (
                                          <div key={k} className="grid grid-cols-3 gap-2 text-[10px] font-mono">
                                            <div className="text-white/50 uppercase tracking-wider truncate" title={k}>
                                              {k}
                                            </div>
                                            <div className="col-span-2 text-white/80 break-all">{prettyDatasetValue(v)}</div>
                                          </div>
                                        ))}
                                      {Object.keys(props).length === 0 && (
                                        <div className="text-xs font-mono text-white/50">No properties.</div>
                                      )}
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })()}
                </div>

                {/* Add attachments */}
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-white/40 uppercase tracking-widest">Add Files / Images</label>
                  <input
                    type="file"
                    multiple
                    onChange={(e) => {
                      const files = Array.from(e.target.files || [])
                      if (files.length === 0) return
                      setCreatorEditor((prev) => (prev ? { ...prev, newFiles: [...prev.newFiles, ...files] } : prev))
                      e.currentTarget.value = ''
                    }}
                    className="w-full text-xs font-mono text-white/60"
                  />
                  {creatorEditor.newFiles.length > 0 && (
                    <div className="text-[10px] font-mono text-white/50">
                      {creatorEditor.newFiles.length} file(s) queued
                    </div>
                  )}
                </div>

                {creatorEditor.error && (
                  <div className="text-xs font-mono text-red-300 bg-red-500/10 border border-red-500/20 rounded-sm px-3 py-2">
                    {creatorEditor.error}
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/10">
                  <div />
                  <button
                    onClick={handleCreatorSave}
                    disabled={creatorEditor.saving}
                    className="px-3 py-2 text-[10px] font-mono uppercase tracking-widest bg-amber-500 text-black rounded-sm hover:bg-amber-400 disabled:opacity-50"
                  >
                    {creatorEditor.saving ? 'Saving...' : 'Create'}
                  </button>
                </div>
              </>
            ) : (
              <>
                {creatorEditor.section === 'info' && (
                  <>
                    {/* Summary */}
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
                        <div className="text-white/40 uppercase tracking-widest">Title</div>
                        <div className="text-white/80 text-right truncate" title={creatorEditor.title}>
                          {creatorEditor.title || '—'}
                        </div>

                        <div className="text-white/40 uppercase tracking-widest">Category</div>
                        <div className="text-white/80 text-right truncate">
                          {creatorEditor.category === 'Other'
                            ? `Other${creatorEditor.categoryOther ? ` (${creatorEditor.categoryOther})` : ''}`
                            : creatorEditor.category}
                        </div>
                      </div>
                    </div>

                    {/* Survey (read-only) */}
                    <div className="space-y-1">
                      <div className="text-[10px] font-mono text-white/40 uppercase tracking-widest">Survey</div>
                      {(() => {
                        const s = creatorEditor.survey ?? {}
                        const cf = (s as any).category_fields && typeof (s as any).category_fields === 'object' ? (s as any).category_fields : {}
                        const has =
                          Boolean(
                            (s as any).observation_type ||
                              (s as any).confidence ||
                              (s as any).method ||
                              (s as any).status ||
                              (s as any).observed_at ||
                              (s as any).gps_quality
                          ) ||
                          Object.values(cf).some((v) => typeof v === 'string' && v.trim())

                        if (!has) {
                          return <div className="text-xs font-mono text-white/50">No survey fields.</div>
                        }

                        return (
                          <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
                            <div className="text-white/40 uppercase tracking-widest">Observation</div>
                            <div className="text-white/80 text-right truncate">{(s as any).observation_type ?? '—'}</div>

                            <div className="text-white/40 uppercase tracking-widest">Confidence</div>
                            <div className="text-white/80 text-right truncate">{(s as any).confidence ?? '—'}</div>

                            <div className="text-white/40 uppercase tracking-widest">Method</div>
                            <div className="text-white/80 text-right truncate">{(s as any).method ?? '—'}</div>

                            <div className="text-white/40 uppercase tracking-widest">Status</div>
                            <div className="text-white/80 text-right truncate">{(s as any).status ?? '—'}</div>

                            <div className="text-white/40 uppercase tracking-widest">Observed At</div>
                            <div className="text-white/80 text-right truncate" title={(s as any).observed_at ?? ''}>
                              {(s as any).observed_at ?? '—'}
                            </div>

                            <div className="text-white/40 uppercase tracking-widest">GPS</div>
                            <div className="text-white/80 text-right truncate">{(s as any).gps_quality ?? '—'}</div>

                            {CATEGORY_FIELD_DEFS[creatorEditor.category].map((def) => {
                              const val = typeof cf?.[def.key] === 'string' ? String(cf[def.key]).trim() : ''
                              return (
                                <div key={def.key} className="contents">
                                  <div className="text-white/40 uppercase tracking-widest">{def.label}</div>
                                  <div className="text-white/80 text-right truncate" title={val}>
                                    {val || '—'}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )
                      })()}
                    </div>

                    {/* Datasets (read-only) */}
                    <div className="space-y-1">
                      <div className="text-[10px] font-mono text-white/40 uppercase tracking-widest">Datasets</div>
                      {creatorEditor.datasets.length === 0 ? (
                        <div className="text-xs font-mono text-white/50">No datasets linked.</div>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {creatorEditor.datasets.map((d) => (
                            <span
                              key={`${d.type ?? 'dataset'}:${d.name}`}
                              className="text-[10px] font-mono text-white/80 border border-white/10 bg-white/5 px-2 py-1 rounded-sm max-w-full truncate"
                              title={`${d.type ? `${d.type} · ` : ''}${d.name}`}
                            >
                              {d.type ? `${d.type.toUpperCase()} · ` : ''}
                              {d.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Linked Dataset Features (read-only) */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[10px] font-mono text-white/40 uppercase tracking-widest">Linked Features</div>
                        {(() => {
                          const linked = Array.isArray(creatorEditor.datasetFeatures) ? creatorEditor.datasetFeatures : []
                          const feats = linked
                            .map((df: any) => df?.feature)
                            .filter((f: any) => f && typeof f === 'object' && f.type === 'Feature' && f.geometry)
                          if (feats.length === 0) return null
                          const fc = { type: 'FeatureCollection', features: feats }
                          return (
                            <button
                              type="button"
                              onClick={() => showGeojsonHighlight(fc)}
                              className="text-[10px] font-mono text-amber-300 hover:text-amber-200 underline underline-offset-2"
                              title="Zoom to all linked dataset features"
                            >
                              Zoom all
                            </button>
                          )
                        })()}
                      </div>

                      {(() => {
                        const linked = Array.isArray(creatorEditor.datasetFeatures) ? creatorEditor.datasetFeatures : []
                        if (linked.length === 0) {
                          return <div className="text-xs font-mono text-white/50">No linked dataset features.</div>
                        }
                        return (
                          <div className="max-h-[140px] overflow-auto border border-white/10 rounded-sm bg-black/40">
                            <div className="p-2 space-y-1.5">
                              {linked.slice(0, 12).map((df: any, i: number) => {
                                const dataset = String(df?.dataset ?? '')
                                const feature = df?.feature
                                const featureId = feature?.id ? String(feature.id) : `feature-${i + 1}`
                                const label = dataset ? `${dataset} · ${featureId}` : featureId
                                const canZoom = Boolean(feature && typeof feature === 'object' && feature.type === 'Feature' && feature.geometry)
                                return (
                                  <div key={`${dataset}:${featureId}:${i}`} className="flex items-center justify-between gap-2">
                                    <div className="text-[10px] font-mono text-white/80 truncate" title={label}>
                                      {label}
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => canZoom && showGeojsonHighlight(feature)}
                                      disabled={!canZoom}
                                      className={cn(
                                        'text-[10px] font-mono underline underline-offset-2',
                                        canZoom ? 'text-white/50 hover:text-white' : 'text-white/20 cursor-not-allowed'
                                      )}
                                      title={canZoom ? 'Zoom to this feature' : 'No geometry available'}
                                    >
                                      Zoom
                                    </button>
                                  </div>
                                )
                              })}
                              {linked.length > 12 && (
                                <div className="text-[10px] font-mono text-white/30">Showing 12 / {linked.length}.</div>
                              )}
                            </div>
                          </div>
                        )
                      })()}
                    </div>

                    {/* Thread (append-only) */}
                    <div className="space-y-1">
                      <div className="text-[10px] font-mono text-white/40 uppercase tracking-widest">Thread</div>
                      {creatorEditor.changelog === null ? (
                        <div className="flex items-center gap-2 text-xs font-mono text-white/50">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          Loading thread…
                        </div>
                      ) : Array.isArray(creatorEditor.changelog) && creatorEditor.changelog.length > 0 ? (
                        <div className="max-h-[360px] overflow-auto border border-white/10 rounded-sm bg-black/40">
                          <div className="p-2 space-y-2">
                            {creatorEditor.changelog.slice(-25).map((rec: any, idx: number) => {
                              const action = String(rec?.action ?? 'event')
                              const ts = String(rec?.timestamp ?? '')
                              const actor = rec?.actor ?? {}
                              const actorLabel = String(actor?.name || actor?.username || 'unknown')
                              const sortie = rec?.sortie && typeof rec.sortie === 'object' ? rec.sortie : null
                              const sortieCode = typeof (sortie as any)?.code === 'string' ? String((sortie as any).code) : ''
                              const survey = rec?.survey && typeof rec.survey === 'object' ? rec.survey : null
                              const surveyObj = survey as any
                              const surveyCategoryFields =
                                surveyObj?.category_fields && typeof surveyObj.category_fields === 'object' ? surveyObj.category_fields : {}
                              const surveyParts: string[] = []
                              if (typeof surveyObj?.observation_type === 'string' && surveyObj.observation_type.trim()) {
                                surveyParts.push(`Obs: ${String(surveyObj.observation_type).trim()}`)
                              }
                              if (typeof surveyObj?.confidence === 'string' && surveyObj.confidence.trim()) {
                                surveyParts.push(`Conf: ${String(surveyObj.confidence).trim()}`)
                              }
                              if (typeof surveyObj?.method === 'string' && surveyObj.method.trim()) {
                                surveyParts.push(`Method: ${String(surveyObj.method).trim()}`)
                              }
                              if (typeof surveyObj?.status === 'string' && surveyObj.status.trim()) {
                                surveyParts.push(`Status: ${String(surveyObj.status).trim()}`)
                              }
                              if (typeof surveyObj?.gps_quality === 'string' && surveyObj.gps_quality.trim()) {
                                surveyParts.push(`GPS: ${String(surveyObj.gps_quality).trim()}`)
                              }
                              const categoryParts = CATEGORY_FIELD_DEFS[creatorEditor.category]
                                .map((def) => {
                                  const raw = surveyCategoryFields?.[def.key]
                                  const val = typeof raw === 'string' ? raw.trim() : ''
                                  return val ? `${def.label}: ${val}` : null
                                })
                                .filter(Boolean) as string[]
                              const surveyLine = [...surveyParts, ...categoryParts].join(' · ')
                              const hasSurvey = Boolean(surveyLine)
                              const datasetFeatures = Array.isArray((rec as any)?.dataset_features)
                                ? (((rec as any).dataset_features as any[]) || [])
                                : []
                              const datasetFeatureCount = datasetFeatures.length
                              const hasDatasetFeatures = datasetFeatureCount > 0
                              const changes = rec?.changes ?? {}
                              const fields = Array.isArray(changes?.fields) ? changes.fields : []
                              const commentChange = fields.find((f: any) => f?.field === 'comment')
                              const message = typeof commentChange?.to === 'string' ? commentChange.to : ''
                              const added = Array.isArray(changes?.attachments_added) ? changes.attachments_added : []
                              const removed = Array.isArray(changes?.attachments_removed) ? changes.attachments_removed : []
                              const hasGeometry = Boolean(changes?.geometry)
                              const otherFields = fields.filter((f: any) => f?.field && f.field !== 'comment')

                              const fallbackText =
                                action === 'create'
                                  ? 'Created entry.'
                                  : added.length > 0
                                    ? 'Added files.'
                                    : hasGeometry
                                      ? 'Updated geometry.'
                                      : hasSurvey
                                        ? 'Updated survey.'
                                        : hasDatasetFeatures
                                          ? 'Linked dataset features.'
                                      : otherFields.length > 0
                                        ? 'Updated entry.'
                                        : ''

                              const show = Boolean(
                                message?.trim() ||
                                  added.length ||
                                  removed.length ||
                                  hasGeometry ||
                                  hasSurvey ||
                                  hasDatasetFeatures ||
                                  otherFields.length ||
                                  action === 'create' ||
                                  action === 'delete'
                              )
                              if (!show) return null

                              return (
                                <div key={`${ts}:${idx}:${action}`} className="border border-white/10 bg-black/30 rounded-sm p-2">
                                  <div className="flex items-center justify-between gap-3 text-[10px] font-mono text-white/40">
                                    <div className="truncate">
                                      <span className="text-white/60">{actorLabel}</span>{' '}
                                      <span className="text-white/30">·</span>{' '}
                                      <span className="uppercase tracking-widest">{action}</span>
                                    </div>
                                    <div className="shrink-0 flex items-center gap-2">
                                      <button
                                        type="button"
                                        onClick={() => setCreatorThreadEntryDetails({ entryId: creatorEditor.entryId!, record: rec })}
                                        className="text-[10px] font-mono text-amber-300 hover:text-amber-200 underline underline-offset-2"
                                        title="Open details"
                                      >
                                        Details
                                      </button>
                                      <div className="shrink-0">{ts || '—'}</div>
                                    </div>
                                  </div>

                                  {sortieCode && (
                                    <div className="mt-1 text-[10px] font-mono text-white/40">
                                      Sortie:{' '}
                                      <span className="text-white/70" title={sortieCode}>
                                        {sortieCode}
                                      </span>
                                    </div>
                                  )}

                                  {hasSurvey && (
                                    <div className="mt-1 text-[10px] font-mono text-white/40">
                                      Survey:{' '}
                                      <span className="text-white/70" title={surveyLine}>
                                        {surveyLine}
                                      </span>
                                    </div>
                                  )}

                                  {hasDatasetFeatures && (
                                    <div className="mt-1 text-[10px] font-mono text-white/40">
                                      Dataset:{' '}
                                      <span className="text-white/70">{datasetFeatureCount} feature(s)</span>
                                    </div>
                                  )}

                                  <div className="mt-2 text-xs font-sans text-white/85 whitespace-pre-wrap leading-relaxed">
                                    {message?.trim() ? message : fallbackText}
                                  </div>

                                  {(added.length > 0 || removed.length > 0) && (
                                    <div className="mt-2 space-y-1">
                                      {added.length > 0 && (
                                        <div className="text-[10px] font-mono text-white/40">
                                          Files added:{' '}
                                          <span className="text-white/70">
                                            {added.map((fname: any) => String(fname)).join(', ')}
                                          </span>
                                        </div>
                                      )}
                                      {removed.length > 0 && (
                                        <div className="text-[10px] font-mono text-white/40">
                                          Files removed:{' '}
                                          <span className="text-white/70">
                                            {removed.map((fname: any) => String(fname)).join(', ')}
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                  )}

                                  {added.length > 0 && currentProject && creatorEditor.entryId && (
                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                      {added.map((fname: any) => {
                                        const filename = String(fname)
                                        return (
                                          <a
                                            key={filename}
                                            href={getCreatorAttachmentUrl(currentProject, creatorEditor.entryId!, filename)}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="text-[10px] font-mono text-amber-300 hover:underline border border-amber-500/20 bg-amber-500/10 px-2 py-1 rounded-sm max-w-full truncate"
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
                        </div>
                      ) : (
                        <div className="text-xs font-mono text-white/50">No updates yet.</div>
                      )}
                      <div className="text-[10px] font-mono text-white/35">
                        New notes/files are appended (history preserved).
                      </div>
                    </div>

                    {/* All Files (read-only) */}
                    <div className="space-y-1">
                      <div className="text-[10px] font-mono text-white/40 uppercase tracking-widest">All Files</div>
                      <div className="max-h-[200px] overflow-auto border border-white/10 rounded-sm">
                        {creatorEditor.existingAttachments.length === 0 ? (
                          <div className="px-3 py-2 text-xs font-mono text-white/50">No files attached.</div>
                        ) : (
                          creatorEditor.existingAttachments.map((att) => (
                            <div key={att.filename} className="px-3 py-2 border-b border-white/5 last:border-b-0">
                              <a
                                href={getCreatorAttachmentUrl(currentProject || '', creatorEditor.entryId!, att.filename)}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs font-mono text-amber-300 hover:underline truncate"
                                title={att.filename}
                              >
                                {att.filename}
                              </a>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/10">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleStartCreatorGeometryEdit}
                          className="px-3 py-2 text-[10px] font-mono uppercase tracking-widest border border-white/15 text-white/70 hover:text-white hover:border-white/30 hover:bg-white/5 rounded-sm"
                        >
                          Edit Geometry
                        </button>
                        <button
                          onClick={() => showGeojsonHighlight(creatorEditor.geometryWgs84)}
                          className="px-3 py-2 text-[10px] font-mono uppercase tracking-widest border border-white/15 text-white/70 hover:text-white hover:border-white/30 hover:bg-white/5 rounded-sm"
                          title="Zoom to this AOI/POI geometry"
                        >
                          Zoom
                        </button>
                      </div>
                      <button
                        onClick={() =>
                          setCreatorEditor((prev) =>
                            prev ? { ...prev, section: 'notes', comment: '', newFiles: [], removedAttachments: [], error: null } : prev
                          )
                        }
                        className="px-3 py-2 text-[10px] font-mono uppercase tracking-widest bg-amber-500 text-black rounded-sm hover:bg-amber-400"
                      >
                        Add Comment / Files
                      </button>
                    </div>
                  </>
                )}

                {creatorEditor.section === 'notes' && (
                  <>
                    {/* Sortie (optional) */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <label className="text-[10px] font-mono text-white/40 uppercase tracking-widest">Sortie ID (optional)</label>
                        {creatorEditor.sortie && (
                          <button
                            type="button"
                            onClick={() => setCreatorEditor((prev) => (prev ? { ...prev, sortie: null } : prev))}
                            className="text-[10px] font-mono text-white/50 hover:text-white underline underline-offset-2"
                            title="Clear sortie"
                          >
                            Clear
                          </button>
                        )}
                      </div>

                      {creatorEditor.sortie && (
                        <div className="text-[10px] font-mono text-white/50">
                          Selected: <span className="text-white/80">{creatorEditor.sortie.code}</span>
                        </div>
                      )}

                      <input
                        value={sortieQuery}
                        onChange={(e) => setSortieQuery(e.target.value)}
                        className="w-full bg-black/50 border border-white/10 rounded-sm px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-amber-500/50"
                        placeholder="Search sorties…"
                      />

                      <div className="max-h-[140px] overflow-auto border border-white/10 rounded-sm bg-black/30">
                        {sortieLoading ? (
                          <div className="px-3 py-2 text-xs font-mono text-white/50">Loading…</div>
                        ) : sortieOptions.length === 0 ? (
                          <div className="px-3 py-2 text-xs font-mono text-white/50">No sorties found.</div>
                        ) : (
                          sortieOptions.map((s) => {
                            const selected = creatorEditor.sortie?.id === s.id
                            return (
                              <button
                                key={s.id}
                                type="button"
                                onClick={() => {
                                  setCreatorEditor((prev) => (prev ? { ...prev, sortie: { id: s.id, code: s.code, name: s.name ?? null } } : prev))
                                  setSortieQuery('')
                                }}
                                className={cn(
                                  "w-full text-left px-3 py-2 text-xs font-mono border-b border-white/5 last:border-b-0 transition-colors flex items-center justify-between gap-3",
                                  selected ? "bg-amber-500/10 text-white" : "text-white/75 hover:bg-white/[0.03] hover:text-white"
                                )}
                                title={s.name ? `${s.code} · ${s.name}` : s.code}
                              >
                                <span className="truncate">{s.code}</span>
                                {s.name ? <span className="text-[10px] text-white/40 truncate max-w-[45%]">{s.name}</span> : null}
                              </button>
                            )
                          })
                        )}
                      </div>

                      {Boolean(sortieQuery.trim()) &&
                        !sortieLoading &&
                        !sortieCreating &&
                        !sortieOptions.some((s) => s.code.toLowerCase() === sortieQuery.trim().toLowerCase()) && (
                          <button
                            type="button"
                            onClick={handleCreateSortieFromQuery}
                            className="w-full px-3 py-2 text-[10px] font-mono uppercase tracking-widest bg-white/5 border border-white/10 text-white/70 hover:text-white hover:border-white/20 hover:bg-white/10 rounded-sm"
                          >
                            Create sortie “{sortieQuery.trim()}”
                          </button>
                        )}

                      {sortieCreating && (
                        <div className="flex items-center gap-2 text-xs font-mono text-white/50">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          Creating sortie…
                        </div>
                      )}

                      {sortieError && (
                        <div className="text-xs font-mono text-red-300 bg-red-500/10 border border-red-500/20 rounded-sm px-3 py-2">
                          {sortieError}
                        </div>
                      )}
                    </div>

                    {/* Survey (minimal) */}
                    <div className="space-y-2 border border-white/10 bg-black/30 rounded-sm p-3">
                      <div className="text-[10px] font-mono text-white/40 uppercase tracking-widest">Survey</div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-[10px] font-mono text-white/40 uppercase tracking-widest">Observation</label>
                          <select
                            value={creatorEditor.survey.observation_type ?? ''}
                            onChange={(e) =>
                              setCreatorEditor((prev) =>
                                prev
                                  ? {
                                      ...prev,
                                      survey: {
                                        ...prev.survey,
                                        observation_type: e.target.value ? (e.target.value as SurveyObservationType) : undefined
                                      }
                                    }
                                  : prev
                              )
                            }
                            className="w-full bg-black/50 border border-white/10 rounded-sm px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-amber-500/50"
                          >
                            <option value="">—</option>
                            <option>New</option>
                            <option>Confirm</option>
                            <option>Correct</option>
                            <option>Supersede</option>
                          </select>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-mono text-white/40 uppercase tracking-widest">Confidence</label>
                          <select
                            value={creatorEditor.survey.confidence ?? ''}
                            onChange={(e) =>
                              setCreatorEditor((prev) =>
                                prev
                                  ? {
                                      ...prev,
                                      survey: { ...prev.survey, confidence: e.target.value ? (e.target.value as SurveyConfidence) : undefined }
                                    }
                                  : prev
                              )
                            }
                            className="w-full bg-black/50 border border-white/10 rounded-sm px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-amber-500/50"
                          >
                            <option value="">—</option>
                            <option>Low</option>
                            <option>Med</option>
                            <option>High</option>
                          </select>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-mono text-white/40 uppercase tracking-widest">Method</label>
                          <select
                            value={creatorEditor.survey.method ?? ''}
                            onChange={(e) =>
                              setCreatorEditor((prev) =>
                                prev
                                  ? { ...prev, survey: { ...prev.survey, method: e.target.value ? (e.target.value as SurveyMethod) : undefined } }
                                  : prev
                              )
                            }
                            className="w-full bg-black/50 border border-white/10 rounded-sm px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-amber-500/50"
                          >
                            <option value="">—</option>
                            <option>Walkover</option>
                            <option>Vehicle</option>
                            <option>UAV</option>
                            <option>Other</option>
                          </select>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-mono text-white/40 uppercase tracking-widest">Status</label>
                          <select
                            value={creatorEditor.survey.status ?? ''}
                            onChange={(e) =>
                              setCreatorEditor((prev) =>
                                prev
                                  ? { ...prev, survey: { ...prev.survey, status: e.target.value ? (e.target.value as SurveyStatus) : undefined } }
                                  : prev
                              )
                            }
                            className="w-full bg-black/50 border border-white/10 rounded-sm px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-amber-500/50"
                          >
                            <option value="">—</option>
                            <option>Open</option>
                            <option>NeedsReview</option>
                            <option>Verified</option>
                            <option>Closed</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <label className="text-[10px] font-mono text-white/40 uppercase tracking-widest">Observed At (ISO)</label>
                            <button
                              type="button"
                              onClick={() =>
                                setCreatorEditor((prev) =>
                                  prev ? { ...prev, survey: { ...prev.survey, observed_at: new Date().toISOString() } } : prev
                                )
                              }
                              className="text-[10px] font-mono text-white/50 hover:text-white underline underline-offset-2"
                              title="Set to current time"
                            >
                              Now
                            </button>
                          </div>
                          <input
                            value={creatorEditor.survey.observed_at ?? ''}
                            onChange={(e) =>
                              setCreatorEditor((prev) =>
                                prev ? { ...prev, survey: { ...prev.survey, observed_at: e.target.value || undefined } } : prev
                              )
                            }
                            className="w-full bg-black/50 border border-white/10 rounded-sm px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-amber-500/50"
                            placeholder="e.g. 2026-01-13T10:15:00Z"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-mono text-white/40 uppercase tracking-widest">GPS Quality</label>
                          <select
                            value={creatorEditor.survey.gps_quality ?? ''}
                            onChange={(e) =>
                              setCreatorEditor((prev) =>
                                prev
                                  ? {
                                      ...prev,
                                      survey: {
                                        ...prev.survey,
                                        gps_quality: e.target.value ? (e.target.value as SurveyGpsQuality) : undefined
                                      }
                                    }
                                  : prev
                              )
                            }
                            className="w-full bg-black/50 border border-white/10 rounded-sm px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-amber-500/50"
                          >
                            <option value="">—</option>
                            <option>Good</option>
                            <option>OK</option>
                            <option>Poor</option>
                          </select>
                        </div>
                      </div>

                      <div className="space-y-2 pt-1">
                        <div className="text-[10px] font-mono text-white/40 uppercase tracking-widest">Category Fields</div>
                        <div className="grid grid-cols-2 gap-3">
                          {CATEGORY_FIELD_DEFS[creatorEditor.category].map((def) => {
                            const value = creatorEditor.survey.category_fields?.[def.key] ?? ''
                            return (
                              <div key={def.key} className="space-y-1">
                                <label className="text-[10px] font-mono text-white/40 uppercase tracking-widest">{def.label}</label>
                                <input
                                  value={value}
                                  onChange={(e) =>
                                    setCreatorEditor((prev) => {
                                      if (!prev) return prev
                                      const current = prev.survey.category_fields ?? {}
                                      const nextFields = { ...current, [def.key]: e.target.value }
                                      return { ...prev, survey: { ...prev.survey, category_fields: nextFields } }
                                    })
                                  }
                                  className="w-full bg-black/50 border border-white/10 rounded-sm px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-amber-500/50"
                                  placeholder={def.placeholder}
                                />
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Datasets (optional) */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <label className="text-[10px] font-mono text-white/40 uppercase tracking-widest">Datasets (optional)</label>
                        {creatorEditor.datasets.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setCreatorEditor((prev) => (prev ? { ...prev, datasets: [] } : prev))}
                            className="text-[10px] font-mono text-white/50 hover:text-white underline underline-offset-2"
                            title="Clear selected datasets"
                          >
                            Clear
                          </button>
                        )}
                      </div>

                      {!datasets ? (
                        <div className="text-xs font-mono text-white/50">Datasets are still loading…</div>
                      ) : creatorDatasetOptions.length === 0 ? (
                        <div className="text-xs font-mono text-white/50">No datasets found for this project.</div>
                      ) : (
                        <>
                          <input
                            value={creatorDatasetQuery}
                            onChange={(e) => setCreatorDatasetQuery(e.target.value)}
                            className="w-full bg-black/50 border border-white/10 rounded-sm px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-amber-500/50"
                            placeholder="Search datasets…"
                          />

                          <div className="max-h-[140px] overflow-auto border border-white/10 rounded-sm bg-black/30">
                            {filteredCreatorDatasetOptions.length === 0 ? (
                              <div className="px-3 py-2 text-xs font-mono text-white/50">No matches.</div>
                            ) : (
                              filteredCreatorDatasetOptions.map((opt) => {
                                const key = `${opt.type ?? 'dataset'}:${opt.name}`
                                const checked = creatorEditor.datasets.some((d) => d.name === opt.name && d.type === opt.type)
                                return (
                                  <label
                                    key={key}
                                    className="flex items-center justify-between gap-3 px-3 py-2 border-b border-white/5 last:border-b-0 hover:bg-white/[0.03] cursor-pointer"
                                  >
                                    <div className="flex items-center gap-2 min-w-0">
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() => {
                                          setCreatorEditor((prev) => {
                                            if (!prev) return prev
                                            const exists = prev.datasets.some((d) => d.name === opt.name && d.type === opt.type)
                                            const next = exists
                                              ? prev.datasets.filter((d) => !(d.name === opt.name && d.type === opt.type))
                                              : [...prev.datasets, { name: opt.name, type: opt.type }]
                                            return { ...prev, datasets: next }
                                          })
                                        }}
                                        className="accent-amber-400"
                                      />
                                      <span className="text-xs font-mono text-white/80 truncate" title={opt.name}>
                                        {opt.name}
                                      </span>
                                    </div>
                                    <span className="shrink-0 text-[9px] font-mono uppercase tracking-widest text-white/50 border border-white/10 bg-white/5 px-1.5 py-0.5 rounded-[2px]">
                                      {opt.type ?? 'dataset'}
                                    </span>
                                  </label>
                                )
                              })
                            )}
                          </div>

                          <div className="text-[10px] font-mono text-white/50">
                            Selected: <span className="text-white/80">{creatorEditor.datasets.length}</span>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Dataset attributes (vector features near this AOI/POI) */}
                    <div className="space-y-2 border border-white/10 bg-black/30 rounded-sm p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[10px] font-mono text-white/40 uppercase tracking-widest">Dataset Attributes</div>
                        {creatorEditor.datasetFeatures.length > 0 && (
                          <button
                            type="button"
                            onClick={() =>
                              setCreatorEditor((prev) => (prev ? { ...prev, datasetFeatures: [] } : prev))
                            }
                            className="text-[10px] font-mono text-white/50 hover:text-white underline underline-offset-2"
                            title="Clear selected dataset features"
                          >
                            Clear
                          </button>
                        )}
                      </div>

                      {(() => {
                        const vectorDatasets = creatorEditor.datasets.filter((d) => d.type === 'vector')
                        if (vectorDatasets.length === 0) {
                          return (
                            <div className="text-xs font-mono text-white/50">
                              Select a vector dataset above to pick nearby features.
                            </div>
                          )
                        }
                        const activeDataset = vectorDatasets.some((d) => d.name === datasetFeatureDataset)
                          ? datasetFeatureDataset
                          : vectorDatasets[0].name

                        return (
                          <div className="space-y-2">
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-1">
                                <label className="text-[10px] font-mono text-white/40 uppercase tracking-widest">Vector Dataset</label>
                                <select
                                  value={activeDataset}
                                  onChange={(e) => {
                                    setDatasetFeatureDataset(e.target.value)
                                    setDatasetFeatureCandidates(null)
                                    setDatasetFeatureInspect(null)
                                    setDatasetFeatureError(null)
                                  }}
                                  className="w-full bg-black/50 border border-white/10 rounded-sm px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-amber-500/50"
                                >
                                  {vectorDatasets.map((d) => (
                                    <option key={d.name} value={d.name}>
                                      {d.name}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div className="space-y-1 flex items-end">
                                <button
                                  type="button"
                                  onClick={loadNearestDatasetFeatures}
                                  disabled={datasetFeatureLoading}
                                  className="w-full px-3 py-2 text-[10px] font-mono uppercase tracking-widest bg-white/5 border border-white/10 text-white/70 hover:text-white hover:border-white/20 hover:bg-white/10 rounded-sm disabled:opacity-50"
                                >
                                  {datasetFeatureLoading ? 'Searching…' : 'Find nearest 50'}
                                </button>
                              </div>
                            </div>

                            {datasetFeatureError && (
                              <div className="text-xs font-mono text-red-300 bg-red-500/10 border border-red-500/20 rounded-sm px-3 py-2">
                                {datasetFeatureError}
                              </div>
                            )}

                            {datasetFeatureCandidates && (
                              <div className="space-y-1">
                                <div className="text-[10px] font-mono text-white/40 uppercase tracking-widest">Candidates</div>
                                <div className="max-h-[180px] overflow-auto border border-white/10 rounded-sm bg-black/30">
                                  {datasetFeatureCandidates.length === 0 ? (
                                    <div className="px-3 py-2 text-xs font-mono text-white/50">No nearby features found.</div>
                                  ) : (
                                    datasetFeatureCandidates.map((cand) => {
                                      const fid = String((cand.feature as any)?.id ?? '')
                                      const checked = creatorEditor.datasetFeatures.some(
                                        (sel) =>
                                          sel.dataset === activeDataset && String((sel.feature as any)?.id ?? '') === fid
                                      )
                                      const props = ((cand.feature as any)?.properties || {}) as Record<string, any>
                                      const label = String((props.name ?? props.Name ?? props.id ?? props.ID ?? fid) || 'feature')
                                      return (
                                        <div
                                          key={`${activeDataset}:${fid}:${cand.rank}`}
                                          className="flex items-center justify-between gap-3 px-3 py-2 border-b border-white/5 last:border-b-0"
                                        >
                                          <label className="flex items-center gap-2 min-w-0 cursor-pointer">
                                            <input
                                              type="checkbox"
                                              checked={checked}
                                              onChange={() => {
                                                setCreatorEditor((prev) => {
                                                  if (!prev) return prev
                                                  const exists = prev.datasetFeatures.some(
                                                    (sel) =>
                                                      sel.dataset === activeDataset &&
                                                      String((sel.feature as any)?.id ?? '') === fid
                                                  )
                                                  const next = exists
                                                    ? prev.datasetFeatures.filter(
                                                        (sel) =>
                                                          !(
                                                            sel.dataset === activeDataset &&
                                                            String((sel.feature as any)?.id ?? '') === fid
                                                          )
                                                      )
                                                    : [
                                                        ...prev.datasetFeatures,
                                                        {
                                                          dataset: activeDataset,
                                                          feature: cand.feature,
                                                          within_aoi: cand.within_aoi,
                                                          distance_m: cand.distance_m,
                                                          rank: cand.rank
                                                        }
                                                      ]
                                                  return { ...prev, datasetFeatures: next }
                                                })
                                              }}
                                              className="accent-amber-400"
                                            />
                                            <span className="text-xs font-mono text-white/80 truncate" title={label}>
                                              {cand.rank}. {label}
                                            </span>
                                          </label>
                                          <div className="flex items-center gap-2 shrink-0">
                                            <span className="text-[9px] font-mono text-white/40 whitespace-nowrap">
                                              {creatorEditor.entryType === 'AOI' ? `${cand.within_aoi ? 'in' : 'out'} · ` : ''}
                                              {Math.round(cand.distance_m)}m
                                            </span>
                                            <button
                                              type="button"
                                              onClick={() => {
                                                showFeatureHighlight(cand.feature, true)
                                                setDatasetFeatureInspect(cand)
                                              }}
                                              className="px-2 py-1 text-[10px] font-mono uppercase tracking-widest border border-white/15 text-white/60 hover:text-white hover:border-white/30 hover:bg-white/5 rounded-sm"
                                            >
                                              Zoom
                                            </button>
                                          </div>
                                        </div>
                                      )
                                    })
                                  )}
                                </div>
                              </div>
                            )}

                            {datasetFeatureInspect && (
                              <div className="space-y-1">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="text-[10px] font-mono text-white/40 uppercase tracking-widest">Inspect</div>
                                  <button
                                    type="button"
                                    onClick={() => setDatasetFeatureInspect(null)}
                                    className="text-[10px] font-mono text-white/50 hover:text-white underline underline-offset-2"
                                  >
                                    Close
                                  </button>
                                </div>
                                <div className="max-h-[160px] overflow-auto border border-white/10 rounded-sm bg-black/30 p-2">
                                  {Object.entries(((datasetFeatureInspect.feature as any)?.properties || {}) as Record<string, any>)
                                    .sort(([a], [b]) => a.localeCompare(b))
                                    .map(([k, v]) => (
                                      <div key={k} className="grid grid-cols-3 gap-2 text-[10px] font-mono">
                                        <div className="text-white/50 uppercase tracking-wider truncate" title={k}>
                                          {k}
                                        </div>
                                        <div className="col-span-2 text-white/80 break-all">{prettyDatasetValue(v)}</div>
                                      </div>
                                    ))}
                                  {Object.keys(((datasetFeatureInspect.feature as any)?.properties || {}) as Record<string, any>).length ===
                                    0 && <div className="text-xs font-mono text-white/50">No properties.</div>}
                                </div>
                              </div>
                            )}

                            <div className="space-y-1">
                              <div className="text-[10px] font-mono text-white/40 uppercase tracking-widest">Selected attributes</div>
                              {creatorEditor.datasetFeatures.length === 0 ? (
                                <div className="text-xs font-mono text-white/50">No features selected.</div>
                              ) : (
                                <div className="max-h-[260px] overflow-auto space-y-2">
                                  {creatorEditor.datasetFeatures.map((sel, idx) => {
                                    const fid = String((sel.feature as any)?.id ?? '')
                                    const props = ((sel.feature as any)?.properties || {}) as Record<string, any>
                                    const header = `${sel.dataset} · ${fid || 'feature'}`
                                    return (
                                      <div
                                        key={`${sel.dataset}:${fid}:${idx}`}
                                        className="border border-white/10 bg-black/20 rounded-sm p-2"
                                      >
                                        <div className="flex items-center justify-between gap-2">
                                          <div className="min-w-0 text-[10px] font-mono text-white/70 truncate" title={header}>
                                            {header}
                                          </div>
                                          <div className="flex items-center gap-3 shrink-0">
                                            <button
                                              type="button"
                                              onClick={() => {
                                                showFeatureHighlight(sel.feature, true)
                                                setDatasetFeatureInspect({
                                                  rank: sel.rank ?? 0,
                                                  within_aoi: Boolean(sel.within_aoi),
                                                  distance_m: Number(sel.distance_m ?? 0),
                                                  feature: sel.feature
                                                })
                                              }}
                                              className="text-[10px] font-mono text-white/50 hover:text-white underline underline-offset-2"
                                            >
                                              Zoom
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setCreatorEditor((prev) => {
                                                  if (!prev) return prev
                                                  const next = prev.datasetFeatures.filter(
                                                    (x) => !(x.dataset === sel.dataset && String((x.feature as any)?.id ?? '') === fid)
                                                  )
                                                  return { ...prev, datasetFeatures: next }
                                                })
                                              }}
                                              className="text-[10px] font-mono text-white/50 hover:text-white underline underline-offset-2"
                                            >
                                              Remove
                                            </button>
                                          </div>
                                        </div>
                                        <div className="mt-2 max-h-[160px] overflow-auto border border-white/10 rounded-sm bg-black/30 p-2">
                                          {Object.entries(props)
                                            .sort(([a], [b]) => a.localeCompare(b))
                                            .map(([k, v]) => (
                                              <div key={k} className="grid grid-cols-3 gap-2 text-[10px] font-mono">
                                                <div className="text-white/50 uppercase tracking-wider truncate" title={k}>
                                                  {k}
                                                </div>
                                                <div className="col-span-2 text-white/80 break-all">{prettyDatasetValue(v)}</div>
                                              </div>
                                            ))}
                                          {Object.keys(props).length === 0 && (
                                            <div className="text-xs font-mono text-white/50">No properties.</div>
                                          )}
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })()}
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-mono text-white/40 uppercase tracking-widest">New Comment (appended)</label>
                      <textarea
                        value={creatorEditor.comment}
                        onChange={(e) =>
                          setCreatorEditor((prev) => (prev ? { ...prev, comment: e.target.value } : prev))
                        }
                        rows={7}
                        className="w-full bg-black/50 border border-white/10 rounded-sm px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-amber-500/50"
                        placeholder="Write an update to append to the thread..."
                      />
                      <div className="text-[10px] font-mono text-white/35">
                        Tip: each save appends a new entry to the thread (history is preserved).
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-mono text-white/40 uppercase tracking-widest">Attach Files / Images (optional)</label>
                      <input
                        type="file"
                        multiple
                        onChange={(e) => {
                          const files = Array.from(e.target.files || [])
                          if (files.length === 0) return
                          setCreatorEditor((prev) => (prev ? { ...prev, newFiles: [...prev.newFiles, ...files] } : prev))
                          e.currentTarget.value = ''
                        }}
                        className="w-full text-xs font-mono text-white/60"
                      />
                      {creatorEditor.newFiles.length > 0 && (
                        <div className="text-[10px] font-mono text-white/50">
                          {creatorEditor.newFiles.length} file(s) queued
                        </div>
                      )}
                    </div>

                    {creatorEditor.error && (
                      <div className="text-xs font-mono text-red-300 bg-red-500/10 border border-red-500/20 rounded-sm px-3 py-2">
                        {creatorEditor.error}
                      </div>
                    )}

                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/10">
                      <button
                        onClick={() =>
                          setCreatorEditor((prev) =>
                            prev ? { ...prev, section: 'info', comment: '', newFiles: [], error: null } : prev
                          )
                        }
                        className="px-3 py-2 text-[10px] font-mono uppercase tracking-widest border border-white/15 text-white/60 hover:text-white hover:border-white/30 hover:bg-white/5 rounded-sm"
                      >
                        Back
                      </button>
                      <button
                        onClick={handleCreatorSave}
                        disabled={creatorEditor.saving || (!creatorEditor.comment.trim() && creatorEditor.newFiles.length === 0)}
                        className="px-3 py-2 text-[10px] font-mono uppercase tracking-widest bg-amber-500 text-black rounded-sm hover:bg-amber-400 disabled:opacity-50"
                      >
                        {creatorEditor.saving ? 'Posting...' : 'Post Update'}
                      </button>
                    </div>
                  </>
                )}

                {creatorEditor.section === 'files' && (
                  <>
                    <div className="space-y-1">
                      <div className="text-[10px] font-mono text-white/40 uppercase tracking-widest">Existing Files</div>
                      <div className="max-h-[140px] overflow-auto border border-white/10 rounded-sm">
                        {creatorEditor.existingAttachments.length === 0 ? (
                          <div className="px-3 py-2 text-xs font-mono text-white/50">No files attached.</div>
                        ) : (
                          creatorEditor.existingAttachments.map((att) => (
                            <div key={att.filename} className="px-3 py-2 border-b border-white/5 last:border-b-0">
                              <a
                                href={getCreatorAttachmentUrl(currentProject || '', creatorEditor.entryId!, att.filename)}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs font-mono text-amber-300 hover:underline truncate"
                                title={att.filename}
                              >
                                {att.filename}
                              </a>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-mono text-white/40 uppercase tracking-widest">Add Files / Images</label>
                      <input
                        type="file"
                        multiple
                        onChange={(e) => {
                          const files = Array.from(e.target.files || [])
                          if (files.length === 0) return
                          setCreatorEditor((prev) => (prev ? { ...prev, newFiles: [...prev.newFiles, ...files] } : prev))
                          e.currentTarget.value = ''
                        }}
                        className="w-full text-xs font-mono text-white/60"
                      />
                      {creatorEditor.newFiles.length > 0 && (
                        <div className="text-[10px] font-mono text-white/50">
                          {creatorEditor.newFiles.length} file(s) queued
                        </div>
                      )}
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-mono text-white/40 uppercase tracking-widest">Optional Comment (appended)</label>
                      <textarea
                        value={creatorEditor.comment}
                        onChange={(e) =>
                          setCreatorEditor((prev) => (prev ? { ...prev, comment: e.target.value } : prev))
                        }
                        rows={4}
                        className="w-full bg-black/50 border border-white/10 rounded-sm px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-amber-500/50"
                        placeholder="Optional note to append with these files..."
                      />
                    </div>

                    {creatorEditor.error && (
                      <div className="text-xs font-mono text-red-300 bg-red-500/10 border border-red-500/20 rounded-sm px-3 py-2">
                        {creatorEditor.error}
                      </div>
                    )}

                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/10">
                      <button
                        onClick={() =>
                          setCreatorEditor((prev) =>
                            prev ? { ...prev, section: 'info', comment: '', newFiles: [], error: null } : prev
                          )
                        }
                        className="px-3 py-2 text-[10px] font-mono uppercase tracking-widest border border-white/15 text-white/60 hover:text-white hover:border-white/30 hover:bg-white/5 rounded-sm"
                      >
                        Back
                      </button>
                      <button
                        onClick={handleCreatorSave}
                        disabled={creatorEditor.saving || (creatorEditor.newFiles.length === 0 && !creatorEditor.comment.trim())}
                        className="px-3 py-2 text-[10px] font-mono uppercase tracking-widest bg-amber-500 text-black rounded-sm hover:bg-amber-400 disabled:opacity-50"
                      >
                        {creatorEditor.saving ? (creatorEditor.newFiles.length > 0 ? 'Uploading...' : 'Posting...') : 'Post Update'}
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
            </div>
          </div>
        </div>
      )}

      {/* Thread entry details dialog (formatted) */}
      {currentProject && mapMode === 'operator' && creatorEditor && creatorThreadEntryDetails && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 animate-fade-in">
          <div
            className="absolute inset-0 bg-black/85 backdrop-blur-md"
            onClick={() => setCreatorThreadEntryDetails(null)}
          >
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none" />
          </div>

          {(() => {
            const rec: any = creatorThreadEntryDetails.record ?? {}
            const action = String(rec?.action ?? 'event')
            const ts = String(rec?.timestamp ?? '')
            const actor = rec?.actor && typeof rec.actor === 'object' ? rec.actor : {}
            const actorLabel = String(actor?.name || actor?.username || 'unknown')
            const changes = rec?.changes && typeof rec.changes === 'object' ? rec.changes : {}
            const fields = Array.isArray(changes?.fields) ? changes.fields : []
            const commentChange = fields.find((f: any) => f?.field === 'comment')
            const message = typeof commentChange?.to === 'string' ? String(commentChange.to) : ''
            const added = Array.isArray(changes?.attachments_added) ? changes.attachments_added : []
            const removed = Array.isArray(changes?.attachments_removed) ? changes.attachments_removed : []

            const datasetFeatures = Array.isArray(rec?.dataset_features) ? (rec.dataset_features as any[]) : []
            const datasetFeatureGeojsonFeatures = datasetFeatures
              .map((df: any) => df?.feature)
              .filter((f: any) => f && typeof f === 'object' && f.type === 'Feature' && f.geometry)
            const datasetFeaturesFc =
              datasetFeatureGeojsonFeatures.length > 0
                ? ({ type: 'FeatureCollection', features: datasetFeatureGeojsonFeatures } as any)
                : null

            const badge =
              action === 'delete'
                ? 'bg-red-500/10 border-red-500/30 text-red-400'
                : action === 'update'
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                  : action === 'create'
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                    : 'bg-white/5 border-white/10 text-white/60'

            const geometry = changes?.geometry
            const geometryAfter = geometry?.after ?? null
            const geometryBefore = geometry?.before ?? null

            const sortie = rec?.sortie && typeof rec.sortie === 'object' ? rec.sortie : null
            const survey = rec?.survey && typeof rec.survey === 'object' ? rec.survey : null

            const safeStr = (v: any) => (v === null || v === undefined ? '' : String(v))
            const renderValue = (v: any) => {
              if (v === null || v === undefined || v === '') return <span className="text-white/30">—</span>
              if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
                return <span className="text-white/80 font-mono break-all">{String(v)}</span>
              }
              try {
                return <span className="text-white/80 font-mono break-all">{JSON.stringify(v)}</span>
              } catch {
                return <span className="text-white/80 font-mono break-all">{String(v)}</span>
              }
            }

            const FieldRow = ({ label, value }: { label: string; value: React.ReactNode }) => (
              <div className="grid grid-cols-3 gap-3 text-[10px]">
                <div className="text-white/50 uppercase tracking-wider">{label}</div>
                <div className="col-span-2">{value}</div>
              </div>
            )

            const entryId = String(rec?.entry_id ?? creatorEditor.entryId ?? '')

            return (
              <div
                className="relative w-[980px] max-w-[96vw] max-h-[92vh] rounded-sm bg-[#0a0a0a]/95 border border-white/10 shadow-[0_0_60px_-10px_rgba(0,0,0,0.85)] flex flex-col overflow-hidden pointer-events-auto font-mono"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-amber-500/40 to-transparent" />

                <header className="px-6 py-4 border-b border-white/10 flex items-start justify-between bg-black/20 shrink-0">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-[10px] text-white/40 uppercase tracking-[0.2em]">
                      <span>Operator</span>
                      <span className="text-white/20">|</span>
                      <span className="text-white/50 truncate">{currentProject}</span>
                    </div>
                    <div className="mt-2 flex items-center gap-2 min-w-0">
                      <span className={cn('px-2 py-0.5 text-[9px] uppercase tracking-wider border rounded-sm', badge)}>
                        {action.toUpperCase()}
                      </span>
                      <div className="text-sm font-bold text-white truncate">Thread Entry Details</div>
                    </div>
                    <div className="mt-2 text-[10px] text-white/40 font-mono flex flex-wrap gap-x-3 gap-y-1">
                      <span>
                        Actor: <span className="text-white/70">{actorLabel}</span>
                      </span>
                      <span className="text-white/20">|</span>
                      <span>
                        Time: <span className="text-white/70">{ts || '—'}</span>
                      </span>
                      {entryId ? (
                        <>
                          <span className="text-white/20">|</span>
                          <span>
                            Entry ID: <span className="text-white/70">{entryId}</span>
                          </span>
                        </>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => showGeojsonHighlight(creatorEditor.geometryWgs84)}
                      className="px-3 py-2 text-[10px] font-mono uppercase tracking-widest border border-white/15 text-white/70 hover:text-white hover:border-white/30 hover:bg-white/5 rounded-sm"
                      title="Zoom to current entry geometry"
                    >
                      Zoom entry
                    </button>
                    <button
                      type="button"
                      onClick={() => datasetFeaturesFc && showGeojsonHighlight(datasetFeaturesFc)}
                      disabled={!datasetFeaturesFc}
                      className={cn(
                        'px-3 py-2 text-[10px] font-mono uppercase tracking-widest border rounded-sm',
                        datasetFeaturesFc
                          ? 'border-amber-500/30 text-amber-200/80 hover:bg-amber-500/10 hover:text-amber-200'
                          : 'border-white/10 text-white/25 cursor-not-allowed'
                      )}
                      title={datasetFeaturesFc ? 'Zoom to linked dataset features' : 'No linked dataset features in this thread entry'}
                    >
                      Zoom features
                    </button>
                    <button
                      onClick={() => setCreatorThreadEntryDetails(null)}
                      className="p-2 hover:bg-white/5 border border-transparent hover:border-white/10 rounded-sm text-white/50 hover:text-white transition-all"
                      title="Close"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </header>

                <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-[linear-gradient(to_right,#ffffff02_1px,transparent_1px),linear-gradient(to_bottom,#ffffff02_1px,transparent_1px)] bg-[size:20px_20px]">
                  {/* Message */}
                  <div className="border border-white/10 bg-black/30 rounded-sm p-4 space-y-2">
                    <div className="text-[10px] text-white/40 uppercase tracking-[0.2em]">Message</div>
                    <div className="text-sm text-white/85 whitespace-pre-wrap font-sans leading-relaxed">
                      {message?.trim() ? message : <span className="text-white/40">No comment text in this entry.</span>}
                    </div>
                  </div>

                  {/* Actor */}
                  <div className="border border-white/10 bg-black/30 rounded-sm p-4 space-y-2">
                    <div className="text-[10px] text-white/40 uppercase tracking-[0.2em]">Actor</div>
                    <div className="space-y-2">
                      <FieldRow label="Username" value={renderValue(actor?.username)} />
                      <FieldRow label="Name" value={renderValue(actor?.name)} />
                      <FieldRow label="Role" value={renderValue(actor?.role)} />
                      <FieldRow label="Company" value={renderValue(actor?.company)} />
                      <FieldRow label="Organization" value={renderValue(actor?.organization)} />
                      <FieldRow label="Department" value={renderValue(actor?.department)} />
                    </div>
                  </div>

                  {/* Sortie / Survey */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="border border-white/10 bg-black/30 rounded-sm p-4 space-y-2">
                      <div className="text-[10px] text-white/40 uppercase tracking-[0.2em]">Sortie</div>
                      {sortie ? (
                        <div className="space-y-2">
                          <FieldRow label="Code" value={renderValue((sortie as any).code)} />
                          <FieldRow label="Name" value={renderValue((sortie as any).name)} />
                          <FieldRow label="ID" value={renderValue((sortie as any).id)} />
                        </div>
                      ) : (
                        <div className="text-xs text-white/40">—</div>
                      )}
                    </div>

                    <div className="border border-white/10 bg-black/30 rounded-sm p-4 space-y-2">
                      <div className="text-[10px] text-white/40 uppercase tracking-[0.2em]">Survey</div>
                      {survey ? (
                        <div className="space-y-2">
                          {Object.entries(survey as any).map(([k, v]) => (
                            <FieldRow key={k} label={k} value={renderValue(v)} />
                          ))}
                        </div>
                      ) : (
                        <div className="text-xs text-white/40">—</div>
                      )}
                    </div>
                  </div>

                  {/* Linked dataset features */}
                  <div className="border border-white/10 bg-black/30 rounded-sm p-4 space-y-2">
                    <div className="text-[10px] text-white/40 uppercase tracking-[0.2em]">Linked Dataset Features</div>
                    {datasetFeatures.length === 0 ? (
                      <div className="text-xs text-white/40">No dataset features linked in this thread entry.</div>
                    ) : (
                      <div className="space-y-2">
                        {datasetFeatures.slice(0, 20).map((df: any, i: number) => {
                          const dataset = safeStr(df?.dataset)
                          const feature = df?.feature
                          const featureId = feature?.id ? safeStr(feature.id) : `feature-${i + 1}`
                          const canZoom = Boolean(feature && typeof feature === 'object' && feature.type === 'Feature' && feature.geometry)
                          return (
                            <div key={`${dataset}:${featureId}:${i}`} className="border border-white/10 bg-black/40 rounded-sm p-3">
                              <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="text-[10px] text-white/40 font-mono">
                                    Dataset: <span className="text-white/70">{dataset || '—'}</span>
                                  </div>
                                  <div className="text-xs text-white/80 font-mono truncate" title={featureId}>
                                    Feature: {featureId}
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => canZoom && showGeojsonHighlight(feature)}
                                  disabled={!canZoom}
                                  className={cn(
                                    'px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest border rounded-sm',
                                    canZoom
                                      ? 'border-white/15 text-white/70 hover:text-white hover:border-white/30 hover:bg-white/5'
                                      : 'border-white/10 text-white/25 cursor-not-allowed'
                                  )}
                                  title={canZoom ? 'Zoom to this feature' : 'No geometry available'}
                                >
                                  Zoom
                                </button>
                              </div>
                              <div className="mt-2 grid grid-cols-3 gap-3 text-[10px] font-mono text-white/50">
                                <div>
                                  Rank: <span className="text-white/70">{renderValue(df?.rank)}</span>
                                </div>
                                <div>
                                  Within AOI: <span className="text-white/70">{renderValue(df?.within_aoi)}</span>
                                </div>
                                <div>
                                  Distance (m): <span className="text-white/70">{renderValue(df?.distance_m)}</span>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                        {datasetFeatures.length > 20 && (
                          <div className="text-[10px] text-white/30 font-mono">Showing 20 / {datasetFeatures.length}.</div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Attachments */}
                  <div className="border border-white/10 bg-black/30 rounded-sm p-4 space-y-2">
                    <div className="text-[10px] text-white/40 uppercase tracking-[0.2em]">Files</div>
                    <FieldRow label="Added" value={renderValue(added)} />
                    <FieldRow label="Removed" value={renderValue(removed)} />
                    {added.length > 0 && entryId && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {added.map((fname: any) => {
                          const filename = safeStr(fname)
                          if (!filename) return null
                          return (
                            <a
                              key={filename}
                              href={getCreatorAttachmentUrl(currentProject, entryId, filename)}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[10px] font-mono text-amber-300 hover:text-amber-200 underline underline-offset-2 break-all"
                              title={filename}
                            >
                              {filename}
                            </a>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  {/* Field changes */}
                  <div className="border border-white/10 bg-black/30 rounded-sm p-4 space-y-2">
                    <div className="text-[10px] text-white/40 uppercase tracking-[0.2em]">Changes</div>
                    {fields.length === 0 ? (
                      <div className="text-xs text-white/40">No field changes recorded.</div>
                    ) : (
                      <div className="space-y-2">
                        {fields.map((f: any, i: number) => (
                          <div key={`${safeStr(f?.field)}:${i}`} className="border border-white/10 bg-black/40 rounded-sm p-3">
                            <FieldRow label="Field" value={renderValue(f?.field)} />
                            <FieldRow label="From" value={renderValue(Object.prototype.hasOwnProperty.call(f ?? {}, 'from') ? f?.from : null)} />
                            <FieldRow label="To" value={renderValue(Object.prototype.hasOwnProperty.call(f ?? {}, 'to') ? f?.to : null)} />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Geometry summary (if present) */}
                  {geometry ? (
                    <div className="border border-white/10 bg-black/30 rounded-sm p-4 space-y-2">
                      <div className="text-[10px] text-white/40 uppercase tracking-[0.2em]">Geometry Summary</div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <div className="text-[10px] text-white/40 uppercase tracking-widest">Before</div>
                          <FieldRow label="Type" value={renderValue(geometryBefore?.type)} />
                          <FieldRow label="Vertex Count" value={renderValue(geometryBefore?.vertex_count)} />
                          <FieldRow label="BBox" value={renderValue(geometryBefore?.bbox)} />
                        </div>
                        <div className="space-y-2">
                          <div className="text-[10px] text-white/40 uppercase tracking-widest">After</div>
                          <FieldRow label="Type" value={renderValue(geometryAfter?.type)} />
                          <FieldRow label="Vertex Count" value={renderValue(geometryAfter?.vertex_count)} />
                          <FieldRow label="BBox" value={renderValue(geometryAfter?.bbox)} />
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            )
          })()}
        </div>
      )}

      {contextMenu && (
        <div 
          ref={contextMenuRef}
          className="fixed z-50 min-w-[180px] bg-black/90 backdrop-blur-md border border-white/10 rounded-sm shadow-[0_0_20px_-5px_rgba(0,0,0,0.8)] py-1 animate-in fade-in zoom-in-95 duration-100"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()} 
        >
          <div className="px-3 py-1.5 border-b border-white/10 mb-1">
            <div className="text-[10px] font-mono text-white/40 uppercase tracking-widest">Coordinates</div>
            <div className="text-xs font-mono text-white/90">
              {contextMenu.lat.toFixed(5)}, {contextMenu.lng.toFixed(5)}
            </div>
          </div>

          {/* Operator Mode: Create submenu */}
          {mapMode === 'operator' && (
            <div className="border-b border-white/10 mb-1 pb-1">
              <div className="group relative">
                <div className="w-full text-left px-3 py-2 text-xs font-mono text-white/80 hover:bg-amber-500/15 hover:text-white hover:border-l-2 hover:border-amber-400 transition-all flex items-center justify-between gap-2 border-l-2 border-transparent cursor-default">
                  <span className="uppercase tracking-wide group-hover:translate-x-1 transition-transform">AOI/POI</span>
                  <span className="text-white/30 group-hover:text-amber-300">▸</span>
                </div>

                {/* Cascading submenu (opens to the side, not underneath) */}
                <div
                  className={cn(
                    "hidden group-hover:block absolute top-0 z-[60]",
                    typeof window !== 'undefined' && contextMenu.x + 180 + 170 + 16 > window.innerWidth
                      ? "right-full mr-1"
                      : "left-full ml-1"
                  )}
                >
                  <div className="min-w-[170px] bg-black/95 backdrop-blur-md border border-white/10 rounded-sm shadow-[0_0_20px_-5px_rgba(0,0,0,0.8)] py-1">
                    <button
                      onClick={() => {
                        setContextMenu(null)
                        startCreatorTool('create_aoi')
                      }}
                      className="w-full text-left px-3 py-2 text-xs font-mono text-white/80 hover:bg-amber-500/15 hover:text-white transition-all flex items-center gap-2"
                      disabled={!currentProject}
                      title={!currentProject ? 'Select a project to create AOIs' : undefined}
                    >
                      <span className="uppercase tracking-wide">Create AOI</span>
                    </button>
                    <button
                      onClick={() => {
                        setContextMenu(null)
                        startCreatorTool('create_poi')
                      }}
                      className="w-full text-left px-3 py-2 text-xs font-mono text-white/80 hover:bg-amber-500/15 hover:text-white transition-all flex items-center gap-2"
                      disabled={!currentProject}
                      title={!currentProject ? 'Select a project to create POIs' : undefined}
                    >
                      <span className="uppercase tracking-wide">Create POI</span>
                    </button>
                    <button
                      onClick={() => {
                        setContextMenu(null)
                        operatorDialogs.openOperatorEntriesIndex()
                      }}
                      className="w-full text-left px-3 py-2 text-xs font-mono text-white/70 hover:bg-amber-500/15 hover:text-white transition-all flex items-center gap-2 border-t border-white/10"
                      disabled={!currentProject}
                      title={!currentProject ? 'Select a project to open the Operator Entry Index' : undefined}
                    >
                      <span className="uppercase tracking-wide">Open Manager</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="group relative">
                <div className="w-full text-left px-3 py-2 text-xs font-mono text-white/70 hover:bg-amber-500/15 hover:text-white hover:border-l-2 hover:border-amber-400 transition-all flex items-center justify-between gap-2 border-l-2 border-transparent cursor-default">
                  <span className="uppercase tracking-wide group-hover:translate-x-1 transition-transform">Sorties</span>
                  <span className="text-white/30 group-hover:text-amber-300">▸</span>
                </div>

                <div
                  className={cn(
                    "hidden group-hover:block absolute top-0 z-[60]",
                    typeof window !== 'undefined' && contextMenu.x + 180 + 170 + 16 > window.innerWidth
                      ? "right-full mr-1"
                      : "left-full ml-1"
                  )}
                >
                  <div className="min-w-[170px] bg-black/95 backdrop-blur-md border border-white/10 rounded-sm shadow-[0_0_20px_-5px_rgba(0,0,0,0.8)] py-1">
                    <button
                      onClick={() => {
                        setContextMenu(null)
                        operatorDialogs.openSortiesCreate()
                      }}
                      className="w-full text-left px-3 py-2 text-xs font-mono text-white/80 hover:bg-amber-500/15 hover:text-white transition-all flex items-center gap-2"
                      disabled={!currentProject}
                      title={!currentProject ? 'Select a project to create sorties' : undefined}
                    >
                      <span className="uppercase tracking-wide">Create Sortie</span>
                    </button>
                    <button
                      onClick={() => {
                        setContextMenu(null)
                        operatorDialogs.openSortiesIndex()
                      }}
                      className="w-full text-left px-3 py-2 text-xs font-mono text-white/70 hover:bg-amber-500/15 hover:text-white transition-all flex items-center gap-2 border-t border-white/10"
                      disabled={!currentProject}
                      title={!currentProject ? 'Select a project to open the Sortie Entry Index' : undefined}
                    >
                      <span className="uppercase tracking-wide">Open Manager</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          <button
            onClick={() => {
              const text = `${contextMenu.lat.toFixed(6)}, ${contextMenu.lng.toFixed(6)}`
              if (navigator.clipboard && window.isSecureContext) {
                navigator.clipboard.writeText(text).catch(console.error)
              } else {
                const textArea = document.createElement("textarea")
                textArea.value = text
                textArea.style.position = "fixed"
                textArea.style.left = "-9999px"
                textArea.style.top = "0"
                document.body.appendChild(textArea)
                textArea.focus()
                textArea.select()
                try {
                  document.execCommand('copy')
                } catch (err) {
                  console.error('Unable to copy', err)
                }
                document.body.removeChild(textArea)
              }
              setContextMenu(null)
              setToast({ message: 'Coordinates Copied to Clipboard', type: 'success' })
            }}
            className="w-full text-left px-3 py-2 text-xs font-mono text-white/80 hover:bg-primary/20 hover:text-white hover:border-l-2 hover:border-primary transition-all flex items-center gap-2 group border-l-2 border-transparent"
          >
            <span className="uppercase tracking-wide group-hover:translate-x-1 transition-transform">Copy Coordinates</span>
          </button>

          <button
            onClick={() => {
              setGoToCoordinatesSeed({ lng: contextMenu.lng, lat: contextMenu.lat })
              setGoToCoordinatesOpen(true)
              setContextMenu(null)
            }}
            className="w-full text-left px-3 py-2 text-xs font-mono text-white/80 hover:bg-primary/20 hover:text-white hover:border-l-2 hover:border-primary transition-all flex items-center gap-2 group border-l-2 border-transparent"
          >
            <span className="uppercase tracking-wide group-hover:translate-x-1 transition-transform">GOTO Coordinates</span>
          </button>

          <button
            onClick={() => {
              // Placeholder for Examine
              setContextMenu(null)
            }}
            className="w-full text-left px-3 py-2 text-xs font-mono text-white/80 hover:bg-primary/20 hover:text-white hover:border-l-2 hover:border-primary transition-all flex items-center gap-2 group border-l-2 border-transparent"
          >
            <span className="uppercase tracking-wide group-hover:translate-x-1 transition-transform">Examine</span>
          </button>
        </div>
      )}

      {identifyPopup && (
        <div
          className="fixed z-50 w-[380px] max-w-[90vw] bg-black/90 backdrop-blur-md border border-white/10 rounded-sm shadow-[0_0_28px_-8px_rgba(0,0,0,0.85)] animate-in fade-in zoom-in-95 duration-100"
          style={{ top: identifyPopup.y, left: identifyPopup.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3 px-3 py-2 border-b border-white/10">
            <div className="min-w-0">
              <div className="text-[10px] font-mono text-white/40 uppercase tracking-widest">Identify</div>
              <div className="text-xs font-mono text-white/90 truncate">{identifyPopup.title}</div>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[10px] font-mono text-white/50">
                <span>{identifyPopup.lat.toFixed(5)}, {identifyPopup.lng.toFixed(5)}</span>
                {identifyPopup.geometryType && <span>Geom: {identifyPopup.geometryType}</span>}
                {identifyPopup.featureId && <span>ID: {identifyPopup.featureId}</span>}
              </div>
            </div>
            <button
              onClick={handleCloseIdentifyPopup}
              className="p-1 rounded hover:bg-white/10 text-white/50 hover:text-white transition-colors"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="max-h-[300px] overflow-auto">
            {identifyPopup.rows.length === 0 ? (
              <div className="px-3 py-3 text-xs font-mono text-white/60">No attributes available.</div>
            ) : (
              <table className="w-full text-[11px]">
                <tbody>
                  {identifyPopup.rows.map((row) => (
                    <tr key={row.key} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                      <td className="px-3 py-1.5 align-top text-white/50 font-mono w-[42%] break-words">
                        {row.key}
                      </td>
                      <td className="px-3 py-1.5 align-top text-white/90 font-mono break-all">
                        {row.value}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
