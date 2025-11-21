'use client'

import { useEffect, useRef, useState } from 'react'
import { Layers, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

// Leaflet fallback for systems without WebGL support
export function MapViewer() {
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<any>(null)
  const [mapLoaded, setMapLoaded] = useState(false)
  const [zoom, setZoom] = useState(4)

  useEffect(() => {
    // Dynamically import Leaflet only on client side
    const initMap = async () => {
      if (map.current || !mapContainer.current) return
      
      console.log('🗺️ Initializing Leaflet (WebGL-free alternative)...')
      
      try {
        // Import Leaflet dynamically
        const L = (await import('leaflet')).default
        
        // Import Leaflet CSS
        await import('leaflet/dist/leaflet.css')
        
        // Fix Leaflet default icon paths
        delete (L.Icon.Default.prototype as any)._getIconUrl
        L.Icon.Default.mergeOptions({
          iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
          iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
          shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
        })

        // Initialize map
        map.current = L.map(mapContainer.current, {
          center: [39.8283, -98.5795], // Center of USA
          zoom: zoom,
          zoomControl: false // We'll add custom controls
        })

        // Add dark tile layer (CartoDB Dark Matter - no API key needed!)
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
          attribution: '© OpenStreetMap © CartoDB',
          subdomains: 'abcd',
          maxZoom: 20
        }).addTo(map.current)

        console.log('✅ Leaflet map created successfully!')
        setMapLoaded(true)

        // Listen for zoom changes
        map.current.on('zoomend', () => {
          if (map.current) {
            setZoom(map.current.getZoom())
          }
        })

      } catch (error) {
        console.error('❌ Failed to initialize map:', error)
      }
    }

    initMap()

    // Cleanup
    return () => {
      if (map.current) {
        map.current.remove()
        map.current = null
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
      map.current.setView([39.8283, -98.5795], 4)
    }
  }

  return (
    <div className="relative w-full h-full">
      {/* Map Container */}
      <div ref={mapContainer} className="absolute inset-0" />

      {/* Map Controls Overlay */}
      <div className="absolute top-4 left-4 z-[1000] space-y-2">
        <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4" />
              <span className="text-sm font-medium">Map View (Leaflet)</span>
            </div>
            <div className="text-xs text-muted-foreground">
              Zoom: {zoom.toFixed(1)}x
            </div>
            <div className="text-xs text-muted-foreground">
              {mapLoaded ? '✓ Loaded' : 'Loading...'}
            </div>
            <div className="text-xs text-green-500">
              ✓ WebGL-free
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
      <div className="absolute bottom-4 left-4 z-[1000]">
        <div className="bg-card/90 backdrop-blur border border-border rounded-lg p-3 shadow-lg max-w-xs">
          <h3 className="text-sm font-semibold mb-2">AGRS ZEUS Map Viewer</h3>
          <p className="text-xs text-muted-foreground">
            Interactive geospatial visualization using Leaflet (WebGL-free). 
            Works on all systems including VMs.
          </p>
        </div>
      </div>

      {/* Attribution */}
      <div className="absolute bottom-2 right-2 z-[1000]">
        <div className="text-xs text-muted-foreground bg-background/80 px-2 py-1 rounded">
          © OpenStreetMap © CartoDB
        </div>
      </div>
    </div>
  )
}

