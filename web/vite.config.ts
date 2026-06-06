import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:4100',
      '/ws': { target: 'ws://127.0.0.1:4100', ws: true },
      '/health': 'http://127.0.0.1:4100',
      '/stats': 'http://127.0.0.1:4100',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
