# How long does a smooth scroll take, and what says when it is over?

A step that scrolls to its target has two animations to think about: the scroll,
and the morph that carries the hole to where the target ended up. Running them
together is only safe if everything the morph is drawn from is the same at the
start of the scroll as at the end of it. The hole itself is: the scrim lives
inside the scrolling content and its cutouts are in content coordinates, so a
scroll moves scrim and target together. What is *not* is every decision made in
viewport coordinates — which side of the hole the message takes, which corner
the way out sits in — because both are chosen once, from where the hole is on
screen at that moment.

So: how far off can that moment be, and what can an implementation wait for
instead?

```bash
open index.html          # including Safari's answer
node run.mjs             # Playwright's Chromium, Firefox and WebKit
node run.mjs chrome      # the real installed Chrome
```

Headless is honest here. A smooth scroll is an animation, nothing is judged by
eye, and the numbers do not need a window on screen.

Five questions. The fourth was not planned: a nested scroller answered the first
one differently depending on whether it was on screen, and the sweep is what
that became. The fifth is what a tour that moves on mid-glide may do about the
glide, and it was asked because the implementation had started to rely on an
answer.

## Where this landed

Question 1 carries the design: a scroll and a morph cannot run together, so a
step that scrolls is two stages, and DESIGN.md argues that under **Bringing a
target into view**. Questions 2, 4 and 5 were load-bearing for one
implementation — the browser's own `behavior: 'smooth'`, waited on from the
outside — and are now the record of why that was given up. Watching an
animation somebody else runs meant a `scrollend` listener, a deadline under it,
a check that the page had begun to move, and a rule per engine for each of the
three behaviours below; and Safari fired no `scrollend` before 26, so every
scrolling step there waited the whole deadline. The glide is Leko's own
`requestAnimationFrame` loop now, the way the morph is, ending on its own clock
and stopped by Leko. Nothing below has changed as evidence — everything under
**What it settled** is still true of the browsers — but the paragraph in
DESIGN.md that turned it into an implementation has, and **What looks like an
improvement and is not** in CLAUDE.md and CONTRIBUTING.md now lists using the
browser's smooth scroll for the glide, citing this page.

## Seen on

Chromium 151.0.7922.34, Firefox 153.0 and WebKit 605.1.15 (`Version/26.5`), all
Playwright's, headless at a 1280×720 viewport on macOS, 2026-09-03. Times are
one run on one machine: what is load-bearing below is the *shape* — which
column has hundreds of pixels in it and which has none — not the millisecond.

**Question 1 — how long a smooth scroll runs, and how much of the trip is still
to go at 320ms, the default length of a morph:**

| scroll | Chromium | Firefox | WebKit |
| --- | --- | --- | --- |
| document, 200px | 223ms · 0px left | 530ms · 8px left | 193ms · 0px left |
| document, 800px | 447ms · **28px left** | 631ms · **35px left** | 197ms · 0px left |
| document, 2000px | 734ms · **372px left** | 616ms · **66px left** | 200ms · 0px left |
| document, 5000px | 1160ms · **2378px left** | 765ms · **213px left** | 215ms · 0px left |
| scroller, on screen, 1200px | 561ms · **105px left** | 592ms · **56px left** | 198ms · 0px left |
| scroller, below the fold, 1200px | 565ms · **105px left** | **never moved** | 200ms · 0px left |

**Question 2 — `scrollend`, and how long after the offset itself stops it
arrives:**

| | Chromium | Firefox | WebKit |
| --- | --- | --- | --- |
| `'onscrollend' in window` | yes | yes | yes |
| document, 200px | 258ms (+35ms) | 631ms (+101ms) | 210ms (+17ms) |
| document, 800px | 497ms (+50ms) | 729ms (+98ms) | 214ms (+17ms) |
| document, 2000px | 766ms (+33ms) | 799ms (+183ms) | 218ms (+18ms) |
| document, 5000px | 1194ms (+34ms) | 865ms (+100ms) | 215ms (+0ms) |
| scroller, on screen, 1200px | 595ms (+34ms) | 759ms (+167ms) | 217ms (+19ms) |
| scroller, below the fold, 1200px | 598ms (+33ms) | nothing moved | 217ms (+17ms) |
| outright, 2000px | 1ms | 0ms | 4ms |
| already there | never — and nothing moved | never — and nothing moved | never — and nothing moved |

