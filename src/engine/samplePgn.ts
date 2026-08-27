import { fetchLichessResource } from './lichessQueue'

export type SamplePgnRequest = {
  id: string
  lichessGameId: string
}

const LICHESS_GAME_EXPORT_URL = 'https://lichess.org/game/export'
const SAMPLE_PGN_ABORT_MESSAGE = 'Sample PGN request aborted.'

function throwIfAborted(signal: AbortSignal | undefined) {
  if (!signal?.aborted) return
  const reason = signal.reason
  throw reason instanceof Error ? reason : new Error(SAMPLE_PGN_ABORT_MESSAGE)
}

export function buildSamplePgnUrl(gameId: string): string {
  const url = new URL(`${LICHESS_GAME_EXPORT_URL}/${gameId}`)
  url.searchParams.set('moves', 'true')
  url.searchParams.set('tags', 'true')
  url.searchParams.set('clocks', 'false')
  url.searchParams.set('evals', 'false')
  url.searchParams.set('opening', 'true')
  url.searchParams.set('literate', 'false')
  return url.toString()
}

export async function fetchSamplePgn(
  sample: SamplePgnRequest,
  signal?: AbortSignal,
): Promise<string> {
  const response = await fetchLichessResource(buildSamplePgnUrl(sample.lichessGameId), {
    signal,
    headers: { Accept: 'application/x-chess-pgn' },
  })
  throwIfAborted(signal)

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error('Lichess sample game rate limit reached; try again in a minute.')
    }
    throw new Error(`Failed to fetch sample PGN (${response.status}).`)
  }

  const pgnText = await response.text()
  throwIfAborted(signal)
  return pgnText
}
