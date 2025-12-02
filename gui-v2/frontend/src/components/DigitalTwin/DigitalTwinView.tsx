/**
 * AGRS ZEUS Digital Twin View Component
 * 
 * Displays the UE5 Pixel Streaming with terrain from the selected project's DEM.
 * Requires a project to be selected to connect.
 * 
 * Architecture:
 * - GUI runs on VM (192.168.0.126:3000)
 * - UE5 Pixel Streaming runs on Windows Host (192.168.0.41)
 * - Signaling server runs on Windows Host port 80
 */
'use client'

import React, { useEffect, useRef, useState, useCallback } from 'react'
import { Activity, AlertTriangle, Maximize2, Minimize2, Radio, XCircle, Settings, RefreshCw, FolderOpen, Monitor, Gamepad2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PixelStreamingClient, createPixelStreamingClient, StreamingStats } from '@/lib/pixelStreaming'
import { useProject } from '@/lib/context/ProjectContext'

// Connection status enum
enum ConnectionStatus {
  Disconnected = 'disconnected',
  Connecting = 'connecting',
  WaitingForStreamer = 'waiting',
  Connected = 'connected',
  Error = 'error'
}

// Default signaling server URL - Windows host where UE5 is running
// When accessed from VM browser, this points to the Windows host
const DEFAULT_SIGNALING_URL = 'ws://192.168.0.41:80'

interface DigitalTwinViewProps {
  signalingUrl?: string;
}

