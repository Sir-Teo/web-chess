/**
 * Which sound a move calls for.
 *
 * Kept apart from anything that makes noise so the decision can be tested: the
 * rule is a priority order, and the order is the behaviour. A capture that
 * gives check is a check — the more urgent fact wins, which is how every board
 * a player has used behaves, and it is the reason this is not a set of
 * independent booleans.
 */

export type MoveSound =
  /** The game ended on this move. Mate, stalemate, or any other draw. */
  | 'game-end'
  | 'check'
  | 'promote'
  | 'castle'
  | 'capture'
  | 'move'

export type MoveSoundInput = {
  /** chess.js move flags: `c` capture, `e` en passant, `k`/`q` castling, `p` promotion. */
  flags: string
  /** SAN, which is where chess.js records check and mate. */
  san: string
  /** Whether the position the move created is over, by any rule. */
  isGameOver: boolean
}

export function moveSoundFor({ flags, san, isGameOver }: MoveSoundInput): MoveSound {
  if (isGameOver) return 'game-end'
  if (san.includes('+')) return 'check'
  if (flags.includes('p')) return 'promote'
  if (flags.includes('k') || flags.includes('q')) return 'castle'
  // `e` is en passant, which is a capture the flags spell differently.
  if (flags.includes('c') || flags.includes('e')) return 'capture'
  return 'move'
}

export type SoundShape = {
  /** Body of the sound, in Hz. Lower reads as heavier. */
  frequency: number
  /** Seconds. Everything here is a click or a short tone. */
  duration: number
  /** Relative loudness, 0-1, before the master volume. */
  gain: number
  /** A second hit this many seconds after the first, for the two-part sounds. */
  echoDelay?: number
  /** The second hit's frequency, when there is one. */
  echoFrequency?: number
  /** Noise gives a wooden click its attack; a pure tone reads as a beep. */
  noise: boolean
}

/**
 * The synthesis parameters for each sound.
 *
 * Deliberately no audio files. A set of samples is 100-300KB of binary added to
 * a repo whose whole point is that it ships an engine and an opening book and
 * still loads in under a second, and it needs a licence trail for sounds
 * nobody wrote here. Six short envelopes over an oscillator and a noise burst
 * cost nothing and are adjustable in one table.
 */
export const SOUND_SHAPES: Record<MoveSound, SoundShape> = {
  // A piece set down: mostly attack, very little tone.
  move: { frequency: 190, duration: 0.075, gain: 0.5, noise: true },
  // Heavier, and long enough to be told apart from a plain move mid-blitz.
  capture: { frequency: 130, duration: 0.115, gain: 0.72, noise: true },
  // Two pieces, so two hits.
  castle: { frequency: 165, duration: 0.07, gain: 0.55, echoDelay: 0.085, echoFrequency: 150, noise: true },
  // A tone rather than a knock: check is information, not an impact.
  check: { frequency: 660, duration: 0.13, gain: 0.42, echoDelay: 0.1, echoFrequency: 880, noise: false },
  promote: { frequency: 520, duration: 0.16, gain: 0.45, echoDelay: 0.09, echoFrequency: 1040, noise: false },
  // Falling, and the longest thing here, so it reads as an ending.
  'game-end': { frequency: 440, duration: 0.34, gain: 0.5, echoDelay: 0.16, echoFrequency: 294, noise: false },
}
