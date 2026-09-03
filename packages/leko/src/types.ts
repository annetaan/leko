type Selector = string
type TargetFunction = () => Element | null

/**
 * Anything a step can point at. **Both forms are a question, never an answer.**
 *
 * A CSS selector is a question Leko runs, taking the **first** match — a
 * selector is never read as "every element that matches". A function is the
 * same question where the host runs it: return the element now, or `null` where
 * there is not one yet. Reach for it when a selector cannot say what you mean —
 * a node inside a shadow root, which `document.querySelector` does not enter; a
 * framework ref; a row your own code picks out of a list.
 *
 * **Whichever form, it is asked again every time anything needs the box** — at
 * the step boundary, on a viewport change, and on every mutation while a lost
 * target is being looked for. So a function must be cheap and must not have
 * side effects, and the element it hands back is the answer for that moment
 * only. A function that closes over a live reference recovers from a node being
 * replaced; one that hands back a variable captured once does not, and that is
 * the host's answer to give.
 *
 * There is no element form. An element is an answer somebody worked out when
 * the story was written, and by the time the step runs the page has moved on.
 *
 * An element inside an `<svg>` is a target like any other: everything asked of
 * a target is asked of `getBoundingClientRect`, and an SVG shape answers it the
 * same way, `viewBox` scaling and transforms included.
 *
 * ```ts
 * target: '#order-form'
 * target: () => panel.shadowRoot?.querySelector('.send') ?? null
 * target: () => sendRef.current
 * ```
 *
 * One of these is one element. {@link LekoRegion} is how several become a hole.
 */
export type LekoTarget = Selector | TargetFunction

/**
 * **One cutout.** What the hole is cut around, and whether the step opens it.
 *
 * `elements` is a single target, or several to be unioned into one hole. The
 * union is the bounding box of everything named, and whatever happens to sit
 * between the elements is inside the hole along with them. Name elements that
 * are next to each other: a label and its input, two neighbouring columns, the
 * first and last row of a table. Two elements at opposite ends of the page
 * make a hole the size of the page.
 *
 * A bare {@link LekoTarget} anywhere {@link LekoStep.target} wants a region is
 * shorthand for `{ elements: target }`: one element, one hole, not opened.
 *
 * ```ts
 * target: { elements: '#save', interactive: true }
 * target: { elements: ['#quantity-label', '#quantity'] }
 * ```
 */
export interface LekoRegion {
  elements: LekoTarget | LekoTarget[]

  /**
   * Let the user operate this region.
   *
   * **Off by default.** A cutout shows what is under it either way. This is
   * whether the page underneath also takes the pointer, or whether a blocking
   * rectangle sits over the hole.
   *
   * Most steps of most tours explain something that is already on screen. A
   * user who clicks one of those can navigate away from the target the next
   * step points at, and the tour ends looking for something that is not coming
   * back. So a region says when it wants the page live, rather than saying
   * when it does not.
   *
   * **Only the step's own region — the first — can declare it.** Every region
   * after that is a {@link LekoShownRegion}, where this flag does not compile.
   * One step asks the user for at most one thing, and which hole that is
   * should be readable off the step, so the type carries the rule rather than
   * a runtime check.
   *
   * **Tab is held to the same answer.** Focus walks a ring of what this step
   * opened and the controls Leko drew, so a hole that is only shown cannot be
   * reached with the keyboard either. A positive `tabindex` in the page, or an
   * `iframe` inside the region, can still put focus somewhere unplanned, and
   * what happens then is that the next key brings it back.
   */
  interactive?: boolean
}

/**
 * A region after the first: shown, and never opened.
 *
 * These are there to be looked at rather than acted on — a summary figure
 * beside the row it was computed from, the columns a total was worked out
 * over. The hole shows them, the blocking rectangle over it keeps them from
 * taking a click, and no flag opens one.
 *
 * `interactive` is declared `never` rather than left off, so that handing over
 * an object which happens to carry the flag fails to compile too — leaving the
 * property out would let structural assignment smuggle one past the rule.
 */
export interface LekoShownRegion {
  elements: LekoTarget | LekoTarget[]

