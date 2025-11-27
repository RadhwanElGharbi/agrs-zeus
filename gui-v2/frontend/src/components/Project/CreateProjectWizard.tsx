'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import maplibregl, { Map as MapLibreMap } from 'maplibre-gl'
import MapboxDraw from '@mapbox/mapbox-gl-draw'
import {
  AOIPreviewResponse,
  previewAoi,
  previewPoint,
  PointPreviewResponse,
  createProject,
  CreateProjectResponse,
  ProjectCRSRecommendation,
} from '@/lib/api/dataClient'
import { useProject } from '@/lib/context/ProjectContext'
import { CRSSelectorDialog } from './CRSSelectorDialog'
import { cn } from '@/lib/utils'
import {
  X,
  UploadCloud,
  MapPin,
  Compass,
  FileText,
  CheckCircle2,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Layers,
  Globe,
} from 'lucide-react'

interface CreateProjectWizardProps {
  open: boolean
  onClose: () => void
  onCreated: (projectName: string) => void
}

type MeasurementSystem = 'SI' | 'Imperial'
type AOIMode = 'upload' | 'draw'

const STEPS = [
  { id: 'identity', label: 'Identity & Units' },
  { id: 'aoi', label: 'AOI Capture' },
  { id: 'crs', label: 'Coordinate System' },
  { id: 'pipeline', label: 'Pipeline Specs' },
  { id: 'review', label: 'Review' },
]

const UNIT_TABLE: Record<MeasurementSystem, { quantity: string; unit: string }[]> = {
  SI: [
    { quantity: 'Length', unit: 'Meter (m)' },
    { quantity: 'Area', unit: 'Square meter (m²)' },
    { quantity: 'Volume', unit: 'Cubic meter (m³)' },
    { quantity: 'Pressure', unit: 'Pascal (Pa)' },
    { quantity: 'Mass', unit: 'Kilogram (kg)' },
    { quantity: 'Temperature', unit: 'Celsius (°C)' },
    { quantity: 'Velocity', unit: 'Meters/second (m/s)' },
    { quantity: 'Density', unit: 'kg/m³' },
  ],
  Imperial: [
    { quantity: 'Length', unit: 'Foot (ft)' },
    { quantity: 'Area', unit: 'Square foot (ft²)' },
    { quantity: 'Volume', unit: 'Cubic foot (ft³)' },
    { quantity: 'Pressure', unit: 'Pounds per square inch (psi)' },
    { quantity: 'Mass', unit: 'Pound (lb)' },
    { quantity: 'Temperature', unit: 'Fahrenheit (°F)' },
    { quantity: 'Velocity', unit: 'Feet/second (ft/s)' },
    { quantity: 'Density', unit: 'lb/ft³' },
  ],
}

