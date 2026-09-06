import type { GameNode } from '../hooks/useGameTree'
import type { TimeControl } from './chessClock'
import { moveNumberPrefix } from './moveLabels'

export type MoveTimePoint = {
  /** The ply, counted the way the trend graphs count: 1 is the first move. */
  index: number
  /** "12. Nf3" or "12... Nc6". */
  label: string
  side: 'w' | 'b'
  /** Seconds the mover spent on this move. */
  seconds: number
  /** What the mover's clock read after it, in milliseconds. */
  clockMs: number
}

/**
 * The PGN `TimeControl` tag, read back: "180+2" is three minutes with a
 * two-second increment, "600" ten minutes and nothing. The other forms the
 * standard allows -- "40/7200:3600", "?", "-" -- name no single starting
 * bank, so they read as unknown and the first move of each side goes
 * unmeasured rather than guessed.
 */
export function parseTimeControlTag(tag: string | undefined): TimeControl | null {
  const match = String(tag ?? '').trim().match(/^(\d+)(?:\+(\d+))?$/)
  if (!match) return null
  const initialMs = Number(match[1]) * 1000
  const incrementMs = Number(match[2] ?? 0) * 1000
  if (!Number.isFinite(initialMs) || initialMs <= 0) return null
  return { initialMs, incrementMs }
}

/**
 * How long each move took, from the clock readings the moves carry.
 *
 * A `[%clk]` is what the mover had *after* moving, with the increment already
 * added, so the time spent on a move is the same side's previous reading, less
 * this one, plus the increment. The previous reading is the one two plies back
 * -- or, for a side's first move, the starting bank from the `TimeControl`
 * header, when there is one; without it that move is skipped rather than
 * charged an invented figure. A move with no reading is skipped, and so is
 * the move after it, because its predecessor is missing.
 *
 * Half the blunders in a real game are explained by this series and by
 * nothing in the evaluation -- which is why the review list shows the clock
 * beside each move, and why the shape of the whole game is worth a graph.
 */
export function buildMoveTimeSeries(nodes: GameNode[], control: TimeControl | null): MoveTimePoint[] {
  const points: MoveTimePoint[] = []
  const previousBySide: Partial<Record<'w' | 'b', number>> = {}
  if (control) {
    previousBySide.w = control.initialMs
    previousBySide.b = control.initialMs
  }
  const incrementMs = control?.incrementMs ?? 0

  for (let index = 1; index < nodes.length; index += 1) {
    const node = nodes[index]!
    const before = nodes[index - 1]!
    const side: 'w' | 'b' = before.fen.split(/\s+/)[1] === 'b' ? 'b' : 'w'
    const clockMs = node.clockMs
    if (typeof clockMs !== 'number' || !Number.isFinite(clockMs)) {
      // The next reading on this side has nothing to be measured against.
      delete previousBySide[side]
      continue
    }
    const previous = previousBySide[side]
    previousBySide[side] = clockMs
    if (typeof previous !== 'number') continue

    const spentMs = Math.max(0, previous - clockMs + incrementMs)
    points.push({
      index,
      label: `${moveNumberPrefix(node.fen) ?? ''} ${node.san}`.trim(),
      side,
      seconds: spentMs / 1000,
      clockMs,
    })
  }

  return points
}

/** "14.2s", "1:05", "12:40" -- the reading a bar carries. */
export function formatMoveTime(seconds: number): string {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0
  if (safe < 60) return `${safe < 10 ? safe.toFixed(1) : Math.round(safe)}s`
  const minutes = Math.floor(safe / 60)
  const rest = Math.round(safe % 60)
  return `${minutes}:${String(rest).padStart(2, '0')}`
}