  /** Only the first region can be opened. See {@link LekoRegion.interactive}. */
  interactive?: never
}

/**
 * The signal names this project reports. **Empty on purpose.**
 *
 * `@annetaan/leko-codegen` walks the `reached()` calls in a project and writes
 * this interface out, so the names arrive from the call sites and nobody
 * maintains a list. Augmenting it by hand does the same job and is the way to
 * name a signal no call site in this project reports.
 *
 * ```ts
 * declare module '@annetaan/leko' {
 *   interface LekoSignals {
 *     'order-saved': true
 *   }
 * }
 * ```
 *
 * Declarations merge, so a generated file and a hand-written one both apply.
 * **The file doing it has to be a module** — one with an `import` or an `export`
 * of its own. In a file with neither, `declare module` declares an ambient
 * module instead of augmenting this one, no completion appears, and nothing
 * anywhere reports a problem.
 *
 * The value side is unused; `true` is the shortest thing to write.
 *
 * @see {@link LekoKnownSignal}
 */
export interface LekoSignals {}

/**
 * Augment this and an unknown name in {@link LekoStep.awaits} stops compiling.
 * **Empty on purpose**, so nothing tightens by surprise.
 *
 * ```ts
 * declare module '@annetaan/leko' {
 *   interface LekoStrict {
 *     strict: true
 *   }
 * }
 * ```
 *
 * `@annetaan/leko-codegen` writes this alongside {@link LekoSignals} unless it
 * is run with `--loose`. The two belong together: a vocabulary gathered from the
 * call sites is the set of names something actually reports, so a name in
 * `awaits` that is missing from it is a step waiting for a report that never
 * comes. A vocabulary maintained by hand is only as complete as somebody
 * remembered to make it, and turning this on with one of those is a promise
 * about a list rather than about the code.
 *
 * `reached()` is never tightened by this. See {@link LekoSignal}.
 */
export interface LekoStrict {}

type Known = keyof LekoSignals
type Strict = [keyof LekoStrict] extends [never] ? false : true

/**
 * A name {@link LekoStep.awaits} may wait for.
 *
 * `string` until {@link LekoSignals} says otherwise, so a project that generates
 * nothing and declares nothing is typed exactly as it was before any of this
 * existed. With a vocabulary and {@link LekoStrict}, this is that vocabulary and
 * nothing else, and a typo here fails to compile. With a vocabulary alone, the
 * names are offered and any other string still passes.
 */
// `keyof` an empty interface is `never`, so each guard is a test for `never`.
// The tuples are the form that stays right if these ever become type
// parameters, where a bare `extends never` would distribute and answer `never`;
// an alias does not distribute, so today they cost nothing and claim nothing.
export type LekoKnownSignal = [Known] extends [never]
  ? string
  : Strict extends true
    ? Known
    : Known | (string & {})

/**
 * A name `reached()` may report. Every string, always, plus completion on the
 * ones {@link LekoSignals} knows.
 *
 * {@link LekoStrict} deliberately does not reach this far. A `reached()` call is
 * instrumentation meant to stay in the source permanently, including in builds
 * where no tour ever runs, and a type error on it would talk people into
 * deleting the call rather than keeping it. The generated vocabulary is built
 * out of these calls in the first place, which leaves nothing for an error here
 * to catch beyond the moment between typing a new name and the generator
 * running.
 */
export type LekoSignal = [Known] extends [never] ? string : Known | (string & {})

export interface LekoStep {
  /**
   * Stable identifier. Leko never reads it, and it is required so that
   * everything else can.
   *
   * It is the name a step goes by outside Leko: in the {@link LekoProblem} a
   * diagnostic hands over, in whatever counts things from
   * {@link LekoOptions.onStep}, and as the key for anything an application
   * wants to hang on a step. Grouping steps into chapters is that last one — a
   * table from id to chapter, written where the chapters are drawn. Leko grows
   * no concept for it, which is why there is nowhere here to put one.
   */
  id: string

