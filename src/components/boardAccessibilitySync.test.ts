import { afterEach, describe, expect, it, vi } from 'vitest'
import { Chess } from 'chess.js'
import { syncRenderedBoardAccessibility } from './boardAccessibilitySync'

/**
 * A square element, thin enough to run in the node environment this suite uses.
 * The sync only ever calls these four things on one.
 */
function fakeSquare() {
  const attributes = new Map<string, string>()
  return {
    attributes,
    setAttribute: (name: string, value: string) => attributes.set(name, value),
    getAttribute: (name: string) => attributes.get(name) ?? null,
    removeAttribute: (name: string) => attributes.delete(name),
    querySelector: () => null,
    querySelectorAll: () => [] as unknown[],
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
    expect(square.getAttribute('role')).toBeNull()
    expect(square.getAttribute('tabindex')).toBeNull()
  })

  it('leaves a tabindex it did not add alone', () => {
    const board = mountBoard(['e4'])
    const square = board.get('chessboard-square-e4')!
    square.setAttribute('tabindex', '-1')

    syncRenderedBoardAccessibility(new Chess(), null, [])
    expect(square.getAttribute('tabindex')).toBe('-1')
  })
})
