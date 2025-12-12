'use client'

import React, { useState, useEffect } from 'react'
import { X, Loader2, TrendingUp, TrendingDown, Minus, Mountain, TreePine, AlertTriangle, Route as RouteIcon, Brain, Bot, Sparkles, CheckCircle2, XCircle, Info, FileText, Cpu, Layers } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useProject } from '@/lib/context/ProjectContext'
import { getAgenticRoute, listAgenticSegments } from '@/lib/api/agenticClient'
import { fetchPIRLRouteMetadata, RouteDetailedMetadata } from '@/lib/api/dataClient'

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
  // Enhanced metadata from sidecar files
  detailedMetadata?: RouteDetailedMetadata | null
  hasDetailedMetadata: boolean
}

interface CompareRoutesDialogProps {
  isOpen: boolean
  onClose: () => void
  selectedRouteIds: string[]
}

// Fallback cost matrix (used when sidecar not available)
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

// Helper to get constraint compliance status
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

  useEffect(() => {
    if (isOpen && selectedRouteIds.length >= 2 && currentProject) {
      fetchComparisonData()
    }
  }, [isOpen, selectedRouteIds, currentProject])

  const fetchComparisonData = async () => {
    if (!currentProject) {
      setError('No project loaded')
      return
    }

    setLoading(true)
    setError(null)

    try {
      // Fetch route details for each selected route
      const data: RouteComparisonData[] = []

      for (const routeId of selectedRouteIds) {
        const routeDetail = await getAgenticRoute(routeId, currentProject)
        if (!routeDetail) throw new Error(`Failed to fetch route ${routeId}`)

        // Get segments for more detailed analysis
        const segments = await listAgenticSegments(routeId, 1000, 0, currentProject)

        // Try to fetch detailed metadata from sidecar file
        let detailedMetadata: RouteDetailedMetadata | null = null
        try {
          // Route name for sidecar lookup (add .geojson if not present)
          const routeFileName = routeId.endsWith('.geojson') ? routeId : `${routeId}.geojson`
          detailedMetadata = await fetchPIRLRouteMetadata(currentProject, routeFileName)
        } catch (metaErr) {
          // Sidecar not available, will use fallback estimates
          console.log(`No detailed metadata for ${routeId}:`, metaErr)
        }

        // Calculate costs based on available data
        const metadata = routeDetail.metadata as Record<string, any> || {}
        const segmentsLength = segments.reduce((sum: number, s: any) => sum + (s.length_m || 0), 0)

        // Use sidecar data if available, otherwise fall back to basic metadata
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
          // Use actual data from sidecar
          const cb = detailedMetadata.cost_breakdown
          totalLength = detailedMetadata.route_info?.length_m || segmentsLength || metadata.total_length_m || 0
          baseCost = cb.base_construction?.cost || 0
          terrainCost = cb.trenching?.cost || 0
          landcoverCost = cb.landcover?.cost || 0
          crossingCost = cb.crossings?.cost || 0
          totalCost = cb.total || 0
          costPerKm = cb.cost_per_km || (totalLength > 0 ? totalCost / (totalLength / 1000) : 0)

          // Terrain stats from sidecar
          const ts = detailedMetadata.terrain_statistics
          avgSlope = ts?.slope?.mean || metadata.avg_slope || 0
          maxSlope = ts?.slope?.max || metadata.max_slope || 0

          // Crossings from sidecar
          const ic = detailedMetadata.infrastructure_crossings
          crossingsData = {
            road: ic?.roads?.total || 0,
            railway: ic?.railways?.total || 0,
            powerline: ic?.powerlines?.total || 0,
            waterway: ic?.waterways?.total || 0,
          }
        } else {
          // Fallback to estimates
          totalLength = segmentsLength || metadata.total_length_m || 0
          baseCost = totalLength * FALLBACK_COST_MATRIX.base_cost_per_m
          terrainCost = baseCost * 0.3 // Placeholder estimate
          landcoverCost = totalLength * 1.5 // Placeholder
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
      if (value === min) return { icon: TrendingDown, color: 'text-green-400' }
      if (value === max) return { icon: TrendingUp, color: 'text-red-400' }
    } else {
      if (value === max) return { icon: TrendingUp, color: 'text-green-400' }
      if (value === min) return { icon: TrendingDown, color: 'text-red-400' }
    }
    return { icon: Minus, color: 'text-yellow-400' }
  }

  // Format route name by removing project prefix and underscores
  const formatRouteName = (routeId: string) => {
    let name = routeId
    if (currentProject) {
      const prefix = `${currentProject}_`
      if (name.startsWith(prefix)) {
        name = name.substring(prefix.length)
      }
    }
    return name.replace(/_/g, ' ')
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

      {/* Dialog */}
      <div className="relative bg-[#0a0a0a] border border-purple-500/30 rounded-lg shadow-[0_0_50px_-10px_rgba(147,51,234,0.5)] w-[900px] max-h-[85vh] overflow-hidden font-mono">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-purple-500/20 bg-purple-900/10">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500/20 rounded-lg">
              <RouteIcon className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Route Comparison</h2>
              <p className="text-xs text-purple-400/70">Comparing {selectedRouteIds.length} routes using SAIPEM cost matrix</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors text-white/50 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(85vh-140px)]">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-purple-400 mb-4" />
              <p className="text-sm text-white/50">Analyzing routes...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-16">
              <AlertTriangle className="w-8 h-8 text-red-400 mb-4" />
              <p className="text-sm text-red-400">{error}</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Summary Table */}
              <div className="bg-white/[0.02] border border-white/10 rounded-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-white/10 bg-white/[0.02]">
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">Cost Summary</h3>
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
                        <td className="px-4 py-2.5 text-xs text-white/70">Total Length</td>
                        {comparisonData.map((route) => {
                          const indicator = getComparisonIndicator(route.totalLength, comparisonData.map(r => r.totalLength))
                          return (
                            <td key={route.routeId} className="px-4 py-2.5 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <span className="text-xs text-white">{formatDistance(route.totalLength)}</span>
                                <indicator.icon className={cn("w-3 h-3", indicator.color)} />
                              </div>
                            </td>
                          )
                        })}
                      </tr>
                      <tr className="hover:bg-white/[0.02]">
                        <td className="px-4 py-2.5 text-xs text-white/70">Segments</td>
                        {comparisonData.map((route) => (
                          <td key={route.routeId} className="px-4 py-2.5 text-right text-xs text-white">
                            {route.segmentCount}
                          </td>
                        ))}
                      </tr>
                      <tr className="hover:bg-white/[0.02]">
                        <td className="px-4 py-2.5 text-xs text-white/70">Base Construction</td>
                        {comparisonData.map((route) => (
                          <td key={route.routeId} className="px-4 py-2.5 text-right text-xs text-white">
                            {formatCurrency(route.baseCost)}
                          </td>
                        ))}
                      </tr>
                      <tr className="hover:bg-white/[0.02]">
                        <td className="px-4 py-2.5 text-xs text-white/70">Terrain Difficulty</td>
                        {comparisonData.map((route) => (
                          <td key={route.routeId} className="px-4 py-2.5 text-right text-xs text-white">
                            {formatCurrency(route.terrainCost)}
                          </td>
                        ))}
                      </tr>
                      <tr className="hover:bg-white/[0.02]">
                        <td className="px-4 py-2.5 text-xs text-white/70">Landcover</td>
                        {comparisonData.map((route) => (
                          <td key={route.routeId} className="px-4 py-2.5 text-right text-xs text-white">
                            {formatCurrency(route.landcoverCost)}
                          </td>
                        ))}
                      </tr>
                      <tr className="hover:bg-white/[0.02]">
                        <td className="px-4 py-2.5 text-xs text-white/70">Infrastructure Crossings</td>
                        {comparisonData.map((route) => (
                          <td key={route.routeId} className="px-4 py-2.5 text-right text-xs text-white">
                            {formatCurrency(route.crossingCost)}
                          </td>
                        ))}
                      </tr>
                      <tr className="bg-purple-500/10 hover:bg-purple-500/15">
                        <td className="px-4 py-3 text-xs font-bold text-white">TOTAL COST</td>
                        {comparisonData.map((route) => {
                          const indicator = getComparisonIndicator(route.totalCost, comparisonData.map(r => r.totalCost))
                          return (
                            <td key={route.routeId} className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <span className="text-sm font-bold text-purple-300">{formatCurrency(route.totalCost)}</span>
                                <indicator.icon className={cn("w-4 h-4", indicator.color)} />
                              </div>
                            </td>
                          )
                        })}
                      </tr>
                      <tr className="bg-purple-500/5 hover:bg-purple-500/10">
                        <td className="px-4 py-2.5 text-xs font-medium text-white/80">Cost per km</td>
                        {comparisonData.map((route) => {
                          const indicator = getComparisonIndicator(route.costPerKm, comparisonData.map(r => r.costPerKm))
                          return (
                            <td key={route.routeId} className="px-4 py-2.5 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <span className="text-xs font-medium text-purple-200">{formatCurrency(route.costPerKm)}/km</span>
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

              {/* Generation Method & Constraint Compliance */}
              <div className="bg-white/[0.02] border border-white/10 rounded-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-white/10 bg-white/[0.02] flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-white/50" />
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">Generation Method & Compliance</h3>
                </div>
                <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                  {comparisonData.map((route) => {
                    const gm = route.detailedMetadata?.generation_method
                    const compliance = getComplianceStatus(route.detailedMetadata)
                    return (
                      <div key={route.routeId} className="bg-white/[0.02] border border-white/5 rounded-lg p-3">
                        <h4 className="text-[10px] font-bold text-purple-400 uppercase tracking-wider mb-3">
                          {formatRouteName(route.routeId)}
                        </h4>

                        {/* Generation Method */}
                        <div className="mb-3 pb-3 border-b border-white/5">
                          <div className="flex items-center gap-2 mb-2">
                            <FileText className="w-3 h-3 text-white/40" />
                            <span className="text-[10px] text-white/50 uppercase">Generation Method</span>
                          </div>
                          {route.hasDetailedMetadata && gm ? (
                            <div className="space-y-1">
                              <div className="text-xs text-white font-medium">{gm.method || 'Unknown'}</div>
                              {gm.algorithm && gm.algorithm !== gm.method && (
                                <div className="text-[10px] text-white/50">Algorithm: {gm.algorithm}</div>
                              )}
                              {gm.constraint_enforcement && gm.constraint_enforcement !== 'unknown' && (
                                <div className="text-[10px] text-white/50">
                                  Constraints: <span className={cn(
                                    gm.constraint_enforcement === 'hard' ? 'text-green-400' : 'text-yellow-400'
                                  )}>{gm.constraint_enforcement}</span>
                                </div>
                              )}
                              {gm.description && (
                                <div className="text-[10px] text-white/30 italic">{gm.description}</div>
                              )}
                            </div>
                          ) : (
                            <div className="text-[10px] text-white/30 italic">Information unavailable</div>
                          )}
                        </div>

                        {/* Constraint Compliance */}
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <AlertTriangle className="w-3 h-3 text-white/40" />
                            <span className="text-[10px] text-white/50 uppercase">SAIPEM Constraint Compliance</span>
                          </div>
                          {route.hasDetailedMetadata && compliance.overall !== null ? (
                            <div className="space-y-2">
                              {/* Overall Status */}
                              <div className={cn(
                                "flex items-center gap-2 px-2 py-1.5 rounded",
                                compliance.overall ? "bg-green-500/10 border border-green-500/20" : "bg-red-500/10 border border-red-500/20"
                              )}>
                                {compliance.overall ? (
                                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                                ) : (
                                  <XCircle className="w-4 h-4 text-red-400" />
                                )}
                                <span className={cn("text-xs font-medium", compliance.overall ? "text-green-400" : "text-red-400")}>
                                  {compliance.overall ? 'FULLY COMPLIANT' : 'VIOLATIONS DETECTED'}
                                </span>
                              </div>

                              {/* Individual Constraints */}
                              <div className="space-y-1 pl-1">
                                {/* Slope */}
                                <div className="flex items-center justify-between text-[10px]">
                                  <span className="text-white/50">Slope (max {compliance.maxAllowedSlope || 20}%)</span>
                                  <div className="flex items-center gap-1">
                                    {compliance.slope ? (
                                      <CheckCircle2 className="w-3 h-3 text-green-400" />
                                    ) : (
                                      <XCircle className="w-3 h-3 text-red-400" />
                                    )}
                                    <span className={cn(compliance.slope ? "text-green-400" : "text-red-400")}>
                                      {compliance.slope ? 'Pass' : `${(compliance.slopeViolations || 0).toFixed(0)}m violations`}
                                    </span>
                                  </div>
                                </div>
                                {/* Built-up */}
                                <div className="flex items-center justify-between text-[10px]">
                                  <span className="text-white/50">Built-up Areas</span>
                                  <div className="flex items-center gap-1">
                                    {compliance.built_up ? (
                                      <CheckCircle2 className="w-3 h-3 text-green-400" />
                                    ) : (
                                      <XCircle className="w-3 h-3 text-red-400" />
                                    )}
                                    <span className={cn(compliance.built_up ? "text-green-400" : "text-red-400")}>
                                      {compliance.built_up ? 'Pass' : `${(compliance.builtUpViolations || 0).toFixed(0)}m violations`}
                                    </span>
                                  </div>
                                </div>
                                {/* Water */}
                                <div className="flex items-center justify-between text-[10px]">
                                  <span className="text-white/50">Water Bodies</span>
                                  <div className="flex items-center gap-1">
                                    {compliance.water ? (
                                      <CheckCircle2 className="w-3 h-3 text-green-400" />
                                    ) : (
                                      <XCircle className="w-3 h-3 text-red-400" />
                                    )}
                                    <span className={cn(compliance.water ? "text-green-400" : "text-red-400")}>
                                      {compliance.water ? 'Pass' : `${(compliance.waterViolations || 0).toFixed(0)}m violations`}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              {/* Max Slope Found */}
                              {compliance.maxSlopeFound !== null && (
                                <div className="text-[10px] text-white/30 mt-1">
                                  Max slope found: {compliance.maxSlopeFound.toFixed(1)}%
                                </div>
                              )}
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
              <div className="bg-white/[0.02] border border-white/10 rounded-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-white/10 bg-white/[0.02] flex items-center gap-2">
                  <Mountain className="w-4 h-4 text-white/50" />
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">Terrain Statistics</h3>
                </div>
                <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                  {comparisonData.map((route) => {
                    const ts = route.detailedMetadata?.terrain_statistics
                    const td = ts?.terrain_distribution
                    return (
                      <div key={route.routeId} className="bg-white/[0.02] border border-white/5 rounded-lg p-3">
                        <h4 className="text-[10px] font-bold text-purple-400 uppercase tracking-wider mb-2">
                          {formatRouteName(route.routeId)}
                        </h4>
                        <div className="space-y-2">
                          {/* Slope Stats */}
                          <div className="grid grid-cols-2 gap-2">
                            <div className="flex justify-between">
                              <span className="text-[10px] text-white/50">Avg Slope</span>
                              <span className="text-[10px] text-white">{route.avgSlope.toFixed(1)}%</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[10px] text-white/50">Max Slope</span>
                              <span className="text-[10px] text-white">{route.maxSlope.toFixed(1)}%</span>
                            </div>
                          </div>

                          {/* Elevation Stats */}
                          {ts?.elevation && (
                            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/5">
                              <div className="flex justify-between">
                                <span className="text-[10px] text-white/50">Elevation Range</span>
                                <span className="text-[10px] text-white">{ts.elevation.range?.toFixed(0) || 'N/A'}m</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-[10px] text-white/50">Total Gain</span>
                                <span className="text-[10px] text-white">{ts.elevation.total_gain?.toFixed(0) || 'N/A'}m</span>
                              </div>
                            </div>
                          )}

                          {/* Terrain Distribution */}
                          {td && (
                            <div className="pt-2 border-t border-white/5">
                              <div className="text-[9px] text-white/40 uppercase mb-1">Terrain Distribution</div>
                              <div className="flex h-2 rounded overflow-hidden">
                                {td.flat_pct > 0 && (
                                  <div
                                    className="bg-green-500"
                                    style={{ width: `${td.flat_pct}%` }}
                                    title={`Flat: ${td.flat_pct.toFixed(1)}%`}
                                  />
                                )}
                                {td.rolling_pct > 0 && (
                                  <div
                                    className="bg-lime-500"
                                    style={{ width: `${td.rolling_pct}%` }}
                                    title={`Rolling: ${td.rolling_pct.toFixed(1)}%`}
                                  />
                                )}
                                {td.hilly_pct > 0 && (
                                  <div
                                    className="bg-yellow-500"
                                    style={{ width: `${td.hilly_pct}%` }}
                                    title={`Hilly: ${td.hilly_pct.toFixed(1)}%`}
                                  />
                                )}
                                {td.mountainous_pct > 0 && (
                                  <div
                                    className="bg-orange-500"
                                    style={{ width: `${td.mountainous_pct}%` }}
                                    title={`Mountainous: ${td.mountainous_pct.toFixed(1)}%`}
                                  />
                                )}
                                {td.steep_pct > 0 && (
                                  <div
                                    className="bg-red-500"
                                    style={{ width: `${td.steep_pct}%` }}
                                    title={`Steep: ${td.steep_pct.toFixed(1)}%`}
                                  />
                                )}
                              </div>
                              <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                                {td.flat_pct > 0 && <span className="text-[9px] text-green-400">Flat {td.flat_pct.toFixed(0)}%</span>}
                                {td.rolling_pct > 0 && <span className="text-[9px] text-lime-400">Rolling {td.rolling_pct.toFixed(0)}%</span>}
                                {td.hilly_pct > 0 && <span className="text-[9px] text-yellow-400">Hilly {td.hilly_pct.toFixed(0)}%</span>}
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
              <div className="bg-white/[0.02] border border-white/10 rounded-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-white/10 bg-white/[0.02] flex items-center gap-2">
                  <Layers className="w-4 h-4 text-white/50" />
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">Landcover Distribution</h3>
                </div>
                <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                  {comparisonData.map((route) => {
                    const lc = route.detailedMetadata?.landcover_distribution
                    if (!lc) {
                      return (
                        <div key={route.routeId} className="bg-white/[0.02] border border-white/5 rounded-lg p-3">
                          <h4 className="text-[10px] font-bold text-purple-400 uppercase tracking-wider mb-2">
                            {formatRouteName(route.routeId)}
                          </h4>
                          <div className="text-[10px] text-white/30 italic">Landcover data unavailable</div>
                        </div>
                      )
                    }
                    const lcEntries = Object.entries(lc).sort((a, b) => (b[1].percentage || 0) - (a[1].percentage || 0))
                    return (
                      <div key={route.routeId} className="bg-white/[0.02] border border-white/5 rounded-lg p-3">
                        <h4 className="text-[10px] font-bold text-purple-400 uppercase tracking-wider mb-2">
                          {formatRouteName(route.routeId)}
                        </h4>
                        <div className="space-y-1">
                          {lcEntries.map(([name, data]) => (
                            <div key={name} className="flex items-center gap-2">
                              <div className="flex-1">
                                <div className="flex justify-between text-[10px] mb-0.5">
                                  <span className="text-white/70 capitalize">{name.replace(/_/g, ' ')}</span>
                                  <span className="text-white/50">{(data.percentage || 0).toFixed(1)}%</span>
                                </div>
                                <div className="h-1 bg-white/5 rounded overflow-hidden">
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
                              <span className="text-[9px] text-white/40 w-14 text-right">
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
              <div className="bg-white/[0.02] border border-white/10 rounded-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-white/10 bg-white/[0.02] flex items-center gap-2">
                  <TreePine className="w-4 h-4 text-white/50" />
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">Infrastructure Crossings</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-white/10">
                        <th className="px-4 py-2 text-left text-[10px] font-bold text-white/50 uppercase">Type</th>
                        {comparisonData.map((route) => (
                          <th key={route.routeId} className="px-4 py-2 text-right text-[10px] font-bold text-purple-400 uppercase">
                            {formatRouteName(route.routeId).slice(0, 15)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {['road', 'railway', 'powerline', 'waterway'].map((type) => (
                        <tr key={type} className="hover:bg-white/[0.02]">
                          <td className="px-4 py-2 text-xs text-white/70 capitalize">{type}s</td>
                          {comparisonData.map((route) => (
                            <td key={route.routeId} className="px-4 py-2 text-right text-xs text-white">
                              {route.crossings[type as keyof typeof route.crossings]}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* Detailed crossing breakdown for routes with sidecar data */}
                {comparisonData.some(r => r.detailedMetadata?.infrastructure_crossings) && (
                  <div className="p-4 border-t border-white/5">
                    <div className="text-[9px] text-white/40 uppercase mb-3">Detailed Breakdown</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {comparisonData.map((route) => {
                        const ic = route.detailedMetadata?.infrastructure_crossings
                        if (!ic) return null
                        return (
                          <div key={route.routeId} className="bg-white/[0.01] border border-white/5 rounded p-2">
                            <div className="text-[10px] font-medium text-purple-400 mb-2">
                              {formatRouteName(route.routeId)}
                            </div>
                            {/* Roads breakdown */}
                            {ic.roads?.by_type && Object.keys(ic.roads.by_type).length > 0 && (
                              <div className="mb-2">
                                <div className="text-[9px] text-white/40 mb-1">Roads ({ic.roads.total})</div>
                                <div className="flex flex-wrap gap-1">
                                  {Object.entries(ic.roads.by_type).map(([roadType, count]) => (
                                    <span key={roadType} className="text-[9px] bg-white/5 px-1.5 py-0.5 rounded text-white/70">
                                      {roadType}: {count}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                            {/* Waterways breakdown */}
                            {ic.waterways?.by_type && Object.keys(ic.waterways.by_type).length > 0 && (
                              <div className="mb-2">
                                <div className="text-[9px] text-white/40 mb-1">Waterways ({ic.waterways.total})</div>
                                <div className="flex flex-wrap gap-1">
                                  {Object.entries(ic.waterways.by_type).map(([wwType, count]) => (
                                    <span key={wwType} className="text-[9px] bg-blue-500/10 px-1.5 py-0.5 rounded text-blue-300/70">
                                      {wwType}: {count}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                            {/* Crossing costs */}
                            <div className="text-[9px] text-white/30 mt-2 pt-2 border-t border-white/5">
                              Total crossing cost: {formatCurrency(
                                (ic.roads?.cost || 0) +
                                (ic.railways?.cost || 0) +
                                (ic.waterways?.cost || 0) +
                                (ic.powerlines?.cost || 0)
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* AI Agent Analysis Placeholders */}
              <div className="bg-white/[0.02] border border-white/10 rounded-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-white/10 bg-gradient-to-r from-purple-900/20 to-blue-900/20 flex items-center gap-2">
                  <Brain className="w-4 h-4 text-purple-400" />
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">AI Agent Analysis</h3>
                  <span className="text-[9px] text-purple-400/60 uppercase tracking-wider ml-auto">Coming Soon</span>
                </div>
                <div className="p-4 space-y-4">
                  {/* Terrain Analysis Agent */}
                  <div className="bg-white/[0.01] border border-white/5 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="p-1.5 bg-amber-500/20 rounded">
                        <Mountain className="w-3.5 h-3.5 text-amber-400" />
                      </div>
                      <span className="text-xs font-bold text-white">Terrain Analysis Agent</span>
                      <span className="ml-auto text-[9px] text-white/30 bg-white/5 px-2 py-0.5 rounded">Placeholder</span>
                    </div>
                    <div className="bg-black/30 rounded p-3 border border-dashed border-white/10">
                      <p className="text-[10px] text-white/40 italic">
                        AI analysis of terrain difficulty, slope patterns, and elevation challenges will appear here.
                        The agent will compare how each route handles mountainous terrain and provide optimization suggestions.
                      </p>
                    </div>
                  </div>

                  {/* Environmental Impact Agent */}
                  <div className="bg-white/[0.01] border border-white/5 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="p-1.5 bg-green-500/20 rounded">
                        <TreePine className="w-3.5 h-3.5 text-green-400" />
                      </div>
                      <span className="text-xs font-bold text-white">Environmental Impact Agent</span>
                      <span className="ml-auto text-[9px] text-white/30 bg-white/5 px-2 py-0.5 rounded">Placeholder</span>
                    </div>
                    <div className="bg-black/30 rounded p-3 border border-dashed border-white/10">
                      <p className="text-[10px] text-white/40 italic">
                        AI assessment of environmental considerations including protected areas, wetlands, water body crossings,
                        and ecological sensitivity. Will provide recommendations for minimizing environmental footprint.
                      </p>
                    </div>
                  </div>

                  {/* Cost Optimization Agent */}
                  <div className="bg-white/[0.01] border border-white/5 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="p-1.5 bg-blue-500/20 rounded">
                        <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                      </div>
                      <span className="text-xs font-bold text-white">Cost Optimization Agent</span>
                      <span className="ml-auto text-[9px] text-white/30 bg-white/5 px-2 py-0.5 rounded">Placeholder</span>
                    </div>
                    <div className="bg-black/30 rounded p-3 border border-dashed border-white/10">
                      <p className="text-[10px] text-white/40 italic">
                        AI-driven cost analysis identifying the most economical route and suggesting hybrid approaches
                        that could combine the best segments from multiple routes for optimal cost efficiency.
                      </p>
                    </div>
                  </div>

                  {/* Risk Assessment Agent */}
                  <div className="bg-white/[0.01] border border-white/5 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="p-1.5 bg-red-500/20 rounded">
                        <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                      </div>
                      <span className="text-xs font-bold text-white">Risk Assessment Agent</span>
                      <span className="ml-auto text-[9px] text-white/30 bg-white/5 px-2 py-0.5 rounded">Placeholder</span>
                    </div>
                    <div className="bg-black/30 rounded p-3 border border-dashed border-white/10">
                      <p className="text-[10px] text-white/40 italic">
                        AI evaluation of geohazards, construction risks, and long-term maintenance considerations.
                        Will identify high-risk segments and suggest mitigation strategies for each route option.
                      </p>
                    </div>
                  </div>

                  {/* Master Recommendation Agent */}
                  <div className="bg-gradient-to-r from-purple-500/10 to-blue-500/10 border border-purple-500/20 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="p-1.5 bg-purple-500/30 rounded">
                        <Bot className="w-3.5 h-3.5 text-purple-400" />
                      </div>
                      <span className="text-xs font-bold text-white">Master Recommendation Agent</span>
                      <span className="ml-auto text-[9px] text-purple-400/60 bg-purple-500/10 px-2 py-0.5 rounded">Placeholder</span>
                    </div>
                    <div className="bg-black/30 rounded p-3 border border-dashed border-purple-500/20">
                      <p className="text-[10px] text-purple-300/60 italic">
                        The Master Agent will synthesize insights from all specialized agents to provide a comprehensive
                        recommendation, weighing cost, environmental impact, terrain difficulty, and risk factors
                        to identify the optimal route choice for the project requirements.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-purple-500/20 bg-purple-900/5 flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-[10px] text-purple-400/50">
              Cost calculations based on SAIPEM AI Routing Criteria
            </p>
            {comparisonData.length > 0 && (
              <p className="text-[9px] text-white/30">
                {comparisonData.filter(r => r.hasDetailedMetadata).length} of {comparisonData.length} routes have detailed metadata
                {comparisonData.some(r => !r.hasDetailedMetadata) && ' (others using estimates)'}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/30 rounded text-xs font-medium text-purple-300 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
