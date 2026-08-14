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

export interface LekoOptions {
  steps: LekoStep[]

  /** Default padding for steps that do not set their own. Defaults to `8`. */
  padding?: number

  /** Default corner radius for steps that do not set their own. Defaults to `8`. */
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
  onTargetLost?: (step: LekoStep) => void
}

/**
 * `idle` — no tour running. `nextStep()` is a no-op in this state.
 * `running` — a step is currently displayed.
 * `transitioning` — morphing between two steps.
 */
export type LekoState = 'idle' | 'running' | 'transitioning'
