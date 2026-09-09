/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // base relativa: el build (dist/) funciona servido desde cualquier subruta,
  // incluido un subdirectorio de GitHub Pages. Ver README para el deploy.
  base: './',
  plugins: [react()],
  test: {
    // los modulos de geometry/ son funciones puras: corren en node, sin DOM.
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
})
