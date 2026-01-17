'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, CheckCircle2, Circle, Database, Map, Layers, FileText, MapPin, Cpu } from 'lucide-react'
import { cn } from '@/lib/utils'
import Image from 'next/image'

interface LoadingStage {
  id: string
  label: string
  description: string
  icon: any
  estimatedDuration: number // in milliseconds
}

const LOADING_STAGES: LoadingStage[] = [
  {
    id: 'profile',
    label: 'Loading Project Profile',
    description: 'Fetching AOI, CRS, and project configuration',
    icon: FileText,
    estimatedDuration: 1200
  },
  {
    id: 'inventory',
    label: 'Loading Dataset Inventory',
    description: 'Reading raster + vector layer index',
    icon: Database,
    estimatedDuration: 1400
  },
  {
    id: 'rasters',
    label: 'Registering Raster Sources',
    description: 'Wiring tile endpoints for raster layers',
    icon: Map,
    estimatedDuration: 1200
  },
  {
    id: 'vectors',
    label: 'Loading Vector Layers',
    description: 'Fetching GeoJSON and building vector overlays',
    icon: Layers,
    estimatedDuration: 3000
  },
  {
    id: 'annotations',
    label: 'Loading AOI Markers & Annotations',
    description: 'Hydrating start/end points and Operator annotations',
    icon: MapPin,
    estimatedDuration: 1600
  },
  {
    id: 'finalize',
    label: 'Finalizing Map View',
    description: 'Ordering layers, fitting to AOI, and enabling tools',
    icon: Cpu,
    estimatedDuration: 1600
  }
]

interface ProjectLoadingDialogProps {
  open: boolean
  projectName: string
  onComplete: () => void
}

