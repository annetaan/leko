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
