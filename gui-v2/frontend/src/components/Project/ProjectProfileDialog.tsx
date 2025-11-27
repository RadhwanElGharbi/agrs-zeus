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
  Construction
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

            {activeTab !== 'overview' && activeTab !== 'regulation' && (
              <div className="h-full flex flex-col items-center justify-center text-white/30 space-y-4 py-12 animate-in fade-in duration-300">
                <Construction className="w-12 h-12 opacity-20" />
                <div className="text-center">
                  <div className="text-sm font-mono uppercase tracking-widest mb-1">Module Offline</div>
                  <div className="text-[10px] font-mono opacity-50">
                    {TABS.find(t => t.id === activeTab)?.label} Implementation Pending
                  </div>
                </div>
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

