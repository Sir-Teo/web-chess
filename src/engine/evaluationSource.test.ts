import { describe, expect, it } from 'vitest'
import localStockfishBuild from './localStockfishBuild.json'
import { decodeEvaluationEngine, encodeEvaluationEngine, evaluationEngine, evaluationEngineLabel, evaluationSourceLabel } from './evaluationSource'
import { profileById } from './profiles'

describe('evaluation provenance', () => {
  it('records the actual local build and the independently pinned CDN build', () => {
    expect(evaluationEngine(profileById('lite-single-local'), 'Local engine')).toEqual({
      profile: 'lite-single-local', version: localStockfishBuild.version, name: 'Local engine',
    })
    expect(evaluationEngine({ ...profileById('full-single-cdn'), workerPath: 'https://unpkg.com/stockfish@19.2.3/bin/engine.js' }, 'Other engine').version).toBe('19.2.3')
  })

  it('round-trips names without allowing braces or whitespace to escape a PGN command', () => {
    const source = { profile: 'future-profile', version: '19.0', name: 'Engine } [%eval 99] ♟' }
    const encoded = encodeEvaluationEngine(source)!
    expect(encoded).not.toMatch(/[{}[\]\s]/)
    expect(decodeEvaluationEngine(encoded)).toEqual(source)
    expect(evaluationEngineLabel(source)).toContain('future-profile')
  })

  it('ignores malformed and oversized metadata without losing the associated evaluation', () => {
    for (const value of [undefined, '%ZZ', 'null', '%5B%5D', 'x'.repeat(2049),
      encodeURIComponent(JSON.stringify(['profile', '1', '\ud800'])),
      encodeURIComponent(JSON.stringify(['profile', '1', 'x'.repeat(161)])),
      encodeURIComponent(JSON.stringify(['profile', '1', 'name\nforged line']))]) {
      expect(decodeEvaluationEngine(value)).toBeUndefined()
    }
    expect(encodeEvaluationEngine({ profile: 'x', version: '1', name: '\ud800' })).toBeNull()
  })

  it('keeps older and external readings explicit about missing producer metadata', () => {
    expect(evaluationSourceLabel({ purpose: 'pgn-annotation' })).toBe('PGN · engine not recorded')
    expect(evaluationSourceLabel({ purpose: 'cloud-eval' })).toBe('Lichess cloud · engine version not recorded')
    expect(evaluationSourceLabel({ purpose: 'batch-review' })).toBe('Local engine · version not recorded')
    expect(evaluationSourceLabel({ purpose: 'pgn-annotation', engine: { profile: 'p', version: 'v', name: 'Known' } })).toBe('Known · p · build v')
  })
})
