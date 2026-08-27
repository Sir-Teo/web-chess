import { describe, expect, it } from 'vitest'
import { FEN_KING_PLACEMENT_ERROR, FEN_PARSE_ERROR, hasLegalKingPlacement, validateFenForAnalysis } from './fen'

describe('FEN validation helpers', () => {
  it('accepts separated kings and rejects adjacent kings', () => {
    expect(hasLegalKingPlacement('8/8/8/8/8/8/4K3/6k1 w - - 0 1')).toBe(true)
    expect(hasLegalKingPlacement('8/8/8/8/8/8/7K/6k1 w - - 0 1')).toBe(false)
  })

  it('rejects positions without both kings', () => {
    expect(hasLegalKingPlacement('8/8/8/8/8/8/4K3/8 w - - 0 1')).toBe(false)
    expect(hasLegalKingPlacement('8/8/8/8/8/8/8/6k1 w - - 0 1')).toBe(false)
  })

  it('normalizes valid FEN and returns user-facing validation errors', () => {
    expect(validateFenForAnalysis('  8/8/8/8/8/8/4K3/6k1   w   -   -   0   1  ')).toEqual({
      ok: true,
      fen: '8/8/8/8/8/8/4K3/6k1 w - - 0 1',
    })
    expect(validateFenForAnalysis('8/8/8/8/8/8/4K3/8 w - - 0 1')).toEqual({
      ok: false,
      error: FEN_KING_PLACEMENT_ERROR,
    })
    expect(validateFenForAnalysis('not a fen')).toEqual({
      ok: false,
      error: FEN_PARSE_ERROR,
    })
  })
})
