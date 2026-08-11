import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(() => {
  const surface = process.env.APP_SURFACE || 'combined'
  return {
    plugins: [react()],
    build: {
      manifest: true,
    },
    define: {
      'import.meta.env.VITE_APP_SURFACE': JSON.stringify(surface),
    },
  }
})
