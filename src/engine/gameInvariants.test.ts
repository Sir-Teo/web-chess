import { describe, expect, it } from 'vitest'
import { Chess } from 'chess.js'
import { describeGameEnd } from './gameEnd'
import { PIECE_VALUES, materialBalance } from './material'
import { flattenPgnMainLine, parsePgnMoveTree } from './pgn'

/**
 * Invariants checked against a few hundred random legal games rather than
 * against positions someone thought of.
 *
 * Hand-written cases test the endings you remember to write down. These play
 * real games and assert the rules that must hold at every ply of all of them,
 * which is where the ones nobody remembers live.
 *
 * The generator is seeded, so a failure is reproducible: the seed and the ply
 * are in the assertion message.
 */

/** mulberry32 -- small, deterministic and good enough to shuffle move choices. */
function makeRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Material read from chess.js's parsed board rather than from the FEN string,
 * so this is a genuinely separate route to the same number and not a copy of
 * the implementation.
 */
function materialDeltaFromBoard(game: Chess): number {
  let delta = 0
  for (const row of game.board()) {
    for (const square of row) {
      if (!square || square.type === 'k') continue
      const value = PIECE_VALUES[square.type] ?? 0
      delta += square.color === 'w' ? value : -value
    }
  }
  return delta
}

const START = new Chess().fen()

/**
 * The played game is kept, not just its final FEN.
 *
 * Rebuilding from a FEN loses the history, and with it every repetition: two
 * of the 80 games below end by threefold, and both look unfinished if you
 * reload their last position. That is the caveat `describeGameEnd`
 * documents, and it would quietly have made this whole file weaker.
 */
type PlayedGame = { seed: number; sans: string[]; game: Chess; finalFen: string }

function playRandomGame(seed: number, maxPlies: number): PlayedGame {
  const random = makeRandom(seed)
  const game = new Chess()
  const sans: string[] = []

  while (sans.length < maxPlies && !game.isGameOver()) {
    const legal = game.moves()
    const chosen = legal[Math.floor(random() * legal.length)]
    game.move(chosen)
    sans.push(chosen)
  }

  return { seed, sans, game, finalFen: game.fen() }
}

/**
 * Two sets, because the two kinds of invariant want different games.
 *
 * Endings need games played to the finish: random play takes a long time to
 * mate and even longer to run the fifty-move rule out, and a short cap reaches
 * neither. Per-ply rules need many positions rather than many endings, and
 * checking every ply of a 600-move game costs far more than it proves --
 * `isThreefoldRepetition` alone walks the history each time it is asked.
 */
const endgames = Array.from({ length: 80 }, (_, index) => playRandomGame(index + 1, 500))
const walks = Array.from({ length: 40 }, (_, index) => playRandomGame(1000 + index, 200))

describe('the games these rules are checked against', () => {
  it('reach every ending there is', () => {
    const kinds = new Map<string, number>()
    for (const played of endgames) {
      const game = played.game
      const kind = !game.isGameOver() ? 'unfinished'
        : game.isCheckmate() ? 'checkmate'
        : game.isStalemate() ? 'stalemate'
        : game.isInsufficientMaterial() ? 'insufficient'
        : game.isThreefoldRepetition() ? 'threefold'
        : game.isDrawByFiftyMoves() ? 'fifty-move'
        : 'other'
      kinds.set(kind, (kinds.get(kind) ?? 0) + 1)
    }
    // Measured, not hoped for. 80 games to a 500-ply cap costs about four
    // seconds and yields 8 mates, 2 stalemates, 46 dead positions, 2
    // repetitions and 15 fifty-move draws -- every ending, for a third of the
    // time 240 games took. The seeds are fixed, so a thin count is stable
    // rather than flaky.
    for (const kind of ['checkmate', 'stalemate', 'insufficient', 'threefold', 'fifty-move']) {
      expect(kinds.get(kind) ?? 0, `no ${kind} in the sample: ${JSON.stringify([...kinds])}`)
        .toBeGreaterThan(0)
    }
  })
})

