import { useId, useState } from 'react'
import type { Move } from 'chess.js'
import { parseMoveEntry } from '../engine/moveEntry'
import './MoveEntry.css'

export function MoveEntry({ fen, onMove, disabled = false }: {
  fen: string
  onMove: (move: Move) => boolean
  disabled?: boolean
}) {
  const id = useId()
  // Keep the input mounted and focused between moves; a draft belongs only to
  // the position it was typed for, so navigation cannot submit a stale move.
  const [draft, setDraft] = useState({ fen, text: '', error: '' })
  const text = draft.fen === fen ? draft.text : ''
  const error = draft.fen === fen ? draft.error : ''
  return (
    <details className="move-entry">
      <summary>Enter a move by name</summary>
      <form onSubmit={event => {
        event.preventDefault()
        if (disabled || !text.trim()) return
        const move = parseMoveEntry(fen, text)
        if (!move) {
          setDraft({ fen, text, error: 'That move is not legal here. Use e4, Nf3 or e2e4; include the piece for promotion, such as a8=N.' })
          return
        }
        const played = onMove(move)
        setDraft({ fen, text: played ? '' : text, error: played ? '' : 'That move does not match this exercise. Try again.' })
      }}>
        <label htmlFor={id}>Move for {fen.split(' ')[1] === 'b' ? 'Black' : 'White'}</label>
        <div className="move-entry-row">
          <input id={id} value={text} placeholder="e4, Nf3 or e2e4" maxLength={16}
            autoComplete="off" autoCapitalize="off" spellCheck={false} disabled={disabled}
            aria-describedby={`${id}-help${error ? ` ${id}-error` : ''}`} aria-invalid={Boolean(error)}
            onChange={event => setDraft({ fen, text: event.target.value, error: '' })} />
          <button type="submit" disabled={disabled || !text.trim()}>Play move</button>
        </div>
        <p id={`${id}-help`}>Type one move and press Enter. Castle with O-O; promote with a8=Q or a7a8n.</p>
        {error && <p id={`${id}-error`} className="error-copy" role="alert">{error}</p>}
      </form>
    </details>
  )
}
