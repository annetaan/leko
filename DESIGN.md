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

### A URL is a signal the page reports

`awaits` also takes `{ url: RegExp }`, and a step declaring one advances when
the page's own URL changes to match it, with no call the application has to
make:

```ts
{ id: 'checkout', target: '#cart', awaits: { url: /^\/checkout(?:[/?#]|$)/ } }
```

- **Core supplies this one trigger because there is nowhere to put a
  `reached()` call.** A button already has a handler a line of instrumentation
  joins; an `<a href>` has none, and giving it one would add markup only the
  tour needs — the third constraint, applied rather than restated. A click is
  never what is matched, because a click is a DOM event and the second
  constraint rules that out on either side of the seam; what is matched is the
  URL the click, or `pushState`, or `history.back()`, left behind.
- **A URL is where the page arrived, not what it did.** `pushState`,
  `back()`/`forward()`, and a redirect the application's own router ran all
  advance the same step a click would, and none of them is a call any handler
  could have made. `{ url: … }` is right for "the user got to checkout" and
  wrong for "the user finished checking out" — that is
  `reached('checkout-finished')`, called after the order actually saved.
- **Only a change is watched, never an arrival.** A step drawn at a URL its
  pattern already matches does not advance on the draw; it advances on the
  next URL that matches after that. A signal fired before the step existed
  establishes nothing about the user, the same reasoning **Signal behavior**
  gives for not buffering one, and judging the arrival instead would advance
  the machine from inside the call that is still drawing the step it would be
  leaving — the reentrancy **One gate, and what it refuses** closes off for
  every other signal.
- **Leko has no grammar for a URL.** `awaits: { url }` takes a `RegExp` and
  nothing else: no string, which would need a second rule for whether it means
  an exact match or an implicit `new RegExp`, and no glob or path template,
  because a slash's meaning, a trailing one, and how `:id` binds are all
  guesses about a host's router. The pattern is tested against
  `location.pathname + location.search + location.hash` — everything after the
  origin. The origin itself cannot change under a same-document navigation, so
  it carries nothing a test needs. Testing `pathname` alone would throw away
  `search` and `hash`, the two things a host reached for `RegExp` instead of a
  string to keep, and an unanchored pattern such as `/checkout/` means what it
  says: it matches `/checkout-history` too.
- **A pattern with `g` or `y` is tested from a stateless copy.** Either flag
  makes `.test()` advance `lastIndex` between calls, which would make whether a
  step advances depend on how many times it had already been tested — state a
  pure `plan.ts` cannot hold, and the host's own `RegExp` besides. The machine
  builds `new RegExp(pattern.source, pattern.flags.replace(/[gy]/g, ''))` once
  per navigation instead; navigations are rare enough that the copy costs
  nothing next to a state field that would exist for two flags alone.
- **What is heard, and what is not, is
  [`spike/a-same-document-navigation/`](spike/a-same-document-navigation/).**
  In the three engines it reached, `pushState` and `replaceState` fire only the
  Navigation API's `currententrychange`, synchronously — and assigning
  `location.hash` fires `currententrychange` and `popstate` synchronously too,
  in every engine tested, so a router that routes by writing the hash from
  inside a step's own `onEnter` lands inside the gate exactly as one calling
  `pushState` would, and is dropped as `signal-dropped`, the same as a
  `reached()` would be — **Saying that a call did nothing**. Where the
  Navigation API is missing, the fallback is `popstate` and `hashchange`, and
  the spike never exercised a router's own `pushState` on such an engine —
  that path is inaudible to it, by the same page's own account. What is left —
  a link click, later in Firefox, and `back()`/`forward()`, later in every
  engine tested — is no problem here either: what a step reacts to is a URL
  that stopped matching becoming one that does, not the call that changed it,
  so whichever task queue delivers the change is a change like any other.
- **One document only.** A URL match observes the document the tour is running
  in; a navigation that tears the document down and reloads it is a different
  signal, answered under **A page load ends the story, and hands it on**.

## A page load ends the story, and hands it on

A story's **last** step can declare `awaits: { url }`, and the story itself
can declare `next`; together they are the whole of the opt-in, and nothing
else about a step's shape changes for it. While the tour stands on that step
and the document is being left — `pagehide` — Leko asks `next` for the
successor and keeps a note in `sessionStorage`: the pattern, the successor's
`id`, and the URL the note was kept at. The next document calls
`leko.pickUp(stories)` once, with the stories it has:

```ts
leko.pickUp([firstStory, secondStory])
```

The note is taken and removed whether or not it matches. The successor starts
from its first step — irising in the way any step 1 does — only if the
document's URL is a change from the one the note was kept at and tests true
against the kept pattern. Nothing else is carried: no index into the
successor, no `onEnter` skipped, no visual continuity across the boundary.

- **The old document writes, the new document judges.** The old document
  cannot hear the URL it is going to: the Navigation API's `navigate` event
  fires before a navigation that can still fail, so a note kept from it could
  be kept for a navigation that never happens. `pagehide` is the one reliable
  last moment
  [`spike/a-cross-document-navigation/`](spike/a-cross-document-navigation/)
  finds in every engine it reached, and the URL is judged only where it is a
  fact — in the document that arrived. This keeps **Only a change is watched,
  never an arrival** whole across the boundary: what is matched is the URL the
  page arrived at, never the click that led there.
- **The `from` check reaches the same rule across the boundary, by a
  mechanism of its own.** `pickUp` drops a taken note whose URL equals the
  one the arriving document is already at. A same-document arrival is ruled
  out a different way — **Only a change is watched, never an arrival** never
  judges the draw at all — but the outcome here is the one that rule
  protects: this stops a reload of a page whose own URL matches the step's
  pattern from starting the successor on the page the user never left. The
  step that pattern belongs to was drawn in the previous document, so a
  matching arrival has to be a URL that came after it, and no draw is in
  progress when this is judged.
- **The old document's tour is left standing.** `pagehide` runs no teardown:
  no `onLeave`, no `onStep(undefined)`. A document that is torn down has
  nothing to clean up; a document the back/forward cache hands back instead
  comes back exactly as it was, on the step that asked the user to leave — the
  right page to be on after `back()` — by the specification's own guarantee
  for what a restore preserves. [`spike/a-cross-document-navigation/`](spike/a-cross-document-navigation/)
  armed a listener for exactly this and never saw a restore, in any engine it
  reached, so this rests on the guarantee rather than on that page's own
  numbers.
- **A restore forgets the note it kept.** The tour left standing above is not
  the only thing a restore hands back: the note `pagehide` kept is still in
  `sessionStorage`, and nothing consumed it, because no new document ran. A
  note says its document is being left; a restore means it was not, after
  all — the same rule the `from` check reaches by a mechanism of its own, so
  `pageshow` is armed alongside `pagehide`, and where `event.persisted` is
  true the note is dropped. Left in place, it would start the successor from
  an unrelated later page load in the same tab, the first time that page's
  URL happens to match. `spike/a-cross-document-navigation/` never saw a
  restore either, so this too rests on the specification's guarantee rather
  than a measurement of one.
- **A note kept is consumed by the first `pickUp`, matching or not.** A tour
  abandoned before its destination is over at the first Leko page that is not
  it. No timestamp bounds the note: any bound is a guess about how long a
  fetch takes, and a slow page load is the case this exists for. The
  remaining failure mode is a page with no Leko on it between the two, which
  leaves the note for a later page instead — a later visit to a matching URL
  in the same tab would then start the successor. A limit this accepts, not
  one it closes.
