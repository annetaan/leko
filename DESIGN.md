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

## Three constraints that must not be broken

These are why Leko exists. Everything else is negotiable. These are not.

**1. Never place an element over a target the step opened.** The highlight is a real hole, masked out of the scrim and left unblocked. Layering anything over it — transparent or not — blocks pointer events and focus, destroying Leko's core purpose. A hole the step did not open is different: blocking it is the step's own instruction carried out.

**2. Steps advance on application state, never on DOM events.** The host calls `leko.reached('action-name')` when it knows the thing happened — after its API call resolved, not when the button was clicked.

**3. Story logic stays in the story.** Adding a tour must not clutter application code. `reached()` is the one concession: the application only reports that something finished, remaining completely unaware of tour logic.

## Signals and steps

**A tour is meant to be forgettable.** Application code should never know which step is showing. `leko.reached('action-name')` is the only bridge — a statement of fact completely independent of any story.

Step advancement is driven solely by matching `awaits` against reported signals:

```ts
{ id: '...', target: 'button[type=submit]', awaits: 'action-name' }
```

### Signal behavior

- **Safe to call anytime:** Unmatched signals produce no errors and require no
  guards. Instrumentation is meant to stay in the source permanently, including
  in builds where no tour ever runs, so it cannot complain about being left in.
- **Not buffered:** Signals fired before a step appears are ignored. A step
  advanced by something that happened before it was on screen has established
  nothing about the user.
- **Matched against the running story only:** A call site reports once, however
  many stories pass through that screen. See `two-stories.ts`.

## The next control

Whether a step shows a "Next" button is derived strictly from `awaits`:

- **No `awaits`:** A Next control is shown.
- **Has `awaits`:** No Next control is shown.

**This behavior cannot be overridden or configured.** Putting a Next button on a step waiting for a signal would allow users to bypass the required application state.

Leko manages this internally — no public API exists to manually trigger a Next
action. See `next-control.ts`.

**Both sides of the seam hold the rule, doing two different jobs.** The
presenter derives whether a control is drawn, and the machine refuses to move
for a press on a step that declares `awaits`. Neither guards against a host —
no application call reaches either path — but against Leko's own derivation
being edited wrongly, the way the blocking rectangles hold constraint 1 by
construction. The refusal is silent, because only a broken Leko can make it: a
step advancing when it should not becomes a control that does nothing, which is
the right way round for the person the step is asking something of.

## The way out

**Leko always draws an un-dismissable close control to end the tour.**

Without a built-in close control, host applications risk trapping users under the scrim overlay. To ensure a guaranteed escape path, this control:

- **Cannot be disabled:** Hosts may customize its appearance via `renderClose`, but cannot remove it or assign it any action other than ending the tour.
- **Is positioned automatically:** Leko places the control in a screen corner that avoids overlapping active targets or target holes.
- **Is the only global control:** Unlike "Next" (which is step-specific and derived from `awaits`), ending the tour is always permitted and available unconditionally.

## A target is a question

A step specifies its target with a selector or a function, but both are treated as a dynamic query rather than a static reference. Leko queries the DOM on every render (at step changes, viewport resizes, and DOM mutations) and never retains element references.

```ts
type Selector = string;
type TargetFunction = () => Element | null;
type LekoTarget = Selector | TargetFunction;
interface LekoRegion { elements: LekoTarget | LekoTarget[]; interactive?: boolean }
interface LekoShownRegion { elements: LekoTarget | LekoTarget[]; interactive?: never }
interface LekoStep {
  ...
  target?: LekoTarget | LekoRegion | [LekoTarget | LekoRegion, ...(LekoTarget | LekoShownRegion)[]]
  ...
}
```

Each entry of the list is one hole, and a list never nests: several elements
become one hole by being named together in a region's `elements`, so there is
nothing else a list can mean. A bare target anywhere a region is wanted is the
region of one element. **The first entry is the region the step is about**, and
the type says so: it is the only position that may declare `interactive`, every
later entry being a `LekoShownRegion` whose `interactive` is `never` — declared
`never` rather than left off, so an object built elsewhere cannot carry the
flag past the rule structurally.

| Code Example                                     | Interpretation                                                                           |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `'#a'`                                           | Cuts a single hole around `#a`.                                                          |
| `{ elements: ['#a', '#b'] }`                     | Cuts a single hole covering the bounding box of `#a`, `#b`, and the space between them.  |
| `['#a', '#b']`                                   | Cuts two separate holes for `#a` and `#b`.                                               |
| `[{ elements: ['#a', '#b'] }, '#c']`             | Cuts two holes: one covering the union of `#a` and `#b`, and one for `#c`.               |
| `[{ elements: '#a', interactive: true }, '#b']`  | Cuts two holes, and opens the first.                                                     |
| `undefined`                                      | Cuts no holes, dimming the entire screen.                                                |

`adjacent-columns.ts` is the union; `linked-regions.ts` is two separate holes.

### Resolution & custom functions

- Selector: Evaluated by Leko. Use as default.
- Function `() => Element | null`: Evaluated by the host. Required for Shadow
  DOM targets, framework refs (`() => ref.current`), or dynamic elements. See
  `inside-shadow-dom.ts`.
- Performance requirement: Functions are called frequently during layout
  calculations — they must be pure, lightweight, and side-effect-free.
  Returning `null` signals that the target is not yet present.
- The element type is `Element`, not `HTMLElement`: everything asked of a
  target is asked of `getBoundingClientRect`, so a shape inside an `<svg>` is a
  target like any other, `viewBox` scaling included. See `svg-target.ts`.

### The message anchors to a marker, never to the target

- An `anchor-name` is scoped to the tree its element is in. Named on a target
  inside a shadow root, it cannot be reached from the document, and nothing
  reports the failure — the box lands wherever its containing block leaves it,
  sometimes on top of the target. See
  [`spike/anchor-across-shadow/`](spike/anchor-across-shadow/).
- So the anchor is a zero-area marker of Leko's own, placed on the chosen edge
  of the cutout, living beside the scrim in the same container. It follows a
  scroll because the container carries both — no script runs.
- Leko writes nothing into the page it is pointing at.

## A hole, and whether it is open

A cutout shows what is under it, but page interaction requires
`interactive: true` on the region. It is off by default.

