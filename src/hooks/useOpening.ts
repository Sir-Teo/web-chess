import { useMemo } from 'react'
import ecoData from '../assets/eco.json'

export type OpeningInfo = {
    eco: string
    name: string
}

const map = ecoData as Record<string, OpeningInfo>

export function useOpening(fens: string[]): OpeningInfo | undefined {
    return useMemo(() => {
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
    }, [fens])
}
