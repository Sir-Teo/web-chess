import { describe, expect, it } from 'vitest'
import { hasMatingMaterial } from './matingMaterial'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

describe('hasMatingMaterial', () => {
  it('says both sides can mate from the starting position', () => {
    expect(hasMatingMaterial(START, 'w')).toBe(true)
    expect(hasMatingMaterial(START, 'b')).toBe(true)
  })

  it('says a bare king cannot mate', () => {
    const bareKings = '6k1/8/8/8/8/8/8/4K3 w - - 0 1'
    expect(hasMatingMaterial(bareKings, 'w')).toBe(false)
    expect(hasMatingMaterial(bareKings, 'b')).toBe(false)
  })

  it.each([
    ['queen', '6k1/8/8/8/8/8/8/3QK3 w - - 0 1'],
    ['rook', '6k1/8/8/8/8/8/8/3RK3 w - - 0 1'],
    ['pawn', '6k1/8/8/8/4P3/8/8/4K3 w - - 0 1'],
  ])('says a king and a %s can mate', (_piece, fen) => {
    expect(hasMatingMaterial(fen, 'w')).toBe(true)
    expect(hasMatingMaterial(fen, 'b')).toBe(false)
  })

  describe('knights', () => {
    it('cannot mate a bare king with one', () => {
      expect(hasMatingMaterial('6k1/8/8/8/8/8/8/4KN2 w - - 0 1', 'w')).toBe(false)
    })

    it('can mate a bare king with two, because a helpmate counts', () => {
      expect(hasMatingMaterial('6k1/8/8/8/8/8/8/3NKN2 w - - 0 1', 'w')).toBe(true)
    })

    it('can mate with one when the opponent still has something to be smothered by', () => {
      expect(hasMatingMaterial('6k1/6p1/8/8/8/8/8/4KN2 w - - 0 1', 'w')).toBe(true)
    })

    it('cannot mate with one when all the opponent has left is a queen to give up', () => {
      expect(hasMatingMaterial('4q1k1/8/8/8/8/8/8/4KN2 w - - 0 1', 'w')).toBe(false)
    })
  })

  describe('bishops', () => {
    it('cannot mate a bare king with one', () => {
      expect(hasMatingMaterial('6k1/8/8/8/8/8/8/2B1K3 w - - 0 1', 'w')).toBe(false)
    })

    it('cannot mate with two on the same colour complex', () => {
      expect(hasMatingMaterial('6k1/8/8/8/8/B7/8/2B1K3 w - - 0 1', 'w')).toBe(false)
    })

    it('can mate with two on opposite complexes', () => {
      expect(hasMatingMaterial('6k1/8/8/8/8/8/8/2B1KB2 w - - 0 1', 'w')).toBe(true)
    })

    it('reads square colour from the FEN: a1 and h8 are both dark', () => {
      expect(hasMatingMaterial('7B/8/k7/8/8/8/8/B3K3 w - - 0 1', 'w')).toBe(false)
    })

    it('reads square colour from the FEN: a1 and a8 are opposite', () => {
      expect(hasMatingMaterial('B7/8/k7/8/8/8/8/B3K3 w - - 0 1', 'w')).toBe(true)
    })

    it('draws with a lone bishop each on the same complex', () => {
      const sameComplex = '5bk1/8/8/8/8/8/8/2B1K3 w - - 0 1'
      expect(hasMatingMaterial(sameComplex, 'w')).toBe(false)
      expect(hasMatingMaterial(sameComplex, 'b')).toBe(false)
    })

    it('can mate when the opponent holds a bishop on the other complex', () => {
      const opposed = '2b3k1/8/8/8/8/8/8/2B1K3 w - - 0 1'
      expect(hasMatingMaterial(opposed, 'w')).toBe(true)
      expect(hasMatingMaterial(opposed, 'b')).toBe(true)
    })

    it('can mate against a knight, which can block its own king', () => {
      expect(hasMatingMaterial('5nk1/8/8/8/8/8/8/2B1K3 w - - 0 1', 'w')).toBe(true)
    })
  })

  it('assumes a flag is a loss when the position cannot be read', () => {
    expect(hasMatingMaterial('', 'w')).toBe(true)
    expect(hasMatingMaterial('not a fen', 'w')).toBe(true)
  })
})
