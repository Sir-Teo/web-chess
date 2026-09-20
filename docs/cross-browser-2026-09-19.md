# The browser suite outside Chromium — 2026-09-19

`scripts/test-ui-browser.cjs` has taken `UI_TEST_BROWSER=firefox|webkit` since it
was written and had never been run with either. Both engines are already
installed beside Chromium under `~/Library/Caches/ms-playwright`, so it costs an
environment variable:

```
UI_TEST_BROWSER=webkit npm run test:ui:browser
```

The first focused check run that way found a real defect, and the full runs found
a second. Both are fixed; this is the record of what the runs say, so the next
person knows what to expect before they read a red line as a bug.

## What they found

**Focus left an `aria-modal` dialog in Safari.** WebKit tabs to text fields and
disclosures and skips every button — "Press Tab to highlight each item" is off by
default, and there is no other engine on iOS. So the Settings dialog's 25
controls are a three-stop cycle whose ends are nowhere near the trap's first and
last, and three presses of Shift+Tab put focus on the summary that opens the
dialog. macOS Firefox does the same thing, for the same reason: it follows the
system keyboard-navigation setting. `useModalFocus` now catches focus that lands
outside the panel rather than only speaking at the ends of its own list.

**Safari threw away every dropdown's box.** Measured on the engine options
dropdown in Settings, the same element under the same rules: computed
`min-height` 18px against Chromium's 32px, computed padding 0 against
5.76px 7.36px, and a control drawn 18px tall at 100% text and 33px at 200% where
Chromium draws 32px and 55px. The selectors match in both engines; the rules do
not survive a native menulist. Every sizing rule the app has for a dropdown was a
no-op on iOS, including the 44px touch target. `appearance: none` in App.css
hands the box back — all three engines now measure 32px and 53px, to the pixel.

## What the runs report that is not a bug

| Reported | Why |
|---|---|
| `newCDPSession: CDP session is only available in Chromium` (4 checks) | The touch, drag and drop checks drive input through the Chrome DevTools Protocol. They cannot run elsewhere. |
| `Tab did not reach Flip board` | macOS Safari and Firefox do not tab to buttons by default. The app cannot change it and should not try. |
| `the evaluation bar is drawn in the forced palette (forced-color-adjust: undefined)` | WebKit has no forced-colors support. |
| `page.reload: NS_ERROR_OFFLINE` (Firefox) | The outage fixture's offline simulation is Chromium-shaped. |
| Timeouts in `checkOpeningLayout`, `checkReadingSpace`, `checkShortDesktopDialogs`, `checkShortDesktopWindow` | Each passes when run focused, at the same viewport, in the same engine. They are load-sensitive, not engine-sensitive — `checkShortDesktopWindow` flaked once in Chromium too. Both already run with `reducedMotion: 'reduce'`, so it is not animation. |

## Left open

**A 503 loses cross-origin isolation in WebKit.** The ordinary load is isolated
there — `headerless host: service worker restored cross-origin isolation` passes
— and only the server-outage reload is not. `public/sw.js` looks right: the cache
stores the response that already carries the headers, and the 5xx branch applies
them again. Not chased further. It costs a Safari reader reloading during an
outage the multi-threaded engine, and the app falls back to a single-threaded
profile rather than breaking.

**`checkReviewBackupImport` fails in WebKit and passes in Chromium**, at the first
upload into a second context with service workers blocked. The feature itself
works there: exporting and re-importing a backup reports "Imported 0 reviews; 1
identical review skipped" within a second, and the awkward cases — a partial run,
an ID collision — behave identically in both engines. So it is something about
that fixture, not a broken import.

## Scores

Counting checks that printed a result line:

| | passing | failing scenarios |
|---|---|---|
| Chromium | 238 | 0 |
| WebKit | 210 | 11 (9 of them in the table above) |
| Firefox | 187 | 8 (7 of them in the table above) |

Firefox's number is lower because its run skipped the three-viewport boot sweep,
which stops on a sub-pixel reading: the command palette button measures
**exactly 44x44 in all three engines** when the page is settled, and the sweep
caught it a fraction under mid-transition.
