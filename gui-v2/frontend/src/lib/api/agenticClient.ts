/**
 * Agentic Framework API Client
 *
 * TypeScript client for interacting with the agentic framework
 * through the GUI backend proxy.
 */

import { getApiBase } from './dataClient'

// ============================================================================
// Types
// ============================================================================

export type AssessmentLevel = 'favorable' | 'caution' | 'challenging'
export type ConfidenceLevel = 'high' | 'medium' | 'low'

export interface KeyMetrics {
  length_km: number
  avg_slope: number
  terrain: string
  land_use: string
  construction_method: string
  estimated_cost: string
  crossing_count?: number
}

export interface SpecialistSummaries {
  geotechnical: string
  environmental: string
  engineering: string
  cost: string
}

export interface SaipemCompliance {
  criteria_met: string[]
  criteria_violated: string[]
  compliance_notes: string
}

export interface ExplainResponse {
  segment_id: string
  overall_assessment: AssessmentLevel
  confidence: ConfidenceLevel
  executive_summary: string
  key_metrics: KeyMetrics
  specialist_summaries: SpecialistSummaries
  saipem_compliance: SaipemCompliance
  flags: string[]
  recommendations: string[]
  conflicts?: string[]
}

export interface AgenticHealthResponse {
  status: 'ok' | 'degraded'
  version: string
  agents_available: string[]
}

export interface AgenticRouteListItem {
  route_id: string
  segment_count: number | null
}

export interface AgenticRouteDetail {
  route_id: string
  segment_count: number
  metadata: Record<string, unknown>
  bounds: {
    min_x: number
    min_y: number
    max_x: number
    max_y: number
  } | null
}

export interface AgenticSegmentListItem {
  segment_id: string
  length_m: number | null
  start_coord: [number, number] | null
  end_coord: [number, number] | null
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Check health of the agentic framework service.
 *
 * @returns Health status or null if unavailable
 */
export async function checkAgenticHealth(): Promise<AgenticHealthResponse | null> {
  try {
    const response = await fetch(`${getApiBase()}/agentic/health`)
    if (!response.ok) return null
    return await response.json()
  } catch (error) {
    console.error('Agentic health check failed:', error)
    return null
  }
}

/**
 * Check if agentic framework is available.
 *
 * @returns true if service is reachable
 */
export async function isAgenticAvailable(): Promise<boolean> {
  const health = await checkAgenticHealth()
  return health !== null && health.status === 'ok'
}

/**
 * List all routes available in the agentic framework.
 *
 * @param project - Optional project name. If provided, routes are loaded from project's PIRL/outputs/
 * @returns List of routes or empty array on error
 */
export async function listAgenticRoutes(project?: string): Promise<AgenticRouteListItem[]> {
  try {
    const params = project ? `?project=${encodeURIComponent(project)}` : ''
    const response = await fetch(`${getApiBase()}/agentic/routes${params}`)
    if (!response.ok) {
      console.error('Failed to list agentic routes:', response.statusText)
      return []
    }
    return await response.json()
  } catch (error) {
    console.error('Error listing agentic routes:', error)
    return []
  }
}

/**
 * Get details of a specific route.
 *
 * @param routeId - Route identifier
 * @param project - Optional project name
 * @returns Route details or null on error
 */
export async function getAgenticRoute(routeId: string, project?: string): Promise<AgenticRouteDetail | null> {
  try {
    const params = project ? `?project=${encodeURIComponent(project)}` : ''
    const response = await fetch(`${getApiBase()}/agentic/routes/${encodeURIComponent(routeId)}${params}`)
    if (!response.ok) return null
    return await response.json()
  } catch (error) {
    console.error('Error getting agentic route:', error)
    return null
  }
}

/**
 * List segments in a route.
 *
 * @param routeId - Route identifier
 * @param limit - Optional max segments to return
 * @param offset - Number to skip for pagination
 * @param project - Optional project name
 * @returns List of segments
 */
export async function listAgenticSegments(
  routeId: string,
  limit?: number,
  offset: number = 0,
  project?: string
): Promise<AgenticSegmentListItem[]> {
  try {
    const params = new URLSearchParams({ offset: String(offset) })
    if (limit !== undefined) params.set('limit', String(limit))
    if (project) params.set('project', project)

    const response = await fetch(
      `${getApiBase()}/agentic/routes/${encodeURIComponent(routeId)}/segments?${params}`
    )
    if (!response.ok) return []
    return await response.json()
  } catch (error) {
    console.error('Error listing segments:', error)
    return []
  }
}

/**
 * Analyze multiple segments using AI agents.
 *
 * This is the main analysis function. It runs geotechnical, environmental,
 * engineering, and cost analysis, then synthesizes the results.
 *
 * @param routeId - Route identifier
 * @param segmentIds - Array of segment IDs to analyze
 * @returns Array of analysis results, one per segment
 * @throws Error on network or server errors
 */
export async function analyzeSegments(
  routeId: string,
  segmentIds: string[]
): Promise<ExplainResponse[]> {
  const response = await fetch(`${getApiBase()}/agentic/explain`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ route_id: routeId, segment_ids: segmentIds })
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }))
    throw new Error(error.detail || `Analysis failed: ${response.status}`)
  }

  return await response.json()
}

