/** @type {import('next').NextConfig} */
const nextConfig = {
  // Next.js 16 enables Turbopack by default. An explicit (even empty) turbopack
  // key silences the "webpack config but no turbopack config" warning.
  // Turbopack stubs Node built-ins (fs, net, tls) for browser bundles automatically.
  turbopack: {
    // Pin the workspace root to this directory so Next.js doesn't climb up
    // and pick up a stale package-lock.json from a parent folder.
    root: __dirname,
  },

  // Kept for explicit --webpack mode.
  webpack: (config) => {
    config.resolve.fallback = { fs: false, net: false, tls: false }
    return config
  },
}

module.exports = nextConfig
