'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  FileText,
  Calendar,
  Globe,
  Map as MapIcon,
  Target,
  X,
  Settings,
  Database,
  Hash,
  MapPin,
  LayoutDashboard,
  Scale,
  Truck,
  Construction,
  Layers,
  Mountain,
  Droplets,
  Route,
  AlertTriangle,
  Loader2,
  Building2,
  Train,
  Zap,
  TreePine,
  ExternalLink
} from 'lucide-react'
import { useProject } from '@/lib/context/ProjectContext'
import { trackEvent } from '@/lib/analytics'
import { cn } from '@/lib/utils'
import { 
  fetchRecommendedCRS, 
  updateProjectCRS, 
  ProjectCRSRecommendation,
  fetchRegulatoryDocs,
  RegulatoryDoc,
  fetchProjectRegulations,
  refreshProjectRegulations,
  indexRegulationEntry,
  buildRegulatoryDocFileUrl,
  type RegulationsResponse,
  type MatchedRegulationEntry,
  type RegulationIndexResponse,
  fetchEngineeringStandards,
  scanEngineeringStandards,
  type EngineeringStandardEntry
} from '@/lib/api/dataClient'
import { CRSSelectorDialog, CRSEntry } from './CRSSelectorDialog'

interface ProjectProfileDialogProps {
  open: boolean
  onClose: () => void
}

type TabId = 'overview' | 'geo_scope' | 'regulation' | 'epc_logistics'

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'overview', label: 'Mission Brief', icon: LayoutDashboard },
  { id: 'geo_scope', label: 'Spatial Domain', icon: Globe },
  { id: 'regulation', label: 'Compliance Matrix', icon: Scale },
  { id: 'epc_logistics', label: 'Logistics & EPC', icon: Truck },
]