  /**
   * What this step cuts holes in the page for.
   *
   * **Each entry of the list is one cutout.** An entry is a {@link LekoRegion}
   * — several elements become one hole by being named together in its
   * `elements` — or a bare target, which is the region of one that it reads
   * as. A list never nests: one entry, one hole, and nothing else a list can
   * mean.
   *
   * ```ts
   * target: '#save'                                  // one hole
   * target: { elements: ['#qty-label', '#qty'] }     // one hole around both
   * target: ['#save', { elements: ['#tax', '#total'] }] // two holes, three elements
   * target: [{ elements: '#terms', interactive: true }, '#summary'] // the first is open
   * ```
   *
   * **The first region is the one the step is about, and the type says so:**
   * it is the only position that may declare `interactive`, every later entry
   * being a {@link LekoShownRegion}. Its first element is what
   * {@link validate} is handed, what the message anchors beside, and the one
   * Leko watches for: a step whose first region is not on the page is not
   * drawn, and Leko looks for it. A later region that resolves to nothing is a
   * hole this step does not cut, and nothing else happens.
   *
   * A target that scrolls is fine in a region that was opened: the wheel,
   * clicks, focus and keys all reach it through the cutout. See
   * {@link LekoRegion.interactive} for what opening means, and it is not the
   * default.
   *
   * **Leave it out and the step has nothing to point at.** The page is covered
   * with no hole in it and the message docks at the foot of the viewport. That
   * is the step to write for a wait: give it {@link awaits}, start the work in
   * {@link onEnter}, and the tour stands there with the page held until the
   * application reports the name. DESIGN.md argues it under **A step that
   * waits**.
   *
   * ```ts
   * {
   *   id: 'load-draft',
   *   message: 'Loading the draft order…',
   *   onEnter: () => void loadDraft(),
   *   awaits: 'draft-loaded',
   * }
   * ```
   */
  target?: LekoTarget | LekoRegion | [LekoTarget | LekoRegion, ...(LekoTarget | LekoShownRegion)[]]

  /** Message shown alongside the cutout. */
  message?: string

  /** Space between the target's border box and the cutout edge, in px. */
  padding?: number

  /** Corner radius of the cutout, in px. */
  radius?: number

  /**
   * Whether this step brings its target into view before drawing it.
   * Overrides {@link LekoOptions.scroll}, and is off unless one of the two
   * asks.
   *
   * A step draws its target where the target is; it does not go and get it. So
   * a target below the fold is cut out of a scrim nobody can see, and the
   * viewer is left to work out that scrolling is what the step wants of them.
   * Say `true` and every scrollport carrying the target brings the cutout to
   * the middle of itself, before anything is measured — the middle, because a
   * step exists to draw attention and a hole against the bottom of the screen
   * is the least attention one can be given. A cutout more than half the
   * scrollport tall leads with its top edge instead, put at the middle, which
   * leaves the message the half above it. A target already in view is left
   * exactly where it is, and one near the end of the content lands as near as
   * the content allows.
   *
   * **What is brought in is the first region's cutout** — one hole around every
   * element the region names — and not its first element alone, so a region of
   * two lands with the hole at the middle rather than the first element, and a
   * hole taller than half the scrollport leads with its top edge whatever the
   * height of the elements in it. Later regions stay where they are: a hole the
   * step shows without opening is there to be looked at, and a step that wants
   * one on screen puts it in the first region.
   *
   * **The page glides, and the step is drawn when it stops.** The scroll and
   * the morph are two stages rather than one: a hole is placed from where the
   * target is on screen, so a morph running alongside a smooth scroll is a
   * hole placed against a page that has since moved. Nested panels are set
   * outright rather than glided. Where {@link LekoOptions.duration} is `0`, or
   * the visitor has asked for reduced motion, the page is set outright too —
   * the scroll animates exactly when the morph does.
   *
   * It is off by default because where a page is scrolled to is the
   * application's own state, and a tour that moves it is a tour reaching into
   * the application. `scroll-margin` on the target is honoured over the step's
   * `padding` wherever it asks for more room: it is how an application says how
   * much of its own sticky chrome is in the way, and what it buys is a target
   * leaning away from that side, so a step's message lands clear of the chrome
   * rather than under it.
   *
   * Nothing happens on a step with no `target`, and nothing happens for a
   * `position: fixed` target, which has nowhere to be scrolled to. A redraw
   * never scrolls again: only a step arriving does, because by the time
   * anything is redrawn the viewer may have moved the page on purpose.
   */
  scroll?: boolean

