export type EngineProfileId =
  | 'auto'
  | 'lite-single-local'
  | 'lite-multi-local'
  | 'full-single-cdn'
  | 'full-multi-cdn'

export type EngineProfile = {
  id: Exclude<EngineProfileId, 'auto'>
  name: string
  description: string
  workerPath: string
  strength: 'lite' | 'full'
  requiresIsolation: boolean
  source: 'local' | 'cdn'
}

export type EngineCapabilities = {
  sharedArrayBuffer: boolean
  crossOriginIsolated: boolean
  hardwareConcurrency: number
  deviceMemoryGb?: number
  isMobile: boolean
}

const baseUrl = import.meta.env.BASE_URL

export const engineProfiles: EngineProfile[] = [
  {
    id: 'lite-single-local',
    name: 'Lite Single (Local)',
    description: 'Fast startup, single-threaded, strongest no-header local option.',
    workerPath: `${baseUrl}engine/stockfish-18-lite-single.js`,
    strength: 'lite',
    requiresIsolation: false,
    source: 'local',
  },
  {
    id: 'lite-multi-local',
    name: 'Lite Multi (Local)',
    description: 'Multi-thread lite profile. Requires cross-origin isolation.',
    workerPath: `${baseUrl}engine/stockfish-18-lite.js`,
    strength: 'lite',
    requiresIsolation: true,
    source: 'local',
  },
  {
    id: 'full-single-cdn',
    name: 'Full Single (CDN)',
    description: 'Full-strength single-thread profile from unpkg (~113MB wasm).',
    workerPath: 'https://unpkg.com/stockfish@18.0.7/bin/stockfish-18-single.js',
    strength: 'full',
    requiresIsolation: false,
    source: 'cdn',
  },
  {
    id: 'full-multi-cdn',
    name: 'Full Multi (CDN)',
    description: 'Strongest profile. Requires cross-origin isolation and larger download.',
    workerPath: 'https://unpkg.com/stockfish@18.0.7/bin/stockfish-18.js',
    strength: 'full',
    requiresIsolation: true,
    source: 'cdn',
  },
]

export function detectEngineCapabilities(): EngineCapabilities {
  const globalNavigator = navigator as Navigator & { deviceMemory?: number }
  const userAgent = globalNavigator.userAgent ?? ''

  return {
    sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
    crossOriginIsolated: Boolean(globalThis.crossOriginIsolated),
    hardwareConcurrency: globalNavigator.hardwareConcurrency || 1,
    deviceMemoryGb: globalNavigator.deviceMemory,
    isMobile: /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent),
  }
}

export function pickAutoProfile(capabilities: EngineCapabilities): EngineProfile {
  const canUseThreads = capabilities.sharedArrayBuffer && capabilities.crossOriginIsolated
  const lowMemory = typeof capabilities.deviceMemoryGb === 'number' && capabilities.deviceMemoryGb <= 4
  const lowCpu = capabilities.hardwareConcurrency <= 2

  if (canUseThreads && !lowMemory && !lowCpu && !capabilities.isMobile) return profileById('lite-multi-local')
  return profileById('lite-single-local')
}

export function fallbackProfileFor(profile: EngineProfile): EngineProfile {
  if (profile.id !== 'lite-single-local') return profileById('lite-single-local')
  return profile
}

export function deriveWasmPath(workerPath: string): string {
  return workerPath.replace(/\.js($|\?)/, '.wasm$1')
}

function defaultUrlBase(): string {
  return typeof globalThis.location === 'object' ? globalThis.location.href : 'http://localhost/'
}

export function toAbsoluteAssetUrl(path: string, base = defaultUrlBase()): string {
  return new URL(path, base).toString()
}

export function workerMainUrlWithWasmHash(workerPath: string, base?: string): string {
  const scriptUrl = toAbsoluteAssetUrl(workerPath, base)
  const wasmUrl = toAbsoluteAssetUrl(deriveWasmPath(workerPath), scriptUrl)
  return `${scriptUrl}#${encodeURIComponent(wasmUrl)}`
}

export function profileById(id: Exclude<EngineProfileId, 'auto'>): EngineProfile {
  const profile = engineProfiles.find(item => item.id === id)
  if (!profile) throw new Error(`Unknown engine profile: ${id}`)
  return profile
}

export function resolveProfile(selected: EngineProfileId, capabilities: EngineCapabilities): EngineProfile {
  const profile = selected === 'auto' ? pickAutoProfile(capabilities) : profileById(selected)
  if (profile.requiresIsolation && !(capabilities.sharedArrayBuffer && capabilities.crossOriginIsolated)) {
    return profileById('lite-single-local')
  }
  return profile
}
