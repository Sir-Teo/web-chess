import { describe, expect, it } from 'vitest'
import { readAutoSavedGame } from './autoSave'
import { normalizeLibraryGames, parseLibraryBackup } from './gameLibrary'

/**
 * "Storage readers must never throw on bad data; return empty and move on" is
 * one of this repo's stated invariants. The PGN import path is fuzzed already;
 * the *storage* readers were not, and the case they had never been given is a
 * storage object that throws on read rather than one holding junk.
 *
 * That is what private mode and blocked site data look like, and a read
 * failure lands at startup — worse than a write failure, which the user can
 * at least keep playing through.
 */
const JUNK: Array<[name: string, value: string]> = [
    ['empty', ''],
    ['whitespace', '   '],
    ['not json', '{oh no'],
    ['json null', 'null'],
    ['a bare number', '42'],
    ['an array where an object belongs', '[1,2,3]'],
    ['the wrong version', '{"version":99,"pgn":"x","savedAt":1}'],
    ['fields of the wrong type', '{"version":1,"pgn":5,"savedAt":"soon"}'],
    ['a non-finite timestamp', '{"version":1,"pgn":"x","savedAt":null}'],
    ['deep nesting', '[' + '{"a":'.repeat(50) + '1' + '}'.repeat(50) + ']'],
    ['a very long string', 'x'.repeat(200_000)],
    ['a lone surrogate', '"\uD800 broken"'],
]

const storageHolding = (raw: string) => ({
    getItem: () => raw,
    setItem: () => {},
    removeItem: () => {},
})

describe('storage readers never throw', () => {
    for (const [name, raw] of JUNK) {
        it(`survives ${name}`, () => {
            expect(() => readAutoSavedGame(storageHolding(raw))).not.toThrow()
            expect(() => normalizeLibraryGames(raw)).not.toThrow()
            expect(() => parseLibraryBackup(raw)).not.toThrow()
        })
    }

    it('returns nothing rather than throwing when reading itself fails', () => {
        // Private mode, blocked site data: getItem throws instead of returning
        // null. Only setItem failing was covered before.
        const hostile = {
            getItem: () => { throw new Error('SecurityError') },
            setItem: () => {},
            removeItem: () => {},
        }
        expect(() => readAutoSavedGame(hostile)).not.toThrow()
        expect(readAutoSavedGame(hostile)).toBeNull()
    })

    it('gives back an empty library rather than throwing, for every junk input', () => {
        for (const [, raw] of JUNK) {
            expect(Array.isArray(normalizeLibraryGames(raw))).toBe(true)
            expect(Array.isArray(parseLibraryBackup(raw))).toBe(true)
        }
    })
})
