export type AnalyzeMode = 'quick' | 'deep' | 'infinite' | 'mate' | 'review' | 'custom'
export type AnalyzePurpose =
  | 'auto'
  | 'manual'
  | 'import-load'
  | 'import-sweep'
  | 'review-ponder'
  | 'batch-review'
  | 'cloud-eval'
  | 'threat'
  /** An `[%eval ...]` read out of a PGN, of unknown depth but not a shallow search. */
  | 'pgn-annotation'

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
  rootFen?: string
  purpose?: AnalyzePurpose
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

export type ParsedUciMoveList = {
  validMoves: string[]
  invalidTokens: string[]
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

export function parseUciMoveListInput(input: string): ParsedUciMoveList {
  const tokens = input
    .split(/[,\s]+/g)
    .map(move => move.trim())
    .filter(Boolean)

  return tokens.reduce<ParsedUciMoveList>(
    (parsed, token) => {
      if (isUciMove(token)) {
        parsed.validMoves.push(token.toLowerCase())
      } else {
        parsed.invalidTokens.push(token)
      }
      return parsed
    },
    { invalidTokens: [], validMoves: [] },
  )
}

export function buildPositionCommand(fen: string, historyMoves?: string[], rootFen?: string): string {
  const normalizedMoves = normalizeUciMoves(historyMoves)
  if (!normalizedMoves.length || !rootFen) return `position fen ${fen}`

  return `position fen ${rootFen} moves ${normalizedMoves.join(' ')}`
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
  const hashMb = toPositiveInt(request.hashMb)
  const multiPv = toPositiveInt(request.multiPv)

  if (hashMb) {
    setOptions.push({ name: 'Hash', value: hashMb })
  }
  if (multiPv) {
    setOptions.push({ name: 'MultiPV', value: multiPv })
  }
  if (typeof request.showWdl === 'boolean') {
    setOptions.push({ name: 'UCI_ShowWDL', value: request.showWdl })
  }

  return {
    setOptions,
    position: buildPositionCommand(request.fen, request.historyMoves, request.rootFen),
    go: buildGoCommand(request.mode, request.limits, request.searchMoves),
  }
}

/**
 * The subset of `setoption` commands worth actually sending.
 *
 * `buildAnalyzeCommand` names every option a search depends on, every search,
 * because the request is self-describing. Sending them all is not free:
 * `setoption name Hash` resizes the transposition table, and a resize *clears*
 * it, whatever the new size is. Re-sending the size it already has therefore
 * throws away the search tree between one search and the next.
 *
 * Measured against `stockfish-18-lite-single`, the same position searched twice
 * to depth 20: 0.63x the nodes when the table survives, 1.12x when a same-value
 * `Hash` is sent in between. Over a 60-ply game review at depth 16, 21.1M nodes
 * and 12.9s become 19.3M and 11.2s.
 *
 * `applied` is what this engine instance was last told, so the caller has to
 * keep it per worker and forget it when the worker is replaced.
 */
export function changedSetOptions(
  desired: BuiltAnalyzeCommand['setOptions'],
  applied: ReadonlyMap<string, string>,
): BuiltAnalyzeCommand['setOptions'] {
  // Keyed the way the engine keys them, whatever the caller did. See optionKey.
  const appliedByKey = new Map<string, string>()
  for (const [name, value] of applied) appliedByKey.set(optionKey(name), value)

  return desired.filter(option => {
    // A valueless option is a UCI button: it is an action, not a setting, and
    // has no current value to compare against.
    if (option.value === undefined) return true
    return appliedByKey.get(optionKey(option.name)) !== engineOptionValueToString(option.value)
  })
}

/**
 * The key an option is recorded under in the applied-options map.
 *
 * Stockfish matches option names case-insensitively -- `hash`, `Hash` and
 * `HASH` all reach the same table -- so the record of what it was told has to
 * as well, or a `setoption name hash value 128` typed into the Engine Lab is
 * filed beside the app's own `Hash` rather than over it, and the next search
 * finds its `Hash 64` "already applied" and leaves the engine at 128.
 */
export function optionKey(name: string): string {
  return name.trim().toLowerCase()
}

export type ParsedSetOption = { name: string; value?: string }

/**
 * `setoption name <id> [value <x>]`, as the Engine Lab console types it.
 *
 * The app records every option it sends so it can avoid re-sending one the
 * engine already has (see {@link changedSetOptions} for why that matters). A
 * command typed into the console reaches the same engine, so it has to reach
 * the same record -- and it used to be dropped on the floor, which left the
 * record describing an engine that no longer matched it.
 *
 * Names may contain spaces ("Skill Level", "Move Overhead"), so the name is
 * everything up to the `value` keyword. A button has no `value` and comes back
 * without one; a `value` with nothing after it is an empty string, which is
 * what Stockfish would receive too.
 */
export function parseSetOptionCommand(command: string): ParsedSetOption | null {
  const trimmed = command.trim()
  const body = trimmed.replace(/^setoption\s+name\s+/i, '')
  if (body === trimmed) return null

  const valueAt = body.search(/\s+value(?:\s|$)/i)
  if (valueAt < 0) {
    const name = body.trim()
    return name ? { name } : null
  }

  const name = body.slice(0, valueAt).trim()
  if (!name) return null
  const value = body.slice(valueAt).replace(/^\s+value\s*/i, '').trim()
  return { name, value }
}

/** The wire form of an option value, so a comparison is against what was sent. */
export function engineOptionValueToString(value: string | number | boolean): string {
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return String(value)
}

export function buildNewGameCommands(): string[] {
  return ['ucinewgame', 'isready']
}

export function parseBestMoveLine(line: string): ParsedBestMove | null {
  if (!line.startsWith('bestmove ')) return null

  const parts = line.trim().split(/\s+/)
  const bestMoveRaw = parts[1] ?? '(none)'
  const ponderIndex = parts.indexOf('ponder')
  const ponderRaw = ponderIndex >= 0 ? (parts[ponderIndex + 1] ?? null) : null

  const bestMove = isUciMove(bestMoveRaw) ? bestMoveRaw.trim().toLowerCase() : null
  const ponderMove = ponderRaw && isUciMove(ponderRaw) ? ponderRaw.trim().toLowerCase() : null

  return { bestMove, ponderMove }
}
