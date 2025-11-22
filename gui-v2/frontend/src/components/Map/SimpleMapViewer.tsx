'use client'

import { useEffect, useRef } from 'react'

export function SimpleMapViewer() {
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<any>(null)

  useEffect(() => {
    if (map.current || !mapContainer.current) return

    // Dynamically import maplibre only on client side
    import('maplibre-gl').then((maplibregl) => {
      console.log('🗺️ MapLibre loaded, initializing map...')
      
      if (!mapContainer.current) return
      
      map.current = new maplibregl.Map({
        container: mapContainer.current,
        style: {
          version: 8,
          sources: {
            osm: {
              type: 'raster',
              tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
              tileSize: 256
            }
          },
          layers: [{
            id: 'osm',
            type: 'raster',
            source: 'osm'
          }]
        },
        center: [-98.5, 39.8],
        zoom: 4
      })

      map.current.on('load', () => {
        console.log('✅ Map loaded!')
      })
    })

    return () => {
      if (map.current) {
        map.current.remove()
      }
    }
  }, [])

  return (
    <div style={{
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      width: '100%',
      height: '100%'
    }}>
      <div 
        ref={mapContainer}
        style={{
          width: '100%',
          height: '100%'
        }}
      />
    </div>
  )
}

