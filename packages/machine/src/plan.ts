import type { Content, MachineState, Problem, World } from './types.js'

// The whole of what the machine knows and what an event does to it. Nothing
// here calls anything, reads a clock or asks the page, which is what lets
// `packages/machine/model/machine.qnt` stand for it and a test drive it with no
// world at all. `machine.ts` makes the calls and decides nothing.

// -------------------------------------------------------------------- the state

/**
 * How far along the machine is. `story` and `step` are an arrival, two rather
 * than one because the step's `onLeave` is owed in the second and not the
 * first. Both last one synchronous call into the application and no longer,
 * because no handler hands anything back to wait for. `settling` and `ready`
 * are both a step on screen. DESIGN.md argues the gate this feeds under
 * **One gate, and what it refuses**.
 */
export type Phase = 'story' | 'step' | 'ending' | 'settling' | 'ready'

/**
 * Which story a tour is on and where in it. Replaced on every move and never on
 * anything else, so its identity is the step occurrence every late callback in
 * the machine compares itself against.
 */
export interface Position<W extends World> {
  readonly story: W['story']
  readonly index: number
}

/**
 * Everything the machine knows, as one value. DESIGN.md argues each field under
 * **`state` is derived**.
 */
export interface Core<W extends World> {
  /** Where the tour is. Being idle is this being `undefined`. */
  readonly position: Position<W> | undefined
  readonly phase: Phase
  /** What the last attempt at the current step was told was wrong with it. */
  readonly error: string | undefined
  /** Whatever `Presenter.show` last handed back, so a morph settling late can tell. */
  readonly showing: Promise<void> | undefined
}

/** What the unions below read through, so a member fits on its own line. */
type Step<W extends World> = W['step']
type Story<W extends World> = W['story']

/** The one thing a reduction needs that is not state. A setting, not a fact about the tour. */
export interface Config {
  readonly nextLabel: string
}

/** Nothing running, and nothing left over from anything that ran. */
export const idle = <W extends World>(): Core<W> => ({
  position: undefined,
  phase: 'ready',
  error: undefined,
  showing: undefined,
})

/** DESIGN.md argues this under **One gate, and what it refuses**. */
export const accepting = <W extends World>(core: Core<W>): boolean =>
  core.phase === 'ready' || core.phase === 'settling'

/** Derived, never stored. DESIGN.md argues it under **`state` is derived**. */
export const stateOf = <W extends World>(core: Core<W>): MachineState => {
  if (core.position === undefined) return 'idle'
  return core.phase === 'ready' ? 'running' : 'transitioning'
}

/** The step the tour is standing on, or `undefined` while idle. */
export const stepOf = <W extends World>(core: Core<W>): W['step'] | undefined => {
  const here = core.position
  return here && here.story.steps[here.index]
}

/** Whether `at` still names the step occurrence the tour is standing on. */
const stillAt = <W extends World>(core: Core<W>, at: Position<W>): boolean => core.position === at

// ------------------------------------------------------------------- the calls

/**
 * What the machine does to the world, as data. **Nothing in this file makes a
 * call.** `draw` and `validate` are more than one call apiece, because pulling
 * them apart would mean an anchor travelling back through here, and an anchor is
 * resolved, used and dropped.
 */
export type Effect<W extends World> =
  | { kind: 'teardown' }
  /** `resolve` then `show`. Answers with `shown`, or `lost` where there is no anchor. */
  | { kind: 'draw'; at: Position<W>; step: Step<W>; content: Content; animate: boolean }
  /** `resolve` then `place`. Nothing about the tour changed, so nothing answers. */
  | { kind: 'place'; step: Step<W>; content: Content }
  | { kind: 'retell'; step: Step<W>; content: Content }
  | { kind: 'reject' }
  /** `resolve`, `validate`, and the step's `error` where the answer was no. */
  | { kind: 'validate'; at: Position<W>; step: Step<W> }
  /** The story's `next`, asked while the tour still stands on its last step. */
  | { kind: 'chain'; at: Position<W>; story: Story<W> }
  | { kind: 'callStoryEnter'; at: Position<W> }
  | { kind: 'callStepEnter'; at: Position<W>; step: Step<W>; animate: boolean }
  | { kind: 'callStepLeave'; step: Step<W>; next: Step<W> | undefined }
  | { kind: 'callStoryLeave'; story: Story<W>; next: Story<W> | undefined }
  | { kind: 'report'; story: Story<W>; step?: Step<W> }
  | { kind: 'diagnose'; problem: Problem<W> }
  | { kind: 'rethrow'; reason: unknown }

