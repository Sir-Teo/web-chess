import { boardChromeWidth, isMobileViewport, MIN_DESKTOP_BOARD_PX, type BoardViewport } from './boardSizing'

export const MIN_SIDE_PANEL_WIDTH = 60
export const MAX_SIDE_PANEL_WIDTH = 600
export type PanelWidths = { left: number; right: number }
type FittedPanels = PanelWidths & { available: number }

/** Keep the preferred widths when they fit, reserving a complete desktop board. */
export function sidePanelSizing(viewport: BoardViewport, preferred: PanelWidths, showEvalColumn: boolean): FittedPanels {
  const available = isMobileViewport(viewport) ? Infinity
    : Math.max(0, Math.floor(viewport.width - viewport.scrollbar - boardChromeWidth(viewport, showEvalColumn) - MIN_DESKTOP_BOARD_PX))
  const total = preferred.left + preferred.right
  if (total <= available) return { ...preferred, available }
  const left = Math.floor(available * preferred.left / total)
  return { left, right: available - left, available }
}

export function maximumSidePanelWidth(current: FittedPanels, side: keyof PanelWidths): number {
  const other = side === 'left' ? 'right' : 'left'
  return Math.max(0, Math.min(MAX_SIDE_PANEL_WIDTH, current.available - Math.min(MIN_SIDE_PANEL_WIDTH, current[other])))
}

/** Resize from the visible boundary; take room from the other panel only as needed. */
export function resizeSidePanel(current: FittedPanels, side: keyof PanelWidths, requested: number): PanelWidths {
  const other = side === 'left' ? 'right' : 'left'
  const width = requested < MIN_SIDE_PANEL_WIDTH ? 0 : Math.min(requested, maximumSidePanelWidth(current, side))
  return {
    left: current.left, right: current.right,
    [side]: width,
    [other]: Math.min(current[other], Math.max(0, current.available - width)),
  }
}
