// vitest/config re-exports Vite's defineConfig with the `test` field typed.
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

const crossOriginIsolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/web-chess/',
  test: {
    // Vitest stubs CSS imports to nothing by default, which also empties
    // `?raw`. `reviewPalette.test.ts` reads the real `--quality-*` values out
    // of index.css, and a test that silently reads an empty string is worse
    // than no test at all.
    css: true,
  },
  server: {
    headers: crossOriginIsolationHeaders,
  },
  preview: {
    headers: crossOriginIsolationHeaders,
  },
})
