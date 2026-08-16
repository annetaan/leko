/**
 * Anything a step can point at. A CSS selector is resolved when the step starts,
 * taking the **first** match — a selector is never read as "every element that
 * matches". Pass an array when you mean several.
 */
export type LekoTarget = string | HTMLElement

/**
 * Utilities handed to {@link LekoStep.onValidationError} so a step can react to
 * a failed attempt without reaching into Leko's internals.
 */
export interface ErrorUtils {
  /** Play the built-in shake animation on the cutout. */
  shake(): void
  /** Replace the message shown for the current step. */
  setMessage(message: string): void
}

export interface LekoStep {
  /** Stable identifier. Used for analytics and for resuming a tour. */
  id: string

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
   * A step that declares nothing here is never advanced by a signal.
   */
  awaits?: string

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
   * Called when a step's target cannot be resolved. Without a handler the tour
   * stops: pointing a spotlight at nothing is worse than not running at all.
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
 * `transitioning` — morphing between two steps.
 */
export type LekoState = 'idle' | 'running' | 'transitioning'
