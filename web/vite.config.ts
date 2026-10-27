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
        manualChunks: {
          three: ['three', '@react-three/fiber', '@react-three/drei'],
          charts: ['recharts'],
          vendor: ['react', 'react-dom', 'react-router-dom', '@tanstack/react-query', 'zustand', 'framer-motion'],
        },
      },
    },
  },
})
