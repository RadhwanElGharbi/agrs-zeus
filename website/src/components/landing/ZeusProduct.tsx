'use client'

import { motion } from 'framer-motion'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, BarChart3, FileText, Layers, Map, Waves } from 'lucide-react'

export const ZeusProduct = () => {
  return (
    <section id="platform" className="relative border-t border-white/10 bg-black/80 backdrop-blur-sm scroll-mt-20">
      <div className="grid grid-cols-1 lg:grid-cols-2">
        {/* Right (now Left in standard flow, or alternate): Product Visual */}
        <div className="order-2 lg:order-1 relative min-h-[600px] border-r border-white/10 bg-zinc-950/50 flex flex-col">
           {/* Big stark screenshot */}
           <div className="relative w-full flex-1 min-h-[400px] bg-black">
              <Image
                src="/images/showcase/zeus-datasets.png"
                alt="ZEUS Platform Interface"
                fill
                className="object-cover object-top"
              />
              {/* Overlay to dim distraction */}
              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/40 pointer-events-none" />
           </div>
           
           <div className="p-8 border-t border-white/10 bg-black/30 backdrop-blur-md">
             <h3 className="text-xl font-serif text-white mb-2">Data Acquisition</h3>
             <p className="text-sm text-gray-400">Terrain, infrastructure, and environmental data for your project area. Automatic.</p>
           </div>
        </div>

        {/* Left (now Right): Narrative */}
        <div className="order-1 lg:order-2 p-8 md:p-16 lg:p-24 flex flex-col justify-center">
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: false, amount: 0.4 }}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            <div className="mb-6 flex items-center gap-3">
              <div className="h-px w-8 bg-primary" />
              <span className="text-xs font-mono uppercase tracking-widest text-primary">
                Platform
              </span>
            </div>
            
            <h2 className="text-4xl md:text-5xl font-serif text-white mb-6 leading-tight">
              ZEUS
            </h2>
            
            <p className="text-lg text-gray-400 leading-relaxed mb-10">
              One platform for route planning, engineering analysis, and project delivery. Built for pipeline and network infrastructure.
            </p>

            <div className="space-y-6 mb-12">
              <div className="flex items-start gap-4">
                <Map className="w-5 h-5 text-white/60 mt-1" />
                <div>
                  <h4 className="text-white font-bold text-sm">Unified Data</h4>
                  <p className="text-gray-500 text-sm mt-1">All project datasets in one workspace.</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <Waves className="w-5 h-5 text-white/60 mt-1" />
                <div>
                  <h4 className="text-white font-bold text-sm">AI Routing</h4>
                  <p className="text-gray-500 text-sm mt-1">Generate and rank route candidates automatically.</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <FileText className="w-5 h-5 text-white/60 mt-1" />
                <div>
                  <h4 className="text-white font-bold text-sm">Ship Deliverables</h4>
                  <p className="text-gray-500 text-sm mt-1">Alignment sheets, comparisons, and FEED packages.</p>
                </div>
              </div>
            </div>

            <Link href="/contact">
              <button className="group relative px-8 py-4 bg-white text-black font-bold tracking-wider overflow-hidden rounded-none hover:bg-white/90 transition-all w-full md:w-auto">
                <span className="relative z-10 flex items-center justify-center gap-2 font-mono text-xs uppercase tracking-[0.15em]">
                  Contact Sales <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </span>
              </button>
            </Link>
          </motion.div>
        </div>
      </div>
    </section>
  )
}

