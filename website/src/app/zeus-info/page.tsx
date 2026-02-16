'use client'

import { motion } from 'framer-motion'
import Image from 'next/image'
import { Lock } from 'lucide-react'
import { WireframeBackground } from '@/components/landing/WireframeBackground'
import { TopNav } from '@/components/landing/TopNav'

const galleryItems = [
  { id: 1, src: '/images/showcase/zeus-hero-map.png', title: 'Geospatial Workspace', description: 'Basemaps, terrain, and project layers. One view.' },
  { id: 2, src: '/images/showcase/zeus-suppliers.png', title: 'Supplier Intelligence', description: 'Find vendors by category, capability, and geography.' },
  { id: 4, src: '/images/showcase/gallery-1.png', title: 'Data Acquisition', description: 'Pull datasets for your AOI automatically.' },
  { id: 6, src: '/images/showcase/gallery-3.png', title: 'Engineering Analysis', description: 'Hydraulics and pressure design in context.' },
  { id: 8, src: '/images/showcase/gallery-5.png', title: 'AI Route Optimization', description: 'Ranked candidates from constraints, terrain, and cost signals.' },
  { id: 9, src: '/images/showcase/gallery-6.png', title: 'Route Comparison', description: 'Side-by-side metrics for every alternative.' },
  { id: 14, src: '/images/showcase/gallery-11.png', title: 'Alignment Sheets', description: 'Configurable templates. PDF export.' },
  { id: 17, src: '/images/showcase/gallery-14.png', title: 'Earthworks Estimation', description: 'Cut/fill signals from route geometry.' },
]

export default function ZeusInfoPage() {
  return (
    <main className="bg-black min-h-screen text-white selection:bg-primary/30 relative overflow-x-hidden">
      <div className="fixed inset-0 z-0 pointer-events-none"><WireframeBackground /><div className="absolute inset-0 bg-black/80 backdrop-blur-sm" /></div>
      <div className="relative z-10">
        <TopNav />
        <div className="container mx-auto px-0 pt-24 pb-12">
          <div className="px-4 md:px-8 mb-16 space-y-6 max-w-4xl mx-auto text-center">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-900/20 border border-red-500/30 text-red-400 text-xs font-mono uppercase tracking-widest mb-4"><Lock size={12} />Confidential - Proprietary Information</motion.div>
            <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="text-4xl md:text-6xl font-bold font-serif leading-tight">ZEUS <span className="text-primary">Inside the Platform</span></motion.h1>
            <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="text-xl text-gray-400 max-w-2xl mx-auto">Every capability. One workflow.</motion.p>
          </div>
          <div className="border-t border-white/10">
            {galleryItems.map((item, idx) => (
              <motion.section key={item.id} initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: false, amount: 0.3 }} transition={{ duration: 0.8 }} className="grid grid-cols-1 lg:grid-cols-2 border-b border-white/10">
                <div className={`p-8 md:p-16 lg:p-24 flex flex-col justify-center ${idx % 2 === 0 ? 'lg:order-1 border-r border-white/10' : 'lg:order-2'}`}>
                  <div className="mb-6 flex items-center gap-3"><span className="text-xs font-mono uppercase tracking-widest text-primary">{String(idx + 1).padStart(2, '0')}</span><div className="h-px w-8 bg-primary/50" /></div>
                  <h2 className="text-4xl md:text-5xl lg:text-6xl font-serif text-white mb-8 leading-[0.95] tracking-tight">{item.title}</h2>
                  <p className="text-lg text-gray-400 leading-relaxed">{item.description}</p>
                </div>
                <div className={`flex flex-col justify-center ${idx % 2 === 0 ? 'lg:order-2' : 'lg:order-1 border-r border-white/10'}`}>
                  <div className="relative w-full aspect-[16/10] bg-black"><Image src={item.src} alt={item.title} fill className="object-contain" /><div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent pointer-events-none" /></div>
                </div>
              </motion.section>
            ))}
          </div>
          <div className="mt-24 text-center text-gray-500 text-sm">&copy; {new Date().getFullYear()} Artemis Global Research Solutions Inc. All rights reserved.</div>
        </div>
      </div>
    </main>
  )
}
