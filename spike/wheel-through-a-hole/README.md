# Does a wheel reach through a hole?

A hole cut with an even-odd `clip-path` is genuinely absent: clicks, focus and
hit-testing all reach what is underneath, and `document.elementFromPoint` says
so. **Scrolling turns out to be the exception.**

```bash
open index.html          # including Safari's answer
node run.mjs             # Playwright's Chromium, Firefox and WebKit
node run.mjs chrome      # the real installed Chrome
```

Three numbered panels, each a scrolling list of rows. They differ only in where
the dimming overlay is, and every overlay has a hole cut over the panel. Put the
pointer over each one and scroll; the readout says what actually moved. `run.mjs`
prints the same numbers, so a run and a pair of eyes can be compared without
anybody having to say which panel they meant.

The page cannot judge the wheel itself — that is the one input it has to be
given — so `run.mjs` supplies it and reads the same numbers off the same panels.
It keeps the window shorter than the page for the reason in *What it settled*
below, and refuses to report a table when either of the two things that make a
run worthless has happened: the control panel not scrolling, which means the
wheel never landed, or an overlay no longer matching the layout it was measured
from, which means it is hanging over the panel next to it. The page checks the
second continuously and says so in red; `run.mjs` asks it after scrolling.

## Seen on

| | 1. Overlay inside the scroller | 2. Overlay outside, hole over the scroller | 3. No overlay |
| --- | --- | --- | --- |
| Chrome 151.0.7922.76 | panel scrolls | **the page scrolls** | panel scrolls |
| Safari 26.3.1 | panel scrolls | **the page scrolls** | panel scrolls |
| Firefox 153.0 (Playwright) | panel scrolls | panel scrolls | panel scrolls |
| Chromium 151.0.7922.34 (Playwright) | panel scrolls | **the page scrolls** | panel scrolls |
| WebKit 605.1.15 (Playwright) | panel scrolls | **the page scrolls** | panel scrolls |

macOS 26.3.1, 2026-08-12. Safari by hand — `run.mjs` cannot reach it — and the
rest through `run.mjs`. Firefox is Playwright's Gecko rather than an installed
Firefox, so that row is evidence about Gecko and is the one worth re-checking on
a real build.

These are the same three verdicts the page gave when it was first written, and
they did not move when a layout bug in the page itself was fixed: the middle
overlay had been measured while the grid was still filling up, and came out half
again too wide. It overhung the control panel to within ten pixels of where the
wheel goes. Nothing about the finding depended on that, but the page now checks
its own overlays rather than leaving the next reader to notice.

## What it settled

**A `clip-path` takes an element out of hit-testing but not out of the search
for what a wheel should scroll.** The clipped overlay answers for the wheel, and
the scroll goes to *its* scroll container rather than to what is under the
pointer. Firefox routes it to the element under the pointer; Chromium and WebKit
do not, and Safari — checked as itself, not as a WebKit build — behaves as
WebKit does. Nothing in the CSS promises either behaviour.

An overlay *inside* the scroller has the problem too and it does not show,
because answering for that overlay and scrolling the panel come to the same
thing — its scroll container is the panel.

**Chromium hides this whenever the page behind has nothing left to scroll.** It
falls back to the element under the pointer in that case; WebKit does not fall
back at all. That is why this page makes itself taller than the window. A
version of it that fitted on one screen reported that Chromium was fine, which
is how the bug survived a first round of testing.

## Why it matters

An overlay cannot do its blocking with the clipped element itself, however much
tidier one element would be. Anything scrollable under a hole would stop
scrolling under the pointer, and **no assertion about hit-testing can catch
it** — `elementFromPoint` reports the hole open the whole time the scrolling is
broken. Blocking has to be done with plain rectangles in the gaps between the
holes, where there is nothing left for an engine to interpret.

## Revisiting

If Chromium and WebKit start honouring `clip-path` when they decide what a wheel
scrolls, the middle column here turns green and a simpler overlay becomes
possible. This page is the check.
