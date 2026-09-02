/**
 * Numeric Annotation Glyphs, as a reader expects to see them.
 *
 * A PGN writes `$1` and means "!"; a move list that prints `$1` is printing
 * the file format. The first six are judgements of the move and attach to it
 * the way a written suffix does. The rest describe the position the move
 * left and follow it. Only the ones with a conventional symbol are listed --
 * an unknown NAG is kept as `$n` rather than thrown away, because it was in
 * the file and will be written back out.
 */
export const MOVE_NAG_GLYPHS: Readonly<Record<string, string>> = {
  '1': '!',
  '2': '?',
  '3': '!!',
  '4': '??',
  '5': '!?',
  '6': '?!',
}

/** The six move judgements, in the order a picker offers them. */
export const MOVE_GLYPHS = ['!!', '!', '!?', '?!', '?', '??'] as const
export type MoveGlyph = typeof MOVE_GLYPHS[number]

const MOVE_GLYPH_NAMES: Readonly<Record<string, string>> = {
  '!!': 'brilliant move',
  '!': 'good move',
  '!?': 'interesting move',
  '?!': 'dubious move',
  '?': 'mistake',
  '??': 'blunder',
}

export const POSITION_NAG_GLYPHS: Readonly<Record<string, string>> = {
  '7': '□',
  '10': '=',
  '13': '∞',
  '14': '⩲',
  '15': '⩱',
  '16': '±',
  '17': '∓',
  '18': '+−',
  '19': '−+',
  '22': '⨀',
  '23': '⨀',
  '32': '⟳',
  '33': '⟳',
  '36': '→',
  '37': '→',
  '40': '↑',
  '41': '↑',
  '132': '⇆',
  '133': '⇆',
  '138': '⊕',
  '139': '⊕',
  '140': '∆',
  '146': 'N',
}

const POSITION_GLYPH_NAMES: Readonly<Record<string, string>> = {
  '□': 'only move',
  '=': 'equal position',
  '∞': 'unclear position',
  '⩲': 'White is slightly better',
  '⩱': 'Black is slightly better',
  '±': 'White is better',
  '∓': 'Black is better',
  '+−': 'White is winning',
  '−+': 'Black is winning',
  '⨀': 'zugzwang',
  '⟳': 'development',
  '→': 'initiative',
  '↑': 'attack',
  '⇆': 'counterplay',
  '⊕': 'time trouble',
  '∆': 'with the idea',
  'N': 'novelty',
}

export function isMoveGlyph(value: string | undefined): value is MoveGlyph {
  return (MOVE_GLYPHS as readonly string[]).includes(value ?? '')
}

/**
 * The judgement to print after the move: a written suffix if there is one,
 * otherwise the first NAG that is one. A node can carry both -- `Bb5! $1` is
 * legal and means the same thing twice -- and the suffix wins because it is
 * what the reader can see and edit.
 */
export function moveGlyphFor(node: { suffix?: string; nags?: string[] }): string {
  if (node.suffix) return node.suffix
  for (const nag of node.nags ?? []) {
    const glyph = MOVE_NAG_GLYPHS[nag]
    if (glyph) return glyph
  }
  return ''
}

/** Everything else the NAGs say, in order, as symbols. */
export function positionGlyphsFor(nags: string[] | undefined): string[] {
  return (nags ?? [])
    .filter(nag => !MOVE_NAG_GLYPHS[nag])
    .map(nag => POSITION_NAG_GLYPHS[nag] ?? `$${nag}`)
}

/** A glyph in words, for a title or a screen reader. Unknown ones are returned as they are. */
export function glyphName(glyph: string): string {
  return MOVE_GLYPH_NAMES[glyph] ?? POSITION_GLYPH_NAMES[glyph] ?? glyph
}

/**
 * The NAGs with any move judgement removed. Setting a suffix has to drop them,
 * or a move annotated "?" over an imported `$1` exports as `Bb5? $1`, which
 * says two things at once.
 */
export function withoutMoveNags(nags: string[] | undefined): string[] | undefined {
  const rest = (nags ?? []).filter(nag => !MOVE_NAG_GLYPHS[nag])
  return rest.length ? rest : undefined
}
