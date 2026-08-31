import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { LibraryDialog } from './LibraryDialog'
import { MAX_LIBRARY_GAMES, createLibraryGame } from '../engine/gameLibrary'

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
            storageIsDurable
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

    it('renders one page of a full library rather than every row', () => {
        // A full shelf is MAX_LIBRARY_GAMES, and the whole list re-renders on
        // every keystroke and star toggle. Only a page is mounted up front.
        const games = Array.from({ length: MAX_LIBRARY_GAMES }, (_, i) =>
            createLibraryGame(`Game ${i}`, PGN, i + 1),
        )
        const html = render({ games })
        const rows = html.match(/class="library-row"/g)?.length ?? 0
        expect(rows).toBe(100)
        expect(rows).toBeLessThan(games.length)
        expect(html).toContain('Show 100 more')
        // The count still reports the whole shelf, not just the page.
        expect(html).toContain(`${MAX_LIBRARY_GAMES} games`)
    })

    it('offers no "show more" when everything already fits', () => {
        const games = Array.from({ length: 3 }, (_, i) => createLibraryGame(`Game ${i}`, PGN, i + 1))
        const html = render({ games })
        expect(html.match(/class="library-row"/g)?.length ?? 0).toBe(3)
        expect(html).not.toContain('more')
    })

    it('cannot export an empty library', () => {
        expect(render()).toMatch(/Export backup/)
        expect(render()).toContain('disabled=""')
    })
})

describe('when the browser will not store anything', () => {
    /**
     * The bug: with both stores blocked the dialog still said "Saved to the
     * library." and the games were gone on the next reload, with no warning at
     * any point.
     */
    it('warns before a save rather than after the games are lost', () => {
        const html = render({ storageIsDurable: false })
        expect(html).toContain('not letting the page store data')
        expect(html).toContain('Export the library to keep them')
    })

    it('says nothing when storage works, which is nearly always', () => {
        expect(render()).not.toContain('not letting the page store data')
    })
})
