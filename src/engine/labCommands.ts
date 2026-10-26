const DIRECT_GO_LIMITS = new Set([
  'depth',
  'movetime',
  'nodes',
  'mate',
  'wtime',
  'btime',
])

export const ENGINE_CONSOLE_LINE_LIMIT = 300

const INCREMENT_LIMITS = new Set([
  'winc',
  'binc',
])

const SEARCHMOVES_TRAILING_LIMITS = new Set([
  ...DIRECT_GO_LIMITS,
  ...INCREMENT_LIMITS,
  'movestogo',
  'infinite',
  'ponder',
])

const NUMERIC_GO_PARAMETERS = new Set([...DIRECT_GO_LIMITS, ...INCREMENT_LIMITS, 'movestogo', 'perft'])
const INT_GO_PARAMETERS = new Set(['depth', 'mate', 'movestogo', 'perft'])
const GO_KEYWORDS = new Set([...NUMERIC_GO_PARAMETERS, 'searchmoves', 'infinite', 'ponder'])

type GoParameters = {
  limits: Map<string, bigint>
  perft: boolean
  indefinite: boolean
  issue: string | null
}

/** Validate the integer syntax/ranges accepted by the pinned native parser. */
function numericGoValue(keyword: string, text: string | undefined): bigint | null {
  if (!text || !/^[+-]?\d+$/.test(text)) return null
  // Even the widest native limit has at most 20 decimal digits. Bound parsing
  // work before BigInt sees arbitrary console input (leading zeros are valid).
  const digits = text.replace(/^[+-]?0*/, '')
  if (digits.length > 20) return null
  const value = BigInt(`${text.startsWith('-') ? '-' : ''}${digits || '0'}`)
  const bits = INT_GO_PARAMETERS.has(keyword) ? 32n : 64n
  const unsigned = keyword === 'nodes'
  const min = unsigned ? 0n : -(1n << (bits - 1n))
  const max = unsigned ? (1n << bits) - 1n : (1n << (bits - 1n)) - 1n
  return value >= min && value <= max ? value : null
}

function parseGoParameters(parts: string[]): GoParameters {
  const parsed: GoParameters = { limits: new Map(), perft: false, indefinite: false, issue: null }
  if (parts[0] !== 'go') {
    parsed.issue = 'Stockfish uses lowercase UCI keywords. Use go depth 12, for example.'
    return parsed
  }
  for (let index = 1; index < parts.length; index++) {
    const keyword = parts[index]
    if (keyword !== keyword.toLowerCase() && GO_KEYWORDS.has(keyword.toLowerCase())) {
      parsed.issue = 'Stockfish uses lowercase UCI keywords. Use go depth 12, for example.'
      break
    }
    // Stockfish consumes everything after searchmoves as move text.
    if (keyword === 'searchmoves') break
    if (keyword === 'infinite' || keyword === 'ponder') parsed.indefinite = true
    if (!NUMERIC_GO_PARAMETERS.has(keyword)) continue
    const value = numericGoValue(keyword, parts[++index])
    if (value === null) {
      parsed.issue = `Use a whole decimal integer within Stockfish's range for ${keyword}, for example go depth 12 or go movetime 5000.`
      break
    }
    // Native extraction assigns each occurrence: the last value wins.
    parsed.limits.set(keyword, value)
    if (keyword === 'perft') parsed.perft = true
  }
  return parsed
}

function hasUnboundedSearch(parsed: GoParameters): boolean {
  return Boolean(parsed.issue) || parsed.indefinite
    || ![...DIRECT_GO_LIMITS].some(keyword => (parsed.limits.get(keyword) ?? 0n) > 0n)
}

// Carries the reason, because this is where a reader meets the limit. The
// Runtime card used to state it permanently, in warning colours, at everyone
// who never runs one of these.
const HEAVY_COMMAND_MESSAGE =
  'Enable expert mode to run perft and unbounded go — they are locked because they can stall the UI.'
const SEARCHMOVES_ORDER_MESSAGE =
  'Stockfish treats searchmoves as the final go parameter. Put limits before searchmoves, for example: go depth 12 searchmoves e2e4.'
const QUIT_COMMAND_MESSAGE = 'Engine shutdown is managed by the app. Switch engine profile or reload the page instead of sending quit.'

function commandParts(command: string): string[] {
  return command.trim().split(/\s+/g).filter(Boolean)
}

function hasTrailingSearchMovesLimit(parts: string[]): boolean {
  const searchMovesIndex = parts.indexOf('searchmoves')
  if (searchMovesIndex < 0) return false
  return parts.slice(searchMovesIndex + 1).some(part => SEARCHMOVES_TRAILING_LIMITS.has(part.toLowerCase()))
}

export function isHeavyEngineLabCommand(command: string): boolean {
  const parts = commandParts(command)
  const verb = parts[0]?.toLowerCase()
  if (!verb) return false

  if (verb === 'bench') return true
  if (verb === 'perft') return true

  if (verb !== 'go') return false
  const parsed = parseGoParameters(parts)
  // Perft remains an expert diagnostic even when zero falls through to search.
  return parsed.perft || hasUnboundedSearch(parsed)
}

export function engineLabCommandSafetyMessage(command: string): string | null {
  if (!isHeavyEngineLabCommand(command)) return null
  const parts = commandParts(command)
  if (parts[0] === 'go' && hasTrailingSearchMovesLimit(parts)) {
    return SEARCHMOVES_ORDER_MESSAGE
  }
  return HEAVY_COMMAND_MESSAGE
}

/** Identify searches that pause while hidden; nonzero perft is a diagnostic. */
export function isUnboundedEngineLabSearch(command: string): boolean {
  const parts = commandParts(command)
  if (parts[0] !== 'go') return false
  const parsed = parseGoParameters(parts)
  // Native go perft 0 is a regular search; nonzero perft runs a diagnostic.
  return !(parsed.limits.get('perft') ?? 0n) && hasUnboundedSearch(parsed)
}

/** Native nonzero perft runs synchronously and cannot acknowledge Stop. */
export function isEngineLabPerftDiagnostic(command: string): boolean {
  const parts = commandParts(command)
  if (parts[0] !== 'go') return false
  const parsed = parseGoParameters(parts)
  return !parsed.issue && (parsed.limits.get('perft') ?? 0n) !== 0n
}

/** Spin options use native int32 values, just like the depth field. */
export function engineLabSpinOptionValue(value: string | undefined, bounds: { min?: number; max?: number }): number | null {
  const parsed = numericGoValue('depth', value)
  if (parsed === null) return null
  const number = Number(parsed)
  if ((bounds.min !== undefined && number < bounds.min) || (bounds.max !== undefined && number > bounds.max)) return null
  return number
}

export function engineLabCommandBlockMessage(command: string): string | null {
  const parts = commandParts(command)
  const verb = parts[0]?.toLowerCase()
  if (verb === 'quit') return QUIT_COMMAND_MESSAGE
  if (verb === 'bench' || verb === 'benchmark') {
    return 'The native Stockfish benchmark is not included in this browser build. Use go movetime 5000 for a five-second search at the console position, or native Stockfish for its benchmark.'
  }
  if (verb === 'perft') {
    return 'Use go perft 3 to count legal move paths three plies deep at the console position. This browser build does not support bare perft commands.'
  }
  if (verb === 'go') return parseGoParameters(parts).issue
  return null
}