export function CreateProjectWizard({ open, onClose, onCreated }: CreateProjectWizardProps) {
  const { projects, refreshProjects, setCurrentProject } = useProject()
  const [mounted, setMounted] = useState(false)
  const [stepIndex, setStepIndex] = useState(0)
  const [projectName, setProjectName] = useState('')
  const [organization, setOrganization] = useState('')
  const [projectCreator, setProjectCreator] = useState('')
  const [measurementSystem, setMeasurementSystem] = useState<MeasurementSystem>('SI')
  const [projectIdPreview, setProjectIdPreview] = useState('ORG_PROJECT_ISO_YEAR_SEQ')
  const [aoiMode, setAoiMode] = useState<AOIMode>('upload')
  const [aoiFile, setAoiFile] = useState<File | null>(null)
  const [startPointFile, setStartPointFile] = useState<File | null>(null)
  const [endPointFile, setEndPointFile] = useState<File | null>(null)
  const [drawOverlayOpen, setDrawOverlayOpen] = useState(false)
  const [drawnAoi, setDrawnAoi] = useState<any>(null)
  const [startPointCoords, setStartPointCoords] = useState<{ lat: number; lon: number } | null>(null)
  const [endPointCoords, setEndPointCoords] = useState<{ lat: number; lon: number } | null>(null)
  const [aoiSummary, setAoiSummary] = useState<AOIPreviewResponse | null>(null)
  const [crsSelection, setCrsSelection] = useState<ProjectCRSRecommendation | null>(null)
  const [crsDialogOpen, setCrsDialogOpen] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [product, setProduct] = useState('Natural Gas')
  const [innerDiameter, setInnerDiameter] = useState('')
  const [outerDiameter, setOuterDiameter] = useState('')
  const [innerDiameterUnit, setInnerDiameterUnit] = useState('mm')
  const [outerDiameterUnit, setOuterDiameterUnit] = useState('mm')
  const [submitState, setSubmitState] = useState<{ loading: boolean; error: string | null }>({
    loading: false,
    error: null,
  })
  const [isClosing, setIsClosing] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const handleClose = () => {
    setIsClosing(true)
    setTimeout(() => onClose(), 150)
  }

  useEffect(() => {
    if (open) {
      setIsClosing(false)
    } else {
      setTimeout(() => {
        setStepIndex(0)
        setAoiSummary(null)
        setCrsSelection(null)
        setPreviewError(null)
        setSubmitState({ loading: false, error: null })
        setDrawnAoi(null)
        setStartPointCoords(null)
        setEndPointCoords(null)
        setAoiFile(null)
      }, 200)
    }
  }, [open])

  useEffect(() => {
    const iso = (aoiSummary?.iso3 || 'ISO').toUpperCase()
    const sanitizedName = sanitizeProjectName(projectName)
    const orgSlug = sanitizeOrganization(organization)
    const year = new Date().getFullYear()
    const prefix = `${orgSlug}_${sanitizedName || 'PROJECT'}_${iso || 'ISO'}_${year}_`
    let seq = 1
    projects.forEach((proj) => {
      if (proj.project_id && proj.project_id.startsWith(prefix)) {
        const suffix = proj.project_id.slice(prefix.length)
        const parsed = parseInt(suffix, 10)
        if (!Number.isNaN(parsed)) {
          seq = Math.max(seq, parsed + 1)
        }
      }
    })
    setProjectIdPreview(`${prefix}${seq.toString().padStart(3, '0')}`)
  }, [projectName, organization, aoiSummary?.iso3, projects])

  useEffect(() => {
    if (measurementSystem === 'SI') {
      setInnerDiameterUnit('mm')
      setOuterDiameterUnit('mm')
    } else {
      setInnerDiameterUnit('in')
      setOuterDiameterUnit('in')
    }
  }, [measurementSystem])

  const isStepValid = useMemo(() => {
    switch (stepIndex) {
      case 0:
        return Boolean(projectName) && Boolean(organization) && Boolean(projectCreator)
      case 1:
        return Boolean(aoiSummary)
      case 2:
        return Boolean(aoiSummary) // CRS step valid if AOI summary exists (which provides default)
      case 3:
        return (
          Boolean(product) &&
          innerDiameter !== '' &&
          outerDiameter !== '' &&
          parseFloat(outerDiameter) > parseFloat(innerDiameter)
        )
      case 4:
        return true
      default:
        return false
    }
  }, [stepIndex, projectName, organization, projectCreator, aoiSummary, product, innerDiameter, outerDiameter])

  const handleAoiPreview = async (options?: { geojson?: any; file?: File }) => {
    setPreviewLoading(true)
    setPreviewError(null)
    try {
      const formData = new FormData()
      if (options?.geojson) {
        formData.append('drawn_geojson', JSON.stringify(options.geojson))
      } else if (options?.file) {
        formData.append('aoi_file', options.file)
      } else if (aoiFile) {
        formData.append('aoi_file', aoiFile)
      } else {
        throw new Error('Upload an AOI file or draw an area to continue.')
      }
      const summary = await previewAoi(formData)
      setAoiSummary(summary)
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : 'Unable to analyze AOI.')
      setAoiSummary(null)
    } finally {
      setPreviewLoading(false)
    }
  }

  const handleDrawSave = (payload: {
    geojson: any
    startPoint?: { lat: number; lon: number }
    endPoint?: { lat: number; lon: number }
  }) => {
    setDrawnAoi(payload.geojson)
    setStartPointCoords(payload.startPoint || null)
    setEndPointCoords(payload.endPoint || null)
    setAoiFile(null)
    setDrawOverlayOpen(false)
    void handleAoiPreview({ geojson: payload.geojson })
  }

  const handleStartPointFile = async (file: File | null) => {
    setStartPointFile(file)
    if (file) {
      try {
        const result = await previewPoint(file)
        setStartPointCoords({ lat: result.latitude, lon: result.longitude })
      } catch (error) {
        console.error('Failed to parse start point file:', error)
        setStartPointCoords(null)
      }
    } else {
      setStartPointCoords(null)
    }
  }

  const handleEndPointFile = async (file: File | null) => {
    setEndPointFile(file)
    if (file) {
      try {
        const result = await previewPoint(file)
        setEndPointCoords({ lat: result.latitude, lon: result.longitude })
      } catch (error) {
        console.error('Failed to parse end point file:', error)
        setEndPointCoords(null)
      }
    } else {
      setEndPointCoords(null)
    }
  }

  const handleSubmit = async () => {
    if (!aoiSummary) {
      setSubmitState({ loading: false, error: 'AOI summary missing.' })
      return
    }
    setSubmitState({ loading: true, error: null })
    try {
      const formData = new FormData()
      const sanitizedName = sanitizeProjectName(projectName)
      formData.append('project_name', sanitizedName)
      formData.append('organization', organization)
      formData.append('project_creator', projectCreator)
      formData.append('measurement_system', measurementSystem)
      formData.append('product', product)

      // Convert to base units (Meters or Inches) before sending
      const innerD = parseFloat(innerDiameter)
      const outerD = parseFloat(outerDiameter)
      let innerDBase = innerD
      let outerDBase = outerD

      if (measurementSystem === 'SI') {
        // Base unit: Meter
        if (innerDiameterUnit === 'mm') innerDBase = innerD / 1000
        else if (innerDiameterUnit === 'cm') innerDBase = innerD / 100
        
        if (outerDiameterUnit === 'mm') outerDBase = outerD / 1000
        else if (outerDiameterUnit === 'cm') outerDBase = outerD / 100
      } else {
        // Base unit: Inches
        if (innerDiameterUnit === 'ft') innerDBase = innerD * 12
        if (outerDiameterUnit === 'ft') outerDBase = outerD * 12
      }

      formData.append('inner_diameter', String(innerDBase))
      formData.append('outer_diameter', String(outerDBase))

      if (aoiMode === 'upload' && aoiFile) {
        formData.append('aoi_file', aoiFile)
      } else if (drawnAoi) {
        formData.append('drawn_geojson', JSON.stringify(drawnAoi))
      }

      if (startPointFile) {
        formData.append('start_point_file', startPointFile)
      } else if (startPointCoords) {
        formData.append('start_point_lat', String(startPointCoords.lat))
        formData.append('start_point_lon', String(startPointCoords.lon))
      }

      if (endPointFile) {
        formData.append('end_point_file', endPointFile)
      } else if (endPointCoords) {
        formData.append('end_point_lat', String(endPointCoords.lat))
        formData.append('end_point_lon', String(endPointCoords.lon))
      }

      if (crsSelection) {
        formData.append('crs_epsg', String(crsSelection.epsg))
        formData.append('crs_name', crsSelection.name)
      }

      const response: CreateProjectResponse = await createProject(formData)
      await refreshProjects()
      setCurrentProject(response.project_name)
      
      setIsClosing(true)
      setTimeout(() => {
        onCreated(response.project_name)
        onClose()
      }, 150)
    } catch (error) {
      setSubmitState({
        loading: false,
    error: error instanceof Error ? error.message : 'Failed to create project.'
      })
      return
    }
    setSubmitState({ loading: false, error: null })
  }

  const body = (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6">
      <div 
        className={cn(
          "absolute inset-0 bg-black/90 backdrop-blur-xl overflow-hidden",
          isClosing ? "animate-fade-out" : "animate-fade-in"
        )}
        onClick={handleClose}
      >
        {/* Dynamic Aurora Background */}
        <div className="absolute inset-0 bg-[linear-gradient(90deg,#581c8733_0%,#1e3a8a33_20%,#064e3b33_40%,#14532d33_60%,#713f1233_80%,#7f1d1d33_100%)] bg-[length:200%_100%] animate-aurora" />
        
        {/* Moving Grid */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.1)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.1)_1px,transparent_1px)] bg-[size:40px_40px]" />
        
        {/* Vignette */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_10%,#000000_100%)]" />
      </div>

      <div 
        className={cn(
          "relative z-10 w-full max-w-6xl max-h-[90vh] overflow-hidden bg-[#050505]/95 border border-white/10 rounded-sm shadow-[0_0_60px_rgba(0,0,0,0.8)] flex flex-col",
          isClosing ? "animate-fade-out" : "animate-fade-in"
        )}
      >
        {/* Decorative Top Line */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-primary/50 to-transparent" />

        <header className="flex items-center justify-between px-8 py-6 border-b border-white/10 bg-black/30">
          <div>
            <div className="text-xs font-mono uppercase tracking-[0.25em] text-white/50">Project Creator</div>
            <h2 className="text-2xl font-bold text-white uppercase tracking-wide">New Pipeline Project</h2>
          </div>
          <button onClick={handleClose} className="p-2 rounded-sm border border-transparent hover:border-white/20 hover:bg-white/5 text-white/60 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </header>

        <div className="flex flex-1 overflow-hidden">
          <aside className="w-64 border-r border-white/5 bg-black/40 px-4 py-6 space-y-4">
            {STEPS.map((step, idx) => (
              <button
                key={step.id}
                onClick={() => setStepIndex(idx)}
                className={cn(
                  'w-full text-left px-4 py-3 rounded-sm border transition-all font-mono text-xs uppercase tracking-wider',
                  idx === stepIndex
                    ? 'border-primary text-primary bg-primary/10 shadow-[0_0_15px_rgba(var(--primary),0.3)]'
                    : 'border-white/10 text-white/60 hover:text-white hover:border-white/30'
                )}
              >
                {idx + 1}. {step.label}
              </button>
            ))}
          </aside>

          <section className="flex-1 overflow-y-auto p-8 space-y-8">
            {stepIndex === 0 && (
              <IdentityStep
                projectName={projectName}
                organization={organization}
                projectCreator={projectCreator}
                measurementSystem={measurementSystem}
                projectIdPreview={projectIdPreview}
                onProjectNameChange={(value) => setProjectName(sanitizeProjectName(value))}
                onOrganizationChange={setOrganization}
                onCreatorChange={setProjectCreator}
                onMeasurementSystemChange={(value) => setMeasurementSystem(value)}
              />
            )}

            {stepIndex === 1 && (
              <AOIStep
                mode={aoiMode}
                onModeChange={setAoiMode}
                aoiFile={aoiFile}
                onFileChange={(file) => {
                  setAoiFile(file)
                  setDrawnAoi(null)
                  if (file) {
                    void handleAoiPreview({ file })
                  } else {
                    setAoiSummary(null)
                  }
                }}
                startPointFile={startPointFile}
                endPointFile={endPointFile}
                startPointCoords={startPointCoords}
                endPointCoords={endPointCoords}
                onStartPointFile={handleStartPointFile}
                onEndPointFile={handleEndPointFile}
                summary={aoiSummary}
                crsSelection={crsSelection}
                onLaunchCrsSelector={() => setCrsDialogOpen(true)}
                previewError={previewError}
                previewLoading={previewLoading}
                onLaunchDraw={() => {
                  setDrawOverlayOpen(true)
                  setAoiMode('draw')
                }}
              />
            )}

            {stepIndex === 2 && (
              <CRSStep
                summary={aoiSummary}
                crsSelection={crsSelection}
                onLaunchCrsSelector={() => setCrsDialogOpen(true)}
              />
            )}

            {stepIndex === 3 && (
              <PipelineStep
                product={product}
                innerDiameter={innerDiameter}
                outerDiameter={outerDiameter}
                measurementSystem={measurementSystem}
                innerDiameterUnit={innerDiameterUnit}
                outerDiameterUnit={outerDiameterUnit}
                onProductChange={setProduct}
                onInnerDiameterChange={setInnerDiameter}
                onOuterDiameterChange={setOuterDiameter}
                onInnerDiameterUnitChange={setInnerDiameterUnit}
                onOuterDiameterUnitChange={setOuterDiameterUnit}
              />
            )}

            {stepIndex === 4 && (
              <ReviewStep
                projectName={projectName}
                organization={organization}
                projectCreator={projectCreator}
                measurementSystem={measurementSystem}
                units={UNIT_TABLE[measurementSystem]}
                aoiSummary={aoiSummary}
                crsSelection={crsSelection}
                product={product}
                innerDiameter={innerDiameter}
                outerDiameter={outerDiameter}
                innerDiameterUnit={innerDiameterUnit}
                outerDiameterUnit={outerDiameterUnit}
                projectIdPreview={projectIdPreview}
              />
            )}
          </section>
        </div>

        <footer className="flex items-center justify-between px-8 py-5 border-t border-white/10 bg-black/40">
          <div className="text-xs font-mono text-white/40 uppercase tracking-widest">
            Step {stepIndex + 1} of {STEPS.length}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setStepIndex(Math.max(0, stepIndex - 1))}
              disabled={stepIndex === 0 || submitState.loading}
              className="flex items-center gap-2 px-5 py-2 text-xs font-mono uppercase tracking-wider text-white/50 border border-white/15 rounded-sm hover:text-white hover:border-white/40 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
              Back
            </button>
            {stepIndex < STEPS.length - 1 ? (
              <button
                onClick={() => setStepIndex(Math.min(STEPS.length - 1, stepIndex + 1))}
                disabled={!isStepValid || submitState.loading}
                className={cn(
                  'flex items-center gap-2 px-6 py-2 text-xs font-mono uppercase tracking-wider rounded-sm border transition-all',
                  isStepValid
                    ? 'bg-primary text-black border-primary hover:bg-primary/90'
                    : 'bg-white/5 text-white/30 border-white/10 cursor-not-allowed'
                )}
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={!isStepValid || submitState.loading}
                className="flex items-center gap-2 px-6 py-2 text-xs font-mono uppercase tracking-wider rounded-sm bg-primary text-black border border-primary hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {submitState.loading ? (
                  <>
                    <LoaderDots />
                    Creating...
                  </>
                ) : (
                  <>
                    Deploy Project
                    <CheckCircle2 className="w-4 h-4" />
                  </>
                )}
              </button>
            )}
          </div>
        </footer>

        {submitState.error && (
          <div className="border-t border-red-500/30 bg-red-500/10 text-red-300 px-8 py-3 text-xs font-mono flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            {submitState.error}
          </div>
        )}
      </div>

      <AOIDrawOverlay
        open={drawOverlayOpen}
        onClose={() => setDrawOverlayOpen(false)}
        onSave={handleDrawSave}
      />
      
      <CRSSelectorDialog
        open={crsDialogOpen}
        onClose={() => setCrsDialogOpen(false)}
        onSelect={(crs) => {
          setCrsSelection({
            epsg: crs.epsg,
            name: crs.name,
            reason: 'Manual Selection',
            utm_zone: null,
            hemisphere: null
          })
          setCrsDialogOpen(false)
        }}
      />
    </div>
  )

  if (!mounted || !open) return null
  return createPortal(body, document.body)
}

