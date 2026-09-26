# Leko Scroll's design

Leko Scroll is the scroll-driven spotlight for a long page. A second product in
the same repository as Leko.

This file holds the rules, each with the reason it holds. Situations Leko Scroll
meets are shown on one page under `examples/scroll/`, once it exists. The tour's
documents are not this product's, and nothing in them is a reason for anything
here. How the code got here is in the commits.

## A second product, not a second tour

**Leko Scroll has no story, no steps, no machine, no `start`, no `reached` and
no `awaits`.** It tours a long page by scrolling alone: scrolling down lights
the targets one after another as they come up from below, and scrolling up
walks back through them in reverse. Nobody is asked to do anything, so there is
nothing for a step to wait for and nothing for a machine to decide.

The root DESIGN.md, the three constraints it opens with and root CLAUDE.md's
lists of what looks like an improvement and how code is written there are the
tour's, and they do not apply here. Not by analogy, and not as a citation: a
rule in this file gives its own reason, and a reason borrowed from the tour is
a reason about a product with steps. What the two products share is the
repository itself. Root CLAUDE.md's **Working in this repository** holds here
as it holds everywhere. CONTRIBUTING.md and the checks CI runs are shared the
same way.

**It is delivered from `@annetaan/leko/scroll`.** `packages/leko` bundles it,
so the dependency runs from the tour's package to this one and never back. In
prose the product is Leko Scroll, and `@annetaan/leko/scroll` is the only
spelling in code.

**`createLeko` and `createScroll` know nothing of each other.** Each draws a
scrim of its own, and not running both at once is the application's
responsibility. A check either way would tie two products together that are
separate on purpose, and a page that knows it runs both is the one place that
can decide which goes first.

## The API

```ts
createScroll({
  targets: [{ target, message?, side?, padding?, radius? }],
  line?, fade?, spacing?, padding?, radius?, onChange?,
}) // → { measure(), destroy() }
```

- `targets` is the list of what gets lit, in the order it gets lit, and the one
  option that has to be given. Each entry names a `target`, and may add a
  `message`, a `side`, a `padding` and a `radius`.
