import { useId, useLayoutEffect, useRef, useState } from 'react'
import { MAX_SAVED_REVIEW_TITLE_LENGTH } from '../engine/savedReviews'
import { isCompositionKey } from './shortcutKeys'

export function SavedReviewNameEditor({ title, disabled, onRename }: {
  title: string
  disabled: boolean
  /** An error message on failure, or null after the write commits. */
  onRename: (name: string) => Promise<string | null>
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(title)
  const [focusRequest, setFocusRequest] = useState(0)
  const [error, setError] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const returnFocus = useRef(false)
  const id = useId()

  useLayoutEffect(() => {
    if (!editing) return
    input.current?.focus()
    input.current?.select()
  }, [editing, focusRequest])

  useLayoutEffect(() => {
    if (editing || disabled || !returnFocus.current) return
    returnFocus.current = false
    trigger.current?.focus()
  }, [disabled, editing])

  const cancel = () => { returnFocus.current = true; setEditing(false) }
  const save = async () => {
    if (disabled || !draft.trim()) return
    const message = await onRename(draft.trim())
    if (message === null) cancel()
    else { setError(message); setFocusRequest(value => value + 1) }
  }

  return <div className="saved-review-name-editor">
    <div className="review-report-actions">
      <button ref={trigger} type="button" disabled={disabled || editing} onClick={() => {
        setDraft(title)
        setError('')
        setEditing(true)
      }}>Rename saved review</button>
    </div>
    {editing && <form onSubmit={event => { event.preventDefault(); void save() }}>
      <label htmlFor={id}>Saved review name</label>
      <input ref={input} id={id} className="saved-review-name-input" value={draft}
        maxLength={MAX_SAVED_REVIEW_TITLE_LENGTH} readOnly={disabled}
        onChange={event => { setDraft(event.target.value); setError('') }}
        onKeyDown={event => {
          if (event.key !== 'Escape' || disabled || isCompositionKey(event.nativeEvent)) return
          event.preventDefault()
          event.stopPropagation()
          cancel()
        }} />
      <div className="review-report-actions">
        <button type="submit" disabled={disabled || !draft.trim()}>Save name</button>
        <button type="button" disabled={disabled} onClick={cancel}>Cancel</button>
      </div>
      {error && <p className="error-copy" role="alert">{error}</p>}
    </form>}
  </div>
}
