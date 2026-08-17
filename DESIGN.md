# How Leko works, and why

Leko highlights an element by cutting a hole in an overlay, so the user can
interact with the real element underneath.

This file is the argument for the shape of the code. Several rules here exist
only because a browser does not do what the specification suggests it might, and
a rule like that is unarguable until someone can watch it fail — so each one
cites the page under [`spike/`](spike/) that settled it. **Read the page before
overruling the rule.**

## Two constraints that must not be broken

These are the reasons Leko exists. Everything else is negotiable; these are not.

**1. Never place an element over the target.**

The highlight is a genuine hole in the scrim, produced by an even-odd `clip-path`.
If a transparent element is ever layered over the target — for click capture, for
hit-testing, for animation convenience — pointer events and focus stop reaching
the element underneath and the library loses its purpose.

**2. Steps advance on application state, never on DOM events.**

The host application reports what happened — `leko.reached('order-saved')` —
when *it* knows it happened: after its API call resolved, after its own
validation passed. Leko must not watch for clicks or input events and guess.
Guessing is what every other tour library does, and it is why they can only
*show* a flow instead of making the user *perform* it.

A call site names the event, never a step. `nextStep()` would mean "advance
whatever is showing", which forces the call site to know where in the tour it
sits: insert or reorder a step and an existing call fires at the wrong moment.
So the step declares what it is waiting for, and the two are matched.

```ts
{ id: 'save', target: 'button[type=submit]', awaits: 'order-saved' }
```

Three properties follow, and all three are the point rather than side effects:

- **A signal nobody is waiting for does nothing.** No error, and no warning on
  every unrelated call. Instrumentation is meant to stay in the source
  permanently, including in the builds where no tour ever runs, and something
  that must be free to leave in cannot complain about being left in.
- **A signal is not buffered.** Reporting `order-saved` before the story reaches
  the step that awaits it does nothing, and arriving there later does not
  consume the earlier report. A step advanced by something that happened before
  it was on screen has established nothing about the user, which is what this
  constraint is for.
- **It is a no-op while nothing is running**, so callers never need to guard.

`nextStep()` survives, for a control the host puts on screen — a next button, or
the sandbox footer. It is not the way an application reports its own state.

The instance holds every story and matches the signal against the one that is
running, so a call site reports once no matter how many stories pass through
that screen. `examples/sandbox/src/cases/two-stories.ts` is that case.

### Telling the host where the story got to is the other direction

`LekoStory.onStep` does not reopen any of this. The constraint is about Leko
**listening**: a click or input listener that decides a step succeeded is
guessing. A hook that reports where the story is decides nothing, and it is the
only way anything can draw its own progress, because a story moves when the page
reports a signal from somewhere else entirely.

The line to hold is that nothing handed back may come back in. The return value
is never read. Something that could block or redirect a transition would be
`validate` again, in a place where the application has claimed nothing.

A story carries one and so does the instance, and both fire, story first. They
are not two ways to do one thing. A readout belonging to one story should not
have to sort out which story moved on every call, which is the burden
`reached()` exists to keep out of a call site, and registering on the story
makes the answer be where the handler is. Something that spans stories cannot
work that way, so the instance hook hears all of them and is told which. The
sandbox footer is the second kind: one readout, and as many stories as a case
happens to register.

`stop()` reports the ending with no step, and so does running past the last one.
A hook that could not say "nowhere" would leave a progress readout showing the
final step for ever.

`leko.index` is there for the same reason. "Step 3 of 7" is the most common thing
a tour draws, and `leko.story` and `leko.step` between them do not answer where
in the story the step sits. A host can search `story.steps` for the step it just
read, and that search goes wrong the moment a story holds one step object twice.
`indexOf` returns the first match, so `[intro, review, edit, review, submit]`
reports 2 of 5 while the user is standing on step 4. Steps are plain objects with
no identity of their own, and a host building them from data shares them without
meaning to. The counter walks backwards and nothing throws. Leko is holding the
position anyway, so it hands it over, and `story.steps.length` stays where the
total comes from.

### Getting the names back, without maintaining a list

