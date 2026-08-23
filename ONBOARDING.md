# Onboarding

This file is a map of the code.

Leko has three other documents and they answer different questions.
[README.md](README.md) says what the library does for someone who installs it.
[DESIGN.md](DESIGN.md) says why the code is shaped the way it is, and cites the
page under [`spike/`](spike/) that settled each rule.
[CONTRIBUTING.md](CONTRIBUTING.md) says how to work here: the setup, the
commands, and the changes that look like improvements and are not.

None of the three tells you which file to open first. That is what this one is
for. It also does not repeat their arguments. Where a rule matters I say which
line of code keeps it and point at the section of DESIGN.md that argues it.

There are about 3,300 lines of source here and 2,900 lines of tests. You can read
all of it in a day. Most of that day is the 685 lines of `machine.ts`.

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

Fourteen cases sit in the left rail. Take them in this order on the first day.

1. **stepping**. Five targets of different shapes and no validation in the way.
   Press `nextStep()` in the footer and watch the hole morph. This is the case
   to leave open while working on rendering.
2. **scrollable-target**. Put the pointer over the highlighted panel and use
   the wheel. It scrolls. That one interaction is the reason the scrim blocks
   with rectangles instead of with itself, and it is the thing that broke.
3. **two-stories**. One `reached('order-placed')` call, two stories registered,
   and only the one that declared that name moves.
4. **branching**. Three stories and a `start('shared', 'summary')` that hands
   the tour back where the paths meet. Watch the footer counter.

Every case states in one sentence what it proves. Read that line before you
drive the case.

### Then run the tests

```bash
pnpm test
```

239 test runs across 17 files. It takes about 5 seconds on a laptop once the
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
down in `packages/machine/src/port.ts`.

`packages/machine/tsconfig.json` sets `"lib": ["ES2023"]`. A `document` in that
package is a compile error. That is what lets its 62 tests run in Node against a
fake presenter the test file writes, in under 100ms, instead of three times in
three browser engines.

`packages/leko` is built by `tsdown`, which bundles both halves in. Both are
`private: true` and neither is on npm, so an import of either left in `dist/` is
a package a consumer cannot install. `pnpm check:pack` catches that and CI runs
it.

| File | Lines | What it holds |
| --- | --- | --- |
| `packages/leko/src/types.ts` | 443 | Every public type, and most of the reasoning, in JSDoc |
| `packages/leko/src/leko.ts` | 180 | The public class. Four getters and seven methods |
| `packages/leko/src/presenter.ts` | 292 | `DomPresenter`: the two halves, wired |
| `packages/machine/src/machine.ts` | 685 | Which step the tour is on |
| `packages/machine/src/port.ts` | 94 | `Presenter` and `Host`. The seam |
| `packages/machine/src/types.ts` | 58 | `StepBase`, `StoryBase`, `ErrorUtils` |
| `packages/spotlight/src/geometry.ts` | 221 | Pure functions. Numbers in, numbers out |
| `packages/spotlight/src/scrim.ts` | 295 | The overlay element and its morph loop |
| `packages/spotlight/src/message.ts` | 364 | The box beside the hole |
| `packages/codegen/src/scan.ts` | 165 | Every name a `reached()` call reports |

## Read the files in this order

**1. `packages/leko/src/types.ts`** (443 lines)

Start with the biggest file. Almost none of it is code. It is the public API
with the argument for each option written next to it, and reading it gives you
the vocabulary for everything else. `LekoStep`, `LekoStory`, `LekoOptions`.

Read the JSDoc on `LekoStep.awaits` and on `LekoOptions.nextLabel` together.
They are the same rule from two sides.

**2. `packages/machine/src/port.ts`** (94 lines)

The seam. Two interfaces and nothing else. `Presenter` is what the machine may
ask of whatever draws. `Host` is the three things a presenter may report back.

