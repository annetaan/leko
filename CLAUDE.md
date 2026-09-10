# CLAUDE.md

Leko is a product-tour library that highlights an element by cutting a hole in an
overlay, so the user can interact with the real element underneath.

**Read [DESIGN.md](DESIGN.md) before changing anything under `packages/leko/`,
`packages/types/`, `packages/presenter/`, `packages/machine/` or
`packages/spotlight/`.** It states the three constraints
the library exists for and argues every rule about the scrim next to the browser
behaviour that forced it, citing the page under [`spike/`](spike/) that settled
each one. Read the cited
page before overruling a rule; do not restate a rule here that belongs there.

[CONTRIBUTING.md](CONTRIBUTING.md) has the setup, the commands and what CI runs.

## The three constraints

Everything else is negotiable; these are not. All three are explained in
DESIGN.md.

1. **Never place an element over a target the step opened** — not even a
   transparent one. Only one story is ever visible, and this is why. A step's
   first region declares `interactive` to open itself — the type refuses the
   flag on any later region; every other hole is shown and blocked, and
   DESIGN.md argues that under **A hole, and whether it is open**.
2. **Steps advance on application state, never on DOM events.** A call site
   names what happened (`leko.reached('order-saved')`) and a step names what it
   waits for (`awaits`). Never add a click or input listener that advances a
   step.
3. **Story logic stays in the story.** Adding a tour must not make the
   application harder to read. If taking something out of Leko puts a listener
   into application code, one with no job outside the tour and written against
   a particular step, the complexity moved to the host rather than going away.
   `reached()` is the one concession, and it reports that something finished
   without naming a story or a step. DESIGN.md argues it under **Signals and
   steps** and applies it under **A failed attempt**.

## What looks like an improvement and is not

Each of these has been tried, and the page that settled it is cited in
DESIGN.md. Do not do any of them without reading that page first.

- **Blocking with the scrim itself instead of the `.leko-block` rectangles.**
  One element is tidier, a mask has no effect on hit-testing at all, and the
  clipped version that came before broke scrolling under the pointer in a way no
  hit-testing assertion can catch.
- **Reaching an SVG `<mask>` element from CSS with `url(#…)`.** It is the
  obvious way to write a mask, and Safari cuts no hole from it under any
  spelling — silently, with `CSS.supports` answering `true`. The holes are
  `data:` URL images for that reason.
- **Moving the morph onto `element.animate()`.** It composites, and Chrome then
  rasterises a composited clip path at the wrong scale on a 2x display. Nothing
  says a mask is safer.
- **Making the scrim an `<svg>` and masking it the SVG way.** It is the tidiest
  version of all and costs 81ms a frame in WebKit on a document-tall scrim.
- **Reading layout while the user scrolls.** Scroll tracking runs no JS at all
  and must stay that way. A bounded morph writing strings from numbers it
  already has is not the same thing and is fine, and nor is the glide reading
  back the one scroll offset it wrote the frame before. There is exactly one
  exception, it was argued rather than assumed, and it is a `position: sticky`
  target whose hole has to cross a pin: DESIGN.md, **A sticky target's hole is
  corrected on a frame loop, and that is the only exception to the ban**. A
  second one wants that page answered, not this line extended.
- **Using the browser's smooth scroll for the glide.** `behavior: 'smooth'` is
  the obvious spelling, and an animation Leko did not run has to be watched
  from the outside: a `scrollend` that Safari only fires from 26, a deadline
  under it, a check that the page has begun to move, and a rule per engine
  besides. The glide is Leko's own frame loop, the way the morph is, and ends
  on its own clock.
- **Adding a third-party runtime dependency to `packages/leko`.** It has none,
  deliberately. `@annetaan/leko-types`, `@annetaan/leko-machine`,
  `@annetaan/leko-presenter` and `@annetaan/leko-spotlight` are first-party and
  are fine.
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
- **Waiting for a promise a handler hands back.** `onEnter` returns `void`, and
  Leko draws the step the moment it returns. A handler that could hold the
  arrival open would hold the gate shut for as long as the application took, and
  a `reached()` landing in that window is dropped through no fault of the
  caller. A wait is a step with no `target` and an `awaits`, and DESIGN.md
  argues that under **A step that waits**.
- **Adding a back control, or a way to start a story part-way through.** A step
  that declares `awaits` cannot be returned to: the signal fired once and will
  not fire again, so the tour waits for ever. A story is atomic, and the answer
  to a tour somebody wants to redo is a shorter story. DESIGN.md argues it.

## Writing code here

