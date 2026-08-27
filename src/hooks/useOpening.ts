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

export function useOpening(fens: string[], enabled = true): OpeningInfo | undefined {
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

    return useMemo(() => {
        if (!enabled) return undefined
        if (!map) return undefined
        // Search backwards from the most recent position so we get the deepest matching opening
        for (let i = fens.length - 1; i >= 0; i--) {
            const fen = fens[i]
            if (!fen) continue
            const key = fen.split(' ').slice(0, 4).join(' ')
            if (map[key]) {
                return map[key]
            }
        }
        return undefined
    }, [enabled, fens, map])
}
