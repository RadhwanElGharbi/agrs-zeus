'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { fetchProjectAudit, type AuditEventRow } from '@/lib/api/dataClient'

export function ProjectAuditDialog({
  open,
  onClose,
  projectName
}: {
  open: boolean
  onClose: () => void
  projectName: string | null
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [events, setEvents] = useState<AuditEventRow[]>([])

  useEffect(() => {
    if (!open) return
    if (!projectName) {
      setEvents([])
      setError('Select a project first.')
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)
    setEvents([])

    fetchProjectAudit(projectName, { limit: 100, offset: 0 })
      .then((resp) => {
        if (cancelled) return
        setEvents(resp.events || [])
      })
      .catch((e) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Failed to load audit')
      })
      .finally(() => {
        if (cancelled) return
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [open, projectName])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-[980px] max-w-[96vw] max-h-[85vh] overflow-hidden rounded-sm border border-white/10 bg-[#0a0a0a]/95 shadow-[0_0_60px_rgba(0,0,0,0.8)]">
        <div className="px-6 py-5 border-b border-white/10 bg-black/40 flex items-center justify-between">
          <div>
            <div className="text-[10px] text-white/40 uppercase tracking-[0.2em]">Audit</div>
            <div className="mt-1 text-lg font-semibold text-white">{projectName || 'No project selected'}</div>
          </div>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>

        <div className="p-5 overflow-y-auto max-h-[calc(85vh-84px)] text-white/85">
          {loading && <div className="text-sm text-white/60">Loading…</div>}
          {error && <div className="text-sm text-red-300">{error}</div>}

          {!loading && !error && (
            <div className="text-xs text-white/50">Events: {events.length}</div>
          )}

          <div className="mt-4 space-y-2">
            {events.slice(0, 200).map((e) => (
              <div key={e.id} className="border border-white/10 rounded-sm bg-black/30 p-3">
                <div className="text-[11px] text-white/85">
                  <span className="font-mono text-white/60">{e.ts || ''}</span> ·{' '}
                  <span className="font-semibold">{e.event_type}</span>
                </div>
                <div className="mt-1 text-[10px] text-white/50">
                  Actor: {(e.actor?.full_name || e.actor?.email || 'unknown') as any}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}















