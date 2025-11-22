'use client'

import { useState } from 'react'
import { 
  Map, 
  Layers, 
  Database, 
  Settings, 
  FolderOpen, 
  Activity,
  ChevronLeft,
  ChevronRight
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { ProjectSelector } from '@/components/Project/ProjectSelector'

interface SidebarProps {
  className?: string
}

export function Sidebar({ className }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false)

  const navigationItems = [
    { icon: Map, label: 'Map View', active: true },
    { icon: FolderOpen, label: 'Projects' },
    { icon: Layers, label: 'Datasets' },
    { icon: Activity, label: 'PIRL Training' },
    { icon: Database, label: 'Data Catalog' },
    { icon: Settings, label: 'Settings' },
  ]

  return (
    <div 
      className={cn(
        "relative flex flex-col bg-card border-r border-border transition-all duration-300",
        collapsed ? "w-16" : "w-64",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
              <span className="text-white font-bold text-sm">AZ</span>
            </div>
            <div>
              <h1 className="text-sm font-semibold">AGRS ZEUS</h1>
              <p className="text-xs text-muted-foreground">v2.0.0</p>
            </div>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1 rounded hover:bg-accent transition-colors"
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronLeft className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Project Selector */}
      {!collapsed && (
        <div className="p-3 border-b border-border">
          <ProjectSelector />
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
        {navigationItems.map((item, index) => {
          const Icon = item.icon
          return (
            <button
              key={index}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors",
                item.active 
                  ? "bg-primary text-primary-foreground" 
                  : "hover:bg-accent hover:text-accent-foreground"
              )}
              title={collapsed ? item.label : undefined}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              {!collapsed && (
                <span className="text-sm font-medium">{item.label}</span>
              )}
            </button>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-border">
        {!collapsed ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-muted-foreground">System Operational</span>
            </div>
            <div className="text-xs text-muted-foreground">
              <div>API: Connected</div>
              <div>Backend: Active</div>
            </div>
          </div>
        ) : (
          <div className="flex justify-center">
            <div className="w-2 h-2 rounded-full bg-green-500" />
          </div>
        )}
      </div>
    </div>
  )
}

