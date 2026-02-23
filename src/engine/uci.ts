export type AnalyzeMode = 'quick' | 'deep' | 'infinite' | 'mate' | 'review' | 'custom'

export type UciGoLimits = {
  depth?: number
  movetime?: number
  nodes?: number
  mate?: number
  wtime?: number
  btime?: number
  winc?: number
  binc?: number
  movestogo?: number
  ponder?: boolean
  infinite?: boolean
}

export type AnalyzeRequest = {
  fen: string
  mode?: AnalyzeMode
  limits?: UciGoLimits
  hashMb?: number
  multiPv?: number
  showWdl?: boolean
  searchMoves?: string[]
  historyMoves?: string[]
}

export type BuiltAnalyzeCommand = {
  setOptions: Array<{ name: string; value?: string | number | boolean }>
  position: string
  go: string
}

export type ParsedBestMove = {
  bestMove: string | null
  ponderMove: string | null
}

const UCI_MOVE_REGEX = /^[a-h][1-8][a-h][1-8][qrbn]?$/i

function toPositiveInt(value: unknown): number | undefined {
  if (typeof value !== 'number') return undefined
  if (!Number.isFinite(value)) return undefined
  const rounded = Math.floor(value)
  return rounded > 0 ? rounded : undefined
}

function toNonNegativeInt(value: unknown): number | undefined {
  if (typeof value !== 'number') return undefined
  if (!Number.isFinite(value)) return undefined
  const rounded = Math.floor(value)
  return rounded >= 0 ? rounded : undefined
}

export function isUciMove(move: string): boolean {
  return UCI_MOVE_REGEX.test(move.trim())
}

export function normalizeUciMoves(moves: string[] | undefined): string[] {
  if (!moves?.length) return []
  return moves.map(move => move.trim().toLowerCase()).filter(isUciMove)
}

export function buildPositionCommand(fen: string, historyMoves?: string[]): string {
  const normalizedMoves = normalizeUciMoves(historyMoves)
  if (!normalizedMoves.length) return `position fen ${fen}`
  return `position fen ${fen} moves ${normalizedMoves.join(' ')}`
}

function modeDefaults(mode: AnalyzeMode | undefined): UciGoLimits {
  switch (mode) {
    case 'quick':
      return { movetime: 400 }
    case 'deep':
      return { depth: 20 }
    case 'infinite':
      return { infinite: true }
    case 'mate':
      return { mate: 5 }
    case 'review':
      return { depth: 14 }
    default:
      return {}
  }
}

export function buildGoCommand(
  mode: AnalyzeMode | undefined,
  limitsInput: UciGoLimits | undefined,
  searchMovesInput?: string[],
): string {
  const limits: UciGoLimits = { ...modeDefaults(mode), ...(limitsInput ?? {}) }
  const parts: string[] = ['go']

  if (limits.ponder) {
    parts.push('ponder')
  }

  if (limits.infinite) {
    parts.push('infinite')
  } else if (toPositiveInt(limits.mate)) {
    parts.push('mate', String(toPositiveInt(limits.mate)))
  } else {
    const depth = toPositiveInt(limits.depth)
    const movetime = toPositiveInt(limits.movetime)
    const nodes = toPositiveInt(limits.nodes)

    const wtime = toNonNegativeInt(limits.wtime)
    const btime = toNonNegativeInt(limits.btime)
    const winc = toNonNegativeInt(limits.winc)
    const binc = toNonNegativeInt(limits.binc)
    const movestogo = toPositiveInt(limits.movestogo)

    if (depth) parts.push('depth', String(depth))
    if (movetime) parts.push('movetime', String(movetime))
    if (nodes) parts.push('nodes', String(nodes))

    if (typeof wtime === 'number') parts.push('wtime', String(wtime))
    if (typeof btime === 'number') parts.push('btime', String(btime))
    if (typeof winc === 'number') parts.push('winc', String(winc))
    if (typeof binc === 'number') parts.push('binc', String(binc))
    if (movestogo) parts.push('movestogo', String(movestogo))

    if (parts.length === 1) {
      parts.push('depth', '12')
    }
  }

  const searchMoves = normalizeUciMoves(searchMovesInput)
  if (searchMoves.length) {
    parts.push('searchmoves', ...searchMoves)
  }

  return parts.join(' ')
}

export function buildAnalyzeCommand(request: AnalyzeRequest): BuiltAnalyzeCommand {
  const setOptions: BuiltAnalyzeCommand['setOptions'] = []

  if (typeof request.hashMb === 'number') {
    setOptions.push({ name: 'Hash', value: request.hashMb })
  }
  if (typeof request.multiPv === 'number') {
    setOptions.push({ name: 'MultiPV', value: request.multiPv })
  }
  if (typeof request.showWdl === 'boolean') {
    setOptions.push({ name: 'UCI_ShowWDL', value: request.showWdl })
  }

  return {
    setOptions,
    position: buildPositionCommand(request.fen, request.historyMoves),
    go: buildGoCommand(request.mode, request.limits, request.searchMoves),
  }
}

export function parseBestMoveLine(line: string): ParsedBestMove | null {
  if (!line.startsWith('bestmove ')) return null

  const parts = line.trim().split(/\s+/)
  const bestMoveRaw = parts[1] ?? '(none)'
  const ponderIndex = parts.indexOf('ponder')
  const ponderRaw = ponderIndex >= 0 ? (parts[ponderIndex + 1] ?? null) : null

  const bestMove = bestMoveRaw === '(none)' ? null : bestMoveRaw
  const ponderMove = ponderRaw && ponderRaw !== '(none)' ? ponderRaw : null

  return { bestMove, ponderMove }
}
