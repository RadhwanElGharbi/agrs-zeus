'use client'

import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'

export type MapMode = 'gis' | 'operator' | 'routing'
export type OperatorTool = 'none' | 'create_poi' | 'create_aoi'
export type OperatorGeometryKind = 'point' | 'polygon'

type OperatorActions = {
  startTool: (tool: Exclude<OperatorTool, 'none'>) => void
  cancel: () => void
  captureGeometry: (kind: OperatorGeometryKind) => Promise<GeoJSON.Geometry>
}

type OperatorDialogActions = {
  openOperatorEntriesIndex: () => void
  openSortiesIndex: () => void
  openSortiesCreate: () => void
}

type GisActions = {
  openFetchDatasets: () => void
  openDatasetIndex: () => void
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
  registerOperatorActions: (actions: OperatorActions) => void
  registerOperatorDialogActions: (actions: Partial<OperatorDialogActions>) => void
  registerGisActions: (actions: Partial<GisActions>) => void
  registerPirlActions: (actions: Partial<PirlActions>) => void
  registerRoutingActions: (actions: Partial<RoutingActions>) => void
  setOperatorUiState: (state: OperatorUiState) => void
  operatorDialogs: OperatorDialogActions
  gis: GisActions
  pirl: PirlActions
  routing: RoutingActions
  operator: OperatorUiState & {
    startTool: (tool: Exclude<OperatorTool, 'none'>) => void
    cancel: () => void
    captureGeometry: (kind: OperatorGeometryKind) => Promise<GeoJSON.Geometry>
  }
}

const MapViewContext = createContext<MapViewContextValue | undefined>(undefined)

export function MapViewProvider({ children }: { children: React.ReactNode }) {
  const [mapMode, setMapMode] = useState<MapMode>('gis')
  const [operatorUiState, setOperatorUiState] = useState<OperatorUiState>({ tool: 'none', geometryEditActive: false })

  const operatorActionsRef = useRef<OperatorActions>({
    startTool: () => {},
    cancel: () => {},
    captureGeometry: async () => {
      throw new Error('Geometry capture is not available.')
    }
  })

  const operatorDialogActionsRef = useRef<OperatorDialogActions>({
    openOperatorEntriesIndex: () => {},
    openSortiesIndex: () => {},
    openSortiesCreate: () => {}
  })

  const gisActionsRef = useRef<GisActions>({
    openFetchDatasets: () => {},
    openDatasetIndex: () => {}
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
      registerOperatorActions,
      registerOperatorDialogActions,
      registerGisActions,
      registerPirlActions,
      registerRoutingActions,
      setOperatorUiState,
      operatorDialogs: {
        openOperatorEntriesIndex,
        openSortiesIndex,
        openSortiesCreate
      },
      gis: {
        openFetchDatasets,
        openDatasetIndex
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
        captureGeometry
      }
    }
  }, [
    cancel,
    captureGeometry,
    mapMode,
    openOperatorEntriesIndex,
    openSortiesCreate,
    openSortiesIndex,
    openDatasetIndex,
    openFetchDatasets,
    openPirlAi,
    openPirlManager,
    openCrossingsManager,
    operatorUiState,
    registerOperatorDialogActions,
    registerGisActions,
    registerPirlActions,
    registerRoutingActions,
    registerOperatorActions,
    startTool
  ])

  return <MapViewContext.Provider value={value}>{children}</MapViewContext.Provider>
}

export function useMapView() {
  const ctx = useContext(MapViewContext)
  if (!ctx) throw new Error('useMapView must be used within a MapViewProvider')
  return ctx
}


