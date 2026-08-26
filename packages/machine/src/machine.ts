import { type Core, idle, type Position, stateOf, stepOf } from './core.js'
import { type Config, type Effect, type Event, type Outcome, reduce } from './plan.js'
import type { Host, Presenter } from './port.js'
import type { ErrorUtils, MachineOptions, MachineState, StepBase, StoryBase } from './types.js'

/** What the next control reads until an instance says otherwise. */
const NEXT_LABEL = 'Next'

/**
 * Whether `onEnter` handed back something to wait for. Asked of the value
 * rather than trusting the signature, because a JavaScript call site is free to
 * return whatever it likes and `await`ing a number would cost a turn for
 * nothing.
 */
const isThenable = (value: unknown): value is Promise<void> =>
  typeof (value as Promise<void> | undefined)?.then === 'function'

/**
 * Which step a tour is on, and how it gets to the next one.
 *
 * Nothing here knows what an element is. Whatever draws the tour arrives
 * through {@link Presenter}, and the tsconfig for this package leaves `lib.dom`
 * out so that a stray `document` is a compile error rather than a habit.
 */
export class Machine<A, S extends StepBase<A, S>, St extends StoryBase<A, S, St>> {
  private readonly options: MachineOptions<A, S, St>
  private readonly presenter: Presenter<A, S, St>
  /**
   * Everything the machine knows, as one value: where the tour is, and every
   * story registered. What each field holds is written down on {@link Core},
   * and every write to any of them goes through {@link commit}.
   */
  #core: Core<S, St> = idle()
  /**
   * The field the rest of this class reads most, and the only one worth a
   * shorthand. Every other read goes to {@link Machine.#core} by name.
   */
  private get position(): Position<St> | undefined {
    return this.#core.position
  }
  /** Everything watching {@link state}, and nothing else is told about it. */
  private readonly watchers = new Set<(state: MachineState) => void>()
  /**
   * What `state` read when this turn first wrote to a field it is derived from,
   * while a notification is on its way. `undefined` means none is queued, which
   * is also what stops one turn queueing six.
   */
  private before: MachineState | undefined

  /**
   * The one place the machine's state changes.
   *
   * `plan.ts` answers every event with the whole of the next state, so this is
   * one replacement that cannot land half done rather than a field written at a
   * time. {@link announce} sits on it, which is why a new write cannot forget
   * to say that {@link state} moved.
   */
  private commit(next: Core<S, St>): void {
    const now = this.#core
    if (next === now) return
    if (next.position !== now.position || next.phase !== now.phase) this.announce()
    this.#core = next
  }

  /**
   * The presenter is built here rather than handed in, because it needs a
   * {@link Host} and only this object can answer one. A factory is the shortest
   * way to close that loop without leaving a window where one exists and the
   * other does not.
   *
   * What goes to the factory is five closures rather than `this`. Handing
   * `this` over made `lost`, `moved` and `next` public members of the machine,
   * so anything holding a tour could call them. A presenter cannot reach
   * anything here it was not given, and nothing else can reach {@link pressed}
   * at all.
   */
  constructor(
    options: MachineOptions<A, S, St>,
    presenter: (host: Host<S>) => Presenter<A, S, St>,
  ) {
    this.options = options
    this.presenter = presenter({
      lost: (step) => void this.dispatch({ kind: 'lost', step }),
      moved: () => void this.dispatch({ kind: 'moved' }),
      next: () => void this.dispatch({ kind: 'pressed' }),
      close: () => this.stop(),
      searching: (step, yes) => void this.dispatch({ kind: 'searching', step, yes }),
    })
  }

