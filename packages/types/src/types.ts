type Selector = string
type TargetFunction = () => Element | null

/**
 * Anything a step can point at. **Both forms are a question, never an answer**
 * — asked again every time anything needs the box, and never held on to, which
 * is also why there is no element form. DESIGN.md argues it under **A target
 * is a question**.
 *
 * A CSS selector is a question Leko runs, taking the first match — the first
 * one that passes {@link LekoTargetedStep.resolve}, where a step asks for a
 * rule, and a selector is never read as "every element that matches". A
 * function is the same question where the host runs it: return the element now, or `null` where
 * there is not one yet. Reach for it when a selector cannot say what you mean —
 * a node inside a shadow root, which `document.querySelector` does not enter; a
 * framework ref; a row your own code picks out of a list.
 *
 * **A function must be cheap and must not have side effects**, and the element
 * it hands back is the answer for that moment only. One that closes over a live
 * reference recovers from a node being replaced; one that hands back a variable
 * captured once does not, and that is the host's answer to give.
 *
 * **An element that is not rendered is not found.** `display: none` on it or on
 * anything it is inside, so a closed tab, a collapsed panel and a row a
 * framework is about to render all come to the same thing. A selector whose
 * first match is one of those matches nothing rather than taking the next one
 * along, unless the step asked for a rule that skips it —
 * {@link LekoTargetedStep.resolve}. Open the panel in the step's `onEnter`,
 * which runs before the target is looked for. `visibility: hidden` and `opacity: 0` are not this: those keep
 * a box, and a hole is cut at it. DESIGN.md argues all of it under **An element
 * with no box is not found**, and `hidden-target.ts` shows it.
 *
 * **This is asked up to the moment the step is drawn, and not after it** — a
 * scroll excepted. DESIGN.md, **The page is measured when a step is drawn, and
 * not again**.
 *
 * An element inside an `<svg>` is a target like any other, `viewBox` scaling
 * and transforms included — DESIGN.md's **Resolution & custom functions**.
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
 * between the elements is inside the hole along with them — so name elements
 * that are next to each other: a label and its input, two neighbouring columns,
 * the first and last row of a table.
 *
 * A bare {@link LekoTarget} anywhere {@link LekoTargetedStep.target} wants a region is
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
   * **Only the step's own region — the first — can declare it.** Every region
   * after that is a {@link LekoShownRegion}, where this flag does not compile.
   * DESIGN.md argues the default and the rule under **A hole, and whether it is
   * open**.
   *
   * **Tab is held to the same answer.** Focus walks a ring of what this step
   * opened and the controls Leko drew, so a hole that is only shown cannot be
   * reached with the keyboard either. A positive `tabindex` in the page, or an
   * `iframe` inside the region, can still put focus somewhere unplanned, and
   * what happens then is that the next key brings it back — DESIGN.md, **The
   * ring focus cannot leave**.
   */
  interactive?: boolean
}

/**
 * A region after the first: shown, and never opened.
 *
 * These are there to be looked at rather than acted on — a summary figure
 * beside the row it was computed from, the columns a total was worked out over.
 * The hole shows them, the blocking rectangle over it keeps them from taking a
 * click, and no flag opens one. DESIGN.md argues the `never` under **A hole,
 * and whether it is open**.
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
 * **The file doing it has to be a module** — one with an `import` or an
 * `export` of its own, and inside the tsconfig's `include`. DESIGN.md says what
 * goes wrong otherwise, silently, under **The augmenting file has to be a
 * module**.
 *
 * The value side is unused; `true` is the shortest thing to write.
 *
 * @see {@link LekoKnownSignal}
 */
export interface LekoSignals {}

/**
 * Augment this and an unknown name in {@link LekoTargetedStep.awaits} stops compiling.
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
 * is run with `--loose`. The two belong together, and turning this on over a
 * vocabulary somebody maintains by hand is a promise about a list rather than
 * about the code — DESIGN.md argues it under **Strict on `awaits`, never on
 * `reached()` — the asymmetry is the design**.
 *
 * `reached()` is never tightened by this. See {@link LekoSignal}.
 */
export interface LekoStrict {}

type Known = keyof LekoSignals
type Strict = [keyof LekoStrict] extends [never] ? false : true

