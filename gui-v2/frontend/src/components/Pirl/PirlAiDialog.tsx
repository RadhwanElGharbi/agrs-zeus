'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useProject } from '@/lib/context/ProjectContext'
import { listPirlOutputs, type PirlOutput } from '@/lib/api/dataClient'
import { 
  X, Brain, Settings2, DollarSign, Activity, 
  ChevronRight, Play, RotateCcw, Save, Box,
  Layers, Ruler, AlertTriangle, CheckCircle2,
  Info, Droplet, Factory,
  Sparkles, Download, Map as MapIcon
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface PirlAiDialogProps {
  open: boolean
  onClose: () => void
}

type PirlSection = 'objectives' | 'hydraulics' | 'cost' | 'constraints' | 'review' | 'results'

export function PirlAiDialog({ open, onClose }: PirlAiDialogProps) {
  const { currentProject } = useProject()
  const [pirlResults, setPirlResults] = useState<PirlOutput[]>([])
  const [activeSection, setActiveSection] = useState<PirlSection>('objectives')
  const [isClosing, setIsClosing] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (open) {
      setIsClosing(false)
      if (currentProject) {
        listPirlOutputs(currentProject)
          .then(setPirlResults)
          .catch(console.error)
      }
    }
  }, [open, currentProject])

  const handleClose = () => {
    setIsClosing(true)
    setTimeout(() => {
      onClose()
      setActiveSection('objectives')
    }, 300)
  }

  if (!mounted || !open) return null

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 font-mono">
      <div
        className={cn(
          "absolute inset-0 bg-black/90 backdrop-blur-xl overflow-hidden",
          isClosing ? "animate-fade-out" : "animate-fade-in"
        )}
      >
        {/* Exclusive White & Gold Aurora Background */}
        <div className="absolute inset-0 animate-heartbeat">
          <div className="absolute inset-0 bg-[linear-gradient(90deg,#451a0344_0%,#b4530966_25%,#fbbf2444_50%,#b4530966_75%,#451a0344_100%)] bg-[length:200%_100%] animate-aurora" />
        </div>
        
        {/* Luxury Grid Overlay */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(251,191,36,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(251,191,36,0.05)_1px,transparent_1px)] bg-[size:40px_40px]" />
        
        {/* Vignette */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_10%,#000000_100%)]" />
      </div>

      <div
        className={cn(
          "relative z-10 w-[1400px] max-w-[95vw] h-[85vh] bg-[#050505]/95 border border-amber-500/20 rounded-sm shadow-[0_0_60px_rgba(245,158,11,0.15)] flex flex-col overflow-hidden",
          isClosing ? "animate-fade-out" : "animate-fade-in"
        )}
      >
        {/* Decorative Top Line */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-amber-500/50 to-transparent" />

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-amber-500/10 bg-black/40">
          <div className="flex items-center gap-4">
            <div className="p-2 rounded-sm bg-amber-500/10 border border-amber-500/20">
              <Brain className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-wider">PIRL AI <span className="text-amber-500">STUDIO</span></h2>
              <p className="text-[10px] text-amber-500/60 uppercase tracking-widest">Physics Informed Reinforcement Learning Suite</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-white/5 rounded-sm transition-colors text-white/60 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Main Layout */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left Sidebar Navigation */}
          <div className="w-64 bg-black/20 border-r border-amber-500/10 flex flex-col">
            <div className="p-4 space-y-1">
              {[
                { id: 'objectives', label: 'Objectives', icon: Target },
                { id: 'hydraulics', label: 'Hydraulics', icon: Activity },
                { id: 'cost', label: 'Cost Matrix', icon: DollarSign },
                { id: 'constraints', label: 'Constraints', icon: AlertTriangle },
                { id: 'review', label: 'Review & Launch', icon: Play },
                ...(pirlResults.length > 0 ? [{ id: 'results', label: 'Results', icon: Sparkles }] : [])
              ].map((item) => {
                const isActive = activeSection === item.id
                const Icon = item.icon
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveSection(item.id as PirlSection)}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-3 text-xs font-medium rounded-sm transition-all duration-300 relative group overflow-hidden",
                      isActive 
                        ? "text-amber-400 bg-amber-500/10 border border-amber-500/20" 
                        : "text-white/60 hover:text-white hover:bg-white/5 border border-transparent"
                    )}
                  >
                    <Icon className={cn("w-4 h-4", isActive ? "text-amber-400" : "text-white/40 group-hover:text-white/70")} />
                    <span className="tracking-wide uppercase">{item.label}</span>
                    {isActive && (
                      <div className="absolute right-0 top-0 bottom-0 w-0.5 bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.8)]" />
                    )}
                  </button>
                )
              })}
            </div>
            
            <div className="mt-auto p-4 border-t border-amber-500/10">
              <div className="p-3 bg-amber-500/5 border border-amber-500/10 rounded-sm">
                <h4 className="text-[10px] text-amber-500 font-bold uppercase tracking-widest mb-2">Model Status</h4>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_5px_#10b981]" />
                  <span className="text-xs text-white/80">PIRL-v2.4 Ready</span>
                </div>
              </div>
            </div>
          </div>

          {/* Center Content Area */}
          <div className="flex-1 flex flex-col bg-black/10 relative overflow-hidden">
            <div className="flex-1 overflow-y-auto p-8">
              {activeSection === 'objectives' && <ObjectivesSection />}
              {activeSection === 'hydraulics' && <HydraulicsSection />}
              {activeSection === 'cost' && <CostMatrixSection />}
              {activeSection === 'constraints' && <ConstraintsSection />}
              {activeSection === 'review' && <ReviewSection />}
              {activeSection === 'results' && <ResultsSection results={pirlResults} />}
            </div>
          </div>

          {/* Right 3D Visualization Placeholder */}
          <div className="w-[450px] bg-black/40 border-l border-amber-500/10 flex flex-col relative">
            <div className="p-3 border-b border-amber-500/10 bg-black/20 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Box className="w-4 h-4 text-amber-500" />
                <span className="text-xs font-bold text-white/80 uppercase tracking-wider">Real-time Simulation</span>
              </div>
              <div className="flex gap-1">
                <span className="px-1.5 py-0.5 text-[9px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-sm uppercase">Fluid Dynamics</span>
              </div>
            </div>
            
            <div className="flex-1 relative group cursor-crosshair overflow-hidden">
              {/* 3D Viewport Placeholder */}
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-8">
                <div className="w-24 h-24 border border-amber-500/20 rounded-full flex items-center justify-center mb-4 relative">
                  <div className="absolute inset-0 border border-amber-500/30 rounded-full animate-[spin_10s_linear_infinite]" />
                  <div className="absolute inset-2 border border-amber-500/10 rounded-full animate-[spin_15s_linear_infinite_reverse]" />
                  <Box className="w-8 h-8 text-amber-500/50" />
                </div>
                <h3 className="text-sm text-amber-500 font-bold uppercase tracking-widest mb-2">3D Pipeline Viewer</h3>
                <p className="text-xs text-white/40 font-mono max-w-[250px]">
                  Real-time visualization of pipeline cutaway, hydraulics simulation, and terrain interaction.
                  <br/><br/>
                  Waiting for parameter inputs...
                </p>
              </div>
              
              {/* Overlay Grid */}
              <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:20px_20px] pointer-events-none" />
            </div>

            {/* Mini Stats */}
            <div className="h-32 border-t border-amber-500/10 bg-black/20 p-4 grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <span className="text-[10px] text-white/40 uppercase block">Est. Flow Rate</span>
                <span className="text-sm font-mono text-amber-400">-- m³/s</span>
              </div>
              <div className="space-y-1">
                <span className="text-[10px] text-white/40 uppercase block">Pressure Drop</span>
                <span className="text-sm font-mono text-amber-400">-- MPa</span>
              </div>
              <div className="space-y-1">
                <span className="text-[10px] text-white/40 uppercase block">Reynolds No.</span>
                <span className="text-sm font-mono text-white/60">--</span>
              </div>
              <div className="space-y-1">
                <span className="text-[10px] text-white/40 uppercase block">Velocity</span>
                <span className="text-sm font-mono text-white/60">-- m/s</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

