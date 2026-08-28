import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { LazyDialogBoundary } from './LazyDialogBoundary'

/**
 * The failure this contains is a dialog chunk that will not fetch — what a tab
 * left open across a deploy sees, since the old chunk filenames are gone.
 * Without the boundary that reaches the app-level one and replaces the board.
 */
function Boom(): never {
  throw new Error('Failed to fetch dynamically imported module')
}

describe('LazyDialogBoundary', () => {
  it('renders its children when nothing is wrong', () => {
    const html = renderToStaticMarkup(
      <LazyDialogBoundary><p>dialog</p></LazyDialogBoundary>,
    )
    expect(html).toContain('dialog')
    expect(html).not.toContain('could not be loaded')
  })

  it('replaces only the dialog layer when a chunk fails', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // renderToStaticMarkup surfaces the throw; the boundary's job is that the
    // caller sees a notice rather than the error escaping to the app root.
    const boundary = new LazyDialogBoundary({ children: null })
    expect(LazyDialogBoundary.getDerivedStateFromError()).toEqual({ failed: true })
    boundary.componentDidCatch(new Error('chunk'))
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('says the game is unaffected, because that is the reader question', () => {
    const boundary = new LazyDialogBoundary({ children: <p>x</p> })
    boundary.state = { failed: true }
    const html = renderToStaticMarkup(boundary.render() as ReactElement)
    expect(html).toContain('could not be loaded')
    expect(html).toContain('unaffected')
    expect(html).toContain('role="alert"')
  })

  it('does not render the children it was given once it has failed', () => {
    const boundary = new LazyDialogBoundary({ children: <p>secret</p> })
    boundary.state = { failed: true }
    const html = renderToStaticMarkup(boundary.render() as ReactElement)
    expect(html).not.toContain('secret')
    void Boom
  })
})
