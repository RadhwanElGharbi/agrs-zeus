'use client'

import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import { Layers, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

// Note: In production, this should be fetched from the API
// For now, using a placeholder - users will need to set their own token
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || 'pk.eyJ1IjoiZXhhbXBsZSIsImEiOiJleGFtcGxlIn0.example'

export function MapViewer() {
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<mapboxgl.Map | null>(null)
  const [mapLoaded, setMapLoaded] = useState(false)
  const [zoom, setZoom] = useState(4)

  useEffect(() => {
    if (map.current || !mapContainer.current) return

    // Set Mapbox access token
    mapboxgl.accessToken = MAPBOX_TOKEN

    // Initialize map
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/dark-v11', // Dark theme for enterprise look
      center: [-98.5795, 39.8283], // Center of USA
      zoom: zoom,
      attributionControl: false
    })

    // Add navigation controls
    map.current.addControl(
      new mapboxgl.NavigationControl({
        visualizePitch: true
      }),
      'top-right'
    )

    // Add scale control
    map.current.addControl(
      new mapboxgl.ScaleControl({
        maxWidth: 200,
        unit: 'metric'
      }),
      'bottom-right'
    )

    // Add fullscreen control
    map.current.addControl(
      new mapboxgl.FullscreenControl(),
      'top-right'
    )

    // Update zoom level on map zoom
    map.current.on('zoom', () => {
      if (map.current) {
        setZoom(Math.round(map.current.getZoom() * 10) / 10)
      }
    })

    // Map loaded event
    map.current.on('load', () => {
      setMapLoaded(true)
      console.log('Map loaded successfully')
    })

    // Cleanup
    return () => {
      if (map.current) {
        map.current.remove()
      }
    }
  }, [])

  const handleZoomIn = () => {
    if (map.current) {
      map.current.zoomIn()
    }
  }

  const handleZoomOut = () => {
    if (map.current) {
      map.current.zoomOut()
    }
  }

  const handleResetView = () => {
    if (map.current) {
      map.current.flyTo({
        center: [-98.5795, 39.8283],
        zoom: 4,
        duration: 1500
      })
    }
  }

  return (
    <div className="relative w-full h-full">
      {/* Map Container */}
      <div ref={mapContainer} className="absolute inset-0" />

      {/* Map Controls Overlay */}
      <div className="absolute top-4 left-4 z-10 space-y-2">
        <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4" />
              <span className="text-sm font-medium">Map View</span>
            </div>
            <div className="text-xs text-muted-foreground">
              Zoom: {zoom.toFixed(1)}x
            </div>
            <div className="text-xs text-muted-foreground">
              {mapLoaded ? '✓ Loaded' : 'Loading...'}
            </div>
          </div>
        </div>

        {/* Custom controls */}
        <div className="bg-card border border-border rounded-lg p-2 shadow-lg space-y-1">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleZoomIn}
            className="w-full justify-start"
          >
            <ZoomIn className="w-4 h-4 mr-2" />
            Zoom In
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleZoomOut}
            className="w-full justify-start"
          >
            <ZoomOut className="w-4 h-4 mr-2" />
            Zoom Out
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleResetView}
            className="w-full justify-start"
          >
            <Maximize2 className="w-4 h-4 mr-2" />
            Reset View
          </Button>
        </div>
      </div>

      {/* Info Panel */}
      <div className="absolute bottom-4 left-4 z-10">
        <div className="bg-card/90 backdrop-blur border border-border rounded-lg p-3 shadow-lg max-w-xs">
          <h3 className="text-sm font-semibold mb-2">AGRS ZEUS Map Viewer</h3>
          <p className="text-xs text-muted-foreground">
            Interactive geospatial visualization powered by Mapbox GL JS. 
            Use the controls to navigate, or click and drag to pan.
          </p>
        </div>
      </div>

      {/* Attribution (optional) */}
      <div className="absolute bottom-2 right-2 z-10">
        <div className="text-xs text-muted-foreground bg-background/80 px-2 py-1 rounded">
          © Mapbox | © OpenStreetMap
        </div>
      </div>
    </div>
  )
}

