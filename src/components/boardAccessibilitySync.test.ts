import { afterEach, describe, expect, it, vi } from 'vitest'
import { Chess } from 'chess.js'
import { syncRenderedBoardAccessibility } from './boardAccessibilitySync'

/**
 * Thin square/control mocks for label and role-ownership transitions.
 */
function fakeSquare() {
  const attributes = new Map<string, string>()
  const interactiveChildren: Array<{ setAttribute: (name: string, value: string) => void }> = []
  return {
    interactiveChildren,
    attributes,
    setAttribute: (name: string, value: string) => attributes.set(name, value),
    getAttribute: (name: string) => attributes.get(name) ?? null,
    removeAttribute: (name: string) => attributes.delete(name),
    querySelector: () => interactiveChildren[0] ?? null,
    querySelectorAll: () => interactiveChildren,
  }
}

function mountBoard(squares: string[]) {
  const board = new Map(squares.map(square => [`chessboard-square-${square}`, fakeSquare()]))
  vi.stubGlobal('document', { getElementById: (id: string) => board.get(id) ?? null })
  return board
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('syncRenderedBoardAccessibility', () => {
  it('labels each square it finds with what is on it', () => {
    const board = mountBoard(['a8', 'e2'])
    expect(syncRenderedBoardAccessibility(new Chess(), null, [])).toBe(true)
    expect(board.get('chessboard-square-a8')!.getAttribute('aria-label')).toBe('a8, Black rook')
    expect(board.get('chessboard-square-e2')!.getAttribute('title')).toBe('e2, White pawn')
  })

  /**
   * The whole reason this reports anything. `<Chessboard>` is held back until
   * its width is measured, so on a cold load the first attempts run against an
   * empty document -- and the caller has to know to look again, because its
   * own dependencies will not change until the reader moves.
   */
  it('says so when there is no board to label yet', () => {
    mountBoard([])
    expect(syncRenderedBoardAccessibility(new Chess(), null, [])).toBe(false)
  })

  it('makes an empty legal target reachable, and gives it back afterwards', () => {
    const board = mountBoard(['e4'])
    const square = board.get('chessboard-square-e4')!

    syncRenderedBoardAccessibility(new Chess(), 'e2', ['e4'])
    expect(square.getAttribute('role')).toBe('button')
    expect(square.getAttribute('tabindex')).toBe('0')

    // Deselect: it stops being a target and must stop being a tab stop.
    syncRenderedBoardAccessibility(new Chess(), null, [])
    expect(square.getAttribute('role')).toBe('img')
    expect(square.getAttribute('tabindex')).toBeNull()
  })

  it('leaves a tabindex it did not add alone', () => {
    const board = mountBoard(['e4'])
    const square = board.get('chessboard-square-e4')!
    square.setAttribute('tabindex', '-1')

    syncRenderedBoardAccessibility(new Chess(), null, [])
    expect(square.getAttribute('tabindex')).toBe('-1')
  })

  it('exposes a passive square description without adding a tab stop', () => {
    const square = mountBoard(['e4']).get('chessboard-square-e4')!
    syncRenderedBoardAccessibility(new Chess(), null, [])
    expect(square.getAttribute('role')).toBe('img')
    expect(square.getAttribute('aria-label')).toBe('e4, empty square')
    expect(square.getAttribute('tabindex')).toBeNull()
  })

  it('names the piece control without naming its generic wrapper', () => {
    const square = mountBoard(['e2']).get('chessboard-square-e2')!
    const piece = fakeSquare()
    piece.setAttribute('role', 'button')
    square.interactiveChildren.push(piece)
    syncRenderedBoardAccessibility(new Chess(), null, [])
    expect(piece.getAttribute('aria-label')).toBe('e2, White pawn')
    expect(square.getAttribute('aria-label')).toBeNull()
    expect(square.getAttribute('role')).toBeNull()
    expect(square.getAttribute('title')).toBe('e2, White pawn')
  })

  it('removes its passive role when a piece arrives and restores it after departure', () => {
    const square = mountBoard(['e4']).get('chessboard-square-e4')!
    const game = new Chess()
    syncRenderedBoardAccessibility(game, null, [])
    expect(square.getAttribute('role')).toBe('img')

    game.move('e4')
    const piece = fakeSquare()
    piece.setAttribute('role', 'button')
    square.interactiveChildren.push(piece)
    syncRenderedBoardAccessibility(game, null, [])
    expect(square.getAttribute('role')).toBeNull()
    expect(square.getAttribute('aria-label')).toBeNull()
    expect(piece.getAttribute('aria-label')).toBe('e4, White pawn')

    game.move('d5')
    game.move('exd5')
    square.interactiveChildren.length = 0
    syncRenderedBoardAccessibility(game, null, [])
    expect(square.getAttribute('role')).toBe('img')
    expect(square.getAttribute('aria-label')).toBe('e4, empty square')
    expect(square.getAttribute('tabindex')).toBeNull()
  })

  it('preserves a square control and tab order supplied by its owner', () => {
    const square = mountBoard(['e4']).get('chessboard-square-e4')!
    square.setAttribute('role', 'button')
    square.setAttribute('tabindex', '-1')
    syncRenderedBoardAccessibility(new Chess(), 'e2', ['e4'])
    expect(square.getAttribute('role')).toBe('button')
    expect(square.getAttribute('tabindex')).toBe('-1')
    expect(square.getAttribute('data-webchess-a11y-target')).toBeNull()
    syncRenderedBoardAccessibility(new Chess(), null, [])
    expect(square.getAttribute('role')).toBe('button')
    expect(square.getAttribute('tabindex')).toBe('-1')
  })
  it('exposes a premove destination and removes its keyboard role after queueing', () => {
    const squares = mountBoard(['g1', 'f3'])
    const target = squares.get('chessboard-square-f3')!
    const chess = new Chess()
    chess.move('e4')
    syncRenderedBoardAccessibility(chess, 'g1', [], false, { keyboardHelpId: 'move-help', premove: true })
    expect(target.getAttribute('role')).toBe('button')
    expect(target.getAttribute('tabindex')).toBe('0')
    expect(target.getAttribute('aria-label')).toBe('f3, empty square, premove target')
    expect(target.getAttribute('aria-describedby')).toBe('move-help')

    syncRenderedBoardAccessibility(chess, null, [], false, {
      keyboardHelpId: 'move-help', premove: true, queuedPremove: { from: 'g1', to: 'f3' },
    })
    expect(target.getAttribute('role')).toBe('img')
    expect(target.getAttribute('tabindex')).toBeNull()
    expect(target.getAttribute('aria-describedby')).toBeNull()
    expect(target.getAttribute('aria-label')).toBe('f3, empty square, premove queued from g1')
    syncRenderedBoardAccessibility(chess, null, [], false, { keyboardHelpId: 'move-help' })
    expect(target.getAttribute('aria-label')).toBe('f3, empty square')
  })

})
