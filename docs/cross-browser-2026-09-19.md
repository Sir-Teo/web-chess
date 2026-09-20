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
| Timeouts in `checkOpeningLayout` and `checkReadingSpace` | Each passes when run focused, at the same viewport, in the same engine. Load-sensitive, not engine-sensitive. Both already run with `reducedMotion: 'reduce'`, so it is not animation. |

`checkShortDesktopDialogs` was in that row and should not have been. See below.

## A real one, still open: a focused control clipped in Firefox

`checkShortDesktopDialogs` was written off above as load-sensitive because it
passed when run on its own. It does not. The two measuring helpers in that file
read geometry two animation frames after focusing a control, and two frames is
not always enough — so the check was reading the button *before* a late reflow
moved it, and passing on a position the reader never sees. They now wait for the
box to stop moving, with a floor of eight frames so that "has not moved" can
never mean "has not started". Chromium and WebKit are unaffected and the full
Chromium suite is green.

With that, Firefox fails **4 runs out of 4**, always on the same control and to
the same pixel: the PGN dialog's Import & Analyze button in a 901x256 window at
200% text, its bottom **97px past the panel's** and past the window, its centre
unhittable. Instrumenting the failing path shows the button *is* focused and the
panel *has* scrolled — to 848 of the 984 it can — so `scrollIntoView` is
stopping short of its own `block: 'nearest'` contract.

`useModalFocus` already has a handler for the neighbouring problem, whose
comment reads "Native focus in Firefox can leave a large choice partly clipped
even when it fits in that panel". It calls `scrollIntoView` and trusts it. Here
that trust is misplaced.

Two fixes were tried and neither is in the tree, because neither worked
reliably: taking the remaining distance arithmetically right after the call took
it from 4/4 failing to 1/4, and doing the same on the next animation frame gave
3/5. Those samples are too small to tell apart, and picking the better-looking
one would be picking noise — the same mistake the fourth pass wrote up at
length.

**Instrumented rather than guessed at further.** A scroll and resize trace on
the panel, taken inside the run that fails, says the app is not the one getting
it wrong:

    RESIZE  scrollH=1206 clientH=222 top=136
    FOCUSIN TEXTAREA.input-textarea  top=809
    FOCUSIN BUTTON.btn-start         top=984
    SCROLL  top=848 max=984

Focusing the button scrolls the panel to 984, its maximum, and the button is
fully inside — `revealFocusedControl` logged `outside=false rect=100..201
panel=16..240` and correctly did nothing. *Then* the panel scrolls back up 136px
on its own. No resize follows, no further focus event, `max` is unchanged so it
is not a clamp, and no application frame appears on the stack. Scroll anchoring
was the obvious suspect and is not it: `overflow-anchor: none` on the panel left
it failing 4 out of 4.

That also explains why both corrections missed. Each runs during or just after
the focus event, and the scroll that breaks it happens later still. A fix has to
survive a scroll nobody in the app asked for, and the options — re-asserting on
every panel scroll, or polling after focus — both risk fighting a reader who is
scrolling deliberately. Not worth shipping on this evidence.

It is also not reproducible on its own: a probe that opens the same dialog at
the same size and focuses the same button, with and without the check's exact
timing, lands it correctly every time. The trigger needs the dialogs the check
opens first.

So the check is left failing in Firefox rather than quietly measuring early
again. It is a narrow configuration, but the reader it costs is one using a
keyboard in a short window, which is not a reader to lose.

## Left open

**A 503 loses cross-origin isolation in WebKit.** The ordinary load is isolated
there — `headerless host: service worker restored cross-origin isolation` passes
— and only the server-outage reload is not. `public/sw.js` looks right: the cache
stores the response that already carries the headers, and the 5xx branch applies
them again. Not chased further. It costs a Safari reader reloading during an
outage the multi-threaded engine, and the app falls back to a single-threaded
profile rather than breaking.

**`checkReviewBackupImport` fails in WebKit and passes in Chromium.** Run down
to its cause rather than left as "something about the fixture". The failure is
the *second* upload in the 1280px iteration — the one whose context blocks
service workers — and WebKit says why:

    Refused to load .../reviewBackupWorker-*.js worker because of
    Cross-Origin-Embedder-Policy

which the app surfaces honestly as "The review backup worker could not run."
Under `require-corp` WebKit refuses that module worker where Chromium loads it.

It is not the missing `Cross-Origin-Resource-Policy` header it looks like.
Tried both values on the dev and preview server, confirmed arriving
(`corp: "same-origin"`, then `cross-origin`, `isolated: true` in both): WebKit
refuses the worker either way, so the header was reverted rather than kept for a
story that turned out to be wrong.

What separates the two iterations is *who* serves the worker script. With the
service worker allowed — the 375px iteration, and the shape the deployed app has
— it loads and that iteration passes in WebKit, "the cached worker imports and
exports offline" included. Only a server that sets COEP itself trips it, and
GitHub Pages sends no COOP or COEP at all; the app's isolation comes from
`sw.js`. So this costs a Safari reader nothing on the deployed site, and costs a
Safari *developer* review backup against `npm run dev` until the service worker
takes over.

## The heading outline, since fixed

The sweep first reported two skips. One was real and one was the sweep's own
mistake, which is worth keeping both of.

**Real: the analysis column's cards sat under no `h2`.** The document went `h1`
straight to `h3`, so a reader moving by heading met three cards — Winrate, WDL
Trend, Historical Library — belonging to nothing, while the right panel was
built correctly with its own `h2` and `h3` cards beneath it.

The fix looked expensive and was not. `.section-heading` turns out to be used
in exactly three places, all of them in that column, and Historical Library
carries its own `.sample-library-head` — so the four headings move to `h2` and
two scoped selectors follow them, with nothing shared with the right panel
touched. They are peers of the analysis panel's `h2`, which is what they are.
Measured after: `h1 → h2 h2 h2 h2 → h3 h3 h3`, no skips, and the heading style
unchanged to the pixel at `10.08px 700 uppercase`.

**Not real: `h1` to `h4` with Settings open.** `.settings-header` is
`display: none` above the phone breakpoint, so the sheet's own "Settings" `h2`
is not rendered and an `h4` follows the page's `h1`. But with the sheet open
the whole app behind it is `inert`, so that `h1` is not in the accessibility
tree either — the outline a reader is actually given starts inside the dialog,
which carries its own `aria-label`. The sweep was counting a document nobody is
served, the same mistake it made about `aria-hidden`.

`checkTheMarkupSaysWhatItShows` now asserts the outline, and only where no
dialog is open, for that reason.

## What the sweep found clean

Worth stating, because it is the reason the heading outline is the only entry
above. With a dialog open, 75 to 77 controls sit behind `aria-hidden` — and
every one of them is also inside an `inert` subtree, which removes it from the
tab order as well as the accessibility tree. That is the correct pairing, and
the pairing most apps get wrong. It was measured rather than assumed, by asking
each browser to focus a covered control: **all three refuse**. There are no
unlabelled form controls and no duplicated ids in any state.

`checkTheMarkupSaysWhatItShows` now guards all four of those.

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