/**
 * A name {@link LekoTargetedStep.awaits} may wait for.
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
 * {@link LekoStrict} deliberately does not reach this far: a `reached()` call is
 * instrumentation that has to stay compilable in builds where no tour ever
 * runs. DESIGN.md argues the asymmetry under **Strict on `awaits`, never on
 * `reached()` — the asymmetry is the design**.
 */
export type LekoSignal = [Known] extends [never] ? string : Known | (string & {})

/** What every step has, whichever member of {@link LekoStep} it is. */
interface LekoStepBase {
  /**
   * Stable identifier. Leko never reads it, and it is required so that
   * everything else can.
   *
   * It is the name a step goes by outside Leko: in the {@link LekoProblem} a
   * diagnostic hands over, in whatever counts things from
   * {@link LekoOptions.onStep}, and as the key for anything an application
   * wants to hang on a step. Grouping steps into chapters is that last one, and
   * DESIGN.md argues why there is nowhere here to put one under **There are no
   * chapters**; `story-setup.ts` does it with a table from id to chapter.
   */
  id: string

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
   * Say `true` and every scrollport carrying the target centres the step's
   * first cutout in itself — the hole around every element that region names,
   * not its first element — before anything is measured. A cutout more than
   * half the port tall leads with its top edge instead. One already inside is
   * left alone, and one near the end of the content lands as near as the
   * content allows. Later regions stay where they are.
   *
   * `true` is `'direct'` and is what `true` has always meant: the page is
   * glided rather than jumped, the step is drawn once it has stopped, and a
   * nested panel is set outright before the page moves — one movement, whatever
   * the target is nested in.
   *
   * `'staged'` makes the moves one port at a time instead, outermost first: the
   * page glides until the panel is on screen, the panel then glides to bring
   * its own child in, and the step is drawn when the last one lands. A beat
   * between two of them says that the thing which moves next has changed. It is
   * for a target several scrollers deep, where what a viewer will have to do
   * alone is two moves rather than one, and DESIGN.md argues it under
   * **`scroll: 'staged'` moves one port at a time, outermost first**.
   *
   * Whichever is asked for, the glide grows with the distance by its cube root
   * and runs for at least {@link LekoOptions.duration}, and a viewer who
   * scrolls takes it over. `duration: 0` and reduced motion set every port
   * outright instead, with no beat and nothing to wait for.
   * `scroll-margin` on the target is honoured, and how far is DESIGN.md's
   * **`scroll-margin` on the target wins over the step's `padding`**.
   *
   * Nothing happens on a step with no `target`, nor for a `position: fixed`
   * one, and a redraw never scrolls again.
   *
   * DESIGN.md argues all of it under **Bringing a target into view**;
   * `scrolls-into-view.ts` is the case, and `staged-scroll.ts` is the pair of
   * stories the two modes are watched side by side in.
   */
  scroll?: boolean | 'direct' | 'staged'

  /**
   * The name of the thing this step is waiting for the application to report.
   *
   * `reached(name)` advances the step only if the step declares that same name,
   * and does nothing at all otherwise. So a call site names what happened in
   * the application and never which step should move — insert or reorder steps
   * and the call still fires at the moment it always meant. DESIGN.md argues it
   * under **Signals and steps**.
   *
   * A step that declares nothing here is never advanced by a signal, and gets
   * the next control on its message instead — see {@link LekoOptions.nextLabel}.
   * That is the only thing deciding whether the control appears, and DESIGN.md's
   * **The next control** says why it is not configurable.
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
   * **Whatever it hands back is dropped.** An `async` handler runs its first
   * line here and the rest of it once the step is up. Work that has to finish
   * first goes on a step of its own: no {@link target}, the work started here,
   * and {@link awaits} declared. DESIGN.md argues both under **A step that
   * waits**, and what an application owes a wait that can fail under
   * DESIGN.md's **Nothing bounds the wait**.
   *
   * **A throw stops the tour**, and the reason is thrown again rather than
   * swallowed — DESIGN.md, **A throw stops the tour, and the reason is thrown
   * again**. {@link onLeave} still runs, because a handler that failed halfway
   * may already have registered something. There is nowhere to register a
   * handler for that failure, and the place to deal with it is inside this one.
   *
   * This is not an analytics hook. Something that reports "a step started" for
   * a caller's own metrics is {@link LekoOptions.onStep}.
   */
  onEnter?: (step: LekoStep) => void

