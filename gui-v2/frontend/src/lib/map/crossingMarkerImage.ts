const CATEGORY_COLORS: Record<string, string> = {
  roads: '#f97316',
  railways: '#22c55e',
  waterways: '#06b6d4',
  hydrology: '#06b6d4',
  powerlines: '#eab308',
  pipelines: '#ef4444',
  default: '#a855f7'
}

function colorForCategory(category: string): string {
  const key = (category || '').toLowerCase()
  return CATEGORY_COLORS[key] || CATEGORY_COLORS.default
}

function strokeIcon(ctx: CanvasRenderingContext2D, draw: () => void, width: number) {
  ctx.save()
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = width
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.globalAlpha = 0.95
  draw()
  ctx.restore()
}

function fillIcon(ctx: CanvasRenderingContext2D, draw: () => void) {
  ctx.save()
  ctx.fillStyle = '#ffffff'
  ctx.globalAlpha = 0.95
  draw()
  ctx.restore()
}

function drawCategoryGlyph(ctx: CanvasRenderingContext2D, category: string) {
  const key = (category || '').toLowerCase()

  if (key === 'roads') {
    strokeIcon(ctx, () => {
      ctx.beginPath()
      ctx.moveTo(24, 12)
      ctx.lineTo(24, 34)
      ctx.moveTo(40, 12)
      ctx.lineTo(40, 34)
      ctx.stroke()

      ctx.setLineDash([6, 6])
      ctx.beginPath()
      ctx.moveTo(32, 12)
      ctx.lineTo(32, 34)
      ctx.stroke()
      ctx.setLineDash([])
    }, 4)
    return
  }

  if (key === 'railways') {
    strokeIcon(ctx, () => {
      ctx.beginPath()
      ctx.moveTo(24, 12)
      ctx.lineTo(24, 34)
      ctx.moveTo(40, 12)
      ctx.lineTo(40, 34)
      ctx.stroke()
    }, 4)

    strokeIcon(ctx, () => {
      ctx.beginPath()
      ctx.moveTo(24, 16)
      ctx.lineTo(40, 16)
      ctx.moveTo(24, 24)
      ctx.lineTo(40, 24)
      ctx.moveTo(24, 32)
      ctx.lineTo(40, 32)
      ctx.stroke()
    }, 3)
    return
  }

  if (key === 'waterways' || key === 'hydrology') {
    strokeIcon(ctx, () => {
      ctx.beginPath()
      ctx.moveTo(18, 24)
      ctx.bezierCurveTo(22, 18, 26, 18, 30, 24)
      ctx.bezierCurveTo(34, 30, 38, 30, 42, 24)
      ctx.bezierCurveTo(46, 18, 50, 18, 54, 24)
      ctx.stroke()
    }, 4)
    return
  }

  if (key === 'powerlines') {
    fillIcon(ctx, () => {
      ctx.beginPath()
      ctx.moveTo(36, 10)
      ctx.lineTo(22, 28)
      ctx.lineTo(31, 28)
      ctx.lineTo(28, 42)
      ctx.lineTo(46, 22)
      ctx.lineTo(37, 22)
      ctx.closePath()
      ctx.fill()
    })
    return
  }

  if (key === 'pipelines') {
    strokeIcon(ctx, () => {
      ctx.beginPath()
      ctx.arc(32, 22, 10, 0, Math.PI * 2)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(22, 22)
      ctx.lineTo(42, 22)
      ctx.stroke()
    }, 4)
    return
  }

  // default: simple tent/triangle marker
  strokeIcon(ctx, () => {
    ctx.beginPath()
    ctx.moveTo(22, 30)
    ctx.lineTo(32, 14)
    ctx.lineTo(42, 30)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(26, 30)
    ctx.lineTo(38, 30)
    ctx.stroke()
  }, 4)
}

export function createCrossingMarkerImageData(category: string, sizePx: number = 128): ImageData {
  if (typeof document === 'undefined') {
    throw new Error('DOM unavailable for marker generation')
  }

  const canvas = document.createElement('canvas')
  canvas.width = sizePx
  canvas.height = sizePx
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) {
    throw new Error('Canvas context unavailable')
  }

  ctx.clearRect(0, 0, sizePx, sizePx)

  // Draw in a stable 64x64 design space, then scale.
  const scale = sizePx / 64
  ctx.save()
  ctx.scale(scale, scale)

  const color = colorForCategory(category)

  // Pin body (Path2D from a stable SVG path string; avoids SVG/image decoding entirely)
  const pinPath = new Path2D(
    'M32 2C20.4 2 11 11.4 11 23c0 17.8 21 39 21 39s21-21.2 21-39C53 11.4 43.6 2 32 2z'
  )

  // Gradient fill
  const grad = ctx.createLinearGradient(0, 0, 0, 64)
  grad.addColorStop(0, color)
  grad.addColorStop(1, color)
  ctx.fillStyle = grad
  ctx.fill(pinPath)

  // Dark outline
  ctx.strokeStyle = '#0b0b0b'
  ctx.lineWidth = 2
  ctx.lineJoin = 'round'
  ctx.stroke(pinPath)

  // Head circle
  ctx.beginPath()
  ctx.arc(32, 22, 16, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.globalAlpha = 0.98
  ctx.fill()
  ctx.globalAlpha = 1
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 2
  ctx.stroke()

  // Category glyph in the head
  drawCategoryGlyph(ctx, category)

  ctx.restore()

  // Convert to ImageData
  return ctx.getImageData(0, 0, sizePx, sizePx)
}



