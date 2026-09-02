import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { AutoSaveRecoveryDialog } from './AutoSaveRecoveryDialog'

const noop = vi.fn()
const NOW = Date.now()

function render(overrides: Partial<Parameters<typeof AutoSaveRecoveryDialog>[0]> = {}) {
    return renderToStaticMarkup(
        <AutoSaveRecoveryDialog
            savedAt={NOW - 5 * 60_000}
            plyCount={24}
            onRestore={noop}
            onDismiss={noop}
            {...overrides}
        />,
    )
}

describe('AutoSaveRecoveryDialog', () => {
    it('announces itself as a modal dialog with a name and a description', () => {
        const html = render()
        expect(html).toContain('role="dialog"')
        expect(html).toContain('aria-modal="true"')
        expect(html).toContain('aria-labelledby="auto-save-title"')
        expect(html).toContain('aria-describedby="auto-save-body"')
        expect(html).toContain('id="auto-save-title"')
        expect(html).toContain('id="auto-save-body"')
    })

    it('keeps its copy inside a section, so it is padded like every other dialog', () => {
        // The body carries no padding of its own; a bare paragraph in it sat
        // flush against the panel's edge, which on a phone is the screen's.
        expect(render()).toMatch(/<div class="dialog-body"><div class="dialog-section"><p id="auto-save-body">/)
    })

    it('says how much work is at stake and how old it is', () => {
        expect(render()).toContain('12 moves were in progress 5 minutes ago')
    })

    /**
     * The slot stores plies, the way the library does. Reporting them as moves
     * claimed a game twice as long as the one the reader left: the 116-ply
     * sample game offered to restore "116 moves", which every player reads as
     * move 116 rather than move 58.
     */
    it('reports full moves, not the plies it is given', () => {
        expect(render({ plyCount: 116 })).toContain('58 moves were in progress')
        expect(render({ plyCount: 115 })).toContain('58 moves were in progress')
    })

    /**
     * A restore that fails is the one place in the app where the reader's own
     * game can be destroyed. It used to clear the slot and close without a
     * word; the dialog now has to say what happened and offer the moves before
     * anything is discarded.
     */
    it('reports a failed restore instead of closing on it', () => {
        const html = render({ error: 'Invalid move in PGN: Qh9' })
        expect(html).toContain('could not be read back')
        expect(html).toContain('Invalid move in PGN: Qh9')
        expect(html).toContain('cannot be undone')
    })

    it('swaps Restore for Copy PGN once restoring has failed', () => {
        const html = render({ error: 'broken' })
        expect(html).toContain('Copy PGN')
        expect(html).toContain('Discard it')
        expect(html).not.toContain('>Restore<')
        expect(html).not.toContain('Start fresh')
    })

    it('offers Restore, and no discard-only wording, while nothing has failed', () => {
        const html = render()
        expect(html).toContain('>Restore<')
        expect(html).toContain('Start fresh')
        expect(html).not.toContain('could not be read back')
    })

    it('counts a single move in the singular', () => {
        expect(render({ plyCount: 1 })).toContain('1 move was in progress')
        expect(render({ plyCount: 2 })).toContain('1 move was in progress')
    })

    it('offers restoring as the primary action', () => {
        const html = render()
        expect(html).toContain('data-restore')
        expect(html).toContain('Restore')
        expect(html).toContain('Start fresh')
        // The primary action carries the emphasised button class.
        expect(html).toMatch(/class="btn-start"[^>]*data-restore/)
    })

    it('reuses the shared dialog shell', () => {
        const html = render()
        expect(html).toContain('dialog-backdrop')
        expect(html).toContain('dialog-panel')
        expect(html).toContain('dialog-actions')
    })
})

describe('a saved game that already ended', () => {
    it('calls an unfinished game unfinished, and asks to pick it up', () => {
        const html = render()
        expect(html).toContain('Unfinished game')
        expect(html).toContain('in progress')
        expect(html).toContain('Pick up where you left off?')
    })

    /**
     * The bug this covers: a checkmate was offered back as "12 moves were in
     * progress. Pick up where you left off?", which asks about something that
     * cannot happen.
     */
    it('names the winner instead of claiming the game is still going', () => {
        const html = render({ result: '1-0' })
        expect(html).toContain('Finished game')
        expect(html).toContain('White won in 12 moves')
        expect(html).toContain('Open it again?')
        expect(html).not.toContain('in progress')
        expect(html).not.toContain('Pick up where you left off')
    })

    it('names the other winner too', () => {
        expect(render({ result: '0-1' })).toContain('Black won in 12 moves')
    })

    it('does not give a draw a winner', () => {
        const html = render({ result: '1/2-1/2' })
        expect(html).toContain('Drawn in 12 moves')
        expect(html).toContain('Finished game')
    })

    it('counts one move as a move', () => {
        expect(render({ plyCount: 2, result: '1-0' })).toContain('White won in 1 move,')
    })

    /** `*` means no result, and the library strips it before it reaches here. */
    it('treats a result it does not recognise as no result', () => {
        for (const result of ['*', '', 'anything else']) {
            expect(render({ result })).toContain('Unfinished game')
        }
    })

    it('still reports a failed restore, whatever the game ended as', () => {
        const html = render({ result: '1-0', error: 'Failed to parse PGN.' })
        expect(html).toContain('could not be read back: Failed to parse PGN.')
        expect(html).toContain('Copy PGN')
    })
})
