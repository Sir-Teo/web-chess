import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { LibraryDialog } from './LibraryDialog'
import { createLibraryGame } from '../engine/gameLibrary'

const noop = vi.fn()
const ok = vi.fn(() => ({ ok: true } as const))
const PGN = '[White "Adolf Anderssen"]\n[Black "Jean Dufresne"]\n[Result "1-0"]\n\n1. e4 e5 *'

function render(overrides: Partial<Parameters<typeof LibraryDialog>[0]> = {}) {
    return renderToStaticMarkup(
        <LibraryDialog
            open
            games={[]}
            loaded
            currentPgn=""
            suggestedName=""
            onClose={noop}
            onSave={ok}
            onLoad={ok}
            onRename={noop}
            onDelete={noop}
            onToggleFavorite={noop}
            onExportBackup={() => '{}'}
            onImportBackup={ok}
            {...overrides}
        />,
    )
}

describe('LibraryDialog', () => {
    it('renders nothing while closed', () => {
        expect(render({ open: false })).toBe('')
    })

    it('announces itself as a modal dialog with a name', () => {
        const html = render()
        expect(html).toContain('role="dialog"')
        expect(html).toContain('aria-modal="true"')
        expect(html).toContain('aria-labelledby=')
    })

    it('explains the empty shelf rather than showing nothing', () => {
        expect(render()).toContain('Nothing saved yet')
    })

    it('says why saving is unavailable with no game on the board', () => {
        const html = render()
        expect(html).toContain('Play or import a game to have something to save')
        expect(html).toContain('disabled=""')
    })

    it('enables saving once there is a game, and offers a name', () => {
        const html = render({ currentPgn: PGN, suggestedName: 'Anderssen vs Dufresne' })
        expect(html).toContain('placeholder="Anderssen vs Dufresne"')
        expect(html).not.toContain('Play or import a game to have something to save')
    })

    it('describes each saved game and labels its row actions', () => {
        const html = render({ games: [createLibraryGame('Evergreen', PGN, 1)] })
        expect(html).toContain('Evergreen')
        expect(html).toContain('Adolf Anderssen')
        expect(html).toContain('2 ply')
        expect(html).toContain('aria-label="Load Evergreen"')
        expect(html).toContain('aria-label="Rename Evergreen"')
        expect(html).toContain('aria-label="Delete Evergreen"')
        expect(html).toContain('aria-label="Star Evergreen"')
    })

    it('totals the shelf for the reader', () => {
        const html = render({ games: [createLibraryGame('One', PGN, 1)] })
        expect(html).toContain('1 game')
    })

    it('labels the search field and the sort group', () => {
        const html = render()
        expect(html).toContain('aria-label="Search saved games"')
        expect(html).toContain('aria-label="Sort saved games"')
        expect(html).toContain('role="group"')
    })

    it('marks the active sort as pressed', () => {
        expect(render()).toContain('aria-pressed="true"')
    })

    it('cannot export an empty library', () => {
        expect(render()).toMatch(/Export backup/)
        expect(render()).toContain('disabled=""')
    })
})
