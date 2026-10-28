import { useId, useRef, useState } from 'react'
import type { Move } from 'chess.js'
import { moveEntryExplanation, parseMoveEntry } from '../engine/moveEntry'
import { isCompositionKey } from './shortcutKeys'
import './MoveEntry.css'

export function MoveEntry({ fen, onMove, disabled = false, disabledReason = 'The board is not taking moves right now.' }: {
  fen: string
  onMove: (move: Move) => boolean
  disabled?: boolean
  disabledReason?: string
}) {
  const id = useId()
  const input = useRef<HTMLInputElement>(null)
  const blackToMove = fen.split(' ')[1] === 'b'
  const examples = blackToMove ? 'e5, Nf6 or e7e5' : 'e4, Nf3 or e2e4'
  const promotionSquare = blackToMove ? 'a1' : 'a8'
  const promotionUci = blackToMove ? 'a2a1n' : 'a7a8n'
  // Keep the input mounted and focused between moves; a draft belongs only to
  // the position it was typed for, so navigation cannot submit a stale move.
  const [draft, setDraft] = useState({ fen, text: '', error: '' })
  const text = draft.fen === fen ? draft.text : ''
  const error = draft.fen === fen ? draft.error : ''
  return (
    <details className="move-entry">
      <summary>Enter a move by name</summary>
      <form onKeyDown={event => {
        // A repeated submission of a refused draft must not spend another drill attempt.
        if (event.key === 'Enter' && (event.repeat || isCompositionKey(event.nativeEvent))) event.preventDefault()
      }} onSubmit={event => {
        event.preventDefault()
        if (disabled || !text.trim()) return
        // The submit button can be disabled by a successful move. Keep the
        // next move or correction in this field rather than handing focus away.
        input.current?.focus()
        const move = parseMoveEntry(fen, text)
        if (!move) {
          setDraft({ fen, text, error: moveEntryExplanation(fen, text)
            ?? `That move is not legal here. Use ${examples}; include the piece for promotion, such as ${promotionSquare}=N.` })
          return
        }
        const played = onMove(move)
        setDraft({ fen, text: played ? '' : text, error: played ? '' : 'That move does not match this exercise. Try again.' })
      }}>
        <label htmlFor={id}>Move for {blackToMove ? 'Black' : 'White'}</label>
        <div className="move-entry-row">
          <input id={id} ref={input} value={text} placeholder={examples} maxLength={16}
            autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false} enterKeyHint="go"
            // Read-only rather than disabled: a disabled field drops focus, and in
            // a game it is disabled for every one of the opponent's moves.
            readOnly={disabled} aria-disabled={disabled || undefined}
            aria-describedby={`${id}-help${disabled ? ` ${id}-unavailable` : ''}${error ? ` ${id}-error` : ''}`} aria-invalid={Boolean(error)}
            onChange={event => setDraft({ fen, text: event.target.value, error: '' })} />
          {/* A dead button says why, like every other one here. Empty is the
              ordinary case -- the reader has opened the field and not typed
              yet -- and "the board is not taking moves" is the other. */}
          <button
            type="submit"
            disabled={disabled || !text.trim()}
            title={disabled
              ? disabledReason
              : !text.trim()
                ? `Type a move first, such as ${examples}.`
                : 'Play this move on the board'}
          >
            Play move
          </button>
        </div>
        <p id={`${id}-help`}>{`Type one move and press Enter. Castle with O-O; promote with ${promotionSquare}=Q or ${promotionUci}.`}</p>
        {disabled && <p id={`${id}-unavailable`} role="status">{disabledReason}</p>}
        {error && <p id={`${id}-error`} className="error-copy" role="alert">{error}</p>}
      </form>
    </details>
  )
}
