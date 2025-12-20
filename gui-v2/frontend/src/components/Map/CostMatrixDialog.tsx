'use client'

import React, { useState, useEffect } from 'react'
import { X, DollarSign, Loader2, AlertCircle, Mountain, TreeDeciduous, Train, Droplets, Zap, CircleDot, MapPin, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fetchPIRLRouteMetadata, type RouteDetailedMetadata } from '@/lib/api/dataClient'

interface CostMatrixDialogProps {
  isOpen: boolean
  onClose: () => void
  routeId: string
  project: string
}

interface CostRate {
  name: string
  cost: number
  description?: string
  slope_range?: string
}

export function CostMatrixDialog({ isOpen, onClose, routeId, project }: CostMatrixDialogProps) {
  const [metadata, setMetadata] = useState<RouteDetailedMetadata | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen && routeId && project) {
      setLoading(true)
      setError(null)
      fetchPIRLRouteMetadata(project, routeId)
        .then(setMetadata)
        .catch(err => setError(err.message))
        .finally(() => setLoading(false))
    }
  }, [isOpen, routeId, project])

  if (!isOpen) return null

  // Type assertion for cost matrix data structure
  type CostMatrixType = {
    trenching_per_m?: Record<string, { cost: number; description?: string; slope_range?: string }>
    landcover_per_m?: Record<string, { name: string; cost: number; description?: string }>
    road_crossings?: Record<string, number>
    railway_crossings?: Record<string, number>
    waterway_crossings?: Record<string, number>
    powerline_crossing?: number
    regional_multiplier?: number
    base_construction_per_m?: number
    reference?: string
    version?: string
    calibration_date?: string
  }
  const costMatrix = metadata?.cost_matrix as CostMatrixType | undefined

  // Format currency
  const formatCurrency = (value: number) => {
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(2)}M`
    } else if (value >= 1000) {
      return `$${(value / 1000).toFixed(1)}K`
    }
    return `$${value.toFixed(0)}`
  }

  // Format route name
  const formatRouteName = (id: string) => {
    let name = id
    if (project) {
      const prefix = `${project}_`
      if (name.startsWith(prefix)) {
        name = name.substring(prefix.length)
      }
    }
    return name.replace(/_/g, ' ')
  }

  // Parse trenching costs
  const getTrenchingCosts = (): CostRate[] => {
    if (!costMatrix?.trenching_per_m) return []
    return Object.entries(costMatrix.trenching_per_m).map(([key, value]) => ({
      name: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      cost: value.cost,
      description: value.description,
      slope_range: value.slope_range
    }))
  }

  // Parse landcover costs
  const getLandcoverCosts = (): CostRate[] => {
    if (!costMatrix?.landcover_per_m) return []
    return Object.entries(costMatrix.landcover_per_m)
      .map(([, value]) => ({
        name: value.name,
        cost: value.cost,
        description: value.description
      }))
      .sort((a, b) => a.cost - b.cost)
  }

  // Parse road crossing costs
  const getRoadCrossingCosts = (): CostRate[] => {
    if (!costMatrix?.road_crossings) return []
    return Object.entries(costMatrix.road_crossings)
      .filter(([key]) => key !== 'default')
      .map(([key, value]) => ({
        name: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        cost: value
      }))
      .sort((a, b) => a.cost - b.cost)
  }

  // Parse railway crossing costs
  const getRailwayCrossingCosts = (): CostRate[] => {
    if (!costMatrix?.railway_crossings) return []
    return Object.entries(costMatrix.railway_crossings)
      .filter(([key]) => key !== 'default')
      .map(([key, value]) => ({
        name: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        cost: value
      }))
      .sort((a, b) => a.cost - b.cost)
  }

  // Parse waterway crossing costs
  const getWaterwayCrossingCosts = (): CostRate[] => {
    if (!costMatrix?.waterway_crossings) return []
    return Object.entries(costMatrix.waterway_crossings)
      .filter(([key]) => key !== 'default')
      .map(([key, value]) => ({
        name: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        cost: value
      }))
      .sort((a, b) => a.cost - b.cost)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-[#0a0a0a]/95 backdrop-blur-xl border border-green-500/30 rounded-lg shadow-[0_0_40px_-10px_rgba(34,197,94,0.4)] w-[900px] max-h-[85vh] flex flex-col font-mono overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-green-500/20 bg-green-900/10 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-green-500/20 rounded-sm">
              <DollarSign className="w-4 h-4 text-green-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Cost Matrix</h2>
              <p className="text-[10px] text-green-400/60">{formatRouteName(routeId)}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-white/10 rounded-sm transition-colors text-white/50 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-green-400" />
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <p className="text-[11px] text-red-400">{error}</p>
            </div>
          )}

          {!loading && !error && !costMatrix && (
            <div className="flex flex-col items-center justify-center py-12 text-white/30">
              <Info className="w-8 h-8 mb-3 opacity-50" />
              <p className="text-sm font-medium">No Cost Matrix Available</p>
              <p className="text-[11px] text-white/20 mt-1">This route does not have a cost matrix in its metadata</p>
            </div>
          )}

          {!loading && !error && costMatrix && (
            <div className="space-y-6">
              {/* Matrix Info Header */}
              <div className="flex items-center justify-between p-3 bg-green-500/5 border border-green-500/10 rounded-lg">
                <div>
                  <p className="text-[10px] text-green-400/60 uppercase tracking-wider">Version</p>
                  <p className="text-sm text-white font-medium">{(costMatrix.version as string) || '1.0'}</p>
                </div>
                <div>
                  <p className="text-[10px] text-green-400/60 uppercase tracking-wider">Calibration Date</p>
                  <p className="text-sm text-white font-medium">{(costMatrix.calibration_date as string) || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-[10px] text-green-400/60 uppercase tracking-wider">Regional Multiplier</p>
                  <p className="text-sm text-white font-medium">{(costMatrix.regional_multiplier as number) || 1.0}x</p>
                </div>
                <div className="max-w-[300px]">
                  <p className="text-[10px] text-green-400/60 uppercase tracking-wider">Reference</p>
                  <p className="text-[10px] text-white/70 truncate">{(costMatrix.reference as string) || 'Standard rates'}</p>
                </div>
              </div>

              {/* Base Construction */}
              <div className="p-3 bg-white/[0.02] border border-white/5 rounded-lg">
                <div className="flex items-center gap-2 mb-3">
                  <CircleDot className="w-4 h-4 text-green-400" />
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">Base Construction</h3>
                </div>
                <div className="flex items-center justify-between p-2 bg-green-500/10 rounded">
                  <span className="text-[11px] text-white/70">Base rate per meter</span>
                  <span className="text-sm font-bold text-green-400">${(costMatrix.base_construction_per_m as number)?.toFixed(0) || '800'}/m</span>
                </div>
              </div>

              {/* Trenching Costs */}
              {getTrenchingCosts().length > 0 && (
                <div className="p-3 bg-white/[0.02] border border-white/5 rounded-lg">
                  <div className="flex items-center gap-2 mb-3">
                    <Mountain className="w-4 h-4 text-amber-400" />
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider">Trenching Costs by Terrain</h3>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {getTrenchingCosts().map((item) => (
                      <div
                        key={item.name}
                        className="flex items-center justify-between p-2 bg-amber-500/5 border border-amber-500/10 rounded"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] text-white font-medium">{item.name}</p>
                          {item.slope_range && (
                            <p className="text-[9px] text-amber-400/60">{item.slope_range}</p>
                          )}
                          {item.description && (
                            <p className="text-[9px] text-white/40 truncate">{item.description}</p>
                          )}
                        </div>
                        <span className="text-xs font-bold text-amber-400 ml-2">${item.cost}/m</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Landcover Costs */}
              {getLandcoverCosts().length > 0 && (
                <div className="p-3 bg-white/[0.02] border border-white/5 rounded-lg">
                  <div className="flex items-center gap-2 mb-3">
                    <TreeDeciduous className="w-4 h-4 text-emerald-400" />
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider">Landcover Costs</h3>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {getLandcoverCosts().map((item) => (
                      <div
                        key={item.name}
                        className="flex items-center justify-between p-2 bg-emerald-500/5 border border-emerald-500/10 rounded"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] text-white font-medium">{item.name}</p>
                          {item.description && (
                            <p className="text-[9px] text-white/40 truncate" title={item.description}>{item.description}</p>
                          )}
                        </div>
                        <span className="text-xs font-bold text-emerald-400 ml-2">${item.cost}/m</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Road Crossings */}
              {getRoadCrossingCosts().length > 0 && (
                <div className="p-3 bg-white/[0.02] border border-white/5 rounded-lg">
                  <div className="flex items-center gap-2 mb-3">
                    <MapPin className="w-4 h-4 text-blue-400" />
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider">Road Crossing Costs</h3>
                    <span className="text-[9px] text-white/40">(per crossing)</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {getRoadCrossingCosts().map((item) => (
                      <div
                        key={item.name}
                        className="flex items-center justify-between p-2 bg-blue-500/5 border border-blue-500/10 rounded"
                      >
                        <p className="text-[11px] text-white font-medium">{item.name}</p>
                        <span className="text-xs font-bold text-blue-400">{formatCurrency(item.cost)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Railway Crossings */}
              {getRailwayCrossingCosts().length > 0 && (
                <div className="p-3 bg-white/[0.02] border border-white/5 rounded-lg">
                  <div className="flex items-center gap-2 mb-3">
                    <Train className="w-4 h-4 text-orange-400" />
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider">Railway Crossing Costs</h3>
                    <span className="text-[9px] text-white/40">(per crossing)</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {getRailwayCrossingCosts().map((item) => (
                      <div
                        key={item.name}
                        className="flex items-center justify-between p-2 bg-orange-500/5 border border-orange-500/10 rounded"
                      >
                        <p className="text-[11px] text-white font-medium">{item.name}</p>
                        <span className="text-xs font-bold text-orange-400">{formatCurrency(item.cost)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Waterway Crossings */}
              {getWaterwayCrossingCosts().length > 0 && (
                <div className="p-3 bg-white/[0.02] border border-white/5 rounded-lg">
                  <div className="flex items-center gap-2 mb-3">
                    <Droplets className="w-4 h-4 text-cyan-400" />
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider">Waterway Crossing Costs</h3>
                    <span className="text-[9px] text-white/40">(per crossing)</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {getWaterwayCrossingCosts().map((item) => (
                      <div
                        key={item.name}
                        className="flex items-center justify-between p-2 bg-cyan-500/5 border border-cyan-500/10 rounded"
                      >
                        <p className="text-[11px] text-white font-medium">{item.name}</p>
                        <span className="text-xs font-bold text-cyan-400">{formatCurrency(item.cost)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Powerline Crossing */}
              {costMatrix.powerline_crossing && (
                <div className="p-3 bg-white/[0.02] border border-white/5 rounded-lg">
                  <div className="flex items-center gap-2 mb-3">
                    <Zap className="w-4 h-4 text-yellow-400" />
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider">Powerline Crossing</h3>
                  </div>
                  <div className="flex items-center justify-between p-2 bg-yellow-500/10 rounded">
                    <span className="text-[11px] text-white/70">Per crossing</span>
                    <span className="text-sm font-bold text-yellow-400">{formatCurrency(costMatrix.powerline_crossing as number)}</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-green-500/20 bg-green-900/5 shrink-0">
          <p className="text-[9px] text-green-400/50 text-center">
            Cost matrix defines the per-unit rates used to calculate route construction costs
          </p>
        </div>
      </div>
    </div>
  )
}
