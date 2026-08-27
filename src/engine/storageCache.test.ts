import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createStorageCache } from './storageCache'

// The suite runs in node, where the module's `typeof window === 'undefined'`
// guard would short-circuit every path worth testing. A map is enough: the
// cache only ever calls getItem and setItem.
const store = new Map<string, string>()
const stubWindow = {
  localStorage: {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value) },
    clear: () => { store.clear() },
  },
}
const originalWindow = (globalThis as { window?: unknown }).window
;(globalThis as { window?: unknown }).window = stubWindow
afterAll(() => { (globalThis as { window?: unknown }).window = originalWindow })

type Payload = { value: string }

const STORAGE_KEY = 'webchess:test-cache'

function makeCache(entryLimit = 3) {
  return createStorageCache<Payload>({
    storageKey: STORAGE_KEY,
    entryLimit,
    parsePayload: raw => {
      if (!raw || typeof raw !== 'object') return null
      const value = (raw as Record<string, unknown>).value
      return typeof value === 'string' ? { value } : null
    },
  })
}

const hour = 60 * 60 * 1000

describe('shared storage cache', () => {
  beforeEach(() => {
    store.clear()
  })

  it('round-trips an entry', () => {
    const cache = makeCache()
    cache.write('a', { expiresAt: Date.now() + hour, payload: { value: 'kept' } })

    expect(cache.read('a')?.payload).toEqual({ value: 'kept' })
    expect(cache.read('missing')).toBeNull()
  })

  it('keeps a recorded miss distinct from an absent key', () => {
    const cache = makeCache()
    cache.write('a', { expiresAt: Date.now() + hour, payload: null })

    expect(cache.read('a')).toEqual({ expiresAt: expect.any(Number), payload: null })
    expect(cache.read('b')).toBeNull()
  })

  it('drops entries whose payload no longer parses', () => {
    stubWindow.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      good: { expiresAt: Date.now() + hour, payload: { value: 'ok' } },
      wrongShape: { expiresAt: Date.now() + hour, payload: { value: 42 } },
      noExpiry: { payload: { value: 'ok' } },
    }))
    const cache = makeCache()

    expect(cache.read('good')?.payload).toEqual({ value: 'ok' })
    expect(cache.read('wrongShape')).toBeNull()
    expect(cache.read('noExpiry')).toBeNull()
  })

  it('survives a cache that is not an object', () => {
    for (const junk of ['{not json', '"a string"', '[1,2,3]', 'null']) {
      stubWindow.localStorage.setItem(STORAGE_KEY, junk)
      expect(makeCache().read('a')).toBeNull()
    }
  })

  it('prunes expired entries on write', () => {
    const cache = makeCache()
    stubWindow.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      stale: { expiresAt: Date.now() - hour, payload: { value: 'old' } },
    }))

    cache.write('fresh', { expiresAt: Date.now() + hour, payload: { value: 'new' } })

    expect(cache.read('fresh')?.payload).toEqual({ value: 'new' })
    expect(cache.read('stale')).toBeNull()
  })

  it('keeps only the freshest entries once the limit is reached', () => {
    const cache = makeCache(2)
    const now = Date.now()
    cache.write('oldest', { expiresAt: now + hour, payload: { value: 'a' } })
    cache.write('middle', { expiresAt: now + 2 * hour, payload: { value: 'b' } })
    cache.write('newest', { expiresAt: now + 3 * hour, payload: { value: 'c' } })

    expect(cache.read('newest')?.payload).toEqual({ value: 'c' })
    expect(cache.read('middle')?.payload).toEqual({ value: 'b' })
    expect(cache.read('oldest')).toBeNull()
  })

  it('sees a write made through another instance of the same key', () => {
    const writer = makeCache()
    const reader = makeCache()
    expect(reader.read('a')).toBeNull()

    writer.write('a', { expiresAt: Date.now() + hour, payload: { value: 'shared' } })

    expect(reader.read('a')?.payload).toEqual({ value: 'shared' })
  })
})
