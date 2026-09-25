import { useEffect } from 'react'

/** How long a two-press confirmation ("Sure?", "Confirm?") stays armed. */
export const CONFIRM_WINDOW_MS = 4000

/**
 * Disarms a two-press confirmation after a few seconds. Blur alone is not
 * enough: a tapped button on iOS never takes focus, so it never blurs, and
 * the armed press stayed live for any later stray tap to fire. `disarm` must
 * be stable, or the window restarts on every render.
 */
export function useDisarmAfter(armed: boolean, disarm: () => void, ms = CONFIRM_WINDOW_MS) {
  useEffect(() => {
    if (!armed) return
    const timer = window.setTimeout(disarm, ms)
    return () => window.clearTimeout(timer)
  }, [armed, disarm, ms])
}
