# Does an anchor name cross a shadow boundary?

CSS anchor positioning is what keeps a tour's message beside its target through
every scroll without a line of JavaScript running: an `anchor-name` on the
target, `position-anchor` on the message. **It stops working the moment the
target is inside a shadow root**, and it stops working silently.

```bash
open index.html
```

Two stages, side by side, differing in one thing: which tree the target lives
in. Both get the same `anchor-name` written onto them the same way, and both
have a box asking for the same name. The page measures where each box actually
landed rather than reading style back, because an unresolved anchor is not an
error — the box lays out as though the properties were not there.

## Seen on

| | same tree | target inside a shadow root |
| --- | --- | --- |
| Chrome 151 | anchored | **not anchored** |

macOS, 2026-08-27. Firefox and Safari have no anchor positioning to test yet, so
they take the docked path in Leko regardless and have nothing to say here.

## What it settled

**An `anchor-name` is scoped to the tree the element is in.** A message in the
document cannot name an element inside a shadow root, and there is no way to
reach across: the name is not a global. Nothing reports it either — no error, no
warning, no fallback the author chose. The box is simply positioned as though it
had no anchor, which means wherever its containing block leaves it.

Where that lands is the part that matters. In this page's stage it lands **on
top of the target**, because the stage centres its children.

## Why it matters

Leko exists to never put anything over the element it is pointing at — that is
the first of its two constraints, and it is what makes the highlighted control
usable rather than a picture of a control. A message that silently loses its
anchor and settles over the target breaks exactly that, on exactly the pages
most likely to have a component worth pointing at.

So `message.ts` asks `getRootNode()` before it anchors anything, and where the
answer is not its own root it takes the same docked path a browser without
anchor positioning takes. Docking is a downgrade — the message stops sitting
beside the thing it describes — but it is a downgrade that stays out of the way,
and being plain is not the same as being wrong.

## Revisiting

If a future spec gives an anchor name a way out of its tree — an exported name,
a part-like mechanism, anything — the right side of the table turns green and
the `sameTree` check in `message.ts` can go. This page is the check.