export function ProjectProfileDialog({ open, onClose }: ProjectProfileDialogProps) {
  const { projectMetadata, currentProject, refreshProjectData, datasets } = useProject()
  const [mounted, setMounted] = useState(false)
  const prevOpenRef = useRef(open)
  const [crsSelectorOpen, setCrsSelectorOpen] = useState(false)
  const [recommendation, setRecommendation] = useState<ProjectCRSRecommendation | null>(null)
  const [isUpdating, setIsUpdating] = useState(false)
  const [isClosing, setIsClosing] = useState(false)
  const [activeTab, setActiveTab] = useState<TabId>('overview')
  
  const [regDocs, setRegDocs] = useState<RegulatoryDoc[]>([])
  const [regIndex, setRegIndex] = useState<string | undefined>()
  const [loadingRegs, setLoadingRegs] = useState(false)
  const [regulations, setRegulations] = useState<RegulationsResponse | null>(null)
  const [loadingRegulations, setLoadingRegulations] = useState(false)
  const [regulationsError, setRegulationsError] = useState<string | null>(null)
  const [indexingRegulationId, setIndexingRegulationId] = useState<string | null>(null)
  const [indexedRegulations, setIndexedRegulations] = useState<Record<string, RegulationIndexResponse>>({})
  const [engineeringStandards, setEngineeringStandards] = useState<EngineeringStandardEntry[]>([])
  const [loadingStandards, setLoadingStandards] = useState(false)
  const [standardsError, setStandardsError] = useState<string | null>(null)
  const [standardsScanInFlight, setStandardsScanInFlight] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (open && activeTab === 'regulation' && currentProject) {
      setLoadingRegs(true)
      void loadRegulations('fetch')
      fetchRegulatoryDocs(currentProject)
        .then(resp => {
          setRegDocs(resp.documents)
          setRegIndex(resp.index_content)
        })
        .catch(err => console.error("Failed to load regulatory docs", err))
        .finally(() => setLoadingRegs(false))
    }
  }, [open, activeTab, currentProject])

  const loadRegulations = async (mode: 'fetch' | 'refresh' = 'fetch') => {
    if (!currentProject) return
    setLoadingRegulations(true)
    setRegulationsError(null)
    try {
      const resp = mode === 'refresh'
        ? await refreshProjectRegulations(currentProject)
        : await fetchProjectRegulations(currentProject)
      setRegulations(resp)
    } catch (err) {
      console.error('Failed to load regulations catalogue', err)
      setRegulationsError(err instanceof Error ? err.message : 'Failed to load regulations catalogue')
    } finally {
      setLoadingRegulations(false)
    }
  }

  const loadEngineeringStandards = async (mode: 'fetch' | 'scan' = 'fetch') => {
    if (!currentProject) return
    setLoadingStandards(true)
    setStandardsError(null)
    try {
      const resp =
        mode === 'scan'
          ? await scanEngineeringStandards(currentProject)
          : await fetchEngineeringStandards(currentProject)
      setEngineeringStandards(resp.entries || [])
    } catch (err) {
      console.error('Failed to load engineering standards', err)
      setStandardsError(err instanceof Error ? err.message : 'Failed to load engineering standards')
    } finally {
      setLoadingStandards(false)
    }
  }

  useEffect(() => {
    if (open && activeTab === 'epc_logistics' && currentProject) {
      void loadEngineeringStandards('fetch')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeTab, currentProject])

  useEffect(() => {
    if (prevOpenRef.current === open) return
    trackEvent('dialog', 'ProjectProfileDialog', open ? 'open_project_profile_dialog' : 'close_project_profile_dialog', {
      project: currentProject
    })
    prevOpenRef.current = open
  }, [currentProject, open])

  useEffect(() => {
    if (open) {
      setIsClosing(false)
    }
  }, [open])

  const handleClose = () => {
    setIsClosing(true)
    setTimeout(() => {
      onClose()
    }, 150)
  }

  useEffect(() => {
    if (open && currentProject) {
      fetchRecommendedCRS(currentProject)
        .then(setRecommendation)
        .catch(err => console.warn('Failed to fetch CRS recommendation:', err))
    }
  }, [open, currentProject])

  if (!open || !mounted) return null

  const handleCRSSelect = async (crs: CRSEntry) => {
    if (!currentProject) return
    
    setIsUpdating(true)
    try {
      await updateProjectCRS(currentProject, crs.epsg, crs.name)
      // Refresh project data to get updated CRS
      await refreshProjectData()
      setCrsSelectorOpen(false)
    } catch (err) {
      console.error('Failed to update CRS:', err)
      alert(`Failed to update CRS: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setIsUpdating(false)
    }
  }

  // Helper to format dates
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'N/A'
    try {
      return new Date(dateStr).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    } catch {
      return dateStr
    }
  }

  const splitStandardLabel = (value: string) => {
    const idx = value.indexOf(' - ')
    if (idx === -1) return { code: value, description: '' }
    return {
      code: value.slice(0, idx).trim(),
      description: value.slice(idx + 3).trim()
    }
  }

  const isPipelineDesignStandard = (entry: EngineeringStandardEntry) => {
    const detail = (entry.type_detail || '').toLowerCase()
    return (
      detail.includes('design') ||
      detail.includes('materials') ||
      detail.includes('line pipe') ||
      detail.includes('valves') ||
      detail.includes('fittings') ||
      detail.includes('flanges')
    )
  }

  const pipelineDesignStandards = engineeringStandards.filter(isPipelineDesignStandard)
  const constructionStandards = engineeringStandards.filter((s) => !isPipelineDesignStandard(s))

  const regulationEntries: MatchedRegulationEntry[] = regulations?.entries || []
  const normCoverage = (value?: string | null) => (value || '').trim().toLowerCase()
  const regsByCoverage = (coverage: string) => regulationEntries.filter(e => normCoverage(e.coverage_level) === coverage)
  const globalRegulations = regsByCoverage('global')
  const supranationalRegulations = regsByCoverage('supranational')
  const countryRegulations = regsByCoverage('country')
  const admin1Regulations = regsByCoverage('admin1')
  const otherRegulations = regulationEntries.filter(e => {
    const c = normCoverage(e.coverage_level)
    return c && !['global', 'supranational', 'country', 'admin1', 'admin2'].includes(c)
  })

  return createPortal(
    <>
      {/* Backdrop */}
      <div 
        className={cn(
          "fixed inset-0 bg-black/80 backdrop-blur-md z-[100]",
          isClosing ? "animate-fade-out" : "animate-fade-in"
        )}
        onClick={handleClose}
      >
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none" />
      </div>

      {/* Dialog */}
      <div className="fixed inset-0 z-[101] flex items-center justify-center p-4 pointer-events-none">
        <div className={cn(
          "relative w-[800px] max-w-[95vw] max-h-[90vh] bg-[#0a0a0a]/95 border border-white/10 rounded-sm shadow-[0_0_50px_-10px_rgba(0,0,0,0.8)] flex flex-col pointer-events-auto overflow-hidden",
          isClosing ? "animate-fade-out" : "animate-fade-in"
        )}>
          
          {/* Header */}
          <header className="px-8 py-6 border-b border-white/10 flex items-center justify-between bg-black/20 shrink-0">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2 text-[10px] text-white/40 uppercase tracking-[0.2em] font-mono">
                <Settings className="w-3 h-3" />
                <span>Configuration & Metadata</span>
              </div>
              <h2 className="text-2xl font-bold text-white uppercase tracking-wide font-mono">
                Project Profile
              </h2>
            </div>
            <button 
              onClick={handleClose}
              className="p-2 hover:bg-white/5 border border-transparent hover:border-white/10 rounded-sm text-white/50 hover:text-white transition-all"
            >
              <X className="w-5 h-5" />
            </button>
          </header>

          {/* Tabs */}
          <div className="flex items-center px-8 border-b border-white/10 bg-white/[0.02] shrink-0 overflow-x-auto no-scrollbar">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-2 px-4 py-3 text-[10px] font-mono uppercase tracking-wider transition-all border-b-2 hover:bg-white/5 whitespace-nowrap",
                  activeTab === tab.id 
                    ? "border-primary text-primary bg-primary/5" 
                    : "border-transparent text-white/40 hover:text-white"
                )}
              >
                <tab.icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-8 bg-[linear-gradient(to_right,#ffffff02_1px,transparent_1px),linear-gradient(to_bottom,#ffffff02_1px,transparent_1px)] bg-[size:20px_20px]">
            
            {activeTab === 'overview' && (
              <div className="space-y-8 animate-in fade-in duration-300">
                {/* Identity Section */}
            <section className="grid grid-cols-2 gap-6">
              <div className="p-4 bg-white/[0.02] border border-white/5 rounded-sm">
                <div className="flex items-center gap-3 mb-3">
                  <FileText className="w-4 h-4 text-primary" />
                  <span className="text-xs font-mono uppercase text-white/50 tracking-wider">Project Identity</span>
                </div>
                <div className="space-y-1">
                  <div className="text-lg font-bold text-white">{projectMetadata?.project_name || currentProject || 'Unknown'}</div>
                  <div className="text-xs font-mono text-white/40">{projectMetadata?.project_code || 'NO_CODE'}</div>
                </div>
              </div>

              <div className="p-4 bg-white/[0.02] border border-white/5 rounded-sm">
                <div className="flex items-center gap-3 mb-3">
                  <Calendar className="w-4 h-4 text-primary" />
                  <span className="text-xs font-mono uppercase text-white/50 tracking-wider">Timestamps</span>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-mono text-white/30 uppercase">Created</span>
                    <span className="text-xs text-white/70">{formatDate(projectMetadata?.date_created)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-mono text-white/30 uppercase">Status</span>
                    <span className="text-xs font-bold text-emerald-500 uppercase tracking-wider border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 rounded-sm">
                      {projectMetadata?.status || 'ACTIVE'}
                    </span>
                  </div>
                </div>
              </div>
            </section>

            {/* Spatial Configuration */}
            <section>
              <div className="flex items-center gap-2 mb-4 text-white/50">
                <Globe className="w-4 h-4" />
                <h3 className="text-sm font-bold uppercase tracking-wider">Spatial Configuration</h3>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* CRS Card */}
                <div className="group relative p-5 bg-black/40 border border-white/10 rounded-sm hover:border-primary/30 transition-all">
                  <div className="absolute top-0 left-0 w-1 h-full bg-primary/20 group-hover:bg-primary transition-all" />
                  
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-2 text-xs font-mono uppercase text-white/40 tracking-wider">
                      <Target className="w-3 h-3" />
                      <span>Coordinate Reference System</span>
                    </div>
                    <div className="px-2 py-1 bg-primary/10 border border-primary/20 rounded-sm">
                      <span className="text-xs font-bold text-primary font-mono">EPSG:{projectMetadata?.crs?.epsg || '----'}</span>
                    </div>
                  </div>

                  <div className="space-y-1 mb-6">
                    <div className="text-sm font-bold text-white group-hover:text-primary transition-colors">
                      {projectMetadata?.crs?.name || 'Unknown CRS'}
                    </div>
                    <div className="text-xs text-white/40 font-mono">
                      {projectMetadata?.measurement_system || 'Metric'} Units
                    </div>
                  </div>

                  {recommendation && (
                    <div className="mb-4 p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-sm relative group/rec">
                      <div className="absolute -top-2 left-2 bg-[#0a0a0a] px-1 text-[9px] font-mono uppercase text-emerald-500/70 tracking-wider">
                        AI Recommendation
                      </div>
                      <div className="flex items-center justify-between gap-3 mt-1">
                        <div className="flex-1 min-w-0">
                           <div className="text-xs text-emerald-400 font-bold truncate" title={recommendation.name}>
                             {recommendation.name}
                           </div>
                           <div className="text-[10px] text-emerald-500/40 font-mono flex items-center gap-2">
                             <span>EPSG:{recommendation.epsg}</span>
                             <span className="w-1 h-1 rounded-full bg-emerald-500/30" />
                             <span className="truncate max-w-[120px] opacity-70" title={recommendation.reason}>{recommendation.reason}</span>
                           </div>
                        </div>
                        <button
                           onClick={() => handleCRSSelect({ 
                             epsg: recommendation.epsg, 
                             name: recommendation.name, 
                             category: 'Recommended', 
                             type: 'Projected',
                             area: recommendation.reason
                           })}
                           className="px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-[10px] font-bold font-mono uppercase rounded-sm transition-all border border-emerald-500/20 hover:border-emerald-500/40 flex items-center gap-1.5"
                        >
                           <Target className="w-3 h-3" />
                           Apply
                        </button>
                      </div>
                    </div>
                  )}

                  <button 
                    onClick={() => setCrsSelectorOpen(true)}
                    className="w-full py-2 border border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20 text-xs font-mono uppercase tracking-wider text-white rounded-sm transition-all flex items-center justify-center gap-2"
                  >
                    <Globe className="w-3 h-3" />
                    Select Project CRS
                  </button>
                </div>

                {/* AOI / Location Card */}
                <div className="p-5 bg-black/40 border border-white/10 rounded-sm">
                  <div className="flex items-center gap-2 text-xs font-mono uppercase text-white/40 tracking-wider mb-4">
                    <MapPin className="w-3 h-3" />
                    <span>Area of Interest</span>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <div className="text-[10px] text-white/30 font-mono mb-1 uppercase">
                        {(projectMetadata?.aoi?.countries?.length ?? 0) > 1 ? 'Countries Covered' : 'Country'}
                      </div>
                      <div className="text-sm font-bold text-white">
                        {projectMetadata?.aoi?.countries?.join(', ') || projectMetadata?.country || projectMetadata?.iso3 || 'Global / Unspecified'}
                      </div>
                      {(projectMetadata?.iso3_list?.length ?? 0) > 1 && (
                        <div className="text-[10px] text-white/40 font-mono mt-1">
                          {projectMetadata!.iso3_list!.join(' · ')} ({projectMetadata!.iso3_list!.length} countries)
                        </div>
                      )}
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-[10px] text-white/30 font-mono mb-1 uppercase">Source File</div>
                        <div className="text-xs text-white/60 truncate font-mono" title={projectMetadata?.aoi?.file}>
                          {projectMetadata?.aoi?.file ? projectMetadata.aoi.file.split('/').pop() : 'No AOI file'}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-white/30 font-mono mb-1 uppercase">Coverage</div>
                        <div className="text-xs text-white/60 font-mono">
                          {projectMetadata?.aoi?.area_km2 ? `${projectMetadata.aoi.area_km2.toLocaleString()} km²` : 'Unknown Area'}
                        </div>
                      </div>
                    </div>

                    {/* Start and End Points */}
                    <div className="grid grid-cols-2 gap-4 pt-2 border-t border-white/5">
                      <div>
                        <div className="text-[10px] text-white/30 font-mono mb-1 uppercase flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                          Start Point
                        </div>
                        <div className="text-xs text-white/70 font-mono">
                          {projectMetadata?.aoi?.start_point ? (
                            <>
                              <span className="text-emerald-400">{projectMetadata.aoi.start_point.latitude?.toFixed(6)}°</span>
                              <span className="text-white/30 mx-1">,</span>
                              <span className="text-emerald-400">{projectMetadata.aoi.start_point.longitude?.toFixed(6)}°</span>
                            </>
                          ) : (
                            <span className="text-white/40">Not defined</span>
                          )}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-white/30 font-mono mb-1 uppercase flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                          End Point
                        </div>
                        <div className="text-xs text-white/70 font-mono">
                          {projectMetadata?.aoi?.end_point ? (
                            <>
                              <span className="text-red-400">{projectMetadata.aoi.end_point.latitude?.toFixed(6)}°</span>
                              <span className="text-white/30 mx-1">,</span>
                              <span className="text-red-400">{projectMetadata.aoi.end_point.longitude?.toFixed(6)}°</span>
                            </>
                          ) : (
                            <span className="text-white/40">Not defined</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            </section>

            {/* Organization (Placeholder) */}
            <section className="pt-6 border-t border-white/5">
               <div className="grid grid-cols-3 gap-4 text-xs">
                  <div>
                    <span className="block text-[9px] font-mono uppercase text-white/30 mb-1">Client / Organization</span>
                    <span className="text-white/60">{projectMetadata?.client || projectMetadata?.organization || 'Internal'}</span>
                  </div>
                  <div>
                    <span className="block text-[9px] font-mono uppercase text-white/30 mb-1">Department</span>
                    <span className="text-white/60">{projectMetadata?.department || 'Engineering'}</span>
                  </div>
                  <div>
                    <span className="block text-[9px] font-mono uppercase text-white/30 mb-1">Creator</span>
                    <span className="text-white/60">{projectMetadata?.project_creator || 'System Admin'}</span>
                  </div>
               </div>
            </section>
              </div>
            )}

            {activeTab === 'regulation' && (
              <div className="space-y-8 animate-in fade-in duration-300">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-white">Regulatory Compliance Matrix</h3>
                    <p className="text-xs text-white/50">Legislative framework and technical standards for AOI operations.</p>
                  </div>
                  <button 
                    className="px-4 py-2 bg-primary/10 border border-primary/30 text-primary text-xs font-bold uppercase tracking-wider rounded-sm hover:bg-primary/20 transition-all flex items-center gap-2 disabled:opacity-40 disabled:pointer-events-none"
                    onClick={() => void loadRegulations('refresh')}
                    disabled={!currentProject || loadingRegulations}
                  >
                    <Globe className="w-3 h-3" />
                    {loadingRegulations ? 'Refreshing…' : 'Refresh from catalogue'}
                  </button>
                </div>

                {/* Catalogue-backed regulations */}
                <section className="p-4 bg-black/40 border border-white/10 rounded-sm space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <div className="text-xs font-bold uppercase tracking-wider text-white/70">Applicable Regulations (Catalogue)</div>
                      <div className="text-[10px] font-mono text-white/30">
                        {regulations?.countries_iso3?.length ? (
                          <span>AOI countries: {projectMetadata?.aoi?.countries?.join(', ') || regulations.countries_iso3.join(', ')} ({regulations.countries_iso3.length})</span>
                        ) : (
                          <span>AOI countries: {projectMetadata?.aoi?.countries?.join(', ') || '(unknown)'}</span>
                        )}
                      </div>
                    </div>
                    <span className="text-[10px] font-mono text-white/30">{regulationEntries.length} ENTRIES</span>
                  </div>

                  {loadingRegulations ? (
                    <div className="flex items-center gap-2 text-[10px] text-white/40 font-mono uppercase tracking-[0.2em]">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                      <span>Loading catalogue matches…</span>
                    </div>
                  ) : regulationsError ? (
                    <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-sm text-xs text-amber-400 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 mt-0.5" />
                      <span>{regulationsError}</span>
                    </div>
                  ) : regulationEntries.length === 0 ? (
                    <div className="text-[10px] font-mono text-white/30 italic">No catalogue-backed regulations matched (yet).</div>
                  ) : (
                    <div className="grid grid-cols-1 gap-4">
                      <RegulationsGroup
                        title="Supranational"
                        entries={supranationalRegulations}
                        projectName={currentProject || ''}
                        indexingId={indexingRegulationId}
                        indexed={indexedRegulations}
                        onIndex={async (entry) => {
                          if (!currentProject) return
                          if (!entry.direct_download_url) return
                          if (indexingRegulationId) return
                          setIndexingRegulationId(entry.entry_id)
                          try {
                            const indexedResp = await indexRegulationEntry(currentProject, entry.entry_id)
                            setIndexedRegulations(prev => ({ ...prev, [entry.entry_id]: indexedResp }))
                            const docsResp = await fetchRegulatoryDocs(currentProject)
                            setRegDocs(docsResp.documents)
                            setRegIndex(docsResp.index_content)
                          } catch (err) {
                            alert(err instanceof Error ? err.message : 'Failed to index regulation')
                          } finally {
                            setIndexingRegulationId(null)
                          }
                        }}
                      />
                      <RegulationsGroup
                        title="Country"
                        entries={countryRegulations}
                        projectName={currentProject || ''}
                        indexingId={indexingRegulationId}
                        indexed={indexedRegulations}
                        onIndex={async (entry) => {
                          if (!currentProject) return
                          if (!entry.direct_download_url) return
                          if (indexingRegulationId) return
                          setIndexingRegulationId(entry.entry_id)
                          try {
                            const indexedResp = await indexRegulationEntry(currentProject, entry.entry_id)
                            setIndexedRegulations(prev => ({ ...prev, [entry.entry_id]: indexedResp }))
                            const docsResp = await fetchRegulatoryDocs(currentProject)
                            setRegDocs(docsResp.documents)
                            setRegIndex(docsResp.index_content)
                          } catch (err) {
                            alert(err instanceof Error ? err.message : 'Failed to index regulation')
                          } finally {
                            setIndexingRegulationId(null)
                          }
                        }}
                      />
                      <RegulationsGroup
                        title="Admin1 (State/Province/Emirate)"
                        entries={admin1Regulations}
                        projectName={currentProject || ''}
                        indexingId={indexingRegulationId}
                        indexed={indexedRegulations}
                        onIndex={async (entry) => {
                          if (!currentProject) return
                          if (!entry.direct_download_url) return
                          if (indexingRegulationId) return
                          setIndexingRegulationId(entry.entry_id)
                          try {
                            const indexedResp = await indexRegulationEntry(currentProject, entry.entry_id)
                            setIndexedRegulations(prev => ({ ...prev, [entry.entry_id]: indexedResp }))
                            const docsResp = await fetchRegulatoryDocs(currentProject)
                            setRegDocs(docsResp.documents)
                            setRegIndex(docsResp.index_content)
                          } catch (err) {
                            alert(err instanceof Error ? err.message : 'Failed to index regulation')
                          } finally {
                            setIndexingRegulationId(null)
                          }
                        }}
                      />
                      <RegulationsGroup
                        title="Global"
                        entries={globalRegulations}
                        projectName={currentProject || ''}
                        indexingId={indexingRegulationId}
                        indexed={indexedRegulations}
                        onIndex={async (entry) => {
                          if (!currentProject) return
                          if (!entry.direct_download_url) return
                          if (indexingRegulationId) return
                          setIndexingRegulationId(entry.entry_id)
                          try {
                            const indexedResp = await indexRegulationEntry(currentProject, entry.entry_id)
                            setIndexedRegulations(prev => ({ ...prev, [entry.entry_id]: indexedResp }))
                            const docsResp = await fetchRegulatoryDocs(currentProject)
                            setRegDocs(docsResp.documents)
                            setRegIndex(docsResp.index_content)
                          } catch (err) {
                            alert(err instanceof Error ? err.message : 'Failed to index regulation')
                          } finally {
                            setIndexingRegulationId(null)
                          }
                        }}
                      />
                      {otherRegulations.length > 0 ? (
                        <RegulationsGroup
                          title="Other"
                          entries={otherRegulations}
                          projectName={currentProject || ''}
                          indexingId={indexingRegulationId}
                          indexed={indexedRegulations}
                          onIndex={async (entry) => {
                            if (!currentProject) return
                            if (!entry.direct_download_url) return
                            if (indexingRegulationId) return
                            setIndexingRegulationId(entry.entry_id)
                            try {
                              const indexedResp = await indexRegulationEntry(currentProject, entry.entry_id)
                              setIndexedRegulations(prev => ({ ...prev, [entry.entry_id]: indexedResp }))
                              const docsResp = await fetchRegulatoryDocs(currentProject)
                              setRegDocs(docsResp.documents)
                              setRegIndex(docsResp.index_content)
                            } catch (err) {
                              alert(err instanceof Error ? err.message : 'Failed to index regulation')
                            } finally {
                              setIndexingRegulationId(null)
                            }
                          }}
                        />
                      ) : null}
                    </div>
                  )}
                </section>

                {loadingRegs ? (
                  <div className="py-12 text-center text-white/30 font-mono text-xs uppercase tracking-widest flex flex-col items-center gap-3">
                    <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                    Scanning Regulatory Archive...
                  </div>
                ) : (
                  <section className="p-4 bg-black/40 border border-white/10 rounded-sm space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <div className="text-xs font-bold uppercase tracking-wider text-white/70">Indexed Regulatory Documents</div>
                        <div className="text-[10px] font-mono text-white/30">Stored under <span className="text-white/40">docs/regulatory_docs/…</span></div>
                      </div>
                      <span className="text-[10px] font-mono text-white/30">{regDocs.length} DOCS</span>
                    </div>

                    {regDocs.length === 0 ? (
                      <div className="text-[10px] font-mono text-white/30 italic">No indexed documents yet. Use <span className="text-white/50">Index</span> on a catalogue entry to file it.</div>
                    ) : (
                      <div className="grid grid-cols-1 gap-2">
                        {regDocs.map((doc, i) => (
                          <a
                            key={`${doc.path}:${i}`}
                            href={currentProject ? buildRegulatoryDocFileUrl(currentProject, doc.path) : undefined}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-between gap-3 min-w-0 w-full p-2 bg-white/[0.02] border border-white/5 rounded-sm hover:bg-white/[0.05] transition-colors"
                            title="Open document"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <FileText className="w-4 h-4 text-primary/70 shrink-0" />
                              <div className="min-w-0">
                                <div className="text-xs text-white truncate" title={doc.name}>
                                  {doc.name}
                                </div>
                                <div className="text-[9px] font-mono text-white/40 truncate" title={doc.path}>
                                  {doc.path}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-[9px] font-mono text-primary/70 bg-primary/10 px-1.5 py-0.5 rounded-sm uppercase">
                                {doc.category}
                              </span>
                              <span className="text-[9px] font-mono text-white/30">
                                {doc.size_bytes ? `${Math.round(doc.size_bytes / 1024)} KB` : ''}
                              </span>
                            </div>
                          </a>
                        ))}
                      </div>
                    )}
                  </section>
                )}
              </div>
            )}

            {activeTab === 'geo_scope' && (
              <div className="space-y-8 animate-in fade-in duration-300">
                <section>
                  <div className="flex items-center gap-2 mb-4 text-white/50">
                    <Database className="w-4 h-4" />
                    <h3 className="text-sm font-bold uppercase tracking-wider">Geospatial Data Sources</h3>
                  </div>

                  {datasets && (datasets.rasters.length > 0 || datasets.vectors.length > 0) ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="p-4 bg-black/40 border border-white/10 rounded-sm">
                        <div className="flex items-center justify-between text-xs font-mono uppercase text-white/40 tracking-wider mb-3">
                          <div className="flex items-center gap-2">
                            <Layers className="w-3 h-3" />
                            <span>Raster Datasets</span>
                          </div>
                          <span className="text-[9px]">{datasets.rasters.length}</span>
                        </div>
                        <div className="space-y-2">
                          {datasets.rasters.length === 0 ? (
                            <div className="text-[10px] font-mono text-white/30 italic py-2">No rasters fetched yet.</div>
                          ) : datasets.rasters.map((ds) => (
                            <DataSourceItem
                              key={ds.name}
                              name={ds.metadata?.dataset_name || ds.name}
                              source={ds.metadata?.source || ds.metadata?.provider || 'Unknown source'}
                              resolution={ds.metadata?.resolution_m ? `${ds.metadata.resolution_m}m` : 'Raster'}
                              url={ds.metadata?.documentation_url || ds.metadata?.provider_url || '#'}
                            />
                          ))}
                        </div>
                      </div>

                      <div className="p-4 bg-black/40 border border-white/10 rounded-sm">
                        <div className="flex items-center justify-between text-xs font-mono uppercase text-white/40 tracking-wider mb-3">
                          <div className="flex items-center gap-2">
                            <Route className="w-3 h-3" />
                            <span>Vector Datasets</span>
                          </div>
                          <span className="text-[9px]">{datasets.vectors.length}</span>
                        </div>
                        <div className="space-y-2">
                          {datasets.vectors.length === 0 ? (
                            <div className="text-[10px] font-mono text-white/30 italic py-2">No vectors fetched yet.</div>
                          ) : datasets.vectors.map((ds) => (
                            <DataSourceItem
                              key={ds.name}
                              name={ds.metadata?.dataset_name || ds.name}
                              source={ds.metadata?.source || ds.metadata?.provider || 'Unknown source'}
                              resolution="Vector"
                              url={ds.metadata?.documentation_url || ds.metadata?.provider_url || '#'}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-6 bg-black/40 border border-white/10 rounded-sm text-center">
                      <Database className="w-6 h-6 text-white/20 mx-auto mb-2" />
                      <div className="text-xs text-white/40 font-mono uppercase">No datasets fetched yet</div>
                      <div className="text-[10px] text-white/30 mt-1">Use the Dataset Manager to fetch geospatial data for this project.</div>
                    </div>
                  )}
                </section>

                <section>
                  <div className="flex items-center gap-2 mb-4 text-white/50">
                    <Mountain className="w-4 h-4" />
                    <h3 className="text-sm font-bold uppercase tracking-wider">Terrain Characteristics</h3>
                  </div>

                  {datasets && datasets.rasters.some(r => r.metadata?.category === 'dem' && r.metadata?.statistics) ? (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {(() => {
                        const demDs = datasets.rasters.find(r => r.metadata?.category === 'dem')
                        const stats = demDs?.metadata?.statistics
                        return (
                          <>
                            <TerrainCard
                              label="Elevation Range"
                              value={stats?.min != null && stats?.max != null ? `${Math.round(stats.min)}m - ${Math.round(stats.max)}m` : 'N/A'}
                              subtext={stats?.mean != null ? `Mean: ${Math.round(stats.mean)}m` : ''}
                              icon={<Layers className="w-4 h-4" />}
                            />
                            <TerrainCard
                              label="DEM Source"
                              value={demDs?.metadata?.dataset_name || 'Unknown'}
                              subtext={demDs?.metadata?.resolution_m ? `${demDs.metadata.resolution_m}m resolution` : ''}
                              icon={<Mountain className="w-4 h-4" />}
                            />
                          </>
                        )
                      })()}
                      {datasets.rasters.some(r => r.metadata?.category === 'geohazard') && (
                        <TerrainCard
                          label="Seismic Data"
                          value="Available"
                          subtext={datasets.rasters.find(r => r.metadata?.category === 'geohazard')?.metadata?.dataset_name || 'GEM/USGS PGA'}
                          icon={<AlertTriangle className="w-4 h-4" />}
                          warning
                        />
                      )}
                      {datasets.rasters.some(r => r.metadata?.category === 'landcover') && (
                        <TerrainCard
                          label="Land Cover"
                          value="Available"
                          subtext={datasets.rasters.find(r => r.metadata?.category === 'landcover')?.metadata?.dataset_name || 'ESA WorldCover'}
                          icon={<TreePine className="w-4 h-4" />}
                        />
                      )}
                    </div>
                  ) : (
                    <div className="p-4 bg-black/20 border border-white/5 rounded-sm">
                      <div className="text-[10px] text-white/30 font-mono uppercase">Terrain analysis requires a DEM dataset. Fetch datasets to populate this section.</div>
                    </div>
                  )}
                </section>

                <section>
                  <div className="flex items-center gap-2 mb-4 text-white/50">
                    <AlertTriangle className="w-4 h-4" />
                    <h3 className="text-sm font-bold uppercase tracking-wider">Environmental Constraints</h3>
                  </div>

                  <div className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-sm">
                    <div className="text-xs text-white/60">
                      {datasets && datasets.vectors.some(v => v.metadata?.category === 'protected_areas') ? (
                        <div>
                          <div className="text-amber-400 font-bold mb-2">Protected Areas Data Available</div>
                          <p className="text-white/50">
                            {datasets.vectors.find(v => v.metadata?.category === 'protected_areas')?.metadata?.dataset_name || 'Protected areas'} loaded.
                            Review in the map layer manager for intersection analysis.
                          </p>
                        </div>
                      ) : (
                        <div className="text-white/30 font-mono text-[10px] uppercase">
                          Environmental constraint data will appear here once protected areas and constraint datasets are fetched for this project.
                        </div>
                      )}
                    </div>
                  </div>
                </section>
              </div>
            )}

            {activeTab === 'epc_logistics' && (
              <div className="space-y-8 animate-in fade-in duration-300">
                {/* Infrastructure Crossing Costs — global reference */}
                <section>
                  <div className="flex items-center gap-2 mb-4 text-white/50">
                    <Route className="w-4 h-4" />
                    <h3 className="text-sm font-bold uppercase tracking-wider">Infrastructure Crossing Cost Reference</h3>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-white/10">
                          <th className="text-left py-2 px-3 text-white/40 font-mono uppercase tracking-wider">Crossing Type</th>
                          <th className="text-right py-2 px-3 text-white/40 font-mono uppercase tracking-wider">Typical Cost</th>
                          <th className="text-left py-2 px-3 text-white/40 font-mono uppercase tracking-wider">Method</th>
                          <th className="text-left py-2 px-3 text-white/40 font-mono uppercase tracking-wider">Reference</th>
                        </tr>
                      </thead>
                      <tbody className="text-white/70">
                        <CrossingRow icon={<Route className="w-3 h-3" />} type="Primary Road (Motorway/Trunk)" cost="$200K-400K" method="HDD Required" source="API RP 1102" />
                        <CrossingRow icon={<Route className="w-3 h-3" />} type="Secondary Road" cost="$100K-200K" method="HDD Preferred" source="API RP 1102" />
                        <CrossingRow icon={<Route className="w-3 h-3" />} type="Local Road / Track" cost="$40K-80K" method="Open Cut / HDD" source="AACE Estimate" />
                        <CrossingRow icon={<Train className="w-3 h-3" />} type="Heavy Rail (Mainline)" cost="$1.0M-1.5M" method="Deep HDD / Bore" source="API RP 1102" />
                        <CrossingRow icon={<Droplets className="w-3 h-3" />} type="Major River (>50m)" cost="$300K-800K+" method="HDD Required" source="EN 1594 / ASME B31.4" />
                        <CrossingRow icon={<Droplets className="w-3 h-3" />} type="Stream / Canal (<50m)" cost="$80K-150K" method="HDD Preferred" source="Industry Estimate" />
                        <CrossingRow icon={<Zap className="w-3 h-3" />} type="HV Powerline" cost="$100K-200K" method="HDD / Depth Clearance" source="IEC / National Grid Codes" />
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-2 text-[9px] font-mono text-white/20 uppercase">Costs are indicative global averages (USD). Actual costs vary by region, regulation, and site conditions.</div>
                </section>

                {/* Applicable Technical Standards — dynamic from catalogue */}
                <section>
                  <div className="flex items-center justify-between gap-3 mb-4 text-white/50">
                    <div className="flex items-center gap-2">
                      <Building2 className="w-4 h-4" />
                      <h3 className="text-sm font-bold uppercase tracking-wider">Applicable Technical Standards</h3>
                    </div>
                    <button
                      onClick={async () => {
                        if (!currentProject || standardsScanInFlight) return
                        setStandardsScanInFlight(true)
                        try {
                          await loadEngineeringStandards('scan')
                        } finally {
                          setStandardsScanInFlight(false)
                        }
                      }}
                      disabled={!currentProject || standardsScanInFlight}
                      className="px-3 py-2 border border-primary/30 text-primary/80 hover:bg-primary/10 hover:text-primary rounded-sm text-[10px] uppercase font-bold tracking-wider transition-all disabled:opacity-40 disabled:pointer-events-none"
                      title="Re-scan standards catalogue (refresh cached data)"
                    >
                      {standardsScanInFlight ? 'SCANNING' : 'SCAN'}
                    </button>
                  </div>

                  {loadingStandards && (
                    <div className="flex items-center gap-2 text-[10px] text-white/40 font-mono uppercase tracking-[0.2em] mb-3">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                      <span>Loading standards catalogue…</span>
                    </div>
                  )}

                  {standardsError && (
                    <div className="mb-3 p-3 bg-amber-500/5 border border-amber-500/20 rounded-sm flex items-start gap-2 text-xs text-amber-400">
                      <AlertTriangle className="w-4 h-4 mt-0.5" />
                      <span>{standardsError}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 bg-black/40 border border-white/10 rounded-sm">
                      <div className="text-xs font-mono uppercase text-primary mb-2">Pipeline Design</div>
                      <ul className="space-y-1.5 text-xs text-white/60">
                        {pipelineDesignStandards.length === 0 ? (
                          <li className="text-[10px] font-mono text-white/30 italic py-1">
                            {loadingStandards ? 'Loading…' : 'No pipeline design standards available. Click SCAN to search catalogue.'}
                          </li>
                        ) : (
                          pipelineDesignStandards.map((entry, idx) => {
                            const { code, description } = splitStandardLabel(entry.standard)
                            return (
                              <li key={`${code}:${idx}`} className="flex items-start justify-between gap-2 group">
                                <div className="flex items-start gap-2 min-w-0">
                                  <span className="w-1.5 h-1.5 rounded-full bg-primary/50 mt-1.5 shrink-0" />
                                  <span className="min-w-0">
                                    <strong className="text-white/80">{code}</strong>
                                    {description ? <span className="text-white/60"> — {description}</span> : null}
                                  </span>
                                </div>
                                {entry.url && (
                                  <a href={entry.url} target="_blank" rel="noopener noreferrer"
                                    className="p-1 text-white/30 hover:text-primary transition-colors opacity-0 group-hover:opacity-100 shrink-0"
                                    title="Open standard documentation">
                                    <ExternalLink className="w-3 h-3" />
                                  </a>
                                )}
                              </li>
                            )
                          })
                        )}
                      </ul>
                    </div>
                    <div className="p-4 bg-black/40 border border-white/10 rounded-sm">
                      <div className="text-xs font-mono uppercase text-primary mb-2">Construction & Seismic</div>
                      <ul className="space-y-1.5 text-xs text-white/60">
                        {constructionStandards.length === 0 ? (
                          <li className="text-[10px] font-mono text-white/30 italic py-1">
                            {loadingStandards ? 'Loading…' : 'No construction standards available. Click SCAN to search catalogue.'}
                          </li>
                        ) : (
                          constructionStandards.map((entry, idx) => {
                            const { code, description } = splitStandardLabel(entry.standard)
                            return (
                              <li key={`${code}:${idx}`} className="flex items-start justify-between gap-2 group">
                                <div className="flex items-start gap-2 min-w-0">
                                  <span className="w-1.5 h-1.5 rounded-full bg-primary/50 mt-1.5 shrink-0" />
                                  <span className="min-w-0">
                                    <strong className="text-white/80">{code}</strong>
                                    {description ? <span className="text-white/60"> — {description}</span> : null}
                                  </span>
                                </div>
                                {entry.url && (
                                  <a href={entry.url} target="_blank" rel="noopener noreferrer"
                                    className="p-1 text-white/30 hover:text-primary transition-colors opacity-0 group-hover:opacity-100 shrink-0"
                                    title="Open standard documentation">
                                    <ExternalLink className="w-3 h-3" />
                                  </a>
                                )}
                              </li>
                            )
                          })
                        )}
                      </ul>
                    </div>
                  </div>
                </section>
              </div>
            )}

          </div>
        </div>
      </div>

      <CRSSelectorDialog 
        open={crsSelectorOpen} 
        onClose={() => setCrsSelectorOpen(false)}
        onSelect={handleCRSSelect}
        currentEpsg={projectMetadata?.crs?.epsg}
      />
    </>,
    document.body
  )
}

function RegulationsGroup({
  title,
  entries,
  projectName,
  indexingId,
  indexed,
  onIndex
}: {
  title: string
  entries: MatchedRegulationEntry[]
  projectName: string
  indexingId: string | null
  indexed: Record<string, RegulationIndexResponse>
  onIndex: (entry: MatchedRegulationEntry) => void
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between border-b border-white/10 pb-2">
        <h4 className="text-xs font-bold uppercase tracking-wider text-white/70">{title}</h4>
        <span className="text-[10px] font-mono text-white/30">{entries.length} ITEMS</span>
      </div>
      {entries.length === 0 ? (
        <div className="text-[10px] font-mono text-white/30 italic py-2">No entries.</div>
      ) : (
        <div className="grid grid-cols-1 gap-2">
          {entries.map((entry) => {
            const indexedResp = indexed[entry.entry_id]
            const openUrl =
              projectName && indexedResp?.stored_path
                ? buildRegulatoryDocFileUrl(projectName, indexedResp.stored_path)
                : null
            const canIndex = Boolean(entry.direct_download_url)
            const isIndexing = indexingId === entry.entry_id

            return (
              <div
                key={entry.entry_id}
                className="flex items-start justify-between gap-3 p-2 bg-white/[0.02] border border-white/5 rounded-sm hover:bg-white/[0.05] transition-colors"
              >
                <div className="min-w-0">
                  <div className="text-xs text-white truncate" title={entry.title}>
                    {entry.title}
                  </div>
                  <div className="text-[9px] font-mono text-white/40 truncate" title={entry.match_reason}>
                    {entry.entry_id}
                    {entry.authority ? <span className="text-white/30"> · {entry.authority}</span> : null}
                    {entry.match_reason ? <span className="text-white/30"> · {entry.match_reason}</span> : null}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {entry.source_url ? (
                    <a
                      href={entry.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1 text-white/30 hover:text-primary transition-colors"
                      title="Open official source"
                    >
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  ) : null}
                  {openUrl ? (
                    <a
                      href={openUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2 py-1 border border-white/10 text-white/70 hover:text-white hover:bg-white/[0.04] rounded-sm text-[10px] font-mono uppercase tracking-wider"
                      title="Open indexed document"
                    >
                      Open
                    </a>
                  ) : null}
                  {canIndex ? (
                    <button
                      className="px-2 py-1 border border-primary/30 text-primary/80 hover:bg-primary/10 hover:text-primary rounded-sm text-[10px] font-mono uppercase tracking-wider transition-all disabled:opacity-40 disabled:pointer-events-none"
                      onClick={() => onIndex(entry)}
                      disabled={!projectName || Boolean(indexingId) || isIndexing}
                      title={entry.direct_download_url ? 'Download into project docs (Index)' : 'No direct download available'}
                    >
                      {isIndexing ? 'Indexing…' : 'Index'}
                    </button>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function RegulatorySection({ title, docs, projectName }: { title: string; docs: RegulatoryDoc[]; projectName: string }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between border-b border-white/10 pb-2">
        <h4 className="text-xs font-bold uppercase tracking-wider text-white/70">{title}</h4>
        <span className="text-[10px] font-mono text-white/30">{docs.length} DOCS</span>
      </div>
      {docs.length === 0 ? (
        <div className="text-[10px] font-mono text-white/30 italic py-2">No documentation filed.</div>
      ) : (
        <div className="grid grid-cols-1 gap-2">
          {docs.map((doc, i) => (
            <a
              key={i}
              href={projectName ? buildRegulatoryDocFileUrl(projectName, doc.path) : undefined}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between gap-3 min-w-0 w-full p-2 bg-white/[0.02] border border-white/5 rounded-sm hover:bg-white/[0.05] transition-colors"
              title="Open document"
            >
              <div className="flex items-center gap-3 min-w-0">
                <FileText className="w-4 h-4 text-primary/70 shrink-0" />
                <div className="min-w-0">
                  <div className="text-xs text-white truncate" title={doc.name}>{doc.name}</div>
                  <div className="text-[9px] font-mono text-white/40 truncate" title={doc.path}>{doc.path}</div>
                </div>
              </div>
              <div className="text-[9px] font-mono text-white/30 shrink-0 ml-2">
                {doc.size_bytes ? `${Math.round(doc.size_bytes / 1024)} KB` : ''}
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

function DataSourceItem({ name, source, resolution, url }: { name: string; source: string; resolution: string; url: string }) {
  return (
    <div className="flex items-center justify-between p-2 bg-white/[0.02] border border-white/5 rounded-sm hover:bg-white/[0.05] transition-colors group">
      <div className="flex-1 min-w-0">
        <div className="text-xs text-white font-medium truncate">{name}</div>
        <div className="text-[10px] text-white/40 font-mono">{source}</div>
      </div>
      <div className="flex items-center gap-2 ml-2">
        <span className="text-[9px] font-mono text-primary/70 bg-primary/10 px-1.5 py-0.5 rounded">{resolution}</span>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="p-1 text-white/30 hover:text-primary transition-colors opacity-0 group-hover:opacity-100"
          title="View source"
        >
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  )
}

function TerrainCard({ label, value, subtext, icon, warning }: { label: string; value: string; subtext: string; icon: React.ReactNode; warning?: boolean }) {
  return (
    <div className={cn(
      "p-3 border rounded-sm",
      warning ? "bg-amber-500/5 border-amber-500/20" : "bg-black/40 border-white/10"
    )}>
      <div className={cn("mb-2", warning ? "text-amber-400" : "text-white/40")}>
        {icon}
      </div>
      <div className="text-[10px] text-white/40 font-mono uppercase tracking-wider mb-1">{label}</div>
      <div className={cn("text-sm font-bold", warning ? "text-amber-400" : "text-white")}>{value}</div>
      <div className="text-[10px] text-white/40">{subtext}</div>
    </div>
  )
}

function CostFactorCard({ label, value, benchmark, source }: { label: string; value: string; benchmark: string; source: string }) {
  return (
    <div className="p-3 bg-black/40 border border-white/10 rounded-sm">
      <div className="text-[10px] text-white/40 font-mono uppercase tracking-wider mb-1">{label}</div>
      <div className="text-lg font-bold text-primary mb-1">{value}</div>
      <div className="text-[10px] text-white/50">{benchmark}</div>
      <div className="text-[9px] text-white/30 font-mono mt-1">{source}</div>
    </div>
  )
}

function CrossingRow({ icon, type, cost, method, source }: { icon: React.ReactNode; type: string; cost: string; method: string; source: string }) {
  return (
    <tr className="border-b border-white/5 hover:bg-white/[0.02]">
      <td className="py-2 px-3">
        <div className="flex items-center gap-2">
          <span className="text-white/40">{icon}</span>
          <span>{type}</span>
        </div>
      </td>
      <td className="py-2 px-3 text-right font-mono text-primary">{cost}</td>
      <td className="py-2 px-3 text-white/50">{method}</td>
      <td className="py-2 px-3 text-white/30 font-mono">{source}</td>
    </tr>
  )
}

