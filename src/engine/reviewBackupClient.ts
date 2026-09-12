import { MAX_REVIEW_BACKUP_BYTES, type ReviewImportResult } from './reviewBackup'

/** A separate, short-lived worker keeps JSON/PGN validation off the UI thread. */
function runBackupTask<T>(request: { action: 'export' } | { action: 'import'; file: File }): Promise<T> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./reviewBackupWorker.ts', import.meta.url), { type: 'module' })
    const finish = () => { clearTimeout(timer); worker.terminate() }
    const timer = setTimeout(() => {
      finish()
      reject(new Error('The review backup operation took too long. Check saved reviews and try again.'))
    }, 120_000)
    worker.onmessage = event => {
      finish()
      if (event.data.ok) resolve(event.data.result)
      else reject(new Error(event.data.message))
    }
    worker.onerror = event => {
      event.preventDefault()
      finish()
      reject(new Error('The review backup worker could not run. Reload the app and try again.'))
    }
    worker.onmessageerror = () => {
      finish()
      reject(new Error('The review backup result could not be transferred. Check saved reviews and try again.'))
    }
    try { worker.postMessage(request) }
    catch (error) { finish(); reject(error) }
  })
}

export function exportReviewBackup(): Promise<{ text: string; count: number }> {
  return runBackupTask({ action: 'export' })
}

export function importReviewBackup(file: File): Promise<ReviewImportResult> {
  // Reject oversized selections before cloning/reading them in a worker.
  if (file.size > MAX_REVIEW_BACKUP_BYTES) return Promise.reject(new Error('This file exceeds the review-backup size limit. A backup supports 50 reviews of up to 512 KB each.'))
  return runBackupTask({ action: 'import', file })
}
