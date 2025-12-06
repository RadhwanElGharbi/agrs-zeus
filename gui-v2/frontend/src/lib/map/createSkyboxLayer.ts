import type { CustomLayerInterface, Map as MapLibreMap } from 'maplibre-gl'

const vertexSource = `
attribute vec3 a_pos;
uniform mat4 u_matrix;
varying vec3 v_dir;
void main() {
  v_dir = a_pos;
  gl_Position = u_matrix * vec4(a_pos, 1.0);
}
`

const fragmentSource = `
precision mediump float;
varying vec3 v_dir;
uniform samplerCube u_cube;
void main() {
  vec3 dir = normalize(v_dir);
  vec4 color = textureCube(u_cube, dir);
  gl_FragColor = color;
}
`

function compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) {
    throw new Error('Unable to create shader')
  }
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
  if (!program) {
    throw new Error('Unable to create program')
  }
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSource)
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSource)
  gl.attachShader(program, vs)
  gl.attachShader(program, fs)
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program)
    gl.deleteProgram(program)
    throw new Error(`Program link failed: ${info}`)
  }
  return program
}

function seededRandom(seed: number) {
  let value = seed
  return () => {
    value = (value * 1664525 + 1013904223) % 4294967296
    return value / 4294967296
  }
}

function generateFaceData(size: number, faceIndex: number): Uint8Array {
  const data = new Uint8Array(size * size * 4)
  const rand = seededRandom(1000 + faceIndex * 97)

  const topColor = [3, 6, 18]
  const midColor = [8, 14, 38]
  const bottomColor = [1, 2, 8]

  for (let y = 0; y < size; y++) {
    const v = y / (size - 1)
    for (let x = 0; x < size; x++) {
      const u = x / (size - 1)
      const mixMid = Math.pow(Math.abs(u - 0.5) * 2.0, 1.5)
      const mixVal = v * (1.0 - 0.3 * mixMid)
      const color = [0, 0, 0]
      for (let i = 0; i < 3; i++) {
        const cTop = topColor[i]
        const cMid = midColor[i]
        const cBottom = bottomColor[i]
        const interp = cBottom * (1.0 - mixVal) + cTop * mixVal
        color[i] = interp * (0.8 + 0.2 * rand())
        color[i] = color[i] * (1.0 - 0.4 * Math.abs(u - 0.5))
        color[i] = color[i] * (0.9 + 0.1 * Math.sin((u + v + faceIndex) * 6.2831))
        color[i] += cMid * 0.15
      }

      // Stars
      let alpha = 1.0
      if (rand() > 0.996) {
        const intensity = 0.6 + 0.4 * rand()
        for (let i = 0; i < 3; i++) {
          color[i] = Math.min(255, color[i] + 220 * intensity)
        }
      }
      if (v > 0.85) {
        alpha = 0.8
      }

      const idx = (y * size + x) * 4
      data[idx] = Math.min(255, Math.round(color[0]))
      data[idx + 1] = Math.min(255, Math.round(color[1]))
      data[idx + 2] = Math.min(255, Math.round(color[2]))
      data[idx + 3] = Math.round(255 * alpha)
    }
  }
  return data
}

function createCubeTexture(gl: WebGLRenderingContext): WebGLTexture {
  const texture = gl.createTexture()
  if (!texture) throw new Error('Failed to create texture')
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, texture)
  const size = 128

  for (let face = 0; face < 6; face++) {
    const data = generateFaceData(size, face)
    gl.texImage2D(
      gl.TEXTURE_CUBE_MAP_POSITIVE_X + face,
      0,
      gl.RGBA,
      size,
      size,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      data
    )
  }

  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.generateMipmap(gl.TEXTURE_CUBE_MAP)
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, null)
  return texture
}

export function createSkyboxLayer(): CustomLayerInterface {
  let program: WebGLProgram | null = null
  let buffer: WebGLBuffer | null = null
  let texture: WebGLTexture | null = null
  let uMatrixLocation: WebGLUniformLocation | null = null
  let aPosLocation = -1

  const cubeVertices = new Float32Array([
    -1, -1, -1,  1, -1, -1,  1,  1, -1,
    -1, -1, -1,  1,  1, -1, -1,  1, -1,

    -1, -1,  1,  1, -1,  1,  1,  1,  1,
    -1, -1,  1,  1,  1,  1, -1,  1,  1,

    -1,  1,  1,  1,  1,  1,  1,  1, -1,
    -1,  1,  1,  1,  1, -1, -1,  1, -1,

    -1, -1,  1,  1, -1,  1,  1, -1, -1,
    -1, -1,  1,  1, -1, -1, -1, -1, -1,

    1, -1,  1,  1,  1,  1,  1,  1, -1,
    1, -1,  1,  1,  1, -1,  1, -1, -1,

    -1, -1,  1, -1,  1,  1, -1,  1, -1,
    -1, -1,  1, -1,  1, -1, -1, -1, -1
  ])

  return {
    id: 'hdri-skybox',
    type: 'custom',
    renderingMode: '3d',
    onAdd(map: MapLibreMap, gl: WebGLRenderingContext) {
      program = createProgram(gl, vertexSource, fragmentSource)
      aPosLocation = gl.getAttribLocation(program, 'a_pos')
      uMatrixLocation = gl.getUniformLocation(program, 'u_matrix')

      buffer = gl.createBuffer()
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
      gl.bufferData(gl.ARRAY_BUFFER, cubeVertices, gl.STATIC_DRAW)
      gl.bindBuffer(gl.ARRAY_BUFFER, null)

      texture = createCubeTexture(gl)
    },
    render(gl: WebGLRenderingContext, matrix: any) {
      if (!program || !buffer || !texture || !uMatrixLocation) return

      // Create a view matrix with only rotation (no translation)
      const skyMatrix = matrix.slice(0)
      skyMatrix[12] = 0
      skyMatrix[13] = 0
      skyMatrix[14] = 0

      gl.useProgram(program)
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
      gl.enableVertexAttribArray(aPosLocation)
      gl.vertexAttribPointer(aPosLocation, 3, gl.FLOAT, false, 0, 0)

      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_CUBE_MAP, texture)
      gl.uniformMatrix4fv(uMatrixLocation, false, skyMatrix)

      // Disable depth test and write so the skybox renders behind everything
      gl.disable(gl.DEPTH_TEST)
      gl.depthMask(false)
      gl.disable(gl.CULL_FACE)
      
      gl.drawArrays(gl.TRIANGLES, 0, cubeVertices.length / 3)
      
      // Re-enable depth test and write for subsequent rendering
      gl.enable(gl.CULL_FACE)
      gl.enable(gl.DEPTH_TEST)
      gl.depthMask(true)
    }
  }
}

