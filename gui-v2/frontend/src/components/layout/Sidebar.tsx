'use client'

import { useState } from 'react'
import Image from 'next/image'
import { 
  Map, 
  Layers, 
  Database, 
  Settings, 
  Activity,
  ChevronLeft,
  ChevronRight,
  Flame
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { ProjectSelector } from '@/components/Project/ProjectSelector'
import { DatasetCoverageDialog } from '@/components/Project/DatasetCoverageDialog'
import { ZeusLoadingDialog } from '@/components/shared/ZeusLoadingDialog'

interface SidebarProps {
  className?: string
}

export function Sidebar({ className }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [showDatasets, setShowDatasets] = useState(false)
  const [isZeusAnalyzing, setIsZeusAnalyzing] = useState(false)

  const handleDatasetsClick = () => {
    setIsZeusAnalyzing(true)
  }

  const handleAnalysisComplete = () => {
    setIsZeusAnalyzing(false)
    setShowDatasets(true)
  }

  const navigationItems = [
    { icon: Map, label: 'Map View', active: true },
    { icon: Layers, label: 'Datasets', onClick: handleDatasetsClick },
    { icon: Activity, label: 'PIRL Training' },
    { icon: Database, label: 'Data Catalog' },
    { icon: Settings, label: 'Settings' },
  ]

  return (
    <div 
      className={cn(
        "relative flex flex-col bg-card border-r border-border transition-all duration-300",
        collapsed ? "w-20" : "w-72",
        className
      )}
      data-sidebar="main"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-5 border-b border-border h-[80px]">
        {!collapsed ? (
          <div className="relative h-14 w-full max-w-[180px]">
            <Image
              src="/logo.png"
              alt="Artemis Global Research"
              fill
              className="object-contain object-left"
              priority
            />
          </div>
        ) : (
          <div className="w-full flex justify-center">
            <div className="relative h-8 w-8">
              <Image
                src="/logo_torch.png"
                alt="Artemis"
                fill
                className="object-contain"
                title="Artemis"
              />
            </div>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors absolute right-[-12px] top-8 border border-border bg-card shadow-sm z-50"
        >
          {collapsed ? (
            <ChevronRight className="w-3 h-3" />
          ) : (
            <ChevronLeft className="w-3 h-3" />
          )}
        </button>
      </div>

      {/* Project Selector */}
      {!collapsed && (
        <div className="p-3 border-b border-border bg-muted/30">
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
                "w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200",
                item.active 
                  ? "bg-primary text-primary-foreground shadow-md shadow-red-900/20" 
                  : "hover:bg-accent hover:text-accent-foreground text-muted-foreground"
              )}
              title={collapsed ? item.label : undefined}
              onClick={item.onClick}
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
      <div className="p-4 border-t border-border bg-muted/10">
        {!collapsed ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs">
              <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
              <span className="text-muted-foreground font-medium">System Operational</span>
            </div>
            <div className="text-xs text-muted-foreground/70 flex justify-between">
              <span>v2.0.0</span>
              <span>AGRS Inc.</span>
            </div>
          </div>
        ) : (
          <div className="flex justify-center">
            <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
          </div>
        )}
      </div>

      <ZeusLoadingDialog 
        open={isZeusAnalyzing} 
        onComplete={handleAnalysisComplete} 
      />
      
      <DatasetCoverageDialog open={showDatasets} onClose={() => setShowDatasets(false)} />
    </div>
  )
}
