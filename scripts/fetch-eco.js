import fs from 'fs'
import { Chess } from 'chess.js'

const files = ['a', 'b', 'c', 'd', 'e']

async function run() {
    const map = {}
    let count = 0

    for (const file of files) {
        const url = `https://raw.githubusercontent.com/lichess-org/chess-openings/master/${file}.tsv`
        console.log(`Fetching ${url}...`)
        const res = await fetch(url)
        const text = await res.text()

        const lines = text.split('\n').filter(Boolean).slice(1) // skip header
        for (const line of lines) {
            const [eco, name, pgn] = line.split('\t')
            if (!pgn) continue

            try {
                const chess = new Chess()
                chess.loadPgn(pgn.trim())

                // Use first 4 parts of FEN as key (pieces, color, castling, ep)
                const fenParts = chess.fen().split(' ')
                const key = fenParts.slice(0, 4).join(' ')

                // We can just keep the first name we find for a position, 
                // or the last. Usually the tsv has them in order, shorter first, longer later.
                // Let's just overwrite, but maybe we want the shortest?
                // Let's keep the one that we see first if it's not set. 
                if (!map[key]) {
                    map[key] = { eco, name }
                    count++
                }
            } catch (err) {
                console.warn(`Failed to parse pgn: ${pgn}`)
            }
        }
    }

    fs.mkdirSync('src/assets', { recursive: true })
    fs.writeFileSync('src/assets/eco.json', JSON.stringify(map))
    console.log(`Successfully generated src/assets/eco.json with ${count} openings.`)
}

run()
