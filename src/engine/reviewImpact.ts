/**
 * The per-move impact text in the review list — "Lost 1.20", "No loss".
 *
 * Pure formatting, so it lives here with a test rather than in App.tsx, per the
 * invariant in docs/architecture.md. It was edited in place there while adding
 * the centipawn bound, which is exactly when an untested string is easiest to
 * get wrong.
 */

import { MAX_REPORTED_CENTIPAWN_LOSS, reportedCentipawnLoss } from './analysis'

/** Below this, in either direction, the move is not worth calling a change. */
const NEUTRAL_BAND_CP = 10

export function reviewImpactLabel(deltaCp: number | undefined): string {
  if (typeof deltaCp !== 'number' || !Number.isFinite(deltaCp)) return 'Queued'
  if (deltaCp >= NEUTRAL_BAND_CP) {
    // Bounded the same way the loss is: a mate sentinel would otherwise read as
    // a gain of ninety pawns.
    const gain = Math.min(MAX_REPORTED_CENTIPAWN_LOSS, deltaCp)
    return `Gain +${(gain / 100).toFixed(2)}${gain < deltaCp ? '+' : ''}`
  }
  if (deltaCp >= -NEUTRAL_BAND_CP) return 'No loss'
  const loss = reportedCentipawnLoss(deltaCp)
  // The trailing "+" says the real figure is off this scale, which is what a
  // forced mate is — rather than quietly showing a bound as though measured.
  return `Lost ${(loss / 100).toFixed(2)}${loss < -deltaCp ? '+' : ''}`
}
