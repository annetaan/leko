# Leko's design

Leko highlights an element by cutting a hole in an overlay, so the user can
interact with the real element underneath.

That is the core of it. A tour needs more than the hole, though. It has to keep
track of where it is, and it has to work with the application around it.

State that accounts for async work is where the bugs live. So the value here is
not only the spotlight. Getting the state logic good enough to trust matters
just as much.

This file holds the rules. Where a rule exists because of what a browser does,
it names the page under [`spike/`](spike/) that settled it. **Open that page
before overruling the rule.** Situations a tour meets are cases under
[`examples/sandbox/src/cases/`](examples/sandbox/src/cases/), named below by
file. How the code got here is in the commits.

## Two constraints that must not be broken

These are why Leko exists. Everything else is negotiable. These are not.

**1. Never place an element over the target.** The highlight is a real hole,
cut by an even-odd `clip-path`. Layer anything over the target, transparent or
not, and pointer events and focus stop reaching the element underneath. The
library loses its purpose at that moment.

**2. Steps advance on application state, never on DOM events.** The host
reports what happened. It calls `leko.reached('order-saved')` when it knows the
thing happened, after its API call resolved, after its own validation passed.

## Signals and steps

A call site names the event. It never names a step. `nextStep()` would mean
"advance whatever is showing", which forces the call site to know where in the
tour it sits. Insert a step and an existing call fires at the wrong moment. So
the step declares what it waits for, and the two are matched.

```ts
{ id: 'save', target: 'button[type=submit]', awaits: 'order-saved' }
```

Three properties follow. All three are the point rather than side effects.

- **A signal nobody waits for does nothing.** No error, and no warning on every
  unrelated call. Instrumentation is meant to stay in the source permanently,
  including in builds where no tour ever runs. Something that must be free to
  leave in cannot complain about being left in.
- **A signal is not buffered.** Reporting a name before the story reaches the
  step that awaits it does nothing, and arriving there later does not consume
  the earlier report. A step advanced by something that happened before it was
  on screen has established nothing about the user.
- **It is a no-op while nothing runs**, so callers never write a guard.

`nextStep()` survives for a control the host puts on screen. An application
reporting its own state uses `reached()`.

The instance holds every story and matches the signal against the one running.
A call site reports once, however many stories pass through that screen.
See `two-stories.ts`.

## The next control

A step that declares no `awaits` gets a next control on its message. A step that
declares one never does. Put a button beside the instruction on a step waiting
for `order-saved` and the user can press past the work that step exists to make
them do. One button defeats the second constraint.

**Which steps have a control is derived from `awaits`, and a story cannot
configure it.** `LekoOptions.nextLabel` only says what the control reads.

Without a control, two actions have to share one step. "Type 3, then place the
order." The interface got coarser because the application had nothing to report.
Pressing the control claims the moment has come, the way `reached()` does. Both
routes run the same `validate`, and the step still decides. Everything reaching
the control inside one frame is the same press. See `next-control.ts`.

## A failed attempt

`onValidationError` is handed two things, `shake()` and `setError()`.

**`setError()` puts the reason under the instruction. It does not replace it.**
A user who has just been told they were wrong needs to still read what they were
asked for. Nothing takes the reason away again. It goes when the next attempt
succeeds or the step changes, because those are the two moments it stopped being
true. A `clearError()` would only invent a way to leave a stale complaint on
screen.

`onValidationError` returns `void`, so a handler is free to look something up
and call back two steps later. **Utils held that long do nothing.** Whatever
they had to say belongs to the step that was attempted or to nowhere.
See `late-reason.ts`.

Leko does not hold the instruction. `step.message` is read every time it draws,
and `StepBase.message` is `readonly` to say so.

## Registering a story

`setStory(story)` puts a story in the map under its id, replacing whatever was
there. A component that registers on every render does not accumulate copies of
itself, which is the only reason it replaces rather than adds.

That is all it is for. The instrumentation goes into an application first, and
the stories come later, so `setStory` exists to let a story appear at any point
before something calls `start()` with its id.

**A `setStory` naming the story the tour is on does nothing, and answers
`false`.** It is never a way to change a tour while somebody is walking through
it. Swap the object and the steps move under the position the tour is holding.
A story shorter than the tour has gone leaves it standing nowhere. The
re-rendering component is the case that matters, and refusing serves it: the
tour keeps the object it entered.

