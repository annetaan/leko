import type { Handoff, MachineState, Problem, World } from './types.js'

// The whole of what the machine knows and what an event does to it. Pure, which
// is what lets `packages/machine/model/machine.qnt` stand for it and a test
// drive it with no world at all; `machine.ts` makes the calls. CLAUDE.md draws
// the line under **Writing code here**.

// -------------------------------------------------------------------- the state

/**
 * Which window the machine is in, and nothing else. `story` and `step` are an
 * arrival, two rather than one because the step's `onLeave` is owed in the
 * second and not the first. `ending` is a teardown. All three last one
 * synchronous call into the application and no longer, because no handler hands
 * anything back to wait for, and `ready` is every other moment there is.
 *
 * DESIGN.md argues the gate this feeds under **One gate, and what it refuses**,
 * and that none of it is about the screen under **Nothing here is about what is
 * on screen**.
 */
export type Phase = 'story' | 'step' | 'ending' | 'ready'

/**
 * Which story a tour is on and where in it. Replaced on every move and never on
 * anything else, so its identity is what every late callback in the machine
 * compares itself against — `packages/machine/model/phases.md` counts the asks.
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
}

/** What the unions below read through, so a member fits on its own line. */
type Step<W extends World> = W['step']
type Story<W extends World> = W['story']

/** Nothing running, and nothing left over from anything that ran. */
export const idle = <W extends World>(): Core<W> => ({
  position: undefined,
  phase: 'ready',
})

/** DESIGN.md argues this under **One gate, and what it refuses**. */
export const accepting = <W extends World>(core: Core<W>): boolean => core.phase === 'ready'

/**
 * Whether a story is running, which is the whole of what a host is told. Derived
 * from the one field that answers it. DESIGN.md, **`state` is derived**.
 */
export const stateOf = <W extends World>(core: Core<W>): MachineState =>
  core.position === undefined ? 'idle' : 'running'

/** The step the tour is standing on, or `undefined` while idle. */
export const stepOf = <W extends World>(core: Core<W>): W['step'] | undefined => {
  const here = core.position
  return here && here.story.steps[here.index]
}

/** Whether `at` still names the step occurrence the tour is standing on. */
const stillAt = <W extends World>(core: Core<W>, at: Position<W>): boolean => core.position === at

/**
 * Whether `url` matches `pattern`, tested from a copy with no `g` or `y` on it.
 * DESIGN.md, **A URL is a signal the page reports**.
 */
export const arrivedAt = (pattern: RegExp, url: string): boolean =>
  new RegExp(pattern.source, pattern.flags.replace(/[gy]/g, '')).test(url)

// ------------------------------------------------------------------- the calls

/**
 * What the machine does to the world, as data. **Nothing in this file makes a
 * call.** `draw` and `validate` are more than one call apiece, because pulling
 * them apart would mean an anchor travelling back through here, and an anchor is
 * resolved, used and dropped.
 */
