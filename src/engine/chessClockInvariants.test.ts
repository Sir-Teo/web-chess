import { describe, expect, it } from 'vitest'
import {
  type ClockSide,
  type ClockState,
  createClock,
  flaggedSide,
  moveMade,
  pauseClock,
  remainingMs,
  settleFlag,
  startSide,
} from './chessClock'

/**
 * The clock, driven through random sequences and checked against a model
 * written from the rules rather than from the code.
 *
 * It is the most stateful thing in the app -- a bank, a start time, an
 * increment that is only sometimes earned, and a flag that is final -- and it
 * has already produced one real bug, where a mating move handed the clock to a
 * player who no longer existed. A shadow model is the way to check the
 * arithmetic without re-reading the implementation and agreeing with it.
 */

function makeRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const other = (side: ClockSide): ClockSide => (side === 'w' ? 'b' : 'w')

/**
 * What the clock should read, kept from the rules alone:
 *
 * - only the running side's time falls, and never below zero;
 * - committing a side whose time has reached zero flags it;
 * - a flag is final, and nothing moves afterwards;
 * - the increment is earned by a move made while your own clock was running.
 */
type Shadow = {
  remaining: Record<ClockSide, number>
  running: ClockSide | null
  flagged: ClockSide | null
}

function shadowCommit(shadow: Shadow): void {
  if (shadow.running === null) return
  if (shadow.flagged === null && shadow.remaining[shadow.running] <= 0) shadow.flagged = shadow.running
  shadow.running = null
}

describe('a clock driven at random', () => {
  const controls = [
    { initialMs: 60_000, incrementMs: 0 },
    { initialMs: 180_000, incrementMs: 2_000 },
    { initialMs: 5_000, incrementMs: 1_000 },
  ]

  it('reads what the rules say it should, after every operation', () => {
    for (const control of controls) {
      for (let seed = 1; seed <= 60; seed++) {
        const random = makeRandom(seed * 31 + control.initialMs)
        let now = 1_000_000
        let state: ClockState = createClock(control)
        const shadow: Shadow = {
          remaining: { w: control.initialMs, b: control.initialMs },
          running: null,
          flagged: null,
        }
        const history: string[] = []

        for (let step = 0; step < 60; step++) {
          const roll = random()
          const side: ClockSide = random() < 0.5 ? 'w' : 'b'

          if (roll < 0.34) {
            const delta = 1 + Math.floor(random() * 4_000)
            now += delta
            history.push(`+${delta}ms`)
            if (shadow.running !== null && shadow.flagged === null) {
              shadow.remaining[shadow.running] = Math.max(0, shadow.remaining[shadow.running] - delta)
            }
          } else if (roll < 0.55) {
            history.push(`start ${side}`)
            state = startSide(state, side, now)
            if (shadow.flagged === null && shadow.running !== side) {
              shadowCommit(shadow)
              if (shadow.flagged === null) shadow.running = side
            }
          } else if (roll < 0.82) {
            history.push(`move ${side}`)
            const wasOnTheClock = shadow.running === side
            state = moveMade(state, side, now)
            if (shadow.flagged === null) {
              shadowCommit(shadow)
              if (shadow.flagged === null) {
                if (wasOnTheClock) shadow.remaining[side] += control.incrementMs
                shadow.running = other(side)
              }
            }
          } else if (roll < 0.93) {
            history.push('pause')
            state = pauseClock(state, now)
            shadowCommit(shadow)
          } else {
            history.push('settle')
            state = settleFlag(state, now)
            const out = shadow.flagged
              ?? (shadow.running !== null && shadow.remaining[shadow.running] <= 0 ? shadow.running : null)
            if (out !== null) {
              shadow.remaining[out] = 0
              shadow.running = null
              shadow.flagged = out
            }
          }

          const where = `${JSON.stringify(control)} seed ${seed} step ${step} [${history.slice(-4).join(', ')}]`
          expect(remainingMs(state, 'w', now), `${where} white`).toBe(shadow.remaining.w)
          expect(remainingMs(state, 'b', now), `${where} black`).toBe(shadow.remaining.b)
          expect(state.flagged, `${where} flag`).toBe(shadow.flagged)
          expect(state.running, `${where} running`).toBe(shadow.running)
        }
      }
    }
  })
})

describe('rules that must hold whatever the sequence', () => {
  const control = { initialMs: 4_000, incrementMs: 500 }

  it('never reports a negative reading, and never lets a flag be undone', () => {
    for (let seed = 1; seed <= 80; seed++) {
      const random = makeRandom(seed * 7)
      let now = 500_000
      let state = createClock(control)
      let everFlagged: ClockSide | null = null

      for (let step = 0; step < 80; step++) {
        const side: ClockSide = random() < 0.5 ? 'w' : 'b'
        const roll = random()
        if (roll < 0.4) now += 1 + Math.floor(random() * 2_500)
        else if (roll < 0.6) state = startSide(state, side, now)
        else if (roll < 0.85) state = moveMade(state, side, now)
        else if (roll < 0.95) state = pauseClock(state, now)
        else state = settleFlag(state, now)

        expect(remainingMs(state, 'w', now), `seed ${seed} step ${step}`).toBeGreaterThanOrEqual(0)
        expect(remainingMs(state, 'b', now), `seed ${seed} step ${step}`).toBeGreaterThanOrEqual(0)
        // `since` and `running` are two halves of one fact and must never part.
        expect(state.since === null, `seed ${seed} step ${step}: since/running disagree`)
          .toBe(state.running === null)

        if (everFlagged) {
          expect(state.flagged, `seed ${seed} step ${step}: a flag was undone`).toBe(everFlagged)
          expect(state.running, `seed ${seed} step ${step}: a flagged clock restarted`).toBeNull()
        }
        everFlagged = state.flagged ?? everFlagged
      }
    }
  })

  it('runs a clock out often enough for that to mean something', () => {
    let flagged = 0
    for (let seed = 1; seed <= 80; seed++) {
      const random = makeRandom(seed * 7)
      let now = 500_000
      let state = createClock(control)
      for (let step = 0; step < 80; step++) {
        const side: ClockSide = random() < 0.5 ? 'w' : 'b'
        const roll = random()
        if (roll < 0.4) now += 1 + Math.floor(random() * 2_500)
        else if (roll < 0.6) state = startSide(state, side, now)
        else if (roll < 0.85) state = moveMade(state, side, now)
        else if (roll < 0.95) state = pauseClock(state, now)
        else state = settleFlag(state, now)
      }
      if (state.flagged || flaggedSide(state, now)) flagged++
    }
    expect(flagged, 'no sequence ran a clock out, so the flag rules are untested').toBeGreaterThan(20)
  })
})
