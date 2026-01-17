import type { CustomLayerInterface, Map as MapLibreMap } from 'maplibre-gl'
import { TerrainSampler } from '@/lib/terrainSampler'

type GeoJsonPointFeature = {
  type: 'Feature'
  geometry: { type: 'Point'; coordinates: [number, number] }
  properties?: Record<string, any>
}

type GeoJsonPointFeatureCollection = {
  type: 'FeatureCollection'
  features: GeoJsonPointFeature[]
}

export type GroundElevationProvider = (lng: number, lat: number) => number | null

export type Crossings3DLayer = CustomLayerInterface & {
  setData: (fc: GeoJsonPointFeatureCollection) => void
  setBaseHeightMeters: (meters: number) => void
  setGroundElevationProvider: (provider: GroundElevationProvider) => void
  setDemTileTemplate: (template: string | null) => void
  requestRepaint: () => void
  destroy: () => void
}

const CATEGORY_COLORS: Record<string, string> = {
  roads: '#f97316',
  railways: '#22c55e',
  waterways: '#06b6d4',
  hydrology: '#06b6d4',
  powerlines: '#eab308',
  pipelines: '#ef4444',
  default: '#a855f7'
}

function colorForCategory(category: string | undefined): string {
  const key = (category || '').toLowerCase()
  return CATEGORY_COLORS[key] || CATEGORY_COLORS.default
}

function markerIconSvg(category: string | undefined): string {
  const key = (category || '').toLowerCase()

  // Icons are designed for a 64x64 viewBox, centered in the pin head at ~ (32, 22).
  if (key === 'roads') {
    return `
      <g stroke="#ffffff" stroke-width="4" stroke-linecap="round" fill="none" opacity="0.95">
        <path d="M24 12 L24 34" />
        <path d="M40 12 L40 34" />
        <path d="M32 12 L32 34" stroke-dasharray="6 6" />
      </g>
    `
  }

  if (key === 'railways') {
    return `
      <g stroke="#ffffff" stroke-width="4" stroke-linecap="round" fill="none" opacity="0.95">
        <path d="M24 12 L24 34" />
        <path d="M40 12 L40 34" />
        <path d="M24 16 L40 16" stroke-width="3" />
        <path d="M24 24 L40 24" stroke-width="3" />
        <path d="M24 32 L40 32" stroke-width="3" />
      </g>
    `
  }

  if (key === 'waterways' || key === 'hydrology') {
    return `
      <g stroke="#ffffff" stroke-width="4" stroke-linecap="round" fill="none" opacity="0.95">
        <path d="M18 24 C22 18 26 18 30 24 C34 30 38 30 42 24 C46 18 50 18 54 24" />
      </g>
    `
  }

  if (key === 'powerlines') {
    return `
      <path d="M36 10 L22 28 H31 L28 42 L46 22 H37 Z" fill="#ffffff" opacity="0.95" />
    `
  }

  if (key === 'pipelines') {
    return `
      <g stroke="#ffffff" stroke-width="4" stroke-linecap="round" fill="none" opacity="0.95">
        <circle cx="32" cy="22" r="10" />
        <path d="M22 22 H42" />
      </g>
    `
  }

  return `
    <g stroke="#ffffff" stroke-width="4" stroke-linecap="round" fill="none" opacity="0.95">
      <path d="M22 30 L32 14 L42 30" />
      <path d="M26 30 H38" />
    </g>
  `
}

function buildMarkerSvg(category: string | undefined, color: string): string {
  return `
  <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
    <defs>
      <linearGradient id="pinGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${color}" stop-opacity="1"/>
        <stop offset="100%" stop-color="${color}" stop-opacity="0.92"/>
      </linearGradient>
    </defs>
    <!-- Pin body -->
    <path
      d="M32 2C20.4 2 11 11.4 11 23c0 17.8 21 39 21 39s21-21.2 21-39C53 11.4 43.6 2 32 2z"
      fill="url(#pinGrad)"
      stroke="#0b0b0b"
      stroke-width="2"
      stroke-linejoin="round"
    />
    <!-- Head ring -->
    <circle cx="32" cy="22" r="16" fill="${color}" stroke="#ffffff" stroke-width="2" opacity="0.98"/>
    <!-- Icon -->
    ${markerIconSvg(category)}
  </svg>
  `.trim()
}