  /**
   * Undo what {@link onEnter} set up. Called once for every arrival at this
   * step, at the moment it stops being the current one — also where `onEnter`
   * threw halfway, and on a step that has no `onEnter` at all. DESIGN.md,
   * **Every `onEnter` gets its `onLeave`**.
   *
   * `next` is where the tour is going, and is `undefined` when it is ending:
   * past the last step, after `stop()`, and when another story is started,
   * since the step the tour lands on then belongs to a story this one knows
   * nothing about. Cleanup often depends on the destination — a panel that two
   * steps use in turn is worth leaving open — which is why it is given one.
   *
   * A promise is not waited for here; the step is over. DESIGN.md, **Whatever a
   * handler hands back is dropped**.
   */
  onLeave?: (step: LekoStep, next: LekoStep | undefined) => void
}

/**
 * A step that points at something. The only kind that may declare
 * {@link validate} and {@link error}: both are questions about the element
 * {@link target} names — DESIGN.md, **A failed attempt**.
 */
export interface LekoTargetedStep extends LekoStepBase {
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
   * **The first region is the one the step is about**, and it is the only
   * position that may declare `interactive`. Its first element is what
   * {@link validate} is handed, what the message anchors beside, and the one
   * Leko looks for: a step whose first region is not on the page is not drawn,
   * and Leko waits a moment for it. A later region that resolves to nothing is a
   * hole this step does not cut, and nothing else happens. DESIGN.md argues the
   * shape of the list under **A target is a question**.
   *
   * A target that scrolls is fine in a region that was opened: the wheel,
   * clicks, focus and keys all reach it through the cutout. See
   * {@link LekoRegion.interactive} for what opening means, and it is not the
   * default.
   *
   * A step with nothing to point at is a {@link LekoUntargetedStep}, and this
   * is left off there.
   */
  target: LekoTarget | LekoRegion | [LekoTarget | LekoRegion, ...(LekoTarget | LekoShownRegion)[]]

  /**
   * Which element this step means where a target matches several. Overrides
   * {@link LekoOptions.resolve}, and is `'first'` unless one of the two asks.
   *
   * - `'first'` takes the first match, and is the default. What a selector has
   *   always meant.
   * - `'visible-first'` takes the first match the viewer could see: one hidden
   *   by `visibility`, by `opacity: 0`, or by anything with no box at all is
   *   passed over for the next one along.
   * - `'in-viewport-first'` asks that as well, and then that some of the match
   *   is inside the viewport.
   *
   * It is the step's answer for everything the step names: every element of
   * every region, and a function target too — the answer a function hands back
   * is put to the same rule, so one match or several, a selector or a function,
   * all mean the same thing. It says nothing about
   * {@link LekoOptions.hostChrome}, which is not a step's target.
   *
   * **The rule is applied after `onEnter` returns**, so a step may reveal the
   * copy it wants first. That is also why `'in-viewport-first'` is not the
   * default: a page the application has not scrolled yet has every right to
   * have the match below the fold.
   *
   * **`'in-viewport-first'` and {@link LekoTargetedStep.scroll} do not
   * combine.** The rule is
   * asked before the glide, so a match that is off screen is not found, and
   * there is nothing left for the scroll to bring in: the step waits and the
   * tour ends with `target-lost`. Ask for one or the other.
   *
   * Nothing that passes is nothing found, and that is the ordinary missing
   * target: the step waits its moment, resolving again, and ends the tour if
   * nothing turns up. DESIGN.md argues the modes, and the limit around a match
   * scrolled out of a nested panel, under **Which of several matches a selector
   * means**; `which-match.ts` shows all three.
   */
  resolve?: 'first' | 'visible-first' | 'in-viewport-first'