Read it twice. Three rules live here and DESIGN.md argues each under
[Two rules the port exists to keep](DESIGN.md#two-rules-the-port-exists-to-keep).
The presenter never schedules itself. The presenter never decides whether there
is a next control. The presenter is told and never asks back.

**3. `packages/machine/src/machine.ts`** (685 lines)

The hard file. Budget two hours. Read the field declarations at the top first,
then the section below on what each field means, then the methods.

**4. `packages/spotlight/src/geometry.ts`** (221 lines)

Relief after the machine. Every function takes numbers and returns numbers.
`complementRects` is the one to understand. It is what the scrim blocks with,
and it is what makes constraint 1 true by construction.

**5. `packages/spotlight/src/scrim.ts`** (295 lines)

The overlay element. `morph` and `run` are the animation. `block` puts the
rectangles from `complementRects` on the page.

**6. `packages/spotlight/src/message.ts`** (364 lines)

The box. Mostly inline styles and one interesting function, `chooseSide` at
line 65.

**7. `packages/leko/src/presenter.ts`** (292 lines)

Now the wiring makes sense. `DomPresenter` implements the `Presenter` interface
from step 2 using the three files from steps 4 to 6.

**8. `packages/leko/src/leko.ts`** (180 lines)

Four getters and seven methods, each one delegating to the machine. It is thin
on purpose. Read the JSDoc and skip the bodies.

**9. `packages/codegen/`** (572 lines, optional)

Separate concern. Skip it until you need it.

## One signal, all the way to a pixel

This is the trace worth walking with the files open. The application calls
`leko.reached('order-saved')` and a step advances.

| | Where | What happens |
| --- | --- | --- |
| 1 | `leko.ts:137` | `Leko.reached` hands the name straight to the machine |
| 2 | `machine.ts:332` | `reached` reads the current step. If `step.awaits !== name` it returns, silently. Most calls end here |
| 3 | `machine.ts:360` | `advance` drops the call if an `onEnter` is in flight. Runs `validate` if the step has one. A failed `validate` calls `onValidationError` and stops |
| 4 | `machine.ts:525` | `enter` clears the error, hides the message, bumps `generation`, runs the last step's `onLeave`, then this step's `onEnter` |
| 5 | `machine.ts:586` | `arrive` draws, then reports. In that order, and only if `generation` still matches |
| 6 | `machine.ts:609` | `draw` resolves the anchor and calls `presenter.show` |
| 7 | `presenter.ts:147` | `DomPresenter.show` walks the scrolling ancestors, builds a `Scrim` per level, measures the cutouts, cuts the outer layers |
| 8 | `scrim.ts:253` | `Scrim.morph` pads both cutout lists to the same length, then starts the loop |
| 9 | `scrim.ts:169` | `run` writes one `lerpPath` string into `element.style.clipPath` per frame. Main thread, on purpose |
| 10 | `scrim.ts:223` | `block` puts the blocking rectangles where the cutouts are not |
| 11 | `presenter.ts:116` | `say` runs after the morph settles, and only if it finished |
| 12 | `message.ts:216` | `Message.show` fills the box, opens the popover, takes the anchor |
| 13 | `message.ts:309` | `place` picks a side from viewport measurements and writes `position-area` |
| 14 | `machine.ts:318` | `report` calls the story's `onStep`, then the instance's |

Step 5 is the one to hold on to. The move is reported after it survived being
drawn. A progress readout that heard about a step while its `onEnter` was still
running would be naming something the user cannot see.

The other direction is three calls. `Host.lost` when a target leaves the page,
`Host.moved` on a resize, and `Host.next` when the control is pressed. The
machine hands the presenter three closures in its constructor at
`machine.ts:124`, so the presenter cannot reach anything else on the machine.

## The nine fields in the machine

This is where the bugs were. Issues #31, #33 and #35 were each two fields
disagreeing about where the tour was.

| Field | Holds |
| --- | --- |
| `stories` | Every registered story. At most one runs |
| `position` | `{ story, index }` together, because they are one fact. `undefined` means idle |
| `error` | What the last attempt at this step was told was wrong |
| `entered` | The step whose `onEnter` ran and whose `onLeave` has not |
| `enteredStory` | The same, one level up |
| `preparing` | `'story'`, `'step'` or `undefined`. Which `onEnter` is in flight |
| `announced` | The step `onStep` was last told about. Every `previous` is read from here |
| `generation` | Bumped on every start, arrival and stop. A late callback checks it |
| `settling` | Whether the presenter is still moving what it last drew |

`state` is derived rather than stored, at `machine.ts:147`.

```ts
get state(): MachineState {
  if (!this.position) return 'idle'
  return this.preparing || this.settling ? 'transitioning' : 'running'
}
```

It used to be a field called `currentState`, written at the handful of places
that knew it had changed. One of them did not know. A target lost after a slow
`onEnter` left `transitioning` on a tour that was never going to settle, and
a host could not tell a slow step from a stuck one. The suite asserted `state`
26 times before that fix and every one of them sat somewhere the write did
happen.

Nothing can forget to write an answer that nobody stores. If you add a field
here, ask whether it is a fourth way of saying something three fields already
say.

`generation` is the pattern to learn. Every call into the application can take
the tour somewhere else before it returns. An `onEnter`, an `onLeave`, an
`onStep`, an `onValidationError`. So each of them captures `run = this.generation`
and checks it before touching anything afterwards. You will see
`if (this.generation !== run) return` eleven times in the file. Each one is a real
case somebody hit.

## The two constraints, and the line that keeps each

DESIGN.md argues both under
[Two constraints that must not be broken](DESIGN.md#two-constraints-that-must-not-be-broken).
Here is where they live in code.

**1. Never place an element over the target.**

`scrim.ts:119` sets `pointerEvents: 'none'` on the scrim. The scrim paints and
catches nothing. Its children do the catching, and those children come from
`complementRects` in `geometry.ts:160`, which returns what is left of the
surface once the holes are taken out.

That makes the constraint true by construction. The rectangles are built from
the complement of the cutouts, so nothing of Leko's can be over a target even in
principle. No clip path has to be trusted for it.

`geometry.test.ts` states it as a property: no blocking rectangle ever overlaps
a hole. `harness.ts` has `absorbed(el)`, which asks whether the tour caught a hit
at the centre of an element rather than the page underneath.

**2. Steps advance on application state, never on DOM events.**

`machine.ts:332` is the whole mechanism. A name matches a step's `awaits`, or
nothing happens.

Grep for the other half of it:

```bash
grep -rn "addEventListener\|MutationObserver" \
  packages/leko/src packages/spotlight/src packages/machine/src | grep -v "\.test\."
```

Four lines come back. One of them is a field declaration. The other three are
every listener the library installs, and none of them advances a step.

| Where | Why |
| --- | --- |
| `presenter.ts:258` | A `MutationObserver` noticing the target left the page. Reports `Host.lost` |
| `presenter.ts:272` | A `resize` listener. Reports `Host.moved` |
| `message.ts:176` | A `click` on the next control. Reports `Host.next` |

**There is no scroll listener anywhere.** Scroll tracking runs no JavaScript at
all. The scrim lives inside the thing that scrolls, so scrolling moves the scrim
and the target together, and the message is anchor-positioned so the browser
offsets it. If you find yourself adding a scroll listener, stop and read
[Design](DESIGN.md#design) first.

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
nobody has crossed with the others, and DESIGN.md's
[section on this](DESIGN.md#the-machines-tests-are-grouped-so-the-gaps-show)
says each of the three gaps it found had a bug in it.

## I want to change X

| Change | Files |
| --- | --- |
| A new option on a step or story | `leko/src/types.ts`, then `machine/src/types.ts` if the machine reads it |
| How the hole is shaped | `spotlight/src/geometry.ts` and its tests. Nothing else |
| When a step advances | `machine/src/machine.ts` only |
| Where the message goes | `spotlight/src/message.ts`, `chooseSide` and `place` |
| What the machine may ask of the presenter | `machine/src/port.ts`, then both implementations |
| Anything a user would notice | A case in `examples/sandbox/src/cases/`, stating what it proves |
| A new claim about browser behaviour | A page in `spike/`, dependency free and free of Leko |

`Target`, `ErrorUtils` and the three state literals are written out twice, in
`@annetaan/leko` and in the package underneath it. That is deliberate while
those packages are private, and DESIGN.md explains it under
[What is declared twice](DESIGN.md#what-is-declared-twice-and-why). Change one
and change the other.

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
