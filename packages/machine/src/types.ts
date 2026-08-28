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
  /**
   * Build what this step assumes, and hand nothing back. **Leko does not wait
   * for this.** A wait belongs to a step of its own, which declares `awaits`
   * and stands on an accepting machine while the answer comes. DESIGN.md argues
   * it under **A step that waits**.
   */
  onEnter?(step: W['step']): void
  onLeave?(step: W['step'], next: W['step'] | undefined): void
  /** The guard on advancing. **Ignored on a step that declares `awaits`.** */
  validate?(anchor: W['anchor']): boolean
  /**
   * What to say under the instruction when `validate` says no. Asked once, for
   * the attempt that failed, and the words it gives back are held until that
   * attempt stops being the last one.
   *
   * The function form takes `never` for the same reason the handlers above are
   * methods: a host's own narrower step has to stay assignable to this one, and
   * a function inside a union is checked strictly where a method is not. The
   * host's own type names the argument; `machine.ts` is where it is named again.
   */
  error?: string | ((anchor: never) => string)
}

/** What the machine needs a story to be. */
export interface StoryBase<W extends World> {
  id: string
  steps: W['step'][]
  /**
   * What the tour goes on to once this story runs out of steps. Asked when the
   * last step advances and never stored, so nothing has to be cleared between
   * runs of the same story.
   *
   * **Only a story that ran to the end is followed.** A `stop()`, a lost target
   * and a handler that threw all end the tour where it stands.
   *
   * The function form takes nothing. Everything it could be handed is already in
   * the closure that wrote it, and a parameterless function has no argument
   * position to go wrong, so this needs none of what `StepBase.error` needs.
   */
  next?: W['story'] | (() => W['story'] | undefined)
  /** Built and handed back, the same bargain {@link StepBase.onEnter} strikes. */
  onEnter?(story: W['story']): void
  onLeave?(story: W['story'], next: W['story'] | undefined): void
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
  /** A `start` made while a tour was running. `running` is the one it left alone. */
  | { kind: 'tour-running'; story: W['story']; running: W['story'] }
  | { kind: 'target-lost'; step: W['step']; story: W['story'] }

export interface MachineOptions<W extends World> {
  /** The words on a next control, where a step gets one. */
  nextLabel?: string
  onStep?(step: W['step'] | undefined, story: W['story']): void
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
  /**
   * The step's anchor, or `null` where it is not on the page and `null` again
   * where the step names nothing to point at. Which of the two it was is a
   * drawing question, and {@link show} is where it is answered.
   */
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
    step: W['step'],
    anchor: W['anchor'] | null,
    content: Content,
    animate: boolean,
  ): Promise<void> | void
  /** Put it where it belongs now, without animating: the surface moved, not the tour. */
  place(step: W['step'], anchor: W['anchor'] | null, content: Content): void
  /** The words changed and nothing moved. */
  retell(step: W['step'], content: Content): void
  /** Say no, on a step that would not let the tour past. */
  reject(): void
  /** Everything this presenter put on the page goes. */
  teardown(): void
}

/**
 * What a presenter is allowed to tell the machine. Four things it noticed, and
 * nothing to ask.
 *
 * The machine hands one of these to the factory that builds the presenter
 * rather than handing itself, because every member here would otherwise be part
 * of the machine's own public API and {@link next} is one that must not be.
 */
export interface Host<W extends World> {
  /**
   * The anchor of `step` left the page and did not come back. Named, because
   * the tour may have moved on.
   *
   * A target that is missing is retried for a moment first, and nothing here is
   * told about that: a retry entered from {@link Presenter.show} is already a
   * wait the machine holds a promise for, and one entered after the step was
   * drawn changes nothing on screen. This is the give-up.
   */
  lost(step: W['step']): void
  /** The surface moved under the tour, and nothing about the tour changed. */
  moved(): void
  /** The next control was used. The only way anything advances without a signal. */
  next(): void
  /** The control that ends the tour was used. Means what `stop` means. */
  close(): void
}
