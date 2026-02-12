'use client'

import { motion, useInView, useSpring, useTransform } from 'framer-motion'
import Link from 'next/link'
import { useEffect, useRef } from 'react'

function Counter({ value, suffix = '' }: { value: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: false, amount: 0.5 }) // Trigger when 50% visible
  const spring = useSpring(0, { mass: 0.8, stiffness: 75, damping: 15 })
  const display = useTransform(spring, (current) => Math.round(current))

  useEffect(() => {
    if (inView) {
      spring.set(value)
    } else {
      spring.set(0) // Reset on exit for re-trigger
    }
  }, [inView, spring, value])

  return (
    <span ref={ref} className="inline-flex">
      <motion.span>{display}</motion.span>
      {suffix}
    </span>
  )
}

export const About = () => {
  return (
    <section id="about" className="relative border-t border-white/10 bg-black backdrop-blur-md scroll-mt-20">
       <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[600px]">
         {/* Left Column: Stark statement */}
         <div className="lg:col-span-8 p-8 md:p-16 lg:p-24 border-b lg:border-b-0 lg:border-r border-white/10 flex flex-col justify-between">
           <motion.div
             initial={{ opacity: 0, y: 20 }}
             whileInView={{ opacity: 1, y: 0 }}
             viewport={{ once: false, amount: 0.4 }} // Increased threshold for delay feel
             transition={{ duration: 0.8, delay: 0.2 }} // Added delay
           >
             <div className="mb-8 flex items-center gap-3">
               <div className="h-px w-8 bg-white/40" />
               <span className="text-xs font-mono uppercase tracking-widest text-white/60">
                 Mission
               </span>
             </div>
             
             <h2 className="text-3xl md:text-5xl lg:text-6xl font-serif text-white mb-10 leading-tight">
               Systematic automation & optimization of <br />
               <span className="text-white/50">physical infrastructure.</span>
             </h2>
             
             <p className="text-lg text-gray-400 max-w-2xl leading-relaxed">
              We are a Canadian AI research lab. We build end‑to‑end AI systems that optimize critical infrastructure projects, powering EPCs with faster, decision‑grade engineering from feasibility through execution.
             </p>
           </motion.div>

           <div className="mt-16">
             <Link href="/contact" className="group inline-flex items-center gap-4">
               <span className="text-sm font-mono uppercase tracking-widest text-white group-hover:text-primary transition-colors">
                 Partner with Artemis
               </span>
               <div className="h-px w-12 bg-white/20 group-hover:bg-primary transition-colors" />
             </Link>
           </div>
         </div>

         {/* Right Column: Key Metrics / Data */}
         <div className="lg:col-span-4 bg-zinc-950/50 flex flex-col">
            {/* Metric 1: CAPEX (moved to top) */}
            <div className="flex-1 border-b border-white/10 p-10 flex flex-col justify-center">
              <div className="text-4xl font-serif text-white mb-2">
                <Counter value={12} suffix="%" />
              </div>
              <div className="text-xs font-mono uppercase tracking-widest text-gray-500">Capital Expenditure Savings</div>
            </div>
            
            {/* Metric 2: FEED (moved to middle) */}
            <div className="flex-1 border-b border-white/10 p-10 flex flex-col justify-center">
              <div className="text-4xl font-serif text-white mb-2">
                <Counter value={60} suffix="%" />
              </div>
              <div className="text-xs font-mono uppercase tracking-widest text-gray-500">Front-End Engineering Design (FEED) Time Saved</div>
            </div>
            
            {/* Metric 3: Precision (replaced Scalability) */}
            <div className="flex-1 p-10 flex flex-col justify-center">
              <div className="text-4xl font-serif text-white mb-2">
                <Counter value={99} suffix="%" />
              </div>
              <div className="text-xs font-mono uppercase tracking-widest text-gray-500">Precision in Regulatory Compliance</div>
            </div>
         </div>
       </div>
    </section>
  )
}
