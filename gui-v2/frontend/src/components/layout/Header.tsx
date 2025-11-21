'use client'

import { Bell, Search, User } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function Header() {
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
      <div className="flex items-center gap-2">
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

