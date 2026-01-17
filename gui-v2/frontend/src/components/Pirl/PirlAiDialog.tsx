'use client'

import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useProject } from '@/lib/context/ProjectContext'
import { listPirlOutputs, type PirlOutput, fetchPipelineSpecs, type PipelineSpecs, listPirlJobs, type PirlJob, type PirlJobCreateResponse } from '@/lib/api/dataClient'
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
import { PressureDesignSection } from './PressureDesignSection'

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

type PirlSection = 'objectives' | 'hydraulics' | 'pressureDesign' | 'cost' | 'constraints' | 'review' | 'jobs' | 'results'

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

// Helper functions for hydraulic calculations
function calculateFlowVelocity(flowRate: number, innerDiameter: number): number {
  const area = Math.PI * Math.pow(innerDiameter / 2, 2)
  return area > 0 ? flowRate / area : 0
}

function calculateReynolds(velocity: number, diameter: number, density: number, viscosity: number): number {
  return viscosity > 0 ? (density * velocity * diameter) / viscosity : 0
}

function getFlowRegime(reynolds: number): string {
  if (reynolds < 2300) return 'Laminar'
  if (reynolds < 4000) return 'Transitional'
  return 'Turbulent'
}

function calculatePressureDrop(length: number, diameter: number, velocity: number, density: number, friction: number): number {
  // Darcy-Weisbach equation: ΔP = f * (L/D) * (ρ * v²/2)
  if (diameter <= 0) return 0
  return friction * (length / diameter) * (density * velocity * velocity / 2) / 1e6 // Convert to MPa
}

