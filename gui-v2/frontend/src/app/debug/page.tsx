'use client'

import { useEffect, useRef, useState } from 'react'

export default function DebugPage() {
  const [logs, setLogs] = useState<string[]>([])
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const addLog = (msg: string) => {
    console.log(msg)
    setLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ${msg}`])
  }

  useEffect(() => {
    addLog('🔍 Starting canvas/WebGL diagnostic...')
    
    if (!canvasRef.current) {
      addLog('❌ Canvas ref is null')
      return
    }

    const canvas = canvasRef.current
    addLog(`✅ Canvas element exists: ${canvas.width}x${canvas.height}`)

    // Test WebGL
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
    if (!gl) {
      addLog('❌ WebGL NOT supported')
      return
    }
    addLog('✅ WebGL context created successfully')

    // Draw a test pattern
    const glContext = gl as WebGLRenderingContext
    glContext.clearColor(1.0, 0.0, 0.0, 1.0) // Red
    glContext.clear(glContext.COLOR_BUFFER_BIT)
    addLog('✅ Drew red rectangle to canvas')

    // Test if it's visible
    addLog('🔍 Check if you see a RED rectangle below')
    addLog('If yes: WebGL works, issue is Mapbox-specific')
    addLog('If no: Canvas rendering is broken')

  }, [])

  return (
    <div style={{ padding: 20, background: '#000', color: '#fff', minHeight: '100vh' }}>
      <h1>🔬 WebGL/Canvas Diagnostic</h1>
      
      <div style={{ background: '#222', padding: 20, marginTop: 20, marginBottom: 20 }}>
        <h2>Test Canvas (should be RED):</h2>
        <canvas 
          ref={canvasRef}
          width={800}
          height={600}
          style={{
            border: '2px solid #0f0',
            display: 'block',
            width: 800,
            height: 600
          }}
        />
      </div>

      <div style={{ background: '#222', padding: 20 }}>
        <h2>Diagnostic Log:</h2>
        {logs.map((log, i) => (
          <div key={i} style={{ fontFamily: 'monospace', fontSize: 12, marginBottom: 5 }}>
            {log}
          </div>
        ))}
      </div>
    </div>
  )
}