function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

async function createTextureFromSvg(THREE: any, svg: string, sizePx: number): Promise<any> {
  if (typeof document === 'undefined') {
    return null
  }

  return await new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = sizePx
      canvas.height = sizePx
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        resolve(null)
        return
      }
      ctx.clearRect(0, 0, sizePx, sizePx)
      ctx.drawImage(img, 0, 0, sizePx, sizePx)
      const tex = new THREE.CanvasTexture(canvas)
      tex.needsUpdate = true
      tex.flipY = false
      resolve(tex)
    }
    img.onerror = () => resolve(null)
    img.src = svgDataUrl(svg)
  })
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function createCrossings3DLayer(options?: {
  id?: string
  baseHeightMeters?: number
  markerHeightMeters?: number
  markerWidthMeters?: number
}): Crossings3DLayer {
  const id = options?.id ?? 'route-crossings-3d'
  const markerHeightMeters = options?.markerHeightMeters ?? 10
  const markerWidthMeters = options?.markerWidthMeters ?? 7
  let baseHeightMeters = options?.baseHeightMeters ?? 8

  let map: MapLibreMap | null = null
  let renderer: any | null = null
  let scene: any | null = null
  let camera: any | null = null
  let THREE: any | null = null
  let MercatorCoordinate: any | null = null

  let data: GeoJsonPointFeatureCollection = { type: 'FeatureCollection', features: [] }
  let needsSync = true

  const markersById = new Map<string, any>() // id -> THREE.Sprite
  const materialByCategory = new Map<string, any>() // categoryKey -> THREE.SpriteMaterial

  const requestRepaint = () => {
    try {
      map?.triggerRepaint()
    } catch {
      // ignore
    }
  }

  // Optional Terrain-RGB sampler fallback (used only if queryTerrainElevation is unavailable).
  let demTemplate: string | null = null
  let demSampler: TerrainSampler | null = null
  const absElevationCache = new Map<string, number | null>()
  const absElevationPending = new Map<string, Promise<number | null>>()

  const clampSampleZoom = (zoom: number): number => {
    if (!Number.isFinite(zoom)) return 10
    return Math.max(2, Math.min(14, Math.round(zoom)))
  }

  const absElevationKey = (lng: number, lat: number, zoom: number) => {
    const z = clampSampleZoom(zoom)
    return `${z}:${lng.toFixed(6)},${lat.toFixed(6)}`
  }

  const requestAbsElevation = (lng: number, lat: number): number | null => {
    if (!map || !demSampler) return null
    const zoom = typeof map.getZoom === 'function' ? map.getZoom() : 10
    const key = absElevationKey(lng, lat, zoom)

    if (absElevationCache.has(key)) {
      return absElevationCache.get(key) ?? null
    }

    if (!absElevationPending.has(key)) {
      const promise = demSampler
        .sample(lng, lat, zoom)
        .then((value) => {
          absElevationPending.delete(key)
          absElevationCache.set(key, value ?? null)
          requestRepaint()
          return value ?? null
        })
        .catch(() => {
          absElevationPending.delete(key)
          absElevationCache.set(key, null)
          requestRepaint()
          return null
        })
      absElevationPending.set(key, promise)
    }

    return null
  }

  // Default: terrain-aware when MapLibre 3D terrain is enabled (queryTerrainElevation),
  // otherwise treat ground as flat (0). If queryTerrainElevation is unavailable, optionally fall
  // back to a configured DEM template (TerrainSampler).
  const internalGroundElevationProvider: GroundElevationProvider = (lng: number, lat: number) => {
    if (!map) return 0

    // MapLibre returns elevation offset relative to the map center elevation.
    const qte = (map as any).queryTerrainElevation
    if (typeof qte === 'function') {
      const v = qte.call(map, [lng, lat])
      return isFiniteNumber(v) ? v : 0
    }

    // Fallback: if a DEM sampler is configured AND terrain is enabled, approximate the same offset:
    // offset = absElevation(point) - absElevation(center).
    const terrain = typeof (map as any).getTerrain === 'function' ? (map as any).getTerrain() : null
    if (!terrain || !demSampler) return 0

    const abs = requestAbsElevation(lng, lat)
    const centerAbs = isFiniteNumber((map as any)?.transform?.elevation) ? Number((map as any).transform.elevation) : 0
    return isFiniteNumber(abs) ? Number(abs) - centerAbs : 0
  }

  let getGroundElevation: GroundElevationProvider = internalGroundElevationProvider

  const getFeatureKey = (f: GeoJsonPointFeature): string => {
    const p = f.properties || {}
    const idFromProps = p.crossing_id || p.id || p.feature_id
    if (typeof idFromProps === 'string' && idFromProps.trim()) {
      return idFromProps
    }
    const [lng, lat] = f.geometry.coordinates
    return `${p.category || 'unknown'}:${lng.toFixed(7)},${lat.toFixed(7)}`
  }

  const ensureCategoryMaterial = async (category: string | undefined) => {
    if (!THREE) return
    const key = (category || 'default').toLowerCase()
    if (materialByCategory.has(key)) return

    const color = colorForCategory(key)
    const svg = buildMarkerSvg(key, color)
    const texture = await createTextureFromSvg(THREE, svg, 256)
    const material = new THREE.SpriteMaterial({
      map: texture || undefined,
      transparent: true,
      depthTest: true,
      depthWrite: false
    })
    // Helps trim edge halos from the PNG alpha ramp after SVG rasterization.
    material.alphaTest = 0.25
    materialByCategory.set(key, material)
    requestRepaint()
  }

  const updateMarkerHeights = () => {
    if (!map) return
    const terrainEnabled = typeof (map as any).getTerrain === 'function' ? Boolean((map as any).getTerrain()) : false

    for (const sprite of markersById.values()) {
      const ud = sprite?.userData
      const lng = ud?.lng
      const lat = ud?.lat
      const metersToWorld = ud?.metersToWorld
      if (!isFiniteNumber(lng) || !isFiniteNumber(lat) || !isFiniteNumber(metersToWorld)) continue

      const ground = terrainEnabled ? getGroundElevation(lng, lat) : 0
      const altitudeMeters = (ground ?? 0) + baseHeightMeters
      sprite.position.z = altitudeMeters * metersToWorld
    }
  }

  const syncSprites = async () => {
    if (!map || !THREE || !scene || !MercatorCoordinate) return
    needsSync = false

    const nextIds = new Set<string>()

    // Create/update
    for (const f of data.features || []) {
      if (!f || f.type !== 'Feature') continue
      if (!f.geometry || f.geometry.type !== 'Point') continue
      const coords = f.geometry.coordinates
      if (!Array.isArray(coords) || coords.length !== 2) continue
      const [lng, lat] = coords
      if (!isFiniteNumber(lng) || !isFiniteNumber(lat)) continue

      const category = (f.properties?.category as string | undefined) || 'default'
      const categoryKey = category.toLowerCase()
      const key = getFeatureKey(f)
      nextIds.add(key)

      // Ensure material exists (async). If not ready yet, we will still create sprite with default.
      void ensureCategoryMaterial(categoryKey)
      const material = materialByCategory.get(categoryKey) || materialByCategory.get('default')

      let sprite = markersById.get(key)
      if (!sprite) {
        sprite = new THREE.Sprite(material || new THREE.SpriteMaterial({ color: 0xffffff }))
        // Pin tip anchored at coordinate.
        sprite.center.set(0.5, 0.0)
        sprite.frustumCulled = true
        markersById.set(key, sprite)
        scene.add(sprite)
      } else if (material && sprite.material !== material) {
        sprite.material = material
      }

      // Stable X/Y + meter scale in Mercator space; Z is updated per-frame (updateMarkerHeights()).
      const mc0 = MercatorCoordinate.fromLngLat({ lng, lat } as any, 0)
      const metersToWorld = mc0.meterInMercatorCoordinateUnits()

      sprite.position.x = mc0.x
      sprite.position.y = mc0.y
      sprite.scale.set(markerWidthMeters * metersToWorld, markerHeightMeters * metersToWorld, 1)
      sprite.userData = { lng, lat, metersToWorld }
    }

    // Remove stale
    for (const [key, sprite] of markersById.entries()) {
      if (nextIds.has(key)) continue
      try {
        scene.remove(sprite)
      } catch {
        // ignore
      }
      markersById.delete(key)
    }

    updateMarkerHeights()
    requestRepaint()
  }

  const layer: Crossings3DLayer = {
    id,
    type: 'custom',
    renderingMode: '3d',
    onAdd(_map: MapLibreMap, gl: WebGLRenderingContext) {
      map = _map

      // Dynamic import to avoid SSR issues.
      Promise.all([import('three'), import('maplibre-gl')])
        .then(([threeModule, maplibreModule]) => {
          if (!map) return
          THREE = (threeModule as any)
          MercatorCoordinate = (maplibreModule as any).MercatorCoordinate

          scene = new THREE.Scene()
          camera = new THREE.Camera()

          renderer = new THREE.WebGLRenderer({
            canvas: map.getCanvas(),
            context: gl,
            antialias: true
          })
          renderer.autoClear = false

          // Always create default material first.
          void ensureCategoryMaterial('default')
          needsSync = true
          requestRepaint()
        })
        .catch((error) => {
          console.warn('[Crossings3DLayer] failed to init', error)
        })
    },
    onRemove() {
      try {
        this.destroy()
      } catch {
        // ignore
      }
    },
    render(gl: WebGLRenderingContext, matrix: number[]) {
      if (!map || !renderer || !scene || !camera || !THREE) return

      if (needsSync) {
        // Fire and forget; render will no-op until ready.
        void syncSprites()
      } else {
        // Keep Z aligned with terrain as center/elevation changes while panning/zooming.
        updateMarkerHeights()
      }

      try {
        const m = new THREE.Matrix4().fromArray(matrix as any)
        camera.projectionMatrix = m

        renderer.resetState()
        renderer.render(scene, camera)
      } catch (error) {
        console.warn('[Crossings3DLayer] render error', error)
      } finally {
        // MapLibre owns the GL context; do not clear buffers here.
        void gl
      }
    },
    setData(fc: GeoJsonPointFeatureCollection) {
      data = fc && fc.type === 'FeatureCollection' ? fc : { type: 'FeatureCollection', features: [] }
      needsSync = true
      requestRepaint()
    },
    setBaseHeightMeters(meters: number) {
      baseHeightMeters = Number.isFinite(meters) ? meters : baseHeightMeters
      requestRepaint()
    },
    setGroundElevationProvider(provider: GroundElevationProvider) {
      getGroundElevation = typeof provider === 'function' ? provider : internalGroundElevationProvider
      requestRepaint()
    },
    setDemTileTemplate(template: string | null) {
      const next = typeof template === 'string' && template.trim() ? template.trim() : null
      demTemplate = next

      absElevationCache.clear()
      absElevationPending.clear()

      if (!demTemplate) {
        demSampler?.dispose()
        demSampler = null
        requestRepaint()
        return
      }

      if (demSampler) {
        demSampler.updateTemplate(demTemplate)
      } else {
        demSampler = new TerrainSampler(demTemplate)
      }
      requestRepaint()
    },
    requestRepaint,
    destroy() {
      try {
        for (const sprite of markersById.values()) {
          try {
            scene?.remove(sprite)
          } catch {
            // ignore
          }
        }
        markersById.clear()

        for (const mat of materialByCategory.values()) {
          try {
            if (mat.map) mat.map.dispose?.()
          } catch {
            // ignore
          }
          try {
            mat.dispose?.()
          } catch {
            // ignore
          }
        }
        materialByCategory.clear()

        demSampler?.dispose()
        demSampler = null
        demTemplate = null
        absElevationCache.clear()
        absElevationPending.clear()

        renderer?.dispose?.()
      } finally {
        renderer = null
        scene = null
        camera = null
        THREE = null
        MercatorCoordinate = null
        map = null
      }
    }
  }

  return layer
}


