import { useCallback, useEffect, useRef, useState } from 'react'
import {
  MAX_LIBRARY_GAMES,
  MAX_LIBRARY_PGN_LENGTH,
  type LibraryGame,
  createLibraryBackup,
  createLibraryGame,
  getUniqueGameName,
  normalizeLibraryGames,
  parseLibraryBackup,
  suggestGameName,
} from '../engine/gameLibrary'
import { loadLibraryGames, saveLibraryGames } from '../engine/gameLibraryStorage'

export type LibraryWriteResult = { ok: true; game?: LibraryGame } | { ok: false; error: string }

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

  const importBackup = useCallback((json: string): LibraryWriteResult => {
    const restored = parseLibraryBackup(json, Date.now())
    if (!restored.length) return { ok: false, error: 'That file is not a web-chess library backup.' }

    // Merge rather than replace, renaming anything that collides.
    const existingNames = gamesRef.current.map(game => game.name)
    const existingIds = new Set(gamesRef.current.map(game => game.id))
    const additions: LibraryGame[] = []
    for (const game of restored) {
      if (existingIds.has(game.id)) continue
      const name = getUniqueGameName(game.name, [...existingNames, ...additions.map(item => item.name)])
      additions.push({ ...game, name })
    }
    if (!additions.length) return { ok: false, error: 'Every game in that backup is already in the library.' }

    commit([...additions, ...gamesRef.current])
    return { ok: true }
  }, [commit])

  return {
    games,
    loaded,
    saveGame,
    renameGame,
    deleteGame,
    toggleFavorite,
    clearLibrary,
    exportBackup,
    importBackup,
  }
}
