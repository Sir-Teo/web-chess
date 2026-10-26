import { describe, expect, it } from 'vitest'
import { engineLabCommandBlockMessage, engineLabCommandSafetyMessage, isHeavyEngineLabCommand, isUnboundedEngineLabSearch } from './labCommands'

describe('Engine Lab command safety', () => {
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
