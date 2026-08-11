import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

function surfaceBoundaryPlugin(surface) {
  return {
    name: 'surface-boundary',
    generateBundle(_options, bundle) {
      const adminModules = new Set()
      for (const output of Object.values(bundle)) {
        if (output.type !== 'chunk') continue
        for (const id of Object.keys(output.modules || {})) {
          if (id.replaceAll('\\', '/').includes('/src/admin/')) adminModules.add(id)
        }
      }
      if (surface === 'customer' && adminModules.size) {
        this.error(`customer bundle contains admin modules:\n${[...adminModules].join('\n')}`)
      }
      if (surface === 'admin' && !adminModules.size) {
        this.error('admin bundle contains no src/admin modules')
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig(() => {
  const surface = process.env.APP_SURFACE || 'combined'
  return {
    plugins: [react(), surfaceBoundaryPlugin(surface)],
    build: {
      manifest: true,
    },
    define: {
      'import.meta.env.VITE_APP_SURFACE': JSON.stringify(surface),
    },
  }
})
