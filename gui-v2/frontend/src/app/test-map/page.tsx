'use client'

import { useEffect, useRef } from 'react'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

export default function TestMapPage() {
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)

  useEffect(() => {
    if (map.current) return

    console.log('🔧 MINIMAL TEST - Initializing MapLibre...')
    console.log('Container:', mapContainer.current)

    if (!mapContainer.current) {
      console.error('❌ Container ref is null!')
      return
    }

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        sources: {
          'osm': {
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
      center: [-74.5, 40], // New York
      zoom: 9
    })

    // Add all event listeners for debugging
    map.current.on('load', () => {
      console.log('✅✅✅ MAP LOADED SUCCESSFULLY! ✅✅✅')
    })

    map.current.on('styledata', () => {
      console.log('📦 Style data event fired')
    })

    map.current.on('sourcedata', (e) => {
      if (e.isSourceLoaded && e.sourceId) {
        console.log('📍 Source loaded:', e.sourceId)
      }
    })

    map.current.on('data', (e) => {
      console.log('📊 Data event:', e.dataType)
    })

    map.current.on('error', (e: any) => {
      console.error('❌ Map error:', e.error)
      console.error('Error source:', e.sourceId)
      console.error('Error tile:', e.tile)
    })

    // @ts-ignore - render event exists but not in types
    map.current.once('render', () => {
      console.log('🎨 Render event (map is rendering)')
    })

    console.log('Map instance created:', map.current)

    return () => {
      map.current?.remove()
    }
  }, [])

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      margin: 0,
      padding: 0,
      position: 'fixed',
      top: 0,
      left: 0,
      background: '#000'
    }}>
      <div
        ref={mapContainer}
        style={{
          width: '100%',
          height: '100%',
          position: 'absolute'
        }}
      />
      <div style={{
        position: 'absolute',
        top: 20,
        left: 20,
        background: 'rgba(0,0,0,0.8)',
        color: '#fff',
        padding: '10px 20px',
        borderRadius: 5,
        zIndex: 1000
      }}>
        <h2>Minimal MapLibre Test</h2>
        <p>Check console for messages</p>
      </div>
    </div>
  )
}

