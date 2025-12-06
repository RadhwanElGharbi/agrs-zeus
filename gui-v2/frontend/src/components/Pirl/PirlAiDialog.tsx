'use client'

import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useProject } from '@/lib/context/ProjectContext'
import { listPirlOutputs, type PirlOutput, fetchPipelineSpecs, type PipelineSpecs } from '@/lib/api/dataClient'
import {
  X, Brain, Settings2, DollarSign, Activity,
  ChevronRight, Play, RotateCcw, Save, Box,
  Layers, Ruler, AlertTriangle, CheckCircle2,
  Info, Droplet, Factory,
  Sparkles, Download, Map as MapIcon, Loader2
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import dynamic from 'next/dynamic'
import type { ViewMode } from './PipelineViewer3D'
import { Target as TargetIcon } from 'lucide-react'

const PipelineViewer3D = dynamic(() => import('./PipelineViewer3D').then(mod => ({ default: mod.PipelineViewer3D })), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center">
      <div className="text-sm text-muted-foreground">Loading 3D Viewer...</div>
    </div>
  )
})

// Helper to get API base URL
function getApiBase(): string {
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'http://localhost:8000/api'
    }
    return `http://${hostname}:8000/api`
  }
  return 'http://localhost:8000/api'
}

interface PirlAiDialogProps {
  open: boolean
  onClose: () => void
}

type PirlSection = 'objectives' | 'hydraulics' | 'cost' | 'constraints' | 'review' | 'results'

// Type definitions for all form data
interface ObjectivesData {
  primaryWeights: {
    costOptimization: number
    constructionSpeed: number
    regulatoryMinimization: number
    environmentalImpact: number
  }
  geometricPreferences: {
    existingRowUsage: number
    minimizeCrossings: number
    terrainFlatness: number
  }
  activeProfile: string
}

interface HydraulicsData {
  mechanical: {
    outerDiameter: number
    wallThickness: number
    grade: string
    locationClass: string
    designFactor: string
    jointFactor: string
    tempDerating: string
    maop: string
  }
  operating: {
    inletPressure: string
    deliveryPressure: string
    flowRate: string
    inletTemp: string
    groundTemp: string
    roughness: string
  }
  fluidComposition: {
    methane: string
    ethane: string
    propane: string
    butane: string
    nitrogen: string
    co2: string
    h2s: string
    waterContent: string
    specificGravity: string
    viscosity: string
    critPressure: string
    critTemp: string
  }
}

interface CostMatrixData {
  materialCosts: Array<{ diameter: string, wallThickness: string, grade: string, costPerMeter: string, weight: string }>
  laborRates: Array<{ region: string, welder: string, equipmentOperator: string, laborer: string, engineer: string }>
  equipmentRental: Array<{ equipment: string, capacity: string, dailyRate: string, monthlyRate: string }>
  terrainMultipliers: Array<{ terrainType: string, multiplier: string, costPerKm: string, rationale: string }>
  rowAcquisition: Array<{ landUse: string, permanentEasement: string, temporaryEasement: string, totalPerKm: string }>
  waterCrossings: Array<{ type: string, width: string, openCut: string, hddCost: string, hddMultiplier: string }>
  infrastructureCrossings: Array<{ infrastructure: string, costPerCrossing: string, method: string, notes: string }>
  regionalFactors: Array<{ region: string, costPerKm: string, laborIndex: string, materialIndex: string, notes: string }>
  permitting: Array<{ item: string, costRange: string, timeline: string }>
  indirectCosts: Array<{ item: string, cost: string, description: string }>
}

interface ConstraintsData {
  geographicalExclusions: {
    protectedAreas: boolean
    urbanDensity: boolean
    indigenousLands: boolean
    waterBodies: boolean
    culturalHeritage: boolean
    militaryZones: boolean
    geohazards: boolean
  }
  constructabilityLimits: {
    maxLongSlope: string
    maxSideSlope: string
    minBendRadius: string
    maxBendAngle: string
    minDepthOfCover: string
    rowWidth: string
    buoyancyControl: string
    strainLimit: string
  }
}

interface PirlFormData {
  objectives: ObjectivesData
  hydraulics: HydraulicsData
  costMatrix: CostMatrixData
  constraints: ConstraintsData
}

// Default values
const defaultObjectives: ObjectivesData = {
  primaryWeights: {
    costOptimization: 80,
    constructionSpeed: 40,
    regulatoryMinimization: 60,
    environmentalImpact: 70,
  },
  geometricPreferences: {
    existingRowUsage: 90,
    minimizeCrossings: 50,
    terrainFlatness: 60,
  },
  activeProfile: 'Cost Aggressive'
}

const defaultHydraulics: HydraulicsData = {
  mechanical: {
    outerDiameter: 660.4,
    wallThickness: 11.0,
    grade: '483',
    locationClass: '1',
    designFactor: '0.72',
    jointFactor: '1.0',
    tempDerating: '1.0',
    maop: '9930',
  },
  operating: {
    inletPressure: '75.0',
    deliveryPressure: '45.0',
    flowRate: '1.0',
    inletTemp: '288.15',
    groundTemp: '283.15',
    roughness: '0.045',
  },
  fluidComposition: {
    methane: '92.5',
    ethane: '4.2',
    propane: '1.5',
    butane: '0.8',
    nitrogen: '0.6',
    co2: '0.4',
    h2s: '0.0',
    waterContent: '< 7',
    specificGravity: '0.58',
    viscosity: '1.1e-5',
    critPressure: '46.0',
    critTemp: '190.6',
  }
}

