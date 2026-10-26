import { useLayoutEffect, useRef, useState } from 'react'
import { normalizeSpinOptionInput } from '../engine/options'

type EngineOptionControlProps = {
  option: {
    name: string
    type: 'check' | 'spin' | 'string' | 'button' | 'combo'
    defaultValue?: string
    currentValue?: string
    /** The native setting, when currentValue displays a saved preference. */
    appliedValue?: string
    min?: number
    max?: number
    vars?: string[]
  }
  onSetOption: (name: string, value?: string | number | boolean) => void
  disabled?: boolean
}

export function EngineOptionControl({ option, onSetOption, disabled = false }: EngineOptionControlProps) {
  const optionValue = option.currentValue ?? option.defaultValue ?? ''
  const appliedValue = option.appliedValue ?? optionValue
  const [previousOptionValue, setPreviousOptionValue] = useState(optionValue)
  const [value, setValue] = useState(optionValue)
  const restoreTarget = useRef<HTMLElement | null>(null)
  const cancelRestore = useRef<() => void>(() => {})
  const rememberApplyFocus = (target: HTMLElement | null) => {
    cancelRestore.current()
    if (!target) return
    restoreTarget.current = target
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const
    const cancel = () => {
      restoreTarget.current = null
      for (const name of events) window.removeEventListener(name, cancel, true)
    }
    cancelRestore.current = cancel
    for (const name of events) window.addEventListener(name, cancel, { capture: true, passive: true })
  }

  useLayoutEffect(() => () => cancelRestore.current(), [])
  useLayoutEffect(() => {
    const target = restoreTarget.current
    if (!target) return
    if (disabled && target.matches(':disabled')) return
    cancelRestore.current()
    if (!disabled && document.activeElement === document.body && target.isConnected && !target.matches(':disabled')) {
      target.focus()
    }
  }, [disabled])

  // Keep an editable draft, but reset it before committing a changed external
  // value. An effect briefly displayed the old setting after the new one had
  // already been applied and persisted by the console or shared controls.
  if (previousOptionValue !== optionValue) {
    setPreviousOptionValue(optionValue)
    setValue(optionValue)
  }

  if (option.type === 'button') {
    return (
      <div className="engine-option-row">
        <button type="button" disabled={disabled} onClick={event => {
          rememberApplyFocus(event.currentTarget)
          onSetOption(option.name)
        }}>
          {option.name}
        </button>
      </div>
    )
  }

  if (option.type === 'check') {
    const checked = value === 'true'
    return (
      <label className="switch-control">
        <input
          type="checkbox"
          aria-label={option.name}
          checked={checked}
          disabled={disabled}
          onChange={e => {
            const nv = e.target.checked ? 'true' : 'false'
            setValue(nv)
            rememberApplyFocus(e.currentTarget)
            onSetOption(option.name, e.target.checked)
          }} />
        <span>{option.name}</span>
      </label>
    )
  }

  if (option.type === 'spin') {
    return (
      <label className="engine-option-row">
        <span>{option.name}</span>
        <input
          type="number"
          aria-label={option.name}
          min={option.min}
          max={option.max}
          value={value}
          disabled={disabled}
          onChange={e => setValue(e.target.value)}
          onBlur={event => {
            const normalized = normalizeSpinOptionInput(option, value)
            setValue(String(normalized))
            if (String(normalized) === appliedValue) return
            // Keep the Tab destination while applying, yielding to new input.
            rememberApplyFocus(event.relatedTarget instanceof HTMLElement ? event.relatedTarget : null)
            onSetOption(option.name, normalized)
          }} />
      </label>
    )
  }

  if (option.type === 'combo') {
    const choices = option.vars?.length ? option.vars : [optionValue].filter(Boolean)
    return (
      <label className="engine-option-row">
        <span>{option.name}</span>
        <select
          aria-label={option.name}
          value={value}
          disabled={disabled}
          onChange={e => {
            setValue(e.target.value)
            rememberApplyFocus(e.currentTarget)
            onSetOption(option.name, e.target.value)
          }}>
          {choices.map(choice => (
            <option key={choice} value={choice}>{choice}</option>
          ))}
        </select>
      </label>
    )
  }

  return (
    <label className="engine-option-row">
      <span>{option.name}</span>
      <input
        type="text"
        aria-label={option.name}
        value={value}
        disabled={disabled}
        onChange={e => setValue(e.target.value)}
        onBlur={event => {
          if (value === optionValue) return
          rememberApplyFocus(event.relatedTarget instanceof HTMLElement ? event.relatedTarget : null)
          onSetOption(option.name, value)
        }} />
    </label>
  )
}
