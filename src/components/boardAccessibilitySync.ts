import type { Chess, Square } from 'chess.js'
import { BOARD_SQUARES, describeBoardSquare } from '../engine/boardAccessibility'

/**
 * How many frames to keep looking for a board that has not mounted yet.
 * Generous: one or two is the normal case, and a frame that finds nothing
 * costs 64 failed `getElementById` calls.
 */
export const BOARD_A11Y_SYNC_MAX_RETRIES = 60

/**
 * Write each square's description onto the board `react-chessboard` rendered.
 *
 * The board is a third party's DOM, so the labels are applied to it rather than
 * rendered with it. Returns whether it found a board at all, and that return is
 * the point of this being a function rather than a loop inside the effect.
 *
 * `<Chessboard>` is held back until its width has been measured, so on the
 * first paint there is no board to label. The sync ran immediately, on the next
 * frame and again after 360ms — and its effect's dependencies are the position,
 * the selection and the legal targets, none of which change again until the
 * reader does something. So when the board mounted after those three attempts,
 * every square stayed unlabelled until the first click: a screen reader found
 * sixty-four anonymous divs, which is the one state from which a reader cannot
 * produce the interaction that would fix it.
 *
 * Measured in the browser: 0 labelled elements on load, 96 after one click.
 */
export function syncRenderedBoardAccessibility(
  chess: Chess,
  selectedSquare: Square | null,
  legalTargets: Square[],
): boolean {
  const legalTargetSet = new Set(legalTargets)
  let foundBoard = false

  for (const square of BOARD_SQUARES) {
    const squareEl = document.getElementById(`chessboard-square-${square}`)
    if (!squareEl) continue
    foundBoard = true

    const label = describeBoardSquare(chess, square, { selectedSquare, legalTargets })
    squareEl.setAttribute('aria-label', label)
    squareEl.setAttribute('title', label)

    for (const interactiveEl of squareEl.querySelectorAll<HTMLElement>('button, [role="button"]')) {
      interactiveEl.setAttribute('aria-label', label)
      interactiveEl.setAttribute('title', label)
    }

    const shouldExposeEmptyTarget = !squareEl.querySelector('button, [role="button"]')
      && Boolean(selectedSquare)
      && legalTargetSet.has(square)
    if (shouldExposeEmptyTarget) {
      squareEl.setAttribute('role', 'button')
      squareEl.setAttribute('tabindex', '0')
      squareEl.setAttribute('data-webchess-a11y-target', 'true')
    } else if (squareEl.getAttribute('data-webchess-a11y-target') === 'true') {
      squareEl.removeAttribute('role')
      squareEl.removeAttribute('tabindex')
      squareEl.removeAttribute('data-webchess-a11y-target')
    }
  }

  return foundBoard
}
