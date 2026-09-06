import { memo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { WdlPoint, WinratePoint } from '../engine/analysis'
import { formatMoveTime, type MoveTimePoint } from '../engine/moveTimes'
import { useElementWidth } from '../hooks/useElementWidth'
import { describeWdlPosition, describeWinratePosition, formatGraphAxisLabel, formatGraphPositionLabel, formatWdlReadout, formatWinrateReadout } from './graphLabels'
import {
  GRAPH_FALLBACK_WIDTH,
  GRAPH_HEIGHT,
  GRAPH_PAD_BOTTOM,
  GRAPH_PAD_LEFT,
  GRAPH_PAD_RIGHT,
  GRAPH_PAD_TOP,
  clampGraphIndex,
  graphIndexAtX,
  graphKeyboardTarget,
  graphTickStep,
  graphWidthForIndex,
} from './graphLayout'
import { IconBarChart, IconTrendingUp, IconClock } from './icons'

type WinrateGraphProps = {
  points: WinratePoint[]
  currentIndex?: number
  /**
   * Plies in the line being shown, which is what the navigator's range has to
   * be. See {@link trendGraphGeometry}.
   */
  lastPlyIndex?: number
  onNavigate?: (index: number) => void
}

/**
 * Everything the two trend graphs work out identically before they draw
 * anything: where a point lands, where the gridlines go, and what a click or an
 * arrow key means. Only the paths drawn through it differ — one line for the
 * winrate, three for the WDL split.
 *
 * A plain function rather than a hook: both callers compute this after their
 * empty-state early return, where a hook could not be called.
 */
function trendGraphGeometry(
  points: readonly { index: number }[],
  available: number,
  currentIndex: number | undefined,
  onNavigate?: (index: number) => void,
  lastPlyIndex?: number,
) {
  /**
   * The range is the *game*, not the data.
   *
   * Both series skip a position they have no reading for, so their last point
   * is the last position that happens to have been evaluated. Using that as
   * the range made the WDL navigator two things it should never be: short --
   * End landed on 10. d4 in a game ending 10... Nbd7 -- and unstable, because
   * `aria-valuemax` moved from 19 to 18 as evaluations came and went under it.
   * A slider whose range depends on which points have data is not a slider
   * over the game.
   *
   * Falls back to the data when the caller does not say, and never reports
   * less than the data it is drawing.
   */
  const lastPointIndex = points.length > 0 ? points[points.length - 1]!.index : 0
  const maxIndex = Math.max(lastPlyIndex ?? 0, lastPointIndex)
  const width = graphWidthForIndex(maxIndex, available)
  const height = GRAPH_HEIGHT
  const padLeft = GRAPH_PAD_LEFT
  const padRight = GRAPH_PAD_RIGHT
  const padTop = GRAPH_PAD_TOP
  const padBottom = GRAPH_PAD_BOTTOM
  const innerWidth = width - padLeft - padRight
  const innerHeight = height - padTop - padBottom

  const toX = (idx: number) => padLeft + (maxIndex > 0 ? (idx / maxIndex) * innerWidth : 0)
  const toY = (pct: number) => padTop + ((100 - pct) / 100) * innerHeight

  const isNavigable = Boolean(onNavigate && maxIndex > 0)
  const selectedIndex = clampGraphIndex(currentIndex ?? maxIndex, maxIndex)

  /** The ply under a pointer position, for a click that navigates and a hover that reads. */
  const indexAtClientX = (svg: SVGSVGElement, clientX: number): number => {
    const rect = svg.getBoundingClientRect()
    const scaleX = rect.width > 0 ? width / rect.width : 1
    return graphIndexAtX((clientX - rect.left) * scaleX, padLeft, innerWidth, maxIndex)
  }

  const handleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!isNavigable || !onNavigate) return
    onNavigate(indexAtClientX(e.currentTarget, e.clientX))
  }

  const handleKeyDown = (e: ReactKeyboardEvent<SVGSVGElement>) => {
    if (!isNavigable || !onNavigate) return

    const targetIdx = graphKeyboardTarget(e.key, selectedIndex, maxIndex)
    if (targetIdx === null) return

    e.preventDefault()
    if (targetIdx !== selectedIndex) {
      onNavigate(targetIdx)
    }
  }

  return {
    maxIndex, width, height, padLeft, padRight, padTop, padBottom,
    innerWidth, innerHeight, toX, toY, lastPointIndex,
    markers: [0, 25, 50, 75, 100],
    xTickStep: graphTickStep(maxIndex, innerWidth),
    isNavigable, selectedIndex, handleClick, handleKeyDown, indexAtClientX,
  }
}

