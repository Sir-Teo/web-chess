import { useCallback, useEffect, useRef } from 'react'
import { SOUND_SHAPES, type MoveSound, type SoundShape } from '../engine/moveSound'

/**
 * Short synthesized sounds for moves, built on demand from `SOUND_SHAPES`.
 *
 * No audio files, deliberately: see the note in `engine/moveSound.ts`. The
 * context is created on the first sound rather than on mount, because a browser
 * refuses to start one before a gesture and a suspended context created at load
 * is a warning in the console for a page that may never play anything.
 *
 * Every failure here is swallowed. Audio is decoration: a browser that blocks
 * it, a device with no output, a context that will not resume — none of them is
 * a reason to interrupt a game.
 */

type AudioContextConstructor = new () => AudioContext

function audioContextConstructor(): AudioContextConstructor | null {
  if (typeof window === 'undefined') return null
  const scope = window as unknown as {
    AudioContext?: AudioContextConstructor
    webkitAudioContext?: AudioContextConstructor
  }
  return scope.AudioContext ?? scope.webkitAudioContext ?? null
}

/** A short burst of white noise, which is what gives a knock its attack. */
function noiseBuffer(context: AudioContext, seconds: number): AudioBuffer {
  const frames = Math.max(1, Math.floor(context.sampleRate * seconds))
  const buffer = context.createBuffer(1, frames, context.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < frames; i += 1) {
    // Fades across the buffer so the burst is an attack rather than a hiss.
    data[i] = (Math.random() * 2 - 1) * (1 - i / frames)
  }
  return buffer
}

function playHit(
  context: AudioContext,
  destination: AudioNode,
  shape: SoundShape,
  frequency: number,
  startAt: number,
) {
  const gain = context.createGain()
  gain.gain.setValueAtTime(0.0001, startAt)
  gain.gain.exponentialRampToValueAtTime(shape.gain, startAt + 0.006)
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + shape.duration)
  gain.connect(destination)

  const oscillator = context.createOscillator()
  oscillator.type = shape.noise ? 'triangle' : 'sine'
  oscillator.frequency.setValueAtTime(frequency, startAt)
  oscillator.connect(gain)
  oscillator.start(startAt)
  oscillator.stop(startAt + shape.duration + 0.02)

  if (!shape.noise) return

  const noise = context.createBufferSource()
  noise.buffer = noiseBuffer(context, Math.min(shape.duration, 0.05))
  const noiseFilter = context.createBiquadFilter()
  noiseFilter.type = 'bandpass'
  noiseFilter.frequency.setValueAtTime(frequency * 6, startAt)
  noiseFilter.Q.setValueAtTime(0.8, startAt)
  const noiseGain = context.createGain()
  noiseGain.gain.setValueAtTime(shape.gain * 0.55, startAt)
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, startAt + Math.min(shape.duration, 0.05))
  noise.connect(noiseFilter).connect(noiseGain).connect(destination)
  noise.start(startAt)
}

export function useMoveSound(enabled: boolean) {
  const contextRef = useRef<AudioContext | null>(null)
  const masterRef = useRef<GainNode | null>(null)

  useEffect(() => () => {
    const context = contextRef.current
    contextRef.current = null
    masterRef.current = null
    void context?.close().catch(() => {})
  }, [])

  return useCallback((sound: MoveSound) => {
    if (!enabled) return

    try {
      if (!contextRef.current) {
        const Constructor = audioContextConstructor()
        if (!Constructor) return
        const context = new Constructor()
        const master = context.createGain()
        // Headroom: two sounds can overlap when a game ends on a fast move.
        master.gain.value = 0.35
        master.connect(context.destination)
        contextRef.current = context
        masterRef.current = master
      }

      const context = contextRef.current
      const master = masterRef.current
      if (!context || !master) return
      // Suspended is the normal state before the page's first gesture, and
      // again after a tab has been backgrounded on some browsers.
      if (context.state === 'suspended') void context.resume().catch(() => {})

      const shape = SOUND_SHAPES[sound]
      const now = context.currentTime
      playHit(context, master, shape, shape.frequency, now)
      if (shape.echoDelay) {
        playHit(context, master, shape, shape.echoFrequency ?? shape.frequency, now + shape.echoDelay)
      }
    } catch {
      // Decoration. Never let it reach the game.
    }
  }, [enabled])
}
