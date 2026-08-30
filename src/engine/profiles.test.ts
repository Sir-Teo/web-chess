import { describe, expect, it } from 'vitest'
import stockfishPackage from 'stockfish/package.json'
import { deriveWasmPath, engineProfiles, toAbsoluteAssetUrl, workerMainUrlWithWasmHash } from './profiles'

/** The Stockfish the local profiles are built from: sync:stockfish copies its bin/ into public/engine. */
const installedStockfishVersion: string = stockfishPackage.version

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
      expect(profile.workerPath).toContain('https://unpkg.com/stockfish@')
      expect(profile.workerPath).not.toContain('cdn.jsdelivr.net')
    }
  })

  /**
   * The CDN profiles name a Stockfish version in a string literal; the local
   * profiles serve whatever `npm run sync:stockfish` copied out of the
   * installed package. Nothing tied the two together, and the dependency is a
   * caret range -- so one `npm update stockfish` would leave the app offering
   * "Lite (Local)" on one build and "Full (CDN)" on another, with no gate
   * noticing and no way for a reader to attribute a difference between them.
   *
   * This is the gate. If it fails after a dependency bump, the fix is to move
   * the URLs on and re-run `npm run sync:stockfish`, not to widen the check.
   */
  it('pins the CDN profiles to the Stockfish version the local assets are built from', () => {
    const cdnProfiles = engineProfiles.filter(profile => profile.source === 'cdn')

    expect(cdnProfiles.length).toBeGreaterThan(0)
    for (const profile of cdnProfiles) {
      expect(
        profile.workerPath,
        `${profile.id} should serve stockfish@${installedStockfishVersion}, the installed version`,
      ).toContain(`https://unpkg.com/stockfish@${installedStockfishVersion}/`)
    }
  })
})
