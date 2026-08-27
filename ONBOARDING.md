# Onboarding

This file is a map of the code.

Leko has three other documents and they answer different questions.
[README.md](README.md) says what the library does for someone who installs it.
[DESIGN.md](DESIGN.md) says why the code is shaped the way it is, and cites the
page under [`spike/`](spike/) that settled each rule.
[CONTRIBUTING.md](CONTRIBUTING.md) says how to work here: the setup, the
commands, and the changes that look like improvements and are not.

None of the three tells you which file to open first. That is what this one is
for. It also does not repeat their arguments. Where a rule matters I name the
function that keeps it and point at the section of DESIGN.md that argues it.

There are about four thousand lines of source here and nearly as many again
in tests. You can read all of it in a day, and most of that day is
`machine.ts`.

## Day one

### Get it running

```bash
pnpm install
pnpm exec playwright install chromium firefox webkit   # once, and not optional
pnpm dev
```

Node is pinned in `.node-version` and pnpm is pinned in `package.json`.
`corepack enable` picks pnpm up.

### Open the sandbox before you open an editor

`pnpm dev` serves [`examples/sandbox/`](examples/sandbox/) on Vite. It resolves
the core from `src` through the `development` export condition, so there is no
watch process and no stale `dist/` to debug.

Fifteen cases sit in the left rail. Take them in this order on the first day.

1. **stepping**. Six targets of different shapes and no validation in the way.
   Press the control on the message and watch the hole morph. This is the case
   to leave open while working on rendering.
2. **scrollable-target**. Put the pointer over the highlighted panel and use
   the wheel. It scrolls. That one interaction is the reason the scrim blocks
   with rectangles instead of with itself, and it is the thing that broke.
3. **two-stories**. One `reached('order-placed')` call, two stories on the same
   screen, and only the one that declared that name moves.
4. **branching**. Four stories joined by `next`. Each branch names the summary
   both paths meet at, and nothing in the file starts anything: the buttons
   report which way it went and the intro's `next` answers with the branch. A
   story cannot be entered part way through, so the shared part is a story
   rather than a step two paths point at. Watch the footer counter, then press
   the way out on a branch and watch the summary not open.
5. **signal-too-early**. Press Send and read the footer. The application
   reported something true while the step waiting for it was still being built,
   and the call was dropped. This is the one case where the interesting thing
   is what did *not* happen.

Every case states in one sentence what it proves. Read that line before you
drive the case.

### Then run the tests

```bash
pnpm test
```

284 test runs across 17 files. It takes about 8 seconds on a laptop once the
browsers are installed. Five Vitest projects, three of them in real browsers.

## The shape of the code

Four packages. One of them publishes.

```
                    @annetaan/leko          the only published package
                    packages/leko/          owns the public types
                     |            |
        Presenter    |            |    Host
     (machine asks)  |            |  (presenter reports)
                     v            v
      @annetaan/leko-machine   @annetaan/leko-spotlight
      packages/machine/        packages/spotlight/
      which step, and when     the scrim, the hole, the message
      no lib.dom at all        no idea what a step is

                    @annetaan/leko-codegen   separate, optional
                    packages/codegen/        reads reached() calls, writes types
```

The two halves never import each other. They meet in
`packages/leko/src/presenter.ts`, and what each may ask of the other is written
down in `Presenter` and `Host`, in `packages/machine/src/types.ts`.

`packages/machine/tsconfig.json` sets `"lib": ["ES2023"]`. A `document` in that
package is a compile error. That is what lets its 73 tests run in Node against a
fake presenter the test file writes, in under 200ms, instead of three times in
three browser engines.

`packages/leko` is built by `tsdown`, which bundles both halves in. Both are
`private: true` and neither is on npm, so an import of either left in `dist/` is
a package a consumer cannot install. `pnpm check:pack` catches that and CI runs
it.

