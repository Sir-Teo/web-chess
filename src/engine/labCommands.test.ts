import { describe, expect, it } from 'vitest'
import { engineLabCommandBlockMessage, engineLabCommandSafetyMessage, engineLabSpinOptionValue, isEngineLabPerftDiagnostic, isHeavyEngineLabCommand, isUnboundedEngineLabSearch, normalizeEngineLabCommand } from './labCommands'

describe('Engine Lab command safety', () => {
  it('validates raw spin values before native stoi and option recording', () => {
    for (const value of [undefined, '', 'nope', '1.5', '0x10', '1e2', '0', '33', '2147483648']) {
      expect(engineLabSpinOptionValue(value, { min: 1, max: 32 }), String(value)).toBeNull()
    }
    expect(engineLabSpinOptionValue('+0002', { min: 1, max: 32 })).toBe(2)
    expect(engineLabSpinOptionValue('-3', { min: -4, max: 4 })).toBe(-3)
    expect(engineLabSpinOptionValue('2147483647', {})).toBe(2147483647)
  })

  it('distinguishes uncancellable perft from ordinary zero-perft searches for Stop', () => {
    for (const command of ['go perft 8', 'go depth 12 perft 3', 'go perft 0 perft 3', 'go perft 3 searchmoves e2e4']) {
      expect(isEngineLabPerftDiagnostic(command), command).toBe(true)
    }
    for (const command of ['go perft 0', 'go perft 3 perft 0 depth 1', 'go depth 1 searchmoves e2e4 perft 3', 'go perft nope', 'perft 3']) {
      expect(isEngineLabPerftDiagnostic(command), command).toBe(false)
    }
  })

  it.each(['go DEPTH 1', 'GO depth 1', 'go MoveTime 20', 'go SEARCHMOVES e2e4 depth 1'])(
    'explains case-sensitive native keywords in %s', command => {
      expect(engineLabCommandBlockMessage(command)).toContain('lowercase UCI keywords')
      expect(isHeavyEngineLabCommand(command)).toBe(true)
    },
  )

  it.each([
    'go depth 0x10', 'go nodes 0b10', 'go depth .5', 'go movetime 1e3',
    'go depth nope movetime 20', 'go depth', 'go nodes -1',
    'go depth 2147483648', 'go movetime 9223372036854775808', 'go nodes 18446744073709551616',
  ])('rejects numeric syntax or overflow the native parser would read differently: %s', command => {
    expect(engineLabCommandBlockMessage(command)).toContain('whole decimal integer')
    expect(isHeavyEngineLabCommand(command)).toBe(true)
  })

  it.each(['go depth +00012', 'go nodes 18446744073709551615', 'go movetime 9223372036854775807', 'go depth 2147483647'])(
    'retains valid native integer syntax and limits: %s', command => {
      expect(engineLabCommandBlockMessage(command)).toBeNull()
      expect(isHeavyEngineLabCommand(command)).toBe(false)
    },
  )

  it('uses the final occurrence of each native search limit', () => {
    for (const command of ['go depth 1 depth 0', 'go nodes 100 nodes 0', 'go wtime 100 wtime 0']) {
      expect(engineLabCommandBlockMessage(command), command).toBeNull()
      expect(isHeavyEngineLabCommand(command), command).toBe(true)
      expect(isUnboundedEngineLabSearch(command), command).toBe(true)
    }
    for (const command of ['go depth 0 depth 1', 'go depth 1 depth 0 movetime 20', 'go wtime 100 wtime 0 btime 100']) {
      expect(engineLabCommandBlockMessage(command), command).toBeNull()
      expect(isHeavyEngineLabCommand(command), command).toBe(false)
      expect(isUnboundedEngineLabSearch(command), command).toBe(false)
    }
  })

  it('parks zero-perft searches using their actual remaining limits', () => {
    expect(isHeavyEngineLabCommand('go perft 0')).toBe(true)
    expect(isUnboundedEngineLabSearch('go perft 0')).toBe(true)
    expect(isUnboundedEngineLabSearch('go perft 0 depth 1')).toBe(false)
    expect(isUnboundedEngineLabSearch('go perft 3 perft 0')).toBe(true)
    expect(isUnboundedEngineLabSearch('go perft 0 perft 3')).toBe(false)
  })

  it('leaves move tokens after searchmoves to the native move parser', () => {
    expect(engineLabCommandBlockMessage('go depth 1 searchmoves e2e4 perft nope')).toBeNull()
    expect(isHeavyEngineLabCommand('go depth 1 searchmoves e2e4 perft nope')).toBe(false)
    expect(engineLabCommandBlockMessage('go depth 1 searchmoves e7e8Q')).toBeNull()
  })

  it('parks unbounded searches without interrupting finite diagnostics', () => {
    for (const command of ['go', 'go infinite', 'go ponder depth 12', 'go infinite searchmoves e2e4', 'go searchmoves e2e4']) {
      expect(isUnboundedEngineLabSearch(command), command).toBe(true)
    }
    for (const command of ['go perft 3', 'go depth 12 perft 3', 'go movetime 5000', 'go depth 30', 'go nodes 50000', 'eval']) {
      expect(isUnboundedEngineLabSearch(command), command).toBe(false)
    }
  })
  it('locks heavy diagnostics and unbounded searches', () => {
    expect(isHeavyEngineLabCommand('bench')).toBe(true)
    expect(isHeavyEngineLabCommand('bench 16 1 13')).toBe(true)
    expect(isHeavyEngineLabCommand('perft 4')).toBe(true)
    expect(isHeavyEngineLabCommand('go perft 3')).toBe(true)
    expect(isHeavyEngineLabCommand('go')).toBe(true)
    expect(isHeavyEngineLabCommand('go searchmoves e2e4')).toBe(true)
    expect(isHeavyEngineLabCommand('go infinite')).toBe(true)
    expect(isHeavyEngineLabCommand('go ponder')).toBe(true)
    expect(isHeavyEngineLabCommand('go depth')).toBe(true)
    expect(isHeavyEngineLabCommand('go depth nope')).toBe(true)
    expect(isHeavyEngineLabCommand('go movetime -1')).toBe(true)
    expect(isHeavyEngineLabCommand('go movestogo 20')).toBe(true)
    expect(isHeavyEngineLabCommand('go searchmoves e2e4 movestogo 20')).toBe(true)
    expect(isHeavyEngineLabCommand('go searchmoves e2e4 depth 12')).toBe(true)
    expect(isHeavyEngineLabCommand('go searchmoves e2e4 movetime 500')).toBe(true)
    expect(isHeavyEngineLabCommand('go winc 1000 searchmoves e2e4 wtime 60000')).toBe(true)
    expect(isHeavyEngineLabCommand('go winc 1000')).toBe(true)
    expect(isHeavyEngineLabCommand('go winc 1000 wtime nope')).toBe(true)
  })

  it('allows bounded search commands outside expert mode', () => {
    expect(isHeavyEngineLabCommand('go depth 12')).toBe(false)
    expect(isHeavyEngineLabCommand('go movetime 500')).toBe(false)
    expect(isHeavyEngineLabCommand('go nodes 10000')).toBe(false)
    expect(isHeavyEngineLabCommand('go wtime 60000 btime 60000')).toBe(false)
    expect(isHeavyEngineLabCommand('go depth 12 searchmoves e2e4')).toBe(false)
    expect(isHeavyEngineLabCommand('go wtime 60000 winc 1000')).toBe(false)
    expect(isHeavyEngineLabCommand('go wtime 60000 movestogo 20')).toBe(false)
    expect(isHeavyEngineLabCommand('d')).toBe(false)
    expect(isHeavyEngineLabCommand('eval')).toBe(false)
  })

  it('keeps perft behind the expert gate even when search limits accompany it', () => {
    for (const command of ['go depth 12 perft 3', 'go perft 3 depth 12', 'go\tmovetime\t5000\tperft\t3']) {
      expect(isHeavyEngineLabCommand(command), command).toBe(true)
      expect(engineLabCommandSafetyMessage(command), command).toContain('Enable expert mode')
      expect(isUnboundedEngineLabSearch(command), command).toBe(false)
    }
    // searchmoves consumes the rest of the native command, including words
    // that would otherwise be parameters.
    expect(isHeavyEngineLabCommand('go depth 12 searchmoves e2e4 perft 3')).toBe(false)
  })

  it('explains Stockfish searchmoves ordering separately from generic heavy commands', () => {
    expect(engineLabCommandSafetyMessage('go searchmoves e2e4 depth 12')).toContain('Put limits before searchmoves')
    expect(engineLabCommandSafetyMessage('go depth 12 searchmoves e2e4')).toBeNull()
    expect(engineLabCommandSafetyMessage('bench')).toContain('Enable expert mode')
  })

  it('blocks app-managed engine lifecycle commands even in expert workflows', () => {
    expect(engineLabCommandBlockMessage('quit')).toContain('managed by the app')
    expect(engineLabCommandBlockMessage(' QUIT ')).toContain('managed by the app')
    expect(engineLabCommandBlockMessage('stop')).toBeNull()
    expect(engineLabCommandBlockMessage('isready')).toBeNull()
  })

  it('explains browser alternatives for unavailable native diagnostics', () => {
    for (const command of ['bench', 'bench 16 1 13', ' BENCHMARK ']) {
      expect(engineLabCommandBlockMessage(command)).toContain('not included in this browser build')
      expect(engineLabCommandBlockMessage(command)).toContain('go movetime 5000')
    }
    expect(engineLabCommandBlockMessage('perft 3')).toContain('Use go perft 3')
    expect(engineLabCommandBlockMessage('go perft 3')).toBeNull()
    expect(engineLabCommandBlockMessage('go movetime 5000')).toBeNull()
  })
})

