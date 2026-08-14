# `clip-path` on the compositor

The same `clip-path` animation, the same geometry and the same duration, driven
two ways side by side: `element.animate()` and a `requestAnimationFrame` loop
writing the path itself.

```bash
open index.html
```

Press **Run** and watch **while it is running**, not after it stops.

- **Fine**: both stages stay covered the whole way through.
- **Broken**: the `element.animate()` stage covers about a quarter of what it
  should for the length of the animation, then snaps to the right shape when it
  ends.

## Seen on

| | `element.animate()` stage | `requestAnimationFrame` stage |
| --- | --- | --- |
| Chrome 151.0.7922.76 | **broken** | fine |
| Safari 26.3.1 | fine | fine |

macOS 26.3.1, built-in Retina display, `devicePixelRatio` 2. Checked 2026-08-12,
by eye and while the animation was running — which is the only way, for the
reason below.

**Still broken in Chrome 151**, and Safari drives the same animation through the
same API on the same machine and renders it correctly. So this is Chrome's
compositor rather than anything the Web Animations API promises, and the frame
loop stays until Chrome fixes it. Firefox has not been checked here.

## What it settled

**Only the `element.animate()` side breaks**, and only on a 2x display. Each
side of the covered area is exactly half what it should be, which is the
signature of a device pixel ratio being dropped somewhere.

Handing `clip-path` to the Web Animations API puts the animation on the
compositor, and Chrome rasterises a composited clip path at the wrong scale.
Pausing such an animation fixes it instantly, which is what identified the
compositor as the culprit: pausing returns the work to the main thread.
`will-change: clip-path` does not help, so there is no declarative way around
it.

On this page **only the first animation of a given element breaks** and later
ones are steady. Inside a real tour it broke every time. The difference has not
been chased, because it changes nothing: the first animation of an element is
the one that matters, and it is on the broken side.

## Why this is a standalone page

The conclusion costs something — a `requestAnimationFrame` loop that writes a
string every frame, kept forever, in a library that otherwise runs no JS while
the user scrolls. A cost like that should not rest on one look at a complicated
app. There is no state machine and no scroll handling here, so if it breaks, the
thing that broke is the `clip-path` animation.

## It cannot be measured automatically

**A screenshot over the DevTools protocol repaints on the main thread**, which
is precisely where the bug is not. Screenshots at 60ms intervals show nothing at
all. Taking the measurement destroys the thing being measured, so "sample it
densely enough and it will show up" does not apply here.

A person looking at the screen was the only instrument that worked.

## Revisiting

This page is small enough and free-standing enough to attach to a browser bug
report as-is, and it was:
[crbug.com/542859657](https://issues.chromium.org/issues/542859657).

If that is fixed, the declarative route becomes available again and the frame
loop in `packages/core/src/scrim.ts` can go. Run this page first to check, on a
2x display, and record what you saw it on above.
