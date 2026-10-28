/** Reveal a target against the actual visible bounds of its scrolling ancestors. */
export function revealInViewport(target: HTMLElement) {
  const viewportBounds = target.getBoundingClientRect()
  if (viewportBounds.top < 0 || viewportBounds.bottom > window.innerHeight) {
    target.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' })
  }
  for (let container = target.parentElement; container; container = container.parentElement) {
    const style = getComputedStyle(container)
    if (container.scrollHeight <= container.clientHeight
      || !['auto', 'scroll', 'hidden'].includes(style.overflowY)) continue
    const frame = container.getBoundingClientRect()
    const bounds = target.getBoundingClientRect()
    const top = Math.max(0, frame.top + (Number.parseFloat(style.scrollPaddingTop) || 0))
    const bottom = Math.min(window.innerHeight, frame.bottom)
    if (bottom <= top || bounds.height > bottom - top) continue
    // Bottom scroll padding may reserve footer space already outside this
    // scroller. Use its actual visible bounds when the whole target fits.
    const delta = bounds.top < top ? bounds.top - top
      : bounds.bottom > bottom ? bounds.bottom - bottom : 0
    if (Math.abs(delta) > 1) container.scrollBy({ top: delta, behavior: 'instant' })
  }
}

/** Correct nested native focus scrolling beneath fixed workspace chrome. */
export function keepFocusedControlVisible(target: HTMLElement) {
  requestAnimationFrame(() => {
    if (document.activeElement === target) revealInViewport(target)
  })
}
