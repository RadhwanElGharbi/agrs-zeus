'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, CheckCircle2, Circle, Database, Map, Layers, FileText, Globe, Cpu } from 'lucide-react'
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
    id: 'metadata',
    label: 'Loading Project Metadata',
    description: 'Reading project configuration and specifications',
    icon: FileText,
    estimatedDuration: 1500
  },
  {
    id: 'crs',
    label: 'Validating Coordinate System',
    description: 'Verifying CRS and projection parameters',
    icon: Globe,
    estimatedDuration: 1000
  },
  {
    id: 'datasets',
    label: 'Scanning Datasets',
    description: 'Enumerating raster and vector data sources',
    icon: Database,
    estimatedDuration: 2500
  },
  {
    id: 'vectors',
    label: 'Loading Vector Layers',
    description: 'Processing GeoJSON features and geometries',
    icon: Layers,
    estimatedDuration: 3000
  },
  {
    id: 'tiles',
    label: 'Preparing Tile Services',
    description: 'Initializing raster tile endpoints',
    icon: Map,
    estimatedDuration: 2000
  },
  {
    id: 'finalize',
    label: 'Finalizing Project',
    description: 'Building spatial indexes and caching',
    icon: Cpu,
    estimatedDuration: 2000
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
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/95 backdrop-blur-md">
      {/* Background grid effect */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff03_1px,transparent_1px),linear-gradient(to_bottom,#ffffff03_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none opacity-30" />

      <div className="relative w-full max-w-2xl mx-auto px-6">
        {/* Logo and Title */}
        <div className="flex flex-col items-center mb-12">
          <div className="relative h-20 w-64 mb-6">
            <Image
              src="/logo.png"
              alt="Artemis Global Research"
              fill
              className="object-contain"
              priority
            />
          </div>
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold text-white tracking-tight">Loading Project</h2>
            <p className="text-sm text-white/60 font-mono">{projectName}</p>
          </div>
        </div>

        {/* Overall Progress Bar */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs font-mono text-white/50 uppercase tracking-widest">Overall Progress</span>
            <span className="text-xs font-mono text-primary">{Math.round(overallProgress)}%</span>
          </div>
          <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-primary via-blue-400 to-primary bg-[length:200%_100%] animate-shimmer transition-all duration-300 ease-out"
              style={{ width: `${overallProgress}%` }}
            />
          </div>
        </div>

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
                  "relative p-4 rounded-lg border transition-all duration-500",
                  isCompleted && "bg-emerald-500/10 border-emerald-500/30",
                  isCurrent && "bg-primary/10 border-primary/50 shadow-[0_0_20px_rgba(var(--primary),0.3)]",
                  isPending && "bg-white/5 border-white/10"
                )}
              >
                <div className="flex items-center gap-4">
                  {/* Status Icon */}
                  <div
                    className={cn(
                      "flex-shrink-0 w-10 h-10 rounded-md flex items-center justify-center transition-all duration-300",
                      isCompleted && "bg-emerald-500/20 text-emerald-500",
                      isCurrent && "bg-primary/20 text-primary",
                      isPending && "bg-white/5 text-white/30"
                    )}
                  >
                    {isCompleted ? (
                      <CheckCircle2 className="w-5 h-5" />
                    ) : isCurrent ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Circle className="w-5 h-5" />
                    )}
                  </div>

                  {/* Stage Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Icon
                        className={cn(
                          "w-4 h-4",
                          isCompleted && "text-emerald-500",
                          isCurrent && "text-primary",
                          isPending && "text-white/30"
                        )}
                      />
                      <h3
                        className={cn(
                          "text-sm font-semibold transition-colors",
                          isCompleted && "text-emerald-500",
                          isCurrent && "text-white",
                          isPending && "text-white/40"
                        )}
                      >
                        {stage.label}
                      </h3>
                    </div>
                    <p
                      className={cn(
                        "text-xs font-mono transition-colors",
                        isCompleted && "text-emerald-500/60",
                        isCurrent && "text-white/60",
                        isPending && "text-white/30"
                      )}
                    >
                      {stage.description}
                    </p>

                    {/* Progress bar for current stage */}
                    {isCurrent && (
                      <div className="mt-3 h-1 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary transition-all duration-300 ease-out"
                          style={{ width: `${stageProgress}%` }}
                        />
                      </div>
                    )}
                  </div>

                  {/* Stage number */}
                  <div
                    className={cn(
                      "flex-shrink-0 w-8 h-8 rounded-md flex items-center justify-center font-mono text-xs font-bold transition-colors",
                      isCompleted && "bg-emerald-500/20 text-emerald-500",
                      isCurrent && "bg-primary/20 text-primary",
                      isPending && "bg-white/5 text-white/30"
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
        <div className="mt-8 text-center">
          <p className="text-xs text-white/40 font-mono">
            Initializing geospatial engine and data pipelines...
          </p>
        </div>
      </div>
    </div>,
    document.body
  )
}