  /**
   * The name of the thing this step is waiting for the application to report.
   *
   * `reached(name)` advances the step only if the step declares that same name,
   * and does nothing at all otherwise. So a call site names what happened in the
   * application and never which step should move — insert or reorder steps and
   * the call still fires at the moment it always meant.
   *
   * A step that declares nothing here is never advanced by a signal, and gets
   * the next control on its message instead — see {@link LekoOptions.nextLabel}.
   * That is the only thing deciding whether the control appears.
   *
   * Any string, until the project has a vocabulary. See
   * {@link LekoKnownSignal}.
   */
  awaits?: LekoKnownSignal

  /**
   * Build the state this step assumes, before anything about it is measured.
   *
   * A step usually takes something for granted: a record exists, a panel is
   * open, a phase has begun. Without somewhere to put that, it has to be
   * arranged before `start()` or wedged into the caller's own flow. This is
   * where the application arranges it.
   *
   * It is not where the step is decorated. Nothing has been drawn yet, and the
   * scrim still holds the shape of the step being left while this runs.
   *
   * **Whatever it hands back is dropped.** This answers in the turn it was
   * called in and the step is drawn the moment it returns, so an `async`
   * handler runs its first line here and the rest of it after the step is on
   * screen. Leko waits for no call into the application, and DESIGN.md argues
   * that under **A step that waits**.
   *
   * So work that has to finish before the user sees anything goes on a step of
   * its own. That step names no {@link target}, starts the work here, and
   * declares {@link awaits}. The tour stands on it with the page covered, and
   * every call a host makes meanwhile is acted on rather than dropped.
   *
   * **Something that never reports leaves the tour standing there.** Nothing
   * bounds a wait, so an application whose work can fail has to say so: catch
   * it, and call `stop()`. The control that ends the tour is on screen the
   * whole time either way.
   *
   * **A throw stops the tour**, and the reason is thrown again rather than
   * swallowed. The state the step assumes was never built, so drawing it would
   * point the user at something that is not ready — the same judgement Leko
   * makes about a target that never turns up, reported as `target-lost`.
   * {@link onLeave} still runs, because a handler that failed halfway may
   * already have registered something.
   *
   * There is nowhere to register a handler for that failure, and the place to
   * deal with it is inside this one.
   *
   * This is not an analytics hook. Something that reports "a step started" for
   * a caller's own metrics is {@link LekoOptions.onStep}.
   */
  onEnter?: (step: LekoStep) => void

  /**
   * Undo what {@link onEnter} set up. Called once for every arrival at this
   * step, at the moment it stops being the current one.
   *
   * Setup that adds a listener has to remove it, and this is the matching half.
   * Without one, every `onEnter` that registers something leaks it. It runs
   * even where `onEnter` threw halfway, because the cleanup is owed either way.
   * A step with no `onEnter` at all is left the same way, for cleanup the
   * application set up somewhere else.
   *
   * `next` is where the tour is going, and is `undefined` when it is ending:
   * past the last step, after `stop()`, and when another story is started,
   * since the step the tour lands on then belongs to a story this one knows
   * nothing about. Cleanup often depends on the destination — a panel that two
   * steps use in turn is worth leaving open — which is why it is given one.
   *
   * A promise is not waited for here. The step is over, and a tour holding
   * still while the state behind it is dismantled shows the user nothing for a
   * reason that is none of their business.
   */
  onLeave?: (step: LekoStep, next: LekoStep | undefined) => void

  /**
   * Called before advancing on the next control. Returning `false` blocks the
   * transition, shakes the cutout, and shows {@link error} where there is one.
   *
   * The control claims the moment has come, and claims nothing about the state
   * behind it, so a step that has one can want a guard. This is that guard.
   *
   * **Ignored on a step that declares {@link awaits}.** Such a step has no
   * control, and it advances because the application said the thing happened.
   * Reading the page to check would be a second source of truth for the same
   * question, and the second kind is what the second constraint keeps out.
   *
   * Receives the first element of the first region of {@link LekoStep.target},
   * which is the one element the step is about. No later region reaches this.
   */
  validate?: (targetEl: Element) => boolean

