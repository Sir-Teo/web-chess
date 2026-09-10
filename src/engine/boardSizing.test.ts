import { describe, expect, it } from 'vitest'
import {
  BOARD_CHROME,
  BOARD_STACK_REM,
  MAX_BOARD_PX,
  MIN_DESKTOP_BOARD_PX,
  MIN_TOUCH_BOARD_PX,
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
    // Room enough that it is not the cap, unless a case says otherwise: these
    // are tests of the other rules, and one that stopped exercising them by
    // accident would still pass.
    containerHeight: viewport.height,
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

  /**
   * The narrowest width the app claims to support, where the preference and
   * the room disagreed and the preference won.
   *
   * Measured at 320x568 in a browser: the top bar takes 236px of the screen and
   * the bottom one 97, leaving 235 for the board. The 300px floor under the
   * height share drew it at 294 -- three ranks below the fold of the scroller,
   * both ranks of the reader's own pieces among them, so the first move of a
   * game could not be made without scrolling to find the pieces first.
   */
  describe('a phone whose bars leave less room than the preference asks for', () => {
    const tiny: BoardViewport = { width: 320, height: 568, rem: 16, scrollbar: 0 }
    /**
     * What the two bars leave, measured on the running page: a 189px top bar
     * and a 97px bottom one. (The top bar was 236px until the mode pills were
     * put on one scrolling row, which is the other half of this fix.)
     */
    const room = 282

    it('draws the board the room allows, not the share of the height', () => {
      const { rendered } = size(tiny, 400, { containerHeight: room, leftPanelWidth: 0, rightPanelWidth: 0 })
      expect(rendered).toBeLessThanOrEqual(boardHeightBudget(tiny, room))
      // And the preference would have drawn it bigger, or this proves nothing.
      expect(Math.max(300, Math.round(tiny.height * 0.46))).toBeGreaterThan(rendered)
    })

    it('leaves the whole board inside the container it scrolls in', () => {
      const { rendered } = size(tiny, 400, { containerHeight: room, leftPanelWidth: 0, rightPanelWidth: 0 })
      const stack = tiny.rem * (2 * BOARD_CHROME.mobile.stagePadY + BOARD_STACK_REM + 2 * BOARD_CHROME.mobile.frame)
      expect(rendered + stack).toBeLessThanOrEqual(room)
    })

    /**
     * Down to a point. A phone short enough to need squares under 24px cannot
     * have both a board that fits and one a finger can hit, and the choice is
     * squares that can be hit -- the board runs past the fold and the container
     * scrolls, which is what it did at every size before this.
     */
    it('stops shrinking at squares a finger can still hit', () => {
      const shortest: BoardViewport = { width: 320, height: 480, rem: 16, scrollbar: 0 }
      const { rendered } = size(shortest, 300, { containerHeight: 194, leftPanelWidth: 0, rightPanelWidth: 0 })
      expect(rendered).toBe(MIN_TOUCH_BOARD_PX)
      expect(rendered / 8).toBeGreaterThanOrEqual(24)
    })

    /** And the room never *grows* a board past the width it has. */
    it('is a cap and not a target', () => {
      const roomy = size(phone, 700, { containerHeight: 4000, leftPanelWidth: 0, rightPanelWidth: 0 })
      const normal = size(phone, 700, { leftPanelWidth: 0, rightPanelWidth: 0 })
      expect(roomy.rendered).toBe(normal.rendered)
      expect(roomy.rendered).toBeLessThanOrEqual(phone.width)
    })
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
