import Point from '@mapbox/point-geometry'
import type { CustomLayerInterface, CustomRenderMethodInput, Map as MapLibreMap } from 'maplibre-gl'

// ---------------------------------------------------------------------------
// High-quality, astronomy-based sky layer.
//
// Uses NASA/Gaia deep-star map (equirectangular projection) as the primary
// source, then falls back to a widely used 8K stars texture. Rendering is done
// via a full-screen triangle and per-pixel view-ray reconstruction, so there
// are no visible skybox edges or geometry artefacts.
// ---------------------------------------------------------------------------

const SKY_TEXTURE_URLS = [
  // NASA Deep Star Maps 2020 (Gaia DR2 based), requested at 8192 px wide.
  'https://upload.wikimedia.org/wikipedia/commons/thumb/3/34/Deep_Star_Maps_2020_%E2%80%93_Starmap_2020_64k_gal.jpg/8192px-Deep_Star_Maps_2020_%E2%80%93_Starmap_2020_64k_gal.jpg',
  // Fallback: Solar System Scope stars texture (also 8K).
  'https://upload.wikimedia.org/wikipedia/commons/8/85/Solarsystemscope_texture_8k_stars_milky_way.jpg'
] as const

const DEFAULT_FOV_RAD = (85 * Math.PI) / 180
const DEFAULT_EXPOSURE = 1.35
const LON_OFFSET_TURNS = 0.0

const vertexSource = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`

const fragmentSource = `
precision highp float;
const float PI = 3.141592653589793;
varying vec2 v_uv;

uniform float u_tanHalfFov;
uniform float u_aspect;
uniform float u_opacity;
uniform float u_exposure;
uniform float u_lonOffsetTurns;
uniform vec3 u_camRight;
uniform vec3 u_camUp;
uniform vec3 u_camForward;
uniform sampler2D u_starMap;

