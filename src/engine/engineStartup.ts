import type { EngineProfile } from './profiles'

/** Full CDN builds need time to download their much larger network. */
export function engineStartupTimeoutMs(profile: EngineProfile): number {
  return profile.source === 'cdn' ? 120_000 : 30_000
}
