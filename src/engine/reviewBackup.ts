import { MAX_SAVED_REVIEWS, MAX_SAVED_REVIEW_BYTES, readSavedReview, type SavedReview } from './savedReviews'

export const REVIEW_BACKUP_FORMAT = 'web-chess-review-backup'
// Every permitted stored record, plus JSON envelope/separators.
export const MAX_REVIEW_BACKUP_BYTES = MAX_SAVED_REVIEWS * MAX_SAVED_REVIEW_BYTES + 4096

export type ReviewBackup = {
  format: typeof REVIEW_BACKUP_FORMAT
  version: 1
  exportedAt: number
  reviews: SavedReview[]
}

/** Runs in the backup worker: PGN replay must not block board input. */
function validatedReviews(values: unknown[]): SavedReview[] {
  if (values.length > MAX_SAVED_REVIEWS) throw new Error(`A review backup supports up to ${MAX_SAVED_REVIEWS} runs.`)
  return values.map((value, index) => {
    const review = readSavedReview(value)
    if (!review) throw new Error(`Review ${index + 1} is unreadable. The backup operation was stopped.`)
    return review
  })
}

export function createReviewBackup(values: unknown[], exportedAt = Date.now()): { text: string; count: number } {
  if (!Number.isSafeInteger(exportedAt) || exportedAt < 0 || exportedAt > 8.64e15) throw new Error('The backup date is invalid.')
  const backup: ReviewBackup = { format: REVIEW_BACKUP_FORMAT, version: 1, exportedAt, reviews: validatedReviews(values) }
  const text = JSON.stringify(backup)
  if (new TextEncoder().encode(text).length > MAX_REVIEW_BACKUP_BYTES) throw new Error('This review backup is too large.')
  return { text, count: backup.reviews.length }
}
