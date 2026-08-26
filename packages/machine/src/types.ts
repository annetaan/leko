/**
 * What the machine needs of the world, and what it may ask of whatever draws
 * the tour. DESIGN.md argues the seam under **Three packages, and the seam
 * between them**.
 *
 * `@annetaan/leko` declares the shapes its own users need again rather than
 * importing them, so the published `.d.ts` stands on its own while this package
 * is unpublished.
 */

// ---------------------------------------------------------- what a host brings

/**
 * The three types a host brings, as one parameter. Everything else takes
 * `W extends World` and reaches through it.
 */
export interface World {
  anchor: unknown
  step: StepBase<World>
  story: StoryBase<World>
}

/**
 * What the machine needs a step to be. A host adds whatever its presenter draws
 * from and is handed back its own object, never this narrower view of it.
 *
 * The handlers are methods rather than properties, which is what makes a host's
 * narrower step assignable to this one.
 */
export interface StepBase<W extends World> {
  id: string
  /** Read every time the machine draws and never written, so an edit is seen. */
  readonly message?: string
  /** The signal this step waits for, or nothing where it advances on a control. */
  awaits?: string
  onEnter?(step: W['step']): void | Promise<void>
  onLeave?(step: W['step'], next: W['step'] | undefined): void
  /** The guard on advancing. **Ignored on a step that declares `awaits`.** */
  validate?(anchor: W['anchor']): boolean
  onValidationError?(anchor: W['anchor'], utils: ErrorUtils): void
}

/** What the machine needs a story to be. */
export interface StoryBase<W extends World> {
  id: string
  steps: W['step'][]
  onEnter?(story: W['story']): void | Promise<void>
  onLeave?(story: W['story'], next: W['story'] | undefined): void
}

/** What a failed attempt can do about itself. */
export interface ErrorUtils {
  shake(): void
  setError(message: string): void
}

export type MachineState = 'idle' | 'running' | 'transitioning'

/**
 * Something a call meant to do and did not, with no other symptom. A `reached()`
 * naming something no step waits for is deliberately not here. DESIGN.md argues
 * the line under **Saying that a call did nothing**.
 */
export type Problem<W extends World> =
  | { kind: 'story-empty'; story: W['story'] }
  | { kind: 'signal-dropped'; name: string; step: W['step'] }
  | { kind: 'call-refused' }
  | { kind: 'target-lost'; step: W['step']; story: W['story'] }

export interface MachineOptions<W extends World> {
  /** The words on a next control, where a step gets one. */
  nextLabel?: string
  onStep?(step: W['step'] | undefined, previous: W['step'] | undefined, story: W['story']): void
  onDiagnostic?(problem: Problem<W>): void
}

// --------------------------------------------------------- what draws the tour

/** Everything the box beside the cutout can be asked to show at once. */
export interface Content {
  text: string | undefined
  error: string | undefined
  /** The words on the next control. Decided by the machine and never here. */
  next: string | undefined
}

/**
 * What the machine is allowed to ask of whatever draws the tour.
 *
 * **Nothing here schedules itself.** A presenter that notices something says so
 * through {@link Host} and waits to be called back, because whether the tour may
 * be measured at all is a fact about the machine's state.
 */
export interface Presenter<W extends World> {
  /** The step's anchor, or `null` when it is not on the page. */
  resolve(step: W['step']): W['anchor'] | null
  /**
   * Draw the step, and hand back something that settles once it has arrived.
   * Nothing back means it is there already and the step settles in this turn.
   *
   * A `null` anchor is handed over all the same. What a missing target means is
   * a drawing question, so a presenter may give it time and report
   * {@link Host.lost} once it has given up. One interrupted part way through may
   * settle late or never, and the machine lets go of this the moment another
   * arrival begins.
   */
  show(
    story: W['story'],
    step: W['step'],
    anchor: W['anchor'] | null,
    content: Content,
    animate: boolean,
  ): Promise<void> | void
  /**
   * An arrival began and nothing about the step it heads for has been built,
   * looked for or drawn. `step` is `undefined` while a story's own `onEnter`
   * runs. Released by the next {@link show} or {@link teardown}, because there
   * is no other route out.
   */
  hold(story: W['story'], step: W['step'] | undefined): void
  /** Put it where it belongs now, without animating: the surface moved, not the tour. */
  place(story: W['story'], step: W['step'], anchor: W['anchor'] | null, content: Content): void
  /** The words changed and nothing moved. */
  retell(story: W['story'], step: W['step'], anchor: W['anchor'], content: Content): void
  /** Say no, on a step that would not let the tour past. */
  reject(): void
  /** Everything this presenter put on the page goes. */
  teardown(): void
}

/**
 * What a presenter is allowed to tell the machine. Five things it noticed, and
 * nothing to ask.
 *
 * The machine hands one of these to the factory that builds the presenter
 * rather than handing itself, because every member here would otherwise be part
 * of the machine's own public API and {@link next} is one that must not be.
 */
export interface Host<W extends World> {
  /** The anchor of `step` left the page. Named, because the tour may have moved on. */
  lost(step: W['step']): void
  /** The surface moved under the tour, and nothing about the tour changed. */
  moved(): void
  /** The next control was used. The only way anything advances without a signal. */
  next(): void
  /** The control that ends the tour was used. Means what `stop` means. */
  close(): void
  /**
   * `step`'s anchor is not on the page and the presenter has not given up yet.
   * `yes` is `false` once it is back. A report, not a request: what `state` says
   * meanwhile is the machine's to decide. The give-up is {@link lost}.
   */
  searching(step: W['step'], yes: boolean): void
}
