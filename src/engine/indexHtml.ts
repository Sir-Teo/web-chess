/**
 * The app's stylesheet, loaded without holding up the first paint.
 *
 * The boot skeleton in `index.html` exists to put a board-shaped placeholder on
 * screen before the JavaScript arrives, and it could not: a render-blocking
 * `<link rel="stylesheet">` held the first paint until the whole 113 kB sheet
 * had landed. **Measured** at 390x844, cold cache, 4x CPU, first contentful
 * paint: **2724ms behind 3G and 957ms behind 4G**, against a stylesheet that
 * arrived at 2561ms and 776ms. The skeleton was drawing the instant it was
 * allowed to and not a moment sooner.
 *
 * `bootSkeleton.test.ts` recorded that floor as deliberate, on the reasoning
 * that making the sheet non-blocking "would trade this for the app itself
 * flashing unstyled". Measured rather than reasoned, it does not: the app's
 * JavaScript is more than four times the size of its stylesheet and arrives
 * long after it. Over three runs on 3G the sheet applied at 2652ms and the app
 * rendered at 5457ms -- **2.8 seconds later** -- and on 4G, 783ms against
 * 1599ms. No run drew the app before its styles.
 *
 * First paint after: **654ms on 3G and 382ms on 4G**, and the sheet's own
 * arrival moved by 90ms, so dropping its fetch priority cost almost nothing.
 *
 * The `<noscript>` copy keeps the page styled where the `onload` cannot fire.
 */
const BLOCKING_STYLESHEET = /<link rel="stylesheet"((?:(?!>)[\s\S])*)>/g

export function deferStylesheets(html: string): string {
  return html.replace(BLOCKING_STYLESHEET, (_match, attributes: string) =>
    `<link rel="stylesheet"${attributes} media="print" onload="this.media='all'">`
    + `<noscript><link rel="stylesheet"${attributes}></noscript>`)
}
