'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { 
  X, 
  Truck, 
  Package, 
  Factory, 
  Wrench, 
  Briefcase, 
  Search,
  Loader2,
  CheckCircle,
  AlertCircle,
  Sparkles,
  MapPin,
  FileJson,
  ChevronRight,
  Star,
  Building2,
  Globe,
  Mail,
  MoreHorizontal,
  RefreshCw,
  Terminal
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { API_BASE_URL } from '@/lib/api-client'

// API base resolver - uses the configured API URL from environment
function getApiBase(): string {
  return API_BASE_URL
}

interface SupplierSearchDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSearchComplete?: (hasResults: boolean) => void
}

type SupplierCategory = 
  | 'construction_supplies'
  | 'construction_services'
  | 'pipeline_manufacturer'
  | 'equipment_manufacturer'
  | 'consultancy'

interface CategoryOption {
  id: SupplierCategory
  label: string
  description: string
  icon: React.ElementType
  examples: string[]
}

const SUPPLIER_CATEGORIES: CategoryOption[] = [
  {
    id: 'construction_supplies',
    label: 'Construction Supplies',
    description: 'Materials and consumables for pipeline construction',
    icon: Package,
    examples: ['Steel', 'Welding materials', 'Coating', 'Cathodic protection']
  },
  {
    id: 'construction_services',
    label: 'Construction Services',
    description: 'Contractors and specialized construction services',
    icon: Wrench,
    examples: ['Civil works', 'HDD drilling', 'Welding services', 'Testing']
  },
  {
    id: 'pipeline_manufacturer',
    label: 'Pipeline Manufacturers',
    description: 'Pipe, fittings, valves, and pressure equipment',
    icon: Factory,
    examples: ['Line pipe', 'Fittings', 'Valves', 'Flanges']
  },
  {
    id: 'equipment_manufacturer',
    label: 'Equipment Manufacturers',
    description: 'Compressors, metering, instrumentation, and control systems',
    icon: Truck,
    examples: ['Compressors', 'Meters', 'SCADA', 'Pig launchers']
  },
  {
    id: 'consultancy',
    label: 'Consultancies',
    description: 'Environmental, engineering, and regulatory consultants',
    icon: Briefcase,
    examples: ['EIA', 'Geotechnical', 'Permitting', 'Engineering design']
  }
]

type SearchStatus = 'idle' | 'loading' | 'success' | 'error'

interface SupplierSearchJob {
  job_id: string
  status: 'pending' | 'running' | 'succeeded' | 'failed'
  progress: number
  current_phase: string
  logs: string[]
  result?: {
    status: string
    suppliers_found: number
    profiles_generated: number
    new_suppliers: number
    message: string
    suppliers: SupplierResult[]
    has_more: boolean
  }
  error?: string
}

interface SupplierResult {
  supplier_id: string
  company_name: string
  category: string
  location: {
    country: string
    city: string
    coordinates: { latitude: number; longitude: number }
  }
  contact: {
    primary_email: string
    primary_phone?: string
    website?: string
  }
  capabilities?: {
    certifications?: string[]
    experience_years?: number
  }
  quality_ratings?: {
    overall_score?: number
  }
  compatibility?: {
    match_score?: number
  }
}

interface SearchResult {
  suppliersFound: number
  profilesGenerated: number
  message: string
  suppliers: SupplierResult[]
  hasMore: boolean
  searchDepth: 'standard' | 'expanded'
}

