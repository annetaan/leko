# Can an overlay block one of its own holes?

A hole cut with an even-odd `clip-path` is genuinely absent, and
[`wheel-through-a-hole/`](../wheel-through-a-hole/) is why the blocking has to
be done with plain rectangles in the gaps rather than with the clipped element
itself. This page asks the next question. **Can one of those rectangles sit over
a hole instead of beside it, and take the click?**

It matters because a hole has two jobs and they can come apart. Showing an
element through the scrim is one. Letting the user reach it is the other. A step
that explains what is already on screen wants the first without the second.

```bash
open index.html          # including Safari's answer
node run.mjs             # Playwright's Chromium, Firefox and WebKit
node run.mjs chrome      # the real installed Chrome
```

Three panels, each a button with an overlay over it and a hole cut in the
overlay. They differ only in where the red rectangle lives. It is laid exactly
over the hole in every one, and it asks to be hit.

## Seen on

| | 1. Rectangle inside the overlay | 2. Rectangle beside the overlay | 3. No rectangle |
| --- | --- | --- | --- |
| Chrome 151.0.0.0 | **open** | blocked | open |
| Chromium 151.0.7922.34 (Playwright) | **open** | blocked | open |
| Firefox 153.0 (Playwright) | **open** | blocked | open |
| WebKit 605.1.15 (Playwright) | **open** | blocked | open |

macOS, 2026-08-28. `elementFromPoint` and a real click agree in every cell, which
is not something to assume: the wheel next door is a case where they do not.

Safari has not been checked by hand yet. Every engine here answers the same way
and the mechanism is not one Safari has its own version of, so the row is
expected rather than surprising, and it is still a row somebody should open the
page for.

## What it settled

**A `clip-path` clips its descendants out of hit-testing too.** A rectangle
inside the clipped overlay, laid over the hole and asking to be hit, catches
nothing. The click goes to the button underneath as though the rectangle were
not there.

The same rectangle as a *sibling* of the overlay takes the click.

## Why it matters

Leko blocks the page with rectangles built from the complement of its cutouts,
and those rectangles are children of the scrim. That works while every hole is
meant to be reachable, because a rectangle never lands on a hole in the first
place.

**A hole that is shown and not reachable needs a rectangle on top of it, and
this page says that rectangle cannot be a child of the scrim.** The blocking has
to move to a sibling: same container, same coordinate space, no clip. The scrim
paints and is clipped. Its sibling blocks and is not.

The property that made constraint 1 true by construction survives the move. The
rectangles are still the complement of the holes the step opened, so nothing of
Leko's is ever over a target the step made reachable.

## Revisiting

If an engine starts letting a clipped element's descendants be hit inside its
own holes, column 1 turns green and the blocking could go back inside the scrim.
Nothing would be gained by moving it, so this page is here to settle the
question rather than to wait for it to change.
