/**
 * Whether a keydown is a plain shortcut this app should act on.
 *
 * The shortcuts here bind bare keys — arrows, Home, End, `f`, space — and did
 * not look at modifiers, so they fired on the browser's own chords too. `f`
 * with Command held flipped the board *and* called `preventDefault()`, which is
 * how Find is opened; there was no way to search the page. Command or Alt with
 * an arrow, which is Back in a browser and word-navigation on a Mac, stepped
 * through the game instead.
 *
 * web-katrain's shortcut registry models this properly — it records `ctrl`
 * (either Control or Command), `alt` and `shift` per binding and matches on all
 * of them. This is the same rule in the smallest form that fits an app with six
 * shortcuts: a plain shortcut is one with no modifier held.
 *
 * Shift is included. Nothing here binds a shifted key, and letting Shift
 * through would mean a capital `F` flips the board, which is not something the
 * app promises anywhere.
 */
export function isPlainShortcut(event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>): boolean {
    return !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey
}

/** True for a target that should receive the keystroke itself. */
export function isTypingTarget(target: EventTarget | null): boolean {
    const element = target as HTMLElement | null
    if (!element) return false
    if (element.isContentEditable) return true
    const tag = element.tagName
    return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA'
}
