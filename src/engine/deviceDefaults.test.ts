import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * The sized defaults, asked for on a machine that is not this one.
 *
 * `appSettings.test.ts` cannot ask this question. `defaultHashMb` and
 * `defaultMultiPv` memoize on first call and read the real `navigator`, and
 * under Node that reports no `deviceMemory` and is not mobile -- so both
 * return exactly the flat constant and a test comparing them to it passes
 * whether or not the sizing is wired up at all.
 *
 * So: stub a phone, reset the module registry so the memo is cold, and import
 * fresh. Only then does `loadPersistedSettings()` have a different answer to
 * give than `DEFAULT_PERSISTED_SETTINGS`, which is the whole claim.
 */
describe('a first visit on a device that is not a desktop', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  async function freshSettings(nav: Record<string, unknown>) {
    vi.stubGlobal('navigator', nav)
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
      },
    })
    vi.resetModules()
    return import('./appSettings')
  }

  const PHONE = { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)', hardwareConcurrency: 6, deviceMemory: 4 }

  it('sizes both Hash and MultiPV to the phone, with nothing stored', async () => {
    const mod = await freshSettings(PHONE)
    // The constants this is meant to override, so a change to them is visible here.
    expect(mod.DEFAULT_PERSISTED_SETTINGS.hashMb).toBe(64)
    expect(mod.DEFAULT_PERSISTED_SETTINGS.multiPv).toBe(2)

    const settings = mod.loadPersistedSettings()
    expect(settings.hashMb).toBe(16)
    expect(settings.multiPv).toBe(1)
  })

  it('sizes them the same way through defaultPersistedSettings itself', async () => {
    const mod = await freshSettings(PHONE)
    expect(mod.defaultPersistedSettings()).toMatchObject({ hashMb: 16, multiPv: 1 })
  })

  it('leaves a capable desktop on the constants', async () => {
    const mod = await freshSettings({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      hardwareConcurrency: 10,
      deviceMemory: 8,
    })
    expect(mod.defaultPersistedSettings()).toMatchObject({ hashMb: 64, multiPv: 2 })
  })
})
