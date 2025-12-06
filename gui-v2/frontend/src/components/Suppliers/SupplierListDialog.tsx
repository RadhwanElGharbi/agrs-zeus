import React, { useState, useMemo } from 'react'
import { X, Search, Filter, MapPin, Globe, Phone, Mail, ExternalLink, Package, Wrench, Factory, Truck, Briefcase, Star, Building2, Database, ChevronUp, ChevronDown, ArrowUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createPortal } from 'react-dom'

// Define SupplierProfile interface locally since it's not exported from ProjectManagementView
export interface SupplierProfile {
  supplier_id: string
  company_name: string
  category: string
  subcategories?: string[]
  location: {
    country: string
    iso3: string
    region?: string
    city: string
    address?: string
    postal_code?: string
    coordinates: {
      latitude: number
      longitude: number
    }
  }
  contact: {
    primary_name?: string
    primary_title?: string
    primary_email: string
    primary_phone?: string
    website?: string
    linkedin?: string
  }
  capabilities: {
    products?: string[]
    services?: string[]
    certifications?: string[]
    pipeline_diameters_supported?: { min_inches: number; max_inches: number }
    materials_expertise?: string[]
    annual_capacity?: string
    experience_years?: number
    employee_count?: number
  }
  previous_projects?: Array<{
    project_name: string
    client?: string
    country?: string
    year?: number
    scope?: string
    pipeline_length_km?: number
    pipeline_diameter_inches?: number
    value_usd?: number
    reference_available?: boolean
  }>
  logistics?: {
    delivery_regions?: string[]
    estimated_lead_time_days?: number
    rush_delivery_available?: boolean
    shipping_capabilities?: string[]
    warehouses?: Array<{ city: string; country: string }>
    international_export?: boolean
  }
  pricing?: {
    pricing_model?: string
    currency?: string
    typical_project_range_usd?: { min: number; max: number }
    payment_terms?: string
    accepts_letters_of_credit?: boolean
  }
  quality_ratings?: {
    overall_score?: number | string
    reliability_score?: number | string
    quality_score?: number | string
    communication_score?: number | string
    rating_source?: string
    number_of_reviews?: number
  }
  compatibility?: {
    pipeline_specs_match?: boolean
    match_score?: number
    match_notes?: string[]
    limitations?: string[]
  }
  metadata: {
    source: string
    query_id?: string
    date_researched: string
    last_verified?: string
    confidence_level: string
    notes?: string
    tags?: string[]
  }
}

interface SupplierListDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  suppliers: SupplierProfile[]
  onSelectSupplier?: (supplier: SupplierProfile) => void
}

