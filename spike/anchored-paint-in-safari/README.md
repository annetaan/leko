# Does a browser paint a box it anchored inside a scroller?

Leko keeps a step's message beside its target with CSS anchor positioning. What
the message anchors to is a marker of Leko's own, 0x0, sitting on the edge of
the cutout. The scrim lives inside whatever scrolls, so the marker lives there
too. This page asks whether a browser that lays such a box out correctly also
draws it.

```bash
open index.html
```

Eight boxes. Every one of them is anchored to a zero-area marker and painted
white with a red border. The rows differ in where the marker lives. The columns
differ in how the box is drawn: `absolute` against `fixed`, `position-area`
against `anchor()` insets, the top layer against a plain `z-index`. Two
checkboxes change one variable each.

No script can ask whether something was painted. `getBoundingClientRect`,
`checkVisibility` and `elementFromPoint` all answer happily for a box that never
reached the screen. So the page reports the rect it measured, and you count the
boxes you can see.

## Seen on

| | marker in normal flow | marker inside a scroller |
| --- | --- | --- |
| Chrome 151 | painted | painted |
| Playwright WebKit 26.5 | painted | painted |
| Safari 26.3.1 | painted | **laid out, not painted** |

macOS 26.3.1, 2026-08-28. All four columns behave the same inside a row, so
neither the top layer nor `position-area` is what decides it. Either checkbox
brings Safari's bottom row back on its own.

## What it settled

**Safari 26.3.1 takes an anchor-positioned box away when its anchor has no area
and sits inside something that scrolls.** Both halves are needed. A 0x0 marker
in normal flow paints fine, and an 8x8 marker inside a scroller paints fine. Put
the two together and the box lays out where it should, `getBoundingClientRect`
reports the right rect, `visibility` computes to `visible` and `opacity` to `1`,
and nothing appears.

That reads like a visibility check done by intersecting the anchor's rect with
the clip of the scroller around it. An empty rect intersects nothing, so the
anchor is judged invisible and the box goes. Which is the behaviour
`position-visibility: anchors-visible` asks for. The initial value is `always`,
and writing it out brings the box back on Safari while changing nothing on
Chrome 151 or Playwright's WebKit.

## Why it matters

Leko's scrim has to live inside the thing that scrolls. That is what makes
scroll tracking free: the container carries the scrim and the target together,
and no position math runs per frame. The marker goes in the same place for the
same reason.

So Leko is always in the right-hand column above. Any tour pointing into a list
or a side panel loses its message on Safari, and loses it in silence. The step
still runs and the hole is still cut. Nobody is told what to do.

`Message.place` in `packages/spotlight/src/message.ts` writes
`position-visibility: always`, and the marker in `Scrim.anchorAt` stays 0x0. The
other way out of the table is to give the marker area, and Leko cannot take it.
The marker sits on the edge of the cutout, so area means a Leko element over a
hole the step opened, which is the first of the three constraints.

No test holds any of this down. Playwright's WebKit paints the box either way,
and that is the only WebKit CI has.

## Revisiting

If Safari starts reading `position-visibility` the way the spec does, the
declaration becomes a restatement of the initial value and costs nothing. Leave
it in. The line to watch is the third row of the table above. Open this page in
whatever Safari is current, untick both boxes, and count.
