import { useEffect, useMemo, useState } from 'react'

export type OpeningInfo = {
    eco: string
    name: string
}

let openingMapPromise: Promise<Record<string, OpeningInfo>> | null = null

function loadOpeningMap(): Promise<Record<string, OpeningInfo>> {
    openingMapPromise ??= import('../assets/eco.json')
        .then(module => module.default as Record<string, OpeningInfo>)
        .catch(error => {
            openingMapPromise = null
            throw error
        })
    return openingMapPromise
}

/** The table's key: a FEN without its move counters, which the table omits. */
function openingKey(fen: string): string {
    return fen.split(' ').slice(0, 4).join(' ')
}

/**
 * The opening table, once it has loaded, or null before that.
 *
 * Loaded on demand rather than imported: the table is the largest thing the
 * app ships after the engine, and nothing needs it until there is a position
 * to name.
 */
function useOpeningMap(enabled: boolean): Record<string, OpeningInfo> | null {
    const [map, setMap] = useState<Record<string, OpeningInfo> | null>(null)

    useEffect(() => {
        if (!enabled) return

        let cancelled = false
        void loadOpeningMap()
            .then(loadedMap => {
                if (!cancelled) setMap(loadedMap)
            })
            .catch(() => {
                if (!cancelled) setMap({})
            })
        return () => {
            cancelled = true
        }
    }, [enabled])

    return map
}

export function useOpening(fens: string[], enabled = true): OpeningInfo | undefined {
    const map = useOpeningMap(enabled)

    return useMemo(() => {
        if (!enabled) return undefined
        if (!map) return undefined
        // Search backwards from the most recent position so we get the deepest matching opening
        for (let i = fens.length - 1; i >= 0; i--) {
            const fen = fens[i]
            if (!fen) continue
            const key = openingKey(fen)
            if (map[key]) {
                return map[key]
            }
        }
        return undefined
    }, [enabled, fens, map])
}

/**
 * Whether a position is in the opening table, for the review's Book label.
 *
 * Undefined until the table has loaded, so a caller can tell "not in the
 * book" from "the book is not here yet" and grade nothing as Book in the
 * meantime, rather than everything as not. The predicate keeps its identity
 * once the table is in, so a memo keyed on it settles.
 */
export function useOpeningBook(enabled = true): ((fen: string) => boolean) | undefined {
    const map = useOpeningMap(enabled)

    return useMemo(() => {
        if (!enabled || !map) return undefined
        return (fen: string) => Boolean(map[openingKey(fen)])
    }, [enabled, map])
}
