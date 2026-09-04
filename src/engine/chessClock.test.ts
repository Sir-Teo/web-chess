import { describe, expect, it } from 'vitest'
import {
  CLOCK_TENTHS_THRESHOLD_MS,
  TIME_CONTROL_PRESETS,
  createClock,
  describeClockTime,
  flagPgnResult,
  flagResultLabel,
  flaggedSide,
  formatClockTime,
  isTimeControlPresetId,
  LOW_TIME_CEILING_MS,
  lowTimeThresholdMs,
  moveEndedGame,
  moveMade,
  pauseClock,
  remainingMs,
  settleFlag,
  startSide,
  timeControlPresetById,
  timeControlTag,
  type ClockState,
} from './chessClock'

const BLITZ = { initialMs: 180_000, incrementMs: 2_000 }
const SUDDEN_DEATH = { initialMs: 60_000, incrementMs: 0 }

describe('reading a running clock', () => {
  it('counts down the running side and leaves the other alone', () => {
    const started = startSide(createClock(BLITZ), 'w', 1_000)
    expect(remainingMs(started, 'w', 6_000)).toBe(175_000)
    expect(remainingMs(started, 'b', 6_000)).toBe(180_000)
  })

  it('shows the bank, not a negative number, once a side is out', () => {
    const started = startSide(createClock(SUDDEN_DEATH), 'w', 0)
    expect(remainingMs(started, 'w', 90_000)).toBe(0)
  })

  /**
   * The display is derived, not stored. It is why the ticking component can
   * re-render on a timer while the state object stays put.
   */
  it('does not change the state object as time passes', () => {
    const started = startSide(createClock(BLITZ), 'w', 0)
    remainingMs(started, 'w', 120_000)
    expect(started.whiteMs).toBe(180_000)
    expect(started.running).toBe('w')
  })

  it('is idle before the first move', () => {
    const fresh = createClock(BLITZ)
    expect(fresh.running).toBeNull()
    expect(remainingMs(fresh, 'w', 999_999)).toBe(180_000)
  })
})

describe('making a move', () => {
  it('banks the think, adds the increment, and starts the opponent', () => {
    let clock = startSide(createClock(BLITZ), 'w', 0)
    clock = moveMade(clock, 'w', 5_000)
    // 180 - 5 thought + 2 increment
    expect(clock.whiteMs).toBe(177_000)
    expect(clock.running).toBe('b')
    expect(remainingMs(clock, 'b', 5_000)).toBe(180_000)
  })

  it('alternates over several moves without drifting', () => {
    let clock = startSide(createClock(SUDDEN_DEATH), 'w', 0)
    clock = moveMade(clock, 'w', 3_000)   // white thought 3s
    clock = moveMade(clock, 'b', 7_000)   // black thought 4s
    clock = moveMade(clock, 'w', 9_000)   // white thought 2s
    expect(clock.whiteMs).toBe(55_000)
    expect(clock.blackMs).toBe(56_000)
    expect(clock.running).toBe('b')
  })

  /**
   * The increment is for a move made on the clock. A clock that only starts on
   * the first move would otherwise hand White two free seconds for a move
   * nobody timed.
   */
  it('withholds the increment from a move played before the clock started', () => {
    const clock = moveMade(createClock(BLITZ), 'w', 30_000)
    expect(clock.whiteMs).toBe(180_000)
    expect(clock.running).toBe('b')
  })

  it('withholds the increment from a move played while paused', () => {
    let clock = startSide(createClock(BLITZ), 'w', 0)
    clock = pauseClock(clock, 4_000)
    clock = moveMade(clock, 'w', 9_000)
    expect(clock.whiteMs).toBe(176_000)
    expect(clock.running).toBe('b')
  })

  /**
   * A player who runs out on the move does not get the increment for it. The
   * increment is for a move you completed in time.
   */
  it('withholds the increment from the move that flagged', () => {
    let clock = startSide(createClock(BLITZ), 'w', 0)
    clock = moveMade(clock, 'w', 200_000)
    expect(clock.flagged).toBe('w')
    expect(clock.whiteMs).toBe(0)
    expect(clock.running).toBeNull()
  })

  it('ignores everything once a side has flagged', () => {
    let clock = settleFlag(startSide(createClock(SUDDEN_DEATH), 'w', 0), 90_000)
    const after = moveMade(clock, 'b', 91_000)
    expect(after).toBe(clock)
    clock = startSide(clock, 'b', 92_000)
    expect(clock.running).toBeNull()
  })
})

