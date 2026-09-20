import { useEffect, useRef, type RefObject } from 'react'

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  /*
   * A `<details>` disclosure is focusable and the browser tabs to it, but it
   * is none of the above and carries no `tabindex`, so the trap could not see
   * it -- and a trap that disagrees with the browser about what is focusable
   * is not a trap.
   *
   * Measured in the Settings dialog, which is `aria-modal`: 25 elements the
   * browser will tab to against 23 the trap matched, and one of the two it
   * missed -- "Advanced engine options" -- sat *after* the last one it knew
   * about. So the wrap fired at the wrong element and never covered it.
   * Expand the advanced options, collapse them again (a click leaves focus on
   * the summary it toggled) and press Tab: focus was on `<body>`, outside a
   * dialog the rest of the page is hidden behind, with only Shift+Tab to get
   * back. Reached by clicking, which is how a disclosure is used, so a plain
   * Tab sweep of the dialog never found it.
   *
   * `isFocusable` below still does the deciding: a second `<summary>` in the
   * same `<details>` is not the disclosure and reports `tabIndex === -1`,
   * which it already rejects.
   */
  'details > summary',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

type Options = {
  /** Selector for the element to focus first; falls back to the first focusable. */
  initialFocus?: string
  /**
   * Keep Tab inside the panel. True for a modal; false for a popover, which the
   * user should be able to tab out of.
   */
  trapFocus?: boolean
}

/**
 * The dialog behaviour every overlay in the app needs: move focus inside on
 * open, close on Escape, and hand focus back to whatever opened it — plus a Tab
 * trap when the overlay is modal.
 */
export function useModalFocus(
  open: boolean,
  panelRef: RefObject<HTMLElement | null>,
  onClose: () => void,
  options: Options = {},
) {
  const { initialFocus, trapFocus = true } = options

  // Held in a ref so it stays out of the effect's dependencies. Callers rebuild
  // `onClose` on most renders, and an overlay's owner re-renders constantly —
  // engine status alone ticks several times a second. Re-running the effect
  // pulled focus back to the first control while the reader was tabbing, and
  // left it holding a node that the close then detached, so focus fell to
  // <body> instead of returning to whatever opened the overlay.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return
    const panelEl = panelRef.current
    if (!panelEl) return

    const previouslyFocused = document.activeElement as HTMLElement | null

    // A panel can hold controls its breakpoint lays away — the settings sheet
    // hides its header on wide screens — and a zero-size element cannot take
    // focus, so initial focus or a Tab cycle landing on one goes nowhere.
    // Measured rather than asked: `checkVisibility({ checkOpacity: true })`
    // reports false here for controls that are plainly on screen.
    const isFocusable = (el: HTMLElement) => {
      if (el.hasAttribute('disabled') || el.tabIndex === -1) return false
      // `visibility: hidden` still measures, so the rect alone would let one
      // through; a zero-size box still returns a rect, so the style alone would
      // too. Both checks are needed.
      const style = window.getComputedStyle(el)
      if (style.display === 'none' || style.visibility === 'hidden') return false
      const rect = el.getBoundingClientRect()
      return rect.width > 0 && rect.height > 0
    }

    const getFocusable = () =>
      Array.from(panelEl.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(isFocusable)

    const revealFocusedControl = (event: FocusEvent) => {
      const target = event.target
      if (!(target instanceof HTMLElement)) return
      // A short dialog scrolls as one panel. Native focus in Firefox can leave
      // a large choice partly clipped even when it fits in that panel.
      const overflow = window.getComputedStyle(panelEl).overflowY
      if (overflow !== 'auto' && overflow !== 'scroll') return
      const rect = target.getBoundingClientRect()
      const panel = panelEl.getBoundingClientRect()
      if (rect.top < panel.top || rect.bottom > panel.bottom
        || rect.left < panel.left || rect.right > panel.right) {
        target.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' })
      }
    }
    panelEl.addEventListener('focusin', revealFocusedControl)

    const preferredEl = initialFocus ? panelEl.querySelector<HTMLElement>(initialFocus) : null
    const preferred = preferredEl && isFocusable(preferredEl) ? preferredEl : null
    ;(preferred ?? getFocusable()[0])?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }

      if (!trapFocus || event.key !== 'Tab') return
      const focusable = getFocusable()
      if (!focusable.length) return

      const first = focusable[0]!
      const last = focusable[focusable.length - 1]!
      const active = document.activeElement as HTMLElement | null

      if (event.shiftKey) {
        if (active === first || !panelEl.contains(active)) {
          event.preventDefault()
          last.focus()
        }
        return
      }

      if (active === last || !panelEl.contains(active)) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      panelEl.removeEventListener('focusin', revealFocusedControl)
      // Whatever opened the overlay may itself be gone by the time it closes —
      // a dialog opened from another dialog, a control the close re-rendered
      // away. Focusing a detached node silently drops focus to <body>.
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus?.()
      }
    }
  }, [initialFocus, open, panelRef, trapFocus])
}
