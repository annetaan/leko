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

The cases sit in the left rail. Take them in this order on the first day.

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
5. **step-setup**. Press Next and watch the page go under with no hole in it.
   That is a step with no `target`: it opened the section, started the fetch,
   and named the signal it is waiting for. Leko waits for no handler, so a wait
   is a step somebody can read in the story.

Every case states in one sentence what it proves. Read that line before you
drive the case.

### Then run the tests

```bash
pnpm test
```

It takes well under a minute on a laptop once the browsers are installed.
`vitest.config.ts` defines the projects, three of them in real browsers.

## The shape of the code

Six packages. One of them publishes.

```
                    @annetaan/leko          the only published package
                    packages/leko/          the class, and the entry point
                    /        |          \
                   /         |           \      @annetaan/leko-types
                  /          v            '-->  packages/types/
                 |  @annetaan/leko-presenter    the public vocabulary
                 |  packages/presenter/  ---->  types only
                 |  where the two halves meet
                 |    |                 |
   new Machine() |    | Presenter       | Host
                 |    | (machine asks)  | (presenter reports)
                 v    v                 v
      @annetaan/leko-machine   @annetaan/leko-spotlight
      packages/machine/        packages/spotlight/
      which step, and when     the scrim, the hole, the message
      no lib.dom at all        no idea what a step is

                    @annetaan/leko-codegen   separate, optional
                    packages/codegen/        reads reached() calls, writes types
```

The two halves never import each other. They meet in
`packages/presenter/src/presenter.ts`, and what each may ask of the other is
written down in `Presenter` and `Host`, in `packages/machine/src/types.ts`.

`packages/machine/tsconfig.json` sets `"lib": ["ES2023"]`. A `document` in that
package is a compile error. That is what lets its tests run in Node against a
fake presenter the test file writes, in a fraction of a second, instead of three
times in three browser engines.

`packages/leko` is built by `tsdown`, which bundles the other four in. All four
are `private: true` and none is on npm, so an import of any of them left in
`dist/` is a package a consumer cannot install. `pnpm check:pack` catches that
and CI runs it.

| File | What it holds |
| --- | --- |
| `packages/types/src/types.ts` | Every public type, and most of the reasoning, in JSDoc |
| `packages/leko/src/leko.ts` | The public class. Four getters and four methods |
| `packages/presenter/src/plan.ts` | The presenter's mode, and what each event does to it. Pure |
| `packages/presenter/src/presenter.ts` | `DomPresenter`: the two halves, wired. It performs the plan's effects and decides nothing |
| `packages/presenter/src/handoff.ts` | The handoff note's shape, and how it is encoded and decoded |
| `packages/machine/src/types.ts` | What a host brings (`World`, `StepBase`, `StoryBase`) and what a presenter owes (`Presenter`, `Host`) |
| `packages/machine/src/plan.ts` | The state, and what each event does to it. Pure |
| `packages/machine/src/machine.ts` | The class. It makes the calls and decides nothing |
| `packages/spotlight/src/geometry.ts` | Pure functions. Numbers in, numbers out |
| `packages/spotlight/src/target.ts` | What a target resolves to, asked of the page |
| `packages/spotlight/src/scrim.ts` | The overlay element and its morph loop |
| `packages/spotlight/src/surface.ts` | What a layer is carried by, and how a target is measured against it |
| `packages/spotlight/src/glide.ts` | The scroll that brings a target into view |
| `packages/spotlight/src/follow.ts` | The frame loop that keeps a sticky target's hole under it |
| `packages/spotlight/src/message.ts` | The box beside the hole |
| `packages/spotlight/src/focus.ts` | The ring Tab cannot leave |
| `packages/spotlight/src/close.ts` | The way out, and the corner it keeps to |
| `packages/spotlight/src/motion.ts` | Whether the tour moves things or sets them |
| `packages/codegen/src/scan.ts` | Every name a `reached()` call reports |

## Read the files in this order

**1. `packages/types/src/types.ts`**

