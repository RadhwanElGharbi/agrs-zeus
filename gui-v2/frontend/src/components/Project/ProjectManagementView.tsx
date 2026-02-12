'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { type LayerSpecification, Map as MapLibreMap, MapMouseEvent, MapOptions } from 'maplibre-gl'
import { ZoomIn, ZoomOut, Maximize2, Loader2, RefreshCw, Layers, Mountain, Truck, X, ExternalLink, Mail, Phone, Globe, MapPin, Building2, Award, Clock, DollarSign, Star, Package, Wrench, Factory, Briefcase, ChevronDown, ChevronRight, Minimize2, Info, Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useProject } from '@/lib/context/ProjectContext'
import { fetchVectorData, getTerrainTileUrl, getAoiFileUrl, getApiBase, type DatasetInfo } from '@/lib/api/dataClient'
import { TerrainSampler } from '@/lib/terrainSampler'
import {
  ManagedLayer,
  VectorDetail,
  AOI_LAYER_HINTS,
  getGeoJSONBounds,
  inferGeometryType,
  buildPropertySummary,
  featureBounds
} from '@/lib/map-utils'
import { Compass } from '@/components/Map/Compass'
import { SupplierListDialog } from '@/components/Suppliers/SupplierListDialog'

const BASEMAP_FALLBACK_DEFAULT_OPACITY = 0.75

type CursorElevationStatus = 'idle' | 'loading' | 'ready' | 'unavailable' | 'error' | 'no-dem'

type CursorElevationState = {
  value: number | null
  status: CursorElevationStatus
}

