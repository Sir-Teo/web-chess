import { pgnTagEnd } from './pgnHeaders'

export type PgnResult = '1-0' | '0-1' | '1/2-1/2' | '*'

export function isPgnResult(value: unknown): value is PgnResult {
    return typeof value === 'string' && /^(?:1-0|0-1|1\/2-1\/2|\*)$/.test(value)
}

type PgnTextToken = { kind: 'tag' | 'text'; start: number; end: number }

/** Actual tag/text spans; block comments end at their first closing brace. */
export function* pgnTokensOutsideComments(text: string): Generator<PgnTextToken> {
    const starts = /[;[{]/g
    const lineEnding = /[\r\n]/g
    let cursor = 0
    for (;;) {
        starts.lastIndex = cursor
        const start = starts.exec(text)
        if (!start) {
            if (cursor < text.length) yield { kind: 'text', start: cursor, end: text.length }
            return
        }
        const open = start.index
        if (open > cursor) yield { kind: 'text', start: cursor, end: open }
        if (start[0] === '[') {
            const end = pgnTagEnd(text, open)
            if (end === null) {
                yield { kind: 'text', start: open, end: text.length }
                return
            }
            yield { kind: 'tag', start: open, end }
            cursor = end
        } else if (start[0] === ';') {
            lineEnding.lastIndex = open + 1
            cursor = lineEnding.exec(text)?.index ?? text.length
        } else {
            const close = text.indexOf('}', open + 1)
            cursor = close < 0 ? text.length : close + 1
        }
    }
}

/** A terminal main-line result; quoted headers, comments and variations do not count. */
export function readPgnMainlineResult(text: string): PgnResult | null {
    let depth = 0
    let lastWord: string | undefined
    for (const token of pgnTokensOutsideComments(text)) {
        if (token.kind === 'tag') continue
        for (const word of text.slice(token.start, token.end).matchAll(/[()]|[^\s()]+/g)) {
            if (word[0] === '(') { depth++; continue }
            if (word[0] === ')') { depth = Math.max(0, depth - 1); continue }
            if (depth === 0) lastWord = word[0]
        }
    }
    return isPgnResult(lastWord) ? lastWord : null
}
