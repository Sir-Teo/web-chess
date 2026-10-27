import { useCallback, useId, useLayoutEffect, useRef, useState } from 'react'
import { isCommandPaletteChord } from './commandPalette'
import { isCompositionKey } from './shortcutKeys'

/** A bounded console follows new output until the reader scrolls back. */
export function EngineConsoleOutput({ lines, session }: { lines: readonly string[]; session: number }) {
  const output = useRef<HTMLPreElement>(null)
  const content = useRef<HTMLSpanElement>(null)
  const latestButton = useRef<HTMLButtonElement>(null)
  const followingRef = useRef(true)
  const previousSession = useRef(session)
  const [following, setFollowing] = useState(true)
  const outputId = useId()

  const changeFollowing = useCallback((next: boolean) => {
    if (followingRef.current === next) return
    if (next && document.activeElement === latestButton.current) output.current?.focus({ preventScroll: true })
    followingRef.current = next
    setFollowing(next)
  }, [])

  useLayoutEffect(() => {
    const reset = previousSession.current !== session || !lines.length
    if (reset) changeFollowing(true)
    previousSession.current = session
    if ((reset || typeof ResizeObserver === 'undefined') && followingRef.current && output.current) {
      output.current.scrollTop = output.current.scrollHeight
    }
  }, [changeFollowing, lines, session])

  useLayoutEffect(() => {
    const pane = output.current
    const text = content.current
    if (!pane || !text || typeof ResizeObserver === 'undefined') return
    // Observe the laid-out text instead of forcing layout on each publication.
    // At the line cap, equal-height replacements already retain the bottom.
    const observer = new ResizeObserver(() => {
      if (followingRef.current) pane.scrollTop = pane.scrollHeight
    })
    observer.observe(text)
    observer.observe(pane)
    return () => observer.disconnect()
  }, [])

  return <div className="engine-console-output" onKeyDown={event => {
    if (isCommandPaletteChord(event.nativeEvent)) return
    event.stopPropagation()
    const pane = output.current
    if (!pane || event.target !== pane || isCompositionKey(event.nativeEvent)) return
    if (event.ctrlKey !== event.metaKey && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'a') {
      const selection = window.getSelection()
      if (!selection || !content.current) return
      const range = document.createRange()
      range.selectNodeContents(content.current)
      event.preventDefault()
      selection.removeAllRanges()
      selection.addRange(range)
      return
    }
    if (event.altKey || event.ctrlKey || event.metaKey || (event.shiftKey && event.key !== ' ')) return
    const line = Number.parseFloat(getComputedStyle(pane).lineHeight) || 16
    const page = Math.max(line, pane.clientHeight - line)
    let top: number
    switch (event.key) {
      case 'Home': top = 0; break
      case 'End': top = pane.scrollHeight; break
      case 'ArrowUp': top = pane.scrollTop - line; break
      case 'ArrowDown': top = pane.scrollTop + line; break
      case 'PageUp': top = pane.scrollTop - page; break
      case 'PageDown': top = pane.scrollTop + page; break
      case ' ': top = pane.scrollTop + (event.shiftKey ? -page : page); break
      default: return
    }
    // Scrollable pre elements do not consistently implement Home/End across
    // browsers. Handle reading keys here without invoking board shortcuts.
    event.preventDefault()
    pane.scrollTo({ top, behavior: 'instant' })
  }}>
    <pre ref={output} id={outputId} className="engine-lab-output" role="region" aria-label="UCI console output"
      aria-describedby={`${outputId}-help`} aria-keyshortcuts="Control+A Meta+A" tabIndex={0}
      onScroll={event => {
        const pane = event.currentTarget
        changeFollowing(pane.scrollHeight - pane.scrollTop - pane.clientHeight <= 2)
      }}>
      <span ref={content} className="engine-lab-output-lines">{lines.join('\n') || 'No command output yet.'}</span>
    </pre>
    <p id={`${outputId}-help`} className="visually-hidden">Use arrows or Page Up and Page Down to scroll. Home goes to the start; End follows the latest output. Control+A (Command+A on Mac) selects this output.</p>
    {!following && <div className="engine-lab-output-actions">
      <button ref={latestButton} type="button" aria-controls={outputId} onClick={() => {
        changeFollowing(true)
        if (output.current) {
          output.current.scrollTop = output.current.scrollHeight
          output.current.focus({ preventScroll: true })
        }
      }}>Jump to latest output</button>
    </div>}
  </div>
}
