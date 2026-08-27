import { describe, expect, it } from 'vitest'
import { fenTextForShareLink } from './pgnDialogHelpers'
import { MAX_PGN_IMPORT_CHARS, PGN_IMPORT_LIMIT_MESSAGE, pgnImportLengthError } from './pgnImportLimits'

describe('PGN dialog import limits', () => {
    it('accepts PGN text at the configured import limit', () => {
        expect(pgnImportLengthError('1'.repeat(MAX_PGN_IMPORT_CHARS))).toBeNull()
    })

    it('rejects PGN text before storing oversized paste/file contents', () => {
        expect(pgnImportLengthError('1'.repeat(MAX_PGN_IMPORT_CHARS + 1))).toBe(PGN_IMPORT_LIMIT_MESSAGE)
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
