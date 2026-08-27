import { useEffect, useState, type RefObject } from 'react'

/**
 * Track an element's content width.
 *
 * Safe here because the observed element is sized by its panel, not by what we
 * render inside it — observing a content-sized box and then sizing its content
 * from the result would feed back on itself.
 */
export function useElementWidth(ref: RefObject<HTMLElement | null>, fallback: number): number {
  const [width, setWidth] = useState(fallback)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const measure = () => {
      const next = el.clientWidth
      if (next > 0) setWidth(next)
    }
    measure()

    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref])

  return width
}
