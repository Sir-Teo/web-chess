import { createReviewBackup, MAX_REVIEW_BACKUP_BYTES, parseReviewBackup } from './reviewBackup'
import { importSavedReviews, snapshotSavedReviews } from './savedReviewStorage'

type Request = { action: 'export' } | { action: 'import'; file: File }

self.onmessage = async (event: MessageEvent<Request>) => {
  try {
    let result
    if (event.data.action === 'export') result = createReviewBackup(await snapshotSavedReviews())
    else if (event.data.action === 'import') {
      if (event.data.file.size > MAX_REVIEW_BACKUP_BYTES) throw new Error('This file exceeds the review-backup size limit.')
      let text
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(await event.data.file.arrayBuffer()) }
      catch { throw new Error('The backup could not be read as UTF-8 JSON. Nothing was imported.') }
      const reviews = parseReviewBackup(text)
      result = await importSavedReviews(reviews)
    } else throw new Error('Unknown review backup operation.')
    self.postMessage({ ok: true, result })
  } catch (error) {
    const message = error instanceof Error && error.name === 'Error' ? error.message
      : 'The browser could not finish the review backup operation. Check saved reviews and try again.'
    self.postMessage({ ok: false, message })
  }
}
