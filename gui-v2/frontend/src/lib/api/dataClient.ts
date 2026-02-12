/**
 * AGRS ZEUS GUI v2 - API Client
 *
 * Provides typed API client for accessing backend data endpoints.
 */

import { API_BASE_URL } from '@/lib/api-client'

// Use the centralized API base URL from environment
function getApiBaseSync(): string {
  return API_BASE_URL
}

async function getApiBaseAsync(): Promise<string> {
  return API_BASE_URL
}

/** Returns the API base URL from environment configuration */
export function getApiBase(): string {
  return API_BASE_URL
}

// ============================================================================
// Type Definitions
// ============================================================================

export interface ProjectMetadata {
  project_name: string;
  project_id?: string;
  project_code?: string;
  client?: string;
  date_created?: string;
  status?: string;
  crs?: {
    epsg: number;
    proj4: string;
    name: string;
    units: string;
  };
  aoi?: {
    file: string;
    area_km2: number;
    countries?: string[];  // Countries the AOI covers
    start_point?: {
      latitude: number;
      longitude: number;
      name?: string;
    };
    end_point?: {
      latitude: number;
      longitude: number;
      name?: string;
    };
  };
  measurement_system?: string;
  units?: Record<string, string>;
  // Extended metadata fields
  project_creator?: string;
  project_type?: string;
  organization?: string;
  department?: string;
  country?: string;
  iso3?: string;
}

export interface DatasetInfo {
  name: string;
  type: 'raster' | 'vector';
  path: string;
  metadata?: any;
}

export interface ProjectDatasets {
  rasters: DatasetInfo[];
  vectors: DatasetInfo[];
}

export interface DatasetCoverageEntry {
  dataset: string;
  source?: string | null;
  data_type?: string | null;
  access?: string | null;
  coverage?: string | null;
  temporal_start?: string | null;
  temporal_end?: string | null;
  frequency?: string | null;
  applies_globally: boolean;
  url?: string | null;
}

export interface DatasetCoverageResponse {
  iso3: string;
  country?: string | null;
  entries: DatasetCoverageEntry[];
  summary?: string | null;
  protocol_reference: string;
}

export interface EngineeringStandardEntry {
  standard: string;
  source?: string | null;
  type?: string | null;
  type_detail?: string | null;
  access?: string | null;
  temporal_start?: string | null;
  temporal_end?: string | null;
  frequency?: string | null;
  coverage?: string | null;
  url?: string | null;
  resolution?: string | null;
  quality?: string | null;
  notes?: string | null;
  api_available?: string | null;
  origins?: string | null;
  applies_globally: boolean;
}

export interface EngineeringStandardsResponse {
  iso3: string;
  country?: string | null;
  entries: EngineeringStandardEntry[];
  catalog_reference: string;
}

export type DatasetCategory =
  | 'dem'
  | 'landcover'
  | 'soil'
  | 'roads'
  | 'railways'
  | 'powerlines'
  | 'waterways'
  | 'geohazard'
  | 'pipelines'
  | 'protected_areas'
  | 'indigenous_lands'

export interface DatasetCategoryStatus {
  category: DatasetCategory;
  label: string;
  dataset_type: 'raster' | 'vector';
  required: boolean;
  present: boolean;
  raw_path?: string | null;
  processed_path?: string | null;
  metadata_path?: string | null;
  last_modified?: string | null;
  description?: string | null;
}

export interface DatasetStatusResponse {
  project: string;
  target_epsg: number;
  minimum_requirements_met: boolean;
  categories: DatasetCategoryStatus[];
  protocol_reference: string;
}

export interface ProjectCRSRecommendation {
  epsg: number;
  name: string;
  reason: string;
  utm_zone?: number;
  hemisphere?: string;
}

export interface RegulatoryDoc {
  name: string;
  category: string;
  path: string;
  size_bytes?: number;
  last_modified?: string;
}

export interface RegulatoryDocsResponse {
  documents: RegulatoryDoc[];
  index_content?: string;
  sources_content?: string;
}

export interface AOIPreviewResponse {
  area_km2: number;
  countries: string[];
  iso3?: string | null;
  country?: string | null;
  centroid: {
    lat: number;
    lon: number;
  };
  recommended_crs: ProjectCRSRecommendation;
  start_point_within?: boolean | null;
  end_point_within?: boolean | null;
}

export interface CreateProjectResponse {
  status: string;
  project_name: string;
  project_id: string;
  iso3?: string | null;
  country?: string | null;
}

export interface DatasetStageState {
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'skipped' | 'cancelled';
  message?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
}

export interface LayerDescriptor {
  category: DatasetCategory;
  dataset_type: 'raster' | 'vector';
  label: string;
  processed_path: string;
  symlink_path: string;
  epsg: number;
}

export interface DatasetFetchJobState {
  status?: string | null;
  message?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  stages?: Record<string, DatasetStageState>;
  layer?: LayerDescriptor | null;
}

export interface DatasetFetchJob {
  id: string;
  project: string;
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'partial';
  progress: number;
  current_category?: DatasetCategory | null;
  started_at?: string | null;
  updated_at: string;
  completed_at?: string | null;
  categories: Record<string, DatasetFetchJobState>;
  layers: Record<string, LayerDescriptor>;
  logs: string[];
  force: boolean;
  error?: string | null;
  overrides?: Record<string, string>;
}

export interface ActiveDatasetJobsResponse {
  active_jobs: Record<
    string,
    {
      job_id: string;
      status: string;
      progress: number;
      current_category?: DatasetCategory | null;
      started_at?: string | null;
      updated_at?: string | null;
    }
  >;
  count: number;
}

export interface RouteMetadata {
  filename: string;
  total_reward?: number;
  success?: boolean;
  num_segments?: number;
  num_points?: number;
  total_length_m?: number;
  total_cost_usd?: number;
  model_path?: string;
  timestamp?: string;
  // Enhanced metadata from sidecar files
  has_metadata_sidecar?: boolean;
  generation_method?: string;
  constraint_compliant?: boolean;
  cost_per_km?: number;
  is_real_route?: boolean;  // True for actual infrastructure data (highlighted in yellow)
}

export interface RouteCrossingRecord {
  id: string
  category: string
  dataset_layer: string
  feature_id: string
  point: [number, number]
  intersection: {
    type: string
    coordinates: any
  }
  feature_properties: Record<string, any>
  derived?: Record<string, any>
}

export interface RouteCrossingsDetailed {
  version: number
  generated_at: string
  categories_used: string[]
  datasets_used: Array<{ category: string; layer: string }>
  crossings: RouteCrossingRecord[]
  message?: string
}

export interface RouteCrossingsResponse {
  project: string
  route: string
  computed: boolean
  crossings_detailed: RouteCrossingsDetailed | null
  message?: string
}

export interface GeoJSON {
  type: string;
  features: any[];
  [key: string]: any;
}

// ============================================================================
// Alignment Sheets (PDF) - Types + API
// ============================================================================

export type AlignmentSheetPreset = 'detail' | 'standard' | 'overview'

export interface AlignmentSheetPreviewResponse {
  project: string
  route: string
  preset: string
  template_id?: string
  base_map?: string
  total_length_m: number
  sheet_count: number
  sheet_length_m: number
  h_scale: number
  v_scale: number
  pipeline_diameter_mm?: number | null
  pipeline_material?: string | null
  pipeline_type?: string | null
  depth_of_cover_m?: number | null
  mop_bar?: number | null
  project_name?: string | null
  organization?: string | null
  country?: string | null
  crs_epsg?: number | null
}