**Question 4 — the same 1200px scroll inside the same panel, with only how far
down the page the panel sits changed, and the window left at the top:**

| panel | Chromium | Firefox | WebKit |
| --- | --- | --- | --- |
| 653px past the fold | 600ms · set lands | 767ms · set lands | 201ms · set lands |
| 853px past the fold | 598ms · set lands | 755ms · set lands | 218ms · set lands |
| 1053px past the fold | 598ms · set lands | 767ms · set lands | 212ms · set lands |
| 1453px past the fold | 596ms · set lands | **never moved** · set lands | 217ms · set lands |
| 2253px past the fold | 595ms · set lands | **never moved** · set lands | 217ms · set lands |
| 4653px past the fold | 599ms · set lands | **never moved** · set lands | 216ms · set lands |
| 8653px past the fold | 597ms · set lands | **never moved** · set lands | 216ms · set lands |

**Question 5 — a 5000px glide on the document, interrupted 100ms in, three
ways:**

| | Chromium | Firefox | WebKit |
| --- | --- | --- | --- |
| set to where it is, outright | **leaves 97px for 143px** · scrollend **never** | **leaves 1504px for 5000px** · scrollend 758ms | stays at 3681px · scrollend 23ms |
| a second glide, `scrollBy` a delta, to 800px | lands at 800px · scrollend 454ms | lands at 800px · scrollend 841ms | **lands at 1274px** · scrollend 223ms |
| a second glide, `scrollTo` an offset, to 800px | lands at 800px · scrollend 452ms | lands at 800px · scrollend 827ms | lands at 800px · scrollend 219ms |

## What it settled

**A smooth scroll and a 320ms morph cannot run together.** At the instant the
morph would be finishing, Chromium still has 372px of a 2000px scroll to go and
2378px of a 5000px one — 48% of the trip — and Firefox has 66px and 213px. Only
WebKit is done, because WebKit's animation is a fixed ~200ms whatever the
distance while the other two scale theirs with it. A decision taken at 320ms
about which side of the hole has room is therefore a decision about a page that
has since moved by hundreds of pixels, in two engines out of three. This is not
a rounding error to absorb; it is a different screen. **Scroll first, draw
second.**

**`scrollend` is what says a browser's smooth scroll is over, and it is
enough — where it exists.** Present in all three engines measured here, fired
for every scroll that moved, and fired for a scroll an engine applied outright
as well — so an implementation waiting on it does not need to know which of the
two it got. Safari has it only from 26, which is not measured here and is the
first of the reasons an implementation no longer waits on it. It is late rather than early: up to 50ms after the
offset stops in Chromium and up to 183ms in Firefox, which is a wait taken, not
a poll started. Watching the offset from a frame loop would answer sooner
(question 3, in the page) and is not worth a poll for that.

**Nothing fires for a port that was already where it was told to go.** All three
agree, and rightly — nothing moved. So the delta has to be checked before
anything is waited on: a port that needs no scroll must not be waited for, or
the tour hangs with nothing drawn.

**Firefox does not smooth-scroll a panel that is well below the fold. It does
not scroll it at all.** The boundary in this page's 720px viewport sits between
1053px and 1453px past the fold — one to two viewports of margin. Past it,
`scrollTo({ behavior: 'smooth' })` leaves `scrollTop` at `0` and fires no
`scrollend`: the scroll is dropped silently and there is nothing to wait for.
Chromium and WebKit animate it at any depth. **And a panel a tour is about to
scroll is below the fold by definition** — the page has not moved yet — so this
is the ordinary case rather than an edge one. The same scroll set outright lands
in every engine at every depth, which is the column beside it.