/**
 * Everything that happens to the machine, as data. The first six are calls a
 * host or a presenter makes. The rest are the machine carrying on, one for every
 * window where a call into the application sits between two writes.
 */
export type Event<W extends World> =
  // --- what a host calls, and what a presenter reports
  | { kind: 'start'; story: Story<W> }
  | { kind: 'reached'; name: string }
  | { kind: 'stop' }
  | { kind: 'pressed' }
  | { kind: 'moved' }
  | { kind: 'lost'; step: Step<W> }
  // --- the machine carrying on, one per window it has to stop at
  /** The `onLeave` calls are done and the report is owed. */
  | { kind: 'left'; story: Story<W>; into?: Story<W>; after: Owed<W> }
  /** The report is done and the story that displaced this one may go up. */
  | { kind: 'startInto'; story: Story<W> }
  /** The position is on the story's first step and its own `onEnter` is owed. */
  | { kind: 'openStory'; at: Position<W> }
  | { kind: 'storyEntered'; at: Position<W> }
  | { kind: 'entering'; at: Position<W>; leaving: Step<W> | undefined; animate: boolean }
  | { kind: 'stepEntered'; at: Position<W>; animate: boolean }
  | { kind: 'entryFailed'; at: Position<W>; reason: unknown }
  /** The step is on screen and the report of the move is owed. */
  | { kind: 'drawn'; at: Position<W> }
  | { kind: 'shown'; at: Position<W>; showing: Promise<void> }
  | { kind: 'settled'; showing: Promise<void> }
  | { kind: 'validated'; at: Position<W> }
  /** The guard said no, and `reason` is whatever the step's `error` gave back. */
  | { kind: 'refused'; at: Position<W>; reason: string | undefined }
  /** `next` answered, and `into` is the story that follows or nothing. */
  | { kind: 'chained'; at: Position<W>; into: Story<W> | undefined }

/** `next` is the continuation, dispatched once `effects` have run. */
export interface Outcome<W extends World> {
  readonly core: Core<W>
  readonly effects: Owed<W>
  readonly next?: Event<W>
}

type Owed<W extends World> = readonly Effect<W>[]

// ------------------------------------------------------------------- the moves
//
// What more than one event does, each stopping where the machine hands control
// to the application, and each standing for the `pure def` its doc names in
// `packages/machine/model/machine.qnt`.

const nothing = <W extends World>(core: Core<W>): Outcome<W> => ({ core, effects: [] })

const owing = <W extends World>(core: Core<W>, ...effects: Effect<W>[]): Outcome<W> => ({
  core,
  effects,
})

const diagnosing = <W extends World>(core: Core<W>, problem: Problem<W>): Outcome<W> =>
  owing(core, { kind: 'diagnose', problem })

/** A step that declares a signal never gets a control, and that is the whole rule. */
const content = <W extends World>(core: Core<W>, step: W['step'], config: Config): Content => ({
  text: step.message,
  error: core.error,
  next: step.awaits === undefined ? config.nextLabel : undefined,
})

/**
 * `end`. Empty the machine and take the presenter down, and owe the handlers.
 * `after` is what a lost target and a handler that threw want done after the
 * report.
 */
const ending = <W extends World>(
  core: Core<W>,
  into: W['story'] | undefined,
  after: readonly Effect<W>[],
): Outcome<W> => {
  const here = core.position
  // A no-op while idle, so it reports once however many times it is called.
  if (!here) return { core, effects: after }
  // The step's `onLeave` is owed unless the story's own setup never got as far
  // as entering one. Innermost first, the mirror of how they were entered.
  const step = core.phase === 'story' ? undefined : stepOf(core)
  const effects: Effect<W>[] = [{ kind: 'teardown' }]
  if (step) effects.push({ kind: 'callStepLeave', step, next: undefined })
  effects.push({ kind: 'callStoryLeave', story: here.story, next: into })
  return {
    core: { ...idle<W>(), phase: 'ending' },
    effects,
    next: { kind: 'left', story: here.story, into, after },
  }
}

