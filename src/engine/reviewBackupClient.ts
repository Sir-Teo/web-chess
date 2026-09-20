import { MAX_REVIEW_BACKUP_BYTES, type ReviewImportResult } from './reviewBackup'

type BackupRequest = { action: 'export' } | { action: 'import'; file: File }
type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }

const TASK_TIMEOUT_MS = 120_000

/**
 * One worker for the session, not one per operation.
 *
 * This used to build a module worker per task and `terminate()` it on the way
 * out, which reads as tidy and is the reason review backups were broken in
 * Safari. **Measured** in WebKit against the built app: the first import
 * succeeds, the second fails before the worker ever runs -- "Cannot load
 * .../reviewBackupWorker-*.js due to access control checks" on the console and
 * "The review backup worker could not run" on screen -- and a third succeeds
 * again. So it is a race between a terminate and the next construction of the
 * same module URL, not a header: serving the script with
 * `Cross-Origin-Resource-Policy: same-origin` under the app's existing
 * `require-corp` changed nothing, and the second attempt still failed while
 * the third still passed.
 *
 * It only reached a *first* visit, which is the reason the suite could see it
 * at all: the COOP/COEP service worker re-serves the script once it is
 * controlling the page. That makes it a bug for exactly the reader who has
 * never been here before and imports two files in a row.
 *
 * Keeping one worker removes the second construction, and with it a module
 * fetch, parse and compile per backup operation. Requests carry an id so a
 * shared worker can still answer them one at a time without the replies
 * crossing.
 */
let worker: Worker | null = null
let nextTaskId = 0
const pending = new Map<number, Pending>()

function discardWorker(message: string): void {
  const failed = worker
  worker = null
  const outstanding = [...pending.values()]
  pending.clear()
  for (const task of outstanding) {
    clearTimeout(task.timer)
    task.reject(new Error(message))
  }
  failed?.terminate()
}

function ensureWorker(): Worker {
  if (worker) return worker

  const created = new Worker(new URL('./reviewBackupWorker.ts', import.meta.url), { type: 'module' })
  created.onmessage = event => {
    const { id, ok, result, message } = event.data ?? {}
    const task = pending.get(id)
    if (!task) return
    pending.delete(id)
    clearTimeout(task.timer)
    if (ok) task.resolve(result)
    else task.reject(new Error(String(message)))
  }
  created.onerror = event => {
    event.preventDefault()
    discardWorker('The review backup worker could not run. Reload the app and try again.')
  }
  created.onmessageerror = () => {
    discardWorker('The review backup result could not be transferred. Check saved reviews and try again.')
  }
  worker = created
  return created
}

function runBackupTask<T>(request: BackupRequest): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = nextTaskId += 1
    let target: Worker
    try { target = ensureWorker() }
    catch { reject(new Error('The review backup worker could not run. Reload the app and try again.')); return }

    const timer = setTimeout(() => {
      // A task that never answered leaves a worker of unknown state behind;
      // the next operation is better served by a fresh one.
      discardWorker('The review backup operation took too long. Check saved reviews and try again.')
    }, TASK_TIMEOUT_MS)

    pending.set(id, { resolve: resolve as (value: unknown) => void, reject, timer })
    try { target.postMessage({ ...request, id }) }
    catch (error) {
      pending.delete(id)
      clearTimeout(timer)
      reject(error instanceof Error ? error : new Error(String(error)))
    }
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
