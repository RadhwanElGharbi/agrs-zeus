'use client'

import { useState, useCallback } from 'react'
import { cn } from '@/lib/utils'
import {
  X,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Lightbulb,
  Loader2,
  Mountain,
  Leaf,
  Wrench,
  DollarSign,
  FileWarning,
  RefreshCw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AssessmentBadge, ConfidenceBadge } from './AssessmentBadge'
import type { ExplainResponse } from '@/lib/api/agenticClient'
import { parseFlag } from '@/lib/api/agenticClient'

interface ExplanationPanelProps {
  /** Analysis result to display */
  result: ExplainResponse | null
  /** Whether analysis is currently loading */
  loading?: boolean
  /** Error message if analysis failed */
  error?: string | null
  /** Callback when panel is closed */
  onClose: () => void
  /** Callback to retry analysis */
  onRetry?: () => void
  /** Additional CSS classes */
  className?: string
}

export function ExplanationPanel({
  result,
  loading = false,
  error = null,
  onClose,
  onRetry,
  className,
}: ExplanationPanelProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['summary', 'metrics'])
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
          <h3 className="font-semibold text-lg text-white">Segment Analysis</h3>
          <Button variant="ghost" size="sm" onClick={onClose} className="text-white/60 hover:text-white hover:bg-white/10">
            <X className="w-4 h-4" />
          </Button>
        </div>
        <div className="p-8 flex flex-col items-center justify-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
          <p className="text-sm text-white/60">
            Running AI analysis...
          </p>
          <p className="text-xs text-white/40 font-mono">
            This may take 10-30 seconds
          </p>
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className={cn('bg-[#0a0a0a]/95 backdrop-blur-xl rounded-sm shadow-2xl border border-white/10', className)}>
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h3 className="font-semibold text-lg text-white">Segment Analysis</h3>
          <Button variant="ghost" size="sm" onClick={onClose} className="text-white/60 hover:text-white hover:bg-white/10">
            <X className="w-4 h-4" />
          </Button>
        </div>
        <div className="p-6 flex flex-col items-center gap-4">
          <XCircle className="w-12 h-12 text-red-400" />
          <p className="text-sm text-red-400 text-center">{error}</p>
          {onRetry && (
            <Button variant="outline" size="sm" onClick={onRetry} className="border-white/20 text-white hover:bg-white/10">
              <RefreshCw className="w-4 h-4 mr-2" />
              Retry Analysis
            </Button>
          )}
        </div>
      </div>
    )
  }

  // No result
  if (!result) {
    return (
      <div className={cn('bg-[#0a0a0a]/95 backdrop-blur-xl rounded-sm shadow-2xl border border-white/10', className)}>
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h3 className="font-semibold text-lg text-white">Segment Analysis</h3>
          <Button variant="ghost" size="sm" onClick={onClose} className="text-white/60 hover:text-white hover:bg-white/10">
            <X className="w-4 h-4" />
          </Button>
        </div>
        <div className="p-6 text-center text-white/50">
          <p>Select a segment and click &quot;Analyze&quot; to view analysis results.</p>
        </div>
      </div>
    )
  }

  return (
    <div className={cn('bg-[#0a0a0a]/95 backdrop-blur-xl rounded-sm shadow-2xl border border-white/10 overflow-hidden', className)}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/10 bg-black/40">
        <div className="flex items-center gap-3">
          <h3 className="font-semibold text-lg text-white">Segment {result.segment_id}</h3>
          <AssessmentBadge
            assessment={result.overall_assessment}
            confidence={result.confidence}
          />
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} className="text-white/60 hover:text-white hover:bg-white/10">
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Content */}
      <div className="overflow-y-auto max-h-[calc(100vh-200px)]">
        {/* Executive Summary */}
        <CollapsibleSection
          title="Executive Summary"
          icon={<FileWarning className="w-4 h-4 text-purple-400" />}
          expanded={expandedSections.has('summary')}
          onToggle={() => toggleSection('summary')}
        >
          <p className="text-sm text-white/80 leading-relaxed">
            {result.executive_summary}
          </p>
        </CollapsibleSection>

        {/* Flags (if any) */}
        {result.flags.length > 0 && (
          <CollapsibleSection
            title={`Flags (${result.flags.length})`}
            icon={<AlertTriangle className="w-4 h-4 text-yellow-400" />}
            expanded={expandedSections.has('flags')}
            onToggle={() => toggleSection('flags')}
            defaultExpanded
          >
            <div className="space-y-2">
              {result.flags.map((flag, idx) => {
                const { code, description } = parseFlag(flag)
                return (
                  <div
                    key={idx}
                    className="flex items-start gap-2 p-2 bg-yellow-500/10 rounded-sm border border-yellow-500/30"
                  >
                    <AlertTriangle className="w-4 h-4 text-yellow-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <span className="font-mono text-xs text-yellow-400 bg-yellow-500/20 px-1 rounded">
                        {code}
                      </span>
                      {description && (
                        <p className="text-sm text-yellow-200/80 mt-1">{description}</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </CollapsibleSection>
        )}

        {/* Key Metrics */}
        <CollapsibleSection
          title="Key Metrics"
          icon={<Mountain className="w-4 h-4 text-blue-400" />}
          expanded={expandedSections.has('metrics')}
          onToggle={() => toggleSection('metrics')}
        >
          <div className="grid grid-cols-2 gap-3">
            <MetricCard label="Length" value={`${result.key_metrics.length_km.toFixed(2)} km`} />
            <MetricCard label="Avg Slope" value={`${result.key_metrics.avg_slope.toFixed(1)}%`} />
            <MetricCard label="Terrain" value={result.key_metrics.terrain} />
            <MetricCard label="Land Use" value={result.key_metrics.land_use} />
            <MetricCard
              label="Construction"
              value={result.key_metrics.construction_method}
              className="col-span-2"
            />
            <MetricCard
              label="Est. Cost"
              value={result.key_metrics.estimated_cost}
              className="col-span-2"
              highlight
            />
          </div>
        </CollapsibleSection>

        {/* Specialist Summaries */}
        <CollapsibleSection
          title="Specialist Analysis"
          icon={<Wrench className="w-4 h-4 text-cyan-400" />}
          expanded={expandedSections.has('specialists')}
          onToggle={() => toggleSection('specialists')}
        >
          <div className="space-y-3">
            <SpecialistCard
              icon={<Mountain className="w-4 h-4 text-amber-400" />}
              title="Geotechnical"
              summary={result.specialist_summaries.geotechnical}
            />
            <SpecialistCard
              icon={<Leaf className="w-4 h-4 text-green-400" />}
              title="Environmental"
              summary={result.specialist_summaries.environmental}
            />
            <SpecialistCard
              icon={<Wrench className="w-4 h-4 text-blue-400" />}
              title="Engineering"
              summary={result.specialist_summaries.engineering}
            />
            <SpecialistCard
              icon={<DollarSign className="w-4 h-4 text-emerald-400" />}
              title="Cost"
              summary={result.specialist_summaries.cost}
            />
          </div>
        </CollapsibleSection>

        {/* SAIPEM Compliance */}
        <CollapsibleSection
          title="SAIPEM Compliance"
          icon={<CheckCircle2 className="w-4 h-4 text-green-400" />}
          expanded={expandedSections.has('compliance')}
          onToggle={() => toggleSection('compliance')}
        >
          <div className="space-y-3">
            {result.saipem_compliance.criteria_met.length > 0 && (
              <div>
                <p className="text-xs font-medium text-green-400 mb-1">Criteria Met:</p>
                <div className="flex flex-wrap gap-1">
                  {result.saipem_compliance.criteria_met.map((c, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-0.5 bg-green-500/20 text-green-400 text-xs rounded-sm border border-green-500/30"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {result.saipem_compliance.criteria_violated.length > 0 && (
              <div>
                <p className="text-xs font-medium text-red-400 mb-1">Criteria Violated:</p>
                <div className="flex flex-wrap gap-1">
                  {result.saipem_compliance.criteria_violated.map((c, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-0.5 bg-red-500/20 text-red-400 text-xs rounded-sm border border-red-500/30"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <p className="text-sm text-white/60">
              {result.saipem_compliance.compliance_notes}
            </p>
          </div>
        </CollapsibleSection>

        {/* Recommendations */}
        {result.recommendations.length > 0 && (
          <CollapsibleSection
            title="Recommendations"
            icon={<Lightbulb className="w-4 h-4 text-yellow-400" />}
            expanded={expandedSections.has('recommendations')}
            onToggle={() => toggleSection('recommendations')}
          >
            <ul className="space-y-2">
              {result.recommendations.map((rec, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm">
                  <span className="text-purple-400 font-bold">{idx + 1}.</span>
                  <span className="text-white/70">{rec}</span>
                </li>
              ))}
            </ul>
          </CollapsibleSection>
        )}

        {/* Conflicts (if any) */}
        {result.conflicts && result.conflicts.length > 0 && (
          <CollapsibleSection
            title="Conflicts"
            icon={<AlertTriangle className="w-4 h-4 text-orange-400" />}
            expanded={expandedSections.has('conflicts')}
            onToggle={() => toggleSection('conflicts')}
          >
            <ul className="space-y-2">
              {result.conflicts.map((conflict, idx) => (
                <li
                  key={idx}
                  className="text-sm text-orange-300 bg-orange-500/10 p-2 rounded-sm border border-orange-500/30"
                >
                  {conflict}
                </li>
              ))}
            </ul>
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
  defaultExpanded?: boolean
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
        highlight ? 'bg-purple-500/10 border-purple-500/30' : 'bg-white/5 border-white/10',
        className
      )}
    >
      <p className="text-xs text-white/50">{label}</p>
      <p className={cn('text-sm font-medium', highlight ? 'text-purple-300' : 'text-white')}>
        {value || 'N/A'}
      </p>
    </div>
  )
}

interface SpecialistCardProps {
  icon: React.ReactNode
  title: string
  summary: string
}

function SpecialistCard({ icon, title, summary }: SpecialistCardProps) {
  return (
    <div className="p-3 bg-white/5 rounded-sm border border-white/10">
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="font-medium text-sm text-white">{title}</span>
      </div>
      <p className="text-sm text-white/60">{summary}</p>
    </div>
  )
}

export default ExplanationPanel
