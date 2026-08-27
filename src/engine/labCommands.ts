const DIRECT_GO_LIMITS = new Set([
  'depth',
  'movetime',
  'nodes',
  'mate',
  'wtime',
  'btime',
])

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

const HEAVY_COMMAND_MESSAGE = 'Enable expert mode before running heavy commands (bench/perft/unbounded go).'
const SEARCHMOVES_ORDER_MESSAGE =
  'Stockfish treats searchmoves as the final go parameter. Put limits before searchmoves, for example: go depth 12 searchmoves e2e4.'
const QUIT_COMMAND_MESSAGE = 'Engine shutdown is managed by the app. Switch engine profile or reload the page instead of sending quit.'

function hasPositiveNumericValue(parts: string[], index: number): boolean {
  const value = Number(parts[index + 1])
  return Number.isFinite(value) && value > 0
}

function commandParts(command: string): string[] {
  return command.trim().toLowerCase().split(/\s+/g).filter(Boolean)
}

function hasTrailingSearchMovesLimit(parts: string[]): boolean {
  const searchMovesIndex = parts.indexOf('searchmoves')
  if (searchMovesIndex < 0) return false
  return parts.slice(searchMovesIndex + 1).some(part => SEARCHMOVES_TRAILING_LIMITS.has(part))
}

export function isHeavyEngineLabCommand(command: string): boolean {
  const parts = commandParts(command)
  const verb = parts[0]
  if (!verb) return false

  if (verb === 'bench') return true
  if (verb === 'perft') return true

  if (verb !== 'go') return false
  const searchMovesIndex = parts.indexOf('searchmoves')
  const limitParts = searchMovesIndex >= 0 ? parts.slice(0, searchMovesIndex) : parts
  if (limitParts.includes('infinite') || limitParts.includes('ponder')) return true
  const hasClockTime = limitParts.some((part, index) => {
    return (part === 'wtime' || part === 'btime') && hasPositiveNumericValue(limitParts, index)
  })

  return !limitParts.some((part, index) => {
    if (DIRECT_GO_LIMITS.has(part)) return hasPositiveNumericValue(limitParts, index)
    if (!INCREMENT_LIMITS.has(part)) return false
    return hasPositiveNumericValue(limitParts, index) && hasClockTime
  })
}

export function engineLabCommandSafetyMessage(command: string): string | null {
  if (!isHeavyEngineLabCommand(command)) return null
  const parts = commandParts(command)
  if (parts[0] === 'go' && hasTrailingSearchMovesLimit(parts)) {
    return SEARCHMOVES_ORDER_MESSAGE
  }
  return HEAVY_COMMAND_MESSAGE
}

export function engineLabCommandBlockMessage(command: string): string | null {
  const parts = commandParts(command)
  if (parts[0] === 'quit') return QUIT_COMMAND_MESSAGE
  return null
}