**A glide cannot be stopped.** CSSOM View says a scroll of any kind aborts the
smooth scroll in flight, so an instant scroll to where the page is ought to
leave it there. Only WebKit does that. Firefox ignores it and glides on to the
original destination, all 5000px, and Chromium moves one more frame and then
stops with no `scrollend` at all — the aborted animation ends in silence. An
implementation that moves on mid-glide therefore has no way to hold the page
where it is, and nothing waiting on `scrollend` after such an interruption in
Chromium would ever hear from it.

**A glide can be replaced, and the replacement has to be an offset.** A second
smooth scroll started mid-glide lands at its own destination in all three
engines — if it is asked for as a `scrollTo` of that offset. Asked for as a
`scrollBy` by the delta from where `scrollY` says the page is, WebKit lands
474px short: it resolves the delta against wherever its own animation has got
to, which is ahead of what the main thread reports. An implementation that has
measured a box against the viewport has a delta in hand, and the only offset
that delta is right against is the `scrollY` it was measured with — so it adds
the two and asks for the sum.

## What it did not settle

**Safari, as itself.** Playwright's WebKit answers every question here, and its
fixed ~200ms animation is the most forgiving of the three; whether Safari ships
the same curve is not something a WebKit build can say. What has been seen is
the sandbox case in Safari, by eye: every step lands where it should, and the
glide is noticeably brisker than Chrome's — which is what a short fixed curve
looks like beside one that scales with the distance, and agrees with the WebKit
column without measuring Safari's own. The page prints its own tables, so
opening it in Safari fills that column in.

**Chromium and Firefox off this machine.** The numbers above are macOS, and
this project's CI runs the same three engines on Linux. WebKit has since been
run there — the paragraph after this one — and the other two have not. A red
build there once looked like Playwright's WebKit dropping a smooth scroll on the
document — `scrollY` at `0` for the whole of a test, no `scrollend` — and turned
out to be the test harness: a 320ms morph had not finished when the harness
stopped waiting for it, the press that was to start the scroll found no control
to press, and no scroll had ever been asked for. Nothing this page measures was
in question, and nothing here says an engine drops a smooth scroll on the
document. The one drop it does show is Firefox's, on a scroller, in question 4.

**How many frames a glide gets on a machine that is short of them.** This page
has been run in Playwright's WebKit for Linux — `webkit-2336` of Playwright
1.62.1, the WPE port, headless, under Docker on aarch64 rather than the CI
runner's x86_64 — and every question answers the same as the WebKit column
above: each document and scroller glide settles in 200–216ms with `scrollend`
in the same frame, a panel 8645px past the fold scrolls, and the three
interruptions land as on macOS. What differs is how many offsets a glide is seen
at, and that is the machine's rather than the engine's. Under Docker a 2000px
glide showed a dozen, and three and six on a plain page's first attempt; on the
CI runner, where three browsers share two cores, the same build showed exactly
two at 16ms ticks for a glide Leko started, in two runs, with and without a
smooth scroll made before it
([run 33698310712](https://github.com/annetaan/leko/actions/runs/33698310712/job/100471899005),
[run 33700468572](https://github.com/annetaan/leko/actions/runs/33700468572)).
The staging holds there all the same — the step was drawn after the page moved
and the page did not move after — so that is what the test asserts, and whether
a glide was a glide is left to this page. Leko's own loop has the same
property by construction: on a machine that gives it one frame, that frame is
the last one and writes the destination.

**A machine that is not producing frames.** The same red build printed one
`requestAnimationFrame` in three seconds while timers went on firing every 16ms.
Whether a smooth scroll advances on a machine in that state — the animation runs
on the compositor, but the event that ends it is dispatched from the main
thread — is not measured here, and no glide was in flight in that run to say.

**What a user's own scroll during a glide does to the animation.** `scrollend`
from a scroll the viewer started resolves the wait, which is the right answer for
the tour either way — the page is where they left it. Whether the programmatic
animation is abandoned, resumed, or fought with is not measured.
