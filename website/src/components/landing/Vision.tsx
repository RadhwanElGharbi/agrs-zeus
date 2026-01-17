'use client'

// Re-structure to be a unified Palantir-style layout with ZeusProduct
// This file will now export a single "PlatformSection" or we merge them.
// For now, I will refactor Vision to use the stark grid layout.

import { motion } from 'framer-motion'
import Image from 'next/image'

export const Vision = () => {
  return (
    <section id="zeus" className="relative border-t border-white/10 bg-black/80 backdrop-blur-sm scroll-mt-20">
      <div className="grid grid-cols-1 lg:grid-cols-2">
        {/* Left: Typography & Narrative */}
        <div className="p-8 md:p-16 lg:p-24 border-r border-white/10 flex flex-col justify-center">
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: false, amount: 0.4 }}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            <div className="mb-6 flex items-center gap-3">
              <div className="h-px w-8 bg-primary" />
              <span className="text-xs font-mono uppercase tracking-widest text-primary">
                ZEUS
              </span>
            </div>
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-serif text-white mb-8 leading-[0.95] tracking-tight">
              Building the <br />
              <span className="text-white/50">world of tomorrow</span>
            </h2>
            <p className="text-lg text-gray-400 leading-relaxed max-w-xl mb-12">
              Infrastructure development is broken and fragmented by manual workflows, disconnected data, and regulatory bottlenecks.
              <br /><br />
              Artemis replaces this with a single autonomous system: precision engineering at the speed of Artificial Intelligence.
            </p>
            
            <div className="grid grid-cols-2 gap-8 border-t border-white/10 pt-8">
              <div>
                <div className="text-3xl font-serif text-white mb-1">99%</div>
                <div className="text-[10px] font-mono uppercase tracking-widest text-gray-500">Precision</div>
              </div>
              <div>
                <div className="text-3xl font-serif text-white mb-1">100x</div>
                <div className="text-[10px] font-mono uppercase tracking-widest text-gray-500">Velocity</div>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Right: Stark Imagery */}
        <div className="flex flex-col justify-center">
          <div className="relative w-full aspect-[16/10] bg-black">
            <Image
              src="/images/showcase/gallery-5.png"
              alt="PIRL Autonomous Routes"
              fill
              className="object-cover object-left"
            />
            {/* Subtle gradient overlay to mesh with dark theme */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/25 to-transparent pointer-events-none" />
          </div>
          <div className="p-8 border-t border-white/10 bg-black/30 backdrop-blur-md">
            <h3 className="text-xl font-serif text-white mb-2">Autonomous Routing</h3>
            <p className="text-sm text-gray-400">PIRL agents generating and ranking compliant corridor candidates.</p>
          </div>
        </div>
      </div>

      {/* Engineering validation row (Hydraulics + CFD) */}
      {/* Moved to separate Engineering.tsx component for layout control */}
    </section>
  )
}
