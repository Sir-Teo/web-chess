import { describe, expect, it } from 'vitest'
import { withBoundedMapEntry, withBoundedRecordEntry, withoutRecordEntry } from './cacheLimit'

describe('cache limit helpers', () => {
  it('evicts the oldest map entry when the limit is exceeded', () => {
    const previous = new Map([
      ['a', 1],
      ['b', 2],
    ])

    const next = withBoundedMapEntry(previous, 'c', 3, 2)

    expect([...next.entries()]).toEqual([
      ['b', 2],
      ['c', 3],
    ])
    expect([...previous.entries()]).toEqual([
      ['a', 1],
      ['b', 2],
    ])
  })

  it('refreshes map recency when replacing an existing key', () => {
    const previous = new Map([
      ['a', 1],
      ['b', 2],
    ])

    const next = withBoundedMapEntry(previous, 'a', 3, 2)

    expect([...next.entries()]).toEqual([
      ['b', 2],
      ['a', 3],
    ])
  })

  it('evicts the oldest record entry when the limit is exceeded', () => {
    const next = withBoundedRecordEntry({ a: 1, b: 2 }, 'c', 3, 2)

    expect(next).toEqual({ b: 2, c: 3 })
  })

  it('removes record entries without changing records that miss the key', () => {
    const previous = { a: 1, b: 2 }

    expect(withoutRecordEntry(previous, 'a')).toEqual({ b: 2 })
    expect(withoutRecordEntry(previous, 'z')).toBe(previous)
  })
})