  /**
   * Called before advancing on the next control. Returning `false` blocks the
   * transition, shakes the cutout, and shows {@link error} where there is one.
   *
   * **Ignored on a step that declares {@link awaits}.** Such a step has no
   * control, and it advances because the application said the thing happened.
   *
   * Receives the first element of the first region of {@link target}, which is
   * the one element the step is about. No later region reaches this, and a step
   * with no `target` has nothing to hand it, so this does not compile there —
   * DESIGN.md, **A failed attempt**.
   *
   * DESIGN.md argues what the guard is for under **A failed attempt**, and
   * `next-control.ts` shows it.
   */
  validate?: (targetEl: Element) => boolean

  /**
   * What to say under the instruction when {@link validate} says no. Nothing
   * here replaces {@link message}: a user who has just been told they were
   * wrong needs to still be able to read what they were asked for.
   *
   * **Leave it out and the step still refuses out loud.** The cutout shakes
   * whether or not there are words for it, so a guard cannot turn the next
   * control into a button that does nothing.
   *
   * **Unlike {@link target} and {@link message}, this is asked once**, for the
   * attempt that just failed, and the words it gives back are held from there.
   * A function form must be cheap and must not have side effects; it is given
   * the same element {@link validate} was, which is why this too does not
   * compile on a step with no {@link target}. There is nothing to call to take
   * the words away again: they go when the next attempt succeeds or the step
   * changes. DESIGN.md argues the lifecycle under **A failed attempt**.
   *
   * ```ts
   * error: 'That does not look like an email address yet.'
   * error: (el) => `${(el as HTMLInputElement).value} is already taken.`
   * ```
   */
  error?: string | ((targetEl: Element) => string)
}

/**
 * A step that points at nothing. The page is covered with no hole in it and the
 * message docks at the foot of the viewport. That is the step to write for a
 * wait: give it {@link awaits}, start the work in {@link onEnter}, and the tour
 * stands there with the page held until the application reports the name.
 * DESIGN.md argues it under **A step that waits**.
 *
 * ```ts
 * {
 *   id: 'load-draft',
 *   message: 'Loading the draft order…',
 *   onEnter: () => void loadDraft(),
 *   awaits: 'draft-loaded',
 * }
 * ```
 *
 * There is no element here for a guard to ask about, so `validate` and `error`
 * are `never`, and stay refused when the step arrives through a variable rather
 * than as a literal — the same mechanism as {@link LekoShownRegion.interactive}.
 */
export interface LekoUntargetedStep extends LekoStepBase {
  /** Nothing to point at. What a `target` is, is {@link LekoTargetedStep.target}. */
  target?: never
  /**
   * Which of several matches is a question about a target, and there is none.
   * See {@link LekoTargetedStep.resolve}.
   */
  resolve?: never
  /** A guard needs a target. See {@link LekoTargetedStep.validate}. */
  validate?: never
  /** The words for a failed guard, and there is no guard. See {@link LekoTargetedStep.error}. */
  error?: never
}

/**
 * One step of a story: a {@link LekoTargetedStep} when it names a `target`, a
 * {@link LekoUntargetedStep} when it does not. `step.target !== undefined`
 * narrows to the first.
 */
export type LekoStep = LekoTargetedStep | LekoUntargetedStep

