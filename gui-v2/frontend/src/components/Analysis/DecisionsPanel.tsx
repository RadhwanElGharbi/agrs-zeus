'use client'

import { useState, useCallback } from 'react'
import { cn } from '@/lib/utils'
import {
  X,
  ChevronDown,
  ChevronUp,
  Database,
  Mountain,
  Leaf,
  MapPin,
  DollarSign,
  AlertTriangle,
  Train,
  Loader2,
  Zap,
  Droplets,
  Route,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { SegmentDecisions } from '@/lib/api/agenticClient'

interface DecisionsPanelProps {
  /** Decisions data to display */
  decisions: SegmentDecisions | null
  /** Whether decisions are loading */
  loading?: boolean
  /** Error message if fetching failed */
  error?: string | null
  /** Callback when panel is closed */
  onClose: () => void
  /** Additional CSS classes */
  className?: string
}

export function DecisionsPanel({
  decisions,
  loading = false,
  error = null,
  onClose,
  className,
}: DecisionsPanelProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['terrain', 'crossings', 'cost'])
  )

  const toggleSection = useCallback((section: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev)
      if (next.has(section)) {
        next.delete(section)
      } else {
        next.add(section)
      }
      return next
    })
  }, [])

  // Loading state
  if (loading) {
    return (
      <div className={cn('bg-[#0a0a0a]/95 backdrop-blur-xl rounded-sm shadow-2xl border border-white/10', className)}>
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h3 className="font-semibold text-lg text-white">Validated Data</h3>
          <Button variant="ghost" size="sm" onClick={onClose} className="text-white/60 hover:text-white hover:bg-white/10">
            <X className="w-4 h-4" />
          </Button>
        </div>
        <div className="p-8 flex flex-col items-center justify-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
          <p className="text-sm text-white/60">Loading validated geospatial data...</p>
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className={cn('bg-[#0a0a0a]/95 backdrop-blur-xl rounded-sm shadow-2xl border border-white/10', className)}>
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h3 className="font-semibold text-lg text-white">Validated Data</h3>
          <Button variant="ghost" size="sm" onClick={onClose} className="text-white/60 hover:text-white hover:bg-white/10">
            <X className="w-4 h-4" />
          </Button>
        </div>
        <div className="p-6 flex flex-col items-center gap-4">
          <AlertTriangle className="w-12 h-12 text-red-400" />
          <p className="text-sm text-red-400 text-center">{error}</p>
        </div>
      </div>
    )
  }

  // No data
  if (!decisions || !decisions.decisions_available) {
    return (
      <div className={cn('bg-[#0a0a0a]/95 backdrop-blur-xl rounded-sm shadow-2xl border border-white/10', className)}>
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h3 className="font-semibold text-lg text-white">Validated Data</h3>
          <Button variant="ghost" size="sm" onClick={onClose} className="text-white/60 hover:text-white hover:bg-white/10">
            <X className="w-4 h-4" />
          </Button>
        </div>
        <div className="p-6 text-center text-white/50">
          <Database className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>No validated decisions data available for this segment.</p>
          <p className="text-xs mt-2 text-white/40">
            Run the decisions generator to create validated geospatial data.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className={cn('bg-[#0a0a0a]/95 backdrop-blur-xl rounded-sm shadow-2xl border border-white/10 overflow-hidden', className)}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/10 bg-black/40">
        <div className="flex items-center gap-3">
          <Database className="w-5 h-5 text-cyan-400" />
          <h3 className="font-semibold text-lg text-white">Segment {decisions.segment_id}</h3>
          <span className="px-2 py-0.5 bg-cyan-500/20 text-cyan-400 text-xs rounded-sm border border-cyan-500/30">
            Validated
          </span>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} className="text-white/60 hover:text-white hover:bg-white/10">
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Content */}
      <div className="overflow-y-auto max-h-[calc(100vh-200px)]">
        {/* Terrain & Elevation */}
        <CollapsibleSection
          title="Terrain & Elevation"
          icon={<Mountain className="w-4 h-4 text-amber-400" />}
          expanded={expandedSections.has('terrain')}
          onToggle={() => toggleSection('terrain')}
        >
          <div className="grid grid-cols-2 gap-3">
            {decisions.elevation && (
              <>
                <MetricCard label="Start Elevation" value={`${decisions.elevation.start_m?.toFixed(1) || 'N/A'} m`} />
                <MetricCard label="End Elevation" value={`${decisions.elevation.end_m?.toFixed(1) || 'N/A'} m`} />
                <MetricCard label="Elevation Change" value={`${decisions.elevation.delta_m?.toFixed(1) || 'N/A'} m`} />
                <MetricCard label="Slope" value={`${decisions.elevation.slope_percent?.toFixed(1) || 'N/A'}%`} />
              </>
            )}
            <MetricCard label="Terrain Class" value={decisions.terrain_class || 'N/A'} />
            <MetricCard label="Length" value={`${((decisions.length_m || 0) / 1000).toFixed(2)} km`} />
          </div>
        </CollapsibleSection>

        {/* Land Cover & Soil */}
        <CollapsibleSection
          title="Land Cover & Soil"
          icon={<Leaf className="w-4 h-4 text-green-400" />}
          expanded={expandedSections.has('landcover')}
          onToggle={() => toggleSection('landcover')}
        >
          <div className="grid grid-cols-2 gap-3">
            <MetricCard
              label="Land Cover"
              value={getLandCoverDisplay(decisions.land_cover)}
              className="col-span-2"
            />
            <MetricCard label="Soil Type" value={getSoilTypeDisplay(decisions.soil_type)} />
            <MetricCard label="Seismic Zone" value={getSeismicDisplay(decisions.seismic_zone)} />
          </div>
        </CollapsibleSection>

        {/* Infrastructure Crossings */}
        {decisions.crossings && decisions.crossings.length > 0 && (
          <CollapsibleSection
            title={`Crossings (${decisions.crossings.length})`}
            icon={<Route className="w-4 h-4 text-blue-400" />}
            expanded={expandedSections.has('crossings')}
            onToggle={() => toggleSection('crossings')}
          >
            <div className="space-y-2">
              {decisions.crossings.map((crossing, idx) => (
                <CrossingCard key={idx} crossing={crossing} />
              ))}
            </div>
          </CollapsibleSection>
        )}

        {/* Construction Cost */}
        {decisions.construction_cost && (
          <CollapsibleSection
            title="Construction Cost"
            icon={<DollarSign className="w-4 h-4 text-emerald-400" />}
            expanded={expandedSections.has('cost')}
            onToggle={() => toggleSection('cost')}
          >
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                {decisions.construction_cost.base_cost !== undefined && (
                  <MetricCard label="Base Cost" value={formatCurrency(decisions.construction_cost.base_cost)} />
                )}
                {decisions.construction_cost.terrain_cost !== undefined && (
                  <MetricCard label="Terrain Cost" value={formatCurrency(decisions.construction_cost.terrain_cost)} />
                )}
                {decisions.construction_cost.crossing_cost !== undefined && (
                  <MetricCard label="Crossing Cost" value={formatCurrency(decisions.construction_cost.crossing_cost)} />
                )}
                {decisions.construction_cost.cost_per_m !== undefined && (
                  <MetricCard label="Cost/m" value={formatCurrency(decisions.construction_cost.cost_per_m)} />
                )}
              </div>
              {decisions.construction_cost.total !== undefined && (
                <MetricCard
                  label="Total Segment Cost"
                  value={formatCurrency(decisions.construction_cost.total)}
                  className="col-span-2"
                  highlight
                />
              )}
            </div>
          </CollapsibleSection>
        )}

        {/* Decision Rationale */}
        {decisions.decision_rationale && (
          <CollapsibleSection
            title="Decision Rationale"
            icon={<MapPin className="w-4 h-4 text-purple-400" />}
            expanded={expandedSections.has('rationale')}
            onToggle={() => toggleSection('rationale')}
          >
            <div className="space-y-3">
              {decisions.decision_rationale.construction_method && (
                <MetricCard
                  label="Construction Method"
                  value={decisions.decision_rationale.construction_method}
                  className="col-span-2"
                />
              )}
              {decisions.decision_rationale.reasoning && decisions.decision_rationale.reasoning.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-white/50">Reasoning:</p>
                  <ul className="space-y-1">
                    {decisions.decision_rationale.reasoning.map((reason, idx) => (
                      <li key={idx} className="text-sm text-white/70 flex items-start gap-2">
                        <span className="text-purple-400">•</span>
                        <span>{reason}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </CollapsibleSection>
        )}

        {/* Coordinates */}
        {(decisions.start_coord || decisions.end_coord) && (
          <CollapsibleSection
            title="Coordinates"
            icon={<MapPin className="w-4 h-4 text-gray-400" />}
            expanded={expandedSections.has('coords')}
            onToggle={() => toggleSection('coords')}
          >
            <div className="grid grid-cols-2 gap-3">
              {decisions.start_coord && (
                <MetricCard
                  label="Start"
                  value={`${decisions.start_coord[0].toFixed(2)}, ${decisions.start_coord[1].toFixed(2)}`}
                />
              )}
              {decisions.end_coord && (
                <MetricCard
                  label="End"
                  value={`${decisions.end_coord[0].toFixed(2)}, ${decisions.end_coord[1].toFixed(2)}`}
                />
              )}
            </div>
          </CollapsibleSection>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// Sub-components
// ============================================================================

interface CollapsibleSectionProps {
  title: string
  icon?: React.ReactNode
  expanded: boolean
  onToggle: () => void
  children: React.ReactNode
}

function CollapsibleSection({
  title,
  icon,
  expanded,
  onToggle,
  children,
}: CollapsibleSectionProps) {
  return (
    <div className="border-b border-white/10">
      <button
        className="w-full flex items-center justify-between p-3 hover:bg-white/5 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center gap-2">
          {icon}
          <span className="font-medium text-sm text-white">{title}</span>
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-white/40" />
        ) : (
          <ChevronDown className="w-4 h-4 text-white/40" />
        )}
      </button>
      {expanded && <div className="px-4 pb-4">{children}</div>}
    </div>
  )
}

interface MetricCardProps {
  label: string
  value: string
  className?: string
  highlight?: boolean
}

function MetricCard({ label, value, className, highlight }: MetricCardProps) {
  return (
    <div
      className={cn(
        'p-2 rounded-sm border',
        highlight ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-white/5 border-white/10',
        className
      )}
    >
      <p className="text-xs text-white/50">{label}</p>
      <p className={cn('text-sm font-medium', highlight ? 'text-emerald-300' : 'text-white')}>
        {value || 'N/A'}
      </p>
    </div>
  )
}

interface CrossingCardProps {
  crossing: {
    type: string
    name?: string
    distance_along_m?: number
    crossing_method?: string
    cost_estimate?: number
    regulatory_authority?: string
    permit_requirements?: string
  }
}

function CrossingCard({ crossing }: CrossingCardProps) {
  const getIcon = () => {
    switch (crossing.type.toLowerCase()) {
      case 'railway':
        return <Train className="w-4 h-4 text-orange-400" />
      case 'powerline':
        return <Zap className="w-4 h-4 text-yellow-400" />
      case 'waterway':
      case 'river':
      case 'stream':
        return <Droplets className="w-4 h-4 text-blue-400" />
      default:
        return <Route className="w-4 h-4 text-gray-400" />
    }
  }

  const getMethodBadgeColor = () => {
    switch (crossing.crossing_method?.toLowerCase()) {
      case 'hdd':
        return 'bg-purple-500/20 text-purple-400 border-purple-500/30'
      case 'open_cut':
      case 'open cut':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30'
      default:
        return 'bg-gray-500/20 text-gray-400 border-gray-500/30'
    }
  }

  return (
    <div className="p-3 bg-white/5 rounded-sm border border-white/10">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          {getIcon()}
          <div>
            <span className="font-medium text-sm text-white capitalize">{crossing.type}</span>
            {crossing.name && (
              <p className="text-xs text-white/60">{crossing.name}</p>
            )}
          </div>
        </div>
        {crossing.crossing_method && (
          <span className={cn('px-2 py-0.5 text-xs rounded-sm border', getMethodBadgeColor())}>
            {crossing.crossing_method}
          </span>
        )}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
        {crossing.distance_along_m !== undefined && (
          <div>
            <span className="text-white/40">Distance: </span>
            <span className="text-white/80">{crossing.distance_along_m.toFixed(0)}m</span>
          </div>
        )}
        {crossing.cost_estimate !== undefined && (
          <div>
            <span className="text-white/40">Cost: </span>
            <span className="text-emerald-400">{formatCurrency(crossing.cost_estimate)}</span>
          </div>
        )}
        {crossing.regulatory_authority && (
          <div className="col-span-2">
            <span className="text-white/40">Authority: </span>
            <span className="text-white/80">{crossing.regulatory_authority}</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// Utilities
// ============================================================================

function formatCurrency(value: number): string {
  if (value >= 1000000) {
    return `€${(value / 1000000).toFixed(2)}M`
  } else if (value >= 1000) {
    return `€${(value / 1000).toFixed(1)}K`
  }
  return `€${value.toFixed(0)}`
}

// Handle land_cover which can be string or object {class_code, class_name, cost_factor, note}
function getLandCoverDisplay(landCover: unknown): string {
  if (!landCover) return 'N/A'
  if (typeof landCover === 'string') return landCover
  if (typeof landCover === 'object' && landCover !== null) {
    const lc = landCover as { class_name?: string; class_code?: number; note?: string }
    if (lc.class_name) {
      return lc.note ? `${lc.class_name} (${lc.note})` : lc.class_name
    }
    if (lc.class_code !== undefined) return `Class ${lc.class_code}`
  }
  return 'N/A'
}

// Handle soil_type which can be string or object {type, excavation, stability, hdd_suitability}
function getSoilTypeDisplay(soilType: unknown): string {
  if (!soilType) return 'N/A'
  if (typeof soilType === 'string') return soilType
  if (typeof soilType === 'object' && soilType !== null) {
    const soil = soilType as { type?: string; excavation?: string; stability?: string }
    if (soil.type) {
      const parts = [soil.type.replace(/_/g, ' ')]
      if (soil.stability) parts.push(`(${soil.stability})`)
      return parts.join(' ')
    }
  }
  return 'N/A'
}

// Handle seismic_zone which can be string or object {zone, pga_g, description}
function getSeismicDisplay(seismic: unknown): string {
  if (!seismic) return 'N/A'
  if (typeof seismic === 'string') return seismic
  if (typeof seismic === 'object' && seismic !== null) {
    const seis = seismic as { zone?: string; description?: string; pga_g?: number }
    if (seis.zone) {
      const parts = [seis.zone]
      if (seis.description) parts.push(`- ${seis.description}`)
      return parts.join(' ')
    }
  }
  return 'N/A'
}

export default DecisionsPanel
