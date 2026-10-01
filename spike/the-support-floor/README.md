# Can this browser run Leko?

Leko's floor is the oldest release of each browser that runs it, and a floor
is only as good as the list of what it was measured against. This page is
that list, asked of whichever browser opens it: every browser feature the
shipped code of the tour and of Leko Scroll uses, each answered present or
missing, and two verdicts, one for each product.

```bash
open index.html          # the hole judged by eye, Safari included
node run.mjs             # Playwright's Chromium, Firefox and WebKit
node run.mjs chrome      # the real installed Chrome
node run.mjs webkit      # one engine on its own
```

Each item is marked required or optional by the rule under **What Leko
calls**. The verdicts read `tour: required all present` or
`tour: missing …`, and `scroll:` likewise; a third line names the optional
items present and missing. `mask` is the one item a probe cannot settle.
`CSS.supports` has accepted a mask that cut nothing
([`overlapping-holes/`](../overlapping-holes/)), so a no from it is trusted and
a yes is not. Under `run.mjs` the page reads the hole from a screenshot of
itself, the way
[`a-hole-at-a-fractional-edge/`](../a-hole-at-a-fractional-edge/) does;
opened by hand, the `mask` row says `CSS.supports says yes; judge by
eye`, and a browser that runs Leko shows one bright magenta shape in a dimmed
panel.

The page's own script is written in ES2017, so that a release below the floor
still parses it and says what it lacks.

## What Leko calls

An item is **required** where the shipped code uses it unchecked, so an
engine without it throws, or draws a scrim with no hole or no dimming. It is
**optional** where the code checks for it first (`?.`, `in`, `CSS.supports`,
a `try`), or only listens for it: an engine without it loses the part that
needs it, never the tour.

### Required by both products

- **`mask`**: unprefixed `mask-image`, `mask-position`,
  `mask-repeat: no-repeat` and `mask-composite`, in layers of
  `linear-gradient(black, black)` and then one `data:` SVG image per hole,
  composited `subtract, add, …`. The tour writes them in `Scrim.paint`
  (`packages/spotlight/src/scrim.ts`) from `maskLayers` and `holeImage`
  (`packages/spotlight/src/geometry.ts`); Scroll in `Scrim.paint`
  (`packages/scroll/src/scrim.ts`) from `maskLayers`
  (`packages/scroll/src/mask.ts`). The page copies those strings verbatim,
  for two holes overlapping, which is what `add` is for.
- **`css`**: `translate` (the tour's `Message.dock` in
  `packages/spotlight/src/message.ts`, Scroll's `Message.place` in
  `packages/scroll/src/message.ts`); `inset` (Scroll only, the scrim in the
  `Scrim` constructor, `packages/scroll/src/scrim.ts`); `rgb()` with a slash
  alpha (`Scrim` and `Message` in both, `Close` in the tour,
  `packages/spotlight/src/close.ts`); `min()` with `calc()`, and `var()` with
  a fallback (the max width in both `Message` classes). Each is probed with
  `CSS.supports` and the value the code writes. Without `inset` Scroll's
  scrim has no size, and without the colour syntax nothing is dimmed.
- **`syntax`**: `"target": "ES2023"` in `tsconfig.base.json`, which is every
  construct `tsdown` may leave in the bundle. Each is compiled on its own in a
  `new Function` inside a `try`, never called, so one the engine cannot parse
  reports its own name:
  - ES2015: arrow functions, `class … extends`, `let` and `const`, template
    literals, destructuring, spread in a call and in an array, generators,
    `for…of`.
  - ES2016: `**`.
  - ES2017: `async` and `await`.
  - ES2018: object rest and spread, `for await`, async generators, and RegExp
    named groups, lookbehind and the `s` flag.
  - ES2019: optional catch binding (`presenter.ts` writes it).
  - ES2020: `?.` with `?.()` and `?.[]`, `??`, BigInt literals, dynamic
    `import()`.
  - ES2021: `||=`, `&&=`, `??=` and numeric separators.
  - ES2022: public and static class fields, private fields, private methods,
    private accessors, `static {}` blocks, `#x in`, and the RegExp `d` flag.
  - ES2023 adds no construct to probe: its one piece of syntax is a hashbang,
    valid only at the start of a file, and a bundle carries none.

  Top-level `await` and `import.meta` parse only in a module, so each is an
  inline `<script type="module">` that sets a flag as its first statement. A
  module that does not parse runs nothing, and a flag left unset is missing.

### Required by the tour only