/**
 * `enter`. The phase says the arrival began before any handler is called, and
 * what belonged to the step being left goes: its failed attempt, and its morph,
 * which now settles onto a promise nothing is holding.
 */
const entering = <W extends World>(
  core: Core<W>,
  at: Position<W>,
  leaving: W['step'] | undefined,
  animate: boolean,
): Outcome<W> => {
  const step = stepOf(core)
  if (!core.position || !step) return ending(core, undefined, [])
  const effects: Effect<W>[] = []
  if (leaving) effects.push({ kind: 'callStepLeave', step: leaving, next: step })
  effects.push({ kind: 'callStepEnter', at, step, animate })
  return { core: { ...core, phase: 'step', error: undefined, showing: undefined }, effects }
}

/**
 * `moveOn`. The half of advancing that happens once the guard has answered.
 *
 * Running out of steps asks the story where the tour goes rather than ending it
 * here, because `next` may be a function and nothing in this file makes a call.
 */
const moveOn = <W extends World>(core: Core<W>, here: Position<W>, step: W['step']): Outcome<W> => {
  if (here.index >= here.story.steps.length - 1) {
    return owing(core, { kind: 'chain', at: here, story: here.story })
  }
  const at: Position<W> = { story: here.story, index: here.index + 1 }
  return {
    core: { ...core, position: at },
    effects: [],
    next: { kind: 'entering', at, leaving: step, animate: true },
  }
}

/** `advance`. A step that declares a signal is not guarded. */
const advance = <W extends World>(core: Core<W>, step: W['step']): Outcome<W> => {
  const here = core.position
  if (!here) return nothing(core)
  if (step.validate && step.awaits === undefined) {
    return owing(core, { kind: 'validate', at: here, step })
  }
  return moveOn(core, here, step)
}

/**
 * `enterStory`. The story goes up, and nothing is drawn for it: the story's own
 * `onEnter` answers in the turn, so the first step is on screen before any
 * frame is painted.
 */
const opening = <W extends World>(core: Core<W>, story: W['story']): Outcome<W> => {
  const at: Position<W> = { story, index: 0 }
  return {
    core: { ...core, position: at },
    effects: [],
    next: { kind: 'openStory', at },
  }
}

// ------------------------------------------------------------------ the events

