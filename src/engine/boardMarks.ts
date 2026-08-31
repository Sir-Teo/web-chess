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
