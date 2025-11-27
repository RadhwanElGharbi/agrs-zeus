'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, PauseOctagon, X } from 'lucide-react'
import {
  DatasetFetchJob,
  DatasetStageState,
  subscribeToDatasetJob,
  cancelDatasetJob
} from '@/lib/api/dataClient'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const STAGE_LABELS: Record<string, string> = {
  prefetch_scan: 'Prefetch scan',
  fetch: 'Download',
  zeus_ai: 'ZEUS AI assist',
  raw_metadata: 'Raw metadata',
  validation: 'Validation',
  process: 'Processing',
  processed_metadata: 'Processed metadata',
  layer_publish: 'Publish layer'
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
  const completionHandled = useRef(false)

  const isComplete = job?.status === 'succeeded' || job?.status === 'failed'

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
    if (isComplete) onClose()
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

  if (!open || !jobId) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" />
      <div className="relative z-10 w-[900px] max-w-[95vw] max-h-[90vh] bg-background border border-border rounded-2xl shadow-2xl flex flex-col">
        <header className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div>
            <div className="text-xs uppercase text-muted-foreground tracking-wide">Dataset fetch progress</div>
            <div className="flex items-center gap-2 text-lg font-semibold">
              {job?.project ?? 'Active job'}
              <span className="text-xs font-normal text-muted-foreground">· {jobId}</span>
            </div>
            <div className="text-xs text-muted-foreground mt-1 capitalize">Status: {job?.status ?? 'pending'}</div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleCancel} disabled={isCancelling || isComplete}>
              <PauseOctagon className="w-4 h-4 mr-1" />
              {isCancelling ? 'Cancelling…' : 'Cancel job'}
            </Button>
            <Button variant="ghost" size="icon" onClick={handleClose} disabled={!isComplete}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 text-sm">
          {error && (
            <div className="border border-destructive/40 bg-destructive/10 text-destructive rounded-lg px-4 py-3 text-sm flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <section className="rounded-xl border border-border p-4 bg-muted/10 space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Overall progress</span>
              <span>{Math.round((job?.progress ?? 0) * 100)}%</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${Math.round((job?.progress ?? 0) * 100)}%` }}
              />
            </div>
            <div className="text-xs text-muted-foreground">
              {job?.current_category
                ? `Running: ${job.current_category}`
                : isComplete
                  ? 'Completed'
                  : 'Initializing…'}
            </div>
          </section>

          <section className="space-y-3">
            {sortedCategories.map(([category, state]) => (
              <div key={category} className="border border-border rounded-xl p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold uppercase tracking-wide">{category}</div>
                    {state.layer?.label && <div className="text-xs text-muted-foreground">{state.layer.label}</div>}
                  </div>
                  <span className={cn('text-[11px] px-2 py-0.5 rounded-full capitalize', badgeClass(state.status))}>
                    {state.status || 'queued'}
                  </span>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {STAGE_ORDER.map((stage) => {
                    const snapshot = stageState(state.stages?.[stage])
                    return (
                      <div
                        key={`${category}-${stage}`}
                        className={cn(
                          'rounded-lg border px-3 py-2 text-xs flex items-center justify-between gap-2',
                          stageBorder(snapshot.status)
                        )}
                      >
                        <span className="font-medium">{STAGE_LABELS[stage] || stage}</span>
                        <span className="capitalize">{snapshot.status}</span>
                      </div>
                    )
                  })}
                </div>
                {state.stages?.zeus_ai?.status === 'failed' && (
                  <div className="text-xs text-destructive flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    {state.stages.zeus_ai.message}
                  </div>
                )}
              </div>
            ))}
          </section>

  endforeach?
'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, PauseOctagon, X } from 'lucide-react'
import {
  DatasetFetchJob,
  DatasetStageState,
  subscribeToDatasetJob,
  cancelDatasetJob
} from '@/lib/api/dataClient'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const STAGE_LABELS: Record<string, string> = {
  prefetch_scan: 'Prefetch scan',
  fetch: 'Download',
  zeus_ai: 'ZEUS AI assist',
  raw_metadata: 'Raw metadata',
  validation: 'Validation',
  process: 'Process',
  processed_metadata: 'Processed metadata',
  layer_publish: 'Publish layer'
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
  const completionHandled = useRef(false)

  const isComplete = job?.status === 'succeeded' || job?.status === 'failed'

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
      (err) => {
        setError(err?.message || 'Lost connection to dataset job stream.')
      }
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
    if (isComplete) onClose()
  }

  const sortedCategories = useMemo(() => {
    if (!job) return []
    return Object.entries(job.categories || {}).sort(([a], [b]) => a.localeCompare(b))
  }, [job])

  const stageState = useCallback((stage?: DatasetStageState): DatasetStageState => {
    return (
      stage ?? {
        status: 'queued',
        message: undefined,
        started_at: undefined,
        completed_at: undefined
      }
    )
  }, [])

  if (!open || !jobId) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" />
      <div className="relative z-10 w-[900px] max-w-[95vw] max-h-[90vh] bg-background border border-border rounded-2xl shadow-2xl flex flex-col">
        <header className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div>
            <div className="text-xs uppercase text-muted-foreground tracking-wide">Dataset fetch progress</div>
            <div className="flex items-center gap-2 text-lg font-semibold">
              {job?.project || 'Active job'}
              <span className="text-xs font-normal text-muted-foreground">· {jobId}</span>
            </div>
            <div className="text-xs text-muted-foreground capitalize mt-1">Status: {job?.status ?? 'pending'}</div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleCancel} disabled={isCancelling || isComplete}>
              <PauseOctagon className="w-4 h-4 mr-1" />
              {isCancelling ? 'Cancelling…' : 'Cancel job'}
            </Button>
            <Button variant="ghost" size="icon" onClick={handleClose} disabled={!isComplete}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 text-sm">
          {error && (
            <div className="border border-destructive/40 bg-destructive/10 text-destructive rounded-lg px-4 py-3 text-sm flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <section className="rounded-xl border border-border p-4 bg-muted/10 space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Overall progress</span>
              <span>{Math.round((job?.progress ?? 0) * 100)}%</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${Math.round((job?.progress ?? 0) * 100)}%` }}
              />
            </div>
            <div className="text-xs text-muted-foreground">
              {job?.current_category
                ? `Running: ${job.current_category}`
                : isComplete
                  ? 'Completed'
                  : 'Initializing…'}
            </div>
          </section>

          <section className="space-y-3">
            {sortedCategories.map(([category, state]) => (
              <div key={category} className="border border-border rounded-xl p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold uppercase tracking-wide">{category}</div>
                    {state.layer?.label && <div className="text-xs text-muted-foreground">{state.layer.label}</div>}
                  </div>
                  <span className={cn('text-[11px] px-2 py-0.5 rounded-full capitalize', statusBadge(state.status))}>
                    {state.status || 'queued'}
                  </span>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {STAGE_ORDER.map((stage) => {
                    const snapshot = stageState(state.stages?.[stage])
                    return (
                      <div
                        key={`${category}-${stage}`}
                        className={cn(
                          'rounded-lg border px-3 py-2 text-xs flex items-center justify-between gap-2',
                          stageBorder(snapshot.status)
                        )}
                      >
                        <span className="font-medium">{STAGE_LABELS[stage] || stage}</span>
                        <span className="capitalize">{snapshot.status}</span>
                      </div>
                    )
                  })}
                </div>
                {state.stages?.zeus_ai?.status === 'failed' && (
                  <div className="text-xs text-destructive flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    {state.stages.zeus_ai.message}
                  </div>
                )}
              </div>
            ))}
          </section>

          <section className="space-y-2">
            <div className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">Recent logs</div>
            <div className="border border-border rounded-lg bg-black/70 text-emerald-400 font-mono text-[11px] p-3 h-40 overflow-y-auto">
              {(job?.logs || []).slice(-20).map((line, idx) => (
                <div key={`${line}-${idx}`}>{line}</div>
              ))}
              {(!job?.logs || job.logs.length === 0) && <div className="text-muted-foreground">No logs yet</div>}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

