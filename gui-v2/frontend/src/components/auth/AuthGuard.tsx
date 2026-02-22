'use client'

import React, { ReactNode, useEffect, useCallback, useState } from 'react'
import Image from 'next/image'
import { useAuth } from '@/lib/context/AuthContext'
import { LoginPage } from './LoginPage'
import { trackEvent } from '@/lib/analytics'
import { cn } from '@/lib/utils'

interface AuthGuardProps {
  children: ReactNode
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { isAuthenticated, isLoading, user } = useAuth()
  const [showLoading, setShowLoading] = useState(true)
  const [isFading, setIsFading] = useState(false)

  // Manage loading screen transition
  useEffect(() => {
    if (!isLoading) {
      setIsFading(true)
      const timer = setTimeout(() => {
        setShowLoading(false)
      }, 1000) // Match css duration
      return () => clearTimeout(timer)
    }
  }, [isLoading])

  const requestFullscreen = useCallback(() => {
    if (window.electron?.setFullscreen) {
      window.electron.setFullscreen(true).catch((err) => {
        console.warn('Fullscreen request failed:', err)
      })
    }
  }, [])

  // Handle successful login - trigger fullscreen
  const handleLoginSuccess = useCallback(() => {
    requestFullscreen()
  }, [requestFullscreen])

  useEffect(() => {
    if (isAuthenticated && user) {
      trackEvent('session_start', 'AuthGuard', user.username, {
        role: user.role,
        company: user.company
      })
    }
  }, [isAuthenticated, user])

  // Render content (Login or App)
  // We render this even while loading screen is fading out so it's visible underneath
  const content = (!isLoading || isFading) ? (
    !isAuthenticated ? <LoginPage onLoginSuccess={handleLoginSuccess} /> : <>{children}</>
  ) : null

  return (
    <>
      {content}
      
      {/* Loading Overlay */}
      {showLoading && (
        <div 
          className={cn(
            "fixed inset-0 z-[100] flex items-center justify-center bg-black overflow-hidden transition-opacity duration-1000 ease-in-out pointer-events-none",
            isFading ? "opacity-0" : "opacity-100"
          )}
        >
          {/* Background grid */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:40px_40px]" />
          
          {/* Ambient Glow */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(220,38,38,0.1)_0%,transparent_60%)]" />

          <div className="relative z-10 flex items-center justify-center animate-in fade-in duration-700">
            <div className="relative w-96 h-48 transition-opacity duration-1000">
               <Image 
                 src="/agrs-logo.svg" 
                 alt="Artemis Global Research" 
                 fill 
                 className="object-contain drop-shadow-[0_0_30px_rgba(220,38,38,0.2)]" 
                 priority 
               />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
