/** Reveal a nested item without moving the workspace around its scroller. */
export function scrollWithinContainer(container: HTMLElement, element: HTMLElement) {
  const outerScrollPositions: Array<{ element: Element; left: number; top: number }> = []
  let parent = container.parentElement
  while (parent) {
    if (parent.scrollHeight > parent.clientHeight || parent.scrollWidth > parent.clientWidth) {
      outerScrollPositions.push({ element: parent, left: parent.scrollLeft, top: parent.scrollTop })
    }
    parent = parent.parentElement
  }
  if (document.scrollingElement) {
    outerScrollPositions.push({
      element: document.scrollingElement,
      left: document.scrollingElement.scrollLeft,
      top: document.scrollingElement.scrollTop,
    })
  }
  element.scrollIntoView({ block: 'nearest', behavior: 'auto' })
  for (const { element: scroller, left, top } of outerScrollPositions) {
    scroller.scrollLeft = left
    scroller.scrollTop = top
  }
}
