import { useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { normalizeSpinOptionInput } from '../engine/options'
import { isCompositionKey } from './shortcutKeys'

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
    const cancel = (event?: Event) => {
      // A held apply key is still the same action, including while disabling
      // the field has temporarily moved native focus onto the document.
      if (event instanceof KeyboardEvent && event.key === 'Enter' && event.repeat) return
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

  const applyInputValue = (focusTarget: HTMLElement | null) => {
    if (disabled) return
    const next = option.type === 'spin' ? normalizeSpinOptionInput(option, value) : value
    setValue(String(next))
    if (String(next) === appliedValue) return
    rememberApplyFocus(focusTarget)
    onSetOption(option.name, next)
  }
  const applyOnEnter = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter' || isCompositionKey(event.nativeEvent)) return
    event.preventDefault()
    if (event.repeat) return
    // Applying temporarily disables the field while Stockfish acknowledges it.
    // Return here unless the reader chooses another control in the meantime.
    applyInputValue(event.currentTarget)
  }

  if (option.type === 'button') {
    return (
      <div className="engine-option-row">
        <button type="button" disabled={disabled} onKeyDown={event => {
          if (event.key === 'Enter' && (event.repeat || isCompositionKey(event.nativeEvent))) event.preventDefault()
        }} onClick={event => {
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
          enterKeyHint="done"
          onChange={e => setValue(e.target.value)}
          onKeyDown={applyOnEnter}
          onBlur={event => applyInputValue(event.relatedTarget instanceof HTMLElement ? event.relatedTarget : null)} />
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
        enterKeyHint="done"
        onChange={e => setValue(e.target.value)}
        onKeyDown={applyOnEnter}
        onBlur={event => applyInputValue(event.relatedTarget instanceof HTMLElement ? event.relatedTarget : null)} />
    </label>
  )
}