export function SupplierListDialog({ open, onOpenChange, suppliers, onSelectSupplier }: SupplierListDialogProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [expandedSupplierId, setExpandedSupplierId] = useState<string | null>(null)
  const [isClosing, setIsClosing] = useState(false)
  const [sortKey, setSortKey] = useState<string>('company_name')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  const categories = [
    { id: 'construction_supplies', label: 'Supplies', icon: Package, color: '#f59e0b' },
    { id: 'construction_services', label: 'Services', icon: Wrench, color: '#10b981' },
    { id: 'pipeline_manufacturer', label: 'Pipeline Mfr', icon: Factory, color: '#3b82f6' },
    { id: 'equipment_manufacturer', label: 'Equipment', icon: Truck, color: '#8b5cf6' },
    { id: 'consultancy', label: 'Consultancy', icon: Briefcase, color: '#ec4899' },
  ]

  // Combined filter and sort - computed directly without separate memos
  const displaySuppliers = useMemo(() => {
    // Step 1: Filter
    let result = suppliers.filter(supplier => {
      // Search filter
      const searchLower = searchQuery.toLowerCase().trim()
      if (searchLower) {
        const companyName = (supplier.company_name || '').toLowerCase()
        const city = (supplier.location?.city || '').toLowerCase()
        const country = (supplier.location?.country || '').toLowerCase()
        const matchesSearch = companyName.includes(searchLower) || city.includes(searchLower) || country.includes(searchLower)
        if (!matchesSearch) return false
      }
      
      // Category filter - THIS IS THE KEY FILTER
      if (selectedCategory !== 'all') {
        if (supplier.category !== selectedCategory) {
          return false
        }
      }

      return true
    })
    
    // Step 2: Sort
    result.sort((a, b) => {
      let valA: string | number = ''
      let valB: string | number = ''

      switch (sortKey) {
        case 'company_name':
          valA = (a.company_name || '').toLowerCase()
          valB = (b.company_name || '').toLowerCase()
          break
        case 'category':
          valA = (a.category || '').toLowerCase()
          valB = (b.category || '').toLowerCase()
          break
        case 'quality_ratings.overall_score': {
          const scoreA = a.quality_ratings?.overall_score
          const scoreB = b.quality_ratings?.overall_score
          valA = typeof scoreA === 'number' ? scoreA : parseFloat(String(scoreA)) || -1
          valB = typeof scoreB === 'number' ? scoreB : parseFloat(String(scoreB)) || -1
          break
        }
        case 'compatibility.match_score':
          valA = typeof a.compatibility?.match_score === 'number' ? a.compatibility.match_score : 0
          valB = typeof b.compatibility?.match_score === 'number' ? b.compatibility.match_score : 0
          break
        default:
          valA = (a.company_name || '').toLowerCase()
          valB = (b.company_name || '').toLowerCase()
      }

      if (typeof valA === 'string' && typeof valB === 'string') {
        const cmp = valA.localeCompare(valB)
        return sortDirection === 'asc' ? cmp : -cmp
      } else {
        const cmp = (valA as number) - (valB as number)
        return sortDirection === 'asc' ? cmp : -cmp
      }
    })

    return result
  }, [suppliers, searchQuery, selectedCategory, sortKey, sortDirection])

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDirection('asc')
    }
  }

  const handleCategoryChange = (category: string) => {
    setSelectedCategory(category)
  }

  const renderSortIcon = (key: string) => {
    if (sortKey !== key) return <ArrowUpDown className="w-3 h-3 opacity-30" />
    return sortDirection === 'asc' ? <ChevronUp className="w-3 h-3 text-primary" /> : <ChevronDown className="w-3 h-3 text-primary" />
  }

  const handleClose = () => {
    setIsClosing(true)
    setTimeout(() => {
      onOpenChange(false)
      setIsClosing(false)
    }, 150)
  }

  if (!open) return null

  return createPortal(
    <>
      <div 
        className={cn(
          "fixed inset-0 bg-black/80 backdrop-blur-md z-[100]",
          isClosing ? "animate-out fade-out duration-200" : "animate-in fade-in duration-200"
        )} 
        onClick={handleClose}
      >
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none" />
      </div>
      
      <div className="fixed inset-0 z-[101] flex items-center justify-center p-4 pointer-events-none">
        <div 
          className={cn(
            "relative z-10 w-[1200px] max-w-[95vw] max-h-[90vh] bg-[#0a0a0a]/95 border border-white/10 rounded-sm shadow-[0_0_50px_-10px_rgba(0,0,0,0.8)] flex flex-col pointer-events-auto overflow-hidden ring-1 ring-white/5",
            isClosing ? "animate-out zoom-out-95 duration-200" : "animate-in zoom-in-95 duration-200"
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <header className="px-6 py-5 border-b border-white/10 flex items-center justify-between bg-black/20 shrink-0">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2 text-[10px] text-white/40 uppercase tracking-[0.2em] font-mono">
                <Building2 className="w-3 h-3" />
                <span>Directory Protocol</span>
              </div>
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-bold text-white uppercase tracking-wide font-mono">
                  Supplier Directory
                </h2>
                <div className="px-2 py-0.5 bg-white/5 border border-white/10 rounded-sm text-[10px] font-mono text-white/70">
                  {suppliers.length} ENTRIES
                </div>
              </div>
            </div>
            <button 
              onClick={handleClose}
              className="p-2 hover:bg-white/5 border border-transparent hover:border-white/10 rounded-sm text-white/50 hover:text-white transition-all"
            >
              <X className="w-5 h-5" />
            </button>
          </header>

          {/* Filters */}
          <div className="px-6 py-4 border-b border-white/10 space-y-4 bg-black/20">
            <div className="flex gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-white/40" />
                <input
                  type="text"
                  placeholder="SEARCH BY NAME, CITY, OR COUNTRY..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full h-9 pl-9 pr-4 bg-black/40 border border-white/10 rounded-sm text-xs font-mono text-white placeholder:text-white/30 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all uppercase"
                />
              </div>
              <div className="flex items-center gap-2">
                <Filter className="w-3 h-3 text-white/40" />
                <select
                  value={selectedCategory}
                  onChange={(e) => handleCategoryChange(e.target.value)}
                  className="h-9 px-3 bg-black/40 border border-white/10 rounded-sm text-xs font-mono text-white/80 focus:outline-none focus:border-primary/50 transition-colors cursor-pointer uppercase"
                >
                  <option value="all">All Categories</option>
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.label.toUpperCase()}</option>
                  ))}
                </select>
              </div>
            </div>
            
            {/* Quick Category Pills */}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => handleCategoryChange('all')}
                className={cn(
                  "px-3 py-1.5 rounded-sm text-[10px] font-mono uppercase tracking-wider border transition-all",
                  selectedCategory === 'all'
                    ? "bg-primary/10 border-primary/50 text-primary"
                    : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10 hover:text-white"
                )}
              >
                All
              </button>
              {categories.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => handleCategoryChange(cat.id)}
                  className={cn(
                    "px-3 py-1.5 rounded-sm text-[10px] font-mono uppercase tracking-wider border transition-all flex items-center gap-2",
                    selectedCategory === cat.id
                      ? "bg-white/10 border-white/30 text-white"
                      : "bg-transparent border-transparent text-white/40 hover:bg-white/5 hover:text-white/70"
                  )}
                >
                  <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: cat.color }} />
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto min-h-0 bg-[linear-gradient(to_right,#ffffff02_1px,transparent_1px),linear-gradient(to_bottom,#ffffff02_1px,transparent_1px)] bg-[size:20px_20px]">
            <div className="min-w-full inline-block align-middle">
              <div className="border-b border-white/5">
                <table className="min-w-full divide-y divide-white/5">
                  <thead className="bg-[#0a0a0a]/90 backdrop-blur-md sticky top-0 z-20">
                    <tr>
                      <th 
                        scope="col" 
                        className="px-6 py-3 text-left text-[10px] font-mono uppercase tracking-wider text-white/40 font-normal cursor-pointer hover:text-white transition-colors group select-none"
                        onClick={() => handleSort('company_name')}
                      >
                        <div className="flex items-center gap-2">
                          Company / Location
                          {renderSortIcon('company_name')}
                        </div>
                      </th>
                      <th 
                        scope="col" 
                        className="px-6 py-3 text-left text-[10px] font-mono uppercase tracking-wider text-white/40 font-normal cursor-pointer hover:text-white transition-colors group select-none"
                        onClick={() => handleSort('category')}
                      >
                         <div className="flex items-center gap-2">
                          Category
                          {renderSortIcon('category')}
                        </div>
                      </th>
                      <th 
                        scope="col" 
                        className="px-6 py-3 text-left text-[10px] font-mono uppercase tracking-wider text-white/40 font-normal cursor-pointer hover:text-white transition-colors group select-none"
                        onClick={() => handleSort('quality_ratings.overall_score')}
                      >
                         <div className="flex items-center gap-2">
                          Rating
                          {renderSortIcon('quality_ratings.overall_score')}
                        </div>
                      </th>
                      <th 
                        scope="col" 
                        className="px-6 py-3 text-left text-[10px] font-mono uppercase tracking-wider text-white/40 font-normal cursor-pointer hover:text-white transition-colors group select-none"
                        onClick={() => handleSort('compatibility.match_score')}
                      >
                         <div className="flex items-center gap-2">
                          Status
                          {renderSortIcon('compatibility.match_score')}
                        </div>
                      </th>
                      <th scope="col" className="px-6 py-3 text-right text-[10px] font-mono uppercase tracking-wider text-white/40 font-normal">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 bg-transparent">
                    {displaySuppliers.map((supplier, index) => {
                      const category = categories.find(c => c.id === supplier.category)
                      const isExpanded = expandedSupplierId === supplier.supplier_id
                      const score = typeof supplier.quality_ratings?.overall_score === 'number' 
                        ? supplier.quality_ratings.overall_score 
                        : parseFloat(String(supplier.quality_ratings?.overall_score || '0'))
                      
                      // Use index as key because supplier_ids have duplicates across categories
                      const uniqueKey = `${supplier.supplier_id}-${supplier.category}-${index}`

                      return (
                        <React.Fragment key={uniqueKey}>
                          <tr 
                            className={cn(
                              "hover:bg-white/[0.02] transition-colors cursor-pointer",
                              isExpanded && "bg-white/[0.02]"
                            )}
                            onClick={() => setExpandedSupplierId(isExpanded ? null : supplier.supplier_id)}
                          >
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center">
                                <div className="flex-shrink-0 h-8 w-8 rounded-sm flex items-center justify-center bg-white/5 border border-white/10">
                                  {category?.icon && <category.icon className="h-4 w-4 text-white/60" style={{ color: category.color }} />}
                                </div>
                                <div className="ml-4">
                                  <div className="text-sm font-bold text-white">{supplier.company_name}</div>
                                  <div className="text-xs text-white/40 font-mono">
                                    {supplier.location?.city || 'Unknown'}, {supplier.location?.country || 'Unknown'}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className="px-2 py-1 inline-flex text-[10px] leading-5 font-mono uppercase tracking-wide rounded-sm bg-white/5 text-white/70 border border-white/10">
                                {category?.label}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              {score > 0 ? (
                                <div className="flex items-center gap-1">
                                  <Star className="w-3 h-3 text-primary fill-primary" />
                                  <span className="text-xs font-mono text-white">{score.toFixed(1)}</span>
                                </div>
                              ) : (
                                <span className="text-xs text-white/20 font-mono">N/A</span>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              {supplier.compatibility?.match_score ? (
                                <div className={cn(
                                  "text-[10px] font-mono uppercase tracking-wider",
                                  supplier.compatibility.match_score >= 80 ? "text-emerald-400" :
                                  supplier.compatibility.match_score >= 60 ? "text-yellow-400" :
                                  "text-red-400"
                                )}>
                                  {supplier.compatibility.match_score}% MATCH
                                </div>
                              ) : (
                                <span className="text-[10px] text-white/20 font-mono uppercase">UNRATED</span>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation()
                                  if (onSelectSupplier) {
                                    onSelectSupplier(supplier)
                                    onOpenChange(false)
                                  } else {
                                    setExpandedSupplierId(isExpanded ? null : supplier.supplier_id)
                                  }
                                }}
                                className="text-primary hover:text-primary/80 text-[10px] font-mono uppercase tracking-wider border border-primary/30 hover:border-primary/60 px-3 py-1 rounded-sm transition-all"
                              >
                                {onSelectSupplier ? 'Locate' : 'Details'}
                              </button>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr className="bg-white/[0.01]">
                              <td colSpan={5} className="px-6 py-4">
                                <div className="grid grid-cols-3 gap-8 p-4 border border-white/10 rounded-sm bg-black/20">
                                  {/* Col 1: Contact & Location */}
                                  <div className="space-y-4">
                                    <h4 className="text-[10px] font-mono uppercase text-white/40 tracking-widest border-b border-white/10 pb-2">Contact Info</h4>
                                    <div className="space-y-2 text-xs font-mono text-white/70">
                                      {supplier.contact.primary_email && (
                                        <div className="flex items-center gap-2">
                                          <Mail className="w-3 h-3 text-white/40" />
                                          <a href={`mailto:${supplier.contact.primary_email}`} className="hover:text-primary transition-colors">{supplier.contact.primary_email}</a>
                                        </div>
                                      )}
                                      {supplier.contact.primary_phone && (
                                        <div className="flex items-center gap-2">
                                          <Phone className="w-3 h-3 text-white/40" />
                                          <a href={`tel:${supplier.contact.primary_phone}`} className="hover:text-primary transition-colors">{supplier.contact.primary_phone}</a>
                                        </div>
                                      )}
                                      {supplier.contact.website && (
                                        <div className="flex items-center gap-2">
                                          <Globe className="w-3 h-3 text-white/40" />
                                          <a href={supplier.contact.website} target="_blank" rel="noreferrer" className="hover:text-primary truncate transition-colors flex items-center gap-1">
                                            WEBSITE <ExternalLink className="w-2 h-2" />
                                          </a>
                                        </div>
                                      )}
                                    </div>
                                  </div>

                                  {/* Col 2: Capabilities */}
                                  <div className="space-y-4">
                                    <h4 className="text-[10px] font-mono uppercase text-white/40 tracking-widest border-b border-white/10 pb-2">Capabilities</h4>
                                    <div className="space-y-2 text-xs font-mono">
                                      {supplier.capabilities.experience_years && (
                                        <div className="flex justify-between">
                                          <span className="text-white/50">Experience</span>
                                          <span className="text-white">{supplier.capabilities.experience_years} Years</span>
                                        </div>
                                      )}
                                      {supplier.capabilities.employee_count && (
                                        <div className="flex justify-between">
                                          <span className="text-white/50">Employees</span>
                                          <span className="text-white">{supplier.capabilities.employee_count.toLocaleString()}</span>
                                        </div>
                                      )}
                                      {supplier.capabilities.annual_capacity && (
                                        <div className="flex justify-between">
                                          <span className="text-white/50">Capacity</span>
                                          <span className="text-white">{supplier.capabilities.annual_capacity}</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>

                                  {/* Col 3: Logistics */}
                                  <div className="space-y-4">
                                    <h4 className="text-[10px] font-mono uppercase text-white/40 tracking-widest border-b border-white/10 pb-2">Logistics</h4>
                                    <div className="space-y-2 text-xs font-mono">
                                      {supplier.logistics?.estimated_lead_time_days && (
                                        <div className="flex justify-between">
                                          <span className="text-white/50">Lead Time</span>
                                          <span className="text-white">~{supplier.logistics.estimated_lead_time_days} Days</span>
                                        </div>
                                      )}
                                      {supplier.pricing?.payment_terms && (
                                        <div className="flex justify-between">
                                          <span className="text-white/50">Payment</span>
                                          <span className="text-white">{supplier.pricing.payment_terms}</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {displaySuppliers.length === 0 && (
                <div className="flex flex-col items-center justify-center h-64 text-white/40">
                  <Search className="w-12 h-12 mb-4 opacity-20" />
                  <p className="text-xs font-mono uppercase tracking-wider">No suppliers found matching your criteria</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body
  )
}
