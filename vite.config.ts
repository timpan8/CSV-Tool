import { defineConfig } from 'vite'

export default defineConfig({
  // Relativ bas gör bygget sökvägsoberoende: fungerar på GitHub Pages under
  // /CSV-Tool/, på ett eget domännamn, och när dist/ öppnas direkt från disk.
  base: './',
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'preact',
  },
  resolve: {
    alias: {
      react: 'preact/compat',
      'react-dom': 'preact/compat',
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  worker: {
    format: 'es',
  },
})
