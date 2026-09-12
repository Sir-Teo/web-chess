import { useId, useLayoutEffect, useRef, type ReactNode } from 'react'
import './EngineDetails.css'

/** Keep live status visible while the full readings are one press away. */
export function EngineDetails({ status, statusClass, available, children }: {
  status: string
  statusClass: string
  available: boolean
  children: ReactNode
}) {
  const id = useId()
  const panelRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!available) panelRef.current?.hidePopover()
  }, [available])

  useLayoutEffect(() => {
    const panel = panelRef.current
    return () => {
      // Returning to the full footer removes both the popup and its invoker.
      // Give keyboard users a stable destination if they were reading inside.
      const heldFocus = panel?.contains(document.activeElement)
      panel?.hidePopover()
      if (heldFocus) document.getElementById('chessboard-stage')?.focus({ preventScroll: true })
    }
  }, [])

  return (
    <>
      <button type="button" className="engine-details-trigger" popoverTarget={id}
        aria-haspopup="dialog" aria-label={`Engine details: ${status}`}>
        <span>Engine details</span>
        <strong className={`status ${statusClass}`}>{status}</strong>
      </button>
      <div ref={panelRef} id={id} popover="auto" className="engine-details-popover"
        role="dialog" aria-labelledby={`${id}-title`}>
        <header>
          <h2 id={`${id}-title`}>Engine details</h2>
          <button type="button" popoverTarget={id} popoverTargetAction="hide">Close</button>
        </header>
        <div className="engine-details-readings">{children}</div>
      </div>
    </>
  )
}