export type AlignmentSheetBaseMapMode = 'vector' | 'imagery'

export interface AlignmentSheetsOptions {
  template_id?: string | null
  base_map?: AlignmentSheetBaseMapMode | null
  persist?: boolean | null
}

// ============================================================================
// API Client Functions
// ============================================================================

/**
 * Fetch list of all available projects
 */
export async function fetchProjects(): Promise<ProjectMetadata[]> {
  const base = await getApiBaseAsync();
  const response = await fetch(`${base}/projects`);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch projects: ${response.statusText}`);
  }
  
  return response.json();
}

/**
 * Fetch metadata for a specific project
 */
export async function fetchProjectMetadata(project: string): Promise<ProjectMetadata> {
  const base = await getApiBaseAsync();
  const response = await fetch(`${base}/projects/${project}/metadata`);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch metadata for ${project}: ${response.statusText}`);
  }
  
  return response.json();
}

/**
 * Fetch list of datasets for a specific project
 */
export async function fetchProjectDatasets(project: string): Promise<ProjectDatasets> {
  const base = await getApiBaseAsync();
  const response = await fetch(`${base}/projects/${project}/datasets`);

  if (!response.ok) {
    throw new Error(`Failed to fetch datasets for ${project}: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Lightweight fingerprint for detecting dataset changes
 */
export interface DatasetFingerprint {
  raster_count: number;
  vector_count: number;
  latest_modified: string | null;
  fingerprint: string;
}

/**
 * Fetch lightweight dataset fingerprint for change detection.
 * Use this for polling to detect new datasets without fetching full details.
 */
export async function fetchDatasetFingerprint(project: string): Promise<DatasetFingerprint> {
  const base = await getApiBaseAsync();
  const response = await fetch(`${base}/projects/${project}/datasets/fingerprint`);

  if (!response.ok) {
    throw new Error(`Failed to fetch dataset fingerprint for ${project}: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Fetch all active dataset jobs across projects.
 * Useful to avoid stale UI state when a job was backgrounded and later completed.
 */
export async function fetchActiveDatasetJobs(): Promise<ActiveDatasetJobsResponse> {
  const base = await getApiBaseAsync()
  const response = await fetch(`${base}/dataset-jobs/active`)

  if (!response.ok) {
    throw new Error(`Failed to fetch active dataset jobs: ${response.statusText}`)
  }

  return response.json()
}

/**
 * Fetch vector data as GeoJSON
 */
export async function fetchVectorData(project: string, layer: string): Promise<GeoJSON> {
  const base = await getApiBaseAsync()
  const response = await fetch(`${base}/data/${encodeURIComponent(project)}/vectors/${encodeURIComponent(layer)}`);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch vector layer ${layer}: ${response.statusText}`);
  }
  
  return response.json();
}

export async function fetchNearestVectorFeatures(
  project: string,
  layer: string,
  targetGeometry: GeoJSON.Geometry,
  limit: number = 50
): Promise<NearestVectorFeaturesResponse> {
  const base = await getApiBaseAsync()
  const response = await fetch(`${base}/data/${encodeURIComponent(project)}/vectors/${encodeURIComponent(layer)}/nearest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target_geometry: targetGeometry, limit })
  })
  if (!response.ok) {
    const message = await response.text()
    let detail = message
    try {
      const parsed = JSON.parse(message)
      if (parsed && typeof parsed === 'object' && typeof (parsed as any).detail === 'string') {
        detail = String((parsed as any).detail)
      }
    } catch {
      // ignore (non-JSON)
    }
    if (response.status === 404 && detail === 'Not Found') {
      detail = 'Nearest-feature endpoint not found on backend. Ensure backend is updated/restarted.'
    }
    throw new Error(detail || `Failed to fetch nearest features for ${layer}`)
  }
  return response.json()
}

/**
 * Fetch list of PIRL routes for a project
 */
