export type ImportSweepEntry = {
  move: { from: string; to: string; promotion?: string }
  fen: string
}

export type ImportSweepTarget = {
  fen: string
  rootFen: string
  historyMoves: string[]
}

function normalizedLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) return Number.POSITIVE_INFINITY
  return Math.max(0, Math.floor(limit ?? Number.POSITIVE_INFINITY))
}

function sampledIndexes(count: number, limit: number): number[] {
  if (count <= 0 || limit <= 0) return []
  if (count <= limit) return Array.from({ length: count }, (_, index) => index)
  if (limit === 1) return [0]

  const lastIndex = count - 1
  const selected = new Set<number>()
  for (let index = 0; index < limit; index += 1) {
    selected.add(Math.round((index * lastIndex) / (limit - 1)))
  }

  for (let index = 0; selected.size < limit && index < count; index += 1) {
    selected.add(index)
  }

  return [...selected].sort((a, b) => a - b)
}

export function countImportSweepCandidates(entries: ImportSweepEntry[]): number {
  return entries.length
}

export function buildImportSweepTargets(
  entries: ImportSweepEntry[],
  rootFen: string,
  maxTargets?: number,
): ImportSweepTarget[] {
  if (!entries.length) return []

  const candidateCount = entries.length
  const indexes = sampledIndexes(candidateCount, normalizedLimit(maxTargets))
  return indexes.map(index => {
    if (index === 0) {
      return {
        fen: rootFen,
        rootFen,
        historyMoves: [],
      }
    }

    return {
      fen: entries[index - 1]!.fen,
      rootFen,
      historyMoves: [],
    }
  })
}
