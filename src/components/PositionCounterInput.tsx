import { useState } from 'react'
import { isCompositionKey } from './shortcutKeys'

export function PositionCounterInput({ id, value, min, position, onValueChange }: {
  id: string
  value: number
  min: number
  position: object
  onValueChange: (value: number) => void
}) {
  const [previous, setPrevious] = useState({ value, position })
  const [draft, setDraft] = useState(String(value))
  // A preset or FEN paste resets the draft even when this number is unchanged.
  if (previous.value !== value || previous.position !== position) {
    setPrevious({ value, position })
    setDraft(String(value))
  }

  const commit = () => {
    const parsed = Number(draft)
    const next = draft.trim() && Number.isFinite(parsed) ? Math.max(min, Math.floor(parsed)) : value
    setDraft(String(next))
    if (next !== value) onValueChange(next)
  }

  return <input id={id} type="number" min={min} step={1} inputMode="numeric" value={draft}
    onChange={event => {
      const text = event.target.value
      setDraft(text)
      const parsed = Number(text)
      // Valid edits update the FEN immediately. A blank or partial number
      // remains an editable draft until blur or Enter.
      if (text.trim() && Number.isFinite(parsed) && Number.isInteger(parsed) && parsed >= min && parsed !== value) {
        onValueChange(parsed)
      }
    }}
    onBlur={commit}
    onKeyDown={event => {
      if (event.key !== 'Enter' || isCompositionKey(event.nativeEvent)) return
      event.preventDefault()
      commit()
    }} />
}