- Only the first region can declare it, and **the type holds that rule**: every
  later entry of `target` is a `LekoShownRegion`, where `interactive` does not
  compile. One step asks the user for at most one thing, and which hole that is
  is readable off the step. `packages/leko/type-tests/regions.ts` is the claim,
  stated as a program.
- Declared by the region, independent of `awaits`: interactivity and
  application event waiting are distinct configurations. See
  `scrollable-target.ts`, where the two come apart.
- A closed hole is blocked by a rectangle beside the scrim, never by the scrim
  itself — [`spike/blocking-a-hole/`](spike/blocking-a-hole/) is why.

## The ring focus cannot leave

To prevent Tab from escaping the tour, focus is constrained to a closed loop (ring).

- Composition: Includes the tour UI, plus the open target region only when
  `interactive: true`.
- Order: The ring is document order. The top layer changes what paints over
  what, not sequential focus navigation, so the browser already walks the order
  the ring wants
  ([`spike/tab-order-in-the-top-layer/`](spike/tab-order-in-the-top-layer/)).
- Mechanism: Intercepts keydown at the ring edges to jump over non-interactive areas, ensuring focus never lands on blocked elements.
- Boundary fallback: Invisible focusable elements at both ends of the DOM catch Tab overflow before it hits browser chrome.
- Design principle: Acts as a safety net. Edge cases (e.g., iframe, positive tabindex) bounce back into the ring within one keypress.
- Why `inert` is not used: It is inherited and cannot be lifted from a descendant, so the target region and the tour UI would go inert along with the page.
- Why a modal `<dialog>` is not used: It would inert the open target too, take focus on every step boundary, and leave the close control (a separate element in a corner) unreachable.
- Scope: Focus management only. Nothing here advances or modifies tour steps.

## A failed attempt

`validate` guards the control, and only the control. Pressing Next triggers
validation. It does not apply to `awaits` steps, where the application directly
reports the event via `reached()`.

- Design principle: The purpose of validate is to keep "Story logic stays in the story."
- Feedback behavior: A validation failure is never silent; it always triggers a cutout shake. error provides the user-facing explanation message.
- Error message lifecycle: error appears below the main instruction (never replacing it) and persists until the step changes or succeeds. To prevent stale state, error text is generated once per failed attempt and held, rather than re-evaluated on subsequent screen redraws.

## Starting a story

`start(story)` is the only external API to start a tour.

- No implicit stops: Calling `start()` while a tour is active returns
  `tour-running` and does nothing — a component that re-renders and starts its
  story again gets a refusal rather than a tour silently reset to step 1.
  Active tours must be explicitly ended with `stop()`.
- `id` is diagnostic: `id` is required for logging and external reporting, but Leko never uses it as an internal lookup key.
- Chaining with next: A story can declare `next` (a story object or a function
  returning one) to transition automatically upon completion. The function form
  is where a branch goes; see `branching.ts`.
- Completion requirement: `next` transitions occur only when a story runs to full completion. Interruptions (`stop()`, target lost, errors) terminate the tour immediately.
- Seamless transition: The transition to next is atomic — `onLeave` is notified of the destination, allowing shared UI elements to persist across stories.

## Saying where the tour got to

`onStep` is a read-only reporting hook and cannot alter or block tour transitions (return values are strictly ignored).

- Single instance hook: `onStep` lives solely on the Leko instance (not individual stories) and reports both the step and the story object to simplify state tracking.
- Termination reporting: `stop()` or reaching the end of a tour reports `undefined` for the step, allowing progress UIs to reset correctly.
- No starts from inside a report: `next` is the only way one story leads to
  another. A report naming a step is a tour that is running (`tour-running`),
  and every report of an ending happens with the gate still closed
  (`call-refused`). A host that wants a story after `stop()` writes the two
  calls in a row — `stop()` finishes the whole ending, report included, before
  it returns.
- Asymmetric API responses: Instrumentation calls (`reached()`) operate silently, whereas imperative commands (`start()`) return explicit diagnostic errors (e.g., `tour-running`, `story-empty`).

## Target loss & recovery

- A missing or replaced target gets a 100ms grace period, during which the target (selector or function) is resolved again on every mutation — so a framework re-render that swaps the node recovers without ending the tour.
- If recovery fails, the tour ends with `target-lost`. A function that returns a held element can never recover, because the old node stays disconnected — prefer selectors, or functions that resolve fresh. See `target-disappears.ts`.

## What a step and a story assume

A step assumes something — a record exists, a panel is open. The story around
it assumes the same kind of thing one level out, and for longer. So `LekoStory`
and `LekoStep` each have an `onEnter` and an `onLeave`, and setup pairs with
its clear-up at the same level instead of splitting across two.

- **Entry runs outermost first, and the ending mirrors it, innermost first:**

  ```text
  story onEnter → step onEnter → resolve the target → draw → onStep
  ```

  The report goes last because a progress readout hearing about a step whose
  `onEnter` still runs is naming something the user cannot see. The whole of it
  happens inside the call that moved the tour.
- **The story's `onLeave` runs when the run ends, after the last step's.**
  Clear-up put on the first step's `onLeave` instead fires the moment the tour
  reaches step 2, with the rest of the story still standing on what it took
  away.
- **The target is resolved after `onEnter` returns** — resolved first, the
  selector reads a page the step has not set up yet.
- **Whatever a handler hands back is dropped.** The step is drawn the moment
  the handler returns, so an `async` handler runs its first line here and the
  rest after the step is on screen. Work that has to finish before anything is
  measured is a waiting step, argued below.
- **Every `onEnter` gets its `onLeave`** — also where the handler threw
  halfway, and where a `stop()` walked out of it, because a handler that set
  something up before failing is owed one. `onLeave` is told where the tour is
  going, so a panel two steps use in turn can stay open. A story handing the
  tour on through `next` counts as ending.
- **A throw stops the tour, and the reason is thrown again.** The state the
  step assumes was never built, so drawing it would point the user at something
  that is not ready — and the handler that threw is the place with the context
  to do something about it. See `step-setup.ts` and `story-setup.ts`.

## A step that waits

**Leko waits for nothing a host hands it.** A step that has to wait is a step
of its own: it names no `target`, it declares `awaits`, and it starts the work
it waits for in its own `onEnter`:

```ts
{ id: 'wait', message: 'Loading…', onEnter: () => void loadDraft(), awaits: 'draft-loaded' }
```

