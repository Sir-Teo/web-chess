export type ReviewPracticeAttempt = {
  from: string
  to: string
  promotion?: string
}

/**
 * Compare a board move with the engine's UCI answer without involving the
 * mutable chess instance. Promotions are part of the answer: e7e8 and e7e8q
 * are not the same move, and engine output is normalized defensively because
 * Engine Lab commands and imported annotations need not share casing.
 */
export function isReviewPracticeAnswer(
  expectedUci: string,
  attempt: ReviewPracticeAttempt,
): boolean {
  const attemptedUci = `${attempt.from}${attempt.to}${attempt.promotion ?? ''}`.toLowerCase()
  return expectedUci.trim().toLowerCase() === attemptedUci
}

