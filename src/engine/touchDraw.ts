/**
 * Arrows and marks on a screen with no right button.
 *
 * `boardMarks.ts` describes what the reader's own annotations mean and what
 * colour they get; this is how they are made when there is no mouse. The board
 * library binds both gestures to `button === 2` -- a right press starts an
 * arrow, a right press and release on one square makes a mark -- and a touch
 * screen never produces that button, so on a phone the whole feature was
 * unreachable and Settings said so in as many words.
 *
 * A modifier key has no touch equivalent either, so the gesture cannot be
 * overloaded onto the one press a finger has: a long press is how a phone
 * already opens menus, and a two-finger drag is how it already zooms. What is
 * left is a mode, which is also the only shape a reader can *find* -- an
 * undiscoverable gesture is not a feature. Inside the mode a drag is an arrow
 * and a tap is a mark, which is the same pair the right button gives, told
 * apart the same way: by whether the release lands on the square the press
 * started on.
 *
 * Everything here is arithmetic over a rectangle, so it is tested without a
 * browser; App.tsx supplies the rectangle and the pointer events.
 */

export type DrawnArrow = { startSquare: string; endSquare: string; color: string }

/** The rectangle the board is drawn in, in the same space as the pointer. */
export type BoardRect = { left: number; top: number; width: number; height: number }

const FILES = 'abcdefgh'
const BOARD_SIDE = 8

/**
 * Which square a point is over, or null when it is off the board.
 *
 * Off the board cancels rather than clamping to the edge: a reader whose finger
 * has left the board has visibly stopped pointing at a square, and a gesture
 * that cannot be abandoned is worse than one that occasionally has to be
 * repeated.
 */
export function squareAtPoint(
  point: { x: number; y: number },
  rect: BoardRect,
  orientation: 'white' | 'black',
): string | null {
  if (!(rect.width > 0) || !(rect.height > 0)) return null
  const column = Math.floor(((point.x - rect.left) / rect.width) * BOARD_SIDE)
  const row = Math.floor(((point.y - rect.top) / rect.height) * BOARD_SIDE)
  if (column < 0 || column >= BOARD_SIDE || row < 0 || row >= BOARD_SIDE) return null
  const fileIndex = orientation === 'white' ? column : BOARD_SIDE - 1 - column
  const rank = orientation === 'white' ? BOARD_SIDE - row : row + 1
  return `${FILES[fileIndex]}${rank}`
}

export type TouchDrawGesture =
  | { kind: 'mark'; square: string }
  | { kind: 'arrow'; from: string; to: string }

/**
 * What a press that started on `from` and was released on `to` asked for.
 *
 * The same rule the right button follows: released where it started is a mark,
 * released anywhere else on the board is an arrow, released off the board is
 * nothing.
 */
export function resolveTouchDraw(from: string | null, to: string | null): TouchDrawGesture | null {
  if (!from) return null
  if (!to) return null
  return to === from ? { kind: 'mark', square: from } : { kind: 'arrow', from, to }
}

/**
 * Add the arrow, take it away if it is already drawn, or recolour it.
 *
 * The same three outcomes `toggleSquareMark` gives a square, and for the same
 * reason: changing your mind about a colour should not need two gestures and
 * look like the first one failed.
 */
export function toggleDrawnArrow(
  arrows: readonly DrawnArrow[],
  from: string,
  to: string,
  color: string,
): DrawnArrow[] {
  const index = arrows.findIndex(arrow => arrow.startSquare === from && arrow.endSquare === to)
  if (index < 0) return [...arrows, { startSquare: from, endSquare: to, color }]
  const next = arrows.slice()
  if (next[index].color === color) {
    next.splice(index, 1)
    return next
  }
  next[index] = { startSquare: from, endSquare: to, color }
  return next
}