A signal name is a string on both sides. The call site writes
`leko.reached('order-saved')` and the step writes `awaits: 'order-saved'`, and
somebody writing that step a month later has to spell it the same way. A typo
does not fail. The step waits, nothing advances, and the console says nothing,
because a signal nobody is waiting for is silent by the rule above. That rule is
right for instrumentation. It is no help at all to a person guessing at a
string.

What an engineer should get is this. Write the `reached()` call where the thing
happens. Write the story afterwards, and have the editor offer the name.

I wanted the compiler to do it on its own. TypeScript 5.9.3 cannot. It reads a
declaration and flows it out to the uses, and it never runs backwards from call
sites to a type. There is no way to ask it for every argument of every call to a
method, because nothing collects those anywhere. Every library that looks like
it does this has one declared value at the root. Zod has the schema, tRPC has
`typeof appRouter`, TanStack Router has the route tree and an `interface
Register`.

So something outside the type system has to gather them, and
`packages/codegen/` is that thing. It walks the project, collects the names, and
writes a declaration file that augments an interface the core exports empty:

```ts
export interface LekoSignals {}
export interface LekoStrict {}
```

The generated file is what fills them in, and a project that never runs the
generator has both empty, `awaits` as `string`, and nothing to import or
configure. **A project that wants none of this cannot tell it shipped.** The
interfaces hold no values, so nothing reaches a bundle either.

It asks the compiler rather than the text, which is the reason it is worth
writing at all. A name kept in a constant resolves the same as one written at
the call site, so `reached(ORDER_SAVED)` contributes `order-saved` from a file
away. A value narrowed to two names contributes both. A `reached` belonging to
some other class called `Leko` contributes nothing, because the package is
resolved from the file doing the calling and the method's own declaration is
compared against the one it exports.

A name built at runtime is the case with no honest answer. `` reached(`step-${i}`) ``
reports something the scan cannot see, and a vocabulary missing it is
incomplete. The generator prints every call like that rather than passing over
it, and a project with any of them wants `--loose`.

#### Strict on `awaits`, never on `reached()`

The vocabulary came from the call sites. That makes the two sides different, and
the types are different to match.

A name in `awaits` that is missing from the vocabulary is a step waiting for a
report nothing in the project makes. It advances for nobody. So the generated
file also declares `LekoStrict`, and that name fails to compile. This is the
whole point of gathering rather than declaring: a list maintained by hand is
only as complete as somebody remembered to make it, and no compiler should fail
a build over one of those. A list gathered from the code is a fact about the
code.

`reached()` keeps every string, always. A call there is instrumentation meant to
stay in the source permanently, including in builds where no tour ever runs, and
a type error would talk people into deleting the call. The calls are also where
the vocabulary comes from, so an error there would only ever fire in the moment
between typing a new name and the generator running. `--loose` drops the promise
for a project that needs it and keeps the completion.

#### What this deliberately does not do

- **It does not check that a declared name is awaited by some story.** The other
  direction is answered, and this one is not. Reporting a name no story waits
  for is normal and permanent, which is the point of the rule above it.
- **It does not cover story ids.** `start('first-order')` deserves the same
  treatment through a third interface beside these two. It was left out to keep
  the first one small.
- **It does not put the generator inside the core.** `packages/core` has no
  dependencies and this needs the TypeScript compiler API, so it is a package of
  its own that a consumer installs only if they want it.

#### The one trap

**The augmenting file has to be a module.** Drop that block into a `.ts` file
with no `import` and no `export` of its own and `declare module` declares an
ambient module rather than augmenting this one. No completion appears, and no
error anywhere explains why. The generated file ends in `export {}` for exactly
this reason.

The same shape of failure catches the output itself. A declaration file outside
the `include` of the tsconfig is compiled by nobody, so the augmentation never
applies and again nothing reports a problem. The generator checks its own output
against the project after writing it and says so, because nothing else will.

`packages/core/type-tests/` holds the three states, one `tsconfig` each: no
vocabulary, a vocabulary, and a vocabulary with the promise. An augmentation
applies to a whole compilation, so they cannot be three files in one program.
The strict one asserts a `@ts-expect-error`, which is the only way to assert that
something does not compile.

