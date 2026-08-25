import type { StepBase, StoryBase } from './types.js'

/** Everything the box beside the cutout can be asked to show at once. */
export interface Content {
  /** The step's instruction, where it has one. */
  text: string | undefined
  /** What went wrong on the last attempt, where something did. */
  error: string | undefined
  /**
   * The words on the next control, or `undefined` on a step that has none.
   *
   * Decided here and never by the presenter. A step that declares `awaits` must
   * not get a control, because the control would be a way past the work that
   * step exists to make someone do. A presenter free to decide this would be a
   * way to configure the rule back off.
   */
  next: string | undefined
}

/**
 * What the machine is allowed to ask of whatever draws the tour.
 *
 * Nothing here schedules itself. A presenter that notices the surface moved
 * says so through {@link Host.moved} and waits to be called back, because
 * whether the tour may be measured at all is a fact about the machine's state
 * and the machine is the only thing holding it.
 */
export interface Presenter<A, S extends StepBase<A, S>, St extends StoryBase<A, S, St>> {
  /** The step's anchor, or `null` when it is not on the page. */
  resolve(step: S): A | null
  /**
   * Draw the step, and hand back something that settles once it has arrived.
   *
   * `anchor` is `null` where the target is not on the page. Drawing is not the
   * only answer to that: a presenter may give it time to appear and report
   * {@link Host.lost} once it has given up. What a missing target means is a
   * drawing question, so it is answered here rather than by the machine.
   *
   * Nothing back means it is there already, and the step is settled in this
   * turn. That is the same bargain the machine strikes with `onEnter`, and it
   * is what keeps a presenter with nothing to animate from costing a turn.
   *
   * A presenter interrupted part way through may settle late or never. The
   * machine holds on to whatever this handed back and lets go of it the moment
   * another arrival begins, so a late one is dropped the way a late `onEnter`
   * is.
   */
  show(
    story: St,
    step: S,
    anchor: A | null,
    content: Content,
    animate: boolean,
  ): Promise<void> | void
  /**
   * An arrival began, and nothing about the step it is heading for has been
   * built, looked for or drawn.
   *
   * The step is the one being entered, and `undefined` while a story's own
   * `onEnter` runs, because no step has been entered yet. Both are windows
   * where the machine acts on nothing a host calls, so both are windows a
   * presenter may want to say something about.
   *
   * Whatever this puts on screen is released by the next {@link show} or
   * {@link teardown}. Nothing here is told when the arrival ends by any other
   * route, because there is no other route.
   */
  hold(story: St, step: S | undefined): void
  /**
   * Put it where it belongs now, without animating. For a surface that moved
   * under the tour rather than a tour that moved.
   *
   * The anchor may be `null`. A surface can change size in the same turn the
   * step's anchor leaves the page, and a presenter with layers to resize still
   * has work to do in that turn.
   */
  place(story: St, step: S, anchor: A | null, content: Content): void
  /**
   * The words changed and nothing moved. Whether that means editing a box
   * already on screen or placing one that was not showing is the presenter's
   * to decide.
   */
  retell(story: St, step: S, anchor: A, content: Content): void
  /** Say no, on a step that would not let the tour past. */
  reject(): void
  /** Everything this presenter put on the page goes. */
  teardown(): void
}

/**
 * What a presenter is allowed to tell the machine. Five things it noticed, and
 * nothing to ask.
 *
 * The machine hands one of these to the factory that builds the presenter,
 * rather than handing itself. Every method here would otherwise be part of the
 * machine's own public API, and {@link next} is one that must not be.
 *
 * There was a fourth member, `story`, and it was the only reason this interface
 * needed to know what a story is. A presenter read it to find the `padding` the
 * running story asked for. That is a drawing question answered by reaching back
 * through the state half at a moment nobody had written down: correct during
 * `show`, `undefined` during `teardown`, and nothing said so. The story is a
 * parameter of {@link Presenter.show}, {@link Presenter.place} and
 * {@link Presenter.retell} now, handed over at the moment it is needed.
 */
export interface Host<S> {
  /**
   * The anchor of `step` left the page. The step is named rather than looked
   * up, because a presenter watching the step it was shown can notice the loss
   * after the tour has started heading somewhere else.
   */
  lost(step: S): void
  /** The surface moved under the tour, and nothing about the tour changed. */
  moved(): void
  /**
   * The next control the presenter drew was used. Advances the step showing.
   *
   * **The only way anything advances a step without naming a signal.** A step
   * that declares `awaits` never gets a control, because the control would be a
   * way past the work that step exists to make somebody do. Deriving the
   * control from `awaits` says nothing at all unless the presser is the same
   * thing that decides whether there is one, so there is no public method
   * beside this.
   */
  next(): void
  /**
   * The control that ends the tour was used. Means what `stop` means.
   *
   * The fourth member, and the last one that will be added lightly. Three was
   * the point of this interface. This one earns its place because the scrim
   * blocks the page, so the way out of a tour has to be something Leko itself
   * puts within reach, and the presenter is what draws it.
   */
  close(): void
  /**
   * `step`'s anchor is not on the page, and the presenter has not given up on
   * it yet. `yes` is `false` once it is back.
   *
   * **A report, not a request.** What the tour's `state` says while this is
   * true is the machine's to decide, and it decides the same thing here as it
   * does for a target that was missing when the step arrived. That one goes
   * through {@link Presenter.show}, which hands a promise back, so the machine
   * hears about it without being told. This one nobody asked for, so there is
   * nothing to hand back and nothing else that could carry it.
   *
   * The alternative was writing down that `state` is about the machine rather
   * than about the screen, and leaving a curtain on screen for two seconds
   * while `state` read `running`. A host cannot act on a wait it cannot see,
   * and `state` is about to be something a host can subscribe to.
   *
   * The give-up is {@link lost} rather than a `false` here. A run that is over
   * has no wait left to end.
   */
  searching(step: S, yes: boolean): void
}