export async function fetchPIRLRoutes(project: string): Promise<RouteMetadata[]> {
  const base = await getApiBaseAsync()
  const response = await fetch(`${base}/pirl/${project}/routes`);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch PIRL routes for ${project}: ${response.statusText}`);
  }
  
  return response.json();
}

/**
 * Fetch a specific PIRL route GeoJSON
 */
export async function fetchPIRLRoute(project: string, routeName: string): Promise<GeoJSON> {
  const base = await getApiBaseAsync()
  const response = await fetch(`${base}/pirl/${project}/routes/${routeName}`);

  if (!response.ok) {
    throw new Error(`Failed to fetch route ${routeName}: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Preview alignment sheets (metadata only).
 * Backend: GET /alignment-sheets/preview/{project}/{route}?preset=...
 */
export async function previewAlignmentSheets(
  project: string,
  route: string,
  preset: AlignmentSheetPreset = 'standard',
  options?: AlignmentSheetsOptions
): Promise<AlignmentSheetPreviewResponse> {
  const base = await getApiBaseAsync()
  const url = new URL(
    `${base}/alignment-sheets/preview/${encodeURIComponent(project)}/${encodeURIComponent(route)}`
  )
  url.searchParams.set('preset', preset)
  if (options?.template_id) url.searchParams.set('template_id', options.template_id)
  if (options?.base_map) url.searchParams.set('base_map', options.base_map)

  const response = await fetch(url.toString())
  if (!response.ok) {
    throw new Error(`Failed to preview alignment sheets: ${response.status} ${response.statusText}`)
  }

  return response.json()
}

/**
 * Generate + download the alignment sheets PDF.
 * Backend: POST /alignment-sheets/generate  { project, route, preset }
 */
export async function downloadAlignmentSheetsPDF(
  project: string,
  route: string,
  preset: AlignmentSheetPreset = 'standard',
  options?: AlignmentSheetsOptions
): Promise<void> {
  const base = await getApiBaseAsync()
  const token = localStorage.getItem('agrs_token')
  const headers: HeadersInit = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  const response = await fetch(`${base}/alignment-sheets/generate`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      project,
      route,
      preset,
      ...(options?.template_id ? { template_id: options.template_id } : {}),
      ...(options?.base_map ? { base_map: options.base_map } : {}),
      ...(options?.persist !== null && options?.persist !== undefined ? { persist: options.persist } : {}),
    }),
  })

  if (!response.ok) {
    let detail = ''
    try {
      // Backend might return JSON detail on error
      const contentType = response.headers.get('content-type') || ''
      if (contentType.includes('application/json')) {
        const json = await response.json()
        detail = json?.detail ? ` - ${json.detail}` : ''
      }
    } catch (_) {}
    throw new Error(`Failed to generate alignment sheets PDF: ${response.status} ${response.statusText}${detail}`)
  }

  const blob = await response.blob()

  // Browser download
  if (typeof window !== 'undefined') {
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${project}_${route}_alignment_sheets.pdf`
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.URL.revokeObjectURL(url)
  }
}

/**
 * Route metadata from sidecar file
 */
export interface RouteDetailedMetadata {
  route_file: string
  has_sidecar: boolean
  message?: string
  generated_at?: string
  metadata_version?: string
  route_info?: {
    length_m: number
    length_km: number
    start_point: [number, number]
    end_point: [number, number]
    crs: string
  }
  generation_method?: {
    method: string
    algorithm: string
    constraint_enforcement: string
    description: string
    source: string
  }
  cost_matrix?: Record<string, unknown>
  saipem_constraints?: Record<string, unknown>
  constraint_compliance?: {
    overall_compliant: boolean
    slope: {
      compliant: boolean
      max_allowed: number
      max_found?: number
      violation_count?: number
      total_violation_length_m: number
    }
    built_up: {
      compliant: boolean
      total_violation_length_m: number
    }
    water: {
      compliant: boolean
      total_violation_length_m: number
    }
  }
  terrain_statistics?: {
    slope: {
      min: number
      max: number
      mean: number
      median: number
      std: number
    }
    elevation: {
      min: number
      max: number
      range: number
      total_gain: number
    }
    terrain_distribution: {
      flat_pct: number
      rolling_pct: number
      hilly_pct: number
      mountainous_pct: number
      steep_pct: number
    }
  }
  landcover_distribution?: Record<string, {
    length_m: number
    percentage: number
    landcover_class: number
  }>
  infrastructure_crossings?: {
    roads: { total: number; by_type: Record<string, number>; cost: number }
    railways: { total: number; by_type: Record<string, number>; cost: number }
    waterways: { total: number; by_type: Record<string, number>; cost: number }
    powerlines: { total: number; cost: number }
  }
  cost_breakdown?: {
    base_construction: { cost: number; rate_per_m: number }
    trenching: { cost: number; breakdown: Record<string, { length_m: number; cost: number }> }
    landcover: { cost: number; breakdown: Record<string, { length_m: number; cost: number }> }
    crossings: { cost: number; breakdown: { roads: number; railways: number; waterways: number; powerlines: number } }
    subtotal: number
    regional_multiplier: number
    total: number
    cost_per_km: number
  }
}

/**
 * Fetch detailed metadata for a PIRL route from sidecar file
 */
export async function fetchPIRLRouteMetadata(project: string, routeName: string): Promise<RouteDetailedMetadata> {
  const base = await getApiBaseAsync()
  const encodePath = (value: string) => value.split('/').map(encodeURIComponent).join('/')
  const response = await fetch(`${base}/pirl/${encodeURIComponent(project)}/routes/${encodePath(routeName)}/metadata`);

  if (!response.ok) {
    throw new Error(`Failed to fetch route metadata for ${routeName}: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Fetch (and optionally compute) detailed crossings for a route.
 * Backend: GET /pirl/{project}/routes/{route}/crossings?compute_if_missing=true
 */
export async function fetchPIRLRouteCrossings(
  project: string,
  routeName: string,
  computeIfMissing: boolean = true
): Promise<RouteCrossingsResponse> {
  const base = await getApiBaseAsync()
  const encodePath = (value: string) => value.split('/').map(encodeURIComponent).join('/')
  const url = new URL(`${base}/pirl/${encodeURIComponent(project)}/routes/${encodePath(routeName)}/crossings`)
  url.searchParams.set('compute_if_missing', computeIfMissing ? 'true' : 'false')

  const token = localStorage.getItem('agrs_token')
  const headers: HeadersInit = {}
  if (token) headers['Authorization'] = `Bearer ${token}`

  const response = await fetch(url.toString(), { headers })
  if (!response.ok) {
    const message = await response.text().catch(() => '')
    throw new Error(message || `Failed to fetch route crossings for ${routeName}: ${response.statusText}`)
  }
  return response.json()
}

/**
 * Force recomputation of detailed crossings for a route.
 * Backend: POST /pirl/{project}/routes/{route}/crossings/compute
 */
export async function computePIRLRouteCrossings(project: string, routeName: string): Promise<RouteCrossingsResponse> {
  const base = await getApiBaseAsync()
  const encodePath = (value: string) => value.split('/').map(encodeURIComponent).join('/')
  const token = localStorage.getItem('agrs_token')
  const headers: HeadersInit = {}
  if (token) headers['Authorization'] = `Bearer ${token}`
  const response = await fetch(`${base}/pirl/${encodeURIComponent(project)}/routes/${encodePath(routeName)}/crossings/compute`, {
    method: 'POST',
    headers
  })
  if (!response.ok) {
    const message = await response.text().catch(() => '')
    throw new Error(message || `Failed to compute route crossings for ${routeName}: ${response.statusText}`)
  }
  return response.json()
}

/**
 * Fetch dataset coverage catalog for the project's AOI
 */
export async function fetchDatasetCoverage(project: string): Promise<DatasetCoverageResponse> {
  if (!project) {
    throw new Error('Project name is required to load dataset coverage');
  }
  const base = await getApiBaseAsync();
  const response = await fetch(`${base}/projects/${project}/dataset-coverage`);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch dataset coverage for ${project}: ${response.statusText}`);
  }
  
  return response.json();
}

/**
 * Fetch engineering/design standards catalogue entries applicable to the project's AOI (ISO3 + WLD).
 */
export async function fetchEngineeringStandards(project: string): Promise<EngineeringStandardsResponse> {
  if (!project) {
    throw new Error('Project name is required to load engineering standards');
  }
  const base = await getApiBaseAsync();
  const response = await fetch(`${base}/projects/${project}/engineering-standards`);

  if (!response.ok) {
    throw new Error(`Failed to fetch engineering standards for ${project}: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Re-scan engineering standards catalogue (clears backend cache) and return refreshed entries.
 */
export async function scanEngineeringStandards(project: string): Promise<EngineeringStandardsResponse> {
  if (!project) {
    throw new Error('Project name is required to scan engineering standards');
  }
  const base = await getApiBaseAsync();
  const response = await fetch(`${base}/projects/${project}/engineering-standards/scan`, { method: 'POST' });

  if (!response.ok) {
    throw new Error(`Failed to scan engineering standards for ${project}: ${response.statusText}`);
  }

  return response.json();
}


/**
 * Fetch standardized dataset readiness for the project
 */
export async function fetchProjectDatasetStatus(project: string): Promise<DatasetStatusResponse> {
  if (!project) {
    throw new Error('Project name is required to load dataset status');
  }
  const base = await getApiBaseAsync();
  const response = await fetch(`${base}/projects/${project}/dataset-status`);
  if (!response.ok) {
    throw new Error(`Failed to fetch dataset status for ${project}: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Fetch recommended CRS for the project based on AOI
 */
export async function fetchRecommendedCRS(project: string): Promise<ProjectCRSRecommendation> {
  if (!project) {
    throw new Error('Project name is required to load CRS recommendation');
  }
  const base = await getApiBaseAsync();
  const response = await fetch(`${base}/projects/${project}/crs/recommend`);
  if (!response.ok) {
    throw new Error(`Failed to fetch recommended CRS for ${project}: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Update project CRS
 */
export async function updateProjectCRS(project: string, epsg: number, name: string): Promise<{ status: string; epsg: number; name: string }> {
  if (!project) {
    throw new Error('Project name is required to update CRS');
  }
  const base = await getApiBaseAsync();
  const token = localStorage.getItem('agrs_token')
  const headers: HeadersInit = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  const response = await fetch(`${base}/projects/${project}/crs`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ epsg, name })
  });
  if (!response.ok) {
    throw new Error(`Failed to update CRS for ${project}: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Launch dataset fetch pipeline for selected categories
 */
export async function startDatasetFetch(
  project: string,
  categories: DatasetCategory[],
  force = false,
  overrides?: Partial<Record<DatasetCategory, string | null>>
): Promise<{ job_id: string }> {
  if (!project) {
    throw new Error('Project name is required to start dataset fetch');
  }
  if (!categories || categories.length === 0) {
    throw new Error('Select at least one dataset category to fetch');
  }
  const base = await getApiBaseAsync();
  const payload: { categories: DatasetCategory[]; force: boolean; overrides?: Record<string, string> } = {
    categories,
    force
  };
  if (overrides) {
    const cleaned: Record<string, string> = {};
    Object.entries(overrides).forEach(([key, value]) => {
      if (value) cleaned[key] = value;
    });
    if (Object.keys(cleaned).length > 0) {
      payload.overrides = cleaned;
    }
  }

  const token = localStorage.getItem('agrs_token')
  const headers: HeadersInit = { 'Content-Type': 'application/json' }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
  const timeoutMs = 20000
  const timeout = controller ? setTimeout(() => controller.abort(), timeoutMs) : null

  try {
    const response = await fetch(`${base}/projects/${project}/dataset-fetch`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      ...(controller ? { signal: controller.signal } : {})
    })
    if (!response.ok) {
      const message = await response.text()
      let detail = message
      try {
        const parsed = JSON.parse(message)
        if (parsed && typeof parsed === 'object' && typeof (parsed as any).detail === 'string') {
          detail = String((parsed as any).detail)
        }
      } catch {
        // ignore (non-JSON)
      }
      throw new Error(detail || `Failed to start dataset fetch: ${response.statusText}`)
    }
    return response.json()
  } catch (err) {
    // If the backend is deadlocked/busy, the request can hang forever without a client timeout.
    if (err && typeof err === 'object' && (err as any).name === 'AbortError') {
      throw new Error(
        `Dataset fetch request timed out after ${Math.round(timeoutMs / 1000)}s. The backend may be stuck—restart the backend server and try again.`
      )
    }
    throw err
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

// ============================================================================
// User Management (Admin)
// ============================================================================

export interface UserProfile {
  id: string
  serial_number: string
  email: string
  username: string
  full_name: string
  name: string
  organization?: string | null
  company?: string | null
  position?: string | null
  department?: string | null
  station?: string | null
  work_phone?: string | null
  superior_user_id?: string | null
  role: string
  access_level?: string | null
  is_active?: boolean
  profile_image_url?: string | null
  created_at?: string | null
  updated_at?: string | null
}

export async function adminListUsers(
  query?: string,
  limit = 50,
  offset = 0
): Promise<{ users: UserProfile[]; count: number; limit: number; offset: number }> {
  const base = await getApiBaseAsync()
  const token = localStorage.getItem('agrs_token')
  const headers: HeadersInit = {}
  if (token) headers['Authorization'] = `Bearer ${token}`

  const qs = new URLSearchParams()
  if (query) qs.set('q', query)
  qs.set('limit', String(limit))
  qs.set('offset', String(offset))

  const response = await fetch(`${base}/users?${qs.toString()}`, { headers })
  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || `Failed to list users: ${response.statusText}`)
  }
  return response.json()
}

export async function searchUserDirectory(
  query?: string,
  limit = 50,
  offset = 0
): Promise<{ users: UserProfile[]; count: number; limit: number; offset: number }> {
  const base = await getApiBaseAsync()
  const token = localStorage.getItem('agrs_token')
  const headers: HeadersInit = {}
  if (token) headers['Authorization'] = `Bearer ${token}`

  const qs = new URLSearchParams()
  if (query) qs.set('q', query)
  qs.set('limit', String(limit))
  qs.set('offset', String(offset))

  const response = await fetch(`${base}/users/directory?${qs.toString()}`, { headers })
  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || `Failed to search user directory: ${response.statusText}`)
  }
  return response.json()
}

export async function adminCreateUser(payload: {
  email: string
  full_name: string
  password: string
  serial_number?: string
  organization?: string
  position?: string
  department?: string
  station?: string
  work_phone?: string
  superior_user_id?: string
  role?: string
  access_level?: string
}): Promise<UserProfile> {
  const base = await getApiBaseAsync()
  const token = localStorage.getItem('agrs_token')
  const headers: HeadersInit = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const response = await fetch(`${base}/users`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  })
  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || `Failed to create user: ${response.statusText}`)
  }
  return response.json()
}

export async function adminUpdateUser(
  userId: string,
  payload: Record<string, any>
): Promise<UserProfile> {
  const base = await getApiBaseAsync()
  const token = localStorage.getItem('agrs_token')
  const headers: HeadersInit = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const response = await fetch(`${base}/users/${userId}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(payload)
  })
  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || `Failed to update user: ${response.statusText}`)
  }
  return response.json()
}

