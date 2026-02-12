'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Copy, ExternalLink, KeyRound, Shield, UploadCloud, User as UserIcon, X } from 'lucide-react'
import { useAuth } from '@/lib/context/AuthContext'
import { API_BASE_URL } from '@/lib/api-client'
import { uploadUserAvatar } from '@/lib/api/dataClient'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

export function UserProfileDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, token, logout, refresh } = useAuth()
  const [tab, setTab] = useState<'account' | 'session' | 'admin'>('account')
  const [copied, setCopied] = useState<string | null>(null)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [avatarOverrideUrl, setAvatarOverrideUrl] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const role = (user?.role || '').toLowerCase()
  const isAdmin = role === 'admin' || role === 'superadmin'
  const isSuperadmin = role === 'superadmin'

  const displayName = (user?.name || user?.full_name || user?.username || 'User').trim()
  const email = (user?.email || '').trim()
  const company = (user?.company || user?.organization || '').trim()
  const userId = (user?.id || '').trim()

  const apiUrlFromProfilePath = (path?: string | null): string | null => {
    if (!path) return null
    // Backend returns /api/... paths. API_BASE_URL already ends with /api.
    const suffix = path.startsWith('/api') ? path.slice('/api'.length) : path
    return `${API_BASE_URL}${suffix}`
  }

  const avatarUrl = useMemo(() => {
    if (avatarOverrideUrl) return avatarOverrideUrl
    return apiUrlFromProfilePath(user?.profile_image_url ?? null)
  }, [avatarOverrideUrl, user?.profile_image_url])

  const avatarInitial = useMemo(() => {
    const base = displayName || email || user?.username || '?'
    const ch = base ? base[0] : '?'
    return (ch || '?').toUpperCase()
  }, [displayName, email, user?.username])

  const safeValue = (value: any) => {
    const v = value === null || value === undefined ? '' : String(value)
    return v.trim() ? v.trim() : '—'
  }

  const maskToken = (t: string | null) => {
    if (!t) return '—'
    const s = String(t)
    if (s.length <= 18) return s
    return `${s.slice(0, 10)}…${s.slice(-6)}`
  }

  const copyToClipboard = async (label: string, text: string) => {
    const value = (text || '').trim()
    if (!value) return
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value)
      } else {
        const el = document.createElement('textarea')
        el.value = value
        el.style.position = 'fixed'
        el.style.left = '-9999px'
        document.body.appendChild(el)
        el.select()
        document.execCommand('copy')
        document.body.removeChild(el)
      }
      setCopied(label)
      setTimeout(() => setCopied(null), 1200)
    } catch {
      // ignore
    }
  }

  const pickAvatar = () => fileInputRef.current?.click()

  const handleAvatarChange = async (file: File | null) => {
    if (!file) return
    if (!userId) return
    setAvatarUploading(true)
    try {
      const updated = await uploadUserAvatar(userId, file)
      const url = apiUrlFromProfilePath(updated.profile_image_url ?? null)
      if (url) setAvatarOverrideUrl(url)
      await refresh()
    } catch {
      // Non-fatal: keep old avatar.
    } finally {
      setAvatarUploading(false)
    }
  }

  // Reset UI when opened/closed
  // (keeps the dialog predictable even after role changes).
  useEffect(() => {
    if (!open) return
    setTab('account')
    setCopied(null)
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-[980px] max-w-[95vw] max-h-[90vh] overflow-hidden rounded-sm border border-white/10 bg-[#0a0a0a]/95 shadow-[0_0_60px_rgba(0,0,0,0.8)]">
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-white/20 to-transparent" />

        <div className="flex h-full">
          {/* Left Menu */}
          <aside className="w-[280px] border-r border-white/10 bg-black/40">
            <div className="px-5 py-5 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="relative w-12 h-12 rounded-sm border border-white/10 bg-black/40 overflow-hidden flex items-center justify-center">
                  {avatarUrl ? (
                    <Image src={avatarUrl} alt="Avatar" fill className="object-cover" />
                  ) : (
                    <div className="text-white/70 font-mono text-lg">{avatarInitial}</div>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] text-white/40 uppercase tracking-[0.2em]">Signed in</div>
                  <div className="mt-1 text-sm font-semibold text-white truncate">{displayName || 'User'}</div>
                  <div className="mt-0.5 text-[11px] text-white/50 truncate">
                    {user?.role ? `Role: ${user.role}` : 'Role: —'}
                    {company ? ` · ${company}` : ''}
                  </div>
                </div>
              </div>
            </div>

            <div className="p-3 space-y-1">
              <button
                type="button"
                onClick={() => setTab('account')}
                className={cn(
                  'w-full flex items-center justify-between px-3 py-2 rounded-sm border border-transparent text-xs font-mono text-white/70 hover:text-white hover:bg-white/5 hover:border-white/10 transition-all',
                  tab === 'account' && 'bg-white/5 border-white/15 text-white'
                )}
              >
                <span className="flex items-center gap-2">
                  <UserIcon className="w-4 h-4" />
                  Account
                </span>
              </button>

              <button
                type="button"
                onClick={() => setTab('session')}
                className={cn(
                  'w-full flex items-center justify-between px-3 py-2 rounded-sm border border-transparent text-xs font-mono text-white/70 hover:text-white hover:bg-white/5 hover:border-white/10 transition-all',
                  tab === 'session' && 'bg-white/5 border-white/15 text-white'
                )}
              >
                <span className="flex items-center gap-2">
                  <KeyRound className="w-4 h-4" />
                  Session
                </span>
              </button>

              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setTab('admin')}
                  className={cn(
                    'w-full flex items-center justify-between px-3 py-2 rounded-sm border border-transparent text-xs font-mono text-white/70 hover:text-white hover:bg-white/5 hover:border-white/10 transition-all',
                    tab === 'admin' && 'bg-white/5 border-white/15 text-white'
                  )}
                >
                  <span className="flex items-center gap-2">
                    <Shield className="w-4 h-4" />
                    Admin
                  </span>
                </button>
              )}
            </div>

            <div className="p-3 border-t border-white/10 space-y-2">
              <Button
                variant="destructive"
                className="w-full justify-center"
                onClick={async () => {
                  await logout()
                  onClose()
                }}
              >
                Logout
              </Button>
              <div className="text-[10px] text-white/35 font-mono">
                Session stored in local storage.
              </div>
            </div>
          </aside>

          {/* Content */}
          <section className="flex-1 flex flex-col">
            <header className="px-6 py-5 border-b border-white/10 bg-black/40 flex items-center justify-between">
              <div>
                <div className="text-[10px] text-white/40 uppercase tracking-[0.2em]">
                  {tab === 'account' ? 'Account' : tab === 'session' ? 'Session' : 'Admin'}
                </div>
                <div className="mt-1 text-lg font-semibold text-white">
                  {tab === 'account'
                    ? 'Profile'
                    : tab === 'session'
                      ? 'Session & Token'
                      : 'Administrative Tools'}
                </div>
              </div>
              <Button variant="outline" onClick={onClose} className="gap-2">
                <X className="w-4 h-4" />
                Close
              </Button>
            </header>

            <div className="p-6 overflow-y-auto">
              {tab === 'account' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs text-white/60">
                      Manage your profile details and avatar.
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => void handleAvatarChange(e.target.files?.[0] ?? null)}
                      />
                      <Button
                        variant="outline"
                        onClick={pickAvatar}
                        disabled={!userId || avatarUploading}
                        className="gap-2"
                        title={!userId ? 'User id missing from session payload' : 'Upload a new avatar'}
                      >
                        <UploadCloud className={cn('w-4 h-4', avatarUploading && 'animate-pulse')} />
                        {avatarUploading ? 'Uploading…' : 'Upload Avatar'}
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="text-white/50">Full name</div>
                    <div className="text-white/85 font-mono break-all">{safeValue(user?.full_name || user?.name)}</div>

                    <div className="text-white/50">Email</div>
                    <div className="flex items-center justify-between gap-2 min-w-0">
                      <div className="text-white/85 font-mono break-all truncate">{safeValue(user?.email || user?.username)}</div>
                      <button
                        type="button"
                        onClick={() => void copyToClipboard('email', user?.email || user?.username || '')}
                        className="shrink-0 px-2 py-1 border border-white/10 bg-white/5 text-white/70 hover:text-white hover:border-white/20 rounded-sm"
                        title="Copy"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="text-white/50">Username</div>
                    <div className="flex items-center justify-between gap-2 min-w-0">
                      <div className="text-white/85 font-mono break-all truncate">{safeValue(user?.username)}</div>
                      <button
                        type="button"
                        onClick={() => void copyToClipboard('username', user?.username || '')}
                        className="shrink-0 px-2 py-1 border border-white/10 bg-white/5 text-white/70 hover:text-white hover:border-white/20 rounded-sm"
                        title="Copy"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="text-white/50">Organization</div>
                    <div className="text-white/85 font-mono break-all">{safeValue(user?.organization || user?.company)}</div>

                    <div className="text-white/50">Role</div>
                    <div className="text-white/85 font-mono break-all">{safeValue(user?.role)}</div>

                    <div className="text-white/50">Department</div>
                    <div className="text-white/85 font-mono break-all">{safeValue(user?.department)}</div>

                    <div className="text-white/50">Position</div>
                    <div className="text-white/85 font-mono break-all">{safeValue(user?.position)}</div>

                    <div className="text-white/50">Station</div>
                    <div className="text-white/85 font-mono break-all">{safeValue(user?.station)}</div>

                    <div className="text-white/50">Work phone</div>
                    <div className="text-white/85 font-mono break-all">{safeValue(user?.work_phone)}</div>

                    <div className="text-white/50">Serial number</div>
                    <div className="text-white/85 font-mono break-all">{safeValue(user?.serial_number)}</div>
                  </div>

                  {copied && (
                    <div className="text-[11px] text-emerald-300/80 border border-emerald-500/20 bg-emerald-500/10 rounded-sm px-3 py-2">
                      Copied {copied}.
                    </div>
                  )}
                </div>
              )}

              {tab === 'session' && (
                <div className="space-y-4">
                  <div className="text-xs text-white/60">
                    Your session token is used for API calls. Keep it private.
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="text-white/50">API base</div>
                    <div className="text-white/85 font-mono break-all">{API_BASE_URL}</div>

                    <div className="text-white/50">Token</div>
                    <div className="flex items-center justify-between gap-2 min-w-0">
                      <div className="text-white/85 font-mono break-all truncate">{maskToken(token)}</div>
                      <button
                        type="button"
                        onClick={() => void copyToClipboard('token', token || '')}
                        disabled={!token}
                        className="shrink-0 px-2 py-1 border border-white/10 bg-white/5 text-white/70 hover:text-white hover:border-white/20 rounded-sm disabled:opacity-50"
                        title="Copy token"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {copied && (
                    <div className="text-[11px] text-emerald-300/80 border border-emerald-500/20 bg-emerald-500/10 rounded-sm px-3 py-2">
                      Copied {copied}.
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      onClick={() => void refresh()}
                      className="text-white/80"
                      title="Refresh profile from /auth/me"
                    >
                      Refresh profile
                    </Button>
                    <div className="text-[11px] text-white/40">
                      Uses <span className="font-mono">/auth/me</span> to re-sync your profile fields.
                    </div>
                  </div>
                </div>
              )}

              {tab === 'admin' && (
                <div className="space-y-4">
                  {!isSuperadmin ? (
                    <div className="text-xs text-white/60">
                      Admin tools are limited. Contact a superadmin for user management.
                    </div>
                  ) : (
                    <>
                      <div className="text-xs text-white/60">
                        Superadmin tools.
                      </div>
                      <div className="space-y-2">
                        <Link
                          href="/admin/users"
                          className="inline-flex items-center gap-2 px-3 py-2 border border-white/15 bg-white/5 text-white/80 hover:text-white hover:bg-white/10 hover:border-white/25 rounded-sm text-[11px] font-mono uppercase tracking-widest transition-all"
                        >
                          Open User Management
                          <ExternalLink className="w-4 h-4" />
                        </Link>
                        <div className="text-[11px] text-white/40">
                          Manage corporate user profiles (create/edit/avatars/roles).
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
