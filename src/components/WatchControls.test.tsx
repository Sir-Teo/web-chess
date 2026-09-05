import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { WatchControls } from './WatchControls'

const noop = vi.fn()

function renderWatchControls(overrides: Partial<Parameters<typeof WatchControls>[0]> = {}) {
    return renderToStaticMarkup(
        <WatchControls
            canGoBack={false}
            canGoForward={false}
            aiActive
            paused={false}
            isGameOver={false}
            stepMode={false}
            canStep={false}
            onFirst={noop}
            onPrev={noop}
            onNext={noop}
            onLast={noop}
            onPause={noop}
            onResume={noop}
            onStep={noop}
            aiSpeed="normal"
            onSpeedChange={noop}
            {...overrides}
        />,
    )
}

describe('WatchControls', () => {
    it('offers autoplay where no engine is playing and there are moves ahead', () => {
        const html = renderWatchControls({ aiActive: false, canGoForward: true, canAutoplay: true, onAutoplayToggle: noop })

        expect(html).toContain('Autoplay the moves')
        // The speed row waits until something is moving at it.
        expect(html).not.toContain('Autoplay speed')
        expect(html).not.toContain('Pause AI')
    })

    it('turns the autoplay control into Stop while it runs, with the speed beside it', () => {
        const html = renderWatchControls({ aiActive: false, canGoForward: false, canAutoplay: false, autoplay: true, onAutoplayToggle: noop })

        expect(html).toContain('Stop autoplay')
        expect(html).toContain('aria-pressed="true"')
        expect(html).toContain('Autoplay speed')
        // Step is the engine's, not the replay's.
        expect(html).not.toContain('Set autoplay speed to Step')
    })

    it('keeps the control at the end of the line, disabled like Next', () => {
        const html = renderWatchControls({ aiActive: false, canGoForward: false, canAutoplay: true, onAutoplayToggle: noop })

        expect(html).toContain('Autoplay the moves')
        expect(html).toContain('disabled=""')
    })

    it('offers nothing to replay on an empty board', () => {
        const html = renderWatchControls({ aiActive: false, canGoForward: false, canAutoplay: false, onAutoplayToggle: noop })

        expect(html).not.toContain('Autoplay')
        expect(html).not.toContain('Speed')
    })

    it('never shows the replay beside the engine controls', () => {
        const html = renderWatchControls({ aiActive: true, canGoForward: true, canAutoplay: true, onAutoplayToggle: noop })

        expect(html).not.toContain('Autoplay')
        expect(html).toContain('Pause AI')
    })

    it('shows the step action whenever step speed is active', () => {
        const html = renderWatchControls({ aiSpeed: 'step', canStep: true, stepMode: true })

        expect(html).toContain('Advance one AI move')
        expect(html).toContain('Step')
        expect(html).not.toContain('Pause')
    })

    it('keeps the step action visible but disabled when waiting for a human move', () => {
        const html = renderWatchControls({ aiSpeed: 'step', canStep: false, stepMode: true })

        expect(html).toContain('Waiting for AI turn')
        expect(html).toContain('disabled=""')
        expect(html).toContain('Step')
    })
})