export function ProjectLoadingDialog({ open, projectName, onComplete }: ProjectLoadingDialogProps) {
  const [mounted, setMounted] = useState(false)
  const [currentStageIndex, setCurrentStageIndex] = useState(0)
  const [stageProgress, setStageProgress] = useState(0)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!open) {
      // Reset state when dialog closes
      setCurrentStageIndex(0)
      setStageProgress(0)
      return
    }

    // Progress through stages
    const currentStage = LOADING_STAGES[currentStageIndex]
    if (!currentStage) {
      // All stages complete
      setTimeout(() => {
        onComplete()
      }, 500)
      return
    }

    // Smooth progress animation for current stage
    const progressInterval = setInterval(() => {
      setStageProgress(prev => {
        if (prev >= 100) {
          return 100
        }
        // Progress speed based on stage duration
        const increment = (100 / currentStage.estimatedDuration) * 50
        return Math.min(prev + increment, 100)
      })
    }, 50)

    // Move to next stage when current completes
    const stageTimeout = setTimeout(() => {
      setStageProgress(0)
      setCurrentStageIndex(prev => prev + 1)
    }, currentStage.estimatedDuration)

    return () => {
      clearInterval(progressInterval)
      clearTimeout(stageTimeout)
    }
  }, [open, currentStageIndex, onComplete])

  if (!mounted || !open) return null

  const totalDuration = LOADING_STAGES.reduce((sum, stage) => sum + stage.estimatedDuration, 0)
  const elapsedDuration = LOADING_STAGES.slice(0, currentStageIndex).reduce((sum, stage) => sum + stage.estimatedDuration, 0)
  const overallProgress = ((elapsedDuration + (stageProgress / 100) * LOADING_STAGES[currentStageIndex]?.estimatedDuration) / totalDuration) * 100

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-xl p-6">
      {/* Ambient background */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(var(--primary),0.12),transparent_65%)]" />

      {/* Background grid effect */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff03_1px,transparent_1px),linear-gradient(to_bottom,#ffffff03_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none opacity-25" />

      {/* Vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_20%,rgba(0,0,0,0.9)_100%)] pointer-events-none" />

      <div className="relative w-full max-w-3xl bg-[#0a0a0a]/95 border border-white/10 rounded-sm shadow-[0_0_80px_rgba(0,0,0,0.85)] overflow-hidden">
        {/* Decorative top line */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-primary/50 to-transparent" />

        {/* Panel grid */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff02_1px,transparent_1px),linear-gradient(to_bottom,#ffffff02_1px,transparent_1px)] bg-[size:20px_20px] pointer-events-none opacity-35" />

        <div className="relative z-10 p-8">
          {/* Header */}
          <header className="flex items-center justify-between gap-6 mb-6">
            <div className="flex items-center gap-4 min-w-0">
              <div className="relative h-12 w-12 shrink-0">
                <Image
                  src="/logo_torch.png"
                  alt="Artemis"
                  fill
                  className="object-contain drop-shadow-[0_0_10px_rgba(255,255,255,0.15)]"
                  priority
                />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[10px] text-white/40 uppercase tracking-[0.2em] font-mono">
                  <span className="w-1.5 h-1.5 bg-primary rounded-full animate-ping" />
                  <span>Project Initialization</span>
                </div>
                <div className="flex items-baseline gap-3 mt-1 min-w-0">
                  <h2 className="text-xl font-bold text-white uppercase tracking-wide font-mono whitespace-nowrap">
                    Loading Project
                  </h2>
                  <p className="text-[11px] text-white/60 font-mono truncate">
                    {projectName}
                  </p>
                </div>
              </div>
            </div>

            <div className="text-right">
              <div className="text-[10px] font-mono text-white/40 uppercase tracking-widest">Overall</div>
              <div className="text-2xl font-bold text-primary font-mono">{Math.round(overallProgress)}%</div>
            </div>
          </header>

          {/* Overall Progress */}
          <section className="p-5 bg-white/[0.02] border border-white/10 rounded-sm space-y-3 mb-6">
            <div className="flex items-end justify-between text-xs uppercase tracking-wider text-white/60 font-mono">
              <span>Overall Progress</span>
              <span className="font-bold text-primary">{Math.round(overallProgress)}%</span>
            </div>
            <div className="h-1 bg-white/10 w-full overflow-hidden">
              <div
                className="h-full bg-primary shadow-[0_0_10px_rgba(var(--primary),0.7)] transition-all duration-300 ease-out"
                style={{ width: `${overallProgress}%` }}
              />
            </div>
          </section>

          {/* Loading Stages */}
          <div className="space-y-3">
            {LOADING_STAGES.map((stage, index) => {
              const isCompleted = index < currentStageIndex
              const isCurrent = index === currentStageIndex
              const isPending = index > currentStageIndex
              const Icon = stage.icon

              return (
                <div
                  key={stage.id}
                  className={cn(
                    "relative p-4 border transition-all duration-300 bg-black/40",
                    "rounded-sm",
                    isCompleted && "border-emerald-500/20 bg-emerald-500/[0.03]",
                    isCurrent && "border-primary/40 bg-primary/[0.03] shadow-[0_0_25px_rgba(var(--primary),0.18)]",
                    isPending && "border-white/10 bg-white/[0.02]"
                  )}
                >
                  <div className="flex items-center gap-4">
                    {/* Status Icon */}
                    <div
                      className={cn(
                        "flex-shrink-0 w-9 h-9 rounded-sm border flex items-center justify-center transition-all duration-300",
                        isCompleted && "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
                        isCurrent && "border-primary/30 bg-primary/10 text-primary",
                        isPending && "border-white/10 bg-black/30 text-white/20"
                      )}
                    >
                      {isCompleted ? (
                        <CheckCircle2 className="w-4 h-4" />
                      ) : isCurrent ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Circle className="w-4 h-4" />
                      )}
                    </div>

                    {/* Stage Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Icon
                          className={cn(
                            "w-4 h-4",
                            isCompleted && "text-emerald-400",
                            isCurrent && "text-primary",
                            isPending && "text-white/20"
                          )}
                        />
                        <h3
                          className={cn(
                            "text-xs font-bold uppercase tracking-wider transition-colors",
                            isCompleted && "text-emerald-400",
                            isCurrent && "text-white",
                            isPending && "text-white/50"
                          )}
                        >
                          {stage.label}
                        </h3>
                      </div>
                      <p
                        className={cn(
                          "text-[10px] font-mono uppercase tracking-wider transition-colors",
                          isCompleted && "text-emerald-500/60",
                          isCurrent && "text-white/50",
                          isPending && "text-white/25"
                        )}
                      >
                        {stage.description}
                      </p>

                      {/* Progress bar for current stage */}
                      {isCurrent && (
                        <div className="mt-3 h-1 bg-white/10 overflow-hidden">
                          <div
                            className="h-full bg-primary shadow-[0_0_8px_rgba(var(--primary),0.6)] transition-all duration-300 ease-out"
                            style={{ width: `${stageProgress}%` }}
                          />
                        </div>
                      )}
                    </div>

                    {/* Stage number */}
                    <div
                      className={cn(
                        "flex-shrink-0 w-8 h-8 rounded-sm border flex items-center justify-center font-mono text-[10px] font-bold transition-colors",
                        isCompleted && "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
                        isCurrent && "border-primary/30 bg-primary/10 text-primary",
                        isPending && "border-white/10 bg-black/30 text-white/20"
                      )}
                    >
                      {index + 1}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Footer */}
          <div className="mt-6 text-center">
            <p className="text-[10px] text-white/30 font-mono uppercase tracking-widest">
              Initializing map layers and project data buffers...
            </p>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
