/**
 * Turning a game's per-move accuracies into one number for the scoreboard.
 *
 * All three sibling apps take the plain mean of per-move accuracy. Lichess,
 * whose per-move curve two of them already use, says in the same document that
 * the mean is the wrong aggregate and does not use it: a single blunder in an
 * otherwise even game is diluted by fifty quiet moves, and fifty quiet moves in
 * a decided game are scored as though the player had to find them.
 *
 * web-katrain reached the same conclusion independently and from a different
 * direction — it weights each move by how hard the position was, using the
 * policy priors, before mapping the weighted loss to a percentage. Two designs
 * arriving at "weight the moves" is the argument for doing it here.
 *
 * The method below is Lichess's published shape:
 *
 *  - Weight each move by how volatile the game was around it, measured as the
 *    standard deviation of winning chances over a window of nearby positions.
 *    A move played while the evaluation is swinging counts for more than one
 *    played in a dead-drawn rook ending.
 *  - Average the weighted mean with the harmonic mean. The harmonic mean is
 *    what stops a single catastrophe being averaged away: it is dragged down
 *    hard by any small value, where the arithmetic mean barely notices one.
 *
 * The constants are Lichess's; the standard-deviation convention (population,
 * not sample) is ours, and nothing here has been checked against their output
 * move for move. What is claimed is the shape, not byte parity.
 *
 * There is no board in this file, and that is deliberate: by the measure in
 * web-chess's cross-app second pass it is the most portable thing either UCI
 * app has to share, and the same code should end up in web-xiangqi.
 */

/** Lichess clamps the window to this range; n/10 for a normal game. */
export const MIN_WINDOW = 2
export const MAX_WINDOW = 8

/** And clamps each weight, so a flat game still counts and a wild one is bounded. */
export const MIN_WEIGHT = 0.5
export const MAX_WEIGHT = 12

function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value)
}

export function standardDeviation(values: number[]): number {
    if (values.length === 0) return 0
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length
    const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length
    return Math.sqrt(variance)
}

/**
 * One weight per move, from the winning-chance series of the positions around
 * it. `winPercents` is the series *including* the starting position, so a game
 * of n moves has n + 1 entries and this returns n weights.
 *
 * The first few moves have no window behind them, so they borrow the opening
 * window rather than being measured against a shorter one — a two-move window
 * at the start would read as far steadier than the game really was.
 */
export function volatilityWeights(winPercents: number[]): number[] {
    const moves = Math.max(0, winPercents.length - 1)
    if (moves === 0) return []

    const windowSize = Math.min(MAX_WINDOW, Math.max(MIN_WINDOW, Math.floor(winPercents.length / 10)))
    const windows: number[][] = []
    const opening = winPercents.slice(0, windowSize)
    for (let i = 0; i < windowSize - 2; i++) windows.push(opening)
    for (let start = 0; start + windowSize <= winPercents.length; start++) {
        windows.push(winPercents.slice(start, start + windowSize))
    }

    const weights = windows
        .slice(0, moves)
        .map(window => Math.min(MAX_WEIGHT, Math.max(MIN_WEIGHT, standardDeviation(window))))

    // A game shorter than one window gets no sliding windows at all; weight
    // those moves evenly rather than dropping them.
    while (weights.length < moves) weights.push(MIN_WEIGHT)
    return weights
}

export function weightedMean(values: number[], weights: number[]): number | null {
    let weighted = 0
    let total = 0
    for (const [index, value] of values.entries()) {
        if (!isFiniteNumber(value)) continue
        const weight = isFiniteNumber(weights[index]) ? weights[index] : MIN_WEIGHT
        weighted += value * weight
        total += weight
    }
    return total > 0 ? weighted / total : null
}

/**
 * Dragged down hard by any one small value, which is the property that makes it
 * worth averaging in. A zero would take the whole thing to zero, so it is
 * floored at the smallest accuracy the per-move curve can return.
 */
export function harmonicMean(values: number[]): number | null {
    let total = 0
    let count = 0
    for (const value of values) {
        if (!isFiniteNumber(value)) continue
        total += 1 / Math.max(value, 0.01)
        count += 1
    }
    return count > 0 ? count / total : null
}

/**
 * The game accuracy for one player: the volatility-weighted mean and the
 * harmonic mean, averaged.
 */
export function aggregateAccuracy(accuracies: number[], weights: number[]): number | null {
    if (accuracies.length === 0) return null
    const weighted = weightedMean(accuracies, weights)
    const harmonic = harmonicMean(accuracies)
    if (weighted === null || harmonic === null) return null
    return Math.max(0, Math.min(100, (weighted + harmonic) / 2))
}
