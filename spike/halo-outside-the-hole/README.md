# Do an outline and an outer shadow stay out of the box they decorate?

The halo frames a cutout by sitting a transparent element exactly on the hole
and decorating it with `outline` and an outer `box-shadow`. That is only allowed
if neither puts paint inside the box, because the hole shows the real page and
the halo must not paint over it. CSS says both stay outside: an outline is drawn
outside the border edge (css-ui-3), and an outer shadow is clipped out of the
border box (css-backgrounds-3). This page asks whether a browser does what those
two statements say.

```bash
open index.html
```

There is no runner. The hit half judges itself; the paint half is judged by
eye, because nothing dependency-free can read the pixels back.

Two cases, each a frame laid over a button labelled "The target" on a
checkerboard. The checkerboard is there because paint that strays into the box
is invisible over a flat colour that happens to match it.

- **Outline and outer shadow.** The frame as Leko builds it, transparent and
  catching nothing, decorated with the page's own example values:
  `outline: 4px` at `outline-offset: 2px`, and `box-shadow: 0 0 18px 6px`. The
  checkerboard inside the ring should be untinted, edge to edge, with the ring
  and the glow entirely outside it.
- **Negative offset and inset shadow, for contrast.** `outline-offset: -8px` and
  an inset shadow. This is what straying paint looks like: the ring and the glow
  sit on the checkerboard. A host that writes a negative `--leko-halo-offset` or
  an inset shadow gets this, and is choosing it.

Below the cases, the page calls `elementFromPoint` at the centre of the first
case's target, with `pointer-events: none` on the frame over it. It prints
either "Hit: a point inside the frame lands on the target underneath. The frame
catches nothing." or "Hit: FAILED — the frame (or something else) took a hit
meant for the target."

## Seen on

No run of this page has been recorded, in the page, in the commit that added
it, or anywhere else in the repository. Whoever opens it next adds the engine,
its version, the date, and what each half showed.

## What it rests on

Until a run is recorded, the rule this page is cited for rests on the two
specification statements, css-ui-3 for the outline and css-backgrounds-3 for
the outer shadow, and not on an observation.

## Why it matters

The halo is paint only, on a frame that catches nothing, so the target the hole
shows stays the one that takes input. Paint inside the box would cover that
target. DESIGN.md, **The halo**, gives the rule and cites this page for it.

## Revisiting

If an engine is ever seen painting an outline or an outer shadow inside the
border box, the halo's paint covers its own target there, and the halo needs
another construction.
