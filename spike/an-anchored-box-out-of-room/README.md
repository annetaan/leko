# Where does an anchored box go once the side it is on has no room?

A box anchored to a zero-area marker on the edge of a hole is meant to stay on
that side of the edge. Where that side has room it does, in every engine. The
question is what happens once it has none — at the draw, after the document
scrolls, after the box's words change, and after the marker is moved by a
style write, the way a loop following a pinned target moves it — and whether
any spelling keeps the box off the hole in all of those.

```bash
open index.html          # including Safari's answer
node run.mjs             # Playwright's Chromium, Firefox and WebKit
node run.mjs chrome      # the real installed Chrome
```

The page measures itself. It draws a painted hole, a zero-area marker on its
edge in the scrolling document, and a popover anchored to the marker, in four
spellings:

- **area** — `position-area: bottom center` (or `top center`), with the gap as
  a margin toward the hole.
- **area + fallbacks** — the same, plus
  `position-try-fallbacks: flip-block, flip-inline`.
- **inset** — `top: anchor(bottom)` (or `bottom: anchor(top)`) with
  `justify-self: anchor-center`, `auto` on the other three insets, the same
  margin, and no fallbacks.
- **inset, no autos** — the same without the `auto`s, to show what they are
  for.

Each is put through six events, and each cell is the box's vertical extent on
screen and whether it overlaps the hole. The first three are one draw with no
room on any side, in three documents: one that cannot scroll, one three
viewports tall at scroll 0, and the same one scrolled by a viewport first. The
last three start with room above the hole and scroll it away; then the words
change, or, from a fresh draw, the marker and the hole are moved up by a style
write.

## What it answers

- **`position-area` can put the box on the hole, in every engine.** An engine
  may shift a box that overflows its area back inside the viewport, and a box
  whose area is the strip between the hole and the edge of the screen goes
  onto the hole when it is shifted. There is nothing a fallback can do about
  it: the marker sits on the edge of the side the box took, so every flip
  crosses that edge onto the hole too.
- **When an engine shifts differs, and none is safe.** In a document that
  cannot scroll, all three shift at the draw. In a document made tall by its
  own content, Chromium and WebKit leave the box where its area puts it and
  Firefox still shifts it. After that, each shifts on something different:
  Chromium, with fallbacks set, on any relayout of the box — its words
  changed, or its marker moved by a style write — but not on a scroll;
  Firefox on any layout of the box, including a scroll with fallbacks set and
  a change of its words without; WebKit only at the draw. Why an in-flow document stops
  two engines shifting at the draw is not something this page answers, and
  nothing here depends on it.
- **The inset spelling is never on the hole, in any event, in any engine.** The
  box's inner edge is laid against the marker with an inset rather than inside
  an area, and nothing then moves it back across that line. The price is plain
  in the extents: where its side has no room, the box runs off the screen
  (`772–838` in an 800px viewport, `-58–8` above one) rather than onto the
  hole.
- **The `auto`s are part of the spelling.** A popover's UA style is
  `inset: 0`, and with only `bottom: anchor(top)` written the `top: 0`
  still holds, so a box above its hole is laid against the top of the
  viewport rather than against the marker. Chromium and Firefox then carry it
  off with the scroll (`-360–-294`); WebKit leaves it at the top of the
  screen, on the hole (`0–66`). Below its hole the missing `auto` does no
  harm: the popover's UA `height: fit-content` sizes the box to its content,
  so `top: anchor(bottom)` and `bottom: 0` over-constrain it, and the box is
  laid from its top edge and keeps it — it runs past `bottom: 0` to
  `772–838`. Above its hole that top edge is the UA `top: 0`, which is why
  that case goes wrong.

## Seen on

### 1. No room, cannot scroll

| spelling | Chromium | Firefox | WebKit |
| --- | --- | --- | --- |
| the hole | `40–760` | `40–760` | `40–760` |
| area | `734–800` **on the hole** | `734–800` **on the hole** | `734–800` **on the hole** |
| area + fallbacks | `734–800` **on the hole** | `734–800` **on the hole** | `734–800` **on the hole** |
| inset | `772–838` clear | `772–838` clear | `772–838` clear |
| inset, no autos | `772–838` clear | `772–838` clear | `772–838` clear |

