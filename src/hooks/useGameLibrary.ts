import { useCallback, useEffect, useRef, useState } from 'react'
import {
  MAX_LIBRARY_GAMES,
  MAX_LIBRARY_PGN_LENGTH,
  type LibraryGame,
  createLibraryBackup,
  backupMergeNote,
  createLibraryGame,
  createLibraryPgn,
  getUniqueGameName,
  mergeLibraryBackup,
  normalizeLibraryGames,
  parseLibraryBackup,
  suggestGameName,
} from '../engine/gameLibrary'
import { libraryImportNote, pgnVariantName } from '../engine/gameLibrary'
import { parsePgnMoveTree } from '../engine/pgn'
import { loadLibraryGames, saveLibraryGames } from '../engine/gameLibraryStorage'

/**
 * `note` is for a write that succeeded but not entirely as asked -- a backup
 * merge that skipped games, say. The caller shows it instead of the plain
 * confirmation, so a partial result is never reported as a clean one.
 */
export type LibraryWriteResult =
  | { ok: true; game?: LibraryGame; note?: string }
  | { ok: false; error: string }

export const LIBRARY_FULL_ERROR = `The library holds ${MAX_LIBRARY_GAMES} games. Delete one before saving another.`
export const LIBRARY_EMPTY_PGN_ERROR = 'There is nothing to save yet — play or import a game first.'
export const LIBRARY_PGN_TOO_LONG_ERROR = 'That game is too long to save.'

/**
 * Owns the saved-games list. Deliberately thin: every decision it makes lives
 * in engine/gameLibrary, which is testable without a browser.
 */
export function useGameLibrary() {
  const [games, setGames] = useState<LibraryGame[]>([])
  const [loaded, setLoaded] = useState(false)
  // Writes are fire-and-forget, so keep the latest list for callers that fire
  // twice before React has re-rendered.
  const gamesRef = useRef<LibraryGame[]>([])

  useEffect(() => {
    let cancelled = false
    void loadLibraryGames().then(stored => {
      if (cancelled) return
      gamesRef.current = stored
      setGames(stored)
      setLoaded(true)
    })
    return () => { cancelled = true }
  }, [])

  const commit = useCallback((next: LibraryGame[]) => {
    const normalized = normalizeLibraryGames(next)
    gamesRef.current = normalized
    setGames(normalized)
    void saveLibraryGames(normalized)
    return normalized
  }, [])

  const saveGame = useCallback((name: string, pgn: string): LibraryWriteResult => {
    const text = pgn?.trim() ?? ''
    if (!text) return { ok: false, error: LIBRARY_EMPTY_PGN_ERROR }
    if (text.length > MAX_LIBRARY_PGN_LENGTH) return { ok: false, error: LIBRARY_PGN_TOO_LONG_ERROR }
    if (gamesRef.current.length >= MAX_LIBRARY_GAMES) return { ok: false, error: LIBRARY_FULL_ERROR }

    const wanted = name.trim() || suggestGameName(text)
    const unique = getUniqueGameName(wanted, gamesRef.current.map(game => game.name))
    const game = createLibraryGame(unique, text, Date.now())
    commit([game, ...gamesRef.current])
    return { ok: true, game }
  }, [commit])

  const renameGame = useCallback((id: string, name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    const others = gamesRef.current.filter(game => game.id !== id).map(game => game.name)
    const unique = getUniqueGameName(trimmed, others)
    commit(gamesRef.current.map(game => (
      game.id === id ? { ...game, name: unique, updatedAt: Date.now() } : game
    )))
  }, [commit])

  const deleteGame = useCallback((id: string) => {
    commit(gamesRef.current.filter(game => game.id !== id))
  }, [commit])

  const toggleFavorite = useCallback((id: string) => {
    commit(gamesRef.current.map(game => (
      game.id === id ? { ...game, favorite: !game.favorite } : game
    )))
  }, [commit])

  const clearLibrary = useCallback(() => { commit([]) }, [commit])

  const exportBackup = useCallback(() => createLibraryBackup(gamesRef.current), [])

  /** The same games as a PGN database, which every other chess program reads. */
  const exportPgn = useCallback(() => createLibraryPgn(gamesRef.current), [])

  /**
   * Add every game in a database file, which is how Lichess and chess.com hand
   * games over. Each is parsed before it is kept: a file with a broken game in
   * it should lose that game, not the import, and certainly not go into the
   * library as something that will fail to open later.
   */
  const importGames = useCallback((pgns: string[]): LibraryWriteResult => {
    const room = MAX_LIBRARY_GAMES - gamesRef.current.length
    if (room <= 0) return { ok: false, error: LIBRARY_FULL_ERROR }

    const names = gamesRef.current.map(game => game.name)
    const additions: LibraryGame[] = []
    const variants: Record<string, number> = {}
    let unreadable = 0
    let omitted = 0

    for (const pgn of pgns) {
      const text = pgn?.trim() ?? ''
      if (!text || text.length > MAX_LIBRARY_PGN_LENGTH) { unreadable++; continue }
      // Asked before parsing, not after it fails: a Chess960 game is refused by
      // chess.js for its castling rights, and counting it as unreadable told a
      // reader their own archive was damaged when it was this board's limit.
      const variant = pgnVariantName(text)
      if (variant) {
        variants[variant] = (variants[variant] ?? 0) + 1
        continue
      }
      try {
        if (!parsePgnMoveTree(text).moves.length) { unreadable++; continue }
      } catch {
        unreadable++
        continue
      }
      if (additions.length >= room) { omitted++; continue }
      const name = getUniqueGameName(
        suggestGameName(text),
        [...names, ...additions.map(item => item.name)],
      )
      additions.push(createLibraryGame(name, text, Date.now()))
    }

    if (!additions.length) {
      return {
        ok: false,
        error: omitted > 0
          ? `The library is full at ${MAX_LIBRARY_GAMES} games, so none of those could be added.`
          : Object.keys(variants).length > 0
          ? `Those are all ${Object.keys(variants).sort().join(' and ')} games, which this board does not play.`
          : 'No readable game was found in that file.',
      }
    }

    commit([...additions, ...gamesRef.current])
    return { ok: true, note: libraryImportNote({ added: additions.length, unreadable, omitted, variants }) ?? undefined }
  }, [commit])

  const importBackup = useCallback((json: string): LibraryWriteResult => {
    const restored = parseLibraryBackup(json, Date.now())
    if (!restored.length) return { ok: false, error: 'That file is not a web-chess library backup.' }

    // Merge rather than replace, renaming collisions and respecting the cap:
    // handing the whole lot to `commit` used to drop the reader's own games
    // off the end of it.
    const merge = mergeLibraryBackup(gamesRef.current, restored)
    if (!merge.added) {
      return {
        ok: false,
        error: merge.omitted > 0
          ? `The library is full at ${MAX_LIBRARY_GAMES} games, so none of that backup could be added.`
          : 'Every game in that backup is already in the library.',
      }
    }

    commit(merge.games)
    const note = backupMergeNote(merge)
    return note ? { ok: true, note } : { ok: true }
  }, [commit])

  return {
    games,
    loaded,
    saveGame,
    importGames,
    renameGame,
    deleteGame,
    toggleFavorite,
    clearLibrary,
    exportBackup,
    exportPgn,
    importBackup,
  }
}