export function DigitalTwinView({ 
  signalingUrl = DEFAULT_SIGNALING_URL
}: DigitalTwinViewProps) {
  // Get current project from context
  const { currentProject, projectMetadata } = useProject()
  
  // Use the current project name
  const projectName = currentProject || ''
  
  // Refs
  const videoContainerRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const clientRef = useRef<PixelStreamingClient | null>(null)
  
  // State
  const [status, setStatus] = useState<ConnectionStatus>(ConnectionStatus.Disconnected)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [stats, setStats] = useState<StreamingStats | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [customUrl, setCustomUrl] = useState(signalingUrl)
  const [inputEnabled, setInputEnabled] = useState(true)
  const [sensitivityX, setSensitivityX] = useState(10.0) // Horizontal sensitivity
  const [sensitivityY, setSensitivityY] = useState(10.0) // Vertical sensitivity

  // Fullscreen toggle function
  const toggleFullscreen = useCallback(async () => {
    if (!containerRef.current) return

    try {
      if (!document.fullscreenElement) {
        await containerRef.current.requestFullscreen()
        setIsFullscreen(true)
      } else {
        await document.exitFullscreen()
        setIsFullscreen(false)
      }
    } catch (err) {
      console.error('[DigitalTwin] Fullscreen error:', err)
    }
  }, [])

  // Listen for fullscreen changes (e.g., user presses Escape)
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])
  
  // Initialize Pixel Streaming client
  const initializeClient = useCallback(() => {
    if (clientRef.current) {
      clientRef.current.disconnect()
    }

    const client = createPixelStreamingClient({
      signalingUrl: customUrl,
      
      onVideoReady: (video) => {
        if (videoContainerRef.current) {
          // Clear any existing video
          const existingVideo = videoContainerRef.current.querySelector('video')
          if (existingVideo) {
            existingVideo.remove()
          }
          
          // Style and add the new video
          video.className = 'w-full h-full object-contain'
          video.style.cursor = 'crosshair'
          videoContainerRef.current.appendChild(video)
        }
      },
      
      onConnected: () => {
        console.log('[DigitalTwin] Stream connected')
        setStatus(ConnectionStatus.Connected)
        setErrorMessage(null)
        
        // Set mouse sensitivities
        client.mouseSensitivityX = sensitivityX
        client.mouseSensitivityY = sensitivityY
        
        // Enable input handling on the video container
        if (videoContainerRef.current && inputEnabled) {
          client.enableInput(videoContainerRef.current)
        }
        
        // Send project context to UE5
        if (projectName) {
          client.sendCommand('SetProject', { projectName })
        }
      },
      
      onDisconnected: () => {
        console.log('[DigitalTwin] Stream disconnected')
        setStatus(ConnectionStatus.Disconnected)
      },
      
      onError: (error) => {
        console.error('[DigitalTwin] Error:', error)
        setStatus(ConnectionStatus.Error)
        setErrorMessage(error)
      },
      
      onStreamerConnected: () => {
        console.log('[DigitalTwin] UE5 streamer connected')
        setStatus(ConnectionStatus.Connected)
      },
      
      onStreamerDisconnected: () => {
        console.log('[DigitalTwin] UE5 streamer disconnected')
        setStatus(ConnectionStatus.WaitingForStreamer)
      },
      
      onDataChannelMessage: (message) => {
        console.log('[DigitalTwin] Data from UE5:', message)
        // Handle messages from UE5 here (e.g., sensor data, alerts)
      }
    })

    clientRef.current = client
    return client
  }, [customUrl, projectName, inputEnabled, sensitivityX, sensitivityY])

  // Connect to streaming
  const connect = useCallback(async () => {
    setStatus(ConnectionStatus.Connecting)
    setErrorMessage(null)
    
    try {
      const client = initializeClient()
      await client.connect()
      setStatus(ConnectionStatus.WaitingForStreamer)
    } catch (error) {
      console.error('[DigitalTwin] Connection failed:', error)
      setStatus(ConnectionStatus.Error)
      setErrorMessage('Failed to connect to signaling server. Make sure UE5 is streaming.')
    }
  }, [initializeClient])

  // Disconnect from streaming
  const disconnect = useCallback(() => {
    if (clientRef.current) {
      clientRef.current.disableInput()
      clientRef.current.disconnect()
      clientRef.current = null
    }
    setStatus(ConnectionStatus.Disconnected)
    
    // Clear video
    if (videoContainerRef.current) {
      const video = videoContainerRef.current.querySelector('video')
      if (video) {
        video.remove()
      }
    }
  }, [])

  // Toggle input (mouse/keyboard passthrough)
  const toggleInput = useCallback(() => {
    if (!clientRef.current || status !== ConnectionStatus.Connected) return
    
    if (inputEnabled) {
      clientRef.current.disableInput()
      setInputEnabled(false)
    } else {
      if (videoContainerRef.current) {
        clientRef.current.enableInput(videoContainerRef.current)
      }
      setInputEnabled(true)
    }
  }, [inputEnabled, status])

  // Update stats periodically
  useEffect(() => {
    if (status !== ConnectionStatus.Connected) return
    
    const interval = setInterval(async () => {
      if (clientRef.current) {
        const newStats = await clientRef.current.getStats()
        setStats(newStats)
      }
    }, 1000)
    
    return () => clearInterval(interval)
  }, [status])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (clientRef.current) {
        clientRef.current.disconnect()
      }
    }
  }, [])

  // Status indicator component
  const StatusIndicator = () => {
    const statusConfig = {
      [ConnectionStatus.Disconnected]: { color: 'bg-gray-500', text: 'Disconnected', pulse: false },
      [ConnectionStatus.Connecting]: { color: 'bg-yellow-500', text: 'Connecting...', pulse: true },
      [ConnectionStatus.WaitingForStreamer]: { color: 'bg-blue-500', text: 'Waiting for UE5', pulse: true },
      [ConnectionStatus.Connected]: { color: 'bg-emerald-500', text: 'Live', pulse: true },
      [ConnectionStatus.Error]: { color: 'bg-red-500', text: 'Error', pulse: false }
    }
    
    const config = statusConfig[status]
    
    return (
      <div className="flex items-center gap-2">
        <span className={cn(
          'w-2 h-2 rounded-full',
          config.color,
          config.pulse && 'animate-pulse shadow-[0_0_8px_currentColor]'
        )} />
        <span className="text-[10px] text-white/70 font-mono uppercase tracking-wider">
          {config.text}
        </span>
      </div>
    )
  }

  return (
    <div 
      ref={containerRef}
      className="relative w-full h-full bg-black overflow-hidden flex flex-col animate-in fade-in duration-300"
    >
      
      {/* Header */}
      <div className="h-14 border-b border-emerald-500/30 bg-emerald-950/30 flex items-center justify-between px-6 select-none z-50 relative">
        <div className="flex items-center gap-4">
          <div className="p-1.5 bg-emerald-500/10 rounded border border-emerald-500/20">
            <Activity className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <div className="font-mono font-bold text-emerald-400 tracking-widest uppercase text-sm">
              Digital Twin <span className="text-white/40 mx-2">|</span> {currentProject || 'No Project'}
            </div>
            <StatusIndicator />
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Input Toggle (only when connected) */}
          {status === ConnectionStatus.Connected && (
            <button
              onClick={toggleInput}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 border rounded text-sm font-mono transition-colors",
                inputEnabled 
                  ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-400"
                  : "bg-white/5 border-white/10 text-white/40"
              )}
              title={inputEnabled ? "Input Enabled (click to disable)" : "Input Disabled (click to enable)"}
            >
              <Gamepad2 className="w-4 h-4" />
              {inputEnabled ? 'Input On' : 'Input Off'}
            </button>
          )}
          
          {/* Connection Button */}
          {status === ConnectionStatus.Disconnected || status === ConnectionStatus.Error ? (
            <button 
              onClick={connect}
              className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 rounded text-emerald-400 text-sm font-mono transition-colors"
              title="Connect to Digital Twin"
            >
              <Radio className="w-4 h-4" />
              Connect
            </button>
          ) : status === ConnectionStatus.Connected ? (
            <button 
              onClick={disconnect}
              className="flex items-center gap-2 px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 rounded text-red-400 text-sm font-mono transition-colors"
            >
              <XCircle className="w-4 h-4" />
              Disconnect
            </button>
          ) : (
            <button 
              disabled
              className="flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/10 rounded text-white/40 text-sm font-mono cursor-not-allowed"
            >
              <RefreshCw className="w-4 h-4 animate-spin" />
              {status === ConnectionStatus.Connecting ? 'Connecting...' : 'Waiting...'}
            </button>
          )}
          
          <button 
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 hover:bg-white/5 rounded text-white/40 hover:text-white transition-colors"
          >
            <Settings className="w-4 h-4" />
          </button>
          
          <button 
            onClick={toggleFullscreen}
            className="p-2 hover:bg-white/5 rounded text-white/40 hover:text-white transition-colors"
            title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Main Viewport */}
      <div className="flex-1 relative bg-gradient-to-b from-gray-900 to-black overflow-hidden">
        
        {/* Video Container */}
        <div 
          ref={videoContainerRef}
          className="absolute inset-0 flex items-center justify-center bg-[#050505]"
          tabIndex={0}
        >
          {/* Grid Background (shown when no video) */}
          {status !== ConnectionStatus.Connected && (
            <div className="absolute inset-0 opacity-20 bg-[linear-gradient(to_right,#10b981_1px,transparent_1px),linear-gradient(to_bottom,#10b981_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)]" />
          )}
          
          {/* Placeholder content when not connected */}
          {status !== ConnectionStatus.Connected && (
            <div className="relative z-10 text-center">
              {/* Ready to Connect */}
              {status === ConnectionStatus.Disconnected && (
                <div className="space-y-6">
                  <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-lg inline-block">
                    <Monitor className="w-16 h-16 text-emerald-500/70 mx-auto" />
                  </div>
                  <div className="text-white/80 font-mono text-xl">UE5 Digital Twin</div>
                  {currentProject ? (
                    <div className="text-emerald-400 font-mono text-sm">Project: {currentProject}</div>
                  ) : (
                    <div className="text-amber-400/70 font-mono text-sm">No project selected</div>
                  )}
                  <div className="text-white/40 font-mono text-sm max-w-md mx-auto">
                    Click <span className="text-emerald-400">Connect</span> to stream from UE5.
                    <br />
                    Make sure Pixel Streaming is enabled on Windows.
                  </div>
                  <div className="text-white/30 font-mono text-xs mt-4">
                    Signaling: {customUrl}
                  </div>
                </div>
              )}
              
              {status === ConnectionStatus.Connecting && (
                <div className="space-y-4">
                  <RefreshCw className="w-12 h-12 text-emerald-500/50 animate-spin mx-auto" />
                  <div className="text-white/60 font-mono">Connecting to signaling server...</div>
                  <div className="text-white/30 font-mono text-xs">{customUrl}</div>
                </div>
              )}
              
              {status === ConnectionStatus.WaitingForStreamer && (
                <div className="space-y-4">
                  <div className="w-16 h-16 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mx-auto" />
                  <div className="text-white/60 font-mono">Waiting for UE5 Streamer...</div>
                  <div className="text-white/40 font-mono text-sm max-w-md">
                    In UE5: Pixel Streaming → Stream Level Editor
                  </div>
                </div>
              )}
              
              {status === ConnectionStatus.Error && (
                <div className="space-y-4">
                  <AlertTriangle className="w-12 h-12 text-red-500/70 mx-auto" />
                  <div className="text-red-400 font-mono">Connection Error</div>
                  <div className="text-white/40 font-mono text-sm max-w-md">{errorMessage}</div>
                  <div className="text-white/30 font-mono text-xs mt-4">
                    Check that UE5 is running with Pixel Streaming on {customUrl}
                  </div>
                </div>
              )}
            </div>
          )}
          
          {/* Overlay Vignette */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.4)_100%)] pointer-events-none z-20" />
        </div>

        {/* HUD Overlay (only shown when connected) */}
        {status === ConnectionStatus.Connected && (
          <div className="absolute inset-0 pointer-events-none z-30">
            
            {/* Top Left: Project Info */}
            <div className="absolute top-6 left-6 pointer-events-auto">
              <div className="bg-black/80 backdrop-blur-md border-l-2 border-l-emerald-500 border-y border-r border-emerald-500/20 p-4 rounded-r-sm shadow-lg min-w-[280px]">
                <div className="flex items-center justify-between mb-3 border-b border-emerald-500/20 pb-2">
                  <span className="text-emerald-400 text-[10px] font-mono uppercase tracking-widest">Project</span>
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-white/50 text-xs font-mono">Name</span>
                    <span className="text-white font-mono text-sm font-bold">{projectName || 'None'}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-white/50 text-xs font-mono">Mode</span>
                    <span className="text-emerald-400 font-mono text-sm">Planning</span>
                  </div>
                  {stats && (
                    <div className="flex justify-between items-center">
                      <span className="text-white/50 text-xs font-mono">Resolution</span>
                      <span className="text-white/80 font-mono text-xs">{stats.videoWidth}x{stats.videoHeight}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Bottom Left: Stream Stats */}
            {stats && (
              <div className="absolute bottom-6 left-6 pointer-events-auto">
                <div className="bg-black/60 backdrop-blur-sm border border-white/10 p-3 rounded-sm text-[10px] font-mono text-white/50 space-y-1">
                  <div>Stream: {stats.videoWidth}x{stats.videoHeight} @ {stats.frameRate.toFixed(0)} fps</div>
                  <div>Bitrate: {(stats.bitrate / 1000).toFixed(1)} Mbps</div>
                  <div>Input: {inputEnabled ? 'Enabled' : 'Disabled'}</div>
                </div>
              </div>
            )}

            {/* Top Right: Mode Selector */}
            <div className="absolute top-6 right-6 pointer-events-auto">
              <div className="flex gap-1 bg-black/80 backdrop-blur-md border border-emerald-500/20 rounded-sm p-1">
                <button className="px-3 py-1.5 bg-emerald-500/20 text-emerald-400 text-xs font-mono rounded-sm">
                  Planning
                </button>
                <button className="px-3 py-1.5 text-white/40 hover:text-white/60 text-xs font-mono rounded-sm transition-colors">
                  Construction
                </button>
                <button className="px-3 py-1.5 text-white/40 hover:text-white/60 text-xs font-mono rounded-sm transition-colors">
                  Operation
                </button>
              </div>
            </div>

            {/* Right Side: Quick Actions */}
            <div className="absolute bottom-6 right-6 pointer-events-auto">
              <div className="flex flex-col gap-2">
                <button 
                  onClick={() => clientRef.current?.sendCommand('ReloadTerrain')}
                  className="p-2 bg-black/80 backdrop-blur-md border border-white/10 hover:border-emerald-500/30 rounded text-white/60 hover:text-emerald-400 transition-colors"
                  title="Reload Terrain"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Settings Panel */}
        {showSettings && (
          <div className="absolute top-16 right-6 z-50 bg-black/90 backdrop-blur-md border border-white/20 rounded-lg p-4 w-96 shadow-xl">
            <h3 className="text-white font-mono text-sm mb-4 pb-2 border-b border-white/10">
              Connection Settings
            </h3>
            <div className="space-y-4">
              <div>
                <label className="text-white/60 text-xs font-mono block mb-1">Signaling Server URL</label>
                <input 
                  type="text" 
                  value={customUrl}
                  onChange={(e) => setCustomUrl(e.target.value)}
                  placeholder="ws://192.168.0.41:80"
                  className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-white font-mono text-sm focus:border-emerald-500/50 focus:outline-none"
                  disabled={status === ConnectionStatus.Connected}
                />
                <div className="text-[10px] text-white/30 font-mono mt-1">
                  Default: ws://192.168.0.41:80 (Windows Host)
                </div>
              </div>
              <div>
                <label className="text-white/60 text-xs font-mono block mb-1">Project</label>
                <input 
                  type="text" 
                  value={projectName || 'None selected'}
                  className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-white/60 font-mono text-sm"
                  readOnly
                />
              </div>
              <div>
                <label className="text-white/60 text-xs font-mono block mb-1">
                  Horizontal Sensitivity: {sensitivityX.toFixed(0)}x
                </label>
                <input 
                  type="range" 
                  min="3"
                  max="30"
                  step="1"
                  value={sensitivityX}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setSensitivityX(val);
                    if (clientRef.current) {
                      clientRef.current.mouseSensitivityX = val;
                    }
                  }}
                  className="w-full accent-emerald-500"
                />
                <div className="flex justify-between text-[9px] text-white/30 font-mono mt-1">
                  <span>3x</span>
                  <span>10x</span>
                  <span>30x</span>
                </div>
              </div>
              <div>
                <label className="text-white/60 text-xs font-mono block mb-1">
                  Vertical Sensitivity: {sensitivityY.toFixed(0)}x
                </label>
                <input 
                  type="range" 
                  min="3"
                  max="30"
                  step="1"
                  value={sensitivityY}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setSensitivityY(val);
                    if (clientRef.current) {
                      clientRef.current.mouseSensitivityY = val;
                    }
                  }}
                  className="w-full accent-emerald-500"
                />
                <div className="flex justify-between text-[9px] text-white/30 font-mono mt-1">
                  <span>3x</span>
                  <span>10x</span>
                  <span>30x</span>
                </div>
              </div>
              <div className="pt-2 border-t border-white/10 text-[10px] text-white/40 font-mono space-y-1">
                <div>Status: {status}</div>
                {stats && <div>Streamer: {stats.streamerConnected ? 'Connected' : 'Disconnected'}</div>}
                <div className="pt-2 text-white/30">
                  Tip: Double-click to lock mouse for camera control
                </div>
              </div>
            </div>
            <button 
              onClick={() => setShowSettings(false)}
              className="mt-4 w-full py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded text-white/60 text-sm font-mono transition-colors"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
