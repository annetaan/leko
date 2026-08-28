import {
  type Config,
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

/** What the next control reads until an instance says otherwise. */
const NEXT_LABEL = 'Next'

/**
 * Whether the presenter gave back something to wait for. Asked of the value,
 * because a JavaScript call site returns whatever it likes and `await`ing a
 * number would cost a turn for nothing.
 *
 * A morph is the only thing the machine waits on. An `onEnter` hands nothing
 * back, so no call into the application holds an arrival open. DESIGN.md argues
 * that under **A step that waits**.
 */
const isThenable = (value: unknown): value is Promise<void> =>
  typeof (value as Promise<void> | undefined)?.then === 'function'

/**
 * Which step a tour is on, and how it gets to the next one.
 *
 * **Nothing here decides anything.** `plan.ts` answers an event with the next
 * state and the calls owed, and this commits the one and makes the others. A
 * decision that lands in this file is in the wrong file.
 *
 * Nothing here knows what an element is either. The tsconfig for this package
 * leaves `lib.dom` out, so a stray `document` is a compile error.
 */
export class Machine<W extends World> {
  #core: Core<W> = idle()
  private readonly options: MachineOptions<W>
  private readonly presenter: Presenter<W>
  /** Everything watching {@link state}, and nothing else is told about it. */
  private readonly watchers = new Set<(state: MachineState) => void>()
  /** What `state` read when this turn first moved it, while one is queued. */
  private queued: MachineState | undefined

  /**
   * The presenter is built here rather than handed in, because it needs a
   * {@link Host} and only this object can answer one. What goes to the factory
   * is five closures rather than `this`, so nothing else can reach the next
   * control at all.
   */
  constructor(options: MachineOptions<W>, presenter: (host: Host<W>) => Presenter<W>) {
    this.options = options
    this.presenter = presenter({
      lost: (step) => this.dispatch({ kind: 'lost', step }),
      moved: () => this.dispatch({ kind: 'moved' }),
      next: () => this.dispatch({ kind: 'pressed' }),
      close: () => this.stop(),
      searching: (step, yes) => this.dispatch({ kind: 'searching', step, yes }),
    })
  }

  // ------------------------------------------------------------ what a host reads

  /** Derived from two fields and never stored. DESIGN.md, **`state` is derived**. */
  get state(): MachineState {
    return stateOf(this.#core)
  }

  /** The object the application registered, not a copy, so `steps.length` is readable. */
  get story(): W['story'] | undefined {
    return this.#core.position?.story
  }

  /** The step being shown, or `undefined` while idle. */
  get step(): W['step'] | undefined {
    return stepOf(this.#core)
  }

  /**
   * Read this rather than searching `story.steps` for {@link step}. A story may
   * hold the same plain object twice, so `indexOf` walks backwards.
   */
  get index(): number | undefined {
    return this.#core.position?.index
  }

  /** With {@link state} as the snapshot, both halves of `useSyncExternalStore`. */
  watch(watcher: (state: MachineState) => void): () => void {
    this.watchers.add(watcher)
    return () => void this.watchers.delete(watcher)
  }

  // ----------------------------------------------------------- what a host calls

  /**
   * Show `story` from its first step. There is no way to begin anywhere else
   * and no way back: DESIGN.md argues that under **A story is atomic, and
   * stories are short**.
   *
   * A story that has run before goes up again from its first step, because
   * there is one meaning here and it is "put this up". A story the tour is
   * still on is a different thing and is turned down: `start` never ends a
   * tour, and DESIGN.md argues that under **Starting a story**.
   *
   * Every way this comes to nothing has a `Problem` of its own: an empty story,
   * a tour already running, and a call the gate turned down. A story whose
   * `onEnter` threw is the one that does not, and the reason is thrown again
   * rather than reported. DESIGN.md, **Saying that a call did nothing**.
   */
  start(story: W['story']): void {
    this.dispatch({ kind: 'start', story })
  }

  /**
   * Report that something happened. Advances the step waiting for this name,
   * after `validate`, and does nothing whatsoever otherwise: instrumentation
   * stays in builds where no tour ever runs, so it has to be free and silent.
   */
  reached(name: string): void {
    this.dispatch({ kind: 'reached', name })
  }

  /**
   * End the run, reporting it through `onStep` with `step` as `undefined` before
   * returning. A no-op while idle. The one call the gate does not stand in the
   * way of: a step still arriving is thrown away rather than waited for.
   */
  stop(): void {
    this.dispatch({ kind: 'stop' })
  }

  // ---------------------------------------------------------------- the shell

  /**
   * **The state is committed before any effect runs.** Three of them call into
   * the application, which is free to call straight back in, and what it finds
   * is the machine as the event left it. `next` goes last.
   */
  private dispatch(event: Event<W>): Outcome<W> {
    const config: Config = { nextLabel: this.options.nextLabel ?? NEXT_LABEL }
    const outcome = reduce(this.#core, event, config)
    this.commit(outcome.core)
    for (const effect of outcome.effects) this.perform(effect)
    if (outcome.next) this.dispatch(outcome.next)
    return outcome
  }

  /** The one place the state changes, which is why {@link announce} sits here. */
  private commit(next: Core<W>): void {
    const now = this.#core
    if (next === now) return
    if (next.position !== now.position || next.phase !== now.phase) this.announce()
    this.#core = next
  }

  /**
   * Say that `state` changed, once the turn that changed it is over. A turn and
   * not a write, and never from inside a machine operation. DESIGN.md argues
   * both under **Watching `state`**.
   */
  private announce(): void {
    if (this.watchers.size === 0 || this.queued !== undefined) return
    const before = this.state
    this.queued = before
    queueMicrotask(() => {
      this.queued = undefined
      const now = this.state
      if (now === before) return
      // Copied, because a watcher is free to unsubscribe from inside itself.
      for (const watcher of Array.from(this.watchers)) watcher(now)
    })
  }

  /**
   * Make one call out of the machine. What a call answers comes back as an
   * event rather than as a return value, because acting on it is a decision.
   */
  private perform(effect: Effect<W>): void {
    switch (effect.kind) {
      case 'teardown':
        return this.presenter.teardown()

      case 'draw': {
        // A target that is not there is handed over all the same. What that
        // means is a drawing question, answered through `lost`.
        const anchor = this.presenter.resolve(effect.step)
        const showing = this.presenter.show(effect.step, anchor, effect.content, effect.animate)
        if (!isThenable(showing)) return
        this.dispatch({ kind: 'shown', at: effect.at, showing })
        void showing.then(() => this.dispatch({ kind: 'settled', showing }))
        return
      }

      case 'place':
        return this.presenter.place(
          effect.step,
          this.presenter.resolve(effect.step),
          effect.content,
        )

      case 'retell':
        return this.presenter.retell(effect.step, effect.content)

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
   * this returns. Whatever the handler gives back is dropped: a step that has
   * to wait for something waits for a signal, on a machine that is accepting
   * calls the whole time.
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