/**
 * One route through the application, start to finish.
 *
 * Register as many as the application has; **only ever one of them runs**. That
 * is not a simplification but a consequence of how the page is blocked, and
 * DESIGN.md argues it under **Do not go back to blocking with the scrim
 * itself**.
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
   * **Only a story that ran to the end is followed.**
   *
   * **Nothing is stored.** The function form is asked when the last step
   * advances, and answering `undefined` ends the tour. Running the same story
   * again asks again. DESIGN.md argues both under **Starting a story**.
   *
   * A function must be cheap and must not have side effects. Where it is a
   * branch, the thing it reads is the application's own state, the same state
   * a {@link Leko.reached} call is a report about — `branching.ts` shows it.
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
   * {@link LekoTargetedStep.onEnter} is the same job one step down. What belongs here
   * is what the story takes for granted throughout — a screen to be on, a
   * record to run against, fixtures to stand in for data the user has not got
   * yet — and what makes it worth having is {@link onLeave}, which runs when
   * the run ends rather than the moment the tour reaches step two. DESIGN.md,
   * **The story's `onLeave` runs when the run ends, after the last step's**.
   *
   * **Whatever it hands back is dropped**, the same bargain
   * {@link LekoTargetedStep.onEnter} strikes. Entry runs outermost first and all of it
   * in one turn: this, then the first step's, then the page is measured. A
   * story whose setup has to finish before anything is measured starts the work
   * here and puts a step that waits at the top of `steps`.
   *
   * **A throw stops the tour** and the reason is thrown again, exactly as a
   * step's does. {@link onLeave} still runs. `story-setup.ts` shows the pair.
   */
  onEnter?: (story: LekoStory) => void

  /**
   * Undo what {@link onEnter} set up. Called once for every call to it, at the
   * moment this story stops being the one that is running: past the last step,
   * after `stop()`, and when another story is started.
   *
   * It runs after the current step's {@link LekoTargetedStep.onLeave} — cleanup goes
   * innermost first, the mirror of entry — and before the ending is reported
   * through {@link LekoOptions.onStep}. DESIGN.md, **Entry runs outermost
   * first, and the ending mirrors it, innermost first**.
   *
   * `next` is the story about to start, and `undefined` when the tour is simply
   * over. A shared story that branches and is started again afterwards is the
   * case: teardown worth skipping when the destination needs the same state is
   * teardown this argument can skip.
   *
   * A promise is not waited for. The story is over.
   */
  onLeave?: (story: LekoStory, next: LekoStory | undefined) => void
}

/**
 * The three types the machine takes as its one parameter: what an anchor is
 * here, what a step is, and what a story is.
 *
 * Written out here rather than imported from the machine: its `lib` is
 * `ES2023` alone, so it cannot name `Element` and cannot import this, and the
 * copy has to go this way round. DESIGN.md argues it under **The packages,
 * and the seam between them**.
 */
export interface LekoWorld {
  anchor: Element
  step: LekoStep
  story: LekoStory
}

/**
 * Defaults for every story on the instance. A step may override `padding`,
 * `radius`, `scroll` and `resolve`: the nearer of the two wins.
 *
 * **A story carries no settings** — DESIGN.md argues it under **Settings, and
 * where they are read from**.
 */
export interface LekoOptions {
  /** Space between a target's border box and the cutout edge. Defaults to `8`. */
  padding?: number

  /** Corner radius of a cutout, in px. Defaults to `8`. */
  radius?: number

  /**
   * Whether every step brings its target into view before drawing it, and how.
   * Defaults to `false`, and a step may say either way — the mode included.
   *
   * The whole of what it does is described on {@link LekoTargetedStep.scroll}. A host
   * that would rather its viewers never hunted for a highlight below the fold
   * turns it on once, here, and a step that lands somewhere a jump would be
   * wrong says `scroll: false`. Why it is off at all is DESIGN.md's **Bringing
   * a target into view**.
   */
  scroll?: boolean | 'direct' | 'staged'

  /**
   * Which element every step means where a target matches several. Defaults to
   * `'first'`, and a step may say either way.
   *
   * The whole of what it does is described on
   * {@link LekoTargetedStep.resolve}. A host whose screens carry a hidden copy
   * of the markup — a collapsed panel, a mobile layout beside a desktop one —
   * asks for `'visible-first'` once, here. Why the default stays `'first'` is
   * DESIGN.md's **Which of several matches a selector means**: changing it
   * would quietly move what existing tours point at.
   */
  resolve?: 'first' | 'visible-first' | 'in-viewport-first'

  /**
   * How long a step-to-step morph runs, in ms. Defaults to `320`, and is
   * ignored when the visitor has asked for reduced motion.
   *
   * Also the least a glide runs for, on a step that scrolls — the least each
   * stage of one runs for, where the step asked for stages. A glide grows with
   * how far the page has to go — {@link LekoTargetedStep.scroll} says why — and
   * this is the floor under a short one. `0` turns both off together.
   */
  duration?: number

  /**
   * The curve a morph and a glide follow, from a fraction of the time to a
   * fraction of the way. Defaults to Material 3's standard easing,
   * `cubic-bezier(0.2, 0, 0, 1)`, which `cubicBezier` here will build for you.
   *
   * A house rule, so there is no per-step version of it, for the reason
   * {@link LekoOptions.duration} has none — DESIGN.md, **Settings, and where
   * they are read from**. The shake a refused step gives keeps Leko's own
   * curve either way: it is a gesture of refusal rather than an arrival.
   *
   * `f(1)` need not be exactly `1` — the last frame writes the destination
   * itself — and a morph that overshoots and comes back does no harm. **A
   * glide wants a curve that stays inside `[0, 1]`, though.** A scroll past
   * either end is clamped by the port, and the next frame reads that back as
   * somebody else having taken the page over, so the glide stops there.
   */
  easing?: (t: number) => number

