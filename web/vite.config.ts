import { rmSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const backend = process.env.TACIT_BACKEND ?? 'http://127.0.0.1:8710'
const mock = process.env.VITE_TACIT_MOCK === '1'

/** The real build ships without the mock-mode media in public/mock. */
function stripMockMedia(): Plugin {
  let outDir = 'dist'
  return {
    name: 'tacit-strip-mock-media',
    apply: 'build',
    configResolved(c) {
      outDir = c.build.outDir
    },
    closeBundle() {
      if (!mock) rmSync(fileURLToPath(new URL(`${outDir}/mock`, `file://${process.cwd()}/`)), { recursive: true, force: true })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), stripMockMedia()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5710,
    strictPort: true,
    host: '127.0.0.1',
    proxy: {
      '/api': { target: backend, changeOrigin: true },
      '/media': { target: backend, changeOrigin: true },
      '/sim': { target: backend, changeOrigin: true },
      '/ws': { target: backend, changeOrigin: true, ws: true },
    },
  },
  preview: { port: 5711, strictPort: true, host: '127.0.0.1' },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1800,
    rollupOptions: {
      output: {
        // Assign packages precisely. A static list let Rollup park shared dependencies (scheduler,
        // clsx) in the three or charts chunk, which made every first load preload both.
        manualChunks(id) {
          // Vite's preload helper and the CommonJS interop helpers are used by every lazy route
          if (id.includes('vite/preload-helper') || id.includes('commonjsHelpers')) return 'vendor'
          if (!id.includes('node_modules')) return undefined
          if (/node_modules\/(three|@react-three|three-stdlib|troika-[^/]+|camera-controls|maath|meshline|stats-gl|@monogrid)\//.test(id)) return 'three'
          if (/node_modules\/(recharts|recharts-scale|d3-[^/]+|victory-vendor|internmap)\//.test(id)) return 'charts'
          // small helpers several chunks share (babel runtime, clsx, prop-types, react-is) live in vendor too
          if (/node_modules\/(react|react-dom|react-is|scheduler|react-router|react-router-dom|@remix-run|@tanstack|zustand|framer-motion|motion-dom|motion-utils|@babel\/runtime|clsx|prop-types|use-sync-external-store|tiny-invariant|eventemitter3)\//.test(id)) return 'vendor'
          return undefined
        },
      },
    },
  },
})
