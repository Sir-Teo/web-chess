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

/**
 * A starting hash size the device can afford. Only ever a default — a stored
 * preference wins, and the Advanced slider still spans the full 16-512 MB.
 *
 * A fixed 64 MB was being handed to every device, phones included, on top of
 * the engine's own WASM memory. Sized by tier the way web-xiangqi's
 * analysisProfile does it, leaving capable desktops exactly where they were.
 */
export function recommendedHashMb(capabilities: EngineCapabilities): number {
  const memoryGb = capabilities.deviceMemoryGb
  const reported = typeof memoryGb === 'number' && Number.isFinite(memoryGb)

  if (capabilities.isMobile) return 16
  // Thresholds stay well below 8. Browsers disagree about the top of
  // navigator.deviceMemory's range — the spec describes clamping it to 8 to
  // limit fingerprinting, and Chromium 148 was observed reporting 32 — so a
  // threshold at or near 8 sorts identical hardware differently depending on
  // the browser. Below 4 is a constraint under either behaviour.
  if (reported && memoryGb <= 2) return 16
  if (reported && memoryGb <= 4) return 32
  if (capabilities.hardwareConcurrency <= 2) return 32
  return 64
}

/**
 * How many principal variations an automatic analysis should ask for.
 *
 * A second line is not a second search, it is a slower one: MultiPV turns off
 * pruning the engine relies on. **Measured** against the shipped
 * single-threaded Lite build at depth 18 -- the start position took 123k nodes
 * in 82ms at MultiPV 1 and 586k in 369ms at MultiPV 2, and a middlegame took
 * 787k/467ms against 1.64M/1077ms. So the second line costs between two and
 * four and a half times the work, not twice.
 *
 * What it buys by default is the second candidate arrow on the board, which is
 * worth having on a machine that can afford it and is not worth a phone
 * running the whole search again after every move. Same shape as
 * `recommendedHashMb` and `recommendedThreadCount`, and for the same reason:
 * the defaults should suit the device, and a reader who wants more can raise
 * it and have that remembered.
 */
export function recommendedMultiPv(capabilities: EngineCapabilities): number {
  if (capabilities.isMobile) return 1
  const memoryGb = capabilities.deviceMemoryGb
  const reported = typeof memoryGb === 'number' && Number.isFinite(memoryGb)
  if (reported && memoryGb <= 4) return 1
  if (capabilities.hardwareConcurrency <= 2) return 1
  return 2
}

export function recommendedThreadCount(profile: EngineProfile, capabilities: EngineCapabilities): number {
  if (!profile.requiresIsolation) return 1
  if (!capabilities.sharedArrayBuffer || !capabilities.crossOriginIsolated) return 1
  if (capabilities.isMobile) return 1

  const usableCores = Math.max(1, Math.floor(capabilities.hardwareConcurrency || 1))
  if (usableCores <= 2) return 1

  // Compared at 4 rather than 8 because browsers disagree about the top of
  // navigator.deviceMemory's range: the spec describes clamping it to 8, and
  // Chromium 148 was observed reporting 32. A threshold at 8 therefore gave the
  // same machine four threads in one browser and eight in another. Below 4 is a
  // constraint under either behaviour; 8GB is not.
  const memoryAwareCap =
    typeof capabilities.deviceMemoryGb === 'number' && capabilities.deviceMemoryGb <= 4 ? 4 : 8

  return Math.max(2, Math.min(memoryAwareCap, Math.floor(usableCores * 0.75)))
}

export function pickAutoProfile(capabilities: EngineCapabilities): EngineProfile {
  const canUseThreads = capabilities.sharedArrayBuffer && capabilities.crossOriginIsolated
  const lowMemory = typeof capabilities.deviceMemoryGb === 'number' && capabilities.deviceMemoryGb <= 4
  const lowCpu = capabilities.hardwareConcurrency <= 2

  if (canUseThreads && !lowMemory && !lowCpu && !capabilities.isMobile) return profileById('lite-multi-local')
  return profileById('lite-single-local')
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
