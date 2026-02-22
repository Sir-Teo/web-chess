import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

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

const ENGINE_WORKER_PATH = `${import.meta.env.BASE_URL}engine/stockfish-18-lite-single.js`

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

export function useStockfishEngine() {
  const workerRef = useRef<Worker | null>(null)
  const isReadyRef = useRef(false)
  const queuedAnalyzeRef = useRef<AnalyzeParams | null>(null)

  const [status, setStatus] = useState<EngineStatus>('loading')
  const [engineName, setEngineName] = useState('Stockfish')
  const [lastBestMove, setLastBestMove] = useState<string | null>(null)
  const [linesMap, setLinesMap] = useState<Map<number, EngineLine>>(new Map())
  const [options, setOptions] = useState<EngineOption[]>([])

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
    const worker = new Worker(ENGINE_WORKER_PATH)
    workerRef.current = worker

    worker.onmessage = (event: MessageEvent<string>) => {
      const line = event.data

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
      setStatus('error')
    }

    send('uci')

    return () => {
      worker.terminate()
      workerRef.current = null
      isReadyRef.current = false
    }
  }, [analyzePosition, send])

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
    analyzePosition,
    stop,
    setOption,
  }
}

export type { EngineLine, EngineOption, EngineStatus }