const defaultCostMatrix: CostMatrixData = {
  materialCosts: [
    { diameter: '8" (219mm)', wallThickness: '6.4mm', grade: 'X52', costPerMeter: '$45 - $70', weight: '27' },
    { diameter: '12" (323mm)', wallThickness: '7.9mm', grade: 'X52', costPerMeter: '$85 - $130', weight: '62' },
    { diameter: '24" (610mm)', wallThickness: '11.1mm', grade: 'X65', costPerMeter: '$280 - $400', weight: '168' },
    { diameter: '30" (762mm)', wallThickness: '12.7mm', grade: 'X65', costPerMeter: '$450 - $650', weight: '242' },
    { diameter: '36" (914mm)', wallThickness: '14.3mm', grade: 'X70', costPerMeter: '$650 - $900', weight: '328' },
    { diameter: '48" (1219mm)', wallThickness: '17.5mm', grade: 'X70', costPerMeter: '$1,200 - $1,700', weight: '541' },
  ],
  laborRates: [
    { region: 'USA', welder: '$60-90', equipmentOperator: '$45-70', laborer: '$25-40', engineer: '$100-150' },
    { region: 'Canada', welder: '$55-85', equipmentOperator: '$40-65', laborer: '$22-38', engineer: '$90-140' },
    { region: 'Western Europe', welder: '$50-80', equipmentOperator: '$35-60', laborer: '$20-35', engineer: '$90-130' },
    { region: 'Middle East', welder: '$35-60', equipmentOperator: '$25-45', laborer: '$12-25', engineer: '$70-110' },
  ],
  equipmentRental: [
    { equipment: 'Excavator', capacity: '50-ton', dailyRate: '$600 - $1,000', monthlyRate: '$15,000 - $25,000' },
    { equipment: 'Sideboom', capacity: '90-ton', dailyRate: '$800 - $1,300', monthlyRate: '$20,000 - $32,000' },
    { equipment: 'HDD Rig', capacity: 'Large (500-ton)', dailyRate: '$15,000 - $30,000', monthlyRate: '$375,000 - $750,000' },
    { equipment: 'Crane', capacity: '200-ton', dailyRate: '$2,500 - $4,500', monthlyRate: '$60,000 - $110,000' },
  ],
  terrainMultipliers: [
    { terrainType: 'Flat Terrain (0-2°)', multiplier: '1.0', costPerKm: '$0.5M - $1.0M', rationale: 'Standard trenching' },
    { terrainType: 'Moderate Slopes (5-15°)', multiplier: '1.3 - 1.5', costPerKm: '$0.65M - $1.5M', rationale: 'Grading, erosion control' },
    { terrainType: 'Steep Slopes (>30°)', multiplier: '2.0 - 3.0', costPerKm: '$1.0M - $3.0M', rationale: 'Blasting, retaining walls' },
    { terrainType: 'Swamp/Wetland', multiplier: '2.0 - 3.5', costPerKm: '$1.0M - $3.5M', rationale: 'Mats, floating equipment' },
    { terrainType: 'Urban Areas', multiplier: '2.5 - 4.0', costPerKm: '$1.25M - $4.0M', rationale: 'Utilities, permits, traffic' },
    { terrainType: 'Permafrost', multiplier: '2.5 - 4.0', costPerKm: '$1.25M - $4.0M', rationale: 'Elevated design, insulation' },
  ],
  rowAcquisition: [
    { landUse: 'Cropland (Prime)', permanentEasement: '$3,000 - $8,000', temporaryEasement: '$500 - $1,500', totalPerKm: '$20k - $60k' },
    { landUse: 'Forest Land', permanentEasement: '$2,000 - $6,000', temporaryEasement: '$400 - $1,000', totalPerKm: '$15k - $45k' },
    { landUse: 'Urban/Suburban', permanentEasement: '$20,000 - $100,000+', temporaryEasement: '$3,000 - $15,000', totalPerKm: '$150k - $750k' },
    { landUse: 'Desert/Arid', permanentEasement: '$500 - $2,000', temporaryEasement: '$100 - $400', totalPerKm: '$3k - $15k' },
  ],
  waterCrossings: [
    { type: 'Small Stream', width: '<3m', openCut: '$500 - $1,000', hddCost: '$1,000 - $2,000', hddMultiplier: '2x' },
    { type: 'Medium River', width: '3-10m', openCut: '$1,000 - $3,000', hddCost: '$2,000 - $9,000', hddMultiplier: '2-3x' },
    { type: 'Large River', width: '>10m', openCut: '$3,000 - $10,000', hddCost: '$6,000 - $40,000', hddMultiplier: '2-4x' },
    { type: 'Lake/Reservoir', width: 'N/A', openCut: 'N/A', hddCost: '$10,000 - $50,000', hddMultiplier: 'Deep HDD' },
  ],
  infrastructureCrossings: [
    { infrastructure: 'Tertiary Road', costPerCrossing: '$50k - $100k', method: 'Open cut/HDD', notes: 'Low traffic' },
    { infrastructure: 'Highway/Motorway', costPerCrossing: '$400k - $1.0M', method: 'HDD Required', notes: 'Major disruption' },
    { infrastructure: 'Heavy Rail', costPerCrossing: '$150k - $300k', method: 'HDD Required', notes: '5-8m depth' },
    { infrastructure: 'Gas/Oil Pipeline', costPerCrossing: '$50k - $200k', method: 'Coordination', notes: 'Safety clearances' },
    { infrastructure: 'Power Line (>400kV)', costPerCrossing: '$150k - $300k', method: 'HDD Required', notes: '10-15m clearance' },
  ],
  regionalFactors: [
    { region: 'USA (Lower 48)', costPerKm: '$0.8M - $1.5M', laborIndex: '1.0', materialIndex: '1.0', notes: 'Baseline' },
    { region: 'USA (Alaska)', costPerKm: '$1.2M - $2.5M', laborIndex: '1.3', materialIndex: '1.4', notes: 'Remote, logistics' },
    { region: 'Canada (South)', costPerKm: '$0.7M - $1.3M', laborIndex: '0.9', materialIndex: '0.95', notes: 'Similar to USA' },
    { region: 'Middle East', costPerKm: '$0.5M - $1.0M', laborIndex: '0.6', materialIndex: '1.0', notes: 'Imported labor' },
    { region: 'Western Europe', costPerKm: '$0.9M - $1.8M', laborIndex: '1.1', materialIndex: '1.05', notes: 'High regulation' },
  ],
  permitting: [
    { item: 'Federal Permits', costRange: '$500k - $2.0M', timeline: '12-24 months' },
    { item: 'Environmental Impact', costRange: '$200k - $1.0M', timeline: '6-12 months' },
    { item: 'Wetland Mitigation', costRange: '$50k - $200k / acre', timeline: 'Per impact acre' },
    { item: 'Cultural/Arch. Survey', costRange: '$5k - $20k / km', timeline: 'Sensitive areas' },
  ],
  indirectCosts: [
    { item: 'Engineering & PM', cost: '10% - 15%', description: 'Of Total Install Cost (TIC)' },
    { item: 'Contingency', cost: '15% - 30%', description: 'AACE Class 4 Estimate' },
    { item: 'Insurance & Legal', cost: '2% - 5%', description: 'Project specific' },
    { item: 'Pump/Comp Station', cost: '$25M - $50M', description: 'Per station (approx 100km)' },
    { item: 'Block Valve Station', cost: '$0.5M - $1.5M', description: 'Every 30km' },
    { item: 'Pigging Launcher/Receiver', cost: '$1.0M - $2.5M', description: 'At start/end points' },
  ],
}

