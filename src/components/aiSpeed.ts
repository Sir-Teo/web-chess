export type AiSpeed = 'slow' | 'normal' | 'fast' | 'step'

export const AI_SPEED_MS: Record<AiSpeed, number> = {
    slow: 1200,
    normal: 600,
    fast: 150,
    step: 0,   // 0 = manual advance
}

/**
 * How long autoplay rests on each position, by the same speed pills. Slower
 * than the engine throttle above: those delays pad a search that takes its
 * own time, while this one is the whole time a reader gets to look at a move
 * before the next lands. Step has no autoplay -- stepping is what the arrow
 * keys do -- so it takes the middle setting.
 */
export const AUTOPLAY_MS: Record<AiSpeed, number> = {
    slow: 2500,
    normal: 1200,
    fast: 500,
    step: 1200,
}
