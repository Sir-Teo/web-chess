export function withBoundedMapEntry<K, V>(
  previous: ReadonlyMap<K, V>,
  key: K,
  value: V,
  limit: number,
): Map<K, V> {
  const cappedLimit = normalizeLimit(limit)
  if (cappedLimit === 0) return new Map()

  const next = new Map(previous)
  next.delete(key)
  next.set(key, value)

  while (next.size > cappedLimit) {
    const oldest = next.keys().next()
    if (oldest.done) break
    next.delete(oldest.value)
  }

  return next
}

export function withBoundedRecordEntry<T>(
  previous: Record<string, T>,
  key: string,
  value: T,
  limit: number,
): Record<string, T> {
  const cappedLimit = normalizeLimit(limit)
  if (cappedLimit === 0) return {}

  const entries = Object.entries(previous).filter(([entryKey]) => entryKey !== key)
  entries.push([key, value])

  return Object.fromEntries(entries.slice(-cappedLimit)) as Record<string, T>
}

export function withoutRecordEntry<T>(previous: Record<string, T>, key: string): Record<string, T> {
  if (!(key in previous)) return previous

  const next = { ...previous }
  delete next[key]
  return next
}

function normalizeLimit(limit: number): number {
  if (!Number.isFinite(limit)) return 0
  return Math.max(0, Math.floor(limit))
}