function IdentityStep(props: {
  projectName: string
  organization: string
  projectCreator: string
  measurementSystem: MeasurementSystem
  projectIdPreview: string
  onProjectNameChange: (val: string) => void
  onOrganizationChange: (val: string) => void
  onCreatorChange: (val: string) => void
  onMeasurementSystemChange: (val: MeasurementSystem) => void
}) {
  const units = UNIT_TABLE[props.measurementSystem]
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <label className="text-xs font-mono uppercase text-white/50 tracking-widest">Project Name</label>
          <input
            value={props.projectName}
            onChange={(event) => props.onProjectNameChange(event.target.value)}
            maxLength={48}
            placeholder="e.g. US-PIPELINE-ALPHA"
            className="w-full bg-black/50 border border-white/10 rounded-sm px-4 py-2 text-sm text-white focus:outline-none focus:border-primary"
          />
          <p className="text-[11px] text-white/40 font-mono">Letters, numbers, and hyphen only.</p>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-mono uppercase text-white/50 tracking-widest">Organization</label>
          <input
            value={props.organization}
            onChange={(event) => props.onOrganizationChange(event.target.value)}
            placeholder="e.g. AGRS"
            className="w-full bg-black/50 border border-white/10 rounded-sm px-4 py-2 text-sm text-white focus:outline-none focus:border-primary"
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-mono uppercase text-white/50 tracking-widest">Creator</label>
          <input
            value={props.projectCreator}
            onChange={(event) => props.onCreatorChange(event.target.value)}
            placeholder="e.g. Radwan El-Gharbi"
            className="w-full bg-black/50 border border-white/10 rounded-sm px-4 py-2 text-sm text-white focus:outline-none focus:border-primary"
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-mono uppercase text-white/50 tracking-widest">Measurement System</label>
          <div className="flex gap-2">
            {(['SI', 'Imperial'] as MeasurementSystem[]).map((system) => (
              <button
                key={system}
                onClick={() => props.onMeasurementSystemChange(system)}
                className={cn(
                  'flex-1 border rounded-sm px-3 py-2 text-sm font-mono uppercase tracking-widest transition-all',
                  props.measurementSystem === system
                    ? 'border-primary text-primary bg-primary/10'
                    : 'border-white/10 text-white/60 hover:border-white/30 hover:text-white'
                )}
              >
                {system}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="border border-white/10 rounded-sm p-4 bg-black/40">
          <div className="text-xs font-mono uppercase text-white/50 tracking-widest mb-2">Project ID</div>
          <div className="text-lg font-bold text-white tracking-wide">{props.projectIdPreview}</div>
          <p className="text-[11px] text-white/40 font-mono mt-1">
            ISO code and sequence update once AOI is processed.
          </p>
        </div>
        <div className="border border-white/10 rounded-sm p-4 bg-black/40">
          <div className="text-xs font-mono uppercase text-white/50 tracking-widest mb-3">
            Measurement Units Snapshot
          </div>
          <div className="grid grid-cols-2 gap-2 text-[11px] font-mono text-white/70">
            {units.map((entry) => (
              <div key={entry.quantity} className="flex flex-col border border-white/5 rounded-sm px-3 py-2">
                <span className="text-white/40 uppercase tracking-widest">{entry.quantity}</span>
                <span>{entry.unit}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function AOIStep(props: {
  mode: AOIMode
  onModeChange: (mode: AOIMode) => void
  aoiFile: File | null
  onFileChange: (file: File | null) => void
  startPointFile: File | null
  endPointFile: File | null
  startPointCoords: { lat: number; lon: number } | null
  endPointCoords: { lat: number; lon: number } | null
  onStartPointFile: (file: File | null) => void
  onEndPointFile: (file: File | null) => void
  summary: AOIPreviewResponse | null
  crsSelection: ProjectCRSRecommendation | null
  onLaunchCrsSelector: () => void
  previewLoading: boolean
  previewError: string | null
  onLaunchDraw: () => void
}) {
  return (
    <div className="space-y-8">
      <div className="flex gap-4">
        {(['upload', 'draw'] as AOIMode[]).map((mode) => (
          <button
            key={mode}
            onClick={() => props.onModeChange(mode)}
            className={cn(
              'flex-1 border rounded-sm px-4 py-3 text-sm font-mono uppercase tracking-widest transition-all',
              props.mode === mode
                ? 'border-primary text-primary bg-primary/10'
                : 'border-white/10 text-white/60 hover:border-white/30 hover:text-white'
            )}
          >
            {mode === 'upload' ? 'Upload Geometry' : 'Draw on Map'}
          </button>
        ))}
      </div>

      {props.mode === 'upload' ? (
        <div className="border border-white/10 rounded-sm bg-black/40 overflow-hidden">
          {/* Main AOI Upload */}
          <div className="p-8 flex flex-col items-center justify-center text-center gap-4 hover:bg-white/5 transition-colors relative group">
            <div className="p-4 rounded-full bg-primary/5 text-primary mb-2 group-hover:scale-110 transition-transform duration-500">
              <UploadCloud className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-1">Area of Interest</h3>
              <p className="text-xs text-white/50 font-mono">Supported: GeoJSON, KML, KMZ, GPKG</p>
            </div>
            
            <div className="mt-2">
              <span className={cn(
                "px-4 py-2 rounded-sm text-xs font-mono uppercase tracking-wider border transition-all inline-flex items-center gap-2",
                props.aoiFile 
                  ? "border-primary text-primary bg-primary/10" 
                  : "border-white/20 text-white/60 group-hover:border-white/40 group-hover:text-white"
              )}>
                {props.aoiFile ? (
                  <><CheckCircle2 className="w-3 h-3" /> {props.aoiFile.name}</>
                ) : (
                  "Select Geometry File"
                )}
              </span>
            </div>

            <input 
              type="file"
              accept=".geojson,.json,.gpkg,.kml,.kmz,.zip"
              className="absolute inset-0 opacity-0 cursor-pointer"
              onChange={(event) => props.onFileChange(event.target.files?.[0] || null)}
            />
          </div>

          {/* Divider */}
          <div className="h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent" />

          {/* Points Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-white/10">
            {/* Start Point */}
            <div className="p-6 hover:bg-white/5 transition-colors relative group">
              <div className="flex items-center gap-3 mb-2">
                <MapPin className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-mono uppercase text-white/50 tracking-widest">Start Point</span>
              </div>
              <div className={cn("text-xs font-mono truncate", props.startPointFile ? "text-white" : "text-white/30")}>
                {props.startPointFile ? props.startPointFile.name : "Optional .geojson/.kml"}
              </div>
              {props.startPointCoords && (
                <div className="mt-2 text-[11px] font-mono text-emerald-400/80">
                  {props.startPointCoords.lat.toFixed(6)}°, {props.startPointCoords.lon.toFixed(6)}°
                </div>
              )}
              <input 
                type="file"
                accept=".geojson,.json,.gpkg,.kml,.kmz"
                className="absolute inset-0 opacity-0 cursor-pointer"
                onChange={(event) => props.onStartPointFile(event.target.files?.[0] || null)}
              />
            </div>

            {/* End Point */}
            <div className="p-6 hover:bg-white/5 transition-colors relative group">
              <div className="flex items-center gap-3 mb-2">
                <MapPin className="w-4 h-4 text-red-400" />
                <span className="text-xs font-mono uppercase text-white/50 tracking-widest">End Point</span>
              </div>
              <div className={cn("text-xs font-mono truncate", props.endPointFile ? "text-white" : "text-white/30")}>
                {props.endPointFile ? props.endPointFile.name : "Optional .geojson/.kml"}
              </div>
              {props.endPointCoords && (
                <div className="mt-2 text-[11px] font-mono text-red-400/80">
                  {props.endPointCoords.lat.toFixed(6)}°, {props.endPointCoords.lon.toFixed(6)}°
                </div>
              )}
              <input 
                type="file"
                accept=".geojson,.json,.gpkg,.kml,.kmz"
                className="absolute inset-0 opacity-0 cursor-pointer"
                onChange={(event) => props.onEndPointFile(event.target.files?.[0] || null)}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="border border-white/10 rounded-md p-6 bg-black/30 flex flex-col gap-4">
          <p className="text-sm text-white/70 font-mono">
            Use the MapLibre console to digitize the AOI polygon and pin start/end points.
          </p>
          <button
            onClick={props.onLaunchDraw}
            className="self-start px-4 py-2 text-xs font-mono uppercase tracking-widest border border-primary text-primary rounded-sm hover:bg-primary/10 flex items-center gap-2"
          >
            <Layers className="w-4 h-4" />
            Launch Drawing Console
          </button>
        </div>
      )}

      {props.previewLoading && (
        <div className="text-xs font-mono text-white/50 uppercase tracking-widest flex items-center gap-2">
          <LoaderDots />
          Analyzing AOI...
        </div>
      )}

      {props.previewError && (
        <div className="text-xs text-red-300 font-mono flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          {props.previewError}
        </div>
      )}

      {props.summary && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SummaryCard
            icon={<FileText className="w-5 h-5 text-primary" />}
            title="AOI Area"
            value={`${props.summary.area_km2.toLocaleString()} km²`}
            subtitle="Computed via WGS84 ellipsoid"
          />
          <SummaryCard
            icon={<MapPin className="w-5 h-5 text-primary" />}
            title="Countries"
            value={props.summary.country || 'Pending'}
            subtitle="Derived from centroid"
          />
        </div>
      )}
    </div>
  )
}

function CRSStep(props: {
  summary: AOIPreviewResponse | null
  crsSelection: ProjectCRSRecommendation | null
  onLaunchCrsSelector: () => void
}) {
  const displayCRS = props.crsSelection || props.summary?.recommended_crs

  return (
    <div className="space-y-6">
      <div className="border border-white/10 rounded-sm p-6 bg-black/40">
        <div className="flex items-start gap-4 mb-6">
          <div className="p-3 border border-white/10 rounded-sm bg-black/30 text-primary">
            <Globe className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Coordinate Reference System</h3>
            <p className="text-sm text-white/60 max-w-lg mt-1">
              The system automatically recommends a UTM zone based on your AOI's geographic centroid. You can override this if your project requires a specific projection.
            </p>
          </div>
        </div>

        <div className="bg-black/50 border border-white/10 rounded-sm p-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <div className="text-xs font-mono uppercase text-white/50 tracking-widest mb-1">Selected System</div>
            <div className="text-xl font-bold text-white mb-1">{displayCRS?.name || 'Pending Analysis'}</div>
            <div className="flex items-center gap-3 text-sm font-mono">
              <span className="text-primary bg-primary/10 px-2 py-0.5 rounded-sm">
                EPSG:{displayCRS?.epsg}
              </span>
              <span className="text-white/40">
                • {props.crsSelection ? 'Manual Selection' : 'Auto-Recommended'}
              </span>
            </div>
          </div>

          <button
            onClick={props.onLaunchCrsSelector}
            className="px-6 py-3 text-sm font-mono uppercase tracking-wider bg-white/5 border border-white/20 text-white hover:bg-white/10 hover:border-white/40 hover:text-primary transition-all rounded-sm flex items-center gap-2"
          >
            <Globe className="w-4 h-4" />
            Change System
          </button>
        </div>

        {displayCRS?.reason && (
          <div className="mt-4 flex items-center gap-2 text-xs text-white/40 font-mono px-2">
            <div className="w-1.5 h-1.5 rounded-full bg-primary/50" />
            {displayCRS.reason}
          </div>
        )}
      </div>
    </div>
  )
}

function PipelineStep(props: {
  product: string
  innerDiameter: string
  outerDiameter: string
  measurementSystem: MeasurementSystem
  innerDiameterUnit: string
  outerDiameterUnit: string
  onProductChange: (val: string) => void
  onInnerDiameterChange: (val: string) => void
  onOuterDiameterChange: (val: string) => void
  onInnerDiameterUnitChange: (val: string) => void
  onOuterDiameterUnitChange: (val: string) => void
}) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <label className="text-xs font-mono uppercase text-white/50 tracking-widest">Transported Product</label>
          <select
            value={props.product}
            onChange={(event) => props.onProductChange(event.target.value)}
            className="w-full bg-black/50 border border-white/10 rounded-sm px-4 py-2 text-sm text-white focus:outline-none focus:border-primary"
          >
            <option>Natural Gas</option>
            <option>Crude Oil</option>
            <option>Refined Products</option>
            <option>Hydrogen</option>
            <option>CO₂</option>
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-mono uppercase text-white/50 tracking-widest">Measurement System</label>
          <div className="bg-black/50 border border-white/10 rounded-sm px-4 py-2 text-sm text-white">
            {props.measurementSystem}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <DiameterField
          label="Inside Diameter"
          value={props.innerDiameter}
          unit={props.innerDiameterUnit}
          onChange={props.onInnerDiameterChange}
          onUnitChange={props.onInnerDiameterUnitChange}
          measurementSystem={props.measurementSystem}
        />
        <DiameterField
          label="Outside Diameter"
          value={props.outerDiameter}
          unit={props.outerDiameterUnit}
          onChange={props.onOuterDiameterChange}
          onUnitChange={props.onOuterDiameterUnitChange}
          measurementSystem={props.measurementSystem}
        />
      </div>
    </div>
  )
}

function ReviewStep(props: {
  projectName: string
  organization: string
  projectCreator: string
  measurementSystem: MeasurementSystem
  units: { quantity: string; unit: string }[]
  aoiSummary: AOIPreviewResponse | null
  crsSelection: ProjectCRSRecommendation | null
  product: string
  innerDiameter: string
  outerDiameter: string
  innerDiameterUnit: string
  outerDiameterUnit: string
  projectIdPreview: string
}) {
  const displayCRS = props.crsSelection || props.aoiSummary?.recommended_crs

  return (
    <div className="space-y-6">
      <div className="border border-white/10 rounded-sm p-4 bg-black/40">
        <div className="text-xs font-mono uppercase text-white/40 tracking-widest mb-3">Project Overview</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-white/80">
          <div>
            <div className="text-white/50 text-[11px] uppercase font-mono">Name</div>
            <div className="font-semibold">{props.projectName || '—'}</div>
          </div>
          <div>
            <div className="text-white/50 text-[11px] uppercase font-mono">Organization</div>
            <div className="font-semibold">{props.organization || '—'}</div>
          </div>
          <div>
            <div className="text-white/50 text-[11px] uppercase font-mono">Creator</div>
            <div className="font-semibold">{props.projectCreator || '—'}</div>
          </div>
          <div>
            <div className="text-white/50 text-[11px] uppercase font-mono">Measurement System</div>
            <div className="font-semibold">{props.measurementSystem}</div>
          </div>
          <div>
            <div className="text-white/50 text-[11px] uppercase font-mono">Project ID</div>
            <div className="font-semibold">{props.projectIdPreview}</div>
          </div>
        </div>
      </div>

      <div className="border border-white/10 rounded-sm p-4 bg-black/40 space-y-2">
        <div className="text-xs font-mono uppercase text-white/40 tracking-widest">AOI Summary</div>
        {props.aoiSummary ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-white/80">
            <div>
              <div className="text-white/50 text-[11px] uppercase font-mono">Area</div>
              <div className="font-semibold">{props.aoiSummary.area_km2.toLocaleString()} km²</div>
            </div>
            <div>
              <div className="text-white/50 text-[11px] uppercase font-mono">Country</div>
              <div className="font-semibold">{props.aoiSummary.country || 'Pending'}</div>
            </div>
            <div>
              <div className="text-white/50 text-[11px] uppercase font-mono">Coordinate System</div>
              <div className="font-semibold">{displayCRS?.name || 'Pending'}</div>
              <div className="text-[10px] text-white/40 font-mono">{displayCRS?.epsg ? `EPSG:${displayCRS.epsg}` : ''}</div>
            </div>
          </div>
        ) : (
          <div className="text-xs text-white/50 font-mono">Awaiting AOI analysis.</div>
        )}
      </div>

      <div className="border border-white/10 rounded-sm p-4 bg-black/40 space-y-2">
        <div className="text-xs font-mono uppercase text-white/40 tracking-widest">Pipeline Specs</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-white/80">
          <div>
            <div className="text-white/50 text-[11px] uppercase font-mono">Product</div>
            <div className="font-semibold">{props.product}</div>
          </div>
          <div>
            <div className="text-white/50 text-[11px] uppercase font-mono">Inside Diameter</div>
            <div className="font-semibold">
              {props.innerDiameter || '—'} {props.innerDiameterUnit}
            </div>
          </div>
          <div>
            <div className="text-white/50 text-[11px] uppercase font-mono">Outside Diameter</div>
            <div className="font-semibold">
              {props.outerDiameter || '—'} {props.outerDiameterUnit}
            </div>
          </div>
        </div>
      </div>

      <div className="border border-white/10 rounded-sm p-4 bg-black/40">
        <div className="text-xs font-mono uppercase text-white/40 tracking-widest mb-3">Units Reference</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px] font-mono text-white/70">
          {props.units.map((entry) => (
            <div key={entry.quantity} className="border border-white/5 rounded-sm px-3 py-2">
              <div className="text-white/40 uppercase tracking-widest">{entry.quantity}</div>
              <div>{entry.unit}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function SummaryCard(props: {
  icon: React.ReactNode
  title: string
  value: string
  subtitle: string
}) {
  return (
    <div className="border border-white/10 rounded-sm p-4 bg-black/40 flex items-start gap-3">
      <div className="p-2 border border-white/10 rounded-sm bg-black/30">{props.icon}</div>
      <div className="flex flex-col">
        <div className="text-xs font-mono uppercase text-white/50 tracking-widest">{props.title}</div>
        <div className="text-lg font-bold text-white">{props.value}</div>
        <div className="text-[11px] text-white/40 font-mono">{props.subtitle}</div>
      </div>
    </div>
  )
}

function DiameterField(props: {
  label: string
  value: string
  unit: string
  onChange: (val: string) => void
  onUnitChange: (val: string) => void
  measurementSystem: MeasurementSystem
}) {
  const units = props.measurementSystem === 'SI' ? ['mm', 'cm', 'm'] : ['in', 'ft']
  return (
    <div className="space-y-2">
      <label className="text-xs font-mono uppercase text-white/50 tracking-widest">{props.label}</label>
      <div className="flex gap-2">
        <input
          value={props.value}
          onChange={(event) => props.onChange(event.target.value)}
          type="number"
          min={0}
          step="0.01"
          className="flex-1 bg-black/50 border border-white/10 rounded-sm px-4 py-2 text-sm text-white focus:outline-none focus:border-primary"
        />
        <div className="border border-white/10 rounded-sm text-xs font-mono text-white/60">
          <select
            value={props.unit}
            onChange={(event) => props.onUnitChange(event.target.value)}
            className="h-full bg-transparent px-3 py-2 outline-none"
          >
            {units.map((u) => (
              <option key={u} value={u} className="bg-black text-white">
                {u}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  )
}

function LoaderDots() {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
      <span className="w-1.5 h-1.5 bg-primary/70 rounded-full animate-pulse delay-150" />
      <span className="w-1.5 h-1.5 bg-primary/40 rounded-full animate-pulse delay-300" />
    </span>
  )
}

function sanitizeProjectName(value: string): string {
  return value.replace(/[^A-Za-z0-9-]+/g, '-').replace(/-+/g, '-')
}

function sanitizeOrganization(value: string): string {
  const cleaned = value.replace(/[^A-Za-z0-9]+/g, '')
  return cleaned.toUpperCase() || 'ORG'
}

interface AOIDrawOverlayProps {
  open: boolean
  onClose: () => void
  onSave: (payload: { geojson: any; startPoint?: { lat: number; lon: number }; endPoint?: { lat: number; lon: number } }) => void
}

function AOIDrawOverlay({ open, onClose, onSave }: AOIDrawOverlayProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const drawRef = useRef<MapboxDraw | null>(null)
  const startMarkerRef = useRef<maplibregl.Marker | null>(null)
  const endMarkerRef = useRef<maplibregl.Marker | null>(null)
  const [selectMode, setSelectMode] = useState<'start' | 'end' | null>(null)
  const [statusMessage, setStatusMessage] = useState('Draw polygon to define AOI.')

  useEffect(() => {
    if (!open || !mapContainerRef.current) return

    mapRef.current = new maplibregl.Map({
      container: mapContainerRef.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '© OpenStreetMap contributors',
          },
        },
        layers: [
          {
            id: 'osm',
            type: 'raster',
            source: 'osm',
          },
        ],
      },
      center: [-100, 40],
      zoom: 3,
      attributionControl: false,
    })

    mapRef.current.addControl(new maplibregl.NavigationControl(), 'top-right')
    drawRef.current = new MapboxDraw({
      displayControlsDefault: false,
      controls: {
        polygon: true,
        trash: true,
      },
    })
    mapRef.current.addControl(drawRef.current)

    const handleClick = (event: maplibregl.MapMouseEvent & maplibregl.EventData) => {
      if (!selectMode) return
      const { lngLat } = event
      const marker = new maplibregl.Marker({
        color: selectMode === 'start' ? '#10b981' : '#ef4444',
      }).setLngLat(lngLat)

      if (selectMode === 'start') {
        startMarkerRef.current?.remove()
        startMarkerRef.current = marker.addTo(mapRef.current!)
        setStatusMessage('Start point recorded.')
      } else {
        endMarkerRef.current?.remove()
        endMarkerRef.current = marker.addTo(mapRef.current!)
        setStatusMessage('End point recorded.')
      }
      setSelectMode(null)
    }

    mapRef.current.on('click', handleClick)

    return () => {
      mapRef.current?.off('click', handleClick)
      mapRef.current?.remove()
      mapRef.current = null
      drawRef.current = null
      startMarkerRef.current = null
      endMarkerRef.current = null
      setSelectMode(null)
      setStatusMessage('Draw polygon to define AOI.')
    }
  }, [open])

  if (!open) return null

  const handleSave = () => {
    const draw = drawRef.current
    if (!draw) return
    const data = draw.getAll()
    if (!data.features.length) {
      setStatusMessage('Please draw the AOI polygon before saving.')
      return
    }
    const payload: { geojson: any; startPoint?: { lat: number; lon: number }; endPoint?: { lat: number; lon: number } } = {
      geojson: data,
    }
    if (startMarkerRef.current) {
      const lngLat = startMarkerRef.current.getLngLat()
      payload.startPoint = { lat: lngLat.lat, lon: lngLat.lng }
    }
    if (endMarkerRef.current) {
      const lngLat = endMarkerRef.current.getLngLat()
      payload.endPoint = { lat: lngLat.lat, lon: lngLat.lng }
    }
    onSave(payload)
  }

  return createPortal(
    <div className="fixed inset-0 z-[300] bg-black/90 backdrop-blur-xl flex flex-col">
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <div>
          <div className="text-xs font-mono uppercase text-white/50 tracking-widest">MapLibre Drawing Console</div>
          <div className="text-sm text-white/70">{statusMessage}</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSelectMode('start')}
            className={cn(
              'px-3 py-1 text-xs font-mono uppercase tracking-widest rounded-sm border border-white/20 text-white/70',
              selectMode === 'start' && 'border-primary text-primary'
            )}
          >
            Set Start
          </button>
          <button
            onClick={() => setSelectMode('end')}
            className={cn(
              'px-3 py-1 text-xs font-mono uppercase tracking-widest rounded-sm border border-white/20 text-white/70',
              selectMode === 'end' && 'border-primary text-primary'
            )}
          >
            Set End
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-xs font-mono uppercase tracking-widest bg-primary text-black rounded-sm"
          >
            Save Geometry
          </button>
          <button
            onClick={onClose}
            className="px-3 py-1 text-xs font-mono uppercase tracking-widest border border-white/20 text-white/60 rounded-sm"
          >
            Cancel
          </button>
        </div>
      </div>
      <div ref={mapContainerRef} className="flex-1" />
    </div>,
    document.body
  )
}

