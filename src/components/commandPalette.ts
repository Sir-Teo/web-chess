/**
 * The command palette's data half: what a command is, which ones a query
 * matches, and which order they come back in.
 *
 * Ported in shape from web-katrain's `utils/commandPalette.ts`, which scores
 * matches across weighted fields and remembers recently used commands. This is
 * the same idea sized for an app with twenty commands rather than a hundred:
 * every whitespace-separated term has to appear somewhere in the command's
 * text, and ranking prefers a label that starts with the query, then one that
 * contains it, then everything else — with recently used commands first when
 * nothing has been typed.
 *
 * The query goes through the same bounded tokeniser the library search uses, so
 * pasting a game into the palette cannot turn into thousands of terms scanned
 * against every command.
 */
import { toSearchTerms } from '../engine/searchTerms'
import { readStorage, writeStorage } from '../engine/storage'

export const RECENT_COMMANDS_STORAGE_KEY = 'webchess:recent-commands:v1'

/** Enough to cover what anyone reaches for repeatedly, without burying the rest. */
export const MAX_RECENT_COMMANDS = 5

export type Command = {
    id: string
    label: string
    /** Shown after the label; also searched. */
    hint?: string
    /** Words a reader might type that are not in the label. */
    keywords?: string[]
    /** Displayed on the right, e.g. "F". Also searched, so "flip" finds it. */
    shortcut?: string
    /** Present but not runnable right now, with the reason as the hint. */
    disabled?: boolean
    run: () => void
}

function haystack(command: Command): string {
    return [command.label, command.hint ?? '', command.shortcut ?? '', ...(command.keywords ?? [])]
        .join(' ')
        .toLowerCase()
}

export function commandMatches(command: Command, terms: string[]): boolean {
    if (terms.length === 0) return true
    const text = haystack(command)
    return terms.every(term => text.includes(term))
}

/**
 * Ranked, not merely filtered. A reader typing "li" wants Library above
 * "Toggle live analysis", and the difference is whether the label *starts* with
 * what they typed.
 */
export function rankCommands(commands: Command[], query: string, recentIds: string[] = []): Command[] {
    const terms = toSearchTerms(query)
    const matched = commands.filter(command => commandMatches(command, terms))

    if (terms.length === 0) {
        const recent = recentIds
            .map(id => matched.find(command => command.id === id))
            .filter((command): command is Command => Boolean(command))
        const rest = matched.filter(command => !recent.includes(command))
        return [...recent, ...rest]
    }

    const needle = terms.join(' ')
    const score = (command: Command): number => {
        const label = command.label.toLowerCase()
        if (label.startsWith(needle)) return 0
        if (label.includes(needle)) return 1
        if (terms.every(term => label.includes(term))) return 2
        return 3
    }

    // A stable sort keeps the caller's order inside each band, which is the
    // order the commands are declared in — grouped by area, not alphabetical.
    return matched
        .map((command, index) => ({ command, index, score: score(command) }))
        .sort((left, right) => left.score - right.score || left.index - right.index)
        .map(entry => entry.command)
}

export function readRecentCommandIds(): string[] {
    const stored = readStorage(RECENT_COMMANDS_STORAGE_KEY)
    if (!stored) return []
    try {
        const parsed = JSON.parse(stored)
        if (!Array.isArray(parsed)) return []
        return parsed.filter((id): id is string => typeof id === 'string').slice(0, MAX_RECENT_COMMANDS)
    } catch {
        return []
    }
}

/** Most recent first, no duplicates, capped. */
export function rememberCommandId(id: string, current: string[] = readRecentCommandIds()): string[] {
    const next = [id, ...current.filter(existing => existing !== id)].slice(0, MAX_RECENT_COMMANDS)
    writeStorage(RECENT_COMMANDS_STORAGE_KEY, JSON.stringify(next))
    return next
}