// --- Sub-components for Sections ---

function Target({ className }: { className?: string }) {
  return <TargetIcon className={className} />
}
import { Target as TargetIcon } from 'lucide-react'

function SectionHeader({ title, description }: { title: string, description: string }) {
  return (
    <div className="mb-8">
      <h3 className="text-2xl font-bold text-white mb-2 tracking-wide">{title}</h3>
      <p className="text-sm text-white/50 font-light max-w-2xl leading-relaxed">{description}</p>
    </div>
  )
}

function SliderInput({ label, defaultValue = 50 }: { label: string, defaultValue?: number }) {
  return (
    <div className="space-y-3">
      <div className="flex justify-between text-xs uppercase tracking-wider">
        <span className="text-white/70">{label}</span>
        <span className="text-amber-500">{defaultValue}%</span>
      </div>
      <div className="h-1.5 bg-white/10 rounded-full relative cursor-pointer group">
        <div 
          className="absolute top-0 left-0 bottom-0 bg-gradient-to-r from-amber-600 to-amber-400 rounded-full" 
          style={{ width: `${defaultValue}%` }} 
        />
        <div 
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-[0_0_10px_rgba(251,191,36,0.5)] opacity-0 group-hover:opacity-100 transition-opacity" 
          style={{ left: `${defaultValue}%` }} 
        />
      </div>
    </div>
  )
}