| File | What it holds |
| --- | --- |
| `packages/leko/src/types.ts` | Every public type, and most of the reasoning, in JSDoc |
| `packages/leko/src/leko.ts` | The public class. Four getters and six methods |
| `packages/leko/src/presenter.ts` | `DomPresenter`: the two halves, wired |
| `packages/machine/src/types.ts` | What a host brings (`World`, `StepBase`, `StoryBase`) and what a presenter owes (`Presenter`, `Host`) |
| `packages/machine/src/plan.ts` | The state, and what each event does to it. Pure |
| `packages/machine/src/machine.ts` | The class. It makes the calls and decides nothing |
| `packages/spotlight/src/geometry.ts` | Pure functions. Numbers in, numbers out |
| `packages/spotlight/src/scrim.ts` | The overlay element and its morph loop |
| `packages/spotlight/src/message.ts` | The box beside the hole |
| `packages/codegen/src/scan.ts` | Every name a `reached()` call reports |

## Read the files in this order

**1. `packages/leko/src/types.ts`**

Start with the longest file in the repository. Almost none of it is code. It is the public API
with the argument for each option written next to it, and reading it gives you
the vocabulary for everything else. `LekoStep`, `LekoStory`, `LekoOptions`.

Read the JSDoc on `LekoStep.awaits` and on `LekoOptions.nextLabel` together.
They are the same rule from two sides.

**2. `packages/machine/src/types.ts`**

What the machine needs of the world, and the seam. `World` is the three types a
host brings, carried as the one parameter everything else takes. `Presenter` is
what the machine may ask of whatever draws, and `Host` is the five things a
presenter may report back.

