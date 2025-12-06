'use client'

import React, { useState, useEffect } from 'react'
import Image from 'next/image'
import { useAuth } from '@/lib/context/AuthContext'
import { trackEvent } from '@/lib/analytics'
import { Loader2, ArrowRight, Lock, User } from 'lucide-react'
import { cn } from '@/lib/utils'

interface LoginPageProps {
  onLoginSuccess?: () => void
}

export function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const { login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 })

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({
        x: (e.clientX / window.innerWidth) * 100,
        y: (e.clientY / window.innerHeight) * 100,
      })
    }

    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    trackEvent('login_attempt', 'LoginPage', username)

    const result = await login(username, password)

    if (result.success) {
      trackEvent('login_success', 'LoginPage', username)
      onLoginSuccess?.()
    } else {
      trackEvent('login_failed', 'LoginPage', username, { error: result.message })
      setError(result.message)
    }

    setIsLoading(false)
  }

  // Calculate if we are in a corner
  const isInCorner = () => {
    const { x, y } = mousePosition
    const threshold = 20 // 20% from corners
    
    const isTopLeft = x <= threshold && y <= threshold
    const isTopRight = x >= (100 - threshold) && y <= threshold
    const isBottomLeft = x <= threshold && y >= (100 - threshold)
    const isBottomRight = x >= (100 - threshold) && y >= (100 - threshold)
    
    return isTopLeft || isTopRight || isBottomLeft || isBottomRight
  }

  const showEasterEgg = isInCorner()

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden font-sans text-white bg-black">
      {/* Hidden Easter Egg Layer - Revealed only at corners with fade */}
      <div 
        className={cn(
          "absolute inset-0 z-0 transition-opacity duration-200 ease-in-out",
          showEasterEgg ? "opacity-100" : "opacity-0"
        )}
        style={{
          maskImage: `radial-gradient(circle 300px at ${mousePosition.x}% ${mousePosition.y}%, black 20%, transparent 60%)`,
          WebkitMaskImage: `radial-gradient(circle 300px at ${mousePosition.x}% ${mousePosition.y}%, black 20%, transparent 60%)`,
        }}
      >
        {/* Top Left - Mars */}
        <div className="absolute top-0 left-0 w-1/2 h-1/2 overflow-hidden">
           <Image 
             src="/mars.jpg" 
             alt="" 
             fill 
             className="object-cover opacity-80" 
             quality={50}
             priority
           />
        </div>
        {/* Top Right - Highway */}
        <div className="absolute top-0 right-0 w-1/2 h-1/2 overflow-hidden">
           <Image 
             src="/highway.gif" 
             alt="" 
             fill 
             className="object-cover opacity-80 mix-blend-screen" 
             unoptimized
           />
        </div>
        {/* Bottom Left - Railroad */}
        <div className="absolute bottom-0 left-0 w-1/2 h-1/2 overflow-hidden">
           <Image 
             src="/railroad.gif" 
             alt="" 
             fill 
             className="object-cover opacity-80 mix-blend-screen" 
             unoptimized
           />
        </div>
        {/* Bottom Right - Oil */}
        <div className="absolute bottom-0 right-0 w-1/2 h-1/2 overflow-hidden">
           <Image 
             src="/oil.gif" 
             alt="" 
             fill 
             className="object-cover opacity-80 mix-blend-screen" 
             unoptimized
           />
        </div>
      </div>

      {/* Dynamic Cursor-following Background */}
      <div 
        className="absolute inset-0 transition-opacity duration-1000 pointer-events-none"
        style={{
          background: `
            radial-gradient(
              circle at ${mousePosition.x}% ${mousePosition.y}%, 
              rgba(88, 28, 135, 0.15) 0%, 
              rgba(30, 58, 138, 0.15) 25%, 
              rgba(6, 78, 59, 0.15) 50%, 
              transparent 80%
            )
          `
        }}
      />
      
      {/* Moving Diagonal Grid */}
      <div className="absolute inset-0 bg-[linear-gradient(45deg,rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(-45deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none opacity-50" />
      
      {/* Vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_10%,#000000_100%)] pointer-events-none" />

      <div className="relative z-10 w-full max-w-md p-6">
        {/* Logo Section */}
        <div className="text-center mb-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="relative w-full h-24 flex items-center justify-center">
            <div className="relative w-64 h-32 transition-transform duration-700 hover:scale-105">
              <Image
                src="/logo.png"
                alt="Artemis Global Research"
                fill
                className="object-contain drop-shadow-[0_0_15px_rgba(255,255,255,0.1)]"
                priority
              />
            </div>
          </div>
        </div>

        {/* Login Card */}
        <div className="bg-black/60 backdrop-blur-xl border border-red-900/30 rounded-sm shadow-2xl animate-in fade-in slide-in-from-bottom-8 duration-700 delay-150 overflow-hidden group hover:border-red-900/50 transition-colors">
          {/* Header Line */}
          <div className="h-0.5 w-full bg-gradient-to-r from-transparent via-red-600 to-transparent opacity-80" />
          
          <div className="p-8">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-sm font-mono text-red-500 uppercase tracking-wider flex items-center gap-2">
                <Lock className="w-3 h-3" />
                System Access
              </h2>
              <div className="flex gap-1">
                <div className="w-1 h-1 rounded-full bg-red-500/40 animate-pulse" />
                <div className="w-1 h-1 rounded-full bg-red-500/20" />
                <div className="w-1 h-1 rounded-full bg-red-500/10" />
              </div>
            </div>

            {error && (
              <div className="mb-6 p-3 rounded-sm bg-red-950/30 border border-red-500/30 flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
                <div className="p-1 bg-red-500/20 rounded-full mt-0.5">
                  <Lock className="w-3 h-3 text-red-400" />
                </div>
                <div className="text-xs text-red-200/90 font-mono mt-0.5">{error}</div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-1.5">
                <label htmlFor="username" className="text-[10px] font-mono text-white/40 uppercase tracking-widest ml-1">
                  Username
                </label>
                <div className="relative group">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 group-focus-within:text-red-500 transition-colors">
                    <User className="w-4 h-4" />
                  </div>
                  <input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-sm text-sm text-white placeholder-white/20 focus:outline-none focus:border-red-500/50 focus:bg-white/10 transition-all font-mono group-hover:border-white/20"
                    placeholder="ENTER ID"
                    required
                    autoComplete="username"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="password" className="text-[10px] font-mono text-white/40 uppercase tracking-widest ml-1">
                  Password
                </label>
                <div className="relative group">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 group-focus-within:text-red-500 transition-colors">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-sm text-sm text-white placeholder-white/20 focus:outline-none focus:border-red-500/50 focus:bg-white/10 transition-all font-mono group-hover:border-white/20"
                    placeholder="••••••••"
                    required
                    autoComplete="current-password"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full mt-2 py-2.5 px-4 bg-gradient-to-r from-red-700 to-red-600 hover:from-red-600 hover:to-red-500 text-white text-sm font-bold uppercase tracking-wide rounded-sm transition-all shadow-[0_0_20px_-5px_rgba(185,28,28,0.4)] hover:shadow-[0_0_25px_-5px_rgba(220,38,38,0.6)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 group border border-red-500/20"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Authenticating...</span>
                  </>
                ) : (
                  <>
                    <span>Initialize Session</span>
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>
            </form>
          </div>
          
          {/* Footer Status */}
          <div className="bg-black/40 px-8 py-3 border-t border-white/5 flex items-center justify-between text-[10px] font-mono text-white/30">
            <span className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              SECURE TERMINAL
            </span>
            <span className="flex items-center gap-1.5">
              v2.0.0
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center animate-in fade-in slide-in-from-bottom-2 duration-700 delay-300">
          <p className="text-white/20 text-[10px] font-mono uppercase tracking-widest">
            &copy; {new Date().getFullYear()} Artemis Global Research Solutions
          </p>
        </div>
      </div>
    </div>
  )
}