export async function uploadUserAvatar(userId: string, file: File): Promise<UserProfile> {
  const base = await getApiBaseAsync()
  const token = localStorage.getItem('agrs_token')
  const headers: HeadersInit = {}
  if (token) headers['Authorization'] = `Bearer ${token}`

  const formData = new FormData()
  formData.append('file', file)

  const response = await fetch(`${base}/users/${userId}/avatar`, {
    method: 'POST',
    headers,
    body: formData
  })
  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || `Failed to upload avatar: ${response.statusText}`)
  }
  return response.json()
}

// ============================================================================
// Audit (Project-scoped)
// ============================================================================

export interface AuditEventRow {
  id: string
  ts: string | null
  event_type: string
  payload: any
  actor: {
    id: string
    email: string
    serial_number: string
    full_name: string
    role: string
  }
}

export async function fetchProjectAudit(
  projectName: string,
  options?: { userId?: string; eventType?: string; limit?: number; offset?: number }
): Promise<{ project_name: string; user_id: string; events: AuditEventRow[]; count: number; limit: number; offset: number }> {
  const base = await getApiBaseAsync()
  const token = localStorage.getItem('agrs_token')
  const headers: HeadersInit = {}
  if (token) headers['Authorization'] = `Bearer ${token}`

  const qs = new URLSearchParams()
  if (options?.userId) qs.set('user_id', options.userId)
  if (options?.eventType) qs.set('event_type', options.eventType)
  if (options?.limit !== undefined) qs.set('limit', String(options.limit))
  if (options?.offset !== undefined) qs.set('offset', String(options.offset))

  const response = await fetch(`${base}/projects/${projectName}/audit?${qs.toString()}`, { headers })
  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || `Failed to fetch audit for ${projectName}: ${response.statusText}`)
  }
  return response.json()
}

/**
 * Fetch regulatory documents for a project
 */
export async function fetchRegulatoryDocs(project: string): Promise<RegulatoryDocsResponse> {
  const base = await getApiBaseAsync();
  const response = await fetch(`${base}/projects/${project}/regulatory-docs`);
  if (!response.ok) {
    throw new Error(`Failed to fetch regulatory documents for ${project}: ${response.statusText}`);
  }
  return response.json();
}

// ============================================================================
// Compliance Matrix (Regulations catalogue)
// ============================================================================

