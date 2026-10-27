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
  blindfold = false,
  { keyboardHelpId, premove = false, queuedPremove = null }: {
    keyboardHelpId?: string
    premove?: boolean
    queuedPremove?: { from: Square; to: Square } | null
  } = {},
): boolean {
  const legalTargetSet = new Set(legalTargets)
  let foundBoard = false

  for (const square of BOARD_SQUARES) {
    const squareEl = document.getElementById(`chessboard-square-${square}`)
    if (!squareEl) continue
    foundBoard = true

    const label = describeBoardSquare(chess, square, { selectedSquare, legalTargets, premove, queuedPremove })
    /*
     * The name and the tooltip are the same string everywhere except under a
     * blindfold, where they must not be.
     *
     * `title` is not an accessibility affordance; it is a box the browser
     * draws under the pointer. So while the pieces are drawn transparent,
     * hovering any square named the piece on it -- **measured** at
     * `opacity: 0` with `title="e2, White pawn"` -- and the exercise was over
     * for anyone with a mouse.
     *
     * The accessible name is deliberately left whole. A blindfold is a thing
     * the reader chooses, and enforcing it through the accessibility tree
     * would take the board away from someone who did not choose it.
     */
    const shown = blindfold
      ? describeBoardSquare(chess, square, { selectedSquare, legalTargets, premove, queuedPremove, hidePiece: true })
      : label
    squareEl.setAttribute('title', shown)
    const controls = [...squareEl.querySelectorAll<HTMLElement>('button, [role="button"]')]

    for (const interactiveEl of controls) {
      interactiveEl.setAttribute('aria-label', label)
      interactiveEl.setAttribute('title', shown)
      if (keyboardHelpId) interactiveEl.setAttribute('aria-describedby', keyboardHelpId)
    }

    const ownsTarget = squareEl.getAttribute('data-webchess-a11y-target') === 'true'
    const ownsDescription = squareEl.getAttribute('data-webchess-a11y-description') === 'true'
    const ownRole = squareEl.getAttribute('role')
    const suppliedControl = squareEl.tagName === 'BUTTON' || (ownRole === 'button' && !ownsTarget)
    const shouldExposeEmptyTarget = controls.length === 0 && !suppliedControl
      && Boolean(selectedSquare) && (legalTargetSet.has(square) || (premove && selectedSquare !== square))

    // An image is a passive square description, never a wrapper around a
    // piece button: the image role would hide that interactive descendant.
    if (ownsDescription && (controls.length > 0 || shouldExposeEmptyTarget || ownRole !== 'img')) {
      if (ownRole === 'img') squareEl.removeAttribute('role')
      squareEl.removeAttribute('data-webchess-a11y-description')
    }
    if (shouldExposeEmptyTarget) {
      squareEl.setAttribute('role', 'button')
      squareEl.setAttribute('tabindex', '0')
      squareEl.setAttribute('data-webchess-a11y-target', 'true')
    } else {
      if (ownsTarget) {
        if (squareEl.getAttribute('role') === 'button') squareEl.removeAttribute('role')
        if (squareEl.getAttribute('tabindex') === '0') squareEl.removeAttribute('tabindex')
        squareEl.removeAttribute('data-webchess-a11y-target')
      }
      if (controls.length === 0 && !suppliedControl && !squareEl.getAttribute('role')) {
        squareEl.setAttribute('role', 'img')
        squareEl.setAttribute('data-webchess-a11y-description', 'true')
      }
    }

    if (keyboardHelpId) {
      if (suppliedControl || shouldExposeEmptyTarget) squareEl.setAttribute('aria-describedby', keyboardHelpId)
      else if (squareEl.getAttribute('aria-describedby') === keyboardHelpId) squareEl.removeAttribute('aria-describedby')
    }

    const role = squareEl.getAttribute('role')
    if (suppliedControl || (role && !['none', 'presentation', 'generic'].includes(role))) {
      squareEl.setAttribute('aria-label', label)
    } else {
      // Generic wrappers cannot be named. Their piece button already carries
      // the description, without duplicating it in the accessibility tree.
      squareEl.removeAttribute('aria-label')
    }
  }

  return foundBoard
}
