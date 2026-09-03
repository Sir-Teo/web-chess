/**
 * The words a review puts on a move, and on the confidence behind it.
 *
 * Shared because three places render them: the move list, the critical moments
 * and the pill above the board. Two of those are components of their own now,
 * so the table cannot live inside either.
 */
import type { ReviewLabel } from './analysis'

export const REVIEW_LABELS: Record<ReviewLabel, string> = {
  book: 'Book',
  best: 'Best',
  excellent: 'Excellent',
  good: 'Good',
  inaccuracy: 'Inaccuracy',
  mistake: 'Mistake',
  blunder: 'Blunder',
  pending: 'Pending',
}

/**
 * How much of a search is behind a row's grade.
 *
 * "Needs eval" is not a confidence, it is the absence of one, and it is worth
 * saying differently from a shallow reading that does exist.
 */
export function reviewConfidenceLabel(
  confidence: 'pending' | 'shallow' | 'standard' | 'deep',
  depth: number | undefined,
): string {
  if (confidence === 'pending') return 'Needs eval'
  if (confidence === 'shallow') return depth ? `Shallow d${depth}` : 'Shallow'
  if (confidence === 'deep') return depth ? `Deep d${depth}` : 'Deep'
  return depth ? `D${depth}` : 'Evaluated'
}