describe('the move that ends the game', () => {
  it('banks the mover as usual but hands over to nobody', () => {
    let clock = startSide(createClock(BLITZ), 'w', 0)
    clock = moveEndedGame(clock, 'w', 5_000)
    expect(clock.whiteMs).toBe(177_000)
    expect(clock.blackMs).toBe(180_000)
    expect(clock.running).toBeNull()
  })

  /**
   * The bug this exists for: a fool's mate left the loser's clock counting for
   * a full minute and then flagging, and a stalemate would have turned a draw
   * into a loss on time.
   */
  it('leaves nothing to flag, however long the board sits there', () => {
    let clock = startSide(createClock({ initialMs: 10_000, incrementMs: 0 }), 'w', 0)
    clock = moveEndedGame(clock, 'w', 1_000)
    expect(flaggedSide(clock, 10_000_000)).toBeNull()
    expect(settleFlag(clock, 10_000_000)).toBe(clock)
  })

  it('still flags when the ending move was itself the one that ran out', () => {
    let clock = startSide(createClock({ initialMs: 10_000, incrementMs: 0 }), 'w', 0)
    clock = moveEndedGame(clock, 'w', 30_000)
    expect(clock.flagged).toBe('w')
  })
})

describe('pausing', () => {
  it('banks the think and stops counting', () => {
    let clock = startSide(createClock(BLITZ), 'w', 0)
    clock = pauseClock(clock, 4_000)
    expect(clock.whiteMs).toBe(176_000)
    expect(clock.running).toBeNull()
    expect(remainingMs(clock, 'w', 999_000)).toBe(176_000)
  })

  it('resumes where it stopped rather than where it would have been', () => {
    let clock = startSide(createClock(BLITZ), 'w', 0)
    clock = pauseClock(clock, 4_000)
    clock = startSide(clock, 'w', 100_000)
    expect(remainingMs(clock, 'w', 101_000)).toBe(175_000)
  })

  it('is a no-op on a clock that is not running', () => {
    const fresh = createClock(BLITZ)
    expect(pauseClock(fresh, 5_000)).toBe(fresh)
  })
})

describe('flagging', () => {
  it('reports the running side only once it is actually out', () => {
    const clock = startSide(createClock(SUDDEN_DEATH), 'w', 0)
    expect(flaggedSide(clock, 59_999)).toBeNull()
    expect(flaggedSide(clock, 60_000)).toBe('w')
  })

  it('never flags a clock nobody is on', () => {
    expect(flaggedSide(createClock(SUDDEN_DEATH), 10_000_000)).toBeNull()
  })

  /**
   * `settleFlag` runs several times a second from a timer. Returning a fresh
   * object every tick would defeat the point of the derived display.
   */
  it('returns the same state while nothing has run out', () => {
    const clock = startSide(createClock(SUDDEN_DEATH), 'w', 0)
    expect(settleFlag(clock, 30_000)).toBe(clock)
    const flagged = settleFlag(clock, 60_001)
    expect(flagged.flagged).toBe('w')
    expect(settleFlag(flagged, 70_000)).toBe(flagged)
  })

  it('names the winner the way a result line should', () => {
    expect(flagResultLabel('w')).toBe('White flagged · Black wins on time')
    expect(flagResultLabel('b')).toBe('Black flagged · White wins on time')
    expect(flagPgnResult('w')).toBe('0-1')
    expect(flagPgnResult('b')).toBe('1-0')
  })

  // Step mode holds the engine on move until the reader lets it go. The clock
  // has to be held with it: time nobody is allowed to use is not time anybody
  // should be charged for. `pauseClock` then `startSide` is the shape, and the
  // order matters -- restarting before the search is what keeps the increment,
  // which is only paid for a move made on a running clock.
  it('holds and hands back a clock without losing the increment', () => {
    const control = { initialMs: 180_000, incrementMs: 2_000 }
    let clock = startSide(createClock(control), 'b', 0)

    // Held while the engine waits to be stepped: six seconds pass, none spent.
    const held = pauseClock(clock, 6_000)
    expect(held.blackMs).toBe(174_000)
    expect(remainingMs(held, 'b', 60_000)).toBe(174_000)

    // Let go, searches for two seconds, moves: the search is charged, and the
    // increment lands because the clock was running when the move was made.
    clock = startSide(held, 'b', 60_000)
    clock = moveMade(clock, 'b', 62_000)
    expect(clock.blackMs).toBe(174_000 - 2_000 + 2_000)
    expect(clock.running).toBe('w')
  })

  // FIDE 6.9. The flag is a loss unless the opponent could not have mated, and
  // then it is a draw -- which is what every other board rules, so a win here
  // would be this app disagreeing with all of them about a finished game.
  it('draws instead when the side left on the clock could not have mated', () => {
    expect(flagResultLabel('w', false)).toBe('White flagged · Draw: Black cannot checkmate')
    expect(flagResultLabel('b', false)).toBe('Black flagged · Draw: White cannot checkmate')
    expect(flagPgnResult('w', false)).toBe('1/2-1/2')
    expect(flagPgnResult('b', false)).toBe('1/2-1/2')
  })
})

