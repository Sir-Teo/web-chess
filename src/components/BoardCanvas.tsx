import { memo } from 'react'
import type { Move, Square } from 'chess.js'
import {
  Chessboard, defaultArrowOptions, fenStringToPositionObject,
  type Arrow, type ChessboardOptions, type PieceDropHandlerArgs,
} from 'react-chessboard'
import { moveHintStyle, notationHalo, type BoardTheme } from '../engine/boardThemes'
import { CHECK_SQUARE_STYLE, MARK_COLORS, checkedKingSquare, lastMoveSquareStyle, selectedSquareStyle, squareMarkStyle, type SquareMarks } from '../engine/boardMarks'
import type { Premove } from '../engine/premove'

const ARROW_OPTIONS = {
  ...defaultArrowOptions,
  arrowWidthDenominator: 7,
  arrowStartOffset: 0.32,
  color: MARK_COLORS.primary,
  secondaryColor: MARK_COLORS.alternate,
  tertiaryColor: MARK_COLORS.tertiary,
}
const PREMOVE_STYLE = {
  boxShadow: `inset 0 0 0 4px ${MARK_COLORS.primary}`,
  backgroundColor: 'rgba(59, 130, 246, 0.28)',
}
const PREVIEW_STYLE = {
  boxShadow: 'inset 0 0 0 3px rgba(63, 185, 80, 0.85)',
  backgroundColor: 'rgba(63, 185, 80, 0.22)',
}
const LAST_MOVE_STYLE = lastMoveSquareStyle()
const SELECTED_STYLE = selectedSquareStyle()
const NOTATION_STYLE = {
  position: 'absolute' as const,
  fontWeight: 700,
  lineHeight: 1,
  userSelect: 'none' as const,
  pointerEvents: 'none' as const,
}

type Props = {
  position: string
  orientation: 'white' | 'black'
  width: number
  notationFontSize: string
  theme: BoardTheme
  previewMove: string | undefined
  lastMove: Move | null
  premove: Premove | null
  markedSquares: SquareMarks
  selectedSquare: Square | null
  legalTargets: Square[]
  /** False under the blindfold, where the ring would say where the king stands. */
  showCheck: boolean
  arrows: Arrow[]
  allowDrawingArrows: boolean
  allowDragging: boolean
  reduceMotion: boolean
  onPieceDrop: (args: PieceDropHandlerArgs) => boolean
  onSquareClick: (square: Square) => void
  onSquareMouseDown: ChessboardOptions['onSquareMouseDown']
  onSquareMouseUp: ChessboardOptions['onSquareMouseUp']
}

/** Only board changes should update the library's context and its 64 squares. */
export const BoardCanvas = memo(function BoardCanvas({
  position, orientation, width, notationFontSize, theme, previewMove, lastMove,
  premove, markedSquares, selectedSquare, legalTargets, showCheck, arrows, allowDrawingArrows,
  allowDragging, reduceMotion, onPieceDrop, onSquareClick, onSquareMouseDown, onSquareMouseUp,
}: Props) {
  const pieces = legalTargets.length ? fenStringToPositionObject(position, 8, 8) : {}
  const checkSquare = showCheck ? checkedKingSquare(position) : null
  return (
    <Chessboard options={{
      position,
      boardOrientation: orientation,
      onPieceDrop,
      onSquareClick: ({ square }) => onSquareClick(square as Square),
      onSquareMouseDown,
      onSquareMouseUp,
      squareStyles: previewMove ? {
        [previewMove.slice(0, 2)]: PREVIEW_STYLE,
        [previewMove.slice(2, 4)]: PREVIEW_STYLE,
      } : {
        // Played move, premove, marks, selection and legal targets retain
        // their existing order, so the most immediate interaction wins.
        ...(lastMove ? { [lastMove.from]: LAST_MOVE_STYLE, [lastMove.to]: LAST_MOVE_STYLE } : {}),
        ...(checkSquare ? { [checkSquare]: CHECK_SQUARE_STYLE } : {}),
        ...(premove ? { [premove.from]: PREMOVE_STYLE, [premove.to]: PREMOVE_STYLE } : {}),
        ...Object.fromEntries(Object.entries(markedSquares).map(([square, color]) => [square, squareMarkStyle(color)])),
        ...(selectedSquare ? { [selectedSquare]: SELECTED_STYLE } : {}),
        ...Object.fromEntries(legalTargets.map(square => [square, moveHintStyle(theme, Boolean(pieces[square]))])),
      },
      arrows,
      arrowOptions: ARROW_OPTIONS,
      darkSquareNotationStyle: { color: theme.ink, textShadow: notationHalo(theme.dark) },
      lightSquareNotationStyle: { color: theme.ink, textShadow: notationHalo(theme.light) },
      alphaNotationStyle: { ...NOTATION_STYLE, bottom: 2, right: 3, fontSize: notationFontSize },
      numericNotationStyle: { ...NOTATION_STYLE, top: 2, left: 3, fontSize: notationFontSize },
      allowDrawingArrows,
      allowDragging,
      // A finger can drift before it intends to drag; preserve the tested
      // 8px threshold that lets a touch select a piece.
      dragActivationDistance: 8,
      showAnimations: !reduceMotion,
      darkSquareStyle: { backgroundColor: theme.dark },
      lightSquareStyle: { backgroundColor: theme.light },
      boardStyle: {
        width: `${width}px`,
        maxWidth: '100%',
        borderRadius: 12,
        boxShadow: '0 8px 40px rgba(0, 0, 0, 0.60), 0 2px 8px rgba(0, 0, 0, 0.40)',
      },
    }} />
  )
}, (previous, next) => {
  // Engine telemetry makes a fresh arrow list even when its geometry and
  // colors stay identical. Compare those values; compare every other prop,
  // including every callback, by identity so input cannot keep an old handler.
  const keys = Object.keys(previous) as Array<keyof Props>
  return keys.length === Object.keys(next).length && keys.every(key => {
    if (key !== 'arrows') return Object.is(previous[key], next[key])
    return previous.arrows.length === next.arrows.length && previous.arrows.every((arrow, index) => {
      const other = next.arrows[index]
      return arrow.startSquare === other.startSquare && arrow.endSquare === other.endSquare && arrow.color === other.color
    })
  })
})