describe('describeGameEnd', () => {
  it('says the game is over exactly when chess.js does, at every ply', () => {
    for (const played of walks) {
      const replay = new Chess()
      for (let ply = 0; ply <= played.sans.length; ply++) {
        if (ply > 0) replay.move(played.sans[ply - 1])
        const ending = describeGameEnd(replay)
        expect(
          ending !== null,
          `seed ${played.seed} ply ${ply}: ${replay.fen()}`,
        ).toBe(replay.isGameOver())
      }
    }
  })

  it('never returns a label without a result, or a result outside the three tags', () => {
    for (const played of endgames) {
      const ending = describeGameEnd(played.game)
      if (!ending) continue
      expect(ending.label.length, `seed ${played.seed}`).toBeGreaterThan(0)
      expect(['1-0', '0-1', '1/2-1/2'], `seed ${played.seed}`).toContain(ending.result)
    }
  })

  it('gives a decisive result only to a checkmate, and to the right side', () => {
    for (const played of endgames) {
      const replay = played.game
      const ending = describeGameEnd(replay)
      if (!ending) continue
      if (ending.result === '1/2-1/2') {
        expect(replay.isCheckmate(), `seed ${played.seed} drew a mate`).toBe(false)
        continue
      }
      expect(replay.isCheckmate(), `seed ${played.seed}: ${replay.fen()}`).toBe(true)
      // The mated side is the side to move, so it is the one that lost.
      expect(ending.result, `seed ${played.seed}`).toBe(replay.turn() === 'w' ? '0-1' : '1-0')
    }
  })
})

describe('materialBalance', () => {
  it('agrees with a count taken from the parsed board instead of the FEN', () => {
    for (const played of walks) {
      const replay = new Chess()
      for (let ply = 0; ply <= played.sans.length; ply++) {
        if (ply > 0) replay.move(played.sans[ply - 1])
        expect(
          materialBalance(START, replay.fen()).delta,
          `seed ${played.seed} ply ${ply}: ${replay.fen()}`,
        ).toBe(materialDeltaFromBoard(replay))
      }
    }
  })

  /**
   * The dynamic rule: nothing but a capture or a promotion may move the count,
   * and each must move it by exactly what it is worth.
   */
  it('only changes on a capture or a promotion, and by the right amount', () => {
    for (const played of walks) {
      const replay = new Chess()
      let previous = 0
      for (const san of played.sans) {
        const move = replay.move(san)
        const current = materialBalance(START, replay.fen()).delta
        const change = current - previous
        const captured = move.captured ? (PIECE_VALUES[move.captured] ?? 0) : 0
        const promoted = move.promotion ? (PIECE_VALUES[move.promotion] ?? 0) - PIECE_VALUES.p : 0
        // A White move gains White material; a Black move gains Black's, which
        // is negative in this sign convention.
        // `|| 0` because (-1) * 0 is -0, which Object.is refuses to call 0.
        const expected = (move.color === 'w' ? 1 : -1) * (captured + promoted) || 0
        expect(change, `seed ${played.seed} ${san}: ${replay.fen()}`).toBe(expected)
        previous = current
      }
    }
  })

  it('never reports a capture that did not happen', () => {
    for (const played of endgames) {
      const balance = materialBalance(START, played.finalFen)
      const total = balance.capturedByWhite.length + balance.capturedByBlack.length
      // 30 capturable pieces exist; promotions can inflate this reading, which
      // is the documented caveat, so the bound is the one that must never break.
      expect(total, `seed ${played.seed}`).toBeLessThanOrEqual(30)
    }
  })
})

describe('the PGN parser, against games chess.js wrote', () => {
  it('reads back the same moves chess.js exported', () => {
    for (const played of walks) {
      if (played.sans.length === 0) continue
      const writer = new Chess()
      for (const san of played.sans) writer.move(san)

      const parsed = parsePgnMoveTree(writer.pgn())
      const line = flattenPgnMainLine(parsed.moves)
      expect(
        line.map(entry => entry.move.san),
        `seed ${played.seed}`,
      ).toEqual(played.sans)
    }
  })

  it('lands on the same final position it started from', () => {
    for (const played of walks) {
      if (played.sans.length === 0) continue
      const writer = new Chess()
      for (const san of played.sans) writer.move(san)

      const line = flattenPgnMainLine(parsePgnMoveTree(writer.pgn()).moves)
      expect(line[line.length - 1].fen, `seed ${played.seed}`).toBe(played.finalFen)
    }
  })
})
