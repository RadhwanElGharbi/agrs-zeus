'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { LayerSpecification, Map as MapLibreMap, MapMouseEvent, MapOptions } from 'maplibre-gl'
import { Maximize2, Loader2, RefreshCw, Layers, Mountain, Brain } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useProject } from '@/lib/context/ProjectContext'
import { fetchVectorData, getTileUrl, getTerrainTileUrl, getAoiFileUrl, type DatasetInfo } from '@/lib/api/dataClient'
import { TerrainSampler } from '@/lib/terrainSampler'
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
  featureBounds
} from '@/lib/map-utils'
import { LayerManager } from './LayerManager'
import { PIRLManager } from './PIRLManager'
import { AttributeTable } from './AttributeTable'
import { PIRLAttributeTable } from './PIRLAttributeTable'
import { StyleEditor } from './StyleEditor'
import { Compass } from './Compass'
import { ExplanationPanel, DecisionsPanel, AgenticRoutesDialog } from '@/components/Analysis'
import { analyzeSegments, getSegmentDecisions, getAssessmentMapColor, type ExplainResponse, type AssessmentLevel, type SegmentDecisions } from '@/lib/api/agenticClient'

const BASEMAP_FALLBACK_DEFAULT_OPACITY = 0.75

type CursorElevationStatus = 'idle' | 'loading' | 'ready' | 'unavailable' | 'error' | 'no-dem'

type CursorElevationState = {
  value: number | null
  status: CursorElevationStatus
}

