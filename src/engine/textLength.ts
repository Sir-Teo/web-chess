/** Keep valid UTF-16 labels within their limit without splitting an emoji. */
export function truncateUtf16(text: string, maxLength: number): string {
  // Unicode mode matches lone surrogates here, preserving complete pairs.
  // Older name truncation could leave one before a duplicate-name suffix.
  const clean = text.replace(/[\uD800-\uDFFF]/gu, '')
  return clean.slice(0, maxLength).replace(/[\uD800-\uDBFF]$/, '')
}