## What Leko does not do

Leko manages the sequence of steps and draws them. The state the application is
in, and the way a tutorial is dressed, stay with the application.

That boundary is not modesty. Typing into an input on the user's behalf,
intercepting keystrokes so that only one value can be entered, winding a clock
forward, moving a cursor across the screen, revealing a message one character at
a time — each of these has to reach into the host's reactivity model or impose a
visual language on it. A tutorial written without Leko needed all of them, and
each was a few dozen lines of ordinary application code. None of them is
geometry, and geometry is what this library is for.

Nothing here stands in the way of any of them. Because Leko never places an
element over the target, the application is free to drive the real elements
while a step is showing — which is the same property the user relies on.

A story that is not running observes nothing, either. It would be easy to let
every registered story follow along in the background so that starting one
resumes where the user happened to have got to, and it would be wrong: progress
recorded while nobody was shown a step is not evidence that the user followed
it. Resuming is `start(storyId, stepId)`, which the application asks for on
purpose. A signal cannot start a story for the same reason — instrumentation
reports what happened, and does not decide that a tutorial begins.

Leko also does not advance a step because time passed. A caller that wants that
can report a signal from a timer, but a step that ends after five seconds has
established nothing about whether the user did anything, and establishing that
is what the second constraint is for.

## Design

A cutout is a `clip-path`, never a stack of elements. `.leko-scrim` is a
full-size overlay whose `clip-path` is a single `path(evenodd, …)` — an outer
rectangle, plus one rounded-rectangle subpath per cutout. A step with five
cutouts costs five subpaths and no more elements than a step with one
([`spike/cutout-techniques/`](spike/cutout-techniques/), T5).

Even-odd turns each inner subpath into an absence of geometry rather than a
transparent overlay, so pointer events, focus and hit-testing reach whatever is
underneath, untouched. Winding direction of the subpaths is irrelevant under
even-odd. Corners are arc commands, so a cutout stays crisp at any size.

The scrim itself is not one element, and neither reason has anything to do with
the cutout. There is **one scrim per scrolling ancestor**, and each one carries
plain `.leko-block` rectangles as children: the first is what scrolling costs,
the second is what a wheel costs. Both are argued under the headings below —
read them before deleting either.

**`clip-path` cannot read layout, and no CSS route exists from an element's box
to a `clip-path`.** `anchor()` resolves only in inset properties; a custom
property carrying an `anchor()` still substitutes back into one. So JS measures
the targets and writes the path
([`spike/cutout-techniques/`](spike/cutout-techniques/), T3).

**It measures at step boundaries, never per frame.** Both of the usual reasons
to run position math every frame are avoidable:

- **Scrolling** — the scrim lives *inside* the scrolling content, sized to it,
  with the path in content coordinates. Scrolling moves scrim and targets
  together and nothing needs recomputing. A scrim placed outside the scroller it
  highlights into will drift the moment that scroller moves
  ([`spike/cutout-techniques/`](spike/cutout-techniques/), T6a and T6b).

  That leaves the rest of the page, which the inner scrim cannot reach, so there
  is **one scrim per scrolling ancestor**, innermost first and always ending at
  the document. Only the innermost carries the step's cutouts; each outer one is
  cut to the padding box of the scroller nested inside it — its padding box, not
  its border box, or the scroller's own border stays lit as a hairline. Those
  outer holes move only when layout does, never when something scrolls.

  **Every layer paints and catches nothing; plain rectangles in the gaps between
  the cutouts do the blocking** (`complementRects`). A `clip-path` takes an
  element out of hit-testing but **not** out of the search for what a wheel
  should scroll: an engine answers a wheel over a hole with the scrim and
  scrolls whatever the scrim sits in, so a scrollable element under a hole stops
  scrolling under the pointer. Firefox routes such a wheel to the element,
  Chromium does so only while the scrim's own container has nothing left to
  scroll, WebKit never does — the CSS promises nothing either way
  ([`spike/wheel-through-a-hole/`](spike/wheel-through-a-hole/)).

  Do not go back to blocking with the clipped element, however much tidier one
  element looks. `elementFromPoint` reports the hole open the whole time the
  scrolling is broken, so it is checked by geometry in the tests and never by
  hit-testing. Rectangles also make constraint 1 true by construction: they are
  built from the complement of the cutouts, so nothing of Leko's can be over a
  target even in principle. `examples/sandbox/src/cases/scrollable-target.ts` is
  the case that would catch a regression by hand.

  It is also why **only one story is ever visible**. An instance registers as
  many as the application has and shows one, and that is structural rather than
  a simplification: a second story's rectangles are the complement of a
  *different* set of holes, so they land squarely on the first story's target.
  Two tours on screen together break constraint 1 whatever the API allows, which
  is why the API does not allow it.