describe('native search command whitespace', () => {
  it.each([
    ['go depth\u00a01', 'go depth 1'],
    ['go\u202fdepth\u20091', 'go depth 1'],
    [' \tgo   movetime \t 50  ', 'go movetime 50'],
    ['go nodes\u2003100 searchmoves e2e4\u00a0d2d4', 'go nodes 100 searchmoves e2e4 d2d4'],
    ['go depth +0002', 'go depth +0002'],
  ])('dispatches validated search tokens for %s', (input, expected) => {
    const normalized = normalizeEngineLabCommand(input)
    expect(normalized).toBe(expected)
    expect(engineLabCommandBlockMessage(normalized)).toBeNull()
    expect(isHeavyEngineLabCommand(normalized)).toBe(false)
  })

  it.each([
    'setoption name EvalFile value café\u00a0network.nnue',
    'setoption name Example value two  spaces',
  ])('preserves text option values: %s', input => {
    expect(normalizeEngineLabCommand(`  ${input}  `)).toBe(input)
  })

  it('retains native keyword case validation', () => {
    const command = normalizeEngineLabCommand('GO\u00a0depth\u00a01')
    expect(command).toBe('GO depth 1')
    expect(engineLabCommandBlockMessage(command)).toContain('lowercase UCI keywords')
  })

  it('keeps zero limits and limits after searchmoves gated as unbounded', () => {
    for (const input of ['go depth\u00a00', 'go searchmoves\u00a0e2e4 depth\u00a01']) {
      const normalized = normalizeEngineLabCommand(input)
      expect(isHeavyEngineLabCommand(normalized)).toBe(true)
      expect(engineLabCommandSafetyMessage(normalized)).not.toBeNull()
    }
  })

  it('retains zero-perft ordinary search semantics', () => {
    const command = normalizeEngineLabCommand('go perft\u00a00 depth\u00a01')
    expect(command).toBe('go perft 0 depth 1')
    expect(isEngineLabPerftDiagnostic(command)).toBe(false)
    expect(isUnboundedEngineLabSearch(command)).toBe(false)
    expect(isHeavyEngineLabCommand(command)).toBe(true)
  })
})