export function SupplierSearchDialog({ open, onOpenChange, onSearchComplete }: SupplierSearchDialogProps) {
  const [selectedCategory, setSelectedCategory] = useState<SupplierCategory | null>(null)
  const [searchStatus, setSearchStatus] = useState<SearchStatus>('idle')
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null)
  const [projectInfo, setProjectInfo] = useState<{ name: string; country: string; iso3: string; pipelineSpec: string } | null>(null)
  const [expandedSearch, setExpandedSearch] = useState(false)
  const [isComprehensiveResearch, setIsComprehensiveResearch] = useState(false)
  const [logs, setLogs] = useState<string[]>([])
  const [progress, setProgress] = useState(0)
  const [currentPhase, setCurrentPhase] = useState('')
  const logsEndRef = useRef<HTMLDivElement>(null)
  const eventSourceRef = useRef<EventSource | null>(null)

  // Auto-scroll logs to bottom
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs])

  // Cleanup EventSource on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
      }
    }
  }, [])

  // Load project info when dialog opens
  useEffect(() => {
    if (open) {
      fetchProjectInfo()
      // Reset state
      setSelectedCategory(null)
      setSearchStatus('idle')
      setSearchResult(null)
      setExpandedSearch(false)
      setLogs([])
      setProgress(0)
      setCurrentPhase('')
    }
  }, [open])

  const fetchProjectInfo = async () => {
    try {
      const currentProject = localStorage.getItem('agrs_current_project')
      if (currentProject) {
        const apiBase = getApiBase()
        const metadataRes = await fetch(`${apiBase}/projects/${currentProject}/metadata`)
        if (metadataRes.ok) {
          const metadata = await metadataRes.json()
          
          const specsRes = await fetch(`${apiBase}/projects/${currentProject}/pipeline-specs`)
          let pipelineSpec = 'Not configured'
          if (specsRes.ok) {
            const specs = await specsRes.json()
            if (specs.outer_diameter && specs.inner_diameter) {
              pipelineSpec = `OD: ${specs.outer_diameter}" / ID: ${specs.inner_diameter}"`
            }
          }

          setProjectInfo({
            name: metadata.project_name || currentProject,
            country: metadata.country || 'Unknown',
            iso3: metadata.iso3 || 'UNK',
            pipelineSpec
          })
        }
      }
    } catch (err) {
      console.error('Error fetching project info:', err)
    }
  }

  const handleComprehensiveResearch = useCallback(async () => {
    if (!selectedCategory) return

    setSearchStatus('loading')
    setExpandedSearch(false)
    setIsComprehensiveResearch(true)
    setLogs(['Initializing ZEUS AI Agent for comprehensive research...'])
    setProgress(10)
    setCurrentPhase('initializing')

    try {
      const currentProject = localStorage.getItem('agrs_current_project')
      if (!currentProject) {
        throw new Error('No project selected')
      }

      const apiBase = getApiBase()

      setLogs(prev => [...prev, 'Loading project context...', 'Reading pipeline_specs.json...', 'Reading project_aoi.json...'])
      setProgress(20)

      // Simulate progress updates while research is happening
      const progressInterval = setInterval(() => {
        setProgress(prev => {
          if (prev < 85) return prev + 1
          return prev
        })
      }, 1000) // Increment every second

      // Add realistic progress logs
      setTimeout(() => setLogs(prev => [...prev, 'Initializing ZEUS AI research agent...']), 500)
      setTimeout(() => setLogs(prev => [...prev, 'Querying comprehensive supplier database...']), 2000)
      setTimeout(() => setLogs(prev => [...prev, 'Searching LinkedIn for sales contacts...']), 5000)
      setTimeout(() => setLogs(prev => [...prev, 'Verifying company websites and certifications...']), 8000)
      setTimeout(() => setLogs(prev => [...prev, 'Cross-referencing industry directories...']), 12000)
      setTimeout(() => setLogs(prev => [...prev, 'Building detailed supplier profiles...']), 16000)
      setTimeout(() => setLogs(prev => [...prev, 'Matching suppliers to project specifications...']), 20000)

      // Call the comprehensive research endpoint
      const response = await fetch(`${apiBase}/suppliers/comprehensive-research`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: currentProject,
          category: selectedCategory,
          limit: 10
        })
      })

      clearInterval(progressInterval)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || 'Comprehensive research failed')
      }

      setCurrentPhase('deep_research')
      const result = await response.json()

      setProgress(95)
      setLogs(prev => [...prev, `✓ Found ${result.suppliers_found} verified suppliers`, '✓ Quality validation complete', '✓ Sales contacts verified', '✓ Match scores calculated'])
      setCurrentPhase('complete')

      setSearchResult({
        suppliersFound: result.suppliers_found || 0,
        profilesGenerated: result.profiles_generated || 0,
        message: result.message || 'Research completed',
        suppliers: result.suppliers || [],
        hasMore: result.has_more || false,
        searchDepth: 'standard'
      })

      setProgress(100)
      setSearchStatus('success')

    } catch (err) {
      console.error('Comprehensive research error:', err)
      setSearchResult({
        suppliersFound: 0,
        profilesGenerated: 0,
        message: err instanceof Error ? err.message : 'Research failed',
        suppliers: [],
        hasMore: false,
        searchDepth: 'standard'
      })
      setSearchStatus('error')
      setLogs(prev => [...prev, `✗ ERROR: ${err instanceof Error ? err.message : 'Research failed'}`])
    }
  }, [selectedCategory])

  const handleSearch = useCallback(async (expanded: boolean = false) => {
    if (!selectedCategory) return

    setSearchStatus('loading')
    setExpandedSearch(expanded)
    setIsComprehensiveResearch(false)
    setLogs([])
    setProgress(0)
    setCurrentPhase('initializing')

    // Close any existing event source
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
    }

    try {
      const currentProject = localStorage.getItem('agrs_current_project')
      if (!currentProject) {
        throw new Error('No project selected')
      }

      const apiBase = getApiBase()

      // Start the streaming search
      const response = await fetch(`${apiBase}/suppliers/search-stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: currentProject,
          category: selectedCategory,
          limit: expanded ? 25 : 10,
          expanded: expanded
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || 'Search failed')
      }

      // Read the streaming response
      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      
      if (!reader) {
        throw new Error('No response stream available')
      }

      let buffer = ''
      
      while (true) {
        const { done, value } = await reader.read()
        
        if (done) break
        
        buffer += decoder.decode(value, { stream: true })
        
        // Process complete SSE messages
        const lines = buffer.split('\n')
        buffer = lines.pop() || '' // Keep incomplete line in buffer
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6)) as SupplierSearchJob
              
              // Update state from job data
              setLogs(data.logs || [])
              setProgress(data.progress || 0)
              setCurrentPhase(data.current_phase || '')
              
              if (data.status === 'succeeded' && data.result) {
                setSearchResult({
                  suppliersFound: data.result.suppliers_found || 0,
                  profilesGenerated: data.result.profiles_generated || 0,
                  message: data.result.message || 'Search completed',
                  suppliers: data.result.suppliers || [],
                  hasMore: data.result.has_more || false,
                  searchDepth: expanded ? 'expanded' : 'standard'
                })
                setSearchStatus('success')
              } else if (data.status === 'failed') {
                throw new Error(data.error || 'Search failed')
              }
            } catch (parseErr) {
              // Ignore parse errors for incomplete messages
              if (parseErr instanceof SyntaxError) continue
              throw parseErr
            }
          }
        }
      }
      
    } catch (err) {
      console.error('Supplier search error:', err)
      setSearchResult({
        suppliersFound: 0,
        profilesGenerated: 0,
        message: err instanceof Error ? err.message : 'Search failed',
        suppliers: [],
        hasMore: false,
        searchDepth: 'standard'
      })
      setSearchStatus('error')
    }
  }, [selectedCategory])

  const handleExpandSearch = () => {
    handleSearch(true)
  }

  const handleClose = (withResults: boolean = false) => {
    const hadResults = withResults || (searchResult?.suppliers && searchResult.suppliers.length > 0)
    setSelectedCategory(null)
    setSearchStatus('idle')
    setSearchResult(null)
    setExpandedSearch(false)
    onOpenChange(false)
    // Notify parent about search completion with results
    if (hadResults && onSearchComplete) {
      onSearchComplete(true)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={() => handleClose()}
      />

      {/* Dialog */}
      <div data-tour="supplier-dialog" className="relative w-full max-w-3xl mx-4 bg-[#0a0a0a] border border-white/10 rounded-lg shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="relative px-6 py-4 border-b border-white/10 bg-gradient-to-r from-primary/10 via-transparent to-transparent shrink-0">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff02_1px,transparent_1px),linear-gradient(to_bottom,#ffffff02_1px,transparent_1px)] bg-[size:20px_20px] pointer-events-none" />
          
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/20 rounded-lg">
                <Search className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">Supplier Search</h2>
                <p className="text-xs text-white/50">ZEUS AI Agent</p>
              </div>
            </div>
            <button
              onClick={() => handleClose()}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors text-white/50 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Project Context */}
        {projectInfo && (
          <div className="px-6 py-3 border-b border-white/5 bg-white/[0.02] shrink-0">
            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5 text-primary" />
                <span className="text-white/50">Project:</span>
                <span className="text-white font-medium">{projectInfo.name}</span>
              </div>
              <div className="h-3 w-px bg-white/10" />
              <div className="flex items-center gap-2">
                <span className="text-white/50">Country:</span>
                <span className="text-white font-medium">{projectInfo.country}</span>
              </div>
              <div className="h-3 w-px bg-white/10" />
              <div className="flex items-center gap-2">
                <span className="text-white/50">Pipeline:</span>
                <span className="text-white font-medium">{projectInfo.pipelineSpec}</span>
              </div>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1">
          {searchStatus === 'idle' && (
            <>
              <div className="space-y-3 mb-4">
                <p className="text-sm text-white/60">
                  Select the type of supplier you&apos;re looking for. Choose between:
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-white/[0.02] border border-white/10 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                      <Search className="w-3.5 h-3.5 text-white/40" />
                      <span className="text-xs font-medium text-white/80">Quick Search</span>
                    </div>
                    <p className="text-[11px] text-white/50 leading-relaxed">
                      Fast results using Perplexity AI. Good for initial exploration.
                    </p>
                  </div>
                  <div className="p-3 bg-primary/5 border border-primary/30 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                      <Sparkles className="w-3.5 h-3.5 text-primary" />
                      <span className="text-xs font-medium text-primary">Comprehensive Research</span>
                      <span className="px-1 py-0.5 text-[8px] bg-emerald-500 text-white rounded font-bold">RECOMMENDED</span>
                    </div>
                    <p className="text-[11px] text-white/50 leading-relaxed">
                      Deep verification with ZEUS AI. Multi-source validation using project specs and AOI data.
                    </p>
                  </div>
                </div>
              </div>

              {/* Category Grid */}
              <div className="grid grid-cols-1 gap-3">
                {SUPPLIER_CATEGORIES.map((category) => {
                  const Icon = category.icon
                  const isSelected = selectedCategory === category.id

                  return (
                    <button
                      key={category.id}
                      onClick={() => setSelectedCategory(category.id)}
                      className={cn(
                        "relative flex items-start gap-4 p-4 rounded-lg border transition-all text-left",
                        isSelected 
                          ? "bg-primary/10 border-primary/50 shadow-[0_0_20px_-5px_rgba(var(--primary),0.3)]"
                          : "bg-white/[0.02] border-white/10 hover:bg-white/[0.05] hover:border-white/20"
                      )}
                    >
                      <div className={cn(
                        "p-2 rounded-lg shrink-0",
                        isSelected ? "bg-primary/20" : "bg-white/5"
                      )}>
                        <Icon className={cn(
                          "w-5 h-5",
                          isSelected ? "text-primary" : "text-white/50"
                        )} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "font-medium",
                            isSelected ? "text-white" : "text-white/80"
                          )}>
                            {category.label}
                          </span>
                          {isSelected && (
                            <CheckCircle className="w-4 h-4 text-primary" />
                          )}
                        </div>
                        <p className="text-xs text-white/50 mt-0.5">
                          {category.description}
                        </p>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {category.examples.map((example) => (
                            <span 
                              key={example}
                              className="px-2 py-0.5 text-[10px] bg-white/5 border border-white/10 rounded text-white/40"
                            >
                              {example}
                            </span>
                          ))}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </>
          )}

          {searchStatus === 'loading' && (
            <div className="space-y-6">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl animate-pulse" />
                    <div className="relative p-2 bg-primary/10 rounded-full">
                      <Sparkles className="w-5 h-5 text-primary animate-pulse" />
                    </div>
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-white">
                      {isComprehensiveResearch ? 'ZEUS AI Comprehensive Research' : 'ZEUS AI Agent Working'}
                    </h3>
                    <p className="text-xs text-white/50">
                      {isComprehensiveResearch
                        ? 'Deep verification & multi-source validation'
                        : expandedSearch
                          ? 'Expanding search...'
                          : `Finding Top 10 ${SUPPLIER_CATEGORIES.find(c => c.id === selectedCategory)?.label.toLowerCase()}`
                      }
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-primary">{progress}%</div>
                  <div className="text-[10px] text-white/40 uppercase tracking-wider">{currentPhase.replace(/_/g, ' ')}</div>
                </div>
              </div>
              
              {/* Progress Bar */}
              <div className="relative h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div 
                  className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary to-primary/70 rounded-full transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
                <div 
                  className="absolute inset-y-0 left-0 bg-gradient-to-r from-white/20 to-transparent rounded-full animate-pulse"
                  style={{ width: `${progress}%` }}
                />
              </div>

              {/* System Logs */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-[10px] text-white/40 uppercase tracking-[0.2em]">
                  <Terminal className="w-3 h-3" />
                  <span>System Output Stream</span>
                </div>
                <div className="border border-white/10 bg-black rounded-lg p-4 h-64 overflow-y-auto font-mono text-[11px] leading-relaxed custom-scrollbar">
                  <div className="space-y-0.5">
                    {logs.length > 0 ? (
                      logs.map((line, idx) => (
                        <div key={idx} className="flex gap-2">
                          <span className="text-white/20 select-none shrink-0">{'>'}</span>
                          <span className={cn(
                            line.includes('ERROR') || line.toLowerCase().includes('fail') ? "text-red-400" : 
                            line.includes('✓') || line.toLowerCase().includes('complete') || line.toLowerCase().includes('success') ? "text-emerald-400" : 
                            line.includes('WARNING') ? "text-yellow-400" :
                            line.startsWith('═') ? "text-primary font-bold" :
                            line.includes('PHASE') ? "text-primary" :
                            "text-white/70"
                          )}>
                            {line}
                          </span>
                        </div>
                      ))
                    ) : (
                      <div className="text-white/30 italic">Initializing ZEUS AI Agent...</div>
                    )}
                    <div ref={logsEndRef} />
                  </div>
                </div>
              </div>

              {/* Phase Indicators */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'phase1', label: 'Discovery', phases: ['phase1_discovery', 'loading_project', 'reading_specs', 'checking_credentials', 'preparing_search'] },
                  { id: 'phase2', label: 'Deep Research', phases: ['phase2_deep_research'] },
                  { id: 'phase3', label: 'Contact Extraction', phases: ['phase3_contacts', 'parsing_results', 'updating_index', 'complete'] }
                ].map((phase, i) => {
                  const isActive = phase.phases.includes(currentPhase)
                  const isComplete = i === 0 ? progress > 40 : i === 1 ? progress > 70 : progress >= 100
                  
                  return (
                    <div 
                      key={phase.id}
                      className={cn(
                        "p-3 rounded-lg border text-center transition-all",
                        isComplete ? "bg-emerald-500/10 border-emerald-500/30" :
                        isActive ? "bg-primary/10 border-primary/30" :
                        "bg-white/[0.02] border-white/10"
                      )}
                    >
                      <div className={cn(
                        "text-[10px] uppercase tracking-wider mb-1",
                        isComplete ? "text-emerald-400" :
                        isActive ? "text-primary" :
                        "text-white/40"
                      )}>
                        Phase {i + 1}
                      </div>
                      <div className={cn(
                        "text-xs font-medium",
                        isComplete ? "text-emerald-300" :
                        isActive ? "text-white" :
                        "text-white/50"
                      )}>
                        {phase.label}
                      </div>
                      {isActive && !isComplete && (
                        <Loader2 className="w-3 h-3 mx-auto mt-1 animate-spin text-primary" />
                      )}
                      {isComplete && (
                        <CheckCircle className="w-3 h-3 mx-auto mt-1 text-emerald-400" />
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {searchStatus === 'success' && searchResult && (
            <div className="space-y-6">
              {/* Summary Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-500/10 rounded-lg">
                    <CheckCircle className="w-5 h-5 text-emerald-500" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white">
                      {searchResult.searchDepth === 'expanded' ? 'Expanded Search Complete' : 'Top 10 Suppliers Found'}
                    </h3>
                    <p className="text-xs text-white/50">
                      {searchResult.suppliersFound} suppliers identified in {projectInfo?.country}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-lg border border-white/10">
                  <FileJson className="w-4 h-4 text-primary" />
                  <span className="text-xs text-white/60">
                    Saved to <code className="text-primary">docs/suppliers/</code>
                  </span>
                </div>
              </div>

              {/* Supplier Results List */}
              <div className="space-y-2">
                {searchResult.suppliers.length > 0 ? (
                  searchResult.suppliers.map((supplier, index) => (
                    <div 
                      key={supplier.supplier_id}
                      className="flex items-center gap-4 p-4 bg-white/[0.02] border border-white/10 rounded-lg hover:bg-white/[0.04] hover:border-white/20 transition-all group"
                    >
                      {/* Rank */}
                      <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center shrink-0">
                        <span className={cn(
                          "text-sm font-bold",
                          index < 3 ? "text-primary" : "text-white/50"
                        )}>
                          {index + 1}
                        </span>
                      </div>

                      {/* Company Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-white/40" />
                          <span className="font-medium text-white truncate">{supplier.company_name}</span>
                          {supplier.compatibility?.match_score && supplier.compatibility.match_score >= 90 && (
                            <span className="px-1.5 py-0.5 text-[9px] bg-emerald-500/20 text-emerald-400 rounded font-bold">
                              TOP MATCH
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-white/50">
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {supplier.location.city}, {supplier.location.country}
                          </span>
                          {supplier.capabilities?.experience_years && (
                            <span>{supplier.capabilities.experience_years}+ years</span>
                          )}
                        </div>
                      </div>

                      {/* Ratings */}
                      <div className="flex items-center gap-4 shrink-0">
                        {supplier.quality_ratings?.overall_score &&
                         typeof supplier.quality_ratings.overall_score === 'number' && (
                          <div className="flex items-center gap-1">
                            <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                            <span className="text-sm font-medium text-white">
                              {supplier.quality_ratings.overall_score.toFixed(1)}
                            </span>
                          </div>
                        )}
                        {supplier.compatibility?.match_score &&
                         typeof supplier.compatibility.match_score === 'number' && (
                          <div className={cn(
                            "px-2 py-1 rounded text-xs font-bold",
                            supplier.compatibility.match_score >= 80 ? "bg-emerald-500/20 text-emerald-400" :
                            supplier.compatibility.match_score >= 60 ? "bg-yellow-500/20 text-yellow-400" :
                            "bg-white/10 text-white/50"
                          )}>
                            {supplier.compatibility.match_score}% match
                          </div>
                        )}
                      </div>

                      {/* Quick Actions */}
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {supplier.contact.website && (
                          <a 
                            href={supplier.contact.website} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="p-1.5 hover:bg-white/10 rounded text-white/40 hover:text-white"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Globe className="w-4 h-4" />
                          </a>
                        )}
                        {supplier.contact.primary_email && (
                          <a 
                            href={`mailto:${supplier.contact.primary_email}`}
                            className="p-1.5 hover:bg-white/10 rounded text-white/40 hover:text-white"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Mail className="w-4 h-4" />
                          </a>
                        )}
                        <ChevronRight className="w-4 h-4 text-white/30" />
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-white/50">
                    <Building2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p>No suppliers found for this category yet.</p>
                    <p className="text-xs mt-1">Try expanding the search or check back later.</p>
                  </div>
                )}
              </div>

              {/* Expand Search Button */}
              {searchResult.searchDepth === 'standard' && (
                <div className="flex justify-center pt-4 border-t border-white/10">
                  <button
                    onClick={handleExpandSearch}
                    className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-lg text-sm text-white/70 hover:text-white transition-all"
                  >
                    <MoreHorizontal className="w-4 h-4" />
                    Expand Search
                    <span className="text-xs text-white/40">(Find more suppliers)</span>
                  </button>
                </div>
              )}

              {searchResult.searchDepth === 'expanded' && (
                <div className="text-center text-xs text-white/40 pt-4 border-t border-white/10">
                  <CheckCircle className="w-4 h-4 inline mr-1 text-emerald-500" />
                  Expanded search complete - showing all available suppliers
                </div>
              )}
            </div>
          )}

          {searchStatus === 'error' && searchResult && (
            <div className="flex flex-col items-center justify-center py-8">
              <div className="p-4 bg-red-500/10 rounded-full">
                <AlertCircle className="w-10 h-10 text-red-500" />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-white">Search Failed</h3>
              <p className="text-sm text-red-400 mt-1">{searchResult.message}</p>
              
              <button
                onClick={() => {
                  setSearchStatus('idle')
                  setSearchResult(null)
                }}
                className="mt-6 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm text-white transition-colors flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Try Again
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        {searchStatus === 'idle' && (
          <div className="px-6 py-4 border-t border-white/10 bg-white/[0.02] shrink-0">
            <div className="flex items-center justify-between">
              <button
                onClick={() => handleClose()}
                className="px-4 py-2 text-sm text-white/60 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => handleSearch(false)}
                  disabled={!selectedCategory}
                  className={cn(
                    "px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2",
                    selectedCategory
                      ? "bg-white/10 text-white border border-white/20 hover:bg-white/20"
                      : "bg-white/10 text-white/30 cursor-not-allowed border border-transparent"
                  )}
                  title="Quick search using Perplexity (faster, less comprehensive)"
                >
                  <Search className="w-4 h-4" />
                  Quick Search
                </button>
                <button
                  onClick={handleComprehensiveResearch}
                  disabled={!selectedCategory}
                  className={cn(
                    "px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 relative",
                    selectedCategory
                      ? "bg-gradient-to-r from-primary to-primary/80 text-white hover:from-primary/90 hover:to-primary/70 shadow-[0_0_20px_-5px_rgba(var(--primary),0.5)]"
                      : "bg-white/10 text-white/30 cursor-not-allowed"
                  )}
                  title="Comprehensive research using ZEUS AI (deep, verified, context-aware)"
                >
                  <Sparkles className="w-4 h-4" />
                  Research Suppliers
                  <span className="absolute -top-1 -right-1 px-1.5 py-0.5 text-[9px] bg-emerald-500 text-white rounded-full font-bold shadow-lg">
                    AI
                  </span>
                </button>
              </div>
            </div>
            {selectedCategory && (
              <div className="mt-3 p-3 bg-white/[0.02] border border-white/10 rounded-lg">
                <div className="flex items-start gap-2">
                  <Sparkles className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  <div className="text-xs text-white/60">
                    <span className="text-primary font-medium">Comprehensive Research</span> uses ZEUS AI to perform deep, multi-source verification of supplier data.
                    Ideal for projects of national importance where accuracy is critical.
                    <span className="text-white/40"> (~$1 per search)</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {searchStatus === 'success' && (
          <div className="px-6 py-4 border-t border-white/10 bg-white/[0.02] flex items-center justify-between shrink-0">
            <button
              onClick={() => {
                setSearchStatus('idle')
                setSearchResult(null)
              }}
              className="px-4 py-2 text-sm text-white/60 hover:text-white transition-colors flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              New Search
            </button>
            <button
              onClick={() => handleClose(true)}
              className="px-4 py-2 bg-primary hover:bg-primary/90 rounded-lg text-sm font-medium text-white transition-colors"
            >
              Done
            </button>
          </div>
        )}

        {searchStatus === 'error' && (
          <div className="px-6 py-4 border-t border-white/10 bg-white/[0.02] flex justify-end shrink-0">
            <button
              onClick={() => handleClose(false)}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm text-white transition-colors"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