  /**
   * What to say under the instruction when {@link validate} says no. Nothing
   * here replaces {@link message}: a step that says what to do and a line
   * saying why the last try did not work are two different things, and a user
   * who has just been told they were wrong needs to still be able to read what
   * they were asked for.
   *
   * **Leave it out and the step still refuses out loud.** The cutout shakes
   * whether or not there are words for it, so a guard cannot turn the next
   * control into a button that does nothing.
   *
   * **Unlike {@link target} and {@link message}, this is asked once**, for the
   * attempt that just failed, and the words it gives back are held from there.
   * A function form must be cheap and must not have side effects; it is given
   * the same element {@link validate} was. There is nothing to call to take the
   * words away again. They go when the next attempt succeeds or the step
   * changes, because those are the two moments they stopped being true.
   *
   * ```ts
   * error: 'That does not look like an email address yet.'
   * error: (el) => `${(el as HTMLInputElement).value} is already taken.`
   * ```
   */
  error?: string | ((targetEl: Element) => string)
}

/**
 * One route through the application, start to finish.
 *
 * Register as many as the application has; **only ever one of them runs**. That
 * is not a simplification: the scrim blocks with plain rectangles built from the
 * complement of its own cutouts, so a second story's rectangles would sit over
 * the first story's target. Two visible stories break the first constraint by
 * construction.
 */
export interface LekoStory {
  /**
   * Stable identifier. Leko never reads it, and it is required so that
   * everything else can.
   *
   * It is the name a story goes by outside Leko: in the {@link LekoProblem} a
   * diagnostic hands over, and in whatever {@link LekoOptions.onStep} reports
   * to. A handler that cares about one story in particular can compare the
   * object instead — it is the one that was passed to {@link Leko.start} — and
   * the compiler checks that where it cannot check a string.
   */
  id: string

  steps: LekoStep[]

  /**
   * The story the tour goes on to when this one runs out of steps. A chapter
   * after a chapter, without the application having to notice that the first
   * one ended.
   *
   * **Only a story that ran to the end is followed.** `stop()`, a target that
   * never came back, and a handler that threw all end the tour where it stands.
   * So somebody who left the tour is not carried into the next chapter.
   *
   * **Nothing is stored.** The function form is asked when the last step
   * advances, and answering `undefined` ends the tour. Running the same story
   * again asks again, so there is no slot to clear between runs and no way for
   * one tour's answer to be inherited by the next.
   *
   * A function must be cheap and must not have side effects. Where it is a
   * branch, the thing it reads is the application's own state, the same state
   * a {@link Leko.reached} call is a report about.
   *
   * ```ts
   * next: summary
   * next: () => (order.needsReview ? review : summary)
   * ```
   *
   * {@link onLeave} is told which story this answered with, so a panel two
   * chapters share can stay open across the join.
   */
  next?: LekoStory | (() => LekoStory | undefined)

  /**
   * Build the state this whole story assumes, before its first step is entered.
   *
   * {@link LekoStep.onEnter} is the same job one step down, and the reason for
   * both is the same: a tour usually takes something for granted. What belongs
   * here is what the story takes for granted throughout — a screen to be on, a
   * record to run against, fixtures to stand in for data the user has not got
   * yet.
   *
   * The half that cannot be written anywhere else is {@link onLeave}. It runs
   * when the run ends, and the first step's runs the moment the tour reaches
   * the second, with the rest of the story still to go. This is that hook's
   * partner, so a drawer opened here is closed there rather than in two places
   * a level apart.
   *
   * **Whatever it hands back is dropped**, the same bargain
   * {@link LekoStep.onEnter} strikes. Entry runs outermost first and all of it
   * in one turn: this, then the first step's, then the page is measured. A
   * story whose setup has to finish before anything is measured starts the work
   * here and puts a step that waits at the top of `steps`.
   *
   * **A throw stops the tour** and the reason is thrown again, exactly as a
   * step's does. {@link onLeave} still runs, because a handler that failed
   * halfway may already have set something up.
   */
  onEnter?: (story: LekoStory) => void

