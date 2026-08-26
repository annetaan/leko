import type { MachineState } from './types.js'

/**
 * How far along the machine is with whatever it is doing, and the one thing
 * that decides whether a call from the application is acted on.
 *
 * `story` and `step` are an arrival. Nothing is drawn in either and the anchor
 * has not been looked for; they are two rather than one because the step's
 * `onLeave` is owed in the second and not in the first. `ending` is a run being
 * torn down, with `onLeave` running. `settling` and `ready` are both a step
 * that arrived and is on screen, and differ only in whether the presenter is
 * still moving it. `searching` is a step whose anchor has since left the page:
 * still the step the tour is on, with a curtain over it, which is why it is not
 * `ready`.
 */
export type Phase = 'story' | 'step' | 'ending' | 'settling' | 'searching' | 'ready'

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

/**
 * Everything the machine knows, as one value.
 *
 * Replaced whole rather than written a field at a time, so that a change owing
 * another one cannot land half done. `plan.ts` is the only thing that decides
 * what the next one is, and `machine.ts` holds one of these and nothing else.
 *
 * `S` and `St` are opaque here. Nothing in this file asks what a step is beyond
 * a story holding a list of them, and the anchor type the rest of the machine
 * carries does not reach this far at all.
 */
export interface Core<S, St> {
  /**
   * Every story registered, by id, of which at most one is ever running.
   *
   * State, and not something the shell keeps beside it. `start` reads this and
   * `setStory` writes it, and both of those are decisions. `registered` in
   * `packages/machine/model/machine.qnt` is the same field.
   */
  readonly stories: ReadonlyMap<string, St>
  /**
   * Where the tour is, or `undefined` while nothing is running.
   *
   * One field, because the two things it holds are one fact. Being idle is this
   * being `undefined`, so there is one way to say it. {@link Position} says
   * what its identity is worth.
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
 * Whether a call from the application is acted on at all: a step that is on
 * screen, whether or not it is still moving.
 *
 * DESIGN.md argues the gate under **One gate, and what it refuses**, including
 * why `stop()` is the one call that does not ask.
 */
export const accepting = <S, St>(core: Core<S, St>): boolean =>
  core.phase === 'ready' || core.phase === 'settling' || core.phase === 'searching'

/**
 * Derived, never stored. Two fields hold the whole answer, and reading it off
 * them is a thing that cannot be forgotten. DESIGN.md argues it under
 * **`state` is derived**.
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

/** Whether `at` still names the step the tour is standing on. */
export const stillAt = <S, St>(core: Core<S, St>, at: Position<St> | undefined): boolean =>
  core.position === at

// ------------------------------------------------------------- the two writes
//
// Every other move the machine makes is written where it is decided, which is
// the case it belongs to in `plan.ts`. These two are here because each keeps
// something a spread written out at a call site would let somebody forget.

/** Nothing running, nothing registered, and nothing left over from anything that ran. */
export const idle = <S, St>(): Core<S, St> => ({
  stories: new Map(),
  position: undefined,
  phase: 'ready',
  error: undefined,
  announced: undefined,
  showing: undefined,
})

/**
 * Everything about the run gone, with the phase still closed for the teardown
 * that follows. What separates it from {@link idle} is only that the curtain
 * has not been opened yet, because `onLeave` is about to run behind it.
 *
 * The registry is not part of a run, and is the one thing carried over. Every
 * other field goes, and there is no version of this clearing that forgets one.
 */
export const torn = <S, St>(core: Core<S, St>): Core<S, St> => ({
  ...idle<S, St>(),
  stories: core.stories,
  phase: 'ending',
})

/**
 * `story` is registered under its id, replacing whatever was there.
 *
 * A fresh map every time, so that the identity of {@link Core.stories} is the
 * whole answer to whether a registration took.
 */
export const withStory = <S, St extends { id: string }>(
  core: Core<S, St>,
  story: St,
): Core<S, St> => ({ ...core, stories: new Map(core.stories).set(story.id, story) })
