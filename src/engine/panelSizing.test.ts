import { describe, expect, it } from 'vitest'
import { boardChromeWidth, type BoardViewport } from './boardSizing'
import { COMFORTABLE_DESKTOP_BOARD_PX, resizeSidePanel, sidePanelSizing } from './panelSizing'

const viewport = (width: number, rem = 16): BoardViewport => ({ width, height: 812, rem, scrollbar: 0 })

describe('desktop panel allocation', () => {
  it('reserves a whole board and its chrome through narrow widths and text enlargement', () => {
    for (const width of [901, 950, 1024, 1280]) for (const rem of [16, 24, 32]) {
      const view = viewport(width, rem)
      const preferred = { left: 320, right: 320 }
      const fitted = sidePanelSizing(view, preferred, true)
      expect(fitted.left + fitted.right + boardChromeWidth(view, true) + COMFORTABLE_DESKTOP_BOARD_PX).toBeLessThanOrEqual(width)
      expect(Math.abs(fitted.left - fitted.right)).toBeLessThanOrEqual(1)
      expect(preferred).toEqual({ left: 320, right: 320 })
    }
  })

  it('preserves preferred sizes when widening again and leaves stacked layouts alone', () => {
    const preferred = { left: 400, right: 360 }
    expect(sidePanelSizing(viewport(901), preferred, true).left).toBeLessThan(400)
    expect(sidePanelSizing(viewport(1440), preferred, true)).toMatchObject(preferred)
    expect(sidePanelSizing(viewport(900, 32), preferred, true)).toMatchObject(preferred)
  })

  it('keeps closed panels closed and reserves only the visible board chrome in Play', () => {
    const view = viewport(901, 32)
    const analysis = sidePanelSizing(view, { left: 0, right: 600 }, true)
    const play = sidePanelSizing(view, { left: 0, right: 600 }, false)
    expect(analysis.left).toBe(0)
    expect(play.left).toBe(0)
    expect(play.right).toBeGreaterThan(analysis.right)
    const withScrollbar = sidePanelSizing({ ...view, scrollbar: 15 }, { left: 0, right: 600 }, false)
    expect(withScrollbar.right).toBe(play.right - 15)
  })

  it('resizes from the fitted boundary and takes only needed room from the other panel', () => {
    const current = sidePanelSizing(viewport(901), { left: 320, right: 320 }, true)
    const next = resizeSidePanel(current, 'left', current.left + 40)
    expect(next.left).toBe(current.left + 40)
    expect(next.right).toBe(current.right - 40)
    expect(next.left + next.right).toBeLessThanOrEqual(current.available)
    const reversed = resizeSidePanel({ ...next, available: current.available }, 'left', next.left - 40)
    expect(reversed.left).toBe(current.left)
    expect(reversed.right).toBe(next.right)
  })

  it('stops at the remaining space and retains a way to reopen a collapsed side', () => {
    const current = sidePanelSizing(viewport(901, 32), { left: 320, right: 320 }, true)
    const widest = resizeSidePanel(current, 'right', 10_000)
    expect(widest.left).toBe(60)
    expect(widest.left + widest.right).toBe(current.available)
    const closed = resizeSidePanel({ ...widest, available: current.available }, 'left', 20)
    expect(closed.left).toBe(0)
    const reopened = resizeSidePanel({ ...closed, available: current.available }, 'left', 320)
    expect(reopened.left).toBe(320)
    expect(reopened.right).toBeGreaterThanOrEqual(60)
    expect(reopened.left + reopened.right).toBeLessThanOrEqual(current.available)
  })
})
