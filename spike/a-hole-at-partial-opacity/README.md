# Does a mask hole at partial opacity dim the hole by that much?

The tour's scrim cuts each hole as a `data:` SVG image in a mask layer,
subtracted from one opaque layer for the whole surface, with `add` between the
holes. A refused press under `prefers-reduced-motion` cannot move the hole, so
the question is whether it can dim it instead: whether a hole image drawn at a
`fill-opacity` below 1 leaves exactly that share of the scrim in the hole, alone
and where two holes overlap, and whether rewriting it every frame reads as one
dip rather than a flicker.

```bash
open index.html          # judged by eye, Safari included
node run.mjs             # Playwright's Chromium, Firefox and WebKit
node run.mjs chrome      # the real installed Chrome
node run.mjs webkit      # one engine on its own
```

Every surface is a flat bright ground under a scrim of `rgb(0 0 0 / 0.45)`,
Leko's default, masked the way `Scrim.paint` writes it: unprefixed,
`linear-gradient(black, black)` first, each hole image after it,
`mask-composite: subtract, add`, `mask-repeat: no-repeat`. Beside each surface
is a reference swatch, the same ground under a plain `rgb(0 0 0 / α)` at the
alpha the hole should leave.

- **Case 1** — one hole at `fill-opacity` 1, 0.5 and 0. The scrim's alpha
  inside it should be `0.45 × (1 − opacity)`: 0, 0.225 and 0.45. The scrim
  outside the hole is checked against 0.45 as a control.
- **Case 2** — two holes at 0.5 that overlap. `add` composites them
  source-over, so the overlap holds `0.5 + 0.5 × (1 − 0.5) = 0.75` of a hole
  and the scrim there should be `0.45 × (1 − 0.75) = 0.1125`; each hole alone
  should be 0.225. A brighter overlap is the expected answer, not a defect:
  it is what a dip on two overlapping holes will show.
- **Case 3** — one hole dipped from a button: a frame loop writes a new
  `data:` URL each frame at `(1 + cos 2πp) / 2`, with `p` on Leko's own
  `ease`, over 400ms. It is judged by eye — one dip, no flicker — and `run.mjs`
  does not read it.

A page cannot read its own pixels, so opened by hand it is judged by eye: each
hole should look exactly like the swatch beside it. `run.mjs` takes a
screenshot at 1x and 2x and hands it to the page, which decodes it on a canvas,
averages a 5×5 block of device pixels at each sample point and at the same
point of its reference, and draws a table of its own: a sample passes when no
channel is more than 3 levels in 255 off. The cases are tens of levels apart
on this ground, so 3 separates them with room to spare.

## What it answers

- **Yes, in Chromium, Firefox and WebKit, at 1x and 2x.** A hole at
  `fill-opacity` 1, 0.5 and 0 leaves the scrim at 0, half and all of its alpha
  inside the hole, matching its reference to the level.
- **Two overlapping holes composite source-over.** Each hole alone is at
  0.225 to the level, and the overlap is at 0.1125 to within 2 levels — not 0,
  which pure addition would give. The overlap stays brighter than the rest of
  the hole for as long as the opacity is below 1.

## Seen on

Samples passed out of nine, and the largest difference from a reference in
levels out of 255.

| engine | scale | passed | largest difference |
| --- | --- | --- | --- |
| Chromium | 1 | 9/9 | 2 |
| Chromium | 2 | 9/9 | 2 |
| Firefox | 1 | 9/9 | 2 |
| Firefox | 2 | 9/9 | 2 |
| WebKit | 1 | 9/9 | 1 |
| WebKit | 2 | 9/9 | 1 |

Chromium 151.0.7922.34, Firefox 153.0 and WebKit 605.1.15
(`Version/26.5`) at a viewport of 1280×1000. In every engine the largest
difference is in the overlap, and every other sample matches exactly.

**Safari: not yet opened.** Open the page in it and compare each hole with
the swatch beside it, then play the dip; the answer is in the page, not the
console.

## What it does not answer

- **The dip, by measurement.** Case 3 is judged by eye, and no screenshot
  says whether a frame loop flickers on the compositor.
- **Any scrim colour but the default.** A host's `--leko-scrim-color` with an
  alpha of its own scales the same way in principle, and is not sampled here.
- **The edge of a hole at partial opacity.** Only the middle of each region is
  sampled; the rounded corners antialias, and that is a separate question.
