'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { ZoomIn, ZoomOut, Maximize2, Loader2, RefreshCw, Layers } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useProject } from '@/lib/context/ProjectContext'
import { fetchVectorData, getTileUrl, type DatasetInfo } from '@/lib/api/dataClient'
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
import { AttributeTable } from './AttributeTable'
import { StyleEditor } from './StyleEditor'

export function MapViewer() {
  const { currentProject, datasets } = useProject()
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
  const zoomStartRef = useRef<{
    y: number
    zoom: number
    around: [number, number]
  } | null>(null)
  const rotateMarkerIdRef = useRef<string | null>(null)

  const [mapReady, setMapReady] = useState(false)
  const [mapLoaded, setMapLoaded] = useState(false)
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
  const [styleLayerId, setStyleLayerId] = useState<string | null>(null)
  const [styleDraft, setStyleDraft] = useState<LayerStyleOptions>({})
  const [styleOverrides, setStyleOverrides] = useState<Record<string, LayerStyleOptions>>({})
  const dockHeightRef = useRef(dockHeight)
  const dockContainerRef = useRef<HTMLDivElement | null>(null)
  const highlightSourceId = useRef('selected-feature-source')
  const highlightLayerIds = useRef<string[]>(['selected-feature-fill', 'selected-feature-line', 'selected-feature-point'])
  const imageryFailedRef = useRef(false)

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
        paint: { 'raster-opacity': 0.4 }
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
    map.setPaintProperty('basemap-reference', 'raster-opacity', 0.8)
  }, [])

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

        const mapInstance = new maplibreModule.Map({
          container: mapContainerRef.current,
          style: {
            version: 8,
            sources: {},
            layers: []
          },
          center: [-80.5449, 43.4723], // University of Waterloo
          zoom: 14.5,
          maxPitch: 85,
          attributionControl: false,
          failIfMajorPerformanceCaveat: false,
          preserveDrawingBuffer: true,
          antialias: false
        })

        mapInstance.on('load', () => {
          if (cancelled) return
          addBaseLayers()
          setMapReady(true)
          setMapLoaded(true)
        })

        mapInstance.on('zoom', () => {
          setZoom(Number(mapInstance.getZoom().toFixed(1)))
        })

        mapInstance.on('error', (event) => {
          const e = event as any
          if (e?.sourceId && (e.sourceId === 'esriImagery' || e.sourceId === 'esriLabels')) {
            imageryFailedRef.current = true
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

    if (layer.type === 'raster') {
      layer.layerIds.forEach((layerId) => {
        if (map.getLayer(layerId)) {
          map.setPaintProperty(layerId, 'raster-opacity', opacity)
        }
      })
      return
    }

    layer.layerIds.forEach((layerId) => {
      if (!map.getLayer(layerId)) return
      if (layerId.includes('fill')) {
        map.setPaintProperty(layerId, 'fill-opacity', opacity)
      } else if (layerId.includes('line') || layerId.includes('outline')) {
        map.setPaintProperty(layerId, 'line-opacity', opacity)
      } else if (layerId.includes('circle')) {
        map.setPaintProperty(layerId, 'circle-opacity', opacity)
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
          if (bounds) {
            const isDem = raster.name.toLowerCase().includes('dem')
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
            metadata: raster.metadata
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
            featureCount: added.featureCount
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
  }, [addRasterLayer, addVectorLayer, applyLayerOrder, clearDynamicLayers, currentProject, datasets, mapReady])

  useEffect(() => {
    if (!mapReady) return
    loadProjectLayers()
  }, [loadProjectLayers, mapReady])

  useEffect(() => {
    selectedLayerIdRef.current = selectedLayerId
  }, [selectedLayerId])

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
    const map = mapRef.current
    if (map) {
      ;['basemap-imagery', 'basemap-reference', 'basemap-fallback'].forEach((layerId) => {
        if (map.getLayer(layerId)) map.removeLayer(layerId)
      })
      ;['esriImagery', 'esriLabels', 'osmFallback'].forEach((sourceId) => {
        if (map.getSource(sourceId)) map.removeSource(sourceId)
      })
    }
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

  const showFeatureHighlight = useCallback((feature: any) => {
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
    const bounds = featureBounds(feature)
    if (bounds) {
      map.fitBounds(bounds as any, { padding: 60, duration: 350, maxZoom: Math.min(map.getMaxZoom(), 18) })
    }
  }, [ensureHighlightLayers])

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

  return (
    <div className="relative w-full h-full" style={{ minHeight: '100%', width: '100%', height: '100%', position: 'relative' }}>
      <div
        ref={mapContainerRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: '100%',
          height: '100%'
        }}
      />

      <button
        onClick={handleRefreshAll}
        className="absolute bottom-3 left-3 z-20 h-9 w-9 rounded-full bg-card border border-border shadow-md flex items-center justify-center hover:bg-accent"
        title="Refresh basemap and datasets"
      >
        <RefreshCw className="w-4 h-4" />
      </button>

      {/* Map Controls */}
      <div className="absolute top-4 left-4 z-10 space-y-2">
        <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4" />
              <span className="text-sm font-medium">Hybrid Satellite</span>
            </div>
            <div className="text-xs text-muted-foreground">
              Zoom: {zoom.toFixed(1)}x
            </div>
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              {mapLoaded ? <span className="text-emerald-400">●</span> : <Loader2 className="w-3 h-3 animate-spin" />}
              {mapLoaded ? 'Map ready' : 'Loading basemap...'}
            </div>
            <div className="text-xs text-muted-foreground">{projectSummary}</div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-2 shadow-lg space-y-1">
          <Button variant="ghost" size="sm" onClick={handleZoomIn} className="w-full justify-start">
            <ZoomIn className="w-4 h-4 mr-2" />
            Zoom In
          </Button>
          <Button variant="ghost" size="sm" onClick={handleZoomOut} className="w-full justify-start">
            <ZoomOut className="w-4 h-4 mr-2" />
            Zoom Out
          </Button>
          <Button variant="ghost" size="sm" onClick={handleResetView} className="w-full justify-start">
            <Maximize2 className="w-4 h-4 mr-2" />
            Reset View
          </Button>
        </div>
      </div>

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
        onOpenTable={handleOpenTable}
        onOpenStyle={handleOpenStyle}
      />

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
    </div>
  )
}