export type Effect<W extends World> =
  | { kind: 'teardown' }
  /** `resolve` then `show`. Answers with nothing, or `lost` where there is no anchor. */
  | { kind: 'draw'; step: Step<W>; animate: boolean }
  /** The guard said no and the step had words for it. */
  | { kind: 'retell'; step: Step<W>; reason: string }
  | { kind: 'reject' }
  /** `resolve`, `validate`, and the step's `error` where the answer was no. */
  | { kind: 'validate'; at: Position<W>; step: Step<W> }
  /** The story's `next`, asked while the tour still stands on its last step. */
  | { kind: 'chain'; at: Position<W>; story: Story<W> }
  /**
   * The story's `next`, asked while the document is being left — the same
   * ask as `chain`, continued differently.
   */
  | { kind: 'handOn'; at: Position<W>; url: RegExp; story: Story<W> }
  | { kind: 'callStoryEnter'; at: Position<W> }
  | { kind: 'callStepEnter'; at: Position<W>; step: Step<W>; animate: boolean }
  | { kind: 'callStepLeave'; step: Step<W>; next: Step<W> | undefined }
  | { kind: 'callStoryLeave'; story: Story<W>; next: Story<W> | undefined }
  | { kind: 'report'; story: Story<W>; step?: Step<W> }
  | { kind: 'diagnose'; problem: Problem<W> }
  | { kind: 'rethrow'; reason: unknown }
  | { kind: 'keep'; handoff: Handoff }
  | { kind: 'take'; stories: Story<W>[] }

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
  | { kind: 'lost'; step: Step<W> }
  | { kind: 'navigated'; url: string }
  | { kind: 'unloading' }
  | { kind: 'pickUp'; stories: Story<W>[] }
  // --- the machine carrying on, one per window it has to stop at
  /** The `onLeave` calls are done and the report is owed. */
  | { kind: 'left'; story: Story<W>; into?: Story<W>; after: Owed<W> }
  /** The report is done and the story that displaced this one may go up. */
  | { kind: 'startInto'; story: Story<W> }
  /** The report of an ending is done and nothing follows it. Only now does the machine open. */
  | { kind: 'reported' }
  /** The position is on the story's first step and its own `onEnter` is owed. */
  | { kind: 'openStory'; at: Position<W> }
  | { kind: 'storyEntered'; at: Position<W> }
  | { kind: 'entering'; at: Position<W>; leaving: Step<W> | undefined; animate: boolean }
  | { kind: 'stepEntered'; at: Position<W>; animate: boolean }
  | { kind: 'entryFailed'; at: Position<W>; reason: unknown }
  /** The step is on screen and the report of the move is owed. */
  | { kind: 'drawn'; at: Position<W> }
  | { kind: 'validated'; at: Position<W> }
  /** The guard said no, and `reason` is whatever the step's `error` gave back. */
  | { kind: 'refused'; at: Position<W>; reason: string | undefined }
  /** `next` answered, and `into` is the story that follows or nothing. */
  | { kind: 'chained'; at: Position<W>; into: Story<W> | undefined }
  /** `next` answered while the document was being left. */
  | { kind: 'handingOn'; at: Position<W>; url: RegExp; into: Story<W> | undefined }
  /** What a previous document kept, and where this one is now. */
  | {
      kind: 'taken'
      stories: Story<W>[]
      found: { handoff: Handoff; from: string; url: string } | undefined
    }

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

