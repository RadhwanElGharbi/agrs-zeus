'use client'

import { motion } from 'framer-motion'
import Image from 'next/image'
import { Activity, FileCheck, Waves } from 'lucide-react'

export const Engineering = () => {
  return (
    <section id="engineering" className="relative border-t border-white/10 bg-black/80 backdrop-blur-sm scroll-mt-20">
      <div className="grid grid-cols-1 lg:grid-cols-2">
        {/* Text (Right on desktop) */}
        <div className="order-1 lg:order-2 p-8 md:p-16 lg:p-24 flex flex-col justify-center">
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: false, amount: 0.4 }}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            <div className="mb-6 flex items-center gap-3">
              <div className="h-px w-8 bg-primary" />
              <span className="text-xs font-mono uppercase tracking-widest text-primary">
                Engineering
              </span>
            </div>
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-serif text-white mb-8 leading-[0.95] tracking-tight">
              Engineering <br />
              <span className="text-white/50">that ships.</span>
            </h2>
            <p className="text-lg text-gray-400 leading-relaxed max-w-xl mb-10">
              Hydraulics, earthworks, and compliance checks built into the route workflow. No tool-switching.
            </p>

            <div className="space-y-6 mb-12">
              <div className="flex items-start gap-4">
                <Waves className="w-5 h-5 text-white/60 mt-1" />
                <div>
                  <h4 className="text-white font-bold text-sm">Hydraulics</h4>
                  <p className="text-gray-500 text-sm mt-1">Fluid and pipeline parameters per route.</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <Activity className="w-5 h-5 text-white/60 mt-1" />
                <div>
                  <h4 className="text-white font-bold text-sm">Earthworks</h4>
                  <p className="text-gray-500 text-sm mt-1">Elevation, crossings, and cut/fill signals.</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <FileCheck className="w-5 h-5 text-white/60 mt-1" />
                <div>
                  <h4 className="text-white font-bold text-sm">Compliance</h4>
                  <p className="text-gray-500 text-sm mt-1">Standards-aware checks with traceable outputs.</p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Image (Left on desktop) */}
        <div className="order-2 lg:order-1 flex flex-col justify-center lg:border-r border-white/10">
          <div className="relative w-full aspect-[16/10] bg-black">
            <Image
              src="/images/showcase/gallery-3.png"
              alt="Hydraulics modelling and CFD visualization"
              fill
              className="object-cover"
            />
            {/* Subtle gradient overlay to mesh with dark theme */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/25 to-transparent pointer-events-none" />
          </div>
          <div className="p-8 border-t border-white/10 bg-black/30 backdrop-blur-md">
            <h3 className="text-xl font-serif text-white mb-2">Engineering Workspace</h3>
            <p className="text-sm text-gray-400">Hydraulics, earthworks, and scenario comparison in one view.</p>
          </div>
        </div>
      </div>
    </section>
  )
}

