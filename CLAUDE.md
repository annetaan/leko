# CLAUDE.md

Leko is a product-tour library that highlights an element by cutting a hole in an
overlay, so the user can interact with the real element underneath.

**Read [DESIGN.md](DESIGN.md) before changing anything under
`packages/core/src/`.** It states the two constraints the library exists for and
argues every rule about the scrim next to the browser behaviour that forced it,
citing the page under [`spike/`](spike/) that settled each one. Read the cited
page before overruling a rule; do not restate a rule here that belongs there.

[CONTRIBUTING.md](CONTRIBUTING.md) has the setup, the commands and what CI runs.

## The two constraints

Everything else is negotiable; these are not. Both are explained in DESIGN.md.

1. **Never place an element over the target** — not even a transparent one.
2. **Steps advance on application state, never on DOM events.** Never add a
   click or input listener that advances a step.

## What looks like an improvement and is not

Each of these has been tried, and the page that settled it is cited in
DESIGN.md. Do not do any of them without reading that page first.

- **Blocking with the clipped scrim instead of the `.leko-block` rectangles.**
  One element is tidier and breaks scrolling under the pointer, and no
  hit-testing assertion can catch it.
- **Moving the morph onto `element.animate()`.** It composites, and Chrome then
  rasterises the clip path at the wrong scale on a 2x display.
- **Dropping a subpath when a step needs fewer cutouts.** The paths stop
  interpolating; collapse the departing cutout to zero area instead.
- **Reading layout while the user scrolls.** Scroll tracking runs no JS at all
  and must stay that way. A bounded morph writing precomputed strings is not
  the same thing and is fine.
- **Adding a runtime dependency to `packages/core`.** It has none, deliberately.

## Writing code here

Functional core, thin imperative shell — DESIGN.md says why. Geometry goes in
`geometry.ts` as pure functions with tests of their own; DOM work stays in
`scrim.ts`, `message.ts` and `leko.ts` and stays small.

New behaviour that a user would notice wants a case in
`examples/sandbox/src/cases/`, stating what it proves. A new claim about what a
browser does wants a page in `spike/`.

## Working in this repository

- Commits use the GitHub noreply address, set locally. Do not change
  `git config --global`.
- Markdown is out of the formatter's reach, and so are the pages under
  `spike/`: `waapi-clip-path/index.html` is attached to
  [crbug.com/542859657](https://issues.chromium.org/issues/542859657) as it
  stands, and a formatter should not be rewriting evidence.
- Package name is `@annetaan/leko`; the project is called Leko. The scope exists
  only because npm rejects the unscoped name, and is not part of the brand.
- License is MIT. Keep it that way.

## Status

Pre-release. Nothing is published beyond a `0.0.0` placeholder, so the API can
change freely.
