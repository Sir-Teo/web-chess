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
  build: {
    rollupOptions: {
      output: {
        // The libraries in their own chunks, so a deploy that changes only
        // this app's code leaves them where the browser already has them.
        // Everything was one 560 kB chunk with a hash that changed on every
        // deploy; the service worker is network-first, so every deploy was a
        // full re-download of React and the board for every returning
        // reader. These change only when a dependency is upgraded.
        //
        // By path rather than by the object form: that form names package
        // entry points, and the app reaches React through react/jsx-runtime
        // and react-dom/client, which are not those -- it produced an empty
        // "react" chunk and left everything where it was.
        manualChunks(id: string) {
          if (/\/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react'
          if (/\/node_modules\/(chess\.js|react-chessboard|@dnd-kit)\//.test(id)) return 'chess'
          return undefined
        },
      },
    },
  },
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