- `toSorted` (`ascending` in `packages/spotlight/src/geometry.ts`) and
  `toReversed` (`staged` in `packages/spotlight/src/glide.ts`).
- `ResizeObserver` (the `watch` field of `Close`,
  `packages/spotlight/src/close.ts`) and `MutationObserver` (`hunt` in
  `packages/presenter/src/presenter.ts`).

### Required by Scroll only

- `Array.prototype.at` (`edgesOf` and `stretchesOf` in
  `packages/scroll/src/geometry.ts`). The tour's `placed.at(...)` in
  `Message.keep` is Leko's own method, not this one.

### Required, baseline

Used unchecked and probed with `typeof` or `in`; needed by both products
unless marked as the tour's.

- `matchMedia`: `prefersReducedMotion` in `packages/spotlight/src/motion.ts`,
  `createScroll` in `packages/scroll/src/scroll.ts`.
- `performance.now`: the tour's `frames` in `glide.ts` and `Scrim.run`;
  Scroll's `Scrim.run`.
- `requestAnimationFrame` and `cancelAnimationFrame`: the same loops.
- `getComputedStyle`: `surface.ts` and `Scrim` in the tour, `Message.place`
  in Scroll.
- `Element.getClientRects`: `hasBox` in `packages/spotlight/src/target.ts`
  and in `packages/scroll/src/page.ts`.
- `Node.isConnected`: `resolveTarget` in `target.ts` and `Message.mount` in
  the tour, `resolve` in `page.ts` in Scroll.
- `Array.prototype.flatMap`: `staged` in `glide.ts` in the tour, `triggers`
  in `packages/scroll/src/geometry.ts` in Scroll.
- `CSS.supports` itself (tour): `canAnchor` in `message.ts` calls it
  unchecked.
- `queueMicrotask` (tour): `Machine.perform` in
  `packages/machine/src/machine.ts`, `FocusRing.onFocusIn` in
  `packages/spotlight/src/focus.ts`.
- `Event.composedPath` (tour): `FocusRing.onFocusIn`.
- `scrollTo` with an options object, on the window and on an element (tour):
  `writeTo` in `glide.ts`. Probed by scrolling a scroller of the page's own
  and reading the offset back.
- `Element.toggleAttribute` (tour): `Scrim.placeHalos` and `Scrim.morph`.
- `Math.hypot` (tour): `play` in `glide.ts`.
- `append`: the `Scrim`, `Message` and `Close` constructors and
  `Message.mount` in the tour; the `Scrim` and `Message` constructors in
  `packages/scroll/src/scrim.ts` and `message.ts`.
- `prepend` (tour): `FocusRing.set` in `focus.ts`.
- `remove`: every teardown, `destroy` in the tour's `Scrim`, `Message`,
  `Close` and `FocusRing.set`; `destroy` in Scroll's `Scrim`.
- `Element.matches` (tour): `ends` in `focus.ts`.
- Iterating a `NodeList` with `for…of`: `resolveTarget` in `target.ts` and
  `ends` in `focus.ts` in the tour, `resolve` in `page.ts` in Scroll.
- `x` and `y` on a `DOMRect` (tour): `screenBox` in `presenter.ts` hands
  `getBoundingClientRect()` on as a `Rect`.
- `document.fonts` (Scroll): `createScroll` waits on `document.fonts.ready`.

Not listed, because every engine that parses the `syntax` above already had
them: `createElement`, `querySelector` and `querySelectorAll`,
`getBoundingClientRect`, `addEventListener`, `setAttribute`,
`style.setProperty`, `focus`, `preventDefault` and
`compareDocumentPosition`. The observers' `observe` and `disconnect` come
with `ResizeObserver` and `MutationObserver`, which are listed.

### Optional

All the tour's; Scroll has none.

- `popover`: `showPopover?.()` and `hidePopover?.()` in `Message` and
  `Close`. Probed with `'showPopover' in HTMLElement.prototype`.
- `anchor`: the three `CSS.supports` checks `canAnchor` makes in
  `message.ts`, probed with the same three strings. Without them the message
  docks.
- `navigation`: `'navigation' in window` in `presenter.ts`.
- `checkVisibility`: checked for in `shows` (`target.ts`) and `reachable`
  (`focus.ts`).
- `sessionStorage`: inside a `try` in `keep`, `take` and `forget` in
  `presenter.ts`. Probed by writing and removing a key.
- `pagehide`, `pageshow`, `popstate` and `hashchange`: only listened for, in
  `presenter.ts`. Probed with `'on<type>' in window`.

