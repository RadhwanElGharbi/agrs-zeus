'use client'

import { useEffect, useRef, useState } from 'react'
import { Brain, Database, Globe } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ZeusLoadingDialogProps {
  open: boolean
  onComplete: () => void
}

const LOADING_MESSAGES = [
  "ZEUS agent is analyzing the terrain...",
  "ZEUS agent is mapping dataset availability...",
  "ZEUS agent is preparing fetching and geoprocessing operations...",
  "ZEUS agent is querying global catalog...",
  "ZEUS agent is resolving coordinate reference systems...",
  "ZEUS agent is validating network topology...",
  "ZEUS agent is optimizing spatial indices...",
  "ZEUS agent is verifying data integrity..."
]

const TERMINAL_LOGS = [
  '> init_sequence_alpha()',
  '> loading_modules: [geo, dem, hydro]',
  '> verifying_api_handshake... OK',
  '> establishing_secure_channel...',
  '> scanning_project_aoi()',
  '> generating_dense_waypoints()',
  '> compiling_route_constraints()',
  '> hydrology_kernel.ready = true',
  '> resolving_epsg_mismatch...',
  '> buffering_vector_layers()',
  '> fetching_catalog_metadata()',
  '> prioritizing_local_sources()',
  '> computing_cost_surface()',
  '> aggregating_rl_metrics()',
  '> validating_dataset_checksums()',
  '> seeding_geoprocess_graph()',
  '> evaluating_nodata_thresholds()',
  '> processing_request...'
]

