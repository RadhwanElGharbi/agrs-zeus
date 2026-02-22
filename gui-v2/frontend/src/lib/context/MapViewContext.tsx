'use client'

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '@/lib/context/AuthContext'

// ---------------------------------------------------------------------------
// Session persistence helpers
// ---------------------------------------------------------------------------
const STORAGE_PREFIX = 'zeus_session_'
const STARTUP_GLOBE_USERS = new Set(['georges_guerette@tcenergy.com'])

function shouldForceStartupGlobe(user: { email?: string | null; username?: string } | null): boolean {
  if (!user) return false
  const identifiers = [user.email, user.username]
  return identifiers.some((value) => {
    if (!value) return false
    return STARTUP_GLOBE_USERS.has(String(value).trim().toLowerCase())
  })
}

export function readSession<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${key}`)
    if (raw === null) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function writeSession<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(value))
  } catch { /* quota exceeded – non-critical */ }
}

export type MapProjection = 'mercator' | 'globe'
export type MapMode = 'gis' | 'operator' | 'routing'
export type OperatorTool = 'none' | 'create_poi' | 'create_aoi'
export type OperatorGeometryKind = 'point' | 'polygon'

type OperatorActions = {
  startTool: (tool: Exclude<OperatorTool, 'none'>) => void
  cancel: () => void
  captureGeometry: (kind: OperatorGeometryKind) => Promise<GeoJSON.Geometry>
  zoomToCreatorEntry: (entryId: string) => void
  zoomToGeoJSON: (geojson: GeoJSON.Geometry | GeoJSON.Feature | GeoJSON.FeatureCollection) => void
}

type OperatorDialogActions = {
  openOperatorEntriesIndex: () => void
  openSortiesIndex: () => void
  openSortiesCreate: () => void
}

type GisActions = {
  openFetchDatasets: () => void
  openDatasetIndex: () => void
  openDatasetDigitalTwin: () => void
  openMeasureTool: (tool: 'distance' | 'area' | 'elevation') => void
}

type PirlActions = {
  openPirlAi: () => void
}

type RoutingActions = {
  openPirlManager: () => void
  openCrossingsManager: () => void
}

type OperatorUiState = {
  tool: OperatorTool
  geometryEditActive: boolean
}

export type MapViewContextValue = {
  mapMode: MapMode
  setMapMode: (mode: MapMode) => void
  mapProjection: MapProjection
  setMapProjection: (projection: MapProjection) => void
  mapUiIdle: boolean
  setMapUiIdle: (idle: boolean) => void
  registerOperatorActions: (actions: OperatorActions) => void
  registerOperatorDialogActions: (actions: Partial<OperatorDialogActions>) => void
  registerGisActions: (actions: Partial<GisActions>) => void
  registerPirlActions: (actions: Partial<PirlActions>) => void
  registerRoutingActions: (actions: Partial<RoutingActions>) => void
  setOperatorUiState: (state: OperatorUiState) => void
  sortiePreviewGeometry: GeoJSON.Geometry | null
  setSortiePreviewGeometry: (geometry: GeoJSON.Geometry | null) => void
  operatorDialogs: OperatorDialogActions
  gis: GisActions
  pirl: PirlActions
  routing: RoutingActions
  operator: OperatorUiState & {
    startTool: (tool: Exclude<OperatorTool, 'none'>) => void
    cancel: () => void
    captureGeometry: (kind: OperatorGeometryKind) => Promise<GeoJSON.Geometry>
    zoomToCreatorEntry: (entryId: string) => void
    zoomToGeoJSON: (geojson: GeoJSON.Geometry | GeoJSON.Feature | GeoJSON.FeatureCollection) => void
  }
}

const MapViewContext = createContext<MapViewContextValue | undefined>(undefined)

export function MapViewProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [mapMode, _setMapMode] = useState<MapMode>(() => {
    const stored = readSession<string>('map_mode', 'gis')
    return (['gis', 'operator', 'routing'] as MapMode[]).includes(stored as MapMode)
      ? (stored as MapMode)
      : 'gis'
  })

  const setMapMode = useCallback((mode: MapMode) => {
    _setMapMode(mode)
    writeSession('map_mode', mode)
  }, [])

  const [mapProjection, _setMapProjection] = useState<MapProjection>(() => {
    if (shouldForceStartupGlobe(user)) return 'globe'
    const stored = readSession<string>('map_projection', 'mercator')
    return stored === 'globe' ? 'globe' : 'mercator'
  })

  const setMapProjection = useCallback((projection: MapProjection) => {
    _setMapProjection(projection)
    writeSession('map_projection', projection)
  }, [])

  useEffect(() => {
    if (!shouldForceStartupGlobe(user)) return
    setMapProjection('globe')
  }, [setMapProjection, user])

  const [mapUiIdle, _setMapUiIdle] = useState(false)
  const setMapUiIdle = useCallback((idle: boolean) => {
    _setMapUiIdle(idle)
  }, [])

  const [operatorUiState, setOperatorUiState] = useState<OperatorUiState>({ tool: 'none', geometryEditActive: false })
  const [sortiePreviewGeometry, setSortiePreviewGeometry] = useState<GeoJSON.Geometry | null>(null)

  const operatorActionsRef = useRef<OperatorActions>({
    startTool: () => {},
    cancel: () => {},
    captureGeometry: async () => {
      throw new Error('Geometry capture is not available.')
    },
    zoomToCreatorEntry: () => {},
    zoomToGeoJSON: () => {}
  })

  const operatorDialogActionsRef = useRef<OperatorDialogActions>({
    openOperatorEntriesIndex: () => {},
    openSortiesIndex: () => {},
    openSortiesCreate: () => {}
  })

  const gisActionsRef = useRef<GisActions>({
    openFetchDatasets: () => {},
    openDatasetIndex: () => {},
    openDatasetDigitalTwin: () => {},
    openMeasureTool: () => {}
  })

  const pirlActionsRef = useRef<PirlActions>({
    openPirlAi: () => {}
  })

  const routingActionsRef = useRef<RoutingActions>({
    openPirlManager: () => {},
    openCrossingsManager: () => {}
  })

  const registerOperatorActions = useCallback((actions: OperatorActions) => {
    operatorActionsRef.current = actions
  }, [])

  const registerOperatorDialogActions = useCallback((actions: Partial<OperatorDialogActions>) => {
    operatorDialogActionsRef.current = { ...operatorDialogActionsRef.current, ...actions }
  }, [])

  const registerGisActions = useCallback((actions: Partial<GisActions>) => {
    gisActionsRef.current = { ...gisActionsRef.current, ...actions }
  }, [])

  const registerPirlActions = useCallback((actions: Partial<PirlActions>) => {
    pirlActionsRef.current = { ...pirlActionsRef.current, ...actions }
  }, [])

  const registerRoutingActions = useCallback((actions: Partial<RoutingActions>) => {
    routingActionsRef.current = { ...routingActionsRef.current, ...actions }
  }, [])

  const startTool = useCallback((tool: Exclude<OperatorTool, 'none'>) => {
    operatorActionsRef.current.startTool(tool)
  }, [])

  const cancel = useCallback(() => {
    operatorActionsRef.current.cancel()
  }, [])

  const captureGeometry = useCallback((kind: OperatorGeometryKind) => {
    return operatorActionsRef.current.captureGeometry(kind)
  }, [])

  const zoomToCreatorEntry = useCallback((entryId: string) => {
    operatorActionsRef.current.zoomToCreatorEntry(entryId)
  }, [])

  const zoomToGeoJSON = useCallback((geojson: GeoJSON.Geometry | GeoJSON.Feature | GeoJSON.FeatureCollection) => {
    operatorActionsRef.current.zoomToGeoJSON(geojson)
  }, [])

  const openOperatorEntriesIndex = useCallback(() => {
    operatorDialogActionsRef.current.openOperatorEntriesIndex()
  }, [])

  const openSortiesIndex = useCallback(() => {
    operatorDialogActionsRef.current.openSortiesIndex()
  }, [])

  const openSortiesCreate = useCallback(() => {
    operatorDialogActionsRef.current.openSortiesCreate()
  }, [])

  const openFetchDatasets = useCallback(() => {
    gisActionsRef.current.openFetchDatasets()
  }, [])

  const openDatasetIndex = useCallback(() => {
    gisActionsRef.current.openDatasetIndex()
  }, [])

  const openDatasetDigitalTwin = useCallback(() => {
    gisActionsRef.current.openDatasetDigitalTwin()
  }, [])

  const openMeasureTool = useCallback((tool: 'distance' | 'area' | 'elevation') => {
    gisActionsRef.current.openMeasureTool(tool)
  }, [])

  const openPirlAi = useCallback(() => {
    pirlActionsRef.current.openPirlAi()
  }, [])

  const openPirlManager = useCallback(() => {
    routingActionsRef.current.openPirlManager()
  }, [])

  const openCrossingsManager = useCallback(() => {
    routingActionsRef.current.openCrossingsManager()
  }, [])

  const value = useMemo<MapViewContextValue>(() => {
    return {
      mapMode,
      setMapMode,
      mapProjection,
      setMapProjection,
      mapUiIdle,
      setMapUiIdle,
      registerOperatorActions,
      registerOperatorDialogActions,
      registerGisActions,
      registerPirlActions,
      registerRoutingActions,
      setOperatorUiState,
      sortiePreviewGeometry,
      setSortiePreviewGeometry,
      operatorDialogs: {
        openOperatorEntriesIndex,
        openSortiesIndex,
        openSortiesCreate
      },
      gis: {
        openFetchDatasets,
        openDatasetIndex,
        openDatasetDigitalTwin,
        openMeasureTool
      },
      pirl: {
        openPirlAi
      },
      routing: {
        openPirlManager,
        openCrossingsManager
      },
      operator: {
        ...operatorUiState,
        startTool,
        cancel,
        captureGeometry,
        zoomToCreatorEntry,
        zoomToGeoJSON
      }
    }
  }, [
    cancel,
    captureGeometry,
    mapMode,
    mapProjection,
    mapUiIdle,
    setMapProjection,
    setMapUiIdle,
    openOperatorEntriesIndex,
    openSortiesCreate,
    openSortiesIndex,
    openDatasetIndex,
    openDatasetDigitalTwin,
    openFetchDatasets,
    openMeasureTool,
    openPirlAi,
    openPirlManager,
    openCrossingsManager,
    operatorUiState,
    sortiePreviewGeometry,
    registerOperatorDialogActions,
    registerGisActions,
    registerPirlActions,
    registerRoutingActions,
    registerOperatorActions,
    startTool,
    zoomToCreatorEntry,
    zoomToGeoJSON
  ])

  return <MapViewContext.Provider value={value}>{children}</MapViewContext.Provider>
}

export function useMapView() {
  const ctx = useContext(MapViewContext)
  if (!ctx) throw new Error('useMapView must be used within a MapViewProvider')
  return ctx
}


