/**
 * Anything a step can point at. A CSS selector is resolved when the step starts,
 * taking the **first** match — a selector is never read as "every element that
 * matches". Pass an array when you mean several.
 */
export type LekoTarget = string | HTMLElement

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

/**
 * Utilities handed to {@link LekoStep.onValidationError} so a step can react to
 * a failed attempt without reaching into Leko's internals.
 */
export interface ErrorUtils {
  /** Play the built-in shake animation on the cutout. */
  shake(): void
  /**
   * Replace the message shown for the current step, instruction and all. Use
   * {@link setError} for a reason the attempt failed: this one throws away what
   * the step was asking for, so a second failed attempt would leave the user
   * with a complaint and nothing to act on.
   */
  setMessage(message: string): void
  /**
   * Say what went wrong, under the step's message rather than instead of it.
   *
   * There is nothing to call to take it away again. It goes when the next
   * attempt succeeds or the step changes, because those are the two moments it
   * has stopped being true. A `clearError()` would only invent a way to leave a
   * stale complaint on screen.
   */
  setError(message: string): void
}

export interface LekoStep {
  /** Stable identifier. Used for analytics and for resuming a tour. */
  id: string

  /**
   * Anything the application wants to hang on this step. Carried, never read.
   *
   * Leko has no opinion about what goes here and never branches on it. That is
   * the point: a tour that wants to group its steps into chapters, name the
   * screen a step belongs to, or mark the ones worth counting, can do all of it
   * without Leko growing a concept for each one. The
   * application reads it back off {@link Leko.step}, or off the step handed to
   * {@link LekoStory.onStep}.
   *
   * A chapter is the case this exists for. Grouping steps, jumping between the
   * groups and recording which are done is a real thing to want and a large
   * thing to build — a group with setup of its own is an object rather than a
   * label, which moves where {@link Leko.index} counts from and needs a rule
   * for resuming into the middle of one. None of that is settled, and a tag
   * here plus a menu the application draws is what covers it in the meantime.
   */
  meta?: Record<string, unknown>

  /**
   * What the user acts on.
   *
   * An array is **unioned into a single cutout**: its bounding box, including
   * whatever happens to sit between the elements, which becomes interactive
   * along with them. Pass elements that are adjacent — two neighbouring columns
   * of a table, a label and its input. Two distant elements produce a hole the
   * size of the page.
   *
   * A target that scrolls is fine: the wheel, clicks, focus and keys all reach
   * it through the cutout.
   */
  target: LekoTarget | LekoTarget[]

  /**
   * Further cutouts, shown because they explain the target: a summary figure and
   * the row it was computed from, say. Each stays its own hole rather than
   * joining the target's bounding box, because the union of two distant regions
   * is meaningless.
   *
   * These are never passed to {@link LekoStep.validate}. They are there to be
   * looked at, not acted on.
   */
  related?: LekoTarget[]

  /** Message shown alongside the cutout. */
  message?: string

  /** Space between the target's border box and the cutout edge, in px. */
  padding?: number

  /** Corner radius of the cutout, in px. */
  radius?: number

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
   * **A promise is waited for, and the target is resolved only once it
   * settles.** Resolving first reads a target that does not exist yet, or one
   * that is about to move, so this is also where a target is scrolled into
   * view. A handler that returns nothing costs nothing: the step is drawn in
   * the same turn, exactly as a step with no handler at all.
   *
   * **A rejection stops the tour**, and the reason is thrown again rather than
   * swallowed. The state the step assumes was never built, so drawing it would
   * point the user at something that is not ready — the judgement
   * {@link LekoOptions.onTargetLost} makes about a target that is not there.
   * {@link onLeave} still runs, because a handler that failed halfway may
   * already have registered something.
   *
   * There is nowhere to register a handler for that failure, and the place to
   * deal with it is inside this one. Catch what the setup threw, report it
   * wherever the application reports things, and then decide: return normally
   * and the step is drawn, or let the reason go and the tour stops. Leko is
   * given whatever this handler settles on, and it knows nothing about why.
   *
   * This is not an analytics hook. Something that reports "a step started" for
   * a caller's own metrics is {@link LekoStory.onStep}.
   */
  onEnter?: (step: LekoStep) => void | Promise<void>

  /**
   * Undo what {@link onEnter} set up. Called once for every arrival at this
   * step, at the moment it stops being the current one.
   *
   * Setup that adds a listener has to remove it, and this is the matching half.
   * Without one, every `onEnter` that registers something leaks it. It runs
   * even where `onEnter` never settled — a rejection, or a signal that moved
   * the tour on while it was still in flight — because the cleanup is owed
   * either way. A step with no `onEnter` at all is left the same way, for
   * cleanup the application set up somewhere else.
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
   * Called before advancing. Returning `false` blocks the transition and
   * triggers {@link onValidationError}.
   *
   * This is what separates Leko from overlay-based tours: the step advances on
   * your application's real state, not on a DOM event that may or may not mean
   * the user succeeded.
   *
   * Receives the action target — the first element of {@link LekoStep.target},
   * never one of {@link LekoStep.related}.
   */
  validate?: (targetEl: HTMLElement) => boolean

  /** Called when {@link validate} returns `false`. */
  onValidationError?: (targetEl: HTMLElement, utils: ErrorUtils) => void
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
  /** Stable identifier. What `start()` is given. */
  id: string