export function PirlAiDialog({ open, onClose }: PirlAiDialogProps) {
  const { currentProject } = useProject()
  const [pirlResults, setPirlResults] = useState<PirlOutput[]>([])
  const [pirlJobs, setPirlJobs] = useState<PirlJob[]>([])
  const [activeSection, setActiveSection] = useState<PirlSection>('objectives')
  const [isClosing, setIsClosing] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [pipelineSpecs, setPipelineSpecs] = useState<PipelineSpecs | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitSuccess, setSubmitSuccess] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [lastCreatedJob, setLastCreatedJob] = useState<PirlJobCreateResponse['job'] | null>(null)

  // Form state
  const [objectives, setObjectives] = useState<ObjectivesData>(defaultObjectives)
  const [hydraulics, setHydraulics] = useState<HydraulicsData>(defaultHydraulics)
  const [costMatrix, setCostMatrix] = useState<CostMatrixData>(defaultCostMatrix)
  const [constraints, setConstraints] = useState<ConstraintsData>(defaultConstraints)

  // 3D Viewer mode
  const [viewMode, setViewMode] = useState<ViewMode>('pipe')

  // Calculate flow statistics from hydraulics data
  const innerDiameter = (hydraulics.mechanical.outerDiameter - 2 * hydraulics.mechanical.wallThickness) / 1000 // meters
  const flowRate = parseFloat(hydraulics.operating.flowRate) || 1.0
  const fluidViscosity = parseFloat(hydraulics.fluidComposition.viscosity) || 0.000011
  const fluidDensity = (parseFloat(hydraulics.fluidComposition.specificGravity) || 0.58) * 1.225 // kg/m³
  const velocity = calculateFlowVelocity(flowRate, innerDiameter)
  const reynolds = calculateReynolds(velocity, innerDiameter, fluidDensity, fluidViscosity)
  const flowRegime = getFlowRegime(reynolds)
  // Estimate friction factor (Blasius equation for turbulent flow in smooth pipes)
  const frictionFactor = reynolds > 2300 ? 0.316 / Math.pow(reynolds, 0.25) : 64 / Math.max(reynolds, 1)
  const pressureDrop = calculatePressureDrop(72000, innerDiameter, velocity, fluidDensity, frictionFactor) // Assume 72km pipeline

  useEffect(() => {
    setMounted(true)
  }, [])

  // Load jobs function - can be called to refresh
  const loadJobs = useCallback(() => {
    if (currentProject) {
      listPirlJobs(currentProject)
        .then(setPirlJobs)
        .catch(err => console.error('Failed to load PIRL jobs:', err))
    }
  }, [currentProject])

  useEffect(() => {
    if (open) {
      setIsClosing(false)
      setSubmitSuccess(false)
      setSubmitError(null)
      setLastCreatedJob(null)
      if (currentProject) {
        listPirlOutputs(currentProject)
          .then(setPirlResults)
          .catch(console.error)

        // Load existing jobs
        loadJobs()

        // Fetch pipeline specs
        fetchPipelineSpecs(currentProject)
          .then(specs => {
            setPipelineSpecs(specs)

            // Determine outer diameter (support both formats)
            let outerDiameter = defaultHydraulics.mechanical.outerDiameter
            let wallThickness = defaultHydraulics.mechanical.wallThickness

            if (specs.diameter_mm !== undefined) {
              // Legacy/detailed format (Ravenna-Chieti style)
              outerDiameter = specs.diameter_mm
              wallThickness = specs.wall_thickness_mm ?? specs.thickness_mm ?? wallThickness
            } else if (specs.outer_diameter !== undefined) {
              // New project format (meters, convert to mm)
              outerDiameter = specs.outer_diameter * 1000
              if (specs.inner_diameter !== undefined) {
                wallThickness = (specs.outer_diameter - specs.inner_diameter) * 1000 / 2
              }
            }

            // Get operating conditions from hydraulics sub-object or top-level
            const h = specs.hydraulics
            const inletPressure = h?.initial_pressure_bar ?? specs.mop_bar ?? parseFloat(defaultHydraulics.operating.inletPressure)
            const deliveryPressure = h?.min_delivery_pressure_bar ?? parseFloat(defaultHydraulics.operating.deliveryPressure)
            const flowRate = h?.volumetric_flow_rate_m3_s ?? specs.flow_rate_m3_s ?? parseFloat(defaultHydraulics.operating.flowRate)
            const inletTemp = h?.operating_temperature_k ?? specs.operating_temp_k ?? parseFloat(defaultHydraulics.operating.inletTemp)
            const specificGravity = h?.gas_specific_gravity ?? parseFloat(defaultHydraulics.fluidComposition.specificGravity)
            const roughness = h?.pipe_roughness_mm ?? parseFloat(defaultHydraulics.operating.roughness)

            // Convert MAOP from bar to kPa if available
            const maop = specs.mop_bar ? (specs.mop_bar * 100).toString() : defaultHydraulics.mechanical.maop

            // Initialize hydraulics form from specs
            setHydraulics(prev => ({
              ...prev,
              mechanical: {
                ...prev.mechanical,
                outerDiameter,
                wallThickness,
                maop,
              },
              operating: {
                ...prev.operating,
                inletPressure: inletPressure.toString(),
                deliveryPressure: deliveryPressure.toString(),
                flowRate: flowRate.toString(),
                inletTemp: inletTemp.toString(),
                roughness: roughness.toString(),
              },
              fluidComposition: {
                ...prev.fluidComposition,
                specificGravity: specificGravity.toString(),
              }
            }))

            // Initialize constraints from specs
            if (specs.max_slope_percent !== undefined || specs.depth_of_cover_m !== undefined) {
              setConstraints(prev => ({
                ...prev,
                constructabilityLimits: {
                  ...prev.constructabilityLimits,
                  maxLongSlope: specs.max_slope_percent?.toString() ?? prev.constructabilityLimits.maxLongSlope,
                  minDepthOfCover: specs.depth_of_cover_m?.toString() ?? prev.constructabilityLimits.minDepthOfCover,
                  minBendRadius: specs.hdd_min_bend_radius_m
                    ? (specs.hdd_min_bend_radius_m / outerDiameter * 1000).toFixed(0)
                    : prev.constructabilityLimits.minBendRadius,
                  maxBendAngle: specs.field_bend_max_angle_deg?.toString() ?? prev.constructabilityLimits.maxBendAngle,
                }
              }))
            }
          })
          .catch(err => {
            console.error('Failed to load pipeline specs:', err)
          })
      }
    }
  }, [open, currentProject, loadJobs])

  // Refresh jobs periodically when dialog is open
  useEffect(() => {
    if (!open || !currentProject) return

    const interval = setInterval(() => {
      loadJobs()
    }, 30000) // Refresh every 30 seconds

    return () => clearInterval(interval)
  }, [open, currentProject, loadJobs])

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
        throw new Error(error.detail || 'Failed to create PIRL job')
      }

      const result: PirlJobCreateResponse = await response.json()
      setSubmitSuccess(true)
      setLastCreatedJob(result.job)
      console.log('PIRL job created:', result)

      // Refresh jobs list
      loadJobs()
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Unknown error occurred')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!mounted || !open) return null

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 font-mono">
      <div
        className={cn(
          "absolute inset-0 bg-black/90 backdrop-blur-sm transition-opacity duration-300",
          isClosing ? "opacity-0" : "opacity-100"
        )}
        onClick={handleClose}
      />

      <div
        data-tour="pirl-dialog"
        className={cn(
          "relative z-10 w-[1400px] max-w-[95vw] h-[85vh] bg-[#0a0a0a]/95 backdrop-blur-xl border border-red-500/20 rounded-lg shadow-[0_0_50px_-20px_rgba(239,68,68,0.5)] flex flex-col overflow-hidden transition-all duration-300",
          isClosing ? "scale-95 opacity-0" : "scale-100 opacity-100"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-red-500/20 bg-red-900/10">
          <div className="flex items-center gap-4">
            <div className="p-2 rounded-md bg-red-500/20 text-red-400 shadow-[0_0_15px_-3px_rgba(239,68,68,0.4)]">
              <Brain className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-wide uppercase">PIRL AI Studio</h2>
              <p className="text-xs text-red-200/50 font-mono">Physics Informed Reinforcement Learning Suite</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleClose}
            className="text-white/50 hover:text-white hover:bg-white/10"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Main Layout */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left Sidebar Navigation */}
          <div className="w-64 bg-black/20 border-r border-red-500/10 flex flex-col">
            <div className="p-3 space-y-1">
              {[
                { id: 'objectives', label: 'Objectives', icon: TargetIcon },
                { id: 'hydraulics', label: 'Hydraulics', icon: Activity },
                { id: 'pressureDesign', label: 'Pressure Design', icon: Ruler },
                { id: 'cost', label: 'Cost Matrix', icon: DollarSign },
                { id: 'constraints', label: 'Constraints', icon: AlertTriangle },
                { id: 'review', label: 'Review & Launch', icon: Play },
                ...(pirlJobs.length > 0 ? [{ id: 'jobs', label: `Jobs (${pirlJobs.length})`, icon: Loader2 }] : []),
                ...(pirlResults.length > 0 ? [{ id: 'results', label: 'Results', icon: Sparkles }] : [])
              ].map((item) => {
                const isActive = activeSection === item.id
                const Icon = item.icon
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveSection(item.id as PirlSection)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-all duration-200",
                      isActive
                        ? "bg-red-500/20 text-red-400 border-l-2 border-red-500 shadow-[inset_10px_0_20px_-10px_rgba(239,68,68,0.2)]"
                        : "text-white/50 hover:text-white hover:bg-white/5 border-l-2 border-transparent"
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </button>
                )
              })}
            </div>

            <div className="mt-auto p-4 border-t border-red-500/10">
              <div className="p-3 bg-red-900/10 rounded-md border border-red-500/20">
                <h4 className="text-xs font-semibold text-red-200 mb-2 uppercase tracking-wider">Model Status</h4>
                <div className="flex items-center gap-2">
                  <div className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </div>
                  <span className="text-xs text-emerald-400 font-mono">PIRL-v2.4 READY</span>
                </div>
              </div>
            </div>
          </div>

          {/* Center Content Area */}
          <div className="flex-1 flex flex-col bg-transparent relative overflow-hidden">
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
              {activeSection === 'pressureDesign' && (
                <PressureDesignSection
                  projectName={currentProject || undefined}
                  hydraulics={hydraulics as any}
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
                  lastCreatedJob={lastCreatedJob}
                  onViewJobs={() => setActiveSection('jobs')}
                />
              )}
              {activeSection === 'jobs' && <JobsSection jobs={pirlJobs} onRefresh={loadJobs} />}
              {activeSection === 'results' && <ResultsSection results={pirlResults} />}
            </div>
          </div>

          {/* Right 3D Visualization */}
          <div className="w-[400px] bg-black/20 border-l border-red-500/10 flex flex-col">
            <div className="p-3 border-b border-red-500/10 flex items-center justify-between bg-red-900/5">
              <div className="flex items-center gap-2">
                <Box className="w-4 h-4 text-red-400" />
                <span className="text-xs font-bold text-white uppercase tracking-wider">Real-time Simulation</span>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => setViewMode('pipe')}
                  className={cn(
                    "px-2 py-0.5 text-[10px] border rounded-sm font-mono transition-colors",
                    viewMode === 'pipe'
                      ? "bg-red-500/20 text-red-300 border-red-500/30"
                      : "bg-transparent text-white/30 border-white/10 hover:text-white hover:border-white/30"
                  )}
                >
                  PIPE
                </button>
                <button
                  onClick={() => setViewMode('cfd')}
                  className={cn(
                    "px-2 py-0.5 text-[10px] border rounded-sm font-mono transition-colors",
                    viewMode === 'cfd'
                      ? "bg-blue-500/20 text-blue-300 border-blue-500/30"
                      : "bg-transparent text-white/30 border-white/10 hover:text-white hover:border-white/30"
                  )}
                >
                  CFD
                </button>
              </div>
            </div>

            <div className="flex-1 relative bg-black/40">
              <PipelineViewer3D
                diameter={hydraulics.mechanical.outerDiameter / 1000}
                wallThickness={hydraulics.mechanical.wallThickness / 1000}
                length={20}
                showCutaway={true}
                viewMode={viewMode}
                flowRate={parseFloat(hydraulics.operating.flowRate) || 1.0}
                inletPressure={parseFloat(hydraulics.operating.inletPressure) || 75}
                outletPressure={parseFloat(hydraulics.operating.deliveryPressure) || 45}
                temperature={parseFloat(hydraulics.operating.inletTemp) || 288}
                fluidViscosity={parseFloat(hydraulics.fluidComposition.viscosity) || 0.000011}
                fluidDensity={parseFloat(hydraulics.fluidComposition.specificGravity) * 1.225 || 0.7}
              />
            </div>

            {/* Mini Stats */}
            <div className="border-t border-red-500/10 bg-black/40 p-4 grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <span className="text-[9px] text-white/30 uppercase block tracking-widest">Flow Rate</span>
                <span className="text-sm font-mono text-emerald-400">{hydraulics.operating.flowRate} m³/s</span>
              </div>
              <div className="space-y-1">
                <span className="text-[9px] text-white/30 uppercase block tracking-widest">Pressure Drop</span>
                <span className="text-sm font-mono text-amber-400">{pressureDrop.toFixed(3)} MPa</span>
              </div>
              <div className="space-y-1">
                <span className="text-[9px] text-white/30 uppercase block tracking-widest">Reynolds No.</span>
                <span className={cn(
                  "text-sm font-mono",
                  flowRegime === 'Laminar' ? "text-blue-400" :
                  flowRegime === 'Transitional' ? "text-yellow-400" : "text-red-400"
                )}>
                  {reynolds > 1e6 ? `${(reynolds / 1e6).toFixed(2)}M` : reynolds > 1e3 ? `${(reynolds / 1e3).toFixed(1)}k` : reynolds.toFixed(0)}
                  <span className="text-[9px] ml-1 opacity-60">({flowRegime})</span>
                </span>
              </div>
              <div className="space-y-1">
                <span className="text-[9px] text-white/30 uppercase block tracking-widest">Velocity</span>
                <span className="text-sm font-mono text-cyan-400">{velocity.toFixed(2)} m/s</span>
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
      <h3 className="text-xl font-bold text-white mb-2 tracking-wide">{title}</h3>
      <p className="text-sm text-white/50 max-w-3xl leading-relaxed font-light">{description}</p>
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
        <span className="text-white/70">{label}</span>
        <span className="text-red-400 font-mono">{value}%</span>
      </div>
      <input
        type="range"
        min="0"
        max="100"
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value))}
        className="w-full h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer accent-red-500"
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
        <label className="text-[10px] text-white/40 uppercase tracking-wider">{label}</label>
        {unit && <span className="text-[9px] text-white/30 font-mono">{unit}</span>}
      </div>
      <div className="relative group">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          className="w-full bg-white/5 border border-white/10 text-white text-sm px-3 py-2 rounded-sm focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-red-500 transition-all font-mono hover:bg-white/10"
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
          <div className="bg-white/5 border border-white/10 p-6 rounded-lg space-y-6">
            <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-4">
              <h4 className="text-sm font-bold text-white uppercase tracking-wide">Primary Weights</h4>
              <Settings2 className="w-4 h-4 text-white/50" />
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

          <div className="bg-white/5 border border-white/10 p-6 rounded-lg space-y-6">
            <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-4">
              <h4 className="text-sm font-bold text-white uppercase tracking-wide">Geometric Preferences</h4>
              <Ruler className="w-4 h-4 text-white/50" />
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
          <div className="bg-red-900/10 border border-red-500/20 p-6 rounded-lg">
            <h4 className="text-sm font-bold text-white mb-4 uppercase tracking-wide">Routing Profiles</h4>
            <p className="text-xs text-white/50 mb-6">Select a routing profile strategy.</p>

            <div className="space-y-3">
              {['Cost Aggressive', 'Balanced Strategy', 'Timeline Critical'].map((profile, i) => (
                <div
                  key={i}
                  onClick={() => onChange({ ...data, activeProfile: profile })}
                  className={cn(
                    "flex items-center justify-between p-3 border transition-all duration-200 cursor-pointer rounded-sm group",
                    data.activeProfile === profile
                      ? "bg-red-500/20 border-red-500/40 shadow-[0_0_15px_-5px_rgba(239,68,68,0.3)]"
                      : "bg-white/5 border-white/5 hover:border-red-500/30 hover:bg-red-500/10"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-8 h-8 rounded-sm flex items-center justify-center font-mono text-xs transition-colors",
                      data.activeProfile === profile ? "bg-red-500/20 text-red-300" : "bg-white/10 text-white/30 group-hover:text-red-400"
                    )}>
                      {i + 1}
                    </div>
                    <div>
                      <div className={cn(
                        "text-sm font-medium transition-colors",
                        data.activeProfile === profile ? "text-white" : "text-white/70 group-hover:text-white"
                      )}>{profile}</div>
                      <div className="text-[10px] text-white/30 uppercase tracking-wider">
                        {data.activeProfile === profile ? 'Active' : 'Draft'}
                      </div>
                    </div>
                  </div>
                  <ChevronRight className={cn(
                    "w-4 h-4 transition-colors",
                    data.activeProfile === profile ? "text-red-400" : "text-white/20 group-hover:text-red-400"
                  )} />
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
          <div className="bg-white/5 border border-white/10 p-6 rounded-lg space-y-6">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <h4 className="text-sm font-bold text-white uppercase tracking-wide">Mechanical Design</h4>
              <Settings2 className="w-4 h-4 text-white/50" />
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

          <div className="bg-white/5 border border-white/10 p-6 rounded-lg space-y-6">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <h4 className="text-sm font-bold text-white uppercase tracking-wide">Operating Conditions</h4>
              <Activity className="w-4 h-4 text-white/50" />
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
          <div className="bg-white/5 border border-white/10 p-6 rounded-lg space-y-6 h-full">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <h4 className="text-sm font-bold text-blue-400 uppercase tracking-wide">Fluid Composition (Gas)</h4>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-blue-300 uppercase bg-blue-500/10 px-2 py-0.5 rounded-sm border border-blue-500/20">Chromatography</span>
                <Droplet className="w-4 h-4 text-blue-400" />
              </div>
            </div>

            <div className="space-y-4">
              <p className="text-xs text-white/40 italic font-light">Define molar composition for Equation of State (EOS) calculations.</p>
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

              <div className="mt-6 pt-6 border-t border-white/10 grid grid-cols-2 gap-4">
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
              "flex items-center gap-2 px-4 py-3 text-xs font-bold uppercase tracking-wider transition-all border-b-2",
              costTab === tab.id
                ? "text-red-400 border-red-500 bg-red-500/10"
                : "text-white/40 border-transparent hover:text-white hover:bg-white/5"
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
    <div className="border border-white/10 rounded-lg overflow-hidden mb-8">
      <table className="w-full text-left text-sm">
        <thead className="bg-white/5 text-[10px] uppercase tracking-wider text-white/50">
          <tr>
            {headers.map((h, i) => <th key={i} className="px-4 py-3 font-bold">{h}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5 bg-transparent text-white/80 font-mono text-xs">
          {rows.map((row, rowIdx) => (
            <tr key={rowIdx} className="hover:bg-white/5 transition-colors">
              {row.map((cell, colIdx) => (
                <td key={colIdx} className="px-4 py-2">
                  {onCellChange ? (
                    <input
                      type="text"
                      value={cell}
                      onChange={(e) => onCellChange(rowIdx, colIdx, e.target.value)}
                      className={cn(
                        "w-full bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-red-500 rounded px-1 py-1",
                        colIdx === 0 ? "font-sans font-bold text-white" : "text-white/70"
                      )}
                    />
                  ) : (
                    <span className={colIdx === 0 ? "font-sans font-bold text-white" : "text-white/70"}>
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
        <h4 className="text-sm font-bold text-white mb-4 uppercase tracking-wide">Material Costs (Pipe)</h4>
        <CostTable
          headers={['Diameter', 'Wall Thickness', 'Grade', 'Cost per Meter', 'Weight (kg/m)']}
          rows={data.materialCosts.map(r => [r.diameter, r.wallThickness, r.grade, r.costPerMeter, r.weight])}
          onCellChange={updateMaterialCosts}
        />
      </div>

      <div>
        <h4 className="text-sm font-bold text-white mb-4 uppercase tracking-wide">Labor Rates (Hourly)</h4>
        <CostTable
          headers={['Region', 'Welder', 'Equipment Operator', 'Laborer', 'Engineer']}
          rows={data.laborRates.map(r => [r.region, r.welder, r.equipmentOperator, r.laborer, r.engineer])}
          onCellChange={updateLaborRates}
        />
      </div>

      <div>
        <h4 className="text-sm font-bold text-white mb-4 uppercase tracking-wide">Equipment Rental (Daily)</h4>
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
        <h4 className="text-sm font-bold text-white mb-4 uppercase tracking-wide">Terrain Multipliers</h4>
        <CostTable
          headers={['Terrain Type', 'Cost Multiplier', 'Cost per km', 'Rationale']}
          rows={data.terrainMultipliers.map(r => [r.terrainType, r.multiplier, r.costPerKm, r.rationale])}
          onCellChange={updateTerrainMultipliers}
        />
      </div>

      <div>
        <h4 className="text-sm font-bold text-white mb-4 uppercase tracking-wide">ROW Acquisition (USA Avg)</h4>
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
        <h4 className="text-sm font-bold text-white mb-4 uppercase tracking-wide">Water Crossings</h4>
        <CostTable
          headers={['Type', 'Width', 'Open Cut ($/m)', 'HDD Cost ($/m)', 'HDD Multiplier']}
          rows={data.waterCrossings.map(r => [r.type, r.width, r.openCut, r.hddCost, r.hddMultiplier])}
          onCellChange={updateWaterCrossings}
        />
      </div>

      <div>
        <h4 className="text-sm font-bold text-white mb-4 uppercase tracking-wide">Infrastructure Crossings</h4>
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
        <h4 className="text-sm font-bold text-white mb-4 uppercase tracking-wide">Regional Cost Multipliers</h4>
        <CostTable
          headers={['Region', 'Cost per km', 'Labor Index', 'Material Index', 'Notes']}
          rows={data.regionalFactors.map(r => [r.region, r.costPerKm, r.laborIndex, r.materialIndex, r.notes])}
          onCellChange={updateRegionalFactors}
        />
      </div>

      <div>
        <h4 className="text-sm font-bold text-white mb-4 uppercase tracking-wide">Permitting & Environmental</h4>
        <CostTable
          headers={['Item', 'Cost Range', 'Timeline/Notes']}
          rows={data.permitting.map(r => [r.item, r.costRange, r.timeline])}
          onCellChange={updatePermitting}
        />
      </div>

      <div>
        <h4 className="text-sm font-bold text-white mb-4 uppercase tracking-wide">Indirect Costs & Facilities</h4>
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
          <h4 className="text-xs font-bold text-white/50 uppercase tracking-widest border-b border-white/10 pb-2">Geographical Exclusions</h4>
          <div className="grid grid-cols-1 gap-3">
            {exclusionItems.map((item) => (
              <div
                key={item.key}
                onClick={() => toggleExclusion(item.key)}
                className={cn(
                  "p-3 border rounded-sm flex items-center gap-4 transition-all cursor-pointer group",
                  data.geographicalExclusions[item.key]
                    ? "bg-red-500/10 border-red-500/30 shadow-[0_0_10px_-5px_rgba(239,68,68,0.2)]"
                    : "bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/10"
                )}
              >
                <button className={cn(
                  "w-5 h-5 rounded-sm border flex items-center justify-center transition-colors",
                  data.geographicalExclusions[item.key] ? "bg-red-500 border-red-500 text-white" : "border-white/20 bg-transparent"
                )}>
                  {data.geographicalExclusions[item.key] && <CheckCircle2 className="w-3.5 h-3.5" />}
                </button>
                <div className="flex-1">
                  <h4 className={cn("text-xs font-bold uppercase tracking-wide transition-colors", data.geographicalExclusions[item.key] ? "text-white" : "text-white/50")}>
                    {item.label}
                  </h4>
                  <p className="text-[10px] text-white/40 font-light">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <h4 className="text-xs font-bold text-white/50 uppercase tracking-widest border-b border-white/10 pb-2">Constructability Limits</h4>
          <div className="bg-white/5 border border-white/10 p-6 rounded-lg space-y-6">
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
            <p className="text-[10px] text-white/30 italic pt-2 border-t border-white/10 font-light">
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
  lastCreatedJob: PirlJobCreateResponse['job'] | null
  onViewJobs: () => void
}

function ReviewSection({ objectives, hydraulics, constraints, onSubmit, isSubmitting, submitSuccess, submitError, lastCreatedJob, onViewJobs }: ReviewSectionProps) {
  const activeConstraints = Object.values(constraints.geographicalExclusions).filter(Boolean).length

  // Timer state for countdown
  const [remainingTime, setRemainingTime] = useState<number | null>(null)

  useEffect(() => {
    if (lastCreatedJob?.estimated_completion) {
      const updateTimer = () => {
        const now = new Date()
        const completion = new Date(lastCreatedJob.estimated_completion)
        const diff = Math.max(0, Math.floor((completion.getTime() - now.getTime()) / 1000))
        setRemainingTime(diff)
      }
      updateTimer()
      const interval = setInterval(updateTimer, 1000)
      return () => clearInterval(interval)
    }
  }, [lastCreatedJob])

  // Format time as HH:MM:SS
  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  return (
    <div className="animate-in fade-in duration-500 h-full flex flex-col">
      <SectionHeader
        title="Review & Launch Simulation"
        description="Verify all parameters before initializing the PIRL training session. This will create a job that will process for 24 hours."
      />

      <div className="flex-1 flex items-center justify-center">
        <div className="w-full max-w-lg bg-card border border-border p-8 rounded-lg text-center space-y-6">

          {submitSuccess && lastCreatedJob ? (
            <>
              <div className="relative">
                <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto" />
                <div className="absolute -top-1 -right-1 w-6 h-6 bg-emerald-500 rounded-full flex items-center justify-center animate-bounce">
                  <span className="text-white text-xs font-bold">1</span>
                </div>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-foreground mb-2">Job Created Successfully!</h3>
                <p className="text-muted-foreground text-sm mb-4">Job ID: <span className="font-mono text-emerald-400">{lastCreatedJob.job_id}</span></p>
              </div>

              {/* 24-hour Timer Display */}
              <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-6">
                <div className="text-[10px] text-red-300/60 uppercase tracking-widest mb-2">Time Remaining</div>
                <div className="text-4xl font-mono font-bold text-red-400 tracking-wider">
                  {remainingTime !== null ? formatTime(remainingTime) : '24:00:00'}
                </div>
                <div className="text-[10px] text-white/40 mt-2">Estimated completion: {new Date(lastCreatedJob.estimated_completion).toLocaleString()}</div>
              </div>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    // Reset for new submission
                    setRemainingTime(null)
                  }}
                >
                  <Play className="w-4 h-4 mr-2" />
                  Submit Another
                </Button>
                <Button
                  className="flex-1 bg-red-600 hover:bg-red-500"
                  onClick={onViewJobs}
                >
                  <Loader2 className="w-4 h-4 mr-2" />
                  View All Jobs
                </Button>
              </div>
            </>
          ) : (
            <>
              <Brain className="w-16 h-16 text-primary mx-auto" />

              <div>
                <h3 className="text-xl font-semibold text-foreground mb-2">Ready to Initialize</h3>
                <p className="text-muted-foreground text-sm">Processing Time: <span className="text-foreground font-medium">24 hours</span></p>
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
                    Creating Job...
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

// Jobs Section with individual timers
function JobsSection({ jobs, onRefresh }: { jobs: PirlJob[], onRefresh: () => void }) {
  const [timers, setTimers] = useState<Record<string, number>>({})

  // Update all timers every second
  useEffect(() => {
    const updateTimers = () => {
      const now = new Date()
      const newTimers: Record<string, number> = {}
      jobs.forEach(job => {
        if (job.estimated_completion) {
          const completion = new Date(job.estimated_completion)
          newTimers[job.job_id] = Math.max(0, Math.floor((completion.getTime() - now.getTime()) / 1000))
        }
      })
      setTimers(newTimers)
    }
    updateTimers()
    const interval = setInterval(updateTimers, 1000)
    return () => clearInterval(interval)
  }, [jobs])

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'processing': return 'text-amber-400'
      case 'completed': return 'text-emerald-400'
      case 'failed': return 'text-red-400'
      default: return 'text-white/50'
    }
  }

  const getStatusBg = (status: string) => {
    switch (status) {
      case 'processing': return 'bg-amber-500/10 border-amber-500/20'
      case 'completed': return 'bg-emerald-500/10 border-emerald-500/20'
      case 'failed': return 'bg-red-500/10 border-red-500/20'
      default: return 'bg-white/5 border-white/10'
    }
  }

  return (
    <div className="animate-in fade-in duration-500 h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-xl font-bold text-white mb-2 tracking-wide">Active PIRL Jobs</h3>
          <p className="text-sm text-white/50 max-w-3xl leading-relaxed font-light">
            Monitor your submitted PIRL optimization jobs. Each job has a 24-hour processing window.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onRefresh} className="border-white/10">
          <RotateCcw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {jobs.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-white/40">
            <Loader2 className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <p>No jobs submitted yet</p>
            <p className="text-xs mt-1">Go to Review & Launch to submit a new job</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 overflow-y-auto pb-4">
          {jobs.map((job) => (
            <div
              key={job.job_id}
              className={cn(
                "border rounded-lg p-5 transition-all",
                getStatusBg(job.status)
              )}
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-sm font-bold text-white">{job.job_id}</span>
                    <span className={cn(
                      "px-2 py-0.5 text-[10px] uppercase tracking-wider rounded-full border font-bold",
                      getStatusColor(job.status),
                      getStatusBg(job.status)
                    )}>
                      {job.status}
                    </span>
                  </div>
                  <div className="text-[10px] text-white/40">
                    Profile: <span className="text-white/60">{job.active_profile}</span>
                  </div>
                </div>

                {/* Timer */}
                {job.status === 'processing' && timers[job.job_id] !== undefined && (
                  <div className="text-right">
                    <div className="text-[9px] text-white/30 uppercase tracking-widest mb-1">Time Remaining</div>
                    <div className="text-2xl font-mono font-bold text-red-400">
                      {formatTime(timers[job.job_id])}
                    </div>
                  </div>
                )}
                {job.status === 'completed' && (
                  <div className="text-right">
                    <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                  </div>
                )}
              </div>

              {/* Progress bar */}
              {job.status === 'processing' && (
                <div className="mb-3">
                  <div className="flex justify-between text-[10px] text-white/40 mb-1">
                    <span>{job.current_phase}</span>
                    <span>{job.progress_percent}%</span>
                  </div>
                  <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-amber-500 to-red-500 transition-all duration-500"
                      style={{ width: `${job.progress_percent}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Phases */}
              {job.phases && job.phases.length > 0 && (
                <div className="flex gap-1 mt-3">
                  {job.phases.map((phase, idx) => (
                    <div
                      key={idx}
                      className={cn(
                        "flex-1 h-1 rounded-full transition-all",
                        phase.status === 'completed' ? 'bg-emerald-500' :
                        phase.status === 'in_progress' ? 'bg-amber-500 animate-pulse' :
                        'bg-white/10'
                      )}
                      title={phase.name}
                    />
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/5">
                <div className="text-[10px] text-white/30">
                  Created: {new Date(job.created_at).toLocaleString()}
                </div>
                <div className="text-[10px] text-white/30 font-mono truncate max-w-[200px]" title={job.directory}>
                  {job.directory.split('/').slice(-3).join('/')}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
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
          <div key={i} className="relative group bg-white/5 border border-white/10 rounded-lg p-6 hover:bg-white/10 hover:border-red-500/30 transition-all duration-300">

            <div className="flex items-center justify-between relative z-10">
              <div className="flex items-center gap-5 flex-1 min-w-0 mr-8">
                <div className="flex-shrink-0 p-3 bg-red-500/10 border border-red-500/20 rounded-md group-hover:bg-red-500/20 group-hover:shadow-[0_0_15px_-5px_rgba(239,68,68,0.4)] transition-all">
                  <Sparkles className="w-6 h-6 text-red-500" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <h4 className="text-base font-bold text-white truncate tracking-wide" title={result.filename}>
                      {result.filename}
                    </h4>
                    <span className="flex-shrink-0 px-2 py-0.5 text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full font-bold uppercase tracking-wider">
                      Optimal
                    </span>
                  </div>

                  <div className="flex items-center gap-4 text-xs font-mono text-white/40">
                    <span className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                      {new Date(result.last_modified).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 flex-shrink-0">
                <Button variant="outline" size="sm" className="text-xs border-white/10 text-white/70 hover:text-white hover:bg-white/10 hover:border-white/20 font-mono uppercase tracking-wider">
                  <Download className="w-3.5 h-3.5 mr-2" />
                  Download
                </Button>
                <Button size="sm" className="text-xs bg-red-600 hover:bg-red-500 text-white font-mono uppercase tracking-wider shadow-[0_0_15px_-5px_rgba(239,68,68,0.4)] border border-red-400/20">
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