There is no `deleteStory`. Registering by id is a development-time convenience,
and the map only grows where ids are themselves dynamic, which nothing has asked
for. A pair to `setStory` also lets a registration call end a tour as a side
effect, and nothing else in the API does that.

## Saying where the tour got to

`LekoStory.onStep` does not reopen the second constraint. That constraint is
about Leko **listening**. A click listener deciding a step succeeded is
guessing. A hook reporting where the story is decides nothing, and it is the
only way anything can draw its own progress.

The line to hold is that nothing handed back may come back in. **The return
value is never read.** Something that could block a transition would be
`validate` again, in a place where the application has claimed nothing.

A story carries one and so does the instance. Both fire, story first. Register
on the story and the answer to "which story moved" is where the handler sits.
Something spanning stories cannot work that way, so the instance hook hears all
of them and is told which. `stop()` reports the ending with no step, and so does
running past the last one. A hook that could not say "nowhere" would leave a
progress readout showing the final step for ever.

**A handler may start or stop a story.** `start()` reports the ending of
whatever was running before it sets up what comes next, so a handler on that
ending can start a story of its own. **The most recent call wins rather than the
outermost**, because it was made with more information than the one that
triggered it.

**`start()` answers whether the story it named is the one now running.
`reached()` still does not.** A `reached()` call is instrumentation, and most of
the time no step waits for it. `start()` is the host giving an order, and a
story id it got wrong has no symptom at all. A name is checked where somebody
meant it as a name, and left alone where it is a report about the world. That is
the asymmetry `awaits` and `reached()` already have, one layer down.

`previous` is the step a host was last **told about**, not the step the tour came
from. `index` is there so a host never searches `story.steps`. A step is a plain
object with no identity of its own, and a story holding the same one twice makes
`indexOf` return the first of them.

**Without an `onTargetLost` handler the tour stops. With one, nothing stops.**
Registering a handler is taking the tour over, and Leko goes on holding it where
it was. `state` reads `running`, `step` names the step whose target has gone,
and the scrim keeps its last shape. Log the problem and return, and the user is
left under a dimmed page with a hole over nothing. See `target-disappears.ts`.

## What a step and a story assume

A step usually assumes something. A record exists, a panel is open. The story
around it assumes the same kind of thing one level out. Put that on the first
step's `onEnter` and you have said it belongs to that step, and `start(id, 2)`
skips past it. So `LekoStory` and `LekoStep` each have an `onEnter` and an
`onLeave`.

**`onEnter` runs first, and the target is resolved after it settles.** Resolve
first and the selector reads a page the step has not set up yet. That order is
the whole reason the hook is worth having.

**A tour goes in outermost first and comes out innermost first.**

```
story onEnter → step onEnter → resolve the target → draw → onStep
```

The ending mirrors it. The report goes last because a progress readout hearing
about a step while its `onEnter` still runs is naming something the user cannot
see. A handler that returns nothing costs no turn.

**Every `onEnter` gets its `onLeave`.** It runs where the handler failed
halfway, and where something overtook it, because a handler that registered
something before it fell over is owed one. `onLeave` is given where the tour is
going, since a panel that two steps use in turn is worth leaving open. Starting
another story counts as ending.

**A rejection stops the tour, and the reason is thrown again.** The state the
step assumes was never built, so drawing it would point the user at something
that is not ready. There is no hook for that failure. The rejection came from
the application's own code, and the place with the context to do something about
it is the handler that threw. See `step-setup.ts` and `story-setup.ts`.

**A signal arriving while `onEnter` is in flight is dropped where it stands.**
The state that step assumes is half built, its target has not been looked for,
and it has never been on screen. There is no step here to advance away from.
Mid-morph is the opposite and the call goes through, because a morphing step has
been through the whole arrival and the user is looking at it.

`stop()` and `start()` overtake an `onEnter`, because those are the host saying
the tour goes elsewhere. `prevStep()` overtakes a step's `onEnter` too. A back
button under a dimmed page is what someone reaches for while a slow step loads.
**A story's `onEnter` is not overtaken by it.** Every step is waiting on that one
handler, so the step behind is no readier than the step ahead.

## `state` is derived

`state` is derived rather than stored. Three fields each say one thing, and
it is read off them.

