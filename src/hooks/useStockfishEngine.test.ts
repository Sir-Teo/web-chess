import { describe, expect, it } from 'vitest'
import { profileById, recommendedThreadCount } from '../engine/profiles'
import { parseInfoLine, parseOptionLine, profileRuntimeMessage, shouldReplaceLiveLine, shouldStopTimedOutSearchCommand } from './useStockfishEngine'

describe('Stockfish engine output parsing', () => {
  it('parses finite score, telemetry, WDL, and PV values from info lines', () => {
    expect(parseInfoLine('info depth 16 seldepth 24 multipv 2 score cp -34 nodes 12000 nps 300000 hashfull 127 tbhits 3 time 40 wdl 42 900 58 pv e2e4 e7e5')).toEqual({
      cp: -34,
      depth: 16,
      seldepth: 24,
      multipv: 2,
      nodes: 12000,
      nps: 300000,
      hashfull: 127,
      tbhits: 3,
      pv: ['e2e4', 'e7e5'],
      time: 40,
      wdl: { w: 42, d: 900, l: 58 },
    })
  })

  it('drops malformed numeric fields instead of leaking NaN into evaluations', () => {
    expect(parseInfoLine('info depth nope seldepth -4 multipv 0 score cp NaN nodes Infinity nps bad hashfull nope tbhits -1 time -1 wdl 1 bad 2 pv d2d4 d7d5')).toEqual({
      cp: undefined,
      depth: 0,
      multipv: 1,
      nodes: undefined,
      nps: undefined,
      hashfull: undefined,
      seldepth: undefined,
      tbhits: undefined,
      pv: ['d2d4', 'd7d5'],
      time: undefined,
      wdl: undefined,
    })
  })

  it('ignores lines without principal variations', () => {
    expect(parseInfoLine('info depth 20 score cp 12 nodes 5000')).toBeNull()
  })
})

describe('Stockfish option parsing', () => {
  it('parses combo option variants for pro engine controls', () => {
    expect(parseOptionLine('option name Analysis Contempt type combo default Both var Off var White var Black var Both')).toEqual({
      name: 'Analysis Contempt',
      type: 'combo',
      defaultValue: 'Both',
      currentValue: 'Both',
      vars: ['Off', 'White', 'Black', 'Both'],
    })
  })

  it('stops default string values before var/min/max fields', () => {
    expect(parseOptionLine('option name EvalFile type string default nn-abcdef.nnue var ignored')).toMatchObject({
      name: 'EvalFile',
      type: 'string',
      defaultValue: 'nn-abcdef.nnue',
    })

    expect(parseOptionLine('option name Threads type spin default 1 min 1 max 1024')).toMatchObject({
      name: 'Threads',
      type: 'spin',
      defaultValue: '1',
      min: 1,
      max: 1024,
    })
  })
})

describe('Stockfish thread recommendations', () => {
  const desktopCapabilities = {
    sharedArrayBuffer: true,
    crossOriginIsolated: true,
    hardwareConcurrency: 16,
    // The low end of what a roomy desktop reports. Browsers disagree about the
    // top of this range — the spec describes clamping to 8, Chromium 148 was
    // seen reporting 32 — so the fixture uses the value that used to be sorted
    // as "constrained", which is the case worth pinning.
    deviceMemoryGb: 8,
    isMobile: false,
  }

  it('uses more threads on isolated desktop hardware without saturating every core', () => {
    expect(recommendedThreadCount(profileById('lite-multi-local'), desktopCapabilities)).toBe(8)
  })

  it('keeps constrained and non-isolated environments on safer thread counts', () => {
    const threadedProfile = profileById('lite-multi-local')

    expect(recommendedThreadCount(threadedProfile, { ...desktopCapabilities, hardwareConcurrency: 8, deviceMemoryGb: 4 })).toBe(4)
    expect(recommendedThreadCount(threadedProfile, { ...desktopCapabilities, deviceMemoryGb: 2 })).toBe(4)
    // Nothing reported at all reads as roomy rather than constrained.
    expect(recommendedThreadCount(threadedProfile, { ...desktopCapabilities, deviceMemoryGb: undefined })).toBe(8)
    // 8 and 32 must agree: they are the same machine seen by different browsers.
    expect(recommendedThreadCount(threadedProfile, { ...desktopCapabilities, deviceMemoryGb: 32 })).toBe(8)
    expect(recommendedThreadCount(threadedProfile, { ...desktopCapabilities, isMobile: true })).toBe(1)
    expect(recommendedThreadCount(threadedProfile, { ...desktopCapabilities, hardwareConcurrency: 2 })).toBe(1)
    expect(recommendedThreadCount(threadedProfile, { ...desktopCapabilities, crossOriginIsolated: false })).toBe(1)
    expect(recommendedThreadCount(profileById('lite-single-local'), desktopCapabilities)).toBe(1)
  })
})

