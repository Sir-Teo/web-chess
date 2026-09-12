import { describe, expect, it } from 'vitest'
import { engineLabCommandBlockMessage, engineLabCommandSafetyMessage, isHeavyEngineLabCommand, isUnboundedEngineLabSearch } from './labCommands'

describe('Engine Lab command safety', () => {
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
