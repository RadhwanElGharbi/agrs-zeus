'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Map as MapLibreMap, MapOptions } from 'maplibre-gl'
import { X, ZoomIn, ZoomOut, Loader2, Navigation } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { PirlRouteManager, type RouteStyleState } from './PirlRouteManager'
import { getGeoJSONBounds, COLOR_PALETTE, type LngLatBounds } from '@/lib/map-utils'
import type { GeoJSON } from '@/lib/api/dataClient'

interface RouteData {
  name: string
  geojson: GeoJSON
  style: RouteStyleState
}

interface PirlRouteMapProps {
  routes: RouteData[]
  aoiGeojson: GeoJSON | null
  startPoint: { latitude: number; longitude: number; name?: string } | null
  endPoint: { latitude: number; longitude: number; name?: string } | null
  onStyleChange: (routeName: string, style: Partial<RouteStyleState>) => void
  onClose: () => void
  title?: string
}

export function PirlRouteMap({
  routes,
  aoiGeojson,
  startPoint,
  endPoint,
  onStyleChange,
  onClose,
  title = 'Route Visualization'
}: PirlRouteMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const [mapReady, setMapReady] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null)
  const routeBoundsRef = useRef<Map<string, LngLatBounds>>(new Map())

  // Initialize map
  useEffect(() => {
    let cancelled = false

    const initializeMap = async () => {
      if (mapRef.current || !mapContainerRef.current) return

      try {
        const maplibreModule = await import('maplibre-gl')

        if (cancelled) return

        const mapOptions: MapOptions = {
          container: mapContainerRef.current,
          style: {
            version: 8,
            sources: {},
            layers: [
              {
                id: 'background',
                type: 'background',
                paint: { 'background-color': '#1a1a2e' }
              }
            ],
            glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf'
          },
          center: [0, 20],
          zoom: 2,
          maxPitch: 60,
          attributionControl: false
        }

        const mapInstance = new maplibreModule.Map(mapOptions)

        mapInstance.on('load', () => {
          if (cancelled) return
          addBaseLayers(mapInstance)
          setMapReady(true)
          setIsLoading(false)
        })

        mapInstance.on('error', (e) => {
          console.warn('Map error:', e)
        })

        // Add controls
        mapInstance.addControl(
          new maplibreModule.NavigationControl({ visualizePitch: true }),
          'bottom-left'
        )

        mapInstance.addControl(
          new maplibreModule.ScaleControl({ maxWidth: 150, unit: 'metric' }),
          'bottom-right'
        )

        mapRef.current = mapInstance
      } catch (error) {
        console.error('Failed to initialize map:', error)
        setIsLoading(false)
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
  }, [])

  // Add base layers
  const addBaseLayers = useCallback((map: MapLibreMap) => {
    // Add satellite imagery
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

    // Add labels
    if (!map.getSource('esriLabels')) {
      map.addSource('esriLabels', {
        type: 'raster',
        tiles: ['https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'],
        tileSize: 256,
        maxzoom: 17,
        attribution: 'Esri'
      })
    }

    // Add fallback OSM
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

    // Add layers
    if (!map.getLayer('basemap-fallback')) {
      map.addLayer({
        id: 'basemap-fallback',
        type: 'raster',
        source: 'osmFallback',
        paint: { 'raster-opacity': 0.6 }
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
        paint: { 'raster-opacity': 0.7 }
      })
    }
  }, [])

  // Add AOI layer
  const addAoiLayer = useCallback((map: MapLibreMap, geojson: GeoJSON) => {
    const sourceId = 'aoi-source'
    const fillLayerId = 'aoi-fill'
    const outlineLayerId = 'aoi-outline'

    // Remove existing
    if (map.getLayer(fillLayerId)) map.removeLayer(fillLayerId)
    if (map.getLayer(outlineLayerId)) map.removeLayer(outlineLayerId)
    if (map.getSource(sourceId)) map.removeSource(sourceId)

    map.addSource(sourceId, {
      type: 'geojson',
      data: geojson as any
    })

    map.addLayer({
      id: fillLayerId,
      type: 'fill',
      source: sourceId,
      paint: {
        'fill-color': '#3b82f6',
        'fill-opacity': 0.15
      }
    })

    map.addLayer({
      id: outlineLayerId,
      type: 'line',
      source: sourceId,
      paint: {
        'line-color': '#3b82f6',
        'line-width': 2,
        'line-dasharray': [2, 2]
      }
    })
  }, [])

  // Add point marker
  const addPointMarker = useCallback((
    map: MapLibreMap,
    id: string,
    coordinates: [number, number],
    options: { label: string; color: string }
  ) => {
    const sourceId = `${id}-source`
    const circleLayerId = `${id}-circle`
    const labelLayerId = `${id}-label`

    // Remove existing
    if (map.getLayer(labelLayerId)) map.removeLayer(labelLayerId)
    if (map.getLayer(circleLayerId)) map.removeLayer(circleLayerId)
    if (map.getSource(sourceId)) map.removeSource(sourceId)

    map.addSource(sourceId, {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          geometry: { type: 'Point', coordinates },
          properties: { title: options.label }
        }]
      } as any
    })

    map.addLayer({
      id: circleLayerId,
      type: 'circle',
      source: sourceId,
      paint: {
        'circle-radius': 10,
        'circle-color': options.color,
        'circle-stroke-width': 3,
        'circle-stroke-color': '#ffffff'
      }
    })

    map.addLayer({
      id: labelLayerId,
      type: 'symbol',
      source: sourceId,
      layout: {
        'text-field': options.label,
        'text-offset': [0, 1.8],
        'text-size': 12,
        'text-anchor': 'top',
        'text-font': ['Open Sans Regular']
      },
      paint: {
        'text-color': '#ffffff',
        'text-halo-color': '#000000',
        'text-halo-width': 2
      }
    })
  }, [])

  // Add route layer
  const addRouteLayer = useCallback((
    map: MapLibreMap,
    name: string,
    geojson: GeoJSON,
    style: RouteStyleState
  ) => {
    const sourceId = `route-${name}-source`
    const lineLayerId = `route-${name}-line`
    const outlineLayerId = `route-${name}-outline`

    // Remove existing
    if (map.getLayer(lineLayerId)) map.removeLayer(lineLayerId)
    if (map.getLayer(outlineLayerId)) map.removeLayer(outlineLayerId)
    if (map.getSource(sourceId)) map.removeSource(sourceId)

    map.addSource(sourceId, {
      type: 'geojson',
      data: geojson as any
    })

    // Add outline (darker, wider)
    map.addLayer({
      id: outlineLayerId,
      type: 'line',
      source: sourceId,
      paint: {
        'line-color': '#000000',
        'line-width': 6,
        'line-opacity': style.visible ? style.opacity * 0.5 : 0
      }
    })

    // Add main line
    map.addLayer({
      id: lineLayerId,
      type: 'line',
      source: sourceId,
      paint: {
        'line-color': style.color,
        'line-width': 4,
        'line-opacity': style.visible ? style.opacity : 0
      }
    })

    // Store bounds
    const bounds = getGeoJSONBounds(geojson)
    if (bounds) {
      routeBoundsRef.current.set(name, bounds)
    }
  }, [])

  // Update route style
  const updateRouteStyle = useCallback((name: string, style: RouteStyleState) => {
    const map = mapRef.current
    if (!map) return

    const lineLayerId = `route-${name}-line`
    const outlineLayerId = `route-${name}-outline`

    if (map.getLayer(lineLayerId)) {
      map.setPaintProperty(lineLayerId, 'line-opacity', style.visible ? style.opacity : 0)
      map.setPaintProperty(lineLayerId, 'line-color', style.color)
    }
    if (map.getLayer(outlineLayerId)) {
      map.setPaintProperty(outlineLayerId, 'line-opacity', style.visible ? style.opacity * 0.5 : 0)
    }
  }, [])

  // Load all features when map is ready
  useEffect(() => {
    if (!mapReady || !mapRef.current) return
    const map = mapRef.current

    // Add AOI
    if (aoiGeojson) {
      addAoiLayer(map, aoiGeojson)
    }

    // Add routes
    routes.forEach(route => {
      addRouteLayer(map, route.name, route.geojson, route.style)
    })

    // Add start/end points (after routes so they appear on top)
    if (startPoint) {
      addPointMarker(map, 'start-point', [startPoint.longitude, startPoint.latitude], {
        label: startPoint.name || 'Start',
        color: '#22c55e' // Green
      })
    }

    if (endPoint) {
      addPointMarker(map, 'end-point', [endPoint.longitude, endPoint.latitude], {
        label: endPoint.name || 'End',
        color: '#ef4444' // Red
      })
    }

    // Fit bounds to show all features
    fitToAllFeatures()
  }, [mapReady, aoiGeojson, routes, startPoint, endPoint, addAoiLayer, addRouteLayer, addPointMarker])

  // Update route styles when they change
  useEffect(() => {
    routes.forEach(route => {
      updateRouteStyle(route.name, route.style)
    })
  }, [routes, updateRouteStyle])

  // Fit map to all features
  const fitToAllFeatures = useCallback(() => {
    const map = mapRef.current
    if (!map) return

    let combinedBounds: LngLatBounds | null = null

    // Combine all route bounds
    routeBoundsRef.current.forEach(bounds => {
      if (!combinedBounds) {
        combinedBounds = bounds
      } else {
        combinedBounds = [
          [Math.min(combinedBounds[0][0], bounds[0][0]), Math.min(combinedBounds[0][1], bounds[0][1])],
          [Math.max(combinedBounds[1][0], bounds[1][0]), Math.max(combinedBounds[1][1], bounds[1][1])]
        ]
      }
    })

    // Include AOI bounds
    if (aoiGeojson) {
      const aoiBounds = getGeoJSONBounds(aoiGeojson)
      if (aoiBounds) {
        if (!combinedBounds) {
          combinedBounds = aoiBounds
        } else {
          combinedBounds = [
            [Math.min(combinedBounds[0][0], aoiBounds[0][0]), Math.min(combinedBounds[0][1], aoiBounds[0][1])],
            [Math.max(combinedBounds[1][0], aoiBounds[1][0]), Math.max(combinedBounds[1][1], aoiBounds[1][1])]
          ]
        }
      }
    }

    // Include start/end points
    if (startPoint) {
      const pt: [number, number] = [startPoint.longitude, startPoint.latitude]
      if (!combinedBounds) {
        combinedBounds = [pt, pt]
      } else {
        combinedBounds = [
          [Math.min(combinedBounds[0][0], pt[0]), Math.min(combinedBounds[0][1], pt[1])],
          [Math.max(combinedBounds[1][0], pt[0]), Math.max(combinedBounds[1][1], pt[1])]
        ]
      }
    }

    if (endPoint) {
      const pt: [number, number] = [endPoint.longitude, endPoint.latitude]
      if (!combinedBounds) {
        combinedBounds = [pt, pt]
      } else {
        combinedBounds = [
          [Math.min(combinedBounds[0][0], pt[0]), Math.min(combinedBounds[0][1], pt[1])],
          [Math.max(combinedBounds[1][0], pt[0]), Math.max(combinedBounds[1][1], pt[1])]
        ]
      }
    }

    if (combinedBounds) {
      map.fitBounds(combinedBounds, {
        padding: { top: 80, bottom: 80, left: 80, right: 350 }, // Extra right padding for Route Manager
        maxZoom: 14,
        duration: 1000
      })
    }
  }, [aoiGeojson, startPoint, endPoint])

  // Zoom to specific route
  const handleZoomToRoute = useCallback((name: string) => {
    const map = mapRef.current
    if (!map) return

    const bounds = routeBoundsRef.current.get(name)
    if (bounds) {
      map.fitBounds(bounds, {
        padding: { top: 80, bottom: 80, left: 80, right: 350 },
        maxZoom: 14,
        duration: 800
      })
    }
  }, [])

  // Handle visibility toggle
  const handleToggleVisibility = useCallback((name: string) => {
    const route = routes.find(r => r.name === name)
    if (route) {
      onStyleChange(name, { visible: !route.style.visible })
    }
  }, [routes, onStyleChange])

  // Handle opacity change
  const handleOpacityChange = useCallback((name: string, opacity: number) => {
    onStyleChange(name, { opacity })
  }, [onStyleChange])

  // Keyboard handling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // Zoom controls
  const handleZoomIn = useCallback(() => {
    mapRef.current?.zoomIn({ duration: 300 })
  }, [])

  const handleZoomOut = useCallback(() => {
    mapRef.current?.zoomOut({ duration: 300 })
  }, [])

  const handleResetView = useCallback(() => {
    fitToAllFeatures()
  }, [fitToAllFeatures])

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/90 backdrop-blur-md"
        onClick={onClose}
      />

      {/* Main Container */}
      <div className="relative z-10 w-[95vw] h-[90vh] bg-card border border-border rounded-lg shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/30">
          <div className="flex items-center gap-4">
            <div className="p-2 rounded-md bg-primary/10 text-primary">
              <Navigation className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">{title}</h2>
              <p className="text-xs text-muted-foreground">
                {routes.length} route{routes.length !== 1 ? 's' : ''} loaded
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Zoom Controls */}
            <div className="flex items-center gap-1 mr-4">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={handleZoomIn}
                title="Zoom In"
              >
                <ZoomIn className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={handleZoomOut}
                title="Zoom Out"
              >
                <ZoomOut className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={handleResetView}
                title="Reset View"
              >
                Fit All
              </Button>
            </div>

            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Map Container */}
        <div className="flex-1 relative">
          <div
            ref={mapContainerRef}
            className="absolute inset-0"
          />

          {/* Loading Overlay */}
          {isLoading && (
            <div className="absolute inset-0 bg-background/80 flex items-center justify-center z-20">
              <div className="flex items-center gap-3 text-muted-foreground">
                <Loader2 className="w-6 h-6 animate-spin" />
                <span className="text-sm">Loading map...</span>
              </div>
            </div>
          )}

          {/* Route Manager Panel */}
          {mapReady && (
            <PirlRouteManager
              routes={routes.map(r => ({ name: r.name, style: r.style }))}
              selectedRouteId={selectedRouteId}
              onSelectRoute={setSelectedRouteId}
              onToggleVisibility={handleToggleVisibility}
              onOpacityChange={handleOpacityChange}
              onZoomToRoute={handleZoomToRoute}
            />
          )}

          {/* Legend */}
          <div className="absolute bottom-4 left-4 z-10 bg-black/80 backdrop-blur-md border border-white/10 rounded-sm p-3">
            <div className="text-[10px] text-white/50 uppercase tracking-wider mb-2">Legend</div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-[#22c55e] border-2 border-white" />
                <span className="text-[11px] text-white/80">Start Point</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-[#ef4444] border-2 border-white" />
                <span className="text-[11px] text-white/80">End Point</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-0.5 bg-[#3b82f6]" style={{ borderStyle: 'dashed' }} />
                <span className="text-[11px] text-white/80">AOI Boundary</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export { COLOR_PALETTE }
