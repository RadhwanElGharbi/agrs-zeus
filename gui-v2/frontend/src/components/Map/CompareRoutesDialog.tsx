'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X, Loader2, TrendingUp, TrendingDown, Minus, Mountain, TreePine, AlertTriangle, Route as RouteIcon, Brain, Bot, Sparkles, CheckCircle2, XCircle, Cpu, Layers, GitCompare, DollarSign, Ruler } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useProject } from '@/lib/context/ProjectContext'
import { getAgenticRoute, listAgenticSegments } from '@/lib/api/agenticClient'
import { fetchPIRLRouteMetadata, fetchPIRLRoute, RouteDetailedMetadata } from '@/lib/api/dataClient'

interface RouteComparisonData {
  routeId: string
  totalLength: number
  segmentCount: number
  baseCost: number
  terrainCost: number
  landcoverCost: number
  crossingCost: number
  totalCost: number
  costPerKm: number
  avgSlope: number
  maxSlope: number
  terrainBreakdown: Record<string, { distance: number; cost: number }>
  crossings: {
    road: number
    railway: number
    powerline: number
    waterway: number
  }
  detailedMetadata?: RouteDetailedMetadata | null
  hasDetailedMetadata: boolean
}

interface CompareRoutesDialogProps {
  isOpen: boolean
  onClose: () => void
  selectedRouteIds: string[]
}

const FALLBACK_COST_MATRIX = {
  base_cost_per_m: 800,
  terrain_multipliers: {
    flat: 1.0,
    rolling: 1.3,
    hilly: 1.8,
    mountainous: 3.0,
    steep: 100.0,
  },
  crossing_costs: {
    road: 80000,
    railway: 1200000,
    powerline: 150000,
    waterway: 150000,
  },
}

const getComplianceStatus = (metadata: RouteDetailedMetadata | null | undefined) => {
  if (!metadata?.constraint_compliance) {
    return { overall: null, slope: null, built_up: null, water: null }
  }
  const cc = metadata.constraint_compliance
  return {
    overall: cc.overall_compliant,
    slope: cc.slope?.compliant ?? null,
    built_up: cc.built_up?.compliant ?? null,
    water: cc.water?.compliant ?? null,
    slopeViolations: cc.slope?.total_violation_length_m ?? 0,
    builtUpViolations: cc.built_up?.total_violation_length_m ?? 0,
    waterViolations: cc.water?.total_violation_length_m ?? 0,
    maxSlopeFound: cc.slope?.max_found ?? null,
    maxAllowedSlope: cc.slope?.max_allowed ?? null,
  }
}

