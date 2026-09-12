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

export function parseReviewBackup(text: string): SavedReview[] {
  if (text.length > MAX_REVIEW_BACKUP_BYTES || new TextEncoder().encode(text).length > MAX_REVIEW_BACKUP_BYTES) {
    throw new Error('This file exceeds the review-backup size limit. A backup supports 50 reviews of up to 512 KB each.')
  }
  let value: unknown
  try { value = JSON.parse(text.replace(/^\uFEFF/, '')) }
  catch { throw new Error('Choose a review-backup JSON file exported by Web Chess.') }
  if (typeof value !== 'object' || value === null || Array.isArray(value) || !('format' in value)
    || value.format !== REVIEW_BACKUP_FORMAT) throw new Error('This is not a Web Chess review backup. Game-library backups and PGNs use their own import controls.')
  const backup = value as Record<string, unknown>
  if (backup.version !== 1) throw new Error('This review backup uses an unsupported version.')
  if (!Number.isSafeInteger(backup.exportedAt) || (backup.exportedAt as number) < 0 || (backup.exportedAt as number) > 8.64e15
    || !Array.isArray(backup.reviews)) throw new Error('The review backup is incomplete or damaged.')
  // Validate the entire archive before a write transaction can begin.
  return validatedReviews(backup.reviews)
}

/** Both inputs have passed readSavedReview, which normalizes property order. */
function contentKey(review: SavedReview): string {
  return JSON.stringify({ ...review, id: undefined, evaluations: [...review.evaluations].sort(([a], [b]) => a.localeCompare(b)) })
}

export type ReviewImportPlan = { added: SavedReview[]; skipped: number; reassigned: number }
export type ReviewImportResult = { imported: number; skipped: number; reassigned: number; firstId?: string }

/** Called in the worker's readwrite transaction, using its current store contents. */
export function planReviewImport(existing: unknown[], incoming: SavedReview[], newId: () => string = () => crypto.randomUUID()): ReviewImportPlan {
  const contents = new Set<string>()
  const usedIds = new Set<unknown>()
  for (const value of existing) {
    if (value && typeof value === 'object' && 'id' in value) usedIds.add(value.id)
    const saved = readSavedReview(value)
    // An unreadable stored record still occupies a slot and must not be
    // overwritten or cause a valid incoming record to be silently skipped.
    if (saved) contents.add(contentKey(saved))
  }
  const additions: SavedReview[] = []
  let skipped = 0
  for (const saved of incoming) {
    const key = contentKey(saved)
    if (contents.has(key)) { skipped++; continue }
    contents.add(key)
    additions.push(saved)
  }
  const available = Math.max(0, MAX_SAVED_REVIEWS - existing.length)
  if (additions.length > available) throw new Error(`This backup needs ${additions.length} free saved-review slots, but only ${available} remain. Nothing was imported.`)
  // Reserve all incoming IDs as well: reassigning one collision must not
  // accidentally take an otherwise unused ID from a later incoming run.
  const reservedIds = new Set([...usedIds, ...incoming.map(saved => saved.id)])
  let reassigned = 0
  const added = additions.map(saved => {
    let id = saved.id
    if (usedIds.has(id)) {
      let attempts = 0
      do {
        id = newId()
        if (++attempts > 8) throw new Error('A unique saved-review identifier could not be created. Nothing was imported.')
      } while (reservedIds.has(id) || !/^[\w-]{1,100}$/.test(id))
      reservedIds.add(id)
      reassigned++
    }
    usedIds.add(id)
    return { ...saved, id }
  })
  return { added, skipped, reassigned }
}
