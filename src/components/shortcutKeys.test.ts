import { describe, expect, it } from 'vitest'
import { isPlainShortcut, isTypingTarget } from './shortcutKeys'

const key = (overrides: Partial<Record<'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey', boolean>> = {}) => ({
    ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...overrides,
})

describe('plain shortcuts', () => {
    it('accepts a bare key', () => {
        expect(isPlainShortcut(key())).toBe(true)
    })

    it('refuses the chords the browser owns', () => {
        // Command+F is Find; the app used to flip the board and swallow it.
        expect(isPlainShortcut(key({ metaKey: true }))).toBe(false)
        // Control+F is Find on Windows and Linux.
        expect(isPlainShortcut(key({ ctrlKey: true }))).toBe(false)
        // Alt/Option with an arrow is Back, and word-navigation on a Mac.
        expect(isPlainShortcut(key({ altKey: true }))).toBe(false)
    })

    it('refuses a shifted key, since nothing here binds one', () => {
        expect(isPlainShortcut(key({ shiftKey: true }))).toBe(false)
    })

    it('refuses a combination of modifiers', () => {
        expect(isPlainShortcut(key({ metaKey: true, shiftKey: true }))).toBe(false)
    })
})

describe('typing targets', () => {
    it('recognises the elements that should keep their own keystrokes', () => {
        for (const tag of ['INPUT', 'SELECT', 'TEXTAREA']) {
            expect(isTypingTarget({ tagName: tag, isContentEditable: false } as unknown as EventTarget)).toBe(true)
        }
        expect(isTypingTarget({ tagName: 'DIV', isContentEditable: true } as unknown as EventTarget)).toBe(true)
    })

    it('lets a shortcut through elsewhere', () => {
        expect(isTypingTarget({ tagName: 'BUTTON', isContentEditable: false } as unknown as EventTarget)).toBe(false)
        expect(isTypingTarget(null)).toBe(false)
    })
})
