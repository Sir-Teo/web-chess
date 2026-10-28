import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useModalFocus } from '../hooks/useModalFocus'
import { MAX_SEARCH_QUERY_LENGTH } from '../engine/searchTerms'
import { type Command, rankCommands, readRecentCommandIds, rememberCommandId } from './commandPalette'
import { isCompositionKey, isPlainShortcut } from './shortcutKeys'
import { IconClose } from './icons'
import './NewGameDialog.css'
import './CommandPaletteDialog.css'

type Props = {
    open: boolean
    commands: Command[]
    onClose: () => void
}

/**
 * One list, one input, and the arrow keys. Ported in spirit from web-katrain,
 * which has had a palette since long before this app did.
 *
 * A disabled command is shown rather than hidden, with the reason as its hint.
 * A reader looking for "Review game" should find out that it needs moves first,
 * not be left wondering whether they misremembered the name.
 */
export function CommandPaletteDialog({ open, commands, onClose }: Props) {
    const panelRef = useRef<HTMLDivElement>(null)
    const listRef = useRef<HTMLUListElement>(null)
    const [query, setQuery] = useState('')
    const [activeIndex, setActiveIndex] = useState(0)
    const [recentIds, setRecentIds] = useState<string[]>([])
    const titleId = useId()
    const inputId = useId()

    useModalFocus(open, panelRef, onClose, { initialFocus: '[data-command-input]', trapFocus: true })

    // Reset before the reopened dialog is painted or accepts a key. An effect
    // after paint briefly exposes the previous query/selection and can reset
    // a selection the reader has already moved with the keyboard.
    useLayoutEffect(() => {
        if (!open) return
        setQuery('')
        setActiveIndex(0)
        setRecentIds(readRecentCommandIds())
    }, [open])

    const ranked = useMemo(() => rankCommands(commands, query, recentIds), [commands, query, recentIds])

    // The query changing can leave the highlight past the end of a shorter list.
    useEffect(() => {
        setActiveIndex(index => (index >= ranked.length ? 0 : index))
    }, [ranked.length])

    useLayoutEffect(() => {
        if (!open) return
        const active = listRef.current?.querySelector('[data-active="true"]')
        active?.scrollIntoView({ block: 'nearest' })
    }, [activeIndex, open, query])

    if (!open) return null

    const runCommand = (command: Command | undefined) => {
        if (!command || command.disabled) return
        setRecentIds(rememberCommandId(command.id))
        onClose()
        command.run()
    }

    const onKeyDown = (event: React.KeyboardEvent) => {
        if (event.defaultPrevented || !isPlainShortcut(event.nativeEvent)
            || isCompositionKey(event.nativeEvent) || ranked.length === 0) return
        if (event.key === 'ArrowDown') {
            event.preventDefault()
            setActiveIndex(index => (index + 1) % ranked.length)
        }
        if (event.key === 'ArrowUp') {
            event.preventDefault()
            setActiveIndex(index => (index - 1 + ranked.length) % ranked.length)
        }
        if (event.key === 'Enter') {
            event.preventDefault()
            runCommand(ranked[activeIndex])
        }
    }

    return (
        <div className="dialog-backdrop" onClick={onClose} data-command-palette="true">
            <div
                ref={panelRef}
                className="dialog-panel command-palette"
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                onClick={event => event.stopPropagation()}
            >
                <header className="dialog-header">
                    <h2 id={titleId}>Commands</h2>
                    <button type="button" className="btn-cancel command-palette-close" onClick={onClose}
                        aria-label="Close Commands" title="Close Commands">
                        <IconClose aria-hidden="true" focusable="false" />
                    </button>
                </header>

                <div className="dialog-body">
                    <input
                        id={inputId}
                        data-command-input
                        aria-label="Search commands"
                        className="command-palette-input"
                        type="text"
                        role="combobox"
                        aria-autocomplete="list"
                        aria-expanded="true"
                        aria-controls={`${titleId}-list`}
                        aria-activedescendant={ranked[activeIndex] ? `${titleId}-${ranked[activeIndex].id}` : undefined}
                        autoComplete="off"
                        placeholder="Type a command…"
                        maxLength={MAX_SEARCH_QUERY_LENGTH}
                        value={query}
                        onKeyDown={onKeyDown}
                        onChange={event => { setQuery(event.target.value); setActiveIndex(0) }}
                    />

                    {/*
                      * Announced politely, the way web-katrain's palette does
                      * it. Without this a screen-reader user types and hears
                      * nothing: the list narrowing, or emptying, is invisible
                      * unless the count is spoken.
                      */}
                    <p className="command-palette-count" aria-live="polite" data-command-count>
                        {ranked.length === 0
                            ? 'No matches'
                            : `${ranked.length} command${ranked.length === 1 ? '' : 's'}`}
                    </p>

                    <ul className="command-palette-list" id={`${titleId}-list`} role="listbox" aria-labelledby={titleId} ref={listRef}>
                        {ranked.map((command, index) => (
                            <li
                                key={command.id}
                                id={`${titleId}-${command.id}`}
                                role="option"
                                aria-selected={index === activeIndex}
                                aria-disabled={command.disabled || undefined}
                                data-active={index === activeIndex}
                                data-command-id={command.id}
                                className="command-palette-row"
                            >
                                <button
                                    type="button"
                                    className="command-palette-button"
                                    disabled={command.disabled}
                                    onFocus={() => setActiveIndex(index)}
                                    onMouseEnter={() => setActiveIndex(index)}
                                    onClick={() => runCommand(command)}
                                >
                                    <span className="command-palette-label">{command.label}</span>
                                    {command.hint && (
                                        <span className="command-palette-hint" title={command.hint}>{command.hint}</span>
                                    )}
                                    {command.shortcut && <kbd className="command-palette-key">{command.shortcut}</kbd>}
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </div>
    )
}
