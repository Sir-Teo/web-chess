const FINITE_GO_LIMITS = new Set([
  'depth',
  'movetime',
  'nodes',
  'wtime',
  'btime',
])

export const ENGINE_CONSOLE_LINE_LIMIT = 300

const INCREMENT_LIMITS = new Set([
  'winc',
  'binc',
])

const SEARCHMOVES_TRAILING_LIMITS = new Set([
  ...FINITE_GO_LIMITS,
  ...INCREMENT_LIMITS,
  'movestogo',
  'mate',
  'infinite',
  'ponder',
])

const NUMERIC_GO_PARAMETERS = new Set([...FINITE_GO_LIMITS, ...INCREMENT_LIMITS, 'movestogo', 'perft', 'mate'])
const INT_GO_PARAMETERS = new Set(['depth', 'mate', 'movestogo', 'perft'])
const GO_KEYWORDS = new Set([...NUMERIC_GO_PARAMETERS, 'searchmoves', 'infinite', 'ponder'])

type GoParameters = {
  limits: Map<string, bigint>
  perft: boolean
  indefinite: boolean
  ponder: boolean
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
  const parsed: GoParameters = { limits: new Map(), perft: false, indefinite: false, ponder: false, issue: null }
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
    if (keyword === 'ponder') parsed.ponder = true
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
  // Mate is a goal, not a bound: without a matching mate score Stockfish
  // continues beyond that many plies. A separate limit must end the search.
  return Boolean(parsed.issue) || parsed.indefinite
    || ![...FINITE_GO_LIMITS].some(keyword => (parsed.limits.get(keyword) ?? 0n) > 0n)
}

// Carries the reason, because this is where a reader meets the limit. The
// Runtime card used to state it permanently, in warning colours, at everyone
// who never runs one of these.
const HEAVY_COMMAND_MESSAGE =
  'Enable expert mode to run perft and unbounded go — they are locked because they can stall the UI.'
const SEARCHMOVES_ORDER_MESSAGE =
  'Stockfish treats searchmoves as the final go parameter. Put limits before searchmoves, for example: go depth 12 searchmoves e2e4.'
const PONDER_COMMAND_MESSAGE = 'Ponder searches are not supported by this browser console. Use go depth 12, or go infinite and Stop.'
const QUIT_COMMAND_MESSAGE = 'Engine shutdown is managed by the app. Switch engine profile or reload the page instead of sending quit.'

function commandParts(command: string): string[] {
  return command.trim().split(/\s+/g).filter(Boolean)
}

/** Match protocol tokens to Stockfish's ASCII whitespace parser. */
export function normalizeEngineLabCommand(command: string): string {
  const text = command.trim()
  if (/^go(?:\s|$)/i.test(text)) return commandParts(text).join(' ')

  // Normalize option keywords and names, not the value payload. Consume only
  // its first separator so a Unicode space at the start of a value survives
  // when it follows the ordinary protocol delimiter.
  const optionPrefix = /^setoption\s+name\s+/i.exec(text)
  if (!optionPrefix) return text
  const body = text.slice(optionPrefix[0].length)
  const name: string[] = []
  for (const token of body.matchAll(/\S+/g)) {
    if (token[0].toLowerCase() !== 'value') {
      name.push(token[0])
      continue
    }
    if (!name.length) return text
    const valueAt = token.index + token[0].length
    const value = valueAt < body.length ? ` ${body.slice(valueAt + 1)}` : ''
    return `setoption name ${name.join(' ')} value${value}`
  }
  return name.length ? `setoption name ${name.join(' ')}` : text
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
  const parsed = parseGoParameters(parts)
  if (!parsed.issue && !parsed.indefinite && !parsed.perft && (parsed.limits.get('mate') ?? 0n) > 0n) {
    return 'Enable expert mode for a mate-only search, or add a limit such as go mate 1 depth 12. A mate goal alone can keep searching when no mate is found.'
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
  // Native C strings end at NUL; validating the suffix would describe a
  // different command from the one Stockfish actually receives.
  if (command.includes('\u0000')) return 'Command contains a null character. Retype it so Stockfish receives the complete command.'
  const parts = commandParts(command)
  const verb = parts[0]?.toLowerCase()
  if (verb === 'quit') return QUIT_COMMAND_MESSAGE
  if (verb === 'ponderhit') return PONDER_COMMAND_MESSAGE
  if (verb === 'bench' || verb === 'benchmark') {
    return 'The native Stockfish benchmark is not included in this browser build. Use go movetime 5000 for a five-second search at the console position, or native Stockfish for its benchmark.'
  }
  if (verb === 'perft') {
    return 'Use go perft 3 to count legal move paths three plies deep at the console position. This browser build does not support bare perft commands.'
  }
  if (verb === 'go') {
    const parsed = parseGoParameters(parts)
    if (parsed.issue) return parsed.issue
    // The pinned Emscripten build omits the native wait for ponderhit after
    // reaching a depth limit. Perft diagnostics bypass ordinary searching.
    if (parsed.ponder && !(parsed.limits.get('perft') ?? 0n)) return PONDER_COMMAND_MESSAGE
  }
  return null
}