  /**
   * Undo what {@link onEnter} set up. Called once for every call to it, at the
   * moment this story stops being the one that is running: past the last step,
   * after `stop()`, and when another story is started.
   *
   * It runs after the current step's {@link LekoStep.onLeave} — cleanup goes
   * innermost first, the mirror of entry — and before the ending is reported
   * through {@link LekoOptions.onStep}.
   *
   * `next` is the story about to start, and `undefined` when the tour is simply
   * over. A shared story that branches and is started again afterwards is the
   * case: teardown worth skipping when the destination needs the same state is
   * teardown this argument can skip.
   *
   * A promise is not waited for. The story is over, and a tour holding still
   * while the state behind it is dismantled shows the user nothing.
   */
  onLeave?: (story: LekoStory, next: LekoStory | undefined) => void
}

/**
 * The three types the machine takes as its one parameter: what an anchor is
 * here, what a step is, and what a story is.
 *
 * Written out rather than imported, for the reason {@link LekoTarget} is. The
 * machine constrains this structurally, so nothing published has to name
 * anything the machine declares.
 */
export interface LekoWorld {
  anchor: Element
  step: LekoStep
  story: LekoStory
}

/**
 * Defaults for every story on the instance. A step may override `padding` and
 * `radius`: the nearer of the two wins.
 *
 * **A story carries no settings.** It used to sit between these two, and the
 * only thing it bought was writing a value once instead of once per step —
 * which a host does for itself, with a `.map()` over `steps`, in code Leko does
 * not have to grow a tier for. What it cost was `story` travelling into the
 * half that draws, which now takes steps and never asks what they belong to.
 * DESIGN.md argues it under **Settings, and where they are read from**.
 */
export interface LekoOptions {
  /** Space between a target's border box and the cutout edge. Defaults to `8`. */
  padding?: number

  /** Corner radius of a cutout, in px. Defaults to `8`. */
  radius?: number

  /**
   * Whether every step brings its target into view before drawing it.
   * Defaults to `false`, and a step may say either way.
   *
   * The whole of what it does is described on {@link LekoStep.scroll}. What
   * belongs here is why it is a setting at all: scroll position is application
   * state, so a tour is not given it. A host that would rather its viewers
   * never hunted for a highlight below the fold turns it on once, here, and a
   * step that lands somewhere a jump would be wrong says `scroll: false`.
   */
  scroll?: boolean

  /**
   * How long a step-to-step morph runs, in ms. Defaults to `320`, and is
   * ignored when the visitor has asked for reduced motion.
   */
  duration?: number

  /**
   * What the halo does while a morph carries its hole somewhere else.
   * Defaults to `'return'`.
   *
   * The frames ride the morph either way, written each animation frame from
   * the same blended numbers as the hole's path; the mode decides the paint.
   * `'return'` is the message's answer: they fade out in flight
   * (`--leko-halo-fade`) and fade back in with the holes they frame.
   * `'follow'` keeps them on the whole way, for a host that styles every hole
   * alike and wants the glow to travel. A host that lights the open hole
   * apart from the shown ones can still follow — `data-open` flips when the
   * flight starts, because that is the hole the frame is already becoming.
   *
   * Paint is all this moves. Whatever it says, the halo catches nothing and
   * the blocking underneath it is untouched.
   */
  halo?: 'return' | 'follow'

  /**
   * The words on the next control. Defaults to `Next`.
   *
   * The control appears on the message of every step that declares no
   * {@link LekoStep.awaits}, and on no other step. A step waiting for a signal
   * is waiting for the user to do something, and a button beside the
   * instruction is a way past it without doing that — the second constraint,
   * defeated by a button. So which steps have one is derived rather than
   * configured, and this option only says what it reads.
   *
   * The control is also the only route {@link LekoStep.validate} guards. A
   * step that declares a signal has no control and no guard, for one reason:
   * the application has already said the thing happened.
   */
  nextLabel?: string

