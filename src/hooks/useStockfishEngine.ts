import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  detectEngineCapabilities,
  resolveProfile,
  type EngineCapabilities,
  type EngineProfile,
  type EngineProfileId,
} from '../engine/profiles'
import { buildAnalyzeCommand, parseBestMoveLine, type AnalyzeRequest } from '../engine/uci'

type EngineStatus = 'loading' | 'ready' | 'analyzing' | 'error'

type EngineLine = {
  fen?: string
  searchId?: number
  multipv: number
  depth: number
  cp?: number
  mate?: number
  scoreBound?: 'upperbound' | 'lowerbound'
  wdl?: { w: number; d: number; l: number }
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

type EngineCommandKind = 'uci' | 'isready' | 'go' | 'other'

type SendCommandOptions = {
  stream?: (line: string) => void
  timeoutMs?: number
}

type QueuedCommand = {
  id: number
  command: string
  firstWord: string
  kind: EngineCommandKind
  stream?: (line: string) => void
  resolve: (lines: string[]) => void
  reject: (error: Error) => void
  lines: string[]
  timeoutId?: ReturnType<typeof setTimeout>
  discard?: boolean
}

const RAW_LINE_LIMIT = 800
const NO_REPLY_COMMANDS = new Set(['ucinewgame', 'position', 'setoption', 'stop', 'ponderhit', 'quit'])

function firstWord(input: string): string {
  const trimmed = input.trim()
  const index = trimmed.indexOf(' ')
  return index >= 0 ? trimmed.slice(0, index) : trimmed
}

function hasNoReply(command: string): boolean {
  return NO_REPLY_COMMANDS.has(firstWord(command))
}

function commandKindFromCommand(command: string): EngineCommandKind {
  const fw = firstWord(command)
  if (fw === 'uci') return 'uci'
  if (fw === 'isready') return 'isready'
  if (fw === 'go') return 'go'
  return 'other'
}

function commandKindFromLine(line: string): EngineCommandKind {
  if (line === 'uciok' || line.startsWith('option name ')) return 'uci'
  if (line === 'readyok') return 'isready'
  if (line.startsWith('bestmove ') || line.startsWith('info ')) return 'go'
  return 'other'
}

function isQueuedCommandDone(item: QueuedCommand, line: string): boolean {
  if (line === 'Unknown command') return true
  if (item.kind === 'uci' && line === 'uciok') return true
  if (item.kind === 'isready' && line === 'readyok') return true
  if (item.firstWord === 'go' && line.startsWith('bestmove ')) return true
  if (item.firstWord === 'd' && (line.startsWith('Legal uci moves') || line.startsWith('Key is') || line.startsWith('Checkers:'))) {
    return true
  }
  if (item.firstWord === 'eval' && line.startsWith('Final evaluation')) return true
  if ((item.firstWord === 'bench' || item.firstWord === 'perft') && line.startsWith('Nodes/second')) return true
  return false
}

function normalizeWorkerLines(data: string): string[] {
  return data
    .split(/\r?\n/g)
    .map(line => line.trim())
    .filter(Boolean)
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
  let wdl: { w: number; d: number; l: number } | undefined
  let nodes: number | undefined
  let nps: number | undefined
  let time: number | undefined
  let scoreBound: 'upperbound' | 'lowerbound' | undefined
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
    if (part === 'upperbound') scoreBound = 'upperbound'
    if (part === 'lowerbound') scoreBound = 'lowerbound'
    if (part === 'wdl') wdl = { w: Number(parts[i + 1]), d: Number(parts[i + 2]), l: Number(parts[i + 3]) }
    if (part === 'pv') {
      pv = parts.slice(i + 1)
      break
    }
  }

  if (!pv.length) return null

  return { multipv, depth, cp, mate, scoreBound, wdl, pv, nodes, nps, time }
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
  const pendingAnalyzeRef = useRef<AnalyzeRequest | null>(null)
  const isSearchingRef = useRef(false)
  const stopRequestedRef = useRef(false)
  const currentAnalysisFenRef = useRef<string>('')
  const currentSearchIdRef = useRef<number>(0)
  const commandQueueRef = useRef<QueuedCommand[]>([])
  const nextCommandIdRef = useRef(0)
  const bootSessionRef = useRef(0)
  const capabilities = useMemo<EngineCapabilities>(() => detectEngineCapabilities(), [])
  const [fallbackOverride, setFallbackOverride] = useState<{
    selected: EngineProfileId
    profile: Exclude<EngineProfileId, 'auto'>
  } | null>(null)

  const [status, setStatus] = useState<EngineStatus>('loading')
  const [engineName, setEngineName] = useState('Stockfish')
  const [lastBestMove, setLastBestMove] = useState<string | null>(null)
  const [lastPonderMove, setLastPonderMove] = useState<string | null>(null)
  const [activeGoCommand, setActiveGoCommand] = useState<string>('')
  const [queueLength, setQueueLength] = useState(0)
  const [rawLines, setRawLines] = useState<string[]>([])
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

  const appendRawLine = useCallback((line: string) => {
    setRawLines(previous => {
      const next = [...previous, line]
      if (next.length > RAW_LINE_LIMIT) return next.slice(next.length - RAW_LINE_LIMIT)
      return next
    })
  }, [])

  const rejectQueuedCommands = useCallback((message: string) => {
    const queue = commandQueueRef.current
    for (const item of queue) {
      if (item.timeoutId) clearTimeout(item.timeoutId)
      item.reject(new Error(message))
    }
    commandQueueRef.current = []
    setQueueLength(0)
  }, [])

  const dispatchQueuedLine = useCallback((line: string) => {
    const queue = commandQueueRef.current
    if (!queue.length) return

    const lineKind = commandKindFromLine(line)
    let queueIndex = -1

    if (queue[0] && queue[0].firstWord !== 'bench' && queue[0].firstWord !== 'perft') {
      queueIndex = queue.findIndex(item => {
        if (item.kind === lineKind) return true
        if (lineKind !== 'other') return false
        return ['d', 'eval', 'bench', 'perft', 'compiler', 'flip'].includes(item.firstWord)
      })
    }

    if (queueIndex < 0) queueIndex = 0
    const item = queue[queueIndex]
    if (!item) return

    item.lines.push(line)
    item.stream?.(line)

    if (!isQueuedCommandDone(item, line)) return

    queue.splice(queueIndex, 1)
    if (item.timeoutId) clearTimeout(item.timeoutId)
    setQueueLength(queue.length)
    if (!item.discard) item.resolve(item.lines)
  }, [])

  const sendRaw = useCallback(
    (command: string) => {
      const trimmed = command.trim()
      if (!trimmed) return
      send(trimmed)
    },
    [send],
  )

  const sendCommand = useCallback(
    (command: string, options?: SendCommandOptions): Promise<string[]> => {
      const trimmed = command.trim()
      if (!trimmed) return Promise.resolve([])
      if (!workerRef.current) return Promise.reject(new Error('Engine worker is not available.'))

      if (hasNoReply(trimmed)) {
        send(trimmed)
        return Promise.resolve([])
      }

      return new Promise((resolve, reject) => {
        const id = ++nextCommandIdRef.current
        const first = firstWord(trimmed)
        const timeoutMs =
          options?.timeoutMs ?? (first === 'go' || first === 'bench' || first === 'perft' ? 90_000 : 15_000)

        const item: QueuedCommand = {
          id,
          command: trimmed,
          firstWord: first,
          kind: commandKindFromCommand(trimmed),
          stream: options?.stream,
          resolve,
          reject,
          lines: [],
        }

        item.timeoutId = setTimeout(() => {
          const queue = commandQueueRef.current
          const idx = queue.findIndex(entry => entry.id === id)
          if (idx >= 0) queue.splice(idx, 1)
          setQueueLength(queue.length)
          reject(new Error(`Timed out waiting for response to "${trimmed}".`))
        }, timeoutMs)

        commandQueueRef.current = [...commandQueueRef.current, item]
        setQueueLength(commandQueueRef.current.length)
        send(trimmed)
      })
    },
    [send],
  )

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

  const startAnalysis = useCallback(
    (request: AnalyzeRequest) => {
      pendingAnalyzeRef.current = null
      const built = buildAnalyzeCommand(request)
      const searchId = currentSearchIdRef.current + 1
      currentSearchIdRef.current = searchId

      setStatus('analyzing')
      setLinesMap(new Map())
      setLastBestMove(null)
      setLastPonderMove(null)
      currentAnalysisFenRef.current = request.fen
      setActiveGoCommand(built.go)

      for (const option of built.setOptions) {
        setOption(option.name, option.value)
      }
      send(built.position)
      send(built.go)
      isSearchingRef.current = true
      stopRequestedRef.current = false
    },
    [send, setOption],
  )

  const flushPendingAnalyze = useCallback(() => {
    if (!isReadyRef.current) return

    const pending = pendingAnalyzeRef.current
    if (!pending) return

    if (isSearchingRef.current) {
      if (!stopRequestedRef.current) {
        send('stop')
        stopRequestedRef.current = true
      }
      return
    }

    startAnalysis(pending)
  }, [send, startAnalysis])

  const analyze = useCallback(
    (request: AnalyzeRequest) => {
      pendingAnalyzeRef.current = request
      flushPendingAnalyze()
    },
    [flushPendingAnalyze],
  )

  const analyzePosition = useCallback(
    (params: AnalyzeParams) => {
      analyze({
        fen: params.fen,
        mode: 'custom',
        limits: { depth: params.depth },
        multiPv: params.multiPv,
        hashMb: params.hashMb,
        showWdl: params.showWdl,
      })
    },
    [analyze],
  )

  const stop = useCallback(() => {
    pendingAnalyzeRef.current = null
    if (isSearchingRef.current && !stopRequestedRef.current) {
      send('stop')
      stopRequestedRef.current = true
    }
    setStatus((value) => (value === 'error' ? value : 'ready'))
  }, [send])

  const newGame = useCallback(() => {
    sendRaw('ucinewgame')
    setLinesMap(new Map())
    setLastBestMove(null)
    setLastPonderMove(null)
  }, [sendRaw])

  const ponderHit = useCallback(() => {
    sendRaw('ponderhit')
  }, [sendRaw])

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
    isSearchingRef.current = false
    stopRequestedRef.current = false
    pendingAnalyzeRef.current = null
    currentSearchIdRef.current = 0
    commandQueueRef.current = []

    queueMicrotask(() => {
      if (currentSession !== bootSessionRef.current) return
      setStatus('loading')
      setLinesMap(new Map())
      setOptions([])
      setEngineName('Stockfish')
      setLastBestMove(null)
      setLastPonderMove(null)
      setRawLines([])
      setActiveGoCommand('')
      setQueueLength(0)
      setActiveProfile(profile)
      setProfileMessage(profile.description)
    })

    worker.onmessage = (event: MessageEvent<unknown>) => {
      if (currentSession !== bootSessionRef.current) return
      if (typeof event.data !== 'string') return
      const lines = normalizeWorkerLines(event.data)
      for (const line of lines) {
        appendRawLine(line)
        dispatchQueuedLine(line)

        if (line.startsWith('__BOOT_ERROR__:')) {
          setStatus('error')
          applyFallback(`Failed to load ${profile.name}: ${line.replace('__BOOT_ERROR__:', '').trim()}.`)
          rejectQueuedCommands(`Engine bootstrap failed for ${profile.name}.`)
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
          flushPendingAnalyze()
        }

        if (line.startsWith('info ')) {
          if (!isSearchingRef.current) continue
          if (pendingAnalyzeRef.current && pendingAnalyzeRef.current.fen !== currentAnalysisFenRef.current) continue

          const parsed = parseInfoLine(line)
          if (!parsed) continue

          setLinesMap((previous) => {
            const next = new Map(previous)
            next.set(parsed.multipv, {
              ...parsed,
              fen: currentAnalysisFenRef.current,
              searchId: currentSearchIdRef.current,
            })
            return next
          })
        }

        if (line.startsWith('bestmove ')) {
          const parsed = parseBestMoveLine(line)
          setLastBestMove(parsed?.bestMove ?? null)
          setLastPonderMove(parsed?.ponderMove ?? null)
          isSearchingRef.current = false
          stopRequestedRef.current = false

          if (pendingAnalyzeRef.current) {
            flushPendingAnalyze()
            continue
          }

          setStatus((value) => (value === 'error' ? value : 'ready'))
        }
      }
    }

    worker.onerror = () => {
      if (currentSession !== bootSessionRef.current) return
      setStatus('error')
      rejectQueuedCommands(`Engine worker error while running ${profile.name}.`)

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
      try {
        worker.postMessage('quit')
      } catch {
        // Ignore shutdown errors from workers that are already gone.
      }
      worker.terminate()
      workerRef.current = null
      isReadyRef.current = false
      isSearchingRef.current = false
      stopRequestedRef.current = false
      pendingAnalyzeRef.current = null
      rejectQueuedCommands('Engine worker terminated.')
      if (workerBlobUrl) URL.revokeObjectURL(workerBlobUrl)
    }
  }, [appendRawLine, capabilities, dispatchQueuedLine, flushPendingAnalyze, rejectQueuedCommands, resolvedProfile, selectedProfile, send])

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
    lastPonderMove,
    activeGoCommand,
    queueLength,
    rawLines,
    capabilities,
    activeProfile,
    profileMessage,
    analyze,
    analyzePosition,
    sendRaw,
    sendCommand,
    newGame,
    ponderHit,
    stop,
    setOption,
  }
}

export type { EngineLine, EngineOption, EngineStatus }
