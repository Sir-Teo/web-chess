import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useModalFocus } from '../hooks/useModalFocus'
import { MAX_SEARCH_QUERY_LENGTH } from '../engine/searchTerms'
import { type Command, rankCommands, readRecentCommandIds, rememberCommandId } from './commandPalette'
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

    useEffect(() => {
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

    useEffect(() => {
        if (!open) return
        const active = listRef.current?.querySelector('[data-active="true"]')
        active?.scrollIntoView({ block: 'nearest' })
    }, [activeIndex, open])

    if (!open) return null

    const runCommand = (command: Command | undefined) => {
        if (!command || command.disabled) return
        setRecentIds(rememberCommandId(command.id))
        onClose()
        command.run()
    }

    const onKeyDown = (event: React.KeyboardEvent) => {
        if (ranked.length === 0) return
        if (event.key === 'ArrowDown') {
            event.preventDefault()
            setActiveIndex(index => (index + 1) % ranked.length)
        }
        if (event.key === 'ArrowUp') {
            event.preventDefault()
            setActiveIndex(index => (index - 1 + ranked.length) % ranked.length)
        }
        if (event.key === 'Home') { event.preventDefault(); setActiveIndex(0) }
        if (event.key === 'End') { event.preventDefault(); setActiveIndex(ranked.length - 1) }
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
                onKeyDown={onKeyDown}
            >
                <header className="dialog-header">
                    <h2 id={titleId}>Commands</h2>
                </header>

                <div className="dialog-body">
                    <input
                        id={inputId}
                        data-command-input
                        aria-label="Search commands"
                        className="command-palette-input"
                        type="text"
                        role="combobox"
                        aria-expanded="true"
                        aria-controls={`${titleId}-list`}
                        aria-activedescendant={ranked[activeIndex] ? `${titleId}-${ranked[activeIndex].id}` : undefined}
                        autoComplete="off"
                        placeholder="Type a command…"
                        maxLength={MAX_SEARCH_QUERY_LENGTH}
                        value={query}
                        onChange={event => { setQuery(event.target.value); setActiveIndex(0) }}
                    />

                    {ranked.length === 0 ? (
                        <p className="command-palette-empty">No command matches that.</p>
                    ) : (
                        <ul className="command-palette-list" id={`${titleId}-list`} role="listbox" ref={listRef}>
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
                                        onMouseEnter={() => setActiveIndex(index)}
                                        onClick={() => runCommand(command)}
                                    >
                                        <span className="command-palette-label">{command.label}</span>
                                        {command.hint && (
                                            // Titled because the hint is the reason a
                                            // command is unavailable, and it is the
                                            // first thing truncated at phone width.
                                            <span className="command-palette-hint" title={command.hint}>{command.hint}</span>
                                        )}
                                        {command.shortcut && <kbd className="command-palette-key">{command.shortcut}</kbd>}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    )
}
