# What moves when a static scroller is given `position: relative`?

An overlay mounted inside a scroller as an absolutely positioned child lands on
the scroller's content origin only if the scroller establishes a containing
block, so a library that mounts one has to write `position: relative` onto a
scroller that was `static`. The specification says the write changes the
containing block of the scroller's absolutely positioned descendants and
nothing else about layout: no in-flow box moves, and nothing changes size. A
draw that reads the page before that write and one that reads it after are
therefore reading the same layout except for those descendants — and for a tour
the question is whether that exception is real, how far it reaches, and whether
the engines agree about it.

```bash
open index.html          # including Safari's answer
node run.mjs             # Playwright's Chromium, Firefox and WebKit
node run.mjs chrome      # the real installed Chrome
```

Five children of one static `overflow: auto` panel, itself inside a
`position: relative` stage so that the nearest positioned ancestor is a known
box outside the panel rather than the initial containing block: one in the
flow, one `position: absolute` with an inset, one `position: absolute` with
every inset `auto`, one `position: sticky` and one `position: fixed`. The
stage's padding is fractional, so that a move has low bits to be reported wrong
in; the inset child's own offsets are too, so that the rects the move is
measured from are not on the grid either. The page measures each, scrolls the
panel to see which ride it, gives the panel `position: relative`, and does both
again.

## Seen on

| child | Chromium | Firefox | WebKit | Safari |
| --- | --- | --- | --- | --- |
| in flow | same · rides → rides | same · rides → rides | same · rides → rides | not measured |
| absolute, inset | **moved 43.25, 43.25** · stays → rides | **moved 43.25, 43.25** · stays → rides | **moved 43.25, 43.25** · stays → rides | not measured |
| absolute, every inset auto | same · stays → rides | same · stays → rides | same · stays → rides | not measured |
| sticky | same · stays → stays | same · stays → stays | same · stays → stays | not measured |
| fixed | same · stays → stays | same · stays → stays | same · stays → stays | not measured |

Each cell is whether the child's box moved when the panel was given a position,
and then whether the panel's own scroll carried it before and after the write.
Chromium 151.0.7922.34, Firefox 153.0 and WebKit 605.1.15 (`Version/26.5`), all
Playwright's, through `run.mjs`. macOS 26.5, 2026-09-09. The Safari column has
not been taken: the page draws the same table for itself, so opening it in
Safari fills that column in, and until somebody does it is evidence about
WebKit only.

## What it settled

**The write moves exactly one kind of child, and the three engines agree.** An
absolutely positioned descendant with an inset, whose containing block until
then was outside the scroller, jumps to the same inset measured from the
scroller's padding box — and from then on is carried by the scroller's scroll,
where before it was not clipped or scrolled by the panel at all. Nothing in the
flow moves, nothing sticky moves, nothing fixed moves, and nothing changes size.

The 43.25 is the distance between the two padding-box origins, and nothing
else: the stage's 40.25px of padding plus the panel's used border width, which
all three engines round from the 3.5px asked for to 3px. The panel's own
padding is not in it, because an inset is measured from the containing block's
*padding* box, and neither is the child's own `left` — a move is the difference
between two origins, so the same 43.25 would come out at any inset. The
fraction is the stage's, and it survives into the answer in all three, so a
move is not being reported off a grid the engines rounded it onto.

**An absolutely positioned child with every inset `auto` does not move, but
starts riding the scroll.** Its static position is the same whichever box is
its containing block, so its rect at rest is unchanged; what changes is which
scroll carries it. A tour that cut a hole for it and never looked again would
be right until the panel scrolled.

**So a draw that mounts a layer in a static scroller has to read the page after
it does.** The numbers read before describe a layout that no longer exists by
the time anything is drawn from them, and only the boxes above differ — which
is exactly the case where being wrong would go unnoticed on every page that
does not have one.

## What it does not settle

Which other properties on an ancestor take a descendant's containing block —
transforms, filters, `contain` and the rest — is
[`fixed-under-an-ancestor/`](../fixed-under-an-ancestor/)'s question, and the
answer there is about `position: fixed`. This page writes one property, and it
is the one Leko writes.
