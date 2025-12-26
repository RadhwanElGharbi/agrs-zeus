'use client'

import { useState, useEffect } from 'react'
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
  Building2,
  Train,
  Zap,
  TreePine,
  ExternalLink
} from 'lucide-react'
import { useProject } from '@/lib/context/ProjectContext'
import { cn } from '@/lib/utils'
import { 
  fetchRecommendedCRS, 
  updateProjectCRS, 
  ProjectCRSRecommendation,
  fetchRegulatoryDocs,
  RegulatoryDoc
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
  const { projectMetadata, currentProject, refreshProjectData } = useProject()
  const [mounted, setMounted] = useState(false)
  const [crsSelectorOpen, setCrsSelectorOpen] = useState(false)
  const [recommendation, setRecommendation] = useState<ProjectCRSRecommendation | null>(null)
  const [isUpdating, setIsUpdating] = useState(false)
  const [isClosing, setIsClosing] = useState(false)
  const [activeTab, setActiveTab] = useState<TabId>('overview')
  
  const [regDocs, setRegDocs] = useState<RegulatoryDoc[]>([])
  const [regIndex, setRegIndex] = useState<string | undefined>()
  const [loadingRegs, setLoadingRegs] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (open && activeTab === 'regulation' && currentProject) {
      setLoadingRegs(true)
      fetchRegulatoryDocs(currentProject)
        .then(resp => {
          setRegDocs(resp.documents)
          setRegIndex(resp.index_content)
        })
        .catch(err => console.error("Failed to load regulatory docs", err))
        .finally(() => setLoadingRegs(false))
    }
  }, [open, activeTab, currentProject])

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
          "relative w-[800px] max-w-[95vw] bg-[#0a0a0a]/95 border border-white/10 rounded-sm shadow-[0_0_50px_-10px_rgba(0,0,0,0.8)] flex flex-col pointer-events-auto overflow-hidden",
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
                      <div className="text-[10px] text-white/30 font-mono mb-1 uppercase">Primary Location</div>
                      <div className="text-sm font-bold text-white">
                        {projectMetadata?.aoi?.countries?.join(', ') || projectMetadata?.country || projectMetadata?.iso3 || 'Global / Unspecified'}
                      </div>
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
                    className="px-4 py-2 bg-primary/10 border border-primary/30 text-primary text-xs font-bold uppercase tracking-wider rounded-sm hover:bg-primary/20 transition-all flex items-center gap-2"
                    onClick={() => alert("Perplexity integration pending backend implementation.")}
                  >
                    <Globe className="w-3 h-3" />
                    Run Analysis
                  </button>
                </div>

                {loadingRegs ? (
                  <div className="py-12 text-center text-white/30 font-mono text-xs uppercase tracking-widest flex flex-col items-center gap-3">
                    <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                    Scanning Regulatory Archive...
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-8">
                    <RegulatorySection title="National Legislation" docs={regDocs.filter(d => d.category === 'national')} />
                    <RegulatorySection title="Regional / State" docs={regDocs.filter(d => d.category === 'regional')} />
                    <RegulatorySection title="Local / Municipal" docs={regDocs.filter(d => d.category === 'local')} />
                    <RegulatorySection title="Technical Standards" docs={regDocs.filter(d => d.category === 'technical')} />
                    <RegulatorySection title="Industry Best Practices" docs={regDocs.filter(d => d.category === 'industry')} />
                  </div>
                )}
              </div>
            )}

            {activeTab === 'geo_scope' && (
              <div className="space-y-8 animate-in fade-in duration-300">
                {/* Data Sources Section */}
                <section>
                  <div className="flex items-center gap-2 mb-4 text-white/50">
                    <Database className="w-4 h-4" />
                    <h3 className="text-sm font-bold uppercase tracking-wider">Geospatial Data Sources</h3>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Raster Datasets */}
                    <div className="p-4 bg-black/40 border border-white/10 rounded-sm">
                      <div className="flex items-center gap-2 text-xs font-mono uppercase text-white/40 tracking-wider mb-3">
                        <Layers className="w-3 h-3" />
                        <span>Raster Datasets</span>
                      </div>
                      <div className="space-y-2">
                        <DataSourceItem
                          name="Digital Elevation Model"
                          source="Copernicus DEM GLO-30"
                          resolution="30m"
                          url="https://spacedata.copernicus.eu/collections/copernicus-digital-elevation-model"
                        />
                        <DataSourceItem
                          name="Land Cover Classification"
                          source="ESA WorldCover 2021"
                          resolution="10m"
                          url="https://esa-worldcover.org/en"
                        />
                        <DataSourceItem
                          name="Soil Properties"
                          source="SoilGrids 250m"
                          resolution="250m"
                          url="https://soilgrids.org/"
                        />
                        <DataSourceItem
                          name="Geohazard Assessment"
                          source="ISPRA / ProGeo"
                          resolution="Derived"
                          url="https://www.isprambiente.gov.it/it/progetti/cartella-progetti-in-corso/suolo-e-territorio-1/iffi-inventario-dei-fenomeni-franosi-in-italia"
                        />
                      </div>
                    </div>

                    {/* Vector Datasets */}
                    <div className="p-4 bg-black/40 border border-white/10 rounded-sm">
                      <div className="flex items-center gap-2 text-xs font-mono uppercase text-white/40 tracking-wider mb-3">
                        <Route className="w-3 h-3" />
                        <span>Vector Datasets</span>
                      </div>
                      <div className="space-y-2">
                        <DataSourceItem
                          name="Road Network"
                          source="OpenStreetMap"
                          resolution="Vector"
                          url="https://www.openstreetmap.org/"
                        />
                        <DataSourceItem
                          name="Railway Network"
                          source="OpenStreetMap"
                          resolution="Vector"
                          url="https://www.openstreetmap.org/"
                        />
                        <DataSourceItem
                          name="Waterways & Rivers"
                          source="OpenStreetMap"
                          resolution="Vector"
                          url="https://www.openstreetmap.org/"
                        />
                        <DataSourceItem
                          name="Power Transmission Lines"
                          source="OpenStreetMap"
                          resolution="Vector"
                          url="https://www.openstreetmap.org/"
                        />
                        <DataSourceItem
                          name="Existing Pipelines"
                          source="OpenStreetMap / SNAM"
                          resolution="Vector"
                          url="https://www.snam.it/en/our-businesses/transportation.html"
                        />
                      </div>
                    </div>
                  </div>
                </section>

                {/* Terrain Characteristics */}
                <section>
                  <div className="flex items-center gap-2 mb-4 text-white/50">
                    <Mountain className="w-4 h-4" />
                    <h3 className="text-sm font-bold uppercase tracking-wider">Terrain Characteristics</h3>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <TerrainCard
                      label="Terrain Type"
                      value="Apennine Mountains"
                      subtext="Central Italy"
                      icon={<Mountain className="w-4 h-4" />}
                    />
                    <TerrainCard
                      label="Seismic Zone"
                      value="Zone 1-2"
                      subtext="High hazard (NTC 2018)"
                      icon={<AlertTriangle className="w-4 h-4" />}
                      warning
                    />
                    <TerrainCard
                      label="Primary Land Cover"
                      value="Cropland / Forest"
                      subtext="58-65% agricultural"
                      icon={<TreePine className="w-4 h-4" />}
                    />
                    <TerrainCard
                      label="Elevation Range"
                      value="25m - 450m"
                      subtext="Coastal to hills"
                      icon={<Layers className="w-4 h-4" />}
                    />
                  </div>
                </section>

                {/* Environmental Constraints */}
                <section>
                  <div className="flex items-center gap-2 mb-4 text-white/50">
                    <AlertTriangle className="w-4 h-4" />
                    <h3 className="text-sm font-bold uppercase tracking-wider">Environmental Constraints</h3>
                  </div>

                  <div className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-sm">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                      <div>
                        <div className="text-amber-400 font-bold mb-2">Natura 2000 Sites (Potential Intersections)</div>
                        <ul className="space-y-1 text-white/60">
                          <li className="flex items-start gap-2">
                            <span className="text-amber-500 mt-0.5">•</span>
                            <span>IT5310020 &quot;Monti Martani, Serre, Subasio&quot; (SPA)</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="text-amber-500 mt-0.5">•</span>
                            <span>Regional protected areas along Apennine corridor</span>
                          </li>
                        </ul>
                      </div>
                      <div>
                        <div className="text-amber-400 font-bold mb-2">Geohazard Considerations</div>
                        <ul className="space-y-1 text-white/60">
                          <li className="flex items-start gap-2">
                            <span className="text-amber-500 mt-0.5">•</span>
                            <span>Landslide-prone areas (IFFI inventory)</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="text-amber-500 mt-0.5">•</span>
                            <span>Flood risk zones along river valleys</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="text-amber-500 mt-0.5">•</span>
                            <span>Archaeological sensitivity (Etruscan/Roman remains)</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </section>
              </div>
            )}

            {activeTab === 'epc_logistics' && (
              <div className="space-y-8 animate-in fade-in duration-300">
                {/* Regional Cost Factors */}
                <section>
                  <div className="flex items-center gap-2 mb-4 text-white/50">
                    <Truck className="w-4 h-4" />
                    <h3 className="text-sm font-bold uppercase tracking-wider">Regional Cost Factors (Italy)</h3>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <CostFactorCard
                      label="Labor Index"
                      value="1.0"
                      benchmark="Baseline"
                      source="AACE International"
                    />
                    <CostFactorCard
                      label="Material Index"
                      value="1.0"
                      benchmark="Baseline"
                      source="Compass Intl. 2024"
                    />
                    <CostFactorCard
                      label="Regional Multiplier"
                      value="1.2x"
                      benchmark="Western Europe"
                      source="EU Pipeline Benchmarks"
                    />
                    <CostFactorCard
                      label="Base Cost Range"
                      value="€800K-1.5M"
                      benchmark="per km"
                      source="Industry Average"
                    />
                  </div>
                </section>

                {/* Infrastructure Crossing Costs */}
                <section>
                  <div className="flex items-center gap-2 mb-4 text-white/50">
                    <Route className="w-4 h-4" />
                    <h3 className="text-sm font-bold uppercase tracking-wider">Infrastructure Crossing Costs</h3>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-white/10">
                          <th className="text-left py-2 px-3 text-white/40 font-mono uppercase tracking-wider">Crossing Type</th>
                          <th className="text-right py-2 px-3 text-white/40 font-mono uppercase tracking-wider">Cost per Crossing</th>
                          <th className="text-left py-2 px-3 text-white/40 font-mono uppercase tracking-wider">Method</th>
                          <th className="text-left py-2 px-3 text-white/40 font-mono uppercase tracking-wider">Source</th>
                        </tr>
                      </thead>
                      <tbody className="text-white/70">
                        <CrossingRow icon={<Route className="w-3 h-3" />} type="Primary Road" cost="€200K-400K" method="HDD Required" source="API RP 1102" />
                        <CrossingRow icon={<Route className="w-3 h-3" />} type="Secondary Road" cost="€100K-200K" method="HDD Preferred" source="API RP 1102" />
                        <CrossingRow icon={<Route className="w-3 h-3" />} type="Tertiary/Track" cost="€40K-80K" method="Open Cut/HDD" source="AACE Est." />
                        <CrossingRow icon={<Train className="w-3 h-3" />} type="Heavy Rail" cost="€1.0M-1.5M" method="Deep HDD" source="RFI Standards" />
                        <CrossingRow icon={<Droplets className="w-3 h-3" />} type="Major River" cost="€300K-500K" method="HDD Required" source="EN 1594" />
                        <CrossingRow icon={<Droplets className="w-3 h-3" />} type="Stream/Canal" cost="€80K-150K" method="HDD Preferred" source="Industry Est." />
                        <CrossingRow icon={<Zap className="w-3 h-3" />} type="HV Powerline" cost="€100K-200K" method="HDD Preferred" source="Terna Guidelines" />
                      </tbody>
                    </table>
                  </div>
                </section>

                {/* Construction Standards */}
                <section>
                  <div className="flex items-center gap-2 mb-4 text-white/50">
                    <Building2 className="w-4 h-4" />
                    <h3 className="text-sm font-bold uppercase tracking-wider">Applicable Technical Standards</h3>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 bg-black/40 border border-white/10 rounded-sm">
                      <div className="text-xs font-mono uppercase text-primary mb-2">Pipeline Design</div>
                      <ul className="space-y-1.5 text-xs text-white/60">
                        <li className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-primary/50" />
                          <span><strong className="text-white/80">ASME B31.8</strong> - Gas Transmission Systems</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-primary/50" />
                          <span><strong className="text-white/80">EN 1594</strong> - High Pressure Gas Pipelines (&gt;16 bar)</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-primary/50" />
                          <span><strong className="text-white/80">ISO 13623</strong> - Pipeline Transportation Systems</span>
                        </li>
                      </ul>
                    </div>
                    <div className="p-4 bg-black/40 border border-white/10 rounded-sm">
                      <div className="text-xs font-mono uppercase text-primary mb-2">Construction & Seismic</div>
                      <ul className="space-y-1.5 text-xs text-white/60">
                        <li className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-primary/50" />
                          <span><strong className="text-white/80">NTC 2018</strong> - Italian Technical Construction Standards</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-primary/50" />
                          <span><strong className="text-white/80">Circular 7/2019</strong> - Seismic Pipeline Protection</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-primary/50" />
                          <span><strong className="text-white/80">API RP 1102</strong> - Road/Rail Crossing Design</span>
                        </li>
                      </ul>
                    </div>
                  </div>
                </section>

                {/* EPC Considerations */}
                <section>
                  <div className="flex items-center gap-2 mb-4 text-white/50">
                    <Construction className="w-4 h-4" />
                    <h3 className="text-sm font-bold uppercase tracking-wider">EPC Considerations</h3>
                  </div>

                  <div className="p-4 bg-cyan-500/5 border border-cyan-500/20 rounded-sm">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                      <div>
                        <div className="text-cyan-400 font-bold mb-2">Key Contractors (Italy Market)</div>
                        <ul className="space-y-1 text-white/60">
                          <li>• <strong className="text-white/80">SNAM Rete Gas</strong> - TSO, Network Operator</li>
                          <li>• <strong className="text-white/80">Saipem</strong> - EPC Contractor</li>
                          <li>• <strong className="text-white/80">Bonatti</strong> - Pipeline Construction</li>
                          <li>• <strong className="text-white/80">Sicim</strong> - Pipeline Construction</li>
                        </ul>
                      </div>
                      <div>
                        <div className="text-cyan-400 font-bold mb-2">Typical Timeline (Italy)</div>
                        <ul className="space-y-1 text-white/60">
                          <li>• Permitting: <strong className="text-white/80">18-24 months</strong> (fast-track)</li>
                          <li>• EIA Process: <strong className="text-white/80">12-18 months</strong></li>
                          <li>• Land Acquisition: <strong className="text-white/80">6-12 months</strong></li>
                          <li>• Construction: <strong className="text-white/80">12-18 months</strong> (72km)</li>
                        </ul>
                      </div>
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

function RegulatorySection({ title, docs }: { title: string, docs: RegulatoryDoc[] }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between border-b border-white/10 pb-2">
        <h4 className="text-xs font-bold uppercase tracking-wider text-white/70">{title}</h4>
        <span className="text-[10px] font-mono text-white/30">{docs.length} DOCS</span>
      </div>
      {docs.length === 0 ? (
        <div className="text-[10px] font-mono text-white/30 italic py-2">No documentation filed.</div>
      ) : (
        <div className="grid gap-2">
          {docs.map((doc, i) => (
            <div key={i} className="flex items-center justify-between p-2 bg-white/[0.02] border border-white/5 rounded-sm hover:bg-white/[0.05] transition-colors cursor-default">
              <div className="flex items-center gap-3 overflow-hidden">
                <FileText className="w-4 h-4 text-primary/70 shrink-0" />
                <div className="truncate">
                  <div className="text-xs text-white truncate" title={doc.name}>{doc.name}</div>
                  <div className="text-[9px] font-mono text-white/40 truncate" title={doc.path}>{doc.path}</div>
                </div>
              </div>
              <div className="text-[9px] font-mono text-white/30 shrink-0 ml-2">
                {doc.size_bytes ? `${Math.round(doc.size_bytes / 1024)} KB` : ''}
              </div>
            </div>
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

