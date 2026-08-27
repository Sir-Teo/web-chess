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
