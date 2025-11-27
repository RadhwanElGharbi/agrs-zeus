/**
 * AGRS ZEUS GUI v2 - API Client
 * 
 * Provides typed API client for accessing backend data endpoints.
 */

// API base resolver with retries across common host candidates.
let RESOLVED_API_BASE: string | null = null
let resolvePromise: Promise<string> | null = null

const DEFAULT_PORT = 8000

function candidateBases(): string[] {
  const list: string[] = []
  if (process.env.NEXT_PUBLIC_API_URL) list.push(process.env.NEXT_PUBLIC_API_URL)
  if (typeof window !== 'undefined') {
    const protocol = window.location?.protocol === 'https:' ? 'https:' : 'http:'
    const host = window.location?.hostname || '127.0.0.1'
    list.push(`${protocol}//${host}:${DEFAULT_PORT}/api`)
  }
  list.push(`http://127.0.0.1:${DEFAULT_PORT}/api`, `http://localhost:${DEFAULT_PORT}/api`)
  return Array.from(new Set(list))
}

async function resolveApiBase(): Promise<string> {
  if (RESOLVED_API_BASE) return RESOLVED_API_BASE
  if (resolvePromise) return resolvePromise

  resolvePromise = (async () => {
    const candidates = candidateBases()
    for (const base of candidates) {
      try {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 2000)
        const resp = await fetch(`${base}/health`, { signal: controller.signal })
        clearTimeout(timer)
        if (resp.ok) {
          RESOLVED_API_BASE = base
          return base
        }
      } catch {
        // try next
      }
    }
    // Fallback to first candidate if none reachable
    RESOLVED_API_BASE = candidates[0]
    return RESOLVED_API_BASE
  })()

  return resolvePromise
}

function getApiBaseSync(): string {
  if (RESOLVED_API_BASE) return RESOLVED_API_BASE
  const list = candidateBases()
  return list[0]
}

async function getApiBaseAsync(): Promise<string> {
  return resolveApiBase()
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
  if (typeof window !== 'undefined' && typeof EventSource !== 'undefined') {
    const source = new EventSource(`${getApiBaseSync()}/dataset-jobs/${jobId}/stream`);
    source.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as DatasetFetchJob;
        onUpdate(payload);
      } catch (err) {
        onError?.(err instanceof Error ? err : new Error('Failed to parse dataset job update.'));
      }
    };
    source.onerror = () => {
      source.close();
      onError?.(new Error('Dataset job stream disconnected.'));
    };
    return () => source.close();
  }

  let stopped = false;
  const poll = async () => {
    try {
      const payload = await fetchDatasetJob(jobId);
      if (stopped) return;
      onUpdate(payload);
      if (payload.status === 'succeeded' || payload.status === 'failed') {
        stopped = true;
        return;
      }
    } catch (err) {
      if (stopped) return;
      onError?.(err instanceof Error ? err : new Error('Failed to poll dataset job.'));
      stopped = true;
      return;
    }
    if (!stopped) {
      setTimeout(poll, 2500);
    }
  };
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
