# Which ancestors take `position: fixed` away from the viewport?

A fixed element is positioned against the viewport and takes no part in a
scroll. Unless an ancestor establishes a containing block for it — and then it
behaves as an absolutely positioned child of that ancestor, and scrolls with
the page like anything else. The specification lists the properties that do
this. Whether every engine agrees, and whether anything on the element reports
which it is, is what this page measures.

```bash
open index.html          # including Safari's answer
node run.mjs             # Playwright's Chromium, Firefox and WebKit
node run.mjs chrome      # the real installed Chrome
```

Thirty chips along the top of the window, each a `position: fixed` element
inside a wrapper that sets one property. The page scrolls itself by 200px and
reads where each chip went: one that stayed is still fixed, one that moved by
200px has been carried off by the document. It records `offsetParent` for each
at the same time, because a one-line test on the element would be better than
a list of properties to keep. A second panel asks what happens under a
transformed *scroller*: whether the fixed child rides that scroller's content.

## Seen on

| wrapper | Chromium | Firefox | WebKit | Safari |
| --- | --- | --- | --- | --- |
| `(none)` | fixed · `null` | fixed · `null` | fixed · `null` | fixed · `null` |
| `position: relative` | fixed · `null` | fixed · `null` | fixed · `null` | fixed · `null` |
| `overflow: hidden` | fixed · `null` | fixed · `null` | fixed · `null` | fixed · `null` |
| `isolation: isolate` | fixed · `null` | fixed · `null` | fixed · `null` | fixed · `null` |
| `opacity: 0.99` | fixed · `null` | fixed · `null` | fixed · `null` | fixed · `null` |
| `mix-blend-mode: multiply` | fixed · `null` | fixed · `null` | fixed · `null` | fixed · `null` |
| `clip-path: inset(0)` | fixed · `null` | fixed · `null` | fixed · `null` | fixed · `null` |
| `transform: translateX(0)` | **carried** · `wrap` | **carried** · `wrap` | **carried** · `wrap` | **carried** · `wrap` |
| `translate: 0px` | **carried** · `wrap` | **carried** · `wrap` | **carried** · `wrap` | **carried** · `wrap` |
| `rotate: 0deg` | **carried** · `wrap` | **carried** · `wrap` | **carried** · `wrap` | **carried** · `wrap` |
| `scale: 1` | **carried** · `wrap` | **carried** · `wrap` | **carried** · `wrap` | **carried** · `wrap` |
| `transform-style: preserve-3d` | **carried** · `wrap` | **carried** · `wrap` | **carried** · `wrap` | **carried** · `wrap` |
| `perspective: 500px` | **carried** · `wrap` | **carried** · `wrap` | **carried** · `wrap` | **carried** · `wrap` |
| `filter: brightness(1)` | **carried** · `wrap` | **carried** · `wrap` | **carried** · `wrap` | **carried** · `wrap` |
| `backdrop-filter: blur(0)` | **carried** · `wrap` | **carried** · `wrap` | **carried** · `wrap` | **carried** · `wrap` |
| `will-change: transform` | **carried** · `wrap` | **carried** · `wrap` | **carried** · `wrap` | **carried** · `wrap` |
| `will-change: perspective` | **carried** · `wrap` | **carried** · `wrap` | **carried** · `wrap` | **carried** · `wrap` |
| `will-change: filter` | **carried** · `wrap` | **carried** · `wrap` | **carried** · `wrap` | **carried** · `wrap` |
| `will-change: backdrop-filter` | **carried** · `wrap` | **carried** · `wrap` | **carried** · `wrap` | **carried** · `wrap` |
| `will-change: contain` | **carried** · `wrap` | **carried** · `wrap` | **carried** · `wrap` | **carried** · `wrap` |
| `contain: layout` | **carried** · `wrap` | **carried** · `wrap` | **carried** · `wrap` | **carried** · `wrap` |
| `contain: paint` | **carried** · `wrap` | **carried** · `wrap` | **carried** · `wrap` | **carried** · `wrap` |
| `contain: size` | fixed · `null` | fixed · `null` | fixed · `null` | fixed · `null` |
| `contain: style` | fixed · `null` | fixed · `null` | fixed · `null` | fixed · `null` |
| `contain: strict` | **carried** · `wrap` | **carried** · `wrap` | **carried** · `wrap` | **carried** · `wrap` |
| `contain: content` | **carried** · `wrap` | **carried** · `wrap` | **carried** · `wrap` | **carried** · `wrap` |
| `container-type: inline-size` | fixed · `null` | fixed · `null` | fixed · `null` | fixed · `null` |
| `container-type: size` | fixed · `null` | fixed · `null` | fixed · `null` | fixed · `null` |
| `content-visibility: auto` | **carried** · `wrap` | **carried** · `wrap` | **carried** · `wrap` | **carried** · `wrap` |
| `offset-path: path("M0 0")` | **carried** · `wrap` | **carried** · `wrap` | **carried** · `wrap` | **carried** · `wrap` |
| fixed child under a transformed scroller | rides the scroller · `panel` | rides the scroller · `panel` | rides the scroller · `panel` | rides the scroller · `panel` |

Chromium 151.0.7922.34, Firefox 153.0 and WebKit 605.1.15 (`Version/26.5`),
all Playwright's, through `run.mjs`; Safari 26.5 by hand, from the table the
page draws for itself. macOS 26.5, 2026-09-02. Every row and both columns
agree across all four, and Safari — checked as itself, not as a WebKit build —
answers exactly as Playwright's WebKit does.

## What it settled

**The engines agree with the specification about which ancestors do it, and
with each other about `offsetParent`.** Every transform property, including
the individual `translate`, `rotate` and `scale` and a `transform-style` of
`preserve-3d`; `perspective`; `filter` and `backdrop-filter`; a `will-change`
naming any of those, or `contain`; `contain: layout`, `paint`, `strict` and
`content`; `content-visibility: auto`; and `offset-path`. Not `contain: size`
or `style`, and — worth knowing, because a page in the wild sets it on
everything — **not `container-type`**, in any of the three.

**`offsetParent` tells the two apart with one read, and it is the engines'
answer rather than the specification's.** CSSOM View says `offsetParent` is
`null` for any element whose position is `fixed`. All three engines instead
return `null` only while the viewport holds the element, and name the ancestor
that took it otherwise — which is exactly the question a tour has to ask. Leko
asks it, and cites this page; it would rather read what the engine computed
than keep a list that has to grow with every property that grows this effect.
If an engine ever follows the letter of the specification here, this page
shows it in the last column, and the list above is what to fall back to.

**Under a transformed scroller, a fixed child rides the scroller's content.**
It behaves exactly as an absolutely positioned child of the scroller would, so
a tour has to treat that scroller as carrying it — its own scroll included —
and not only whatever carries the scroller.

## What it does not settle

Sticky. A `position: sticky` element rides the scroll until it pins, which is
a different question with a different shape, and is not on this page.