  /**
   * What the halo does while a morph carries its hole somewhere else.
   * Defaults to `'return'`.
   *
   * `'return'` fades the frames out in flight (`--leko-halo-fade`) and back in
   * with the holes they frame. `'follow'` keeps them on for the whole trip, and
   * `data-open` flips as it starts.
   *
   * Paint is all this moves. Whatever it says, the halo catches nothing and the
   * blocking underneath it is untouched. DESIGN.md argues the modes under **The
   * halo**.
   */
  halo?: 'return' | 'follow'

  /**
   * The words on the next control. Defaults to `Next`.
   *
   * The control appears on the message of every step that declares no
   * {@link LekoTargetedStep.awaits}, and on no other step. It is also the only route
   * {@link LekoTargetedStep.validate} guards. Which steps have one is derived rather
   * than configured, and this option only says what it reads — DESIGN.md argues
   * that under **The next control**.
   */
  nextLabel?: string

  /**
   * Called when any story moves, including when one ends. **The one place the
   * tour says where it got to.**
   *
   * `step` is where the tour is now, and is `undefined` once there is nowhere
   * to be: past the last step, or after `stop()`. `story` is the one that
   * moved. A handler that only cares about one story asks `story.id`.
   *
   * Anything that draws its own progress needs this. Reading {@link Leko.step}
   * tells a caller where the tour is only if it thinks to look again, and a
   * story advances when the page reports a signal from somewhere else entirely.
   *
   * The return value is never read, and there is no hook of this kind on a
   * story — DESIGN.md argues both under **Saying where the tour got to**.
   *
   * A host that wants the pair keeps the last `step` it was handed. That is a
   * line of its own state, and it is right by construction: this hook only ever
   * names a step that was drawn, so a step whose `onEnter` threw on the way in
   * cannot end up in it.
   *
   * {@link Leko.stop} from in here is never turned down; {@link Leko.start}
   * from in here never runs. DESIGN.md, **One gate, and what it refuses**.
   */
  onStep?: (step: LekoStep | undefined, story: LekoStory) => void

  /**
   * Called when a call meant to do something and did not. See
   * {@link LekoProblem}.
   *
   * Off by default, like everything else Leko has not been asked for. **Nothing
   * is logged**, and which of the ways to report a problem a project wants is
   * the project's to choose — DESIGN.md argues it under **Saying that a call
   * did nothing**.
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
   * Where the host's own chrome is, so that nothing Leko draws lands on top of
   * it: a sticky footer, a top bar, a support widget in a corner.
   *
   * One target or several, named the way a step names one — a selector, or a
   * function that hands back the element. Read every time a step is drawn,
   * because a target is a question and this is no different; a bar that is not
   * on the page at that moment claims nothing.
   *
   * On the instance alone, and there is no per-step version: a host's chrome is
   * the same for every step of every story. DESIGN.md, **Settings, and where
   * they are read from**.
   *
   * ```ts
   * createLeko({ hostChrome: ['.app-footer', '#support-bubble'] })
   * ```
   *
   * It moves three things: which side of a cutout the message takes, where the
   * message sits when it has no cutout to sit beside, and which corner the
   * control that ends the tour goes in.
   *
   * **Name chrome that sits against an edge of the screen.** For the two
   * readers that want an inset, each box is read as a band along the edge it is
   * nearest, so a footer, a bar or a corner widget reserves a little more than
   * itself. Something floating clear of every edge is not a band and reserves
   * nothing, and a message can still land on it — DESIGN.md argues why that is
   * the better of the two ways to be wrong, under **A host's own chrome is
   * named once, and every reader takes the boxes**. The control that ends the
   * tour takes the boxes themselves and dodges any of them.
   *
   * **It does not make the chrome usable.** The scrim blocks whatever the step
   * did not open, and naming an element here says only where Leko's own boxes
   * may not go.
   */
  hostChrome?: LekoTarget | LekoTarget[]