void main() {
  // Camera-local ray (forward = -Z).
  vec3 localRay = normalize(vec3(
    v_uv.x * u_tanHalfFov * u_aspect,
    v_uv.y * u_tanHalfFov,
    -1.0
  ));
  // Transform into world using camera basis reconstructed from MapLibre's
  // current transform ray directions (includes pan/orbit, not just tilt/rotate).
  vec3 ray = normalize(
    u_camRight * localRay.x +
    u_camUp * localRay.y +
    (-u_camForward) * localRay.z
  );

  // Convert to equirectangular UV.
  float lon = atan(ray.z, ray.x);
  float lat = asin(clamp(ray.y, -1.0, 1.0));

  // Wikimedia Deep Star Maps uses longitude increasing to the left.
  float u = fract(0.5 - lon / (2.0 * PI) + u_lonOffsetTurns);
  float v = clamp(0.5 - lat / PI, 0.0, 1.0);

  vec3 color = texture2D(u_starMap, vec2(u, v)).rgb;
  // Slight HDR-like boost so stars retain detail after blending.
  color = vec3(1.0) - exp(-color * u_exposure);

  gl_FragColor = vec4(color, u_opacity);
}
`

function compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('Unable to create shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`Shader compile failed: ${info}`)
  }
  return shader
}

function createProgram(gl: WebGLRenderingContext, vsSource: string, fsSource: string): WebGLProgram {
  const program = gl.createProgram()
  if (!program) throw new Error('Unable to create program')
  gl.attachShader(program, compileShader(gl, gl.VERTEX_SHADER, vsSource))
  gl.attachShader(program, compileShader(gl, gl.FRAGMENT_SHADER, fsSource))
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program)
    gl.deleteProgram(program)
    throw new Error(`Program link failed: ${info}`)
  }
  return program
}

function createPlaceholderTexture(gl: WebGLRenderingContext): WebGLTexture {
  const texture = gl.createTexture()
  if (!texture) throw new Error('Failed to create texture')
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]))
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.bindTexture(gl.TEXTURE_2D, null)
  return texture
}

function resizeIfNeeded(image: HTMLImageElement, maxTextureSize: number): HTMLImageElement | HTMLCanvasElement {
  if (image.width <= maxTextureSize && image.height <= maxTextureSize) {
    return image
  }

  const scale = Math.min(maxTextureSize / image.width, maxTextureSize / image.height)
  const width = Math.max(1, Math.floor(image.width * scale))
  const height = Math.max(1, Math.floor(image.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return image
  ctx.drawImage(image, 0, 0, width, height)
  return canvas
}

function getAnisotropyExtension(gl: WebGLRenderingContext) {
  return (
    gl.getExtension('EXT_texture_filter_anisotropic') ||
    gl.getExtension('MOZ_EXT_texture_filter_anisotropic') ||
    gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic')
  ) as
    | {
        TEXTURE_MAX_ANISOTROPY_EXT: number
        MAX_TEXTURE_MAX_ANISOTROPY_EXT: number
      }
    | null
}

function uploadTextureImage(
  gl: WebGLRenderingContext,
  texture: WebGLTexture,
  source: HTMLImageElement | HTMLCanvasElement
) {
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.generateMipmap(gl.TEXTURE_2D)

  const anisotropyExt = getAnisotropyExtension(gl)
  if (anisotropyExt) {
    const maxAniso = gl.getParameter(anisotropyExt.MAX_TEXTURE_MAX_ANISOTROPY_EXT) as number
    gl.texParameterf(
      gl.TEXTURE_2D,
      anisotropyExt.TEXTURE_MAX_ANISOTROPY_EXT,
      Math.min(8, maxAniso)
    )
  }
  gl.bindTexture(gl.TEXTURE_2D, null)
}

type Vec3 = [number, number, number]

function normalizeVec3(v: Vec3): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / len, v[1] / len, v[2] / len]
}

function dotVec3(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

function subVec3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

function scaleVec3(v: Vec3, s: number): Vec3 {
  return [v[0] * s, v[1] * s, v[2] * s]
}

function crossVec3(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ]
}

function rotateX(v: Vec3, angle: number): Vec3 {
  const [x, y, z] = v
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return [x, y * c - z * s, y * s + z * c]
}

function rotateY(v: Vec3, angle: number): Vec3 {
  const [x, y, z] = v
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return [x * c + z * s, y, -x * s + z * c]
}

function computeFallbackCameraBasis(map: MapLibreMap): { right: Vec3; up: Vec3; forward: Vec3 } {
  const bearingRad = map.getBearing() * Math.PI / 180
  const pitchRad = map.getPitch() * Math.PI / 180
  const alpha = pitchRad - Math.PI * 0.5

  const apply = (v: Vec3): Vec3 => rotateY(rotateX(v, alpha), -bearingRad)
  const right = normalizeVec3(apply([1, 0, 0]))
  const forward = normalizeVec3(apply([0, 0, -1]))
  const up = normalizeVec3(crossVec3(right, forward))
  return { right, up, forward }
}

function computeTransformCameraBasis(transform: any, width: number, height: number): { right: Vec3; up: Vec3; forward: Vec3 } | null {
  if (!transform || typeof transform.getRayDirectionFromPixel !== 'function') return null

  const centerPoint = transform.centerPoint
    ? new Point(transform.centerPoint.x, transform.centerPoint.y)
    : new Point(width * 0.5, height * 0.5)

  const centerRayRaw = transform.getRayDirectionFromPixel(centerPoint) as ArrayLike<number>
  const rightRayRaw = transform.getRayDirectionFromPixel(new Point(centerPoint.x + 1, centerPoint.y)) as ArrayLike<number>
  const upRayRaw = transform.getRayDirectionFromPixel(new Point(centerPoint.x, centerPoint.y - 1)) as ArrayLike<number>
  if (!centerRayRaw || !rightRayRaw || !upRayRaw) return null

  const forward = normalizeVec3([centerRayRaw[0], centerRayRaw[1], centerRayRaw[2]])
  const rightRay = normalizeVec3([rightRayRaw[0], rightRayRaw[1], rightRayRaw[2]])
  const upRay = normalizeVec3([upRayRaw[0], upRayRaw[1], upRayRaw[2]])

  const rightProjected = subVec3(rightRay, scaleVec3(forward, dotVec3(rightRay, forward)))
  let right = normalizeVec3(rightProjected)
  if (!Number.isFinite(right[0]) || !Number.isFinite(right[1]) || !Number.isFinite(right[2])) return null

  let up = normalizeVec3(crossVec3(right, forward))
  // Align computed up-vector with the sampled screen-up ray.
  if (dotVec3(up, upRay) < 0) {
    right = scaleVec3(right, -1)
    up = scaleVec3(up, -1)
  }

  return { right, up, forward }
}

export interface StarSkyboxLayer extends CustomLayerInterface {
  setOpacity(opacity: number): void
}

export function createStarSkyboxLayer(): StarSkyboxLayer {
  let program: WebGLProgram | null = null
  let buffer: WebGLBuffer | null = null
  let texture: WebGLTexture | null = null
  let mapInstance: MapLibreMap | null = null
  let currentOpacity = 1.0
  let cancelTextureLoad: (() => void) | null = null

  let aPosLoc = -1
  let uCamRightLoc: WebGLUniformLocation | null = null
  let uCamUpLoc: WebGLUniformLocation | null = null
  let uCamForwardLoc: WebGLUniformLocation | null = null
  let uTanHalfFovLoc: WebGLUniformLocation | null = null
  let uAspectLoc: WebGLUniformLocation | null = null
  let uOpacityLoc: WebGLUniformLocation | null = null
  let uExposureLoc: WebGLUniformLocation | null = null
  let uLonOffsetLoc: WebGLUniformLocation | null = null
  let uStarMapLoc: WebGLUniformLocation | null = null

  // One oversized triangle that covers the full viewport in NDC.
  const fullScreenTriangle = new Float32Array([
    -1, -1,
    3, -1,
    -1, 3
  ])

  const layer: StarSkyboxLayer = {
    id: 'star-skybox',
    type: 'custom',
    renderingMode: '3d',

    setOpacity(opacity: number) {
      currentOpacity = Math.max(0, Math.min(1, opacity))
      mapInstance?.triggerRepaint()
    },

    onAdd(map: MapLibreMap, gl: WebGLRenderingContext) {
      mapInstance = map
      program = createProgram(gl, vertexSource, fragmentSource)

      aPosLoc = gl.getAttribLocation(program, 'a_pos')
      uCamRightLoc = gl.getUniformLocation(program, 'u_camRight')
      uCamUpLoc = gl.getUniformLocation(program, 'u_camUp')
      uCamForwardLoc = gl.getUniformLocation(program, 'u_camForward')
      uTanHalfFovLoc = gl.getUniformLocation(program, 'u_tanHalfFov')
      uAspectLoc = gl.getUniformLocation(program, 'u_aspect')
      uOpacityLoc = gl.getUniformLocation(program, 'u_opacity')
      uExposureLoc = gl.getUniformLocation(program, 'u_exposure')
      uLonOffsetLoc = gl.getUniformLocation(program, 'u_lonOffsetTurns')
      uStarMapLoc = gl.getUniformLocation(program, 'u_starMap')

      buffer = gl.createBuffer()
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
      gl.bufferData(gl.ARRAY_BUFFER, fullScreenTriangle, gl.STATIC_DRAW)
      gl.bindBuffer(gl.ARRAY_BUFFER, null)

      texture = createPlaceholderTexture(gl)

      let canceled = false
      let image: HTMLImageElement | null = null
      let urlIndex = 0

      const loadNext = () => {
        if (canceled || !texture) return
        if (urlIndex >= SKY_TEXTURE_URLS.length) {
          console.warn('[Skybox] Failed to load all sky textures, keeping placeholder texture')
          return
        }

        image = new Image()
        image.crossOrigin = 'anonymous'
        image.decoding = 'async'
        image.referrerPolicy = 'no-referrer'
        image.onload = () => {
          if (canceled || !texture) return
          const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number
          const source = resizeIfNeeded(image as HTMLImageElement, maxTextureSize)
          uploadTextureImage(gl, texture, source)
          map.triggerRepaint()
        }
        image.onerror = () => {
          urlIndex += 1
          loadNext()
        }
        image.src = SKY_TEXTURE_URLS[urlIndex]
      }

      cancelTextureLoad = () => {
        canceled = true
        if (image) {
          image.onload = null
          image.onerror = null
          image.src = ''
        }
      }

      loadNext()
    },

    render(gl: WebGLRenderingContext | WebGL2RenderingContext, _options: CustomRenderMethodInput) {
      if (!program || !buffer || !texture || !mapInstance) return
      if (currentOpacity <= 0.001) return

      const transform = (mapInstance as any).transform
      const fovRad: number = transform?.fov ?? transform?._fov ?? DEFAULT_FOV_RAD
      const tanHalfFov = Math.tan(fovRad * 0.5)
      const canvas = gl.canvas as HTMLCanvasElement
      const aspect = canvas.width / canvas.height
      const transformBasis = computeTransformCameraBasis(transform, canvas.width, canvas.height)
      const basis = transformBasis ?? computeFallbackCameraBasis(mapInstance)

      gl.useProgram(program)

      gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
      gl.enableVertexAttribArray(aPosLoc)
      gl.vertexAttribPointer(aPosLoc, 2, gl.FLOAT, false, 0, 0)

      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, texture)
      gl.uniform1i(uStarMapLoc, 0)
      gl.uniform3f(uCamRightLoc, basis.right[0], basis.right[1], basis.right[2])
      gl.uniform3f(uCamUpLoc, basis.up[0], basis.up[1], basis.up[2])
      gl.uniform3f(uCamForwardLoc, basis.forward[0], basis.forward[1], basis.forward[2])
      gl.uniform1f(uTanHalfFovLoc, tanHalfFov)
      gl.uniform1f(uAspectLoc, aspect)
      gl.uniform1f(uOpacityLoc, currentOpacity)
      gl.uniform1f(uExposureLoc, DEFAULT_EXPOSURE)
      gl.uniform1f(uLonOffsetLoc, LON_OFFSET_TURNS)

      gl.disable(gl.DEPTH_TEST)
      gl.depthMask(false)
      gl.disable(gl.CULL_FACE)
      gl.enable(gl.BLEND)
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

      gl.drawArrays(gl.TRIANGLES, 0, 3)

      gl.disable(gl.BLEND)
      gl.enable(gl.CULL_FACE)
      gl.enable(gl.DEPTH_TEST)
      gl.depthMask(true)
    },

    onRemove(_map: MapLibreMap, gl: WebGLRenderingContext) {
      cancelTextureLoad?.()
      cancelTextureLoad = null
      if (program) gl.deleteProgram(program)
      if (buffer) gl.deleteBuffer(buffer)
      if (texture) gl.deleteTexture(texture)
      program = null
      buffer = null
      texture = null
      mapInstance = null
    }
  }

  return layer
}