```ts
get state(): MachineState {
  if (!this.position) return 'idle'
  return this.preparing || this.settling ? 'transitioning' : 'running'
}
```

`position` is where the tour is, and being idle is it being `undefined`. It
holds the story and the index together because they are one fact. `preparing` is
which `onEnter` is in flight. `settling` is whether the presenter is still
moving what it last drew.

**Nothing can forget to write an answer that nobody stores.** Before adding a
field here, check whether it is a fourth way of saying what three fields already
say.

## Gathering the vocabulary from the call sites

A signal name is a string on both sides, and a typo does not fail. The step
waits, nothing advances, and the console says nothing, because a signal nobody
waits for is silent by the rule above. That rule is right for instrumentation.
It is no help to a person guessing at a string.

So something outside the type system gathers them. `packages/codegen/` walks the
project, collects every name a `reached()` call reports, and writes a
declaration file that augments an interface the core exports empty. The compiler
cannot do this alone. It reads a declaration and flows it out to the uses, and
it never runs backwards from call sites to a type.

```ts
export interface LekoSignals {}
export interface LekoStrict {}
```

A project that never runs the generator has both empty, `awaits` as `string`,
and nothing to import or configure. **A project that wants none of this cannot
tell it shipped.** The interfaces hold no values, so nothing reaches a bundle.

It asks the compiler rather than the text, so a name kept in a constant counts
from a file away. A name built at runtime cannot be gathered, and the generator
prints every call like that rather than passing over it. A project with any of
them wants `--loose`.

**Strict on `awaits`, never on `reached()`.** A name in `awaits` that is missing
from the vocabulary is a step waiting for a report nothing in the project makes.
It advances for nobody, so it fails to compile. A list maintained by hand is
only as complete as somebody remembered to make it, and a list gathered from the
code is a fact about the code. Only the second kind should fail a build. A type
error on `reached()` would talk people into deleting the call.

**The augmenting file has to be a module.** Drop that block into a file with no
`import` and no `export` of its own and `declare module` declares an ambient
module instead. No completion appears, and no error explains why. A declaration
file outside the tsconfig's `include` is compiled by nobody and fails the same
silent way. The generator checks its own output against the project after
writing it and says so, because nothing else will.

What this deliberately leaves alone. **A declared name nobody awaits is normal
and permanent**, so it is not checked. **Story ids are outside the vocabulary**,
left out to keep the first version small. **The generator stays out of the
core**, which takes no third-party dependencies and would need the TypeScript
compiler API.

`target` has the same hole, with an easier answer. Signal names had to be
gathered from the call sites because nowhere else knows them. Element names can
be declared. One table of name to selector gives `keyof` the union of names a
step may point at. **The usual weakness of a hand-maintained list does not bite
here**, because a name missing from the table means the element cannot be
targeted and nothing more. Adopting it means answering one more question at the
same time: what happens when a name matches several elements.

## What Leko does not do

Leko manages the sequence of steps and draws them. The state the application is
in, and the way a tutorial is dressed, stay with the application. Typing into an
input on the user's behalf, intercepting keystrokes, moving a cursor across the
screen, revealing a message one character at a time. Each of these reaches into
the host's reactivity model or imposes a visual language on it. None of them is
geometry. **Because Leko never places an element over the target, the
application is free to drive the real elements while a step is showing.**

**A story that is not running observes nothing.** Progress recorded while nobody
was shown a step is not evidence that the user followed it. Resuming is
`start(storyId, stepId)`, which the application asks for on purpose. A signal
cannot start a story for the same reason. **Time passing does not advance a step
either.** A step that ends after five seconds has established nothing about
whether the user did anything.

**There are no chapters.** Grouping steps, jumping between the groups, recording
how far somebody got. All of it is worth wanting, and none of it is here. Give a
chapter setup of its own and it stops being a label and becomes an object,
`index` starts counting something else, and resuming into the middle of one
needs a rule. `LekoStep.meta` is there instead. Leko carries it and never reads
it.

## Drawing

A cutout is a `clip-path`, never a stack of elements. The `clip-path` on
`.leko-scrim` is a single `path(evenodd, …)`, an outer rectangle plus one
rounded-rectangle subpath per cutout. Five cutouts cost five subpaths and no
more elements than one
([`spike/cutout-techniques/`](spike/cutout-techniques/), T5). Even-odd turns
each inner subpath into an absence of geometry rather than a transparent
overlay. Winding direction does not matter under it.

