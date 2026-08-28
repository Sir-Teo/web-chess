/**
 * Short labels describing the shape of a game — "Comeback", "Wire-to-wire" —
 * derived from the winrate series a review already builds.
 *
 * Ported from web-katrain's narrativeTags.ts. Two differences: chess has no
 * point margin, so the blowout/close tags do not carry over, and the series
 * here is White win percentage on 0-100 rather than 0-1.
 */

import type { WinratePoint } from './analysis'

export type NarrativeTagTone = 'good' | 'bad' | 'neutral'

export type NarrativeTag = {
  id: string
  label: string
  tone: NarrativeTagTone
  title: string
}

export type GameWinner = 'white' | 'black' | 'draw' | null

/** The eventual winner dipped to or below this win percentage. */
const COMEBACK_LOW = 30
/** The eventual loser reached or passed this win percentage. */
const MISSED_WIN_HIGH = 85
/** The winner never crossed below this after the opening. */
const WIRE_LEVEL = 50
/** A decisive game that never strayed further than this from even. */
const TIGHT_BAND = 15
/** Below this many analyzed moves a game has no arc worth describing. */
const MIN_POINTS = 6

export function parseGameResult(result?: string | null): GameWinner {
  const trimmed = result?.trim()
  if (!trimmed) return null
  if (trimmed === '1-0') return 'white'
  if (trimmed === '0-1') return 'black'
  if (trimmed === '1/2-1/2' || trimmed === '½-½') return 'draw'
  return null
}

/**
 * `points` is the White-winrate series in move order. `result` refines the
 * winner; without it the final winrate decides.
 */
export function narrativeTags(points: WinratePoint[], result?: string | null): NarrativeTag[] {
  if (!points || points.length < MIN_POINTS) return []

  const ordered = [...points].sort((a, b) => a.index - b.index)
  const series = ordered.map(point => point.whiteWinrate)
  const finalWhite = series[series.length - 1]

  const declared = parseGameResult(result)
  const winner: GameWinner = declared
    ?? (Math.abs(finalWhite - 50) < 2 ? 'draw' : finalWhite >= 50 ? 'white' : 'black')

  if (winner === 'draw') {
    return [{ id: 'draw', label: 'Draw', tone: 'neutral', title: 'The game was drawn.' }]
  }
  if (winner === null) return []

  // The opening is noisy, so judge swings from a fifth of the way in.
  const start = Math.min(series.length - 1, Math.max(2, Math.floor(series.length * 0.2)))
  const midGame = series.slice(start)
  const minWhite = Math.min(...midGame)
  const maxWhite = Math.max(...midGame)

  const tags: NarrativeTag[] = []
  const winnerName = winner === 'white' ? 'White' : 'Black'
  const loserName = winner === 'white' ? 'Black' : 'White'

  const winnerLowest = winner === 'white' ? minWhite : 100 - maxWhite
  const loserHighest = winner === 'white' ? 100 - minWhite : maxWhite

  if (winnerLowest <= COMEBACK_LOW) {
    tags.push({
      id: 'comeback',
      label: 'Comeback',
      tone: 'good',
      title: `${winnerName} recovered from a losing position to win.`,
    })
  } else if (winnerLowest >= WIRE_LEVEL) {
    tags.push({
      id: 'wire',
      label: 'Wire-to-wire',
      tone: 'neutral',
      title: `${winnerName} led from the opening on.`,
    })
  }

  if (loserHighest >= MISSED_WIN_HIGH) {
    tags.push({
      id: 'missedWin',
      label: 'Missed win',
      tone: 'bad',
      title: `${loserName} reached a winning position and lost.`,
    })
  }

  // A decisive game that never opened up. Without this most real games earn no
  // tag at all: katrain fills that space with point-margin tags, which chess
  // has no equivalent of.
  if (!tags.length) {
    const widest = Math.max(Math.abs(maxWhite - 50), Math.abs(50 - minWhite))
    if (widest <= TIGHT_BAND) {
      tags.push({
        id: 'tight',
        label: 'Nail-biter',
        tone: 'neutral',
        title: `The game stayed close throughout before ${winnerName} won.`,
      })
    }
  }

  return tags
}

export function narrativeTagToneClass(tone: NarrativeTagTone): string {
  switch (tone) {
    case 'good':
      return 'chip-narrative chip-narrative-good'
    case 'bad':
      return 'chip-narrative chip-narrative-bad'
    default:
      return 'chip-narrative'
  }
}
