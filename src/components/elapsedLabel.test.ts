import { describe, expect, it } from 'vitest'
import { describeElapsed } from './elapsedLabel'

const NOW = 1_700_000_000_000
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

describe('describeElapsed', () => {
  it('reads anything under a minute as just now', () => {
    expect(describeElapsed(NOW, NOW)).toBe('moments ago')
    expect(describeElapsed(NOW - 59_000, NOW)).toBe('moments ago')
  })

  it('counts in the largest unit that fits', () => {
    expect(describeElapsed(NOW - MINUTE, NOW)).toBe('1 minute ago')
    expect(describeElapsed(NOW - 5 * MINUTE, NOW)).toBe('5 minutes ago')
    expect(describeElapsed(NOW - HOUR, NOW)).toBe('1 hour ago')
    expect(describeElapsed(NOW - 5 * HOUR, NOW)).toBe('5 hours ago')
    expect(describeElapsed(NOW - DAY, NOW)).toBe('1 day ago')
    expect(describeElapsed(NOW - 9 * DAY, NOW)).toBe('9 days ago')
  })

  it('does not claim a snapshot came from the future', () => {
    expect(describeElapsed(NOW + HOUR, NOW)).toBe('recently')
    expect(describeElapsed(Number.NaN, NOW)).toBe('recently')
  })
})