const defaultConstraints: ConstraintsData = {
  geographicalExclusions: {
    protectedAreas: true,
    urbanDensity: true,
    indigenousLands: true,
    waterBodies: true,
    culturalHeritage: false,
    militaryZones: true,
    geohazards: true,
  },
  constructabilityLimits: {
    maxLongSlope: '30',
    maxSideSlope: '15',
    minBendRadius: '20',
    maxBendAngle: '90',
    minDepthOfCover: '1.2',
    rowWidth: '30',
    buoyancyControl: '1.1',
    strainLimit: '0.5',
  }
}

export function PirlAiDialog({ open, onClose }: PirlAiDialogProps) {
  const { currentProject } = useProject()
  const [pirlResults, setPirlResults] = useState<PirlOutput[]>([])
  const [activeSection, setActiveSection] = useState<PirlSection>('objectives')
  const [isClosing, setIsClosing] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [pipelineSpecs, setPipelineSpecs] = useState<PipelineSpecs | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitSuccess, setSubmitSuccess] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Form state
  const [objectives, setObjectives] = useState<ObjectivesData>(defaultObjectives)
  const [hydraulics, setHydraulics] = useState<HydraulicsData>(defaultHydraulics)
  const [costMatrix, setCostMatrix] = useState<CostMatrixData>(defaultCostMatrix)
  const [constraints, setConstraints] = useState<ConstraintsData>(defaultConstraints)

  // 3D Viewer mode
  const [viewMode, setViewMode] = useState<ViewMode>('pipe')

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (open) {
      setIsClosing(false)
      setSubmitSuccess(false)
      setSubmitError(null)
      if (currentProject) {
        listPirlOutputs(currentProject)
          .then(setPirlResults)
          .catch(console.error)

        // Fetch pipeline specs
        fetchPipelineSpecs(currentProject)
          .then(specs => {
            setPipelineSpecs(specs)
            // Initialize editable values from specs
            setHydraulics(prev => ({
              ...prev,
              mechanical: {
                ...prev.mechanical,
                outerDiameter: specs.outer_diameter * 1000, // Convert to mm
                wallThickness: (specs.outer_diameter - specs.inner_diameter) * 1000, // Convert to mm
              }
            }))
          })
          .catch(err => {
            console.error('Failed to load pipeline specs:', err)
          })
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

  const handleSubmit = async () => {
    if (!currentProject) {
      setSubmitError('No project selected')
      return
    }

    setIsSubmitting(true)
    setSubmitError(null)

    try {
      const formData: PirlFormData = {
        objectives,
        hydraulics,
        costMatrix,
        constraints,
      }

      const apiBase = getApiBase()
      const response = await fetch(`${apiBase}/pirl/${currentProject}/requests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.detail || 'Failed to save PIRL request')
      }

      const result = await response.json()
      setSubmitSuccess(true)
      console.log('PIRL request saved:', result)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Unknown error occurred')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!mounted || !open) return null

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
      <div
        className={cn(
          "absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity duration-300",
          isClosing ? "opacity-0" : "opacity-100"
        )}
        onClick={handleClose}
      />

      <div
        data-tour="pirl-dialog"
        className={cn(
          "relative z-10 w-[1400px] max-w-[95vw] h-[85vh] bg-card border border-border rounded-lg shadow-xl flex flex-col overflow-hidden transition-all duration-300",
          isClosing ? "scale-95 opacity-0" : "scale-100 opacity-100"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/30">
          <div className="flex items-center gap-4">
            <div className="p-2 rounded-md bg-primary/10 text-primary">
              <Brain className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">PIRL AI Studio</h2>
              <p className="text-xs text-muted-foreground">Physics Informed Reinforcement Learning Suite</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={handleClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Main Layout */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left Sidebar Navigation */}
          <div className="w-64 bg-card border-r border-border flex flex-col">
            <div className="p-3 space-y-1">
              {[
                { id: 'objectives', label: 'Objectives', icon: TargetIcon },
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
                      "w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors",
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </button>
                )
              })}
            </div>

            <div className="mt-auto p-4 border-t border-border">
              <div className="p-3 bg-muted/30 rounded-md border border-border">
                <h4 className="text-xs font-semibold text-foreground mb-2">Model Status</h4>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-xs text-muted-foreground">PIRL-v2.4 Ready</span>
                </div>
              </div>
            </div>
          </div>

          {/* Center Content Area */}
          <div className="flex-1 flex flex-col bg-background relative overflow-hidden">
            <div className="flex-1 overflow-y-auto p-8">
              {activeSection === 'objectives' && (
                <ObjectivesSection
                  data={objectives}
                  onChange={setObjectives}
                />
              )}
              {activeSection === 'hydraulics' && (
                <HydraulicsSection
                  data={hydraulics}
                  onChange={setHydraulics}
                />
              )}
              {activeSection === 'cost' && (
                <CostMatrixSection
                  data={costMatrix}
                  onChange={setCostMatrix}
                />
              )}
              {activeSection === 'constraints' && (
                <ConstraintsSection
                  data={constraints}
                  onChange={setConstraints}
                />
              )}
              {activeSection === 'review' && (
                <ReviewSection
                  objectives={objectives}
                  hydraulics={hydraulics}
                  constraints={constraints}
                  onSubmit={handleSubmit}
                  isSubmitting={isSubmitting}
                  submitSuccess={submitSuccess}
                  submitError={submitError}
                />
              )}
              {activeSection === 'results' && <ResultsSection results={pirlResults} />}
            </div>
          </div>

          {/* Right 3D Visualization */}
          <div className="w-[400px] bg-muted/10 border-l border-border flex flex-col">
            <div className="p-3 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Box className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs font-semibold text-foreground">Real-time Simulation</span>
              </div>
              <div className="flex gap-1">
                <span className="px-2 py-0.5 text-[10px] bg-blue-500/10 text-blue-600 border border-blue-200 dark:border-blue-800 rounded-full font-medium">Fluid Dynamics</span>
              </div>
            </div>

            <div className="flex-1 relative bg-muted/5">
              <PipelineViewer3D
                diameter={hydraulics.mechanical.outerDiameter / 1000}
                wallThickness={hydraulics.mechanical.wallThickness / 1000}
                length={20}
                showCutaway={true}
                flowVelocity={2.5}
              />
            </div>

            {/* Mini Stats */}
            <div className="border-t border-border bg-card p-4 grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <span className="text-[10px] text-muted-foreground uppercase block">Est. Flow Rate</span>
                <span className="text-sm font-mono text-foreground">{hydraulics.operating.flowRate} m³/s</span>
              </div>
              <div className="space-y-1">
                <span className="text-[10px] text-muted-foreground uppercase block">Pressure Drop</span>
                <span className="text-sm font-mono text-foreground">-- MPa</span>
              </div>
              <div className="space-y-1">
                <span className="text-[10px] text-muted-foreground uppercase block">Reynolds No.</span>
                <span className="text-sm font-mono text-foreground">--</span>
              </div>
              <div className="space-y-1">
                <span className="text-[10px] text-muted-foreground uppercase block">Velocity</span>
                <span className="text-sm font-mono text-foreground">-- m/s</span>
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

function SectionHeader({ title, description }: { title: string, description: string }) {
  return (
    <div className="mb-8">
      <h3 className="text-xl font-semibold text-foreground mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-3xl leading-relaxed">{description}</p>
    </div>
  )
}

function SliderInput({
  label,
  value,
  onChange
}: {
  label: string
  value: number
  onChange: (value: number) => void
}) {
  return (
    <div className="space-y-3">
      <div className="flex justify-between text-xs font-medium">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-primary">{value}%</span>
      </div>
      <input
        type="range"
        min="0"
        max="100"
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value))}
        className="w-full h-1.5 bg-muted rounded-full appearance-none cursor-pointer accent-primary"
      />
    </div>
  )
}

function InputGroup({
  label,
  value,
  unit,
  onChange
}: {
  label: string
  value: string
  unit?: string
  onChange?: (value: string) => void
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-end">
        <label className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</label>
        {unit && <span className="text-[9px] text-muted-foreground font-mono">{unit}</span>}
      </div>
      <div className="relative group">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          className="w-full bg-muted/50 border border-input text-foreground text-sm px-3 py-2 rounded-md focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all font-mono"
        />
      </div>
    </div>
  )
}

interface ObjectivesSectionProps {
  data: ObjectivesData
  onChange: (data: ObjectivesData) => void
}

function ObjectivesSection({ data, onChange }: ObjectivesSectionProps) {
  const updatePrimaryWeight = (key: keyof ObjectivesData['primaryWeights'], value: number) => {
    onChange({
      ...data,
      primaryWeights: { ...data.primaryWeights, [key]: value }
    })
  }

  const updateGeometricPref = (key: keyof ObjectivesData['geometricPreferences'], value: number) => {
    onChange({
      ...data,
      geometricPreferences: { ...data.geometricPreferences, [key]: value }
    })
  }

  return (
    <div className="animate-in fade-in duration-500">
      <SectionHeader
        title="Optimization Objectives"
        description="Define the priorities for the PIRL routing algorithm. Adjust sliders to weight different factors such as construction cost, timeline, and regulatory hurdles."
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        <div className="space-y-8">
          <div className="bg-card border border-border p-6 rounded-lg space-y-6">
            <div className="flex items-center justify-between border-b border-border pb-4 mb-4">
              <h4 className="text-sm font-semibold text-foreground">Primary Weights</h4>
              <Settings2 className="w-4 h-4 text-muted-foreground" />
            </div>
            <SliderInput
              label="Cost Optimization (CAPEX)"
              value={data.primaryWeights.costOptimization}
              onChange={(v) => updatePrimaryWeight('costOptimization', v)}
            />
            <SliderInput
              label="Construction Speed (Time)"
              value={data.primaryWeights.constructionSpeed}
              onChange={(v) => updatePrimaryWeight('constructionSpeed', v)}
            />
            <SliderInput
              label="Regulatory Minimization"
              value={data.primaryWeights.regulatoryMinimization}
              onChange={(v) => updatePrimaryWeight('regulatoryMinimization', v)}
            />
            <SliderInput
              label="Environmental Impact"
              value={data.primaryWeights.environmentalImpact}
              onChange={(v) => updatePrimaryWeight('environmentalImpact', v)}
            />
          </div>

          <div className="bg-card border border-border p-6 rounded-lg space-y-6">
            <div className="flex items-center justify-between border-b border-border pb-4 mb-4">
              <h4 className="text-sm font-semibold text-foreground">Geometric Preferences</h4>
              <Ruler className="w-4 h-4 text-muted-foreground" />
            </div>
            <SliderInput
              label="Maximize Existing ROW Usage"
              value={data.geometricPreferences.existingRowUsage}
              onChange={(v) => updateGeometricPref('existingRowUsage', v)}
            />
            <SliderInput
              label="Minimize Crossings"
              value={data.geometricPreferences.minimizeCrossings}
              onChange={(v) => updateGeometricPref('minimizeCrossings', v)}
            />
            <SliderInput
              label="Terrain Flatness Preference"
              value={data.geometricPreferences.terrainFlatness}
              onChange={(v) => updateGeometricPref('terrainFlatness', v)}
            />
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-muted/30 border border-border p-6 rounded-lg">
            <h4 className="text-sm font-semibold text-foreground mb-4">Routing Profiles</h4>
            <p className="text-xs text-muted-foreground mb-6">Select a routing profile strategy.</p>

            <div className="space-y-3">
              {['Cost Aggressive', 'Balanced Strategy', 'Timeline Critical'].map((profile, i) => (
                <div
                  key={i}
                  onClick={() => onChange({ ...data, activeProfile: profile })}
                  className={cn(
                    "flex items-center justify-between p-3 border hover:border-primary/50 transition-colors cursor-pointer rounded-md group",
                    data.activeProfile === profile ? "bg-primary/10 border-primary/30" : "bg-card border-border"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-8 h-8 rounded-md flex items-center justify-center font-mono text-xs transition-colors",
                      data.activeProfile === profile ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground group-hover:text-primary"
                    )}>
                      {i + 1}
                    </div>
                    <div>
                      <div className="text-sm text-foreground font-medium">{profile}</div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                        {data.activeProfile === profile ? 'Active' : 'Draft'}
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

interface HydraulicsSectionProps {
  data: HydraulicsData
  onChange: (data: HydraulicsData) => void
}

function HydraulicsSection({ data, onChange }: HydraulicsSectionProps) {
  const updateMechanical = (key: keyof HydraulicsData['mechanical'], value: string | number) => {
    onChange({
      ...data,
      mechanical: { ...data.mechanical, [key]: value }
    })
  }

  const updateOperating = (key: keyof HydraulicsData['operating'], value: string) => {
    onChange({
      ...data,
      operating: { ...data.operating, [key]: value }
    })
  }

  const updateFluid = (key: keyof HydraulicsData['fluidComposition'], value: string) => {
    onChange({
      ...data,
      fluidComposition: { ...data.fluidComposition, [key]: value }
    })
  }

  return (
    <div className="animate-in fade-in duration-500 space-y-8">
      <SectionHeader
        title="Engineering & Hydraulics"
        description="Configure detailed physical pipeline parameters, fluid composition, and mechanical design factors compliant with ASME B31.8/B31.4 standards."
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left Column: Mechanical & Geometry */}
        <div className="space-y-8">
          <div className="bg-card border border-border p-6 rounded-lg space-y-6">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <h4 className="text-sm font-semibold text-foreground">Mechanical Design</h4>
              <Settings2 className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <InputGroup
                label="Diameter (OD)"
                value={data.mechanical.outerDiameter.toFixed(1)}
                unit="mm"
                onChange={(val) => updateMechanical('outerDiameter', parseFloat(val) || 0)}
              />
              <InputGroup
                label="Wall Thickness"
                value={data.mechanical.wallThickness.toFixed(1)}
                unit="mm"
                onChange={(val) => updateMechanical('wallThickness', parseFloat(val) || 0)}
              />
              <InputGroup
                label="Grade (SMYS)"
                value={data.mechanical.grade}
                unit="MPa (X70)"
                onChange={(val) => updateMechanical('grade', val)}
              />
              <InputGroup
                label="Location Class"
                value={data.mechanical.locationClass}
                unit="ASME"
                onChange={(val) => updateMechanical('locationClass', val)}
              />
              <InputGroup
                label="Design Factor (F)"
                value={data.mechanical.designFactor}
                unit="-"
                onChange={(val) => updateMechanical('designFactor', val)}
              />
              <InputGroup
                label="Joint Factor (E)"
                value={data.mechanical.jointFactor}
                unit="-"
                onChange={(val) => updateMechanical('jointFactor', val)}
              />
              <InputGroup
                label="Temp Derating (T)"
                value={data.mechanical.tempDerating}
                unit="-"
                onChange={(val) => updateMechanical('tempDerating', val)}
              />
              <InputGroup
                label="MAOP"
                value={data.mechanical.maop}
                unit="kPa"
                onChange={(val) => updateMechanical('maop', val)}
              />
            </div>
          </div>

          <div className="bg-card border border-border p-6 rounded-lg space-y-6">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <h4 className="text-sm font-semibold text-foreground">Operating Conditions</h4>
              <Activity className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <InputGroup
                label="Inlet Pressure"
                value={data.operating.inletPressure}
                unit="Bar"
                onChange={(val) => updateOperating('inletPressure', val)}
              />
              <InputGroup
                label="Del. Pressure (Min)"
                value={data.operating.deliveryPressure}
                unit="Bar"
                onChange={(val) => updateOperating('deliveryPressure', val)}
              />
              <InputGroup
                label="Flow Rate"
                value={data.operating.flowRate}
                unit="m³/s"
                onChange={(val) => updateOperating('flowRate', val)}
              />
              <InputGroup
                label="Inlet Temp"
                value={data.operating.inletTemp}
                unit="K"
                onChange={(val) => updateOperating('inletTemp', val)}
              />
              <InputGroup
                label="Ground Temp"
                value={data.operating.groundTemp}
                unit="K"
                onChange={(val) => updateOperating('groundTemp', val)}
              />
              <InputGroup
                label="Roughness"
                value={data.operating.roughness}
                unit="mm"
                onChange={(val) => updateOperating('roughness', val)}
              />
            </div>
          </div>
        </div>

        {/* Right Column: Fluid Composition */}
        <div className="space-y-8">
           <div className="bg-card border border-border p-6 rounded-lg space-y-6 h-full">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <h4 className="text-sm font-semibold text-blue-500">Fluid Composition (Gas)</h4>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground uppercase bg-muted px-2 py-0.5 rounded-md">Chromatography</span>
                <Droplet className="w-4 h-4 text-blue-500/50" />
              </div>
            </div>

            <div className="space-y-4">
              <p className="text-xs text-muted-foreground italic">Define molar composition for Equation of State (EOS) calculations.</p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                <InputGroup
                  label="Methane (C1)"
                  value={data.fluidComposition.methane}
                  unit="%"
                  onChange={(val) => updateFluid('methane', val)}
                />
                <InputGroup
                  label="Ethane (C2)"
                  value={data.fluidComposition.ethane}
                  unit="%"
                  onChange={(val) => updateFluid('ethane', val)}
                />
                <InputGroup
                  label="Propane (C3)"
                  value={data.fluidComposition.propane}
                  unit="%"
                  onChange={(val) => updateFluid('propane', val)}
                />
                <InputGroup
                  label="Butane+ (C4+)"
                  value={data.fluidComposition.butane}
                  unit="%"
                  onChange={(val) => updateFluid('butane', val)}
                />
                <InputGroup
                  label="Nitrogen (N2)"
                  value={data.fluidComposition.nitrogen}
                  unit="%"
                  onChange={(val) => updateFluid('nitrogen', val)}
                />
                <InputGroup
                  label="Carbon Dioxide (CO2)"
                  value={data.fluidComposition.co2}
                  unit="%"
                  onChange={(val) => updateFluid('co2', val)}
                />
                <InputGroup
                  label="Hydrogen Sulfide"
                  value={data.fluidComposition.h2s}
                  unit="ppm"
                  onChange={(val) => updateFluid('h2s', val)}
                />
                <InputGroup
                  label="Water Content"
                  value={data.fluidComposition.waterContent}
                  unit="lbs/MMscf"
                  onChange={(val) => updateFluid('waterContent', val)}
                />
              </div>

              <div className="mt-6 pt-6 border-t border-border grid grid-cols-2 gap-4">
                <InputGroup
                  label="Specific Gravity"
                  value={data.fluidComposition.specificGravity}
                  unit="Calc."
                  onChange={(val) => updateFluid('specificGravity', val)}
                />
                <InputGroup
                  label="Viscosity"
                  value={data.fluidComposition.viscosity}
                  unit="Pa·s"
                  onChange={(val) => updateFluid('viscosity', val)}
                />
                <InputGroup
                  label="Crit. Pressure"
                  value={data.fluidComposition.critPressure}
                  unit="Bar"
                  onChange={(val) => updateFluid('critPressure', val)}
                />
                <InputGroup
                  label="Crit. Temp"
                  value={data.fluidComposition.critTemp}
                  unit="K"
                  onChange={(val) => updateFluid('critTemp', val)}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

interface CostMatrixSectionProps {
  data: CostMatrixData
  onChange: (data: CostMatrixData) => void
}

function CostMatrixSection({ data, onChange }: CostMatrixSectionProps) {
  const [costTab, setCostTab] = useState<'base' | 'terrain' | 'crossings' | 'factors'>('base')

  return (
    <div className="animate-in fade-in duration-500 h-full flex flex-col">
      <SectionHeader
        title="Cost Matrix Configuration"
        description="Comprehensive cost factors for O&G pipeline route optimization. Defines granular multipliers and rates for the PIRL reward function."
      />

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border mb-6">
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
              "flex items-center gap-2 px-4 py-3 text-xs font-bold uppercase tracking-wider transition-all border-b-2",
              costTab === tab.id
                ? "text-primary border-primary bg-muted/10"
                : "text-muted-foreground border-transparent hover:text-foreground hover:bg-muted/50"
            )}
          >
            <tab.icon className="w-3 h-3" />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto pr-2 pb-4 custom-scrollbar">
        {costTab === 'base' && <BaseConstructionTab data={data} onChange={onChange} />}
        {costTab === 'terrain' && <TerrainLandTab data={data} onChange={onChange} />}
        {costTab === 'crossings' && <CrossingsTab data={data} onChange={onChange} />}
        {costTab === 'factors' && <RegionalFactorsTab data={data} onChange={onChange} />}
      </div>
    </div>
  )
}

interface CostTableProps {
  headers: string[]
  rows: string[][]
  onCellChange?: (rowIndex: number, colIndex: number, value: string) => void
}

function CostTable({ headers, rows, onCellChange }: CostTableProps) {
  return (
    <div className="border border-border rounded-lg overflow-hidden mb-8">
      <table className="w-full text-left text-sm">
        <thead className="bg-muted/50 text-[10px] uppercase tracking-wider text-muted-foreground">
          <tr>
            {headers.map((h, i) => <th key={i} className="px-4 py-3 font-semibold">{h}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-border bg-card text-foreground font-mono text-xs">
          {rows.map((row, rowIdx) => (
            <tr key={rowIdx} className="hover:bg-muted/20 transition-colors">
              {row.map((cell, colIdx) => (
                <td key={colIdx} className="px-4 py-2">
                  {onCellChange ? (
                    <input
                      type="text"
                      value={cell}
                      onChange={(e) => onCellChange(rowIdx, colIdx, e.target.value)}
                      className={cn(
                        "w-full bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-primary rounded px-1 py-1",
                        colIdx === 0 ? "font-sans font-medium" : "text-muted-foreground"
                      )}
                    />
                  ) : (
                    <span className={colIdx === 0 ? "font-sans font-medium" : "text-muted-foreground"}>
                      {cell}
                    </span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function BaseConstructionTab({ data, onChange }: { data: CostMatrixData, onChange: (data: CostMatrixData) => void }) {
  const updateMaterialCosts = (rowIdx: number, colIdx: number, value: string) => {
    const keys = ['diameter', 'wallThickness', 'grade', 'costPerMeter', 'weight'] as const
    const newRows = [...data.materialCosts]
    newRows[rowIdx] = { ...newRows[rowIdx], [keys[colIdx]]: value }
    onChange({ ...data, materialCosts: newRows })
  }

  const updateLaborRates = (rowIdx: number, colIdx: number, value: string) => {
    const keys = ['region', 'welder', 'equipmentOperator', 'laborer', 'engineer'] as const
    const newRows = [...data.laborRates]
    newRows[rowIdx] = { ...newRows[rowIdx], [keys[colIdx]]: value }
    onChange({ ...data, laborRates: newRows })
  }

  const updateEquipmentRental = (rowIdx: number, colIdx: number, value: string) => {
    const keys = ['equipment', 'capacity', 'dailyRate', 'monthlyRate'] as const
    const newRows = [...data.equipmentRental]
    newRows[rowIdx] = { ...newRows[rowIdx], [keys[colIdx]]: value }
    onChange({ ...data, equipmentRental: newRows })
  }

  return (
    <div className="space-y-6">
      <div>
        <h4 className="text-sm font-semibold text-foreground mb-4">Material Costs (Pipe)</h4>
        <CostTable
          headers={['Diameter', 'Wall Thickness', 'Grade', 'Cost per Meter', 'Weight (kg/m)']}
          rows={data.materialCosts.map(r => [r.diameter, r.wallThickness, r.grade, r.costPerMeter, r.weight])}
          onCellChange={updateMaterialCosts}
        />
      </div>

      <div>
        <h4 className="text-sm font-semibold text-foreground mb-4">Labor Rates (Hourly)</h4>
        <CostTable
          headers={['Region', 'Welder', 'Equipment Operator', 'Laborer', 'Engineer']}
          rows={data.laborRates.map(r => [r.region, r.welder, r.equipmentOperator, r.laborer, r.engineer])}
          onCellChange={updateLaborRates}
        />
      </div>

      <div>
        <h4 className="text-sm font-semibold text-foreground mb-4">Equipment Rental (Daily)</h4>
        <CostTable
          headers={['Equipment', 'Capacity', 'Daily Rate', 'Monthly Rate']}
          rows={data.equipmentRental.map(r => [r.equipment, r.capacity, r.dailyRate, r.monthlyRate])}
          onCellChange={updateEquipmentRental}
        />
      </div>
    </div>
  )
}

function TerrainLandTab({ data, onChange }: { data: CostMatrixData, onChange: (data: CostMatrixData) => void }) {
  const updateTerrainMultipliers = (rowIdx: number, colIdx: number, value: string) => {
    const keys = ['terrainType', 'multiplier', 'costPerKm', 'rationale'] as const
    const newRows = [...data.terrainMultipliers]
    newRows[rowIdx] = { ...newRows[rowIdx], [keys[colIdx]]: value }
    onChange({ ...data, terrainMultipliers: newRows })
  }

  const updateRowAcquisition = (rowIdx: number, colIdx: number, value: string) => {
    const keys = ['landUse', 'permanentEasement', 'temporaryEasement', 'totalPerKm'] as const
    const newRows = [...data.rowAcquisition]
    newRows[rowIdx] = { ...newRows[rowIdx], [keys[colIdx]]: value }
    onChange({ ...data, rowAcquisition: newRows })
  }

  return (
    <div className="space-y-6">
      <div>
        <h4 className="text-sm font-semibold text-foreground mb-4">Terrain Multipliers</h4>
        <CostTable
          headers={['Terrain Type', 'Cost Multiplier', 'Cost per km', 'Rationale']}
          rows={data.terrainMultipliers.map(r => [r.terrainType, r.multiplier, r.costPerKm, r.rationale])}
          onCellChange={updateTerrainMultipliers}
        />
      </div>

      <div>
        <h4 className="text-sm font-semibold text-foreground mb-4">ROW Acquisition (USA Avg)</h4>
        <CostTable
          headers={['Land Use', 'Permanent Easement ($/acre)', 'Temporary Easement', 'Total per km (50\' ROW)']}
          rows={data.rowAcquisition.map(r => [r.landUse, r.permanentEasement, r.temporaryEasement, r.totalPerKm])}
          onCellChange={updateRowAcquisition}
        />
      </div>
    </div>
  )
}

function CrossingsTab({ data, onChange }: { data: CostMatrixData, onChange: (data: CostMatrixData) => void }) {
  const updateWaterCrossings = (rowIdx: number, colIdx: number, value: string) => {
    const keys = ['type', 'width', 'openCut', 'hddCost', 'hddMultiplier'] as const
    const newRows = [...data.waterCrossings]
    newRows[rowIdx] = { ...newRows[rowIdx], [keys[colIdx]]: value }
    onChange({ ...data, waterCrossings: newRows })
  }

  const updateInfrastructureCrossings = (rowIdx: number, colIdx: number, value: string) => {
    const keys = ['infrastructure', 'costPerCrossing', 'method', 'notes'] as const
    const newRows = [...data.infrastructureCrossings]
    newRows[rowIdx] = { ...newRows[rowIdx], [keys[colIdx]]: value }
    onChange({ ...data, infrastructureCrossings: newRows })
  }

  return (
    <div className="space-y-6">
      <div>
        <h4 className="text-sm font-semibold text-foreground mb-4">Water Crossings</h4>
        <CostTable
          headers={['Type', 'Width', 'Open Cut ($/m)', 'HDD Cost ($/m)', 'HDD Multiplier']}
          rows={data.waterCrossings.map(r => [r.type, r.width, r.openCut, r.hddCost, r.hddMultiplier])}
          onCellChange={updateWaterCrossings}
        />
      </div>

      <div>
        <h4 className="text-sm font-semibold text-foreground mb-4">Infrastructure Crossings</h4>
        <CostTable
          headers={['Infrastructure', 'Cost per Crossing', 'Method', 'Notes']}
          rows={data.infrastructureCrossings.map(r => [r.infrastructure, r.costPerCrossing, r.method, r.notes])}
          onCellChange={updateInfrastructureCrossings}
        />
      </div>
    </div>
  )
}

function RegionalFactorsTab({ data, onChange }: { data: CostMatrixData, onChange: (data: CostMatrixData) => void }) {
  const updateRegionalFactors = (rowIdx: number, colIdx: number, value: string) => {
    const keys = ['region', 'costPerKm', 'laborIndex', 'materialIndex', 'notes'] as const
    const newRows = [...data.regionalFactors]
    newRows[rowIdx] = { ...newRows[rowIdx], [keys[colIdx]]: value }
    onChange({ ...data, regionalFactors: newRows })
  }

  const updatePermitting = (rowIdx: number, colIdx: number, value: string) => {
    const keys = ['item', 'costRange', 'timeline'] as const
    const newRows = [...data.permitting]
    newRows[rowIdx] = { ...newRows[rowIdx], [keys[colIdx]]: value }
    onChange({ ...data, permitting: newRows })
  }

  const updateIndirectCosts = (rowIdx: number, colIdx: number, value: string) => {
    const keys = ['item', 'cost', 'description'] as const
    const newRows = [...data.indirectCosts]
    newRows[rowIdx] = { ...newRows[rowIdx], [keys[colIdx]]: value }
    onChange({ ...data, indirectCosts: newRows })
  }

  return (
    <div className="space-y-6">
      <div>
        <h4 className="text-sm font-semibold text-foreground mb-4">Regional Cost Multipliers</h4>
        <CostTable
          headers={['Region', 'Cost per km', 'Labor Index', 'Material Index', 'Notes']}
          rows={data.regionalFactors.map(r => [r.region, r.costPerKm, r.laborIndex, r.materialIndex, r.notes])}
          onCellChange={updateRegionalFactors}
        />
      </div>

      <div>
        <h4 className="text-sm font-semibold text-foreground mb-4">Permitting & Environmental</h4>
        <CostTable
          headers={['Item', 'Cost Range', 'Timeline/Notes']}
          rows={data.permitting.map(r => [r.item, r.costRange, r.timeline])}
          onCellChange={updatePermitting}
        />
      </div>

      <div>
        <h4 className="text-sm font-semibold text-foreground mb-4">Indirect Costs & Facilities</h4>
        <CostTable
          headers={['Item', 'Cost', 'Description']}
          rows={data.indirectCosts.map(r => [r.item, r.cost, r.description])}
          onCellChange={updateIndirectCosts}
        />
      </div>
    </div>
  )
}

interface ConstraintsSectionProps {
  data: ConstraintsData
  onChange: (data: ConstraintsData) => void
}

function ConstraintsSection({ data, onChange }: ConstraintsSectionProps) {
  const toggleExclusion = (key: keyof ConstraintsData['geographicalExclusions']) => {
    onChange({
      ...data,
      geographicalExclusions: {
        ...data.geographicalExclusions,
        [key]: !data.geographicalExclusions[key]
      }
    })
  }

  const updateConstructability = (key: keyof ConstraintsData['constructabilityLimits'], value: string) => {
    onChange({
      ...data,
      constructabilityLimits: { ...data.constructabilityLimits, [key]: value }
    })
  }

  const exclusionItems = [
    { key: 'protectedAreas' as const, label: 'Protected Areas', desc: 'National Parks, Wildlife Reserves (IUCN I-IV)' },
    { key: 'urbanDensity' as const, label: 'Urban Density', desc: 'High density residential > 1000/km²' },
    { key: 'indigenousLands' as const, label: 'Indigenous Lands', desc: 'Recognized tribal/indigenous territories' },
    { key: 'waterBodies' as const, label: 'Water Bodies', desc: 'Avoid large lakes (> 5km crossing)' },
    { key: 'culturalHeritage' as const, label: 'Cultural Heritage', desc: 'Archaeological sites & buffer zones' },
    { key: 'militaryZones' as const, label: 'Military Zones', desc: 'Restricted airspace and ground usage' },
    { key: 'geohazards' as const, label: 'Geohazards', desc: 'High seismic/landslide risk zones' },
  ]

  return (
    <div className="animate-in fade-in duration-500 space-y-8">
      <SectionHeader
        title="Constraints & Constructability"
        description="Define hard geographical exclusions and engineering constructability limits. The PIRL agent will be penalized heavily for violating these boundaries."
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        <div className="space-y-6">
          <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-widest border-b border-border pb-2">Geographical Exclusions</h4>
          <div className="grid grid-cols-1 gap-3">
            {exclusionItems.map((item) => (
              <div
                key={item.key}
                onClick={() => toggleExclusion(item.key)}
                className={cn(
                  "p-3 border rounded-md flex items-center gap-4 transition-all cursor-pointer group",
                  data.geographicalExclusions[item.key]
                    ? "bg-primary/5 border-primary/30"
                    : "bg-card border-border hover:bg-muted"
                )}
              >
                <button className={cn(
                  "w-5 h-5 rounded border flex items-center justify-center transition-colors",
                  data.geographicalExclusions[item.key] ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground/50"
                )}>
                  {data.geographicalExclusions[item.key] && <CheckCircle2 className="w-3.5 h-3.5" />}
                </button>
                <div className="flex-1">
                  <h4 className={cn("text-xs font-semibold uppercase tracking-wide", data.geographicalExclusions[item.key] ? "text-foreground" : "text-muted-foreground")}>
                    {item.label}
                  </h4>
                  <p className="text-[10px] text-muted-foreground">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-widest border-b border-border pb-2">Constructability Limits</h4>
          <div className="bg-card border border-border p-6 rounded-lg space-y-6">
             <div className="grid grid-cols-2 gap-4">
              <InputGroup
                label="Max Slope (Long.)"
                value={data.constructabilityLimits.maxLongSlope}
                unit="Degrees"
                onChange={(val) => updateConstructability('maxLongSlope', val)}
              />
              <InputGroup
                label="Max Side Slope"
                value={data.constructabilityLimits.maxSideSlope}
                unit="Degrees"
                onChange={(val) => updateConstructability('maxSideSlope', val)}
              />
              <InputGroup
                label="Min Bend Radius"
                value={data.constructabilityLimits.minBendRadius}
                unit="x Diameter"
                onChange={(val) => updateConstructability('minBendRadius', val)}
              />
              <InputGroup
                label="Max Bend Angle"
                value={data.constructabilityLimits.maxBendAngle}
                unit="Degrees"
                onChange={(val) => updateConstructability('maxBendAngle', val)}
              />
              <InputGroup
                label="Min Depth of Cover"
                value={data.constructabilityLimits.minDepthOfCover}
                unit="Meters"
                onChange={(val) => updateConstructability('minDepthOfCover', val)}
              />
              <InputGroup
                label="ROW Width"
                value={data.constructabilityLimits.rowWidth}
                unit="Meters"
                onChange={(val) => updateConstructability('rowWidth', val)}
              />
              <InputGroup
                label="Buoyancy Control"
                value={data.constructabilityLimits.buoyancyControl}
                unit="Negative Buoy."
                onChange={(val) => updateConstructability('buoyancyControl', val)}
              />
              <InputGroup
                label="Strain Limit"
                value={data.constructabilityLimits.strainLimit}
                unit="%"
                onChange={(val) => updateConstructability('strainLimit', val)}
              />
            </div>
             <p className="text-[10px] text-muted-foreground italic pt-2 border-t border-border">
               * Violating these limits requires special construction methods (e.g., winch assist, induction bends) which significantly increase cost.
             </p>
          </div>
        </div>
      </div>
    </div>
  )
}

interface ReviewSectionProps {
  objectives: ObjectivesData
  hydraulics: HydraulicsData
  constraints: ConstraintsData
  onSubmit: () => void
  isSubmitting: boolean
  submitSuccess: boolean
  submitError: string | null
}

function ReviewSection({ objectives, hydraulics, constraints, onSubmit, isSubmitting, submitSuccess, submitError }: ReviewSectionProps) {
  const activeConstraints = Object.values(constraints.geographicalExclusions).filter(Boolean).length

  return (
    <div className="animate-in fade-in duration-500 h-full flex flex-col">
      <SectionHeader
        title="Review & Launch Simulation"
        description="Verify all parameters before initializing the PIRL training session. This will save your configuration and spin up the compute cluster."
      />

      <div className="flex-1 flex items-center justify-center">
        <div className="w-full max-w-lg bg-card border border-border p-8 rounded-lg text-center space-y-6">

          {submitSuccess ? (
            <>
              <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto" />
              <div>
                <h3 className="text-xl font-semibold text-foreground mb-2">Configuration Saved!</h3>
                <p className="text-muted-foreground text-sm">Your PIRL request has been saved to the project directory.</p>
              </div>
            </>
          ) : (
            <>
              <Brain className="w-16 h-16 text-primary mx-auto" />

              <div>
                <h3 className="text-xl font-semibold text-foreground mb-2">Ready to Initialize</h3>
                <p className="text-muted-foreground text-sm">Estimated Training Time: <span className="text-foreground font-medium">4h 30m</span></p>
              </div>

              <div className="grid grid-cols-2 gap-4 text-left bg-muted/20 p-4 rounded-md text-xs font-mono">
                <div className="text-muted-foreground">Objective:</div>
                <div className="text-right text-primary">{objectives.activeProfile}</div>
                <div className="text-muted-foreground">Hydraulics:</div>
                <div className="text-right text-foreground">Active (Gas)</div>
                <div className="text-muted-foreground">Pipe OD:</div>
                <div className="text-right text-foreground">{hydraulics.mechanical.outerDiameter.toFixed(1)} mm</div>
                <div className="text-muted-foreground">Constraints:</div>
                <div className="text-right text-foreground">{activeConstraints} Active</div>
                <div className="text-muted-foreground">Compute:</div>
                <div className="text-right text-emerald-500">Cluster Ready</div>
              </div>

              {submitError && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-md text-red-500 text-sm">
                  {submitError}
                </div>
              )}

              <Button
                className="w-full py-6 font-semibold tracking-wide"
                size="lg"
                onClick={onSubmit}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving Configuration...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 mr-2 fill-current" />
                    Launch PIRL Agent
                  </>
                )}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function ResultsSection({ results }: { results: PirlOutput[] }) {
  return (
    <div className="animate-in fade-in duration-500 h-full flex flex-col">
      <SectionHeader
        title="PIRL Optimization Results"
        description="Access the generated routing solutions. These exclusive outputs represent the optimal pathing calculated by the physics-informed reinforcement learning agent."
      />

      <div className="grid grid-cols-1 gap-4 pb-8">
        {results.map((result, i) => (
          <div key={i} className="relative group bg-card border border-border rounded-lg p-6 hover:bg-muted/20 transition-all">

            <div className="flex items-center justify-between relative z-10">
              <div className="flex items-center gap-5 flex-1 min-w-0 mr-8">
                <div className="flex-shrink-0 p-3 bg-primary/10 border border-primary/20 rounded-md">
                  <Sparkles className="w-6 h-6 text-primary" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <h4 className="text-base font-semibold text-foreground truncate" title={result.filename}>
                      {result.filename}
                    </h4>
                    <span className="flex-shrink-0 px-2 py-0.5 text-[10px] bg-emerald-500/10 text-emerald-600 border border-emerald-200 dark:border-emerald-800 rounded-full font-medium uppercase">
                      Optimal
                    </span>
                  </div>

                  <div className="flex items-center gap-4 text-xs font-mono text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                      {new Date(result.last_modified).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 flex-shrink-0">
                <Button variant="outline" size="sm" className="text-xs">
                  <Download className="w-3.5 h-3.5 mr-2" />
                  Download
                </Button>
                <Button size="sm" className="text-xs">
                  <MapIcon className="w-3.5 h-3.5 mr-2" />
                  Load to Map
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
