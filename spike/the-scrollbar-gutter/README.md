# Can a fixed scrim cover the document scrollbar's gutter?

A `position: fixed` element stops at the layout viewport — `clientWidth` on the
root, the scrollbar excluded — so a viewport-sized scrim is measured against
that box. It is right at the moment it is measured and wrong as soon as the
scrollbar comes or goes: a page that shortens under a tour loses its scrollbar,
`clientWidth` grows by its width, and the scrim does not, leaving a strip of the
application uncovered and, worse, unblocked. `window.innerWidth` covers the
gutter and does not move when the scrollbar does. What that costs is what this
page measures.

```bash
open index.html          # including Safari's answer, and the paint question
node run.mjs             # Playwright's Chromium, Firefox and WebKit
node run.mjs --headed    # windows on screen, which is where a gutter is
node run.mjs chrome      # the real installed Chrome
```

Three questions, and the first two are what decide whether the number can
change:

1. **Does a fixed box wider than the layout viewport add scrollable overflow?**
   If it does, a scrim covering the gutter puts a scrollbar on every page a tour
   runs on, which is worse than the gutter it fixes. Asked at four widths rather
   than only at `innerWidth`: where the scrollbars are overlay, `innerWidth`
   *is* `clientWidth` and that pass proves nothing, while a box 40px or 400px
   past the layout viewport is the same question with the platform taken out of
   it.
2. **Does the document scrollbar still paint over such a box?** If page content
   can paint over the scrollbar, a scrim covering the gutter dims the scrollbar,
   and the fix is a visible regression rather than an invisible one.
3. **What notices the scrollbar coming and going?** A `resize` event is the only
   thing the presenter arms today, and a scrollbar leaving is not a window
   resize. A `ResizeObserver` on `documentElement` fires when its content box
   changes, which is the alternative the issue asks to be measured rather than
   assumed.

**A gutter is not free to come by.** A headless browser has no scrollbar at all,
in any engine, so `run.mjs` on its own answers questions 1 and 3 with a `0px`
gutter and cannot reproduce the bug. `--headed` can, where the operating system
draws classic scrollbars — on macOS, System Settings → Appearance → *Show scroll
bars: Always*. The tables below were taken that way.

## Seen on

Classic scrollbars, `--headed` for the three Playwright drives and by hand for
Safari. WebKit is in the same run as the other two and drew no gutter even so,
which is a fact about Playwright's WebKit rather than an answer; Safari, asked
as itself, has one.

**Question 1 — a fixed box past the layout viewport adds no overflow, and is not
clipped:**

| fixed box | Chromium (gutter 15px) | Firefox (gutter 15px) | WebKit (gutter 0px) | Safari (gutter 17px) |
| --- | --- | --- | --- | --- |
| `clientWidth`, what is drawn today | no overflow · reaches 1265 | no overflow · reaches 1265 | no overflow · reaches 1280 | no overflow · not clipped |
| `innerWidth`, the gutter covered | no overflow · reaches 1280 | no overflow · reaches 1280 | no overflow · reaches 1280 | no overflow · not clipped |
| `clientWidth + 40` | no overflow · reaches 1305 | no overflow · reaches 1305 | no overflow · reaches 1320 | no overflow · not clipped |
| `clientWidth + 400` | no overflow · reaches 1665 | no overflow · reaches 1665 | no overflow · reaches 1680 | no overflow · not clipped |

The page's own `scrollWidth` stays at 1265 through every one of those rows —
including the 1665px box, 400px past the layout viewport. Safari's column is
read off the page's own verdicts rather than transcribed pixel by pixel: every
row of it came back green, at a viewport 1165 wide with a 17px gutter in it.

**Question 3 — the page grows and shrinks, the gutter comes and goes with it,
`resize` hears nothing and the observer hears all of it:**