- `target` is a selector string or an `Element`.
- `message` is `{ title, body }`, and `side` is where it goes —
  [The message](#the-message).
- `line` is where on the screen the switch happens, as a fraction of the
  viewport's height. The default is 0.5.
- `fade` is how far past an edge the light takes to go out, in pixels. The
  default is 300.
- `spacing` is the least scroll between two switches, in pixels. The default is
  150.
- `padding` and `radius` are the hole's, for every target that does not say its
  own. Both default to 8px — [Padding and radius](#padding-and-radius).
- `onChange` is the one notice, and [The whole page stays
  usable](#the-whole-page-stays-usable) says when it fires. It may be left out:
  a page that only wants its targets lit has nothing to listen for.

**It runs from the moment it is created.** There is no `start` and no `stop`,
and `destroy()` ends it. There is nothing to begin and nothing to finish: the
page is what the reader came for, and Leko Scroll is part of how the page is
read for as long as the page is up. Short of ending it, `measure()` is the one
thing an application may ask of it, and [Measuring](#measuring) says why.

## The whole page stays usable

**Nothing blocks.** There are no blocking rectangles, and the scrim, the halo
and the message catch no pointer events. What Leko Scroll puts over the page is
paint and nothing else, so every link, button and field under it answers as
though it were not there. The reader is reading a page, not doing a task, and
dimming is the whole of the emphasis this product has to give. The message
pays for that: its text cannot be selected and a link in it cannot be pressed
([The message](#the-message)).

**There is no notion of completion.** A long page is not finished by being
scrolled to the foot. So there is no next control, no close control and no
focus ring: nothing needs a way past it, nothing needs a way out of it, and
nothing takes focus away from the page.

**`onChange(index | undefined)` is the one notice.**

- It fires on arrival, once for each target the light arrives at, whether by
  converging or by morphing. `index` is the target's position in `targets`.
- **An arrival fires even when the line is already in a fade band.** A converge
  or a morph runs on time, so the reader can scroll past an edge before it
  lands. It lands all the same, fires with its `index`, and then fades with the
  rest of the scrim.
- **An arrival the fade overtakes never happens.** If the fade reaches zero
  before the hole arrives, the animation is cut off and nothing fires for the
  target it was going to.
- A target a fast scroll skips never fires — [A fast scroll skips the
  middle](#a-fast-scroll-skips-the-middle).
- It fires with `undefined` when nothing is lit at creation, and when a fade
  reaches zero after an `index` was announced. A fade reaching zero fires
  `undefined` only to answer an `index`: a converge cut off before its arrival
  announced nothing, so it fires nothing at all, turned to another target on
  the way or not, and a morph cut off fires `undefined` for the target it
  left.
- The fade itself fires nothing on its way to zero. Until the light is out, the
  target is still the lit one.

## What a target is

**A selector string or an `Element`, laid out in the normal flow of the
document.** A target that is, or sits inside, an element that is
`position: sticky` or `position: fixed`, or that sits inside a scroller of its
own, is not supported. A button in a sticky header is the common case: the
button is static, and the header carrying it is not. The scrim rides the
document's scroll ([The scrim rides the page](#the-scrim-rides-the-page)), and
none of those does: a hole cut where such a target stood would be carried off
by the first scroll while the target stayed, or stay while it moved.

**A selector that matches several elements means the first of them in document
order that has a box**, and the rest are passed over with no warning. A landing
page often carries a section twice, one copy for a wide screen and one for a
narrow, with the other hidden by `display: none`. The copy that is showing is
the one meant, and a hidden one has no box to cut a hole around, so the rule
picks the right copy without the author saying which, and a warning would fire
on every such page for nothing. The match is chosen again each time the page is
measured, so a resize that swaps the copies moves the hole to the one showing.

**A target that is not found is skipped with a `console.warn`, and the rest
runs.** Not found means the selector matches nothing that has a box, or the
`Element` given has none — an element that is not rendered has nowhere to cut
a hole around. A warning
is the right loudness: the author named something that is not there, which is
theirs to fix, and it is no reason to leave the rest of the page unlit. The
target is looked for again the next time the page is measured.

**Indices are the array's, and are never compacted.** A skipped target keeps
its place, so `onChange` names a target by the position the author wrote it at,
whichever of the others were found.

## The array is the order

**Targets are lit in the order `targets` lists them, and that order is never
sorted into page order.** An author may want a target sitting slightly lower
than another, side by side with it, to be seen first, and the array is the only
place that can say so.

**A disagreement between the array and the page draws no warning.** It is
intent, and a warning about intent is noise the author has to learn to ignore.

## The line and the switch

**The line is a horizontal line across the viewport, at `line` of its height
from the top, 0.5 by default.** A target switches on when its top edge comes up
to the line.

**The switch positions climb with the array:**

```text
reach       = pageHeight - (1 - line) * viewportHeight
forward_0   = top_0
forward_i   = max(top_i, trigger_(i-1) + spacing)
trigger_i   = min(forward_i, reach - (n - 1 - i) * spacing)
```

`top_i` is target `i`'s top in page coordinates, `spacing` is 150 by default,
and `reach` is the furthest down the page the line can get.

**The formula runs over the targets that were found, in array order.** `n` is
the number found, `i` counts only those, and `trigger_(i-1)` is the previous
found target's. A target that was not found has no top to put in it, and
counting it would hold back a `spacing` of the page for a target that is never
lit. `onChange` still reports each target by its index in the array
([What a target is](#what-a-target-is)).

**`spacing` is kept forwards from the first target and backwards from
`reach`.** Going forwards, the `max` keeps the switch positions in array order
whatever the page order is, the targets [The array is the
order](#the-array-is-the-order) puts out of page order included, and it keeps
two targets close together on the page from switching within a few pixels of
each other, where the first would be lit too briefly to be seen. Going
backwards, the `min` pulls every switch position in to where the line can reach
it: at the foot of the page the line stops `(1 - line)` of the viewport's height
above the page's bottom, so a closing section whose top is below that would
never be lit, and a landing page ends in one as often as not. The pull-back
leaves `spacing` between each target and the next on the way, so every target
near the foot is lit on the way down, the last of them at the bottom of the
page, and each lights a little before its top reaches the line.

**Consecutive switch positions are always at least `spacing` apart**, so every
target whose switch position the line can reach is lit for at least `spacing`
of scroll. `forward_i` is at least `trigger_(i-1) + spacing` by its
definition. The cap `reach - (n - 1 - i) * spacing` is exactly `spacing` above
the cap for `i - 1`, which `trigger_(i-1)` is at most. So the smaller of the
two is at least `trigger_(i-1) + spacing` as well.

**At the top of the page the line starts at `line * viewportHeight`, and the
pull-back can put switch positions above that.** The line has passed those
targets before the reader scrolls at all. At the top of the page the last of
them is the one lit, and the earlier ones are skipped as a fast scroll skips
them ([A fast scroll skips the middle](#a-fast-scroll-skips-the-middle)): they
are never lit at all. The upper edge is then out of reach as well, and
[The two edges](#the-two-edges) says what that leaves. A hero sitting above
the middle of the screen at scroll 0 is the same case with no pull-back in it.

**Between two switch positions the earlier target stays lit.** The light is on
whichever target the line last passed, so there is never a moment inside the
range where nothing is lit.

**A switch is a morph, and a morph runs on time rather than on scroll.** The
hole moves from the one target to the next over a fixed duration, whatever the
reader does with the page while it runs. A morph tied to the scroll would stop
halfway whenever the reader did, with the hole stretched between two targets.

## The two edges

**The range has two edges, and both are alike.**

- **The upper edge is `trigger_0`**, the first target's switch position: its
  top, unless the pull-back put it higher.
- **The lower edge is `max(bottom_last, trigger_last + spacing)`**, where
  `bottom_last` is the last target's bottom in page coordinates.

The lower edge is the later of the two so that the last target stays lit for as
long as it is on the line, and for at least `spacing` after its switch.

Scrolling back above the first target fades the light the way scrolling past
the last one does, because a reader leaving the range upwards is leaving it
all the same.

**A fade band the reader cannot scroll all the way through is no fade band at
all.** The line gets no higher than `line * viewportHeight` at the top of the
page and no lower than `reach` at the foot. Where the whole lower band, from
the lower edge to the lower edge plus `fade`, does not fit above `reach`, there
is no lower fade: the range runs on to the foot of the page and the light stays
at full opacity down to the bottom. The top is the same: where the whole upper
band, from the upper edge less `fade` to the upper edge, does not fit below
`line * viewportHeight`, there is no upper fade, the range runs up to the top
of the page, and the light stays at full opacity up to the top. An edge the
line cannot reach at all is the plainest case of either.

An edge is not pulled in the way a switch position is. The fade is the reader
leaving the lit part of the page, and a reader at either end of the page is
still on it. A fade that could only go part of the way would leave that end of
the page half dimmed for as long as the reader stayed there, a leaving that
never finishes.

## Entering converges, leaving fades

**Entering converges from the outside in, on time.** Nothing is dimmed at the
first frame, and the dark closes in on the target over a fixed duration. An
entry is the light arriving, and an arrival tied to the scroll would stop
wherever the reader stopped, with the dark halfway in.

**Leaving fades with the scroll.** Past an edge the scrim's opacity is

```text
opacity = 1 - distance / fade
```

where `distance` is how far the line is past the edge and `fade` is 300px by
default. It is tied to the scroll, not to time, because it is the reader's own
movement that is taking them out of the range, and reversing mid-fade gives the
opacity back as it goes.

**At zero the light is out**, and coming back converges again as it did the
first time. A fade that has not reached zero is still reversible; one that has
is over.

## What was seen before decides what is drawn

**The state carries whether the light went out.** So the same scroll position
may draw differently depending on how the reader got there, and every case
follows from that one bit.

- **Lit, and the line leaves the range:** the fade begins, and follows the
  scroll both ways.
- **Converging or morphing, and the line leaves the range:** the animation
  runs on and the fade follows the scroll over it. If the hole arrives first,
  `onChange` fires with its `index`. If the fade reaches zero first, the
  animation is cut off and the light is out: a morph cut off fires `undefined`,
  since the target it left was announced, and a converge cut off fires nothing.
  A converge a switch turned is still a converge here ([A fast scroll skips the
  middle](#a-fast-scroll-skips-the-middle)).
- **Fading, and the line comes back into the range:** the opacity climbs back
  to 1, and the light is on the target that position calls for. If that is the
  target that was lit, nothing converges and `onChange` does not fire, because
  nothing arrived. If it is another — an in-page link can jump straight from a
  fade band to the middle of the range — the hole morphs there and `onChange`
  fires on that arrival.
- **Fading, and the fade reaches zero:** the light is out, and `onChange` fires
  with `undefined`.
- **Out, and the line is in a fade band:** nothing is drawn. The same position
  was half dark on the way out; on the way back it is the page alone.
- **Out, and the line comes back into the range:** the light converges again
  on the target that position calls for. That is the switch position of the
  first target from above, and the lower edge from below.

Drawn from the scroll position alone, a reader coming back through a band the
light went out in would watch it come back on as a fade running backwards,
which is a leaving shown in reverse rather than an arrival. What the reader saw
last is what the next frame has to agree with.

## A fast scroll skips the middle

**A scroll that crosses several switch positions during one morph turns the
morph to the latest target.** The hole leaves for wherever it has got to, and
the targets in between are never drawn. Lighting each of them in turn would be
a queue of morphs the reader has already scrolled past.

**A switch position crossed during a converge turns the converge to the latest
target, and it stays a converge.** The dark goes on closing in from wherever it
has got to, on the latest target now. It does not become a morph, because a
morph moves the light from a target that was lit, and during a converge none
has been. So a turned converge that the fade cuts off fires nothing, as any
converge cut off does: no `index` was announced for an `undefined` to answer.

- Only the last arrival's message appears. The halo follows the turned morph
  to the latest target, as it follows every morph, and after a turned converge
  it appears on the arrival, as after every converge.
- `onChange` fires only for the arrival. A target the morph or the converge
  was turned away from never arrived, so it never fires.

## Starting part-way down

**Created with the line inside the range, it converges on the target that
position calls for.** That is the same entry as scrolling into the range, from
wherever the page already is.

**A first target near the top of the page converges at load, before the reader
scrolls.** Where its top is less than `line * viewportHeight + fade` from the
top of the page — 700px with a viewport 800px tall and the defaults — there is
no upper fade, so the range runs up to the top of the page ([The two
edges](#the-two-edges)) and scroll 0 is inside it. That is intended, and it is
most landing pages: the first thing the page wants seen is lit on arrival,
and scrolling back up to the top finds it lit again, as the same position
should.

**Created with the line in a fade band or outside the range, nothing is lit**,
exactly as after a fade to zero, and `onChange` fires with `undefined`. A fade
band is drawn half dark only on the way out, and nothing went out: a page that
opens half dimmed is showing a leaving nobody saw arrive.

## Measuring

**Each target's top and bottom are measured in page coordinates, along with the
viewport's height and the page's size, and kept.** While the reader scrolls
nothing is measured again: the switch positions, the edges and the opacity are
all functions of those numbers and the scroll offset.

**The page is measured at creation, on a window resize, on `load` and once
`document.fonts.ready` settles.** Those are what move a static page: a new
viewport size, the images and stylesheets that arrive after the first paint,
and a web font swapping in and changing every line height under it.

**There is no `ResizeObserver`.** Leko Scroll is for static pages, and a long
landing page is one. A page whose layout moves on its own is a dynamic page,
and following one properly waits for an issue that asks for it.

**`measure()` is public, and it is the smallest concession to a dynamic
page.** An application that knows it moved the layout — opened an accordion,
loaded a section — says so, and Leko Scroll measures again.

**A measure lands the same way whoever asked for it.**

- Only the positions changed, and the same target is lit: the hole is put back
  where the target now is, at once, with no animation and no notice.
- The lit target changed, or the line entered or left the range: it is treated
  as a scroll to the same position would be — a morph, a converge, or a fade
  band's opacity.
- The lit target is no longer found, and the line is in a fade band or nothing
  is found at all: the light goes out, and `onChange` fires with `undefined`.

## The scrim rides the page

**The scrim is the size of the page and rides it.** The holes are cut in page
coordinates and are never rewritten on a scroll, so the browser carries scrim
and targets together on its own. A scroll event arrives after the browser has
scrolled, so a scrim fixed to the viewport and redrawn from the event shows the
hole lagging behind its target, and under iOS inertial scrolling most of all.
No page under `spike/` measures that lag. It is the reason all the same, and
the claim is stated here as unmeasured.

**The scroll listener is passive and reads the scroll offset alone.** Nothing
else is read while the reader scrolls, and JS writes to the page in two places
only: a switch or an entry starts a morph that runs on time, and inside a fade
band the listener writes the opacity. Anywhere else a scroll changes nothing
that Leko Scroll draws.

**The holes are `data:` URL images sized to each hole, composited into one mask
on the scrim.** The technique is copied from `holeImage` and `maskLayers` in
`packages/spotlight/src/geometry.ts`. What it answers holds here as it does
there: Safari cuts no hole from a mask reached through `url(#…)` while
`CSS.supports` answers `true`, and an image per hole on a 12 000px surface costs
nothing measurable per frame in Chrome, Firefox or WebKit. Both are measured on
[spike/overlapping-holes/](../../spike/overlapping-holes/), which has not
measured Safari's cost.

## The message

**A message is shown only on a target that configures one**, as
`{ title, body }`.

- **It is placed in page coordinates and scrolls with the page**, beside the
  hole, for the same reason the scrim does.
- **It is hidden during a morph and a converge**, and shown after the arrival
  with a fade of about 150ms. A message that moved with the hole would be
  unreadable in flight, and one that stayed would point at a target the light
  has left.
- **It dims with the scrim during the leaving fade.**
- **After a turned morph or converge only the last arrival's message shows**
  — [A fast scroll skips the middle](#a-fast-scroll-skips-the-middle).
- **It catches no pointer events**, which is `pointer-events: none`. The page
  under it stays usable, and the price is plain: its text cannot be selected,
  and a link in it cannot be pressed. A message is something to read beside
  the target, and everything to act on stays on the page.
- **It has no next button, no close button and no focus ring.** There is
  nothing to go on to and nothing to close.

**`side` is per target, one of `top`, `bottom`, `left` and `right`, and the
default is `bottom`.**

- **Vertical room is never checked.** The box may sit off screen. Moving it to
  whichever side has room would make it jump as the reader scrolls, and a box
  that flickers from side to side makes the screen noisy for a reader who is
  only reading.
- **A `left` or `right` that does not fit the viewport's width goes to
  `bottom`.** Scrolling cannot change the width, so that choice never flickers.

The clearance between the hole and the box is `--leko-scroll-message-gap`,
12px by default. What sticks out of the page is clipped rather than growing
it, so a box beside a target at the page's edge never adds a scroll the page
did not have.

## The halo

**The halo is a frame on the hole that a page opts into through the
`--leko-scroll-halo-*` tokens.** Until a page sets one it paints nothing.

- **It follows the hole**, moving with it through a morph. There is no mode to
  choose.
- **It is absent during a converge** and appears after the arrival, fading in
  over `--leko-scroll-halo-fade`, 160ms by default.
- **It dims with the scrim during a fade.**

## Padding and radius

**`padding` and `radius` are set for every target at the top level and for one
target on its entry, and the target's own wins.** A page that wants one target
drawn apart from the rest says so on that target and nowhere else.

**The hole is measured from the target's border box**, and `padding` is how far
out from it the hole's edge sits. A hole cut flush therefore contains the
border.

**Where neither sets them, both are 8px.** A hole cut flush leaves what the
target paints outside its border box, a focus outline or a `box-shadow`, under
the scrim, and square corners on a rounded card read as a mistake. 8px clears
both and still reads as belonging to the target.

## Reduced motion

**With `prefers-reduced-motion` set at creation, `createScroll` does nothing
but a `console.info`.** Everything Leko Scroll does is motion — a converge, a
morph, a fade tied to the scroll — and with the motion taken out what is left
is a dark page with holes that jump, which is worse than the page alone. The
message is an info rather than a warning because nothing is wrong: the reader
asked for this.

- **It returns the same shape.** `measure()` and `destroy()` are there and do
  nothing, and `onChange` is never called, so the application writes no branch
  for it.
- **The setting is read once, at creation, and a change is not followed.**
- `prefersReducedMotion` in `packages/spotlight/src/motion.ts` asks the same
  question, and is copied. The spotlight does not export it, and exporting it
  would be changing the spotlight for this product's sake.

## Styling

**Every token is `--leko-scroll-*`.** The scrim's colour, the message and the
halo are all styled through them.

**The defaults are `var()` fallbacks inside the script**, so Leko Scroll draws
correctly on a page with no stylesheet of its own at all.

**Bridging to the tour's look is the application's line:**

```css
:root {
  --leko-scroll-scrim-color: var(--leko-scrim-color);
}
```

The names are separate because the products are. A page running both writes
the bridge once, and a page running one never learns the other's names.

## What comes from the spotlight

**`packages/spotlight` may be imported, and is never changed for Leko Scroll's
sake.** It is the tour's drawing, and a change made there for this product is a
change to the tour that nobody on the tour's side asked for.

**What does not fit is copied and reworked.** The spotlight's `Scrim` is the
first case: it carries the blocking rectangles, the marker a message anchors
to and the halo's modes, and none of those is this product's. Logic the two
come to share is extracted later, once both copies exist and the common part
can be read off them rather than guessed.

## The core and the shell

**The core is pure.** It takes the measured positions, the scroll offset and
the previous state, and answers the switch positions, the lit target, the
opacity, whether the light went out, and the effects the shell is to carry out.
The switch and the fade are functions of those numbers, which is what lets a
scroll run no layout at all.

**The shell measures, draws and listens, and decides nothing.** What the page
says goes into the core as data, and what comes back is carried out.

**The core does not import the spotlight.** The spotlight changes for the
tour's sake, and a core that imported it would change what it decides whenever
the tour changed what it draws. The core's inputs are the numbers the shell
measured and nothing more, so nothing outside this package can move them.

**The core's tests run in Node; the shell's run in Chromium, Firefox and
WebKit.** The core has no page to need, and the shell is nothing but what a
browser does with it.

## The example page

**`examples/scroll` is one long page shaped like a landing page**, with the
targets on it that the rules in this file are about. It is not bound by the
sandbox's conventions: the sandbox is the tour's, and this is a page to scroll
rather than a set of cases to pick from.

## Where things are written down

|                               |                        |
| ----------------------------- | ---------------------- |
| A rule, and why it holds      | this file              |
| A fact no other place holds   | a comment              |
| A situation Leko Scroll meets | `examples/scroll/`     |
| How to work here              | [CLAUDE.md](CLAUDE.md) |
| What came before              | the commits            |

**This file carries no history.** A rule is written in the present tense, with
its reason beside it, and what it replaced is in the commits.
