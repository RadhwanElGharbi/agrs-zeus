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
}

export interface DatasetCoverageResponse {
  iso3: string;
  country?: string | null;
  entries: DatasetCoverageEntry[];
  summary?: string | null;
  protocol_reference: string;
}

export type DatasetCategory =
  | 'dem'
  | 'landcover'
  | 'soil'
  | 'geohazard'
  | 'roads'
  | 'railways'
  | 'powerlines'
  | 'waterways'
  | 'pipelines'

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
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'skipped';
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
  status: 'pending' | 'running' | 'succeeded' | 'failed';
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

export interface GeoJSON {
  type: string;
  features: any[];
  [key: string]: any;
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
 * Fetch vector data as GeoJSON
 */
export async function fetchVectorData(project: string, layer: string): Promise<GeoJSON> {
  const base = await getApiBaseAsync()
  const response = await fetch(`${base}/data/${project}/vectors/${layer}`);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch vector layer ${layer}: ${response.statusText}`);
  }
  
  return response.json();
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
  const response = await fetch(`${base}/pirl/${project}/routes/${routeName}/metadata`);

  if (!response.ok) {
    throw new Error(`Failed to fetch route metadata for ${routeName}: ${response.statusText}`);
  }

  return response.json();
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
  const response = await fetch(`${base}/projects/${project}/crs`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
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

  const response = await fetch(`${base}/projects/${project}/dataset-fetch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new Error(`Failed to start dataset fetch: ${response.statusText}`);
  }
  return response.json();
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
  const response = await fetch(`${base}/projects/create`, {
    method: 'POST',
    body: formData
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || 'Failed to create project');
  }
  return response.json();
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

  // Polling function as fallback
  const poll = async () => {
    if (stopped) return;
    try {
      const payload = await fetchDatasetJob(jobId);
      if (stopped) return;
      lastJob = payload;
      onUpdate(payload);
      if (payload.status === 'succeeded' || payload.status === 'failed') {
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
        if (payload.status === 'succeeded' || payload.status === 'failed') {
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

      // If we never received a message, fall back to polling
      if (!receivedFirstMessage && !stopped) {
        console.log('[DatasetJob] Falling back to polling mode');
        poll();
      } else if (!stopped && lastJob && lastJob.status !== 'succeeded' && lastJob.status !== 'failed') {
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
  const response = await fetch(`${base}/dataset-jobs/${jobId}`, { method: 'DELETE' });
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

export interface PipelineSpecs {
  product: string;
  inner_diameter: number;
  outer_diameter: number;
  measurement_system: string;
}

export async function fetchPipelineSpecs(projectName: string): Promise<PipelineSpecs> {
  const base = await getApiBaseAsync();
  const response = await fetch(`${base}/projects/${projectName}/pipeline-specs`);
  if (!response.ok) {
    throw new Error(`Failed to fetch pipeline specs: ${response.statusText}`);
  }
  return response.json();
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
  section_spacing: number;
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
    section_spacing?: number;
    grading_slope?: number;
    batter_cut_angle?: number;
    batter_fill_angle?: number;
  }
): Promise<EarthworksResponse> {
  const base = await getApiBaseAsync();
  const queryParams = new URLSearchParams();
  if (params?.row_width) queryParams.set('row_width', params.row_width.toString());
  if (params?.section_spacing) queryParams.set('section_spacing', params.section_spacing.toString());
  if (params?.grading_slope) queryParams.set('grading_slope', params.grading_slope.toString());
  if (params?.batter_cut_angle) queryParams.set('batter_cut_angle', params.batter_cut_angle.toString());
  if (params?.batter_fill_angle) queryParams.set('batter_fill_angle', params.batter_fill_angle.toString());

  const queryString = queryParams.toString();
  const url = `${base}/data/${projectName}/earthworks/${encodeURIComponent(routeName)}${queryString ? '?' + queryString : ''}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch earthworks analysis: ${response.statusText}`);
  }
  return response.json();
}