| transition | Chromium (gutter 15px) | Firefox (gutter 15px) | WebKit (gutter 0px) | Safari (gutter 17px) |
| --- | --- | --- | --- | --- |
| tall → short | clientWidth 1265 → 1280 · 0 resize · 1 observed | 1265 → 1280 · 0 · 1 | 1280 → 1280 · 0 · 1 | 1148 → 1165 · 0 · 1 |
| short → tall | clientWidth 1280 → 1265 · 0 resize · 1 observed | 1280 → 1265 · 0 · 1 | 1280 → 1280 · 0 · 1 | 1165 → 1148 · 0 · 1 |
| tall → short again | clientWidth 1265 → 1280 · 0 resize · 1 observed | 1265 → 1280 · 0 · 1 | 1280 → 1280 · 0 · 1 | 1148 → 1165 · 0 · 1 |

**Question 2 — who paints last:**

| | verdict |
| --- | --- |
| Chromium | **the scrollbar paints over it.** A red fixed box straddling the boundary is drawn up to `clientWidth` and stops dead there; the gutter shows the scrollbar track. |
| Safari | **the scrollbar paints over it.** The scrollbar is drawn the whole time and no red reaches the screen at all. |
| Firefox | not answered — see below |
| WebKit | not answerable: no gutter, even headed and set to *Always* |

Chromium 151.0.7922.34, Firefox 153.0 and WebKit 605.1.15 (`Version/26.5`), all
Playwright's, through `node run.mjs --headed`; Safari 26.5 by hand, from the
tables the page draws for itself. macOS 26.5 with *Show scroll bars: Always*,
2026-09-02.

## What it settled

**A fixed box wider and taller than the layout viewport adds no scrollable
overflow.** `scrollWidth` and `scrollHeight` do not move by a pixel — not at
`innerWidth` with a real 15px gutter under it, not at 40px over, not at 400px
over — and a page that did not scroll sideways still does not. The
specification's intent, that a fixed-position box is left out of the document's
scrollable overflow region, is what all three do. So a scrim sized to cover the
gutter cannot grow a scrollbar out of the page it is dimming, which was the
expensive way for this to go wrong.

**A fixed box is not clipped to the layout viewport in layout either.** It
reaches the width it was given, gutter included, in all three. Nothing has to be
done to make it cover the gutter beyond asking for the width.

**The scrollbar paints over content in the gutter, in Chromium and in Safari.**
In Chromium a red fixed box placed to straddle `clientWidth` paints up to that
edge and no further: the gutter column shows the scrollbar, not the box. The
control for that reading is the same shot with no box on the page, which shows
the scrollbar track in the same pixels — so the screenshot does carry the
scrollbar, and the box losing there is the engine's answer rather than the
capture's. In Safari the same page was looked at by a person, with a 17px
gutter to draw into: the scrollbar is drawn the whole time and no red reaches
the screen. A scrim covering the gutter is therefore invisible in both, which
is the pair that matters most on a platform with classic scrollbars at all.

**A `resize` event is blind to the gutter coming and going, and a
`ResizeObserver` on `documentElement` is not.** Three transitions of a page
growing and shrinking past the height of the window, each moving `clientWidth`
by the gutter's 15px: zero `resize` events every time, one observer callback
every time, in both engines that had a gutter. So if the layer has to *notice*
the gutter rather than pick a number that cannot be caught out, the observer is
what notices, and it costs one callback per layout change of the root.

## What it did not settle

**Firefox's answer to question 2.** Firefox's screenshot does not carry the
scrollbar at all — the control shot shows white where the track should be — so
the red reaching the edge in Firefox is evidence about the screenshot and
nothing more. It wants somebody to open `index.html` in Firefox and look at the
right-hand edge of the window, the way Safari's row was filled in. Playwright's
WebKit draws no gutter even headed on a machine set to *Always*, so there is
nothing to look at there; Safari answers that engine's half of the question as
itself.

**Whether the observer is worth it.** This page says a `ResizeObserver` catches
what `resize` misses. It does not say what `replace()` costs when it fires, and
that is a measurement against Leko rather than against a browser.
