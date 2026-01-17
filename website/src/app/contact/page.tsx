'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import Link from 'next/link'

const CONTACT_EMAIL = 'radwan@agrsglobal.com'
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type Step = 'email' | 'message' | 'thank_you' | 'reveal'

export default function ContactPage() {
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  const emailInputRef = useRef<HTMLInputElement>(null)
  const messageInputRef = useRef<HTMLTextAreaElement>(null)

  const isEmailValid = useMemo(() => EMAIL_RE.test(email.trim()), [email])
  const isMessageValid = message.trim().length > 0

  // Focus management
  useEffect(() => {
    if (step === 'email') {
      setTimeout(() => emailInputRef.current?.focus(), 100)
    } else if (step === 'message') {
      setTimeout(() => messageInputRef.current?.focus(), 100)
    }
  }, [step])

  const handleEmailSubmit = () => {
    if (isEmailValid) {
      setStep('message')
    }
  }

  const handleFinalSubmit = async () => {
    if (!isEmailValid || !isMessageValid || isSubmitting) return

    setIsSubmitting(true)
    try {
      await fetch('/api/contact-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          message: message.trim(),
          page: '/contact',
          client_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          client_language: navigator.language,
          client_platform: navigator.platform,
          client_screen: `${window.screen.width}x${window.screen.height}`,
          client_viewport: `${window.innerWidth}x${window.innerHeight}`,
        }),
      })
    } catch {
      // Ignore errors for user experience
    } finally {
      setIsSubmitting(false)
      setStep('thank_you')
      
      setTimeout(() => {
        setStep('reveal')
      }, 2500)
    }
  }

  return (
    <main className="relative min-h-screen bg-neutral-900 text-white selection:bg-primary/30 overflow-hidden flex items-center justify-center px-4">
      {/* Subtle background */}
      <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(to_right,rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:48px_48px] opacity-40" />
      <Link
        href="/"
        className="absolute top-8 left-6 text-gray-300 hover:text-white transition-colors text-sm"
      >
        ← Back
      </Link>

      <div className="relative z-10 w-full max-w-md">
        <AnimatePresence>
          {(step === 'email' || step === 'message') && (
            <motion.h1
              initial={{ opacity: 0, y: -20 }}
              animate={step === 'message' ? { opacity: 1, y: -50 } : { opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.5, ease: 'easeInOut' }}
              className="text-3xl font-serif text-white mb-8 text-center"
            >
              Contact Form
            </motion.h1>
          )}
        </AnimatePresence>
        <AnimatePresence mode="wait">
          {/* Always show email input, push it up when step changes */}
          {(step === 'email' || step === 'message') && (
             <motion.div
               key="email-container"
               initial={false}
               animate={
                 step === 'message' ? { y: -50 } : { y: 0 }
               }
               exit={{ opacity: 0, scale: 0.95 }}
               transition={{ duration: 0.5, ease: 'easeInOut' }}
               className="relative"
             >
               <motion.div
                 initial={{ opacity: 0, y: 10, filter: 'blur(6px)' }}
                 animate={{ 
                   opacity: 1, 
                   y: 0, 
                   filter: 'blur(0px)' 
                 }}
                 transition={{ duration: 0.45 }}
                 className="w-full space-y-4"
               >
                  <input
                    ref={emailInputRef}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        handleEmailSubmit()
                      }
                    }}
                    placeholder="Enter your email"
                    className={[
                      'w-full bg-transparent text-white text-lg md:text-xl',
                      'outline-none',
                      'border-b border-white/20 focus:border-white',
                      'py-3',
                      'placeholder:text-white/60',
                      'transition-colors',
                      isEmailValid ? 'border-white/60' : '',
                    ].join(' ')}
                  />
                  {step === 'email' && (
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex justify-end"
                    >
                      <button
                        onClick={handleEmailSubmit}
                        disabled={!isEmailValid}
                        className={`text-sm uppercase tracking-widest font-mono transition-colors ${
                          isEmailValid ? 'text-white hover:text-white/80' : 'text-white/40 cursor-not-allowed'
                        }`}
                      >
                        Next →
                      </button>
                    </motion.div>
                  )}
               </motion.div>
             </motion.div>
          )}

          {step === 'message' && (
            <motion.div
              key="message-step"
              initial={{ opacity: 0, y: 20, filter: 'blur(10px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, scale: 0.95 }} // Fade away on submit
              transition={{ duration: 0.6, ease: 'easeOut' }}
              className="w-full space-y-6 mt-6"
            >
              <div className="space-y-2">
                <label className="text-xs font-mono uppercase tracking-widest text-white/60 block">
                  Message
                </label>
                <textarea
                  ref={messageInputRef}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && e.metaKey) {
                      e.preventDefault()
                      handleFinalSubmit()
                    }
                  }}
                  placeholder="How can we help?"
                  rows={4}
                  className="w-full bg-transparent text-white text-lg resize-none outline-none border-b border-white/20 focus:border-white py-2 placeholder:text-white/60 transition-colors"
                />
              </div>
              <div className="flex justify-end items-center gap-4">
                <span className="text-[10px] text-white/50 font-mono hidden sm:inline">
                  {/* Cmd+Enter to send */}
                </span>
                <button
                  onClick={handleFinalSubmit}
                  disabled={!isMessageValid || isSubmitting}
                  className={`px-6 py-2 bg-white text-black font-bold font-mono text-xs uppercase tracking-widest hover:bg-white/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {isSubmitting ? 'Sending...' : 'Submit'}
                </button>
              </div>
            </motion.div>
          )}

          {step === 'thank_you' && (
            <motion.div
              key="thank-you"
              initial={{ opacity: 0, scale: 0.95, filter: 'blur(6px)' }}
              animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, scale: 1.05, filter: 'blur(6px)' }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
              className="w-full text-center"
            >
              <h2 className="text-2xl md:text-3xl font-serif text-white mb-2">Thank you.</h2>
              <p className="text-white/80 font-mono text-sm uppercase tracking-widest">
                We will be in touch shortly.
              </p>
            </motion.div>
          )}

          {step === 'reveal' && (
            <motion.div
              key="reveal"
              initial={{ opacity: 0, y: 10, filter: 'blur(6px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
              className="w-full text-center space-y-4"
            >
              <p className="text-xs font-mono uppercase tracking-widest text-white/60">
                Direct Contact
              </p>
                <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="block text-white text-xl md:text-2xl font-mono tracking-wide hover:text-white/80 transition-colors"
              >
                {CONTACT_EMAIL}
              </a>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </main>
  )
}
