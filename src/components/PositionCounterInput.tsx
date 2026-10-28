import { useMemo, useState } from 'react'
import { isCompositionKey } from './shortcutKeys'
import { parseFenCounterValue } from '../engine/fen'
import { truncateUtf16 } from '../engine/textLength'

export function PositionCounterInput({ id, value, rawValue, min, position, descriptionId, onValueChange }: {
  id: string
  value: number
  rawValue: string | undefined
  min: number
  position: object
  descriptionId?: string
  onValueChange: (value: number) => void
}) {
  const rawNumber = useMemo(() => parseFenCounterValue(rawValue), [rawValue])
  const rawInvalid = rawNumber === null || rawNumber < min
  const safeValue = rawNumber !== null && rawNumber >= min ? rawNumber
    : Number.isSafeInteger(value) && value >= min ? value : min
  const [previous, setPrevious] = useState({ value, rawValue, min, position })
  const [draft, setDraft] = useState(String(safeValue))
  // A preset or FEN paste resets the draft even when this number is unchanged.
  if (previous.value !== value || previous.rawValue !== rawValue || previous.min !== min || previous.position !== position) {
    setPrevious({ value, rawValue, min, position })
    setDraft(String(safeValue))
  }

  const commit = (explicit = false) => {
    const parsed = Number(draft)
    const candidate = Boolean(draft.trim()) && Number.isFinite(parsed)
    const next = candidate ? Math.max(min, Math.floor(parsed)) : safeValue
    setDraft(String(next))
    if (next !== safeValue || (rawInvalid && (explicit || (candidate && draft.trim() !== String(safeValue))))) onValueChange(next)
  }
  const errorId = `${id}-raw-error`
  const preview = useMemo(() => rawValue === undefined ? ''
    : truncateUtf16(rawValue, 32) + (rawValue.length > 32 ? '…' : ''), [rawValue])

  return <><input id={id} type="number" min={min} step={1} inputMode="numeric" value={draft}
    aria-invalid={rawInvalid || undefined}
    aria-describedby={[rawInvalid ? errorId : undefined, descriptionId].filter(Boolean).join(' ') || undefined}
    // Replacing the shown fallback with the same number is still an explicit
    // repair. onInput also sees that edit when React's change tracker does not.
    onInput={event => {
      const text = event.currentTarget.value
      setDraft(text)
      const parsed = Number(text)
      // Valid edits update the FEN immediately. A blank or partial number
      // remains an editable draft until blur or Enter.
      if (text.trim() && Number.isFinite(parsed) && Number.isInteger(parsed) && parsed >= min && (parsed !== safeValue || rawInvalid)) {
        onValueChange(parsed)
      }
    }}
    onBlur={() => commit()}
    onKeyDown={event => {
      if (event.key !== 'Enter' || isCompositionKey(event.nativeEvent)) return
      event.preventDefault()
      commit(true)
    }} />
    {rawInvalid && <p id={errorId} className="fen-counter-error">
      {rawValue === undefined ? 'Missing in FEN.' : `FEN: “${preview}”.`} Press Enter for {safeValue}.
    </p>}
  </>
}