export interface RegulationCatalogueEntry {
  entry_id: string
  title: string
  entry_type?: string | null
  category?: string | null
  project_applicability?: string | null
  coverage_level?: string | null
  coverage_group?: string | null
  iso3?: string | null
  admin1_name?: string | null
  admin1_code?: string | null
  admin2_name?: string | null
  admin2_code?: string | null
  authority?: string | null
  source_title?: string | null
  source_url?: string | null
  source_type?: string | null
  direct_download_url?: string | null
  direct_download_file_name?: string | null
  direct_download_content_type?: string | null
  filing_category?: string | null
  status?: string | null
  effective_date?: string | null
  last_amended_date?: string | null
  last_verified_date?: string | null
  language?: string | null
  notes?: string | null
  related_entry_ids?: string | null
}

export interface MatchedRegulationEntry extends RegulationCatalogueEntry {
  match_scope: string
  match_reason: string
}

export interface RegulationsResponse {
  project: string
  generated_at: string
  catalog_reference: string
  countries_iso3: string[]
  admin1: { iso3?: string | null; admin1_name?: string | null; admin1_code?: string | null }[]
  entries: MatchedRegulationEntry[]
  snapshot_path?: string | null
}

export interface RegulationIndexResponse {
  stored_path: string
  filename: string
  category: string
  size_bytes: number
  media_type?: string | null
}

export async function fetchProjectRegulations(project: string): Promise<RegulationsResponse> {
  if (!project) throw new Error('Project name is required to load regulations')
  const base = await getApiBaseAsync()
  const response = await fetch(`${base}/projects/${encodeURIComponent(project)}/regulations`)
  if (!response.ok) {
    throw new Error(`Failed to fetch regulations for ${project}: ${response.statusText}`)
  }
  return response.json()
}

export async function refreshProjectRegulations(project: string): Promise<RegulationsResponse> {
  if (!project) throw new Error('Project name is required to refresh regulations')
  const base = await getApiBaseAsync()
  const token = localStorage.getItem('agrs_token')
  const headers: HeadersInit = {}
  if (token) headers['Authorization'] = `Bearer ${token}`
  const response = await fetch(`${base}/projects/${encodeURIComponent(project)}/regulations/refresh`, {
    method: 'POST',
    headers
  })
  if (!response.ok) {
    const message = await response.text().catch(() => '')
    throw new Error(message || `Failed to refresh regulations for ${project}: ${response.statusText}`)
  }
  return response.json()
}

export async function indexRegulationEntry(project: string, entryId: string): Promise<RegulationIndexResponse> {
  if (!project) throw new Error('Project name is required to index regulation')
  if (!entryId) throw new Error('EntryID is required to index regulation')
  const base = await getApiBaseAsync()
  const token = localStorage.getItem('agrs_token')
  const headers: HeadersInit = {}
  if (token) headers['Authorization'] = `Bearer ${token}`
  const response = await fetch(
    `${base}/projects/${encodeURIComponent(project)}/regulations/${encodeURIComponent(entryId)}/index`,
    { method: 'POST', headers }
  )
  if (!response.ok) {
    const message = await response.text().catch(() => '')
    throw new Error(message || `Failed to index regulation ${entryId}: ${response.statusText}`)
  }
  return response.json()
}

export function buildRegulatoryDocFileUrl(project: string, path: string): string {
  const base = getApiBaseSync()
  const url = new URL(`${base}/projects/${encodeURIComponent(project)}/regulatory-docs/file`)
  url.searchParams.set('path', path)
  return url.toString()
}

/**
 * Preview AOI statistics from uploaded or drawn geometry
 */
export async function previewAoi(formData: FormData): Promise<AOIPreviewResponse> {
  const base = await getApiBaseAsync();
  const response = await fetch(`${base}/projects/aoi/preview`, {
    method: 'POST',
    body: formData
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || 'Failed to preview AOI');
  }
  return response.json();
}

export interface PointPreviewResponse {
  latitude: number;
  longitude: number;
}

/**
 * Preview point coordinates from uploaded file
 */
export async function previewPoint(file: File): Promise<PointPreviewResponse> {
  const base = await getApiBaseAsync();
  const formData = new FormData();
  formData.append('point_file', file);
  const response = await fetch(`${base}/projects/point/preview`, {
    method: 'POST',
    body: formData
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || 'Failed to preview point');
  }
  return response.json();
}

/**
 * Create a new project with the provided wizard payload
 */
export async function createProject(formData: FormData): Promise<CreateProjectResponse> {
  const base = await getApiBaseAsync();
  const token = localStorage.getItem('agrs_token');
  const headers: HeadersInit = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const response = await fetch(`${base}/projects/create`, {
    method: 'POST',
    headers,
    body: formData
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || 'Failed to create project');
  }
  return response.json();
}

// ============================================================================
// Creator Mode (AOI/POI) API
// ============================================================================

export type CreatorEntryType = 'AOI' | 'POI'

export type CreatorCategory =
  | 'Geological'
  | 'Environmental'
  | 'Engineering'
  | 'Regulatory'
  | 'Crossing'
  | 'Other'

export type SurveyObservationType = 'New' | 'Confirm' | 'Correct' | 'Supersede'
export type SurveyConfidence = 'Low' | 'Med' | 'High'
export type SurveyMethod = 'Walkover' | 'Vehicle' | 'UAV' | 'Other'
export type SurveyStatus = 'Open' | 'NeedsReview' | 'Verified' | 'Closed'
export type SurveyGpsQuality = 'Good' | 'OK' | 'Poor'

export interface CreatorSurvey {
  observation_type?: SurveyObservationType
  confidence?: SurveyConfidence
  method?: SurveyMethod
  status?: SurveyStatus
  observed_at?: string
  gps_quality?: SurveyGpsQuality
  category_fields?: Record<string, string>
}

export interface NearestVectorFeatureCandidate {
  rank: number
  within_aoi: boolean
  distance_m: number
  feature: GeoJSON.Feature<GeoJSON.Geometry, Record<string, any>>
}

export interface NearestVectorFeaturesResponse {
  dataset: { project: string; layer: string }
  candidates: NearestVectorFeatureCandidate[]
}

export interface CreatorDatasetFeatureSelection {
  dataset: string
  feature: GeoJSON.Feature<GeoJSON.Geometry, Record<string, any>>
  within_aoi?: boolean
  distance_m?: number
  rank?: number
}

export type CreatorDatasetType = 'raster' | 'vector'

export interface CreatorDatasetRef {
  name: string
  type?: CreatorDatasetType
}

export interface CreatorActor {
  username?: string
  name?: string
  role?: string
  company?: string
}

export interface CreatorAttachment {
  filename: string
  path: string
  size_bytes: number
  mime: string
  uploaded_at: string
}

export interface CreatorEntry {
  id: string
  type: CreatorEntryType
  status: 'active' | 'deleted'
  project_name: string
  project_epsg: number
  title: string
  category: CreatorCategory
  category_other?: string | null
  comment?: string
  datasets?: CreatorDatasetRef[]
  survey?: CreatorSurvey
  dataset_features?: CreatorDatasetFeatureSelection[]
  geometry_wgs84: GeoJSON.Geometry
  geometry_project: GeoJSON.Geometry
  attachments: CreatorAttachment[]
  created_at: string
  created_by: CreatorActor
  updated_at: string
  updated_by: CreatorActor
  deleted_at?: string | null
  deleted_by?: CreatorActor | null
}

