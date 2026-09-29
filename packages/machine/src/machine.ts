import {
  type Core,
  type Effect,
  type Event,
  idle,
  type Outcome,
  type Position,
  reduce,
  stateOf,
  stepOf,
} from './plan.js'
import type { Host, MachineOptions, MachineState, Presenter, World } from './types.js'

/**
 * Which step a tour is on, and how it gets to the next one.
 *
 * **Nothing here decides anything**, and nothing here knows what an element is:
 * CLAUDE.md states both under **Writing code here**, and DESIGN.md draws the
 * seam under **The packages, and the seam between them**.
 */
export class Machine<W extends World> {
  #core: Core<W> = idle()
  private readonly options: MachineOptions<W>
  private readonly presenter: Presenter<W>

  /**
   * The presenter is built here rather than handed in, because it needs a
   * {@link Host} and only this object can answer one. What goes to the factory
   * is closures rather than `this`, so nothing else can reach the next control
   * at all.
   */
  constructor(options: MachineOptions<W>, presenter: (host: Host<W>) => Presenter<W>) {
    this.options = options
    this.presenter = presenter({
      lost: (step) => this.dispatch({ kind: 'lost', step }),
      next: () => this.dispatch({ kind: 'pressed' }),
      close: () => this.stop(),
      navigated: (url) => this.dispatch({ kind: 'navigated', url }),
      unloading: () => this.dispatch({ kind: 'unloading' }),
    })
  }

  // ------------------------------------------------------------ what a host reads

  /** Whether a story is running. Derived from one field. DESIGN.md, **`state` is derived**. */
  get state(): MachineState {
    return stateOf(this.#core)
  }

  get story(): W['story'] | undefined {
    return this.#core.position?.story
  }

  get step(): W['step'] | undefined {
    return stepOf(this.#core)
  }

  /** Read this rather than searching `story.steps`; `Leko.index` says why. */
  get index(): number | undefined {
    return this.#core.position?.index
  }

  // ----------------------------------------------------------- what a host calls

  /**
   * Show `story` from its first step, and there is nowhere else to begin:
   * DESIGN.md argues that under **A story is atomic, and stories are short**. A
   * story that has run before goes up again; one the tour is still on is turned
   * down, and DESIGN.md argues that under **Starting a story**.
   *
   * Every way this comes to nothing has a `Problem` of its own, except a story
   * whose `onEnter` or first step's `onEnter` threw, where the reason is thrown
   * again rather than reported. DESIGN.md, **Saying that a call did nothing**.
   */
  start(story: W['story']): void {
    this.dispatch({ kind: 'start', story })
  }

  /**
   * What a previous document handed on, taken up once: DESIGN.md, **A page
   * load ends the story, and hands it on**.
   */
  pickUp(stories: W['story'][]): void {
    this.dispatch({ kind: 'pickUp', stories })
  }

  reached(name: string): void {
    this.dispatch({ kind: 'reached', name })
  }

  /**
   * End the run, reporting it through `onStep` with `step` as `undefined` before
   * returning. A no-op while idle, and the one call the gate does not stand in
   * the way of — DESIGN.md, **One gate, and what it refuses**.
   */
  stop(): void {
    this.dispatch({ kind: 'stop' })
  }

  // ---------------------------------------------------------------- the shell

  /**
   * **The state is written before any effect runs.** Three of them call into
   * the application, which is free to call straight back in, and what it finds
   * is the machine as the event left it. `next` goes last.
   */
  private dispatch(event: Event<W>): Outcome<W> {
    const outcome = reduce(this.#core, event)
    this.#core = outcome.core
    for (const effect of outcome.effects) this.perform(effect)
    if (outcome.next) this.dispatch(outcome.next)
    return outcome
  }

  /**
   * Make one call out of the machine. What a call answers comes back as an
   * event rather than as a return value, because acting on it is a decision.
   */
  private perform(effect: Effect<W>): void {
    switch (effect.kind) {
      case 'teardown':
        return this.presenter.teardown()

      case 'draw':
        return this.presenter.show(effect.step, effect.animate)

      case 'retell':
        return this.presenter.retell(effect.step, effect.reason)

      case 'reject':
        return this.presenter.reject()

      case 'validate': {
        const anchor = this.presenter.resolve(effect.step)
        if (anchor === null) return void this.dispatch({ kind: 'lost', step: effect.step })
        if (effect.step.validate?.(anchor)) {
          return void this.dispatch({ kind: 'validated', at: effect.at })
        }
        // Asked here, on the anchor the guard was just given, so the words are
        // about the attempt that failed and no anchor has to travel to
        // `plan.ts` and back to say so.
        const { error } = effect.step
        const reason =
          typeof error === 'function' ? (error as (anchor: W['anchor']) => string)(anchor) : error
        return void this.dispatch({ kind: 'refused', at: effect.at, reason })
      }

      case 'chain': {
        // Asked while the tour still stands on the last step, so a `stop()`
        // made from in here is the ordinary one and the `chained` event finds
        // the machine already empty.
        const { next } = effect.story
        const into = typeof next === 'function' ? next() : next
        return void this.dispatch({ kind: 'chained', at: effect.at, into })
      }

      case 'handOn': {
        // Asked while the tour still stands on the last step, so a `stop()`
        // made from in here is the ordinary one and `handingOn` finds the
        // tour gone.
        const { next } = effect.story
        const into = typeof next === 'function' ? next() : next
        return void this.dispatch({ kind: 'handingOn', at: effect.at, url: effect.url, into })
      }

      case 'keep':
        return this.presenter.keep(effect.handoff)

      case 'take': {
        const found = this.presenter.take()
        return void this.dispatch({ kind: 'taken', stories: effect.stories, found })
      }

      case 'callStoryEnter': {
        const story = effect.at.story
        return this.enter(() => story.onEnter?.(story), effect.at, {
          kind: 'storyEntered',
          at: effect.at,
        })
      }

      case 'callStepEnter':
        return this.enter(() => effect.step.onEnter?.(effect.step), effect.at, {
          kind: 'stepEntered',
          at: effect.at,
          animate: effect.animate,
        })

      case 'callStepLeave':
        return effect.step.onLeave?.(effect.step, effect.next)

      case 'callStoryLeave':
        return effect.story.onLeave?.(effect.story, effect.next)

      case 'report':
        return this.options.onStep?.(effect.step, effect.story)

      case 'diagnose':
        return this.options.onDiagnostic?.(effect.problem)

      case 'rethrow':
        // From a task of its own, because throwing here would land it on
        // whichever call started the step, which is rarely what went wrong.
        queueMicrotask(() => {
          throw effect.reason
        })
        return
    }
  }

  /**
   * Run one `onEnter` and say which way it went.
   *
   * It answers in this turn or it throws, so the arrival is over by the time
   * this returns. DESIGN.md, **Whatever a handler hands back is dropped**.
   */
  private enter(call: () => void, at: Position<W>, done: Event<W>): void {
    try {
      call()
    } catch (reason) {
      return void this.dispatch({ kind: 'entryFailed', at, reason })
    }
    this.dispatch(done)
  }
}