  /**
   * Whether a tour is running, and whether it is between things while it does.
   *
   * Derived from two fields and never stored. `stateOf` in `core.ts` says what
   * that buys and what it cost to learn.
   */
  get state(): MachineState {
    return stateOf(this.#core)
  }

  /**
   * Be told when {@link state} changes, and get back the way to stop.
   *
   * `state` moves in ways `onStep` never mentions. A morph landing, a story's
   * `onEnter` in flight before any step exists, a target that left the page and
   * is being looked for again: the tour is between things in all three and has
   * not moved in any of them. Without this a host wanting to stand back while
   * that is true has to read {@link state} on a timer, and a `subscribe` is
   * half of what `useSyncExternalStore` asks for. The other half is `state`
   * itself.
   *
   * **It carries the state and nothing else.** `onStep` carries the step and
   * the one before it. A watcher that carried both would be one hook doing two
   * jobs, and a listener could not tell which of them woke it.
   */
  watch(watcher: (state: MachineState) => void): () => void {
    this.watchers.add(watcher)
    return () => void this.watchers.delete(watcher)
  }

  /**
   * Say that `state` changed, once the turn that changed it is over.
   *
   * Called from {@link commit}, before the write, so what it holds on to is the
   * answer as it stood. **Every write goes through there, so this cannot be
   * forgotten** — which is the same bargain `state` being derived struck, one
   * level up.
   *
   * **A turn, not a write.** `enter` writes `phase` twice before the step is on
   * screen, and a `start` displacing a running story commits three times before
   * the new one is up. A watcher told about each of those would see a flicker
   * that never existed for the user, so the answer is
   * compared with what it was at the start of the turn and reported only if the
   * two differ. A run that starts and settles inside one turn says `running`
   * once, and a call that changed nothing says nothing at all.
   *
   * **Nothing is called from inside a machine operation.** A watcher is
   * application code, and an application that called `stop()` from one would be
   * doing it half way through an arrival, which is the reentrancy the phase
   * gate exists to keep out. A microtask puts it after the operation and still
   * before the next task.
   */
  private announce(): void {
    if (this.watchers.size === 0 || this.before !== undefined) return
    const before = this.state
    this.before = before
    queueMicrotask(() => {
      this.before = undefined
      const now = this.state
      if (now === before) return
      // Copied, because a watcher is free to unsubscribe from inside itself.
      const watching = Array.from(this.watchers)
      for (const watcher of watching) watcher(now)
    })
  }

  /**
   * The story being shown, or `undefined` while idle.
   *
   * This is the object the application registered, not a copy. Reading it is
   * the point: `story.steps.length` is the total a progress readout counts
   * against, and {@link index} is the position within it.
   */
  get story(): St | undefined {
    return this.position?.story
  }

  /** The step being shown, or `undefined` while idle. */
  get step(): S | undefined {
    return stepOf(this.#core)
  }

  /**
   * How far into the story the current step sits, or `undefined` while idle.
   *
   * Read this rather than searching `story.steps` for {@link step}. A step is a
   * plain object with no identity of its own, and a story may hold the same one
   * twice, so `indexOf` returns the first of them and a counter built on it
   * walks backwards. The machine is holding the position anyway.
   */
  get index(): number | undefined {
    return this.position?.index
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
  setStory(story: St): boolean {
    // The registry is replaced whenever a registration takes and left alone
    // whenever it does not, so its identity is the whole answer. The two ways
    // it stays put are the two ways this answers `false`.
    const before = this.#core.stories
    this.dispatch({ kind: 'setStory', story })
    return this.#core.stories !== before
  }

  /**
   * Show `storyId`, from its first step.
   *
   * There is no way to begin anywhere else. A story runs from the top forward
   * or it does not run, which is the same line the movers below are the only
   * ones under: a step that declares `awaits` cannot be arrived at twice,
   * because the application reported that name once and will not report it
   * again. A tour somebody wants to redo is a shorter story.
   *
   * Nothing is torn down until the id is known to be good, so a typo cannot end
   * a tour someone is in the middle of.
   *
   * **Answers whether the story named here is the one now running.** A typo
   * gets `false`, and so does a story with no steps in it, a call that arrived
   * while the machine was inside the application, and a story whose own
   * `onEnter` threw.
   *
   * This is not the silence `reached()` keeps, and the two are different on
   * purpose. A `reached()` call is instrumentation, written where a thing
   * happens and left in builds where no tour runs, so a name nobody awaits has
   * to cost nothing and say nothing. `start()` is a host giving an order. A
   * story id it got wrong is a mistake with no other symptom: nothing happens,
   * and nothing anywhere says why.
   */
  start(storyId: string): boolean {
    const story = this.#core.stories.get(storyId)
    this.dispatch({ kind: 'start', storyId })
    // Asked after the fact rather than assumed, because a story's `onEnter` can
    // throw and end the run before this returns.
    return story !== undefined && this.position?.story === story
  }

  /**
   * Report that something happened in the application.
   *
   * Advances the step that is waiting for this name, after `validate`, and does
   * nothing whatsoever otherwise — no error, and no warning on every unrelated
   * call. Instrumentation is meant to stay in the source permanently, including
   * in builds where no tour ever runs, so an unmatched call has to be free and
   * silent.
   */
  reached(name: string): void {
    this.dispatch({ kind: 'reached', name })
  }

  /**
   * Reports the ending through the story's `onStep` before returning, with
   * `step` as `undefined`. The host that called this knows already, and
   * whatever draws the progress is written somewhere else and does not.
   *
   * A no-op while idle, so it reports once however many times it is called.
   *
   * The one call the phase gate does not stand in the way of. A step still
   * arriving is thrown away rather than waited for, and the `onEnter` settling
   * afterwards finds the tour standing somewhere else and does nothing.
   */
  stop(): void {
    this.dispatch({ kind: 'stop' })
  }

  // ------------------------------------------------------------- the shell
  //
  // Below here nothing decides anything. `plan.ts` says what an event does to
  // the state and what the machine owes the world because of it, and these two
  // do the owing.

  /** The one thing a reduction needs that is not state. */
  private get config(): Config {
    return { nextLabel: this.options.nextLabel ?? NEXT_LABEL }
  }

  /**
   * Put one event through {@link reduce}, take the state it answers with, and
   * do what it says is owed.
   *
   * **The state is committed before any of it runs.** Every effect below is a
   * call out of the machine, and three of them are calls into the application,
   * which is free to call straight back in. What such a call finds is the
   * machine as the event left it. That ordering used to be a rule kept by hand
   * at seven different places, each with a comment saying why the line above it
   * came first.
   *
   * `next` is the machine carrying on with something it began, and it goes last
   * so that a reduction stops at a window rather than spanning one.
   */
  private dispatch(event: Event<A, S, St>): Outcome<A, S, St> {
    const outcome = reduce(this.#core, event, this.config)
    this.commit(outcome.core)
    for (const effect of outcome.effects) this.perform(effect)
    if (outcome.next) this.dispatch(outcome.next)
    return outcome
  }

  /**
   * Make one call out of the machine.
   *
   * Where the call answers something the machine needs, the answer comes back
   * as an event rather than as a return value, because acting on it is a
   * decision and no decision is made here.
   */
  private perform(effect: Effect<A, S, St>): void {
    switch (effect.kind) {
      case 'hold':
        this.presenter.hold(effect.story, effect.step)
        return

      case 'teardown':
        this.presenter.teardown()
        return

      case 'draw': {
        // A target that is not there is handed over all the same. Whether that
        // is an ending or something to wait out is a drawing question, and the
        // presenter says so through `lost` once it has decided.
        const anchor = this.presenter.resolve(effect.step)
        const showing = this.presenter.show(
          effect.story,
          effect.step,
          anchor,
          effect.content,
          effect.animate,
        )
        if (!isThenable(showing)) return
        this.dispatch({ kind: 'shown', at: effect.at, showing })
        void showing.then(() => void this.dispatch({ kind: 'settled', showing }))
        return
      }

      case 'place':
        this.presenter.place(
          effect.story,
          effect.step,
          this.presenter.resolve(effect.step),
          effect.content,
        )
        return

      case 'retell':
        this.presenter.retell(effect.story, effect.step, effect.anchor, effect.content)
        return

      case 'reject':
        this.presenter.reject()
        return

      case 'validate': {
        const anchor = this.presenter.resolve(effect.step)
        if (anchor === null) {
          this.dispatch({ kind: 'lost', step: effect.step })
          return
        }
        if (effect.step.validate?.(anchor)) {
          this.dispatch({ kind: 'validated', at: effect.at })
          return
        }
        effect.step.onValidationError?.(
          anchor,
          this.errorUtils(effect.at, effect.story, effect.step, anchor),
        )
        return
      }

      case 'callStoryEnter': {
        let entering: unknown
        try {
          entering = effect.story.onEnter?.(effect.story)
        } catch (reason) {
          this.dispatch({ kind: 'entryFailed', at: effect.at, reason })
          return
        }
        const done = (): void => void this.dispatch({ kind: 'storyEntered', at: effect.at })
        // A handler that hands back nothing costs nothing at all.
        if (!isThenable(entering)) return done()
        void entering.then(done, (reason: unknown) =>
          this.dispatch({ kind: 'entryFailed', at: effect.at, reason }),
        )
        return
      }

      case 'callStepEnter': {
        let entering: unknown
        try {
          entering = effect.step.onEnter?.(effect.step)
        } catch (reason) {
          this.dispatch({ kind: 'entryFailed', at: effect.at, reason })
          return
        }
        const done = (): void =>
          void this.dispatch({ kind: 'stepEntered', at: effect.at, animate: effect.animate })
        if (!isThenable(entering)) return done()
        void entering.then(done, (reason: unknown) =>
          this.dispatch({ kind: 'entryFailed', at: effect.at, reason }),
        )
        return
      }

      case 'callStepLeave':
        effect.step.onLeave?.(effect.step, effect.next)
        return

      case 'callStoryLeave':
        effect.story.onLeave?.(effect.story, effect.next)
        return

      case 'report':
        this.options.onStep?.(effect.step, effect.previous, effect.story)
        return

      case 'diagnose':
        this.options.onDiagnostic?.(effect.problem)
        return

      case 'rethrow':
        // Thrown again on its own, because a library that quietly eats an
        // application's exception is why the bug takes a day to find. Throwing
        // it from here would land it on whichever call happened to start the
        // step, which is rarely the code that went wrong.
        queueMicrotask(() => {
          throw effect.reason
        })
        return
    }
  }

  /**
   * What one failed attempt at `step` is allowed to do about itself.
   *
   * `onValidationError` returns `void`, and a handler is free to look something
   * up and call back afterwards. `attempt` is the position the attempt was made
   * at, and `plan.ts` is what compares it with where the tour has got to since.
   *
   * Nothing here writes to the step. The step object belongs to the
   * application, and the content is read off `message` every time the machine
   * draws, so an application that edits its own text is seen and Leko never has
   * a copy to go stale.
   */
  private errorUtils(attempt: Position<St>, story: St, step: S, anchor: A): ErrorUtils {
    return {
      shake: () => void this.dispatch({ kind: 'shake', attempt }),
      setError: (message) =>
        void this.dispatch({ kind: 'setError', attempt, story, step, anchor, message }),
    }
  }
}
