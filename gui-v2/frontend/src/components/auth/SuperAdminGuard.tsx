'use client'

import React, { ReactNode } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/context/AuthContext'

export function SuperAdminGuard({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth()

  if (isLoading) {
    return null
  }

  // AuthGuard already handles unauthenticated users (login screen),
  // so if there's no user here, we just render nothing.
  if (!user) {
    return null
  }

  if (user.role !== 'superadmin') {
    return (
      <div className="min-h-screen bg-[#050505] text-white flex items-center justify-center p-6">
        <div className="w-full max-w-md border border-white/10 bg-black/40 rounded-sm p-6">
          <div className="text-xs font-mono uppercase tracking-[0.25em] text-white/40">
            Access Restricted
          </div>
          <div className="mt-2 text-lg font-semibold">Superadmin access required</div>
          <div className="mt-3 text-sm text-white/60">
            This page is restricted to superadmin accounts.
          </div>
          <div className="mt-6 flex gap-3">
            <Link
              href="/"
              className="px-3 py-2 border border-white/15 hover:border-primary/40 hover:bg-primary/10 text-white/80 hover:text-white rounded-sm text-[11px] uppercase font-bold tracking-wider transition-all"
            >
              Return to app
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return <>{children}</>
}





