/** A numeric calendar date in the browser's local timezone. */
export function formatLocalDate(date = new Date(), separator: '-' | '.' = '-'): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return [year, month, day].join(separator)
}