- **One key, one origin.** The note lives under a single fixed
  `sessionStorage` key, so two unrelated Leko projects served from the same
  origin can consume each other's note; the pattern then fails to match and
  nothing starts. A limit, not something a version of this could fix.
- **`id` is matched in exactly one place.** `pickUp` matches the kept note's
  successor `id` against the `id` of each story the arriving document hands
  it in that same call, and nothing about that match persists afterward —
  Leko still never uses `id` as an internal lookup key anywhere else. `next`
  stays a story object or a function returning one for the reason it always
  has: a same-document chain could not resolve a string. A story crossing the
  boundary is shared through a module instead, the way the docs site's own
  demo does.
- **A URL-waiting step hands nothing on unless it is its story's last step.**
  A page load ends the story, so a step that leads across one is the last
  step of its story by definition; what the next document runs is that
  story's `next`, never a later step of the same one.

`across-a-page-load.ts` is the case.

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
- **Is positioned automatically:** Leko places the control in a screen corner that avoids overlapping active targets or target holes — and whatever chrome the host named as its own, which arrives in the same list of boxes.
- **Is the only global control:** Unlike "Next" (which is step-specific and derived from `awaits`), ending the tour is always permitted and available unconditionally.

## A target is a question

A step specifies its target with a selector or a function, but both are treated as a dynamic query rather than a static reference. Leko queries the DOM on every render — at step changes and at viewport resizes, and on every mutation while a step is waiting for a target that has not turned up yet — and never retains element references.

