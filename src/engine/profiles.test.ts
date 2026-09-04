import { describe, expect, it } from 'vitest'
import stockfishPackage from 'stockfish/package.json'
import { deriveWasmPath, engineProfiles, pickAutoProfile, resolveProfile, toAbsoluteAssetUrl, workerMainUrlWithWasmHash, type EngineCapabilities } from './profiles'

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

/**
 * Which Stockfish build a reader actually gets.
 *
 * `pickAutoProfile` is the path almost everyone takes -- `auto` is the default
 * -- and `resolveProfile` is the safety net under it. Both were the only
 * uncovered logic left in this file, which is a poor place for a gap: getting
 * the first wrong silently hands a capable desktop the single-threaded engine,
 * which is the difference the review pool measured at five times the wall
 * clock, and getting the second wrong boots a threaded engine on a host that
 * cannot run one.
 */
describe('choosing an engine for the machine', () => {
  const capable: EngineCapabilities = {
    sharedArrayBuffer: true,
    crossOriginIsolated: true,
    hardwareConcurrency: 8,
    deviceMemoryGb: 8,
    isMobile: false,
  }
  const chosen = (overrides: Partial<EngineCapabilities> = {}) =>
    pickAutoProfile({ ...capable, ...overrides }).id

  it('gives a capable isolated desktop the threaded build', () => {
    expect(chosen()).toBe('lite-multi-local')
  })

  it.each([
    ['no SharedArrayBuffer', { sharedArrayBuffer: false }],
    ['not cross-origin isolated', { crossOriginIsolated: false }],
    ['a phone', { isMobile: true }],
  ])('refuses the threaded build with %s', (_label, overrides) => {
    expect(chosen(overrides)).toBe('lite-single-local')
  })

  // The same 4GB and 2-core lines `recommendedThreadCount` draws, and they have
  // to stay the same lines: a machine given the threaded build and then one
  // thread would pay the boot cost for nothing.
  it('draws its memory line where the thread count draws its own', () => {
    expect(chosen({ deviceMemoryGb: 4 })).toBe('lite-single-local')
    expect(chosen({ deviceMemoryGb: 5 })).toBe('lite-multi-local')
  })

  it('draws its core line where the thread count draws its own', () => {
    expect(chosen({ hardwareConcurrency: 2 })).toBe('lite-single-local')
    expect(chosen({ hardwareConcurrency: 3 })).toBe('lite-multi-local')
  })

  // An unreported figure is not a small one. `navigator.deviceMemory` is absent
  // in Safari and Firefox, and treating that as constrained would put every
  // reader on those browsers on the slow engine.
  it('treats unknown memory as roomy rather than as constrained', () => {
    expect(chosen({ deviceMemoryGb: undefined })).toBe('lite-multi-local')
  })

  it('never hands out a build the machine cannot run, however it was asked for', () => {
    const notIsolated = { ...capable, crossOriginIsolated: false }
    expect(resolveProfile('lite-multi-local', notIsolated).id).toBe('lite-single-local')
    expect(resolveProfile('auto', notIsolated).id).toBe('lite-single-local')
    // Half of the requirement is not the requirement.
    expect(resolveProfile('lite-multi-local', { ...capable, sharedArrayBuffer: false }).id)
      .toBe('lite-single-local')
  })

  it('passes an explicit choice through when the machine can run it', () => {
    expect(resolveProfile('lite-multi-local', capable).id).toBe('lite-multi-local')
    expect(resolveProfile('lite-single-local', capable).id).toBe('lite-single-local')
    expect(resolveProfile('auto', capable).id).toBe('lite-multi-local')
  })
})
