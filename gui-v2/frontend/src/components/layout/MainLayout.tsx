'use client'

import { ReactNode, useState, useCallback, useEffect } from 'react'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { DigitalTwinView } from '@/components/DigitalTwin/DigitalTwinView'
import { ProjectManagementView } from '@/components/Project/ProjectManagementView'
import { SupplierSearchDialog } from '@/components/Suppliers/SupplierSearchDialog'
import { ProjectLoadingDialog } from '@/components/shared/ProjectLoadingDialog'
import { WelcomeDialog } from '@/components/shared/WelcomeDialog'
import { GuidedTour } from '@/components/shared/GuidedTour'
import { BackgroundJobIndicator } from '@/components/Project/BackgroundJobIndicator'
import { DatasetFetchProgressDialog } from '@/components/Project/DatasetFetchProgressDialog'
import { useProject } from '@/lib/context/ProjectContext'
import type { DatasetFetchJob } from '@/lib/api/dataClient'

interface MainLayoutProps {
  children: ReactNode
}

export function MainLayout({ children }: MainLayoutProps) {
  const { currentProject, isProjectLoading, refreshProjectData } = useProject()
  const [devMode, setDevMode] = useState(false)
  const [activeView, setActiveView] = useState<'map' | 'digital-twin' | 'project-management'>('map')
  const [showSupplierSearch, setShowSupplierSearch] = useState(false)
  const [suppliersUpdated, setSuppliersUpdated] = useState(0)
  const [showLoadingDialog, setShowLoadingDialog] = useState(false)

  // Background dataset job state
  const [backgroundJobId, setBackgroundJobId] = useState<string | null>(null)
  const [showExpandedJobDialog, setShowExpandedJobDialog] = useState(false)

  // Handle supplier search dialog close - refresh suppliers if search was successful
  const handleSupplierSearchClose = useCallback((hasResults: boolean) => {
    setShowSupplierSearch(false)
    if (hasResults) {
      // Trigger supplier reload with zoom in ProjectManagementView
      setSuppliersUpdated(Date.now())
    }
  }, [])

  // Handle project loading dialog
  const handleLoadingComplete = useCallback(() => {
    setShowLoadingDialog(false)
  }, [])

  // Show loading dialog when project starts loading (but not in dev mode)
  useEffect(() => {
    if (isProjectLoading && !devMode) {
      setShowLoadingDialog(true)
    }
  }, [isProjectLoading, devMode])

  // Show loading dialog when project is loading (but not in dev mode)
  const shouldShowLoadingDialog = !devMode && showLoadingDialog

  // Handle running dataset fetch in background
  const handleRunInBackground = useCallback((jobId: string) => {
    setBackgroundJobId(jobId)
    setShowExpandedJobDialog(false)
  }, [])

  // Handle expanding background job to dialog
  const handleExpandBackgroundJob = useCallback(() => {
    setShowExpandedJobDialog(true)
  }, [])

  // Handle background job completion
  const handleBackgroundJobFinished = useCallback((result: DatasetFetchJob) => {
    // Keep indicator visible for a moment to show completion status
    setTimeout(() => {
      setBackgroundJobId(null)
    }, 3000)
    // Refresh project data
    void refreshProjectData()
  }, [refreshProjectData])

  // Handle closing expanded dialog
  const handleExpandedDialogClose = useCallback(() => {
    setShowExpandedJobDialog(false)
    // If job is still running, keep it in background
    // If job is complete, clear it
  }, [])

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <Sidebar
        devMode={devMode}
        activeView={activeView}
        onViewChange={setActiveView}
        onDatasetRunInBackground={handleRunInBackground}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <Header 
          devMode={devMode} 
          onDevModeChange={setDevMode}
          activeView={activeView}
          onSupplierSearch={() => setShowSupplierSearch(true)}
        />

        {/* Content */}
        <main className="flex-1 relative overflow-hidden">
          {activeView === 'map' && children}
          {activeView === 'digital-twin' && <DigitalTwinView />}
          {activeView === 'project-management' && (
            <ProjectManagementView 
              onSupplierSearch={() => setShowSupplierSearch(true)}
              suppliersUpdated={suppliersUpdated}
            />
          )}
        </main>
      </div>

      {/* Supplier Search Dialog */}
      <SupplierSearchDialog
        open={showSupplierSearch}
        onOpenChange={(open) => {
          if (!open) {
            // Dialog is closing - will be handled by onSearchComplete
            setShowSupplierSearch(false)
          } else {
            setShowSupplierSearch(true)
          }
        }}
        onSearchComplete={(hasResults) => handleSupplierSearchClose(hasResults)}
      />

      {/* Project Loading Dialog */}
      <ProjectLoadingDialog
        open={shouldShowLoadingDialog}
        projectName={currentProject || ''}
        onComplete={handleLoadingComplete}
      />

      {/* YC Demo Onboarding */}
      <WelcomeDialog />
      <GuidedTour />

      {/* Background Job Indicator */}
      {backgroundJobId && !showExpandedJobDialog && (
        <BackgroundJobIndicator
          jobId={backgroundJobId}
          onExpand={handleExpandBackgroundJob}
          onJobFinished={handleBackgroundJobFinished}
        />
      )}

      {/* Expanded Background Job Dialog */}
      <DatasetFetchProgressDialog
        jobId={backgroundJobId}
        open={showExpandedJobDialog && Boolean(backgroundJobId)}
        onClose={handleExpandedDialogClose}
        onJobFinished={handleBackgroundJobFinished}
        onRunInBackground={() => setShowExpandedJobDialog(false)}
      />
    </div>
  )
}
