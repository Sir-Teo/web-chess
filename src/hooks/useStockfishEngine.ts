import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  detectEngineCapabilities,
  resolveProfile,
  type EngineCapabilities,
  type EngineProfile,
  type EngineProfileId,
} from '../engine/profiles'

type EngineStatus = 'loading' | 'ready' | 'analyzing' | 'error'

type EngineLine = {
  multipv: number
  depth: number
  cp?: number
  mate?: number
  pv: string[]
  nodes?: number
  nps?: number
  time?: number
}

type EngineOptionType = 'check' | 'spin' | 'string' | 'button'

type EngineOption = {
  name: string
  type: EngineOptionType
  defaultValue?: string
  min?: number
  max?: number
}

type AnalyzeParams = {
  fen: string
  depth: number
  multiPv: number
  hashMb: number
  showWdl: boolean
}

function isRemoteWorkerPath(path: string): boolean {
  return /^https?:\/\//i.test(path)
}

function deriveWasmPath(workerPath: string): string {
  return workerPath.replace(/\.js($|\?)/, '.wasm$1')
}

function createEngineWorker(profile: EngineProfile): { worker: Worker; blobUrl?: string } {
  if (!isRemoteWorkerPath(profile.workerPath)) {
    return { worker: new Worker(profile.workerPath) }
  }

  // Browser Worker constructor requires same-origin script URLs.
  // For remote profiles, bootstrap a same-origin blob worker and import remote Stockfish from inside it.
  const wasmPath = deriveWasmPath(profile.workerPath)
  const bootstrap = `
self.window = self;
self.addEventListener('error', function (event) {
  try {
    self.postMessage('__BOOT_ERROR__:' + (event && event.message ? event.message : 'Unknown worker bootstrap error'));
  } catch (_) {}
  event.preventDefault();
});
try {
  importScripts(${JSON.stringify(profile.workerPath)});
} catch (error) {
  self.postMessage('__BOOT_ERROR__:' + (error && error.message ? error.message : String(error)));
}
`
  const blobUrl = URL.createObjectURL(new Blob([bootstrap], { type: 'application/javascript' }))

  return {
    worker: new Worker(`${blobUrl}#${encodeURIComponent(wasmPath)},worker`),
    blobUrl,
  }
}

function parseInfoLine(line: string): EngineLine | null {
  const parts = line.trim().split(/\s+/)
  if (parts[0] !== 'info') return null

  let depth = 0
  let multipv = 1
  let cp: number | undefined
  let mate: number | undefined
  let nodes: number | undefined
  let nps: number | undefined
  let time: number | undefined
  let pv: string[] = []

  for (let i = 1; i < parts.length; i += 1) {
    const part = parts[i]

    if (part === 'depth') depth = Number(parts[i + 1])
    if (part === 'multipv') multipv = Number(parts[i + 1])
    if (part === 'nodes') nodes = Number(parts[i + 1])
    if (part === 'nps') nps = Number(parts[i + 1])
    if (part === 'time') time = Number(parts[i + 1])
    if (part === 'score' && parts[i + 1] === 'cp') cp = Number(parts[i + 2])
    if (part === 'score' && parts[i + 1] === 'mate') mate = Number(parts[i + 2])
    if (part === 'pv') {
      pv = parts.slice(i + 1)
      break
    }
  }

  if (!pv.length) return null

  return { multipv, depth, cp, mate, pv, nodes, nps, time }
}

function parseOptionLine(line: string): EngineOption | null {
  if (!line.startsWith('option name ')) return null

  const typeToken = ' type '
  const typeIndex = line.indexOf(typeToken)
  if (typeIndex < 0) return null

  const name = line.slice('option name '.length, typeIndex).trim()
  const rest = line.slice(typeIndex + typeToken.length)
  const [typeRaw] = rest.split(' ')
  const type = typeRaw as EngineOptionType
  if (!['check', 'spin', 'string', 'button'].includes(type)) return null

  const min = rest.match(/\bmin (-?\d+)/)?.[1]
  const max = rest.match(/\bmax (-?\d+)/)?.[1]
  const defaultMatch = rest.match(/\bdefault ([^]+?)(?=\s(?:min|max)\s|$)/)
  const defaultValue = defaultMatch?.[1]?.trim()

  return {
    name,
    type,
    defaultValue,
    min: min ? Number(min) : undefined,
    max: max ? Number(max) : undefined,
  }
}

function withUciValue(value: string | number | boolean): string {
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return String(value)
}

