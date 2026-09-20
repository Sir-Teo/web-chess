import { describe, expect, it } from 'vitest'
import { Chess } from 'chess.js'
import type { GameNode } from '../hooks/useGameTree'
import { clockMsAfterMove, createClock, moveMade, startSide } from './chessClock'
import { buildMoveTimeSeries, formatMoveTime, parseTimeControlTag } from './moveTimes'

/** A line of nodes with the clock readings a Lichess export carries. */
function line(sans: string[], clocks: Array<number | undefined>): GameNode[] {
  const chess = new Chess()
  const nodes: GameNode[] = [{ id: 'root', fen: chess.fen(), move: null, san: '', uci: '', parent: null, children: [] }]
  sans.forEach((san, i) => {
    const move = chess.move(san)
    nodes.push({
      id: `n${i}`, fen: chess.fen(), move, san: move.san, uci: `${move.from}${move.to}`, parent: nodes[i]!.id, children: [],
      ...(clocks[i] === undefined ? {} : { clockMs: clocks[i] }),
    })
  })
  return nodes
}

describe('parseTimeControlTag', () => {
  it('reads the two forms Lichess and chess.com write', () => {
    expect(parseTimeControlTag('180+2')).toEqual({ initialMs: 180_000, incrementMs: 2_000 })
    expect(parseTimeControlTag('600')).toEqual({ initialMs: 600_000, incrementMs: 0 })
  })

  it('reads nothing from the forms that name no single bank', () => {
    for (const tag of ['-', '?', '40/7200:3600', '', undefined, '0']) {
      expect(parseTimeControlTag(tag)).toBeNull()
    }
  })
})

describe('buildMoveTimeSeries', () => {
  it('charges each move the drop in its side\'s clock, plus the increment', () => {
    // 3+2: White 180 -> 175 after e4 means 5s thought + 2s increment = 7s spent.
    const nodes = line(['e4', 'e5', 'Nf3', 'Nc6'], [175_000, 170_000, 160_000, 150_000])
    const series = buildMoveTimeSeries(nodes, { initialMs: 180_000, incrementMs: 2_000 })
    expect(series.map(p => [p.index, p.side, p.seconds, p.label])).toEqual([
      [1, 'w', 7, '1. e4'],
      [2, 'b', 12, '1... e5'],
      [3, 'w', 17, '2. Nf3'],
      [4, 'b', 22, '2... Nc6'],
    ])
  })

  it('skips a side\'s first move when the starting bank is unknown', () => {
    const nodes = line(['e4', 'e5', 'Nf3', 'Nc6'], [175_000, 170_000, 160_000, 150_000])
    const series = buildMoveTimeSeries(nodes, null)
    expect(series.map(p => [p.index, p.seconds])).toEqual([[3, 15], [4, 20]])
  })

  it('skips a move with no reading and the one that would be measured against it', () => {
    const nodes = line(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6'], [175_000, 170_000, undefined, 150_000, 140_000, 130_000])
    const series = buildMoveTimeSeries(nodes, { initialMs: 180_000, incrementMs: 0 })
    expect(series.map(p => p.index)).toEqual([1, 2, 4, 6])
    expect(series.find(p => p.index === 6)?.seconds).toBe(20)
  })

  /**
   * The side that writes the readings and the side that reads them have to
   * agree about the increment, and they did not: the clock was read before the
   * move pressed it, so every reading was short by one increment. Later moves
   * hid it, because their baseline was short by the same amount -- only each
   * side's *first* move, measured against the starting bank, came out two
   * seconds long. So the test has to run a real clock: readings written by
   * hand assume the answer.
   */
  it('recovers the real think from readings a running clock wrote', () => {
    const control = { initialMs: 180_000, incrementMs: 2_000 }
    const thinks = [5_000, 12_000, 3_000, 8_000]
    let clock = startSide(createClock(control), 'w', 0)
    let now = 0
    const readings = thinks.map((think, i) => {
      const side = i % 2 === 0 ? 'w' : 'b'
      now += think
      const reading = clockMsAfterMove(clock, side, now)
      clock = moveMade(clock, side, now)
      return reading
    })

    const series = buildMoveTimeSeries(line(['e4', 'e5', 'Nf3', 'Nc6'], readings), control)
    expect(series.map(p => p.seconds)).toEqual(thinks.map(ms => ms / 1000))
  })

  it('never reports negative time, and nothing for a game without clocks', () => {
    expect(buildMoveTimeSeries(line(['e4', 'e5'], [undefined, undefined]), null)).toEqual([])
    const odd = line(['e4', 'e5', 'Nf3'], [175_000, 170_000, 190_000])
    expect(buildMoveTimeSeries(odd, { initialMs: 180_000, incrementMs: 0 }).find(p => p.index === 3)?.seconds).toBe(0)
  })
})

describe('formatMoveTime', () => {
  it('prints tenths under ten seconds, whole seconds under a minute, then minutes', () => {
    expect(formatMoveTime(3.24)).toBe('3.2s')
    expect(formatMoveTime(14.6)).toBe('15s')
    expect(formatMoveTime(65)).toBe('1:05')
    expect(formatMoveTime(760)).toBe('12:40')
    expect(formatMoveTime(119.9)).toBe('2:00')
    expect(formatMoveTime(3599.5)).toBe('60:00')
  })
})
