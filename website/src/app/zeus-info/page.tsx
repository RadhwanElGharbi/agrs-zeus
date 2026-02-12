'use client'

import { motion } from 'framer-motion'
import Image from 'next/image'
import { Lock } from 'lucide-react'
import { WireframeBackground } from '@/components/landing/WireframeBackground'
import { TopNav } from '@/components/landing/TopNav'

const galleryItems = [
  { id: 1, src: '/images/showcase/zeus-hero-map.png', title: 'GIS Data Visualization', description: 'Interactive geospatial workspace combining satellite basemaps, terrain context, and project layers for corridor planning and engineering review.' },
  { id: 2, src: '/images/showcase/zeus-suppliers.png', title: 'Supplier & Supply Search Engine', description: 'Integrated supplier discovery and catalog search, organized by service category and project geography to accelerate procurement planning.' },
  { id: 4, src: '/images/showcase/gallery-1.png', title: 'Regional Dataset Catalog', description: 'AOI-aligned dataset directory curated by country and operational area, enabling rapid sourcing of compliant geospatial and environmental inputs.' },
  { id: 6, src: '/images/showcase/gallery-3.png', title: 'Hydraulics Modelling & Visualization', description: 'Hydraulics configuration and simulation view for pipeline design parameters, fluid properties, and real-time operational response.' },
  { id: 8, src: '/images/showcase/gallery-5.png', title: 'PIRL-Generated Machine Learning Routes', description: 'AI-generated corridor candidates displayed over terrain, enabling rapid exploration of feasible routes under engineering constraints.' },
  { id: 9, src: '/images/showcase/gallery-6.png', title: 'Route Comparison Interface', description: 'Side-by-side comparison of candidate routes with cost summary, segment metrics, and compliance checks for decision-grade selection.' },
  { id: 14, src: '/images/showcase/gallery-11.png', title: 'Alignment Sheet Generation Tool', description: 'Automated alignment sheet packaging with presets and output specifications, producing construction-ready PDF deliverables from the selected route.' },
  { id: 17, src: '/images/showcase/gallery-14.png', title: 'Earthworks Estimation Tool', description: 'Automated cut/fill estimation with mass haul and cross-section visualization to quantify earthworks volumes and support civil cost planning.' },
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
            <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="text-4xl md:text-6xl font-bold font-serif leading-tight">ZEUS <span className="text-primary">Platform Capabilities</span></motion.h1>
            <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="text-xl text-gray-400 max-w-2xl mx-auto">A closer look at the automated engineering interface. ZEUS integrates geospatial analysis, supply chain logistics, and regulatory compliance into a single autonomous workflow.</motion.p>
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