export function useStockfishEngine(selectedProfile: EngineProfileId = 'auto') {
  const workerRef = useRef<Worker | null>(null)
  const isReadyRef = useRef(false)
  const queuedAnalyzeRef = useRef<AnalyzeParams | null>(null)
  const bootSessionRef = useRef(0)
  const capabilities = useMemo<EngineCapabilities>(() => detectEngineCapabilities(), [])
  const [fallbackOverride, setFallbackOverride] = useState<{
    selected: EngineProfileId
    profile: Exclude<EngineProfileId, 'auto'>
  } | null>(null)

  const [status, setStatus] = useState<EngineStatus>('loading')
  const [engineName, setEngineName] = useState('Stockfish')
  const [lastBestMove, setLastBestMove] = useState<string | null>(null)
  const [linesMap, setLinesMap] = useState<Map<number, EngineLine>>(new Map())
  const [options, setOptions] = useState<EngineOption[]>([])
  const [activeProfile, setActiveProfile] = useState<EngineProfile>(() => resolveProfile(selectedProfile, capabilities))
  const [profileMessage, setProfileMessage] = useState<string>('')

  const resolvedProfile = useMemo(
    () =>
      resolveProfile(
        fallbackOverride?.selected === selectedProfile ? fallbackOverride.profile : selectedProfile,
        capabilities,
      ),
    [capabilities, fallbackOverride, selectedProfile],
  )

  const send = useCallback((command: string) => {
    workerRef.current?.postMessage(command)
  }, [])

  const setOption = useCallback(
    (name: string, value?: string | number | boolean) => {
      if (value === undefined) {
        send(`setoption name ${name}`)
        return
      }

      send(`setoption name ${name} value ${withUciValue(value)}`)
    },
    [send],
  )

  const analyzePosition = useCallback(
    (params: AnalyzeParams) => {
      if (!isReadyRef.current) {
        queuedAnalyzeRef.current = params
        return
      }

      setStatus('analyzing')
      setLinesMap(new Map())
      setLastBestMove(null)

      send('stop')
      setOption('Hash', params.hashMb)
      setOption('MultiPV', params.multiPv)
      setOption('UCI_ShowWDL', params.showWdl)
      send(`position fen ${params.fen}`)
      send(`go depth ${params.depth}`)
    },
    [send, setOption],
  )

  const stop = useCallback(() => {
    send('stop')
    setStatus((value) => (value === 'error' ? value : 'ready'))
  }, [send])

  useEffect(() => {
    bootSessionRef.current += 1
    const currentSession = bootSessionRef.current
    const profile = resolvedProfile
    let worker: Worker | null = null
    let workerBlobUrl: string | undefined

    const applyFallback = (reason: string) => {
      if (profile.id !== 'lite-single-local') {
        const fallback = resolveProfile('lite-single-local', capabilities)
        setFallbackOverride({
          selected: selectedProfile,
          profile: 'lite-single-local',
        })
        setProfileMessage(`${reason} Falling back to ${fallback.name}.`)
      } else {
        setProfileMessage(reason)
      }
    }

    try {
      const created = createEngineWorker(profile)
      worker = created.worker
      workerBlobUrl = created.blobUrl
    } catch (error) {
      const message =
        error instanceof Error ? error.message : `Unknown worker boot error while loading ${profile.name}.`
      queueMicrotask(() => {
        if (currentSession !== bootSessionRef.current) return
        setStatus('error')
        applyFallback(`Failed to start ${profile.name}: ${message}.`)
      })
      return () => {
        if (workerBlobUrl) URL.revokeObjectURL(workerBlobUrl)
      }
    }

    if (!worker) {
      return () => {
        if (workerBlobUrl) URL.revokeObjectURL(workerBlobUrl)
      }
    }

    workerRef.current = worker
    isReadyRef.current = false

    queueMicrotask(() => {
      if (currentSession !== bootSessionRef.current) return
      setStatus('loading')
      setLinesMap(new Map())
      setOptions([])
      setEngineName('Stockfish')
      setActiveProfile(profile)
      setProfileMessage(profile.description)
    })

    worker.onmessage = (event: MessageEvent<string>) => {
      if (currentSession !== bootSessionRef.current) return
      const line = event.data

      if (line.startsWith('__BOOT_ERROR__:')) {
        setStatus('error')
        applyFallback(`Failed to load ${profile.name}: ${line.replace('__BOOT_ERROR__:', '').trim()}.`)
        worker.terminate()
        workerRef.current = null
        return
      }

      if (line.startsWith('id name ')) {
        setEngineName(line.replace('id name ', '').trim())
      }

      if (line.startsWith('option name ')) {
        const option = parseOptionLine(line)
        if (option) {
          setOptions((previous) => {
            if (previous.some((item) => item.name === option.name)) return previous
            return [...previous, option]
          })
        }
      }

      if (line === 'uciok') {
        send('isready')
      }

      if (line === 'readyok') {
        isReadyRef.current = true
        setStatus((value) => (value === 'error' ? value : 'ready'))

        const queued = queuedAnalyzeRef.current
        queuedAnalyzeRef.current = null
        if (queued) {
          analyzePosition(queued)
        }
      }

      if (line.startsWith('info ')) {
        const parsed = parseInfoLine(line)
        if (!parsed) return

        setLinesMap((previous) => {
          const next = new Map(previous)
          next.set(parsed.multipv, parsed)
          return next
        })
      }

      if (line.startsWith('bestmove ')) {
        const bestMove = line.split(' ')[1] ?? null
        setLastBestMove(bestMove)
        setStatus((value) => (value === 'error' ? value : 'ready'))
      }
    }

    worker.onerror = () => {
      if (currentSession !== bootSessionRef.current) return
      setStatus('error')

      if (profile.id !== 'lite-single-local') {
        const fallback = resolveProfile('lite-single-local', capabilities)
        setFallbackOverride({
          selected: selectedProfile,
          profile: 'lite-single-local',
        })
        setProfileMessage(`Failed to load ${profile.name}; fell back to ${fallback.name}.`)
      } else {
        setProfileMessage(`Failed to load ${profile.name}.`)
      }
    }

    send('uci')

    return () => {
      worker.terminate()
      workerRef.current = null
      isReadyRef.current = false
      if (workerBlobUrl) URL.revokeObjectURL(workerBlobUrl)
    }
  }, [analyzePosition, capabilities, resolvedProfile, selectedProfile, send])

  const lines = useMemo(
    () =>
      [...linesMap.values()].sort((a, b) => {
        if (a.multipv !== b.multipv) return a.multipv - b.multipv
        return b.depth - a.depth
      }),
    [linesMap],
  )

  return {
    status,
    engineName,
    options,
    lines,
    lastBestMove,
    capabilities,
    activeProfile,
    profileMessage,
    analyzePosition,
    stop,
    setOption,
  }
}

export type { EngineLine, EngineOption, EngineStatus }
