'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, PauseOctagon, X, Terminal, Activity, Check, Loader2, Cpu } from 'lucide-react'
import {
  DatasetFetchJob,
  DatasetStageState,
  subscribeToDatasetJob,
  cancelDatasetJob
} from '@/lib/api/dataClient'
import { cn } from '@/lib/utils'

const STAGE_LABELS: Record<string, string> = {
  prefetch_scan: 'INITIAL SCAN',
  fetch: 'DATA TRANSFER',
  zeus_ai: 'AI AGENT OPS',
  raw_metadata: 'METADATA EXTRACT',
  validation: 'INTEGRITY CHECK',
  process: 'GEOPROCESSING',
  processed_metadata: 'INDEXING',
  layer_publish: 'MAP PUBLISH'
}

const STAGE_ORDER = [
  'prefetch_scan',
  'fetch',
  'zeus_ai',
  'raw_metadata',
  'validation',
  'process',
  'processed_metadata',
  'layer_publish'
]

interface DatasetFetchProgressDialogProps {
  jobId: string | null
  open: boolean
  onClose: () => void
  onJobFinished?: (job: DatasetFetchJob) => void
}

export function DatasetFetchProgressDialog({ jobId, open, onClose, onJobFinished }: DatasetFetchProgressDialogProps) {
  const [job, setJob] = useState<DatasetFetchJob | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isCancelling, setIsCancelling] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [isClosing, setIsClosing] = useState(false)
  const completionHandled = useRef(false)

  const isComplete = job?.status === 'succeeded' || job?.status === 'failed'

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (open) setIsClosing(false)
  }, [open])

  useEffect(() => {
    completionHandled.current = false
  }, [jobId])

  useEffect(() => {
    if (!jobId || !open) {
      setJob(null)
      setError(null)
      return
    }

    const unsubscribe = subscribeToDatasetJob(
      jobId,
      (payload) => {
        setJob(payload)
        if (!completionHandled.current && (payload.status === 'succeeded' || payload.status === 'failed')) {
          completionHandled.current = true
          onJobFinished?.(payload)
        }
      },
      (err) => setError(err?.message || 'Lost connection to dataset job stream.')
    )

    return () => unsubscribe()
  }, [jobId, open, onJobFinished])

  const handleCancel = useCallback(() => {
    if (!jobId) return
    setIsCancelling(true)
    cancelDatasetJob(jobId)
      .catch((err) => setError(err?.message || 'Failed to cancel dataset job.'))
      .finally(() => setIsCancelling(false))
  }, [jobId])

  const handleClose = () => {
    if (isComplete) {
      setIsClosing(true)
      setTimeout(onClose, 150)
    }
  }

  const sortedCategories = useMemo(() => {
    if (!job) return []
    return Object.entries(job.categories || {}).sort(([a], [b]) => a.localeCompare(b))
  }, [job])

  const stageState = useCallback(
    (stage?: DatasetStageState): DatasetStageState => ({
      status: stage?.status ?? 'queued',
      message: stage?.message,
      started_at: stage?.started_at,
      completed_at: stage?.completed_at
    }),
    []
  )

  if (!open || !jobId || !mounted) return null

  return createPortal(
    <>
      <div className={cn(
        "fixed inset-0 bg-black/80 backdrop-blur-md z-[100]",
        isClosing ? "animate-fade-out" : "animate-fade-in"
      )} />
      
      <div className="fixed inset-0 z-[101] flex items-center justify-center p-4">
        <div className={cn(
          "relative w-[900px] max-w-[95vw] max-h-[90vh] bg-[#0a0a0a]/95 border border-white/10 rounded-sm shadow-[0_0_60px_-15px_rgba(0,0,0,0.9)] flex flex-col overflow-hidden font-mono",
          isClosing ? "animate-fade-out" : "animate-fade-in"
        )}>
          
          {/* Header */}
          <header className="px-6 py-5 border-b border-white/10 bg-black/40 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 text-[10px] text-white/40 uppercase tracking-[0.2em]">
                <Activity className="w-3 h-3" />
                <span>Operation Monitor</span>
              </div>
              <div className="flex items-center gap-3 mt-1">
                <h2 className="text-lg font-bold text-white uppercase tracking-wide">
                  {job?.project ?? 'Job Initializing...'}
                </h2>
                <span className="px-2 py-0.5 bg-white/5 border border-white/10 rounded-sm text-[9px] text-white/50">
                  ID: {jobId}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <div className={cn("w-1.5 h-1.5 rounded-full", isComplete ? (job?.status === 'succeeded' ? "bg-emerald-500" : "bg-red-500") : "bg-primary animate-pulse")} />
                <span className={cn("text-xs font-bold uppercase", isComplete ? (job?.status === 'succeeded' ? "text-emerald-500" : "text-red-500") : "text-primary")}>
                    STATUS: {job?.status ?? 'PENDING'}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {!isComplete && (
                  <button
                    onClick={handleCancel}
                    disabled={isCancelling}
                    className="px-4 py-2 border border-red-500/30 text-red-500/80 hover:bg-red-500/10 hover:text-red-500 rounded-sm text-[10px] uppercase font-bold tracking-wider transition-all flex items-center gap-2"
                  >
                    <PauseOctagon className="w-3 h-3" />
                    {isCancelling ? 'ABORTING...' : 'ABORT JOB'}
                  </button>
              )}
              <button
                onClick={handleClose}
                disabled={!isComplete}
                className={cn(
                    "p-2 border border-transparent rounded-sm transition-all",
                    isComplete ? "hover:bg-white/10 hover:border-white/20 text-white/70 hover:text-white" : "opacity-30 cursor-not-allowed text-white/30"
                )}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6 bg-[linear-gradient(to_right,#ffffff02_1px,transparent_1px),linear-gradient(to_bottom,#ffffff02_1px,transparent_1px)] bg-[size:20px_20px]">
            {error && (
              <div className="border border-red-500/30 bg-red-500/10 text-red-400 rounded-sm p-4 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 mt-0.5 flex-shrink-0" />
                <span className="text-xs">{error}</span>
              </div>
            )}

            {/* Global Progress */}
            <section className="p-5 bg-white/[0.02] border border-white/10 rounded-sm space-y-3">
              <div className="flex items-end justify-between text-xs uppercase tracking-wider text-white/60">
                <span>Total Completion</span>
                <span className="font-bold text-white text-sm">{Math.round((job?.progress ?? 0) * 100)}%</span>
              </div>
              <div className="h-1 bg-white/10 w-full overflow-hidden">
                <div className="h-full bg-primary shadow-[0_0_10px_rgba(var(--primary),0.8)] transition-all duration-300" style={{ width: `${Math.round((job?.progress ?? 0) * 100)}%` }} />
              </div>
              <div className="flex justify-between text-[10px] text-white/30 uppercase tracking-widest">
                <span>Active Task: {job?.current_category || 'Evaluating...'}</span>
                <span>Time Elapsed: --:--</span>
              </div>
            </section>

            {/* Category Breakdown */}
            <section className="space-y-4">
              {sortedCategories.map(([category, state]) => (
                <div key={category} className="border border-white/10 bg-black/40 rounded-sm overflow-hidden">
                  <div className="px-4 py-3 border-b border-white/5 bg-white/[0.02] flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className={cn("w-1 h-4", badgeColor(state.status))} />
                        <div>
                            <div className="text-xs font-bold text-white uppercase tracking-wider">{category}</div>
                            {state.layer?.label && <div className="text-[10px] text-white/40">{state.layer.label}</div>}
                        </div>
                    </div>
                    <div className={cn("text-[9px] px-2 py-0.5 border rounded-sm uppercase font-bold", badgeBorder(state.status))}>
                        {state.status || 'QUEUED'}
                    </div>
                  </div>
                  
                  <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {STAGE_ORDER.map((stage) => {
                      const snapshot = stageState(state.stages?.[stage])
                      const status = snapshot.status
                      
                      return (
                        <div
                          key={`${category}-${stage}`}
                          className={cn(
                            'border px-3 py-2 text-[10px] flex flex-col gap-1 transition-colors',
                            stageClass(status)
                          )}
                        >
                          <span className="uppercase tracking-wider opacity-70">{STAGE_LABELS[stage] || stage}</span>
                          <div className="flex items-center gap-1.5">
                             {status === 'running' && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
                             {status === 'succeeded' && <Check className="w-2.5 h-2.5" />}
                             {status === 'failed' && <X className="w-2.5 h-2.5" />}
                             <span className="font-bold uppercase">{status}</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  
                  {state.stages?.zeus_ai?.status === 'failed' && (
                    <div className="px-4 py-2 border-t border-white/10 bg-red-500/5 text-red-400 text-[10px] flex items-center gap-2">
                      <Terminal className="w-3 h-3" />
                      <span>AGENT FAILURE: {state.stages.zeus_ai.message}</span>
                    </div>
                  )}
                </div>
              ))}
            </section>

            {/* System Logs */}
            <section className="space-y-2">
              <div className="flex items-center gap-2 text-[10px] text-white/40 uppercase tracking-[0.2em]">
                <Terminal className="w-3 h-3" />
                <span>System Output Stream</span>
              </div>
              <div className="border border-white/10 bg-black rounded-sm p-4 h-48 overflow-y-auto font-mono text-[10px] leading-relaxed custom-scrollbar">
                <div className="space-y-1">
                    {(job?.logs || []).slice(-50).map((line, idx) => (
                        <div key={`${line}-${idx}`} className="flex gap-2">
                            <span className="text-white/20 select-none">{'>'}</span>
                            <span className={cn(
                                line.toLowerCase().includes('error') || line.toLowerCase().includes('fail') ? "text-red-400" : 
                                line.toLowerCase().includes('success') || line.toLowerCase().includes('done') ? "text-emerald-400" : 
                                "text-white/70"
                            )}>
                                {line}
                            </span>
                        </div>
                    ))}
                    {(!job?.logs || job.logs.length === 0) && <div className="text-white/20 italic">Waiting for stream...</div>}
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </>,
    document.body
  )
}

function badgeColor(status?: string | null) {
  switch (status) {
    case 'succeeded': return 'bg-emerald-500'
    case 'failed': return 'bg-red-500'
    case 'running': return 'bg-primary animate-pulse'
    default: return 'bg-white/20'
  }
}

function badgeBorder(status?: string | null) {
  switch (status) {
    case 'succeeded': return 'border-emerald-500/50 text-emerald-500 bg-emerald-500/10'
    case 'failed': return 'border-red-500/50 text-red-500 bg-red-500/10'
    case 'running': return 'border-primary/50 text-primary bg-primary/10'
    default: return 'border-white/10 text-white/30 bg-white/5'
  }
}

function stageClass(status: string) {
  switch (status) {
    case 'succeeded':
      return 'border-emerald-500/20 bg-emerald-500/[0.05] text-emerald-400'
    case 'failed':
      return 'border-red-500/20 bg-red-500/[0.05] text-red-400'
    case 'running':
      return 'border-primary/30 bg-primary/[0.05] text-primary shadow-[inset_0_0_10px_rgba(var(--primary),0.1)]'
    case 'skipped':
        return 'border-white/5 bg-white/[0.01] text-white/20 dashed-border'
    default:
      return 'border-white/5 bg-transparent text-white/30'
  }
}