- **Morphing** — every path emitted here has the same segments in the same
  order, so two of them blend by walking their numbers in step, corner radius
  included. Changing the number of cutouts breaks that correspondence: collapse
  a departing cutout to zero area instead of dropping its subpath
  ([`spike/cutout-techniques/`](spike/cutout-techniques/), T7 and T8).

  The blend is written frame by frame from the main thread, and that is
  deliberate. Handing `clip-path` to the Web Animations API puts it on the
  compositor, and Chrome rasterises a composited clip path at the wrong scale on
  a 2x display — for the length of the animation the scrim covers a quarter of
  what it should, then snaps right when it ends. Pausing such an animation fixes
  it, which is how the compositor was identified. Do not move this back onto
  `element.animate()` without checking that on a 2x display first
  ([`spike/waapi-clip-path/`](spike/waapi-clip-path/), and
  [crbug.com/542859657](https://issues.chromium.org/issues/542859657)).

Any change that reintroduces per-frame JS **position math** is a regression.
That rule is about reading layout while the user scrolls, which is where jank
comes from; scroll tracking runs no JS at all and must stay that way. A bounded
morph writing a precomputed string each frame reads nothing and is not the same
thing.

**The step's message is in the top layer, anchored to the target.** It cannot go
where the scrim goes: the scroller would clip it at its own edge, which is the
one place a message needs room. It cannot be positioned from measurements
either — that is JS on every scroll again.

So the action target is given an `anchor-name`, and gets back whatever it had
when the tour lets go of it. The message is a `popover`, which puts it over the
scrim without bidding on a `z-index` the host page can always outbid. An
anchor-positioned element is offset by the scroll of everything between it and
its anchor, by the browser — the scrim's scroll tracking, arrived at from the
other end.

JS picks the side, once per step, from viewport measurements it already has, and
turns the distance between the anchor and the furthest cutout into a margin, so
the message clears every hole rather than only the one it is named after.
`position-try-fallbacks` covers what a measurement could not — a target scrolled
towards the edge afterwards — but Safari has it from 26, so it is an enhancement
on top of that choice and never the mechanism.

A morph takes the message away and places it again once the cutout has arrived.
Which side has room is a fact about where the cutout ends up, so there is no
honest place for it while the hole is still in flight.

**The core has no runtime dependencies and must stay that way.** Do not reach for
an animation library — a scalar tween is all this needs, and a dependency here
would be a licensing and bundle-size liability for every consumer.

## Layout

```
packages/core/       the `@annetaan/leko` package
  src/types.ts       public types (LekoStep, LekoStory, LekoOptions, LekoState)
  src/geometry.ts    target resolution, unions, and the path the scrim is clipped to
  src/scrim.ts       the scrim element: where it mounts, how it morphs
  src/message.ts     the step message: where it mounts, how it keeps up
  src/leko.ts        the state machine
  src/index.ts       public entry point
  src/*.test.ts      browser tests; excluded from the published build
  src/leko.css       optional; the --leko-* defaults, written out to be findable
  type-tests/        one tsconfig per vocabulary state; run by `pnpm typecheck`
packages/codegen/    the `@annetaan/leko-codegen` package
  src/scan.ts        the walk: every name a reached() call reports
  src/emit.ts        the declaration file that comes out, as a string
  src/generate.ts    tsconfig, disk and the watch
  src/cli.ts         leko-signals
  src/vite.ts        the same thing, run by a dev server nobody has to remember
  fixtures/app/      a project to scan, including a Leko that is not one
examples/sandbox/    the situations a tour has to survive, one per case
  src/cases/         each states what it proves, and its steps
spike/               standalone pages, one browser question each
```

`spike/` is where the awkward answers are kept: the pages are dependency-free,
use no Leko, and judge themselves where they can. Read them before changing how
the scrim is built, and add one whenever a decision would otherwise rest on
trust. [`spike/README.md`](spike/README.md) lists what each one answers.

The sandbox is not a showcase. Every case is something a user does — typing,
waiting for a request, scrolling a panel — because a demo where the user only
watches proves nothing about a library whose whole claim is that they do not.
It is also the first consumer of the public types, so an API that reads badly in
`src/cases/` reads badly everywhere.

## A functional core, and a thin imperative shell

**Write in a functional style wherever the code allows it.** Pure functions,
values rather than mutation, expressions rather than statements, and standard
list operations in place of loops that accumulate into a variable.

This is not decoration. Everything difficult in this library is geometry —
what a path is, what is left of a surface once the holes are taken out — and
geometry is exactly what a pure function is good at. `src/geometry.ts` takes
numbers and returns numbers, touches no DOM, and can therefore be tested by
stating properties rather than by driving a browser: *no blocking rectangle ever
overlaps a hole*, *every path has the same segment list*. Those tests are the
ones that have actually caught things.

The shell is deliberately thin. Reading layout, writing styles and owning the
lifetime of an element are the parts that cannot be pure, so they are kept in
`scrim.ts`, `message.ts` and `leko.ts` and kept small — decide with a function,
then apply the answer. When a piece of logic starts being hard to follow inside a
class, that is usually a sign it wanted to be a function in `geometry.ts` with a
test of its own.

Mutation inside a function that is pure from the outside is not a sin, but reach
for it only when the alternative is genuinely worse.

## Why the tests run where they do

**jsdom is not an option here.** It has no layout, and every claim this library
makes is about layout the browser actually performed — where a box ended up,
what hit-testing returns at a point. A test that cannot see layout cannot test
this library, so the suite runs through Vitest's browser mode instead.

All three engines run because the two things the library is built on are ones
engines disagree about: what `clip-path: path()` interpolates, and how much of
anchor positioning exists. A test that depends on the second asks `CSS.supports`
first, so a browser that degrades reports that rather than a failure.
**Playwright's WebKit is a WebKit build, not Safari.** Its user agent carries a
`Version/` token all the same, and that token is not a Safari release anyone can
install — passing here is not evidence about any particular Safari, and the
floor below still has to be checked on the real thing.

`packages/codegen` runs in Node instead, as its own Vitest project. It reads
TypeScript source and writes a file. There is no layout in any of that and no
DOM to be wrong about, and running it three times in three browsers would prove
nothing and cost three times as much. The rule is about what a test needs to see,
and these two need different things.

## Browser support

The cutout needs `clip-path: path()` and interpolation between two path values.
**The floor this implies has not been measured — do not quote one until it has.**
The source also uses ES2023 array methods, which is a floor of its own and a
lower one; it is Baseline, but it is an input to that measurement.

CSS Anchor Positioning (Chrome/Edge 125+, Firefox 132+, Safari 18.2+) places the
message beside a cutout and nothing else, so it degrades rather than fails:
without it the message docks to the foot of the viewport, which is plainer than
being beside the hole but never points at the wrong place. Note `@position-try`
and `position-try-fallbacks` need Safari 26+, so neither may carry anything on
its own.

## Where things are written down

Why the design is the way it is belongs in this file, next to the rule it
explains. The evidence for it belongs in [`spike/`](spike/). How to work in the
repository belongs in [CONTRIBUTING.md](CONTRIBUTING.md). Anything a contributor
would need in order to argue with a decision should already be in one of those
three places.