`loadDraft` is the application's own function and calls
`reached('draft-loaded')` when it comes back — it says what happened, and does
not know a tour is running.

- **The wait starts the work it waits for, and that placement is the rule.**
  Signals are not buffered, so work started two steps earlier can report before
  this step exists, and the tour then waits for ever. Started here it cannot:
  an arrival runs start to finish inside one synchronous call, so the step is
  standing before any of the work can come back.
- **The tour is `running` while it waits.** The step is drawn and every call a
  host makes lands on a machine that is accepting them — which is why the wait
  is a step, not a promise held open from `onEnter`. Holding the arrival open
  would hold the gate shut for as long as the application takes, and a
  `reached()` landing in that window is dropped through no fault of the caller.
- **Nothing bounds the wait.** An application whose work can fail says so by
  catching it and calling `stop()`. The close control is on screen the whole
  time, so a user is never trapped by one.
- It gets no next control, and `validate` never runs on it — both follow from
  declaring `awaits`. A step with no `target` and no `awaits` is a full-page
  message with a next control, a legitimate thing to write.
- **It counts as a step.** `story.steps.length` and `index` include it. A host
  that wants a different progress count keys a table by step id, the way
  `story-setup.ts` keys chapters.

## A story is atomic, and stories are short

**`start(story)` replays a story from the top, and a tour only moves forward.**

- A step that declares `awaits` cannot be returned to. The step waited for
  `'action-name'`, the signal fired, the tour moved on — a back button would
  put the user on that step again, waiting for a signal that fired once and
  will not fire again. The tour hangs, by a road that carries no diagnostic,
  because nothing was dropped. Whether a signal can be reported twice is a fact
  about the application, and there is no way to ask — and a back control
  refused only on `awaits` steps would work on some steps and not others, which
  is worse than no control.
- Application state does not run backwards. `onLeave` and `onEnter` can close a
  panel again; they cannot unsave an order.
- Starting part-way in is the same mistake seen from the front: a step whose
  signal has already been reported, or whose `onEnter` assumes work the steps
  before it did.
- **So the answer to "I need to go back" and to "start me part way through" is
  a shorter story.** A story of four steps costs a few seconds to run again; a
  story of twenty does not, and twenty is where a back button starts to feel
  necessary.
- **What two paths share is a story, not a step they both point at.**
  `branching.ts` is four of them: an intro, two branches, and the summary both
  branches name in `next`. Neither branch has to know how many steps came
  before it.

## Settings, and where they are read from

- `padding`, `radius` and `scroll` are read from the step, then from the
  instance, then a built-in default. `duration`, `nextLabel` and `closeLabel`
  are read from the instance alone.
- The nearer tier that says anything wins, and `??` does the reading rather
  than `||` — a step writing `0` beats an instance writing a number.
- **A story carries no settings.** A per-story value is a `.map()` over `steps`
  in code the host already owns, and that version can vary the value inside the
  story as well. A story tier would also push `story` through the seam into the
  half that draws, where nothing else wants one.

## Nothing is drawn for a retry

The one wait Leko has on its own account is a target that is not on the page —
not yet rendered when its step is drawn, or gone since. **Nothing on screen
changes while it runs.** Whatever was drawn last stays put, and a target that
comes back costs a morph and nothing else.

That leaves a hole standing over the gap, but only for 100ms — a target is
usually missing because a framework is mid-render, so the ordinary outcome is
that nobody sees anything at all. Covering the page would make the recovery
louder than the fault, with nothing to say on it: what the application is doing
is not something Leko knows.

- A step that waits is different: it is drawn, cuts no hole, and shows the
  step's own `message`. A retry is a wait Leko is having; a waiting step is a
  wait the application declared, and only the second has anything to say about
  itself.
- The machine hears about a retry only when a step is still arriving. A target
  lost after the step was drawn changes nothing on screen and is not reported —
  a host cannot catch a window that short. Giving up is what both report, and
  `Host.lost` is that.
- `start()` on a story whose first target has not rendered blocks nothing for
  those 100ms. The tour has drawn nothing and the page is exactly as it was, so
  there is nothing for a stray click to interrupt.

## One gate, and what it refuses

**Leko never acts on a call while it is inside a call into the application.**
An arrival is such a window — from the moment a move begins until the step is
handed to the presenter, with `onEnter` inside it. A teardown is another, from
the first `onLeave` through the report of the ending: the machine opens again
only once `onStep` has returned.

- Inside either, `reached()`, `start()` and a press on the next control all do
  nothing. The step's target has not been looked for and it has never been on
  screen, so there is no step to act on. The call is dropped rather than saved,
  because a signal saved over is a step advancing on something that happened
  before it began.
- The window is one synchronous call wide: `onEnter` returns `void` and Leko
  draws the step the moment it returns, so the only way to make a call inside
  the window is from inside the handler itself — a wait is a step with
  `awaits`, never a promise a handler hands back.
- `stop()` is the exception. A handler that has decided the tour should not go
  on has nowhere else to go, and ending is the one thing that needs nothing of
  the arrival: it throws the arrival away rather than acting on it.
- The machine does not know a morph is running. A step is on screen the moment
  `show` returns; how long the drawing takes to settle is the presenter's
  business. A next press during the morph goes through — dropping it would be
  Leko deciding the user did not mean the button they pressed.

What the gate buys is that no callback has to ask afterwards whether the world
moved while it ran — which is why the state core needs no run counter. Where
that question is written by hand at every crossing, one is always about to be
forgotten.

## Saying that a call did nothing

The line between silence and a diagnostic is whether a caller doing everything
right can end up there.

- Silent: `reached()` with a name nothing waits for. Instrumentation is meant
  to stay in the source permanently, including in builds where no tour ever
  runs, so something that must be free to leave in cannot complain about being
  left in. **It must never speak**, and nothing should be added that makes it.
- Reported through `onDiagnostic`: `start()` on a story with no steps
  (`story-empty`), `start()` while a tour runs (`tour-running`), and any call
  the gate refuses (`call-refused`). None has any other symptom — the tour does
  not move, and nothing anywhere says why.
- The two refused `start()` kinds are separate because the fixes differ: a
  `call-refused` goes through a moment later; a `tour-running` is turned down
  until the tour ends, so the fix is `stop()` rather than patience.
