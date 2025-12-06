'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Compass, Rocket, ChevronRight, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useOnboarding } from '@/lib/context/OnboardingContext'

export function WelcomeDialog() {
  const { showWelcomeDialog, startTour, skipTour, isYCDemo } = useOnboarding()
  const [mounted, setMounted] = useState(false)
  const [isClosing, setIsClosing] = useState(false)
  const [hoveredOption, setHoveredOption] = useState<'tour' | 'explore' | null>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (showWelcomeDialog) setIsClosing(false)
  }, [showWelcomeDialog])

  const handleStartTour = () => {
    setIsClosing(true)
    setTimeout(() => {
      startTour()
    }, 200)
  }

  const handleSkipTour = () => {
    setIsClosing(true)
    setTimeout(() => {
      skipTour()
    }, 200)
  }

  // Only render for yc-demo users when dialog should be shown
  if (!showWelcomeDialog || !isYCDemo || !mounted) return null

  return createPortal(
    <div className={cn(
      "fixed inset-0 z-[250] flex items-center justify-center bg-black/95 backdrop-blur-xl",
      isClosing ? "animate-fade-out" : "animate-fade-in"
    )}>
      {/* Background Effects */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(220,38,38,0.15),transparent_70%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:40px_40px]" />

      {/* Animated corner accents */}
      <div className="absolute top-0 left-0 w-32 h-32 border-l-2 border-t-2 border-red-500/30" />
      <div className="absolute top-0 right-0 w-32 h-32 border-r-2 border-t-2 border-red-500/30" />
      <div className="absolute bottom-0 left-0 w-32 h-32 border-l-2 border-b-2 border-red-500/30" />
      <div className="absolute bottom-0 right-0 w-32 h-32 border-r-2 border-b-2 border-red-500/30" />

      <div className="relative w-[650px] max-w-[90vw]">
        {/* Main Card */}
        <div className="bg-black/60 border border-white/10 rounded-sm overflow-hidden shadow-[0_0_80px_-20px_rgba(220,38,38,0.4)]">

          {/* Header */}
          <div className="relative px-8 pt-8 pb-6 border-b border-white/10 bg-gradient-to-b from-red-950/20 to-transparent">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-sm bg-red-500/20 border border-red-500/30 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white tracking-wide">
                  Welcome to <span className="text-red-500">AGRS ZEUS</span>
                </h2>
                <p className="text-[10px] text-white/40 font-mono uppercase tracking-widest">
                  Pipeline Intelligence Platform
                </p>
              </div>
            </div>
            <p className="text-sm text-white/60 leading-relaxed">
              Experience our comprehensive pipeline engineering platform. Choose how you&apos;d like to begin your session.
            </p>
          </div>

          {/* Options */}
          <div className="p-8 space-y-4">
            {/* Guided Tour Option */}
            <button
              onClick={handleStartTour}
              onMouseEnter={() => setHoveredOption('tour')}
              onMouseLeave={() => setHoveredOption(null)}
              className={cn(
                "w-full group relative overflow-hidden rounded-sm border transition-all duration-300",
                hoveredOption === 'tour'
                  ? "bg-red-500/10 border-red-500/50 shadow-[0_0_30px_-10px_rgba(220,38,38,0.5)]"
                  : "bg-white/[0.02] border-white/10 hover:bg-white/[0.04]"
              )}
            >
              <div className="relative z-10 p-5 flex items-center gap-4">
                <div className={cn(
                  "w-14 h-14 rounded-sm flex items-center justify-center transition-all duration-300",
                  hoveredOption === 'tour'
                    ? "bg-red-500/20 border border-red-500/40"
                    : "bg-white/5 border border-white/10"
                )}>
                  <Compass className={cn(
                    "w-7 h-7 transition-colors duration-300",
                    hoveredOption === 'tour' ? "text-red-500" : "text-white/50"
                  )} />
                </div>
                <div className="flex-1 text-left">
                  <h3 className={cn(
                    "text-base font-semibold transition-colors duration-300",
                    hoveredOption === 'tour' ? "text-red-500" : "text-white"
                  )}>
                    Guided Tour
                  </h3>
                  <p className="text-xs text-white/50 mt-1 leading-relaxed">
                    Step-by-step walkthrough of all platform features including project creation,
                    dataset management, supplier search, and AI-powered analysis.
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-[9px] text-white/30 font-mono uppercase">Estimated: 10-15 min</span>
                    <span className="text-[9px] text-red-500/60 font-mono uppercase">Recommended</span>
                  </div>
                </div>
                <ChevronRight className={cn(
                  "w-5 h-5 transition-all duration-300",
                  hoveredOption === 'tour'
                    ? "text-red-500 translate-x-1"
                    : "text-white/30"
                )} />
              </div>

              {/* Animated border glow */}
              {hoveredOption === 'tour' && (
                <div className="absolute inset-0 border border-red-500/30 rounded-sm animate-pulse pointer-events-none" />
              )}
            </button>

            {/* Explore Freely Option */}
            <button
              onClick={handleSkipTour}
              onMouseEnter={() => setHoveredOption('explore')}
              onMouseLeave={() => setHoveredOption(null)}
              className={cn(
                "w-full group relative overflow-hidden rounded-sm border transition-all duration-300",
                hoveredOption === 'explore'
                  ? "bg-white/[0.06] border-white/20"
                  : "bg-white/[0.02] border-white/10 hover:bg-white/[0.04]"
              )}
            >
              <div className="relative z-10 p-5 flex items-center gap-4">
                <div className={cn(
                  "w-14 h-14 rounded-sm flex items-center justify-center transition-all duration-300",
                  hoveredOption === 'explore'
                    ? "bg-white/10 border border-white/20"
                    : "bg-white/5 border border-white/10"
                )}>
                  <Rocket className={cn(
                    "w-7 h-7 transition-colors duration-300",
                    hoveredOption === 'explore' ? "text-white" : "text-white/50"
                  )} />
                </div>
                <div className="flex-1 text-left">
                  <h3 className={cn(
                    "text-base font-semibold transition-colors duration-300",
                    hoveredOption === 'explore' ? "text-white" : "text-white/80"
                  )}>
                    Explore Freely
                  </h3>
                  <p className="text-xs text-white/50 mt-1 leading-relaxed">
                    Jump straight into the platform and discover features at your own pace.
                    You can start the tour anytime from the help menu.
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-[9px] text-white/30 font-mono uppercase">Self-directed exploration</span>
                  </div>
                </div>
                <ChevronRight className={cn(
                  "w-5 h-5 transition-all duration-300",
                  hoveredOption === 'explore'
                    ? "text-white translate-x-1"
                    : "text-white/30"
                )} />
              </div>
            </button>
          </div>

          {/* Footer */}
          <div className="px-8 py-4 bg-white/[0.02] border-t border-white/5">
            <p className="text-[10px] text-white/30 text-center font-mono">
              AGRS ZEUS v2.0 | Y Combinator Demo Environment
            </p>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
