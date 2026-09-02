import { describe, expect, it } from 'vitest'
import {
  MOVE_GLYPHS,
  glyphName,
  isMoveGlyph,
  moveGlyphFor,
  positionGlyphsFor,
  withoutMoveNags,
} from './nags'

describe('move glyphs', () => {
  it('prints a move NAG as the symbol it stands for, not the file format', () => {
    expect(moveGlyphFor({ nags: ['1'] })).toBe('!')
    expect(moveGlyphFor({ nags: ['4'] })).toBe('??')
    expect(moveGlyphFor({ nags: ['14', '5'] })).toBe('!?')
  })

  it('prefers a written suffix, which is what the reader can see and edit', () => {
    expect(moveGlyphFor({ suffix: '?', nags: ['1'] })).toBe('?')
  })

  it('says nothing for a move nobody has judged', () => {
    expect(moveGlyphFor({})).toBe('')
    expect(moveGlyphFor({ nags: ['14'] })).toBe('')
  })

  it('offers the six judgements a picker needs, each with a name', () => {
    expect(MOVE_GLYPHS).toEqual(['!!', '!', '!?', '?!', '?', '??'])
    for (const glyph of MOVE_GLYPHS) {
      expect(isMoveGlyph(glyph)).toBe(true)
      expect(glyphName(glyph)).not.toBe(glyph)
    }
    expect(isMoveGlyph('!!!')).toBe(false)
    expect(isMoveGlyph(undefined)).toBe(false)
  })
})

describe('position glyphs', () => {
  it('follows the move with what the NAGs say about the position', () => {
    expect(positionGlyphsFor(['1', '14'])).toEqual(['⩲'])
    expect(positionGlyphsFor(['18', '140'])).toEqual(['+−', '∆'])
    expect(glyphName('±')).toBe('White is better')
  })

  it('keeps a NAG it has no symbol for, because it was in the file', () => {
    expect(positionGlyphsFor(['99'])).toEqual(['$99'])
    expect(glyphName('$99')).toBe('$99')
  })
})

describe('withoutMoveNags', () => {
  it('drops the move judgements and keeps the rest', () => {
    expect(withoutMoveNags(['1', '14', '3'])).toEqual(['14'])
  })

  it('returns nothing rather than an empty list, so the node carries no field', () => {
    expect(withoutMoveNags(['1'])).toBeUndefined()
    expect(withoutMoveNags(undefined)).toBeUndefined()
  })
})
