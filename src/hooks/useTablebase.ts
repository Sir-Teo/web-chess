import { useEffect, useMemo, useState } from 'react'
import {
  fetchTablebase,
  getCachedTablebase,
  hasCachedTablebaseMiss,
  isTablebaseEligible,
  normalizeTablebaseFen,
  tablebasePieceCount,
  type TablebaseResult,
} from '../engine/tablebase'
import { withBoundedRecordEntry, withoutRecordEntry } from './cacheLimit'

export type TablebaseStatus = 'idle' | 'ineligible' | 'loading' | 'hit' | 'missing' | 'error'
const LOCAL_TABLEBASE_LIMIT = 80

type UseTablebaseArgs = {
  fen: string
  enabled: boolean
  debounceMs?: number
}

export function useTablebase({ fen, enabled, debounceMs = 280 }: UseTablebaseArgs) {
  const fenKey = useMemo(() => normalizeTablebaseFen(fen), [fen])
  const pieceCount = useMemo(() => tablebasePieceCount(fenKey), [fenKey])
  const eligible = enabled && isTablebaseEligible(fenKey)
  const cached = eligible ? getCachedTablebase(fenKey) : null
  const cachedMissing = eligible ? hasCachedTablebaseMiss(fenKey) : false
  const [resultByFen, setResultByFen] = useState<Record<string, TablebaseResult>>({})
  const [missingByFen, setMissingByFen] = useState<Record<string, true>>({})
  const [requestState, setRequestState] = useState<{
    error: string | null
    fenKey: string
    status: TablebaseStatus
  }>({ error: null, fenKey: '', status: 'idle' })

  const result = resultByFen[fenKey] ?? cached ?? null
  const missing = eligible && (Boolean(missingByFen[fenKey]) || cachedMissing)
  const status: TablebaseStatus = !enabled
    ? 'idle'
    : !eligible
      ? 'ineligible'
      : result
        ? 'hit'
        : missing
          ? 'missing'
        : requestState.fenKey === fenKey
          ? requestState.status
          : 'idle'
  const error = status === 'error' && requestState.fenKey === fenKey ? requestState.error : null

  useEffect(() => {
    if (!eligible || cached || missing) return

    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      setRequestState({ error: null, fenKey, status: 'loading' })

      fetchTablebase(fenKey, controller.signal)
        .then(nextResult => {
          if (controller.signal.aborted) return
          if (!nextResult) {
            setMissingByFen(previous => withBoundedRecordEntry(previous, fenKey, true, LOCAL_TABLEBASE_LIMIT))
            setRequestState({ error: null, fenKey, status: 'missing' })
            return
          }

          setResultByFen(previous => withBoundedRecordEntry(previous, fenKey, nextResult, LOCAL_TABLEBASE_LIMIT))
          setMissingByFen(previous => withoutRecordEntry(previous, fenKey))
          setRequestState({ error: null, fenKey, status: 'hit' })
        })
        .catch(nextError => {
          if (controller.signal.aborted) return
          setRequestState({
            error: nextError instanceof Error ? nextError.message : String(nextError),
            fenKey,
            status: 'error',
          })
        })
    }, debounceMs)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [cached, debounceMs, eligible, fenKey, missing])

  return {
    eligible,
    error,
    pieceCount,
    result,
    status,
  }
}
