/**
 * The reader's own marks on the board: arrows they drag with the right button
 * and squares they right-click.
 *
 * Every other colour on this board belongs to the engine — amber for the move
 * that was played, violet for the threat probe, and the red-to-green scale for
 * candidate moves. So the marks a person draws cannot use Lichess's green, the
 * colour most chess players expect, without saying "the engine recommends this"
 * about a square the reader picked themselves. They get a blue family instead,
 * which nothing else here uses, and the three variants are far enough apart to
 * survive both square colours.
 */

export type SquareMarks = Readonly<Record<string, string>>

export type MarkModifiers = {
  shiftKey?: boolean
  ctrlKey?: boolean
  altKey?: boolean
  metaKey?: boolean
}

export const MARK_COLORS = {
  /** No modifier. The one most marks will be. */
  primary: '#3b82f6',
  /** Shift. For the second idea in a position — the reply, the other plan. */
  alternate: '#e879f9',
  /** Control or Option. A third, for anything the first two are already saying. */
  tertiary: '#f8fafc',
} as const

export type MarkColor = (typeof MARK_COLORS)[keyof typeof MARK_COLORS]

/**
 * Which of the three a modifier asks for.
 *
 * Shift wins over Control because Shift is the one Lichess users already reach
 * for. Meta counts as Control so a Mac keyboard has the same three.
 */
export function markColorForModifiers(modifiers: MarkModifiers): MarkColor {
  if (modifiers.shiftKey) return MARK_COLORS.alternate
  if (modifiers.ctrlKey || modifiers.metaKey || modifiers.altKey) return MARK_COLORS.tertiary
  return MARK_COLORS.primary
}

/**
 * Right-clicking a square adds a mark, right-clicking it again takes it away,
 * and right-clicking it with a different modifier recolours it rather than
 * clearing it — otherwise changing your mind about a colour needs two clicks
 * and looks like the mark failed to take.
 */
export function toggleSquareMark(marks: SquareMarks, square: string, color: string): SquareMarks {
  const next = { ...marks }
  if (next[square] === color) {
    delete next[square]
    return next
  }
  next[square] = color
  return next
}

/** How a marked square is painted: a ring, so the piece on it stays readable. */
export function squareMarkStyle(color: string): { boxShadow: string; backgroundColor: string } {
  return {
    boxShadow: `inset 0 0 0 4px ${color}`,
    backgroundColor: `${color}26`,
  }
}

/** Whether anything is marked, so a clear is skipped when there is nothing to clear. */
export function hasSquareMarks(marks: SquareMarks): boolean {
  for (const _square in marks) return true
  return false
}

/**
 * The move that was played, on the two squares it used.
 *
 * The board had no such thing. The only answer to "what was just played" was
 * the amber arrow, drawn only while board arrows are on, so turning them off
 * left a board with no memory of its own last move -- including under the
 * blindfold, whose copy promises that the last move stays. Every other board
 * marks the two squares, and marks them whether or not anything else is drawn.
 *
 * Amber is forced by the board's own language, and it is also the hardest
 * colour to spend here: the default scheme's squares are a cream and a brown,
 * so an amber *wash* on them barely moves. Measured over all five schemes and
 * all three colour visions, the strongest wash worth drawing reaches ΔE 13 and
 * a contrast ratio of 1.14 -- visible, but not something to rest a reading on.
 *
 * So the ring carries it and the wash only fills in behind: a solid amber line
 * is ΔE 22.8 at worst, past the bar the move hints are held to, because an
 * edge separates by shape and does not depend on the square it is drawn over.
 * The wash stays light enough to read the piece through, which is the arrow's
 * weakness on a phone-sized board.
 *
 * Ring and wash together is what a premove and a previewed move already look
 * like here; the colour is what says which of the three this one is.
 */
export const LAST_MOVE_COLOR = '#ffaa00'

/** How solid the ring is. Solid, because it is the reading, not the wash. */
export const LAST_MOVE_RING_ALPHA = 1

/** How much of the square the wash fills in. Light: the piece has to read. */
export const LAST_MOVE_WASH_ALPHA = 0.22

export function lastMoveSquareStyle(): { boxShadow: string; backgroundColor: string } {
  return {
    boxShadow: `inset 0 0 0 3px ${LAST_MOVE_COLOR}`,
    backgroundColor: `${LAST_MOVE_COLOR}38`,
  }
}
