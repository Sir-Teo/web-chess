import { MAX_SHARED_GAME_CHARS } from './shareGame'
import { hashCarriesShare } from './shareLink'
import { getSessionStorage, readStorage, removeStorage, writeStorage, type KeyValueStorage } from './storage'

export const SHARED_RECOVERY_PAGE_KEY = 'webchess:shared-recovery-page:v1'
const MAX_HASH_CHARS = MAX_SHARED_GAME_CHARS + 64

/** Remember which shared URL produced this tab’s last successful autosave. */
export function recordSharedRecovery(savedAt: number, hash: string, storage: KeyValueStorage | null = getSessionStorage()): void {
  if (hash.length > MAX_HASH_CHARS || !hashCarriesShare(hash)) {
    clearSharedRecovery(storage)
    return
  }
  if (!writeStorage(SHARED_RECOVERY_PAGE_KEY, JSON.stringify({ savedAt, hash }), storage)) {
    // A stale marker must not make a newer, successfully saved edit look foreign.
    clearSharedRecovery(storage)
  }
}

export function clearSharedRecovery(storage: KeyValueStorage | null = getSessionStorage()): void {
  removeStorage(SHARED_RECOVERY_PAGE_KEY, storage)
}

/** A new link takes priority; refresh can recover work done after opening it. */
export function shouldResumeSharedRecovery(
  savedAt: number,
  hash: string,
  navigationType: string,
  storage: KeyValueStorage | null = getSessionStorage(),
): boolean {
  if (navigationType !== 'reload' || !hashCarriesShare(hash)) return false
  const raw = readStorage(SHARED_RECOVERY_PAGE_KEY, storage)
  // Legacy saves and restricted session storage still deserve recovery on
  // refresh. A valid marker can distinguish another tab’s later shared slot.
  if (!raw || raw.length > MAX_HASH_CHARS + 256) return true
  try {
    const value = JSON.parse(raw) as { savedAt?: unknown; hash?: unknown } | null
    if (!value || typeof value.savedAt !== 'number' || !Number.isFinite(value.savedAt)
      || typeof value.hash !== 'string' || value.hash.length > MAX_HASH_CHARS || !hashCarriesShare(value.hash)) return true
    return value.savedAt === savedAt && value.hash === hash
  } catch {
    return true
  }
}
