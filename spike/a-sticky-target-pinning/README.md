# When is a sticky element pinned, and does it say so?

A `position: sticky` element rides the scroll until it pins, and from then on
it holds against its scrollport's edge while everything under it moves — until
its containing block runs out and it is pushed away again. A hole cut where it
stood is right in one of those states and wrong in the other, so anything
drawing one has to know which state the element is in, from one reading taken
at the draw and without watching the scroll afterwards.

```bash
open index.html          # including Safari's answer
node run.mjs             # Playwright's Chromium, Firefox and WebKit
node run.mjs chrome      # the real installed Chrome
```

The page measures itself. **Held** is the ground truth and is read the way a
viewer sees it: scroll one further pixel, and look at whether the element
moved. Beside it are three candidate tests, each something a library could ask
at the draw, each marked against what held said:

- **offset** — the element's box on screen, less where `offsetTop` puts it.
  A test only if `offsetTop` is the flow position.
- **inset** — the element's box against its scrollport's edge, less the used
  `top`. A pinned element sits exactly on its inset, so this is zero when
  pinned.
- **static** — write `position: static`, read the box again, put the style
  back. Exact about displacement, and it writes to an element the application
  owns and flushes layout to do it.

## What it answers

- **`offsetTop` is the stuck position, not the flow position.** It grows with
  the scroll for the whole pinned range — `0`, then `100`, then `1179` — so the
  element's box less its `offsetTop` is zero in every state, pinned or not.
  There is nothing to compare against and the test says nothing, in every
  engine. This is the test the issue reached for first.
- **The inset test is right in every state, in every engine**, in the page and
  inside a scroller alike, on a tenth of a pixel. It is one
  `getBoundingClientRect`, one `getComputedStyle` and the scrollport's own box
  — all three read at the draw already.
- **The exact-looking test is the wrong one.** `position: static` says how far
  the element has been displaced from its flow position, and that is not the
  same question: past the end of the containing block the element is displaced
  by the whole span (`2356`) and riding the scroll again. It answers *riding*
  as *pinned* in that state in every engine, and it costs a style write to an
  element the application owns and a layout flush to read.
