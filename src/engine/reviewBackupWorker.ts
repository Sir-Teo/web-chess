import { createReviewBackup, MAX_REVIEW_BACKUP_BYTES, parseReviewBackup } from './reviewBackup'
import { importSavedReviews, snapshotSavedReviews } from './savedReviewStorage'

type Request = ({ action: 'export' } | { action: 'import'; file: File }) & { id: number }

self.onmessage = async (event: MessageEvent<Request>) => {
  try {
    let result
    if (event.data.action === 'export') result = createReviewBackup(await snapshotSavedReviews())
    else if (event.data.action === 'import') {
      if (event.data.file.size > MAX_REVIEW_BACKUP_BYTES) throw new Error('This file exceeds the review-backup size limit.')
      // Two failures, two sentences. Reading the file and decoding it used to
      // share a `try`, so a file that had been moved, renamed, unplugged or
      // revoked since the reader chose it -- `arrayBuffer()` rejecting with
      // NotReadableError -- was reported as "could not be read as UTF-8
      // JSON", which tells them their backup is corrupt when it is fine.
      // Measured in WebKit, where a file whose backing store is unavailable
      // produced exactly that sentence about a perfectly valid backup.
      let bytes
      try { bytes = await event.data.file.arrayBuffer() }
      catch { throw new Error('That file could not be read. It may have been moved, renamed or removed since you chose it.') }
      let text
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes) }
      catch { throw new Error('The backup could not be read as UTF-8 JSON. Nothing was imported.') }
      const reviews = parseReviewBackup(text)
      result = await importSavedReviews(reviews)
    } else throw new Error('Unknown review backup operation.')
    self.postMessage({ id: event.data.id, ok: true, result })
  } catch (error) {
    const message = error instanceof Error && error.name === 'Error' ? error.message
      : 'The browser could not finish the review backup operation. Check saved reviews and try again.'
    self.postMessage({ id: event.data?.id, ok: false, message })
  }
}
