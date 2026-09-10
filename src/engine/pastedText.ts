/**
 * What a reader pasted, when it is not what the box asked for.
 *
 * Both import boxes answered a wrong paste by describing the thing the reader
 * did not paste -- the PGN box replied "Check the move text, headers, and move
 * numbers" to a position, and the FEN box "Check piece placement, side to
 * move, castling rights, and counters" to a game. Each sent them hunting for a
 * fault in the one thing they got right.
 *
 * These say which of the things it is instead. They are deliberately shallow:
 * telling a FEN from a game from a link needs no parser, and a broken FEN is
 * still the FEN the reader meant. Validity is the other validator's job.
 *
 * Kept apart from `fen.ts` and `pgn.ts` because both of those need all of it,
 * and `pgn.ts` already imports `fen.ts`.
 */

/**
 * Whether what was pasted is a position rather than a game.
 *
 * A FEN in the PGN box is the commonest wrong paste there is -- a position is
 * the thing chess sites hand you to copy -- and the parser's answer to it was
 * "Failed to parse PGN. Check the move text, headers, and move numbers", which
 * describes a game the reader did not paste and sends them looking for a fault
 * in the one thing they got right. The dialog they are standing in has a FEN
 * tab two rows above the box.
 *
 * Shape, not validity: a FEN with nine ranks or a bad castling field is still
 * a FEN the reader meant, and "that is a FEN" is the useful half of the answer
 * either way. One line, a board of eight ranks in the pieces' own letters, and
 * a side to move -- which is the least a thing has to look like before calling
 * it a FEN is more helpful than calling it a broken game.
 */
export function looksLikeFen(text: string): boolean {
    const trimmed = text.trim()
    if (!trimmed || /[\r\n]/.test(trimmed)) return false
    const fields = trimmed.split(/\s+/)
    if (fields.length < 2 || fields.length > 6) return false
    const [placement, sideToMove] = fields
    if (sideToMove !== 'w' && sideToMove !== 'b') return false
    const ranks = placement.split('/')
    if (ranks.length !== 8) return false
    return ranks.every(rank => /^[prnbqkPRNBQK1-8]+$/.test(rank))
}

/**
 * Whether what was pasted is a link to a game rather than the game.
 *
 * The commonest paste of all after the game itself: a Lichess or chess.com
 * share link is one click, and the moves are several. Neither box can do
 * anything with a URL, and both used to blame the reader's move numbers for
 * it.
 *
 * Any single-line http(s) URL counts. Narrowing it to the two hosts would be
 * worse: a link to any other board is still a link and still not a game, and
 * the answer -- open it and copy the moves -- is the same one.
 */
export function looksLikeGameUrl(text: string): boolean {
    const trimmed = text.trim()
    if (!trimmed || /\s/.test(trimmed)) return false
    if (!/^https?:\/\//i.test(trimmed)) return false
    try {
        return Boolean(new URL(trimmed).hostname)
    } catch {
        return false
    }
}
