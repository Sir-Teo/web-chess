import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  detectEngineCapabilities,
  profileById,
  recommendedThreadCount,
  resolveProfile,
  type EngineCapabilities,
  type EngineProfile,
  type EngineProfileId,
} from '../engine/profiles'
import { createStockfishWorker } from '../engine/stockfishWorker'
import { buildAnalyzeCommand, buildNewGameCommands, changedSetOptions, engineOptionValueToString, parseBestMoveLine, type AnalyzeMode, type AnalyzePurpose, type AnalyzeRequest, type UciGoLimits } from '../engine/uci'
import { engineBootFailureMessage } from '../engine/engineBootError'

type EngineStatus = 'loading' | 'ready' | 'analyzing' | 'error' | 'disabled'

type EngineLine = {
  fen?: string
  searchId?: number
  purpose?: AnalyzePurpose
  mode?: AnalyzeMode
  limits?: UciGoLimits
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

type EngineOptionType = 'check' | 'spin' | 'string' | 'button' | 'combo'

type EngineOption = {
  name: string
  type: EngineOptionType
  defaultValue?: string
  currentValue?: string
  min?: number
  max?: number
  vars?: string[]
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

/**
 * How often parsed engine state reaches React. The engine emits `info` far
 * faster than the UI can usefully render, so lines are collected in a ref and
 * published on this interval instead of per line.
 *
 * There is deliberately only *one* such mirror. A second one held every raw
 * line the worker ever sent, capped at 800, and copied the array into state on
 * the same interval -- so every search re-rendered the whole app twice as often
 * as it needed to, and each line past the cap shifted an 800-element array, for
 * a value no caller read. The Engine Lab console does not use it either: it
 * streams its own output through `sendCommand`'s `stream` option.
 */
const ENGINE_STATE_FLUSH_INTERVAL_MS = 100
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

export function shouldStopTimedOutSearchCommand(command: string): boolean {
  return firstWord(command) === 'go'
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

/**
 * What the Engine Lab says about the engine that is actually running.
 *
 * `fallbackReason` is why the app is not running what it chose, and it is a
 * parameter rather than something this works out because only the boot that
 * failed knows. Without it the reason was written by `applyFallback` and then
 * immediately overwritten: setting the fallback re-resolves the profile, which
 * re-runs the boot effect, whose own message is this function's answer for the
 * *replacement*. On `auto` that answer is the replacement's description, so a
 * multi-threaded build that failed to start left no trace anywhere.
 */
export function profileRuntimeMessage(
  selectedProfile: EngineProfileId,
  activeProfile: EngineProfile,
  capabilities: EngineCapabilities,
  fallbackReason?: string | null,
): string {
  if (fallbackReason) return fallbackReason
  if (selectedProfile === 'auto') return activeProfile.description

  const requested = profileById(selectedProfile)
  if (requested.id === activeProfile.id) return activeProfile.description

  if (requested.requiresIsolation && !(capabilities.sharedArrayBuffer && capabilities.crossOriginIsolated)) {
    return `${requested.name} needs cross-origin isolation and SharedArrayBuffer. Running ${activeProfile.name} instead.`
  }

  return `Running ${activeProfile.name} instead of ${requested.name}.`
}

function finiteNumber(value: string | undefined): number | undefined {
  if (typeof value !== 'string') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function nonNegativeNumber(value: string | undefined): number | undefined {
  const parsed = finiteNumber(value)
  return typeof parsed === 'number' && parsed >= 0 ? parsed : undefined
}

function positiveNumber(value: string | undefined): number | undefined {
  const parsed = finiteNumber(value)
  return typeof parsed === 'number' && parsed > 0 ? parsed : undefined
}


/**
 * Whether a freshly parsed info line should replace the one already held for
 * its multipv slot.
 *
 * Almost always yes -- later lines are deeper or better informed. The exception
 * is a bound: `score cp 900 lowerbound` means "at least 900", and it arrives
 * from an aspiration re-search *after* the exact line at that depth, so
 * last-line-wins puts an inequality on the eval bar. Seen in the browser test:
 * a position the engine had evaluated at +3.0 displayed as +9.0.
 *
 * A deeper bound still wins, because depth is the stronger signal and a bound
 * at greater depth is the most the engine has said about the position.
 */
export function shouldReplaceLiveLine(
  previous: EngineLine | undefined,
  next: EngineLine,
): boolean {
  if (!previous) return true
  if (!next.scoreBound) return true
  if (previous.scoreBound) return true
  return (next.depth ?? 0) > (previous.depth ?? 0)
}

export function parseInfoLine(line: string): EngineLine | null {
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

    if (part === 'depth') depth = nonNegativeNumber(parts[i + 1]) ?? depth
    if (part === 'multipv') multipv = positiveNumber(parts[i + 1]) ?? multipv
    if (part === 'nodes') nodes = nonNegativeNumber(parts[i + 1])
    if (part === 'nps') nps = nonNegativeNumber(parts[i + 1])
    if (part === 'time') time = nonNegativeNumber(parts[i + 1])
    if (part === 'score' && parts[i + 1] === 'cp') cp = finiteNumber(parts[i + 2])
    if (part === 'score' && parts[i + 1] === 'mate') mate = finiteNumber(parts[i + 2])
    if (part === 'upperbound') scoreBound = 'upperbound'
    if (part === 'lowerbound') scoreBound = 'lowerbound'
    if (part === 'wdl') {
      const w = nonNegativeNumber(parts[i + 1])
      const d = nonNegativeNumber(parts[i + 2])
      const l = nonNegativeNumber(parts[i + 3])
      wdl = typeof w === 'number' && typeof d === 'number' && typeof l === 'number'
        ? { w, d, l }
        : undefined
    }
    if (part === 'pv') {
      pv = parts.slice(i + 1)
      break
    }
  }

  if (!pv.length) return null

  return { multipv, depth, cp, mate, scoreBound, wdl, pv, nodes, nps, time }
}

function optionFieldValue(input: string, field: 'default' | 'min' | 'max' | 'var'): string | undefined {
  const match = input.match(new RegExp(`(?:^|\\s)${field}\\s+([^]+?)(?=\\s(?:default|min|max|var)\\s|$)`))
  return match?.[1]?.trim()
}

function optionVarValues(input: string): string[] {
  const values: string[] = []
  const pattern = /(?:^|\s)var\s+([^]+?)(?=\s(?:default|min|max|var)\s|$)/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(input)) !== null) {
    const value = match[1]?.trim()
    if (value) values.push(value)
  }
  return values
}

export function parseOptionLine(line: string): EngineOption | null {
  if (!line.startsWith('option name ')) return null

  const typeToken = ' type '
  const typeIndex = line.indexOf(typeToken)
  if (typeIndex < 0) return null

  const name = line.slice('option name '.length, typeIndex).trim()
  const rest = line.slice(typeIndex + typeToken.length)
  const [typeRaw] = rest.split(' ')
  const type = typeRaw as EngineOptionType
  if (!['check', 'spin', 'string', 'button', 'combo'].includes(type)) return null

  const min = optionFieldValue(rest, 'min')
  const max = optionFieldValue(rest, 'max')
  const defaultValue = optionFieldValue(rest, 'default')
  const vars = type === 'combo' ? optionVarValues(rest) : undefined

  return {
    name,
    type,
    defaultValue,
    currentValue: defaultValue,
    min: min ? Number(min) : undefined,
    max: max ? Number(max) : undefined,
    vars,
  }
}

export function useStockfishEngine(selectedProfile: EngineProfileId = 'auto', enabled = true) {
  const workerRef = useRef<Worker | null>(null)
  const isReadyRef = useRef(false)
  const pendingAnalyzeRef = useRef<AnalyzeRequest | null>(null)
  const isSearchingRef = useRef(false)
  const stopRequestedRef = useRef(false)
  const currentAnalysisFenRef = useRef<string>('')
  const currentAnalysisPurposeRef = useRef<AnalyzePurpose | undefined>(undefined)
  const currentAnalysisModeRef = useRef<AnalyzeMode | undefined>(undefined)
  const currentAnalysisLimitsRef = useRef<UciGoLimits | undefined>(undefined)
  const currentSearchIdRef = useRef<number>(0)
  const newGamePendingRef = useRef(false)
  const commandQueueRef = useRef<QueuedCommand[]>([])
  const nextCommandIdRef = useRef(0)
  const bootSessionRef = useRef(0)
  const liveLinesMapRef = useRef<Map<number, EngineLine>>(new Map())
  /**
   * What this worker has already been told each option is. Per worker, because
   * a replacement starts at its own defaults; see `changedSetOptions` for why
   * re-sending an unchanged value is not free.
   */
  const appliedOptionsRef = useRef<Map<string, string>>(new Map())
  const linesMapFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const capabilities = useMemo<EngineCapabilities>(() => detectEngineCapabilities(), [])
  const [fallbackOverride, setFallbackOverride] = useState<{
    selected: EngineProfileId
    profile: Exclude<EngineProfileId, 'auto'>
    /** Why, kept so the replacement's boot can still say it. */
    reason: string
  } | null>(null)

  const [status, setStatus] = useState<EngineStatus>('loading')
  const [engineName, setEngineName] = useState('Stockfish')
  const [lastBestMove, setLastBestMove] = useState<string | null>(null)
  const [lastBestMoveFen, setLastBestMoveFen] = useState<string | null>(null)
  const [lastPonderMove, setLastPonderMove] = useState<string | null>(null)
  const [lastPonderMoveFen, setLastPonderMoveFen] = useState<string | null>(null)
  const [activeGoCommand, setActiveGoCommand] = useState<string>('')
  const [queueLength, setQueueLength] = useState(0)
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

  /**
   * Why the running engine is not the one that was asked for, or null when it
   * is. Cleared by choosing a different profile, which is a fresh request.
   */
  const activeFallbackReason = fallbackOverride?.selected === selectedProfile ? fallbackOverride.reason : null

  const send = useCallback((command: string) => {
    workerRef.current?.postMessage(command)
  }, [])

  const clearLinesMapFlushTimer = useCallback(() => {
    if (!linesMapFlushTimerRef.current) return
    clearTimeout(linesMapFlushTimerRef.current)
    linesMapFlushTimerRef.current = null
  }, [])

  const flushLinesMap = useCallback(() => {
    clearLinesMapFlushTimer()
    setLinesMap(new Map(liveLinesMapRef.current))
  }, [clearLinesMapFlushTimer])

  const scheduleLinesMapFlush = useCallback(() => {
    if (linesMapFlushTimerRef.current) return
    linesMapFlushTimerRef.current = setTimeout(() => {
      linesMapFlushTimerRef.current = null
      setLinesMap(new Map(liveLinesMapRef.current))
    }, ENGINE_STATE_FLUSH_INTERVAL_MS)
  }, [])

  const resetLinesMap = useCallback(() => {
    clearLinesMapFlushTimer()
    liveLinesMapRef.current = new Map()
    setLinesMap(new Map())
  }, [clearLinesMapFlushTimer])

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

    if (queueIndex < 0) {
      const firstItem = queue[0]
      const firstItemConsumesSearchOutput =
        firstItem?.kind === 'go' || firstItem?.firstWord === 'bench' || firstItem?.firstWord === 'perft'
      if (lineKind === 'go' && !firstItemConsumesSearchOutput) return
      queueIndex = 0
    }
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
      // The Engine Lab console can set an option behind this hook's back, which
      // would leave `appliedOptionsRef` describing an engine that no longer
      // matches. Forgetting is cheap; a stale record silently skips a real set.
      if (firstWord(trimmed) === 'setoption') appliedOptionsRef.current.clear()
      send(trimmed)
    },
    [send],
  )

  const sendNewGameSync = useCallback(() => {
    isReadyRef.current = false
    setStatus((value) => (value === 'error' ? value : 'loading'))
    for (const command of buildNewGameCommands()) {
      sendRaw(command)
    }
  }, [sendRaw])

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
          if (idx >= 0) {
            queue.splice(idx, 1)
            if (shouldStopTimedOutSearchCommand(trimmed)) {
              send('stop')
            }
          }
          setQueueLength(queue.length)
          const stopSuffix = shouldStopTimedOutSearchCommand(trimmed) ? ' Sent "stop" to cancel the search.' : ''
          reject(new Error(`Timed out waiting for response to "${trimmed}".${stopSuffix}`))
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

      const normalized = engineOptionValueToString(value)
      appliedOptionsRef.current.set(name, normalized)
      setOptions((previous) =>
        previous.map((option) =>
          option.name === name ? { ...option, currentValue: normalized } : option,
        ),
      )
      send(`setoption name ${name} value ${normalized}`)
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
      resetLinesMap()
      setLastBestMove(null)
      setLastBestMoveFen(null)
      setLastPonderMove(null)
      setLastPonderMoveFen(null)
      currentAnalysisFenRef.current = request.fen
      currentAnalysisPurposeRef.current = request.purpose
      currentAnalysisModeRef.current = request.mode
      currentAnalysisLimitsRef.current = request.limits
      setActiveGoCommand(built.go)

      for (const option of changedSetOptions(built.setOptions, appliedOptionsRef.current)) {
        setOption(option.name, option.value)
      }
      send(built.position)
      send(built.go)
      isSearchingRef.current = true
      stopRequestedRef.current = false
    },
    [resetLinesMap, send, setOption],
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
      if (!enabled) return
      pendingAnalyzeRef.current = request
      flushPendingAnalyze()
    },
    [enabled, flushPendingAnalyze],
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
    if (!enabled) {
      setStatus('disabled')
      return
    }
    if (isSearchingRef.current) {
      if (!stopRequestedRef.current) {
        send('stop')
        stopRequestedRef.current = true
      }
      return
    }
    setStatus((value) => {
      if (value === 'error') return value
      return isReadyRef.current ? 'ready' : value
    })
  }, [enabled, send])

  const newGame = useCallback(() => {
    pendingAnalyzeRef.current = null
    resetLinesMap()
    setLastBestMove(null)
    setLastBestMoveFen(null)
    setLastPonderMove(null)
    setLastPonderMoveFen(null)

    if (!enabled) {
      newGamePendingRef.current = false
      setStatus('disabled')
      return
    }

    if (isSearchingRef.current) {
      newGamePendingRef.current = true
      if (!stopRequestedRef.current) {
        sendRaw('stop')
        stopRequestedRef.current = true
      }
      return
    }

    sendNewGameSync()
  }, [enabled, resetLinesMap, sendNewGameSync, sendRaw])

  const ponderHit = useCallback(() => {
    sendRaw('ponderhit')
  }, [sendRaw])

  useEffect(() => {
    bootSessionRef.current += 1
    const currentSession = bootSessionRef.current
    const profile = resolvedProfile
    let worker: Worker | null = null
    let workerBlobUrl: string | undefined

    if (!enabled) {
      workerRef.current = null
      isReadyRef.current = false
      isSearchingRef.current = false
      stopRequestedRef.current = false
      pendingAnalyzeRef.current = null
      newGamePendingRef.current = false
      commandQueueRef.current = []
      appliedOptionsRef.current = new Map()
      queueMicrotask(() => {
        if (currentSession !== bootSessionRef.current) return
        setStatus('disabled')
        resetLinesMap()
        setLastBestMove(null)
        setLastBestMoveFen(null)
        setLastPonderMove(null)
        setLastPonderMoveFen(null)
        setActiveGoCommand('')
        setQueueLength(0)
      })
      return
    }

    const applyFallback = (reason: string) => {
      if (profile.id !== 'lite-single-local') {
        const fallback = resolveProfile('lite-single-local', capabilities)
        const message = `${reason} Falling back to ${fallback.name}.`
        setFallbackOverride({
          selected: selectedProfile,
          profile: 'lite-single-local',
          reason: message,
        })
        setActiveProfile(fallback)
        setProfileMessage(message)
      } else {
        setProfileMessage(reason)
      }
    }

    const failWorker = (reason: string, queueMessage: string) => {
      isReadyRef.current = false
      isSearchingRef.current = false
      stopRequestedRef.current = false
      pendingAnalyzeRef.current = null
      newGamePendingRef.current = false
      setActiveGoCommand('')
      setStatus('error')
      rejectQueuedCommands(queueMessage)
      if (workerRef.current === worker) workerRef.current = null
      try {
        worker?.terminate()
      } catch {
        // Ignore shutdown errors from workers that are already gone.
      }
      applyFallback(reason)
    }

    try {
      const created = createStockfishWorker(profile)
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
    appliedOptionsRef.current = new Map()

    queueMicrotask(() => {
      if (currentSession !== bootSessionRef.current) return
      setStatus('loading')
      resetLinesMap()
      setOptions([])
      setEngineName('Stockfish')
      setLastBestMove(null)
      setLastBestMoveFen(null)
      setLastPonderMove(null)
      setLastPonderMoveFen(null)
      setActiveGoCommand('')
      setQueueLength(0)
      setActiveProfile(profile)
      setProfileMessage(profileRuntimeMessage(selectedProfile, profile, capabilities, activeFallbackReason))
    })

    worker.onmessage = (event: MessageEvent<unknown>) => {
      if (currentSession !== bootSessionRef.current) return
      if (typeof event.data !== 'string') return
      const lines = normalizeWorkerLines(event.data)
      for (const line of lines) {
        dispatchQueuedLine(line)

        if (line.startsWith('__BOOT_ERROR__:')) {
          const message = line.replace('__BOOT_ERROR__:', '').trim()
          failWorker(
            engineBootFailureMessage(profile.name, message),
            `Engine bootstrap failed for ${profile.name}.`,
          )
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
          const threads = recommendedThreadCount(profile, capabilities)
          // Only when it is not already what the engine was told.
          //
          // `readyok` arrives after every `isready`, and `ucinewgame` sends one
          // -- so this re-sent the same thread count on every new game, and
          // `flushPendingAnalyze` fires the queued search on the very next
          // line. `setoption name Threads` tears down and rebuilds the thread
          // pool, and on the multi-threaded WASM build a `go` issued in the
          // same tick as that rebuild never answers: one `go`, no `bestmove`,
          // the engine stuck on "analyzing" for good.
          //
          // Reproduced on every run of the import path -- restore an auto-saved
          // game, which does `ucinewgame` and then immediately queues a 70ms
          // search -- with the multi-threaded profile, and on no run of the
          // single-threaded one, which never sends `Threads` at all.
          if (threads > 1 && appliedOptionsRef.current.get('Threads') !== String(threads)) {
            setOption('Threads', threads)
          }
          setStatus((value) => (value === 'error' ? value : 'ready'))
          flushPendingAnalyze()
        }

        if (line.startsWith('info ')) {
          if (!isSearchingRef.current) continue
          if (pendingAnalyzeRef.current && pendingAnalyzeRef.current.fen !== currentAnalysisFenRef.current) continue

          const parsed = parseInfoLine(line)
          if (!parsed) continue

          const heldLine = liveLinesMapRef.current.get(parsed.multipv)
          const heldThisSearch = heldLine?.searchId === currentSearchIdRef.current
          if (heldThisSearch && !shouldReplaceLiveLine(heldLine, parsed)) continue

          liveLinesMapRef.current.set(parsed.multipv, {
            ...parsed,
            fen: currentAnalysisFenRef.current,
            searchId: currentSearchIdRef.current,
            purpose: currentAnalysisPurposeRef.current,
            mode: currentAnalysisModeRef.current,
            limits: currentAnalysisLimitsRef.current,
          })
          scheduleLinesMapFlush()
        }

        if (line.startsWith('bestmove ')) {
          if (!isSearchingRef.current) continue
          flushLinesMap()
          const parsed = parseBestMoveLine(line)
          setLastBestMove(parsed?.bestMove ?? null)
          setLastBestMoveFen(parsed?.bestMove ? currentAnalysisFenRef.current : null)
          setLastPonderMove(parsed?.ponderMove ?? null)
          setLastPonderMoveFen(parsed?.ponderMove ? currentAnalysisFenRef.current : null)
          isSearchingRef.current = false
          stopRequestedRef.current = false

          const sentNewGameSync = newGamePendingRef.current
          if (sentNewGameSync) {
            newGamePendingRef.current = false
            sendNewGameSync()
          }

          if (sentNewGameSync) {
            setActiveGoCommand('')
            continue
          }

          if (pendingAnalyzeRef.current) {
            setActiveGoCommand('')
            flushPendingAnalyze()
            continue
          }

          setActiveGoCommand('')
          setStatus((value) => (value === 'error' ? value : 'ready'))
        }
      }
    }

    worker.onerror = (event) => {
      if (currentSession !== bootSessionRef.current) return
      const message = event.message || 'Unknown worker error.'
      // The browser's messages usually end in a full stop of their own, and
      // two of them read as a typo.
      const punctuated = /[.!?]$/.test(message) ? message : `${message}.`
      failWorker(
        `Engine worker error while running ${profile.name}: ${punctuated}`,
        `Engine worker error while running ${profile.name}: ${message}`,
      )
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
      newGamePendingRef.current = false
      clearLinesMapFlushTimer()
      rejectQueuedCommands('Engine worker terminated.')
      if (workerBlobUrl) URL.revokeObjectURL(workerBlobUrl)
    }
  }, [
    activeFallbackReason,
    capabilities,
    clearLinesMapFlushTimer,
    dispatchQueuedLine,
    enabled,
    flushLinesMap,
    flushPendingAnalyze,
    rejectQueuedCommands,
    resetLinesMap,
    resolvedProfile,
    scheduleLinesMapFlush,
    selectedProfile,
    send,
    sendNewGameSync,
    setOption,
  ])

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
    lastBestMoveFen,
    lastPonderMove,
    lastPonderMoveFen,
    activeGoCommand,
    queueLength,
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