## Seen on

| item | needed by | Chromium | Firefox | WebKit | Chrome | Safari |
| --- | --- | --- | --- | --- | --- | --- |
| `mask` | both | cuts | cuts | cuts | cuts | by eye: cuts |
| `css` | both | present | present | present | present | present |
| `syntax` | both | present | present | present | present | present |
| `toSorted` | tour | present | present | present | present | present |
| `toReversed` | tour | present | present | present | present | present |
| `Array.prototype.at` | scroll | present | present | present | present | present |
| `ResizeObserver` | tour | present | present | present | present | present |
| `MutationObserver` | tour | present | present | present | present | present |
| `matchMedia` | both | present | present | present | present | present |
| `performance.now` | both | present | present | present | present | present |
| `requestAnimationFrame` | both | present | present | present | present | present |
| `cancelAnimationFrame` | both | present | present | present | present | present |
| `getComputedStyle` | both | present | present | present | present | present |
| `getClientRects` | both | present | present | present | present | present |
| `CSS.supports` | tour | present | present | present | present | present |
| `queueMicrotask` | tour | present | present | present | present | present |
| `composedPath` | tour | present | present | present | present | present |
| `scrollTo with options` | tour | present | present | present | present | present |
| `toggleAttribute` | tour | present | present | present | present | present |
| `isConnected` | both | present | present | present | present | present |
| `flatMap` | both | present | present | present | present | present |
| `Math.hypot` | tour | present | present | present | present | present |
| `append` | both | present | present | present | present | present |
| `prepend` | tour | present | present | present | present | present |
| `remove` | both | present | present | present | present | present |
| `matches` | tour | present | present | present | present | present |
| `NodeList iteration` | both | present | present | present | present | present |
| `DOMRect x and y` | tour | present | present | present | present | present |
| `document.fonts` | scroll | present | present | present | present | present |
| `popover` | tour | present | present | present | present | present |
| `anchor` | tour | present | present | present | present | present |
| `navigation` | tour | present | present | present | present | present |
| `checkVisibility` | tour | present | present | present | present | present |
| `sessionStorage` | tour | present | present | present | present | present |
| `pagehide` | tour | present | present | present | present | present |
| `pageshow` | tour | present | present | present | present | present |
| `popstate` | tour | present | present | present | present | present |
| `hashchange` | tour | present | present | present | present | present |

All four print `tour: required all present` and `scroll: required all
present`, with `mask` read from the pixels. Chromium 151.0.7922.34, Firefox
153.0, WebKit 605.1.15 (`Version/26.5`) and Chrome 154.0.8037.92, through
Playwright 1.62.1 at a viewport of 1280×800 and a `deviceScaleFactor` of 1, on
2026-10-01. Playwright's WebKit stands in for no Safari version.

**Safari 26.5 (21624.2.5.11.4)** on macOS 26.5, opened by hand on 2026-10-01,
showed `tour: required all present` and `scroll: required all present` with
every optional item present, and the hole was judged by eye: one bright
rounded shape in the dimmed ground, the two holes cut as a union.

## Measuring a floor

1. Download Chrome for Testing from
   `https://googlechromelabs.github.io/chrome-for-testing/known-good-versions-with-downloads.json`,
   which lists majors 113 and up for `mac-arm64`.
2. Download Firefox from
   `https://archive.mozilla.org/pub/firefox/releases/<version>/`.
3. Open `index.html` by hand in the candidate floor and in the major below it.
   Playwright 1.62 does not launch these builds: Chrome for Testing 119 died
   with `SIGTRAP`.
4. A floor is measured when the floor gives `required all present` for the
   product in question, with the hole judged by eye, and the release below
   names a missing item.
5. Run one sandbox case end to end under `pnpm dev` at each floor.
6. Measure Safari only in the version macOS ships. A table gives that version
   and says "lower not measured" below it; Playwright's WebKit stands in for
   no Safari version.

## What it does not answer

- **What the floor is.** It asks one browser at a time; a floor is what
  **Measuring a floor** makes of two of them.
- **Whether `checkVisibility` accepts its options.** Only that the method
  exists can be probed. The code passes `visibilityProperty` and
  `opacityProperty`, which an engine whose method predates them ignores.
- **ES2023's hashbang.** It is valid only at the start of a file, so no
  probe can ask for it, and a bundle carries none.
- **Edge.** It was not opened.
- **Whether Leko behaves correctly.** A feature that is present can still
  misbehave, which is why **Measuring a floor** runs a sandbox case at each
  floor.
