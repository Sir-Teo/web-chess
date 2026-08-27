import { useEffect, useMemo, useState } from 'react'
import {
  fetchOpeningExplorer,
  getCachedOpeningExplorer,
  hasOpeningExplorerAuthToken,
  normalizeOpeningExplorerFenKey,
  type OpeningDatabaseSource,
  type OpeningExplorerResponse,
  type OpeningSpeed,
} from '../engine/openingExplorer'
import { withBoundedRecordEntry, withoutRecordEntry } from './cacheLimit'

export type UseOpeningExplorerArgs = {
  source: OpeningDatabaseSource
  fen?: string
  moves: string[]
  speeds?: OpeningSpeed[]
  ratings?: number[]
  authToken?: string
  enabled?: boolean
  debounceMs?: number
}

export type OpeningExplorerState = {
  data: OpeningExplorerResponse | null
  loading: boolean
  error: string | null
  stale: boolean
  authRequired: boolean
}

const LOCAL_OPENING_DATA_LIMIT = 80
const LOCAL_OPENING_ERROR_LIMIT = 40

export function useOpeningExplorer(args: UseOpeningExplorerArgs): OpeningExplorerState {
  const enabled = args.enabled ?? true
  const debounceMs = args.debounceMs ?? 250
  const fenInput = args.fen?.trim().replace(/\s+/g, ' ') ?? ''
  const fenKey = normalizeOpeningExplorerFenKey(args.fen)
  const movesKey = args.moves.map(move => move.trim().toLowerCase()).filter(Boolean).join(',')
  const speedsKey = (args.speeds ?? []).slice().sort().join(',')
  const ratingsKey = (args.ratings ?? []).slice().sort((a, b) => a - b).join(',')
  const hasAuth = hasOpeningExplorerAuthToken(args.authToken)
  const authKey = hasAuth ? 'auth' : 'anon'
  const normalizedMoves = useMemo(() => (movesKey ? movesKey.split(',') : []), [movesKey])
  const normalizedSpeeds = useMemo(
    () => (speedsKey ? speedsKey.split(',') : []) as OpeningSpeed[],
    [speedsKey],
  )
  const normalizedRatings = useMemo(
    () => (ratingsKey ? ratingsKey.split(',').map(value => Number(value)).filter(Number.isFinite) : []),
    [ratingsKey],
  )
  const requestKey = [args.source, fenKey, movesKey, speedsKey, ratingsKey, authKey].join('|')

  const [dataByKey, setDataByKey] = useState<Record<string, OpeningExplorerResponse>>({})
  const [errorByKey, setErrorByKey] = useState<Record<string, string>>({})
  const hasLocalData = Boolean(dataByKey[requestKey])

  const cachedData = enabled
    ? getCachedOpeningExplorer({
        source: args.source,
        fen: fenInput || undefined,
        moves: normalizedMoves,
        speeds: normalizedSpeeds,
        ratings: normalizedRatings,
      })
    : null
  const data = enabled ? dataByKey[requestKey] ?? cachedData ?? null : null
  const error = enabled ? errorByKey[requestKey] ?? null : null

  useEffect(() => {
    if (!enabled) return
    if (hasLocalData) return
    if (getCachedOpeningExplorer({
      source: args.source,
      fen: fenInput || undefined,
      moves: normalizedMoves,
      speeds: normalizedSpeeds,
      ratings: normalizedRatings,
    })) {
      return
    }
    if (!hasAuth) return

    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      void fetchOpeningExplorer(
        {
          source: args.source,
          fen: fenInput || undefined,
          moves: normalizedMoves,
          speeds: normalizedSpeeds,
          ratings: normalizedRatings,
          authToken: args.authToken,
        },
        controller.signal,
      )
        .then(payload => {
          if (controller.signal.aborted) return
          setDataByKey(previous => {
            if (previous[requestKey]) return previous
            return withBoundedRecordEntry(previous, requestKey, payload, LOCAL_OPENING_DATA_LIMIT)
          })
          setErrorByKey(previous => {
            return withoutRecordEntry(previous, requestKey)
          })
        })
        .catch(fetchError => {
          if (controller.signal.aborted) return
          const message = fetchError instanceof Error ? fetchError.message : String(fetchError)
          setErrorByKey(previous => withBoundedRecordEntry(previous, requestKey, message, LOCAL_OPENING_ERROR_LIMIT))
        })
    }, debounceMs)

    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [
    args.source,
    args.authToken,
    authKey,
    debounceMs,
    enabled,
    fenInput,
    fenKey,
    hasAuth,
    hasLocalData,
    movesKey,
    normalizedMoves,
    normalizedRatings,
    normalizedSpeeds,
    ratingsKey,
    requestKey,
    speedsKey,
  ])

  const authRequired = enabled && !data && !hasAuth
  const loading = enabled && !authRequired && !data && !error
  const stale = enabled && Boolean(data) && !getCachedOpeningExplorer({
    source: args.source,
    fen: fenInput || undefined,
    moves: normalizedMoves,
    speeds: normalizedSpeeds,
    ratings: normalizedRatings,
  })

  return {
    data,
    loading,
    error,
    stale,
    authRequired,
  }
}
