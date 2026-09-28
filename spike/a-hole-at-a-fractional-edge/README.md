# Do a mask hole and a box laid on it meet at a fractional edge?

Leko Scroll cuts its hole as a `data:` SVG image in a mask layer, placed with
`mask-position` at the image's own size, and lays the halo on the same
rectangle as an ordinary box. A halo laid flush on the hole, painting inside
it, has to meet the scrim exactly: a pixel between them that neither paints
shows the page undimmed, and one that both paint is darker than the scrim. A
target's box is at a fraction of a pixel as often as not, so the question is
whether the two meet there, and if they do not, what rectangle they do meet
on.

```bash
open index.html          # judged by eye, Safari included
node run.mjs             # Playwright's Chromium, Firefox and WebKit
node run.mjs chrome      # the real installed Chrome
node run.mjs webkit      # one engine on its own
```

Each case is a surface with a scrim over a flat magenta ground and a halo
flush on the hole in the scrim's own colour, so an edge that meets is
invisible, a gap is a bright line and an overlap a darker one. Each case is
drawn three ways:

- **raw** — the rectangle as it came, the way the scrim writes it: two
  decimals in the mask, every digit in the box.
- **whole CSS px** — each edge moved to the nearest whole CSS pixel first.
- **device px** — each edge moved to the nearest device pixel instead,
  `1 / devicePixelRatio` of a CSS pixel.

The first two cases carry the fractions of `#why` and `#why-copy`, the two
landing-page targets the line was first seen on; the rest are chosen so each
rounding direction happens on its own, and the last is whole pixels, the
control.

A page cannot read its own pixels, so opened by hand it is judged by eye.
`run.mjs` takes a screenshot at each of five scales and hands it to the page,
which decodes it on a canvas, samples four device pixels either side of the
middle of every edge, and draws its verdicts in a table of its own. A pixel
three quarters of the way from the dimmed ground to the bare one is a gap, and
three quarters of the way to the ground dimmed twice is an overlap; anything
else off the ground is partly covered. Every surface starts on a multiple of
4 CSS pixels, which is a whole device pixel at every scale here, the way a
scrim at the page's origin does; a surface that does not is flagged, and one
outside the window is reported off screen rather than judged.

## What it answers

- **The two are placed by different rules, and at a fraction they miss.**
  Chromium and Firefox put the mask image at the rounded position with the
  rounded size, so it ends at `round(x) + round(width)`; the box rounds each
  edge, and ends at `round(x + width)`. Where those differ by one, a row or a
  column of device pixels is left to neither or given to both. The raw column
  reproduces the landing page exactly at 1x: `#why` loses its bottom row and
  `#why-copy` its right column. WebKit antialiases the mask's fractional edge
  instead, and a partly covered line runs along it, too light or too dark.
- **Whole CSS pixels meet in every engine at 1x, 2x and 3x.** With each edge
  already on a whole CSS pixel there is nothing left to round, and every case
  is flush in Chromium, Firefox and WebKit, to within one level.
- **Device pixels do not.** At 1x they are the same thing, but at 2x and 3x a
  half-pixel edge is left in the mask's size and the two rules part again, in
  all three engines, on nearly as many cases as raw.
- **At a fractional scale a whole CSS pixel meets only where it is a whole
  device pixel.** At 1.25 and 1.5 — Windows' display scales, and a page
  zoom's — a whole CSS pixel is a whole device pixel only every 4 CSS pixels
  at 1.25 and every 2 at 1.5. In Chromium, Chrome and Firefox an edge on one
  of those meets, and an edge between them may leave a partly covered line;
  none leaves a whole gap or overlap. At 1.25 every case has such an edge, the
  whole-pixel control included, and every case is defective in all four
  engines. At 1.5 the control sits on whole device pixels and is flush in
  Chromium, Chrome and Firefox, where 7, 7 and 6 of the 8 cases are
  defective. The line is 16 levels in 255 off the dimmed ground in Chromium
  and up to 32 in Chrome, which is hard to see, and up to 64 — half a full
  gap — in Firefox and WebKit. WebKit leaves one on the left or right edge of
  every case at both scales, the control included, whatever the coordinate,
  so all 8 are defective there.

## Seen on

Each cell is the cases found defective out of eight, then the defective
pixels as gap / overlap / partial, then the largest step from the dimmed
ground, out of 255.

