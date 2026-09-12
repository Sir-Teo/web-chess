import { createReviewBackup } from './reviewBackup'
import { snapshotSavedReviews } from './savedReviewStorage'

type Request = { action: 'export' }

self.onmessage = async (event: MessageEvent<Request>) => {
  try {
    if (event.data.action !== 'export') throw new Error('Unknown review backup operation.')
    const result = createReviewBackup(await snapshotSavedReviews())
    self.postMessage({ ok: true, result })
  } catch (error) {
    const message = error instanceof Error && error.name === 'Error' ? error.message
      : 'The browser could not read saved reviews for the backup. Your saved copies are still available.'
    self.postMessage({ ok: false, message })
  }
}
