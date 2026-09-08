import { Machine } from '@annetaan/leko-machine'
import { DomPresenter } from '@annetaan/leko-presenter'
import type {
  LekoOptions,
  LekoSignal,
  LekoState,
  LekoStep,
  LekoStory,
  LekoWorld,
} from '@annetaan/leko-types'

/**
 * A tour, and everything the application says to it.
 *
 * This class is the wiring: it builds a `Machine` and hands it the
 * `DomPresenter` to draw with. Where the two halves meet is
 * `@annetaan/leko-presenter` — DESIGN.md, **The packages, and the seam between
 * them**.
 */
export class Leko {
  private readonly machine: Machine<LekoWorld>

  constructor(options: LekoOptions = {}) {
    this.machine = new Machine<LekoWorld>(options, (host) => new DomPresenter(options, host))
  }

  /**
   * Whether a story is running.
   *
   * A snapshot, and there is nothing to subscribe to: every crossing of this is
   * a crossing {@link LekoOptions.onStep} already reports. DESIGN.md argues it
   * under **There is nothing to subscribe to**.
   */
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
   * **There is no way to begin anywhere but the beginning**, and no way back. A
   * tour somebody wants to redo part of is a shorter story — DESIGN.md argues
   * all of it under **A story is atomic, and stories are short**.
   *
   * Moving a user from one story into another is still ordinary, and it is what
   * a branch does. It is written on the stories rather than here: a story names
   * the one that follows it in {@link LekoStory.next}. The switch cuts rather
   * than morphs, because two unrelated stories interpolating into each other
   * would be a strange thing to watch.
   *
   * **This never ends a tour.** A call made while one is running is turned down
   * and reported as `tour-running`, naming this story and the one it left
   * alone, so this call either puts a story up or does nothing at all —
   * DESIGN.md, **Starting a story**. `id` is not read, so a fresh object under
   * the same name is a fresh story like any other.
   *
   * Moving between tours is two calls: {@link stop} runs the whole teardown
   * inside the call that made it, so the `start` on the next line goes through.
   *
   * ```ts
   * leko.stop()
   * leko.start(other)
   * ```
   *
   * **Every way this comes to nothing says so on
   * {@link LekoOptions.onDiagnostic}**, which {@link LekoProblem} lists — and
   * that is the opposite of the silence {@link reached} keeps, for the reason
   * DESIGN.md gives under **Saying that a call did nothing**. The story's own
   * `onEnter` throwing is the one way out with no problem reported: the reason
   * is thrown again instead.
   */
  start(story: LekoStory): void {
    this.machine.start(story)
  }

  /**
   * Report that something happened in the application.
   *
   * Advances the step that is waiting for this name, after `validate`, and does
   * nothing whatsoever otherwise — no error, and no warning on every unrelated
   * call. `name` is any string, always: the project's vocabulary is offered as
   * completion and never enforced here. DESIGN.md argues the silence under
   * **Saying that a call did nothing** and the asymmetry under **Gathering the
   * vocabulary from the call sites**.
   */
  reached(name: LekoSignal): void {
    this.machine.reached(name)
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
