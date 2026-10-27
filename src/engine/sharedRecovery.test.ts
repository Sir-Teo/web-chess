import { describe, expect, it } from 'vitest'
import { clearSharedRecovery, recordSharedRecovery, SHARED_RECOVERY_PAGE_KEY, shouldResumeSharedRecovery } from './sharedRecovery'
import { readStorage, type KeyValueStorage } from './storage'

const HASH = '#fen=4k3%2F8%2F8%2F8%2F8%2F8%2F4P3%2F4K3%20w%20-%20-%200%201'
const storage = (): KeyValueStorage => {
  const entries = new Map<string, string>()
  return {
    getItem: key => entries.get(key) ?? null,
    setItem: (key, value) => { entries.set(key, value) },
    removeItem: key => { entries.delete(key) },
  }
}

describe('shared links and this tab’s recovery', () => {
  it('opens a new shared link directly even when this tab previously saved it', () => {
    const store = storage()
    recordSharedRecovery(1234, HASH, store)
    expect(shouldResumeSharedRecovery(1234, HASH, 'navigate', store)).toBe(false)
  })

  it('recovers edits when refreshing the same shared URL', () => {
    const store = storage()
    recordSharedRecovery(1234, HASH, store)
    expect(shouldResumeSharedRecovery(1234, HASH, 'reload', store)).toBe(true)
  })

  it('does not substitute another tab’s newer save or a different shared URL', () => {
    const store = storage()
    recordSharedRecovery(1234, HASH, store)
    expect(shouldResumeSharedRecovery(2345, HASH, 'reload', store)).toBe(false)
    expect(shouldResumeSharedRecovery(1234, '#game=other', 'reload', store)).toBe(false)
  })

  it('keeps ordinary page recovery outside the shared-link policy', () => {
    expect(shouldResumeSharedRecovery(1234, '', 'reload', storage())).toBe(false)
  })

  it.each([
    ['missing', null], ['damaged JSON', '{broken'], ['empty object', '{}'], ['null', 'null'],
    ['wrong timestamp type', '{"savedAt":"1234","hash":"#game=x"}'],
    ['unrelated hash', '{"savedAt":1234,"hash":"unrelated"}'], ['oversized marker', 'x'.repeat(9000)],
  ])('preserves legacy or damaged-marker recovery on refresh: %s', (_, marker) => {
    const store = storage()
    if (marker !== null) store.setItem(SHARED_RECOVERY_PAGE_KEY, marker)
    expect(shouldResumeSharedRecovery(1234, HASH, 'reload', store)).toBe(true)
  })

  it('keeps recovery when session storage is unavailable or refuses access', () => {
    const denied = { getItem: () => { throw new Error('SecurityError') }, setItem: () => { throw new Error('QuotaExceededError') }, removeItem: () => { throw new Error('SecurityError') } }
    for (const store of [null, denied]) {
      expect(() => recordSharedRecovery(1234, HASH, store)).not.toThrow()
      expect(shouldResumeSharedRecovery(1234, HASH, 'reload', store)).toBe(true)
    }
  })

  it('drops a stale marker when the newer marker cannot be written', () => {
    const store = storage()
    recordSharedRecovery(1234, HASH, store)
    recordSharedRecovery(2345, HASH, { ...store, setItem: () => { throw new Error('QuotaExceededError') } })
    expect(readStorage(SHARED_RECOVERY_PAGE_KEY, store)).toBeNull()
    expect(shouldResumeSharedRecovery(2345, HASH, 'reload', store)).toBe(true)
  })

  it('clears link context when starting fresh, leaving its URL or exceeding the link bound', () => {
    const store = storage()
    for (const next of ['', '#settings', '#game=' + 'x'.repeat(9000)]) {
      recordSharedRecovery(1234, HASH, store)
      recordSharedRecovery(2345, next, store)
      expect(readStorage(SHARED_RECOVERY_PAGE_KEY, store)).toBeNull()
    }
    recordSharedRecovery(1234, HASH, store)
    clearSharedRecovery(store)
    expect(readStorage(SHARED_RECOVERY_PAGE_KEY, store)).toBeNull()
  })
})
