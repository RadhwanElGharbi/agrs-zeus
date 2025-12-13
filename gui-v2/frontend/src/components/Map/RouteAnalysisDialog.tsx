'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { X, BarChart3, Loader2, AlertCircle, Mountain, TreeDeciduous, TrendingUp, TrendingDown, Shovel, Download, ChevronLeft, ChevronRight, Table } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fetchRouteProfile, fetchEarthworksAnalysis, type RouteProfileResponse, type ElevationPoint, type LandcoverPoint, type EarthworksResponse, type EarthworksCrossSection } from '@/lib/api/dataClient'

interface RouteAnalysisDialogProps {
  isOpen: boolean
  onClose: () => void
  routeId: string
  project: string
}

// Landcover color mapping
const LANDCOVER_COLORS: Record<number, { color: string; name: string }> = {
  0: { color: '#9ca3af', name: 'No data' },
  10: { color: '#166534', name: 'Tree cover' },
  20: { color: '#65a30d', name: 'Shrubland' },
  30: { color: '#84cc16', name: 'Grassland' },
  40: { color: '#facc15', name: 'Cropland' },
  50: { color: '#dc2626', name: 'Built-up' },
  60: { color: '#d4d4d4', name: 'Bare/sparse' },
  70: { color: '#e0f2fe', name: 'Snow/ice' },
  80: { color: '#0ea5e9', name: 'Water bodies' },
  90: { color: '#14b8a6', name: 'Wetland' },
  95: { color: '#0d9488', name: 'Mangroves' },
  100: { color: '#a3e635', name: 'Moss/lichen' },
}

