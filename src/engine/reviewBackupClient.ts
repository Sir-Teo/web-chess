/** A separate, short-lived worker keeps JSON/PGN validation off the UI thread. */
export function exportReviewBackup(): Promise<{ text: string; count: number }> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./reviewBackupWorker.ts', import.meta.url), { type: 'module' })
    const finish = () => { clearTimeout(timer); worker.terminate() }
    const timer = setTimeout(() => {
      finish()
      reject(new Error('The review backup took too long. Your saved copies are still available; try again.'))
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
      reject(new Error('The review backup could not be transferred. Your saved copies are still available.'))
    }
    try { worker.postMessage({ action: 'export' }) }
    catch (error) { finish(); reject(error) }
  })
}
