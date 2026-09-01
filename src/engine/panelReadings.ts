/**
 * Numbers as the analysis panels write them.
 *
 * They lived at the top of `App.tsx`, which the architecture note names as the
 * trap: a pure helper edited in place changes what every panel says with
 * nothing asserting any of it. `reviewImpactLabel` was modified exactly that
 * way once. These are the readings a panel shows -- an accuracy, a node count,
 * a share of a book -- and nothing here knows what a panel is.
 */

/** A share, in percent, and zero rather than NaN when there is no total. */
export function percentage(part: number, total: number): number {
  if (!total) return 0
  return (part / total) * 100
}

/** One decimal, or an em-dash pair for "not scored yet". */
export function formatAccuracyValue(value: number | null): string {
  return typeof value === 'number' ? value.toFixed(1) : '--'
}

export function formatCentipawnLossValue(value: number | null): string {
  return typeof value === 'number' ? value.toFixed(0) : '--'
}

/** Lichess reports its cloud node counts in thousands. */
export function formatCloudNodes(knodes: number): string {
  if (knodes >= 1000) return `${(knodes / 1000).toFixed(1)}M nodes`
  return `${knodes.toLocaleString()}k nodes`
}

export function formatCompactNumber(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${Math.round(value / 1_000)}k`
  return String(value)
}

export function countLabel(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`
}

/**
 * What a search has done so far, as one line.
 *
 * Every field is optional and a zero is as good as absent: an engine that has
 * not reported nodes yet should not be described as having searched none.
 * Returns null rather than an empty string when there is nothing to say, so a
 * caller can leave the row out instead of rendering a blank one.
 */
export function engineTelemetryLabel(
  line: { depth?: number; nodes?: number; nps?: number; time?: number } | null | undefined,
): string | null {
  if (!line) return null

  const parts = [
    typeof line.depth === 'number' && line.depth > 0 ? `D${line.depth}` : null,
    typeof line.nodes === 'number' && line.nodes > 0 ? `${formatCompactNumber(line.nodes)} nodes` : null,
    typeof line.nps === 'number' && line.nps > 0 ? `${formatCompactNumber(line.nps)} nps` : null,
    typeof line.time === 'number' && line.time > 0 ? `${line.time} ms` : null,
  ].filter(Boolean)

  return parts.length ? parts.join(' \u00b7 ') : null
}

/**
 * A PGN header value, or null when it says nothing. The standard fills unknown
 * Seven Tag Roster fields with "?" and an unfinished result with "*", so a
 * generated or anonymised game would otherwise be labelled "? vs ?".
 */
export function knownPgnHeader(value: string | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed && trimmed !== '?' && trimmed !== '*' ? trimmed : null
}