export interface CreatorGeoJSONFeatureCollection extends GeoJSON.FeatureCollection {
  features: Array<
    GeoJSON.Feature<
      GeoJSON.Geometry,
      {
        creator_id?: string
        creator_type?: string
        title?: string
        category?: string
        category_other?: string
        comment?: string
        datasets?: CreatorDatasetRef[]
        status?: string
        created_at?: string
        updated_at?: string
        created_by?: string | null
        updated_by?: string | null
        sortie_id?: string | null
      }
    >
  >
}

export function getCreatorAttachmentUrl(project: string, entryId: string, filename: string): string {
  return `${getApiBaseSync()}/projects/${project}/creator/entries/${entryId}/attachments/${encodeURIComponent(filename)}`
}

export async function fetchCreatorGeoJSON(
  project: string,
  options?: { includeDeleted?: boolean }
): Promise<CreatorGeoJSONFeatureCollection> {
  const base = await getApiBaseAsync()
  const includeDeleted = Boolean(options?.includeDeleted)
  const url = `${base}/projects/${project}/creator/geojson${includeDeleted ? '?include_deleted=true' : ''}`
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to load creator geojson for ${project}: ${response.statusText}`)
  }
  return response.json()
}

export async function getCreatorEntry(project: string, entryId: string): Promise<CreatorEntry> {
  const base = await getApiBaseAsync()
  const response = await fetch(`${base}/projects/${project}/creator/entries/${entryId}`)
  if (!response.ok) {
    throw new Error(`Failed to load creator entry ${entryId}: ${response.statusText}`)
  }
  return response.json()
}

export async function getCreatorEntryChangelog(project: string, entryId: string): Promise<any[]> {
  const base = await getApiBaseAsync()
  const response = await fetch(`${base}/projects/${project}/creator/entries/${entryId}/changelog`)
  if (!response.ok) {
    throw new Error(`Failed to load creator changelog ${entryId}: ${response.statusText}`)
  }
  return response.json()
}

export async function createCreatorEntry(project: string, formData: FormData): Promise<CreatorEntry> {
  const base = await getApiBaseAsync()
  const token = localStorage.getItem('agrs_token')
  const headers: HeadersInit = {}
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  const response = await fetch(`${base}/projects/${project}/creator/entries`, {
    method: 'POST',
    headers,
    body: formData
  })
  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || 'Failed to create creator entry')
  }
  return response.json()
}

export async function updateCreatorEntry(project: string, entryId: string, formData: FormData): Promise<CreatorEntry> {
  const base = await getApiBaseAsync()
  const token = localStorage.getItem('agrs_token')
  const headers: HeadersInit = {}
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  const response = await fetch(`${base}/projects/${project}/creator/entries/${entryId}`, {
    method: 'PUT',
    headers,
    body: formData
  })
  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || 'Failed to update creator entry')
  }
  return response.json()
}

export async function deleteCreatorEntry(project: string, entryId: string): Promise<CreatorEntry> {
  const base = await getApiBaseAsync()
  const token = localStorage.getItem('agrs_token')
  const headers: HeadersInit = {}
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  const response = await fetch(`${base}/projects/${project}/creator/entries/${entryId}`, {
    method: 'DELETE',
    headers
  })
  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || 'Failed to delete creator entry')
  }
  return response.json()
}

// ============================================================================
// Sorties API
// ============================================================================

export interface Sortie {
  id: string
  project_id: string
  code: string
  name?: string | null
  started_at?: string | null
  ended_at?: string | null
  notes?: string | null
  metadata?: any
  created_by_user_id?: string | null
  created_at?: string | null
  updated_at?: string | null
}

export interface SortieListResponse {
  project_name: string
  count: number
  sorties: Sortie[]
}

export interface CreateSortieRequest {
  code: string
  name?: string
  started_at?: string
  ended_at?: string
  notes?: string
  metadata?: any
}

export interface UpdateSortieRequest {
  name?: string | null
  started_at?: string | null
  ended_at?: string | null
  notes?: string | null
  metadata?: any
}

export async function fetchProjectSorties(
  project: string,
  options?: { q?: string; limit?: number }
): Promise<SortieListResponse> {
  const base = await getApiBaseAsync()
  const token = localStorage.getItem('agrs_token')
  const headers: HeadersInit = {}
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const params = new URLSearchParams()
  if (options?.q) params.set('q', options.q)
  if (options?.limit) params.set('limit', String(options.limit))

  const url = `${base}/projects/${project}/sorties${params.toString() ? `?${params.toString()}` : ''}`
  const response = await fetch(url, { headers })
  if (!response.ok) {
    const message = await response.text()
    let detail = message
    try {
      const parsed = JSON.parse(message)
      if (parsed && typeof parsed === 'object' && typeof (parsed as any).detail === 'string') {
        detail = String((parsed as any).detail)
      }
    } catch {
      // ignore (non-JSON)
    }
    if (response.status === 404 && detail === 'Not Found') {
      detail = 'Sorties endpoint not found on backend. Ensure backend is updated/restarted.'
    }
    throw new Error(detail || `Failed to load sorties for ${project}`)
  }
  return response.json()
}

export async function createProjectSortie(project: string, payload: CreateSortieRequest): Promise<Sortie> {
  const base = await getApiBaseAsync()
  const token = localStorage.getItem('agrs_token')
  const headers: HeadersInit = { 'Content-Type': 'application/json' }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  const response = await fetch(`${base}/projects/${project}/sorties`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  })
  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || 'Failed to create sortie')
  }
  return response.json()
}

export async function getProjectSortie(project: string, sortieId: string): Promise<Sortie> {
  const base = await getApiBaseAsync()
  const token = localStorage.getItem('agrs_token')
  const headers: HeadersInit = {}
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const response = await fetch(`${base}/projects/${encodeURIComponent(project)}/sorties/${encodeURIComponent(sortieId)}`, { headers })
  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || `Failed to load sortie ${sortieId}`)
  }
  return response.json()
}

export async function updateProjectSortie(project: string, sortieId: string, payload: UpdateSortieRequest): Promise<Sortie> {
  const base = await getApiBaseAsync()
  const token = localStorage.getItem('agrs_token')
  const headers: HeadersInit = { 'Content-Type': 'application/json' }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const response = await fetch(`${base}/projects/${encodeURIComponent(project)}/sorties/${encodeURIComponent(sortieId)}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(payload)
  })
  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || 'Failed to update sortie')
  }
  return response.json()
}

export async function archiveProjectSortie(project: string, sortieId: string): Promise<Sortie> {
  const base = await getApiBaseAsync()
  const token = localStorage.getItem('agrs_token')
  const headers: HeadersInit = {}
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const response = await fetch(`${base}/projects/${encodeURIComponent(project)}/sorties/${encodeURIComponent(sortieId)}`, {
    method: 'DELETE',
    headers
  })
  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || 'Failed to archive sortie')
  }
  return response.json()
}

/**
 * Retrieve dataset fetch job status
 */