**`clip-path` cannot read layout**, and no CSS route exists from an element's
box to a `clip-path`. `anchor()` resolves only in inset properties. So JS
measures the targets and writes the path (T3). **It measures at step boundaries,
never per frame.**

### Scrolling

The scrim lives **inside** the scrolling content, sized to it, with the path in
content coordinates. Scrolling moves scrim and targets together and nothing
needs recomputing. **Scroll tracking runs no JS at all** (T6a and T6b, and
`nested-scroller.ts`).

That leaves the rest of the page, so there is **one scrim per scrolling
ancestor**, innermost first and always ending at the document. Only the
innermost carries the step's cutouts. Each outer one is cut to the **padding
box** of the scroller nested inside it. Cut it to the border box and the
scroller's own border stays lit as a hairline.

**Every layer paints and catches nothing. Plain rectangles in the gaps between
the cutouts do the blocking** (`complementRects`). A `clip-path` takes an
element out of hit-testing but **not** out of the search for what a wheel should
scroll, so a scrollable element under a hole stops scrolling under the pointer.
Firefox routes such a wheel to the element, Chromium does so only while the
scrim's own container has nothing left to scroll, and WebKit never does
([`spike/wheel-through-a-hole/`](spike/wheel-through-a-hole/), and
`scrollable-target.ts`).

**Do not go back to blocking with the clipped element**, however much tidier one
element looks. `elementFromPoint` reports the hole open the whole time the
scrolling is broken, so the tests check this by geometry. Rectangles also make
constraint 1 true by construction. They are built from the complement of the
cutouts, so nothing of Leko's can be over a target even in principle.

That is also why **only one story is ever visible**. A second story's rectangles
are the complement of a *different* set of holes, so they land squarely on the
first story's target.

### The morph

Every path emitted here has the same segments in the same order, so two of them
blend by walking their numbers in step. **Changing the number of cutouts breaks
that correspondence. Collapse a departing cutout to zero area rather than
dropping its subpath** (T7 and T8).

