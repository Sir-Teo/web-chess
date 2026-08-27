import { describe, expect, it } from 'vitest'
import { deriveWasmPath, engineProfiles, toAbsoluteAssetUrl, workerMainUrlWithWasmHash } from './profiles'

describe('engine profile worker URLs', () => {
  it('derives the matching wasm asset path from a Stockfish worker script', () => {
    expect(deriveWasmPath('/web-chess/engine/stockfish-18-lite-single.js')).toBe(
      '/web-chess/engine/stockfish-18-lite-single.wasm',
    )
    expect(deriveWasmPath('https://cdn.example/stockfish-18.js?v=18')).toBe(
      'https://cdn.example/stockfish-18.wasm?v=18',
    )
  })

  it('builds absolute asset URLs from the deployed app base', () => {
    expect(toAbsoluteAssetUrl('/web-chess/engine/stockfish-18-lite-single.js', 'https://example.test/web-chess/')).toBe(
      'https://example.test/web-chess/engine/stockfish-18-lite-single.js',
    )
  })

  it('passes the absolute wasm path through the Stockfish.js main-worker hash', () => {
    expect(workerMainUrlWithWasmHash('/web-chess/engine/stockfish-18-lite-single.js', 'https://example.test/web-chess/')).toBe(
      'https://example.test/web-chess/engine/stockfish-18-lite-single.js#https%3A%2F%2Fexample.test%2Fweb-chess%2Fengine%2Fstockfish-18-lite-single.wasm',
    )
  })

  it('keeps full CDN profiles on a host that serves the large Stockfish package', () => {
    const fullProfiles = engineProfiles.filter(profile => profile.source === 'cdn')

    expect(fullProfiles).toHaveLength(2)
    for (const profile of fullProfiles) {
      expect(profile.workerPath).toContain('https://unpkg.com/stockfish@18.0.7/')
      expect(profile.workerPath).not.toContain('cdn.jsdelivr.net')
    }
  })
})
