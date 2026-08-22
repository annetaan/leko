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
   * Nothing back means it is there already, and the step is settled in this
   * turn. That is the same bargain the machine strikes with `onEnter`, and it
   * is what keeps a presenter with nothing to animate from costing a turn.
   *
   * A presenter interrupted part way through may settle late or never. The
   * machine checks its own run counter when this settles, so a late one is
   * dropped the way a late `onEnter` is.
   */
  show(story: St, step: S, anchor: A, content: Content, animate: boolean): Promise<void> | void
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
  /** Take the message away. The cutouts stay where they are. */
  hide(): void
  /** Everything this presenter put on the page goes. */
  teardown(): void
}

/**
 * What a presenter is allowed to tell the machine. Three things it noticed, and
 * nothing to ask.
 *
 * The machine hands one of these to the factory that builds the presenter. It
 * used to hand itself, which made every method here part of the machine's own
 * public API and gave `Machine` a `next()` beside its `nextStep()` that did the
 * same thing.
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
  /** A control the presenter drew was used. Means what `nextStep` means. */
  next(): void
}