  steps: LekoStep[]

  /** Default padding for steps of this story that do not set their own. */
  padding?: number

  /** Default corner radius for steps of this story that do not set their own. */
  radius?: number

  /** How long a step-to-step morph runs in this story, in ms. */
  duration?: number

  /**
   * Build the state this whole story assumes, before its first step is entered.
   *
   * {@link LekoStep.onEnter} is the same job one step down, and the reason for
   * both is the same: a tour usually takes something for granted. What belongs
   * here is what the story takes for granted throughout — a screen to be on, a
   * record to run against, fixtures to stand in for data the user has not got
   * yet. Putting it on the first step says it belongs to that step, and it
   * stops being true the moment `start(id, 2)` skips past.
   *
   * **A promise is waited for, and nothing about the first step happens until
   * it settles** — not its own `onEnter`, and not resolving its target. Entry
   * runs outermost first: this, then the step's, then the page is measured.
   *
   * **A rejection stops the tour** and the reason is thrown again, exactly as a
   * step's does. {@link onLeave} still runs, because a handler that failed
   * halfway may already have registered something.
   */
  onEnter?: (story: LekoStory) => void | Promise<void>

  /**
   * Undo what {@link onEnter} set up. Called once for every call to it, at the
   * moment this story stops being the one that is running: past the last step,
   * after `stop()`, and when another story is started.
   *
   * It runs after the current step's {@link LekoStep.onLeave} — cleanup goes
   * innermost first, the mirror of entry — and before the ending is reported
   * through {@link onStep}.
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

  /**
   * Called when this story moves, including when it ends.
   *
   * `step` is where the story is now, and is `undefined` once there is nowhere
   * to be: past the last step, or after `stop()`. `previous` is where it came
   * from, and is `undefined` on the first step of a run. Both being `undefined`
   * never happens, because nothing moved.
   *
   * Which story moved is answered by where the handler is registered, so a
   * readout belonging to one story never has to sort out which one this was.
   * {@link LekoOptions.onStep} hears every story instead, and is told.
   *
   * Anything that draws its own progress needs one of the two. Reading
   * {@link Leko.step} tells a caller where the tour is only if it thinks to
   * look again, and a story advances when the page reports a signal from
   * somewhere else entirely.
   *
   * The return value is never read. Something that could block or redirect a
   * transition would be {@link LekoStep.validate} again, in a place where the
   * application has claimed nothing.
   *
   * `previous` says where the story came from, which is not the same as saying
   * the user saw it. A story that starts on a missing target and stops reports
   * `[undefined, first]`, naming a step that was never drawn. Tracking the last
   * step actually shown would be a field and a rule for something harmless.
   *
   * Starting or stopping a story from inside a handler is allowed. `start()`
   * gives way to whatever a handler started while it was stopping the story
   * before it, so the most recent call wins rather than the outermost.
   */
  onStep?: (step: LekoStep | undefined, previous: LekoStep | undefined) => void
}

/**
 * Defaults for every story on the instance. A story may override `padding`,
 * `radius` and `duration`, and a step may override the first two again: the
 * nearest one that says anything wins.
 */
export interface LekoOptions {
  /** Space between a target's border box and the cutout edge. Defaults to `8`. */
  padding?: number

  /** Corner radius of a cutout, in px. Defaults to `8`. */
  radius?: number

  /**
   * How long a step-to-step morph runs, in ms. Defaults to `320`, and is
   * ignored when the visitor has asked for reduced motion.
   */
  duration?: number

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
   * Both routes go through {@link LekoStep.validate}. Pressing the control
   * claims the moment has come, exactly as a signal does, and the step still
   * decides whether the state is right.
   */
  nextLabel?: string

  /**
   * Called when a step's target cannot be resolved. Without a handler the tour
   * stops: pointing a spotlight at nothing is worse than not running at all.
   *
   * **With a handler, nothing stops.** Registering one is taking the tour over,
   * and Leko goes on holding it exactly where it was. {@link Leko.state} still
   * reads `running`, {@link Leko.step} still names the step whose target has
   * gone, and the scrim keeps whatever shape it last had. The move is reported
   * through {@link LekoStory.onStep} like any other, so a progress readout
   * shows a step that is not on screen.
   *
   * The easy mistake is to log the problem and return, which leaves the user
   * under a dimmed page with a hole over nothing. A handler that has no
   * recovery in mind wants `stop()`, or `start()` at a step that does exist.
   */
  onTargetLost?: (step: LekoStep, storyId: string) => void

  /**
   * Called when any story moves, after that story's own
   * {@link LekoStory.onStep}. Both fire, and neither replaces the other.
   *
   * This one is told which `story`, because it hears all of them. A handler
   * belonging to a single story is not, since where it is registered already
   * says. Register here for something that spans stories, such as one readout
   * for a tour that branches, or a call to whatever counts things.
   */
  onStep?: (step: LekoStep | undefined, previous: LekoStep | undefined, story: LekoStory) => void
}

/**
 * `idle` — no story running. Both `reached()` and `nextStep()` are no-ops.
 * `running` — a step is currently displayed.
 * `transitioning` — between two steps, with nothing settled yet: a
 * {@link LekoStep.onEnter} that has not resolved, or a morph still running.
 */
export type LekoState = 'idle' | 'running' | 'transitioning'
