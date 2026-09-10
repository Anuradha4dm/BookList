import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const adminRoot = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  base: '/admin/',
  plugins: [
    {
      name: 'admin-html-entry',
      resolveId(id) {
        if (id === '/admin/src/main.tsx') {
          return path.join(adminRoot, 'src', 'main.tsx')
        }
      },
    },
    react(),
  ],
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
