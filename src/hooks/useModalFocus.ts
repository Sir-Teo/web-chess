import { useEffect, type RefObject } from 'react'

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
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
      const rect = el.getBoundingClientRect()
      return rect.width > 0 && rect.height > 0
    }

    const getFocusable = () =>
      Array.from(panelEl.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(isFocusable)

    const preferredEl = initialFocus ? panelEl.querySelector<HTMLElement>(initialFocus) : null
    const preferred = preferredEl && isFocusable(preferredEl) ? preferredEl : null
    ;(preferred ?? getFocusable()[0])?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
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
      previouslyFocused?.focus?.()
    }
  }, [initialFocus, onClose, open, panelRef, trapFocus])
}
