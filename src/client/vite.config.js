import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: true,
    proxy: {
      '/api': 'http://localhost:8080',
      '/videos': 'http://localhost:8080',
      '/live': 'http://localhost:8080',
      '/stream': 'http://localhost:8080'
    }
  },
  build: {
    outDir: '../../dist',
    emptyOutDir: true
  }
})
