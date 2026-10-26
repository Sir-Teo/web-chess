/** Keep a UTF-16 storage limit without cutting an emoji's surrogate pair in half. */
export function truncateUtf16(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength).replace(/[\uD800-\uDBFF]$/, '')
}
