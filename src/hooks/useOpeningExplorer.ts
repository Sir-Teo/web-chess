import { useEffect, useMemo, useState } from 'react'
import {
  fetchOpeningExplorer,
  getCachedOpeningExplorer,
  type OpeningDatabaseSource,
  type OpeningExplorerResponse,
  type OpeningSpeed,
} from '../engine/openingExplorer'

export type UseOpeningExplorerArgs = {
  source: OpeningDatabaseSource
  moves: string[]
  speeds?: OpeningSpeed[]
  ratings?: number[]
  enabled?: boolean
  debounceMs?: number
}

export type OpeningExplorerState = {
  data: OpeningExplorerResponse | null
  loading: boolean
  error: string | null
  stale: boolean
}

export function useOpeningExplorer(args: UseOpeningExplorerArgs): OpeningExplorerState {
  const enabled = args.enabled ?? true
  const debounceMs = args.debounceMs ?? 250
  const movesKey = args.moves.map(move => move.trim().toLowerCase()).filter(Boolean).join(',')
  const speedsKey = (args.speeds ?? []).slice().sort().join(',')
  const ratingsKey = (args.ratings ?? []).slice().sort((a, b) => a - b).join(',')
  const normalizedMoves = useMemo(() => (movesKey ? movesKey.split(',') : []), [movesKey])
  const normalizedSpeeds = useMemo(
    () => (speedsKey ? speedsKey.split(',') : []) as OpeningSpeed[],
    [speedsKey],
  )
  const normalizedRatings = useMemo(
    () => (ratingsKey ? ratingsKey.split(',').map(value => Number(value)).filter(Number.isFinite) : []),
    [ratingsKey],
  )
  const requestKey = [args.source, movesKey, speedsKey, ratingsKey].join('|')

  const [dataByKey, setDataByKey] = useState<Record<string, OpeningExplorerResponse>>({})
  const [errorByKey, setErrorByKey] = useState<Record<string, string>>({})
  const hasLocalData = Boolean(dataByKey[requestKey])

  const cachedData = getCachedOpeningExplorer({
    source: args.source,
    moves: normalizedMoves,
    speeds: normalizedSpeeds,
    ratings: normalizedRatings,
  })
  const data = dataByKey[requestKey] ?? cachedData ?? null
  const error = errorByKey[requestKey] ?? null

  useEffect(() => {
    if (!enabled) return
    if (hasLocalData) return
    if (getCachedOpeningExplorer({
      source: args.source,
      moves: normalizedMoves,
      speeds: normalizedSpeeds,
      ratings: normalizedRatings,
    })) {
      return
    }

    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      void fetchOpeningExplorer(
        {
          source: args.source,
          moves: normalizedMoves,
          speeds: normalizedSpeeds,
          ratings: normalizedRatings,
        },
        controller.signal,
      )
        .then(payload => {
          setDataByKey(previous => {
            if (previous[requestKey]) return previous
            return { ...previous, [requestKey]: payload }
          })
          setErrorByKey(previous => {
            if (!(requestKey in previous)) return previous
            const next = { ...previous }
            delete next[requestKey]
            return next
          })
        })
        .catch(fetchError => {
          if (controller.signal.aborted) return
          const message = fetchError instanceof Error ? fetchError.message : String(fetchError)
          setErrorByKey(previous => ({ ...previous, [requestKey]: message }))
        })
    }, debounceMs)

    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [
    args.source,
    debounceMs,
    enabled,
    hasLocalData,
    movesKey,
    normalizedMoves,
    normalizedRatings,
    normalizedSpeeds,
    ratingsKey,
    requestKey,
    speedsKey,
  ])

  const loading = enabled && !data && !error
  const stale = enabled && Boolean(data) && !getCachedOpeningExplorer({
    source: args.source,
    moves: normalizedMoves,
    speeds: normalizedSpeeds,
    ratings: normalizedRatings,
  })

  return {
    data,
    loading,
    error,
    stale,
  }
}
