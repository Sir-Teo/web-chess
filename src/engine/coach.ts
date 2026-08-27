type CoachMoveSources = {
  engine?: string | null
  cloud?: string | null
  last?: string | null
  tablebase?: string | null
}

const UCI_MOVE_PATTERN = /^[a-h][1-8][a-h][1-8][qrbn]?$/i

function normalizeUciMove(move: string | null | undefined): string | null {
  const normalized = move?.trim().toLowerCase()
  return normalized && UCI_MOVE_PATTERN.test(normalized) ? normalized : null
}

export function selectCoachBestMove({
  engine,
  cloud,
  last,
  tablebase,
}: CoachMoveSources): string | null {
  return normalizeUciMove(tablebase)
    ?? normalizeUciMove(engine)
    ?? normalizeUciMove(cloud)
    ?? normalizeUciMove(last)
}

export function isExactTablebaseCoachMove(
  selectedMove: string | null | undefined,
  tablebaseMove: string | null | undefined,
): boolean {
  const selected = normalizeUciMove(selectedMove)
  const tablebase = normalizeUciMove(tablebaseMove)
  return Boolean(selected && tablebase && selected === tablebase)
}
