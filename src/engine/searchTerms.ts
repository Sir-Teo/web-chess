/**
 * Free-text matching for the library filter.
 *
 * Every whitespace-separated term has to appear somewhere in the text, rather
 * than the whole query having to appear as one run of characters. Matching the
 * phrase means a query spanning two fields — a player and an event, say —
 * finds nothing, because those fields never end up adjacent.
 *
 * A search box reads text the app did not write, and the obvious slip is a
 * paste into the wrong field: a PGN into the filter instead of the importer.
 * Every term has to match, so the work is terms x haystack x games — a 380KB
 * paste is 60,000 terms scanned against every saved game, which measured 900ms
 * against a single haystack in web-xiangqi and freezes the tab for a full
 * library. Nothing narrows a search past a handful of terms anyway.
 *
 * Truncating rather than rejecting keeps a real query working and makes a
 * pasted game return nothing, immediately, which is what it should do.
 */
export const MAX_SEARCH_QUERY_LENGTH = 200

export function toSearchTerms(query: string | null | undefined): string[] {
    return String(query ?? '')
        .slice(0, MAX_SEARCH_QUERY_LENGTH)
        .trim()
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean)
}

/**
 * Lowercases the haystack rather than requiring the caller to have done it.
 *
 * This used to assume a pre-lowercased string, which its only caller happened
 * to satisfy — and web-xiangqi's copy of this same module lowercases here. Two
 * functions with one name and different preconditions is how the next caller
 * gets case-sensitive matching with nothing to tell them why. Lowercasing an
 * already-lowercase string costs nothing at these sizes and is idempotent.
 */
export function matchesSearchTerms(haystack: string, terms: string[]): boolean {
    if (terms.length === 0) return true
    const text = haystack.toLowerCase()
    return terms.every(term => text.includes(term))
}
