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

function markerIconSvg(category: string): string {
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

export function buildCrossingMarkerSvg(category: string): string {
  const color = colorForCategory(category)
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

export function crossingMarkerDataUrl(category: string): string {
  const svg = buildCrossingMarkerSvg(category)
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}
















