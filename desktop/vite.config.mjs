import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' so the built page loads from file:// inside Electron.
// tsconfigRaw as a string stops esbuild reading plugins/evoke/tsconfig.json, which extends a file that is not in the repo.
export default defineConfig({ base: './', plugins: [react()], esbuild: { tsconfigRaw: '{}' }, build: { outDir: 'dist', emptyOutDir: true } })
