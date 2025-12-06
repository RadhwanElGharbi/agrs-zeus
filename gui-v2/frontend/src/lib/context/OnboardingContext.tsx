'use client'

import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react'
import { useAuth } from './AuthContext'

// Tour phases that the user will go through
export type TourPhase =
  | 'welcome'           // Initial welcome dialog
  | 'intro'             // Introduction to the interface
  | 'project-creation'  // Creating a new project
  | 'dataset-fetching'  // Fetching datasets
  | 'suppliers'         // Supplier search and fetch
  | 'pirl-ai'           // PIRL AI Agent
  | 'completed'         // Tour finished

// Action types that trigger step advancement
export type TourAction =
  | 'click-project-selector'
  | 'click-create-project'
  | 'wizard-step-1-complete'
  | 'click-draw-tab'
  | 'click-launch-drawing'
  | 'click-draw-polygon'
  | 'aoi-polygon-drawn'
  | 'click-set-start'
  | 'click-set-end'
  | 'click-save-geometry'
  | 'wizard-step-2-complete'
  | 'wizard-step-3-complete'
  | 'wizard-step-4-complete'
  | 'project-created'
  | 'click-datasets'
  | 'dataset-dialog-open'
  | 'click-fetch-datasets'
  | 'datasets-fetched'
  | 'click-project-management'
  | 'click-suppliers'
  | 'supplier-dialog-open'
  | 'click-digital-twin'
  | 'click-pirl-ai'
  | 'pirl-dialog-open'

// Step within a phase
export interface TourStep {
  target: string        // CSS selector for the target element
  title: string         // Step title
  content: string       // Step description/instructions
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'center'
  disableBeacon?: boolean
  spotlightClicks?: boolean  // Allow clicking the spotlight area
  hideCloseButton?: boolean
  hideBackButton?: boolean
  waitForElement?: boolean   // Wait for element to appear before showing step
  requiredAction?: TourAction // Action that must be performed to advance
  isInformational?: boolean  // True if this is just info (show Next button)
  disableOverlay?: boolean   // Disable the dark overlay for this step
}

interface OnboardingContextType {
  // Tour state
  isTourActive: boolean
  currentPhase: TourPhase
  currentStepIndex: number
  showWelcomeDialog: boolean

  // Tour controls
  startTour: () => void
  skipTour: () => void
  nextStep: () => void
  prevStep: () => void
  goToPhase: (phase: TourPhase) => void
  goToStep: (stepIndex: number) => void
  endTour: () => void

  // Action reporting - components call this when user performs an action
  reportAction: (action: TourAction) => void

  // Welcome dialog
  dismissWelcomeDialog: () => void

  // Check if user is yc-demo
  isYCDemo: boolean

  // Get current phase steps
  getCurrentSteps: () => TourStep[]
  getCurrentStep: () => TourStep | null

  // Get total steps count across all phases
  getTotalSteps: () => number
  getGlobalStepIndex: () => number

  // Check if current step requires action (hide Next button)
  currentStepRequiresAction: () => boolean

  // Check if tour was completed before
  hasCompletedTour: boolean
}

const OnboardingContext = createContext<OnboardingContextType | undefined>(undefined)