export function MapViewer() {
  const { currentProject, datasets, isProjectLoading, hasNewDatasets, refreshProjectData, dismissNewDatasets } = useProject()
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const dynamicLayerIdsRef = useRef<string[]>([])
  const dynamicSourceIdsRef = useRef<string[]>([])
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
  const [terrainEnabled, setTerrainEnabled] = useState(false)
  const [styleLayerId, setStyleLayerId] = useState<string | null>(null)
  const [styleDraft, setStyleDraft] = useState<LayerStyleOptions>({})
  const [styleOverrides, setStyleOverrides] = useState<Record<string, LayerStyleOptions>>({})
  const [cursorPosition, setCursorPosition] = useState<{ lng: number; lat: number } | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; lat: number; lng: number } | null>(null)
  const [cursorElevation, setCursorElevation] = useState<CursorElevationState>({ value: null, status: 'idle' })
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' } | null>(null)

  // Segment analysis state
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null)
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null)
  const [analysisResult, setAnalysisResult] = useState<ExplainResponse | null>(null)
  const [analysisLoading, setAnalysisLoading] = useState(false)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [showAnalysisPanel, setShowAnalysisPanel] = useState(false)
  const [showRoutesDialog, setShowRoutesDialog] = useState(false)
  const [loadedPirlRoutes, setLoadedPirlRoutes] = useState<{ routeId: string; visible: boolean; segmentCount: number }[]>([])

  // Validated decisions data state
  const [decisionsData, setDecisionsData] = useState<SegmentDecisions | null>(null)
  const [decisionsLoading, setDecisionsLoading] = useState(false)
  const [decisionsError, setDecisionsError] = useState<string | null>(null)
  const [showDecisionsPanel, setShowDecisionsPanel] = useState(false)

  // PIRL Attribute Table state
  const [pirlTableRouteId, setPirlTableRouteId] = useState<string | null>(null)
  const [pirlTableDocked, setPirlTableDocked] = useState(false)

  const dockHeightRef = useRef(dockHeight)
  const dockContainerRef = useRef<HTMLDivElement | null>(null)
  const highlightSourceId = useRef('selected-feature-source')
  const highlightLayerIds = useRef<string[]>(['selected-feature-fill', 'selected-feature-line', 'selected-feature-point'])
  const terrainSourceIdRef = useRef<string | null>(null)
  const imageryFailedRef = useRef(false)
  const demLayerName = useMemo(() => {
    if (!datasets?.rasters?.length) return null
    const hints = ['dem', 'elevation', 'terrain', 'dtm', 'dsm']
    const match = datasets.rasters.find((raster) => {
      const name = raster.name.toLowerCase()
      return hints.some((hint) => name.includes(hint))
    })
    return match?.name ?? null
  }, [datasets])
  const demAvailable = Boolean(currentProject && demLayerName)

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
    if (map.getLayer('basemap-fallback')) {
      map.setPaintProperty('basemap-fallback', 'raster-opacity', opacity)
    }
  }, [])

  const removeBasemapLayers = useCallback((options?: { includeFallback?: boolean }) => {
    const map = mapRef.current
    if (!map) return
    const includeFallback = options?.includeFallback ?? false

    const layersToRemove = ['basemap-imagery', 'basemap-reference']
    if (includeFallback) layersToRemove.push('basemap-fallback')

    const sourcesToRemove = ['esriImagery', 'esriLabels']
    if (includeFallback) sourcesToRemove.push('osmFallback')

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
    if (!map.getSource('esriImagery')) {
      map.addSource('esriImagery', {
        type: 'raster',
        tiles: ['https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
        tileSize: 256,
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
        attribution: 'Esri'
      })
    }
    if (!map.getSource('osmFallback')) {
      map.addSource('osmFallback', {
        type: 'raster',
        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        attribution: '© OpenStreetMap contributors'
      })
    }

    if (!map.getLayer('basemap-fallback')) {
      map.addLayer({
        id: 'basemap-fallback',
        type: 'raster',
        source: 'osmFallback',
        paint: { 'raster-opacity': BASEMAP_FALLBACK_DEFAULT_OPACITY }
      })
    }
    if (!map.getLayer('basemap-imagery')) {
      map.addLayer({
        id: 'basemap-imagery',
        type: 'raster',
        source: 'esriImagery'
      })
    }
    if (!map.getLayer('basemap-reference')) {
      map.addLayer({
        id: 'basemap-reference',
        type: 'raster',
        source: 'esriLabels',
        paint: {
          'raster-opacity': 0.8
        }
      })
    }
    // Ensure visibility
    map.setLayoutProperty('basemap-imagery', 'visibility', 'visible')
    map.setLayoutProperty('basemap-reference', 'visibility', 'visible')
    map.setLayoutProperty('basemap-fallback', 'visibility', 'visible')
    map.setPaintProperty('basemap-imagery', 'raster-opacity', 1)
    map.setPaintProperty('basemap-imagery', 'raster-fade-duration', 400)
    map.setPaintProperty('basemap-reference', 'raster-opacity', 0.8)
    setFallbackOpacity(imageryFailedRef.current ? 1 : BASEMAP_FALLBACK_DEFAULT_OPACITY)
    applySkyBackdrop()
  }, [applySkyBackdrop, setFallbackOpacity])

  const handleBasemapFailure = useCallback(() => {
    imageryFailedRef.current = true
    setFallbackOpacity(1)
    removeBasemapLayers({ includeFallback: false })
    // Retry after short delay to avoid thrashing if the service is temporarily offline
    setTimeout(() => {
      if (!mapRef.current) return
      addBaseLayers()
    }, 1500)
  }, [addBaseLayers, removeBasemapLayers, setFallbackOpacity])

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
          center: [-80.5449, 43.4723], // University of Waterloo
          zoom: 14.5,
          maxPitch: 85,
          fieldOfView: (85 * Math.PI) / 180,
          attributionControl: false,
          failIfMajorPerformanceCaveat: false,
          preserveDrawingBuffer: true,
          antialias: true // Enable antialias for better quality
        }

        const mapInstance = new maplibreModule.Map(mapOptions as MapOptions)

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
        mapInstance.on('idle', () => setIsBuffering(false))

        mapInstance.on('error', (event) => {
          const e = event as any
          if (e?.sourceId && (e.sourceId === 'esriImagery' || e.sourceId === 'esriLabels')) {
            handleBasemapFailure()
          }
        })

        mapInstance.addControl(
          new maplibreModule.NavigationControl({
            visualizePitch: true
          }),
          'top-right'
        )

        mapInstance.addControl(
          new maplibreModule.ScaleControl({
            maxWidth: 200,
            unit: 'metric'
          }),
          'bottom-right'
        )

        mapInstance.addControl(
          new maplibreModule.FullscreenControl(),
          'top-right'
        )

        // Ensure expected interactions: left = pan, middle = rotate (custom), right = zoom (custom)
        mapInstance.dragPan.enable()
        mapInstance.dragRotate.disable()

        mapRef.current = mapInstance
      } catch (error) {
        console.error('Failed to initialize MapLibre map:', error)
      }
    }

    initializeMap()

    return () => {
      cancelled = true
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
    }
  }, [addBaseLayers])

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

    for (const layerId of [...dynamicLayerIdsRef.current].reverse()) {
      if (map.getLayer(layerId)) {
        map.removeLayer(layerId)
      }
    }
    dynamicLayerIdsRef.current = []

    for (const sourceId of dynamicSourceIdsRef.current) {
      if (map.getSource(sourceId)) {
        map.removeSource(sourceId)
      }
    }
    dynamicSourceIdsRef.current = []
  }, [])

  const applyOpacityToMapLayer = useCallback((layer: ManagedLayer, opacity: number) => {
    const map = mapRef.current
    if (!map) return

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

      if (map.getLayer(layerId)) map.removeLayer(layerId)
      if (map.getSource(sourceId)) map.removeSource(sourceId)

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
    async (dataset: DatasetInfo, isAoi: boolean) => {
      if (!mapRef.current || !currentProject) return null
      const map = mapRef.current
      const geojson = await fetchVectorData(currentProject, dataset.name)

      const sourceId = `vector-${dataset.name}`
      if (map.getSource(sourceId)) {
        map.removeSource(sourceId)
      }

      map.addSource(sourceId, {
        type: 'geojson',
        data: geojson as any
      })
      dynamicSourceIdsRef.current.push(sourceId)

      const layerIds: string[] = []
      const geometryType = inferGeometryType(geojson)
      const color = isAoi ? '#2563eb' : colorForLayer(dataset.name)
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

      if (map.getLayer(circleLayerId)) map.removeLayer(circleLayerId)
      if (map.getLayer(labelLayerId)) map.removeLayer(labelLayerId)
      if (map.getSource(sourceId)) map.removeSource(sourceId)

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

    clearDynamicLayers()
    setManagedLayers([])
    setVectorDetails({})
    setSelectedLayerId(null)
    setLoadingMessage(currentProject ? `Loading ${currentProject} datasets...` : null)

    if (!currentProject || !datasets) {
      setLoadingMessage(null)
      return
    }

    const nextLayers: ManagedLayer[] = []
    let order = 0
    let focusBounds: LngLatBounds | null = null

    // Load rasters first so they sit below vector overlays
    for (const raster of datasets.rasters) {
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
    for (const vector of datasets.vectors) {
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
        const added = await addVectorLayer(vector, isAoi)
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
          setVectorDetails(prev => ({
            ...prev,
            [layerId]: added.vectorDetail
          }))
          setPreloadedTables(prev => ({
            ...prev,
            [layerId]: added.vectorDetail
          }))
        }
      } catch (error) {
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
    if (currentProject) {
      try {
        const resp = await fetch(getAoiFileUrl(currentProject, 'project_aoi.json'))
        if (resp.ok) {
          const data = await resp.json()
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

            setVectorDetails(prev => ({
              ...prev,
              [config.id]: vectorDetail
            }))
            setPreloadedTables(prev => ({
              ...prev,
              [config.id]: vectorDetail
            }))

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
              path: getAoiFileUrl(currentProject, 'project_aoi.json'),
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
    }

    const ordered = nextLayers.map((layer, idx) => ({ ...layer, order: idx }))
    setManagedLayers(ordered)
    if (focusBounds) {
      mapRef.current?.fitBounds(focusBounds, { padding: 80, duration: 1000 })
    }
    if (!selectedLayerIdRef.current && ordered.length > 0) {
      const firstRenderable = ordered.find(layer => layer.status === 'ready') || ordered[0]
      setSelectedLayerId(firstRenderable.id)
    }
    applyLayerOrder(ordered)
    setLoadingMessage(null)
  }, [addPointMarkerLayer, addRasterLayer, addVectorLayer, applyLayerOrder, clearDynamicLayers, currentProject, datasets, mapReady])

  useEffect(() => {
    if (!mapReady) return
    loadProjectLayers()
  }, [loadProjectLayers, mapReady])

  useEffect(() => {
    if (!mapReady) return
    imageryFailedRef.current = false
    addBaseLayers()
    setFallbackOpacity(BASEMAP_FALLBACK_DEFAULT_OPACITY)
  }, [addBaseLayers, mapReady, setFallbackOpacity, currentProject])

  useEffect(() => {
    if (!mapReady || !mapRef.current) return
    const map = mapRef.current
    map.setTerrain(null)
  }, [mapReady])

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
      const { lng, lat } = event.lngLat
      setCursorPosition({ lng, lat })
      requestElevationSample(lng, lat, map.getZoom())
    }

    const handleMouseOut = () => {
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
    }
    window.addEventListener('click', handleGlobalClick)
    return () => window.removeEventListener('click', handleGlobalClick)
  }, [])

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
    const markerId = 'rotation-center-marker'

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
        const point = toContainerPoint(event)
        const around = toLngLatArray(map.unproject(point))
        isMiddleRotatingRef.current = true
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
        const point = toContainerPoint(event)
        const around = toLngLatArray(map.unproject(point))
        isRightZoomingRef.current = true
        hasMovedDuringRightClickRef.current = false
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
        const dx = event.clientX - rotationStartRef.current.x
        const dy = event.clientY - rotationStartRef.current.y
        const newBearing = rotationStartRef.current.bearing + dx * rotationBearingFactor
        const rawPitch = rotationStartRef.current.pitch - dy * rotationPitchFactor
        const newPitch = Math.min(85, Math.max(0, rawPitch))

        map.rotateTo(newBearing, { around: rotationStartRef.current.around, animate: false } as any)
        map.setPitch(newPitch)
      } else if (isRightZoomingRef.current && zoomStartRef.current) {
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
        isMiddleRotatingRef.current = false
        rotationStartRef.current = null
        clearRotationMarker()
      } else if (event.button === 2) {
        isRightZoomingRef.current = false
        zoomStartRef.current = null
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
      isRightZoomingRef.current = false
      zoomStartRef.current = null
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
    mapRef.current?.flyTo({
      center: [-80.5449, 43.4723],
      zoom: 14.5,
      duration: 1200
    })
  }

  const handleRefreshAll = () => {
    imageryFailedRef.current = false
    setFallbackOpacity(BASEMAP_FALLBACK_DEFAULT_OPACITY)
    removeBasemapLayers()
    addBaseLayers()
    loadProjectLayers()
  }

  const handleToggleVisibility = (layerId: string) => {
    const layer = managedLayers.find(l => l.id === layerId)
    if (!layer) return
    const nextVisible = !layer.visible
    applyVisibilityToMapLayer(layer, nextVisible)
    setManagedLayers(prev =>
      prev.map(l => (l.id === layerId ? { ...l, visible: nextVisible } : l))
    )
  }

  const handleOpacityChange = (layerId: string, value: number) => {
    const layer = managedLayers.find(l => l.id === layerId)
    if (!layer) return
    applyOpacityToMapLayer(layer, value)
    setManagedLayers(prev =>
      prev.map(l => (l.id === layerId ? { ...l, opacity: value } : l))
    )
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

  // Segment analysis handlers
  const handleSegmentClick = useCallback((e: MapMouseEvent) => {
    const map = mapRef.current
    if (!map) return

    // Query rendered features at click point - look for route/segment layers
    const features = map.queryRenderedFeatures(e.point)

    // Find a feature that looks like a route segment (has segment_id or similar property)
    const segmentFeature = features.find(f => {
      const props = f.properties || {}
      return props.segment_id || props.segmentId || props.SEGMENT_ID ||
             props.route_id || props.routeId || props.ROUTE_ID ||
             props.id // fallback to generic id
    })

    if (segmentFeature) {
      const props = segmentFeature.properties || {}
      // Ensure segment_id is a string (GeoJSON may store it as a number)
      const rawSegmentId = props.segment_id ?? props.segmentId ?? props.SEGMENT_ID ?? props.id ?? segmentFeature.id
      const segmentId = String(rawSegmentId)
      const routeId = String(props.route_id || props.routeId || props.ROUTE_ID || currentProject || 'default')

      // Toggle selection
      if (selectedSegmentId === segmentId) {
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
  }, [currentProject, selectedSegmentId, showFeatureHighlight])

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
    if (map.getLayer(lineLayerId)) map.removeLayer(lineLayerId)
    if (map.getLayer(pointsLayerId)) map.removeLayer(pointsLayerId)
    if (map.getSource(sourceId)) map.removeSource(sourceId)

    // Add source
    map.addSource(sourceId, {
      type: 'geojson',
      data: geojson as any
    })

    // Add line layer for segments
    map.addLayer({
      id: lineLayerId,
      type: 'line',
      source: sourceId,
      paint: {
        'line-color': '#a855f7',
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
      return [...prev, { routeId, visible: true, segmentCount }]
    })

    setToast({ message: `Route "${routeId}" loaded`, type: 'success' })
  }, [])

  // Toggle PIRL route visibility
  const handleTogglePirlRouteVisibility = useCallback((routeId: string) => {
    const map = mapRef.current
    if (!map) return

    setLoadedPirlRoutes(prev => prev.map(route => {
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
    }))
  }, [])

  // Remove PIRL route from map
  const handleRemovePirlRoute = useCallback((routeId: string) => {
    const map = mapRef.current
    if (!map) return

    const sourceId = `agentic-route-${routeId}`
    const lineLayerId = `${sourceId}-line`
    const pointsLayerId = `${sourceId}-points`

    if (map.getLayer(lineLayerId)) map.removeLayer(lineLayerId)
    if (map.getLayer(pointsLayerId)) map.removeLayer(pointsLayerId)
    if (map.getSource(sourceId)) map.removeSource(sourceId)

    // Remove from tracking arrays
    dynamicSourceIdsRef.current = dynamicSourceIdsRef.current.filter(id => id !== sourceId)
    dynamicLayerIdsRef.current = dynamicLayerIdsRef.current.filter(id => id !== lineLayerId && id !== pointsLayerId)

    // Remove from loaded routes state
    setLoadedPirlRoutes(prev => prev.filter(r => r.routeId !== routeId))

    setToast({ message: `Route "${routeId}" removed`, type: 'info' })
  }, [])

  // Register segment click handler
  useEffect(() => {
    if (!mapReady || !mapRef.current) return
    const map = mapRef.current

    map.on('click', handleSegmentClick)

    return () => {
      map.off('click', handleSegmentClick)
    }
  }, [mapReady, handleSegmentClick])

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

  useEffect(() => {
    if (!mapReady) return
    const interval = setInterval(() => {
      if (imageryFailedRef.current) {
        imageryFailedRef.current = false
        addBaseLayers()
      }
    }, 2000)
    return () => clearInterval(interval)
  }, [addBaseLayers, mapReady])

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

           {/* AI Analyze Button - shows when segment is selected */}
           {selectedSegmentId && (
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
        </div>
      </div>

      {/* Right Side Panel Container - Layer Manager + PIRL Manager */}
      <div className="absolute top-4 right-4 z-10 flex flex-col gap-3 items-end max-h-[calc(100vh-100px)] overflow-y-auto overflow-x-visible scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
        <LayerManager
          layers={managedLayers}
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

        {/* PIRL Manager */}
        <PIRLManager
          loadedRoutes={loadedPirlRoutes}
          onLoadRoute={handleLoadAgenticRoute}
          onToggleRouteVisibility={handleTogglePirlRouteVisibility}
          onRemoveRoute={handleRemovePirlRoute}
          onExpandDialog={() => setShowRoutesDialog(true)}
          onOpenTable={(routeId) => setPirlTableRouteId(routeId)}
        />
      </div>

      {fullTableLayer && fullTableDetails && (
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
      {pirlTableRouteId && (
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

      {styleLayerId && (
        <StyleEditor
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
      )}

      {/* AI Analysis Panel */}
      {showAnalysisPanel && (
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
      {showDecisionsPanel && (
        <div className="absolute top-4 right-[680px] xl:right-[820px] z-40 w-[320px] xl:w-[380px] max-h-[calc(100vh-120px)] overflow-hidden">
          <DecisionsPanel
            decisions={decisionsData}
            loading={decisionsLoading}
            error={decisionsError}
            onClose={handleCloseDecisionsPanel}
          />
        </div>
      )}

      {/* Agentic Routes Dialog */}
      <AgenticRoutesDialog
        open={showRoutesDialog}
        onClose={() => setShowRoutesDialog(false)}
        onLoadRoute={handleLoadAgenticRoute}
      />

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

      {contextMenu && (
        <div 
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
              // Placeholder for Examine
              setContextMenu(null)
            }}
            className="w-full text-left px-3 py-2 text-xs font-mono text-white/80 hover:bg-primary/20 hover:text-white hover:border-l-2 hover:border-primary transition-all flex items-center gap-2 group border-l-2 border-transparent"
          >
            <span className="uppercase tracking-wide group-hover:translate-x-1 transition-transform">Examine</span>
          </button>
        </div>
      )}
    </div>
  )
}