  /**
   * Called when any story moves, including when one ends. **The one place the
   * tour says where it got to.**
   *
   * `step` is where the tour is now, and is `undefined` once there is nowhere
   * to be: past the last step, or after `stop()`. `story` is the one that
   * moved.
   *
   * A story used to carry a hook of its own as well, and both fired. It could
   * say nothing this cannot: it was never told which story it was, so anything
   * spanning two of them had to be written here anyway, and a readout that
   * lived on the story stopped reporting the moment somebody added a story and
   * forgot to register it again. One hook told which story is the same job with
   * no way to half-do it. A handler that only cares about one story asks
   * `story.id`.
   *
   * Anything that draws its own progress needs this. Reading {@link Leko.step}
   * tells a caller where the tour is only if it thinks to look again, and a
   * story advances when the page reports a signal from somewhere else entirely.
   *
   * The return value is never read. Something that could block or redirect a
   * transition would be {@link LekoStep.validate} again, in a place where the
   * application has claimed nothing.
   *
   * A host that wants the pair keeps the last `step` it was handed. That is a
   * line of its own state, and it is right by construction: this hook only ever
   * names a step that was drawn, so a step whose `onEnter` threw on the way in
   * cannot end up in it.
   *
   * {@link Leko.stop} from in here is never turned down. {@link Leko.start}
   * from in here never runs: a report naming a step is a tour that is running
   * (`tour-running`), and every report of an ending happens with the gate
   * still closed (`call-refused`) — {@link LekoStory.next} is the only way one
   * story leads to another. A host that wants a story after `stop()` writes
   * the two calls in a row; `stop()` finishes the whole ending, report
   * included, before it returns.
   */
  onStep?: (step: LekoStep | undefined, story: LekoStory) => void

  /**
   * Called when a call meant to do something and did not. See
   * {@link LekoProblem}.
   *
   * Off by default, like everything else Leko has not been asked for. Nothing
   * is logged: the core has no build-time environment to strip a development
   * branch with, so anything it wrote to the console would be written in
   * production too, and `console.error` is collected by error trackers and
   * fails test suites that treat it as a failure. Which of those a project
   * wants is the project's to choose.
   *
   * ```ts
   * createLeko({
   *   onDiagnostic: (problem) => {
   *     if (import.meta.env.DEV) console.warn('[leko]', problem)
   *   },
   * })
   * ```
   */
  onDiagnostic?: (problem: LekoProblem) => void

  /**
   * The words on the control that ends the tour.
   *
   * **There is always such a control, and there is no way to turn it off.** The
   * scrim blocks the page with rectangles, so a host's own way out is under one
   * unless that host put it above the scrim and off every cutout — and a host
   * cannot do the second part, because the cutouts are Leko's to know. An
   * option to take the control away would be an option to build a page somebody
   * cannot leave, so what a host may change is what it says and what it looks
   * like, never whether it is there.
   *
   * **It is the only control Leko draws outside the message, and it will stay
   * that way.** There is no back control, and a next control belongs to a step
   * and is derived from {@link LekoStep.awaits}. Ending is the one call that is
   * never refused, so it is the one thing worth putting on the page
   * unconditionally.
   *
   * Ending the tour is not a way past the work a step exists to make somebody
   * do, so `awaits` says nothing about this. That rule is about the next
   * control and about nothing else.
   *
   * A word rather than a symbol by default, because an icon with no accessible
   * name is worse than a wide button. Restyle it with the `--leko-close-*`
   * custom properties, the way the message takes `--leko-message-*`, or take
   * the markup over with {@link renderClose}.
   */
  closeLabel?: string

  /**
   * Draw the control that ends the tour yourself.
   *
   * Leko positions `root` in a corner no cutout covers and puts nothing in it.
   * Staying off the holes is the part that needs the geometry, so Leko keeps
   * that, and what the control looks like is yours. Hand back a function to
   * undo whatever you did, and it runs when the tour ends.
   *
   * This is what a host with its own idea of the control uses. There is no
   * option that draws nothing: a corner Leko has chosen and a host has filled
   * is the arrangement where neither half can produce a page with no way out.
   *
   * ```tsx
   * createLeko({
   *   renderClose: (root, stop) => {
   *     const app = createRoot(root)
   *     app.render(<SkipTour onClick={stop} />)
   *     return () => app.unmount()
   *   },
   * })
   * ```
   *
   * `stop` rather than the instance, for the reason the presenter is handed
   * closures rather than the machine: the only thing this control may do is end
   * the tour. Anything here that advanced a step would be a second next
   * control, off to the side of the step that decides whether there is one.
   */
  renderClose?: (root: HTMLElement, stop: () => void) => (() => void) | void
}

