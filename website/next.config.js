/** @type {import('next').NextConfig} */
const nextConfig = {
  productionBrowserSourceMaps: false,
  images: {
    unoptimized: true
  },
  // Local dev convenience:
  // When running the website on :3000 and ZEUS on :3001, proxy /zeus/* requests
  // through the website server so developers can use a single origin (like prod).
  async rewrites() {
    if (process.env.NODE_ENV !== 'development') return []
    const zeusOrigin = process.env.ZEUS_DEV_ORIGIN || 'http://localhost:3001'
    return [
      { source: '/zeus', destination: `${zeusOrigin}/zeus` },
      { source: '/zeus/:path*', destination: `${zeusOrigin}/zeus/:path*` },
    ]
  },
}

module.exports = nextConfig
