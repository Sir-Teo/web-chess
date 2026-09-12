import localStockfishBuild from './localStockfishBuild.json'
import { engineProfiles, type EngineProfile } from './profiles'

/** The producer of a score, independent of the engine selected now. */
export type EvaluationEngine = {
  profile: string
  version: string
  name: string
}

export function evaluationEngine(profile: EngineProfile, name: string): EvaluationEngine {
  return {
    profile: profile.id,
    version: profile.source === 'local'
      ? localStockfishBuild.version
      : /stockfish@([^/]+)\//.exec(profile.workerPath)?.[1] ?? 'unknown',
    name,
  }
}

export function sameEvaluationEngine(a: EvaluationEngine | undefined, b: EvaluationEngine | undefined): boolean {
  return a?.profile === b?.profile && a?.version === b?.version && a?.name === b?.name
}

export function evaluationEngineLabel(engine: EvaluationEngine): string {
  const profile = engineProfiles.find(item => item.id === engine.profile)?.name ?? engine.profile
  return `${engine.name} · ${profile} · build ${engine.version}`
}

export function evaluationSourceLabel(source: { engine?: EvaluationEngine; purpose?: string }): string {
  if (source.engine) return evaluationEngineLabel(source.engine)
  if (source.purpose === 'cloud-eval') return 'Lichess cloud · engine version not recorded'
  if (source.purpose === 'pgn-annotation') return 'PGN · engine not recorded'
  return 'Local engine · version not recorded'
}

function validField(value: unknown, limit: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= limit
    && !Array.from(value).some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
    && !/[\ud800-\udfff]/u.test(value)
}

/** Compact, escaped PGN extension. Unknown future profiles remain descriptive. */
export function encodeEvaluationEngine(engine: EvaluationEngine | undefined): string | null {
  if (!engine || !validField(engine.profile, 80) || !validField(engine.version, 40) || !validField(engine.name, 160)) return null
  return encodeURIComponent(JSON.stringify([engine.profile, engine.version, engine.name]))
}

export function decodeEvaluationEngine(value: string | undefined): EvaluationEngine | undefined {
  if (!value || value.length > 2048) return undefined
  try {
    const fields: unknown = JSON.parse(decodeURIComponent(value))
    if (!Array.isArray(fields) || fields.length !== 3) return undefined
    const [profile, version, name] = fields
    if (!validField(profile, 80) || !validField(version, 40) || !validField(name, 160)) return undefined
    return { profile, version, name }
  } catch { return undefined }
}
