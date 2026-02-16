'use client'

import { useCallback, useEffect, useState } from 'react'
import { Download, X, ArrowUpCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getApiBase } from '@/lib/api/dataClient'

interface DownloadLink {
  platform: string
  label: string
  url: string
  filename?: string
}

interface LatestVersion {
  version: string
  release_date?: string | null
  release_notes?: string | null
  downloads: DownloadLink[]
}

const DISMISSED_KEY = 'zeus_update_dismissed_version'
const CHECK_INTERVAL_MS = 5 * 60 * 1000
const CURRENT_VERSION = '2.2.0'

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const va = pa[i] ?? 0
    const vb = pb[i] ?? 0
    if (va > vb) return 1
    if (va < vb) return -1
  }
  return 0
}

export function UpdateNotificationBanner() {
  const [latestVersion, setLatestVersion] = useState<LatestVersion | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const checkForUpdate = useCallback(async () => {
    try {
      const base = getApiBase()
      const response = await fetch(`${base}/app/latest-version`)
      if (!response.ok) return
      const data: LatestVersion = await response.json()
      if (!data.version) return

      const dismissedVersion = localStorage.getItem(DISMISSED_KEY)
      if (dismissedVersion === data.version) {
        setDismissed(true)
        setLatestVersion(data)
        return
      }

      setLatestVersion(data)
      setDismissed(false)
    } catch {
      // Silent fail - update check is not critical
    }
  }, [])

  useEffect(() => {
    checkForUpdate()
    const interval = setInterval(checkForUpdate, CHECK_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [checkForUpdate])

  const handleDismiss = useCallback(() => {
    if (latestVersion) {
      localStorage.setItem(DISMISSED_KEY, latestVersion.version)
    }
    setDismissed(true)
  }, [latestVersion])

  if (!latestVersion) return null
  if (dismissed) return null
  if (compareVersions(latestVersion.version, CURRENT_VERSION) <= 0) return null

  const hasDownloads = latestVersion.downloads.length > 0

  return (
    <div className="fixed top-3 right-3 z-[200] max-w-sm animate-in fade-in slide-in-from-top-2 duration-300">
      <div className="rounded-sm border border-primary/30 bg-[#0a0a0a]/95 shadow-[0_0_40px_rgba(0,0,0,0.8)] backdrop-blur-xl overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff03_1px,transparent_1px),linear-gradient(to_bottom,#ffffff03_1px,transparent_1px)] bg-[size:20px_20px] pointer-events-none" />

        <div className="relative px-4 py-3 flex items-start gap-3">
          <div className="p-1.5 rounded-sm bg-primary/10 border border-primary/20 mt-0.5">
            <ArrowUpCircle className="w-4 h-4 text-primary" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-white tracking-wide">Update Available</span>
              <span className="text-[10px] font-mono text-primary px-1.5 py-0.5 bg-primary/10 border border-primary/20 rounded-sm">
                v{latestVersion.version}
              </span>
            </div>

            {latestVersion.release_notes && (
              <p className="mt-1 text-[10px] font-mono text-white/40 leading-relaxed line-clamp-2">
                {latestVersion.release_notes}
              </p>
            )}

            {hasDownloads && (
              <div className={cn('mt-2 space-y-1.5', !expanded && latestVersion.downloads.length > 2 && 'max-h-[60px] overflow-hidden')}>
                {latestVersion.downloads.map((dl) => {
                  const href = dl.url.startsWith('/') ? `${getApiBase().replace('/api', '')}${dl.url}` : dl.url
                  return (
                    <a
                      key={dl.platform}
                      href={href}
                      download={dl.filename}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-sm border border-white/10 hover:border-primary/30 bg-black/40 hover:bg-primary/5 transition-all group"
                    >
                      <Download className="w-3 h-3 text-white/40 group-hover:text-primary transition-colors" />
                      <span className="text-[10px] font-mono text-white/70 group-hover:text-white transition-colors">
                        {dl.label}
                      </span>
                    </a>
                  )
                })}
              </div>
            )}

            {!hasDownloads && (
              <p className="mt-1.5 text-[10px] font-mono text-white/30">
                Contact your administrator for the latest desktop build.
              </p>
            )}

            {latestVersion.downloads.length > 2 && (
              <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="mt-1 text-[10px] font-mono text-primary/70 hover:text-primary transition-colors"
              >
                {expanded ? 'Show less' : `Show all ${latestVersion.downloads.length} downloads`}
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={handleDismiss}
            className="p-1 rounded-sm text-white/30 hover:text-white hover:bg-white/5 transition-all"
            title="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
