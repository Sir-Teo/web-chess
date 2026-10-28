# Gates and parity

Available local checks, the current publishing workflow, and context from the
earlier comparison with the two sibling repos.

## Running everything locally

```bash
npm run verify          # typecheck, lint, test, build
npm run audit           # dependency audit; separate from verify
npm run test:ui:browser # production Playwright workflows, simulated engine
```

**Check the exit code, not the output.** `npm run verify | grep -q ...` keys off
grep's status, not the gate's; that mistake put a commit over a failing
typecheck during this work. Run the gate, then read `$?`.


## Where each check runs

| check | `verify` | deploy (push to `main` or manual dispatch) |
| --- | --- | --- |
| typecheck / lint / unit tests | yes | no |
| dependency audit | no; run `npm run audit` | no |
| browser workflows | no; run `npm run test:ui:browser` | no |
| production bundle | TypeScript + Vite | Vite |

The only configured workflow is [deploy.yml](../.github/workflows/deploy.yml).
It installs dependencies with `npm ci --no-audit`, builds with `npx vite build`
on Node 20, and publishes to Pages. Commit `30bad69` deliberately removed
`ci.yml` and the deployment verification steps. A successful deployment records
a successful bundle and publication; verification results come from the local
commands above. Changes to the checks should keep this table synchronized.

The browser suite is also the only tier that can cover App-level *wiring* —
which rule applies in which mode. `checkPlayedMoveBecomesTheGame` is there for
that reason: whether a played move joins the game or becomes a variation is
decided by the workspace mode, and no unit test in this repo can drive that.
Verified by mutation: putting the bug back makes it fail with the broken PGN in
the message.

It is also the only tier that can measure **contrast**, for the same kind of
reason. The token tests in `accentContrast`, `qualityChipContrast`,
`textLadderContrast` and `reviewPalette` guard the palette, and a palette can
be entirely correct while a token is used somewhere its contrast was never
checked. Browser contrast checks measure text against what is actually painted
behind it across themes, dialogs, panel states and viewport sizes.

Nine contrast defects turned up in one sitting, and every one was a value that
was correct in one theme, one state, one file or one viewport and not the
others. The last three were found by the sweep rather than by hand: the review
move list printing grades in the colour sized for a 5px dot, the Coach card
carrying a dark-theme gradient literal that dragged it to a mid grey on the
light theme, and the engine line's move numbers, which only fail at the narrow
layout where the panel goes full width.

Three things the sweep has to get right, each of which it got wrong first and
caught by failing: alpha layers are gathered out to the first opaque one and
painted back to front, not composited while climbing; transitions are finished
before anything is read, because the theme is applied in an effect and a colour
read mid-switch is the old one; and a gradient is measured against its own
stops rather than stepped past, which read a dark label on a bright teal button
as 1.01:1. Each sweep asserts a floor on how many elements it measured, because
the first version passed cleanly over sixteen.

## Historical sibling comparison

The sibling repos are `web-chess`, `web-katrain` and `web-xiangqi`. They are
independent apps with the same shape. This table records an earlier survey;
sibling configurations and input ceilings have not been rechecked here. The
web-chess workflow entries reflect the current configuration described above.

| | web-chess | web-katrain | web-xiangqi |
| --- | --- | --- | --- |
| `verify` steps | typecheck, lint, test, build | typecheck, test:typecheck, lint, test, build | typecheck, lint, test, openings, library, smoke, parity, build:react |
| Browser suite | `test:ui:browser` (Playwright) | `test:viewport` (raw CDP, no dependency) | `test:ui:layout` (Playwright) |
| Where the browser suite runs | local command | `ci.yml` (PRs + main) | `ci.yml` (PRs + main) |
| Node in CI / deploy | no CI / 20 | 24 / 24 | 20 / 20 |
| Deploy checks | Vite build | audit, lint, test:typecheck, test, build | audit, build (WASM), verify |
| Hostile-input sweep | `src/__fuzz.test.ts` | `src/__fuzz.test.ts` | `src/__fuzz.test.ts` |
| Where the ceilings sit | search query; library PGN 512KB; backup 8MB; auto-save 2MB | search query; auto-save 5MB; model upload 128MB; verdict scan 4000 nodes | search query; **import text 200KB, UCI moves 1024, tree nodes 1024** |

The `verify` lists reflect each app's build: web-xiangqi compiles its WASM
engine and checks a separate opening book.
web-katrain drives Chrome over raw CDP instead of Playwright, which is why it
carries no browser dependency at all. The survey also identified differences
in when imports were bounded. Web Chess now has explicit read limits in
[pgnImportLimits.ts](../src/components/pgnImportLimits.ts); consult that source
for the current limits rather than treating the historical table as a target.

The comparison's measurements and implementation history remain in
[the cross-app learning plan](cross-app-learning-plan.md). Recheck the current
source before adopting a historical recommendation.
