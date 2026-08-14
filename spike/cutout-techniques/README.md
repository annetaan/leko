# Cutting a hole in an overlay

Which of the plausible techniques survive contact with a real browser, and how
much of the geometry CSS can work out on its own.

```bash
open index.html          # the whole answer, including Safari's
node run.mjs             # the real installed Chrome
node run.mjs firefox     # Playwright's Gecko
node run.mjs webkit      # Playwright's WebKit — not Safari
```

The page judges every test itself and prints a table, so opening it is enough.
`run.mjs` only reads the same verdicts out of `window.spikeResults` and takes
screenshots for the two calls that are made by eye.

## Seen on

| | Verdict | Last checked |
| --- | --- | --- |
| Chrome 150 → 151.0.7922.76, macOS 26.3.1 | agrees on every row | 2026-08-12 |
| Firefox 153 | agrees on every row | at first writing |
| Safari 26.3.1, macOS 26.3.1 | agrees on every row | at first writing |

Record what you ran it on when you re-check. A verdict without a version is not
much use to whoever reads this after a browser has moved on.

## What it settled

**All three engines agreed on every row.** No unexpected failures; the rows
marked *limit* are limits that were suspected and are now confirmed.

**`anchor()` does not reach a mask (T3).** `--x: anchor(--a left)` can be used
as `left: var(--x)` — substitution is a token-level thing, so it works as long
as the eventual destination is an inset property. `mask-position: var(--x)` is
invalid and falls back to its initial value. **There is no CSS-only route from
an element's box to a mask or a `clip-path`**, which means the geometry has to
be measured in JS and written out.

**`box-shadow` spread is out as soon as there are two holes (T4).** A spread
shadow covers everything except its own shaper's box, so with N shapers each
hole is covered by the other N-1 shadows — and the dimming stacks, so 0.7 twice
over reads as 0.91. `evidence-box-shadow.png` shows it: compare the blue of the
one-hole stage against the blue of the two-hole stage.

**`clip-path: path(evenodd)` does everything asked of it (T5).** One overlay,
one outer rectangle plus one rounded-rectangle subpath per hole. The holes fall
out of hit-testing rather than merely being transparent, so the elements under
them can be used. Corners are arc commands, so they stay crisp at any size, and
under even-odd the winding direction of the subpaths does not matter.

**Neither reason to run position maths every frame survives (T6a, T7).**

- Put the overlay *inside* the scrolling content, with the path in content
  coordinates, and scrolling moves overlay and target together. Placed outside
  the scroller it drifts off the moment the panel moves (T6b) — so **each
  scrolling container needs an overlay of its own**.
- `clip-path: path()` interpolates whenever the two paths have the same segments
  in the same order, corner radius included. Write two path strings at a step
  boundary and CSS carries the morph.

**Changing the number of holes breaks the interpolation (T8).** The segment
count changes, so it switches over discretely. Collapse a departing hole to zero
area instead of dropping its subpath and the interpolating route works again.

## What it did not settle

- **Safari 18.2.** The Safari here was 26.3.1, which is not the floor anyone
  would want to claim. A device or a service is needed for that.
- Whether the interpolation above is safe to hand to the Web Animations API. It
  is not — see [`../waapi-clip-path/`](../waapi-clip-path/).
- Whether a hole passes a *wheel* the way it passes a click. It does not — see
  [`../wheel-through-a-hole/`](../wheel-through-a-hole/).