- A next press the gate turns down is reported nowhere: the control is a button
  Leko takes off the screen for the whole of an arrival, so there is no caller
  to tell.
- A `reached()` that matched the showing step and was dropped is reported
  (`signal-dropped`): the step now waits for something the application has
  already been through, and silence there is a step hanging for no visible
  reason.

**Nothing is logged.** The core has no build-time environment to strip a
development branch with, so anything written to the console is written in
production too — `console.error` is collected by error trackers and fails test
suites, and `console.warn` still arrives where the host did not ask for it. A
step whose target never turns up is reported, not logged, for the same reason:
Leko does not know what the host wants done about it.

## `state` is derived

`state` is derived, never stored, and it answers one question: is a story
running. The two values are `idle` and `running`, read off whether the tour has
a position — being idle is having none. A derived answer cannot be forgotten or
go stale, so before adding a field, check whether it is a third way of saying
what the existing fields already say.

- **It says nothing about what the screen is doing.** A step animating in, a
  target being resolved again, and a step waiting for its signal all read
  `running`: in every one a story is on and the machine accepts calls.
- **A third value would buy less than it costs.** `transitioning` would need a
  field for the morph in flight and events to move it, and what a host gets is
  the chance to grey out a control while every call it could make still works.
- **A teardown says `idle` while it is still refusing calls.** Ending a tour
  empties the position before any handler runs, so an `onLeave` reading `state`
  is told the truth: the tour is over. A `start()` made from inside `onLeave`
  or the ending `onStep` report is still refused — the machine opens again only
  once the report has returned.
- **Everything the machine keeps is two fields** — where the tour is, and which
  window of a call into the application it is inside. Neither is a list of
  stories: `start` is handed the one it runs, so nothing is looked up and
  nothing persists between runs. `packages/machine/model/machine.qnt` has the
  same two.
- **Nothing here is about what is on screen.** Whatever draws is the thing that
  has to put the same page back on a resize or a re-render, so it is the thing
  that remembers — the words of the last failed attempt included. Neither asks
  the machine anything.
- **A call made from inside a handler runs immediately, on the same stack.** A
  `stop()` made from inside `onEnter` ends the run inside the call that was
  entering it. Nothing is queued, so no call ever acts on a world that moved
  after it was made.

## There is nothing to subscribe to

`state` is a getter and there is no `watch`. Every crossing of it is a crossing
`onStep` already reports: it fires when a step goes up and again when the run
ends with `step` as `undefined`, and a story being on is exactly the difference
between those two.

```ts
createLeko({ onStep: (step) => setTourRunning(step !== undefined) });
```

That is the `subscribe` half of a React `useSyncExternalStore`, with `state` as
the snapshot. A `watch(listener)` needs a notify where the state is written, a
microtask so no listener runs inside a machine operation, and a comparison
against the value the turn opened with — or a story handing the tour on reports
three times for one move. What it would be for is the crossings `onStep` does
not mention, and there are none: a morph landing and a target being looked for
again are the two that would qualify, and the machine is told about neither.

## Gathering the vocabulary from the call sites

A signal name is a string on both sides, and a typo does not fail: the step
waits, nothing advances, and the console says nothing, because a signal nobody
waits for is silent. That rule is right for instrumentation and no help to a
person guessing at a string.

So something outside the type system gathers the names. `@annetaan/leko-codegen`
walks the project, collects every name a `reached()` call reports, and writes a
declaration file augmenting two interfaces the core exports empty,
`LekoSignals` and `LekoStrict`.

- A project that never runs the generator has both empty, `awaits` as `string`,
  and nothing to import or configure. The interfaces hold no values, so nothing
  reaches a bundle — **a project that wants none of this cannot tell it
  shipped.**
- The generator asks the compiler rather than the text, so a name kept in a
  constant counts from a file away. A name built at runtime cannot be gathered;
  the generator prints every such call rather than passing over it, and a
  project with any of them wants `--loose`.
- **Strict on `awaits`, never on `reached()` — the asymmetry is the design.** A
  name in `awaits` missing from the vocabulary is a step waiting for a report
  nothing in the project makes. It advances for nobody, so it fails to compile,
  and the failure is honest because the vocabulary is a fact gathered from the
  code, not a list somebody remembered to maintain. A type error on `reached()`
  would talk people into deleting the call — and the vocabulary is built out of
  those calls in the first place.
- **The augmenting file has to be a module**, and inside the tsconfig's
  `include`. In a file with no `import` or `export` of its own, `declare
  module` declares an ambient module instead: no completion appears, and no
  error explains why. A file outside `include` fails the same silent way. The
  generator checks its own output against the project after writing it and says
  so, because nothing else will.

## What Leko does not do

Leko manages the sequence of steps and draws them. The state the application is
in, and the way a tutorial is dressed, stay with the application: typing into
an input on the user's behalf, intercepting keystrokes, moving a cursor across
the screen, revealing a message one character at a time — each reaches into the
host's reactivity model or imposes a visual language on it, and none is
geometry. **Because Leko never places an element over the target, the
application is free to drive the real elements while a step is showing.**

- **A story that is not running observes nothing.** Progress recorded while
  nobody was shown a step is not evidence that the user followed it, so a
  signal cannot start a story: `start(story)` is the application asking on
  purpose. **Time passing does not advance a step either** — a step that ends
  after five seconds has established nothing about whether the user did
  anything.
- **There are no chapters.** Grouping steps, jumping between the groups,
  recording how far somebody got — all worth wanting, none of it here. Given a
  setup of its own, a chapter stops being a label and becomes an object, and
  `index` starts counting something else. A step has an `id` and nothing else
  the application may hang things on: a table from id to chapter, written where
  the chapters are drawn, covers this at the cost of no library concept.
  `story-setup.ts` does exactly that.

## Drawing

A cutout is a **mask layer**, never a stack of elements. The mask on
`.leko-scrim` is one opaque layer for the surface and one image per cutout under
it, composited with `mask-composite: subtract` on the surface and `add` between
the holes, so five cutouts cost five layers and still one element. Each hole
image is an SVG in a `data:` URL, drawn at the hole's own size and laid where it
belongs with `mask-position`, so what an engine rasterises is the size of a
target rather than the size of a document.

