import { afterEach, describe, expect, it, vi } from 'vitest'
import { createStockfishWorker, engineWorkerBootstrapSource } from './stockfishWorker'
import { engineProfiles, profileById, type EngineProfile } from './profiles'

type WorkerStub = { url: string; terminate: () => void }

/**
 * Boot a profile with `Worker`, `Blob` and `URL.createObjectURL` stubbed, and
 * return both the URL the worker was constructed with and the source the blob
 * was built from. Node has none of the three, and the thing worth checking is
 * exactly what they were handed.
 */
function bootWithStubs(profile: EngineProfile): { url: string; source: string } {
  const blobs = new Map<string, string>()
  let nextBlobId = 0
  let constructedUrl = ''

  const objectUrl = vi.fn((blob: { __source: string }) => {
    const url = `blob:stub/${nextBlobId += 1}`
    blobs.set(url, blob.__source)
    return url
  })

  vi.stubGlobal('Blob', class { __source: string; constructor(parts: string[]) { this.__source = parts.join('') } })
  vi.stubGlobal('URL', Object.assign(
    function URLStub(this: unknown, ...args: ConstructorParameters<typeof URL>) {
      return new (globalThis as unknown as { __RealURL: typeof URL }).__RealURL(...args)
    },
    { createObjectURL: objectUrl, revokeObjectURL: vi.fn() },
  ))
  vi.stubGlobal('Worker', class implements WorkerStub {
    url: string
    constructor(url: string) { this.url = url; constructedUrl = url }
    terminate() {}
  })

  const handle = createStockfishWorker(profile) as unknown as { blobUrl?: string }
  const source = blobs.get(handle.blobUrl ?? '') ?? ''
  return { url: constructedUrl, source }
}

Object.assign(globalThis, { __RealURL: URL })

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Stockfish worker bootstrap', () => {
  it('boots every profile through the bootstrap, never as a bare worker', () => {
    for (const profile of engineProfiles) {
      const { url, source } = bootWithStubs(profile)
      expect(url.startsWith('blob:')).toBe(true)
      // stockfish.js reads `window` during startup, and a worker has none.
      expect(source).toContain('self.window = self')
      expect(source).toContain(profile.workerPath)
    }
  })

  /**
   * The defect this pins. `lite-multi-local` was booted with a bare
   * `new Worker(workerPath)`, so its first pthread came up with no `window`
   * and no wasm URL, the build answered "worker sent an error!", and `auto`
   * fell back to a single thread on every machine that could have run eight.
   */
  it('proxies self.Worker for the builds that spawn pthreads', () => {
    for (const profile of engineProfiles.filter(item => item.requiresIsolation)) {
      expect(bootWithStubs(profile).source).toContain('self.Worker = function')
    }
  })

  it('leaves single-threaded builds without the proxy they do not need', () => {
    for (const profile of engineProfiles.filter(item => !item.requiresIsolation)) {
      expect(bootWithStubs(profile).source).not.toContain('self.Worker = function')
    }
  })

  it('hands each pthread the same wasm URL its parent was given', () => {
    const profile = profileById('lite-multi-local')
    const source = engineWorkerBootstrapSource(profile)
    const wasmUrl = new URL('engine/stockfish-18-lite.wasm', globalThis.location?.href ?? 'http://localhost/').toString()
    expect(source).toContain(encodeURIComponent(wasmUrl))
  })
})
