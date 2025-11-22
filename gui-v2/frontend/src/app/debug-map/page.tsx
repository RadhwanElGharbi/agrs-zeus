'use client'

import { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

export default function DebugMapPage() {
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const [logs, setLogs] = useState<string[]>([])
  
  const addLog = (message: string) => {
    console.log(message)
    setLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`])
  }

  useEffect(() => {
    if (map.current) return
    
    addLog('Starting MapLibre initialization...')
    addLog(`Container exists: ${!!mapContainer.current}`)
    addLog(`MapLibre GL JS loaded: ${!!maplibregl}`)
    addLog(`Map constructor available: ${!!maplibregl.Map}`)
    
    if (!mapContainer.current) {
      addLog('ERROR: Container ref is null!')
      return
    }

    try {
      addLog('Creating map instance...')
      map.current = new maplibregl.Map({
        container: mapContainer.current,
        style: {
          version: 8,
          sources: {
            'osm': {
              type: 'raster',
              tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
              tileSize: 256,
              attribution: '© OpenStreetMap'
            }
          },
          layers: [{
            id: 'osm',
            type: 'raster',
            source: 'osm'
          }]
        },
        center: [-98.5795, 39.8283],
        zoom: 4
      })
      
      addLog('Map instance created successfully!')

      map.current.on('load', () => {
        addLog('✅ MAP LOADED SUCCESSFULLY!')
      })

      map.current.on('error', (e) => {
        addLog(`❌ Map error: ${e.error}`)
      })

      map.current.on('styledata', () => {
        addLog('Style data loaded')
      })

      map.current.on('sourcedata', (e) => {
        if (e.isSourceLoaded) {
          addLog(`Source loaded: ${e.sourceId}`)
        }
      })

      map.current.on('data', (e) => {
        addLog(`Data event: ${e.dataType}`)
      })

    } catch (error) {
      addLog(`❌ EXCEPTION: ${error}`)
    }

    return () => {
      if (map.current) {
        addLog('Cleaning up map')
        map.current.remove()
      }
    }
  }, [])

  return (
    <div style={{ 
      width: '100vw', 
      height: '100vh', 
      display: 'flex',
      flexDirection: 'column',
      background: '#000'
    }}>
      {/* Log Panel */}
      <div style={{ 
        height: '200px', 
        background: '#1a1a1a', 
        color: '#fff', 
        padding: '10px',
        overflow: 'auto',
        fontFamily: 'monospace',
        fontSize: '12px',
        borderBottom: '2px solid #333'
      }}>
        <h2 style={{ margin: '0 0 10px 0' }}>MapLibre Debug Console</h2>
        {logs.map((log, i) => (
          <div key={i} style={{ marginBottom: '4px' }}>{log}</div>
        ))}
      </div>

      {/* Map Container */}
      <div 
        ref={mapContainer} 
        style={{ 
          flex: 1,
          width: '100%',
          background: '#222'
        }}
      />
    </div>
  )
}