**The holes are a union, and that is the point.** `add` between them means two
overlapping holes read as one hole. A `clip-path: path(evenodd, …)` — an outer
rectangle plus one rounded-rectangle subpath per cutout — did everything else
asked of it ([`spike/cutout-techniques/`](spike/cutout-techniques/), T5) and
could not do this: even-odd counts crossings, so a point inside two cutouts is
inside an even number of subpaths and **paints dark**. Under a clip path two
holes may never overlap, and the morph below needs them to.

**Never reach an SVG `<mask>` element from CSS with `url(#…)`.** It is the
obvious way to write a mask, Chrome and Firefox honour it, and **Safari cuts no
hole at all** — under every spelling there is, prefixed and unprefixed, with
`mask-mode`, with `mask-type`, in a `<defs>`. Nothing reports it:
`CSS.supports('mask-image: url(#a)')` answers `true`, because a support query
parses syntax and says nothing about whether a reference resolves. The
`data:` URL images are images, not references, and every engine draws them
([`spike/overlapping-holes/`](spike/overlapping-holes/)).

A mask cannot read layout, and no CSS route exists from an element's box to one
— `anchor()` resolves only in inset properties (T3). So JS measures the targets
and writes the layers, **at step boundaries, never per frame**.

### Scrolling

- The scrim lives **inside** the scrolling content, sized to it, with the path
  in content coordinates. Scrolling moves scrim and targets together and
  nothing needs recomputing. **Scroll tracking runs no JS at all** (T6a, T6b,
  and `nested-scroller.ts`).
- That leaves the rest of the page, so there is **one scrim per scrolling
  ancestor**, innermost first and always ending at the document. Only the
  innermost carries the step's cutouts. Each outer one is cut to the **padding
  box** of the scroller nested inside it — cut to the border box, the
  scroller's own border stays lit as a hairline.
- **A `position: fixed` target is carried by the viewport, so its layer is
  too.** A fixed element takes no part in the ride: the document's scrim
  scrolls and it stays, so a hole cut in that scrim is carried off by the
  first scroll while the element stands where it was. Such a target gets a
  stack of one layer, itself `position: fixed` and the size of `innerWidth` by
  `innerHeight`, with its cutouts, blocking rectangles, halo and anchor
  marker all in viewport coordinates. Nothing about it moves on scroll, which is the
  point, so scroll tracking still runs no JS; a resize redraws it as it does
  every layer. There is no document layer under it, because it covers the
  viewport whole (`fixed-chrome.ts`).
- **That layer is sized past the layout viewport on purpose, gutter
  included.** The layout viewport — `clientWidth` on the root, the scrollbar
  excluded — is the box a fixed element is laid out against, and the wrong
  number to size a layer by, because it is only correct at the instant it is
  read. A page that shortens under a tour loses its document scrollbar,
  `clientWidth` grows by the gutter's width, and no `resize` event fires to say
  so, which leaves a layer measured before it about 15px too narrow: a strip of
  the application the step did not open, neither painted nor blocked, for the
  rest of the step. The inner pair does not move when the scrollbar does, so it
  cannot be caught out that way, and covering the gutter costs nothing — a
  fixed box past the layout viewport adds no scrollable overflow in any engine,
  so the scrim cannot grow a scrollbar out of the page it is dimming, and both
  Chromium and Safari go on painting the scrollbar over a box that covers its
  gutter, so covering it shows nothing
  ([`spike/the-scrollbar-gutter/`](spike/the-scrollbar-gutter/) — where Firefox
  alone is still to be looked at by eye, which is the page's own remaining open
  question. It also measures the alternative: a `resize` event is blind to the
  gutter and a `ResizeObserver` on `documentElement` catches every one, which
  is the shape to reach for if a layer ever has to notice rather than not
  care). A page that grows a scrollbar mid-step has the layer a gutter too
  wide instead, and a fixed box is clipped to the viewport, so nothing shows. A
  host that would rather the gutter never moved at all can say
  `scrollbar-gutter: stable`, and that is worth doing under a tour for the
  application's own sake.
- **Whether the viewport still holds a fixed element is the engine's to say,
  not a list's.** An ancestor with a transform, a perspective, a filter, a
  `will-change` for one of those, `contain: layout` or `paint`,
  `content-visibility` or an `offset-path` becomes the element's containing
  block, and it is then an absolutely positioned child of that ancestor: it
  rides the page with it, and rides the ancestor's own scroll if it scrolls.
  `offsetParent` on a fixed element is `null` while the viewport holds it and
  names that ancestor otherwise, in all three engines and in Safari, against
  the letter of CSSOM View, which says `null` for any fixed element
  ([`spike/fixed-under-an-ancestor/`](spike/fixed-under-an-ancestor/)). Leko
  asks that rather than keeping the list. The page is what makes the answer
  safe to rely on, and where to look first if an engine moves.
- **Every region of a step shares the first region's layers.** A later region
  in another scroller, or fixed where the first is in the flow, is cut where it
  stood and drifts when the two move apart. That is drawn rather than refused:
  an application's chrome is fixed where the application put it, and a step
  that shows a toolbar beside the panel it opens is a step worth writing.
- **A sticky target is not a fixed one, and is not handled.** It rides the
  scroll until it pins, and from then on is held the way a fixed element is,
  until its containing block ends. A hole cut where it stood is right until
  the pin and wrong after it. Two states with a layer for each is the shape
  that fits here, and it is not built.
- **Every layer paints and catches nothing. Plain rectangles in the gaps
  between the open cutouts do the blocking.** A mask has no effect on
  hit-testing at all, so a masked scrim asking to be hit is a solid sheet over
  the page. The clipped version that came before did not work either: a
  `clip-path` takes an element out of hit-testing but **not** out of the search
  for what a wheel should scroll, so a scrollable element under a hole stopped
  scrolling under the pointer — Firefox routes such a wheel to the element,
  Chromium only while the scrim's container has nothing left to scroll, WebKit
  never ([`spike/wheel-through-a-hole/`](spike/wheel-through-a-hole/), and
  `scrollable-target.ts`).
- **The rectangles live beside the scrim, never inside it.** They were moved out
  when the scrim was clipped, because a `clip-path` clips its descendants out of
  hit-testing along with itself and a rectangle inside the scrim over one of its
  holes caught nothing ([`spike/blocking-a-hole/`](spike/blocking-a-hole/)). A
  mask does no such thing, so what keeps them out here now is plainer: the scrim
  paints and catches nothing, the rectangles catch and paint nothing, and apart
  they need no reasoning about.