export function CompareRoutesDialog({ isOpen, onClose, selectedRouteIds }: CompareRoutesDialogProps) {
  const { currentProject } = useProject()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [comparisonData, setComparisonData] = useState<RouteComparisonData[]>([])
  const [mounted, setMounted] = useState(false)
  const [isClosing, setIsClosing] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (isOpen && selectedRouteIds.length >= 2 && currentProject) {
      setIsClosing(false)
      fetchComparisonData()
    }
  }, [isOpen, selectedRouteIds, currentProject])

  const handleClose = useCallback(() => {
    setIsClosing(true)
    setTimeout(() => {
      onClose()
    }, 150)
  }, [onClose])

  const fetchComparisonData = async () => {
    if (!currentProject) {
      setError('No project loaded')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const data: RouteComparisonData[] = []

      for (const routeId of selectedRouteIds) {
        let routeDetail = await getAgenticRoute(routeId, currentProject)
        let segments: any[] = []
        let routeGeojson: any = null

        if (routeDetail) {
          segments = await listAgenticSegments(routeId, 1000, 0, currentProject)
        } else {
          try {
            routeGeojson = await fetchPIRLRoute(currentProject, routeId)
            const features = routeGeojson?.features || []
            const metadata = routeGeojson?.metadata || {}
            routeDetail = {
              route_id: routeId,
              segment_count: features.length,
              metadata: metadata,
              bounds: null
            }
            segments = features.map((f: any, idx: number) => ({
              segment_id: f.properties?.segment_id || String(idx),
              length_m: f.properties?.length_m || 0,
              ...f.properties
            }))
          } catch (pirlErr) {
            throw new Error(`Failed to fetch route ${routeId}`)
          }
        }

        let detailedMetadata: RouteDetailedMetadata | null = null
        try {
          const routeFileName = routeId.endsWith('.geojson') ? routeId : `${routeId}.geojson`
          detailedMetadata = await fetchPIRLRouteMetadata(currentProject, routeFileName)
        } catch (metaErr) {
          console.log(`No detailed metadata for ${routeId}:`, metaErr)
        }

        const metadata = routeDetail.metadata as Record<string, any> || {}
        const segmentsLength = segments.reduce((sum: number, s: any) => sum + (s.length_m || 0), 0)

        let totalLength: number
        let baseCost: number
        let terrainCost: number
        let landcoverCost: number
        let crossingCost: number
        let totalCost: number
        let costPerKm: number
        let avgSlope: number
        let maxSlope: number
        let crossingsData: { road: number; railway: number; powerline: number; waterway: number }

        if (detailedMetadata?.cost_breakdown) {
          const cb = detailedMetadata.cost_breakdown
          totalLength = detailedMetadata.route_info?.length_m || segmentsLength || metadata.total_length_m || 0
          baseCost = cb.base_construction?.cost || 0
          terrainCost = cb.trenching?.cost || 0
          landcoverCost = cb.landcover?.cost || 0
          crossingCost = cb.crossings?.cost || 0
          totalCost = cb.total || 0
          costPerKm = cb.cost_per_km || (totalLength > 0 ? totalCost / (totalLength / 1000) : 0)

          const ts = detailedMetadata.terrain_statistics
          avgSlope = ts?.slope?.mean || metadata.avg_slope || 0
          maxSlope = ts?.slope?.max || metadata.max_slope || 0

          const ic = detailedMetadata.infrastructure_crossings
          crossingsData = {
            road: ic?.roads?.total || 0,
            railway: ic?.railways?.total || 0,
            powerline: ic?.powerlines?.total || 0,
            waterway: ic?.waterways?.total || 0,
          }
        } else {
          totalLength = segmentsLength || metadata.total_length_m || 0
          baseCost = totalLength * FALLBACK_COST_MATRIX.base_cost_per_m
          terrainCost = baseCost * 0.3
          landcoverCost = totalLength * 1.5
          const metaCrossings = metadata.crossings || {}
          crossingCost = (metaCrossings.road || 0) * FALLBACK_COST_MATRIX.crossing_costs.road +
                              (metaCrossings.railway || 0) * FALLBACK_COST_MATRIX.crossing_costs.railway +
                              (metaCrossings.powerline || 0) * FALLBACK_COST_MATRIX.crossing_costs.powerline +
                              (metaCrossings.waterway || 0) * FALLBACK_COST_MATRIX.crossing_costs.waterway
          totalCost = baseCost + terrainCost + landcoverCost + crossingCost
          costPerKm = totalLength > 0 ? totalCost / (totalLength / 1000) : 0
          avgSlope = metadata.avg_slope || 0
          maxSlope = metadata.max_slope || 0
          crossingsData = metaCrossings.road !== undefined ? metaCrossings : { road: 0, railway: 0, powerline: 0, waterway: 0 }
        }

        const segmentCount = routeDetail.segment_count || segments.length

        data.push({
          routeId,
          totalLength,
          segmentCount,
          baseCost,
          terrainCost,
          landcoverCost,
          crossingCost,
          totalCost,
          costPerKm,
          avgSlope,
          maxSlope,
          terrainBreakdown: metadata.terrain_breakdown || {},
          crossings: crossingsData,
          detailedMetadata,
          hasDetailedMetadata: !!detailedMetadata,
        })
      }

      setComparisonData(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load comparison data')
    } finally {
      setLoading(false)
    }
  }

  const formatCurrency = (value: number) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`
    return `$${value.toFixed(0)}`
  }

  const formatDistance = (meters: number) => {
    return `${(meters / 1000).toFixed(2)} km`
  }

  const getComparisonIndicator = (value: number, values: number[], lowerIsBetter: boolean = true) => {
    const min = Math.min(...values)
    const max = Math.max(...values)
    if (min === max) return { icon: Minus, color: 'text-white/50' }

    if (lowerIsBetter) {
      if (value === min) return { icon: TrendingDown, color: 'text-emerald-400' }
      if (value === max) return { icon: TrendingUp, color: 'text-red-400' }
    } else {
      if (value === max) return { icon: TrendingUp, color: 'text-emerald-400' }
      if (value === min) return { icon: TrendingDown, color: 'text-red-400' }
    }
    return { icon: Minus, color: 'text-amber-400' }
  }

  const formatRouteName = (routeId: string) => {
    let name = routeId
    if (currentProject) {
      const prefix = `${currentProject}_`
      if (name.startsWith(prefix)) {
        name = name.substring(prefix.length)
      }
    }
    return name.replace(/_/g, ' ').replace('.geojson', '')
  }

  if (!isOpen || !mounted) return null

  const content = (
    <div
      className={cn(
        "fixed inset-0 z-[100] flex items-center justify-center p-4 transition-all duration-150",
        isClosing ? "opacity-0" : "opacity-100"
      )}
      onClick={handleClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />

      {/* Dialog */}
      <div
        className={cn(
          "relative w-full max-w-[950px] max-h-[90vh] bg-[#0c0c0c] border border-white/10 rounded-sm shadow-2xl overflow-hidden font-mono transition-all duration-150 flex flex-col",
          isClosing ? "scale-95 opacity-0" : "scale-100 opacity-100"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Background pattern */}
        <div
          className="absolute inset-0 opacity-[0.02] pointer-events-none"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)`,
            backgroundSize: '20px 20px'
          }}
        />

        {/* Header */}
        <header className="relative px-6 py-5 border-b border-white/10 flex items-center justify-between bg-black/20 shrink-0">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2 text-[10px] text-white/40 uppercase tracking-[0.2em]">
              <GitCompare className="w-3 h-3 text-purple-400" />
              <span>Pipeline Route Analysis</span>
            </div>
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold text-white uppercase tracking-wide">
                Route Comparison
              </h2>
              {currentProject && (
                <div className="px-2 py-0.5 bg-purple-500/10 border border-purple-500/20 rounded-sm text-[10px] text-purple-300">
                  {currentProject}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/10 rounded-sm">
              <RouteIcon className="w-3.5 h-3.5 text-purple-400" />
              <span className="text-xs text-white/70">{selectedRouteIds.length} Routes</span>
            </div>
            <button
              onClick={handleClose}
              className="p-2 hover:bg-white/10 rounded-sm transition-colors text-white/50 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Content */}
        <div className="relative flex-1 overflow-y-auto p-6 space-y-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="p-4 bg-purple-500/10 rounded-full border border-purple-500/20 mb-4">
                <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
              </div>
              <p className="text-sm text-white/50">Analyzing routes...</p>
              <p className="text-[10px] text-white/30 mt-1">Fetching cost matrices and metadata</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="p-4 bg-red-500/10 rounded-full border border-red-500/20 mb-4">
                <AlertTriangle className="w-8 h-8 text-red-400" />
              </div>
              <p className="text-sm text-red-400">{error}</p>
            </div>
          ) : (
            <>
              {/* Cost Summary Table */}
              <div className="bg-white/[0.02] border border-white/10 rounded-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-white/10 bg-white/[0.02] flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">Cost Summary</h3>
                  <span className="text-[9px] text-white/30 ml-auto">SAIPEM Cost Matrix</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-white/10">
                        <th className="px-4 py-3 text-left text-[10px] font-bold text-white/50 uppercase tracking-wider">Metric</th>
                        {comparisonData.map((route) => (
                          <th key={route.routeId} className="px-4 py-3 text-right text-[10px] font-bold text-purple-400 uppercase tracking-wider">
                            {formatRouteName(route.routeId)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      <tr className="hover:bg-white/[0.02]">
                        <td className="px-4 py-2.5 text-xs text-white/70 flex items-center gap-2">
                          <Ruler className="w-3 h-3 text-white/30" />
                          Total Length
                        </td>
                        {comparisonData.map((route) => {
                          const indicator = getComparisonIndicator(route.totalLength, comparisonData.map(r => r.totalLength))
                          return (
                            <td key={route.routeId} className="px-4 py-2.5 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <span className="text-xs text-white font-mono">{formatDistance(route.totalLength)}</span>
                                <indicator.icon className={cn("w-3 h-3", indicator.color)} />
                              </div>
                            </td>
                          )
                        })}
                      </tr>
                      <tr className="hover:bg-white/[0.02]">
                        <td className="px-4 py-2.5 text-xs text-white/70">Segments</td>
                        {comparisonData.map((route) => (
                          <td key={route.routeId} className="px-4 py-2.5 text-right text-xs text-white font-mono">
                            {route.segmentCount}
                          </td>
                        ))}
                      </tr>
                      <tr className="hover:bg-white/[0.02]">
                        <td className="px-4 py-2.5 text-xs text-white/70">Base Construction</td>
                        {comparisonData.map((route) => (
                          <td key={route.routeId} className="px-4 py-2.5 text-right text-xs text-white font-mono">
                            {formatCurrency(route.baseCost)}
                          </td>
                        ))}
                      </tr>
                      <tr className="hover:bg-white/[0.02]">
                        <td className="px-4 py-2.5 text-xs text-white/70">Terrain Difficulty</td>
                        {comparisonData.map((route) => (
                          <td key={route.routeId} className="px-4 py-2.5 text-right text-xs text-white font-mono">
                            {formatCurrency(route.terrainCost)}
                          </td>
                        ))}
                      </tr>
                      <tr className="hover:bg-white/[0.02]">
                        <td className="px-4 py-2.5 text-xs text-white/70">Landcover</td>
                        {comparisonData.map((route) => (
                          <td key={route.routeId} className="px-4 py-2.5 text-right text-xs text-white font-mono">
                            {formatCurrency(route.landcoverCost)}
                          </td>
                        ))}
                      </tr>
                      <tr className="hover:bg-white/[0.02]">
                        <td className="px-4 py-2.5 text-xs text-white/70">Infrastructure Crossings</td>
                        {comparisonData.map((route) => (
                          <td key={route.routeId} className="px-4 py-2.5 text-right text-xs text-white font-mono">
                            {formatCurrency(route.crossingCost)}
                          </td>
                        ))}
                      </tr>
                      <tr className="bg-purple-500/10">
                        <td className="px-4 py-3 text-xs font-bold text-white">TOTAL COST</td>
                        {comparisonData.map((route) => {
                          const indicator = getComparisonIndicator(route.totalCost, comparisonData.map(r => r.totalCost))
                          return (
                            <td key={route.routeId} className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <span className="text-sm font-bold text-purple-300 font-mono">{formatCurrency(route.totalCost)}</span>
                                <indicator.icon className={cn("w-4 h-4", indicator.color)} />
                              </div>
                            </td>
                          )
                        })}
                      </tr>
                      <tr className="bg-purple-500/5">
                        <td className="px-4 py-2.5 text-xs font-medium text-white/80">Cost per km</td>
                        {comparisonData.map((route) => {
                          const indicator = getComparisonIndicator(route.costPerKm, comparisonData.map(r => r.costPerKm))
                          return (
                            <td key={route.routeId} className="px-4 py-2.5 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <span className="text-xs font-medium text-purple-200 font-mono">{formatCurrency(route.costPerKm)}/km</span>
                                <indicator.icon className={cn("w-3 h-3", indicator.color)} />
                              </div>
                            </td>
                          )
                        })}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Generation Method & Compliance */}
              <div className="bg-white/[0.02] border border-white/10 rounded-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-white/10 bg-white/[0.02] flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-cyan-400" />
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">Generation Method & Compliance</h3>
                </div>
                <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                  {comparisonData.map((route) => {
                    const gm = route.detailedMetadata?.generation_method
                    const compliance = getComplianceStatus(route.detailedMetadata)
                    return (
                      <div key={route.routeId} className="bg-black/30 border border-white/5 rounded-sm p-4">
                        <h4 className="text-[10px] font-bold text-purple-400 uppercase tracking-wider mb-3 pb-2 border-b border-white/5">
                          {formatRouteName(route.routeId)}
                        </h4>

                        {/* Generation Method */}
                        <div className="mb-4">
                          <div className="text-[9px] text-white/40 uppercase tracking-wider mb-2">Generation Method</div>
                          {route.hasDetailedMetadata && gm ? (
                            <div className="space-y-1">
                              <div className="text-xs text-white font-medium">{gm.method || 'Unknown'}</div>
                              {gm.algorithm && gm.algorithm !== gm.method && (
                                <div className="text-[10px] text-white/50">Algorithm: {gm.algorithm}</div>
                              )}
                              {gm.constraint_enforcement && gm.constraint_enforcement !== 'unknown' && (
                                <div className="text-[10px] text-white/50">
                                  Constraints: <span className={cn(
                                    gm.constraint_enforcement === 'hard' ? 'text-emerald-400' : 'text-amber-400'
                                  )}>{gm.constraint_enforcement}</span>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="text-[10px] text-white/30 italic">Information unavailable</div>
                          )}
                        </div>

                        {/* Constraint Compliance */}
                        <div>
                          <div className="text-[9px] text-white/40 uppercase tracking-wider mb-2">SAIPEM Constraint Compliance</div>
                          {route.hasDetailedMetadata && compliance.overall !== null ? (
                            <div className="space-y-2">
                              <div className={cn(
                                "flex items-center gap-2 px-2 py-1.5 rounded-sm",
                                compliance.overall ? "bg-emerald-500/10 border border-emerald-500/20" : "bg-red-500/10 border border-red-500/20"
                              )}>
                                {compliance.overall ? (
                                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                ) : (
                                  <XCircle className="w-4 h-4 text-red-400" />
                                )}
                                <span className={cn("text-xs font-medium", compliance.overall ? "text-emerald-400" : "text-red-400")}>
                                  {compliance.overall ? 'FULLY COMPLIANT' : 'VIOLATIONS DETECTED'}
                                </span>
                              </div>

                              <div className="space-y-1 pl-1">
                                <div className="flex items-center justify-between text-[10px]">
                                  <span className="text-white/50">Slope (max {compliance.maxAllowedSlope || 20}%)</span>
                                  <div className="flex items-center gap-1">
                                    {compliance.slope ? (
                                      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                    ) : (
                                      <XCircle className="w-3 h-3 text-red-400" />
                                    )}
                                    <span className={cn(compliance.slope ? "text-emerald-400" : "text-red-400")}>
                                      {compliance.slope ? 'Pass' : `${(compliance.slopeViolations || 0).toFixed(0)}m`}
                                    </span>
                                  </div>
                                </div>
                                <div className="flex items-center justify-between text-[10px]">
                                  <span className="text-white/50">Built-up Areas</span>
                                  <div className="flex items-center gap-1">
                                    {compliance.built_up ? (
                                      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                    ) : (
                                      <XCircle className="w-3 h-3 text-red-400" />
                                    )}
                                    <span className={cn(compliance.built_up ? "text-emerald-400" : "text-red-400")}>
                                      {compliance.built_up ? 'Pass' : `${(compliance.builtUpViolations || 0).toFixed(0)}m`}
                                    </span>
                                  </div>
                                </div>
                                <div className="flex items-center justify-between text-[10px]">
                                  <span className="text-white/50">Water Bodies</span>
                                  <div className="flex items-center gap-1">
                                    {compliance.water ? (
                                      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                    ) : (
                                      <XCircle className="w-3 h-3 text-red-400" />
                                    )}
                                    <span className={cn(compliance.water ? "text-emerald-400" : "text-red-400")}>
                                      {compliance.water ? 'Pass' : `${(compliance.waterViolations || 0).toFixed(0)}m`}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="text-[10px] text-white/30 italic">Compliance data unavailable</div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Terrain Stats */}
              <div className="bg-white/[0.02] border border-white/10 rounded-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-white/10 bg-white/[0.02] flex items-center gap-2">
                  <Mountain className="w-4 h-4 text-amber-400" />
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">Terrain Statistics</h3>
                </div>
                <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                  {comparisonData.map((route) => {
                    const ts = route.detailedMetadata?.terrain_statistics
                    const td = ts?.terrain_distribution
                    return (
                      <div key={route.routeId} className="bg-black/30 border border-white/5 rounded-sm p-4">
                        <h4 className="text-[10px] font-bold text-purple-400 uppercase tracking-wider mb-3 pb-2 border-b border-white/5">
                          {formatRouteName(route.routeId)}
                        </h4>
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 gap-3">
                            <div className="flex justify-between">
                              <span className="text-[10px] text-white/50">Avg Slope</span>
                              <span className="text-[10px] text-white font-mono">{route.avgSlope.toFixed(1)}%</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[10px] text-white/50">Max Slope</span>
                              <span className="text-[10px] text-white font-mono">{route.maxSlope.toFixed(1)}%</span>
                            </div>
                          </div>

                          {ts?.elevation && (
                            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-white/5">
                              <div className="flex justify-between">
                                <span className="text-[10px] text-white/50">Elevation Range</span>
                                <span className="text-[10px] text-white font-mono">{ts.elevation.range?.toFixed(0) || 'N/A'}m</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-[10px] text-white/50">Total Gain</span>
                                <span className="text-[10px] text-white font-mono">{ts.elevation.total_gain?.toFixed(0) || 'N/A'}m</span>
                              </div>
                            </div>
                          )}

                          {td && (
                            <div className="pt-2 border-t border-white/5">
                              <div className="text-[9px] text-white/40 uppercase mb-2">Terrain Distribution</div>
                              <div className="flex h-2 rounded-sm overflow-hidden">
                                {td.flat_pct > 0 && <div className="bg-emerald-500" style={{ width: `${td.flat_pct}%` }} title={`Flat: ${td.flat_pct.toFixed(1)}%`} />}
                                {td.rolling_pct > 0 && <div className="bg-lime-500" style={{ width: `${td.rolling_pct}%` }} title={`Rolling: ${td.rolling_pct.toFixed(1)}%`} />}
                                {td.hilly_pct > 0 && <div className="bg-amber-500" style={{ width: `${td.hilly_pct}%` }} title={`Hilly: ${td.hilly_pct.toFixed(1)}%`} />}
                                {td.mountainous_pct > 0 && <div className="bg-orange-500" style={{ width: `${td.mountainous_pct}%` }} title={`Mountainous: ${td.mountainous_pct.toFixed(1)}%`} />}
                                {td.steep_pct > 0 && <div className="bg-red-500" style={{ width: `${td.steep_pct}%` }} title={`Steep: ${td.steep_pct.toFixed(1)}%`} />}
                              </div>
                              <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-2">
                                {td.flat_pct > 0 && <span className="text-[9px] text-emerald-400">Flat {td.flat_pct.toFixed(0)}%</span>}
                                {td.rolling_pct > 0 && <span className="text-[9px] text-lime-400">Rolling {td.rolling_pct.toFixed(0)}%</span>}
                                {td.hilly_pct > 0 && <span className="text-[9px] text-amber-400">Hilly {td.hilly_pct.toFixed(0)}%</span>}
                                {td.mountainous_pct > 0 && <span className="text-[9px] text-orange-400">Mountain {td.mountainous_pct.toFixed(0)}%</span>}
                                {td.steep_pct > 0 && <span className="text-[9px] text-red-400">Steep {td.steep_pct.toFixed(0)}%</span>}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Landcover Distribution */}
              <div className="bg-white/[0.02] border border-white/10 rounded-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-white/10 bg-white/[0.02] flex items-center gap-2">
                  <Layers className="w-4 h-4 text-green-400" />
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">Landcover Distribution</h3>
                </div>
                <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                  {comparisonData.map((route) => {
                    const lc = route.detailedMetadata?.landcover_distribution
                    if (!lc) {
                      return (
                        <div key={route.routeId} className="bg-black/30 border border-white/5 rounded-sm p-4">
                          <h4 className="text-[10px] font-bold text-purple-400 uppercase tracking-wider mb-2">
                            {formatRouteName(route.routeId)}
                          </h4>
                          <div className="text-[10px] text-white/30 italic">Landcover data unavailable</div>
                        </div>
                      )
                    }
                    const lcEntries = Object.entries(lc).sort((a, b) => (b[1].percentage || 0) - (a[1].percentage || 0))
                    return (
                      <div key={route.routeId} className="bg-black/30 border border-white/5 rounded-sm p-4">
                        <h4 className="text-[10px] font-bold text-purple-400 uppercase tracking-wider mb-3 pb-2 border-b border-white/5">
                          {formatRouteName(route.routeId)}
                        </h4>
                        <div className="space-y-2">
                          {lcEntries.map(([name, data]) => (
                            <div key={name} className="flex items-center gap-2">
                              <div className="flex-1">
                                <div className="flex justify-between text-[10px] mb-0.5">
                                  <span className="text-white/70 capitalize">{name.replace(/_/g, ' ')}</span>
                                  <span className="text-white/50 font-mono">{(data.percentage || 0).toFixed(1)}%</span>
                                </div>
                                <div className="h-1.5 bg-white/5 rounded-sm overflow-hidden">
                                  <div
                                    className={cn(
                                      "h-full",
                                      name === 'cropland' ? 'bg-amber-500' :
                                      name === 'grassland' ? 'bg-green-500' :
                                      name === 'tree_cover' ? 'bg-emerald-600' :
                                      name === 'shrubland' ? 'bg-lime-600' :
                                      name === 'built_up' ? 'bg-red-500' :
                                      name === 'bare_sparse' ? 'bg-stone-500' :
                                      name === 'water' ? 'bg-blue-500' :
                                      name === 'wetland' ? 'bg-cyan-600' :
                                      'bg-purple-500'
                                    )}
                                    style={{ width: `${data.percentage || 0}%` }}
                                  />
                                </div>
                              </div>
                              <span className="text-[9px] text-white/40 w-14 text-right font-mono">
                                {((data.length_m || 0) / 1000).toFixed(1)}km
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Infrastructure Crossings */}
              <div className="bg-white/[0.02] border border-white/10 rounded-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-white/10 bg-white/[0.02] flex items-center gap-2">
                  <TreePine className="w-4 h-4 text-orange-400" />
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">Infrastructure Crossings</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-white/10">
                        <th className="px-4 py-2 text-left text-[10px] font-bold text-white/50 uppercase">Type</th>
                        {comparisonData.map((route) => (
                          <th key={route.routeId} className="px-4 py-2 text-right text-[10px] font-bold text-purple-400 uppercase">
                            {formatRouteName(route.routeId).slice(0, 20)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {['road', 'railway', 'powerline', 'waterway'].map((type) => (
                        <tr key={type} className="hover:bg-white/[0.02]">
                          <td className="px-4 py-2 text-xs text-white/70 capitalize">{type}s</td>
                          {comparisonData.map((route) => (
                            <td key={route.routeId} className="px-4 py-2 text-right text-xs text-white font-mono">
                              {route.crossings[type as keyof typeof route.crossings]}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* AI Agent Analysis */}
              <div className="bg-white/[0.02] border border-white/10 rounded-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-white/10 bg-gradient-to-r from-purple-900/20 to-cyan-900/20 flex items-center gap-2">
                  <Brain className="w-4 h-4 text-purple-400" />
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">AI Agent Analysis</h3>
                  <span className="text-[9px] text-purple-400/60 uppercase tracking-wider ml-auto px-2 py-0.5 bg-purple-500/10 rounded-sm border border-purple-500/20">Coming Soon</span>
                </div>
                <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    { icon: Mountain, color: 'amber', title: 'Terrain Analysis Agent', desc: 'AI analysis of terrain difficulty and slope patterns' },
                    { icon: TreePine, color: 'green', title: 'Environmental Impact Agent', desc: 'Assessment of protected areas and ecological sensitivity' },
                    { icon: Sparkles, color: 'blue', title: 'Cost Optimization Agent', desc: 'AI-driven cost analysis and hybrid route suggestions' },
                    { icon: AlertTriangle, color: 'red', title: 'Risk Assessment Agent', desc: 'Evaluation of geohazards and construction risks' },
                  ].map((agent) => (
                    <div key={agent.title} className="bg-black/30 border border-white/5 rounded-sm p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <div className={cn("p-1.5 rounded-sm", `bg-${agent.color}-500/20`)}>
                          <agent.icon className={cn("w-3.5 h-3.5", `text-${agent.color}-400`)} />
                        </div>
                        <span className="text-[10px] font-bold text-white uppercase">{agent.title}</span>
                      </div>
                      <p className="text-[10px] text-white/30 italic">{agent.desc}</p>
                    </div>
                  ))}
                </div>

                {/* Master Recommendation */}
                <div className="p-4 pt-0">
                  <div className="bg-gradient-to-r from-purple-500/10 to-cyan-500/10 border border-purple-500/20 rounded-sm p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="p-1.5 bg-purple-500/30 rounded-sm">
                        <Bot className="w-3.5 h-3.5 text-purple-400" />
                      </div>
                      <span className="text-[10px] font-bold text-white uppercase">Master Recommendation Agent</span>
                    </div>
                    <p className="text-[10px] text-purple-300/50 italic">
                      Synthesizes insights from all agents to provide comprehensive route recommendation
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <footer className="relative px-6 py-4 border-t border-white/10 bg-black/30 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
              <span className="text-[10px] text-white/40 uppercase tracking-wider">SAIPEM Cost Matrix Active</span>
            </div>
            {comparisonData.length > 0 && (
              <span className="text-[9px] text-white/30">
                {comparisonData.filter(r => r.hasDetailedMetadata).length}/{comparisonData.length} with detailed metadata
              </span>
            )}
          </div>
          <button
            onClick={handleClose}
            className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-sm text-xs font-medium text-white/70 hover:text-white transition-colors"
          >
            Close
          </button>
        </footer>
      </div>
    </div>
  )

  return createPortal(content, document.body)
}