### 2. No room, at scroll 0

| spelling | Chromium | Firefox | WebKit |
| --- | --- | --- | --- |
| the hole | `40–760` | `40–760` | `40–760` |
| area | `772–838` clear | `734–800` **on the hole** | `772–838` clear |
| area + fallbacks | `772–838` clear | `734–800` **on the hole** | `772–838` clear |
| inset | `772–838` clear | `772–838` clear | `772–838` clear |
| inset, no autos | `772–838` clear | `772–838` clear | `772–838` clear |

### 3. No room, scrolled first

| spelling | Chromium | Firefox | WebKit |
| --- | --- | --- | --- |
| the hole | `40–760` | `40–760` | `40–760` |
| area | `772–838` clear | `734–800` **on the hole** | `772–838` clear |
| area + fallbacks | `772–838` clear | `734–800` **on the hole** | `772–838` clear |
| inset | `772–838` clear | `772–838` clear | `772–838` clear |
| inset, no autos | `772–838` clear | `772–838` clear | `772–838` clear |

### 4. Scrolled out of room

| spelling | Chromium | Firefox | WebKit |
| --- | --- | --- | --- |
| the hole | `40–240` | `40–240` | `40–240` |
| area | `-38–28` clear | `-38–28` clear | `-38–28` clear |
| area + fallbacks | `-38–28` clear | `0–66` **on the hole** | `-38–28` clear |
| inset | `-38–28` clear | `-38–28` clear | `-38–28` clear |
| inset, no autos | `-360–-294` clear | `-360–-294` clear | `0–66` **on the hole** |

### 5. Words changed

| spelling | Chromium | Firefox | WebKit |
| --- | --- | --- | --- |
| the hole | `40–240` | `40–240` | `40–240` |
| area | `-101–28` clear | `0–129` **on the hole** | `-101–28` clear |
| area + fallbacks | `0–129` **on the hole** | `0–129` **on the hole** | `-101–28` clear |
| inset | `-101–28` clear | `-101–28` clear | `-101–28` clear |
| inset, no autos | `-360–-231` clear | `-360–-231` clear | `0–129` **on the hole** |

### 6. Marker moved

| spelling | Chromium | Firefox | WebKit |
| --- | --- | --- | --- |
| the hole | `20–220` | `20–220` | `20–220` |
| area | `-58–8` clear | `0–66` **on the hole** | `-58–8` clear |
| area + fallbacks | `0–66` **on the hole** | `0–66` **on the hole** | `-58–8` clear |
| inset | `-58–8` clear | `-58–8` clear | `-58–8` clear |
| inset, no autos | `-360–-294` clear | `-360–-294` clear | `0–66` **on the hole** |

Chromium 151.0.7922.34, Firefox 153.0 and WebKit 605.1.15 (`Version/26.5`) at
a viewport of 1280×800, identical on two runs. The installed Chrome
(154.0.0.0, headless) agreed with Chromium in every cell.

**Safari 26.5 (21624.2.5.11.4)** on macOS 26.5, opened by hand on 2026-10-01
in Responsive Design Mode at 1280×800, agreed with the WebKit column in every
cell of all six tables, extents and verdicts both: the inset spelling clear
throughout, `position-area` on the hole only at the draw in a document that
cannot scroll, and the inset without its `auto`s on the hole once the box is
above it.

## What it does not answer

- **Only the vertical sides.** Every box here sits above or below its hole.
  `left: anchor(right)` and `right: anchor(left)` with `align-self:
  anchor-center` are the same spelling on the other axis and are not
  measured.
- **A marker inside a scroller other than the document.** The marker here is
  in the document's own scroll, which is where Leko's lives when the target
  is; a marker in a nested scroller is covered for painting by
  [`anchored-paint-in-safari/`](../anchored-paint-in-safari/) and not for
  sliding here.
- **The other axis of the alignment.** `justify-self: anchor-center` is
  meant to keep the box inside the viewport along the edge it sits beside, as
  `center` in `position-area` does. No box here is near a side of the
  viewport, so that is not measured; a shift along the edge could not cross
  the hole in any case.
- **Where the box should go instead.** A box held on a side with no room is
  off the screen, and choosing a side that has room is a decision for
  whatever places the box, not something the spelling can make.