Start with the longest file in the repository. Almost none of it is code. It is the public API
with the argument for each option written next to it, and reading it gives you
the vocabulary for everything else. `LekoStep`, `LekoStory`, `LekoOptions`.

Read the JSDoc on `LekoStep.awaits` and on `LekoOptions.nextLabel` together.
They are the same rule from two sides.

**2. `packages/machine/src/types.ts`**

What the machine needs of the world, and the seam. `World` is the three types a
host brings, carried as the one parameter everything else takes. `Presenter` is
what the machine may ask of whatever draws, and `Host` is the three things a
presenter may report back.

Read the second half twice. Three rules live there and DESIGN.md states each under
[The packages, and the seam between them](DESIGN.md#the-packages-and-the-seam-between-them).
The presenter never schedules itself. No words cross the seam, and the one
string that does is the reason a guard gave. The presenter is told and never
asks back.

**3. `packages/machine/src/plan.ts`, then `machine.ts`**

The hard part. Budget an hour.

`plan.ts` opens with where the tour is: two fields as one `Core`, and the
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

**7. `packages/presenter/src/plan.ts`, then `presenter.ts`**

Now the wiring makes sense, and it is the machine's split again. `plan.ts` is
the mode the presenter is in — `idle`, `drawn`, `retrying` or `gliding`, one
union — and `reduce` answers an event with the next mode and the effects owed.
`DomPresenter` implements the `Presenter` interface from step 2 using the three
files from steps 4 to 6: it resolves targets, measures, and is a `switch` over
those effects. Read `dispatch` and `perform` there the way you read them in
`machine.ts`.

**8. `packages/leko/src/leko.ts`**

Four getters and four methods, each one delegating to the machine. It is thin
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
| 4 | `plan.ts` `advance`, then `moveOn` and `entering` | Owes a `validate` where the step has a guard. Otherwise moves the position on, closes the phase, and owes the last step's `onLeave` and this step's `onEnter` |
| 5 | `plan.ts` the `stepEntered` event | Opens the phase, then owes the draw. In that order |
| 6 | `machine.ts` `perform` | Makes each of those calls, in the order they were owed. `draw` is where it resolves the anchor and calls `presenter.show` |
| 7 | `presenter.ts` `show`, then `plan.ts` the `show` event, then `presenter.ts` `reveal` | The plan stops whatever glide was running and moves to `drawn`, owing a `disarm` and a `reveal`. `reveal` works out which surfaces carry the target — its scrollers and the document, or the viewport alone for a fixed one — builds a `Scrim` per level, measures the cutouts and cuts the outer layers. A step with no `target` measures the empty list and the scrim closes over everything |
| 8 | `scrim.ts` `morph` | Pads both cutout lists to the same length, then starts the loop |
| 9 | `scrim.ts` `run`, then `paint` | Interpolates the cutouts with `lerpCutouts` and writes the three mask properties `maskLayers` makes from them, once per frame. Main thread, on purpose |
| 10 | `scrim.ts` `block` | Puts the blocking rectangles where the cutouts are not |
| 11 | `plan.ts` the `morphed` event, then `presenter.ts` `say` | The morph finished, so the plan owes the words — whatever the step has been told by now — and `say` puts them beside the hole |
| 12 | `message.ts` `Message.show` | Fills the box, opens the popover, takes the anchor |
| 13 | `message.ts` `place` | Picks a side from viewport measurements and writes `position-area` |
| 14 | `plan.ts` the `drawn` event, then `machine.ts` `perform` | Owes the report and makes it. The instance's `onStep`, told which story |

Steps 5 and 14 are the pair to hold on to. The move is reported after it
survived being drawn. A progress readout that heard about a step while its
`onEnter` was still running would be naming something the user cannot see. In
`plan.ts` those are two events, so nothing can quietly put the report first.

The other direction is the members of `Host`. `lost` when a target a step
arrived at never turned up, `next` when the step's control is pressed, `close`
when the one that ends the tour is, `navigated` on a URL change a `{ url }`
step might be waiting for, and `unloading` at `pagehide`. The machine hands
the presenter five closures in its constructor, so the presenter cannot reach
anything else on the machine.

Every one of them either ends the run or moves it on, except `unloading`: it
keeps a note and leaves the run standing rather than tearing anything down —
DESIGN.md, **A page load ends the story, and hands it on**. A resize reaches
the machine through none of them: the presenter draws the step it already has
again, which is not a decision anybody has to be asked about. A node swapped
for an identical one under a drawn step reaches nothing at all — the presenter
is not watching, and the hole a replacement lands in is the one that was
already cut for it.

`Host.lost` is the one to read the argument for. It is only ever about a step
that was arriving: a target that is not on the page when its step gets there is
hunted for 100ms first, and the presenter draws nothing new while that runs, so
a wait too short to act on never reaches the machine at all.

## The two fields in the machine

This is where the bugs were. Issues #31, #33 and #35 were each two fields
disagreeing about where the tour was.

| Field | Holds |
| --- | --- |
| `position` | `{ story, index }` together, because they are one fact. `undefined` means idle |
| `phase` | Which window the machine is in. `story`, `step`, `ending` or `ready` |

Both are `Core` in `plan.ts`, replaced together rather than written one at a
time, and `dispatch` in `machine.ts` is the only thing that writes one. There is
no list of stories among them: `start` is handed the one it is to run, so there
is nothing to look up and nothing to keep between runs. There is nothing a hook
reads either, and nothing about what is on screen: the words of a failed attempt
live where they are drawn.

These two and the four values of `phase` are written down again, as a state
machine a search can walk, in
[`packages/machine/model/machine.qnt`](packages/machine/model/machine.qnt).
`pnpm model` hunts it for a state that breaks an invariant, and the traces it
finds are replayed against the real class by `packages/machine/src/replay.test.ts`.
The presenter's `plan.ts` has a model of the same shape in
[`packages/presenter/model/plan.qnt`](packages/presenter/model/plan.qnt), and the same
command walks it; its traces are replayed against the real `reduce` by
`packages/presenter/src/replay.test.ts`, which is the machine's arrangement
inverted — a real plan over fake effects rather than a real machine over a fake
presenter. Read the README beside each model before changing either
half, because a model that has drifted away from the code is worse than no
model.

`state` is derived rather than stored, and it reads one of the two.

```ts
export const stateOf = <W extends World>(core: Core<W>): MachineState =>
  core.position === undefined ? 'idle' : 'running'
```

It used to be a field called `currentState`, written at the handful of places
that knew it had changed. One of them did not know, and left the wrong answer on
a tour that was never going to settle. The suite asserted `state` 26 times
before that fix and every one of them sat somewhere the write did happen.

Nothing can forget to write an answer that nobody stores. If you add a field
here, ask whether it is a second way of saying something a field already says,
or a fact about the page rather than about the tour.
There is no `watch` for the same reason one field is enough: `onStep` fires when
a step goes up and again when the run ends, and a story being on is the
difference between those two.

`accepting` is the pattern to learn. It is in `plan.ts` beside `stateOf`.

```ts
export const accepting = <W extends World>(core: Core<W>): boolean =>
  core.phase === 'ready'
```

Every call into the application is a window where the tour could be taken
somewhere else before control comes back. An `onEnter`, an `onLeave`, an
`onStep`, a `validate`. Rather than checking afterwards whether the
world moved, the machine refuses to act inside the window at all, so there is
nothing to check. The `reached`, `start` and `pressed` events all ask this
first, in `plan.ts`.

A morph is not one of those windows, and the machine is not told one is running.
A step is on screen the moment `show` returns, so a call made while the drawing
is still moving means what it says and goes through.

`stop()` does not ask, and that is the one exception. A handler that has decided
the tour should not go on has nowhere else to go. So every event that can land
after a window carries the position it was planned at, and `plan.ts` asks
`stillAt` before acting on one. A `stop()` can have thrown that arrival away
while the machine was gone.

There are eight of those asks. Seven are about a position an arrival or an ask
of `next` began at, and the last one is a different job: a `refused` landing
after a `validate` that called `stop()` from inside itself. All eight are what
is left of a counter that used to be checked in thirteen places.

## The three constraints, and the line that keeps each

DESIGN.md argues all three under
[Three constraints that must not be broken](DESIGN.md#three-constraints-that-must-not-be-broken).
Here is where they live in code.

**1. Never place an element over a target the step opened.**

The `Scrim` constructor sets `pointerEvents: 'none'` on the scrim. The scrim paints and
catches nothing. The catching is done by `.leko-blocking`, a sibling it builds
beside itself, whose rectangles come from `complementRects` in `geometry.ts` and
are what is left of the surface once the open holes are taken out.

Beside rather than inside, because a `clip-path` clips its descendants out of
hit-testing along with itself, so a rectangle inside the scrim and over one of
its holes catches nothing. `spike/blocking-a-hole/` is the page.

That makes the constraint true by construction. The rectangles are built from
the complement of the cutouts the step opened, so nothing of Leko's can be over
a target the step made reachable, even in principle. No clip path has to be
trusted for it.

A cutout that is not interactive is left out of that complement, so a rectangle
covers it. It is still a hole in the clip and still shows what is under it.
`interactive` is off by default and lives on the region: only the first region
of a step can declare it, and the type is what refuses it on a later one.

`geometry.test.ts` states it as a property: no blocking rectangle ever overlaps
a hole. `harness.ts` has `absorbed(el)`, which asks whether the tour caught a hit
at the centre of an element rather than the page underneath.

**2. Steps advance on application state, never on DOM events.**

`Machine.reached` is the whole mechanism. A name matches a step's `awaits`, or
nothing happens.

Grep for the other half of it:

```bash
grep -rn "addEventListener\|new MutationObserver" \
  packages/presenter/src packages/spotlight/src packages/machine/src | grep -v "\.test\."
```

They are every listener the library installs but one — the grep also catches
the `NavigationApi` interface declaration, which installs nothing — and none
of the listeners advances a step.

| Where | Why |
| --- | --- |
| `presenter.ts` `hunt` | The one `MutationObserver`, armed by the plan for a target a step has arrived at and the page does not have yet. It runs the step's target again on every batch and hands the plan what it found. `Host.lost` is owed by the plan where the retry runs out. A step on screen arms nothing at all |
| `presenter.ts` `watchViewport` | A `resize` listener. The plan owes a redraw of the step it already has, without asking |
| `focus.ts` constructor | `keydown` and `focusin`, both capturing. They keep Tab inside the ring and move nothing |
| `message.ts` `press` | A `click` on the next control. Reports `Host.next` |
| `close.ts` `press` | A `click` on the control that ends the tour. Reports `Host.close` |
| `presenter.ts` `watchNavigation` | `currententrychange`, or `popstate` and `hashchange` where the Navigation API is missing. Reports `Host.navigated` |
| `presenter.ts` `watchNavigation` | `pagehide`, reporting `Host.unloading`, and `pageshow`, calling `forget()`. Neither moves a step — DESIGN.md, **A page load ends the story, and hands it on** |
| `follow.ts` | A passive `scroll` per port, waking the frame loop that corrects a sticky target's hole. DESIGN.md, **A sticky target's hole is corrected on a frame loop, and that is the only exception to the ban** |

**The one scroll listener is the sticky target's, and it reads layout only
while a port it named is moving.** Every other case moves the scrim and the
target together for free: the scrim lives inside the thing that scrolls, and
the message is anchor-positioned so the browser offsets it. If you find
yourself adding another scroll listener, stop and read
[Scrolling](DESIGN.md#scrolling) first.

**3. Story logic stays in the story.**

`Leko` publishes `start`, `pickUp`, `reached` and `stop`, and four getters.
Nothing on it takes a step. `pickUp` takes a list of stories and matches a
kept note against one of them by `id`, once, so nothing on it names a step
either. `reached(name)` takes one string, and the matching against `awaits`
happens inside the machine, so a call site cannot say which step should move
even by accident.

The conditions a story has are fields on the step. `awaits` names the report the
step waits for. `validate` guards the control. `interactive` says what the user
may touch. `packages/machine` reads them and the application reads none of them.
Take one of those fields away and the application carries the same condition as
a listener, written against a particular step and with no job outside the tour.

## Which Vitest project a new test belongs in

Nine projects, defined in `vitest.config.ts`. The question that sorts them is
whether a browser could get the answer wrong.

| Project | Runs in | Take a test here when |
| --- | --- | --- |
| `presenter` | Node | The claim is about which mode the presenter is in and what it owes for an event, with no page |
| `machine` | Node | The claim never touches layout. Which step, when, what was reported |
| `codegen` | Node | The claim is about reading TypeScript source or writing a file |
| `scripts` | Node | The claim is about the text a repository check reads — a file's comments, a citation of a heading |
| `spotlight-geometry` | Node | The claim is a property of the numbers `geometry.ts` returns |
| `scroll-core` | Node | It is about Leko Scroll's pure core |
| `spotlight` | Chromium, Firefox, WebKit | The claim is about what an engine does — with `clip-path`, with a box, with a popover |
| `leko` | Chromium, Firefox, WebKit | An engine could answer differently. `elementFromPoint`, where a scrim mounted, a resize |
| `leko-wiring` | Chromium only | It goes through the real `DomPresenter`, and no engine has an opinion about the answer |

"Does the test mention the DOM" is the wrong question and it was tried. 20 tests
mentioned the DOM and no engine could disagree about any of them. They moved to
`leko-wiring` and the suite went from 265 runs to 225 without deleting a claim.

`machine.test.ts` is grouped into one `describe` block per axis the machine
is asked about. Read them as a table. A group with two tests in it is a column
nobody has crossed with the others, and that is where the next bug is.
DESIGN.md says so under
[How to write here, and where tests go](DESIGN.md#how-to-write-here-and-where-tests-go).

## I want to change X

| Change | Files |
| --- | --- |
| A new option on a step or story | `types/src/types.ts`, then `machine/src/types.ts` if the machine reads it |
| How the hole is shaped | `spotlight/src/geometry.ts` and its tests. Nothing else |
| When a step advances | `machine/src/plan.ts` only |
| What a target going, a glide landing or a resize does to what is drawn | `presenter/src/plan.ts`, and its tests |
| How the page is brought to a target | `spotlight/src/glide.ts`, with `scrollDelta`, `scrollStages` and `glideDuration` in `geometry.ts` |
| Whether the hole follows its target while the viewer scrolls | `spotlight/src/follow.ts`, armed in `measure` in `presenter/src/presenter.ts` |
| Which surfaces carry a target, and where its box lands on one | `spotlight/src/surface.ts`, and its tests |
| Where the message goes | `spotlight/src/message.ts`, `chooseSide` and `place` |
| What Tab may reach | `spotlight/src/focus.ts`, and `showRing` in `presenter/src/presenter.ts` |
| What the machine may ask of the presenter | `machine/src/types.ts`, then both implementations |
| How a tour crosses a page load | `machine/src/plan.ts`'s `unloading`, `pickUp`, `handingOn` and `taken` cases; `presenter/src/presenter.ts`'s `keep`, `take`, `forget` and `watchNavigation`; `presenter/src/handoff.ts` |
| Anything a user would notice | A case in `examples/sandbox/src/cases/`, stating what it proves |
| A new claim about browser behaviour | A page in `spike/`, dependency free and free of Leko |

The two state literals are written out twice, `LekoState` in
`@annetaan/leko-types` and `MachineState` in the machine underneath it, and so
is `Target`, in the vocabulary and in `spotlight/src/target.ts`. Both are
deliberate, and DESIGN.md explains it under
[The packages, and the seam between them](DESIGN.md#the-packages-and-the-seam-between-them).
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

Start with the three that settle the cutout:

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
