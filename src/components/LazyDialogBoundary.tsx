import { Component, type ReactNode } from 'react'
import './LazyDialogBoundary.css'

type Props = { children: ReactNode; onError?: () => void }

type State = { failed: boolean }

/**
 * Every dialog here is a lazily loaded chunk and they share one `Suspense`.
 * Suspense does not catch errors, so a chunk that fails to fetch reaches the
 * app-level boundary in `main.tsx` and replaces the whole app — board, move
 * list, engine panel — because a dialog could not load.
 *
 * The case that makes this ordinary rather than exotic: a tab left open across
 * a deploy. The old chunk filenames are gone from the server, so the first
 * dialog opened after a release fails to fetch. web-katrain hit exactly that
 * and added the equivalent boundary; this is the same containment.
 *
 * Notify the owner so it can release the modal's inert background and report
 * the failure. The owner keys this boundary by the open dialog: a failed chunk
 * must not prevent another, healthy dialog from rendering.
 */
export class LazyDialogBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.warn('Dialog chunk failed to load; the rest of the app is unaffected.', error)
    this.props.onError?.()
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="dialog-chunk-error" role="alert">
        That dialog could not be loaded. Reload the page to get it back — the
        game on the board is unaffected.
      </div>
    )
  }
}
