'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { Search, Plus, X, UploadCloud, RefreshCw, ArrowLeft } from 'lucide-react'
import { SuperAdminGuard } from '@/components/auth/SuperAdminGuard'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { API_BASE_URL } from '@/lib/api-client'
import { adminCreateUser, adminListUsers, adminUpdateUser, uploadUserAvatar, type UserProfile } from '@/lib/api/dataClient'

type ModalMode = 'create' | 'edit'

function apiUrlFromProfilePath(path?: string | null): string | null {
  if (!path) return null
  // Backend returns /api/... paths. API_BASE_URL already ends with /api.
  const suffix = path.startsWith('/api') ? path.slice('/api'.length) : path
  return `${API_BASE_URL}${suffix}`
}

function avatarInitial(fullName?: string | null, email?: string | null): string {
  const name = (fullName || '').trim()
  const first = name.split(/\s+/)[0] || ''
  const base = first || (email || '').trim()
  const ch = base ? base[0] : '?'
  return (ch || '?').toUpperCase()
}

function FieldLabel({ children }: { children: ReactNode }) {
  return <div className="text-[10px] text-white/40 uppercase tracking-[0.2em]">{children}</div>
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        'w-full px-3 py-2 bg-black/40 border border-white/10 rounded-sm text-xs text-white/85 placeholder:text-white/25 outline-none focus:border-primary/40 focus:bg-black/50 transition-all',
        props.className
      )}
    />
  )
}

function SelectInput(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        'w-full px-3 py-2 bg-black/40 border border-white/10 rounded-sm text-xs text-white/85 outline-none focus:border-primary/40 focus:bg-black/50 transition-all',
        props.className
      )}
    />
  )
}

function ModalShell({
  open,
  title,
  onClose,
  children
}: {
  open: boolean
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/85 backdrop-blur-md" onClick={onClose} />
      <div className="relative w-[760px] max-w-[95vw] max-h-[90vh] overflow-hidden rounded-sm border border-white/10 bg-[#0a0a0a]/95 shadow-[0_0_60px_rgba(0,0,0,0.8)]">
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
        <header className="px-6 py-5 border-b border-white/10 bg-black/40 flex items-center justify-between">
          <div>
            <div className="text-[10px] text-white/40 uppercase tracking-[0.2em]">Admin</div>
            <div className="mt-1 text-lg font-bold text-white uppercase tracking-wide">{title}</div>
          </div>
          <button
            onClick={onClose}
            className="p-2 border border-transparent hover:border-white/20 hover:bg-white/10 rounded-sm text-white/70 hover:text-white transition-all"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </header>
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-84px)]">{children}</div>
      </div>
    </div>
  )
}

