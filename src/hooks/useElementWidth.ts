import { useLayoutEffect, useState, type RefObject } from 'react'

/**
 * Track an element's content width.
 *
 * Measures after every render as well as observing resizes: a single
 * mount-time reading can land before the layout it is measuring has settled,
 * and then nothing re-reads it until the element itself changes size.
 *
 * Safe here because the observed element is sized by its panel, not by what we
 * render inside it — observing a content-sized box and then sizing its content
 * from the result would feed back on itself.
 */
export function useElementWidth(ref: RefObject<HTMLElement | null>, fallback: number): number {
  return useElementExtent(ref, fallback, 'clientWidth')
}

/**
 * Track an element's content height. Same caveat as {@link useElementWidth}:
 * only observe a box whose height its own contents do not decide.
 */
export function useElementHeight(ref: RefObject<HTMLElement | null>, fallback: number): number {
  return useElementExtent(ref, fallback, 'clientHeight')
}

function useElementExtent(
  ref: RefObject<HTMLElement | null>,
  fallback: number,
  axis: 'clientWidth' | 'clientHeight',
): number {
  const [extent, setExtent] = useState(fallback)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return

    const measure = () => {
      const next = el[axis]
      if (next > 0) setExtent(previous => (previous === next ? previous : next))
    }
    measure()

    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  })

  return extent
}
