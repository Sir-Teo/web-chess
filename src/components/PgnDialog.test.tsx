import { describe, expect, it } from 'vitest'
import { fenTextForShareLink } from './pgnDialogHelpers'
import {
    MAX_PGN_IMPORT_BYTES,
    MAX_PGN_IMPORT_CHARS,
    PGN_IMPORT_LIMIT_MESSAGE,
    pgnImportLengthError,
} from './pgnImportLimits'

describe('PGN dialog import limits', () => {
    it('accepts PGN text at the configured import limit', () => {
        expect(pgnImportLengthError('1'.repeat(MAX_PGN_IMPORT_CHARS))).toBeNull()
    })

    it('rejects PGN text before storing oversized paste/file contents', () => {
        expect(pgnImportLengthError('1'.repeat(MAX_PGN_IMPORT_CHARS + 1))).toBe(PGN_IMPORT_LIMIT_MESSAGE)
    })

    /**
     * The two above are measured against the limit itself, so they hold however
     * far the limit drifts from the size the reader is told about. This one is
     * measured against the sentence: a file of exactly the size it names has to
     * be accepted, or the app is refusing something on grounds it made up.
     */
    it('accepts a file of exactly the size the message names', () => {
        const stated = Number(PGN_IMPORT_LIMIT_MESSAGE.match(/(\d+) MB/)![1]) * 1024 * 1024
        expect(MAX_PGN_IMPORT_BYTES).toBe(stated)
        // One byte a character, which is what a PGN of moves and tags is.
        expect(pgnImportLengthError('1'.repeat(stated))).toBeNull()
    })
})

describe('FEN share links', () => {
    it('shares the edited FEN text instead of replacing it with the live board FEN', () => {
        const currentFen = '8/8/8/8/8/8/4K3/6k1 w - - 0 1'
        const editedFen = '4k3/8/8/8/8/8/8/4K3 b - - 12 41'

        expect(fenTextForShareLink(`  ${editedFen}  `, currentFen)).toBe(editedFen)
        expect(fenTextForShareLink('   ', currentFen)).toBe(currentFen)
    })
})