export default function AdminUsersPage() {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [users, setUsers] = useState<UserProfile[]>([])

  const [modalOpen, setModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<ModalMode>('create')
  const [selected, setSelected] = useState<UserProfile | null>(null)

  const [form, setForm] = useState({
    email: '',
    full_name: '',
    password: '',
    role: 'user',
    organization: '',
    position: '',
    department: '',
    station: '',
    work_phone: '',
    access_level: '',
    serial_number: '',
    is_active: true
  })
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const resp = await adminListUsers(query || undefined, 100, 0)
      setUsers(resp.users || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load users')
    } finally {
      setLoading(false)
    }
  }, [query])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const openCreate = () => {
    setModalMode('create')
    setSelected(null)
    setAvatarFile(null)
    setForm({
      email: '',
      full_name: '',
      password: '',
      role: 'user',
      organization: '',
      position: '',
      department: '',
      station: '',
      work_phone: '',
      access_level: '',
      serial_number: '',
      is_active: true
    })
    setModalOpen(true)
  }

  const openEdit = (u: UserProfile) => {
    setModalMode('edit')
    setSelected(u)
    setAvatarFile(null)
    setForm({
      email: u.email || '',
      full_name: u.full_name || u.name || '',
      password: '',
      role: u.role || 'user',
      organization: u.organization || u.company || '',
      position: u.position || '',
      department: u.department || '',
      station: u.station || '',
      work_phone: u.work_phone || '',
      access_level: u.access_level || '',
      serial_number: u.serial_number || '',
      is_active: u.is_active !== false
    })
    setModalOpen(true)
  }

  const closeModal = () => {
    if (saving) return
    setModalOpen(false)
  }

  const visible = useMemo(() => users, [users])

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      if (modalMode === 'create') {
        const created = await adminCreateUser({
          email: form.email,
          full_name: form.full_name,
          password: form.password,
          role: form.role,
          organization: form.organization || undefined,
          position: form.position || undefined,
          department: form.department || undefined,
          station: form.station || undefined,
          work_phone: form.work_phone || undefined,
          access_level: form.access_level || undefined,
          serial_number: form.serial_number || undefined
        })
        if (avatarFile) {
          await uploadUserAvatar(created.id, avatarFile)
        }
      } else {
        if (!selected) throw new Error('No user selected')
        const payload: Record<string, any> = {
          full_name: form.full_name,
          role: form.role,
          organization: form.organization || null,
          position: form.position || null,
          department: form.department || null,
          station: form.station || null,
          work_phone: form.work_phone || null,
          access_level: form.access_level || null,
          serial_number: form.serial_number || null,
          is_active: Boolean(form.is_active)
        }
        if (form.password.trim()) payload.password = form.password
        await adminUpdateUser(selected.id, payload)
        if (avatarFile) {
          await uploadUserAvatar(selected.id, avatarFile)
        }
      }
      setModalOpen(false)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <SuperAdminGuard>
      <div className="min-h-screen bg-[#050505] text-white">
        <div className="max-w-6xl mx-auto px-6 py-10">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[10px] uppercase tracking-[0.25em] text-white/40">Admin</div>
              <h1 className="mt-2 text-2xl font-bold uppercase tracking-wide">User Management</h1>
              <div className="mt-2 text-sm text-white/60">
                Create, edit, and manage corporate user profiles (Postgres-backed).
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void refresh()}
                className="h-9 px-4 gap-2 text-white/70 hover:text-white hover:bg-white/10 border border-white/10 hover:border-primary/30"
              >
                <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
                Refresh
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={openCreate}
                className="h-9 px-4 gap-2 text-primary hover:bg-primary/10 border border-primary/30 hover:border-primary/50"
              >
                <Plus className="w-4 h-4" />
                Create User
              </Button>
              <Link
                href="/"
                className="ml-2 h-9 w-9 flex items-center justify-center rounded-sm border border-white/10 text-white/40 hover:text-white hover:bg-white/10 hover:border-white/25 transition-all"
                title="Back to ZEUS"
              >
                <X className="w-4 h-4" />
              </Link>
            </div>
          </div>

          <div className="mt-8 flex items-center gap-2 px-3 py-2 bg-black/40 border border-white/10 rounded-sm">
            <Search className="w-4 h-4 text-white/30" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void refresh()
              }}
              placeholder="Search by email, serial number, or full name…"
              className="w-full bg-transparent outline-none text-xs text-white/80 placeholder:text-white/30"
            />
          </div>

          {error && (
            <div className="mt-4 p-4 border border-red-500/30 bg-red-500/10 text-red-300 rounded-sm text-xs">
              {error}
            </div>
          )}

          <div className="mt-6 border border-white/10 bg-black/30 rounded-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-white/10 bg-white/[0.02] flex items-center justify-between">
              <div className="text-[10px] uppercase tracking-[0.25em] text-white/40">
                Users ({visible.length})
              </div>
              <div className="text-[10px] text-white/30">Tip: click a row to edit</div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead className="bg-black/40 text-white/50 uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="text-left px-4 py-3">User</th>
                    <th className="text-left px-4 py-3">Email</th>
                    <th className="text-left px-4 py-3">Org</th>
                    <th className="text-left px-4 py-3">Role</th>
                    <th className="text-left px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((u) => {
                    const avatar = apiUrlFromProfilePath(u.profile_image_url)
                    const initial = avatarInitial(u.full_name || u.name, u.email)
                    const inactive = u.is_active === false
                    return (
                      <tr
                        key={u.id}
                        className={cn(
                          'border-t border-white/5 hover:bg-white/[0.03] cursor-pointer',
                          inactive && 'opacity-60'
                        )}
                        onClick={() => openEdit(u)}
                        title="Edit user"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-sm border border-white/10 bg-white/[0.02] overflow-hidden flex items-center justify-center">
                              {avatar ? (
                                <img src={avatar} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <div className="text-[11px] font-bold text-white/70">{initial}</div>
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="text-white/90 font-semibold truncate">{u.full_name || u.name}</div>
                              <div className="text-[10px] text-white/40 font-mono truncate">{u.serial_number}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-white/80 font-mono">{u.email}</td>
                        <td className="px-4 py-3 text-white/70">{u.organization || u.company || '—'}</td>
                        <td className="px-4 py-3">
                          <span className={cn('px-2 py-1 rounded-sm border text-[10px] uppercase tracking-wider', u.role === 'admin'
                            ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                            : u.role === 'superadmin'
                              ? 'border-red-500/40 bg-red-500/10 text-red-300'
                            : 'border-white/10 bg-white/5 text-white/60')}>
                            {u.role || 'member'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              'px-2 py-1 rounded-sm border text-[10px] uppercase tracking-wider',
                              inactive ? 'border-red-500/30 bg-red-500/10 text-red-300' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                            )}
                          >
                            {inactive ? 'inactive' : 'active'}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                  {visible.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-white/30 text-xs">
                        {loading ? 'Loading…' : 'No users found.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <ModalShell
          open={modalOpen}
          title={modalMode === 'create' ? 'Create User' : `Edit User`}
          onClose={closeModal}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <div className="space-y-1">
                <FieldLabel>Corporate Email</FieldLabel>
                <TextInput
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                  disabled={modalMode === 'edit'}
                  placeholder="name@company.com"
                />
              </div>

              <div className="space-y-1">
                <FieldLabel>Full Name</FieldLabel>
                <TextInput
                  value={form.full_name}
                  onChange={(e) => setForm((p) => ({ ...p, full_name: e.target.value }))}
                  placeholder="Full name"
                />
              </div>

              <div className="space-y-1">
                <FieldLabel>Password {modalMode === 'edit' ? '(leave blank to keep)' : ''}</FieldLabel>
                <TextInput
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                  placeholder={modalMode === 'create' ? 'Set initial password' : '••••••••'}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <FieldLabel>Role</FieldLabel>
                  <SelectInput value={form.role} onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))}>
                    <option value="user">user</option>
                    <option value="admin">admin</option>
                  </SelectInput>
                </div>
                <div className="space-y-1">
                  <FieldLabel>Status</FieldLabel>
                  <SelectInput
                    value={form.is_active ? 'active' : 'inactive'}
                    onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.value === 'active' }))}
                    disabled={modalMode === 'create'}
                  >
                    <option value="active">active</option>
                    <option value="inactive">inactive</option>
                  </SelectInput>
                </div>
              </div>

              <div className="space-y-1">
                <FieldLabel>Serial Number (optional)</FieldLabel>
                <TextInput
                  value={form.serial_number}
                  onChange={(e) => setForm((p) => ({ ...p, serial_number: e.target.value }))}
                  placeholder="AGRS-000123"
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <FieldLabel>Organization</FieldLabel>
                <TextInput value={form.organization} onChange={(e) => setForm((p) => ({ ...p, organization: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <FieldLabel>Department</FieldLabel>
                <TextInput value={form.department} onChange={(e) => setForm((p) => ({ ...p, department: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <FieldLabel>Position</FieldLabel>
                <TextInput value={form.position} onChange={(e) => setForm((p) => ({ ...p, position: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <FieldLabel>Station</FieldLabel>
                <TextInput value={form.station} onChange={(e) => setForm((p) => ({ ...p, station: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <FieldLabel>Work Phone</FieldLabel>
                <TextInput value={form.work_phone} onChange={(e) => setForm((p) => ({ ...p, work_phone: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <FieldLabel>Access Level (placeholder)</FieldLabel>
                <TextInput value={form.access_level} onChange={(e) => setForm((p) => ({ ...p, access_level: e.target.value }))} />
              </div>

              {modalMode === 'edit' && (
                <div className="space-y-2 border border-white/10 bg-black/30 rounded-sm p-4">
                  <div className="flex items-center justify-between gap-3">
                    <FieldLabel>Profile Image</FieldLabel>
                    <div className="text-[10px] text-white/30 font-mono">
                      {avatarFile ? avatarFile.name : 'No file selected'}
                    </div>
                  </div>
                  <label className="flex items-center gap-2 px-3 py-2 border border-white/10 bg-white/[0.02] hover:bg-white/[0.04] rounded-sm text-xs text-white/70 cursor-pointer">
                    <UploadCloud className="w-4 h-4 text-white/40" />
                    Choose file
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => setAvatarFile(e.target.files?.[0] ?? null)}
                    />
                  </label>
                </div>
              )}
            </div>
          </div>

          <div className="mt-8 flex items-center justify-end gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={closeModal}
              disabled={saving}
              className="h-9 px-4 border border-white/10 text-white/70 hover:text-white hover:bg-white/10"
            >
              Cancel
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSave}
              disabled={saving || !form.full_name.trim() || !form.email.trim() || (modalMode === 'create' && !form.password.trim())}
              className="h-9 px-5 border border-primary/40 text-primary hover:bg-primary/10"
            >
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </ModalShell>
      </div>
    </SuperAdminGuard>
  )
}


