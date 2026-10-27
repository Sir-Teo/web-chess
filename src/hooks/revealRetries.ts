/** Retry layout settling until new input or focus movement takes over. */
export function scheduleRevealRetries(reveal: () => void, delays: readonly number[]): () => void {
  const timers = new Set<ReturnType<typeof window.setTimeout>>()
  const events = ['pointerdown', 'click', 'keydown', 'focusin', 'wheel', 'touchstart'] as const
  const cancel = () => {
    for (const timer of timers) window.clearTimeout(timer)
    timers.clear()
    for (const event of events) window.removeEventListener(event, cancel, true)
  }
  for (const event of events) window.addEventListener(event, cancel, { capture: true, passive: true })
  for (const delay of delays) {
    const timer = window.setTimeout(() => {
      timers.delete(timer)
      if (!timers.size) cancel()
      reveal()
    }, delay)
    timers.add(timer)
  }
  return cancel
}
