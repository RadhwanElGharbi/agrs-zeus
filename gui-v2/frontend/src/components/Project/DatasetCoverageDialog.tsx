'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Globe, Layers, ExternalLink } from 'lucide-react'

import { useProject } from '@/lib/context/ProjectContext'
import {
  DatasetCoverageEntry,
  DatasetCoverageResponse,
  fetchDatasetCoverage
} from '@/lib/api/dataClient'
import { MarkdownRenderer } from '@/components/shared/MarkdownRenderer'
import { Button } from '@/components/ui/button'

type DatasetCoverageDialogProps = {
  open: boolean
  onClose: () => void
}

type FetchState = 'idle' | 'loading' | 'ready' | 'error'

export function DatasetCoverageDialog({ open, onClose }: DatasetCoverageDialogProps) {
  const { currentProject } = useProject()
  const cacheRef = useRef<Record<string, DatasetCoverageResponse>>({})
  const [status, setStatus] = useState<FetchState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<DatasetCoverageResponse | null>(null)

  useEffect(() => {
    if (!open) return

    if (!currentProject) {
      setError('Select or load a project to inspect dataset coverage.')
      setStatus('error')
      setData(null)
      return
    }

    const cached = cacheRef.current[currentProject]
    if (cached) {
      setData(cached)
      setStatus('ready')
      setError(null)
      return
    }

    let cancelled = false
    setStatus('loading')
    setError(null)

    fetchDatasetCoverage(currentProject)
      .then((resp) => {
        if (cancelled) return
        cacheRef.current[currentProject] = resp
        setData(resp)
        setStatus('ready')
      })
      .catch((err) => {
        if (cancelled) return
        setError(err?.message || 'Failed to load coverage catalog.')
        setStatus('error')
        setData(null)
      })

    return () => {
      cancelled = true
    }
  }, [currentProject, open])

  const localEntries = useMemo(() => {
    return (data?.entries || []).filter(entry => !entry.applies_globally)
  }, [data])

  const globalEntries = useMemo(() => {
    return (data?.entries || []).filter(entry => entry.applies_globally)
  }, [data])

  if (!open) return null

  const showLoader = status === 'loading'
  const showError = status === 'error' && error

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-10 w-[900px] max-w-[95vw] max-h-[90vh] bg-background border border-border rounded-2xl shadow-2xl flex flex-col">
        <header className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div>
            <div className="text-xs uppercase text-muted-foreground tracking-wide">Automatic Data Coverage</div>
            <div className="flex items-center gap-2 text-lg font-semibold">
              <Layers className="w-5 h-5 text-primary" />
              {currentProject ? `${currentProject} · Datasets` : 'Datasets'}
            </div>
            {data?.country && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                <Globe className="w-3 h-3" />
                AOI location inferred as <span className="font-medium text-foreground">{data.country}</span> ({data.iso3})
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {data?.protocol_reference && (
              <div className="text-[11px] text-muted-foreground text-right">
                Fetch workflow: <span className="font-mono text-foreground">{data.protocol_reference}</span>
              </div>
            )}
            <Button variant="ghost" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4 text-sm">
          {showLoader && (
            <div className="flex items-center justify-center gap-3 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading coverage catalog…
            </div>
          )}

          {showError && (
            <div className="border border-destructive/50 bg-destructive/10 text-destructive rounded-lg px-4 py-3 text-sm">
              {error}
            </div>
          )}

          {!showLoader && !showError && (
            <>
              {data?.summary && (
                <div className="border border-border rounded-lg p-4 bg-muted/30 text-xs leading-relaxed max-h-[600px] overflow-y-auto">
                  <MarkdownRenderer content={data.summary} />
                </div>
              )}

              <CoverageSection
                title="AOI-aligned datasets"
                subtitle="Country or regional sources prioritized for the current project boundaries."
                entries={localEntries}
              />

              <CoverageSection
                title="Global baseline datasets"
                subtitle="High-quality global products that always cover the AOI."
                entries={globalEntries}
              />

              <div className="text-[11px] text-muted-foreground border-t border-border pt-3">
                Coverage references collected from <code className="font-mono">/opt/agrs/docs/Perplexity</code>. Review the dataset fetching protocol before downloading any source data.
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function CoverageSection({ title, subtitle, entries }: { title: string; subtitle: string; entries: DatasetCoverageEntry[] }) {
  return (
    <section className="space-y-2">
      <div>
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-[11px] text-muted-foreground">{subtitle}</div>
      </div>
      {entries.length === 0 ? (
        <div className="border border-dashed border-border rounded-lg px-4 py-3 text-xs text-muted-foreground">
          No catalogued datasets were found for this category.
        </div>
      ) : (
        <div className="overflow-auto border border-border rounded-xl">
          <table className="w-full text-xs">
            <thead className="bg-muted/60 text-muted-foreground">
              <tr>
                <th className="text-left font-semibold px-3 py-2">Dataset</th>
                <th className="text-left font-semibold px-3 py-2">Type</th>
                <th className="text-left font-semibold px-3 py-2">Access</th>
                <th className="text-left font-semibold px-3 py-2">Coverage</th>
                <th className="text-left font-semibold px-3 py-2">Cadence</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={`${entry.dataset}-${entry.source}`} className="odd:bg-background even:bg-muted/20 border-t border-border/60">
                  <td className="px-3 py-2 align-top">
                    <div className="font-medium text-foreground">{entry.dataset}</div>
                    {entry.source && (
                      <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                        <ExternalLink className="w-3 h-3" />
                        {entry.source}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top">{entry.data_type || '—'}</td>
                  <td className="px-3 py-2 align-top">{entry.access || '—'}</td>
                  <td className="px-3 py-2 align-top">{entry.coverage || 'Available'}</td>
                  <td className="px-3 py-2 align-top">
                    {entry.frequency || '—'}
                    {(entry.temporal_start || entry.temporal_end) && (
                      <div className="text-[11px] text-muted-foreground">
                        {entry.temporal_start || '?'} → {entry.temporal_end || 'present'}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