/** What one event does to the machine, and what the machine owes the world for it. */
export function reduce<W extends World>(
  core: Core<W>,
  event: Event<W>,
  config: Config,
): Outcome<W> {
  switch (event.kind) {
    // --- what a host calls

    case 'start': {
      if (!accepting(core)) return diagnosing(core, { kind: 'call-refused' })
      const story = event.story
      // **`start` never ends a tour.** `stop()` is the way out, and it is the
      // only one, which is what lets a host read this call as one that either
      // puts a story up or does nothing at all. DESIGN.md argues it under
      // **Starting a story**.
      const here = core.position
      if (here) return diagnosing(core, { kind: 'tour-running', story, running: here.story })
      // Asked after the one above, because whether this call can be acted on at
      // all is a fact about the machine and what is in the story only matters
      // once it can be. The empty check used to come first, so that an empty
      // story could not end a tour someone was in the middle of. No `start`
      // ends one now, so the order is free.
      if (story.steps.length === 0) return diagnosing(core, { kind: 'story-empty', story })
      return opening(core, story)
    }

    case 'reached': {
      const step = stepOf(core)
      // Free and silent, permanently: instrumentation stays in builds where no
      // tour ever runs.
      if (step?.awaits !== event.name) return nothing(core)
      // Matched and dropped anyway. The step now waits for ever, and this is the
      // only place anything knows that happened.
      if (!accepting(core)) {
        return diagnosing(core, { kind: 'signal-dropped', name: event.name, step })
      }
      return advance(core, step)
    }

    case 'stop':
      return ending(core, undefined, [])

    case 'pressed': {
      const step = stepOf(core)
      if (!step || !accepting(core)) return nothing(core)
      return advance(core, step)
    }

    // --- what a presenter reports

    case 'moved': {
      // Placed rather than replayed, and never measured mid-arrival.
      const here = core.position
      const step = stepOf(core)
      if (!accepting(core) || !here || !step) return nothing(core)
      return owing(core, { kind: 'place', step, content: content(core, step, config) })
    }

    case 'lost': {
      const here = core.position
      // Named rather than read off the position, so a watcher still armed on the
      // step before is told apart from one reporting this step.
      if (!here || stepOf(core) !== event.step) return nothing(core)
      return ending(core, undefined, [
        {
          kind: 'diagnose',
          problem: { kind: 'target-lost', step: event.step, story: here.story },
        },
      ])
    }

    // --- the machine carrying on

    case 'left':
      // An ending with somewhere to go stays closed through its own report. One
      // with nowhere to go opens first, so a host may start from it.
      return {
        core: event.into ? core : { ...core, phase: 'ready' },
        effects: [{ kind: 'report', story: event.story, step: undefined }, ...event.after],
        next: event.into ? { kind: 'startInto', story: event.into } : undefined,
      }

    case 'startInto':
      return opening(core, event.story)

    case 'openStory':
      // Set before `onEnter` is called, so a handler answering in the turn is
      // inside the window too. No step has been entered, which is how `ending`
      // knows the step's `onLeave` is not owed.
      return owing({ ...core, phase: 'story' }, { kind: 'callStoryEnter', at: event.at })

    case 'storyEntered':
      // A story's own `onEnter` can call `stop()`, and then there is no first
      // step to enter.
      if (!stillAt(core, event.at)) return nothing(core)
      return entering(core, event.at, undefined, false)

    case 'entering':
      return entering(core, event.at, event.leaving, event.animate)

    case 'stepEntered': {
      const step = stepOf(core)
      if (!stillAt(core, event.at) || !step) return nothing(core)
      // Opened before the draw, because a missing anchor can end the run from
      // inside it and the `onStep` reporting that has to find a machine a host
      // may call into.
      const ready: Core<W> = { ...core, phase: 'ready' }
      return {
        ...owing(ready, {
          kind: 'draw',
          at: event.at,
          step,
          content: content(ready, step, config),
          animate: event.animate,
        }),
        next: { kind: 'drawn', at: event.at },
      }
    }

    case 'drawn': {
      // The draw can have ended the run, and a host may have started its own.
      const step = stepOf(core)
      if (!stillAt(core, event.at) || !step) return nothing(core)
      return owing(core, { kind: 'report', story: event.at.story, step })
    }

    case 'shown':
      // `lost` can end the run before `show` returns, and calling the step
      // settled after that would put `running` back on a tour that is over.
      if (!stillAt(core, event.at)) return nothing(core)
      return nothing({ ...core, phase: 'settling', showing: event.showing })

    case 'settled':
      // Only the morph nothing has replaced may call the step settled. The one
      // it replaced settles onto a promise `entering` already let go of, and
      // nothing else writes this field, so the phase this takes off is always
      // the one it put on.
      if (core.showing !== event.showing) return nothing(core)
      return nothing({ ...core, showing: undefined, phase: 'ready' })

    case 'entryFailed': {
      // DESIGN.md, **What a step and a story assume**: the reason is thrown
      // again, because the handler that threw is the place with the context.
      const rethrow: Effect<W>[] = [{ kind: 'rethrow', reason: event.reason }]
      if (!stillAt(core, event.at)) return { core, effects: rethrow }
      return ending(core, undefined, rethrow)
    }

    case 'validated': {
      const step = stepOf(core)
      if (!stillAt(core, event.at) || !step) return nothing(core)
      return moveOn(core, event.at, step)
    }

    case 'chained': {
      // `next` is the application's own code and may have called `stop()` from
      // inside itself, so where the tour got to is asked once more here.
      if (!stillAt(core, event.at)) return nothing(core)
      return ending(core, event.into, [])
    }

    case 'refused': {
      // `validate` is the application's own code and may have called `stop()`
      // from inside itself, so where the tour got to is asked once more here.
      const step = stepOf(core)
      if (!stillAt(core, event.at) || !step) return nothing(core)
      // Saying no is not optional. Saying why is. A step with a guard and no
      // words still refuses out loud, because a control that sometimes did
      // nothing would be worse than no control.
      if (event.reason === undefined) return owing(core, { kind: 'reject' })
      const said: Core<W> = { ...core, error: event.reason }
      return owing(
        said,
        { kind: 'reject' },
        { kind: 'retell', step, content: content(said, step, config) },
      )
    }
  }
}
