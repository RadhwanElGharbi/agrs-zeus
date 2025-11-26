'use client'

import { Bell, Search, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface HeaderProps {
  devMode: boolean
  onDevModeChange: (value: boolean) => void
}

export function Header({ devMode, onDevModeChange }: HeaderProps) {
  return (
    <header className="h-14 border-b border-border bg-card px-6 flex items-center justify-between">
      {/* Search Bar */}
      <div className="flex-1 max-w-xl">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search projects, datasets, routes..."
            className="w-full h-9 pl-10 pr-4 bg-background border border-input rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="hidden sm:inline font-medium">Dev Mode</span>
          <button
            type="button"
            role="switch"
            aria-checked={devMode}
            onClick={() => onDevModeChange(!devMode)}
            className={cn(
              'relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              devMode ? 'bg-primary' : 'bg-muted'
            )}
          >
            <span
              className={cn(
                'inline-block h-4 w-4 transform rounded-full bg-background shadow transition-transform',
                devMode ? 'translate-x-5' : 'translate-x-1'
              )}
            />
          </button>
          <span className="text-[11px] font-semibold text-foreground">{devMode ? 'On' : 'Off'}</span>
        </div>
        <Button variant="ghost" size="icon">
          <Bell className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="icon">
          <User className="w-4 h-4" />
        </Button>
      </div>
    </header>
  )
}



