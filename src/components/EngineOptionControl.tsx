import { useEffect, useState } from 'react'
import { normalizeSpinOptionInput } from '../engine/options'

type EngineOptionControlProps = {
  option: {
    name: string
    type: 'check' | 'spin' | 'string' | 'button' | 'combo'
    defaultValue?: string
    currentValue?: string
    min?: number
    max?: number
    vars?: string[]
  }
  onSetOption: (name: string, value?: string | number | boolean) => void
  disabled?: boolean
}

export function EngineOptionControl({ option, onSetOption, disabled = false }: EngineOptionControlProps) {
  const optionValue = option.currentValue ?? option.defaultValue ?? ''
  const [value, setValue] = useState(optionValue)

  useEffect(() => {
    setValue(optionValue)
  }, [optionValue])

  if (option.type === 'button') {
    return (
      <div className="engine-option-row">
        <button type="button" disabled={disabled} onClick={() => onSetOption(option.name)}>
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
          onBlur={() => {
            const normalized = normalizeSpinOptionInput(option, value)
            setValue(String(normalized))
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
        onBlur={() => onSetOption(option.name, value)} />
    </label>
  )
}