export function RouteAnalysisDialog({ isOpen, onClose, routeId, project }: RouteAnalysisDialogProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [profileData, setProfileData] = useState<RouteProfileResponse | null>(null)
  const [activeTab, setActiveTab] = useState<'elevation' | 'landcover' | 'earthworks'>('elevation')

  // Earthworks state
  const [earthworksLoading, setEarthworksLoading] = useState(false)
  const [earthworksError, setEarthworksError] = useState<string | null>(null)
  const [earthworksData, setEarthworksData] = useState<EarthworksResponse | null>(null)
  const [selectedSection, setSelectedSection] = useState<number>(0)
  const [earthworksParams, setEarthworksParams] = useState({
    row_width: 20,
    section_spacing: 50,
    grading_slope: 10
  })

  // Hover state for chart inspection
  const [hoverInfo, setHoverInfo] = useState<{
    x: number
    distance: number
    elevation: number
    percentX: number
  } | null>(null)
  const chartRef = React.useRef<HTMLDivElement>(null)

  // Fetch route profile data from DEM when dialog opens
  useEffect(() => {
    if (isOpen && routeId && project) {
      setLoading(true)
      setError(null)

      // Ensure route ID has .geojson extension
      const routeFileName = routeId.endsWith('.geojson') ? routeId : `${routeId}.geojson`

      fetchRouteProfile(project, routeFileName, 1000)
        .then(data => {
          setProfileData(data)
        })
        .catch(err => setError(err.message))
        .finally(() => setLoading(false))
    }
  }, [isOpen, routeId, project])

  // Fetch earthworks data when tab is selected
  useEffect(() => {
    if (isOpen && routeId && project && activeTab === 'earthworks' && !earthworksData && !earthworksLoading) {
      setEarthworksLoading(true)
      setEarthworksError(null)

      const routeFileName = routeId.endsWith('.geojson') ? routeId : `${routeId}.geojson`

      fetchEarthworksAnalysis(project, routeFileName, earthworksParams)
        .then(data => {
          setEarthworksData(data)
          setSelectedSection(0)
        })
        .catch(err => setEarthworksError(err.message))
        .finally(() => setEarthworksLoading(false))
    }
  }, [isOpen, routeId, project, activeTab, earthworksData, earthworksLoading, earthworksParams])

  // Function to recalculate earthworks with new parameters
  const recalculateEarthworks = () => {
    if (!routeId || !project) return
    setEarthworksLoading(true)
    setEarthworksError(null)
    setEarthworksData(null)

    const routeFileName = routeId.endsWith('.geojson') ? routeId : `${routeId}.geojson`

    fetchEarthworksAnalysis(project, routeFileName, earthworksParams)
      .then(data => {
        setEarthworksData(data)
        setSelectedSection(0)
      })
      .catch(err => setEarthworksError(err.message))
      .finally(() => setEarthworksLoading(false))
  }

  // Get valid elevation points (filter out nulls)
  const validElevationPoints = useMemo(() => {
    if (!profileData?.elevation_profile) return []
    return profileData.elevation_profile.filter(p => p.elevation !== null) as Array<ElevationPoint & { elevation: number }>
  }, [profileData])

  // Calculate landcover distribution
  const landcoverDistribution = useMemo(() => {
    if (!profileData?.landcover_profile || profileData.landcover_profile.length === 0) return []

    const distribution: Record<number, { class: number; name: string; count: number; color: string }> = {}
    const sampleSpacing = profileData.statistics.total_distance / profileData.landcover_profile.length

    profileData.landcover_profile.forEach(p => {
      if (p.landcover_class === null) return
      const cls = p.landcover_class
      if (!distribution[cls]) {
        const info = LANDCOVER_COLORS[cls] || { color: '#6b7280', name: `Class ${cls}` }
        distribution[cls] = {
          class: cls,
          name: info.name,
          count: 0,
          color: info.color
        }
      }
      distribution[cls].count++
    })

    const totalSamples = profileData.landcover_profile.filter(p => p.landcover_class !== null).length

    return Object.values(distribution)
      .map(d => ({
        ...d,
        length: d.count * sampleSpacing,
        percentage: (d.count / totalSamples) * 100
      }))
      .sort((a, b) => b.percentage - a.percentage)
  }, [profileData])

  // Format distance
  const formatDistance = (meters: number) => {
    if (meters >= 1000) return `${(meters / 1000).toFixed(2)} km`
    return `${meters.toFixed(0)} m`
  }

  // Handle mouse move on chart for inspection
  const handleChartMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!chartRef.current || !profileData?.statistics || validElevationPoints.length === 0) return

    const rect = chartRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const percentX = x / rect.width

    // Find the elevation at this position
    const targetDistance = percentX * profileData.statistics.total_distance

    // Find closest point
    let closestPoint = validElevationPoints[0]
    let minDiff = Math.abs(validElevationPoints[0].distance - targetDistance)

    for (const point of validElevationPoints) {
      const diff = Math.abs(point.distance - targetDistance)
      if (diff < minDiff) {
        minDiff = diff
        closestPoint = point
      }
    }

    setHoverInfo({
      x,
      distance: closestPoint.distance,
      elevation: closestPoint.elevation,
      percentX
    })
  }

  const handleChartMouseLeave = () => {
    setHoverInfo(null)
  }

  // Get starting elevation for change calculation
  const startElevation = validElevationPoints.length > 0 ? validElevationPoints[0].elevation : 0

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

  if (!isOpen) return null

  const stats = profileData?.statistics

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative bg-[#0a0a0a]/95 backdrop-blur-xl border border-red-500/20 rounded-lg shadow-[0_0_50px_-20px_rgba(239,68,68,0.5)] w-[1400px] max-h-[90vh] flex flex-col font-mono overflow-hidden transition-all duration-300">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-red-500/20 bg-red-900/10 shrink-0">
          <div className="flex items-center gap-4">
            <div className="p-2 bg-red-500/20 rounded-md shadow-[0_0_15px_-3px_rgba(239,68,68,0.4)]">
              <BarChart3 className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-wide uppercase">Route Analysis</h2>
              <p className="text-[11px] text-red-200/50 font-mono">{formatRouteName(routeId)}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-md transition-colors text-white/50 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-red-500/20 bg-black/40 shrink-0">
          <button
            onClick={() => setActiveTab('elevation')}
            className={cn(
              "flex items-center gap-2 px-6 py-3 text-xs font-bold uppercase tracking-wider transition-all border-b-2",
              activeTab === 'elevation'
                ? "text-red-400 border-red-400 bg-red-500/10"
                : "text-white/40 border-transparent hover:text-white/70 hover:bg-white/5"
            )}
          >
            <Mountain className="w-4 h-4" />
            Elevation Profile
          </button>
          <button
            onClick={() => setActiveTab('landcover')}
            className={cn(
              "flex items-center gap-2 px-6 py-3 text-xs font-bold uppercase tracking-wider transition-all border-b-2",
              activeTab === 'landcover'
                ? "text-red-400 border-red-400 bg-red-500/10"
                : "text-white/40 border-transparent hover:text-white/70 hover:bg-white/5"
            )}
          >
            <TreeDeciduous className="w-4 h-4" />
            Land Cover
          </button>
          <button
            onClick={() => setActiveTab('earthworks')}
            className={cn(
              "flex items-center gap-2 px-6 py-3 text-xs font-bold uppercase tracking-wider transition-all border-b-2",
              activeTab === 'earthworks'
                ? "text-red-400 border-red-400 bg-red-500/10"
                : "text-white/40 border-transparent hover:text-white/70 hover:bg-white/5"
            )}
          >
            <Shovel className="w-4 h-4" />
            Earthworks
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading && (
            <div className="flex flex-col items-center justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-cyan-400 mb-4" />
              <p className="text-sm text-white/50">Sampling DEM data along route...</p>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {!loading && !error && !profileData && (
            <div className="flex flex-col items-center justify-center py-16 text-white/30">
              <BarChart3 className="w-12 h-12 mb-4 opacity-50" />
              <p className="text-sm font-medium">No Profile Data Available</p>
              <p className="text-xs text-white/20 mt-1">Could not extract elevation data for this route</p>
            </div>
          )}

          {!loading && !error && profileData && stats && (
            <>
              {/* Elevation Profile Tab */}
              {activeTab === 'elevation' && (
                <div className="space-y-6">
                  {/* Stats Summary */}
                  <div className="grid grid-cols-4 gap-4">
                    <div className="p-4 bg-cyan-500/5 border border-cyan-500/20 rounded-lg">
                      <p className="text-[10px] text-cyan-400/60 uppercase tracking-wider mb-1">Min Elevation</p>
                      <p className="text-xl font-bold text-white">{stats.min_elevation.toFixed(0)}m</p>
                    </div>
                    <div className="p-4 bg-cyan-500/5 border border-cyan-500/20 rounded-lg">
                      <p className="text-[10px] text-cyan-400/60 uppercase tracking-wider mb-1">Max Elevation</p>
                      <p className="text-xl font-bold text-white">{stats.max_elevation.toFixed(0)}m</p>
                    </div>
                    <div className="p-4 bg-green-500/5 border border-green-500/20 rounded-lg">
                      <div className="flex items-center gap-1 mb-1">
                        <TrendingUp className="w-3 h-3 text-green-400" />
                        <p className="text-[10px] text-green-400/60 uppercase tracking-wider">Total Climb</p>
                      </div>
                      <p className="text-xl font-bold text-green-400">+{stats.total_climb.toFixed(0)}m</p>
                    </div>
                    <div className="p-4 bg-red-500/5 border border-red-500/20 rounded-lg">
                      <div className="flex items-center gap-1 mb-1">
                        <TrendingDown className="w-3 h-3 text-red-400" />
                        <p className="text-[10px] text-red-400/60 uppercase tracking-wider">Total Descent</p>
                      </div>
                      <p className="text-xl font-bold text-red-400">-{stats.total_descent.toFixed(0)}m</p>
                    </div>
                  </div>

                  {/* Elevation Chart */}
                  <div className="p-4 bg-white/[0.02] border border-white/10 rounded-lg">
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-4">Elevation Profile (from DEM)</h3>

                    {/* Chart Container */}
                    {(() => {
                      // Y-axis: 0m to 2x max elevation
                      const yMin = 0
                      const yMax = Math.ceil(stats.max_elevation * 2)
                      const yRange = yMax - yMin
                      const yMid = yMax / 2

                      return (
                        <div className="relative h-[250px]">
                          {/* Y-axis labels */}
                          <div className="absolute left-0 top-2 bottom-6 w-14 flex flex-col justify-between text-[9px] text-white/40 text-right pr-2">
                            <span>{yMax}m</span>
                            <span>{yMid.toFixed(0)}m</span>
                            <span>{yMin}m</span>
                          </div>

                          {/* Chart Area */}
                          <div
                            ref={chartRef}
                            className="absolute left-16 right-2 top-2 bottom-6 bg-gradient-to-b from-cyan-950/20 to-transparent rounded overflow-hidden cursor-crosshair"
                            onMouseMove={handleChartMouseMove}
                            onMouseLeave={handleChartMouseLeave}
                          >
                            {/* Grid lines */}
                            <div className="absolute inset-0 pointer-events-none">
                              <div className="absolute w-full h-px bg-white/10 top-0" />
                              <div className="absolute w-full h-px bg-white/5 top-1/4" />
                              <div className="absolute w-full h-px bg-white/10 top-1/2" />
                              <div className="absolute w-full h-px bg-white/5 top-3/4" />
                              <div className="absolute w-full h-px bg-white/10 bottom-0" />
                            </div>

                            {/* SVG Terrain Profile */}
                            {validElevationPoints.length > 0 && (
                              <svg
                                className="w-full h-full"
                                viewBox={`0 0 ${stats.total_distance} ${yRange}`}
                                preserveAspectRatio="none"
                              >
                                <defs>
                                  {/* Terrain gradient - earth/brown tones like reference */}
                                  <linearGradient id="terrainGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                                    <stop offset="0%" stopColor="#8B4513" stopOpacity="0.95" />
                                    <stop offset="40%" stopColor="#A0522D" stopOpacity="0.85" />
                                    <stop offset="70%" stopColor="#CD853F" stopOpacity="0.7" />
                                    <stop offset="100%" stopColor="#DEB887" stopOpacity="0.5" />
                                  </linearGradient>
                                </defs>

                                {/* Terrain fill - the land mass with smooth curve */}
                                <path
                                  d={(() => {
                                    const points = validElevationPoints
                                    const maxDist = stats.total_distance

                                    if (points.length < 2) return ''

                                    // Convert points to chart coordinates (0 at bottom, yMax at top)
                                    const chartPoints = points.map(p => ({
                                      x: p.distance,
                                      y: yRange - p.elevation  // elevation from 0, inverted for SVG
                                    }))

                                    // Start at bottom-left, then move to first point
                                    let path = `M 0 ${yRange} L ${chartPoints[0].x} ${chartPoints[0].y}`

                                    // Use smooth quadratic bezier curves for natural terrain look
                                    for (let i = 1; i < chartPoints.length; i++) {
                                      const prev = chartPoints[i - 1]
                                      const curr = chartPoints[i]
                                      // Control point at midpoint for smooth curve
                                      const cpX = (prev.x + curr.x) / 2
                                      path += ` Q ${prev.x} ${prev.y} ${cpX} ${(prev.y + curr.y) / 2}`
                                    }

                                    // Final segment to last point
                                    const last = chartPoints[chartPoints.length - 1]
                                    path += ` L ${last.x} ${last.y}`

                                    // Close path at bottom-right
                                    path += ` L ${maxDist} ${yRange} Z`
                                    return path
                                  })()}
                                  fill="url(#terrainGradient)"
                                />

                                {/* Terrain outline - smooth curve */}
                                <path
                                  d={(() => {
                                    const points = validElevationPoints

                                    if (points.length < 2) return ''

                                    const chartPoints = points.map(p => ({
                                      x: p.distance,
                                      y: yRange - p.elevation
                                    }))

                                    let path = `M ${chartPoints[0].x} ${chartPoints[0].y}`

                                    // Smooth curve through points
                                    for (let i = 1; i < chartPoints.length; i++) {
                                      const prev = chartPoints[i - 1]
                                      const curr = chartPoints[i]
                                      const cpX = (prev.x + curr.x) / 2
                                      path += ` Q ${prev.x} ${prev.y} ${cpX} ${(prev.y + curr.y) / 2}`
                                    }

                                    // Final segment
                                    const last = chartPoints[chartPoints.length - 1]
                                    path += ` L ${last.x} ${last.y}`

                                    return path
                                  })()}
                                  fill="none"
                                  stroke="#8B4513"
                                  strokeWidth={yRange * 0.005}
                                />
                              </svg>
                            )}

                            {/* Hover inspection line and tooltip */}
                            {hoverInfo && (
                              <>
                                {/* Vertical line */}
                                <div
                                  className="absolute top-0 bottom-0 w-px bg-cyan-400 pointer-events-none"
                                  style={{ left: `${hoverInfo.percentX * 100}%` }}
                                />

                                {/* Dot on the terrain line */}
                                <div
                                  className="absolute w-3 h-3 bg-cyan-400 rounded-full border-2 border-white shadow-lg pointer-events-none transform -translate-x-1/2 -translate-y-1/2"
                                  style={{
                                    left: `${hoverInfo.percentX * 100}%`,
                                    top: `${100 - (hoverInfo.elevation / yMax) * 100}%`
                                  }}
                                />

                                {/* Tooltip */}
                                <div
                                  className="absolute pointer-events-none transform -translate-x-1/2 z-10"
                                  style={{
                                    left: `${Math.min(Math.max(hoverInfo.percentX * 100, 10), 90)}%`,
                                    top: '8px'
                                  }}
                                >
                                  <div className="bg-gray-900/95 border border-cyan-500/50 rounded-lg px-3 py-2 shadow-xl min-w-[100px]">
                                    <div className="flex items-center justify-between gap-3 mb-1">
                                      <span className="text-[9px] text-white/50 uppercase">Distance</span>
                                      <span className="text-cyan-400 text-xs font-bold">{formatDistance(hoverInfo.distance)}</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-3 mb-1">
                                      <span className="text-[9px] text-white/50 uppercase">Elevation</span>
                                      <span className="text-white text-xs font-bold">{hoverInfo.elevation.toFixed(1)}m</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-3">
                                      <span className="text-[9px] text-white/50 uppercase">Change</span>
                                      <span className={cn(
                                        "text-xs font-bold",
                                        hoverInfo.elevation - startElevation >= 0 ? "text-green-400" : "text-red-400"
                                      )}>
                                        {hoverInfo.elevation - startElevation >= 0 ? '+' : ''}{(hoverInfo.elevation - startElevation).toFixed(1)}m
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </>
                            )}
                          </div>

                          {/* X-axis labels */}
                          <div className="absolute left-16 right-2 bottom-0 h-5 flex justify-between text-[9px] text-white/40">
                            <span>0</span>
                            <span>{formatDistance(stats.total_distance / 4)}</span>
                            <span>{formatDistance(stats.total_distance / 2)}</span>
                            <span>{formatDistance((stats.total_distance * 3) / 4)}</span>
                            <span>{formatDistance(stats.total_distance)}</span>
                          </div>
                        </div>
                      )
                    })()}
                  </div>

                  {/* Route Info */}
                  <div className="p-3 bg-cyan-500/5 border border-cyan-500/10 rounded-lg">
                    <p className="text-[10px] text-cyan-400/60">
                      Profile generated from {stats.sample_count} DEM samples along {formatDistance(stats.total_distance)} route
                    </p>
                  </div>
                </div>
              )}

              {/* Landcover Profile Tab */}
              {activeTab === 'landcover' && (
                <div className="space-y-6">
                  {/* Landcover Distribution Summary */}
                  <div className="p-4 bg-white/[0.02] border border-white/10 rounded-lg">
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-4">Land Cover Distribution</h3>

                    {landcoverDistribution.length > 0 ? (
                      <>
                        {/* Stacked Bar */}
                        <div className="h-8 rounded-lg overflow-hidden flex mb-4">
                          {landcoverDistribution.map(lc => (
                            <div
                              key={lc.class}
                              className="h-full transition-all duration-300 hover:opacity-80"
                              style={{
                                width: `${lc.percentage}%`,
                                backgroundColor: lc.color
                              }}
                              title={`${lc.name}: ${lc.percentage.toFixed(1)}%`}
                            />
                          ))}
                        </div>

                        {/* Legend */}
                        <div className="grid grid-cols-2 gap-3">
                          {landcoverDistribution.map(lc => (
                            <div key={lc.class} className="flex items-center gap-3 p-2 bg-white/[0.02] rounded">
                              <div
                                className="w-4 h-4 rounded shrink-0"
                                style={{ backgroundColor: lc.color }}
                              />
                              <div className="flex-1 min-w-0">
                                <p className="text-[11px] text-white font-medium truncate">{lc.name}</p>
                                <p className="text-[9px] text-white/40">Class {lc.class}</p>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="text-[11px] text-white font-bold">{lc.percentage.toFixed(1)}%</p>
                                <p className="text-[9px] text-white/40">{formatDistance(lc.length)}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-white/40 text-center py-8">No landcover data available</p>
                    )}
                  </div>

                  {/* Landcover Profile Along Route */}
                  {profileData.landcover_profile.length > 0 && (
                    <div className="p-4 bg-white/[0.02] border border-white/10 rounded-lg">
                      <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-4">Land Cover Along Route</h3>

                      {/* Linear Profile */}
                      <div className="relative">
                        {/* Profile Bar */}
                        <div className="h-12 rounded-lg overflow-hidden flex">
                          {profileData.landcover_profile.map((p, i) => {
                            const color = p.landcover_class !== null
                              ? (LANDCOVER_COLORS[p.landcover_class]?.color || '#6b7280')
                              : '#374151'
                            return (
                              <div
                                key={i}
                                className="h-full"
                                style={{
                                  width: `${100 / profileData.landcover_profile.length}%`,
                                  backgroundColor: color
                                }}
                              />
                            )
                          })}
                        </div>

                        {/* Distance markers */}
                        <div className="flex justify-between mt-2 text-[9px] text-white/40">
                          <span>Start</span>
                          <span>{formatDistance(stats.total_distance / 2)}</span>
                          <span>End ({formatDistance(stats.total_distance)})</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Detailed Breakdown Table */}
                  {landcoverDistribution.length > 0 && (
                    <div className="p-4 bg-white/[0.02] border border-white/10 rounded-lg">
                      <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-3">Detailed Breakdown</h3>
                      <div className="overflow-x-auto">
                        <table className="w-full text-[11px]">
                          <thead>
                            <tr className="border-b border-white/10">
                              <th className="text-left py-2 px-3 text-white/50 font-medium">Land Cover</th>
                              <th className="text-right py-2 px-3 text-white/50 font-medium">Length</th>
                              <th className="text-right py-2 px-3 text-white/50 font-medium">Percentage</th>
                            </tr>
                          </thead>
                          <tbody>
                            {landcoverDistribution.map(lc => (
                              <tr key={lc.class} className="border-b border-white/5 hover:bg-white/[0.02]">
                                <td className="py-2 px-3">
                                  <div className="flex items-center gap-2">
                                    <div
                                      className="w-3 h-3 rounded"
                                      style={{ backgroundColor: lc.color }}
                                    />
                                    <span className="text-white">{lc.name}</span>
                                  </div>
                                </td>
                                <td className="text-right py-2 px-3 text-white/70">{formatDistance(lc.length)}</td>
                                <td className="text-right py-2 px-3 text-white font-medium">{lc.percentage.toFixed(1)}%</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* Earthworks Tab */}
          {activeTab === 'earthworks' && (
            <div className="space-y-6">
              {earthworksLoading && (
                <div className="flex flex-col items-center justify-center py-16">
                  <Loader2 className="w-8 h-8 animate-spin text-red-500 mb-4" />
                  <p className="text-sm text-white/50 font-mono uppercase tracking-wider">Computing earthworks analysis...</p>
                  <p className="text-xs text-white/30 mt-1">Generating cross-sections and calculating volumes</p>
                </div>
              )}

              {earthworksError && (
                <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-sm">
                  <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
                  <p className="text-sm text-red-400 font-mono">{earthworksError}</p>
                </div>
              )}

              {!earthworksLoading && !earthworksError && earthworksData && (
                <>
                  {/* Top Row: Parameters & Summary */}
                  <div className="grid grid-cols-12 gap-6">
                    {/* Parameters Panel */}
                    <div className="col-span-3 p-4 bg-white/[0.02] border border-white/10 rounded-sm">
                      <h3 className="text-xs font-bold text-red-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
                        Parameters
                      </h3>
                      <div className="space-y-4">
                        <div>
                          <label className="block text-[10px] text-white/50 uppercase tracking-wider mb-1">ROW Width (m)</label>
                          <input
                            type="number"
                            value={earthworksParams.row_width}
                            onChange={(e) => setEarthworksParams(prev => ({ ...prev, row_width: Number(e.target.value) }))}
                            className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-sm text-white text-xs font-mono focus:border-red-500/50 focus:outline-none transition-colors"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-white/50 uppercase tracking-wider mb-1">Max Grade Slope (%)</label>
                          <input
                            type="number"
                            value={earthworksParams.grading_slope}
                            onChange={(e) => setEarthworksParams(prev => ({ ...prev, grading_slope: Number(e.target.value) }))}
                            className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-sm text-white text-xs font-mono focus:border-red-500/50 focus:outline-none transition-colors"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-white/50 uppercase tracking-wider mb-1">Section Spacing (m)</label>
                          <input
                            type="number"
                            value={earthworksParams.section_spacing}
                            onChange={(e) => setEarthworksParams(prev => ({ ...prev, section_spacing: Number(e.target.value) }))}
                            className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-sm text-white text-xs font-mono focus:border-red-500/50 focus:outline-none transition-colors"
                          />
                        </div>
                        <button
                          onClick={recalculateEarthworks}
                          className="w-full mt-2 px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-bold uppercase tracking-wider rounded-sm shadow-[0_0_15px_-5px_rgba(239,68,68,0.4)] transition-all"
                        >
                          Recalculate
                        </button>
                      </div>
                    </div>

                    {/* Summary Statistics */}
                    <div className="col-span-9 grid grid-cols-4 gap-4">
                      <div className="p-4 bg-white/[0.02] border border-white/10 rounded-sm flex flex-col justify-between">
                        <p className="text-[10px] text-white/40 uppercase tracking-wider">Total Length</p>
                        <div className="flex items-baseline gap-1">
                          <p className="text-2xl font-bold text-white">{(earthworksData.summary.total_length_m / 1000).toFixed(2)}</p>
                          <span className="text-xs text-white/40">km</span>
                        </div>
                        <div className="w-full bg-white/10 h-0.5 mt-2">
                          <div className="bg-white/40 h-full" style={{ width: '100%' }} />
                        </div>
                      </div>

                      <div className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-sm flex flex-col justify-between">
                        <p className="text-[10px] text-amber-500/60 uppercase tracking-wider">Total Cut Volume</p>
                        <div className="flex items-baseline gap-1">
                          <p className="text-2xl font-bold text-amber-500">{earthworksData.summary.total_cut_m3.toLocaleString()}</p>
                          <span className="text-xs text-amber-500/40">m³</span>
                        </div>
                        <div className="w-full bg-amber-500/10 h-0.5 mt-2">
                          <div className="bg-amber-500/40 h-full" style={{ width: '75%' }} />
                        </div>
                      </div>

                      <div className="p-4 bg-cyan-500/5 border border-cyan-500/20 rounded-sm flex flex-col justify-between">
                        <p className="text-[10px] text-cyan-500/60 uppercase tracking-wider">Total Fill Volume</p>
                        <div className="flex items-baseline gap-1">
                          <p className="text-2xl font-bold text-cyan-500">{earthworksData.summary.total_fill_m3.toLocaleString()}</p>
                          <span className="text-xs text-cyan-500/40">m³</span>
                        </div>
                        <div className="w-full bg-cyan-500/10 h-0.5 mt-2">
                          <div className="bg-cyan-500/40 h-full" style={{ width: '60%' }} />
                        </div>
                      </div>

                      <div className="p-4 bg-white/[0.02] border border-white/10 rounded-sm flex flex-col justify-between">
                        <p className="text-[10px] text-white/40 uppercase tracking-wider">Net Balance</p>
                        <div className="flex items-baseline gap-1">
                          <p className={cn(
                            "text-2xl font-bold",
                            earthworksData.summary.mass_haul_balance_m3 >= 0 ? "text-amber-500" : "text-cyan-500"
                          )}>
                            {earthworksData.summary.mass_haul_balance_m3 > 0 ? '+' : ''}{earthworksData.summary.mass_haul_balance_m3.toLocaleString()}
                          </p>
                          <span className="text-xs text-white/40">m³</span>
                        </div>
                        <p className="text-[9px] text-white/30 mt-1">
                          {earthworksData.summary.mass_haul_balance_m3 > 0 ? 'Surplus Material' : 'Import Required'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Middle Row: Charts */}
                  <div className="grid grid-cols-2 gap-6 h-[320px]">
                    {/* Mass Haul Diagram */}
                    <div className="p-4 bg-white/[0.02] border border-white/10 rounded-sm flex flex-col">
                      <div className="flex items-center justify-between mb-4 shrink-0">
                        <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                          <TrendingUp className="w-3.5 h-3.5 text-white/40" />
                          Mass Haul Diagram
                        </h3>
                        <div className="flex gap-4 text-[9px] font-mono">
                          <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 bg-amber-500/80" />
                            <span className="text-white/50">Cut</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 bg-cyan-500/80" />
                            <span className="text-white/50">Fill</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <div className="w-2 h-0.5 bg-white/50" />
                            <span className="text-white/50">Balance</span>
                          </div>
                        </div>
                      </div>

                      <div className="relative flex-1 min-h-0 w-full">
                        {/* Y-axis labels */}
                        <div className="absolute left-0 top-0 bottom-6 w-12 flex flex-col justify-between text-[9px] text-white/30 text-right pr-2 font-mono">
                          <span>Max</span>
                          <span>0</span>
                          <span>Min</span>
                        </div>

                        {/* Chart Area */}
                        <div className="absolute left-12 right-0 top-0 bottom-6 bg-black/20 border border-white/5 rounded-sm overflow-hidden">
                          {/* Grid */}
                          <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-20">
                            <div className="w-full h-px bg-white/30" />
                            <div className="w-full h-px bg-white/10" />
                            <div className="w-full h-px bg-white/30" />
                            <div className="w-full h-px bg-white/10" />
                            <div className="w-full h-px bg-white/30" />
                          </div>

                          {/* Zero line */}
                          <div className="absolute w-full h-px bg-white/20 top-1/2" />

                          <svg className="w-full h-full" preserveAspectRatio="none">
                            {(() => {
                              const data = earthworksData.mass_haul_diagram
                              if (data.length === 0) return null

                              const maxCut = Math.max(...data.map(p => p.cut))
                              const maxFill = Math.max(...data.map(p => p.fill))
                              const maxBalance = Math.max(...data.map(p => Math.abs(p.balance)))
                              const maxVal = Math.max(maxCut, maxFill, maxBalance) || 1
                              const maxChainage = data[data.length - 1]?.chainage || 1

                              // Cut curve (amber)
                              const cutPath = data.map((p, i) => {
                                const x = (p.chainage / maxChainage) * 100
                                const y = 50 - (p.cut / maxVal) * 40
                                return `${i === 0 ? 'M' : 'L'} ${x}% ${y}%`
                              }).join(' ')
                              const cutArea = cutPath + ` L 100% 50% L 0% 50% Z`

                              // Fill curve (cyan)
                              const fillPath = data.map((p, i) => {
                                const x = (p.chainage / maxChainage) * 100
                                const y = 50 + (p.fill / maxVal) * 40
                                return `${i === 0 ? 'M' : 'L'} ${x}% ${y}%`
                              }).join(' ')
                              const fillArea = fillPath + ` L 100% 50% L 0% 50% Z`

                              // Balance curve (white)
                              const balancePath = data.map((p, i) => {
                                const x = (p.chainage / maxChainage) * 100
                                const y = 50 - (p.balance / maxVal) * 40
                                return `${i === 0 ? 'M' : 'L'} ${x}% ${y}%`
                              }).join(' ')

                              return (
                                <>
                                  <path d={cutArea} fill="#f59e0b" opacity="0.1" />
                                  <path d={cutPath} fill="none" stroke="#f59e0b" strokeWidth="1.5" />

                                  <path d={fillArea} fill="#06b6d4" opacity="0.1" />
                                  <path d={fillPath} fill="none" stroke="#06b6d4" strokeWidth="1.5" />

                                  <path d={balancePath} fill="none" stroke="#ffffff" strokeWidth="1.5" strokeDasharray="4 2" opacity="0.8" />
                                </>
                              )
                            })()}
                          </svg>
                        </div>

                        {/* X-axis labels */}
                        <div className="absolute left-12 right-0 bottom-0 h-5 flex justify-between text-[9px] text-white/30 font-mono pt-1">
                          <span>0</span>
                          <span>{(earthworksData.summary.total_length_m / 2000).toFixed(1)}</span>
                          <span>{(earthworksData.summary.total_length_m / 1000).toFixed(1)} km</span>
                        </div>
                      </div>
                    </div>

                    {/* Cross Section Viewer */}
                    <div className="p-4 bg-white/[0.02] border border-white/10 rounded-sm flex flex-col">
                      <div className="flex items-center justify-between mb-4 shrink-0">
                        <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                          <Mountain className="w-3.5 h-3.5 text-white/40" />
                          Cross Section Viewer
                        </h3>
                        <div className="flex items-center gap-2 bg-black/40 rounded-sm p-0.5 border border-white/10">
                          <button
                            onClick={() => setSelectedSection(Math.max(0, selectedSection - 1))}
                            disabled={selectedSection === 0}
                            className="p-1 hover:bg-white/10 rounded-sm disabled:opacity-30 transition-colors"
                          >
                            <ChevronLeft className="w-3 h-3 text-white" />
                          </button>
                          <span className="text-[10px] font-mono text-white min-w-[80px] text-center">
                            {selectedSection + 1} / {earthworksData.cross_sections.length}
                          </span>
                          <button
                            onClick={() => setSelectedSection(Math.min(earthworksData.cross_sections.length - 1, selectedSection + 1))}
                            disabled={selectedSection === earthworksData.cross_sections.length - 1}
                            className="p-1 hover:bg-white/10 rounded-sm disabled:opacity-30 transition-colors"
                          >
                            <ChevronRight className="w-3 h-3 text-white" />
                          </button>
                        </div>
                      </div>

                      {earthworksData.cross_sections[selectedSection] && (
                        <div className="flex-1 min-h-0 flex flex-col">
                          {/* Section Stats */}
                          <div className="grid grid-cols-4 gap-2 mb-3">
                            <div className="px-2 py-1.5 bg-white/5 rounded-sm border border-white/5">
                              <span className="text-[9px] text-white/40 block uppercase">Chainage</span>
                              <span className="text-xs font-mono text-white">{earthworksData.cross_sections[selectedSection].chainage.toFixed(0)}m</span>
                            </div>
                            <div className="px-2 py-1.5 bg-amber-500/10 rounded-sm border border-amber-500/20">
                              <span className="text-[9px] text-amber-500/60 block uppercase">Cut Area</span>
                              <span className="text-xs font-mono text-amber-500">{earthworksData.cross_sections[selectedSection].cut_area.toFixed(2)}m²</span>
                            </div>
                            <div className="px-2 py-1.5 bg-cyan-500/10 rounded-sm border border-cyan-500/20">
                              <span className="text-[9px] text-cyan-500/60 block uppercase">Fill Area</span>
                              <span className="text-xs font-mono text-cyan-500">{earthworksData.cross_sections[selectedSection].fill_area.toFixed(2)}m²</span>
                            </div>
                            <div className="px-2 py-1.5 bg-white/5 rounded-sm border border-white/5">
                              <span className="text-[9px] text-white/40 block uppercase">Slope</span>
                              <span className="text-xs font-mono text-white">{earthworksData.cross_sections[selectedSection].transversal_slope.toFixed(1)}%</span>
                            </div>
                          </div>

                          {/* Visualization */}
                          <div className="relative flex-1 bg-[#1a1a1a] border border-white/10 rounded-sm overflow-hidden">
                            {/* Grid Background */}
                            <div className="absolute inset-0" style={{
                              backgroundImage: 'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)',
                              backgroundSize: '20px 20px'
                            }} />

                            <svg className="w-full h-full" preserveAspectRatio="none">
                              {(() => {
                                const section = earthworksData.cross_sections[selectedSection]
                                const offsets = section.transect_offsets
                                const elevations = section.transect_elevations.map(e => e ?? section.grading_elevation)
                                const gradeElev = section.grading_elevation

                                const minOffset = Math.min(...offsets)
                                const maxOffset = Math.max(...offsets)
                                const minElev = Math.min(...elevations, gradeElev) - 2
                                const maxElev = Math.max(...elevations, gradeElev) + 2
                                const rangeElev = maxElev - minElev

                                const toX = (o: number) => ((o - minOffset) / (maxOffset - minOffset)) * 100
                                const toY = (e: number) => 100 - ((e - minElev) / rangeElev) * 100

                                // Ground profile
                                const groundPath = offsets.map((o, i) => {
                                  const x = toX(o)
                                  const y = toY(elevations[i])
                                  return `${i === 0 ? 'M' : 'L'} ${x}% ${y}%`
                                }).join(' ')

                                // Grading plane
                                const gradeY = toY(gradeElev)

                                // Cut Area (Polygon above grade, below ground)
                                let cutPoly = ''
                                // Fill Area (Polygon below grade, above ground)
                                let fillPoly = ''

                                // Simplified visualization for cut/fill areas
                                // Construct polygons by following ground and grade lines
                                const groundPoints = offsets.map((o, i) => ({ x: toX(o), y: toY(elevations[i]) }))

                                // Create path for ground
                                const groundLine = groundPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x}% ${p.y}%`).join(' ')

                                // Create closed loop for fill (below grade)
                                const fillLoop = `${groundLine} L 100% ${gradeY}% L 0% ${gradeY}% Z`

                                // Create closed loop for cut (above grade - technically same loop but clipped)
                                // For SVG simplicity, we'll just draw the areas based on y-comparison

                                return (
                                  <>
                                    {/* Areas */}
                                    <defs>
                                      <clipPath id="cutClip">
                                        <rect x="0" y="0" width="100%" height={`${gradeY}%`} />
                                      </clipPath>
                                      <clipPath id="fillClip">
                                        <rect x="0" y={`${gradeY}%`} width="100%" height="100%" />
                                      </clipPath>
                                    </defs>

                                    {/* Fill Area (Cyan) - Ground below grade */}
                                    <path d={`${groundLine} L 100% ${gradeY}% L 0% ${gradeY}% Z`} fill="#06b6d4" fillOpacity="0.2" clipPath="url(#fillClip)" />

                                    {/* Cut Area (Amber) - Ground above grade */}
                                    <path d={`${groundLine} L 100% ${gradeY}% L 0% ${gradeY}% Z`} fill="#f59e0b" fillOpacity="0.2" clipPath="url(#cutClip)" />

                                    {/* Lines */}
                                    <path d={groundPath} fill="none" stroke="#8B4513" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                                    <line x1="0%" y1={`${gradeY}%`} x2="100%" y2={`${gradeY}%`} stroke="#ef4444" strokeWidth="1.5" strokeDasharray="4 2" vectorEffect="non-scaling-stroke" />

                                    {/* Centerline */}
                                    <line x1="50%" y1="0%" x2="50%" y2="100%" stroke="#ffffff" strokeWidth="1" strokeDasharray="2 2" opacity="0.2" />
                                  </>
                                )
                              })()}
                            </svg>

                            {/* Labels */}
                            <div className="absolute bottom-1 left-2 text-[9px] text-white/30 font-mono">L (-{earthworksParams.row_width / 2}m)</div>
                            <div className="absolute bottom-1 right-2 text-[9px] text-white/30 font-mono">R (+{earthworksParams.row_width / 2}m)</div>
                          </div>

                          {/* Slider */}
                          <input
                            type="range"
                            min={0}
                            max={earthworksData.cross_sections.length - 1}
                            value={selectedSection}
                            onChange={(e) => setSelectedSection(Number(e.target.value))}
                            className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer mt-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-red-500"
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Detailed Data Table */}
                  <div className="flex-1 min-h-[300px] bg-white/[0.02] border border-white/10 rounded-sm flex flex-col overflow-hidden">
                    <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
                      <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                        <Table className="w-3.5 h-3.5 text-white/40" />
                        Detailed Earthworks Data
                      </h3>
                      <button className="text-[10px] text-red-400 hover:text-red-300 flex items-center gap-1 uppercase tracking-wider font-bold">
                        <Download className="w-3 h-3" />
                        Export CSV
                      </button>
                    </div>

                    <div className="flex-1 overflow-auto">
                      <table className="w-full text-[11px] font-mono text-right border-collapse">
                        <thead className="bg-black/40 sticky top-0 z-10 text-white/50">
                          <tr>
                            <th className="p-2 text-left font-medium border-b border-white/10">Section</th>
                            <th className="p-2 font-medium border-b border-white/10">Chainage (m)</th>
                            <th className="p-2 font-medium border-b border-white/10">Ground (m)</th>
                            <th className="p-2 font-medium border-b border-white/10">Grade (m)</th>
                            <th className="p-2 font-medium border-b border-white/10 text-amber-500/70">Cut Area (m²)</th>
                            <th className="p-2 font-medium border-b border-white/10 text-cyan-500/70">Fill Area (m²)</th>
                            <th className="p-2 font-medium border-b border-white/10 text-amber-500/70">Cut Vol (m³)</th>
                            <th className="p-2 font-medium border-b border-white/10 text-cyan-500/70">Fill Vol (m³)</th>
                            <th className="p-2 font-medium border-b border-white/10">Cum. Cut</th>
                            <th className="p-2 font-medium border-b border-white/10">Cum. Fill</th>
                            <th className="p-2 font-medium border-b border-white/10">Balance</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {earthworksData.cross_sections.map((section, idx) => {
                            // Calculate cumulative values roughly for display (in real app, these should come from API)
                            // Assuming we have access to cumulative data or calculating it on the fly
                            // For now, we'll use placeholders or simple calculation if data available

                            // Note: Real implementation would need cumulative data in the response
                            // We'll just show the per-section data we have

                            return (
                              <tr
                                key={idx}
                                className={cn(
                                  "hover:bg-white/[0.05] transition-colors cursor-pointer",
                                  selectedSection === idx && "bg-red-500/10 hover:bg-red-500/20"
                                )}
                                onClick={() => setSelectedSection(idx)}
                              >
                                <td className="p-2 text-left text-white/30">#{idx + 1}</td>
                                <td className="p-2 text-white">{section.chainage.toFixed(1)}</td>
                                <td className="p-2 text-white/70">{section.ground_elevation.toFixed(2)}</td>
                                <td className="p-2 text-white/70">{section.grading_elevation.toFixed(2)}</td>
                                <td className="p-2 text-amber-500">{section.cut_area.toFixed(2)}</td>
                                <td className="p-2 text-cyan-500">{section.fill_area.toFixed(2)}</td>
                                <td className="p-2 text-amber-500/70">{(section.cut_area * earthworksParams.section_spacing).toFixed(1)}</td>
                                <td className="p-2 text-cyan-500/70">{(section.fill_area * earthworksParams.section_spacing).toFixed(1)}</td>
                                <td className="p-2 text-white/30">-</td>
                                <td className="p-2 text-white/30">-</td>
                                <td className="p-2 text-white/30">-</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-cyan-500/20 bg-cyan-900/5 shrink-0 flex items-center justify-between">
          <p className="text-[10px] text-cyan-400/50">
            {stats ? `${stats.sample_count} samples from DEM` : 'Loading...'}
          </p>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/30 rounded-lg text-sm text-cyan-300 font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
