/**
 * AGRS ZEUS GUI v2 - API Client
 * 
 * Provides typed API client for accessing backend data endpoints.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

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
  const response = await fetch(`${API_BASE}/projects`);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch projects: ${response.statusText}`);
  }
  
  return response.json();
}

/**
 * Fetch metadata for a specific project
 */
export async function fetchProjectMetadata(project: string): Promise<ProjectMetadata> {
  const response = await fetch(`${API_BASE}/projects/${project}/metadata`);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch metadata for ${project}: ${response.statusText}`);
  }
  
  return response.json();
}

/**
 * Fetch list of datasets for a specific project
 */
export async function fetchProjectDatasets(project: string): Promise<ProjectDatasets> {
  const response = await fetch(`${API_BASE}/projects/${project}/datasets`);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch datasets for ${project}: ${response.statusText}`);
  }
  
  return response.json();
}

/**
 * Fetch vector data as GeoJSON
 */
export async function fetchVectorData(project: string, layer: string): Promise<GeoJSON> {
  const response = await fetch(`${API_BASE}/data/${project}/vectors/${layer}`);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch vector layer ${layer}: ${response.statusText}`);
  }
  
  return response.json();
}

/**
 * Fetch list of PIRL routes for a project
 */
export async function fetchPIRLRoutes(project: string): Promise<RouteMetadata[]> {
  const response = await fetch(`${API_BASE}/pirl/${project}/routes`);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch PIRL routes for ${project}: ${response.statusText}`);
  }
  
  return response.json();
}

/**
 * Fetch a specific PIRL route GeoJSON
 */
export async function fetchPIRLRoute(project: string, routeName: string): Promise<GeoJSON> {
  const response = await fetch(`${API_BASE}/pirl/${project}/routes/${routeName}`);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch route ${routeName}: ${response.statusText}`);
  }
  
  return response.json();
}

/**
 * Get tile URL for a raster layer
 */
export function getTileUrl(project: string, layer: string): string {
  return `${API_BASE}/tiles/${project}/${layer}/{z}/{x}/{y}.png`;
}

/**
 * Clear the backend GeoJSON cache
 */
export async function clearCache(): Promise<void> {
  const response = await fetch(`${API_BASE}/data/cache`, {
    method: 'DELETE'
  });
  
  if (!response.ok) {
    throw new Error(`Failed to clear cache: ${response.statusText}`);
  }
}

