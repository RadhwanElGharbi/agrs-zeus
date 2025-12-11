'use client'

import React, { useState, useEffect } from 'react'
import { X, Loader2, TrendingUp, TrendingDown, Minus, Mountain, TreePine, AlertTriangle, Route as RouteIcon, Brain, Bot, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useProject } from '@/lib/context/ProjectContext'
import { getAgenticRoute, listAgenticSegments } from '@/lib/api/agenticClient'

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
}

interface CompareRoutesDialogProps {
  isOpen: boolean
  onClose: () => void
  selectedRouteIds: string[]
}

// Cost matrix constants (same as backend)
const COST_MATRIX = {
  base_cost_per_m: 550,
  terrain_multipliers: {
    flat: 1.0,
    rolling: 1.3,
    hilly: 1.8,
    mountainous: 3.0,
    steep: 100.0,
  },
  crossing_costs: {
    road: 25000,
    railway: 250000,
    powerline: 150000,
    waterway: 80000,
  },
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

        // Calculate costs based on available data
        const metadata = routeDetail.metadata as Record<string, any> || {}
        const segmentsLength = segments.reduce((sum: number, s: any) => sum + (s.length_m || 0), 0)
        const totalLength: number = segmentsLength || metadata.total_length_m || 0
        const segmentCount = routeDetail.segment_count || segments.length

        // Estimate costs (simplified - in production would come from backend)
        const baseCost = totalLength * COST_MATRIX.base_cost_per_m
        const terrainCost = baseCost * 0.3 // Placeholder estimate
        const landcoverCost = totalLength * 1.5 // Placeholder
        const crossingsData = metadata.crossings || {}
        const crossingCost = (crossingsData.road || 0) * COST_MATRIX.crossing_costs.road +
                            (crossingsData.railway || 0) * COST_MATRIX.crossing_costs.railway +
                            (crossingsData.powerline || 0) * COST_MATRIX.crossing_costs.powerline +
                            (crossingsData.waterway || 0) * COST_MATRIX.crossing_costs.waterway

        const totalCost = baseCost + terrainCost + landcoverCost + crossingCost
        const costPerKm = totalLength > 0 ? totalCost / (totalLength / 1000) : 0

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
          avgSlope: metadata.avg_slope || 0,
          maxSlope: metadata.max_slope || 0,
          terrainBreakdown: metadata.terrain_breakdown || {},
          crossings: crossingsData.road !== undefined ? crossingsData : { road: 0, railway: 0, powerline: 0, waterway: 0 },
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

              {/* Terrain Stats */}
              <div className="bg-white/[0.02] border border-white/10 rounded-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-white/10 bg-white/[0.02] flex items-center gap-2">
                  <Mountain className="w-4 h-4 text-white/50" />
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">Terrain Statistics</h3>
                </div>
                <div className="p-4 grid grid-cols-2 gap-4">
                  {comparisonData.map((route) => (
                    <div key={route.routeId} className="bg-white/[0.02] border border-white/5 rounded-lg p-3">
                      <h4 className="text-[10px] font-bold text-purple-400 uppercase tracking-wider mb-2">
                        {formatRouteName(route.routeId)}
                      </h4>
                      <div className="space-y-1.5">
                        <div className="flex justify-between">
                          <span className="text-[10px] text-white/50">Avg Slope</span>
                          <span className="text-[10px] text-white">{route.avgSlope.toFixed(1)}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[10px] text-white/50">Max Slope</span>
                          <span className="text-[10px] text-white">{route.maxSlope.toFixed(1)}%</span>
                        </div>
                      </div>
                    </div>
                  ))}
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
          <p className="text-[10px] text-purple-400/50">
            Cost calculations based on SAIPEM AI Routing Criteria
          </p>
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
