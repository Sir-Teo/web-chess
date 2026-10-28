import {
  ARCHIVE_SOURCES,
  DEFAULT_ARCHIVE_GAMES,
  MAX_ARCHIVE_GAMES,
  clampArchiveGameCount,
  normalizeArchiveUsername,
  type ArchiveSource,
} from './gameArchives'
import { getLocalStorage, readStorage, type KeyValueStorage } from './storage'

export const ARCHIVE_PREFERENCES_STORAGE_KEY = 'webchess:archive-preferences:v1'

export type ArchivePreferences = {
  source: ArchiveSource
  usernames: Partial<Record<ArchiveSource, string>>
  count: number
}

/** Restore choices, never a request: fetching remains an explicit action. */
export function readArchivePreferences(storage: KeyValueStorage | null = getLocalStorage()): ArchivePreferences {
  const defaults: ArchivePreferences = { source: 'lichess', usernames: {}, count: DEFAULT_ARCHIVE_GAMES }
  const raw = readStorage(ARCHIVE_PREFERENCES_STORAGE_KEY, storage)
  if (!raw || raw.length > 1024) return defaults
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return defaults
    const saved = parsed as Record<string, unknown>
    const source = ARCHIVE_SOURCES.find(source => source.id === saved.source)?.id ?? defaults.source
    const count = typeof saved.count === 'number' && Number.isInteger(saved.count)
      && saved.count >= 1 && saved.count <= MAX_ARCHIVE_GAMES ? saved.count : DEFAULT_ARCHIVE_GAMES
    const usernames: ArchivePreferences['usernames'] = {}
    if (saved.usernames && typeof saved.usernames === 'object' && !Array.isArray(saved.usernames)) {
      const names = saved.usernames as Record<string, unknown>
      for (const { id } of ARCHIVE_SOURCES) {
        const rawName = names[id]
        const name = typeof rawName === 'string' ? normalizeArchiveUsername(rawName) : null
        if (name) usernames[id] = name
      }
    }
    return { source, count, usernames }
  } catch {
    return defaults
  }
}

/** A successful fetch updates that provider without replacing the other handle. */
export function archivePreferencesAfterFetch(previous: ArchivePreferences, source: ArchiveSource, rawUsername: string, count: number): ArchivePreferences {
  const username = normalizeArchiveUsername(rawUsername)
  if (!username) return previous
  return { source, count: clampArchiveGameCount(count), usernames: { ...previous.usernames, [source]: username } }
}