function statusBadge(status?: string | null) {
  switch (status) {
    case 'succeeded':
      return 'bg-emerald-500/15 text-emerald-500 border-emerald-500/40'
    case 'failed':
      return 'bg-destructive/15 text-destructive border-destructive/40'
    case 'running':
      return 'bg-primary/15 text-primary border-primary/40'
    case 'skipped':
      return 'bg-muted/30 text-muted-foreground border-border/60'
    default:
      return 'bg-muted/30 text-muted-foreground border-border/60'
  }
}

function stageBorder(status: string) {
  switch (status) {
    case 'succeeded':
      return 'border-emerald-500/30 bg-emerald-500/5'
    case 'failed':
      return 'border-destructive/40 bg-destructive/10'
    case 'running':
      return 'border-primary/40 bg-primary/5'
    default:
      return 'border-border bg-muted/20'
  }
}
'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Loader2, PauseOctagon, X } from 'lucide-react'
import {
  DatasetFetchJob,
  DatasetStageState,
  subscribeToDatasetJob,
  cancelDatasetJob
} from '@/lib/api/dataClient'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const STAGE_LABELS: Record<string, string> = {
  prefetch_scan: 'Prefetch scan',
  fetch: 'Download',
  zeus_ai: 'ZEUS AI assist',
  raw_metadata: 'Raw metadata',
  validation: 'Validation',
  process: 'Reproject & clip',
  processed_metadata: 'Processed metadata',
  layer_publish: 'Publish layer'
}

