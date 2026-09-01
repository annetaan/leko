# Two holes that overlap

Leko cuts its holes with one `clip-path: path(evenodd, …)`. Even-odd counts
crossings, so a point inside two holes is inside an even number of subpaths and
paints **dark**. That is not a curiosity: it means two holes may never overlap,
and an opening where every hole converges inward from off the surface — the
effect this page exists to price — is precisely a set of holes that overlap
while they travel.

A union has to come from somewhere else, and there are three places it could
come from. This page asks all three, on a scrim the height of a long document,
and asks what each costs.

```bash
open index.html          # the whole answer, including Safari's
node run.mjs             # the real installed Chrome
node run.mjs firefox     # Playwright's Gecko
node run.mjs webkit      # Playwright's WebKit — not Safari
```

`run.mjs` reads the verdicts the page reached itself and screenshots the calls
that have to be made by eye. It runs at `deviceScaleFactor: 2`, because a wrong
rasterisation scale is one of the things being watched for and it does not show
at 1x.

## Seen on

| | M1 / M5 `mask: url(#…)` | M6, both ways | M7 an `<svg>` scrim | M2 cost on 12 000px |
| --- | --- | --- | --- | --- |
| Chrome 152 headless, macOS 26.5 | works (7 of 8 spellings) | works | works | all four free |
| Firefox 153, Playwright | works (7 of 8 spellings) | works | works | all four free |
| WebKit 26.5, Playwright | **no, 0 of 8** | works | works | **the `<svg>` scrim: 81ms/frame** |
| Safari 26.x, macOS | **no, 0 of 8** | works | works | not checked |

Checked 2026-09-01 (engines) and 2026-09-02 (Safari, M1 / M5 / M6 / M7 by hand,
including the positioned-layer panel Leko ships). Safari's cost was not
measured — M2 needs a run there.

**Playwright's WebKit and Safari agreed on every panel they were both asked**,
which is worth more than either result alone: on this question the bundled engine
is standing in for Safari accurately. It is still not Safari, and the frame times
above are not Safari's.

## What it settled

**The overlap is a hole under a union and a dark patch under even-odd (M1).**
`evidence-opening-clip.png` against `evidence-opening-mask.png` is the argument
in two pictures, caught halfway through a morph: under even-odd both targets are
*darker than the scrim around them*, and they invert as the holes pass through
each other.

**No spelling of `mask: url(#…)` cuts a hole in WebKit or Safari (M5).** Eight
ways of asking — prefixed and unprefixed, the shorthand, `mask-mode: luminance`,
`mask-type` on the mask element, both together, the mask inside a `<defs>` — and
every one is either ignored, leaving the scrim whole, or resolves to nothing,
taking the scrim with it. `evidence-webkit-spellings.png`, and Safari matches it.
`CSS.supports('mask-image: url(#a)')` answers **true** in Safari all the same: a
support query parses syntax and says nothing about whether a reference resolves,
which is why the failure is silent. Chrome and Firefox honour seven of the
eight — every one except a mask held in an `<svg>` that is *rendered*, which
drops the scrim entirely. The `<svg>` must be zero-sized.

**Both of the routes that reference nothing work in every engine, WebKit
included (M6, M7).** `evidence-routes-opening.png` is WebKit, halfway through the
same morph: three routes hold both targets bright while the dark closes in from
the corners, and even-odd inverts beside them.

- **M6, CSS mask layers.** One opaque layer for the surface, one `data:` URL
  image per hole, `mask-composite: subtract` on top and `add` between the holes.
  The pre-standard `-webkit-mask-composite: source-out, source-over` spelling
  works too, and is not needed. **The third panel is the one Leko ships**: each
  hole drawn at its own size and laid with `mask-position`, so the image an
  engine rasterises is the size of a target rather than the size of a document.
- **M7, an `<svg>` scrim.** The scrim becomes an `<svg>`, the dimming a `<rect>`
  in it, and the mask is applied with the SVG `mask` attribute. No CSS masking
  anywhere.

**M7 is unaffordable, and only WebKit says so (M2).** On a 12 000px surface with
three holes moving:

| | idle | clip-path | `mask: url(#…)` | `mask-composite` | positioned layers | `<svg>` scrim |
| --- | --- | --- | --- | --- | --- | --- |
| Chrome | 16.7ms | 16.7ms | 16.7ms | 16.7ms | 16.7ms | 16.7ms |
| Firefox | 16.7ms | 16.7ms | 16.7ms | 16.7ms | 16.7ms | 16.7ms |
| WebKit | 17.0ms | 17.0ms | 17.0ms | 17.0ms | 17.0ms | **81ms, 118 of 119 frames long** |

Median frame gaps; the write itself is under 0.1ms in every cell, so what the
81ms buys is paint. WebKit re-rasterises the whole 12 000px SVG surface every
frame. Reproduced three times. **The elegant route is the one that cannot be
taken**, and it would have looked free on any machine where the tests were run in
Chrome.

**A hole 11 500px down a 12 000px surface is still cut (M3).** No surface-size
cliff for any route that works — `shots-*/deep.png`.

**A mask does not take the scrim out of hit-testing, and a clip does (M4).** The
same point over the same hole answers with the target through the clip path and
with the scrim through the mask. Leko relies on neither: the scrim carries
`pointer-events: none` and the blocking is done by rectangles beside it, because
a clip passes a click but **not** a wheel (`../wheel-through-a-hole/`). So a move
to masking takes a trap away rather than adding one — what the scrim catches
would be decided in one place instead of two.

The three pictures kept here are the ones an argument gets made from. Everything
else under `shots-*/` is regenerated by `run.mjs` and is not committed.

## What it did not settle

- **What any of this costs in Safari.** The M2 table is Chrome, Firefox and
  Playwright's WebKit. Safari was asked what it draws, not what it pays.
- **What many holes cost.** Everything here uses two or three. A layer and a
  `data:` URL are added per hole, so the per-frame string work grows with them
  in a way a single path's did not.
- **What a mask surface costs in memory** on a scrim thousands of pixels tall.
  M2 measures frames and writes, not bytes. Drawing each hole at its own size
  rather than the surface's is what makes this a small question rather than a
  large one, and it is still not measured.
- **What N holes cost.** Everything here uses two or three. M6 adds a layer and
  a `data:` URL per hole, so its cost grows with them in a way clip-path's does
  not.
- **Whether a mask can be handed to the compositor.** It is not asked to be here,
  for the reason `../waapi-clip-path/` gives about clip paths.
- **The route that keeps even-odd** and adds the intersection of every pair of
  holes as a further subpath, bringing the parity back out even: 2^N − 1
  subpaths for N holes, with the intersection of two *rounded* rectangles
  approximated by a sharp one. Nothing here measures it, and after M6 nothing
  needs to.
