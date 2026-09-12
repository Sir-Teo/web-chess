import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'

/**
 * Track an element's content width.
 *
 * Measures when the element mounts, then observes its size. ResizeObserver
 * catches layout settling after that first reading without forcing layout
 * again on every unrelated engine update.
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
  // The ref can attach later or move to a different element (for example when
  // a graph gains its first point). Check its identity on every render, but
  // leave an existing observer and its last measurement alone.
  const observedRef = useRef<HTMLElement | null>(null)
  const observerRef = useRef<ResizeObserver | null>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (observedRef.current === el && observerRef.current) return

    observerRef.current?.disconnect()
    observerRef.current = null
    observedRef.current = el
    if (!el) return

    const measure = () => {
      const next = el[axis]
      if (next > 0) setExtent(previous => (previous === next ? previous : next))
    }
    measure()

    // Older hosts without ResizeObserver retain render-time measurements.
    if (typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver(measure)
    observer.observe(el)
    observerRef.current = observer
  })

  // Unmount only: the effect above hands the observer over when the element
  // changes, so the only disconnect left to do is the last one.
  useEffect(() => () => {
    observerRef.current?.disconnect()
    observerRef.current = null
    observedRef.current = null
  }, [])

  return extent
}