```ts
type Selector = string;
type TargetFunction = () => Element | null;
type LekoTarget = Selector | TargetFunction;
interface LekoRegion { elements: LekoTarget | LekoTarget[]; interactive?: boolean }
interface LekoShownRegion { elements: LekoTarget | LekoTarget[]; interactive?: never }
interface LekoTargetedStep {
  ...
  target: LekoTarget | LekoRegion | [LekoTarget | LekoRegion, ...(LekoTarget | LekoShownRegion)[]]
  ...
}
interface LekoUntargetedStep { ...; target?: never; validate?: never; error?: never }
type LekoStep = LekoTargetedStep | LekoUntargetedStep
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
- **An element with no box is not found**, however connected it is. What a
  target is asked for is somewhere to cut a hole, and an element that is not
  rendered has nowhere: `getBoundingClientRect` answers all zeros for it, which
  is a box at the origin of the viewport rather than no box at all. A region
  that kept one unioned its hole from the corner of the page to the far edge of
  whatever else the region named — and opened that corner, along with whatever
  the host keeps there, which is constraint 1. Alone in a region it was worse
  in the other direction: the anchor resolved, so the step was drawn, around a
  hole of no area at the corner with the message docked beside it, and no retry
  ever started because a hidden target was a found one.
  - The question is `getClientRects().length`, not the rect. A rect cannot tell
    an element that is not rendered from a rendered one of no size, and the
    second has a place on the page that a step may legitimately point at.
  - `visibility: hidden` and `opacity: 0` keep their boxes, so `hasBox` finds
    them, and whether the step points at one is `resolve`'s question: passed
    over by default, taken under `'first'` — **Which of several matches a
    selector means**, below.
  - A selector whose first match has no box matches nothing under `'first'`,
    rather than moving on to the next match; the default moves on.
  - See `hidden-target.ts`.

### Which of several matches a selector means

A selector that matches several elements means the first of them the viewer
could see. A step can ask for something else with `resolve`, and the instance
can ask for every step at once — **Settings, and where they are read from**.

- **`resolve: 'visible-first'` takes the first match the viewer could see, and
  is the default.** The question is `checkVisibility({ visibilityProperty:
  true, opacityProperty: true })`, and both options are named because
  `checkVisibility()` on its own reports only what **An element with no box is
  not found** already answers — `visibility` and `opacity` are off by default.
  So a match hidden by either, which keeps its box and is therefore a match, is
  passed over for the next one along.
  - It is the default because of what `'first'` does wrong: a first match that
    is hidden but keeps its box gets a hole over something nobody can see, the
    step is drawn, and nothing reports it. The same step under
    `'visible-first'` finds the copy that is showing, or finds nothing, waits,
    and ends with `target-lost`, which names the step.
  - Moving a default points existing tours at a different element with nothing
    in them edited, so it is settled before anything is published, and does
    not move after.
- **`'first'` takes the first match, hidden or not, and finds nothing where
  that one has no box.** It is what a selector has always meant, for a step or
  a host that wants it, and it keeps `querySelector`, which stops at the match
  it finds rather than building a list.
- **`'in-viewport-first'` asks what `'visible-first'` asks, and then that some
  of the match is inside the layout viewport.** The layout viewport, in the space
  `getBoundingClientRect` answers in — `layoutViewport` in
  `packages/spotlight/src/surface.ts` is the one place that is said. Pinch zoom
  is no part of it.

**The rule narrows the candidates and then takes the first**, so a selector, a
function, one element and a region all mean the same thing: a function is one
candidate, and the element it hands back is put to the same question rather
than moved on from. It is the step's answer for every element the step names,
and it says nothing about `hostChrome`, which is not a step's target — **A
host's own chrome is named once, and every reader takes the boxes**.

**Nothing that passes is nothing found.** That is the ordinary missing target,
and it takes the ordinary path: the retry window, and `target-lost` if nothing
turns up — **Target loss & recovery**.

**The rule is applied where every other resolution happens, after `onEnter`
returns** — **The target is resolved after `onEnter` returns**. That is what
lets a step reveal the copy it wants and then ask for a visible one, and it is
also why `'in-viewport-first'` cannot be the default: a page the application
has not scrolled yet has every right to keep the match below the fold.

Four limits are worth saying out loud rather than discovering.

- **`'visible-first'` passes over only a match with no box where
  `Element.checkVisibility` is missing or does not know the two options** —
  Chrome before 121, Firefox before 122, Safari before 17.4 — and nothing says
  so. It still moves on past a match with no box, which `'first'` does not,
  and it takes a match hidden by `visibility` or `opacity: 0`, which is the
  hole the default exists to keep out. An engine with the method and without
  the options ignores them and answers the bare question, which is **An
  element with no box is not found** again. An engine without the method is
  taken to show every match, because refusing every match there would lose
  every target, and **Browser support** quotes no floor that would rule those
  engines out.
- **A match whose computed `opacity` is still `0` when the retry window runs
  out is not found.** The wait hears nodes coming and going and nothing else,
  so a target fading in is seen only at the one look taken as the window
  closes. A step whose target is still arriving belongs after the animation —
  **The page is measured when a step is drawn, and not again**.
- **A match scrolled out of a nested panel still passes
  `'in-viewport-first'`.** What is asked is the viewport, and a match inside a
  scroller that has been scrolled away from is in the viewport's area all the
  same. Asking every ancestor scrollport instead is a read per port per
  candidate, and the rule exists to pick an element rather than to describe one.
- **`'in-viewport-first'` and `scroll` do not combine.** The rule is asked
  before the glide — it is what the glide is given something to move to — so a
  match off screen is not found and the step waits for a target the scroll was
  going to bring in. The types cannot say that; `resolve` on
  `LekoTargetedStep` does.

`which-match.ts` is the case, and it runs all three rules over the same three
matches.

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
- A guard needs a target, and **the type holds that rule**: `validate` and
  `error` are questions about the one element a step points at, so a step with
  no `target` is a `LekoUntargetedStep`, where neither compiles. Without it the
  first press ended the tour with `target-lost`, a report about a target that
  never existed. `packages/leko/type-tests/guard.ts` is the claim, stated as a
  program.
- Feedback behavior: A validation failure is never silent; it always triggers a cutout shake. error provides the user-facing explanation message.
- Error message lifecycle: error appears below the main instruction (never replacing it) and persists until the step changes or succeeds. To prevent stale state, error text is generated once per failed attempt and held, rather than re-evaluated on subsequent screen redraws.

## Starting a story

`start(story)` is the only external API to start a tour.

- No implicit stops: Calling `start()` while a tour is active returns
  `tour-running` and does nothing — a component that re-renders and starts its
  story again gets a refusal rather than a tour silently reset to step 1.
  Active tours must be explicitly ended with `stop()`.
- `id` is diagnostic: `id` is required for logging and external reporting, but Leko never uses it as an internal lookup key.
  `pickUp` is the one exception, and it is narrow: it matches a kept note's
  successor `id` against the `id` of each story handed to that call, and
  nothing about the match outlives it. **A page load ends the story, and hands
  it on** has the rest.
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

- **A target that is not on the page when its step arrives gets a 100ms grace period**, during which the target — selector or function — is resolved again on every mutation. The application is mid-render, and that is the whole of what the window is for: a step whose target renders a moment after its `onEnter` returned is drawn as though nothing had happened.
- **And once more as the grace period runs out**, before the tour is given up.
  A mutation is not the only way a target turns up: a style can give it back
  the box it needs to be found at all, a framework can render it inside a
  shadow root the observer does not enter, a stylesheet can arrive in the head.
  So the deadline is a bound on the wait rather than the last word on it, and
  the ways in are a batch heard while it runs and one question at the end.
- If recovery fails, the tour ends with `target-lost`. A function that returns a held element can never recover, because the old node stays disconnected — prefer selectors, or functions that resolve fresh. See `target-not-there-yet.ts`.
- **An element with no box is not found when the target is resolved**, so a
  step arriving at a hidden target is a step whose target is not there: it
  waits its 100ms and ends the same way. That is resolution answering, and
  resolution runs on an arrival, on a retry tick and on a landing — always
  before the step is drawn.
- **Whether the target is still there stops being watched once the step is
  drawn** — `validate` still asks on a press, and a target gone by then ends
  the tour here with no window at all. The rule is stated in one place, under
  **What Leko does not do**.

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
- **A branch on the viewport's width is a branch like any other.** The
  application chooses the story at `start()` or in `next`, and answers a width
  crossed mid-story with `stop()` and a fresh `start()` of the story for the
  new width, which is cheap because the story is short. The docs site's demo
  does both: `docs/src/lib/stories.ts` chooses, and
  `docs/src/components/PageTour.astro` answers the crossing.

## Settings, and where they are read from

- `padding`, `radius`, `scroll`, `resolve`, `duration` and `easing` are read
  from the step, then from the instance, then a built-in default —
  `visible-first` for `resolve`, argued under **Which of several matches a
  selector means**. `nextLabel`, `closeLabel`, `halo` and `hostChrome` are read
  from the instance alone.
- The nearer tier that says anything wins, and `??` does the reading rather
  than `||` — a step writing `0` beats an instance writing a number.
- **A step may say how long its movement takes, and how it moves.** The
  instance's `duration` and `easing` stay the house rule and the default, and a
  step that says nothing keeps them. But how long a movement takes is also a
  fact about what the step shows — the darkening that opens a tour, a target
  meant to be taken in — so a step may override it the way it overrides
  `padding`. A step's value governs the movement into it — the glide, then the
  opening or the morph — and nothing about leaving it.
  - `GLIDE_PACE`, `GLIDE_BEAT` and the shake's length and curve stay fixed:
    each would be a second setting about the same movement — **A beat of 300ms
    between stages, and it is not a setting**.
  - The halo's fade stays `--leko-halo-fade` in CSS. It is a transition on the
    browser's clock, paint rather than a movement Leko runs frame by frame —
    **The halo**.
- **A story carries no settings.** A per-story value is a `.map()` over `steps`
  in code the host already owns, and that version can vary the value inside the
  story as well. A story tier would also push `story` through the seam into the
  half that draws, where nothing else wants one.

## Nothing is drawn for a retry

The one wait Leko has on its own account is a step arriving at a target that is
not on the page — not rendered yet, or taken away in the moment before its
holes could be measured. **Nothing *new* is drawn while it runs.** Whatever was
drawn last stays put, and a target that turns up costs a morph and nothing else.
A morph already asked for is not cut short — a retry stops a glide and a
deadline, and a morph is on neither of those — so it paints to its end, and
what it reports when it gets there is ignored, because the step it was drawing
is no longer the one on screen.

That leaves a hole standing over the gap, but only for 100ms — a target is
usually missing because a framework is mid-render, so the ordinary outcome is
that nobody sees anything at all. Covering the page would make the recovery
louder than the fault, with nothing to say on it: what the application is doing
is not something Leko knows.

- A step that waits is different: it is drawn, cuts no hole, and shows the
  step's own `message`. A retry is a wait Leko is having; a waiting step is a
  wait the application declared, and only the second has anything to say about
  itself.
- **Every retry belongs to an arrival, so `Host.lost` is only ever about a step
  that was arriving.** Giving up is the whole of what the machine hears: the
  wait itself is not reported, because a host cannot catch a window that short.
- `start()` on a story whose first target has not rendered blocks nothing for
  those 100ms. The tour has drawn nothing and the page is exactly as it was, so
  there is nothing for a stray click to interrupt.
- A resize that lands while the retry runs puts the standing holes back and
  says nothing, as one during a glide does, and the layers are measured
  against the surface again when the step is drawn all the same: where the
  target that went is the one standing there is nothing to put back, and a
  step drawn into layers sized for the page as it was would leave the part the
  page grew by neither dimmed nor blocked until the next resize.

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
- A `reached()` that matched the showing step, or a URL change a step is
  awaiting, dropped the same way, is reported (`signal-dropped`): the step now
  waits for something the application has already been through, and silence
  there is a step hanging for no visible reason.

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
  same two. The note a page load hands on is no exception: it lives in the
  page's own storage, written and taken by the presenter, and the machine
  keeps nothing of it — see **A page load ends the story, and hands it on**.
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
- **The page is measured when a step is drawn, and not again.** A hole is cut
  where the target was at the draw, the morph carries it there, and nothing
  measures the target after that: not a target that moves, not one hidden where
  it stands, not one whose box changes size, not one taken out of the document,
  not one a re-render replaced. A scroll is the exception and it
  costs nothing — the scrim lives inside whatever scrolls the target, so the
  two move together with no script running, which is the rule under
  **Scrolling**. A resize is the other: the surface moved under the tour, so
  the holes are placed again.
  - So **a target that keeps moving gets one morph and no more.** A card
    animating into place, an element under a running transform, anything a
    frame loop is moving: the hole is measured once and stays. Following one
    would mean reading the target's layout every frame, which is the one thing
    **Scrolling** rules out, and a product tour points at the affordances a
    user acts on — a field, a row, a control — rather than at something in
    motion. A step whose target is still arriving belongs after the animation:
    that is what `onEnter` and a step with `awaits` are for. Where the motion
    is the point — a mascot that sways, and the application's atmosphere is
    not Leko's to freeze — a step will be able to ask for its holes to be
    followed, at the price of that measurement per frame and off unless it
    asks. That is issue #158 and it is not the default this bullet describes.
  - And **what a step assumes is `onEnter`'s to build and to keep, for the
    whole length of the step.** Up to the draw Leko is deciding what to point
    at, so an element with no box is nothing to point at and the step waits for
    one. Past the draw **a drawn step watches nothing**: not the target's box,
    and not whether the target is still on the page at all. A step named it, so
    keeping it there while the step is showing is the application's promise and
    not Leko's question — which is what a tour costing the host nothing but the
    story means at the one place it costs something. This is about *whether*
    the target is there; *where* it is is the question this bullet's parent
    answers, and #158 is the opt-in that would change that answer rather than
    this one. Watching nothing is not the same as asking nothing: `validate`
    resolves the target afresh on a press, to hand the guard the element its
    parameter is not nullable for, and a step whose target has gone by then
    ends the tour with `target-lost` on that press. So `v-if` and `v-show` are
    the same thing here — each leaves the hole standing over the gap it left,
    and neither ends the step the hole was cut for.
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
  and `nested-scroller.ts`). There is **one exception**, it is a
  `position: sticky` target and nothing else, and it has a bullet of its own
  below — so the ban and the exception cannot be quoted apart.
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
  that shows a toolbar beside the panel it opens is a step worth writing. A
  sticky region in the other state from the first one is the same rule again,
  and takes the same answer.
- **A sticky target is drawn in the state it is in, and there are two.** A
  `position: sticky` element rides the scroll until it pins, is then held
  against its scrollport's edge while everything under it moves, and rides
  again once its containing block runs out. Riding, it is an in-flow element
  and the layers it already had are exactly right. Pinned, it is held by the
  scrollport rather than by the content, so its layer is held there too: the
  document's scrollport is the viewport, which is the layer a fixed target
  already gets, and a panel's is a layer glued to that panel. Which of the two
  is read once, at the draw, from the boxes the draw is reading anyway, and
  never again while the viewer scrolls: what a later scroll changes is not
  which layer carries the target but where in that layer the target has got to,
  and the bullet below is what corrects that. The chain outside the innermost
  layer is untouched, because a glued layer still lives in its panel and the
  page scrolling still carries the panel.
- **A sticky target's hole is corrected on a frame loop, and that is the only
  exception to the ban.** A target that pins moves inside whichever layer
  carries it — that is what pinning is — so the hole cut at the draw is right
  on one side of the pin and wrong on the other. A loop of Leko's own puts it
  back: one `getBoundingClientRect` per element of the step's holes, on
  `requestAnimationFrame`, and the boxes written from what came back.
  - **Only a draw whose target resolved sticky starts it**, and it is armed in
    the one place every draw and every redraw passes through. An in-flow
    target's layer rides the scroll with it and a fixed target's does not move
    at all, so neither has anything to correct and neither costs a frame.
  - **It measures rather than predicting.** The piecewise-linear path a
    scroll-driven animation would follow is only right while the layout it was
    computed from holds, and it goes stale silently when the application
    changes the page under the tour. A measurement cannot: it is late by a
    frame and never wrong.
  - **A frame writes the mask, the blocking rectangles, the halo boxes and the
    anchor marker, and nothing else.** The target is not resolved again, the
    surface chain is not walked again, no layer is measured or resized, the
    outer layers' holes stay where layout left them, the host's chrome is not
    re-read, and nothing is asked that forces a layout — the halos are moved
    rather than placed, because placing them commits a style through
    `offsetWidth`. The blocking is written *with* the mask rather than ahead of
    it, unlike the morph's: hit-testing lagging the paint under the viewer's
    own pointer is the cost that ruled the compositor out in the first place.
    The message's side and the way out's corner are not chosen again, for the
    reasons under **The message** and **The way out**.
  - **The cost is a frame of lag, and on a page nobody is scrolling it is not
    even that.** The loop is started by a `scroll` on one of the ports the
    chain named, and parks after two frames of boxes that have not moved. An
    idle page pays for a passive listener per port and no frames at all. A
    background tab runs none either, which leaves what the draw drew — as does
    a target that has left the page, which stops the loop for good.
- **Pinned is read from the inset, never from `offsetTop`.** The obvious test
  — the element's box against where `offsetTop` says the flow put it — says
  nothing at all: `offsetTop` reports the stuck position and grows with the
  scroll for the whole pinned range, so the difference is zero in every state
  and every engine. The exact-looking one — write `position: static`, read the
  box again, put the style back — answers a different question, displacement
  rather than held, and calls an element riding past the end of its containing
  block pinned; it also writes to an element the application owns and flushes
  layout to do it. What is asked instead is the element's box against its
  scrollport's edge, less the used inset: zero when pinned, and right in every
  state in Chromium, Firefox, WebKit and Safari
  ([`spike/a-sticky-target-pinning/`](spike/a-sticky-target-pinning/)). It is
  one `getBoundingClientRect`, one `getComputedStyle` and the scrollport's own
  box, all three read at the draw already. `stickySlack` in
  `packages/spotlight/src/geometry.ts` is the arithmetic, and it answers the
  signed distance rather than a flag, because that distance is also the scroll
  left before the element pins.
- **A layer glued to a scrollport is what `position: fixed` cannot say.** There
  is no way to hold a box against a scroller's port the way a fixed box is held
  against the viewport, so the layer is made of two: an absolutely positioned
  wrapper the size of the scroller's content, holding a `position: sticky`
  child the size of the scrollport. Asked for at `top: 0; left: 0`, in a
  scroller with no padding, that pair sits exactly on the padding box at every
  offset on both axes, including both far corners, and adds nothing to the
  scrollable area it is mounted in, in all four engines — table 3 of
  [`spike/a-sticky-target-pinning/`](spike/a-sticky-target-pinning/). The
  three layers inside it are written in the port's coordinates and none of them
  moves on a scroll, so scroll tracking still runs no JS. Both halves of the
  pair carry the stacking level, because a sticky element establishes a
  stacking context whatever its `z-index` and would otherwise trap the layers'
  own inside it. And both this layer and the reading above have to take the
  scroller's padding off: a sticky element is held within the scrollport *less
  that padding*, so a child asking for `top: 0` comes to rest 11px inside the
  padding box of a panel with `padding: 11px` — which leaves that padding
  undimmed, and makes a reading taken against the padding box call a pinned
  header riding by exactly the same amount. So the reading compares against the
  content box, and the glued child asks the padding back as a negative inset,
  which puts it on the padding box at both ends of both axes. Those insets are
  what Leko writes, so the spelling above is table 3's rather than the shipped
  one: table 6 of the same page is what measured this one, in the same four
  engines. For a target in the page this shape is not needed: the document's
  scrollport is the viewport, and that is the fixed layer, saying the same
  thing more cheaply.
- **What the two states can get wrong is the layer, not where the hole is.**
  Every case below is a reading that picks one state where the other was meant,
  and each is named rather than hidden — but a layer is only what the hole is
  measured *against*, and the loop above measures the hole in whichever layer
  it was given. So what a wrong reading costs is the frames the loop does not
  run in: a background tab, and the moment before the first `scroll`. At the
  instant of the pin itself an element sitting exactly on its inset is one
  pixel of scroll from pinning and is read as pinned; either answer is right at
  that offset and wrong on one side of it. An element sticky on two axes with
  only one of them held is drawn glued. Only the start edges are read — `top`
  and `left` — so an element given both insets on an axis and held against its
  `bottom` or `right` reads as riding. And the reading is taken against the
  innermost surface of the chain, which is the innermost scroller that actually
  scrolls: an element sticky against an ancestor that is not one —
  `overflow: hidden`, or `overflow: auto` with nothing overflowing — is
  measured against the port outside it instead, which is usually the viewport,
  so it reads as pinned only where it happens to be sitting on that port's
  edge. `sticky-header.ts` is the case.
- **What moves a target without a scroll is not followed.** An image arriving,
  a font swapping, a panel opening beside the target: layout moves and no port
  has scrolled, so no frame is asked for and the hole stays where it was until
  the next resize or the next step. That is what the tour did before the loop
  existed as well, for every kind of target, so it is a limit rather than a
  regression — and the shape to reach for if it ever has to be answered is a
  `ResizeObserver`, the way **That layer is sized past the layout viewport on
  purpose, gutter included** already notes.
- **The zero-JS answer is `animation-timeline: scroll()`, and it was not
  taken.** A scroll-driven animation would let the hole follow the whole
  piecewise-linear path — flow position, then the inset, then flat again — with
  no JS per frame at all, which is one better than the loop above. What ruled
  it out is not the frames. It **predicts**: the path is computed once from a
  layout, and an application that changes that layout under the tour leaves it
  confidently wrong with nothing to notice. The loop measures, and can only be
  late. And the blocking rectangles are not paint — they are elements a
  hit-test has to find in the right place — so they could not go to the
  compositor with the mask however the rest was spelled, which leaves a design
  where what is drawn and what is reachable are answered by two different
  clocks. Three more things stand in the way besides: the support floor it
  would need is not the one under **Browser support**; it runs on the
  compositor, which is where [`spike/waapi-clip-path/`](spike/waapi-clip-path/)
  found Chrome rasterising a clip path at the wrong scale; and it would drive
  the same inline `mask-position` the morph writes frame by frame, so the two
  would need a handover. If it is ever wanted it wants a page in `spike/` of
  its own.
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
- **A draw mounts its layers, then reads, then writes.** The scrim's writes do
  not move the page — true of the mask, the rectangles, the halos and the
  layers' sizes, and what lets a draw read every box it needs and then write
  every layer without a read landing between two writes. The one exception is
  mounting the first layer into a scroller that is `static`: the layer is an
  absolutely positioned child and lands on the content origin only if the
  scroller establishes a containing block, so Leko writes `position: relative`
  onto it, and that moves the containing block of every absolutely positioned
  descendant written inside that scroller. One with an inset jumps to the
  scroller's padding box and onto its scroll; one with every inset `auto` stays
  put and starts riding the scroll; nothing else moves, in any of the three
  engines
  ([`spike/a-static-scroller-made-relative/`](spike/a-static-scroller-made-relative/)).
  So the layers are mounted first, every box is read after that, and the layers
  are written last. The numbers then describe the layout the viewer looks at for
  the rest of the step, and the same one every resize reads — a hole cut from
  the boxes before the write would miss a target with an inset from the first
  frame, and be corrected by the first resize. Only that kind of target turns on
  the order: a hole is cut in the scroller's own space, and for a descendant with
  every inset `auto` the write moves neither the box on screen nor that space's
  origin, so the hole is the same either side of it. What the write settles there
  is which scroll carries the target, and the hole was riding the scroller all
  along. The box an opening converges from is one of the reads, so
  `Scrim.converge` is handed it and writes only, like `set`.
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

- **The scroll finishes before the step is drawn, never both at once.** The
  hole itself would survive a morph running alongside the scroll —
  the scrim lives inside the scrolling content, so its cutouts are in content
  coordinates and a scroll moves scrim and target together. What would not is
  every decision taken in viewport coordinates: the side of the hole the
  message takes, and the corner the way out sits in. At 320ms, the instant a
  default morph would be finishing, a browser's own smooth scroll in Chromium
  still had 372px of a 2000px trip to go and 2378px of a 5000px one, and
  Firefox 66px and 213px — so a side chosen then is chosen about a screen the
  page has already left
  ([`spike/a-smooth-scroll-settling/`](spike/a-smooth-scroll-settling/),
  question 1). The glide is Leko's own now and the numbers are Leko's too, but
  the shape is the same: a page that is moving is a different screen every
  frame, and nothing is decided about it until it stops.
- **The glide is Leko's own animation, the way the morph is.** A
  `requestAnimationFrame` loop in `glide.ts`, eased with the morph's curve —
  **The morph** argues its shape, and a host may bring its own as `easing`, on
  the instance or on the step —
  writing one instant `scrollTo` per frame from numbers it
  computed before the first one, the exact destination on the last frame, and
  ending on its own clock. Nothing then has to be inferred about when an
  animation somebody else is running has ended, and nothing has to stop it but
  Leko. **Do not go back to the browser's smooth scroll for it.**
  `behavior: 'smooth'` is the obvious spelling and was the first one, and an
  animation Leko did not run had to be watched from the outside: a `scrollend`
  listener, a 120ms check that the page had begun to move, a 2.5s deadline
  under both, and a heuristic telling a `scrollend` of this scroll from one
  that belonged to something else. Around that sat a rule per engine — a panel
  set outright because Firefox drops a smooth scroll aimed below the fold,
  every scroll asked for as an offset because WebKit resolved a `scrollBy`
  against where its own animation had got to, and a glide the tour had moved
  past left to finish because Firefox and Chromium could not stop one. Safari
  had no `scrollend` before 26, so there every scrolling step waited the whole
  deadline with the page dimmed and no step on it. Questions 2, 4 and 5 of the
  spike are the record of all that, and none of it has an equivalent here: the
  loop writes the offsets it computed, so offset against delta does not arise;
  a panel is set or glided as the design prefers; and a glide is cancelled by
  cancelling its frame.
- **A port that needs no scroll is never waited on.** The delta decides, and a
  delta of zero means the step is drawn in the same task the arrival came in
  on. So does a destination that clamps to where the page already is — a
  target hanging off an edge the page is already against — because there is
  nothing to glide to.
- **The destination is clamped once, before the first frame**, to the range
  the page can reach: `scrollHeight` less `clientHeight`, and the same across.
  The geometry does not clamp, and a port clamps whatever is written to it, so
  a loop writing offsets past the end would read them back clamped and take
  that for the viewer. The range is read up front, where reading layout is
  already allowed, and the loop never writes past it. A staged scroll clamps
  every port's the same way and at the same moment — before anything moves —
  but in the fold rather than beside the loop, for the reason
  **Nothing in the geometry clamps; whoever scrolls does** gives where it names
  its one exception.
- **The viewer taking over.** Each frame reads the page's offset before it
  writes one, and where the page is not within a pixel of where the last frame
  left it, somebody else moved it: the loop stops, and the step is drawn where
  the page is. Their scroll is not Leko's to undo. That read is of a scroll
  offset, during a scroll Leko started, and **The morph** says next to the rule
  why it is neither layout nor the viewer's scroll. A pixel rather than
  equality because engines round what is written and some report fractions
  back. The offset read is that of the port the frame is moving, so a staged
  scroll asks this per port, and a viewer who takes one over ends the whole
  glide there rather than going on to the next port. The stages after it would
  still be aimed correctly — a destination is a port's own offset, and moving
  an outer port moves the box and the inner ports together — so what ends the
  glide is the same sentence above: their scroll is not Leko's to undo, and
  carrying on to move a second port under somebody who has just taken charge of
  the page is undoing it in all but name.
- **The page glides; a nested panel is set.** `scroll: true`, which is
  `'direct'`, and the default of the two modes. The movement a viewer follows
  is the page's, and a panel's inner scroll is a detail inside a box that is
  not on screen yet, so the panel is put where it belongs outright, first —
  which also makes the page's own delta exact rather than measured against a
  scroller still in flight. It is a preference and no longer a rule an engine
  dictates. It stays the default because it is one movement and most steps are
  one port deep, and a step that is one port deep is the same trip either way.
  The walk keeps measuring rather than doing the arithmetic below: the box is
  read again for each port, so what the page glides is what the panels left,
  down to whatever an engine rounded a panel's offset to. Gliding every port at
  the same time is a different thing again from staging them, and is still a
  second step if it is ever wanted.
- **`scroll: 'staged'` moves one port at a time, outermost first.** What a
  viewer has to be able to do afterwards, alone, is *the page goes down to the
  panel, then that list scrolls to the row*. Shown as one movement, the row was
  never anywhere else: its panel's scroll happened before the panel was on
  screen, and a move made before the thing making it can be watched teaches
  nothing. So the page glides until the panel is on screen, the panel then
  glides to bring its own child in, and the step is drawn when the last one
  lands. The order is the reverse of the walk that computes it, and it is the
  order a person would make the moves in: nothing scrolls before the thing
  doing the scrolling can be watched.
  - **Nothing is written until every destination is known.** An outer port is
    measured against a box the inner ones have not moved yet, so the walk stays
    innermost first and answers arithmetic rather than a second measurement:
    the box moves in the viewport by exactly what a port scrolls, which is
    `scrollStages` in `geometry.ts` and `shift` underneath it. Only the box
    moves along the chain — a port scrolls its own content, and the client box
    of every port outside it is where it was.
  - **It is one `Glide`.** `settled` resolves when the last stage lands and
    `abandon` cancels whatever is running, so everything that waits on a glide
    waits on this one the same way, and the presenter holds one mode and
    compares one identity. What that costs is that the page stops part-way
    through a stage rather than part-way through a trip, which is what **A
    glide the tour has moved past is cancelled, and the page stops where it
    is** already promises.
  - **A port with nothing to do is not a stage**, the delta deciding as it does
    for a direct scroll, so a target already showing in its panel means the
    page glides and nothing else happens. **Duration is per stage**, each one
    `glideDuration` of its own distance with `duration` as the floor under it —
    a stage is a trip, and a trip is paced by how far it goes.
- **A beat of 300ms between stages, and it is not a setting.** A stage running
  straight into the next one is one long movement again, which is the thing
  staged exists not to be: what a viewer has to take in at the hand-off is that
  *this* panel is what moves next, and that reading costs a moment. So a stage
  lands, the page holds still for 300ms, and the next one starts — never before
  the first stage or after the last, so a single-stage staged scroll is exactly
  the trip a direct one is. `GLIDE_BEAT` sits beside `GLIDE_PACE` in
  `geometry.ts` and is one constant rather than an option for the reason
  `GLIDE_PACE` is one: a host that wants the whole thing quicker has
  `duration`, and a beat a host could tune is a second setting about the same
  movement. `duration: 0` and reduced motion have no stages to hold between, so
  the beat never runs there. A beat is not a stage: nothing is drawn during one
  and nothing is armed, it is inside the glide, and an arrival that cancels the
  glide cancels a beat in flight exactly as it cancels a frame. It is judged by
  eye in `staged-scroll.ts`, the way the pace was.
- **A glide grows with the distance, and is much slower than the morph.** A
  tour is for somebody new to the application, and what passes under the
  pointer while the page glides is part of what they are there to see — a
  glide over before it is noticed hides the page it crosses. So a longer way
  takes longer, **by the cube root of the distance** times `GLIDE_PACE` in
  `geometry.ts`. Not in proportion: a pace of so many pixels a second was right
  for a card one screen down and far too slow for a row six screens down,
  because the eye does not read a long scroll the way it reads a short one — it
  takes in that the page went a long way, and that sense is what should grow
  with the distance, not the wait. Set by eye in `scrolls-into-view.ts`: the
  card one screen down takes about 1.3 seconds, four morphs, and the row six
  screens down about 2.5. `duration` is the floor under it, so a short move
  glides for as long as the morph that follows rather than snapping, and `0`
  turns both off together. It is a distance term on the option a host already
  has, not a second setting, and the sandbox's pace control does not slow it —
  a reading speed is not a drawing speed. The root is its own ceiling: eight
  times the way is twice the wait.
- **What it costs.** The frames run on the main thread, as the morph's do,
  where an engine runs its own smooth scroll off it, so under main-thread load
  this glide stutters where the browser's would not. On a machine that produces
  no frames it jumps to the end on the next one, which is what the morph does,
  and what the CI runner already showed a native glide doing at 16ms ticks (the
  spike's **What it did not settle**).
- **The scroll animates exactly when the morph does.** `duration: 0` and
  `prefers-reduced-motion` each put the page where it belongs outright, and the
  rule is one predicate in `motion.ts` read by both, so the two can never
  disagree about whether the tour is moving things or setting them. Whichever
  mode was asked for: a mode is what a movement looks like, not whether there
  is one, so every port is set in the same task and the step is drawn in it.
- **Nothing is drawn for the gap.** The words of the step being left go before
  the page moves, rather than riding a glide to somewhere they are not about.
  Nothing else changes while it runs: the dimming stays, and the standing hole
  travels with the content it is cut out of, which is the same bargain
  **Nothing is drawn for a retry** strikes.
- **Nothing is armed for it either, and a reason waits with the step.** For
  the length of a glide the tour is on one step and the screen is showing
  another, so everything that redraws without the tour moving would otherwise
  act on a step the tour has left. A glide entered over a retry is the one case
  with anything running at all, and the hunt goes when the glide starts: a
  target turning up now for the step the tour has just moved past would be an
  arrival at a step nobody is waiting for. A reason the guard gave is written
  into the step on its way and drawn when it arrives, rather than onto the step
  being left, where it would be said beside a hole the page is still carrying
  and gone by the time it landed. A resize puts the standing holes back and
  places the way out again, and says nothing.
- **The middle of the port, not the nearest edge.** A step exists to draw
  attention to one thing, and a hole flush against the bottom of the screen is
  the least attention a hole can be given: no room under it for the message, and
  whatever chrome the application keeps down there sitting over it. The least
  movement is not what is wanted, so it is not what is asked for. Every
  scrollport on the target's surface chain centres the cutout in itself,
  innermost first, with the box measured again for each — scrolling an inner
  scroller moves the target inside every port outside it.
- **What is brought in is the first region's hole, not its first element.** A
  region of several elements cuts one hole around all of them, and the hole is
  what the step is about, so the union of the region is what is measured
  against each port, the same way the element was. Measured on the first
  element alone, a region of two landed its hole half their gap low: the second
  element hung below the middle, and past the fold with a gap wide enough. The
  worse half was that the top-edge rule below read the element's height, so a
  hole taller than half the port was centred like a small one and left the
  message the room a small one leaves — the case that rule exists for.
  `scroll-margin` still comes off the first element, because it is the
  application's word about the element it wrote it on. Later regions stay where
  they are: a hole the step shows without opening is there to be looked at, and
  a step that wants it on screen puts it in the first region.
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
- **Nothing in the geometry clamps; whoever scrolls does.** A target near the
  end of the content cannot be put where it belongs, and the delta asked for is
  the one that would put it there — past the end. The port clamps a panel set
  outright, and the glide clamps its own destination before its first frame,
  which lands the target as near as the content allows and against the far edge
  in the limit. **`scrollStages` is the exception, and is the only one.** A
  staged scroll works out every destination before it writes any of them, and
  the port after each one is measured against the move that will happen rather
  than the one that was asked for — so what the port would have clamped has to
  be clamped in the fold, from that port's own limit, which is why those limits
  are read up front and handed in with the ports.
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
  alone, which has nowhere to go. A sticky target that has pinned skips its own
  port for the same reason — scrolling the port it is held against does not
  move it — and is brought in by whatever ports are outside that one. One still
  riding is brought in like anything else in the flow, and a trip that carries
  it past its pin is drawn pinned, because the state is read after the page has
  stopped rather than before it started: DESIGN.md, **Only an arrival scrolls**,
  and the resolve and the measure both happen when the glide lands.
- **"Past the pin" is not a second destination.** It is the obvious way to make
  the state a step is drawn in the state it will stay in, and it is not built.
  The movement that carries an element past its pin is a scroll of the very
  port a pinned target skips, so the destination would need an exception saying
  a surface that is not scrolled is scrolled after all. It is not always
  reachable either — the containing block ends, the content ends — so riding
  would still have to be drawn. And a trip to the middle of the port that
  happens to cross the pin already lands pinned without it, while one that does
  not cross it would have to be pushed past the target to get there, against
  both **The middle of the port, not the nearest edge** and **A port that
  already holds the cutout is not touched**. The arithmetic is `stickySlack`'s
  and is already written down, so this stays cheap to add if it is ever wanted.
- **Only an arrival scrolls.** The call sits in `arrive` in `presenter.ts`,
  which `show` is, between the target resolving and anything being measured,
  and what it answered goes into the `show` event as a fact. Every redraw goes
  through `reveal` instead — a resize, a framework rendering over the step —
  and by then the viewer may have moved the page on purpose, so none of them
  scrolls again.
- **A glide the tour has moved past is cancelled, and the page stops where it
  is.** An arrival replaces it and a teardown drops it, and both cancel the
  next frame first, so the step that was being glided towards is dropped rather
  than drawn over the step that overtook it, and the page does not slide on to
  a step the tour has left. A step arriving then that does not scroll is drawn
  against a page standing still; one that does scroll measures against the
  page as it stands and runs a glide of its own from there. The browser's glide
  could not be stopped — an instant scroll to where the page is, which CSSOM
  View says aborts the animation, left Firefox gliding on and Chromium a frame
  further in silence (question 5 of the spike) — which is one of the reasons it
  was given up.
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
  different thing. So is the glide under **Bringing a target into view**: each
  of its frames reads back the one scroll offset it wrote the frame before, to
  tell whether the viewer has moved the page, and writes the next from numbers
  it had before the first — a read of a scroll offset during a scroll Leko
  started, not layout, and not the viewer's scroll. The third loop is the one
  this rule is about, and it is the exception: the follow under **A sticky
  target's hole is corrected on a frame loop, and that is the only exception to
  the ban** reads layout, during the viewer's own scroll, and is bounded
  instead by what starts it — a sticky target and a `scroll` on one of its own
  ports — and by parking two frames after the boxes stop. On a scrim 12 000px tall,
  three holes and 120 frames cost
  nothing measurable in any engine — but **an `<svg>` scrim masked the SVG way
  costs 81ms a frame in WebKit**, which is the tidier design and unusable, and
  only WebKit says so ([`spike/overlapping-holes/`](spike/overlapping-holes/)).
- **The curve leaves from rest, and arrives the way it always did.** `ease` in
  `geometry.ts` is Material 3's standard easing, `cubic-bezier(0.2, 0, 0, 1)`,
  and the glide follows the same one. The curve before it was
  `1 - (1 - t) ** 3`: continuous in position and not in speed, leaving at three
  times the average, so a hole was at full tilt on its first frame. In a morph
  that is a jolt in the mask; in a glide it is the whole viewport shoved, and
  the shove grows with the trip, because `glideDuration` stretches with the
  cube root of the distance while a speed of three times the average scales
  with all of it. **The peak is not lower — it is higher**: 4.05 times the
  average at `t ≈ 0.12`, against 3 at `t = 0`. What was fixed is the
  discontinuity, not the maximum, and flattening the curve to bring the peak
  down would trade away the asymmetry the shape is for. What changed is the
  departure: the two curves are 0.132 apart at their widest, at `t ≈ 0.075`,
  and from the midpoint on they never differ by more than a hundredth — 0.0097
  at `t ≈ 0.694`, which on a 2 000px glide is 19px, and both of them are within
  0.003 of each other at `t = 0.5` and at `t = 0.9`, so sampling only there
  flatters it. Half the way is still covered by `t = 0.2`, where the old curve
  had covered 0.488, and the last tenth of the time still covers a fraction of
  the first, so the arrival — the part anyone is looking at — is the arrival it
  always was. An `ease-in-out` is the symmetric answer and
  the wrong one for the same reason: the departure should be over before
  anybody has looked. CSS's own `ease`, Material, Fluent and Apple's springs
  are all asymmetric this way.

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

**The side is chosen from the room a host left, not from the whole viewport**,
and so is the foot the box docks to. A side with two hundred pixels under a
sticky footer has no room at all, and a box docked twenty-four pixels off the
foot of the viewport is docked inside the footer. `sideWithRoom` therefore takes
a rect rather than measuring the viewport itself, and where a host has named
nothing that rect is the layout viewport — the box being placed is
`position: fixed`, so that is what it is laid out against — and a page with no
chrome to declare is placed exactly as it always was.

**The core has no third-party runtime dependencies and must stay that way.** A
scalar tween is all this needs, and a dependency here is a licensing and
bundle-size liability for every consumer. `@annetaan/leko-spotlight` ships from
this repository under the same licence, so the rule is not about it.

### A host's own chrome is named once, and every reader takes the boxes

Three boxes Leko draws are placed from the viewport: the message beside a
cutout, the message docked where there is no cutout, and the way out in a
corner no hole covers. A host with a sticky footer, a top bar or a support
widget gets all three on top of its own controls, because the viewport is the
only thing they ever measured.

`hostChrome` is what a host says about that, and it is **a list of targets, not
an inset**. Two inputs for one fact is the arrangement where a footer that
changes height leaves one of them stale, and the boxes are the more precise of
the two: the way out already takes a list of rectangles to dodge, so a support
widget in one corner is added to that list and costs nothing, where an inset
would reserve a band the width of the screen for it. What the other two readers
need — how deep each edge is spoken for — is arithmetic on the boxes, and
`chromeInsets` is it. So the inset is derived per draw and never written down.

**Each box becomes a band along the edge it is nearest**, as deep as it reaches
from that edge. Each axis nominates one edge, so a box claims two only where
its two nominations are equally shallow — which is to say, in a corner. For
chrome that sits against an edge the band is wider than the box, and that is
the direction to be wrong in: a box placed into space the host had not claimed
lands on the host's own controls, while one placed a band too far away is only
further away. It is the rule `freeCorner` already follows in taking the least
covered corner where every corner is covered.

**A box equidistant from both edges of an axis claims nothing on that axis**,
and one equidistant on both axes claims nothing at all. There is no band that
describes something floating clear of every edge: a band deep enough to hold it
reaches from an edge across half the screen, and the two of them meet and leave
a room of no height. That is the worse of the two ways to be wrong, and it is
not a hypothetical — it makes every side fail at once, `sideWithRoom` falls back
to `bottom`, and the box is docked onto the very element that was named.
Claiming nothing leaves the placement exactly where it would have been had the
host said nothing, which is no worse than not naming it, and the way out is
unaffected either way because `freeCorner` takes the boxes themselves rather
than the bands.

So **the safe direction holds for chrome on an edge, and that is the whole of
what this models.** A widget floating in the middle of the screen is not a band,
and a message can still land on it. Name chrome that sits against an edge; there
is nothing here that can dodge the rest, and pretending otherwise costs the room
its height.

**Nothing is kept.** The elements are resolved and measured inside the same
read that measures the step's targets, so a footer that is not on the page
right now claims nothing and one that grew is read at its new height — **A
target is a question**, and **The page is measured when a step is drawn, and
not again**. The reads sit with the others, after the layers are mounted and
before anything is written: **A draw mounts its layers, then reads, then
writes**.

**Placement is all it does.** The scrim still blocks whatever the step did not
open, so naming an element here does not make it usable; the sandbox's
`host-chrome.ts` is the case, and the footer it declares is chrome the sandbox
paints above the scrim itself.

## The packages, and the seam between them

- `packages/types` is the public vocabulary — what a step, a story and a
  target are — and nothing but types.
- `packages/machine` decides which step the tour is on. **Its `lib` is `ES2023`
  alone, so a `document` there is a compile error.** Its tests run in Node
  against a fake.
- `packages/presenter` is where the two halves meet: the mode the drawing is
  in, what an event does to it, and the class that performs the effects.
- `packages/spotlight` draws the scrim, the hole and the message. It does not
  know what a step is.
- `packages/leko` holds the class a consumer constructs, re-exports the
  vocabulary `@annetaan/leko-types` declares, and is the only one that
  publishes.

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

The state literals are written out on both sides of the seam, deliberately:
`LekoState` in `packages/types` and `MachineState` in the machine. The
vocabulary names `Element`, and the machine's `lib` is `ES2023` alone, so it
cannot import the package; `World` narrows `LekoWorld` the same way, with
`anchor: unknown` where the vocabulary says `Element`. `Target` is written
twice as well, in `packages/types` and in `packages/spotlight`, and the JSDoc
on `Target` in `spotlight/src/target.ts` says why. The four workspace packages
are private, and `@annetaan/leko` bundles all of them in with `tsdown`, so a
consumer installs one package with no runtime dependencies and a `.d.ts` that
names none of them. **`pnpm check:pack` reads what `npm pack` would send and
fails on a bare import the manifest does not depend on.**

## How to write here, and where tests go

- **Write in a functional style wherever the code allows it.** Everything
  difficult here is geometry. `geometry.ts` takes numbers and returns numbers,
  so it is tested by stating properties — *no blocking rectangle ever overlaps
  a hole*, *every path has the same segment list* — rather than by driving a
  browser. Reading layout and owning elements cannot be pure, so that stays in
  `packages/spotlight` and in `presenter.ts`, and stays small. Naming the
  package rather than the files is deliberate: the list of files this used to be
  only ever grew when somebody created one, so it ended up three short and
  naming `leko.ts`, which holds no DOM at all. Logic that gets hard to follow
  inside a class usually wanted to be a function in `geometry.ts` with a test of
  its own.
- **Where a class has to wait on more than one thing, its mode is one union
  and a pure function says what an event does to it.** The machine is
  `plan.ts` and `machine.ts`; the presenter is `plan.ts` and `presenter.ts` in
  `packages/presenter`, the same split. The presenter waits on a glide, a morph
  and a retry deadline and listens to an observer and `resize`, and which of those
  is running used to be four nullable fields read together, with the rules
  about their combinations written as prose that nothing checked. One field of
  four variants, each carrying what belongs to it, spells only the states the
  prose allowed, and the transitions — where every recent presenter bug had
  been — are tested in Node one `(mode, event)` pair at a time. What the page
  says goes into the event as data; the shell reads the page and never decides
  what it means.
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

## Comments are the last place a fact goes

**Where things are written down** says where a fact lives, and a comment is
none of those places. It is read only by somebody already in the file, only
while they are in it, and nothing checks it — so a fact kept there has no
reader looking for it and no test holding it true. It also cannot be found, and
a rule nobody knows to grep for is a rule that gets written a second time.

**A comment earns its lines only where the fact is in none of the other
places.** Four kinds usually are not:

- **What a browser does, and the page that shows it.**
  `getBoundingClientRect` answers all zeros both for an element with no box and
  for a rendered one of zero size, which is why `hasBox` asks `getClientRects`
  instead. Nothing in the code says that.
- **What was tried and broke.** Code keeps no trace of the version before it,
  so the reason not to go back is nowhere else at all.
- **A number's reason.** `RETRY` is about six frames because `onEnter` returns
  synchronously and a framework paints at least a frame after that. Without it
  the constant is a hundred with no argument behind it.
- **An invariant the types cannot spell**, and only where they cannot.

Everything else goes one of two ways. A fact the code, the types or the names
already carry is deleted. A fact this file, CONTRIBUTING.md, ONBOARDING.md or a
sandbox case already carries is collapsed to a citation of the heading or the
case — never re-argued, and never by line number, for the reason
CONTRIBUTING.md gives.

**Decide that by grepping, never from memory.** One rule reaches three places
easily — here, a sandbox case a viewer reads it in, and a comment over the
function — and each copy is written by somebody sure it was not written down
yet. Where copies exist the comment is the one that goes: a sandbox message is
read by a viewer, this file by whoever is deciding, and a comment by whoever is
already convinced.

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

The Navigation API a URL-waiting step's fallback exists for is present on the
top of Chrome, Firefox and Safari alike — `'navigation' in window` was `true`
in Playwright's builds of all three
([`spike/a-same-document-navigation/`](spike/a-same-document-navigation/)) —
but that is a claim about the top only. The spike never touched the floor, and
a Safari still on 18.x has none; **A URL is a signal the page reports** says
what an engine without it hears instead.

`sessionStorage` and `pagehide`, which **A page load ends the story, and
hands it on** relies on, predate every other floor this file would quote and
add no constraint of their own.

## Where things are written down

|                                                                |                                                              |
| -------------------------------------------------------------- | ------------------------------------------------------------ |
| A rule, and why it holds                                       | this file                                                    |
| A fact none of the places below can hold                       | a comment, under the rule above                              |
| Evidence that a browser does not do what the spec suggests     | [`spike/`](spike/)                                           |
| A situation a tour meets                                       | [`examples/sandbox/src/cases/`](examples/sandbox/src/cases/) |
| The machine's states, in a form a search can walk              | [`packages/machine/model/`](packages/machine/model/)         |
| The presenter's modes, in a form a search can walk             | [`packages/presenter/model/`](packages/presenter/model/)     |
| How to walk the code, the layout, which project a test goes in | [ONBOARDING.md](ONBOARDING.md)                               |
| How to work in the repository                                  | [CONTRIBUTING.md](CONTRIBUTING.md)                           |
| How settled each state core is, and how that was measured      | [STATE-HEALTH.md](STATE-HEALTH.md)                           |
| Which implementation came before, and what it got wrong        | the commits                                                  |

**This file carries no history.** Where a rule came out of a bug, what gets
written is the rule in the present tense and a pointer to the page or case that
shows it.