/** `enter`. The phase says the arrival began before any handler is called. */
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
  return { core: { ...core, phase: 'step' }, effects }
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
 * `enterStory`. The story goes up and nothing is drawn for it — DESIGN.md,
 * **Entry runs outermost first, and the ending mirrors it, innermost first**.
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
export function reduce<W extends World>(core: Core<W>, event: Event<W>): Outcome<W> {
  switch (event.kind) {
    // --- what a host calls

    case 'start': {
      if (!accepting(core)) return diagnosing(core, { kind: 'call-refused' })
      const story = event.story
      // **`start` never ends a tour** — DESIGN.md argues it under **Starting a
      // story**.
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
      // Free and silent, permanently. DESIGN.md, **Saying that a call did
      // nothing**.
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
      // Both sides of the seam hold this, doing two different jobs, and
      // DESIGN.md argues that under **The next control**. `reached` still goes
      // through `advance` with such a step — moving it on is exactly its job.
      if (step.awaits !== undefined) return nothing(core)
      return advance(core, step)
    }

    // --- what a presenter reports

    case 'lost': {
      const here = core.position
      // Named rather than read off the position, so a report about a step the
      // tour has moved past is told apart from one about the step it is on.
      if (!here || stepOf(core) !== event.step) return nothing(core)
      return ending(core, undefined, [
        {
          kind: 'diagnose',
          problem: { kind: 'target-lost', step: event.step, story: here.story },
        },
      ])
    }

    case 'navigated': {
      const step = stepOf(core)
      // Every other step ignores this, the same as `reached` reads off `awaits`.
      if (!step || typeof step.awaits !== 'object') return nothing(core)
      const { awaits } = step
      // This file holds no landing URL to compare against, so it cannot itself
      // tell an arrival from a change — DESIGN.md, **A URL is a signal the page
      // reports** says that distinction is made before a report ever reaches
      // here.
      if (!arrivedAt(awaits.url, event.url)) return nothing(core)
      if (!accepting(core)) {
        return diagnosing(core, { kind: 'signal-dropped', name: String(awaits.url), step })
      }
      return advance(core, step)
    }

    case 'unloading': {
      // DESIGN.md, **A page load ends the story, and hands it on**.
      const here = core.position
      const step = stepOf(core)
      if (
        !here ||
        !step ||
        !accepting(core) ||
        here.index !== here.story.steps.length - 1 ||
        typeof step.awaits !== 'object' ||
        here.story.next === undefined
      ) {
        return nothing(core)
      }
      return owing(core, { kind: 'handOn', at: here, url: step.awaits.url, story: here.story })
    }

    case 'pickUp': {
      // The refusal comes before the note is touched, so a `pickUp` from
      // inside a handler leaves the note for the call that will go through.
      if (!accepting(core)) return diagnosing(core, { kind: 'call-refused' })
      return owing(core, { kind: 'take', stories: event.stories })
    }

    // --- the machine carrying on

    case 'left':
      // Every ending stays closed through its own report, so a `start()` made
      // from inside one is refused like any other call made while Leko is
      // inside the application. DESIGN.md, **Saying where the tour got to**.
      return {
        core,
        effects: [{ kind: 'report', story: event.story, step: undefined }, ...event.after],
        next: event.into ? { kind: 'startInto', story: event.into } : { kind: 'reported' },
      }

    case 'startInto':
      return opening(core, event.story)

    case 'reported':
      // Nothing ran in the window, because nothing can: every call the report
      // could make was refused, and `stop()` finds nothing to end.
      return nothing({ ...core, phase: 'ready' })

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
      // `ready` before the draw and not after; there is no way to write it the
      // other way round, and `packages/machine/model/phases.md` says why.
      const ready: Core<W> = { ...core, phase: 'ready' }
      return {
        ...owing(ready, { kind: 'draw', step, animate: event.animate }),
        next: { kind: 'drawn', at: event.at },
      }
    }

    case 'drawn': {
      // The draw can have ended the run, and a host may have started its own.
      const step = stepOf(core)
      if (!stillAt(core, event.at) || !step) return nothing(core)
      return owing(core, { kind: 'report', story: event.at.story, step })
    }

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

    case 'handingOn': {
      // `next` is asked while the document is being left, so a `stop()` from
      // in here leaves nothing standing for `keep` to be owed for.
      if (!stillAt(core, event.at) || event.into === undefined) return nothing(core)
      return owing(core, {
        kind: 'keep',
        handoff: { url: { source: event.url.source, flags: event.url.flags }, into: event.into.id },
      })
    }

    case 'taken': {
      const { found } = event
      if (found === undefined) return nothing(core)
      if (found.url === found.from) return nothing(core)
      // The `from` check reaches the same rule as **Only a change is
      // watched, never an arrival** across the boundary, by a mechanism of
      // its own.
      const pattern = new RegExp(found.handoff.url.source, found.handoff.url.flags)
      if (!arrivedAt(pattern, found.url)) return nothing(core)
      const story = event.stories.find((candidate) => candidate.id === found.handoff.into)
      if (!story) return diagnosing(core, { kind: 'story-unknown', id: found.handoff.into })
      // A continuation, the way `left` continues into `startInto`, so the
      // `start` case is what judges it.
      return { core, effects: [], next: { kind: 'start', story } }
    }

    case 'refused': {
      // `validate` is the application's own code and may have called `stop()`
      // from inside itself, so where the tour got to is asked once more here.
      const step = stepOf(core)
      if (!stillAt(core, event.at) || !step) return nothing(core)
      // Saying no is not optional. Saying why is. DESIGN.md, **A failed
      // attempt**.
      if (event.reason === undefined) return owing(core, { kind: 'reject' })
      return owing(core, { kind: 'reject' }, { kind: 'retell', step, reason: event.reason })
    }
  }
}