const STORAGE_KEY = 'agrs_tour_completed'
const SESSION_WELCOME_KEY = 'agrs_welcome_shown_session'

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()

  const [isTourActive, setIsTourActive] = useState(false)
  const [currentPhase, setCurrentPhase] = useState<TourPhase>('welcome')
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [showWelcomeDialog, setShowWelcomeDialog] = useState(false)
  const [hasCompletedTour, setHasCompletedTour] = useState(false)

  const isYCDemo = user?.username === 'yc-demo'

  // Check localStorage for tour completion status on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const completed = localStorage.getItem(STORAGE_KEY) === 'true'
      setHasCompletedTour(completed)
    }
  }, [])

  // Show welcome dialog when yc-demo user logs in (per session)
  useEffect(() => {
    if (isYCDemo && typeof window !== 'undefined') {
      // Check if welcome was shown this session
      const shownThisSession = sessionStorage.getItem(SESSION_WELCOME_KEY) === 'true'
      if (!shownThisSession) {
        // Small delay to ensure the main UI has rendered
        const timer = setTimeout(() => {
          setShowWelcomeDialog(true)
          sessionStorage.setItem(SESSION_WELCOME_KEY, 'true')
        }, 800)
        return () => clearTimeout(timer)
      }
    }
  }, [isYCDemo])

  // Define tour steps for each phase
  const getTourSteps = useCallback((phase: TourPhase): TourStep[] => {
    switch (phase) {
      case 'intro':
        return [
          {
            target: '[data-tour="sidebar"]',
            title: 'Welcome to AGRS ZEUS',
            content: 'This is your main navigation sidebar. From here you can access all features of the platform including the Map Interface, Digital Twin, Project Management, and AI tools.',
            placement: 'right',
            disableBeacon: true,
            isInformational: true,
          },
          {
            target: '[data-tour="project-selector-btn"]',
            title: 'Project Selector',
            content: 'Click this button to select an existing project or create a new one.',
            placement: 'right',
            spotlightClicks: true,
            requiredAction: 'click-project-selector',
          },
        ]

      case 'project-creation':
        return [
          {
            target: '[data-tour="create-project-btn"]',
            title: 'Create New Project',
            content: 'Click "Create New Project" to start the project creation wizard.',
            placement: 'bottom',
            spotlightClicks: true,
            waitForElement: true,
            requiredAction: 'click-create-project',
          },
          {
            target: '[data-tour="wizard-step-1"]',
            title: 'Step 1: Project Identity',
            content: 'Enter your project details:\n\n• Project Name: e.g., "YC-PIPELINE-DEMO"\n• Organization: Your company\n• Units: SI (metric) or Imperial\n\nFill in the details and click "Next" to continue.',
            placement: 'left',
            spotlightClicks: true,
            waitForElement: true,
            requiredAction: 'wizard-step-1-complete',
            disableOverlay: true,
          },
          {
            target: '[data-tour="aoi-draw-tab"]',
            title: 'Step 2: Area of Interest (AOI)',
            content: 'First, click the "Draw on Map" tab to switch to the drawing mode.',
            placement: 'bottom',
            spotlightClicks: true,
            waitForElement: true,
            requiredAction: 'click-draw-tab',
            disableOverlay: true,
          },
          {
            target: '[data-tour="launch-drawing-btn"]',
            title: 'Launch Drawing Console',
            content: 'Click "Launch Drawing Console" to open the map interface where you can draw your pipeline corridor.',
            placement: 'bottom',
            spotlightClicks: true,
            waitForElement: true,
            requiredAction: 'click-launch-drawing',
            disableOverlay: true,
          },
          {
            target: '[data-tour="draw-polygon-btn"]',
            title: 'Draw Your AOI Polygon',
            content: 'Click "Draw Polygon" to start drawing your area of interest on the map.\n\nClick on the map to place points, then double-click to complete the polygon.',
            placement: 'bottom',
            spotlightClicks: true,
            waitForElement: true,
            requiredAction: 'click-draw-polygon',
            disableOverlay: true,
          },
          {
            target: '[data-tour="aoi-map"]',
            title: 'Complete Your Polygon',
            content: 'Draw your pipeline corridor by clicking points on the map.\n\n• Click to add vertices\n• Double-click to complete the polygon\n• Maximum area: 300 km²\n\nThe tour will continue once you\'ve drawn a valid polygon.',
            placement: 'left',
            spotlightClicks: true,
            waitForElement: true,
            requiredAction: 'aoi-polygon-drawn',
            disableOverlay: true,
          },
          {
            target: '[data-tour="set-start-btn"]',
            title: 'Set Start Point',
            content: 'Click "Set Start" then click on the map to mark the pipeline start location (green marker).',
            placement: 'bottom',
            spotlightClicks: true,
            waitForElement: true,
            requiredAction: 'click-set-start',
            disableOverlay: true,
          },
          {
            target: '[data-tour="set-end-btn"]',
            title: 'Set End Point',
            content: 'Click "Set End" then click on the map to mark the pipeline end location (red marker).',
            placement: 'bottom',
            spotlightClicks: true,
            waitForElement: true,
            requiredAction: 'click-set-end',
            disableOverlay: true,
          },
          {
            target: '[data-tour="save-geometry-btn"]',
            title: 'Save Your Geometry',
            content: 'Click "Save Geometry" to save your AOI polygon and start/end points.',
            placement: 'bottom',
            spotlightClicks: true,
            waitForElement: true,
            requiredAction: 'click-save-geometry',
            disableOverlay: true,
          },
          {
            target: '[data-tour="wizard-step-2"]',
            title: 'AOI Captured!',
            content: 'Your AOI has been captured. Review the summary and click "Next" to continue.',
            placement: 'left',
            spotlightClicks: true,
            waitForElement: true,
            requiredAction: 'wizard-step-2-complete',
            disableOverlay: true,
          },
          {
            target: '[data-tour="wizard-step-3"]',
            title: 'Step 3: Coordinate System',
            content: 'Select the appropriate coordinate reference system (CRS).\n\nThe system recommends UTM zones based on your AOI location. Accept the recommendation or choose manually.\n\nClick "Next" to continue.',
            placement: 'left',
            spotlightClicks: true,
            waitForElement: true,
            requiredAction: 'wizard-step-3-complete',
            disableOverlay: true,
          },
          {
            target: '[data-tour="wizard-step-4"]',
            title: 'Step 4: Pipeline Specifications',
            content: 'Enter pipeline hydraulics data:\n\n• Outside Diameter: 660 mm\n• Inside Diameter: 640 mm\n\nThese are typical values for a large transmission pipeline.\n\nClick "Next" to continue.',
            placement: 'left',
            spotlightClicks: true,
            waitForElement: true,
            requiredAction: 'wizard-step-4-complete',
            disableOverlay: true,
          },
          {
            target: '[data-tour="wizard-step-5"]',
            title: 'Step 5: Review & Create',
            content: 'Review all your project settings.\n\nOnce satisfied, click "Create Project" to finalize and create your project.',
            placement: 'left',
            spotlightClicks: true,
            waitForElement: true,
            requiredAction: 'project-created',
            disableOverlay: true,
          },
        ]

      case 'dataset-fetching':
        return [
          {
            target: '[data-tour="sidebar-datasets"]',
            title: 'Dataset Coverage',
            content: 'Now let\'s fetch geospatial data for your project.\n\nClick "Datasets" in the sidebar to open the data acquisition interface.',
            placement: 'right',
            spotlightClicks: true,
            requiredAction: 'click-datasets',
          },
          {
            target: '[data-tour="dataset-dialog"]',
            title: 'Dataset Acquisition Dialog',
            content: 'This dialog allows you to fetch various geospatial datasets essential for pipeline routing and analysis.\n\nDatasets include elevation data, land cover, roads, waterways, and more.\n\nSelect the datasets you want to fetch using the checkboxes.',
            placement: 'center',
            waitForElement: true,
            isInformational: true,
          },
          {
            target: '[data-tour="fetch-datasets-btn"]',
            title: 'Fetch Datasets',
            content: 'After selecting your datasets (DEM, Land Cover, Roads, Waterways), click this button to begin downloading.\n\nThe system will retrieve data from various sources and preprocess it for your AOI.',
            placement: 'top',
            spotlightClicks: true,
            requiredAction: 'click-fetch-datasets',
          },
        ]

      case 'suppliers':
        return [
          {
            target: '[data-tour="sidebar-project-management"]',
            title: 'Project Management',
            content: 'Navigate to Project Management to access supplier information and project-level tools.\n\nClick this menu item to continue.',
            placement: 'right',
            spotlightClicks: true,
            requiredAction: 'click-project-management',
          },
          {
            target: '[data-tour="supplier-btn"]',
            title: 'Supplier Search',
            content: 'Click the Suppliers button to search for pipe manufacturers, equipment suppliers, and contractors.',
            placement: 'bottom',
            spotlightClicks: true,
            waitForElement: true,
            requiredAction: 'click-suppliers',
          },
          {
            target: '[data-tour="supplier-dialog"]',
            title: 'Supplier Search Dialog',
            content: 'This interface helps you find qualified suppliers for your pipeline project.\n\nCategories include:\n• Pipeline Manufacturers\n• Equipment Suppliers\n• Construction Contractors\n• Engineering Services\n\nExplore the options and close when ready.',
            placement: 'center',
            waitForElement: true,
            isInformational: true,
          },
        ]

      case 'pirl-ai':
        return [
          {
            target: '[data-tour="sidebar-digital-twin"]',
            title: 'Digital Twin View',
            content: 'Navigate to the Digital Twin view to access the 3D visualization and PIRL AI Agent.\n\nClick to continue.',
            placement: 'right',
            spotlightClicks: true,
            requiredAction: 'click-digital-twin',
          },
          {
            target: '[data-tour="sidebar-pirl-ai"]',
            title: 'PIRL AI Agent',
            content: 'Click to access the PIRL AI Agent - our intelligent pipeline routing and analysis system.',
            placement: 'right',
            spotlightClicks: true,
            waitForElement: true,
            requiredAction: 'click-pirl-ai',
          },
          {
            target: '[data-tour="pirl-dialog"]',
            title: 'Tour Complete!',
            content: 'Welcome to PIRL AI Studio!\n\nFrom here you can:\n• Request route optimization\n• Run risk assessments\n• Generate cost estimates\n• Analyze environmental impact\n\nYou\'ve completed the guided tour. Feel free to explore the platform!',
            placement: 'center',
            waitForElement: true,
            isInformational: true,
          },
        ]

      default:
        return []
    }
  }, [])

  const getCurrentSteps = useCallback(() => {
    return getTourSteps(currentPhase)
  }, [currentPhase, getTourSteps])

  const getCurrentStep = useCallback((): TourStep | null => {
    const steps = getCurrentSteps()
    return steps[currentStepIndex] || null
  }, [getCurrentSteps, currentStepIndex])

  // Get phases in order (excluding welcome and completed)
  const getActivePhases = useCallback((): TourPhase[] => {
    return ['intro', 'project-creation', 'dataset-fetching', 'suppliers', 'pirl-ai']
  }, [])

  const getTotalSteps = useCallback(() => {
    const phases = getActivePhases()
    return phases.reduce((total, phase) => total + getTourSteps(phase).length, 0)
  }, [getActivePhases, getTourSteps])

  const getGlobalStepIndex = useCallback(() => {
    const phases = getActivePhases()
    let globalIndex = 0
    for (const phase of phases) {
      if (phase === currentPhase) {
        return globalIndex + currentStepIndex
      }
      globalIndex += getTourSteps(phase).length
    }
    return globalIndex
  }, [currentPhase, currentStepIndex, getActivePhases, getTourSteps])

  const currentStepRequiresAction = useCallback(() => {
    const step = getCurrentStep()
    return step ? !!step.requiredAction && !step.isInformational : false
  }, [getCurrentStep])

  const startTour = useCallback(() => {
    setShowWelcomeDialog(false)
    setIsTourActive(true)
    setCurrentPhase('intro')
    setCurrentStepIndex(0)
  }, [])

  const skipTour = useCallback(() => {
    setShowWelcomeDialog(false)
    setIsTourActive(false)
  }, [])

  const dismissWelcomeDialog = useCallback(() => {
    setShowWelcomeDialog(false)
  }, [])

  const endTour = useCallback(() => {
    setIsTourActive(false)
    setCurrentPhase('completed')
    setHasCompletedTour(true)
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, 'true')
    }
  }, [])

  const nextStep = useCallback(() => {
    const steps = getTourSteps(currentPhase)
    if (currentStepIndex < steps.length - 1) {
      setCurrentStepIndex(prev => prev + 1)
    } else {
      // Move to next phase
      const phases = getActivePhases()
      const currentIndex = phases.indexOf(currentPhase)
      if (currentIndex < phases.length - 1) {
        setCurrentPhase(phases[currentIndex + 1])
        setCurrentStepIndex(0)
      } else {
        endTour()
      }
    }
  }, [currentPhase, currentStepIndex, getTourSteps, getActivePhases, endTour])

  const prevStep = useCallback(() => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(prev => prev - 1)
    } else {
      // Move to previous phase
      const phases = getActivePhases()
      const currentIndex = phases.indexOf(currentPhase)
      if (currentIndex > 0) {
        const prevPhase = phases[currentIndex - 1]
        const prevPhaseSteps = getTourSteps(prevPhase)
        setCurrentPhase(prevPhase)
        setCurrentStepIndex(prevPhaseSteps.length - 1)
      }
    }
  }, [currentStepIndex, currentPhase, getActivePhases, getTourSteps])

  const goToPhase = useCallback((phase: TourPhase) => {
    setCurrentPhase(phase)
    setCurrentStepIndex(0)
  }, [])

  const goToStep = useCallback((stepIndex: number) => {
    const steps = getCurrentSteps()
    if (stepIndex >= 0 && stepIndex < steps.length) {
      setCurrentStepIndex(stepIndex)
    }
  }, [getCurrentSteps])

  // Report an action - if it matches the current step's required action, advance
  const reportAction = useCallback((action: TourAction) => {
    if (!isTourActive) return

    const currentStep = getCurrentStep()
    if (currentStep && currentStep.requiredAction === action) {
      // Small delay to let UI update before advancing
      setTimeout(() => {
        nextStep()
      }, 300)
    }
  }, [isTourActive, getCurrentStep, nextStep])

  return (
    <OnboardingContext.Provider
      value={{
        isTourActive,
        currentPhase,
        currentStepIndex,
        showWelcomeDialog,
        startTour,
        skipTour,
        nextStep,
        prevStep,
        goToPhase,
        goToStep,
        endTour,
        reportAction,
        dismissWelcomeDialog,
        isYCDemo,
        getCurrentSteps,
        getCurrentStep,
        getTotalSteps,
        getGlobalStepIndex,
        currentStepRequiresAction,
        hasCompletedTour,
      }}
    >
      {children}
    </OnboardingContext.Provider>
  )
}

export function useOnboarding() {
  const context = useContext(OnboardingContext)
  if (context === undefined) {
    throw new Error('useOnboarding must be used within an OnboardingProvider')
  }
  return context
}
