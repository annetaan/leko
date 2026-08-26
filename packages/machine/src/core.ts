import type { MachineState } from './types.js'

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
export type Phase = 'story' | 'step' | 'ending' | 'settling' | 'searching' | 'ready'

/**
 * Where a tour is, as one value.
 *
 * Five fields, replaced together rather than written one at a time, so that a
 * change owing another one cannot land half done. `end` used to clear four of
 * them in four statements. It calls {@link torn} now, and there is no version
 * of that clearing which forgets one.
 *
 * `S` and `St` are opaque here. Nothing in this file asks what a step is. The
 * anchor type the rest of the machine carries does not reach this far either,
 * because an anchor is resolved, handed to the presenter and never held.
 *
 * The definitions below stand one for one with the `pure def`s in
 * `packages/machine/model/machine.qnt` and carry the same names where the model
 * has one. A search walks the model. A reader can see which function it walked.
 */
/**
 * Which story a tour is on and where in it, as one object.
 *
 * The object is replaced rather than edited on every move, and never on
 * anything else, so its identity is the step occurrence the tour is standing
 * on. Every late callback in the machine compares against it.
 */
export interface Position<St> {
  readonly story: St
  readonly index: number
}

export interface Core<S, St> {
  /**
   * Where the tour is, or `undefined` while nothing is running.
   *
   * One field, because the two things it holds are one fact. Being idle is this
   * being `undefined`, so there is one way to say it. {@link Position} says what
   * its identity is worth.
   */
  readonly position: Position<St> | undefined
  readonly phase: Phase
  /**
   * What the last attempt at the current step was told was wrong with it, set
   * through `ErrorUtils.setError`. Held here rather than on the step: it is
   * about one attempt, not about the tour, and the step object belongs to the
   * application.
   */
  readonly error: string | undefined
  /**
   * The step `onStep` was last told the tour is on, which is not the step the
   * tour is on: a step whose `onEnter` is still running is where the tour is
   * heading and nowhere a host has heard of. Every `previous` is read from
   * here, so the calls chain — each one leaves from where the last one arrived
   * — and a run that ends before it draws says it came from nowhere.
   */
  readonly announced: S | undefined
  /**
   * Whatever `Presenter.show` last handed back, so that a morph settling after
   * it was interrupted can tell. The morph is the one thing here a fresh
   * arrival is allowed to cut short, which is why it is the one thing that
   * needs this.
   */
  readonly showing: Promise<void> | undefined
}

// ------------------------------------------------------------------- reading

/**
 * Whether a call from the application is acted on at all.
 *
 * **The machine never accepts a call while it is inside a call into the
 * application.** An `onEnter` in flight is inside one, whether it answered
 * synchronously or handed back a promise that lands half a second later. So is
 * an `onLeave` running as a tour is torn down.
 *
 * A step that is drawn and still moving is the other thing. It has been
 * through the whole arrival and the user is looking at it, so a call about it
 * means what it says and goes through.
 *
 * **`stop()` does not ask.** A tour that cannot be turned off until an
 * `onEnter` somebody else wrote decides to settle is worse than any race this
 * keeps out, and a component unmounting mid-arrival has nowhere else to go.
 * Ending a run is also the one thing that needs nothing of the arrival: it
 * throws the arrival away rather than acting on it.
 */
export const accepting = <S, St>(core: Core<S, St>): boolean =>
  core.phase === 'ready' || core.phase === 'settling' || core.phase === 'searching'

/**
 * Derived, never stored.
 *
 * It used to be a field, written at each of the handful of places that knew it
 * had changed. One of them did not know: a target found missing after a slow
 * `onEnter` left `transitioning` on a tour that had finished settling and was
 * never going to settle again, so a host could not tell a slow step from a
 * stuck one. The fix is not another assignment. Two fields hold the whole
 * answer, and reading it off them is a thing that cannot be forgotten.
 */
export const stateOf = <S, St>(core: Core<S, St>): MachineState => {
  if (core.position === undefined) return 'idle'
  return core.phase === 'ready' ? 'running' : 'transitioning'
}

/**
 * The step the tour is standing on, or `undefined` while idle.
 *
 * A story is asked for its steps rather than for anything else, which is the
 * whole of what this file needs a story to be.
 */
