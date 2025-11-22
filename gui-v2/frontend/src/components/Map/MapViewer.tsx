'use client'

import { useEffect, useRef, useState } from 'react'
import { Layers, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

// Use global maplibregl from CDN (loaded in layout)
declare global {
  interface Window {
    maplibregl: any;
  }
}

const maplibregl = typeof window !== 'undefined' ? window.maplibregl : null

export function MapViewer() {
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const [mapLoaded, setMapLoaded] = useState(false)
  const [zoom, setZoom] = useState(4)

  useEffect(() => {
    if (map.current) return
    
    // Wait for maplibregl to load from CDN
    if (typeof window === 'undefined' || !window.maplibregl) {
      console.log('⏳ Waiting for MapLibre GL JS to load from CDN...')
      return // Exit early, will retry on next render
    }
    
    if (!mapContainer.current) {
      console.error('Map container ref is null!')
      return
    }

    const mapLib = window.maplibregl
    
    console.log('🗺️ Initializing MapLibre GL JS...')
    console.log('MapLibre version:', mapLib.version)
    console.log('Container dimensions:', {
      width: mapContainer.current.offsetWidth,
      height: mapContainer.current.offsetHeight,
      clientWidth: mapContainer.current.clientWidth,
      clientHeight: mapContainer.current.clientHeight
    })

    // Ensure container has dimensions
    if (mapContainer.current.offsetHeight === 0) {
      console.error('❌ Container has zero height! Forcing dimensions...')
      mapContainer.current.style.width = '100%'
      mapContainer.current.style.height = '100%'
      mapContainer.current.style.minHeight = '600px'
    }

    try {
      // Initialize map with OpenStreetMap tiles (no token needed)
      map.current = new mapLib.Map({
        container: mapContainer.current,
        style: {
          version: 8,
          sources: {
            'osm': {
              type: 'raster',
              tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
              tileSize: 256,
              attribution: '© OpenStreetMap contributors'
            }
          },
          layers: [{
            id: 'osm',
            type: 'raster',
            source: 'osm',
            minzoom: 0,
            maxzoom: 22
          }]
        },
        center: [-98.5795, 39.8283], // Center of USA
        zoom: zoom,
        attributionControl: false,
        // Critical rendering options for VM compatibility
        failIfMajorPerformanceCaveat: false, // Don't fail on slower GPUs
        preserveDrawingBuffer: true, // Better rendering stability
        antialias: false, // Disable antialiasing to reduce GPU load
        refreshExpiredTiles: false // Reduce tile refresh overhead
      })

      console.log('✅ Map instance created')
      console.log('📐 Map canvas:', map.current.getCanvas())
      
      // Add timeout to catch style loading failures
      const loadTimeout = setTimeout(() => {
        console.error('⏱️ Map style load timeout after 10 seconds')
        console.error('This usually means the style URL is unreachable or invalid')
      }, 10000)
      
      // Force resize after initialization to ensure proper rendering
      setTimeout(() => {
        if (map.current) {
          console.log('🔄 Forcing map resize...')
          map.current.resize()
        }
      }, 100)

      // Add navigation controls
      map.current.addControl(
        new maplibregl.NavigationControl({
          visualizePitch: true
        }),
        'top-right'
      )

      // Add scale control
      map.current.addControl(
        new maplibregl.ScaleControl({
          maxWidth: 200,
          unit: 'metric'
        }),
        'bottom-right'
      )

      // Add fullscreen control
      map.current.addControl(
        new maplibregl.FullscreenControl(),
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
        clearTimeout(loadTimeout)
        setMapLoaded(true)
        console.log('🎉 Map loaded successfully!')
        console.log('📏 Map container size:', {
          width: mapContainer.current?.offsetWidth,
          height: mapContainer.current?.offsetHeight
        })
        // Force resize to ensure proper rendering
        setTimeout(() => {
          map.current?.resize()
          console.log('✅ Map is fully rendered and ready!')
        }, 100)
      })

      // Error handling
      map.current.on('error', (e: any) => {
        console.error('❌ MapLibre error:', e)
        if (e.error) {
          console.error('Error details:', e.error)
        }
      })

      // Style loading events
      map.current.on('styledata', () => {
        console.log('📦 Style data loaded')
      })

      map.current.on('sourcedata', (e) => {
        if (e.isSourceLoaded) {
          console.log('📍 Source loaded:', e.sourceId)
        }
      })

    } catch (error) {
      console.error('❌ Failed to initialize map:', error)
    }

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
    <div className="relative w-full h-full" style={{ minHeight: '100%', width: '100%', height: '100%', position: 'relative' }}>
      {/* Map Container */}
      <div 
        ref={mapContainer} 
        style={{ 
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: '100%',
          height: '100%',
          minHeight: '600px'
        }}
      />

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
            Interactive geospatial visualization powered by MapLibre GL JS. 
            Use the controls to navigate, or click and drag to pan.
          </p>
        </div>
      </div>

      {/* Attribution (optional) */}
      <div className="absolute bottom-2 right-2 z-10">
        <div className="text-xs text-muted-foreground bg-background/80 px-2 py-1 rounded">
          © OpenStreetMap contributors
        </div>
      </div>
    </div>
  )
}