/**
 * Something a call meant to do and did not.
 *
 * Every member is a call a working application would not have made, or one it
 * made at a moment nothing could act on. Neither has any other symptom. The
 * tour does not move, and nothing anywhere says why.
 *
 * One thing stays silent on purpose and is not here: a {@link Leko.reached}
 * naming something no step waits for. Instrumentation is meant to stay in the
 * source permanently, and something free to leave in cannot complain about
 * being left in. A caller doing everything right ends up there.
 */
export type LekoProblem =
  /** {@link Leko.start} was given a story with no steps in it, so there is nothing to show. */
  | { kind: 'story-empty'; story: LekoStory }
  /**
   * A signal the step showing was waiting for, reported while that step was
   * still being built. It is dropped rather than saved for later, so the step
   * goes on waiting for something the application has already been through.
   *
   * **The window is one synchronous call wide.** Leko waits for nothing a host
   * hands back, so the only way to land here is to call `reached()` from inside
   * an `onEnter` or an `onLeave`, on the very step that awaits the name. The
   * fix is to make the call after the handler returns.
   */
  | { kind: 'signal-dropped'; name: string; step: LekoStep }
  /**
   * A {@link Leko.start} that arrived while Leko was inside the application,
   * which is a call made from inside an `onEnter`, an `onLeave`, or the
   * {@link LekoOptions.onStep} report of an ending. Nothing of the step being
   * built has been built, so there is nothing there to act on.
   *
   * `start` is the only call that lands here, which is why there is nothing
   * else on this member to read.
   *
   * `stop()` is never here. It is the one call that asks nothing.
   *
   * Neither is the next control. Leko takes it off the screen for the whole of
   * an arrival, and a press is not a call a host made, so there is nobody to
   * tell and nothing for them to do about it.
   */
  | { kind: 'call-refused' }
  /**
   * A {@link Leko.start} made while a tour was running. `running` is the story
   * that was showing, and it is still showing: nothing was torn down and no
   * step moved.
   *
   * **`start` never ends a tour.** `stop()` is the way out and it is the only
   * one, which is what lets this call be read as one that either puts a story
   * up or does nothing at all. The fix is `stop()` and then `start` again.
   *
   * Told apart from {@link LekoProblem} `call-refused` because that one is the
   * gate, and a call the gate turned down is worth making again a moment later.
   * This one will be turned down every time until the tour ends.
   *
   * A component that rebuilds its story on every render and starts it on every
   * render lands here, which is the shape this member is most likely to be
   * reporting.
   */
  | { kind: 'tour-running'; story: LekoStory; running: LekoStory }
  /**
   * A step's target was not on the page and did not come back within 100ms, so
   * the run stopped.
   *
   * A loss is given that long because a framework replacing a node with an
   * identical one disconnects the old one, and the tour should not end because
   * an application rendered normally. The target is asked again throughout, so
   * whether the step recovers is whether the answer changes: a selector finds
   * the new node, and so does a function reading a live reference. A function
   * handing back one variable captured when the story was written cannot.
   */
  | { kind: 'target-lost'; step: LekoStep; story: LekoStory }

/**
 * Whether a story is running.
 *
 * `idle` — none is. `reached()` is a no-op, and so is `stop()`.
 * `running` — one is, from the moment `start()` accepts it until the ending is
 * reported. It says nothing about what the screen is doing: a step still
 * animating in, a target being looked for again, and a step waiting for its
 * signal are all `running`, because in every one of them a story is on.
 *
 * {@link LekoOptions.onStep} reports the same fact, with the step that changed.
 * `onStep: (step) => setTourRunning(step !== undefined)` is the whole of what a
 * host needs to stand back while a tour is up.
 */
export type LekoState = 'idle' | 'running'