describe('lowTimeThresholdMs', () => {
  it('is a fifth of the starting time, so a bullet clock is not urgent from move one', () => {
    expect(lowTimeThresholdMs({ initialMs: 60_000, incrementMs: 0 })).toBe(12_000)
    expect(lowTimeThresholdMs({ initialMs: 180_000, incrementMs: 2_000 })).toBe(36_000)
  })

  it('caps at a minute, so a long game does not go amber with five minutes left', () => {
    expect(lowTimeThresholdMs({ initialMs: 900_000, incrementMs: 10_000 })).toBe(LOW_TIME_CEILING_MS)
    expect(lowTimeThresholdMs({ initialMs: 3_600_000, incrementMs: 0 })).toBe(LOW_TIME_CEILING_MS)
  })

  it('never goes negative on a nonsense control', () => {
    expect(lowTimeThresholdMs({ initialMs: -1, incrementMs: 0 })).toBe(0)
  })

  it('leaves every preset with a threshold below its own starting time', () => {
    for (const preset of TIME_CONTROL_PRESETS) {
      if (!preset.control) continue
      expect(lowTimeThresholdMs(preset.control)).toBeLessThan(preset.control.initialMs)
    }
  })
})

describe('formatClockTime', () => {
  it('reads as minutes and seconds above ten seconds', () => {
    expect(formatClockTime(300_000)).toBe('5:00')
    expect(formatClockTime(65_000)).toBe('1:05')
    expect(formatClockTime(CLOCK_TENTHS_THRESHOLD_MS)).toBe('0:10')
  })

  it('shows tenths under ten seconds, where they are the only thing that matters', () => {
    expect(formatClockTime(9_999)).toBe('0:09.9')
    expect(formatClockTime(9_400)).toBe('0:09.4')
    expect(formatClockTime(400)).toBe('0:00.4')
  })

  /** Rounding up here tells a blitz player they have a move they do not have. */
  it('floors rather than rounds', () => {
    expect(formatClockTime(9_960)).toBe('0:09.9')
    expect(formatClockTime(59_900)).toBe('0:59')
  })

  it('grows an hours field rather than showing 90 minutes', () => {
    expect(formatClockTime(3_723_000)).toBe('1:02:03')
  })

  it('never shows a negative or a NaN clock', () => {
    expect(formatClockTime(-5_000)).toBe('0:00.0')
    expect(formatClockTime(Number.NaN)).toBe('0:00.0')
  })

  it('spells the time out for a screen reader', () => {
    expect(describeClockTime(305_000)).toBe('5 minutes 5 seconds')
    expect(describeClockTime(61_000)).toBe('1 minute 1 second')
    expect(describeClockTime(9_400)).toBe('9 seconds')
  })
})

describe('presets', () => {
  it('keeps no-clock as the first choice, because this is an analysis board first', () => {
    expect(TIME_CONTROL_PRESETS[0].id).toBe('unlimited')
    expect(TIME_CONTROL_PRESETS[0].control).toBeNull()
  })

  it('spells every label as minutes + increment, matching the control behind it', () => {
    for (const preset of TIME_CONTROL_PRESETS) {
      if (!preset.control) continue
      const [minutes, increment] = preset.label.split('+').map(part => Number(part.trim()))
      expect(preset.control.initialMs).toBe(minutes * 60_000)
      expect(preset.control.incrementMs).toBe(increment * 1_000)
    }
  })

  it('looks a preset up by id, and rejects anything else', () => {
    expect(timeControlPresetById('3+2')?.control).toEqual(BLITZ)
    expect(timeControlPresetById('nope')).toBeUndefined()
    expect(isTimeControlPresetId('5+0')).toBe(true)
    expect(isTimeControlPresetId('5+1')).toBe(false)
    expect(isTimeControlPresetId(42)).toBe(false)
  })
})

describe('a whole blitz game on the clock', () => {
  it('runs from the first move to a flag', () => {
    let clock: ClockState = createClock({ initialMs: 10_000, incrementMs: 1_000 })
    let now = 0
    clock = startSide(clock, 'w', now)
    for (let i = 0; i < 4; i += 1) {
      now += 1_000
      clock = moveMade(clock, 'w', now)
      now += 1_000
      clock = moveMade(clock, 'b', now)
    }
    // Four moves each, a second a move, a second back each time.
    expect(clock.whiteMs).toBe(10_000)
    expect(clock.blackMs).toBe(10_000)
    expect(clock.flagged).toBeNull()

    now += 11_000
    expect(flaggedSide(clock, now)).toBe('w')
    clock = settleFlag(clock, now)
    expect(flagResultLabel(clock.flagged!)).toContain('Black wins on time')
  })
})

describe('the PGN TimeControl tag', () => {
  it('writes the increment form when there is one, and sudden death when there is not', () => {
    expect(timeControlTag({ initialMs: 180_000, incrementMs: 2_000 })).toBe('180+2')
    expect(timeControlTag({ initialMs: 300_000, incrementMs: 0 })).toBe('300')
  })

  it('matches what every preset is called', () => {
    const tags = TIME_CONTROL_PRESETS.filter(p => p.control).map(p => timeControlTag(p.control!))
    expect(tags).toEqual(['60', '180+2', '300', '600', '900+10'])
  })

  it('never writes a negative or fractional field', () => {
    expect(timeControlTag({ initialMs: -1, incrementMs: -1 })).toBe('0')
    expect(timeControlTag({ initialMs: 1_500, incrementMs: 1_400 })).toBe('2+1')
  })
})
