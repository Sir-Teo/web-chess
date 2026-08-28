import { describe, expect, it } from 'vitest'
import { readStorage, removeStorage, writeStorage } from './storage'

/** Storage that fails the way a browser does, rather than returning null. */
const throwing = {
  getItem: () => { throw new Error('SecurityError') },
  setItem: () => { throw new Error('QuotaExceededError') },
  removeItem: () => { throw new Error('SecurityError') },
}

const working = () => {
  const entries = new Map<string, string>()
  return {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => { entries.set(key, value) },
    removeItem: (key: string) => { entries.delete(key) },
  }
}

describe('the storage boundary', () => {
  it('reads and writes through when storage works', () => {
    const store = working()
    expect(writeStorage('k', 'v', store)).toBe(true)
    expect(readStorage('k', store)).toBe('v')
    expect(removeStorage('k', store)).toBe(true)
    expect(readStorage('k', store)).toBeNull()
  })

  it('returns null rather than throwing when reading fails', () => {
    expect(() => readStorage('k', throwing)).not.toThrow()
    expect(readStorage('k', throwing)).toBeNull()
  })

  it('reports a failed write rather than throwing', () => {
    expect(() => writeStorage('k', 'v', throwing)).not.toThrow()
    expect(writeStorage('k', 'v', throwing)).toBe(false)
  })

  it('reports a failed removal rather than throwing', () => {
    expect(removeStorage('k', throwing)).toBe(false)
  })

  it('treats absent storage as empty, not as an error', () => {
    expect(readStorage('k', null)).toBeNull()
    expect(writeStorage('k', 'v', null)).toBe(false)
    expect(removeStorage('k', null)).toBe(false)
  })

  it('reads a key that was never written as null', () => {
    expect(readStorage('missing', working())).toBeNull()
  })
})
