import React from 'react'
import { Activity, Droplets, AlertTriangle, Maximize2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export function DigitalTwinView() {
  // Main view component replacing MapViewer
  
  return (
    <div className="relative w-full h-full bg-black overflow-hidden flex flex-col animate-in fade-in duration-300">
        
        {/* Header - Integrated into view */}
        <div className="h-14 border-b border-emerald-500/30 bg-emerald-950/30 flex items-center justify-between px-6 select-none z-50 relative">
          <div className="flex items-center gap-4">
            <div className="p-1.5 bg-emerald-500/10 rounded border border-emerald-500/20">
              <Activity className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <div className="font-mono font-bold text-emerald-400 tracking-widest uppercase text-sm">
                Digital Twin <span className="text-white/40 mx-2">|</span> Visualization
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
                <span className="text-[10px] text-emerald-500/70 font-mono uppercase tracking-wider">Live Feed Active</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="p-2 hover:bg-white/5 rounded text-white/40 hover:text-white transition-colors">
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Main Viewport */}
        <div className="flex-1 relative bg-gradient-to-b from-gray-900 to-black overflow-hidden group">
          
          {/* Image Container */}
          <div className="absolute inset-0 flex items-center justify-center bg-[#050505]">
             {/* Grid Background for "No Image" State */}
             <div className="absolute inset-0 opacity-20 bg-[linear-gradient(to_right,#10b981_1px,transparent_1px),linear-gradient(to_bottom,#10b981_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)]" />
             
             {/* The Image - User to replace src */}
             <img 
               src="/images/digital-twin-demo.jpg" 
               alt="Digital Twin Render" 
               className="w-full h-full object-cover opacity-90 transition-opacity duration-700"
               onError={(e) => {
                 e.currentTarget.style.display = 'none'
               }}
             />
             
             {/* Overlay Vignette */}
             <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.4)_100%)] pointer-events-none" />
             
             {/* Scanlines */}
             <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(0,0,0,0)_50%,rgba(0,0,0,0.2)_50%)] bg-[size:100%_4px] pointer-events-none opacity-30" />
          </div>

          {/* "Under Development" Badge */}
          <div className="absolute top-12 left-1/2 -translate-x-1/2 pointer-events-none z-30">
             <div className="relative flex flex-col items-center">
                <div className="absolute inset-0 bg-red-500 blur-3xl opacity-20 animate-pulse" />
                <div className="bg-black/90 text-red-500 font-black text-3xl px-8 py-3 uppercase tracking-[0.2em] border-y-2 border-red-500/50 shadow-[0_0_30px_rgba(239,68,68,0.4)] backdrop-blur-md transform skew-x-[-10deg]">
                  Under Development
                </div>
                <div className="mt-3 text-xs text-red-500/60 font-mono uppercase tracking-[0.3em] bg-black/50 px-4 py-1 rounded-full border border-red-500/10">
                  Integration Pending
                </div>
             </div>
          </div>

          {/* HUD Layer */}
          <div className="absolute inset-0 pointer-events-none">
            
            {/* SVG Connections Layer */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none z-0 opacity-60">
              <defs>
                <marker id="dot-emerald" markerWidth="4" markerHeight="4" refX="2" refY="2">
                  <circle cx="2" cy="2" r="1.5" fill="#10b981" />
                </marker>
                <marker id="dot-yellow" markerWidth="4" markerHeight="4" refX="2" refY="2">
                  <circle cx="2" cy="2" r="1.5" fill="#eab308" />
                </marker>
              </defs>
              {/* Top Left -> Center Pipeline */}
              <path d="M 320, 160 L 400, 160 L 550, 300" fill="none" stroke="#10b981" strokeWidth="1" markerEnd="url(#dot-emerald)" vectorEffect="non-scaling-stroke" />
              {/* Bottom Left -> Lower Pipeline */}
              <path d="M 320, 650 L 450, 650 L 600, 500" fill="none" stroke="#10b981" strokeWidth="1" markerEnd="url(#dot-emerald)" vectorEffect="non-scaling-stroke" />
              {/* Top Right -> Center Pipeline */}
              <path d="M calc(100% - 360px), 120 L calc(100% - 450px), 120 L calc(50% + 100px), 350" fill="none" stroke="#10b981" strokeWidth="1" markerEnd="url(#dot-emerald)" vectorEffect="non-scaling-stroke" />
              {/* Bottom Right -> Lower Pipeline */}
              <path d="M calc(100% - 360px), 650 L calc(100% - 450px), 650 L calc(50% + 150px), 550" fill="none" stroke="#eab308" strokeWidth="1" markerEnd="url(#dot-yellow)" vectorEffect="non-scaling-stroke" />
            </svg>

            {/* Top Left: Segment Info */}
            <div className="absolute top-24 left-12 pointer-events-auto">
              <div className="bg-black/80 backdrop-blur-md border-l-2 border-l-emerald-500 border-y border-r border-emerald-500/20 p-4 rounded-r-sm shadow-lg min-w-[280px] relative group">
                <div className="absolute -right-12 top-1/2 w-12 h-[1px] bg-emerald-500/50 hidden group-hover:block"></div>
                <div className="flex items-center justify-between mb-3 border-b border-emerald-500/20 pb-2">
                  <span className="text-emerald-400 text-[10px] font-mono uppercase tracking-widest">Target Segment</span>
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-white/50 text-xs font-mono">ID</span>
                    <span className="text-white font-mono text-sm font-bold">US-PL-TX-4092-A</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-white/50 text-xs font-mono">Length</span>
                    <span className="text-emerald-400 font-mono text-sm">50.0 m</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-white/50 text-xs font-mono">Location</span>
                    <span className="text-white/80 font-mono text-xs">31.968°N, 99.901°W</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Left: Health Monitor */}
            <div className="absolute bottom-24 left-12 pointer-events-auto">
               <div className="bg-black/80 backdrop-blur-md border border-emerald-500/30 p-5 rounded-sm shadow-lg min-w-[300px] group/health hover:border-emerald-500/50 transition-colors relative">
                 <div className="absolute -right-12 top-1/2 w-12 h-[1px] bg-emerald-500/50 hidden group-hover:block"></div>
                 <h3 className="text-emerald-400 text-xs font-mono uppercase mb-4 flex items-center gap-2 tracking-widest">
                   <Activity className="w-4 h-4" /> System Health Metrics
                 </h3>
                 <div className="space-y-4">
                   <div>
                     <div className="flex justify-between text-xs mb-1.5">
                       <span className="text-white/70 font-mono">Structural Integrity</span>
                       <span className="text-emerald-400 font-mono font-bold">98.5%</span>
                     </div>
                     <div className="h-1.5 bg-white/10 rounded-full overflow-hidden relative">
                       <div className="absolute inset-0 bg-emerald-500/20 animate-pulse" />
                       <div className="h-full bg-emerald-500 w-[98.5%] shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
                     </div>
                   </div>
                   <div>
                     <div className="flex justify-between text-xs mb-1.5">
                       <span className="text-white/70 font-mono">Coating Condition</span>
                       <span className="text-emerald-400 font-mono font-bold">94.2%</span>
                     </div>
                     <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                       <div className="h-full bg-emerald-500 w-[94.2%]" />
                     </div>
                   </div>
                   <div>
                     <div className="flex justify-between text-xs mb-1.5">
                       <span className="text-white/70 font-mono">Corrosion Index</span>
                       <span className="text-emerald-400 font-mono font-bold">Low (0.02)</span>
                     </div>
                     <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                       <div className="h-full bg-emerald-500 w-[2%]" />
                     </div>
                   </div>
                 </div>
              </div>
            </div>

            {/* Right Side: Hydraulics & Maintenance */}
            <div className="absolute top-24 right-12 space-y-4 pointer-events-auto flex flex-col items-end">
              
              {/* Hydraulics Panel */}
              <div className="w-80 bg-black/80 backdrop-blur-md border border-emerald-500/30 rounded-sm overflow-hidden shadow-lg relative group">
                 <div className="absolute -left-12 top-1/2 w-12 h-[1px] bg-emerald-500/50 hidden group-hover:block"></div>
                 <div className="bg-emerald-500/10 px-4 py-2 border-b border-emerald-500/20 flex justify-between items-center">
                   <h3 className="text-emerald-400 text-xs font-mono uppercase flex items-center gap-2 tracking-widest">
                     <Droplets className="w-3 h-3" /> Hydraulics Telemetry
                   </h3>
                   <span className="text-[9px] text-emerald-500/50 font-mono">REALTIME</span>
                 </div>
                 <div className="p-4 grid grid-cols-2 gap-3">
                   <div className="bg-emerald-950/30 p-2.5 rounded border border-emerald-500/10 hover:border-emerald-500/30 transition-colors">
                      <div className="text-[9px] text-emerald-500/60 uppercase mb-1 font-mono">Flow Rate</div>
                      <div className="flex items-baseline gap-1">
                        <div className="text-lg text-white font-mono font-bold">1,240</div>
                        <div className="text-[9px] text-white/40 font-mono">bbl/h</div>
                      </div>
                   </div>
                   <div className="bg-emerald-950/30 p-2.5 rounded border border-emerald-500/10 hover:border-emerald-500/30 transition-colors">
                      <div className="text-[9px] text-emerald-500/60 uppercase mb-1 font-mono">Pressure</div>
                      <div className="flex items-baseline gap-1">
                        <div className="text-lg text-white font-mono font-bold">845</div>
                        <div className="text-[9px] text-white/40 font-mono">PSI</div>
                      </div>
                   </div>
                   <div className="bg-emerald-950/30 p-2.5 rounded border border-emerald-500/10 hover:border-emerald-500/30 transition-colors">
                      <div className="text-[9px] text-emerald-500/60 uppercase mb-1 font-mono">Temperature</div>
                      <div className="flex items-baseline gap-1">
                        <div className="text-lg text-yellow-400 font-mono font-bold">45.2</div>
                        <div className="text-[9px] text-white/40 font-mono">°C</div>
                      </div>
                   </div>
                   <div className="bg-emerald-950/30 p-2.5 rounded border border-emerald-500/10 hover:border-emerald-500/30 transition-colors">
                      <div className="text-[9px] text-emerald-500/60 uppercase mb-1 font-mono">Viscosity</div>
                      <div className="flex items-baseline gap-1">
                        <div className="text-lg text-white font-mono font-bold">12.4</div>
                        <div className="text-[9px] text-white/40 font-mono">cSt</div>
                      </div>
                   </div>
                 </div>
              </div>

               {/* Maintenance Prediction */}
               <div className="w-80 bg-black/80 backdrop-blur-md border border-yellow-500/20 rounded-sm p-4 shadow-lg relative overflow-hidden mt-auto top-[400px] absolute right-0">
                  <div className="absolute -left-12 top-1/2 w-12 h-[1px] bg-yellow-500/50 hidden group-hover:block"></div>
                  <div className="absolute top-0 left-0 w-1 h-full bg-yellow-500/50" />
                  <div className="flex items-start gap-3 pl-2">
                     <div className="mt-1 text-yellow-500 animate-pulse">
                       <AlertTriangle className="w-4 h-4" />
                     </div>
                     <div>
                       <div className="text-yellow-500/80 text-[10px] font-mono uppercase mb-1 tracking-widest">Predictive Analysis</div>
                       <div className="text-white text-sm font-bold mb-1">Routine Check Recommended</div>
                       <div className="text-white/40 text-[10px] font-mono leading-tight">
                         Based on wear patterns, schedule inspection by:
                       </div>
                       <div className="text-yellow-400 font-mono text-lg mt-1 font-bold tracking-wide">
                         2026-01-15
                       </div>
                     </div>
                  </div>
               </div>

            </div>
          </div>

        </div>
    </div>
  )
}
