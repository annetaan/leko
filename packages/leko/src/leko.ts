import { Machine } from '@annetaan/leko-machine'
import { DomPresenter } from './presenter.js'
import type { LekoOptions, LekoSignal, LekoState, LekoStep, LekoStory } from './types.js'

/**
 * A tour, and everything the application says to it.
 *
 * Two halves meet here and nowhere else. `@annetaan/leko-machine` decides which
 * step the tour is on and knows nothing about the page.
 * `@annetaan/leko-spotlight` draws the scrim and the hole and knows nothing
 * about steps. This class is the wiring, and the public vocabulary.
 */
export class Leko {
  private readonly machine: Machine<HTMLElement, LekoStep, LekoStory>

  constructor(options: LekoOptions = {}) {
    this.machine = new Machine<HTMLElement, LekoStep, LekoStory>(
      options,
      (host) => new DomPresenter(options, host),
    )
  }

  get state(): LekoState {
    return this.machine.state
  }

  /**
   * The story being shown, or `undefined` while idle.
   *
   * This is the object the application registered, not a copy. Reading it is
   * the point: `story.steps.length` is the total a progress readout counts
   * against, and {@link index} is the position within it. Adding to or
   * reordering `steps` while it runs moves the ground under that position.
   */
  get story(): LekoStory | undefined {
    return this.machine.story
  }

  /** The step being shown, or `undefined` while idle. */
  get step(): LekoStep | undefined {
    return this.machine.step
  }

  /**
   * How far into the story the current step sits, or `undefined` while idle.
   *
   * Read this rather than searching `story.steps` for {@link step}. A step is a
   * plain object with no identity of its own, and a story may hold the same one
   * twice, so `indexOf` returns the first of them and a counter built on it
   * walks backwards. Leko is holding the position anyway.
   */
  get index(): number | undefined {
    return this.machine.index
  }

  /**
   * Register a story, replacing any story already registered under that id.
   *
   * Replacing rather than adding, so that a component re-registering on every
   * render does not accumulate copies of itself.
   *
   * **A call naming the story the tour is on does nothing.** Registering is how
   * a story becomes something {@link start} can find, and it is never a way to
   * change a tour while somebody is walking through it. The re-rendering
   * component is the case that rule is written for: the tour keeps the object
   * it entered, and the steps stay where they were under the user's feet.
   *
   * Answers whether the story was registered.
   */
  setStory(story: LekoStory): boolean {
    return this.machine.setStory(story)
  }

  /**
   * Show `storyId`, from its first step.
   *
   * Whatever was running stops, and reports its own ending first. One story at
   * a time is the whole design: two scrims would each block with rectangles
   * built from their own cutouts, so each would cover the other's target.
   *
   * **There is no way to begin anywhere but the beginning.** A story runs from
   * the top forward or it does not run. A step that declares `awaits` cannot be
   * arrived at twice, because the application reported that name once and will
   * not report it again, so a tour standing there a second time waits for ever.
   * Moving a user from one story into another is still ordinary, and it is what
   * a branch does: run a shared story, start one of several, then start the one
   * they rejoin at. The switch cuts rather than morphs, because two unrelated
   * stories interpolating into each other would be a strange thing to watch.
   *
   * A tour somebody wants to redo part of is a shorter story. See
   * [DESIGN.md](https://github.com/annetaan/leko/blob/main/DESIGN.md).
   *
   * Nothing is torn down until the id is known to be good, so a typo cannot end
   * a tour someone is in the middle of.
   *
   * **Answers whether the story named here is the one now running.** A typo
   * gets `false`, and so does a story with no steps in it.
   *
   * This is not the silence {@link reached} keeps, and the difference is the
   * point. A `reached()` call is instrumentation, written where a thing happens
   * and left in builds where no tour ever runs, so a name nobody awaits has to
   * cost nothing and say nothing. `start()` is the host giving an order, and a
   * story id it got wrong has no other symptom: nothing happens, and nothing
   * anywhere says why.
   *
   * `false` also comes back where the id was good and the story's own `onEnter`
   * threw, and where the call arrived while Leko was inside the application and
   * could not act on anything.
   */
  start(storyId: string): boolean {
    return this.machine.start(storyId)
  }

  /**
   * Report that something happened in the application.
   *
   * Advances the step that is waiting for this name, after `validate`, and does
   * nothing whatsoever otherwise — no error, and no warning on every unrelated
   * call. Instrumentation is meant to stay in the source permanently, including
   * in builds where no tour ever runs, so an unmatched call has to be free and
   * silent.
   *
   * `name` is any string, always. The project's vocabulary is offered as
   * completion and never enforced here, which is the same reason this method
   * stays silent about a name nothing awaits.
   */
  reached(name: LekoSignal): void {
    this.machine.reached(name)
  }

  /**
   * Advance whatever step is showing, without naming it.
   *
   * This is for a control on screen: the one Leko puts on the message of a step
   * that declares no signal, or one the host puts in its own chrome — the
   * sandbox's footer. Instrumentation spread through application code wants
   * {@link reached} instead: a bare "advance" has to know the shape of the tour
   * to be written in the right place.
   *
   * A no-op while idle, so callers never have to guard.
   */
  nextStep(): void {
    this.machine.nextStep()
  }

  /**
   * Reports the ending through {@link LekoStory.onStep} before returning, with
   * `step` as `undefined`. The host that called this knows already, and
   * whatever draws the progress is written somewhere else and does not.
   *
   * A no-op while idle, so it reports once however many times it is called.
   */
  stop(): void {
    this.machine.stop()
  }
}

export function createLeko(options: LekoOptions = {}): Leko {
  return new Leko(options)
}
