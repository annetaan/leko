# Which of two popovers paints on top?

Leko's message and its way out are both `popover` elements, so both paint in
the top layer. Outside the top layer `z-index` decides which of two
overlapping boxes is on top, and the way out's `--leko-close-z` sits one above
the message's `--leko-message-z` for that reason. **The question is what
decides it inside the top layer**, and whether `z-index`, the order in the
document, or a box shown while it is invisible has any say.

```bash
open index.html          # including Safari's answer
node run.mjs             # Playwright's Chromium, Firefox and WebKit
node run.mjs chrome      # the real installed Chrome
```

Four pairs of overlapping popovers, A and B. In every pair one is shown after
the other, and each pair adds one thing that might overrule that: a `z-index`
in the other square's favour, the other square later in the document, the
square shown last having been shown first while `visibility: hidden`, and a
square hidden and shown again. The page reads which square a point in the
overlap lands on and draws the table itself.

## Seen on

| | Verdict |
| --- | --- |
| Chrome 153.0.0.0 | show order, all four |
| Safari (by hand) | not yet opened |
| Chromium 151.0.7922.34 (Playwright) | show order, all four |
| Firefox 153.0 (Playwright) | show order, all four |
| WebKit 605.1.15 (Playwright) | show order, all four |

macOS, 2026-09-28, through `run.mjs`. Nobody has opened the page in Safari yet,
and `run.mjs` cannot reach it.

## What it settled

**In the top layer the popover shown last paints on top, and nothing else has a
say.** A `z-index` does nothing, and nor does the order in the document. A box
shown while `visibility: hidden` takes its place when it is shown, not when it
becomes visible, so it stays under anything shown after it. Hiding a popover and
showing it again moves it to the top.

## Why it matters

The way out has to paint above the message wherever the two meet, and the
message is anchored to its target and carried by every scroll, so they can meet
in any corner. `z-index` cannot put the way out on top. Only the order they are
shown in can, so the message goes into the top layer, still hidden, before the
way out does, and is made visible later without moving. DESIGN.md argues it
under **The way out**.

The fourth row is why nothing may hide the message's popover and show it again
mid-tour: the message would come back above the way out.

## Revisiting

If an engine starts honouring `z-index` in the top layer, the way out stays on
top only while `--leko-close-z` is above `--leko-message-z`, as the defaults
are, and a host that changes either can put it underneath. If an engine
starts ordering a box by when it became visible, the way out would slip under
the message wherever the two meet. This page is the check.
