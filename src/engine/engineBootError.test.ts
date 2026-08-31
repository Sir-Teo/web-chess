import { describe, expect, it } from 'vitest'
import { engineBootFailureMessage } from './engineBootError'

const NAME = 'Lite Single (Local)'

describe('the two failures a reader actually hits', () => {
  /** Both of these were reproduced by blocking the requests in a browser. */
  it('explains a blocked .wasm rather than quoting the browser', () => {
    const message = engineBootFailureMessage(NAME, 'Uncaught TypeError: Failed to fetch')
    expect(message).toContain('could not be downloaded')
    expect(message).toContain('Check your connection')
    expect(message).not.toContain('TypeError')
    expect(message).not.toContain('Failed to fetch')
  })

  it('explains a blocked worker script the same way, because it is the same problem', () => {
    const raw = "Failed to execute 'importScripts' on 'WorkerGlobalScope': "
      + "The script at 'http://localhost/engine/stockfish-18-lite-single.js' failed to load."
    const message = engineBootFailureMessage(NAME, raw)
    expect(message).toContain('could not be downloaded')
    expect(message).not.toContain('importScripts')
    expect(message).not.toContain('WorkerGlobalScope')
  })

  it('says what still works, because nearly everything does', () => {
    expect(engineBootFailureMessage(NAME, 'Failed to fetch')).toMatch(/board.*keep working/)
  })
})

describe('failures worth telling apart', () => {
  it('points a memory failure at the setting that causes it', () => {
    for (const raw of ['Out of memory', 'RangeError: Array buffer allocation failed', 'memory access out of bounds']) {
      const message = engineBootFailureMessage(NAME, raw)
      expect(message, raw).toContain('hash size')
    }
  })

  it('points an isolation failure at the profile that avoids it', () => {
    const message = engineBootFailureMessage(NAME, 'SharedArrayBuffer is not defined')
    expect(message).toContain('cross-origin isolation')
    expect(message).toContain('single-threaded')
  })

  /** Memory before download: "Array buffer allocation failed" contains neither pattern's twin, but order still has to be pinned. */
  it('reads a memory failure as memory even when it mentions loading', () => {
    expect(engineBootFailureMessage(NAME, 'Out of memory: failed to load module'))
      .toContain('hash size')
  })
})

describe('a failure it does not recognise', () => {
  it('shows it rather than swallowing it', () => {
    expect(engineBootFailureMessage(NAME, 'something new went wrong'))
      .toBe('Lite Single (Local) could not be started: something new went wrong.')
  })

  it('does not add a second full stop to a message that has one', () => {
    const message = engineBootFailureMessage(NAME, 'It broke.')
    expect(message).toBe('Lite Single (Local) could not be started: It broke.')
    expect(message).not.toContain('..')
  })

  it('still says something useful when the worker said nothing at all', () => {
    expect(engineBootFailureMessage(NAME, '')).toBe('Lite Single (Local) could not be started.')
    expect(engineBootFailureMessage(NAME, '   ')).toBe('Lite Single (Local) could not be started.')
  })

  it('always names the profile, so the broken one can be told from the others', () => {
    for (const raw of ['Failed to fetch', 'Out of memory', 'SharedArrayBuffer', 'mystery', '']) {
      expect(engineBootFailureMessage('WASM Multithreaded', raw), raw).toContain('WASM Multithreaded')
    }
  })
})
