'use client'

import { useCallback, useEffect, useState, useRef } from 'react'
import dynamic from 'next/dynamic'
import { useOnboarding } from '@/lib/context/OnboardingContext'
import { X, ChevronLeft, ChevronRight, SkipForward, CheckCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

// Dynamically import Joyride to avoid SSR issues
const Joyride = dynamic(() => import('react-joyride'), { ssr: false })

// Custom tooltip component matching the black/red theme
function CustomTooltip({
  continuous,
  index,
  step,
  backProps,
  closeProps,
  primaryProps,
  skipProps,
  tooltipProps,
  isLastStep: joyrideIsLastStep,
  size,
}: any) {
  const { getTotalSteps, getGlobalStepIndex, currentPhase, currentStepRequiresAction } = useOnboarding()
  const totalSteps = getTotalSteps()
  const globalIndex = getGlobalStepIndex()
  const requiresAction = currentStepRequiresAction()

  // Check if this is truly the last step globally (not just in current phase)
  const isLastStepGlobal = globalIndex === totalSteps - 1

  // Phase labels for progress display
  const phaseLabels: Record<string, string> = {
    'intro': 'Introduction',
    'project-creation': 'Project Creation',
    'dataset-fetching': 'Dataset Fetching',
    'suppliers': 'Suppliers',
    'pirl-ai': 'PIRL AI',
  }

  return (
    <div
      {...tooltipProps}
      className="bg-[#0a0a0a]/95 backdrop-blur-xl border border-white/10 rounded-sm shadow-[0_0_30px_-10px_rgba(0,0,0,0.8)] max-w-md animate-in fade-in slide-in-from-bottom-2 duration-300 overflow-hidden group"
    >
      {/* Decorative top line */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-red-500/50 to-transparent" />

      {/* Header with phase and progress */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/5 bg-white/[0.02]">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-2 h-2 bg-red-500 rounded-full" />
            <div className="absolute inset-0 w-2 h-2 bg-red-500 rounded-full animate-ping opacity-50" />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-mono text-red-500 uppercase tracking-widest font-bold">
              {phaseLabels[currentPhase] || currentPhase}
            </span>
            <span className="text-[9px] font-mono text-white/30 uppercase tracking-widest">
              Step {globalIndex + 1} <span className="text-white/10">/</span> {totalSteps}
            </span>
          </div>
        </div>
        <button
          {...closeProps}
          className="text-white/20 hover:text-white transition-colors p-1.5 hover:bg-white/5 rounded-sm"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Progress bar */}
      <div className="h-[1px] bg-white/5 w-full">
        <div
          className="h-full bg-red-500 shadow-[0_0_10px_rgba(220,38,38,0.5)] transition-all duration-500 ease-out"
          style={{ width: `${((globalIndex + 1) / totalSteps) * 100}%` }}
        />
      </div>

      {/* Content */}
      <div className="px-6 py-5 bg-[linear-gradient(to_right,#ffffff02_1px,transparent_1px),linear-gradient(to_bottom,#ffffff02_1px,transparent_1px)] bg-[size:16px_16px]">
        {step.title && (
          <h3 className="text-sm font-bold text-white uppercase tracking-wide mb-3 flex items-center gap-2">
            {step.title}
          </h3>
        )}
        <div className="text-xs text-white/70 leading-relaxed whitespace-pre-line font-mono">
          {step.content}
        </div>
      </div>

      {/* Footer with navigation */}
      <div className="flex items-center justify-between px-5 py-3 border-t border-white/5 bg-black/20">
        {/* Skip button */}
        <button
          {...skipProps}
          className="flex items-center gap-1.5 text-[10px] text-white/30 hover:text-white/50 transition-colors uppercase tracking-wider font-mono"
        >
          <SkipForward className="w-3 h-3" />
          <span>Skip</span>
        </button>

        {/* Navigation buttons */}
        <div className="flex items-center gap-2">
          {globalIndex > 0 && (
            <button
              {...backProps}
              className="flex items-center gap-1 px-3 py-1.5 text-[10px] font-mono uppercase tracking-wide text-white/50 hover:text-white border border-white/10 hover:border-white/20 rounded-sm transition-all hover:bg-white/5"
            >
              <ChevronLeft className="w-3 h-3" />
              <span>Back</span>
            </button>
          )}
          {/* Hide Next button if step requires action - show instruction instead */}
          {requiresAction ? (
            <div className="flex items-center gap-2 px-3 py-1.5 text-[10px] font-mono uppercase tracking-wide text-red-400/80 border border-red-500/20 rounded-sm bg-red-500/5 animate-pulse">
              <span>Action Required</span>
            </div>
          ) : (
            <button
              {...primaryProps}
              className={cn(
                "flex items-center gap-1.5 px-4 py-1.5 text-[10px] font-mono uppercase tracking-wide font-bold rounded-sm transition-all shadow-lg",
                isLastStepGlobal
                  ? "bg-red-600 hover:bg-red-500 text-white shadow-red-900/20"
                  : "bg-white text-black hover:bg-white/90 shadow-white/10"
              )}
            >
              <span>{isLastStepGlobal ? 'Finish' : 'Next'}</span>
              {isLastStepGlobal ? <CheckCircle className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export function GuidedTour() {
  const {
    isTourActive,
    currentPhase,
    currentStepIndex,
    getCurrentSteps,
    nextStep,
    prevStep,
    endTour,
    getTotalSteps,
    getGlobalStepIndex,
  } = useOnboarding()

  const [run, setRun] = useState(false)
  const [stepIndex, setStepIndex] = useState(0)
  const [waitingForElement, setWaitingForElement] = useState(false)
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Get current steps
  const currentSteps = getCurrentSteps()

  // Convert our steps to Joyride format
  const steps = currentSteps.map((step) => ({
    target: step.target,
    title: step.title,
    content: step.content,
    placement: (step.placement || 'auto') as 'auto' | 'top' | 'bottom' | 'left' | 'right' | 'center',
    disableBeacon: step.disableBeacon ?? true,
    spotlightClicks: step.spotlightClicks ?? false,
    hideCloseButton: step.hideCloseButton ?? false,
    hideBackButton: step.hideBackButton ?? false,
    disableOverlay: step.disableOverlay ?? false,
  }))

  // Check if element exists and is visible
  const elementExists = useCallback((selector: string): boolean => {
    if (typeof document === 'undefined') return false
    const element = document.querySelector(selector) as HTMLElement | null
    if (!element) return false
    // Check if element is visible using multiple methods
    // offsetParent is null for fixed elements, so also check dimensions
    const rect = element.getBoundingClientRect()
    const hasSize = rect.width > 0 && rect.height > 0
    const isVisible = element.offsetParent !== null ||
      (hasSize && getComputedStyle(element).visibility !== 'hidden')
    return isVisible
  }, [])

  // Track previous phase/step to detect transitions
  const prevPhaseRef = useRef(currentPhase)
  const prevStepRef = useRef(currentStepIndex)

  // Sync tour state with Joyride and handle element waiting
  useEffect(() => {
    const shouldRun = isTourActive && currentPhase !== 'welcome' && currentPhase !== 'completed'

    if (!shouldRun) {
      setRun(false)
      setWaitingForElement(false)
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current)
        checkIntervalRef.current = null
      }
      return
    }

    const currentStep = currentSteps[currentStepIndex]
    if (!currentStep) {
      setRun(false)
      return
    }

    // Detect phase or step transition - temporarily hide Joyride to force re-render
    const phaseChanged = prevPhaseRef.current !== currentPhase
    const stepChanged = prevStepRef.current !== currentStepIndex
    prevPhaseRef.current = currentPhase
    prevStepRef.current = currentStepIndex

    if (phaseChanged || stepChanged) {
      // Hide Joyride briefly to reset its state
      setRun(false)
    }

    // Check if we need to wait for element
    if (currentStep.waitForElement) {
      if (!elementExists(currentStep.target)) {
        setWaitingForElement(true)
        setRun(false)

        // Poll for element
        if (checkIntervalRef.current) {
          clearInterval(checkIntervalRef.current)
        }
        checkIntervalRef.current = setInterval(() => {
          if (elementExists(currentStep.target)) {
            setWaitingForElement(false)
            setStepIndex(currentStepIndex)
            // Small delay to ensure DOM is ready
            setTimeout(() => setRun(true), 50)
            if (checkIntervalRef.current) {
              clearInterval(checkIntervalRef.current)
              checkIntervalRef.current = null
            }
          }
        }, 300)
        return
      }
    }

    // Element exists or no waiting needed
    setWaitingForElement(false)
    setStepIndex(currentStepIndex)
    // Use setTimeout to ensure state updates in correct order after hiding
    setTimeout(() => setRun(true), 50)

    return () => {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current)
        checkIntervalRef.current = null
      }
    }
  }, [isTourActive, currentPhase, currentStepIndex, currentSteps, elementExists])

  const handleJoyrideCallback = useCallback((data: any) => {
    const { action, status, type } = data

    // Handle step navigation
    if (type === 'step:after') {
      if (action === 'next') {
        nextStep()
      } else if (action === 'prev') {
        prevStep()
      }
    }

    // Handle tour completion or skip
    if (status === 'finished' || status === 'skipped') {
      endTour()
    }

    // Handle close button
    if (action === 'close') {
      endTour()
    }
  }, [nextStep, prevStep, endTour])

  // Don't render if tour is not active or no steps
  if (!isTourActive || currentPhase === 'welcome' || currentPhase === 'completed') {
    return null
  }

  // Show waiting indicator if waiting for element
  if (waitingForElement) {
    return (
      <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
        <div className="bg-[#0a0a0a]/95 backdrop-blur-xl border border-white/10 rounded-sm p-8 max-w-sm text-center shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-red-500/50 to-transparent" />
          
          <div className="relative mb-6">
            <div className="w-10 h-10 border-2 border-white/10 border-t-red-500 rounded-full animate-spin mx-auto" />
            <div className="absolute inset-0 w-10 h-10 rounded-full shadow-[0_0_20px_rgba(220,38,38,0.2)]" />
          </div>
          
          <p className="text-white/90 text-sm font-bold uppercase tracking-wider mb-2">Waiting for action</p>
          <p className="text-white/40 text-xs font-mono leading-relaxed">Please complete the current action to proceed with the tour.</p>
          
          <button
            onClick={endTour}
            className="mt-6 px-4 py-2 text-[10px] font-mono uppercase tracking-wide text-white/30 hover:text-white border border-white/5 hover:border-white/20 rounded-sm transition-all hover:bg-white/5"
          >
            Skip Tour
          </button>
        </div>
      </div>
    )
  }

  if (!run || steps.length === 0) {
    return null
  }

  return (
    <Joyride
      steps={steps}
      run={run}
      stepIndex={stepIndex}
      continuous
      showProgress={false}
      showSkipButton
      hideCloseButton={false}
      disableOverlayClose
      disableScrolling={false}
      spotlightPadding={8}
      callback={handleJoyrideCallback}
      tooltipComponent={CustomTooltip}
      styles={{
        options: {
          zIndex: 10000,
          arrowColor: 'transparent',
        },
        spotlight: {
          borderRadius: 2,
          boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.9), 0 0 0 2px rgba(220, 38, 38, 0.5)',
        },
        overlay: {
          backgroundColor: 'rgba(0, 0, 0, 0.9)',
        },
        beacon: {
          display: 'none',
        },
        beaconInner: {
          display: 'none',
        },
        beaconOuter: {
          display: 'none',
        },
      }}
      floaterProps={{
        disableAnimation: false,
        styles: {
          arrow: {
            length: 8,
            spread: 12,
          },
        },
      }}
    />
  )
}
