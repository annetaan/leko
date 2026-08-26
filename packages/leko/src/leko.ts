import { Machine } from '@annetaan/leko-machine'
import { DomPresenter } from './presenter.js'
import type { LekoOptions, LekoSignal, LekoState, LekoStep, LekoStory, LekoWorld } from './types.js'

/**
 * A tour, and everything the application says to it.
 *
 * Two halves meet here and nowhere else. `@annetaan/leko-machine` decides which
 * step the tour is on and knows nothing about the page.
 * `@annetaan/leko-spotlight` draws the scrim and the hole and knows nothing
 * about steps. This class is the wiring, and the public vocabulary.
 */
export class Leko {
  private readonly machine: Machine<LekoWorld>

  constructor(options: LekoOptions = {}) {
    this.machine = new Machine<LekoWorld>(options, (host) => new DomPresenter(options, host))
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
   * Show `story`, from its first step.
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
   * **The story the tour is already on starts again.** There is one meaning
   * here and it is "put this up", so the run standing there ends, reports its
   * ending, and a new one begins at the first step. Nothing is ever swapped
   * underneath a position somebody is holding.
   *
   * Nothing is torn down until the story is known to be runnable, so an empty
   * one cannot end a tour someone is in the middle of.
   *
   * **Answers whether this story is the one now running.** A story with no
   * steps in it gets `false`.
   *
   * This is not the silence {@link reached} keeps, and the difference is the
   * point. A `reached()` call is instrumentation, written where a thing happens
   * and left in builds where no tour ever runs, so a name nobody awaits has to
   * cost nothing and say nothing. `start()` is the host giving an order, and an
   * order that did nothing has no other symptom: nothing happens, and nothing
   * anywhere says why.
   *
   * `false` also comes back where the story's own `onEnter` threw, and where
   * the call arrived while Leko was inside the application and could not act on
   * anything.
   */
  start(story: LekoStory): boolean {
    return this.machine.start(story)
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
   * Be told when {@link state} changes, and get back the way to stop.
   *
   * ```ts
   * const stop = leko.watch((state) => setBusy(state === 'transitioning'))
   * ```
   *
   * `state` moves in ways {@link LekoOptions.onStep} never mentions: a morph
   * landing, a story's `onEnter` in flight before any step exists, a target
   * that left the page and is being looked for again. The tour has not moved in
   * any of them, so nothing is reported and a host reading `state` on a timer
   * is what is left without this.
   *
   * It fires once per turn and only where the answer changed, so a run that
   * starts and settles in the same turn says `running` once rather than
   * flickering through what it passed on the way. The call lands in a
   * microtask, after whatever moved the tour has finished with it.
   *
   * With {@link state} as the snapshot, this is the `subscribe` half of a React
   * `useSyncExternalStore`.
   */
  watch(watcher: (state: LekoState) => void): () => void {
    return this.machine.watch(watcher)
  }

  /**
   * Reports the ending through {@link LekoOptions.onStep} before returning, with
   * `step` as `undefined`. The host that called this knows already, and
   * whatever draws the progress is written somewhere else and does not.
   *
   * A no-op while idle, so it reports once however many times it is called.
   */
  stop(): void {
    this.machine.stop()
  }
}

/**
 * Makes a tour, and is the only way to get one.
 *
 * {@link Leko} is exported as a type, so a call site never has to choose
 * between this and `new Leko()` when the two would do the same thing.
 */
export function createLeko(options: LekoOptions = {}): Leko {
  return new Leko(options)
}
