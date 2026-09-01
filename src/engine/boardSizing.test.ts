import { describe, expect, it } from 'vitest'
import {
  BOARD_CHROME,
  MAX_BOARD_PX,
  MIN_DESKTOP_BOARD_PX,
  boardChromeFor,
  boardHeightBudget,
  boardSizing,
  isLandscapePhoneViewport,
  isMobileViewport,
  type BoardViewport,
} from './boardSizing'

const desktop: BoardViewport = { width: 1440, height: 900, rem: 16, scrollbar: 15 }
const phone: BoardViewport = { width: 375, height: 812, rem: 16, scrollbar: 0 }
const phoneLandscape: BoardViewport = { width: 812, height: 375, rem: 16, scrollbar: 0 }

const size = (viewport: BoardViewport, stageHeight: number, overrides = {}) =>
  boardSizing({
    viewport,
    stageHeight,
    leftPanelWidth: 320,
    rightPanelWidth: 320,
    showEvalColumn: true,
    ...overrides,
  })

describe('layout breakpoints', () => {
  it('splits at the width the stylesheet splits at', () => {
    expect(isMobileViewport({ width: 900 })).toBe(true)
    expect(isMobileViewport({ width: 901 })).toBe(false)
  })

  /** A short, wide phone is the one layout with no room to scroll. */
  it('recognises a phone on its side, and not a small desktop window', () => {
    expect(isLandscapePhoneViewport(phoneLandscape)).toBe(true)
    expect(isLandscapePhoneViewport(phone)).toBe(false)
    expect(isLandscapePhoneViewport({ width: 1200, height: 400 })).toBe(false)
    expect(boardChromeFor(phoneLandscape)).toBe(BOARD_CHROME.landscape)
    expect(boardChromeFor(phone)).toBe(BOARD_CHROME.mobile)
    expect(boardChromeFor(desktop)).toBe(BOARD_CHROME.desktop)
  })
})

describe('board sizing', () => {
  it('draws a square board that fits the space it is given', () => {
    const { rendered } = size(desktop, 760)
    expect(rendered).toBeGreaterThan(MIN_DESKTOP_BOARD_PX)
    expect(rendered).toBeLessThanOrEqual(boardHeightBudget(desktop, 760))
  })

  it('never grows past the ceiling, however wide the window', () => {
    expect(size({ ...desktop, width: 3840, height: 2160 }, 1800).rendered).toBe(MAX_BOARD_PX)
  })

  it('gives the board back the width the evaluation column was taking', () => {
    const withBar = size(desktop, 760).rendered
    const withoutBar = size(desktop, 760, { showEvalColumn: false }).rendered
    expect(withoutBar).toBeGreaterThanOrEqual(withBar)
  })

  it("grows the chrome with the reader's text size", () => {
    const big = size({ ...desktop, rem: 24 }, 760)
    const normal = size(desktop, 760)
    expect(boardHeightBudget({ ...desktop, rem: 24 }, 760))
      .toBeLessThan(boardHeightBudget(desktop, 760))
    expect(big.rendered).toBeLessThanOrEqual(normal.rendered)
  })

  /**
   * The crash this exists to prevent: react-chessboard throws
   * "Square width not found" when its container has no width, which takes the
   * whole app to the error boundary. Only the mobile branch can reach zero --
   * the desktop branch floors -- and the caller holds the board back on zero.
   */
  it('reports zero on a viewport with nothing in it, rather than a bad width', () => {
    expect(size({ width: 0, height: 0, rem: 16, scrollbar: 0 }, 0).rendered).toBe(0)
    // And never a negative one, at any size the chrome outgrows.
    for (const width of [0, 20, 60, 80, 200]) {
      expect(size({ width, height: 600, rem: 16, scrollbar: 0 }, 400).rendered)
        .toBeGreaterThanOrEqual(0)
    }
  })

  it('floors the desktop board instead of collapsing it', () => {
    // A window too narrow for two panels and a board still draws a board.
    expect(size({ ...desktop, width: 950 }, 700).rendered).toBe(MIN_DESKTOP_BOARD_PX)
    // And is not floored where there is genuinely room.
    expect(size({ ...desktop, width: 1000 }, 700).rendered).toBeGreaterThan(MIN_DESKTOP_BOARD_PX)
  })

  it('keeps a phone board inside the window and off the fold', () => {
    const { rendered } = size(phone, 700, { leftPanelWidth: 0, rightPanelWidth: 0 })
    expect(rendered).toBeGreaterThan(0)
    expect(rendered).toBeLessThanOrEqual(phone.width)
    // A share of the height, so the panel below it is reachable without scrolling past a full screen.
    expect(rendered).toBeLessThanOrEqual(Math.round(phone.height * 0.46))
  })

  it('holds a landscape phone to its measured budget, having nowhere to scroll', () => {
    const stageHeight = 340
    const { rendered } = size(phoneLandscape, stageHeight, { leftPanelWidth: 0, rightPanelWidth: 0 })
    expect(rendered).toBeLessThanOrEqual(boardHeightBudget(phoneLandscape, stageHeight))
  })

  it('scales the coordinates with the board, within readable bounds', () => {
    expect(size(desktop, 760).notationFontSizePx).toBeLessThanOrEqual(13)
    expect(size({ ...desktop, width: 950 }, 700).notationFontSizePx).toBeGreaterThanOrEqual(10)
  })
})