const stageOrder = Object.keys(STAGE_LABELS)

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
  const completionNotified = useRef(false)

  const isComplete = job?.status === 'succeeded' || job?.status === 'failed'

  useEffect(() => {
    completionNotified.current = false
  }, [jobId])

  useEffect(() => {
    if (!jobId || !open) {
      setJob(null)
      setError(null)
      return
    }
    setJob(null)
    setError(null)

    const unsubscribe = subscribeToDatasetJob(
      jobId,
      (update) => {
        setJob(update)
        if (!completionNotified.current && (update.status === 'succeeded' || update.status === 'failed')) {
          completionNotified.current = true
          onJobFinished?.(update)
        }
      },
      (err) => {
        setError(err.message || 'Failed to subscribe to dataset job.')
      }
    )

    return () => {
      unsubscribe()
    }
  }, [jobId, open, onJobFinished])

  const handleCancel = useCallback(() => {
    if (!jobId) return
    setIsCancelling(true)
    cancelDatasetJob(jobId)
      .catch((err) => {
        setError(err?.message || 'Failed to cancel dataset job.')
      })
      .finally(() => setIsCancelling(false))
  }, [jobId])

  const handleClose = () => {
    if (!isComplete) return
    onClose()
  }

  const stageStatus = useCallback((stage: DatasetStageState | undefined): DatasetStageState => {
    return (
      stage ?? {
        status: 'queued',
        message: undefined,
        started_at: undefined,
        completed_at: undefined
      }
    )
  }, [])

  const sortedCategories = useMemo(() => {
    if (!job) return []
    return Object.entries(job.categories || {}).sort((a, b) => a[0].localeCompare(b[0]))
  }, [job])

  if (!open || !jobId) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" />
      <div className="relative z-10 w-[900px] max-w-[95vw] max-h-[90vh] bg-background border border-border rounded-2xl shadow-2xl flex flex-col">
        <header className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div>
            <div className="text-xs uppercase text-muted-foreground tracking-wide">Dataset fetch progress</div>
            <div className="flex items-center gap-2 text-lg font-semibold">
              {job?.project ?? 'Active job'}
              <span className="text-xs font-normal text-muted-foreground">· Job ID {jobId}</span>
            </div>
            <div className="text-xs text-muted-foreground mt-1 capitalize">
              Status: {job?.status ?? 'pending'}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleCancel} disabled={isCancelling || isComplete}>
              <PauseOctagon className="w-4 h-4 mr-1" />
              {isCancelling ? 'Cancelling…' : 'Cancel job'}
            </Button>
            <Button variant="ghost" size="icon" disabled={!isComplete} onClick={handleClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 text-sm">
          {error && (
            <div className="border border-destructive/40 bg-destructive/10 text-destructive rounded-lg px-4 py-3 text-sm flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <section className="rounded-xl border border-border p-4 bg-muted/10 space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Overall progress</span>
              <span>{Math.round((job?.progress ?? 0) * 100)}%</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${Math.round((job?.progress ?? 0) * 100)}%` }}
              />
            </div>
            <div className="text-xs text-muted-foreground">
              {job?.current_category ? `Running: ${job.current_category}` : job?.status === 'succeeded' ? 'Completed' : 'Waiting…'}
            </div>
          </section>

          <section className="space-y-3">
            {sortedCategories.map(([category, state]) => (
              <div key={category} className="border border-border rounded-xl p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-sm uppercase tracking-wide">{category}</div>
                    {state.layer?.label && (
                      <div className="text-xs text-muted-foreground">{state.layer.label}</div>
                    )}
                  </div>
                  <span className={cn('text-[11px] px-2 py-0.5 rounded-full capitalize', badgeClass(state.status || 'queued'))}>
                    {state.status || 'queued'}
                  </span>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {stageOrder.map((stage) => {
                    const stageState = stageStatus(state.stages?.[stage])
                    return (
                      <div
                        key={`${category}-${stage}`}
                        className={cn(
                          'rounded-lg border px-3 py-2 text-xs flex items-center justify-between gap-2',
                          stageBorder(stageState.status)
                        )}
                      >
                        <span className="font-medium">{STAGE_LABELS[stage] || stage}</span>
                        <span className="capitalize">{stageState.status}</span>
                      </div>
                    )
                  })}
                </div>
                {state.stages?.zeus_ai?.status === 'failed' && (
                  <div className="mt-2 text-xs text-destructive flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    {state.stages.zeus_ai.message}
                  </div>
                )}
              </div>
            ))}
          </section>

          <section className="space-y-2">
            <div className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">Recent logs</div>
            <div className="border border-border rounded-lg bg-black/70 text-emerald-400 font-mono text-[11px] p-3 h-40 overflow-y-auto">
              {(job?.logs || []).slice(-20).map((line, idx) => (
                <div key={`${line}-${idx}`}>{line}</div>
              ))}
              {(!job?.logs || job.logs.length === 0) && <div className="text-muted-foreground">No logs yet</div>}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

function badgeClass(status: string) {
  switch (status) {
    case 'succeeded':
      return 'bg-emerald-500/15 text-emerald-500 border-emerald-500/40'
    case 'failed':
      return 'bg-destructive/15 text-destructive border-destructive/40'
    case 'running':
      return 'bg-primary/15 text-primary border-primary/40'
    case 'skipped':
      return 'bg-muted/30 text-muted-foreground border-border/60'
    default:
      return 'bg-muted/30 text-muted-foreground border-border/60'
  }
}

function stageBorder(status: string) {
  switch (status) {
    case 'succeeded':
      return 'border-emerald-500/30 bg-emerald-500/5'
    case 'failed':
      return 'border-destructive/40 bg-destructive/10'
    case 'running':
      return 'border-primary/40 bg-primary/5'
    default:
      return 'border-border bg-muted/20'
  }
}

