/**
 * How wide the board is drawn.
 *
 * The board is sized in JavaScript, not by CSS, because it has to stay square
 * inside a row whose height is decided by everything else on the page. So
 * anything that sits beside or above it has to be subtracted here, and the
 * figures below have to match the stylesheet — see the constants they name.
 *
 * All of it is rem-based, so it grows with the reader's text size. That is the
 * point: at 150% text the old fixed pixel allowances were outgrown by the bars
 * they were guessing at, and the board ran under the bottom one.
 */

/**
 * Board chrome, in rem — keep in sync with `--stage-pad-x`, `--board-frame`,
 * `--eval-col-w` and `--eval-col-gap` in `index.css`. The mobile and landscape
 * figures are the `@media (max-width: 900px)` overrides.
 */
export const BOARD_CHROME = {
  desktop: { stagePadX: 1.25, stagePadY: 1.35, frame: 0.55 },
  mobile: { stagePadX: 0.5, stagePadY: 0.35, frame: 0.25 },
  landscape: { stagePadX: 0.5, stagePadY: 0.5, frame: 0.25 },
} as const

export const EVAL_COLUMN_REM = 1.625 + 0.5
export const BOARD_FRAME_BORDER = 1
/**
 * Everything stacked with the board inside the stage: the meta strip and the
 * gap above it. The stage's own padding is per-breakpoint, so it lives in
 * {@link BOARD_CHROME} beside the horizontal figures.
 */
export const BOARD_STACK_REM = 2.25 + 0.55

/** Below this the layout stacks; above it the board sits between two panels. */
export const MOBILE_BREAKPOINT_PX = 900
/** The desktop board never shrinks past this, however narrow the window. */
export const MIN_DESKTOP_BOARD_PX = 260
/** Nor grows past this, however wide. */
export const MAX_BOARD_PX = 800

export type BoardViewport = {
  width: number
  height: number
  /** The root font size, so every rem figure above is real pixels. */
  rem: number
  /** Classic scrollbars take layout width; overlay scrollbars take none. */
  scrollbar: number
}

export type BoardSizingInput = {
  viewport: BoardViewport
  /** The stage's measured height: the space the board actually has. */
  stageHeight: number
  leftPanelWidth: number
  rightPanelWidth: number
  /** The evaluation column sits in flow beside the board when it is shown. */
  showEvalColumn: boolean
}

export function isMobileViewport(viewport: Pick<BoardViewport, 'width'>): boolean {
  return viewport.width <= MOBILE_BREAKPOINT_PX
}

/**
 * The one layout that lays the board beside the panels with no room to scroll
 * if it overshoots, so its height budget is a hard ceiling rather than a
 * preference. Matches the landscape-phone media query.
 */
export function isLandscapePhoneViewport(viewport: Pick<BoardViewport, 'width' | 'height'>): boolean {
  return isMobileViewport(viewport) && viewport.height <= 520 && viewport.width > viewport.height
}

export function boardChromeFor(viewport: Pick<BoardViewport, 'width' | 'height'>) {
  if (isLandscapePhoneViewport(viewport)) return BOARD_CHROME.landscape
  return isMobileViewport(viewport) ? BOARD_CHROME.mobile : BOARD_CHROME.desktop
}

/**
 * The width the board can never have: stage padding, the frame drawn around it,
 * and the evaluation column beside it.
 */
export function boardChromeWidth(
  viewport: BoardViewport,
  showEvalColumn: boolean,
): number {
  const chrome = boardChromeFor(viewport)
  return viewport.rem * (
    2 * chrome.stagePadX
    + 2 * chrome.frame
    + (showEvalColumn ? EVAL_COLUMN_REM : 0)
  ) + 2 * BOARD_FRAME_BORDER
}

/** The height the board has, measured rather than guessed at. */
export function boardHeightBudget(viewport: BoardViewport, stageHeight: number): number {
  const chrome = boardChromeFor(viewport)
  return stageHeight
    - viewport.rem * (2 * chrome.stagePadY + BOARD_STACK_REM + 2 * chrome.frame)
    - 2 * BOARD_FRAME_BORDER
}

/**
 * The width to draw the board at, and whether to draw it at all.
 *
 * `react-chessboard` measures its own container and throws
 * `Square width not found` from `<Piece2>` when that container has no width,
 * which takes the whole app to the error boundary. The trigger is a viewport of
 * literally 0x0 — a hidden or collapsed window, an automation pane that is not
 * on screen — and only the mobile branch can reach zero, because it is
 * `max(0, viewport - chrome)` while the desktop branch floors at
 * {@link MIN_DESKTOP_BOARD_PX}. `rendered` is 0 there, and the caller holds the
 * board back rather than handing it a width it cannot use.
 */
export function boardSizing({
  viewport,
  stageHeight,
  leftPanelWidth,
  rightPanelWidth,
  showEvalColumn,
}: BoardSizingInput): { width: number; rendered: number; notationFontSizePx: number } {
  const mobile = isMobileViewport(viewport)
  const chromeWidth = boardChromeWidth(viewport, showEvalColumn)
  const heightBudget = boardHeightBudget(viewport, stageHeight)

  // Mobile prefers finger-friendly squares while respecting narrow screens: a
  // share of the viewport height, unless the phone is on its side, where the
  // measured budget is all there is.
  const mobileWidth = Math.min(
    Math.max(0, viewport.width - viewport.scrollbar - chromeWidth),
    isLandscapePhoneViewport(viewport)
      ? heightBudget
      : Math.max(300, Math.round(viewport.height * 0.46)),
  )

  const width = Math.floor(mobile
    ? mobileWidth
    : Math.min(
      viewport.width - leftPanelWidth - rightPanelWidth - chromeWidth,
      heightBudget,
      MAX_BOARD_PX,
    ))

  const rendered = mobile ? width : Math.max(MIN_DESKTOP_BOARD_PX, width)

  return {
    width,
    rendered,
    notationFontSizePx: Math.round(Math.max(10, Math.min(13, rendered / 32))),
  }
}