/**
 * Analyze a single segment.
 *
 * Convenience wrapper for single-segment analysis.
 *
 * @param routeId - Route identifier
 * @param segmentId - Segment identifier
 * @param skipCache - Bypass cache for fresh analysis
 * @returns Analysis result
 * @throws Error on network or server errors
 */
export async function analyzeSegment(
  routeId: string,
  segmentId: string,
  skipCache: boolean = false
): Promise<ExplainResponse> {
  const params = new URLSearchParams({
    route_id: routeId,
    segment_id: segmentId
  })
  if (skipCache) params.set('skip_cache', 'true')

  const response = await fetch(`${getApiBase()}/agentic/explain/single?${params}`, {
    method: 'POST'
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }))
    throw new Error(error.detail || `Analysis failed: ${response.status}`)
  }

  return await response.json()
}

/**
 * Get route geometry as GeoJSON.
 *
 * @param routeId - Route identifier
 * @param project - Optional project name
 * @returns GeoJSON object or null on error
 */
export async function getAgenticRouteGeometry(routeId: string, project?: string): Promise<GeoJSON.Feature | GeoJSON.FeatureCollection | null> {
  try {
    const params = project ? `?project=${encodeURIComponent(project)}` : ''
    const response = await fetch(
      `${getApiBase()}/agentic/routes/${encodeURIComponent(routeId)}/geometry${params}`
    )
    if (!response.ok) return null
    return await response.json()
  } catch (error) {
    console.error('Error getting route geometry:', error)
    return null
  }
}

/**
 * Get route segments as GeoJSON FeatureCollection.
 *
 * Returns segments as individual LineString features with segment_id,
 * route_id, and metrics in properties - ready for map display.
 *
 * @param routeId - Route identifier
 * @param project - Optional project name
 * @returns GeoJSON FeatureCollection or null on error
 */
export async function getAgenticSegmentsGeometry(routeId: string, project?: string): Promise<GeoJSON.FeatureCollection | null> {
  try {
    const params = project ? `?project=${encodeURIComponent(project)}` : ''
    const response = await fetch(
      `${getApiBase()}/agentic/routes/${encodeURIComponent(routeId)}/segments/geometry${params}`
    )
    if (!response.ok) return null
    return await response.json()
  } catch (error) {
    console.error('Error getting segments geometry:', error)
    return null
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get color for assessment level.
 *
 * @param assessment - Assessment level
 * @returns Tailwind color class
 */
export function getAssessmentColor(assessment: AssessmentLevel): string {
  switch (assessment) {
    case 'favorable':
      return 'text-green-600 bg-green-100'
    case 'caution':
      return 'text-yellow-600 bg-yellow-100'
    case 'challenging':
      return 'text-red-600 bg-red-100'
    default:
      return 'text-gray-600 bg-gray-100'
  }
}

/**
 * Get border color for assessment level.
 *
 * @param assessment - Assessment level
 * @returns Tailwind border color class
 */
export function getAssessmentBorderColor(assessment: AssessmentLevel): string {
  switch (assessment) {
    case 'favorable':
      return 'border-green-500'
    case 'caution':
      return 'border-yellow-500'
    case 'challenging':
      return 'border-red-500'
    default:
      return 'border-gray-500'
  }
}

/**
 * Get hex color for map highlighting based on assessment.
 *
 * @param assessment - Assessment level
 * @returns Hex color string
 */
export function getAssessmentMapColor(assessment: AssessmentLevel): string {
  switch (assessment) {
    case 'favorable':
      return '#22c55e' // green-500
    case 'caution':
      return '#eab308' // yellow-500
    case 'challenging':
      return '#ef4444' // red-500
    default:
      return '#6b7280' // gray-500
  }
}

/**
 * Format flag code for display.
 *
 * Converts "SLOPE_EXCEEDS_20_PERCENT: description" to a nicer format.
 *
 * @param flag - Raw flag string
 * @returns Formatted flag object
 */
export function parseFlag(flag: string): { code: string; description: string } {
  const colonIndex = flag.indexOf(':')
  if (colonIndex === -1) {
    return { code: flag, description: '' }
  }
  return {
    code: flag.substring(0, colonIndex).trim(),
    description: flag.substring(colonIndex + 1).trim()
  }
}
