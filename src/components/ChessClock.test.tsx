import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ChessClock } from './ChessClock'
import { createClock, pauseClock, startSide, type ClockState } from '../engine/chessClock'

const CONTROL = { initialMs: 180_000, incrementMs: 2_000 }

function render(state: ClockState, paused: boolean) {
  return renderToStaticMarkup(<ChessClock state={state} paused={paused} orientation="white" />)
}

const showsPaused = (markup: string) => markup.includes('clock-paused')

describe('ChessClock', () => {
  const running = startSide(createClock(CONTROL), 'w', 0)

  it('says Paused when the reader stopped a running clock', () => {
    expect(showsPaused(render(pauseClock(running, 5_000), true))).toBe(true)
  })

  // Step mode sets `paused` after every engine move while the clock keeps
  // running. The badge used to key off `paused` alone and appeared over a clock
  // that was counting down.
  it('does not say Paused while a clock is still counting', () => {
    expect(showsPaused(render(running, true))).toBe(false)
    expect(showsPaused(render(running, false))).toBe(false)
  })

  it('does not say Paused for a game that ended rather than stopped', () => {
    const flagged = { ...pauseClock(running, 5_000), flagged: 'w' as const }
    expect(showsPaused(render(flagged, true))).toBe(false)
    // A checkmate stops the clock without pausing the session.
    expect(showsPaused(render(pauseClock(running, 5_000), false))).toBe(false)
  })

  it('draws both faces and marks the side to move as running', () => {
    const markup = render(running, false)
    expect(markup).toContain('White 3 minutes 0 seconds, running')
    expect(markup).toContain('Black 3 minutes 0 seconds')
  })
})