  /**
   * The words on the control that ends the tour.
   *
   * **There is always such a control, and there is no way to turn it off**, so
   * what a host may change is what it says and what it looks like, never
   * whether it is there. It is also the only control Leko draws outside the
   * message, and ending the tour is not a way past the work a step exists to
   * make somebody do, so {@link LekoTargetedStep.awaits} says nothing about this.
   * DESIGN.md argues both under **The way out**.
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
   * There is no option that draws nothing: a corner Leko has chosen and a host
   * has filled is the arrangement where neither half can produce a page with no
   * way out — DESIGN.md, **The way out**.
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
   * `stop` rather than the instance: the only thing this control may do is end
   * the tour. Anything here that advanced a step would be a second next
   * control, off to the side of the step that decides whether there is one.
   */
  renderClose?: (root: HTMLElement, stop: () => void) => (() => void) | void
}

/**
 * Something a call meant to do and did not.
 *
 * Every member is a call a working application would not have made, or one it
 * made at a moment nothing could act on. One thing stays silent on purpose and
 * is not here: a {@link Leko.reached} naming something no step waits for.
 * DESIGN.md draws the line under **Saying that a call did nothing**.
 */
export type LekoProblem =
  /** {@link Leko.start} was given a story with no steps in it, so there is nothing to show. */
  | { kind: 'story-empty'; story: LekoStory }
  /**
   * A signal the step showing was waiting for, reported while that step was
   * still being built. It is dropped rather than saved for later, so the step
   * goes on waiting for something the application has already been through.
   *
   * **The window is one synchronous call wide**, so the only way to land here
   * is to call `reached()` from inside an `onEnter` or an `onLeave`, on the very
   * step that awaits the name. The fix is to make the call after the handler
   * returns. DESIGN.md, **One gate, and what it refuses**.
   */
  | { kind: 'signal-dropped'; name: string; step: LekoStep }
  /**
   * A {@link Leko.start} that arrived while Leko was inside the application,
   * which is a call made from inside an `onEnter`, an `onLeave`, or the
   * {@link LekoOptions.onStep} report of an ending. Nothing of the step being
   * built has been built, so there is nothing there to act on. DESIGN.md,
   * **One gate, and what it refuses**.
   *
   * `start` is the only call that lands here, which is why there is nothing
   * else on this member to read. `stop()` is never here, and neither is the
   * next control: a press is not a call a host made, so there is nobody to
   * tell.
   */
  | { kind: 'call-refused' }
  /**
   * A {@link Leko.start} made while a tour was running. `running` is the story
   * that was showing, and it is still showing: nothing was torn down and no
   * step moved. The fix is `stop()` and then `start` again — DESIGN.md,
   * **Starting a story**.
   *
   * Told apart from {@link LekoProblem} `call-refused` for the reason DESIGN.md
   * gives under **Saying that a call did nothing**.
   *
   * A component that rebuilds its story on every render and starts it on every
   * render lands here, which is the shape this member is most likely to be
   * reporting.
   */
  | { kind: 'tour-running'; story: LekoStory; running: LekoStory }
  /**
   * A step's target was not on the page when it was wanted, so the run stopped.
   *
   * Two roads reach here, and DESIGN.md has both under **Target loss &
   * recovery**: an arrival whose grace period ran out, and a press on a step
   * that declares {@link LekoTargetedStep.validate}, which resolves the target afresh
   * to hand the guard its element and gets no grace at all.
   */
  | { kind: 'target-lost'; step: LekoStep; story: LekoStory }

/**
 * Whether a story is running.
 *
 * `idle` — none is. `reached()` is a no-op, and so is `stop()`.
 * `running` — one is, from the moment `start()` accepts it until the ending is
 * reported. It says nothing about what the screen is doing — DESIGN.md, **It
 * says nothing about what the screen is doing**.
 *
 * {@link LekoOptions.onStep} reports the same fact, with the step that changed.
 * `onStep: (step) => setTourRunning(step !== undefined)` is the whole of what a
 * host needs to stand back while a tour is up.
 */
export type LekoState = 'idle' | 'running'
