/**
 * API Client for AGRS ZEUS Backend
 */

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

export interface HealthResponse {
  status: string;
  timestamp: string;
  version: string;
  services: Record<string, string>;
}

export interface ProjectInfo {
  id: string;
  name: string;
  description: string;
  created_at: string;
  status: string;
}

export interface ConfigResponse {
  mapbox_token: string;
  api_version: string;
  features: string[];
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options?.headers,
        },
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`API Request failed: ${url}`, error);
      throw error;
    }
  }

  // Health check
  async health(): Promise<HealthResponse> {
    return this.request<HealthResponse>('/health');
  }

  // Get all projects
  async getProjects(): Promise<ProjectInfo[]> {
    return this.request<ProjectInfo[]>('/projects');
  }

  // Get project details
  async getProjectDetails(projectId: string): Promise<any> {
    return this.request(`/projects/${projectId}`);
  }

  // Get configuration
  async getConfig(): Promise<ConfigResponse> {
    return this.request<ConfigResponse>('/config');
  }
}

// Export singleton instance
export const apiClient = new ApiClient();