- **The pin can be predicted from one reading, exactly.** While the element is
  riding, the distance between its box and its inset is the scroll left before
  it pins. Three pixels short of the predicted offset the element still rides
  and two past it is held, in every engine, whether the reading was taken at
  rest or part of the way there. That is the destination
  [annetaan/leko-archive#134](https://github.com/annetaan/leko-archive/issues/134)
  was told to leave room for.
- **A layer can be glued to a scroller's scrollport**, which `position: fixed`
  cannot express. An absolutely positioned wrapper the size of the scroller's
  content, holding a `position: sticky` child at `top: 0; left: 0` the size of
  the scrollport, sits exactly on the padding box at every offset on both axes,
  including both far corners, and does not grow the scrollable area it is
  mounted in.
- **A scroller's padding is part of both answers, and neither panel above can
  see it.** The two panels in questions 2 and 3 have none, so the padding box
  and the content box are the same box in them. In a panel with
  `padding: 11px`, a header asking for `top: 0` comes to rest on the *content*
  box — 11px inside the padding box, in every engine — so a reading taken
  against the padding box calls a pinned header riding by exactly that padding.
  The glued layer lands there too: asking for `top: 0; left: 0` it sits on the
  content box at rest and on the padding box only at the far corner, where its
  containing block pushes it back; asking the padding back as a negative inset
  it sits on the padding box at both ends of both axes. A layer left on the
  content box leaves the padding of the panel it is dimming undimmed.
- **`scrollIntoView` does not deliver the pinned state.** With
  `block: 'nearest'` it brings the element just inside the port's far edge and
  stops — `0 → 2747` where the pin is at `3423` — so the element is riding when
  it lands. From inside the pinned range it does not move at all, the element
  being visible already, and the state is kept. Getting a target *past* its pin
  is arithmetic and a scroll of Leko's own, not a call to this.

## Seen on

### 1. A sticky header in the page

| state | Chromium | Firefox | WebKit |
| --- | --- | --- | --- |
| at rest | **riding** · offset `0`, inset `3423.1`, static `0` | **riding** · offset `0`, inset `3431.6`, static `0` | **riding** · offset `0`, inset `3426.7`, static `0` |
| just before the pin | **riding** · offset `0`, inset `40.1`, static `0` | **riding** · offset `0`, inset `39.6`, static `0` | **riding** · offset `0`, inset `39.7`, static `0` |
| just after the pin | **pinned** · offset `-0.1` **wrong**, inset `0`, static `99.9` | **pinned** · offset `0.4` **wrong**, inset `0`, static `100.4` | **pinned** · offset `0.3` **wrong**, inset `0`, static `100.3` |
| deep in the pinned range | **pinned** · offset `-0.1` **wrong**, inset `0`, static `1178.9` | **pinned** · offset `0.4` **wrong**, inset `0`, static `1179.4` | **pinned** · offset `0.3` **wrong**, inset `0`, static `1179.3` |
| past the end of the block | **riding** · offset `0`, inset `-101.9`, static `2356` **wrong** | **riding** · offset `0`, inset `-102.4`, static `2356` **wrong** | **riding** · offset `0`, inset `-102.3`, static `2356` **wrong** |

### 2. A sticky header inside a scroller

| state | Chromium | Firefox | WebKit |
| --- | --- | --- | --- |
| at rest | **riding** · offset `0`, inset `301`, static `0` | **riding** · offset `0`, inset `301`, static `0` | **riding** · offset `0`, inset `301`, static `0` |
| just before the pin | **riding** · offset `0`, inset `40`, static `0` | **riding** · offset `0`, inset `40`, static `0` | **riding** · offset `0`, inset `40`, static `0` |
| just after the pin | **pinned** · offset `0` **wrong**, inset `0`, static `100` | **pinned** · offset `0` **wrong**, inset `0`, static `100` | **pinned** · offset `0` **wrong**, inset `0`, static `100` |
| deep in the pinned range | **pinned** · offset `0` **wrong**, inset `0`, static `433` | **pinned** · offset `0` **wrong**, inset `0`, static `433` | **pinned** · offset `0` **wrong**, inset `0`, static `433` |
| past the end of the block | **riding** · offset `0`, inset `-102`, static `864` **wrong** | **riding** · offset `0`, inset `-102`, static `864` **wrong** | **riding** · offset `0`, inset `-102`, static `864` **wrong** |

### 3. A layer glued to a scroller's scrollport

| offset | Chromium | Firefox | WebKit |
| --- | --- | --- | --- |
| at rest | glued · `420×220` | glued · `420×220` | glued · `420×220` |
| scrolled down | glued · `420×220` | glued · `420×220` | glued · `420×220` |
| scrolled across | glued · `420×220` | glued · `420×220` | glued · `420×220` |
| both, mid-range | glued · `420×220` | glued · `420×220` | glued · `420×220` |
| at the far corner | glued · `420×220` | glued · `420×220` | glued · `420×220` |
| scrollable area | unchanged · `1400×1600` | unchanged · `1400×1600` | unchanged · `1400×1600` |

### 4. The pin predicted from one reading

| reading | Chromium | Firefox | WebKit |
| --- | --- | --- | --- |
| page, read at rest | pin at `3423` · riding 3px short, pinned 2px past | pin at `3432` · riding 3px short, pinned 2px past | pin at `3427` · riding 3px short, pinned 2px past |
| page, read part of the way there | pin at `3423` · riding 3px short, pinned 2px past | pin at `3432` · riding 3px short, pinned 2px past | pin at `3427` · riding 3px short, pinned 2px past |
| panel, read at rest | pin at `301` · riding 3px short, pinned 2px past | pin at `301` · riding 3px short, pinned 2px past | pin at `301` · riding 3px short, pinned 2px past |
| panel, read part of the way there | pin at `301` · riding 3px short, pinned 2px past | pin at `301` · riding 3px short, pinned 2px past | pin at `301` · riding 3px short, pinned 2px past |

### 5. `scrollIntoView({ block: "nearest" })` on a sticky target

| trip | Chromium | Firefox | WebKit |
| --- | --- | --- | --- |
| page, from above the pin | 0 → 2747 · ends riding | 0 → 2756 · ends riding | 0 → 2751 · ends riding |
| page, from inside the pinned range | 3823 → 3823 · ends **pinned** | 3832 → 3832 · ends **pinned** | 3827 → 3827 · ends **pinned** |
| panel, from above the pin | 0 → 117 · ends riding | 0 → 117 · ends riding | 0 → 117 · ends riding |
| panel, from inside the pinned range | 501 → 501 · ends **pinned** | 501 → 501 · ends **pinned** | 501 → 501 · ends **pinned** |

### 6. A padded scroller

| reading | Chromium | Firefox | WebKit |
| --- | --- | --- | --- |
| a header at `top: 0`, pinned | the content box · `12, 11` | the content box · `12, 11` | the content box · `12, 11` |
| a glued child at `top: 0; left: 0`, at rest | the content box · `11, 11` | the content box · `11, 11` | the content box · `11, 11` |
| a glued child at `top: 0; left: 0`, at the far corner | the padding box · `0, 0` | the padding box · `0, 0` | the padding box · `0, 0` |
| a glued child asking the padding back, at rest | the padding box · `0, 0` | the padding box · `0, 0` | the padding box · `0, 0` |
| a glued child asking the padding back, at the far corner | the padding box · `0, 0` | the padding box · `0, 0` | the padding box · `0, 0` |

The pair is `dx, dy` from the panel's padding box. The header's `dx` is a pixel
over the content box because the section it is written in has a border; only
the axis it is sticky on is a verdict about sticky.

Chromium 151.0.7922.34, Firefox 153.0 and WebKit 605.1.15 (`Version/26.5`) at a
viewport of 1280×720, and **Safari 26.5 (21624.2.5.11.4)**, opened by hand,
which agreed on every verdict in all six tables: `offset` wrong in both pinned
states, `inset` right in all of them, `static` wrong past the end of the
containing block, the layer glued at every offset with the scrollable area
unchanged, the pin where one reading predicted it, `scrollIntoView` landing
riding from above the pin, and in the padded panel a header and a naive layer
resting on the content box while a layer asking the padding back rests on the
padding box — table 6 to the pixel, `12, 11` and `11, 11` and three times
`0, 0`. The numbers differ between engines by a few
pixels because the prose above the panels wraps differently; the page works
every offset out from the layout it finds, so only the verdicts compare.

## What it does not answer

- **Only the `top` edge.** Every element here is sticky at the top, which is
  what a header, a filter bar and a table head are. `bottom`, `left` and
  `right` are the same arithmetic against the other edge, and an element sticky
  on two axes is two of these; `top: auto` reads as `NaN` here and is left out
  rather than guessed at.
- **The instant of the pin itself.** A riding element that happens to be
  sitting exactly on its inset is one pixel of scroll from pinning, and the
  inset test calls it pinned. Either answer is right at that offset and wrong
  on one side of it, which is the drift
  [annetaan/leko-archive#135](https://github.com/annetaan/leko-archive/issues/135)
  accepts by drawing one state and naming it.
- **`animation-timeline: scroll()`**, the zero-JS way to make the hole follow
  the whole piecewise-linear path rather than pick a state. It is a separate
  page if it is ever wanted, and the two-state answer here is cheap enough that
  it is not wanted yet.