- **Do not go back to blocking with the scrim itself**, however much tidier
  one element looks. `elementFromPoint` reports the hole open the whole time
  the scrolling is broken, so the tests check this by geometry. Rectangles also
  make constraint 1 true by construction: they are the complement of the
  cutouts the step opened, so nothing of Leko's can be over a target the step
  made reachable, even in principle. That is also why **only one story is ever
  visible** — a second story's rectangles are the complement of a *different*
  set of holes, and land squarely on the first story's target.

### Bringing a target into view

A step draws its target where the target is. **It goes and gets it only where
the host asked**, with `scroll` on the step or on the instance, and that is off
by default: where a page is scrolled to is the application's own state, and a
tour that moves it has reached into the application to do it. Without it, a
target below the fold is cut out of a scrim nobody can see, and the viewer is
left to work out that scrolling is what the step wants — honest, and not what a
tour is for.

- **Two stages, never one: the page glides, and the step is drawn when it
  stops.** The hole itself would survive a morph running alongside the scroll —
  the scrim lives inside the scrolling content, so its cutouts are in content
  coordinates and a scroll moves scrim and target together. What would not is
  every decision taken in viewport coordinates: the side of the hole the
  message takes, and the corner the way out sits in. At 320ms, the instant a
  default morph would be finishing, Chromium still has 372px of a 2000px scroll
  to go and 2378px of a 5000px one, and Firefox 66px and 213px — so a side
  chosen then is chosen about a screen the page has already left. WebKit alone
  would be fine, with a fixed ~200ms curve whatever the distance
  ([`spike/a-smooth-scroll-settling/`](spike/a-smooth-scroll-settling/)).
- **`scrollend` ends the wait.** Baseline 2025, present in all three engines,
  and fired for a scroll an engine chose to apply outright as well, so nothing
  has to detect which of the two it got. It arrives late rather than early — up
  to 50ms after the offset stops in Chromium, 183ms in Firefox — and that is a
  wait taken rather than a poll started. Watching the offset from a frame loop
  answers sooner and is not worth a poll for it. There is a deadline under the
  event, and it is a net rather than a fallback: an event that never comes must
  not leave a tour with nothing drawn.
- **A port that needs no scroll is never waited on.** Nothing moved, so no
  `scrollend` fires in any engine — waiting there would hang the tour with the
  page dimmed and no step on it. The delta decides, and a delta of zero means
  the step is drawn in the same task the arrival came in on.
- **A page that has not moved at all is set outright before the step is
  drawn.** A glide is started only where there was a delta to cover, so a page
  still exactly where it was 120ms later is a scroll that did not happen, and
  setting it is unambiguous. Two things get there. A delta the port cannot
  honour — a target hanging off an edge the page is already against — moves
  nothing, and a scroll that moves nothing has nothing to say it is over. And an
  engine that drops the scroll in silence, which is what Firefox does to a
  scroller below the fold (question 4 of the spike). No engine has been seen to
  do that to the document, and nothing here claims one does: the guard is kept
  because the failure has been watched to exist, and what it costs where it is
  wrong is a jump where a glide would have done, against 2.5 seconds of a dimmed
  page with no step on it where it is missing. Moved but short is left alone —
  that is a viewer who took over, and their scroll is not Leko's to undo. **The
  check runs on a timer and never on an animation frame.** On the two-core CI
  runner a single frame has been watched taking more than three seconds while
  timers went on ticking at 16ms; on such a machine a check that waits for
  frames lands after the deadline has already decided, and the deadline is a
  timer too.
- **Every scroll asks for an offset, never a delta.** The geometry hands back a
  delta, and `scrollBy` is the obvious spelling of one; but `scrollBy` resolves
  against where the engine says the port is, and while a glide is in flight
  WebKit says somewhere `scrollY` does not — a `scrollBy` started 100ms into a
  glide landed 474px off there, where a `scrollTo` of the same offset landed
  exactly (question 5 of the spike). The box was measured against the `scrollY`
  this task can see, so `scrollY` plus the delta is the offset the sum is right
  in, and it is what a step that arrives mid-glide and scrolls lands by.
- **The page glides; a nested panel is set.** Firefox does not animate a
  programmatic smooth scroll of a scroller well below the fold — the boundary is
  one to two screens past it — it does not scroll it at all, leaves `scrollTop`
  where it was, and fires no `scrollend` to say so. A panel a tour is about to scroll is below the
  fold by definition, so that is the ordinary case and not an edge of it. Set
  outright it lands in every engine at every depth, which also makes the page's
  own delta exact rather than measured against a scroller still in flight. The
  movement a viewer follows is the page's; a panel's inner scroll is a detail
  inside a box that is not on screen yet.
- **The scroll animates exactly when the morph does.** `duration: 0` and
  `prefers-reduced-motion` each put the page where it belongs outright, and the
  rule is one predicate in `scrim.ts` read by both, so the two can never
  disagree about whether the tour is moving things or setting them.
- **Nothing is drawn for the gap.** The words of the step being left go before
  the page moves, rather than riding a glide to somewhere they are not about.
  Nothing else changes while it runs: the dimming stays, and the standing hole
  travels with the content it is cut out of, which is the same bargain
  **Nothing is drawn for a retry** strikes.
- **The middle of the port, not the nearest edge.** A step exists to draw
  attention to one thing, and a hole flush against the bottom of the screen is
  the least attention a hole can be given: no room under it for the message, and
  whatever chrome the application keeps down there sitting over it. The least
  movement is not what is wanted, so it is not what is asked for. Every
  scrollport on the target's surface chain centres the cutout in itself,
  innermost first, with the box measured again for each — scrolling an inner
  scroller moves the target inside every port outside it.
- **A port that already holds the cutout is not touched.** A step arriving does
  not re-centre a page the viewer has settled, and that refusal is
  `scrollDelta` answering zero rather than a special case anywhere else. It is
  the whole cutout that has to be inside, overhang and asked-for room included,
  so a hole hanging half off the bottom is not already there.
