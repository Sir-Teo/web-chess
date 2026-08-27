import { useEffect, useMemo, useState } from 'react'
import {
  cloudEvalRequestKey,
  fetchCloudEvaluation,
  getCachedCloudEvaluation,
  hasCachedCloudEvaluationMiss,
  normalizeCloudEvalFen,
  normalizeCloudEvalMultiPv,
  type CloudEvalResult,
} from '../engine/cloudEval'
import { withBoundedMapEntry } from './cacheLimit'

export type CloudEvalStatus = 'idle' | 'loading' | 'hit' | 'missing' | 'error'

type UseCloudEvaluationOptions = {
  fen: string
  multiPv: number
  enabled: boolean
}

const CLOUD_EVAL_DEBOUNCE_MS = 320
const LOCAL_CLOUD_EVAL_LIMIT = 120

export function useCloudEvaluation({ fen, multiPv, enabled }: UseCloudEvaluationOptions) {
  const normalizedMultiPv = normalizeCloudEvalMultiPv(multiPv)
  const normalizedFen = useMemo(() => normalizeCloudEvalFen(fen), [fen])
  const currentKey = useMemo(
    () => cloudEvalRequestKey({ fen: normalizedFen, multiPv: normalizedMultiPv }),
    [normalizedFen, normalizedMultiPv],
  )
  const [evaluations, setEvaluations] = useState<Map<string, CloudEvalResult>>(new Map())
  const [missingKeys, setMissingKeys] = useState<Map<string, true>>(new Map())
  const [requestState, setRequestState] = useState<{
    error: string | null
    key: string
    status: CloudEvalStatus
  }>({ error: null, key: '', status: 'idle' })
  const cached = enabled ? getCachedCloudEvaluation({ fen: normalizedFen, multiPv: normalizedMultiPv }) : null
  const cachedMissing = enabled
    ? hasCachedCloudEvaluationMiss({ fen: normalizedFen, multiPv: normalizedMultiPv })
    : false
  const result = evaluations.get(currentKey) ?? cached
  const missing = enabled && (missingKeys.has(currentKey) || cachedMissing)
  const status: CloudEvalStatus = !enabled
    ? 'idle'
    : result
      ? 'hit'
      : missing
        ? 'missing'
      : requestState.key === currentKey
        ? requestState.status
        : 'idle'
  const error = status === 'error' && requestState.key === currentKey ? requestState.error : null

  useEffect(() => {
    if (!enabled || cached || missing) return

    const request = { fen: normalizedFen, multiPv: normalizedMultiPv }
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      setRequestState({ error: null, key: currentKey, status: 'loading' })

      fetchCloudEvaluation(request, controller.signal)
        .then(nextResult => {
          if (controller.signal.aborted) return
          if (!nextResult) {
            setMissingKeys(previous => withBoundedMapEntry(previous, currentKey, true, LOCAL_CLOUD_EVAL_LIMIT))
            setRequestState({ error: null, key: currentKey, status: 'missing' })
            return
          }

          setEvaluations(previous => {
            return withBoundedMapEntry(previous, currentKey, nextResult, LOCAL_CLOUD_EVAL_LIMIT)
          })
          setMissingKeys(previous => {
            if (!previous.has(currentKey)) return previous
            const next = new Map(previous)
            next.delete(currentKey)
            return next
          })
          setRequestState({ error: null, key: currentKey, status: 'hit' })
        })
        .catch(nextError => {
          if (controller.signal.aborted) return
          setRequestState({
            error: nextError instanceof Error ? nextError.message : String(nextError),
            key: currentKey,
            status: 'error',
          })
        })
    }, CLOUD_EVAL_DEBOUNCE_MS)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [cached, currentKey, enabled, missing, normalizedFen, normalizedMultiPv])

  return {
    error,
    multiPv: normalizedMultiPv,
    result,
    status,
  }
}
