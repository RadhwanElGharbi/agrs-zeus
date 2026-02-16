'use client'

import { motion } from 'framer-motion'
import Image from 'next/image'
import Link from 'next/link'
import { ChevronDown } from 'lucide-react'

export const Hero = () => {
  return (
    <section className="relative h-screen flex flex-col items-center justify-center overflow-hidden bg-transparent">
      {/* Ambient Glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(220,38,38,0.1)_0%,transparent_60%)]" />

      {/* Main Content */}
      <div className="relative z-10 flex flex-col items-center justify-center space-y-6 px-4 -mt-20">
        {/* Animated Logo - Digital/Holographic Fade In */}
        <motion.div
          initial="hidden"
          animate="visible"
          variants={{
            hidden: { 
              opacity: 0,
              scale: 0.95,
              filter: "blur(10px)", 
              clipPath: "inset(50% 0 50% 0)" 
            },
            visible: {
              opacity: 1, 
              scale: 1,
              filter: "blur(0px)", // Ensure filter is completely removed
              clipPath: "inset(0 0 0 0)", 
              transition: {
                duration: 1.2, 
                ease: "circOut",
                opacity: { duration: 0.8, times: [0, 0.4, 0.7, 1] }, 
                clipPath: { duration: 1.0, ease: "steps(8)" } 
              },
              transitionEnd: {
                 filter: "none", // Force removal of filter property
                 clipPath: "none" // Force removal of clipPath
              }
            }
          }}
          className="relative w-80 h-40 md:w-96 md:h-48"
          onAnimationComplete={() => {
            // Optional: You could use state here to switch to a static img if needed,
            // but ensuring filters are 'none' usually fixes the glow.
          }}
        >
          {/* Glitch slice effect - Slower and subtler */}
          <motion.div 
             className="absolute inset-0 opacity-0 mix-blend-screen"
             animate={{ 
               x: [-2, 2, -1, 0], 
               opacity: [0, 0.3, 0] // Start 0, flash to 0.3, end 0
             }}
             transition={{ duration: 1.0, delay: 0.2 }}
          >
             <Image
                src="/agrs-logo.svg"
                alt=""
                fill
                className="object-contain"
                priority
              />
          </motion.div>

          <Image
            src="/agrs-logo.svg"
            alt="Artemis Global Research Solutions Inc."
            fill
            className="object-contain drop-shadow-[0_0_30px_rgba(220,38,38,0.3)]"
            priority
          />
        </motion.div>

        {/* Brand clarity */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.0, duration: 0.6, ease: 'easeOut' }}
          className="text-center"
        >
          <p className="text-[11px] md:text-xs font-mono uppercase tracking-[0.28em] text-white/55">
            AI-Powered Infrastructure Operating System
          </p>
        </motion.div>

        {/* Primary CTA */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.15, duration: 0.6, ease: 'easeOut' }}
          className="flex flex-col sm:flex-row gap-3 items-center"
        >
          <Link
            href="/contact"
            className="inline-flex items-center justify-center h-12 px-8 bg-white text-black font-bold hover:bg-white/90 transition-all text-xs font-mono uppercase tracking-[0.18em]"
          >
            Contact Sales
          </Link>
        </motion.div>
      </div>

      {/* Scroll Indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5, duration: 1 }}
        className="absolute bottom-10 z-10"
      >
        <motion.div
          animate={{ y: [0, 10, 0] }}
          transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
          className="flex flex-col items-center gap-2 cursor-pointer text-gray-500 hover:text-white transition-colors"
        >
          <span className="text-xs uppercase tracking-[0.2em]">Scroll to Explore</span>
          <ChevronDown className="w-6 h-6" />
        </motion.div>
      </motion.div>
    </section>
  )
}
