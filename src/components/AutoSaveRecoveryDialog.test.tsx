import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { AutoSaveRecoveryDialog } from './AutoSaveRecoveryDialog'

const noop = vi.fn()
const NOW = Date.now()

function render(overrides: Partial<Parameters<typeof AutoSaveRecoveryDialog>[0]> = {}) {
    return renderToStaticMarkup(
        <AutoSaveRecoveryDialog
            savedAt={NOW - 5 * 60_000}
            moveCount={12}
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

    it('says how much work is at stake and how old it is', () => {
        expect(render()).toContain('12 moves were in progress 5 minutes ago')
    })

    it('counts a single move in the singular', () => {
        expect(render({ moveCount: 1 })).toContain('1 move was in progress')
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