export async function fetchDatasetJob(jobId: string): Promise<DatasetFetchJob> {
  const base = await getApiBaseAsync();
  const response = await fetch(`${base}/dataset-jobs/${jobId}`);
  if (!response.ok) {
    throw new Error(`Failed to load dataset job ${jobId}: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Subscribe to dataset job events (SSE with polling fallback)
 */
export function subscribeToDatasetJob(
  jobId: string,
  onUpdate: (job: DatasetFetchJob) => void,
  onError?: (error: Error) => void
): () => void {
  let stopped = false;
  let lastJob: DatasetFetchJob | null = null;
  const isTerminal = (status?: DatasetFetchJob['status'] | null) =>
    status === 'succeeded' || status === 'failed' || status === 'partial';

  // Polling function as fallback
  const poll = async () => {
    if (stopped) return;
    try {
      const payload = await fetchDatasetJob(jobId);
      if (stopped) return;
      lastJob = payload;
      onUpdate(payload);
      if (isTerminal(payload.status)) {
        stopped = true;
        return;
      }
    } catch (err) {
      if (stopped) return;
      // Only report error if we haven't received any updates yet
      if (!lastJob) {
        onError?.(err instanceof Error ? err : new Error('Failed to poll dataset job.'));
        stopped = true;
        return;
      }
      // Otherwise, keep polling silently
      console.warn('[DatasetJob] Poll failed, retrying...', err);
    }
    if (!stopped) {
      setTimeout(poll, 2000);
    }
  };

  // Try SSE first if available
  if (typeof window !== 'undefined' && typeof EventSource !== 'undefined') {
    const streamUrl = `${getApiBaseSync()}/dataset-jobs/${jobId}/stream`;
    console.log('[DatasetJob] Connecting to SSE stream:', streamUrl);

    const source = new EventSource(streamUrl);
    let receivedFirstMessage = false;

    source.onopen = () => {
      console.log('[DatasetJob] SSE connection opened');
    };

    source.onmessage = (event) => {
      try {
        receivedFirstMessage = true;
        const payload = JSON.parse(event.data) as DatasetFetchJob;
        lastJob = payload;
        onUpdate(payload);

        // Close connection when job is complete
        if (isTerminal(payload.status)) {
          console.log('[DatasetJob] Job complete, closing SSE');
          source.close();
          stopped = true;
        }
      } catch (err) {
        console.error('[DatasetJob] Failed to parse SSE message:', err);
        onError?.(err instanceof Error ? err : new Error('Failed to parse dataset job update.'));
      }
    };

    source.onerror = (event) => {
      console.warn('[DatasetJob] SSE error, falling back to polling:', event);
      source.close();

      // If we already have a terminal state, treat the disconnect as normal.
      if (!stopped && lastJob && isTerminal(lastJob.status)) {
        stopped = true;
        return;
      }

      // If we never received a message, fall back to polling
      if (!receivedFirstMessage && !stopped) {
        console.log('[DatasetJob] Falling back to polling mode');
        poll();
      } else if (!stopped && lastJob && !isTerminal(lastJob.status)) {
        // SSE disconnected mid-stream, fall back to polling
        console.log('[DatasetJob] SSE disconnected, continuing with polling');
        poll();
      } else if (!stopped) {
        onError?.(new Error('Dataset job stream disconnected.'));
      }
    };

    return () => {
      stopped = true;
      source.close();
    };
  }

  // No SSE support, use polling
  poll();
  return () => {
    stopped = true;
  };
}

export async function cancelDatasetJob(jobId: string): Promise<void> {
  const base = await getApiBaseAsync();
  const token = localStorage.getItem('agrs_token')
  const headers: HeadersInit = {}
  if (token) headers['Authorization'] = `Bearer ${token}`
  const response = await fetch(`${base}/dataset-jobs/${jobId}`, { method: 'DELETE', headers });
  if (!response.ok) {
    throw new Error(`Failed to cancel dataset job ${jobId}: ${response.statusText}`);
  }
}

/**
 * Get tile URL for a raster layer
 */
export function getTileUrl(project: string, layer: string): string {
  return `${getApiBaseSync()}/tiles/${project}/${layer}/{z}/{x}/{y}.png`;
}

/**
 * Get vector tile (MVT) URL for a vector layer
 */
export function getVectorTileUrl(project: string, layer: string): string {
  return `${getApiBaseSync()}/vector-tiles/${encodeURIComponent(project)}/${encodeURIComponent(layer)}/{z}/{x}/{y}.pbf`
}

/**
 * Get terrain tile URL for DEM layers (Mapbox Terrain-RGB encoding)
 */
export function getTerrainTileUrl(project: string, layer: string): string {
  return `${getApiBaseSync()}/terrain/${project}/${layer}/{z}/{x}/{y}.png`;
}

/**
 * Get AOI file URL
 */
export function getAoiFileUrl(project: string, filename: string): string {
  return `${getApiBaseSync()}/data/${project}/aoi/${filename}`;
}

/**
 * Clear the backend GeoJSON cache
 */
export async function clearCache(): Promise<void> {
  const base = await getApiBaseAsync()
  const response = await fetch(`${base}/data/cache`, {
    method: 'DELETE'
  });
  
  if (!response.ok) {
    throw new Error(`Failed to clear cache: ${response.statusText}`);
  }
}

export interface PirlOutput {
  filename: string;
  size_bytes: number;
  last_modified: string;
  path: string;
}

export async function listPirlOutputs(projectName: string): Promise<PirlOutput[]> {
  const base = await getApiBaseAsync();
  const response = await fetch(`${base}/projects/${projectName}/pirl/outputs`);
  if (!response.ok) {
    throw new Error(`Failed to list PIRL outputs: ${response.statusText}`);
  }
  return response.json();
}

// PIRL Job Types and API
export interface PirlJobPhase {
  name: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
}

export interface PirlJob {
  job_id: string;
  status: 'processing' | 'completed' | 'failed' | 'unknown' | 'error';
  created_at: string;
  estimated_completion: string;
  remaining_seconds: number;
  progress_percent: number;
  current_phase: string;
  phases: PirlJobPhase[];
  active_profile: string;
  directory: string;
  error?: string;
}

export interface PirlJobCreateResponse {
  success: boolean;
  message: string;
  job: {
    job_id: string;
    status: string;
    created_at: string;
    estimated_completion: string;
    duration_hours: number;
    directory: string;
  };
  files: {
    request: string;
    cost_matrix: string;
    status: string;
  };
}

export async function listPirlJobs(projectName: string): Promise<PirlJob[]> {
  const base = await getApiBaseAsync();
  const response = await fetch(`${base}/pirl/${projectName}/jobs`);
  if (!response.ok) {
    throw new Error(`Failed to list PIRL jobs: ${response.statusText}`);
  }
  return response.json();
}

export async function getPirlJob(projectName: string, jobId: string): Promise<PirlJob> {
  const base = await getApiBaseAsync();
  const response = await fetch(`${base}/pirl/${projectName}/jobs/${jobId}`);
  if (!response.ok) {
    throw new Error(`Failed to get PIRL job: ${response.statusText}`);
  }
  return response.json();
}

export interface PipelineSpecsHydraulics {
  initial_pressure_bar?: number;
  min_delivery_pressure_bar?: number;
  max_operating_pressure_bar?: number;
  volumetric_flow_rate_m3_s?: number;
  operating_temperature_k?: number;
  gas_molecular_weight_kg_kmol?: number;
  gas_specific_gravity?: number;
  pipe_roughness_mm?: number;
  enable_hydraulics?: boolean;
  enable_compressor_placement?: boolean;
  compressor_capex_per_kw_usd?: number;
  compressor_opex_fraction?: number;
  energy_cost_usd_per_kwh?: number;
}

export interface PipelineSpecs {
  // New project format
  product?: string;
  inner_diameter?: number;
  outer_diameter?: number;
  measurement_system?: string;

  // Legacy/detailed format (Ravenna-Chieti style)
  diameter_mm?: number;
  wall_thickness_mm?: number;
  thickness_mm?: number;
  material?: string;
  type?: string;
  mop_bar?: number;
  dp_bar?: number;
  mop_pa?: number;
  dp_pa?: number;
  depth_of_cover_m?: number;
  hdd_min_bend_radius_m?: number;
  hdd_min_radius_m?: number;
  hdd_applicable?: boolean;
  hot_bend_angles_deg?: number[];
  hot_bend_min_radius_m?: number;
  hot_bend_max_count?: number;
  field_bend_max_angle_deg?: number;
  house_min_distance_m?: number;
  houses_min_distance_m?: number;
  poles_min_distance_m?: number;
  powerlines_min_distance_m?: number;
  existing_pipelines_min_distance_m?: number;
  max_slope_percent?: number;
  prefer_orthogonal_crossings?: boolean;
  prefer_existing_rows?: boolean;
  orthogonal_crossing_threshold_deg?: number;
  existing_row_bonus_usd_per_m?: number;
  flow_rate_m3_s?: number;
  operating_temp_k?: number;
  max_pressure_drop_mpa?: number;
  hydraulics?: PipelineSpecsHydraulics;
}

export async function fetchPipelineSpecs(projectName: string): Promise<PipelineSpecs> {
  const base = await getApiBaseAsync();
  const response = await fetch(`${base}/projects/${projectName}/pipeline-specs`);
  if (!response.ok) {
    throw new Error(`Failed to fetch pipeline specs: ${response.statusText}`);
  }
  return response.json();
}

export async function updatePipelineSpecs(
  projectName: string,
  specs: Partial<PipelineSpecs>
): Promise<PipelineSpecs> {
  const base = await getApiBaseAsync()
  const token = typeof window !== 'undefined' ? localStorage.getItem('agrs_token') : null
  const headers: HeadersInit = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const response = await fetch(`${base}/projects/${projectName}/pipeline-specs`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(specs),
  })
  if (!response.ok) {
    let detail = ''
    try {
      const contentType = response.headers.get('content-type') || ''
      if (contentType.includes('application/json')) {
        const json = await response.json()
        detail = json?.detail ? ` - ${json.detail}` : ''
      }
    } catch (_) {}
    throw new Error(`Failed to update pipeline specs: ${response.status} ${response.statusText}${detail}`)
  }
  return response.json()
}

// ============================================================================
// Engineering: Pressure Design (C++ powered)
// ============================================================================

export type PressureDesignMode = 'thickness_from_pressure' | 'pressure_from_thickness'

export interface PressureDesignComputeRequest {
  mode: PressureDesignMode
  inputs: Record<string, any>
  project?: string
  save?: boolean
}

export interface PressureDesignComputeResponse {
  mode: PressureDesignMode
  result: Record<string, any>
  saved?: boolean
  artifact_path?: string
}

export async function computePressureDesign(
  request: PressureDesignComputeRequest
): Promise<PressureDesignComputeResponse> {
  const base = await getApiBaseAsync()
  const response = await fetch(`${base}/engineering/pressure-design`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  })
  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.detail || `Pressure design failed: ${response.statusText}`)
  }
  return response.json()
}

// Route profile types
export interface ElevationPoint {
  distance: number;
  elevation: number | null;
  x: number;
  y: number;
}

export interface LandcoverPoint {
  distance: number;
  landcover_class: number | null;
}

export interface RouteProfileStatistics {
  min_elevation: number;
  max_elevation: number;
  elevation_range: number;
  total_distance: number;
  sample_count: number;
  total_climb: number;
  total_descent: number;
}

export interface RouteProfileResponse {
  route: string;
  elevation_profile: ElevationPoint[];
  landcover_profile: LandcoverPoint[];
  statistics: RouteProfileStatistics;
}

/**
 * Fetch elevation and landcover profile for a route by sampling DEM data
 */
export async function fetchRouteProfile(projectName: string, routeName: string, samples: number = 500): Promise<RouteProfileResponse> {
  const base = await getApiBaseAsync();
  const response = await fetch(`${base}/data/${projectName}/route-profile/${encodeURIComponent(routeName)}?samples=${samples}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch route profile: ${response.statusText}`);
  }
  return response.json();
}

// Earthworks Analysis Types
export interface EarthworksCrossSection {
  chainage: number;
  center_x: number;
  center_y: number;
  ground_elevation: number;
  grading_elevation: number;
  transect_offsets: number[];
  transect_elevations: (number | null)[];
  transversal_slope: number;
  cut_area: number;
  fill_area: number;
  cut_volume: number;
  fill_volume: number;
  mass_haul: number;
}

export interface MassHaulPoint {
  chainage: number;
  cut: number;
  fill: number;
  balance: number;
}

export interface EarthworksParameters {
  row_width: number;
  grading_slope: number;
  batter_cut_angle: number;
  batter_fill_angle: number;
}

export interface EarthworksSummary {
  total_length_m: number;
  num_sections: number;
  total_cut_m3: number;
  total_fill_m3: number;
  mass_haul_balance_m3: number;
  cut_fill_ratio: number | null;
}

export interface EarthworksResponse {
  route: string;
  parameters: EarthworksParameters;
  summary: EarthworksSummary;
  cross_sections: EarthworksCrossSection[];
  mass_haul_diagram: MassHaulPoint[];
}

/**
 * Fetch earthworks analysis for a route
 * Computes cut/fill volumes along the pipeline ROW using cross-section method
 */
export async function fetchEarthworksAnalysis(
  projectName: string,
  routeName: string,
  params?: {
    row_width?: number;
    grading_slope?: number;
    batter_cut_angle?: number;
    batter_fill_angle?: number;
  }
): Promise<EarthworksResponse> {
  const base = await getApiBaseAsync();
  const queryParams = new URLSearchParams();
  const maybeSetNumber = (key: string, value: number | undefined) => {
    if (value === undefined) return
    if (!Number.isFinite(value)) return
    queryParams.set(key, value.toString())
  }
  maybeSetNumber('row_width', params?.row_width)
  maybeSetNumber('grading_slope', params?.grading_slope)
  maybeSetNumber('batter_cut_angle', params?.batter_cut_angle)
  maybeSetNumber('batter_fill_angle', params?.batter_fill_angle)

  const queryString = queryParams.toString();
  const url = `${base}/data/${projectName}/earthworks/${encodeURIComponent(routeName)}${queryString ? '?' + queryString : ''}`;

  const response = await fetch(url);
  if (!response.ok) {
    let detail = response.statusText
    try {
      const contentType = response.headers.get('content-type') || ''
      if (contentType.includes('application/json')) {
        const json = await response.json()
        if (typeof json?.detail === 'string') {
          detail = json.detail
        } else if (json?.detail) {
          detail = JSON.stringify(json.detail)
        }
      }
    } catch (_) {}
    throw new Error(`Failed to fetch earthworks analysis: ${detail}`);
  }
  return response.json();
}
