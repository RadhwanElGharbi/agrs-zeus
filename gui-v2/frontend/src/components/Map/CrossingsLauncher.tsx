'use client'

import React from 'react'
import { MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CrossingsLauncherProps {
  count?: number
  onOpen: () => void
}

export function CrossingsLauncher({ count = 0, onOpen }: CrossingsLauncherProps) {
  const badge = count > 99 ? '99+' : String(count)

  return (
    <div className="relative bg-black/80 backdrop-blur-md border border-white/20 rounded-sm p-2 shadow-[0_0_20px_-5px_rgba(0,0,0,0.5)] group hover:border-purple-500/50 transition-colors">
      <button
        onClick={onOpen}
        className={cn(
          "flex items-center justify-center p-1 rounded-sm transition-colors",
          "hover:bg-purple-500/10 text-purple-400/70 hover:text-purple-300"
        )}
        title="Open Crossings Manager"
      >
        <MapPin className="w-5 h-5 group-hover:animate-pulse" />
      </button>

      {count > 0 && (
        <div className="absolute -top-1 -right-1 min-w-4 h-4 px-1 bg-purple-500 rounded-full flex items-center justify-center shadow-[0_0_8px_rgba(147,51,234,0.8)]">
          <span className="text-[9px] font-bold text-white tabular-nums">{badge}</span>
        </div>
      )}
    </div>
  )
}

















