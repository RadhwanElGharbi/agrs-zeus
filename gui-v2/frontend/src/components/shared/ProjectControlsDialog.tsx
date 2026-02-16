'use client'

import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ShieldCheck,
  X,
  Upload,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useProject } from '@/lib/context/ProjectContext'
import { useAuth } from '@/lib/context/AuthContext'
import {
  fetchProjectAudit,
  getProjectLocalCacheConfig,
  getApiBase,
  type AuditEventRow
} from '@/lib/api/dataClient'

type Tab = 'push' | 'changelog'

interface PushRequest {
  id: string
  user_email: string
  user_name: string
  file_count: number
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
  files: string[]
}

interface ProjectControlsDialogProps {
  open: boolean
  onClose: () => void
  localChangesDetected?: boolean
  driftDiscrepancy?: LocalCacheDiscrepancy | null
}

export function ProjectControlsDialog({ open, onClose, localChangesDetected, driftDiscrepancy }: ProjectControlsDialogProps) {
  const [mounted, setMounted] = useState(false)
  const [isClosing, setIsClosing] = useState(false)
  const [activeTab, setActiveTab] = useState<Tab>('push')
  const { currentProject } = useProject()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin'
  const hasProject = Boolean(currentProject)

  // Changelog state
  const [auditLoading, setAuditLoading] = useState(false)
  const [auditError, setAuditError] = useState<string | null>(null)
  const [auditEvents, setAuditEvents] = useState<AuditEventRow[]>([])

  // Push state
  const [pushRequests, setPushRequests] = useState<PushRequest[]>([])
  const [pushLoading, setPushLoading] = useState(false)
  const [pushError, setPushError] = useState<string | null>(null)
  const [pushBusy, setPushBusy] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  const handleClose = useCallback(() => {
    setIsClosing(true)
    setTimeout(() => { setIsClosing(false); onClose() }, 200)
  }, [onClose])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, handleClose])

  // Load changelog
  useEffect(() => {
    if (!open || activeTab !== 'changelog' || !currentProject) return
    let cancelled = false
    setAuditLoading(true)
    setAuditError(null)
    setAuditEvents([])
    fetchProjectAudit(currentProject, { limit: 200, offset: 0 })
      .then((resp) => { if (!cancelled) setAuditEvents(resp.events || []) })
      .catch((e) => { if (!cancelled) setAuditError(e instanceof Error ? e.message : 'Failed to load audit') })
      .finally(() => { if (!cancelled) setAuditLoading(false) })
    return () => { cancelled = true }
  }, [open, activeTab, currentProject])

  // Load push requests
  useEffect(() => {
    if (!open || activeTab !== 'push' || !currentProject || !isAdmin) return
    let cancelled = false
    setPushLoading(true)
    setPushError(null)

    const token = sessionStorage.getItem('agrs_token')
    const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {}
    const base = getApiBase()

    fetch(`${base}/projects/${encodeURIComponent(currentProject)}/data/push-requests`, { headers })
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status}`)
        const data = await res.json()
        if (!cancelled) setPushRequests(data.requests || [])
      })
      .catch((e) => { if (!cancelled) setPushError(e instanceof Error ? e.message : 'Failed to load push requests') })
      .finally(() => { if (!cancelled) setPushLoading(false) })
    return () => { cancelled = true }
  }, [open, activeTab, currentProject, isAdmin])

  const handlePushToServer = useCallback(async () => {
    if (!currentProject || !window.electron?.pushFilesToServer) return
    const config = getProjectLocalCacheConfig(currentProject)
    if (!config?.base_directory) return

    const extraPaths = driftDiscrepancy?.extra_paths || []
    if (extraPaths.length === 0) {
      setPushError('No local changes detected to push.')
      return
    }

    setPushBusy(true)
    setPushError(null)
    try {
      const token = sessionStorage.getItem('agrs_token')
      const result = await window.electron.pushFilesToServer({
        projectName: currentProject,
        baseDirectory: config.base_directory,
        filePaths: extraPaths,
        token
      })
      const failed = result.results.filter(r => r.status === 'error')
      if (failed.length > 0) {
        setPushError(`${failed.length} file(s) failed to push.`)
      }
    } catch (error) {
      setPushError(error instanceof Error ? error.message : 'Push failed.')
    } finally {
      setPushBusy(false)
    }
  }, [currentProject, driftDiscrepancy])

  const handleApproveReject = useCallback(async (requestId: string, action: 'approve' | 'reject') => {
    if (!currentProject) return
    const token = sessionStorage.getItem('agrs_token')
    const headers: HeadersInit = { 'Content-Type': 'application/json' }
    if (token) headers.Authorization = `Bearer ${token}`
    const base = getApiBase()

    try {
      const res = await fetch(
        `${base}/projects/${encodeURIComponent(currentProject)}/data/push-requests/${requestId}/${action}`,
        { method: 'POST', headers }
      )
      if (!res.ok) throw new Error(`${action} failed (${res.status})`)
      setPushRequests(prev => prev.map(r => r.id === requestId ? { ...r, status: action === 'approve' ? 'approved' : 'rejected' } : r))
    } catch (error) {
      setPushError(error instanceof Error ? error.message : `${action} failed`)
    }
  }, [currentProject])

  if (!mounted || !open) return null

  const hasLocalChanges = driftDiscrepancy && (driftDiscrepancy.extra_count > 0)
  const hasElectronPush = typeof window !== 'undefined' && typeof window.electron?.pushFilesToServer === 'function'

  return createPortal(
    <div className={cn('fixed inset-0 z-[140] flex items-center justify-center p-4 transition-opacity duration-200', isClosing ? 'opacity-0' : 'opacity-100')}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={handleClose} />
      <div className={cn('relative w-[980px] max-w-[96vw] max-h-[85vh] overflow-hidden rounded-sm border border-white/10 bg-[#0a0a0a]/95 shadow-[0_0_60px_rgba(0,0,0,0.8)] transition-all duration-200 flex flex-col', isClosing ? 'scale-95 opacity-0' : 'scale-100 opacity-100')}>
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff03_1px,transparent_1px),linear-gradient(to_bottom,#ffffff03_1px,transparent_1px)] bg-[size:20px_20px] pointer-events-none rounded-sm overflow-hidden" />

        {/* Header */}
        <div className="relative px-6 py-5 border-b border-white/10 bg-black/40 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-sm bg-primary/10 border border-primary/20"><ShieldCheck className="w-4 h-4 text-primary" /></div>
            <div>
              <div className="text-[10px] text-white/40 uppercase tracking-[0.2em] font-mono">Project</div>
              <div className="mt-0.5 text-lg font-semibold text-white tracking-wide">Project Controls</div>
            </div>
          </div>
          <button onClick={handleClose} className="p-2 rounded-sm text-white/40 hover:text-white hover:bg-white/5 border border-transparent hover:border-white/10 transition-all"><X className="w-4 h-4" /></button>
        </div>

        {/* Tabs */}
        <div className="relative flex border-b border-white/10 bg-black/20">
          {([
            { id: 'push' as Tab, label: 'Sync & Push', badge: hasLocalChanges ? '!' : undefined },
            { id: 'changelog' as Tab, label: 'Changelog' },
          ]).map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={cn('relative flex-1 px-4 py-3 text-xs font-mono uppercase tracking-wider transition-all', activeTab === tab.id ? 'text-white bg-white/5' : 'text-white/40 hover:text-white/70')}>
              {tab.label}
              {tab.badge && <span className="ml-2 px-1.5 py-0.5 text-[8px] bg-red-500/20 border border-red-500/30 text-red-400 rounded-sm">{tab.badge}</span>}
              {activeTab === tab.id && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="relative p-6 overflow-y-auto flex-1">
          {!hasProject && (
            <div className="p-3 rounded-sm bg-white/[0.02] border border-white/5 text-[10px] font-mono text-white/30">
              Select a project first.
            </div>
          )}

          {/* Push Tab */}
          {hasProject && activeTab === 'push' && (
            <div className="space-y-4">
              {/* Local changes summary */}
              {driftDiscrepancy && (
                <div className="p-4 rounded-sm border border-white/10 bg-black/30 space-y-2">
                  <div className="text-xs font-mono text-white/60 uppercase tracking-wider">Local vs Server Discrepancy</div>
                  <div className="flex items-center gap-2 text-[10px] font-mono text-white/40">
                    {driftDiscrepancy.in_sync
                      ? <><CheckCircle2 className="w-4 h-4 text-emerald-400" /><span>In sync</span></>
                      : <><AlertTriangle className="w-4 h-4 text-amber-400" /><span>Missing {driftDiscrepancy.missing_count} | Changed {driftDiscrepancy.changed_count} | Local-only {driftDiscrepancy.extra_count}</span></>
                    }
                  </div>
                </div>
              )}

              {/* Push button */}
              {hasLocalChanges && (
                <div className="flex gap-3">
                  <button onClick={() => { void handlePushToServer() }} disabled={!hasElectronPush || pushBusy} className={cn('flex-1 px-4 py-3 rounded-sm border text-xs font-mono uppercase tracking-wider transition-all flex items-center justify-center gap-2', isAdmin ? 'border-primary/40 text-primary hover:bg-primary/10' : 'border-amber-500/40 text-amber-300 hover:bg-amber-500/10', (!hasElectronPush || pushBusy) && 'opacity-50 pointer-events-none')}>
                    {pushBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    {isAdmin ? 'Push to Server' : 'Request Push'}
                  </button>
                </div>
              )}

              {!hasLocalChanges && !driftDiscrepancy && (
                <div className="p-3 rounded-sm border border-white/10 bg-black/30 text-[10px] font-mono text-white/40">
                  No discrepancy data available. Run a Check from Settings to detect differences.
                </div>
              )}

              {/* Admin: pending push requests */}
              {isAdmin && (
                <div className="space-y-2">
                  <div className="text-xs font-mono text-white/50 uppercase tracking-wider">Push Requests</div>
                  {pushLoading && <div className="text-[10px] text-white/40">Loading...</div>}
                  {pushError && <div className="text-[10px] text-red-300">{pushError}</div>}
                  {!pushLoading && pushRequests.length === 0 && (
                    <div className="text-[10px] text-white/30 font-mono">No pending push requests.</div>
                  )}
                  {pushRequests.map((req) => (
                    <div key={req.id} className="p-3 rounded-sm border border-white/10 bg-black/30 flex items-center justify-between">
                      <div>
                        <div className="text-xs text-white/80">{req.user_name || req.user_email}</div>
                        <div className="text-[10px] font-mono text-white/40">{req.file_count} files | {new Date(req.created_at).toLocaleString()}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        {req.status === 'pending' && (
                          <>
                            <button onClick={() => { void handleApproveReject(req.id, 'approve') }} className="px-2 py-1 rounded-sm border border-emerald-500/30 text-[10px] font-mono text-emerald-300 hover:bg-emerald-500/10 transition-all">
                              Approve
                            </button>
                            <button onClick={() => { void handleApproveReject(req.id, 'reject') }} className="px-2 py-1 rounded-sm border border-red-500/30 text-[10px] font-mono text-red-300 hover:bg-red-500/10 transition-all">
                              Reject
                            </button>
                          </>
                        )}
                        {req.status === 'approved' && <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />Approved</span>}
                        {req.status === 'rejected' && <span className="text-[10px] font-mono text-red-400 flex items-center gap-1"><XCircle className="w-3 h-3" />Rejected</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {pushError && (
                <div className="p-2.5 rounded-sm border border-red-500/20 bg-red-500/10 text-[10px] font-mono text-red-200">{pushError}</div>
              )}
            </div>
          )}

          {/* Changelog Tab */}
          {hasProject && activeTab === 'changelog' && (
            <div>
              {auditLoading && <div className="text-sm text-white/60">Loading...</div>}
              {auditError && <div className="text-sm text-red-300">{auditError}</div>}
              {!auditLoading && !auditError && (
                <div className="text-xs text-white/50 mb-3">Events: {auditEvents.length}</div>
              )}
              <div className="space-y-2">
                {auditEvents.slice(0, 200).map((e) => (
                  <div key={e.id} className="border border-white/10 rounded-sm bg-black/30 p-3">
                    <div className="text-[11px] text-white/85">
                      <span className="font-mono text-white/60">{e.ts || ''}</span> · <span className="font-semibold">{e.event_type}</span>
                    </div>
                    <div className="mt-1 text-[10px] text-white/50">
                      Actor: {(e.actor?.full_name || e.actor?.email || 'unknown') as string}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