Read the second half twice. Three rules live there and DESIGN.md states each under
[Three packages, and the seam between them](DESIGN.md#three-packages-and-the-seam-between-them).
The presenter never schedules itself. The presenter never decides whether there
is a next control. The presenter is told and never asks back.

**3. `packages/machine/src/plan.ts`, then `machine.ts`**

The hard part. Budget an hour.

`plan.ts` opens with where the tour is: five fields as one `Core`, and the four
readings taken off it. Read that and the section below on what each field means.

The rest of `plan.ts` is every decision the machine makes. `reduce` takes the state and one
event and answers with the next state, the calls the machine owes as data, and
the event it will carry on with. It imports nothing that can be called, so a
decision cannot make one.

`machine.ts` commits the state and then makes those calls, in that order. Read
`dispatch` and `perform` and you have read all of it. A decision you find in
here is in the wrong file.

**4. `packages/spotlight/src/geometry.ts`**

Relief after the machine. Every function takes numbers and returns numbers.
`complementRects` is the one to understand. It is what the scrim blocks with,
and it is what makes constraint 1 true by construction.

**5. `packages/spotlight/src/scrim.ts`**

The overlay element. `morph` and `run` are the animation. `block` puts the
rectangles from `complementRects` on the page.

**6. `packages/spotlight/src/message.ts`**

The box. Mostly inline styles and one interesting function, `chooseSide`.

**7. `packages/leko/src/presenter.ts`**

Now the wiring makes sense. `DomPresenter` implements the `Presenter` interface
from step 2 using the three files from steps 4 to 6.

**8. `packages/leko/src/leko.ts`**

Four getters and six methods, each one delegating to the machine. It is thin
on purpose. Read the JSDoc and skip the bodies.

**9. `packages/codegen/`** (optional)

Separate concern. Skip it until you need it.

## One signal, all the way to a pixel

This is the trace worth walking with the files open. The application calls
`leko.reached('order-saved')` and a step advances.

| | Where | What happens |
| --- | --- | --- |
| 1 | `leko.ts` `Leko.reached` | Hands the name straight to the machine |
| 2 | `machine.ts` `reached` | Hands the name to `dispatch` and does nothing else |
| 3 | `plan.ts` the `reached` event | Reads the current step. If `step.awaits !== name` it answers with nothing whatsoever, silently. Most calls end here. A name that matched and arrived while the phase was closed is dropped and reported |
| 4 | `plan.ts` `advance`, then `moveOn` and `entering` | Owes a `validate` where the step has a guard. Otherwise moves the position on, closes the phase, and owes the `hold`, the last step's `onLeave` and this step's `onEnter` |
| 5 | `plan.ts` the `stepEntered` event | Opens the phase, then owes the draw. In that order |
| 6 | `machine.ts` `perform` | Makes each of those calls, in the order they were owed. `draw` is where it resolves the anchor and calls `presenter.show` |
| 7 | `presenter.ts` `show`, then `reveal` | Pays out whatever the curtain still owes, then walks the scrolling ancestors, builds a `Scrim` per level, measures the cutouts and cuts the outer layers |
| 8 | `scrim.ts` `morph` | Pads both cutout lists to the same length, then starts the loop |
| 9 | `scrim.ts` `run` | Writes one `lerpPath` string into `element.style.clipPath` per frame. Main thread, on purpose |
| 10 | `scrim.ts` `block` | Puts the blocking rectangles where the cutouts are not |
| 11 | `presenter.ts` `say` | Runs after the morph settles, and only if it finished |
| 12 | `message.ts` `Message.show` | Fills the box, opens the popover, takes the anchor |
| 13 | `message.ts` `place` | Picks a side from viewport measurements and writes `position-area` |
| 14 | `plan.ts` the `drawn` event, then `machine.ts` `perform` | Owes the report and makes it. The instance's `onStep`, told which story |

Steps 5 and 14 are the pair to hold on to. The move is reported after it
survived being drawn. A progress readout that heard about a step while its
`onEnter` was still running would be naming something the user cannot see. In
`plan.ts` those are two events, so nothing can quietly put the report first.

The other direction is five calls. `Host.lost` when a target has gone and is not
coming back, `Host.moved` on a resize, `Host.next` when the step's control is
pressed, `Host.close` when the one that ends the tour is, and `Host.searching`
while the presenter is looking for an anchor that left the page. The machine
hands the presenter five closures in its constructor, so the presenter cannot
reach anything else on the machine.

`Host.searching` is the one to read the argument for. It reports a wait nobody
asked for, and the machine decides what `state` says about it, the same way it
decides for a target that was missing when the step arrived.

## The four fields in the machine

This is where the bugs were. Issues #31, #33 and #35 were each two fields
disagreeing about where the tour was.

| Field | Holds |
| --- | --- |
| `position` | `{ story, index }` together, because they are one fact. `undefined` means idle |
| `phase` | How far along the machine is. `story`, `step`, `ending`, `settling`, `searching` or `ready` |
| `error` | What the last attempt at this step was told was wrong |
| `showing` | Whatever `show` last handed back, so an interrupted morph can tell |

All four are `Core` in `plan.ts`, replaced together rather than written one at a
time, and `commit` in `machine.ts` is the only thing that writes one. There is
no list of stories among them: `start` is handed the one it is to run, so there
is nothing to look up and nothing to keep between runs. There is nothing a hook
reads either: a field the machine keeps only so a host can be handed it is a
field two places have to agree about.

These four and the six values of `phase` are written down again, as a state
machine a search can walk, in
[`packages/machine/model/machine.qnt`](packages/machine/model/machine.qnt).
`pnpm model` hunts it for a state that breaks an invariant, and the traces it
finds are replayed against the real class by `packages/machine/src/replay.test.ts`.
Read [that directory's README](packages/machine/model/README.md) before changing
either half, because a model that has drifted away from the code is worse than
no model.

`watch` adds two more, and they are about telling somebody rather than about the
tour: `watchers` holds the listeners, and `before` holds what `state` read when
this turn first wrote to `position` or `phase`. `commit` is the only thing that
writes the core, and `commit` is what raises the notification, so no write can
forget to announce itself.

`state` is derived rather than stored.

```ts
export const stateOf = <S, St>(core: Core<S, St>): MachineState => {
  if (core.position === undefined) return 'idle'
  return core.phase === 'ready' ? 'running' : 'transitioning'
}
```

It used to be a field called `currentState`, written at the handful of places
that knew it had changed. One of them did not know. A target lost after a slow
`onEnter` left `transitioning` on a tour that was never going to settle, and
a host could not tell a slow step from a stuck one. The suite asserted `state`
26 times before that fix and every one of them sat somewhere the write did
happen.

Nothing can forget to write an answer that nobody stores. If you add a field
here, ask whether it is a third way of saying something two fields already say.

`accepting` is the pattern to learn. It is in `plan.ts` beside `stateOf`.

```ts
export const accepting = <S, St>(core: Core<S, St>): boolean =>
  core.phase === 'ready' || core.phase === 'settling' || core.phase === 'searching'
```

Every call into the application is a window where the tour could be taken
somewhere else before control comes back. An `onEnter`, an `onLeave`, an
`onStep`, a `validate`. Rather than checking afterwards whether the
world moved, the machine refuses to act inside the window at all, so there is
nothing to check. The `reached`, `start`, `pressed` and `moved` events all ask
this first, in `plan.ts`.

`settling` and `searching` are not those windows. A morph is a step that arrived
and is still moving, and a search is a step that arrived and whose anchor has
gone missing since. The machine is inside neither of them, so a call means what
it says and goes through.

`stop()` does not ask, and that is the one exception. A tour nobody can turn off
until an application's `onEnter` settles is worse than the race. So every event
that can land after a window carries the position it was planned at, and
`plan.ts` asks `stillAt` before acting on one. A `stop()` can have thrown that
arrival away while the machine was gone.

There are seven of those asks. Six are about a position an arrival began at, and
the last one is a different job: a `refused` landing after a `validate` that
called `stop()` from inside itself. All seven are what is left of a counter that
used to be checked in thirteen places.

## The two constraints, and the line that keeps each

DESIGN.md argues both under
[Two constraints that must not be broken](DESIGN.md#two-constraints-that-must-not-be-broken).
Here is where they live in code.

**1. Never place an element over the target.**

The `Scrim` constructor sets `pointerEvents: 'none'` on the scrim. The scrim paints and
catches nothing. Its children do the catching, and those children come from
`complementRects` in `geometry.ts`, which returns what is left of the
surface once the holes are taken out.

That makes the constraint true by construction. The rectangles are built from
the complement of the cutouts, so nothing of Leko's can be over a target even in
principle. No clip path has to be trusted for it.

`geometry.test.ts` states it as a property: no blocking rectangle ever overlaps
a hole. `harness.ts` has `absorbed(el)`, which asks whether the tour caught a hit
at the centre of an element rather than the page underneath.

**2. Steps advance on application state, never on DOM events.**

`Machine.reached` is the whole mechanism. A name matches a step's `awaits`, or
nothing happens.

Grep for the other half of it:

```bash
grep -rn "addEventListener\|new MutationObserver" \
  packages/leko/src packages/spotlight/src packages/machine/src | grep -v "\.test\."
```

Five lines come back. They are every listener the library installs, and none of
them advances a step.

| Where | Why |
| --- | --- |
| `presenter.ts` `watchTarget` | A `MutationObserver` noticing the target left the page. Runs the selector again on the spot, because the batch that took the node away usually carries its replacement |
| `presenter.ts` `search` | The same observer, re-armed on a target that is not back yet. Reports `Host.searching` while it runs and `Host.lost` if it gives up |
| `presenter.ts` `watchViewport` | A `resize` listener. Reports `Host.moved` |
| `message.ts` `press` | A `click` on the next control. Reports `Host.next` |
| `close.ts` `press` | A `click` on the control that ends the tour. Reports `Host.close` |

**There is no scroll listener anywhere.** Scroll tracking runs no JavaScript at
all. The scrim lives inside the thing that scrolls, so scrolling moves the scrim
and the target together, and the message is anchor-positioned so the browser
offsets it. If you find yourself adding a scroll listener, stop and read
[Scrolling](DESIGN.md#scrolling) first.

## Which Vitest project a new test belongs in

Five projects, defined in `vitest.config.ts`. The question that sorts them is
whether a browser could get the answer wrong.

| Project | Runs in | Take a test here when |
| --- | --- | --- |
| `machine` | Node | The claim never touches layout. Which step, when, what was reported |
| `codegen` | Node | The claim is about reading TypeScript source or writing a file |
| `spotlight` | Chromium, Firefox, WebKit | The claim is about geometry or what an engine does with `clip-path` |
| `leko` | Chromium, Firefox, WebKit | An engine could answer differently. `elementFromPoint`, where a scrim mounted, a resize |
| `leko-wiring` | Chromium only | It goes through the real `DomPresenter`, and no engine has an opinion about the answer |

"Does the test mention the DOM" is the wrong question and it was tried. 20 tests
mentioned the DOM and no engine could disagree about any of them. They moved to
`leko-wiring` and the suite went from 265 runs to 225 without deleting a claim.

`machine.test.ts` is grouped into 9 `describe` blocks, one per axis the machine
is asked about. Read them as a table. A group with two tests in it is a column
nobody has crossed with the others, and that is where the next bug is.
DESIGN.md says so under
[How to write here, and where tests go](DESIGN.md#how-to-write-here-and-where-tests-go).

## I want to change X

| Change | Files |
| --- | --- |
| A new option on a step or story | `leko/src/types.ts`, then `machine/src/types.ts` if the machine reads it |
| How the hole is shaped | `spotlight/src/geometry.ts` and its tests. Nothing else |
| When a step advances | `machine/src/plan.ts` only |
| Where the message goes | `spotlight/src/message.ts`, `chooseSide` and `place` |
| What the machine may ask of the presenter | `machine/src/types.ts`, then both implementations |
| Anything a user would notice | A case in `examples/sandbox/src/cases/`, stating what it proves |
| A new claim about browser behaviour | A page in `spike/`, dependency free and free of Leko |

`Target` and the three state literals are written out twice, in
`@annetaan/leko` and in the package underneath it. That is deliberate while
those packages are private, and DESIGN.md explains it under
[Three packages, and the seam between them](DESIGN.md#three-packages-and-the-seam-between-them).
Change one and change the other.

Before opening a pull request:

```bash
pnpm typecheck && pnpm lint && pnpm format && pnpm check:pack && pnpm test
```

## The codegen loop

Worth 15 minutes even if you never touch the package.

A signal name is a string on both sides. `reached('order-saved')` at the call
site, `awaits: 'order-saved'` in a story written a month later. A typo does not
fail. The step waits and the console says nothing, because an unmatched signal
is silent by design.

So `packages/codegen` walks the project, collects every name a `reached()` call
reports, and writes a declaration file that augments two interfaces the core
exports empty. Open
[`examples/sandbox/src/leko-signals.d.ts`](examples/sandbox/src/leko-signals.d.ts)
and read the generated output. Four names, each with the file and line it came
from.

It asks the compiler rather than the text, so `reached(ORDER_SAVED)` contributes
`order-saved` from a file away. A name built at runtime cannot be gathered, and
the generator prints every call like that rather than passing over it.

Two things to know.

`awaits` is tightened and `reached()` never is. The vocabulary is gathered from
those calls, so an error there would only fire between typing a new name and the
generator running, and a `reached()` call has to stay compilable in builds where
no tour runs.

The augmenting file has to be a module. A file with no import and no export of
its own is not one, and `declare module` in it declares an ambient module rather
than augmenting this one. No completion appears and nothing reports a problem.
The generated file ends in an exported type for exactly this reason.

`packages/leko/type-tests/` holds three programs, one tsconfig each. No
vocabulary, a vocabulary, and a vocabulary with the promise. They are three
programs because an augmentation applies to a whole compilation. `pnpm typecheck`
runs all three.

## The prose counts things, and counts go stale

DESIGN.md counts. How many tests are in a group, how many fields the machine
holds, how many cases the sandbox has. Those counts are what makes its arguments
checkable, and they are the first thing to go wrong when the code moves.

Twelve sentences across DESIGN.md, `machine.test.ts` and README.md had drifted
by August 2026, most of them out of #40 through #43. None of the twelve was a
bug. They were all fixed in the commit that added this file. When you change
something DESIGN.md counts, open the paragraph that counts it before you open
the pull request.

## When you are stuck

Open the spike page. Several rules in DESIGN.md exist only because a browser
does not do what the specification suggests it might, and each rule cites the
page under [`spike/`](spike/) that settled it. The pages have no build step and
no dependencies, and there is no Leko in them. Open the file and watch the
answer.

There are three.

| Page | Question |
| --- | --- |
| [`spike/cutout-techniques/`](spike/cutout-techniques/) | Which ways of cutting a hole work, and can the geometry come from CSS alone? |
| [`spike/waapi-clip-path/`](spike/waapi-clip-path/) | Does a `clip-path` animation render correctly on the compositor? |
| [`spike/wheel-through-a-hole/`](spike/wheel-through-a-hole/) | Does a wheel reach the element under a hole, the way a click does? |

The second one cannot be measured automatically. A screenshot over the DevTools
protocol forces a repaint on the main thread, which hides anything that only
goes wrong on the compositor. It looks fine to every tool and wrong to a person.
It is attached to [crbug.com/542859657](https://issues.chromium.org/issues/542859657)
as it stands, so do not let a formatter rewrite it.

Read the page before you overrule the rule.
