import type { GameNode } from '../hooks/useGameTree'
import type { EvalSnapshot } from './analysis'

export function exportAnnotatedPgn(
    mainLine: GameNode[],
    evaluationsByFen: Map<string, EvalSnapshot>,
    header: Record<string, string> = {}
): string {
    let pgn = ''

    // Set headers (Event, Site, Date, Round, White, Black, Result)
    const defaultHeaders: Record<string, string> = {
        Event: 'Web Chess Game',
        Site: 'Localhost',
        Date: new Date().toISOString().split('T')[0]!.replace(/-/g, '.'),
        Round: '1',
        White: 'Player 1',
        Black: 'Player 2',
        Result: '*',
        ...header
    }

    for (const [key, value] of Object.entries(defaultHeaders)) {
        pgn += `[${key} "${value}"]\n`
    }
    pgn += '\n'

    let plyCount = 0
    let currentLine = ''

    // mainLine[0] is root. mainLine[1] is the first move.
    for (let i = 1; i < mainLine.length; i++) {
        const node = mainLine[i]
        if (!node || !node.move) continue

        // Formatting move number: "1." or "1... " 
        if (plyCount % 2 === 0) {
            const moveNum = Math.floor(plyCount / 2) + 1
            currentLine += `${moveNum}. ${node.san} `
        } else {
            currentLine += `${node.san} `
        }

        // Lookup evaluation
        const evaluation = evaluationsByFen.get(node.fen)
        if (evaluation) {
            // Normalize to White's perspective since Stockfish outputs from side-to-move's perspective
            const turn = node.fen.split(' ')[1]
            const cpPov = turn === 'w' ? evaluation.cp : -evaluation.cp

            let evalStr = ''
            if (Math.abs(cpPov) >= 10000) {
                evalStr = cpPov > 0 ? '#1' : '#-1'
            } else {
                const cpVal = cpPov / 100
                evalStr = cpVal.toFixed(2)
            }

            currentLine += `{ [%eval ${evalStr}] } `
        }

        // Wrap to ~80 chars
        if (currentLine.length > 70) {
            pgn += currentLine.trim() + '\n'
            currentLine = ''
        }

        plyCount++
    }

    if (currentLine.trim()) {
        pgn += currentLine.trim()
    }

    // Append result at the very end
    pgn += ` ${defaultHeaders.Result}`

    return pgn.trim() + '\n'
}
