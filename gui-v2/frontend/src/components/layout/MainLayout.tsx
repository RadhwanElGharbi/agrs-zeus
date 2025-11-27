'use client'

import { ReactNode, useState } from 'react'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { DigitalTwinView } from '@/components/DigitalTwin/DigitalTwinView'

interface MainLayoutProps {
  children: ReactNode
}

export function MainLayout({ children }: MainLayoutProps) {
  const [devMode, setDevMode] = useState(false)
  const [activeView, setActiveView] = useState<'map' | 'digital-twin'>('map')

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <Sidebar 
        devMode={devMode} 
        activeView={activeView}
        onViewChange={setActiveView}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <Header devMode={devMode} onDevModeChange={setDevMode} />

        {/* Content */}
        <main className="flex-1 relative overflow-hidden">
          {activeView === 'map' ? children : <DigitalTwinView />}
        </main>
      </div>
    </div>
  )
}