describe('Stockfish command queue safety', () => {
  it('sends stop only for timed-out UCI search commands', () => {
    expect(shouldStopTimedOutSearchCommand('go infinite')).toBe(true)
    expect(shouldStopTimedOutSearchCommand('go depth 30')).toBe(true)

    expect(shouldStopTimedOutSearchCommand('bench')).toBe(false)
    expect(shouldStopTimedOutSearchCommand('perft 5')).toBe(false)
    expect(shouldStopTimedOutSearchCommand('isready')).toBe(false)
  })
})

describe('holding a line against a later bound', () => {
    const line = (depth: number, cp: number, scoreBound?: 'upperbound' | 'lowerbound') =>
        ({ multipv: 1, depth, cp, scoreBound, pv: ['e2e4'] })

    it('takes any line when nothing is held', () => {
        expect(shouldReplaceLiveLine(undefined, line(20, 30))).toBe(true)
    })

    it('takes an exact line over anything held', () => {
        expect(shouldReplaceLiveLine(line(22, 30), line(22, 45))).toBe(true)
        expect(shouldReplaceLiveLine(line(22, 30, 'lowerbound'), line(22, 45))).toBe(true)
    })

    it('refuses a bound that would displace an exact score at the same depth', () => {
        // The case seen on screen: a fail-high re-search arriving after the
        // exact line put "at least +9" on the eval bar for a +3 position.
        expect(shouldReplaceLiveLine(line(22, 300), line(22, 900, 'lowerbound'))).toBe(false)
        expect(shouldReplaceLiveLine(line(22, 300), line(18, 900, 'lowerbound'))).toBe(false)
    })

    it('still takes a deeper bound, which is the most the engine has said', () => {
        expect(shouldReplaceLiveLine(line(22, 300), line(24, 900, 'lowerbound'))).toBe(true)
    })

    it('replaces one bound with another', () => {
        expect(shouldReplaceLiveLine(line(22, 300, 'upperbound'), line(22, 250, 'upperbound'))).toBe(true)
    })
})

describe('Engine profile message', () => {
  const capable = {
    sharedArrayBuffer: true,
    crossOriginIsolated: true,
    hardwareConcurrency: 8,
    deviceMemoryGb: 8,
    isMobile: false,
  }

  it('describes the running engine when nothing was substituted', () => {
    const single = profileById('lite-single-local')
    expect(profileRuntimeMessage('auto', single, capable)).toBe(single.description)
    expect(profileRuntimeMessage('lite-single-local', single, capable)).toBe(single.description)
  })

  it('names the substitution when a chosen profile cannot run here', () => {
    expect(profileRuntimeMessage('lite-multi-local', profileById('lite-single-local'), {
      ...capable,
      sharedArrayBuffer: false,
      crossOriginIsolated: false,
    })).toContain('needs cross-origin isolation')
  })

  /**
   * A boot failure is the only thing that knows why the engine was replaced,
   * and the replacement's own boot writes this message. Without the reason
   * being carried in, `auto` answered with the fallback's description and the
   * reader was never told the stronger build had failed to start.
   */
  it('keeps a boot failure\'s reason over the replacement\'s description', () => {
    const reason = 'Lite Multi (Local) could not be started: worker sent an error. Falling back to Lite Single (Local).'
    expect(profileRuntimeMessage('auto', profileById('lite-single-local'), capable, reason)).toBe(reason)
    expect(profileRuntimeMessage('lite-multi-local', profileById('lite-single-local'), capable, reason)).toBe(reason)
  })
})
