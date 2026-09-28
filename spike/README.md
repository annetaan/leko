# Spikes

Standalone pages that answer one question about browser behaviour each. **No
build step, no dependencies, no Leko** — open the file and read the answer.

They are kept because the answers are load-bearing. Several rules in
[`DESIGN.md`](../DESIGN.md) exist only because a browser turned out not to do
what the specification suggests it might, and a rule like that is unarguable
until you can watch it fail. Each rule there cites the page that settled it, and
these are those pages: if you are about to change how the scrim is built, they
tell you what you are allowed to assume.

| | Question |
| --- | --- |
| [`cutout-techniques/`](cutout-techniques/) | Which of the ways to cut a hole in an overlay actually work, and can the geometry come from CSS alone? |
| [`waapi-clip-path/`](waapi-clip-path/) | Does a `clip-path` animation render correctly when it runs on the compositor? |
| [`wheel-through-a-hole/`](wheel-through-a-hole/) | Does a wheel reach the element under a hole, the way a click does? |
| [`anchor-across-shadow/`](anchor-across-shadow/) | Can a message anchor itself to a target inside a shadow root? |
| [`blocking-a-hole/`](blocking-a-hole/) | Can an overlay block one of its own holes, or does the clip take the blocker with it? |
| [`tab-order-in-the-top-layer/`](tab-order-in-the-top-layer/) | Does painting a popover over everything move it in the tab order too? |
| [`paint-order-in-the-top-layer/`](paint-order-in-the-top-layer/) | Which of two popovers paints on top, and does `z-index` or DOM order have any say? |
| [`anchored-paint-in-safari/`](anchored-paint-in-safari/) | Does a browser paint a box it anchored inside a scroller? |
| [`halo-outside-the-hole/`](halo-outside-the-hole/) | Do an outline and an outer shadow stay out of the box they decorate? |
| [`overlapping-holes/`](overlapping-holes/) | Can an overlay cut two holes that overlap, and what does each way of doing it cost? |
| [`fixed-under-an-ancestor/`](fixed-under-an-ancestor/) | Which ancestors take a `position: fixed` element away from the viewport, and does the element say so? |
| [`the-scrollbar-gutter/`](the-scrollbar-gutter/) | Can a fixed scrim cover the document scrollbar's gutter, and what notices the scrollbar coming and going? |
| [`a-smooth-scroll-settling/`](a-smooth-scroll-settling/) | How long does a smooth scroll take, what says when it is over, does a panel below the fold scroll at all, and can a glide be stopped or replaced part-way? |
| [`a-static-scroller-made-relative/`](a-static-scroller-made-relative/) | What moves when a static scroller is given `position: relative`, and does it then ride the scroller's scroll? |
| [`a-sticky-target-pinning/`](a-sticky-target-pinning/) | When is a `position: sticky` element pinned, does it say so, and can a layer be glued to a scroller's scrollport? |
| [`a-same-document-navigation/`](a-same-document-navigation/) | What says a same-document URL changed, does it come before or after `location` has moved, and does it land inside the call that triggered it or later? |
| [`a-cross-document-navigation/`](a-cross-document-navigation/) | What can a document being left still say — does `pagehide` fire before the next document's script runs, does a `sessionStorage` write made there survive to be read, and does the same-document mechanism ever fire for a navigation that leaves the document? |
| [`a-hole-at-a-fractional-edge/`](a-hole-at-a-fractional-edge/) | Do a mask hole and a box laid on it meet at a fractional edge, and on what rectangle do they? |
| [`a-render-before-the-frame/`](a-render-before-the-frame/) | Does a render beat the next frame? |

## Reading them

Every page judges itself where it can, and says plainly when a call has to be
made by eye. Two things are worth knowing before you trust an answer:

- **Some of these cannot be measured automatically.** A screenshot taken over
  the DevTools protocol forces a repaint on the main thread, which hides
  anything that only goes wrong on the compositor. `waapi-clip-path` is exactly
  that case: it looks fine to every tool and wrong to a person.
- **Playwright's WebKit is not Safari.** Its user agent carries a `Version/`
  token anyway, and that token is not a Safari release anyone can install, so it
  is evidence about WebKit and nothing more. Where a page says *Safari*,
  somebody opened it in Safari.

## Adding one

A spike is worth keeping when its answer would otherwise have to be taken on
trust. Keep it dependency-free and readable from top to bottom in one sitting —
somebody will read it years from now to find out whether a browser has since
been fixed.