export const stepOf = <S, St extends { steps: S[] }>(core: Core<S, St>): S | undefined => {
  const here = core.position
  return here && here.story.steps[here.index]
}

// --------------------------------------------------------------- the moves
//
// One per state change the machine makes, in the order the calls nest.

/** Nothing running, and nothing left over from anything that ran. */
export const idle = <S, St>(): Core<S, St> => ({
  position: undefined,
  phase: 'ready',
  error: undefined,
  announced: undefined,
  showing: undefined,
})

/**
 * `end`. Everything about the run gone, with the phase still closed for the
 * teardown that follows.
 *
 * It takes no core, which is the fact worth seeing: an ending keeps nothing.
 * What separates it from {@link idle} is only that the curtain has not been
 * opened yet, because `onLeave` is about to run behind it.
 */
export const torn = <S, St>(): Core<S, St> => ({ ...idle<S, St>(), phase: 'ending' })

/**
 * The curtain comes up: an ending with nowhere to go, or a step that has
 * finished arriving and is about to be drawn.
 */
export const opened = <S, St>(core: Core<S, St>): Core<S, St> => ({ ...core, phase: 'ready' })

/**
 * `hold(story, undefined)`. The story's own arrival, before any step of it
 * exists. No step has been entered yet, and this phase is how `end` knows the
 * step's `onLeave` is not owed.
 */
export const heldForStory = <S, St>(core: Core<S, St>): Core<S, St> => ({ ...core, phase: 'story' })

/**
 * `hold(story, step)`. A step's arrival.
 *
 * Whatever was wrong with an attempt at the step being left is not an attempt
 * at this one, which is why `setError` has no counterpart to call. And whatever
 * the presenter was moving is not this step's arrival: a morph settling after
 * this reads a promise nothing is holding any more.
 */
export const heldForStep = <S, St>(core: Core<S, St>): Core<S, St> => ({
  ...core,
  phase: 'step',
  error: undefined,
  showing: undefined,
})

/** The tour stands on a step. A fresh object every time, and on nothing else. */
export const movedTo = <S, St>(core: Core<S, St>, story: St, index: number): Core<S, St> => ({
  ...core,
  position: { story, index },
})

/** Whether `at` still names the step the tour is standing on. */
export const stillAt = <S, St>(core: Core<S, St>, at: Position<St> | undefined): boolean =>
  core.position === at

/** `onStep` has been told where the tour got to. */
export const arrivedAt = <S, St>(core: Core<S, St>, step: S): Core<S, St> => ({
  ...core,
  announced: step,
})

/** The step is drawn, and the presenter is still moving it. */
export const settling = <S, St>(core: Core<S, St>, showing: Promise<void>): Core<S, St> => ({
  ...core,
  phase: 'settling',
  showing,
})

/**
 * The morph landed.
 *
 * **Only the phase this promise put on the machine is its to take off.** A
 * target that left the page while the morph ran has written `searching` over
 * it, and that wait ends when the presenter says it does.
 */
export const settled = <S, St>(core: Core<S, St>): Core<S, St> => ({
  ...core,
  showing: undefined,
  phase: core.phase === 'settling' ? 'ready' : core.phase,
})

/** What one failed attempt at the current step was told was wrong with it. */
export const failing = <S, St>(core: Core<S, St>, message: string): Core<S, St> => ({
  ...core,
  error: message,
})

/**
 * The presenter has lost an anchor and is looking for it again.
 *
 * **A wait is only started for the step the tour is on**, and only over a phase
 * that says that step is on screen. A presenter can notice a loss after the
 * tour has already gone somewhere else.
 */
export const seeking = <S, St extends { steps: S[] }>(core: Core<S, St>, step: S): Core<S, St> => {
  if (stepOf(core) !== step) return core
  if (core.phase !== 'ready' && core.phase !== 'settling') return core
  return { ...core, phase: 'searching' }
}

/**
 * The presenter has it again.
 *
 * **Ending a wait asks nothing.** By then the tour may be on another step, and
 * the phase the wait wrote is the phase that has to come off. Where it was
 * written over in the meantime there is nothing left to do.
 */
export const found = <S, St>(core: Core<S, St>): Core<S, St> =>
  core.phase === 'searching' ? { ...core, phase: 'ready' } : core