- **A target more than half the port tall leads with its top edge, put at the
  middle.** Centring one of those is what leaves the message nowhere to go: the
  taller the hole, the less room on either side of it, and a hole taller than
  the port leaves none at all. Leading with the top edge always leaves exactly
  half a port above the hole, which is a place a message fits, and gives up only
  the bottom of a target nobody could take in at a glance. **Vertically only.**
  The message is placed above or below before it is placed beside, so height is
  what has to be paid for; a box wider than half the port led the same way would
  hang off the side for nothing, so only one wider than the whole port keeps its
  near edge. This is arithmetic and not a scroll target: nothing of Leko's is
  put into the host's DOM to steer a scroll by — a zero-area sibling would
  change `:nth-child`, the item count of a flex or grid parent, and the host's
  own observers, and its cleanup would hang off a `scrollend` that never fires
  when nothing moved.
- **Nothing in the geometry clamps; the scrollport does.** A target near the end
  of the content cannot be put where it belongs, and the delta asked for is the
  one that would put it there — past the end. The port clamps that, which lands
  the target as near as the content allows and against the far edge in the
  limit.
- **`scroll-margin` on the target wins over the step's `padding`** wherever it
  asks for more. How much of an application's own sticky chrome is in the way is
  a thing the application knows and Leko cannot guess; the padding is only the
  floor, because the hole itself overhangs the element by that much. It is the
  box the margin asks for that gets centred, so a margin on one side alone leans
  the target away from that side, which is how a host keeps a step's message
  clear of chrome it owns. A margin big enough to take the box over half the
  port tips it into leading with its top edge, and the room asked for below is
  then whatever is left of the screen: a box that does not fit cannot be given
  clearance on its far side.
- **A `position: fixed` target is not scrolled.** Its chain is the viewport
  alone, which has nowhere to go. A sticky one is a different destination —
  past the point where it pins rather than on screen — and belongs with the
  rest of sticky, which is not built.
- **Only an arrival scrolls.** The call sits in `show`, between the target
  resolving and anything being measured. Every redraw goes through `reveal`
  instead — a resize, a framework rendering over the step — and by then the
  viewer may have moved the page on purpose, so none of them scrolls again.
- **A glide the tour has moved past draws nothing, and stops waiting.** The
  wait it was is abandoned — timers, listener and all — and an arrival replaces
  it, so the step that was being glided towards is dropped rather than drawn
  over the step that overtook it, and a glide nobody is waiting for cannot set
  the page outright a moment later to somewhere the tour no longer is. The page
  itself is left to finish, because nothing can stop it: an instant scroll to
  where the page is, which CSSOM View says aborts the animation, leaves Firefox
  gliding on to the original destination and Chromium a frame further with no
  `scrollend` to follow, and only WebKit stops (question 5 of the spike). So a
  step arriving then that does not scroll is drawn against a page still moving,
  the same as if the viewer had scrolled after it was drawn — the hole rides the
  content, and the side the message took is a fact about the screen it was
  chosen on. One that does scroll replaces the glide with its own, asked for as
  an offset, and lands.
- **A step with no `target` scrolls nothing**, having nothing to scroll to. Nor
  does a retry: a target that is not on the page yet cannot be brought into
  view, and the scroll happens on the attempt that finds it. The target is
  asked for again when the glide ends, because a glide is long enough for a
  framework to have rendered over it.

### The morph

- **A story opens by converging, from every hole stretched over the whole
  surface.** Nothing is dimmed at the first frame and the dark closes in from
  all four sides at once, each hole shrinking to its place. Every hole covers
  every other one while it does, which is exactly what the union is for: the
  same opening under even-odd showed each target *darker than the scrim around
  it*, inverting as the holes passed through one another, and
  [`spike/overlapping-holes/`](spike/overlapping-holes/) has that caught
  halfway through.
- The morph blends the cutouts and draws the mask from the blend, so the numbers
  a frame is written from are the cutouts themselves. **Collapse a departing
  cutout to zero area rather than dropping it** — that is now only so a hole
  leaves by shrinking instead of vanishing. It used to be a correctness rule:
  two `clip-path` values interpolate only when their subpaths match in count, so
  a step with fewer holes than the last switched over discretely (T7 and T8).
  Mask layers are a list, and a list can change length.