const getCategoryIconSvg = (category: string, color: string) => {
  let path = '';
  switch(category) {
    case 'construction_supplies': path = '<path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22v-10"/>'; break;
    case 'construction_services': path = '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>'; break;
    case 'pipeline_manufacturer': path = '<path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7 5V8l-7 5V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M17 18h1"/><path d="M12 18h1"/><path d="M7 18h1"/>'; break;
    case 'equipment_manufacturer': path = '<path d="M5 18H3c-.6 0-1-.4-1-1V7c0-.6.4-1 1-1h10c.6 0 1 .4 1 1v11"/><path d="M14 9h4l4 4v4c0 .6-.4 1-1 1h-2"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>'; break;
    case 'consultancy': path = '<rect width="20" height="14" x="2" y="7" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>'; break;
    default: path = '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>';
  }
  
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" fill="none" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.9));">
      <circle cx="16" cy="16" r="14" fill="rgba(0,0,0,0.6)" stroke="${color}" stroke-width="2" />
      <g transform="translate(4, 4)" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        ${path}
      </g>
    </svg>
  `
}

// Supplier profile type matching the schema
interface SupplierProfile {
  supplier_id: string
  company_name: string
  category: string
  subcategories?: string[]
  location: {
    country: string
    iso3: string
    region?: string
    city: string
    address?: string
    postal_code?: string
    coordinates: {
      latitude: number
      longitude: number
    }
  }
  contact: {
    primary_name?: string
    primary_title?: string
    primary_email: string
    primary_phone?: string
    website?: string
    linkedin?: string
  }
  capabilities: {
    products?: string[]
    services?: string[]
    certifications?: string[]
    pipeline_diameters_supported?: { min_inches: number; max_inches: number }
    materials_expertise?: string[]
    annual_capacity?: string
    experience_years?: number
    employee_count?: number
  }
  previous_projects?: Array<{
    project_name: string
    client?: string
    country?: string
    year?: number
    scope?: string
    pipeline_length_km?: number
    pipeline_diameter_inches?: number
    value_usd?: number
    reference_available?: boolean
  }>
  logistics?: {
    delivery_regions?: string[]
    estimated_lead_time_days?: number
    rush_delivery_available?: boolean
    shipping_capabilities?: string[]
    warehouses?: Array<{ city: string; country: string }>
    international_export?: boolean
  }
  pricing?: {
    pricing_model?: string
    currency?: string
    typical_project_range_usd?: { min: number; max: number }
    payment_terms?: string
    accepts_letters_of_credit?: boolean
  }
  quality_ratings?: {
    overall_score?: number | string
    reliability_score?: number | string
    quality_score?: number | string
    communication_score?: number | string
    rating_source?: string
    number_of_reviews?: number
  }
  compatibility?: {
    pipeline_specs_match?: boolean
    match_score?: number
    match_notes?: string[]
    limitations?: string[]
  }
  metadata: {
    source: string
    query_id?: string
    date_researched: string
    last_verified?: string
    confidence_level: string
    notes?: string
    tags?: string[]
  }
}

interface ProjectManagementViewProps {
  onSupplierSearch?: () => void
  suppliersUpdated?: number // Timestamp to trigger refresh
}

export function ProjectManagementView({ onSupplierSearch, suppliersUpdated }: ProjectManagementViewProps) {
  const { currentProject, datasets, isProjectLoading } = useProject()
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const dynamicLayerIdsRef = useRef<string[]>([])
  const dynamicSourceIdsRef = useRef<string[]>([])
  const supplierLayerAddedRef = useRef<boolean>(false)
  const suppliersRef = useRef<SupplierProfile[]>([])
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
  const bufferingTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const idleTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const [managedLayers, setManagedLayers] = useState<ManagedLayer[]>([])
  const [loadingMessage, setLoadingMessage] = useState<string | null>(null)
  const [terrainEnabled, setTerrainEnabled] = useState(false)
  const [cursorPosition, setCursorPosition] = useState<{ lng: number; lat: number } | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; lat: number; lng: number } | null>(null)
  const [cursorElevation, setCursorElevation] = useState<CursorElevationState>({ value: null, status: 'idle' })
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' } | null>(null)
  const [suppliers, setSuppliers] = useState<SupplierProfile[]>([])
  const [selectedSupplier, setSelectedSupplier] = useState<SupplierProfile | null>(null)
  const [suppliersLoading, setSuppliersLoading] = useState(false)
  const [shouldZoomToSuppliers, setShouldZoomToSuppliers] = useState(false)
  const [showSupplierManager, setShowSupplierManager] = useState(true) // Show by default
  const [showSupplierList, setShowSupplierList] = useState(false)
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())
  const [visibleCategories, setVisibleCategories] = useState<Set<string>>(new Set([
    'construction_supplies',
    'construction_services',
    'pipeline_manufacturer',
    'equipment_manufacturer',
    'consultancy'
  ]))
  
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
      const skyLayer: any = {
        id: 'sky-gradient-layer',
        type: 'sky',
        paint: {
          'sky-type': 'gradient',
          'sky-gradient': [
            'interpolate',
            ['linear'],
            ['sky-radial-progress'],
            0.0, '#87CEEB',
            0.1, '#7EC8E3',
            0.3, '#5DADE2',
            0.5, '#3498DB',
            0.7, '#2980B9',
            0.85, '#1F618D',
            1.0, '#154360'
          ],
          'sky-gradient-center': [0, 0],
          'sky-gradient-radius': 90,
          'sky-opacity': 1
        }
      }
      addLayerSafely(skyLayer)
    }

    try {
      ensureGradientSky()
      if ((map as any).setFog) {
        ;(map as any).setFog({
          range: [0.5, 10],
          color: 'rgba(186, 210, 235, 0.4)',
          'horizon-blend': 0.08,
          'high-color': '#B4D7E8',
          'space-color': '#1A5276',
          'star-intensity': 0.0
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
        // Avoid Esri "Map Data not available" placeholder tiles by overzooming the last available
        // tiles instead of requesting missing higher-zoom tiles.
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
        maxzoom: 17,
        attribution: 'Esri'
      })
    }
    if (!map.getSource('osmFallback')) {
      map.addSource('osmFallback', {
        type: 'raster',
        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        // OSM tile servers are typically limited to z<=19; allow zooming further by overzooming.
        maxzoom: 19,
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
    setTimeout(() => {
      if (!mapRef.current) return
      addBaseLayers()
    }, 1500)
  }, [addBaseLayers, removeBasemapLayers, setFallbackOpacity])

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
                  'background-color': '#87CEEB'
                }
              }
            ],
            glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf'
          },
          center: [-80.5449, 43.4723],
          zoom: 14.5,
          maxPitch: 85,
          fieldOfView: (85 * Math.PI) / 180,
          attributionControl: false,
          failIfMajorPerformanceCaveat: false,
          preserveDrawingBuffer: true,
          antialias: true
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

        // Debounced buffering logic to prevent flickering
        mapInstance.on('dataloading', () => {
          // Clear any pending idle timeout
          if (idleTimeoutRef.current) {
            clearTimeout(idleTimeoutRef.current)
            idleTimeoutRef.current = null
          }

          // Only show buffering after 150ms delay (avoids flicker on quick loads)
          if (!bufferingTimeoutRef.current) {
            bufferingTimeoutRef.current = setTimeout(() => {
              setIsBuffering(true)
              bufferingTimeoutRef.current = null
            }, 150)
          }
        })

        mapInstance.on('idle', () => {
          // Clear buffering start timeout if still pending
          if (bufferingTimeoutRef.current) {
            clearTimeout(bufferingTimeoutRef.current)
            bufferingTimeoutRef.current = null
          }

          // Keep buffering visible for minimum 300ms to avoid flicker
          if (!idleTimeoutRef.current) {
            idleTimeoutRef.current = setTimeout(() => {
              setIsBuffering(false)
              idleTimeoutRef.current = null
            }, 300)
          }
        })

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
      if (bufferingTimeoutRef.current) {
        clearTimeout(bufferingTimeoutRef.current)
        bufferingTimeoutRef.current = null
      }
      if (idleTimeoutRef.current) {
        clearTimeout(idleTimeoutRef.current)
        idleTimeoutRef.current = null
      }
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
    }
  }, [addBaseLayers])

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
      const color = isAoi ? '#2563eb' : '#333333' 
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

  // Load suppliers from the project's docs/suppliers directory
  const loadSuppliers = useCallback(async (zoomAfterLoad: boolean = false) => {
    if (!currentProject) {
      setSuppliers([])
      return
    }

    setSuppliersLoading(true)
    try {
      // Fetch supplier index
      const response = await fetch(`${getApiBase()}/projects/${currentProject}/suppliers`)
      if (!response.ok) {
        setSuppliers([])
        return
      }
      
      const data = await response.json()
      const loadedSuppliers = data.suppliers || []
      setSuppliers(loadedSuppliers)
      
      // Set flag to zoom to suppliers after they're rendered
      if (zoomAfterLoad && loadedSuppliers.length > 0) {
        setShouldZoomToSuppliers(true)
      }
    } catch (err) {
      console.warn('Failed to load suppliers:', err)
      setSuppliers([])
    } finally {
      setSuppliersLoading(false)
    }
  }, [currentProject])

  // Reload suppliers when suppliersUpdated prop changes (after search completes)
  useEffect(() => {
    if (suppliersUpdated && suppliersUpdated > 0) {
      loadSuppliers(true) // Zoom to fit after loading
    }
  }, [suppliersUpdated, loadSuppliers])

  // Category colors and icons for suppliers
  const SUPPLIER_CATEGORY_STYLES: Record<string, { color: string; strokeColor: string; label: string }> = {
    'construction_supplies': { color: '#f59e0b', strokeColor: '#d97706', label: 'Supplies' },      // Amber
    'construction_services': { color: '#10b981', strokeColor: '#059669', label: 'Services' },      // Emerald
    'pipeline_manufacturer': { color: '#3b82f6', strokeColor: '#2563eb', label: 'Pipe Mfr' },      // Blue
    'equipment_manufacturer': { color: '#8b5cf6', strokeColor: '#7c3aed', label: 'Equipment' },    // Purple
    'consultancy': { color: '#ec4899', strokeColor: '#db2777', label: 'Consultancy' }              // Pink
  }

  // Helper to safely get numeric coordinates from supplier
  const getSupplierCoordinates = useCallback((supplier: SupplierProfile): { lng: number; lat: number } | null => {
    const coords = supplier.location?.coordinates
    if (!coords) return null
    
    const lng = typeof coords.longitude === 'number' ? coords.longitude : parseFloat(String(coords.longitude))
    const lat = typeof coords.latitude === 'number' ? coords.latitude : parseFloat(String(coords.latitude))
    
    if (isNaN(lng) || isNaN(lat) || (lng === 0 && lat === 0)) return null
    return { lng, lat }
  }, [])

  // Helper to safely get numeric quality score
  const getQualityScore = useCallback((supplier: SupplierProfile): number | null => {
    const score = supplier.quality_ratings?.overall_score
    if (score === undefined || score === null || score === 'not_available') return null
    const numScore = typeof score === 'number' ? score : parseFloat(String(score))
    return isNaN(numScore) ? null : numScore
  }, [])

  // Keep suppliers ref in sync
  useEffect(() => {
    suppliersRef.current = suppliers
  }, [suppliers])

  // Category colors for suppliers
  const getSupplierColor = (category: string): string => {
    const colors: Record<string, string> = {
      'construction_supplies': '#f59e0b',   // Amber
      'construction_services': '#10b981',   // Emerald
      'pipeline_manufacturer': '#3b82f6',   // Blue
      'equipment_manufacturer': '#8b5cf6',  // Purple
      'consultancy': '#ec4899',             // Pink
    }
    return colors[category] || '#6b7280'
  }

  const getSupplierIconComponent = (category: string, className?: string) => {
    const props = { className: className || "w-4 h-4" }
    switch (category) {
      case 'construction_supplies': return <Package {...props} />
      case 'construction_services': return <Wrench {...props} />
      case 'pipeline_manufacturer': return <Factory {...props} />
      case 'equipment_manufacturer': return <Truck {...props} />
      case 'consultancy': return <Briefcase {...props} />
      default: return <Building2 {...props} />
    }
  }

  // Add all supplier markers as native MapLibre layers (like START/END points)
  const addAllSupplierMarkers = useCallback((zoomToFit: boolean = false) => {
    if (!mapRef.current || suppliers.length === 0) return
    const map = mapRef.current

    const sourceId = 'suppliers-source'
    const circleLayerId = 'suppliers-circle'
    const labelLayerId = 'suppliers-label'

    // Build GeoJSON features from suppliers with valid coordinates and visible categories
    const features: GeoJSON.Feature[] = []
    const validCoords: { lng: number; lat: number }[] = []

    for (const supplier of suppliers) {
      // Skip suppliers whose category is not visible
      if (!visibleCategories.has(supplier.category)) continue

      const coords = getSupplierCoordinates(supplier)
      if (!coords) continue

      validCoords.push(coords)
      features.push({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [coords.lng, coords.lat]
        },
        properties: {
          supplier_id: supplier.supplier_id,
          company_name: supplier.company_name,
          category: supplier.category,
          city: supplier.location?.city || '',
          color: getSupplierColor(supplier.category)
        }
      })
    }

    const featureCollection = {
      type: 'FeatureCollection' as const,
      features
    }

    // Check if source exists
    const existingSource = map.getSource(sourceId) as any

    if (existingSource) {
      // Update existing source data without removing/re-adding (prevents flicker)
      existingSource.setData(featureCollection)
    } else {
      // First time: create source and layers
      if (features.length === 0) return

      // Add GeoJSON source
      map.addSource(sourceId, {
        type: 'geojson',
        data: featureCollection
      })

      // Add circle layer with category-based colors
      map.addLayer({
        id: circleLayerId,
        type: 'circle',
        source: sourceId,
        paint: {
          'circle-radius': 10,
          'circle-color': ['get', 'color'],
          'circle-stroke-width': 3,
          'circle-stroke-color': '#ffffff',
          'circle-opacity': 0.9
        }
      })

      // Add label layer
      map.addLayer({
        id: labelLayerId,
        type: 'symbol',
        source: sourceId,
        layout: {
          'text-field': ['get', 'company_name'],
          'text-offset': [0, 1.8],
          'text-size': 10,
          'text-anchor': 'top',
          'text-max-width': 12
        },
        paint: {
          'text-color': '#ffffff',
          'text-halo-color': '#000000',
          'text-halo-width': 1.5
        }
      })

      // Track that we've added the layer
      supplierLayerAddedRef.current = true

      // Add click handler for supplier markers (only once)
      map.on('click', circleLayerId, (e) => {
        if (!e.features || e.features.length === 0) return

        // When multiple features overlap, find the one closest to the actual click point
        const clickPoint = e.point
        let closestFeature = e.features[0]
        let closestDistance = Infinity

        for (const feature of e.features) {
          const geometry = feature.geometry as GeoJSON.Point
          const [lng, lat] = geometry.coordinates
          // Project the feature's coordinates to screen space
          const featurePoint = map.project([lng, lat])
          // Calculate distance from click point
          const dx = featurePoint.x - clickPoint.x
          const dy = featurePoint.y - clickPoint.y
          const distance = Math.sqrt(dx * dx + dy * dy)

          if (distance < closestDistance) {
            closestDistance = distance
            closestFeature = feature
          }
        }

        // Get coordinates directly from the closest feature
        const geometry = closestFeature.geometry as GeoJSON.Point
        const [lng, lat] = geometry.coordinates

        // Find the supplier by matching coordinates (supplier_id may not be unique)
        // Use coordinates as the unique identifier since each marker has distinct location
        const supplier = suppliersRef.current.find(s => {
          const coords = s.location?.coordinates
          if (!coords) return false
          const sLng = typeof coords.longitude === 'number' ? coords.longitude : parseFloat(String(coords.longitude))
          const sLat = typeof coords.latitude === 'number' ? coords.latitude : parseFloat(String(coords.latitude))
          // Match with small tolerance for floating point comparison
          return Math.abs(sLng - lng) < 0.0001 && Math.abs(sLat - lat) < 0.0001
        })
        if (supplier) {
          setSelectedSupplier(supplier)
        }

        // Fly to the clicked feature's actual location
        map.flyTo({
          center: [lng, lat],
          zoom: 12,
          duration: 1000
        })
      })

      // Change cursor on hover (only once)
      map.on('mouseenter', circleLayerId, () => {
        map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseleave', circleLayerId, () => {
        map.getCanvas().style.cursor = ''
      })
    }

    // Zoom to fit all suppliers if requested
    if (zoomToFit && validCoords.length > 0) {
      const lngs = validCoords.map(c => c.lng)
      const lats = validCoords.map(c => c.lat)
      
      const bounds: [[number, number], [number, number]] = [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)]
      ]
      
      map.fitBounds(bounds, {
        padding: { top: 100, bottom: 100, left: 100, right: 450 },
        maxZoom: 10,
        duration: 1200
      })
    }
  }, [suppliers, getSupplierCoordinates, getSupplierColor, visibleCategories])

  // Load suppliers when project changes
  useEffect(() => {
    if (currentProject) {
      loadSuppliers(true) // Zoom to fit suppliers on load
    }
  }, [currentProject, loadSuppliers])

  // Add supplier markers when suppliers are loaded and map is ready
  useEffect(() => {
    if (mapLoaded && mapRef.current && suppliers.length > 0) {
      // Delay to ensure all other layers are added first
      const timer = setTimeout(() => {
        addAllSupplierMarkers(shouldZoomToSuppliers)
        if (shouldZoomToSuppliers) {
          setShouldZoomToSuppliers(false)
        }
      }, 300)
      return () => clearTimeout(timer)
    }
  }, [mapLoaded, suppliers, addAllSupplierMarkers, shouldZoomToSuppliers])

  // Update supplier markers when category visibility changes
  useEffect(() => {
    if (mapLoaded && mapRef.current && suppliers.length > 0) {
      addAllSupplierMarkers(false)
    }
  }, [visibleCategories, mapLoaded, suppliers, addAllSupplierMarkers])

  const loadProjectLayers = useCallback(async () => {
    if (!mapReady || !mapRef.current) return

    clearDynamicLayers()
    setManagedLayers([])
    setLoadingMessage(currentProject ? `Loading ${currentProject} AOI...` : null)

    if (!currentProject || !datasets) {
      setLoadingMessage(null)
      return
    }

    const nextLayers: ManagedLayer[] = []
    let order = 0
    let focusBounds: any = null

    // Only load vectors that are AOI
    for (const vector of datasets.vectors) {
      const isAoi = AOI_LAYER_HINTS.some(hint => vector.name.toLowerCase().includes(hint))
      
      if (!isAoi) continue // Skip non-AOI layers

      const layerId = `vector-${vector.name}`
      nextLayers.push({
        id: layerId,
        name: vector.name,
        type: 'vector',
        status: 'loading',
        sourceId: layerId,
        layerIds: [],
        visible: true,
        opacity: 0.6,
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

          if (added.bounds) {
            mapRef.current?.fitBounds(added.bounds as any, { padding: 80, duration: 900 })
            focusBounds = added.bounds
          }
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

    // Load start/end AOI points
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
    
    setLoadingMessage(null)
  }, [addPointMarkerLayer, addVectorLayer, clearDynamicLayers, currentProject, datasets, mapReady])

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
  }, [applyOpacityToMapLayer, applyVisibilityToMapLayer, managedLayers, mapReady])

  const handleZoomIn = () => mapRef.current?.zoomIn()
  const handleZoomOut = () => mapRef.current?.zoomOut()
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

  const projectSummary = useMemo(() => {
    return currentProject
      ? `${currentProject} · Project Management`
      : 'Select a project to manage'
  }, [currentProject])

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
          background: 'transparent'
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
              <p className="text-sm text-white/70">Preparing project...</p>
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

      {/* Map Controls - REMOVED as per request */}
      
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
        </div>
      )}

      <SupplierListDialog 
        open={showSupplierList} 
        onOpenChange={setShowSupplierList}
        suppliers={suppliers as any}
        onSelectSupplier={(s) => {
          const supplier = s as SupplierProfile
          setSelectedSupplier(supplier)
          // Zoom to supplier location
          const coords = getSupplierCoordinates(supplier)
          if (mapRef.current && coords) {
            mapRef.current.flyTo({
              center: [coords.lng, coords.lat],
              zoom: 12,
              duration: 1200
            })
          }
        }}
      />

      {/* Supplier Manager Sidebar (LayerManager Style) */}
      {suppliers.length > 0 && (
        <div className="absolute top-4 right-4 z-10 flex flex-col gap-3 w-[380px] max-h-[calc(100%-2rem)] overflow-hidden font-mono">
          
          {/* Collapsed Toggle */}
          {!showSupplierManager && (
            <div className="bg-black/80 backdrop-blur-md border border-white/20 rounded-sm p-2 shadow-[0_0_20px_-5px_rgba(0,0,0,0.5)] group hover:border-primary/50 transition-colors self-end">
              <button
                onClick={() => setShowSupplierManager(true)}
                className="flex items-center justify-center p-1 hover:bg-white/10 rounded-sm transition-colors text-white/70 hover:text-primary"
                title="Show Supplier Manager"
              >
                <Truck className="w-5 h-5 group-hover:animate-pulse" />
              </button>
            </div>
          )}

          {/* Main Supplier List Panel */}
          {showSupplierManager && (
            <div className="bg-[#0a0a0a]/95 backdrop-blur-xl border border-white/10 rounded-sm shadow-[0_0_30px_-10px_rgba(0,0,0,0.8)] flex flex-col overflow-hidden">
              
              {/* Header */}
              <div className="flex items-center justify-between px-3 py-3 border-b border-white/10 bg-white/[0.02]">
                <div className="flex items-center gap-2">
                  <div className="p-1 bg-primary/10 rounded-sm">
                    <Truck className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <span className="text-xs font-bold text-white uppercase tracking-wider">Supplier Manager</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="px-2 py-0.5 bg-white/5 border border-white/10 rounded-sm">
                     <span className="text-[10px] text-white/70 uppercase tracking-wider">{suppliers.length} ENTRIES</span>
                  </div>
                  <button
                    onClick={() => setShowSupplierManager(false)}
                    className="p-1 hover:bg-white/10 rounded-sm transition-colors text-white/50 hover:text-white"
                    title="Collapse Supplier Manager"
                  >
                    <Minimize2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* List */}
              <div className="p-1 space-y-0.5 overflow-y-auto max-h-[320px] bg-black/20">
                 {[
                    { cat: 'construction_supplies', color: '#f59e0b', label: 'Construction Supplies', icon: Package },
                    { cat: 'construction_services', color: '#10b981', label: 'Construction Services', icon: Wrench },
                    { cat: 'pipeline_manufacturer', color: '#3b82f6', label: 'Pipeline Manufacturers', icon: Factory },
                    { cat: 'equipment_manufacturer', color: '#8b5cf6', label: 'Equipment Manufacturers', icon: Truck },
                    { cat: 'consultancy', color: '#ec4899', label: 'Consultancies', icon: Briefcase },
                  ].map(({ cat, color, label, icon: Icon }) => {
                    const categorySuppliers = suppliers.filter(s => s.category === cat)
                    if (categorySuppliers.length === 0) return null
                    const isExpanded = expandedCategories.has(cat)

                    const isCategoryVisible = visibleCategories.has(cat)

                    return (
                      <div key={cat} className="border border-transparent">
                        {/* Category Header */}
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => {
                              setExpandedCategories(prev => {
                                const next = new Set(prev)
                                if (next.has(cat)) next.delete(cat)
                                else next.add(cat)
                                return next
                              })
                            }}
                            className={cn(
                              "flex-1 flex items-center gap-2 p-1.5 hover:bg-white/[0.04] hover:border-white/10 rounded-sm transition-all group",
                              isExpanded ? "bg-white/[0.02]" : ""
                            )}
                          >
                             <div
                                className="w-5 h-5 rounded-sm flex items-center justify-center shrink-0"
                                style={{ backgroundColor: `${color}20` }}
                              >
                                <Icon className="w-3 h-3" style={{ color }} />
                              </div>
                              <span className="text-[11px] font-medium text-white/80 flex-1 text-left uppercase tracking-wide group-hover:text-white">{label}</span>
                              <span className="text-[9px] text-white/30 font-mono bg-white/5 px-1.5 rounded-sm">{categorySuppliers.length}</span>
                              {isExpanded ? <ChevronDown className="w-3 h-3 text-white/30" /> : <ChevronRight className="w-3 h-3 text-white/30" />}
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setVisibleCategories(prev => {
                                const next = new Set(prev)
                                if (next.has(cat)) {
                                  next.delete(cat)
                                } else {
                                  next.add(cat)
                                }
                                return next
                              })
                            }}
                            className={cn(
                              "p-1.5 rounded-sm transition-all shrink-0",
                              isCategoryVisible
                                ? "hover:bg-white/[0.04] text-white/60 hover:text-white"
                                : "hover:bg-white/[0.04] text-white/20 hover:text-white/40"
                            )}
                            title={isCategoryVisible ? "Hide on map" : "Show on map"}
                          >
                            {isCategoryVisible ? (
                              <Eye className="w-3.5 h-3.5" />
                            ) : (
                              <EyeOff className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>

                        {/* Items */}
                        {isExpanded && (
                          <div className="pl-2 mt-0.5 space-y-0.5 border-l border-white/5 ml-2.5">
                            {categorySuppliers.map(supplier => {
                                const isSelected = selectedSupplier?.supplier_id === supplier.supplier_id
                                return (
                                    <div
                                        key={supplier.supplier_id}
                                        onClick={() => {
                                          setSelectedSupplier(supplier)
                                          const coords = getSupplierCoordinates(supplier)
                                          if (mapRef.current && coords) {
                                            mapRef.current.flyTo({
                                              center: [coords.lng, coords.lat],
                                              zoom: 12,
                                              duration: 1000
                                            })
                                          }
                                        }}
                                        className={cn(
                                            "flex items-center justify-between p-1.5 rounded-sm cursor-pointer transition-all group/item",
                                            isSelected
                                                ? "bg-white/[0.08] border border-primary/40 shadow-[inset_2px_0_0_rgba(var(--primary),1)]"
                                                : "hover:bg-white/[0.04] border border-transparent",
                                            !isCategoryVisible && "opacity-40"
                                        )}
                                    >
                                        <div className="flex flex-col min-w-0">
                                            <span className={cn(
                                                "text-[10px] font-medium truncate",
                                                isSelected ? "text-white" : "text-white/70 group-hover/item:text-white"
                                            )}>{supplier.company_name}</span>
                                            <div className="flex items-center gap-1 text-[9px] text-white/30 font-mono">
                                                <MapPin className="w-2.5 h-2.5" />
                                                <span className="truncate">{supplier.location.city}</span>
                                            </div>
                                        </div>
                                        {(() => {
                                            const score = getQualityScore(supplier)
                                            if (score === null) return null
                                            return (
                                                <div className="flex items-center gap-0.5 px-1 bg-white/5 rounded-sm">
                                                    <Star className="w-2.5 h-2.5 text-yellow-400 fill-yellow-400" />
                                                    <span className="text-[9px] text-white/80 font-mono">{score.toFixed(1)}</span>
                                                </div>
                                            )
                                        })()}
                                    </div>
                                )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}
              </div>

              {/* Footer Actions */}
              <div className="px-2 py-2 border-t border-white/10 bg-white/[0.02] flex gap-2">
                 <button
                    onClick={() => setShowSupplierList(true)}
                    className="flex-1 flex items-center justify-center gap-2 px-2 py-1.5 bg-white/5 border border-white/10 hover:bg-primary/10 hover:border-primary/30 hover:text-white text-white/60 rounded-sm transition-all text-[10px] uppercase font-bold tracking-wide"
                 >
                    <Layers className="w-3 h-3" />
                    Full Directory
                 </button>
                 <button
                    onClick={() => loadSuppliers(false)}
                    className="px-2 py-1.5 bg-white/5 border border-white/10 hover:bg-white/10 hover:text-white text-white/50 rounded-sm transition-all"
                    title="Refresh"
                 >
                    <RefreshCw className="w-3 h-3" />
                 </button>
              </div>
            </div>
          )}

          {/* Inspector Panel (Detail) */}
          {selectedSupplier && (
            <div className="bg-[#0a0a0a]/95 backdrop-blur-xl border border-white/10 rounded-sm shadow-xl flex-1 overflow-hidden flex flex-col animate-in slide-in-from-top-2 duration-200">
               <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 bg-white/[0.02]">
                  <div className="flex items-center gap-2 text-xs font-bold text-white uppercase tracking-wider">
                    <Info className="w-3.5 h-3.5 text-primary" />
                    <span>Inspector</span>
                  </div>
                  <div className="flex items-center gap-2">
                     <span className="text-[9px] font-mono text-white/40 uppercase px-1.5 py-0.5 border border-white/10 rounded-sm bg-black/20">
                        {selectedSupplier.category.replace(/_/g, ' ')}
                     </span>
                     <button
                        onClick={() => setSelectedSupplier(null)}
                        className="p-1 hover:bg-white/10 rounded-sm transition-colors text-white/50 hover:text-white"
                     >
                        <X className="w-3.5 h-3.5" />
                     </button>
                  </div>
               </div>

               {/* Content of Inspector */}
               <div className="flex-1 overflow-y-auto p-3 space-y-4 bg-black/20">
                  
                  {/* Location */}
                  <div className="space-y-2">
                     <div className="text-[10px] text-white/30 font-mono uppercase tracking-widest border-b border-white/5 pb-1">Location</div>
                     <div className="text-[11px] text-white/80 font-mono">
                        {selectedSupplier.location.city}, {selectedSupplier.location.country}
                     </div>
                     {selectedSupplier.location.address && (
                        <div className="text-[10px] text-white/50">{selectedSupplier.location.address}</div>
                     )}
                  </div>

                  {/* Contact */}
                  <div className="space-y-2">
                     <div className="text-[10px] text-white/30 font-mono uppercase tracking-widest border-b border-white/5 pb-1">Contact</div>
                     <div className="space-y-1 text-[11px] font-mono">
                        {selectedSupplier.contact.primary_email && (
                            <div className="flex items-center gap-2">
                                <Mail className="w-3 h-3 text-white/40" />
                                <a href={`mailto:${selectedSupplier.contact.primary_email}`} className="text-primary hover:underline truncate">{selectedSupplier.contact.primary_email}</a>
                            </div>
                        )}
                        {selectedSupplier.contact.primary_phone && (
                            <div className="flex items-center gap-2">
                                <Phone className="w-3 h-3 text-white/40" />
                                <span className="text-white/70">{selectedSupplier.contact.primary_phone}</span>
                            </div>
                        )}
                        {selectedSupplier.contact.website && (
                            <div className="flex items-center gap-2">
                                <Globe className="w-3 h-3 text-white/40" />
                                <a href={selectedSupplier.contact.website} target="_blank" rel="noreferrer" className="text-white/70 hover:text-white flex items-center gap-1">
                                    Website <ExternalLink className="w-2 h-2" />
                                </a>
                            </div>
                        )}
                     </div>
                  </div>

                  {/* Properties Grid */}
                  <div className="space-y-2">
                     <div className="text-[10px] text-white/30 font-mono uppercase tracking-widest border-b border-white/5 pb-1">Properties</div>
                     <div className="grid grid-cols-2 gap-2 text-[10px]">
                        <div className="text-white/50">Rating</div>
                        <div className="font-mono text-yellow-400 flex items-center gap-1">
                            <Star className="w-2.5 h-2.5 fill-yellow-400" />
                            {getQualityScore(selectedSupplier)?.toFixed(1) || 'N/A'}
                        </div>

                        <div className="text-white/50">Match Score</div>
                        <div className={cn("font-mono font-bold", 
                            (selectedSupplier.compatibility?.match_score || 0) >= 80 ? "text-emerald-400" : "text-amber-500"
                        )}>
                            {selectedSupplier.compatibility?.match_score || 0}%
                        </div>

                        <div className="text-white/50">Experience</div>
                        <div className="font-mono text-white/80">{selectedSupplier.capabilities?.experience_years || '-'} years</div>

                        <div className="text-white/50">Lead Time</div>
                        <div className="font-mono text-white/80">{selectedSupplier.logistics?.estimated_lead_time_days || '-'} days</div>
                     </div>
                  </div>

                  {/* Products */}
                  {selectedSupplier.capabilities?.products && (
                     <div className="space-y-2">
                        <div className="text-[10px] text-white/30 font-mono uppercase tracking-widest border-b border-white/5 pb-1">Products</div>
                        <div className="flex flex-wrap gap-1">
                            {selectedSupplier.capabilities.products.slice(0, 6).map((p, i) => (
                                <span key={i} className="px-1.5 py-0.5 bg-white/5 border border-white/10 rounded-[2px] text-[9px] text-white/60 uppercase tracking-wide">
                                    {p}
                                </span>
                            ))}
                        </div>
                     </div>
                  )}

               </div>
            </div>
          )}

        </div>
      )}
    </div>
  )
}

