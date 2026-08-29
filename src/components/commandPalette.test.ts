import { describe, expect, it } from 'vitest'
import {
    MAX_RECENT_COMMANDS,
    RECENT_COMMANDS_STORAGE_KEY,
    type Command,
    commandMatches,
    rankCommands,
    readRecentCommandIds,
    rememberCommandId,
} from './commandPalette'
import { MAX_SEARCH_QUERY_LENGTH } from '../engine/searchTerms'

const noop = () => {}
const make = (id: string, label: string, extra: Partial<Command> = {}): Command =>
    ({ id, label, run: noop, ...extra })

const COMMANDS: Command[] = [
    make('new', 'New game', { shortcut: 'N', keywords: ['restart'] }),
    make('flip', 'Flip board', { shortcut: 'F' }),
    make('library', 'Library', { hint: 'Saved games' }),
    make('live', 'Toggle live analysis'),
    make('pgn', 'PGN and FEN', { keywords: ['import', 'export', 'share'] }),
]

describe('matching commands', () => {
    it('matches everything when nothing is typed', () => {
        expect(rankCommands(COMMANDS, '')).toHaveLength(COMMANDS.length)
    })

    it('requires every term, across label, hint, keywords and shortcut', () => {
        expect(commandMatches(COMMANDS[2]!, ['saved'])).toBe(true)
        expect(commandMatches(COMMANDS[0]!, ['restart'])).toBe(true)
        expect(commandMatches(COMMANDS[4]!, ['import', 'fen'])).toBe(true)
        expect(commandMatches(COMMANDS[4]!, ['import', 'castling'])).toBe(false)
    })
})

describe('ranking commands', () => {
    it('puts a label that starts with the query above one that merely contains it', () => {
        // "li" is the start of Library and the middle of "Toggle live analysis".
        const ranked = rankCommands(COMMANDS, 'li')
        expect(ranked[0]?.id).toBe('library')
    })

    it('keeps declaration order inside a band, so grouping survives', () => {
        const ranked = rankCommands(COMMANDS, '')
        expect(ranked.map(command => command.id)).toEqual(['new', 'flip', 'library', 'live', 'pgn'])
    })

    it('leads with recently used commands on an empty query', () => {
        const ranked = rankCommands(COMMANDS, '', ['pgn', 'flip'])
        expect(ranked.map(command => command.id)).toEqual(['pgn', 'flip', 'new', 'library', 'live'])
    })

    it('ignores a recent id that is no longer a command', () => {
        const ranked = rankCommands(COMMANDS, '', ['gone', 'flip'])
        expect(ranked[0]?.id).toBe('flip')
        expect(ranked).toHaveLength(COMMANDS.length)
    })

    it('ignores recents once something is typed, since the query is the intent', () => {
        expect(rankCommands(COMMANDS, 'flip', ['pgn'])[0]?.id).toBe('flip')
    })

    it('bounds the query, so a pasted game is not thousands of terms', () => {
        const pasted = Array.from({ length: 5_000 }, (_, i) => `${i}. e4 e5`).join(' ')
        const started = performance.now()
        const ranked = rankCommands(COMMANDS, pasted)
        const elapsed = performance.now() - started
        expect(ranked).toHaveLength(0)
        expect(pasted.length).toBeGreaterThan(MAX_SEARCH_QUERY_LENGTH)
        expect(elapsed, `took ${elapsed.toFixed(0)}ms`).toBeLessThan(50)
    })
})

describe('recent commands', () => {
    const storage = () => {
        const entries = new Map<string, string>()
        return {
            getItem: (key: string) => entries.get(key) ?? null,
            setItem: (key: string, value: string) => { entries.set(key, value) },
            removeItem: (key: string) => { entries.delete(key) },
            entries,
        }
    }

    it('remembers most-recent-first with no duplicates', () => {
        const store = storage()
        globalThis.localStorage = store as unknown as Storage
        rememberCommandId('a')
        rememberCommandId('b')
        const after = rememberCommandId('a')
        expect(after).toEqual(['a', 'b'])
        expect(readRecentCommandIds()).toEqual(['a', 'b'])
    })

    it('caps the list', () => {
        const store = storage()
        globalThis.localStorage = store as unknown as Storage
        for (const id of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) rememberCommandId(id)
        expect(readRecentCommandIds()).toHaveLength(MAX_RECENT_COMMANDS)
        expect(readRecentCommandIds()[0]).toBe('g')
    })

    it('survives junk in storage rather than throwing at startup', () => {
        const store = storage()
        globalThis.localStorage = store as unknown as Storage
        store.entries.set(RECENT_COMMANDS_STORAGE_KEY, '{not json')
        expect(readRecentCommandIds()).toEqual([])
        store.entries.set(RECENT_COMMANDS_STORAGE_KEY, '{"not":"an array"}')
        expect(readRecentCommandIds()).toEqual([])
        store.entries.set(RECENT_COMMANDS_STORAGE_KEY, '[1,2,"ok"]')
        expect(readRecentCommandIds()).toEqual(['ok'])
    })
})
