'use client'

import { Bell, User, Truck, Cpu, GitCommit, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/context/AuthContext'

interface HeaderProps {
  devMode: boolean
  onDevModeChange: (value: boolean) => void
  activeView: 'map' | 'digital-twin' | 'project-management'
  onSupplierSearch?: () => void
}

export function Header({ devMode, onDevModeChange, activeView, onSupplierSearch }: HeaderProps) {
  const { user } = useAuth()

  // Hide Dev Mode toggle for yc-demo users
  const showDevMode = user?.username !== 'yc-demo'
  return (
    <header className="relative h-14 border-b border-white/10 bg-[#0a0a0a]/95 backdrop-blur-xl px-6 flex items-center justify-between z-50 shadow-md">
       {/* Technical Background Grid */}
       <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff03_1px,transparent_1px),linear-gradient(to_bottom,#ffffff03_1px,transparent_1px)] bg-[size:20px_20px] pointer-events-none" />

      {/* View-Specific Action Buttons */}
      <div className="flex-1 flex items-center gap-2 relative z-10">
        {activeView === 'project-management' && (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={onSupplierSearch}
              className="h-8 px-3 gap-2 text-white/70 hover:text-white hover:bg-white/10 border border-white/10 hover:border-primary/30 transition-all"
              data-tour="supplier-btn"
            >
              <Truck className="w-3.5 h-3.5" />
              <span className="text-xs font-medium">Suppliers</span>
            </Button>
            
            <Button 
              variant="ghost" 
              size="sm"
              disabled
              className="h-8 px-3 gap-2 text-white/40 border border-white/5 bg-white/[0.02] cursor-not-allowed relative overflow-hidden group"
            >
              <GitCommit className="w-3.5 h-3.5" />
              <span className="text-xs font-medium">Phases</span>
              <div className="absolute -right-3 -top-3 bg-amber-500/20 text-amber-500 text-[8px] font-bold px-4 py-3 rotate-45 border border-amber-500/20 shadow-sm translate-x-1 translate-y-1">
                DEV
              </div>
            </Button>

            <Button 
              variant="ghost" 
              size="sm"
              disabled
              className="h-8 px-3 gap-2 text-white/40 border border-white/5 bg-white/[0.02] cursor-not-allowed relative overflow-hidden group"
            >
              <FileText className="w-3.5 h-3.5" />
              <span className="text-xs font-medium">RFP Manager</span>
              <div className="absolute -right-3 -top-3 bg-amber-500/20 text-amber-500 text-[8px] font-bold px-4 py-3 rotate-45 border border-amber-500/20 shadow-sm translate-x-1 translate-y-1">
                DEV
              </div>
            </Button>
          </>
        )}

        {activeView === 'map' && (
          <>{/* Map view actions removed - Layers and Datasets buttons */}</>
        )}

        {activeView === 'digital-twin' && (
          <>
            <Button 
              variant="ghost" 
              size="sm"
              className="h-8 px-3 gap-2 text-white/70 hover:text-white hover:bg-white/10 border border-white/10 hover:border-primary/30 transition-all"
            >
              <Cpu className="w-3.5 h-3.5" />
              <span className="text-xs font-medium">Simulation</span>
            </Button>
          </>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-4 relative z-10">
        {/* Dev Mode Toggle - Hidden for yc-demo users */}
        {showDevMode && (
          <>
            <div className="flex items-center gap-3 px-3 py-1.5 bg-white/5 border border-white/5 rounded-full">
              <span className="hidden sm:inline text-[10px] uppercase tracking-widest text-white/40 font-mono">Dev Mode</span>
              <button
                type="button"
                role="switch"
                aria-checked={devMode}
                onClick={() => onDevModeChange(!devMode)}
                className={cn(
                  'relative inline-flex h-5 w-9 items-center rounded-full transition-all focus:outline-none',
                  devMode ? 'bg-primary shadow-[0_0_10px_rgba(var(--primary),0.5)]' : 'bg-white/10'
                )}
              >
                <span
                  className={cn(
                    'inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform',
                    devMode ? 'translate-x-5' : 'translate-x-1'
                  )}
                />
              </button>
              <span className={cn(
                "text-[10px] font-mono font-bold uppercase w-6",
                devMode ? "text-primary" : "text-white/20"
              )}>{devMode ? 'ON' : 'OFF'}</span>
            </div>

            <div className="h-6 w-px bg-white/10 mx-1" />
          </>
        )}

        <Button variant="ghost" size="icon" className="text-white/60 hover:text-white hover:bg-white/10">
          <Bell className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="icon" className="text-white/60 hover:text-white hover:bg-white/10">
          <User className="w-4 h-4" />
        </Button>
      </div>
    </header>
  )
}
