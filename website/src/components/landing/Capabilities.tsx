'use client'

import { motion } from 'framer-motion'
import Image from 'next/image'
import type { ComponentType } from 'react'
import { Activity, BarChart3, FileCheck, FileText, Layers, Map } from 'lucide-react'

type GalleryItem = {
  id: number
  src: string
  tag: string
  title: string
  description: string
  bullets: Array<{
    icon: ComponentType<{ className?: string }>
    title: string
    description: string
  }>
}

// Items 1, 2, 9, 13, 14, 17 are remaining after Vision (8) and Engineering (6) and ZeusProduct (4/1).
// Let's just render the ones not prominent on landing, or render a curated set.
// We will filter out ID 8 (Vision) and ID 6 (Engineering) to avoid duplication.
// ZeusProduct uses zeus-datasets (which is ID 4 conceptually).
// So we render: 1, 9, 2, 17. (Reordered)

const capabilityItems: GalleryItem[] = [
  {
    id: 1,
    src: '/images/showcase/zeus-hero-map.png',
    tag: 'Acquire',
    title: 'Data Acquisition',
    description:
      'Pulls the right datasets for your project area. Automatically.',
    bullets: [
      {
        icon: Map,
        title: 'Project area',
        description: 'Define AOI from geometry and scope.',
      },
      {
        icon: Layers,
        title: 'Multi-source',
        description: 'Terrain, infrastructure, land cover, environment.',
      },
      {
        icon: FileCheck,
        title: 'Clean layers',
        description: 'Standardized projections with full metadata.',
      },
    ],
  },
  {
    id: 9,
    src: '/images/showcase/gallery-6.png',
    tag: 'Compare',
    title: 'Route Comparison',
    description:
      'Side-by-side route analysis with consistent metrics.',
    bullets: [
      {
        icon: BarChart3,
        title: 'Trade studies',
        description: 'CAPEX, terrain, and feasibility signals.',
      },
      {
        icon: Layers,
        title: 'Risk signals',
        description: 'Feasibility, constructability, and permitting.',
      },
      {
        icon: FileCheck,
        title: 'Decision rationale',
        description: 'Clear summaries for stakeholders.',
      },
    ],
  },
  {
    id: 2,
    src: '/images/showcase/zeus-suppliers.png',
    tag: 'Plan',
    title: 'Supplier Intelligence',
    description:
      'Find vendors by scope, geography, and capability.',
    bullets: [
      {
        icon: Layers,
        title: 'Discovery',
        description: 'Search by category and service type.',
      },
      {
        icon: Map,
        title: 'Regional fit',
        description: 'Filter to corridor region.',
      },
      {
        icon: BarChart3,
        title: 'FEED inputs',
        description: 'Supplier context for early decisions.',
      },
    ],
  },
  {
    id: 17,
    src: '/images/showcase/gallery-14.png',
    tag: 'Estimate',
    title: 'Cost Estimation',
    description:
      'Quantity and cost signals from route geometry.',
    bullets: [
      {
        icon: BarChart3,
        title: 'Takeoffs',
        description: 'Automated from geometry and terrain.',
      },
      {
        icon: Activity,
        title: 'Scenario comparison',
        description: 'Cost and constructability deltas.',
      },
      {
        icon: FileText,
        title: 'Export',
        description: 'Summaries for FEED and downstream.',
      },
    ],
  },
]

export const Capabilities = () => {
  return (
    <div className="relative border-t border-white/10 bg-black/80 backdrop-blur-sm scroll-mt-20">
      {capabilityItems.map((item, idx) => (
        <section 
          key={item.id} 
          className="relative border-b border-white/10 last:border-b-0"
        >
          <div className="grid grid-cols-1 lg:grid-cols-2">
            {/* Text Side - Alternating Logic */}
            {/* 
               Vision (Top): Text Left / Image Right
               ZeusProduct (2nd): Image Left / Text Right
               Engineering (3rd): Text Left / Image Right
               
               So idx 0 (4th item overall) should be Image Left / Text Right to continue rhythm?
               Let's check page.tsx:
               1. Vision (L/R)
               2. ZeusProduct (R/L - image left)
               3. Engineering (L/R)
               
               So Capabilities start at 4.
               Item 0: Should be R/L (Image Left)
               Item 1: L/R
               Item 2: R/L
               ...
            */}
            
            {/* Text Column */}
            <div 
              className={`p-8 md:p-16 lg:p-24 flex flex-col justify-center ${
                idx % 2 === 0 ? 'lg:order-1 border-r border-white/10' : 'lg:order-2'
              }`}
            >
              <motion.div
                initial={{ opacity: 0, x: idx % 2 === 0 ? -50 : 50 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: false, amount: 0.4 }}
                transition={{ duration: 0.8, delay: 0.2 }}
              >
                <div className="mb-6 flex items-center gap-3">
                  <div className="h-px w-8 bg-primary" />
                  <span className="text-xs font-mono uppercase tracking-widest text-primary">
                    {item.tag}
                  </span>
                </div>
                
                <h2 className="text-4xl md:text-5xl lg:text-6xl font-serif text-white mb-8 leading-[0.95] tracking-tight">
                  {item.title}
                </h2>
                
                <p className="text-lg text-gray-400 leading-relaxed max-w-xl mb-10">
                  {item.description}
                </p>

                <div className="space-y-6">
                  {item.bullets.map((b, bIdx) => {
                    const Icon = b.icon
                    return (
                      <div key={bIdx} className="flex items-start gap-4">
                        <Icon className="w-5 h-5 text-white/60 mt-1" />
                        <div>
                          <h4 className="text-white font-bold text-sm">{b.title}</h4>
                          <p className="text-gray-500 text-sm mt-1">{b.description}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </motion.div>
            </div>

            {/* Image Column */}
            <div 
              className={`flex flex-col justify-center ${
                idx % 2 === 0 ? 'lg:order-2' : 'lg:order-1 border-r border-white/10'
              }`}
            >
              <div className="relative w-full aspect-[16/10] bg-black">
                <Image
                  src={item.src}
                  alt={item.title}
                  fill
                  className="object-contain"
                />
                {/* Subtle gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/25 to-transparent pointer-events-none" />
              </div>
            </div>
          </div>
        </section>
      ))}
    </div>
  )
}