- **The blend is written frame by frame from the main thread.** Handing the mask
  to the Web Animations API would put it on the compositor, and Chrome
  rasterises a composited clip path at the wrong scale on a 2x display. Check
  that on a 2x display before moving this back onto `element.animate()`
  ([`spike/waapi-clip-path/`](spike/waapi-clip-path/), and
  [crbug.com/542859657](https://issues.chromium.org/issues/542859657)).
- The morph runs on `requestAnimationFrame`, so it stops in a tab nobody is
  looking at and finishes when the tab is looked at again. A signal arriving in
  that window still advances the step.
- **Any change that reintroduces per-frame JS position math is a regression.**
  That rule is about reading layout while the user scrolls. A bounded morph
  writing a string each frame from numbers it already has reads nothing and is a
  different thing. On a scrim 12 000px tall, three holes and 120 frames cost
  nothing measurable in any engine — but **an `<svg>` scrim masked the SVG way
  costs 81ms a frame in WebKit**, which is the tidier design and unusable, and
  only WebKit says so ([`spike/overlapping-holes/`](spike/overlapping-holes/)).

### The halo

A cutout is an absence of geometry, so a host that wants to decorate the hole —
a ring, a glow — has nothing to select. The halo is that element: one
transparent frame per cutout, sitting exactly on it, styled entirely through
`--leko-halo-*`. Every token ships as `none`, so until a host sets one the halo
paints nothing and costs nothing to look at.

- **Paint only, and outside the hole by construction.** The frame is built the
  way the scrim is: `pointer-events: none` on everything, catching nothing.
  What decorates it is `outline` and an outer `box-shadow`, and both stay out
  of the box they decorate — an outline is drawn outside the border edge, an
  outer shadow is clipped out of the border box
  ([`spike/halo-outside-the-hole/`](spike/halo-outside-the-hole/)). A host that
  writes a negative offset or an inset shadow is painting over its own target,
  and may.
- **Only the innermost scrim is haloed.** It is the one carrying the step's
  cutouts; an outer layer's hole is the scroller the next layer lives in, which
  is plumbing rather than anything the step points at.
- The hole the step opened carries `data-open`, so
  `.leko-halo[data-open]` styles the hole being asked about apart from the ones
  the step only shows.
- **What a morph does to the halo is the host's choice, `halo` on the
  options.** The frames ride the morph either way, written every animation
  frame from the same blended numbers the mask is, so the two cannot
  disagree and no layout is read — the per-frame rule the morph already lives
  by. The mode decides the paint. The default, `'return'`, is the message's
  answer: the frames fade out in flight (`--leko-halo-fade`) — a fade that
  stood still while its hole left would be pointing at where the step no
  longer is — and fade back in with the holes they frame, only if the morph
  got there. `'follow'` keeps them on the whole way, for the host that styles
  every hole alike and wants the glow to travel; one that lights the open hole
  apart can still follow, and `data-open` flips when the flight starts,
  because that is the hole the frame is already becoming. Either way a
  collapsed zero-area leftover holds no frame once the flight is over — an
  outline around nothing still paints a dot.

### The message

The message is a `popover` in the top layer, so it sits over the scrim without
bidding on a `z-index` the host page can always outbid. It cannot go where the
scrim goes: the scroller would clip it at its own edge, and the edge is where a
message needs room. It cannot be positioned from measurements either — that is
JS on every scroll again.

JS picks the side once per step, and the distance to the furthest cutout
becomes a margin, so the message clears every hole rather than only the one it
is anchored beside. `position-try-fallbacks` covers what a measurement could
not — a target scrolled towards the edge after the step began — and is an
enhancement on top of that choice, not the mechanism.

**The core has no third-party runtime dependencies and must stay that way.** A
scalar tween is all this needs, and a dependency here is a licensing and
bundle-size liability for every consumer. `@annetaan/leko-spotlight` ships from
this repository under the same licence, so the rule is not about it.

## Three packages, and the seam between them

- `packages/machine` decides which step the tour is on. **Its `lib` is `ES2023`
  alone, so a `document` there is a compile error.** Its tests run in Node
  against a fake.
- `packages/spotlight` draws the scrim, the hole and the message. It does not
  know what a step is.
- `packages/leko` wires the two together, owns the public types, and is the
  only one that publishes.

What each half may ask of the other is `Presenter` and `Host` in
`packages/machine/src/types.ts`:

- **The presenter never moves the tour.** What it notices on the page it either
  redraws from what it already has, or reports through `Host` and waits. A
  resize or a node swapped for an identical one is the first kind — putting the
  same page back is not a decision. A target that never comes back is the
  second, because ending a run is.
- **No words cross the seam.** What a step says is on the step, and the step is
  on every call, so the machine builds no instruction and no label. One string
  does cross: the reason the last attempt was turned down, on `retell` — which
  attempt was the last one is the machine's to know.
- **The presenter is told, and never asks back.** No member of `Host` returns
  anything, and no member of `Presenter` takes a story.

`Target` and the state literals are written out in both packages, deliberately:
a published `.d.ts` referring to the private `@annetaan/leko-machine` would not
resolve in anyone's project. `@annetaan/leko` bundles both halves in with
`tsdown`, so a consumer installs one package with no runtime dependencies.
**`pnpm check:pack` reads what `npm pack` would send and fails on a bare import
the manifest does not depend on.**

## How to write here, and where tests go

- **Write in a functional style wherever the code allows it.** Everything
  difficult here is geometry. `geometry.ts` takes numbers and returns numbers,
  so it is tested by stating properties — *no blocking rectangle ever overlaps
  a hole*, *every path has the same segment list* — rather than by driving a
  browser. Reading layout and owning elements cannot be pure, so that stays in
  `scrim.ts`, `message.ts` and `presenter.ts` and stays small. Logic that gets
  hard to follow inside a class usually wanted to be a function in
  `geometry.ts` with a test of its own.
- **jsdom is not an option for anything about layout** — it has none. What
  sorts a test is whether a browser could get the answer wrong, not whether the
  test mentions the DOM. The table of which project a test belongs in is in
  [ONBOARDING.md](ONBOARDING.md).
- All three engines run, because the two things the library is built on are
  ones engines disagree about: how a mask may be written — Safari cuts no hole
  at all from one of the spellings Chrome accepts — and how much of anchor
  positioning exists. A test depending on the second asks
  `CSS.supports` first. **Playwright's WebKit is a WebKit build, not a Safari
  anyone can install** — the floor still has to be checked on the real thing.
- `machine.test.ts` sits in `describe` groups, one per axis the machine is
  asked about. **Read them as a table.** A group holding two tests is a column
  nobody has crossed with the others, and that is where the next bug is.
- **The sandbox is not a showcase.** Every case is something a user *does* — a
  demo where the user only watches proves nothing about a library whose whole
  claim is that they do not. It is also the first consumer of the public types.
  **`spike/` pages are dependency-free and use no Leko.** Add one whenever a
  decision would otherwise rest on trust.

## Browser support

The cutout needs CSS masking with several layers and `mask-composite`, and an
SVG in a `data:` URL as a mask image. **The floor this implies has not been
measured. Do not quote one until it has.** The source also uses ES2023 array
methods, a lower floor of its own. What has been checked is the top: Chrome 152,
Firefox 153 and Safari 26 all draw it ([`spike/overlapping-holes/`](spike/overlapping-holes/)).

CSS Anchor Positioning (Chrome/Edge 125+, Firefox 132+, Safari 18.2+) places
the message beside a cutout and does nothing else, so it degrades rather than
fails: without it the message docks to the foot of the viewport, which is
plainer than being beside the hole and never points at the wrong place.
`@position-try` and `position-try-fallbacks` need Safari 26+, so neither may
carry anything on its own.

## Where things are written down

|                                                                |                                                              |
| -------------------------------------------------------------- | ------------------------------------------------------------ |
| A rule, and why it holds                                       | this file                                                    |
| Evidence that a browser does not do what the spec suggests     | [`spike/`](spike/)                                           |
| A situation a tour meets                                       | [`examples/sandbox/src/cases/`](examples/sandbox/src/cases/) |
| The machine's states, in a form a search can walk              | [`packages/machine/model/`](packages/machine/model/)         |
| How to walk the code, the layout, which project a test goes in | [ONBOARDING.md](ONBOARDING.md)                               |
| How to work in the repository                                  | [CONTRIBUTING.md](CONTRIBUTING.md)                           |
| Which implementation came before, and what it got wrong        | the commits                                                  |

**This file carries no history.** Where a rule came out of a bug, what gets
written is the rule in the present tense and a pointer to the page or case that
shows it.
