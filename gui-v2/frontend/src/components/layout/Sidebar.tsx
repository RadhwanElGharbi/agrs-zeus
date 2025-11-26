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
  Terminal,
  Cpu,
  ShieldCheck
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { ProjectSelector } from '@/components/Project/ProjectSelector'
import { DatasetCoverageDialog } from '@/components/Project/DatasetCoverageDialog'
import { ZeusLoadingDialog } from '@/components/shared/ZeusLoadingDialog'

interface SidebarProps {
  className?: string
  devMode?: boolean
}

export function Sidebar({ className, devMode = false }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [showDatasets, setShowDatasets] = useState(false)
  const [isZeusAnalyzing, setIsZeusAnalyzing] = useState(false)

  const handleDatasetsClick = () => {
    if (devMode) {
      setShowDatasets(true)
      return
    }
    setIsZeusAnalyzing(true)
  }

  const handleAnalysisComplete = () => {
    setIsZeusAnalyzing(false)
    setShowDatasets(true)
  }

  const navigationItems = [
    { icon: Map, label: 'Map View', active: true, description: 'Main Interface' },
    { icon: Layers, label: 'Datasets', onClick: handleDatasetsClick, description: 'Acquisition & Mgmt' },
    { icon: Activity, label: 'PIRL Training', description: 'Model Status' },
    { icon: Database, label: 'Data Catalog', description: 'Global Index' },
    { icon: Settings, label: 'Settings', description: 'System Config' },
  ]

  return (
    <div 
      className={cn(
        "relative flex flex-col bg-[#0a0a0a]/95 backdrop-blur-xl border-r border-white/10 transition-all duration-300 overflow-hidden shadow-[10px_0_30px_-10px_rgba(0,0,0,0.5)]",
        collapsed ? "w-20" : "w-80",
        className
      )}
      data-sidebar="main"
    >
      {/* Technical Background Grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff03_1px,transparent_1px),linear-gradient(to_bottom,#ffffff03_1px,transparent_1px)] bg-[size:20px_20px] pointer-events-none" />
      
      {/* Header */}
      <div className="relative flex items-center justify-between px-5 py-6 border-b border-white/10 bg-black/20 z-10 h-[88px]">
        {!collapsed ? (
          <div className="relative h-16 w-full max-w-[200px] transition-opacity duration-300">
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
            <div className="relative h-10 w-10 transition-all duration-300 hover:scale-110 cursor-pointer">
              <Image
                src="/logo_torch.png"
                alt="Artemis"
                fill
                className="object-contain drop-shadow-[0_0_10px_rgba(255,255,255,0.2)]"
                title="Artemis"
              />
            </div>
          </div>
        )}
        
        {/* Futuristic Collapse Button */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute -right-3 top-10 p-1.5 bg-[#0a0a0a] border border-white/10 text-white/40 hover:text-primary hover:border-primary/50 hover:bg-primary/5 rounded-sm rotate-45 transition-all duration-300 shadow-lg z-50 group"
        >
          <div className="-rotate-45">
            {collapsed ? (
              <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
            ) : (
              <ChevronLeft className="w-3 h-3 group-hover:-translate-x-0.5 transition-transform" />
            )}
          </div>
        </button>
      </div>

      {/* Project Selector */}
      {!collapsed && (
        <div className="p-4 border-b border-white/5 bg-white/[0.01] relative z-10">
          <div className="flex items-center gap-2 mb-2 pl-1">
            <Terminal className="w-3 h-3 text-primary/50" />
            <span className="text-[10px] text-white/30 font-mono uppercase tracking-widest">Active Operation</span>
          </div>
          <ProjectSelector />
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1.5 overflow-y-auto relative z-10">
        {navigationItems.map((item, index) => {
          const Icon = item.icon
          return (
            <button
              key={index}
              className={cn(
                "group relative w-full flex items-center gap-3 px-3 py-2.5 rounded-sm transition-all duration-300 border border-transparent",
                item.active 
                  ? "bg-primary/10 border-primary/20 text-white" 
                  : "hover:bg-white/5 hover:border-white/10 text-muted-foreground hover:text-white"
              )}
              title={collapsed ? item.label : undefined}
              onClick={item.onClick}
            >
              {/* Active Indicator Line */}
              {item.active && (
                <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-primary shadow-[0_0_10px_rgba(var(--primary),0.8)]" />
              )}

              <div className={cn(
                "p-1.5 rounded-sm transition-colors duration-300",
                item.active ? "text-primary" : "text-white/40 group-hover:text-white/80"
              )}>
                <Icon className="w-5 h-5 flex-shrink-0" />
              </div>
              
              {!collapsed && (
                <div className="flex flex-col items-start text-left">
                  <span className={cn(
                    "text-sm font-medium tracking-wide transition-colors",
                    item.active ? "text-white" : "group-hover:text-white"
                  )}>{item.label}</span>
                  <span className="text-[10px] font-mono text-white/30 uppercase tracking-wider group-hover:text-white/50 transition-colors">
                    {item.description}
                  </span>
                </div>
              )}

              {/* Hover Glow Effect */}
              {!item.active && (
                <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
              )}
            </button>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-white/10 bg-black/20 relative z-10 backdrop-blur-sm">
        {!collapsed ? (
          <div className="space-y-3">
             {/* System Status */}
            <div className="flex items-center justify-between p-2 bg-black/40 border border-white/5 rounded-sm">
              <div className="flex items-center gap-2">
                <Cpu className="w-3 h-3 text-white/40" />
                <span className="text-[10px] text-white/60 font-mono uppercase tracking-wider">System Load</span>
              </div>
              <div className="w-16 h-1 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full w-1/3 bg-emerald-500/50 animate-pulse" />
              </div>
            </div>

            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <div className="relative">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)] animate-pulse" />
                  <div className="absolute inset-0 w-2 h-2 rounded-full bg-emerald-500 opacity-50 animate-ping" />
                </div>
                <span className="text-white/60 font-mono uppercase tracking-widest text-[10px]">Online</span>
              </div>
              <div className="text-[10px] text-white/30 font-mono">
                AGRS-ZEUS <span className="text-white/50">v2.0</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex justify-center">
             <div className="relative group cursor-help">
                <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)] animate-pulse" />
                <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-2 py-1 bg-black border border-white/20 text-[10px] text-white opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none">
                    System Operational
                </div>
            </div>
          </div>
        )}
      </div>

      {!devMode && (
        <ZeusLoadingDialog open={isZeusAnalyzing} onComplete={handleAnalysisComplete} />
      )}
      <DatasetCoverageDialog open={showDatasets} onClose={() => setShowDatasets(false)} />
    </div>
  )
}
