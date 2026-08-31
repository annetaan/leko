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

**1. Never place an element over a target the step opened.** The highlight is a real hole cut by `clip-path`. Layering anything over it — transparent or not — blocks pointer events and focus, destroying Leko's core purpose. A hole the step did not open is different: blocking it is the step's own instruction carried out.

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
type TargetFunction = () => HTMLElement | null;
type LekoTarget = Selector | TargetFunction;
type LekoRegion = LekoTarget | LekoTarget[]
interface LekoStep {
  ...
  target?: LekoTarget | LekoRegion[]
  ...
}
```

| Code Example           | Interpretation                                                                          |
| ---------------------- | --------------------------------------------------------------------------------------- |
| `'#a'`                 | Cuts a single hole around `#a`.                                                         |
| `['#a', '#b']`         | Cuts two separate holes for `#a` and `#b`.                                              |
| `[['#a', '#b']]`       | Cuts a single hole covering the bounding box of `#a`, `#b`, and the space between them. |
| `[['#a', '#b'], '#c']` | Cuts two holes: one covering the union of `#a` and `#b`, and one for `#c`.              |
| `undefined`            | Cuts no holes, dimming the entire screen.                                               |

`adjacent-columns.ts` is the union; `linked-regions.ts` is two separate holes.

### Resolution & custom functions

- Selector: Evaluated by Leko. Use as default.
- Function `() => Element | null`: Evaluated by the host. Required for Shadow
  DOM targets, framework refs (`() => ref.current`), or dynamic elements. See
  `inside-shadow-dom.ts`.
- Performance requirement: Functions are called frequently during layout
  calculations — they must be pure, lightweight, and side-effect-free.
  Returning `null` signals that the target is not yet present.

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
`interactive: true`. It is off by default.

- Applies to the first region only: Interaction is limited to the primary
  region; secondary regions remain non-interactive.
- Declared by the step, independent of `awaits`: Step interactivity and
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
- Chained starts:
  - Terminal ends (no next story) can trigger a new `start()` from within the ending report.
  - Non-terminal ends (transitioning via next) refuse new `start()` calls to protect the incoming story chain.
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

  ```
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
  going, so a panel two steps use in turn can stay open. Starting another story
  counts as ending.
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

- `padding` and `radius` are read from the step, then from the instance, then a
  built-in default. `duration`, `nextLabel` and `closeLabel` are read from the
  instance alone.
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
handed to the presenter, with `onEnter` inside it. A teardown, with `onLeave`
running, is another.

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
  is still refused; the ending `onStep` report is the first place a new
  `start()` is accepted again.
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
  `start()` made from the report of an ending puts its story up inside that
  call, so a host watching `onStep` sees one tour replaced by another — never
  an idle turn in between.

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

A cutout is a `clip-path`, never a stack of elements. The `clip-path` on
`.leko-scrim` is a single `path(evenodd, …)` — an outer rectangle plus one
rounded-rectangle subpath per cutout, so five cutouts cost five subpaths and
still one element ([`spike/cutout-techniques/`](spike/cutout-techniques/), T5).
Even-odd makes each inner subpath an absence of geometry, not a transparent
overlay.

`clip-path` cannot read layout, and no CSS route exists from an element's box
to a `clip-path` — `anchor()` resolves only in inset properties (T3). So JS
measures the targets and writes the path, **at step boundaries, never per
frame**.

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
- **Every layer paints and catches nothing. Plain rectangles in the gaps
  between the open cutouts do the blocking.** A `clip-path` takes an element
  out of hit-testing but **not** out of the search for what a wheel should
  scroll, so a scrollable element under a hole stops scrolling under the
  pointer — Firefox routes such a wheel to the element, Chromium only while the
  scrim's container has nothing left to scroll, WebKit never
  ([`spike/wheel-through-a-hole/`](spike/wheel-through-a-hole/), and
  `scrollable-target.ts`).
- **The rectangles live beside the scrim, never inside it.** A `clip-path`
  clips its descendants out of hit-testing along with itself, so a rectangle
  inside the scrim over one of its holes catches nothing
  ([`spike/blocking-a-hole/`](spike/blocking-a-hole/)). The sibling layer
  paints nothing.
- **Do not go back to blocking with the clipped element**, however much tidier
  one element looks. `elementFromPoint` reports the hole open the whole time
  the scrolling is broken, so the tests check this by geometry. Rectangles also
  make constraint 1 true by construction: they are the complement of the
  cutouts the step opened, so nothing of Leko's can be over a target the step
  made reachable, even in principle. That is also why **only one story is ever
  visible** — a second story's rectangles are the complement of a *different*
  set of holes, and land squarely on the first story's target.

### The morph

- Every path emitted has the same segments in the same order, so two of them
  blend by walking their numbers in step. **Changing the number of cutouts
  breaks that correspondence — collapse a departing cutout to zero area rather
  than dropping its subpath** (T7 and T8).
- **The blend is written frame by frame from the main thread.** Handing
  `clip-path` to the Web Animations API puts it on the compositor, and Chrome
  rasterises a composited clip path at the wrong scale on a 2x display. Check
  that on a 2x display before moving this back onto `element.animate()`
  ([`spike/waapi-clip-path/`](spike/waapi-clip-path/), and
  [crbug.com/542859657](https://issues.chromium.org/issues/542859657)).
- The morph runs on `requestAnimationFrame`, so it stops in a tab nobody is
  looking at and finishes when the tab is looked at again. A signal arriving in
  that window still advances the step.
- **Any change that reintroduces per-frame JS position math is a regression.**
  That rule is about reading layout while the user scrolls. A bounded morph
  writing a precomputed string each frame reads nothing and is a different
  thing.

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
  ones engines disagree about: what `clip-path: path()` interpolates, and how
  much of anchor positioning exists. A test depending on the second asks
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

The cutout needs `clip-path: path()` and interpolation between two path values.
**The floor this implies has not been measured. Do not quote one until it
has.** The source also uses ES2023 array methods, a lower floor of its own.

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