**The blend is written frame by frame from the main thread.** Handing
`clip-path` to the Web Animations API puts it on the compositor, and Chrome
rasterises a composited clip path at the wrong scale on a 2x display. Check that
on a 2x display before moving this back onto `element.animate()`
([`spike/waapi-clip-path/`](spike/waapi-clip-path/), and
[crbug.com/542859657](https://issues.chromium.org/issues/542859657)).

The morph is driven by `requestAnimationFrame`, so **it stops in a tab nobody is
looking at**. Nothing is broken. It resumes and finishes the moment the tab is
looked at again, and a signal arriving in that window still advances the step,
because `advance()` reads the in-flight flag rather than `state`.

**Any change that reintroduces per-frame JS position math is a regression.**
That rule is about reading layout while the user scrolls, which is where jank
comes from. A bounded morph writing a precomputed string each frame reads
nothing and is a different thing.

### The message

**The message is in the top layer, anchored to the target.** It cannot go where
the scrim goes, because the scroller would clip it at its own edge, and the edge
is where a message needs room. It cannot be positioned from measurements either.
That is JS on every scroll again.

The action target is given an `anchor-name` and gets back whatever it had when
the tour lets go. The message is a `popover`, so it sits over the scrim without
bidding on a `z-index` the host page can always outbid. An anchor-positioned
element is offset by the scroll of everything between it and its anchor, by the
browser.

JS picks the side once per step and turns the distance between the anchor and
the furthest cutout into a margin, so the message clears every hole rather than
only the one it is named after. `position-try-fallbacks` covers what a
measurement could not, and it is an enhancement on top of that choice rather
than the mechanism.

**The core has no third-party runtime dependencies and must stay that way.** A
scalar tween is all this needs, and a dependency here would be a licensing and
bundle-size liability for every consumer. `@annetaan/leko-spotlight` ships from
this repository under the same licence, so the rule is not about it.

## Three packages, and the seam between them

- `packages/machine` decides which step the tour is on. **Its `lib` is `ES2023`
  alone, so a `document` there is a compile error.** Its tests run in Node
  against a fake.
- `packages/spotlight` draws the scrim, the hole and the message. It does not
  know what a step is.
- `packages/leko` wires the two together, owns the public types, and is the only
  one that publishes.

What each half may ask of the other is `packages/machine/src/port.ts`.

**The presenter never schedules itself.** It reports what it noticed through
`Host` and waits. Whether the tour may be measured at all is a fact about the
machine's state, and one owner for that guard is the point.

**The presenter never decides whether there is a next control.** `Content.next`
is filled in by the machine, derived from `awaits`. The second constraint
depends on that rule, and a presenter free to decide it would be a way to
configure the rule back off.

**The presenter is told, and never asks back.** None of `Host`'s three members
returns anything. The story is a parameter of `show`, `place` and `retell`, so
the drawing half never reaches into the state half to answer a drawing question.

`Target`, `ErrorUtils` and the three state literals are written out in both
packages. That is deliberate while the lower two are private, since a published
`.d.ts` referring to `@annetaan/leko-machine` would not resolve in anyone's
project. `@annetaan/leko` bundles both halves in with `tsdown`, so a consumer
installs one package with no runtime dependencies. **`pnpm check:pack` reads
what `npm pack` would send and fails on a bare import the manifest does not
depend on.**

## How to write here, and where tests go

**Write in a functional style wherever the code allows it.** Everything
difficult in this library is geometry. `geometry.ts` takes numbers and returns
numbers, touches no DOM, and can therefore be tested by stating properties
rather than by driving a browser: *no blocking rectangle ever overlaps a hole*,
*every path has the same segment list*. Reading layout, writing styles and
owning the lifetime of an element cannot be pure, so they stay in `scrim.ts`,
`message.ts` and `presenter.ts` and stay small. When a piece of logic gets hard
to follow inside a class, it usually wanted to be a function in `geometry.ts`
with a test of its own.

**jsdom is not an option for anything about layout.** It has no layout, so a
claim about where a box ended up or what hit-testing returns at a point cannot
be tested with it. **What sorts a test is whether a browser could get the answer
wrong**, not whether the test mentions the DOM. The table of which project a
test belongs in is in [ONBOARDING.md](ONBOARDING.md).

All three engines run because the two things the library is built on are ones
engines disagree about: what `clip-path: path()` interpolates, and how much of
anchor positioning exists. A test depending on the second asks `CSS.supports`
first. **Playwright's WebKit is a WebKit build, not a Safari anyone can
install.** The floor still has to be checked on the real thing.

`machine.test.ts` sits in `describe` groups, one per axis the machine is asked
about. **Read them as a table.** A group holding two tests is a column nobody
has crossed with the others, and that is where the next bug is.

**The sandbox is not a showcase.** Every case is something a user *does*. A demo
where the user only watches proves nothing about a library whose whole claim is
that they do not. It is also the first consumer of the public types, so an API
that reads badly in `src/cases/` reads badly everywhere. **`spike/` pages are
dependency-free and use no Leko.** Add one whenever a decision would otherwise
rest on trust.

## Browser support

The cutout needs `clip-path: path()` and interpolation between two path values.
**The floor this implies has not been measured. Do not quote one until it has.**
The source also uses ES2023 array methods, which is a floor of its own and a
lower one.

CSS Anchor Positioning (Chrome/Edge 125+, Firefox 132+, Safari 18.2+) places the
message beside a cutout and does nothing else, so it degrades rather than fails.
Without it the message docks to the foot of the viewport, which is plainer than
being beside the hole and never points at the wrong place. `@position-try` and
`position-try-fallbacks` need Safari 26+, so neither may carry anything on its
own.

## Where things are written down

| | |
| --- | --- |
| A rule, and why it holds | this file |
| Evidence that a browser does not do what the spec suggests | [`spike/`](spike/) |
| A situation a tour meets | [`examples/sandbox/src/cases/`](examples/sandbox/src/cases/) |
| How to walk the code, the layout, which project a test goes in | [ONBOARDING.md](ONBOARDING.md) |
| How to work in the repository | [CONTRIBUTING.md](CONTRIBUTING.md) |
| Which implementation came before, and what it got wrong | the commits |

**This file carries no history.** Where a rule came out of a bug, what gets
written is the rule in the present tense and a pointer to the page or case that
shows it.
