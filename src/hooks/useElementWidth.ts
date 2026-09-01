import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'

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
  // What is being watched, so a re-render does not replace an observer that is
  // already watching the right element. The measure below still runs every
  // render -- that is the point of the no-dependency effect -- but building a
  // ResizeObserver, observing, and disconnecting the last one is not a
  // measurement, and it was happening at the app's render rate. Counted in the
  // browser over restoring and sweeping a 43-move game: 197 observers built in
  // ten seconds, for three elements that never changed.
  const observedRef = useRef<HTMLElement | null>(null)
  const observerRef = useRef<ResizeObserver | null>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return

    const measure = () => {
      const next = el[axis]
      if (next > 0) setExtent(previous => (previous === next ? previous : next))
    }
    measure()

    if (typeof ResizeObserver === 'undefined') return
    if (observedRef.current === el) return

    observerRef.current?.disconnect()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    observedRef.current = el
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
