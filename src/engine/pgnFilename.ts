import { withoutAppPlaceholder } from './pgnPlaceholders'

/**
 * The name a downloaded game is saved under.
 *
 * Every download was `web-chess-<today>.pgn`, whatever it held: Carlsen v
 * Nepomniachtchi from 2021 saved as `web-chess-2026-09-27.pgn`, and the second
 * game saved that day became `(1)`. The file is named for the game instead --
 * its players, or its event, or its opening -- and dated by the game when the
 * PGN says when it was played.
 */
export function pgnDownloadFilename(
  headers: Record<string, string | undefined>,
  openingName?: string,
  today: Date = new Date(),
): string {
  const white = surname(withoutAppPlaceholder('White', known(headers.White)))
  const black = surname(withoutAppPlaceholder('Black', known(headers.Black)))
  const players = white && black ? `${white} vs ${black}` : white || black
  const label = players || withoutAppPlaceholder('Event', known(headers.Event)) || openingName?.trim()
  const slug = slugify(label ?? '') || 'web-chess'
  return `${slug}-${gameDate(headers.Date) ?? today.toISOString().slice(0, 10)}.pgn`
}

function known(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed && trimmed !== '?' && trimmed !== '-' ? trimmed : undefined
}

/** "Carlsen, Magnus" is filed under Carlsen; a single name stays whole. */
function surname(name: string | undefined): string | undefined {
  return name?.split(',')[0]?.trim() || undefined
}

/** A complete PGN date, `2021.12.03`, as `2021-12-03`; nothing for `2021.??.??`. */
function gameDate(value: string | undefined): string | undefined {
  const match = value?.trim().match(/^(\d{4})\.(\d{2})\.(\d{2})$/)
  return match ? `${match[1]}-${match[2]}-${match[3]}` : undefined
}

function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '')
}
