import { describe, expect, it } from 'vitest'
import { type EngineCapabilities, recommendedHashMb } from './profiles'

function capabilities(overrides: Partial<EngineCapabilities> = {}): EngineCapabilities {
  return {
    sharedArrayBuffer: true,
    crossOriginIsolated: true,
    hardwareConcurrency: 8,
    deviceMemoryGb: 16,
    isMobile: false,
    ...overrides,
  }
}

describe('recommendedHashMb', () => {
  it('leaves a capable desktop on the size it always had', () => {
    expect(recommendedHashMb(capabilities())).toBe(64)
    expect(recommendedHashMb(capabilities({ hardwareConcurrency: 16, deviceMemoryGb: 32 }))).toBe(64)
  })

  it('asks a phone for the least, however many cores it claims', () => {
    expect(recommendedHashMb(capabilities({ isMobile: true }))).toBe(16)
    expect(recommendedHashMb(capabilities({ isMobile: true, hardwareConcurrency: 16, deviceMemoryGb: 32 }))).toBe(16)
  })

  it('treats little memory as the constraint it is', () => {
    expect(recommendedHashMb(capabilities({ deviceMemoryGb: 2 }))).toBe(16)
    expect(recommendedHashMb(capabilities({ deviceMemoryGb: 0.5 }))).toBe(16)
    expect(recommendedHashMb(capabilities({ deviceMemoryGb: 4 }))).toBe(32)
  })

  it('does not read the reporting ceiling as a constraint', () => {
    // navigator.deviceMemory is clamped to at most 8, so every roomy machine
    // reports exactly 8. Reading that as "low memory" would have quietly
    // halved the hash on every desktop.
    expect(recommendedHashMb(capabilities({ deviceMemoryGb: 8 }))).toBe(64)
  })

  it('steps down for a machine with almost no cores', () => {
    expect(recommendedHashMb(capabilities({ hardwareConcurrency: 2 }))).toBe(32)
  })

  it('assumes the roomy case when the browser will not say', () => {
    expect(recommendedHashMb(capabilities({ deviceMemoryGb: undefined }))).toBe(64)
  })

  it('always stays inside the slider it seeds', () => {
    for (const memory of [undefined, 0.5, 2, 4, 8, 16, 64]) {
      for (const mobile of [false, true]) {
        for (const cores of [1, 2, 4, 32]) {
          const size = recommendedHashMb(capabilities({ deviceMemoryGb: memory, isMobile: mobile, hardwareConcurrency: cores }))
          expect(size).toBeGreaterThanOrEqual(16)
          expect(size).toBeLessThanOrEqual(512)
          expect(size % 16).toBe(0)
        }
      }
    }
  })
})
