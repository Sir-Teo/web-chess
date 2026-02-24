export type AiSpeed = 'slow' | 'normal' | 'fast' | 'step'

export const AI_SPEED_MS: Record<AiSpeed, number> = {
    slow: 1200,
    normal: 600,
    fast: 150,
    step: 0,   // 0 = manual advance
}
