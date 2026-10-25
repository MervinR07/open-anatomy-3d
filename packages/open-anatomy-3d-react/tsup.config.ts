import { copyFileSync } from 'fs'
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  // Hooks and WebGL: client-only under React Server Components (Next.js).
  banner: { js: "'use client'" },
  external: ['react', 'react-dom', 'three', '@react-three/fiber', '@react-three/drei', 'open-anatomy-3d'],
  onSuccess: async () => { copyFileSync('src/styles.css', 'dist/styles.css') },
})