/**
 * The hairline and label that answer a pointer: what a reader gets by
 * pointing at the curve, which used to be nothing -- the graph answered a
 * click and a keyboard and ignored a hover.
 *
 * The hairline follows the pointer; the label does not. Pinned beside the
 * pointer it ran off whichever edge was nearer -- the rail is 260px wide and
 * the text is most of that -- and jumped as the pointer moved. Top-left of
 * the plot is always inside the drawing and always in the same place. The
 * stroke behind the text keeps it legible over the curve.
 */
function GraphReadout({ x, padLeft, padTop, height, padBottom, text }: {
  x: number
  padLeft: number
  padTop: number
  height: number
  padBottom: number
  text: string
}) {
  return (
    <g style={{ pointerEvents: 'none' }} aria-hidden="true">
      <line x1={x} x2={x} y1={padTop} y2={height - padBottom} className="graph-hover-line" />
      <text x={padLeft + 4} y={padTop + 11} textAnchor="start" className="graph-readout">
        {text}
      </text>
    </g>
  )
}

export const WinrateGraph = memo(function WinrateGraph({ points, currentIndex, lastPlyIndex, onNavigate }: WinrateGraphProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const available = useElementWidth(scrollRef, GRAPH_FALLBACK_WIDTH)
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  // The readout follows the pointer, and failing that the keyboard: a reader
  // scrubbing with the arrow keys had the dashed cursor and a screen-reader
  // value and nothing to read on screen.
  const [focused, setFocused] = useState(false)
  if (points.length === 0) {
    return (
      <div className="empty-state">
        <span className="empty-state-icon" aria-hidden="true"><IconTrendingUp /></span>
        <p>Play and analyze moves to build the live winrate graph.</p>
      </div>
    )
  }

  const {
    maxIndex, width, height, padLeft, padRight, padTop, padBottom,
    toX, toY, lastPointIndex, markers, xTickStep, isNavigable, selectedIndex, handleClick, handleKeyDown, indexAtClientX,
  } = trendGraphGeometry(points, available, currentIndex, onNavigate, lastPlyIndex)

  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(p.index).toFixed(2)} ${toY(p.whiteWinrate).toFixed(2)}`)
    .join(' ')

  const area = `${path} L ${toX(lastPointIndex).toFixed(2)} ${(height - padBottom).toFixed(2)} L ${toX(points[0]?.index ?? 0).toFixed(2)} ${(height - padBottom).toFixed(2)} Z`
  const selectedPoint = points.find(point => point.index === selectedIndex)
  const readoutIndex = hoverIndex ?? (focused && isNavigable ? selectedIndex : null)
  const readoutPoint = readoutIndex === null ? undefined : points.find(point => point.index === readoutIndex)

  const currentLineX = currentIndex !== undefined && maxIndex > 0
    ? toX(selectedIndex)
    : null

  return (
    <div className="graph-wrap" aria-label="White winrate graph">
      <div className="graph-scroll" ref={scrollRef}>
        <svg
          className="winrate-graph"
          width={width}
          viewBox={`0 0 ${width} ${height}`}
          role={isNavigable ? 'slider' : 'img'}
          tabIndex={isNavigable ? 0 : undefined}
          aria-label={isNavigable ? 'White winrate move navigator' : 'White winrate graph'}
          aria-valuemin={isNavigable ? 0 : undefined}
          aria-valuemax={isNavigable ? maxIndex : undefined}
          aria-valuenow={isNavigable ? selectedIndex : undefined}
          aria-valuetext={isNavigable ? describeWinratePosition(selectedPoint, selectedIndex) : undefined}
          onClick={handleClick}
          onKeyDown={handleKeyDown}
          onMouseMove={maxIndex > 0 ? e => setHoverIndex(indexAtClientX(e.currentTarget, e.clientX)) : undefined}
          onMouseLeave={() => setHoverIndex(null)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{ cursor: isNavigable ? 'pointer' : 'default' }}
        >
          <defs>
            <linearGradient id="graph-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(63, 185, 80, 0.24)" />
              <stop offset="100%" stopColor="rgba(63, 185, 80, 0.02)" />
            </linearGradient>
          </defs>
          {markers.map(v => {
            const y = toY(v)
            return (
              <g key={v}>
                <line x1={padLeft} x2={width - padRight} y1={y} y2={y} className="graph-grid-line" />
                <text x={padLeft - 8} y={y + 4} className="graph-grid-text" textAnchor="end">{v}%</text>
              </g>
            )
          })}
          <path d={area} className="graph-area" />
          <path d={path} className="graph-line" />
          {points.map((p) => (
            <circle
              key={`wr-point-${p.index}`}
              cx={toX(p.index)}
              cy={toY(p.whiteWinrate)}
              r={2.8}
              className="graph-point"
            />
          ))}

          {points.map((p) => {
            if (p.index > 0 && p.index % xTickStep === 0) {
              const x = toX(p.index)
              return (
                <g key={`x-${p.index}`}>
                  <line x1={x} x2={x} y1={height - padBottom} y2={height - padBottom + 6} className="graph-tick-line" />
                  <text x={x} y={height - padBottom + 20} className="graph-grid-text" textAnchor="middle">{formatGraphAxisLabel(p)}</text>
                </g>
              )
            }
            return null
          })}

          {currentLineX !== null && (
            <line
              x1={currentLineX}
              x2={currentLineX}
              y1={padTop}
              y2={height - padBottom}
              className="graph-cursor-line"
            />
          )}
          {readoutIndex !== null && (
            <GraphReadout
              x={toX(readoutIndex)}
              padLeft={padLeft}
              padTop={padTop}
              height={height}
              padBottom={padBottom}
              text={formatWinrateReadout(readoutPoint, readoutIndex)}
            />
          )}
        </svg>
      </div>
    </div>
  )
})

type WdlProgressGraphProps = {
  points: WdlPoint[]
  currentIndex?: number
  /** See {@link WinrateGraphProps}. */
  lastPlyIndex?: number
  onNavigate?: (index: number) => void
}

export const WdlProgressGraph = memo(function WdlProgressGraph({ points, currentIndex, lastPlyIndex, onNavigate }: WdlProgressGraphProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const available = useElementWidth(scrollRef, GRAPH_FALLBACK_WIDTH)
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const [focused, setFocused] = useState(false)
  if (points.length === 0) {
    return (
      <div className="empty-state">
        <span className="empty-state-icon" aria-hidden="true"><IconBarChart /></span>
        <p>Analyze moves with WDL enabled to build the W/D/L progression graph.</p>
      </div>
    )
  }

  const {
    maxIndex, width, height, padLeft, padRight, padTop, padBottom,
    toX, toY, markers, xTickStep, isNavigable, selectedIndex, handleClick, handleKeyDown, indexAtClientX,
  } = trendGraphGeometry(points, available, currentIndex, onNavigate, lastPlyIndex)

  const buildPath = (selector: (point: WdlPoint) => number): string =>
    points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(p.index).toFixed(2)} ${toY(selector(p)).toFixed(2)}`).join(' ')

  const whitePath = buildPath((p) => p.white)
  const drawPath = buildPath((p) => p.draw)
  const blackPath = buildPath((p) => p.black)
  const selectedPoint = points.find(point => point.index === selectedIndex)
  const readoutIndex = hoverIndex ?? (focused && isNavigable ? selectedIndex : null)
  const readoutPoint = readoutIndex === null ? undefined : points.find(point => point.index === readoutIndex)

  const currentLineX = currentIndex !== undefined && maxIndex > 0
    ? toX(selectedIndex)
    : null

  return (
    <div className="graph-wrap" aria-label="WDL progression graph">
      <div className="graph-scroll" ref={scrollRef}>
        <svg
          className="winrate-graph"
          width={width}
          viewBox={`0 0 ${width} ${height}`}
          role={isNavigable ? 'slider' : 'img'}
          tabIndex={isNavigable ? 0 : undefined}
          aria-label={isNavigable ? 'WDL trend move navigator' : 'WDL progression graph'}
          aria-valuemin={isNavigable ? 0 : undefined}
          aria-valuemax={isNavigable ? maxIndex : undefined}
          aria-valuenow={isNavigable ? selectedIndex : undefined}
          aria-valuetext={isNavigable ? describeWdlPosition(selectedPoint, selectedIndex) : undefined}
          onClick={handleClick}
          onKeyDown={handleKeyDown}
          onMouseMove={maxIndex > 0 ? e => setHoverIndex(indexAtClientX(e.currentTarget, e.clientX)) : undefined}
          onMouseLeave={() => setHoverIndex(null)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{ cursor: isNavigable ? 'pointer' : 'default' }}
        >
          {markers.map(v => {
            const y = toY(v)
            return (
              <g key={v}>
                <line x1={padLeft} x2={width - padRight} y1={y} y2={y} className="graph-grid-line" />
                <text x={padLeft - 8} y={y + 4} className="graph-grid-text" textAnchor="end">{v}%</text>
              </g>
            )
          })}

          <path d={whitePath} className="graph-line graph-line-white" />
          <path d={drawPath} className="graph-line graph-line-draw" />
          <path d={blackPath} className="graph-line graph-line-black" />
          {points.length === 1 && (
            <>
              <circle cx={toX(points[0]!.index)} cy={toY(points[0]!.white)} r={2.8} className="graph-point graph-point-white" />
              <circle cx={toX(points[0]!.index)} cy={toY(points[0]!.draw)} r={2.8} className="graph-point graph-point-draw" />
              <circle cx={toX(points[0]!.index)} cy={toY(points[0]!.black)} r={2.8} className="graph-point graph-point-black" />
            </>
          )}

          {points.map((p) => {
            if (p.index > 0 && p.index % xTickStep === 0) {
              const x = toX(p.index)
              return (
                <g key={`wdl-x-${p.index}`}>
                  <line x1={x} x2={x} y1={height - padBottom} y2={height - padBottom + 6} className="graph-tick-line" />
                  <text x={x} y={height - padBottom + 20} className="graph-grid-text" textAnchor="middle">{formatGraphAxisLabel(p)}</text>
                </g>
              )
            }
            return null
          })}

          {currentLineX !== null && (
            <line
              x1={currentLineX}
              x2={currentLineX}
              y1={padTop}
              y2={height - padBottom}
              className="graph-cursor-line"
            />
          )}
          {readoutIndex !== null && (
            <GraphReadout
              x={toX(readoutIndex)}
              padLeft={padLeft}
              padTop={padTop}
              height={height}
              padBottom={padBottom}
              text={formatWdlReadout(readoutPoint, readoutIndex)}
            />
          )}
        </svg>
      </div>
    </div>
  )
})