Functional core, thin imperative shell — DESIGN.md says why. Geometry goes in
`packages/spotlight/src/geometry.ts` as pure functions with tests of their own;
DOM work stays in `packages/spotlight` and in `presenter.ts` and stays small. A
handle a timer or a frame hands back is data about what is running, so it
belongs in the state that names it rather than in a field of its own. Where
that state is a pure plan's, the plan cannot make the handle: the mode names
the wait (`Pending` in `packages/presenter/src/plan.ts`) and the shell holds
what the page handed back, armed and cleared by effect, the way its observer
is. The glide goes the other way — the shell mints it before the event and the
mode carries it — so the plan can say what to stop.

`packages/machine` decides which step the tour is on and takes no `lib.dom`, so
a `document` in it is a compile error. It is the same split again inside:
three files and no more. `types.ts` is what a host brings and what a presenter
owes, `plan.ts` is the state and what an event does to it, and `machine.ts` is
the class that makes the calls. `plan.ts` is pure. A decision that lands in
`machine.ts` is in the wrong file, and a move belongs in the `plan.ts` case that
decided it, written out rather than given a name of its own.

The three types a host brings are one parameter, `W extends World`. A signature
names one type, never three.

The presenter is split the same way. `packages/presenter/src/plan.ts` is the
mode the presenter is in — one union, `idle`, `drawn`, `retrying` or `gliding`,
each variant carrying what belongs to it — and what an event does to it, as the
next mode and a list of effects. It is pure and its tests run in Node. `presenter.ts`
resolves targets, measures, builds the chrome and is a `switch` over the
effects. What the page says — whether a target resolved, which glide landed —
goes into the event as data, and a decision that lands in `presenter.ts` is in
the wrong file.

`packages/spotlight` draws and knows nothing about steps. `packages/presenter`
wires the two together, `packages/types` is the public vocabulary, and
`packages/leko` holds the class, re-exports that vocabulary, and is the only
package that publishes. What each half may ask of the other is `Presenter` and
`Host` in `packages/machine/src/types.ts`, and DESIGN.md argues the two rules
that seam exists to keep.

New behaviour that a user would notice wants a case in
`examples/sandbox/src/cases/`, stating what it proves. A new claim about what a
browser does wants a page in `spike/`.

`packages/codegen` is the same split: `scan.ts` and `emit.ts` are functions a
test drives, and `generate.ts` is the part that touches tsconfig and disk. It
runs in Node as its own Vitest project. Behaviour of the public types wants a
program under `packages/leko/type-tests/`, one per vocabulary state, because an
augmentation applies to a whole compilation.

**A comment is the last place a fact goes.** What a browser does, what was tried
and broke, why a number is that number, and an invariant the types cannot spell
— those stay. A fact the code already carries is deleted; a fact DESIGN.md,
CONTRIBUTING.md, ONBOARDING.md or a sandbox case already carries is collapsed to
a citation of the heading or the case, never re-argued. Decide which by grepping
for it, never from memory: one rule reaches three places easily, and every copy
is written by somebody sure it had not been. DESIGN.md argues it under
**Comments are the last place a fact goes**, and `.claude/skills/trim-comments/`
is the procedure.

## Working in this repository

- Commits use the GitHub noreply address, set locally. Do not change
  `git config --global`. The whole history is authored, committed and signed
  under that address, and a `Co-authored-by:` trailer is spelled exactly that
  way — that capitalisation, and the numeric
  `2579373+michiharu@users.noreply.github.com` where the co-author is the
  maintainer. Git reads the key case-insensitively and GitHub accepts the
  address without the id, so nothing breaks when a trailer drifts; it just
  stops being greppable, and the history was normalised once already.
- `packages/leko` is built by `tsdown`, not `tsc`, because it bundles
  `@annetaan/leko-types`, `@annetaan/leko-machine`, `@annetaan/leko-presenter`
  and `@annetaan/leko-spotlight` in. All four are private and none is on the
  registry, so an import of any of them left in `dist/` is a package a consumer
  cannot install. `pnpm check:pack` is what catches that, and
  it runs in CI. Anything that changes what a package imports wants it run.
- Markdown is out of the formatter's reach, and so are the pages under
  `spike/`: `waapi-clip-path/index.html` is attached to
  [crbug.com/542859657](https://issues.chromium.org/issues/542859657) as it
  stands, and a formatter should not be rewriting evidence.
- **No line numbers in prose.** Point into a file by naming the symbol or the
  heading, never `machine.ts:147`. Nothing checks a line number and nothing
  updates one, so it goes stale the first time somebody edits above it and then
  sends a reader somewhere wrong while looking precise. The generated
  `leko-signals.d.ts` holds the names alone for the same reason.
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
