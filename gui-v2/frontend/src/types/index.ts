/**
 * Type definitions for AGRS ZEUS GUI v2
 */

export interface Project {
  id: string;
  name: string;
  description: string;
  created_at: string;
  status: 'active' | 'inactive' | 'archived';
}

export interface NavigationItem {
  id: string;
  label: string;
  icon?: string;
  path?: string;
  children?: NavigationItem[];
}

export interface MapConfig {
  center: [number, number];
  zoom: number;
  style: string;
}




