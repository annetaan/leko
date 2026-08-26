# CLAUDE.md

Leko is a product-tour library that highlights an element by cutting a hole in an
overlay, so the user can interact with the real element underneath.

**Read [DESIGN.md](DESIGN.md) before changing anything under `packages/leko/`,
`packages/machine/` or `packages/spotlight/`.** It states the two constraints the library exists for and
argues every rule about the scrim next to the browser behaviour that forced it,
citing the page under [`spike/`](spike/) that settled each one. Read the cited
page before overruling a rule; do not restate a rule here that belongs there.

[CONTRIBUTING.md](CONTRIBUTING.md) has the setup, the commands and what CI runs.

## The two constraints

Everything else is negotiable; these are not. Both are explained in DESIGN.md.

1. **Never place an element over the target** — not even a transparent one.
   Only one story is ever visible, and this is why.
2. **Steps advance on application state, never on DOM events.** A call site
   names what happened (`leko.reached('order-saved')`) and a step names what it
   waits for (`awaits`). Never add a click or input listener that advances a
   step.

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
- **Adding a third-party runtime dependency to `packages/leko`.** It has none,
  deliberately. `@annetaan/leko-machine` and `@annetaan/leko-spotlight` are
  first-party and are fine.
- **Tightening `reached()` the way `awaits` is tightened.** The asymmetry is the
  design: the vocabulary is gathered from those calls, and a `reached()` call
  has to stay compilable in builds where no tour runs. DESIGN.md argues it.
- **Showing the next control on every step.** A step that declares `awaits` must
  never have one. The control would be a way past the work that step exists to
  make someone do, so which steps have one is derived from `awaits` and is not
  configurable. DESIGN.md argues it.
- **Doing something helpful with a signal nobody is waiting for** — warning
  about it, saving it up for a step that awaits it later, or letting a story
  that is not running follow along. Each defeats the second constraint in a
  different way, and DESIGN.md argues all three.
- **Letting one call through while an arrival is in flight.** Leko acts on
  nothing while it is inside a call into the application, and `stop()` is the
  only exception. That rule is what pays for a state core of six fields with no
  run counter in it, and every exception puts a "did the world move" check back
  into a callback. DESIGN.md argues it.
- **Adding a back control, or a way to start a story part-way through.** A step
  that declares `awaits` cannot be returned to: the signal fired once and will
  not fire again, so the tour waits for ever. A story is atomic, and the answer
  to a tour somebody wants to redo is a shorter story. DESIGN.md argues it.

## Writing code here

Functional core, thin imperative shell — DESIGN.md says why. Geometry goes in
`packages/spotlight/src/geometry.ts` as pure functions with tests of their own;
DOM work stays in `scrim.ts`, `message.ts` and `leko.ts` and stays small.

`packages/machine` decides which step the tour is on and takes no `lib.dom`, so
a `document` in it is a compile error. It is the same split again inside:
three files and no more. `types.ts` is what a host brings and what a presenter
owes, `plan.ts` is the state and what an event does to it, and `machine.ts` is
the class that makes the calls. `plan.ts` is pure. A decision that lands in
`machine.ts` is in the wrong file, and a move belongs in the `plan.ts` case that
decided it, written out rather than given a name of its own.

The three types a host brings are one parameter, `W extends World`. A signature
names one type, never three.

`packages/spotlight` draws and knows nothing about steps. `packages/leko` wires
the two together, owns the public types, and is the only package that publishes.
What each half may ask of the other is `Presenter` and `Host` in
`packages/machine/src/types.ts`, and DESIGN.md argues the two rules that seam
exists to keep.

New behaviour that a user would notice wants a case in
`examples/sandbox/src/cases/`, stating what it proves. A new claim about what a
browser does wants a page in `spike/`.

`packages/codegen` is the same split: `scan.ts` and `emit.ts` are functions a
test drives, and `generate.ts` is the part that touches tsconfig and disk. It
runs in Node as its own Vitest project. Behaviour of the public types wants a
program under `packages/leko/type-tests/`, one per vocabulary state, because an
augmentation applies to a whole compilation.

## Working in this repository

- Commits use the GitHub noreply address, set locally. Do not change
  `git config --global`.
- `packages/leko` is built by `tsdown`, not `tsc`, because it bundles
  `@annetaan/leko-machine` and `@annetaan/leko-spotlight` in. Both are private
  and neither is on the registry, so an import of either left in `dist/` is a
  package a consumer cannot install. `pnpm check:pack` is what catches that, and
  it runs in CI. Anything that changes what a package imports wants it run.
- Markdown is out of the formatter's reach, and so are the pages under
  `spike/`: `waapi-clip-path/index.html` is attached to
  [crbug.com/542859657](https://issues.chromium.org/issues/542859657) as it
  stands, and a formatter should not be rewriting evidence.
- **No line numbers in prose.** Point into a file by naming the symbol or the
  heading, never `machine.ts:147`. Nothing checks a line number and nothing
  updates one, so it goes stale the first time somebody edits above it and then
  sends a reader somewhere wrong while looking precise. `leko-signals.d.ts` is
  the exception, because the generator rewrites it every build.
- Package names are `@annetaan/leko` and `@annetaan/leko-codegen`; the project is
  called Leko. The scope exists only because npm rejects the unscoped name, and
  is not part of the brand.
- License is MIT. Keep it that way.
- Everything here is written in English. `README.ja.md` is the one exception,
  and it translates the opening of `README.md` and stops there. English is where
  fixes land. A full translation would go out of date without anyone noticing,
  and a translation that is out of date misleads, so the Japanese covers only
  the part a reader uses to decide whether to keep going. Do not delete it, do
  not extend it, and do not add Japanese anywhere else.

## Status

Pre-release. Nothing is published beyond a `0.0.0` placeholder, so the API can
change freely.