type MoveTimesGraphProps = {
  points: MoveTimePoint[]
  currentIndex?: number
  /** See {@link WinrateGraphProps}. */
  lastPlyIndex?: number
  onNavigate?: (index: number) => void
}

/** The readout for a move-time bar, or for a ply that has no reading. */
function formatMoveTimeReadout(point: MoveTimePoint | undefined, index: number): string {
  if (index <= 0) return 'Start'
  if (!point) return `Move ${index} · no clock`
  return `${point.label} · ${formatMoveTime(point.seconds)}`
}

function describeMoveTimePosition(point: MoveTimePoint | undefined, index: number): string {
  const where = formatGraphPositionLabel(point, index)
  return point
    ? `${where}, ${point.side === 'w' ? 'White' : 'Black'} spent ${formatMoveTime(point.seconds)}`
    : where
}

/**
 * How long each move took, White's bars up from the midline and Black's
 * down, the way Lichess draws it. The review list prints the clock beside
 * each move; this is the same evidence as a shape -- the long think before a
 * blunder, the flurry of instant moves in time trouble -- which is what a
 * reader wants to see at a glance rather than read off sixty rows.
 *
 * Bars rather than a line, because a move's time is a quantity of its own,
 * not a reading of a position that flows into the next.
 */
export const MoveTimesGraph = memo(function MoveTimesGraph({ points, currentIndex, lastPlyIndex, onNavigate }: MoveTimesGraphProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const available = useElementWidth(scrollRef, GRAPH_FALLBACK_WIDTH)
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const [focused, setFocused] = useState(false)
  if (points.length === 0) {
    return (
      <div className="empty-state">
        <span className="empty-state-icon" aria-hidden="true"><IconClock /></span>
        <p>Move times appear for a timed game, or a PGN with clock readings.</p>
      </div>
    )
  }

  const {
    maxIndex, width, height, padLeft, padRight, padTop, padBottom,
    innerWidth, innerHeight, toX, xTickStep, isNavigable, selectedIndex, handleClick, handleKeyDown, indexAtClientX,
  } = trendGraphGeometry(points, available, currentIndex, onNavigate, lastPlyIndex)

  // One scale for both sides, so a bar can be read against any other.
  const longest = Math.max(1, ...points.map(point => point.seconds))
  const midY = padTop + innerHeight / 2
  const halfHeight = innerHeight / 2 - 2
  const barHeight = (seconds: number) => Math.max(1, (seconds / longest) * halfHeight)
  // As wide as the plies allow, never wider than a step between them.
  const barWidth = Math.max(1.5, Math.min(7, (maxIndex > 0 ? innerWidth / maxIndex : innerWidth) * 0.7))

  const selectedPoint = points.find(point => point.index === selectedIndex)
  const readoutIndex = hoverIndex ?? (focused && isNavigable ? selectedIndex : null)
  const readoutPoint = readoutIndex === null ? undefined : points.find(point => point.index === readoutIndex)
  const currentLineX = currentIndex !== undefined && maxIndex > 0 ? toX(selectedIndex) : null

  return (
    <div className="graph-wrap" aria-label="Move times graph">
      <div className="graph-scroll" ref={scrollRef}>
        <svg
          className="winrate-graph"
          width={width}
          viewBox={`0 0 ${width} ${height}`}
          role={isNavigable ? 'slider' : 'img'}
          tabIndex={isNavigable ? 0 : undefined}
          aria-label={isNavigable ? 'Move times navigator' : 'Move times graph'}
          aria-valuemin={isNavigable ? 0 : undefined}
          aria-valuemax={isNavigable ? maxIndex : undefined}
          aria-valuenow={isNavigable ? selectedIndex : undefined}
          aria-valuetext={isNavigable ? describeMoveTimePosition(selectedPoint, selectedIndex) : undefined}
          onClick={handleClick}
          onKeyDown={handleKeyDown}
          onMouseMove={maxIndex > 0 ? e => setHoverIndex(indexAtClientX(e.currentTarget, e.clientX)) : undefined}
          onMouseLeave={() => setHoverIndex(null)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{ cursor: isNavigable ? 'pointer' : 'default' }}
        >
          {/* The scale, once at each end: White's longest think reads at the
              top, Black's at the bottom, and the midline is zero for both. */}
          <line x1={padLeft} x2={width - padRight} y1={midY} y2={midY} className="graph-grid-line" />
          <text x={padLeft - 8} y={padTop + 4} className="graph-grid-text" textAnchor="end">{formatMoveTime(longest)}</text>
          <text x={padLeft - 8} y={midY + 4} className="graph-grid-text" textAnchor="end">0</text>
          <text x={padLeft - 8} y={height - padBottom + 4} className="graph-grid-text" textAnchor="end">{formatMoveTime(longest)}</text>

          {points.map(point => {
            const x = toX(point.index) - barWidth / 2
            const h = barHeight(point.seconds)
            return (
              <rect
                key={`mt-${point.index}`}
                x={x}
                y={point.side === 'w' ? midY - h : midY}
                width={barWidth}
                height={h}
                className={`graph-bar ${point.side === 'w' ? 'graph-bar-white' : 'graph-bar-black'}`}
              />
            )
          })}

          {points.map((p) => {
            if (p.index > 0 && p.index % xTickStep === 0) {
              const x = toX(p.index)
              return (
                <g key={`mt-x-${p.index}`}>
                  <line x1={x} x2={x} y1={height - padBottom} y2={height - padBottom + 6} className="graph-tick-line" />
                  <text x={x} y={height - padBottom + 20} className="graph-grid-text" textAnchor="middle">{formatGraphAxisLabel(p)}</text>
                </g>
              )
            }
            return null
          })}

          {currentLineX !== null && (
            <line x1={currentLineX} x2={currentLineX} y1={padTop} y2={height - padBottom} className="graph-cursor-line" />
          )}
          {readoutIndex !== null && (
            <GraphReadout
              x={toX(readoutIndex)}
              padLeft={padLeft}
              padTop={padTop}
              height={height}
              padBottom={padBottom}
              text={formatMoveTimeReadout(readoutPoint, readoutIndex)}
            />
          )}
        </svg>
      </div>
    </div>
  )
})