| engine | scale | raw | whole CSS px | device px |
| --- | --- | --- | --- | --- |
| Chromium | 1 | 6/8 · 7/2/0 · 128 | 0/8 · 0/0/0 · 0 | 0/8 · 0/0/0 · 0 |
| Chromium | 1.25 | 8/8 · 7/2/20 · 128 | 8/8 · 0/0/17 · 16 | 8/8 · 2/5/22 · 96 |
| Chromium | 1.5 | 7/8 · 12/2/14 · 128 | 7/8 · 0/0/17 · 16 | 7/8 · 10/0/15 · 128 |
| Chromium | 2 | 6/8 · 14/4/0 · 128 | 0/8 · 0/0/0 · 0 | 5/8 · 16/0/0 · 128 |
| Chromium | 3 | 6/8 · 21/6/0 · 128 | 0/8 · 0/0/0 · 0 | 5/8 · 15/9/0 · 128 |
| Chrome | 1 | 6/8 · 7/2/0 · 128 | 0/8 · 0/0/0 · 1 | 0/8 · 0/0/0 · 1 |
| Chrome | 1.25 | 8/8 · 5/2/21 · 128 | 8/8 · 0/0/17 · 32 | 8/8 · 2/5/20 · 96 |
| Chrome | 1.5 | 7/8 · 7/2/19 · 128 | 7/8 · 0/0/17 · 32 | 7/8 · 5/0/20 · 128 |
| Chrome | 2 | 6/8 · 14/4/0 · 128 | 0/8 · 0/0/0 · 1 | 5/8 · 16/0/0 · 128 |
| Chrome | 3 | 6/8 · 21/6/0 · 128 | 0/8 · 0/0/0 · 1 | 5/8 · 15/9/0 · 128 |
| Firefox | 1 | 6/8 · 7/2/0 · 128 | 0/8 · 0/0/0 · 0 | 0/8 · 0/0/0 · 0 |
| Firefox | 1.25 | 7/8 · 10/0/10 · 128 | 8/8 · 0/0/13 · 64 | 8/8 · 4/0/14 · 128 |
| Firefox | 1.5 | 6/8 · 6/0/12 · 128 | 6/8 · 0/0/10 · 64 | 7/8 · 8/0/14 · 128 |
| Firefox | 2 | 7/8 · 18/2/0 · 128 | 0/8 · 0/0/0 · 0 | 7/8 · 22/0/0 · 128 |
| Firefox | 3 | 7/8 · 26/2/0 · 128 | 0/8 · 0/0/0 · 0 | 7/8 · 20/5/0 · 128 |
| WebKit | 1 | 6/8 · 0/2/9 · 48 | 0/8 · 0/0/0 · 0 | 0/8 · 0/0/0 · 0 |
| WebKit | 1.25 | 8/8 · 0/6/14 · 64 | 8/8 · 0/0/8 · 32 | 8/8 · 0/4/19 · 64 |
| WebKit | 1.5 | 8/8 · 0/8/10 · 64 | 8/8 · 0/0/8 · 64 | 8/8 · 0/8/8 · 64 |
| WebKit | 2 | 6/8 · 0/10/2 · 64 | 0/8 · 0/0/0 · 0 | 7/8 · 0/13/0 · 64 |
| WebKit | 3 | 7/8 · 3/14/5 · 128 | 0/8 · 0/0/0 · 0 | 6/8 · 4/7/7 · 121 |

Chromium 151.0.7922.34, Chrome 153.0.8010.54, Firefox 153.0 and WebKit
605.1.15 (`Version/26.5`) at a viewport of 1280×1000, each scale emulated with
Playwright's `deviceScaleFactor`. **Safari is not checked**: open the page in
it and read the surfaces by eye; the answer is in the page, not the console.

## What it does not answer

- **A real fractional display.** The 1.25 and 1.5 rows are emulated. WebKit's
  line on the left or right of every case, the control included, looks like an
  artifact of the emulation; Safari on a Mac has no fractional scale but page
  zoom.
- **The rounded corners.** Only the middle of each edge is sampled. Where the
  radius curves, the mask and the box both antialias, and that is a separate
  question.
- **A scrim whose origin is between device pixels.** Every surface here
  starts on a whole device pixel, because a scrim laid at the page's origin
  does too.