describe('browser pondering limitations', () => {
  it('explains unsupported ponder searches and ponderhit instead of dispatching them', () => {
    for (const command of ['go ponder', 'go ponder depth 1', 'go depth 12 ponder', 'go perft 0 ponder depth 1', 'ponderhit', ' PONDERHIT ']) {
      expect(engineLabCommandBlockMessage(command)).toContain('Ponder searches are not supported by this browser console')
      expect(engineLabCommandBlockMessage(command)).toContain('go depth 12')
    }
  })

  it('keeps ordinary searches, diagnostic perft and consumed searchmoves text available', () => {
    for (const command of ['go depth 1', 'go infinite', 'go perft 3 ponder', 'go perft -1 ponder', 'go ponder perft 3', 'go depth 1 searchmoves e2e4 ponder']) {
      expect(engineLabCommandBlockMessage(command)).toBeNull()
    }
  })

  it('retains malformed numeric and keyword feedback before the provider limitation', () => {
    expect(engineLabCommandBlockMessage('go depth nope ponder')).toContain('whole decimal integer')
    expect(engineLabCommandBlockMessage('go PONDER depth 1')).toContain('lowercase UCI keywords')
  })
})

describe('mate goals without a stopping limit', () => {
  it('gates mate-only searches and pauses them while hidden', () => {
    for (const command of ['go mate 1', 'go mate 0 mate 2', 'go mate 3 depth 1 depth 0', 'go perft 0 mate 1']) {
      expect(engineLabCommandBlockMessage(command)).toBeNull()
      expect(isHeavyEngineLabCommand(command), command).toBe(true)
      expect(isUnboundedEngineLabSearch(command), command).toBe(true)
    }
    expect(engineLabCommandSafetyMessage('go mate 1')).toContain('mate-only search')
    expect(engineLabCommandSafetyMessage('go mate 1')).toContain('go mate 1 depth 12')
  })

  it('keeps independent native limits available with a mate goal', () => {
    for (const command of ['go mate 1 depth 2', 'go depth 2 mate 1', 'go mate 1 movetime 20', 'go mate 1 nodes 100', 'go mate 1 wtime 100 btime 100']) {
      expect(isHeavyEngineLabCommand(command), command).toBe(false)
      expect(isUnboundedEngineLabSearch(command), command).toBe(false)
    }
    expect(isUnboundedEngineLabSearch('go perft 3 mate 1')).toBe(false)
  })

  it('retains numeric validation and searchmoves consumption/order feedback', () => {
    expect(engineLabCommandBlockMessage('go mate nope')).toContain('whole decimal integer')
    expect(engineLabCommandSafetyMessage('go searchmoves e2e4 mate 1')).toContain('Put limits before searchmoves')
    expect(isHeavyEngineLabCommand('go depth 2 searchmoves e2e4 mate 1')).toBe(false)
  })
})