function ObjectivesSection() {
  return (
    <div className="animate-fade-in">
      <SectionHeader 
        title="Optimization Objectives" 
        description="Define the priorities for the PIRL routing algorithm. Adjust sliders to weight different factors such as construction cost, timeline, and regulatory hurdles." 
      />
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        <div className="space-y-8">
          <div className="bg-white/5 border border-white/10 p-6 rounded-sm space-y-6">
            <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-4">
              <h4 className="text-sm font-bold text-white uppercase tracking-widest">Primary Weights</h4>
              <Settings2 className="w-4 h-4 text-amber-500" />
            </div>
            <SliderInput label="Cost Optimization (CAPEX)" defaultValue={80} />
            <SliderInput label="Construction Speed (Time)" defaultValue={40} />
            <SliderInput label="Regulatory Minimization" defaultValue={60} />
            <SliderInput label="Environmental Impact" defaultValue={70} />
          </div>

          <div className="bg-white/5 border border-white/10 p-6 rounded-sm space-y-6">
            <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-4">
              <h4 className="text-sm font-bold text-white uppercase tracking-widest">Geometric Preferences</h4>
              <Ruler className="w-4 h-4 text-amber-500" />
            </div>
            <SliderInput label="Maximize Existing ROW Usage" defaultValue={90} />
            <SliderInput label="Minimize Crossings" defaultValue={50} />
            <SliderInput label="Terrain Flatness Preference" defaultValue={60} />
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-amber-500/5 border border-amber-500/20 p-6 rounded-sm">
            <h4 className="text-sm font-bold text-amber-400 uppercase tracking-widest mb-4">Routing Profiles</h4>
            <p className="text-xs text-white/50 mb-6">Create multiple routing profiles to compare different optimization strategies.</p>
            
            <div className="space-y-3">
              {['Cost Aggressive', 'Balanced Strategy', 'Timeline Critical'].map((profile, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-black/40 border border-white/10 hover:border-amber-500/50 transition-colors cursor-pointer rounded-sm group">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-sm bg-white/5 flex items-center justify-center font-mono text-xs text-white/40 group-hover:text-amber-400 transition-colors">
                      {i + 1}
                    </div>
                    <div>
                      <div className="text-sm text-white/90 font-medium">{profile}</div>
                      <div className="text-[10px] text-white/40 uppercase tracking-wider">{i === 0 ? 'Active' : 'Draft'}</div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-white/20 group-hover:text-amber-500 transition-colors" />
                </div>
              ))}
              
              <button className="w-full py-3 border border-dashed border-white/20 text-white/40 text-xs uppercase tracking-widest hover:bg-white/5 hover:text-white hover:border-white/40 transition-all rounded-sm mt-4">
                + Create New Profile
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function HydraulicsSection() {
  return (
    <div className="animate-fade-in space-y-8">
      <SectionHeader 
        title="Engineering & Hydraulics" 
        description="Configure detailed physical pipeline parameters, fluid composition, and mechanical design factors compliant with ASME B31.8/B31.4 standards." 
      />
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left Column: Mechanical & Geometry */}
        <div className="space-y-8">
          <div className="bg-white/5 border border-white/10 p-6 rounded-sm space-y-6 relative group">
            <div className="absolute top-0 left-0 w-1 h-full bg-amber-500/50 opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <h4 className="text-sm font-bold text-amber-500 uppercase tracking-widest">Mechanical Design</h4>
              <Settings2 className="w-4 h-4 text-amber-500/50" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <InputGroup label="Diameter (OD)" value="660.4" unit="mm" />
              <InputGroup label="Wall Thickness" value="11.1" unit="mm" />
              <InputGroup label="Grade (SMYS)" value="483" unit="MPa (X70)" />
              <InputGroup label="Location Class" value="1" unit="ASME" />
              <InputGroup label="Design Factor (F)" value="0.72" unit="-" />
              <InputGroup label="Joint Factor (E)" value="1.0" unit="-" />
              <InputGroup label="Temp Derating (T)" value="1.0" unit="-" />
              <InputGroup label="MAOP" value="9930" unit="kPa" />
            </div>
          </div>

          <div className="bg-white/5 border border-white/10 p-6 rounded-sm space-y-6 relative group">
             <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500/50 opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <h4 className="text-sm font-bold text-emerald-500 uppercase tracking-widest">Operating Conditions</h4>
              <Activity className="w-4 h-4 text-emerald-500/50" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <InputGroup label="Inlet Pressure" value="75.0" unit="Bar" />
              <InputGroup label="Del. Pressure (Min)" value="45.0" unit="Bar" />
              <InputGroup label="Flow Rate" value="1.0" unit="m³/s" />
              <InputGroup label="Inlet Temp" value="288.15" unit="K" />
              <InputGroup label="Ground Temp" value="283.15" unit="K" />
              <InputGroup label="Roughness" value="0.045" unit="mm" />
            </div>
          </div>
        </div>

        {/* Right Column: Fluid Composition */}
        <div className="space-y-8">
           <div className="bg-white/5 border border-white/10 p-6 rounded-sm space-y-6 relative group h-full">
            <div className="absolute top-0 right-0 w-1 h-full bg-blue-500/50 opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <h4 className="text-sm font-bold text-blue-400 uppercase tracking-widest">Fluid Composition (Gas)</h4>
              <div className="flex items-center gap-2">
                <span className="text-[9px] text-white/30 uppercase bg-white/5 px-2 py-0.5 rounded-sm">Chromatography</span>
                <Droplet className="w-4 h-4 text-blue-400/50" />
              </div>
            </div>
            
            <div className="space-y-4">
              <p className="text-xs text-white/40 italic">Define molar composition for Equation of State (EOS) calculations.</p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                <InputGroup label="Methane (C1)" value="92.5" unit="%" />
                <InputGroup label="Ethane (C2)" value="4.2" unit="%" />
                <InputGroup label="Propane (C3)" value="1.5" unit="%" />
                <InputGroup label="Butane+ (C4+)" value="0.8" unit="%" />
                <InputGroup label="Nitrogen (N2)" value="0.6" unit="%" />
                <InputGroup label="Carbon Dioxide (CO2)" value="0.4" unit="%" />
                <InputGroup label="Hydrogen Sulfide" value="0.0" unit="ppm" />
                <InputGroup label="Water Content" value="< 7" unit="lbs/MMscf" />
              </div>
              
              <div className="mt-6 pt-6 border-t border-white/10 grid grid-cols-2 gap-4">
                <InputGroup label="Specific Gravity" value="0.58" unit="Calc." />
                <InputGroup label="Viscosity" value="1.1e-5" unit="Pa·s" />
                <InputGroup label="Crit. Pressure" value="46.0" unit="Bar" />
                <InputGroup label="Crit. Temp" value="190.6" unit="K" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function InputGroup({ label, value, unit }: { label: string, value: string, unit?: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-end">
        <label className="text-[10px] text-white/50 uppercase tracking-wider">{label}</label>
        {unit && <span className="text-[9px] text-white/30 font-mono">{unit}</span>}
      </div>
      <div className="relative group">
        <input 
          type="text" 
          defaultValue={value}
          className="w-full bg-black/40 border border-white/10 text-white text-sm px-3 py-2 rounded-sm focus:outline-none focus:border-amber-500/50 focus:bg-amber-500/5 transition-all font-mono group-hover:border-white/20"
        />
        <div className="absolute bottom-0 left-0 h-[1px] bg-amber-500 w-0 group-focus-within:w-full transition-all duration-300" />
      </div>
    </div>
  )
}

function CostMatrixSection() {
  const [costTab, setCostTab] = useState<'base' | 'terrain' | 'crossings' | 'factors'>('base')

  return (
    <div className="animate-fade-in h-full flex flex-col">
      <SectionHeader 
        title="Cost Matrix Configuration" 
        description="Comprehensive cost factors for O&G pipeline route optimization. Defines granular multipliers and rates for the PIRL reward function." 
      />
      
      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-white/10 mb-6">
        {[
          { id: 'base', label: 'Base Construction', icon: DollarSign },
          { id: 'terrain', label: 'Terrain & Land', icon: Layers },
          { id: 'crossings', label: 'Crossings', icon: Activity },
          { id: 'factors', label: 'Regional & Regulatory', icon: Settings2 }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setCostTab(tab.id as any)}
            className={cn(
              "flex items-center gap-2 px-6 py-3 text-xs font-bold uppercase tracking-widest transition-all relative",
              costTab === tab.id 
                ? "text-amber-400 bg-white/5 border-t border-x border-white/10 rounded-t-sm" 
                : "text-white/40 hover:text-white hover:bg-white/5"
            )}
          >
            <tab.icon className="w-3 h-3" />
            {tab.label}
            {costTab === tab.id && <div className="absolute bottom-[-1px] left-0 right-0 h-[1px] bg-[#050505]" />}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto pr-2 pb-4 custom-scrollbar">
        {costTab === 'base' && <BaseConstructionTab />}
        {costTab === 'terrain' && <TerrainLandTab />}
        {costTab === 'crossings' && <CrossingsTab />}
        {costTab === 'factors' && <RegionalFactorsTab />}
      </div>
    </div>
  )
}

function CostTable({ headers, rows }: { headers: string[], rows: any[][] }) {
  return (
    <div className="border border-white/10 rounded-sm overflow-hidden mb-8">
      <table className="w-full text-left text-sm">
        <thead className="bg-white/5 text-[10px] uppercase tracking-wider text-white/60">
          <tr>
            {headers.map((h, i) => <th key={i} className="px-4 py-3 font-medium">{h}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5 text-white/80 font-mono text-xs">
          {rows.map((row, i) => (
            <tr key={i} className="hover:bg-white/5 transition-colors">
              {row.map((cell, j) => (
                <td key={j} className={cn("px-4 py-3", j === 0 ? "font-sans text-white/90" : "text-white/60")}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function BaseConstructionTab() {
  return (
    <div className="space-y-6">
      <div>
        <h4 className="text-sm font-bold text-amber-500 uppercase tracking-widest mb-4">Material Costs (Pipe)</h4>
        <CostTable 
          headers={['Diameter', 'Wall Thickness', 'Grade', 'Cost per Meter', 'Weight (kg/m)']}
          rows={[
            ['8" (219mm)', '6.4mm', 'X52', '$45 - $70', '27'],
            ['12" (323mm)', '7.9mm', 'X52', '$85 - $130', '62'],
            ['24" (610mm)', '11.1mm', 'X65', '$280 - $400', '168'],
            ['30" (762mm)', '12.7mm', 'X65', '$450 - $650', '242'],
            ['36" (914mm)', '14.3mm', 'X70', '$650 - $900', '328'],
            ['48" (1219mm)', '17.5mm', 'X70', '$1,200 - $1,700', '541'],
          ]} 
        />
      </div>

      <div>
        <h4 className="text-sm font-bold text-amber-500 uppercase tracking-widest mb-4">Labor Rates (Hourly)</h4>
        <CostTable 
          headers={['Region', 'Welder', 'Equipment Operator', 'Laborer', 'Engineer']}
          rows={[
            ['USA', '$60-90', '$45-70', '$25-40', '$100-150'],
            ['Canada', '$55-85', '$40-65', '$22-38', '$90-140'],
            ['Western Europe', '$50-80', '$35-60', '$20-35', '$90-130'],
            ['Middle East', '$35-60', '$25-45', '$12-25', '$70-110'],
          ]} 
        />
      </div>

      <div>
        <h4 className="text-sm font-bold text-amber-500 uppercase tracking-widest mb-4">Equipment Rental (Daily)</h4>
        <CostTable 
          headers={['Equipment', 'Capacity', 'Daily Rate', 'Monthly Rate']}
          rows={[
            ['Excavator', '50-ton', '$600 - $1,000', '$15,000 - $25,000'],
            ['Sideboom', '90-ton', '$800 - $1,300', '$20,000 - $32,000'],
            ['HDD Rig', 'Large (500-ton)', '$15,000 - $30,000', '$375,000 - $750,000'],
            ['Crane', '200-ton', '$2,500 - $4,500', '$60,000 - $110,000'],
          ]} 
        />
      </div>
    </div>
  )
}

function TerrainLandTab() {
  return (
    <div className="space-y-6">
      <div>
        <h4 className="text-sm font-bold text-amber-500 uppercase tracking-widest mb-4">Terrain Multipliers</h4>
        <CostTable 
          headers={['Terrain Type', 'Cost Multiplier', 'Cost per km', 'Rationale']}
          rows={[
            ['Flat Terrain (0-2°)', '1.0 (Baseline)', '$0.5M - $1.0M', 'Standard trenching'],
            ['Moderate Slopes (5-15°)', '1.3 - 1.5', '$0.65M - $1.5M', 'Grading, erosion control'],
            ['Steep Slopes (>30°)', '2.0 - 3.0', '$1.0M - $3.0M', 'Blasting, retaining walls'],
            ['Swamp/Wetland', '2.0 - 3.5', '$1.0M - $3.5M', 'Mats, floating equipment'],
            ['Urban Areas', '2.5 - 4.0', '$1.25M - $4.0M', 'Utilities, permits, traffic'],
            ['Permafrost', '2.5 - 4.0', '$1.25M - $4.0M', 'Elevated design, insulation'],
          ]} 
        />
      </div>

      <div>
        <h4 className="text-sm font-bold text-amber-500 uppercase tracking-widest mb-4">ROW Acquisition (USA Avg)</h4>
        <CostTable 
          headers={['Land Use', 'Permanent Easement ($/acre)', 'Temporary Easement', 'Total per km (50\' ROW)']}
          rows={[
            ['Cropland (Prime)', '$3,000 - $8,000', '$500 - $1,500', '$20k - $60k'],
            ['Forest Land', '$2,000 - $6,000', '$400 - $1,000', '$15k - $45k'],
            ['Urban/Suburban', '$20,000 - $100,000+', '$3,000 - $15,000', '$150k - $750k'],
            ['Desert/Arid', '$500 - $2,000', '$100 - $400', '$3k - $15k'],
          ]} 
        />
      </div>
    </div>
  )
}

function CrossingsTab() {
  return (
    <div className="space-y-6">
      <div>
        <h4 className="text-sm font-bold text-amber-500 uppercase tracking-widest mb-4">Water Crossings</h4>
        <CostTable 
          headers={['Type', 'Width', 'Open Cut ($/m)', 'HDD Cost ($/m)', 'HDD Multiplier']}
          rows={[
            ['Small Stream', '<3m', '$500 - $1,000', '$1,000 - $2,000', '2x'],
            ['Medium River', '3-10m', '$1,000 - $3,000', '$2,000 - $9,000', '2-3x'],
            ['Large River', '>10m', '$3,000 - $10,000', '$6,000 - $40,000', '2-4x'],
            ['Lake/Reservoir', 'N/A', 'N/A', '$10,000 - $50,000', 'Deep HDD'],
          ]} 
        />
      </div>

      <div>
        <h4 className="text-sm font-bold text-amber-500 uppercase tracking-widest mb-4">Infrastructure Crossings</h4>
        <CostTable 
          headers={['Infrastructure', 'Cost per Crossing', 'Method', 'Notes']}
          rows={[
            ['Tertiary Road', '$50k - $100k', 'Open cut/HDD', 'Low traffic'],
            ['Highway/Motorway', '$400k - $1.0M', 'HDD Required', 'Major disruption'],
            ['Heavy Rail', '$150k - $300k', 'HDD Required', '5-8m depth'],
            ['Gas/Oil Pipeline', '$50k - $200k', 'Coordination', 'Safety clearances'],
            ['Power Line (>400kV)', '$150k - $300k', 'HDD Required', '10-15m clearance'],
          ]} 
        />
      </div>
    </div>
  )
}

function RegionalFactorsTab() {
  return (
    <div className="space-y-6">
      <div>
        <h4 className="text-sm font-bold text-amber-500 uppercase tracking-widest mb-4">Regional Cost Multipliers</h4>
        <CostTable 
          headers={['Region', 'Cost per km', 'Labor Index', 'Material Index', 'Notes']}
          rows={[
            ['USA (Lower 48)', '$0.8M - $1.5M', '1.0', '1.0', 'Baseline'],
            ['USA (Alaska)', '$1.2M - $2.5M', '1.3', '1.4', 'Remote, logistics'],
            ['Canada (South)', '$0.7M - $1.3M', '0.9', '0.95', 'Similar to USA'],
            ['Middle East', '$0.5M - $1.0M', '0.6', '1.0', 'Imported labor'],
            ['Western Europe', '$0.9M - $1.8M', '1.1', '1.05', 'High regulation'],
          ]} 
        />
      </div>

      <div>
        <h4 className="text-sm font-bold text-amber-500 uppercase tracking-widest mb-4">Permitting & Environmental</h4>
        <CostTable 
          headers={['Item', 'Cost Range', 'Timeline/Notes']}
          rows={[
            ['Federal Permits', '$500k - $2.0M', '12-24 months'],
            ['Environmental Impact', '$200k - $1.0M', '6-12 months'],
            ['Wetland Mitigation', '$50k - $200k / acre', 'Per impact acre'],
            ['Cultural/Arch. Survey', '$5k - $20k / km', 'Sensitive areas'],
          ]} 
        />
      </div>

      <div>
        <h4 className="text-sm font-bold text-amber-500 uppercase tracking-widest mb-4">Indirect Costs & Facilities</h4>
        <CostTable 
          headers={['Item', 'Cost', 'Description']}
          rows={[
            ['Engineering & PM', '10% - 15%', 'Of Total Install Cost (TIC)'],
            ['Contingency', '15% - 30%', 'AACE Class 4 Estimate'],
            ['Insurance & Legal', '2% - 5%', 'Project specific'],
            ['Pump/Comp Station', '$25M - $50M', 'Per station (approx 100km)'],
            ['Block Valve Station', '$0.5M - $1.5M', 'Every 30km'],
            ['Pigging Launcher/Receiver', '$1.0M - $2.5M', 'At start/end points'],
          ]} 
        />
      </div>
    </div>
  )
}

function ConstraintsSection() {
  return (
    <div className="animate-fade-in space-y-8">
      <SectionHeader 
        title="Constraints & Constructability" 
        description="Define hard geographical exclusions and engineering constructability limits. The PIRL agent will be penalized heavily for violating these boundaries." 
      />
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        <div className="space-y-6">
          <h4 className="text-xs font-bold text-amber-500 uppercase tracking-widest border-b border-amber-500/20 pb-2">Geographical Exclusions</h4>
          <div className="grid grid-cols-1 gap-3">
            {[
              { label: 'Protected Areas', desc: 'National Parks, Wildlife Reserves (IUCN I-IV)', active: true },
              { label: 'Urban Density', desc: 'High density residential > 1000/km²', active: true },
              { label: 'Indigenous Lands', desc: 'Recognized tribal/indigenous territories', active: true },
              { label: 'Water Bodies', desc: 'Avoid large lakes (> 5km crossing)', active: true },
              { label: 'Cultural Heritage', desc: 'Archaeological sites & buffer zones', active: false },
              { label: 'Military Zones', desc: 'Restricted airspace and ground usage', active: true },
              { label: 'Geohazards', desc: 'High seismic/landslide risk zones', active: true },
            ].map((constraint, i) => (
              <div key={i} className={cn(
                "p-3 border rounded-sm flex items-center gap-4 transition-all cursor-pointer group",
                constraint.active 
                  ? "bg-amber-500/5 border-amber-500/30" 
                  : "bg-white/5 border-white/10 opacity-60 hover:opacity-100"
              )}>
                <button className={cn(
                  "w-5 h-5 rounded-sm border flex items-center justify-center transition-colors",
                  constraint.active ? "bg-amber-500 border-amber-500 text-black" : "border-white/30 hover:border-white/50"
                )}>
                  {constraint.active && <CheckCircle2 className="w-3.5 h-3.5" />}
                </button>
                <div className="flex-1">
                  <h4 className={cn("text-xs font-bold uppercase tracking-wide", constraint.active ? "text-white" : "text-white/50")}>
                    {constraint.label}
                  </h4>
                  <p className="text-[10px] text-white/40">{constraint.desc}</p>
                </div>
                <div className={cn("w-2 h-2 rounded-full", constraint.active ? "bg-red-500 shadow-[0_0_5px_#ef4444]" : "bg-white/10")} />
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <h4 className="text-xs font-bold text-amber-500 uppercase tracking-widest border-b border-amber-500/20 pb-2">Constructability Limits</h4>
          <div className="bg-white/5 border border-white/10 p-6 rounded-sm space-y-6">
             <div className="grid grid-cols-2 gap-4">
              <InputGroup label="Max Slope (Long.)" value="30" unit="Degrees" />
              <InputGroup label="Max Side Slope" value="15" unit="Degrees" />
              <InputGroup label="Min Bend Radius" value="20" unit="x Diameter" />
              <InputGroup label="Max Bend Angle" value="90" unit="Degrees" />
              <InputGroup label="Min Depth of Cover" value="1.2" unit="Meters" />
              <InputGroup label="ROW Width" value="30" unit="Meters" />
              <InputGroup label="Buoyancy Control" value="1.1" unit="Negative Buoy." />
              <InputGroup label="Strain Limit" value="0.5" unit="%" />
            </div>
             <p className="text-[10px] text-white/30 italic pt-2 border-t border-white/10">
               * Violating these limits requires special construction methods (e.g., winch assist, induction bends) which significantly increase cost.
             </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function ReviewSection() {
  return (
    <div className="animate-fade-in h-full flex flex-col">
      <SectionHeader 
        title="Review & Launch Simulation" 
        description="Verify all parameters before initializing the PIRL training session. This will spin up the compute cluster." 
      />
      
      <div className="flex-1 flex items-center justify-center">
        <div className="w-full max-w-lg bg-black/40 border border-white/10 p-8 rounded-sm text-center space-y-6 relative overflow-hidden">
          <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.02)_50%,transparent_75%)] bg-[length:250%_250%] animate-shimmer opacity-50" />
          
          <Brain className="w-16 h-16 text-amber-500 mx-auto animate-pulse" />
          
          <div>
            <h3 className="text-xl font-bold text-white uppercase tracking-widest mb-2">Ready to Initialize</h3>
            <p className="text-white/50 text-sm">Estimated Training Time: <span className="text-amber-400">4h 30m</span></p>
          </div>

          <div className="grid grid-cols-2 gap-4 text-left bg-white/5 p-4 rounded-sm text-xs font-mono">
            <div className="text-white/40">Objective:</div>
            <div className="text-right text-amber-400">Cost Optimized</div>
            <div className="text-white/40">Hydraulics:</div>
            <div className="text-right text-white">Active (Gas)</div>
            <div className="text-white/40">Constraints:</div>
            <div className="text-right text-white">5 Active</div>
            <div className="text-white/40">Compute:</div>
            <div className="text-right text-emerald-400">Cluster Ready</div>
          </div>

          <button className="w-full py-4 bg-amber-600 hover:bg-amber-500 text-black font-bold uppercase tracking-widest rounded-sm transition-all shadow-[0_0_20px_rgba(245,158,11,0.4)] hover:shadow-[0_0_30px_rgba(245,158,11,0.6)] relative overflow-hidden group">
            <span className="relative z-10 flex items-center justify-center gap-2">
              <Play className="w-4 h-4 fill-current" />
              Launch PIRL Agent
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}

function ResultsSection({ results }: { results: PirlOutput[] }) {
  return (
    <div className="animate-fade-in h-full flex flex-col">
      <SectionHeader 
        title="PIRL Optimization Results" 
        description="Access the generated routing solutions. These exclusive outputs represent the optimal pathing calculated by the physics-informed reinforcement learning agent." 
      />
      
      <div className="grid grid-cols-1 gap-4 pb-8">
        {results.map((result, i) => (
          <div key={i} className="relative group bg-black/40 border border-amber-500/30 rounded-sm p-6 overflow-hidden hover:bg-amber-500/5 transition-all">
             {/* Exclusive Shine Effect */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-amber-500/10 to-transparent -translate-x-full group-hover:animate-shimmer" />
            
            <div className="flex items-center justify-between relative z-10">
              <div className="flex items-center gap-5 flex-1 min-w-0 mr-8">
                <div className="flex-shrink-0 p-3 bg-amber-500/10 border border-amber-500/20 rounded-sm group-hover:scale-110 transition-transform duration-500">
                  <Sparkles className="w-6 h-6 text-amber-400" />
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <h4 className="text-lg font-bold text-white uppercase tracking-wider truncate" title={result.filename}>
                      {result.filename}
                    </h4>
                    <span className="flex-shrink-0 px-2 py-0.5 text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full uppercase tracking-wide">
                      Optimal
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-4 text-xs font-mono text-white/50">
                    <span className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-500/50" />
                      {new Date(result.last_modified).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 flex-shrink-0">
                <button className="px-5 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs font-medium uppercase tracking-wider rounded-sm transition-colors flex items-center gap-2 group/btn">
                  <Download className="w-3.5 h-3.5 group-hover/btn:text-amber-400 transition-colors" />
                  Download
                </button>
                <button className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold uppercase tracking-wider rounded-sm transition-all shadow-[0_0_15px_rgba(245,158,11,0.3)] hover:shadow-[0_0_25px_rgba(245,158,11,0.5)] flex items-center gap-2 transform hover:translate-y-[-1px]">
                  <MapIcon className="w-3.5 h-3.5" />
                  Load to Map
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
