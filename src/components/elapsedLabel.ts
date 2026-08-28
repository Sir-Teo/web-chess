/** "moments ago", "3 minutes ago" — coarse on purpose, since it is only used
 *  to tell a reader roughly how old an auto-saved game is. */
export function describeElapsed(savedAt: number, now = Date.now()): string {
  const elapsedMs = now - savedAt
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return 'recently'
  const minutes = Math.floor(elapsedMs / 60_000)
  if (minutes < 1) return 'moments ago'
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}
