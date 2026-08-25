import type { Content, Host, Presenter } from './port.js'
import type {
  ErrorUtils,
  MachineOptions,
  MachineState,
  Problem,
  StepBase,
  StoryBase,
} from './types.js'

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
 * How far along the machine is with whatever it is doing, and the one thing
 * that decides whether a call from the application is acted on.
 *
 * `story` and `step` are the arrival. Nothing is drawn in either, the anchor
 * has not been looked for, and the application is inside `onEnter` or about to
 * be. They are two rather than one because the step's `onLeave` is owed in the
 * second and not in the first.
 *
 * `ending` is a run being torn down, with `onLeave` running.
 *
 * `settling` and `ready` are both a step that arrived and is on screen. The
 * only difference is whether the presenter is still moving it.
 *
 * `searching` is a step that arrived and whose anchor has since left the page,
 * with the presenter looking for it again. The step is still the one the tour
 * is on. What is on screen is a curtain, which is why this is not `ready`.
 */
type Phase = 'story' | 'step' | 'ending' | 'settling' | 'searching' | 'ready'

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
   * Every story the application has registered, of which at most one is ever
   * running. Held here so that a call site reports a signal once, to the
   * instance, and never has to know how many stories might care.
   */
  private readonly stories = new Map<string, St>()
  /**
   * Which story is running and where in it the tour is, or `undefined` while
   * nothing is running.
   *
   * One field, because the two are one fact. Being idle is this being
   * `undefined`, so there is one way to say it.
   *
   * The object is replaced rather than edited on every move, and never on
   * anything else, so its identity is the step occurrence the tour is standing
   * on. {@link errorUtils} is built on that.
   */
  private position: { story: St; index: number } | undefined
  /**
   * The one field a call from the application is answered against, and half of
   * what {@link state} is read from.
   */
  private phase: Phase = 'ready'
  /**
   * What the last attempt at the current step was told was wrong with it, set
   * through {@link ErrorUtils.setError}. Held here rather than on the step: it
   * is about one attempt, not about the tour, and the step object belongs to
   * the application.
   */
  private error: string | undefined
  /**
   * The step `onStep` was last told the tour is on, which is not {@link step}: a
   * step whose `onEnter` is still running is where the tour is heading and
   * nowhere a host has heard of. Every `previous` is read from here, so the
   * calls chain — each one leaves from where the last one arrived — and a run
   * that ends before it draws says it came from nowhere.
   */
  private announced: S | undefined
  /**
   * Whatever {@link Presenter.show} last handed back, so that a morph settling
   * after it was interrupted can tell. The morph is the one thing here a fresh
   * arrival is allowed to cut short, which is why it is the one thing that
   * needs this.
   */
  private showing: Promise<void> | undefined

  /**
   * The presenter is built here rather than handed in, because it needs a
   * {@link Host} and only this object can answer one. A factory is the shortest
   * way to close that loop without leaving a window where one exists and the
   * other does not.
   *
   * What goes to the factory is four closures rather than `this`. Handing
   * `this` over made `lost`, `moved` and `next` public members of the machine,
   * so anything holding a tour could call them, and `next` sat beside
   * `nextStep` meaning the same thing. A presenter cannot reach anything here
   * it was not given.
   */
  constructor(
    options: MachineOptions<A, S, St>,
    presenter: (host: Host<S>) => Presenter<A, S, St>,
  ) {
    this.options = options
    this.presenter = presenter({
      lost: (step) => this.lose(step),
      moved: () => this.surfaceMoved(),
      next: () => this.nextStep(),
      close: () => this.stop(),
      searching: (step, yes) => this.seek(step, yes),
    })
  }

  /**
   * Whether a call from the application is acted on at all.
   *
   * **The machine never accepts a call while it is inside a call into the
   * application.** An `onEnter` in flight is inside one, whether it answered
   * synchronously or handed back a promise that lands half a second later. So
   * is an `onLeave` running as a tour is torn down.
   *
   * A step that is drawn and still moving is the other thing. It has been
   * through the whole arrival and the user is looking at it, so a call about it
   * means what it says and goes through.
   *
   * **{@link stop} does not ask.** A tour that cannot be turned off until an
   * `onEnter` somebody else wrote decides to settle is worse than any race this
   * keeps out, and a component unmounting mid-arrival has nowhere else to go.
   * Ending a run is also the one thing that needs nothing of the arrival: it
   * throws the arrival away rather than acting on it.
   */
  private get accepting(): boolean {
    return this.phase === 'ready' || this.phase === 'settling' || this.phase === 'searching'
  }

  /**
   * Say that a call arrived at a moment nothing could be done with it, and
   * answer `false` so that a caller reading the answer gets the same news.
   */
  private refuse(call: Extract<Problem<S>, { kind: 'call-refused' }>['call']): false {
    this.options.onDiagnostic?.({ kind: 'call-refused', call })
    return false
  }

  /**
   * Derived, never stored.
   *
   * It used to be a field, written at each of the handful of places that knew
   * it had changed. One of them did not know: a target found missing after a
   * slow `onEnter` left `transitioning` on a tour that had finished settling
   * and was never going to settle again, so a host could not tell a slow step
   * from a stuck one. The fix is not another assignment. Two fields hold the
   * whole answer, and reading it off them is a thing that cannot be forgotten.
   */
  get state(): MachineState {
    if (!this.position) return 'idle'
    return this.phase === 'ready' ? 'running' : 'transitioning'
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
    const here = this.position
    return here && here.story.steps[here.index]
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
    if (!this.accepting) return this.refuse('setStory')
    // Not a diagnostic. A component re-registering on every render lands here
    // on every render while a tour runs, and that is the case the rule is
    // written for rather than a mistake to be told about.
    if (this.position?.story.id === story.id) return false
    this.stories.set(story.id, story)
    return true
  }

  /**
   * Show `storyId`, from its first step.
   *
   * There is no way to begin anywhere else. A story runs from the top forward
   * or it does not run, which is the same line {@link nextStep} is the only
   * mover under: a step that declares `awaits` cannot be arrived at twice,
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
    if (!this.accepting) return this.refuse('start')
    const story = this.stories.get(storyId)
    if (!story) {
      this.options.onDiagnostic?.({ kind: 'story-not-found', storyId })
      return false
    }
    // A story with nothing in it used to be caught by the bounds check on `at`,
    // because `0 >= 0`. Without one it would enter, find no step, and report a
    // run that began and ended in the same turn.
    if (story.steps.length === 0) {
      this.options.onDiagnostic?.({ kind: 'story-empty', storyId })
      return false
    }
    // What is ending is told what is starting, so teardown a branch and the
    // story it rejoins both need can be skipped. Displacing one story with
    // another is one operation from out here, and `end` keeps the phase closed
    // through the whole of it, including the report. So nothing gets between
    // the two halves and `next` is a promise this call keeps.
    this.end(story)
    this.position = { story, index: 0 }
    this.enterStory(story)
    // Asked after the fact rather than assumed, because a story's `onEnter` can
    // throw and end the run before this returns.
    return this.position?.story === story
  }

  /**
   * Outermost first: whatever the whole story assumes is built before anything
   * about its first step is, including that step's own `onEnter`.
   *
   * A handler that hands back nothing costs nothing, exactly as a step's does —
   * the first step is entered in the same turn `start()` was called in.
   */
  private enterStory(story: St): void {
    const here = this.position
    // Nothing of this story is on screen and nothing will be until its first
    // step is drawn, which is the widest this window gets.
    this.presenter.hold(story, undefined)
    // Nothing of this story is settled and nothing is drawn, which is what
    // `transitioning` says about the gap between two steps and says as well
    // about this one. Set before `onEnter` is called rather than after, so that
    // a handler answering synchronously is inside the window too. No step has
    // been entered yet, and this phase is how {@link end} knows.
    this.phase = 'story'
    let entering: unknown
    try {
      entering = story.onEnter?.(story)
    } catch (reason) {
      return this.failed(reason, here)
    }
    // `stop()` walks out of an arrival, and this is a handler that can make the
    // call. There is no first step to enter once it has.
    const go = () => {
      if (this.position === here) this.enter(false, undefined)
    }
    if (!isThenable(entering)) return go()

    void entering.then(go, (reason: unknown) => this.failed(reason, here))
  }

  /**
   * Story first, then instance: the same near-to-far order the settings read
   * in. Both fire, because a readout belonging to one story and a counter that
   * spans all of them are different jobs and neither replaces the other.
   */
  private report(story: St, step: S | undefined, previous: S | undefined): void {
    story.onStep?.(step, previous)
    this.options.onStep?.(step, previous, story)
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
    const step = this.step
    if (step?.awaits !== name) return
    // Matched, and dropped anyway. A step waiting for a name the application
    // has already reported waits for ever, and this is the only place anything
    // knows that happened.
    if (!this.accepting) {
      this.options.onDiagnostic?.({ kind: 'signal-dropped', name, step })
      return
    }
    this.advance(step)
  }

  /**
   * Advance whatever step is showing, without naming it.
   *
   * A no-op while idle, so callers never have to guard.
   */
  nextStep(): void {
    const step = this.step
    if (!step) return
    if (!this.accepting) {
      this.refuse('nextStep')
      return
    }
    this.advance(step)
  }

  /**
   * It is *not* a no-op mid morph: silently dropping a call would be the
   * library deciding the application did not mean it, which is the guessing it
   * exists to avoid. A morph is a step that arrived and is still moving, and a
   * call during one means what it says.
   *
   * A step still arriving is the other thing, and {@link accepting} is where
   * that is decided. The call is dropped where it stands rather than held until
   * the arrival lands: a signal saved over is a step advancing on something
   * that happened before it began.
   */
  private advance(step: S): void {
    const here = this.position
    if (!here) return
    const { story, index } = here

    // A step that declares a signal is not guarded here. The application has
    // already said the thing happened, and reading the page to check would be
    // a second source of truth for the same question. See {@link nextLabel}:
    // `awaits` decides whether the step has a control, and it decides whether
    // it has a guard, for one reason.
    if (step.validate && step.awaits === undefined) {
      const anchor = this.presenter.resolve(step)
      if (anchor === null) return this.lose(step)
      if (!step.validate(anchor)) {
        step.onValidationError?.(anchor, this.errorUtils(story, step, anchor))
        return
      }
    }

    if (index >= story.steps.length - 1) return this.end(undefined)
    this.position = { story, index: index + 1 }
    this.enter(true, step)
  }

  /**
   * Reports the ending through the story's `onStep` before returning, with
   * `step` as `undefined`. The host that called this knows already, and
   * whatever draws the progress is written somewhere else and does not.
   *
   * A no-op while idle, so it reports once however many times it is called.
   *
   * The one call {@link accepting} does not stand in the way of. A step still
   * arriving is thrown away rather than waited for, and the `onEnter` settling
   * afterwards finds the tour standing somewhere else and does nothing.
   */
  stop(): void {
    this.end(undefined)
  }

  /**
   * Ending a run, told where the tour is going next so that the story's
   * `onLeave` can be. `next` is a story only when {@link start} is displacing
   * this one; every other ending has nowhere to name.
   *
   * **An ending with somewhere to go stays closed through its own report.**
   * The `start` that caused it has not put the new story up yet, and a story
   * begun from that report would be overwritten by the one already on its way.
   * That is also what makes `next` worth having: the story named there is the
   * story that runs.
   *
   * An ending with nowhere to go opens first. Nothing follows the report, so a
   * host is free to start a story from it, and `branching.ts` rejoins that way.
   */
  private end(next: St | undefined): void {
    const here = this.position
    if (!here) return
    const { story } = here
    const previous = this.announced
    // The step's `onLeave` is owed unless the story's own setup never got as
    // far as entering one.
    const step = this.phase === 'story' ? undefined : this.step
    // Closed for the whole teardown. `onLeave` is a call into the application,
    // and a story started from inside one would be torn down by the lines after
    // it. Opened again below, before the report, which is the one handler that
    // has nothing running after it.
    this.phase = 'ending'
    this.position = undefined
    this.error = undefined
    this.announced = undefined
    this.showing = undefined
    this.presenter.teardown()
    // The step's own cleanup, then the story's: innermost first, the mirror of
    // the order they were entered in.
    step?.onLeave?.(step, undefined)
    story.onLeave?.(story, next)
    if (!next) this.phase = 'ready'
    this.report(story, undefined, previous)
  }

  /**
   * What one failed attempt at `step` is allowed to do about itself.
   *
   * `onValidationError` returns `void`, and a handler is free to look something
   * up and call back afterwards. A handler that answers a second late is
   * talking about a step the tour has left, and the words it wrote belong on
   * that step or nowhere.
   *
   * {@link position} is replaced on every move and on nothing else, so holding
   * the object is holding the step occurrence this attempt was made at. A
   * second failed attempt at the same step is the same occurrence, which is why
   * a step keeps its own utils working for as long as it is the step being
   * attempted.
   *
   * Nothing here writes to the step. The step object belongs to the
   * application, and {@link content} reads `message` off it every time it
   * draws, so an application that edits its own text is seen and Leko never
   * has a copy to go stale.
   */
  private errorUtils(story: St, step: S, anchor: A): ErrorUtils {
    const attempt = this.position
    const stale = () => this.position !== attempt
    return {
      shake: () => {
        if (stale()) return
        this.presenter.reject()
      },
      setError: (message) => {
        if (stale()) return
        this.error = message
        this.presenter.retell(story, step, anchor, this.content(step))
      },
    }
  }

  /** Everything the box beside the cutout should be showing for this step. */
  private content(step: S): Content {
    return { text: step.message, error: this.error, next: this.nextLabel(step) }
  }

  /**
   * The words on this step's next control, or `undefined` where it has none.
   *
   * A step that declares a signal never gets one, and that is the whole rule.
   * The step is waiting for the user to do something the application will
   * report, and a button next to the instruction is a way past it without
   * doing that. So this is derived from `awaits` rather than configured per
   * step: nothing a story can write turns the control back on where the second
   * constraint took it away.
   *
   * A step declaring no signal has no other way to end. The control appears
   * even where the step has no message, because a box with a button in it is
   * the difference between a step the user can leave and one they cannot.
   */
  private nextLabel(step: S): string | undefined {
    if (step.awaits !== undefined) return undefined
    return this.options.nextLabel ?? NEXT_LABEL
  }

  /**
   * {@link Host.moved}. Nothing about the tour changed, so the step is placed
   * rather than replayed.
   *
   * Nothing of this step has been measured while it is still arriving, and
   * measuring it here would be reading the anchor early by another route.
   */
  private surfaceMoved(): void {
    if (!this.accepting) return
    const here = this.position
    const step = here && here.story.steps[here.index]
    if (!here || !step) return
    this.presenter.place(here.story, step, this.presenter.resolve(step), this.content(step))
  }

  /**
   * Enter the step {@link position} now names, leaving whatever the tour was
   * standing on.
   *
   * A handler that hands back nothing costs nothing at all.
   */
  private enter(animate: boolean, leaving: S | undefined): void {
    const here = this.position
    const step = here && here.story.steps[here.index]
    if (!here || !step) return this.end(undefined)
    const story = here.story

    // Whatever was wrong with an attempt at the step being left is not an
    // attempt at this one, which is why `setError` has no counterpart to call.
    this.error = undefined
    // Whatever the presenter was moving is not this step's arrival. A morph
    // settling after this reads a promise nothing is holding any more.
    this.showing = undefined
    // The arrival begins here rather than at the `await` below, so that the
    // synchronous part of it is inside the window too: `onLeave`, `onEnter` and
    // the draw are all calls the application can be inside, and through every
    // one of them `state` used to answer `running` about a step the presenter
    // had never been given.
    this.phase = 'step'
    // The step being left is over, and the hole is not where it was. There is
    // no honest place for the message until the new cutout has arrived, and
    // nothing about the step ahead has been built, so there is nothing honest
    // to draw either.
    this.presenter.hold(story, step)
    leaving?.onLeave?.(leaving, step)

    let entering: unknown
    try {
      entering = step.onEnter?.(step)
    } catch (reason) {
      return this.failed(reason, here)
    }
    if (!isThenable(entering)) return this.arrive(step, animate, story, here)

    void entering.then(
      () => this.arrive(step, animate, story, here),
      (reason: unknown) => this.failed(reason, here),
    )
  }

  /**
   * Draw the step, then say the tour moved, in that order.
   *
   * `draw` hands a lost anchor to `lose`, and a host that handles it keeps the
   * tour on this step, so that path reports the move like any other. A host
   * with no handler gets the ending instead, which reports itself and leaves
   * nothing here to report.
   */
  private arrive(step: S, animate: boolean, story: St, here: object): void {
    // A `stop()` from inside `onEnter`, or one made while a slow one was in
    // flight, left this arrival talking about a tour that is over.
    if (this.position !== here) return
    // The arrival is over and what is left is the drawing of it. Opened before
    // `draw` rather than after, because a step whose anchor turns out to be
    // missing is handed to `onTargetLost`, and a host taking the tour over
    // there has to be able to call `stop()`.
    this.phase = 'ready'
    this.draw(story, step, animate)
    // Which is why this asks. `draw` can end the run through a lost anchor, and
    // a host holding one is free to start a story of its own instead.
    if (this.position !== here) return
    const previous = this.announced
    this.announced = step
    this.report(story, step, previous)
  }

  /**
   * Hand the step to the presenter and wait for it to arrive.
   *
   * `show` handing back nothing means it is already there, and the step is
   * settled in this turn. Where it hands back a promise, only the morph nothing
   * has replaced may call the step settled: a fresh arrival cuts this one short
   * and its promise resolves a moment later, which without {@link showing}
   * would mark the *new* step as done before it had moved.
   */
  private draw(story: St, step: S, animate: boolean): void {
    const here = this.position
    // A target that is not there is handed over all the same. Whether that is
    // an ending or something to wait out is a drawing question, and the
    // presenter says so through `lost` once it has decided.
    const anchor = this.presenter.resolve(step)
    const showing = this.presenter.show(story, step, anchor, this.content(step), animate)
    // `show` is a call into the presenter, and a presenter that cannot find
    // what it needs says so through `lost`, which can end the run before this
    // returns. Calling the step settled after that would put `running` back on
    // a tour that is over.
    if (this.position !== here || !isThenable(showing)) return
    this.phase = 'settling'
    this.showing = showing
    void showing.then(() => {
      if (this.showing !== showing) return
      this.showing = undefined
      // Only the phase this promise put on the machine is its to take off. A
      // target that left the page while the morph ran has written `searching`
      // over it, and that wait ends when the presenter says it does.
      if (this.phase === 'settling') this.phase = 'ready'
    })
  }

  /**
   * An `onEnter` that failed leaves a step assuming a state nobody built, so
   * the tour stops rather than pointing the user at something that is not
   * ready. That is what `lose` decides about an anchor that is not there.
   *
   * The reason is thrown again on its own, because a library that quietly eats
   * an application's exception is why the bug takes a day to find. Throwing it
   * from here instead would land it on whichever call happened to start the
   * step, which is rarely the code that went wrong.
   */
  private failed(reason: unknown, here: object | undefined): void {
    if (this.position === here) this.end(undefined)
    queueMicrotask(() => {
      throw reason
    })
  }

  /**
   * A step whose target is not there and is not coming back.
   *
   * The presenter has already given it time and looked for it again, so by the
   * time this is called there is nothing left to wait for. Pointing a spotlight
   * at nothing is worse than not running at all, so the run ends and there is
   * no hook that can decide otherwise.
   *
   * The step is handed in rather than read from {@link position} so that a
   * watcher still armed on the step before can be told apart from one reporting
   * the step the tour is on. Only the second is about anything.
   *
   * The report goes after the ending rather than before it, so that a host
   * reacting to it by starting a story of its own gets the last word, the way
   * it does from the ending `onStep`.
   */
  /**
   * The presenter is looking for an anchor that left the page, or has found it.
   *
   * The tour is on that step throughout, so this moves no position and reports
   * nothing. All it does is decide what `state` answers while the wait runs,
   * which is the same thing it answers for a target that was missing when the
   * step arrived: the tour is between things.
   *
   * **A wait is only started for the step the tour is on.** A presenter can
   * notice a loss after the tour has already gone somewhere else, the same way
   * {@link lose} can be told about one.
   *
   * **Ending one asks nothing.** By then the tour may be on another step, and
   * the phase the wait wrote is the phase that has to come off. Where it was
   * written over in the meantime there is nothing left to do, which is what the
   * check reads.
   */
  private seek(step: S, yes: boolean): void {
    if (!yes) {
      if (this.phase === 'searching') this.phase = 'ready'
      return
    }
    if (this.step !== step) return
    if (this.phase === 'ready' || this.phase === 'settling') this.phase = 'searching'
  }

  private lose(step: S): void {
    const story = this.position?.story
    if (!story || this.step !== step) return
    this.end(undefined)
    this.options.onDiagnostic?.({ kind: 'target-lost', step, storyId: story.id })
  }
}
