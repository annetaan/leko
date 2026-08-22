import type { Content, Host, Presenter } from './port.js'
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
   * Every story the application has registered, of which at most one is ever
   * running. Held here so that a call site reports a signal once, to the
   * instance, and never has to know how many stories might care.
   */
  private readonly stories = new Map<string, St>()
  /**
   * Which story is running and where in it the tour is, or `undefined` while
   * nothing is running.
   *
   * One field, because the two are one fact. They were `currentStory` and `at`,
   * and every reader had to ask a third field whether the pair meant anything
   * yet. Being idle is this being `undefined`, so there is one way to say it
   * and the three getters below do not each get to decide.
   */
  private position: { story: St; index: number } | undefined
  /*
   * `position`, `preparing` and `settling` are the three fields {@link state}
   * is read from, and each says one thing. Where the tour is. Which `onEnter`
   * is in flight. Whether the presenter is still moving. There is no fourth
   * field holding the answer they add up to, because the day one of them
   * changed without that field being updated is the bug this arrangement
   * exists to prevent.
   */
  /**
   * What the last attempt at the current step was told was wrong with it, set
   * through {@link ErrorUtils.setError}. Held here rather than on the step: it
   * is about one attempt, not about the tour, and the step object belongs to
   * the application.
   */
  private error: string | undefined
  /**
   * The step whose `onEnter` has been called and whose `onLeave` has not. Held
   * rather than worked out from {@link position}, because a step is abandoned part way
   * through entering often enough — a rejection, or a signal arriving while the
   * handler is still in flight — and the cleanup is owed either way.
   */
  private entered: S | undefined
  /**
   * The story whose `onEnter` has been called and whose `onLeave` has not, held
   * for the reason {@link entered} is: a story abandoned while its setup is
   * still in flight is owed its cleanup all the same.
   */
  private enteredStory: St | undefined
  /**
   * Which `onEnter` is in flight, from the call until it settles, and
   * `undefined` when none is. Nothing may be drawn in that window. The anchor
   * is resolved after `onEnter`, so a resize arriving mid-flight would measure
   * a step the tour has not entered yet.
   *
   * Which one it is decides what a call from the host can do. A step in flight
   * holds up the step it is, and `prevStep` may still walk out of it. A story
   * in flight holds up every step it has, so nothing goes anywhere until it
   * settles.
   *
   * The handler that settles clears it, and that handler checks the counter
   * first, so an arrival that was abandoned never gets there. {@link enter}
   * clears it on the way in for that reason: it belongs to the arrival that is
   * running, and the one it replaced has no say in it.
   */
  private preparing: 'story' | 'step' | undefined
  /**
   * The step `onStep` was last told the tour is on, which is not {@link step}: a
   * step whose `onEnter` is still running is where the tour is heading and
   * nowhere a host has heard of. Every `previous` is read from here, so the
   * calls chain — each one leaves from where the last one arrived — and a run
   * that ends before it draws says it came from nowhere.
   */
  private announced: S | undefined
  /**
   * Bumped on every start, every arrival at a step and every stop, so an
   * `onEnter` settling late can tell that it is talking about a step nobody is
   * on any more. A presenter that settles late is dropped by the same counter,
   * which is why {@link Presenter.show} makes no promise about when or whether
   * it settles.
   */
  private generation = 0
  /**
   * Whether the presenter is still moving what it last drew.
   *
   * Set from {@link draw} when `show` hands back something to wait for, and
   * cleared when that settles or when a fresh arrival replaces it. The morph is
   * the only thing this is about; an `onEnter` in flight is {@link preparing}.
   */
  private settling = false

  /**
   * The presenter is built here rather than handed in, because it needs a
   * {@link Host} and only this object can answer one. A factory is the shortest
   * way to close that loop without leaving a window where one exists and the
   * other does not.
   *
   * What goes to the factory is three closures rather than `this`. Handing
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
    })
  }

  /**
   * Derived, never stored.
   *
   * It used to be a field, written at each of the handful of places that knew
   * it had changed. One of them did not know: a target found missing after a
   * slow `onEnter` left `transitioning` on a tour that had finished settling
   * and was never going to settle again, so a host could not tell a slow step
   * from a stuck one. The fix is not another assignment. Three fields already
   * hold the whole answer, and reading it off them is a thing that cannot be
   * forgotten.
   */
  get state(): MachineState {
    if (!this.position) return 'idle'
    return this.preparing || this.settling ? 'transitioning' : 'running'
  }

  /**
   * The story being shown, or `undefined` while idle.
   *
   * This is the object the application registered, not a copy. Reading it is
   * the point: `story.steps.length` is the total a progress readout counts
   * against, and {@link index} is the position within it. Adding to or
   * reordering `steps` while it runs moves the ground under that position.
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
   * render does not accumulate copies of itself. Doing it to the story that is
   * running swaps what the current step is read from and redraws nothing: a
   * re-render must not restart a tour someone is in the middle of.
   */
  setStory(story: St): void {
    this.stories.set(story.id, story)
    const here = this.position
    if (here?.story.id === story.id) this.position = { ...here, story }
  }

  /**
   * Show `storyId`, from its first step or from `at` — a step id or an index.
   *
   * Nothing is torn down until the arguments are known to be good, so a typo
   * cannot end a tour someone is in the middle of. An `at` that is not a whole
   * number in range is such a typo: `steps[1.5]` is nowhere.
   *
   * **Answers whether the story named here is the one now running.** A typo
   * gets `false`, and so does an `at` that names nothing.
   *
   * This is not the silence `reached()` keeps, and the two are different on
   * purpose. A `reached()` call is instrumentation, written where a thing
   * happens and left in builds where no tour runs, so a name nobody awaits has
   * to cost nothing and say nothing. `start()` is a host giving an order. A
   * story id it got wrong is a mistake with no other symptom: nothing happens,
   * and nothing anywhere says why.
   *
   * `false` also comes back where the arguments were good and the tour went
   * elsewhere anyway. Ending the story that was running hands control to the
   * application, and a handler is free to start a story of its own, which wins.
   * The question this answers is the one a caller can act on — is the story I
   * named the one on screen — rather than whether the arguments parsed.
   */
  start(storyId: string, at: string | number = 0): boolean {
    const story = this.stories.get(storyId)
    if (!story) return false
    const index = typeof at === 'string' ? story.steps.findIndex((s) => s.id === at) : at
    if (!Number.isInteger(index) || index < 0 || index >= story.steps.length) return false
    // What is ending is told what is starting, so teardown a branch and the
    // story it rejoins both need can be skipped.
    this.end(story)
    // That ending is somewhere a host can react to by starting a story of its
    // own, and that story is running by the time `end` returns. Carrying on
    // would overwrite it, and it would never report an ending of its own. So
    // the most recent `start` wins, which is the one made with the most
    // information.
    if (this.position) return false
    this.position = { story, index }
    this.enterStory(story)
    // Asked after the fact rather than assumed, because `onEnter` is a call
    // into the application too and can take the tour somewhere else before this
    // returns.
    return this.position?.story === story
  }

  /**
   * Take a story back, and stop the tour if that is the story it is on.
   *
   * The pair to {@link setStory}, and the answer to a `stories` map that only
   * ever grew. A screen that registers a story on mount has somewhere to put
   * the unregister now, and the handlers a story closes over stop being reachable
   * with it.
   *
   * Stopping is the honest thing to do when the running story is the one taken
   * back. The application has said this story no longer exists, and going on
   * showing it would be pointing the user at steps nobody stands behind any
   * more. The ending reports through `onStep` like any other, so a progress
   * readout hears about it.
   *
   * Answers whether there was a story registered under that id.
   */
  deleteStory(storyId: string): boolean {
    const story = this.stories.get(storyId)
    if (!story) return false
    if (this.position?.story.id === storyId) this.stop()
    this.stories.delete(storyId)
    return true
  }

  /**
   * Outermost first: whatever the whole story assumes is built before anything
   * about its first step is, including that step's own `onEnter`.
   *
   * A handler that hands back nothing costs nothing, exactly as a step's does —
   * the first step is entered in the same turn `start()` was called in.
   */
  private enterStory(story: St): void {
    const run = ++this.generation
    this.enteredStory = story
    let entering: unknown
    try {
      entering = story.onEnter?.(story)
    } catch (reason) {
      return this.failed(reason)
    }
    // `onEnter` is a call into the application, and an application is free to
    // start or stop a story from inside one. A handler that answered
    // synchronously has already run, so anything it did bumped the counter past
    // `run`, and entering the first step here would draw it over the top of
    // whatever is running now. The thenable path below asks the same question
    // when it settles.
    if (!isThenable(entering)) {
      if (this.generation !== run) return
      return this.enter(false)
    }

    // Nothing is settled and nothing is drawn, which is what `transitioning`
    // says about the gap between two steps and says as well about this one.
    // Saying it is all `preparing` does now: `state` reads it.
    this.preparing = 'story'
    void entering.then(
      () => {
        if (this.generation !== run) return
        this.preparing = undefined
        this.enter(false)
      },
      (reason: unknown) => {
        if (this.generation !== run) return
        this.preparing = undefined
        this.failed(reason)
      },
    )
  }

  /**
   * Story first, then instance: the same near-to-far order the settings read
   * in. Both fire, because a readout belonging to one story and a counter that
   * spans all of them are different jobs and neither replaces the other.
   *
   * A move is reported only once it has survived being drawn, which is why
   * {@link arrive} asks whether the tour is still on the arrival it started.
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
    if (step?.awaits === name) this.advance(step)
  }

  /**
   * Advance whatever step is showing, without naming it.
   *
   * A no-op while idle, so callers never have to guard.
   */
  nextStep(): void {
    const step = this.step
    if (step) this.advance(step)
  }

  /**
   * It is *not* a no-op mid morph: silently dropping a call would be the
   * library deciding the application did not mean it, which is the guessing it
   * exists to avoid. A morph is a step that arrived and is still moving, and a
   * call during one means what it says.
   *
   * An `onEnter` in flight is the other thing. Nothing that step assumes has
   * been built, its anchor has not been looked for, and it has never been on
   * screen, so there is no step here to advance away from and nothing for
   * `validate` to read. The call is dropped where it stands rather than held
   * until the handler settles: a signal saved over is a step advancing on
   * something that happened before it began.
   */
  private advance(step: S): void {
    if (this.preparing) return
    const here = this.position
    if (!here) return
    const { story, index } = here

    if (step.validate) {
      const anchor = this.presenter.resolve(step)
      if (anchor === null) return this.lose(step)
      if (!step.validate(anchor)) {
        step.onValidationError?.(anchor, this.errorUtils(story, step, anchor))
        return
      }
    }

    if (index >= story.steps.length - 1) {
      this.stop()
      return
    }
    this.position = { story, index: index + 1 }
    this.enter(true)
  }

  /**
   * Step back. Never validates: going back is not a claim of success.
   *
   * A step whose own `onEnter` is in flight is one this can walk out of, and
   * {@link advance} is the call that gets dropped there instead. A story whose
   * `onEnter` is in flight is not. Every step of it is waiting on that handler,
   * so the step behind is no readier than the step ahead.
   */
  prevStep(): void {
    const here = this.position
    if (!here || here.index === 0) return
    if (this.preparing === 'story') return
    this.position = { ...here, index: here.index - 1 }
    this.enter(true)
  }

  /**
   * Reports the ending through the story's `onStep` before returning, with
   * `step` as `undefined`. The host that called this knows already, and
   * whatever draws the progress is written somewhere else and does not.
   *
   * A no-op while idle, so it reports once however many times it is called.
   */
  stop(): void {
    this.end(undefined)
  }

  /**
   * Ending a run, told where the tour is going next so that the story's
   * `onLeave` can be. `next` is a story only when `start()` is displacing this
   * one; every other ending has nowhere to name.
   */
  private end(next: St | undefined): void {
    const story = this.position?.story
    if (!story) return
    const previous = this.announced
    this.generation += 1
    this.preparing = undefined
    this.settling = false
    this.position = undefined
    this.error = undefined
    // Cleared here rather than after the report, because the handlers below can
    // start a story, and the arrival that story announces is where the tour
    // really is by the time this call finishes.
    this.announced = undefined
    this.presenter.teardown()
    // Taken before `leave` runs, because `leave` hands control to the
    // application and a step's `onLeave` is allowed to start a story of its
    // own. That story is entered by the time control comes back, so reading
    // `enteredStory` afterwards would skip this story's `onLeave` and fire the
    // new story's instead, telling a story that just began that its tour is
    // over.
    const entered = this.enteredStory
    this.enteredStory = undefined
    // The step's own cleanup, then the story's, then the readout: innermost
    // first, the mirror of the order they were entered in.
    this.leave(undefined)
    this.leaveStory(entered, next)
    if (story) this.report(story, undefined, previous)
  }

  /**
   * What one failed attempt at `step` is allowed to do about itself.
   *
   * `onValidationError` returns `void`, and a handler is free to look something
   * up and call back afterwards. So each of these checks the counter the way
   * every other callback into the application does. A handler that answers a
   * second late is talking about a step the tour has left, and the words it
   * wrote belong on that step or nowhere.
   *
   * Without the check, a `setError` held that long put the last step's
   * complaint under the current step's instruction, anchored to an element the
   * current step never named.
   *
   * Nothing here writes to the step. The step object belongs to the
   * application, and {@link content} reads `message` off it every time it
   * draws, so an application that edits its own text is seen and Leko never
   * has a copy to go stale.
   */
  private errorUtils(story: St, step: S, anchor: A): ErrorUtils {
    const run = this.generation
    // The attempt is over the moment the tour moves. Every arrival and every
    // stop bumps the counter, and a second failed attempt at the same step
    // bumps nothing, so a step keeps its own utils working for as long as it is
    // the step being attempted.
    const stale = () => this.generation !== run
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
   * Nothing of this step has been measured while its `onEnter` is in flight,
   * and measuring it here would be reading the anchor early by another route.
   */
  private surfaceMoved(): void {
    const here = this.position
    const step = here && here.story.steps[here.index]
    if (!here || !step || this.preparing) return
    this.presenter.place(here.story, step, this.presenter.resolve(step), this.content(step))
  }

  /**
   * Enter `steps[at]`.
   *
   * A handler that hands back nothing costs nothing at all.
   */
  private enter(animate: boolean): void {
    const here = this.position
    const step = here && here.story.steps[here.index]
    if (!here || !step) return this.stop()
    const story = here.story

    // Whatever was wrong with an attempt at the step being left is not an
    // attempt at this one, which is why `setError` has no counterpart to call.
    this.error = undefined
    // Whatever the presenter was moving is not this step's arrival. Leaving it
    // set would have `state` reporting a morph that belongs to the step before.
    this.settling = false
    // The step being replaced may have been waiting on its `onEnter`. Its
    // handler will find the counter has moved and return without clearing this,
    // which would leave a drawn step that no signal can advance. Cleared before
    // `leave` runs, so a story started from inside a handler keeps its own.
    this.preparing = undefined
    // The step being left is over, and the hole is not where it was. There is
    // no honest place for the message until the new cutout has arrived.
    this.presenter.hide()
    const run = ++this.generation
    this.leave(step)
    // Leaving is a call into the application, and an application is free to
    // start or stop a story from inside one. Anything it did bumped the counter
    // past `run`, and carrying on would draw this step over the top of it.
    if (this.generation !== run) return
    this.entered = step
    let entering: unknown
    try {
      entering = step.onEnter?.(step)
    } catch (reason) {
      return this.failed(reason)
    }
    if (!isThenable(entering)) return this.arrive(step, animate, story, run)

    // Between two steps with nothing settled, which is what `transitioning`
    // already means. A morph says the same thing about the same gap.
    this.preparing = 'step'
    void entering.then(
      () => {
        if (this.generation !== run) return
        this.preparing = undefined
        this.arrive(step, animate, story, run)
      },
      (reason: unknown) => {
        if (this.generation !== run) return
        this.preparing = undefined
        this.failed(reason)
      },
    )
  }

  /**
   * Draw the step, then say the tour moved, in that order and only if it is
   * still the arrival that started.
   *
   * `draw` hands a lost anchor to `lose`, and a host that handles it keeps the
   * tour on this step, so that path reports the move like any other. A host
   * with no handler gets a `stop`, which bumps the generation and reports the
   * ending itself.
   */
  private arrive(step: S, animate: boolean, story: St, run: number): void {
    // `onEnter` is the other call into the application that can take the tour
    // somewhere else before anything of this step has been drawn.
    if (this.generation !== run) return
    this.draw(story, step, animate)
    if (this.generation !== run) return
    const previous = this.announced
    // Written before the report goes out, for the reason `entered` is cleared
    // before `onLeave` runs: a handler is free to start a story of its own, and
    // what it does is the later word on where the tour is.
    this.announced = step
    this.report(story, step, previous)
  }

  /**
   * Hand the step to the presenter and wait for it to arrive.
   *
   * `show` handing back nothing means it is already there, and the step is
   * settled in this turn. Where it hands back a promise, only the arrival that
   * is still current may call the step settled: starting another interrupts
   * this one, and without the counter its promise would resolve a moment later
   * and mark the *new* step as done before it had moved.
   */
  private draw(story: St, step: S, animate: boolean): void {
    const anchor = this.presenter.resolve(step)
    if (anchor === null) return this.lose(step)

    const run = this.generation
    const showing = this.presenter.show(story, step, anchor, this.content(step), animate)
    // `show` is a call into the presenter, and a presenter that cannot find
    // what it needs says so through `lost`, which ends the run before this
    // returns. Calling the step settled after that would put `running` back on
    // a tour that is over.
    if (this.generation !== run) return
    if (!isThenable(showing)) return
    this.settling = true
    void showing.then(() => {
      if (this.generation !== run) return
      this.settling = false
    })
  }

  /**
   * Pairs with the step's `onEnter`, once for every call to it. Cleared before
   * the handler runs, so an `onLeave` that calls `stop()` does not come back
   * round to itself.
   */
  private leave(next: S | undefined): void {
    const step = this.entered
    this.entered = undefined
    step?.onLeave?.(step, next)
  }

  /**
   * Pairs with the story's `onEnter`, once for every call to it. The story is
   * handed in rather than read from `enteredStory` here, because `end` has to
   * take it before the step's `onLeave` runs. {@link leave} clears first for
   * the same reason, and can do it in one place because nothing runs between.
   */
  private leaveStory(story: St | undefined, next: St | undefined): void {
    story?.onLeave?.(story, next)
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
  private failed(reason: unknown): void {
    this.stop()
    queueMicrotask(() => {
      throw reason
    })
  }

  /**
   * A step whose anchor is not there. Reached from {@link draw} when the
   * presenter resolves nothing, and from {@link Host.lost} when a presenter
   * notices later. The step is handed in rather than read from
   * {@link position}, because a presenter watching the step it was shown can
   * notice the loss after the tour has started heading somewhere else.
   */
  private lose(step: S): void {
    const story = this.position?.story
    // Whatever the host decides to do about it, the message goes now: its
    // anchor has left the page, and an anchored element whose anchor is gone
    // falls back to wherever normal positioning puts it.
    this.presenter.hide()
    if (story && this.options.onTargetLost) {
      this.options.onTargetLost(step, story.id)
      return
    }
    this.stop()
  }
}
