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
  };
  measurement_system?: string;
  units?: Record<string, string>;
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
  const base = await getApiBaseAsync()
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
  const base = await getApiBaseAsync()
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
  const base = await getApiBaseAsync()
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
 * Get tile URL for a raster layer
 */
export function getTileUrl(project: string, layer: string): string {
  return `${getApiBaseSync()}/tiles/${project}/${layer}/{z}/{x}/{y}.png`;
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
