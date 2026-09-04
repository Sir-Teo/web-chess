/**
 * Which colour to play against the engine, including "whichever".
 *
 * The dialog offered White or Black and nothing else, so the default was White
 * every game — and a player who only ever has the first move never practises
 * the half of chess that starts a tempo down. Every other board offers the
 * third option; this one did not.
 *
 * Kept out of the dialog because the resolution is the only part with a
 * decision in it, and a function that reaches for `Math.random()` internally is
 * one no test can pin. The roll is a parameter with a default, so the tests
 * choose it and the caller never has to.
 */

export type PlayedSide = 'white' | 'black'
export type SideChoice = PlayedSide | 'random'

export const SIDE_CHOICES: { id: SideChoice; label: string }[] = [
  { id: 'white', label: 'White' },
  { id: 'black', label: 'Black' },
  { id: 'random', label: 'Random' },
]

export function isSideChoice(value: unknown): value is SideChoice {
  return value === 'white' || value === 'black' || value === 'random'
}

/**
 * The colour a choice actually plays.
 *
 * `roll` is a number in [0, 1) — `Math.random()`'s range — and the halves are
 * taken as [0, 0.5) for White and [0.5, 1) for Black, which is the convention
 * that keeps `Math.random()` fair without a rounding step to argue about.
 */
export function resolveSideChoice(choice: SideChoice, roll: number = Math.random()): PlayedSide {
  if (choice !== 'random') return choice
  return Number.isFinite(roll) && roll < 0.5 ? 'white' : 'black'
}
