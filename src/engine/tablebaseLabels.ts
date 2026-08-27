import {
  tablebaseMoveCategoryForPlayer,
  type TablebaseCategory,
  type TablebaseMove,
  type TablebaseResult,
} from './tablebase'

const TABLEBASE_CATEGORY_LABELS: Record<TablebaseCategory, string> = {
  win: 'Win',
  unknown: 'Unknown',
  'syzygy-win': 'Win',
  'maybe-win': 'Maybe win',
  'cursed-win': 'Cursed win',
  draw: 'Draw',
  'blessed-loss': 'Blessed loss',
  'maybe-loss': 'Maybe loss',
  'syzygy-loss': 'Loss',
  loss: 'Loss',
}

function formatTablebaseDistance(label: string, value: number | null | undefined): string | null {
  return typeof value === 'number' && value !== 0 ? `${label} ${Math.abs(value)}` : null
}

export function tablebaseSummary(result: TablebaseResult): string {
  return [
    TABLEBASE_CATEGORY_LABELS[result.category],
    formatTablebaseDistance('DTM', result.dtm),
    formatTablebaseDistance('DTC', result.dtc),
    formatTablebaseDistance('DTZ', result.preciseDtz ?? result.dtz),
  ].filter(Boolean).join(' · ')
}

export function tablebaseMoveSummary(move: TablebaseMove): string {
  const playerCategory = tablebaseMoveCategoryForPlayer(move.category)

  return [
    TABLEBASE_CATEGORY_LABELS[playerCategory],
    formatTablebaseDistance('DTM', move.dtm),
    formatTablebaseDistance('DTC', move.dtc),
    formatTablebaseDistance('DTZ', move.preciseDtz ?? move.dtz),
  ].filter(Boolean).join(' · ')
}

export function tablebaseMoveAriaLabel(move: TablebaseMove): string {
  const summary = tablebaseMoveSummary(move)
  return summary ? `${move.san}: ${summary}. UCI ${move.uci}` : `${move.san}. UCI ${move.uci}`
}