export function ZeusLoadingDialog({ open, onComplete }: ZeusLoadingDialogProps) {
  const [progress, setProgress] = useState(0)
  const [messageIndex, setMessageIndex] = useState(0)
  const [stage, setStage] = useState<'initializing' | 'processing' | 'finalizing'>('initializing')
  const [logLines, setLogLines] = useState<string[]>([])

  const progressRef = useRef(0)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const completionTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const startTimeRef = useRef(0)
  const durationRef = useRef(0)
  const finalHoldRef = useRef(false)

  const clearTimers = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    if (completionTimeoutRef.current) {
      clearTimeout(completionTimeoutRef.current)
      completionTimeoutRef.current = null
    }
  }

  const updateStageForProgress = (value: number) => {
    if (value < 30) setStage('initializing')
    else if (value < 85) setStage('processing')
    else setStage('finalizing')
  }

  const updateLogsForProgress = (value: number, forceAll?: boolean) => {
    const totalEntries = TERMINAL_LOGS.length
    const desiredCount = forceAll
      ? totalEntries
      : Math.min(
          totalEntries,
          Math.max(1, Math.floor((value / 100) * totalEntries))
        )

    setLogLines((prev) => {
      if (prev.length >= desiredCount) return prev
      return TERMINAL_LOGS.slice(0, desiredCount)
    })
  }

  const startFinalHold = () => {
    if (finalHoldRef.current) return
    finalHoldRef.current = true

    setProgress(99)
    progressRef.current = 99
    updateStageForProgress(99)
    updateLogsForProgress(99, true)
    setMessageIndex((prev) => (prev + 1) % LOADING_MESSAGES.length)

    completionTimeoutRef.current = setTimeout(() => {
      setProgress(100)
      progressRef.current = 100
      updateStageForProgress(100)
      updateLogsForProgress(100, true)
      timeoutRef.current = setTimeout(() => {
        onComplete()
      }, 400)
    }, 5000)
  }

  useEffect(() => {
    if (!open) {
      clearTimers()
      setProgress(0)
      setMessageIndex(0)
      setStage('initializing')
      setLogLines([])
      progressRef.current = 0
      finalHoldRef.current = false
      return
    }

    startTimeRef.current = Date.now()
    durationRef.current = Math.floor(Math.random() * (15000 - 10000) + 10000)
    finalHoldRef.current = false
    progressRef.current = 0
    setLogLines([TERMINAL_LOGS[0]])

    const runTick = () => {
      if (finalHoldRef.current) return

      const elapsed = Date.now() - startTimeRef.current
      const normalized = Math.min(elapsed / durationRef.current, 1)

      const baseProgress = normalized * 96 // keep below 99 until final hold
      const jitter = Math.random() * 2.5
      const candidate = Math.max(progressRef.current, Math.min(baseProgress + jitter, 96.5))

      const shouldPause = Math.random() < 0.25
      const nextDelay = shouldPause
        ? Math.floor(Math.random() * (1400 - 700) + 700)
        : Math.floor(Math.random() * (450 - 130) + 130)

      progressRef.current = candidate
      setProgress(candidate)
      updateStageForProgress(candidate)
      updateLogsForProgress(candidate)

      if (Math.random() < 0.3) {
        setMessageIndex((prev) => (prev + 1) % LOADING_MESSAGES.length)
      }

      if (candidate >= 96 || normalized >= 0.98) {
        startFinalHold()
        return
      }

      timeoutRef.current = setTimeout(runTick, nextDelay)
    }

    timeoutRef.current = setTimeout(runTick, 300)

    return () => {
      clearTimers()
    }
  }, [open, onComplete])

  // Don't render if not open
  if (!open) return null

  return (
    <>
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="w-[500px] bg-card border border-border rounded-xl shadow-2xl p-8 flex flex-col gap-6 relative overflow-hidden">
        
        {/* Animated Background Glow */}
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary to-transparent animate-pulse" />
        
        {/* Icon Header */}
        <div className="flex justify-center">
          <div className="relative">
            <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full animate-pulse" />
            <div className="relative bg-background border border-border p-4 rounded-full">
              <Brain className={cn(
                "w-8 h-8 text-primary transition-all duration-500",
                stage === 'processing' && "animate-pulse"
              )} />
            </div>
            
            {/* Orbiting Icons */}
            <div className="absolute -inset-1 animate-spin-slow [animation-duration:3s]">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2">
                <Globe className="w-4 h-4 text-muted-foreground/50" />
              </div>
            </div>
            <div className="absolute -inset-1 animate-spin-slow [animation-duration:4s] [animation-direction:reverse]">
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2">
                <Database className="w-4 h-4 text-muted-foreground/50" />
              </div>
            </div>
          </div>
        </div>

        {/* Status Text */}
        <div className="text-center space-y-2">
          <h3 className="text-lg font-semibold tracking-tight">
            AGRS ZEUS Agent
          </h3>
          <div className="h-6 flex items-center justify-center overflow-hidden">
            <p className="text-sm text-muted-foreground animate-in fade-in slide-in-from-bottom-2 duration-300 key-[messageIndex]">
              {LOADING_MESSAGES[messageIndex]}
            </p>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-muted-foreground px-1">
            <span>Analysis</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="h-2 bg-secondary rounded-full overflow-hidden">
            <div 
              className="h-full bg-primary transition-all duration-200 ease-linear"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Terminal-like Log (Decoration) */}
        <div className="mt-2 p-3 bg-muted/30 rounded-lg border border-border/50 font-mono text-[10px] text-muted-foreground/70 h-24 flex flex-col justify-end">
          <div
            className="space-y-1 overflow-y-auto pr-2 zeus-log-scroll"
          >
            {logLines.map((line, index) => {
              const isActive = index === logLines.length - 1
              const opacity = isActive ? 1 : Math.min(0.85, 0.45 + index * 0.08)
              return (
                <div
                  key={`${line}-${index}`}
                  className={cn(
                    'transition-opacity duration-300',
                    isActive ? 'text-primary/80' : 'text-muted-foreground/70'
                  )}
                  style={{ opacity }}
                >
                  {line}
                </div>
              )
            })}
          </div>
        </div>

      </div>
    </div>
      <style jsx>{`
        .zeus-log-scroll {
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        .zeus-log-scroll::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </>
  )
}

