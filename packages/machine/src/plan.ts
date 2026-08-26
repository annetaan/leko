import {
  arrivedAt,
  accepting,
  type Core,
  failing,
  found,
  heldForStep,
  heldForStory,
  movedTo,
  opened,
  type Position,
  seeking,
  settled,
  settling,
  stepOf,
  stillAt,
  torn,
} from './core.js'
import type { Content } from './port.js'
import type { Problem, StepBase, StoryBase } from './types.js'

/**
 * What the machine does to the world, as data.
 *
 * Everything here is a call out of the machine: into the presenter, into the
 * application, or into the host's diagnostics. **Nothing in this file makes
 * one.** {@link reduce} says which are owed and in what order, and the shell in
 * `machine.ts` is the only thing that calls anything.
 *
 * Three of them are more than one call, because the machine has never wanted
 * the pieces apart. `draw` resolves the anchor and hands it to `show` in the
 * same breath, and `validate` resolves, asks and tells the handler. Splitting
 * them would mean an anchor travelling back through here, and an anchor is
 * resolved, used and dropped.
 */
export type Effect<A, S extends StepBase<A, S>, St extends StoryBase<A, S, St>> =
  | { kind: 'register'; story: St }
  | { kind: 'hold'; story: St; step: S | undefined }
  | { kind: 'teardown' }
  /** `resolve` then `show`. Answers with `shown`, or with `lost` where there is no anchor. */
  | { kind: 'draw'; at: Position<St>; story: St; step: S; content: Content; animate: boolean }
  /** `resolve` then `place`. Nothing about the tour changed, so nothing answers. */
  | { kind: 'place'; story: St; step: S; content: Content }
  | { kind: 'retell'; story: St; step: S; anchor: A; content: Content }
  | { kind: 'reject' }
  /** `resolve`, `validate`, and `onValidationError` where the answer was no. */
  | { kind: 'validate'; at: Position<St>; story: St; step: S }
  | { kind: 'callStoryEnter'; at: Position<St>; story: St }
  | { kind: 'callStepEnter'; at: Position<St>; step: S; animate: boolean }
  | { kind: 'callStepLeave'; step: S; next: S | undefined }
  | { kind: 'callStoryLeave'; story: St; next: St | undefined }
  | { kind: 'report'; story: St; step: S | undefined; previous: S | undefined }
  | { kind: 'diagnose'; problem: Problem<S> }
  | { kind: 'rethrow'; reason: unknown }

/**
 * Everything that happens to the machine, as data.
 *
 * The first eight are calls a host or a presenter makes. The rest are the
 * machine carrying on with something it began, and there is one for every place
 * a field is written on both sides of a call into the application. Those are the
 * windows the phase gate exists for, and an event apiece is what keeps a
 * reduction from spanning one.
 */
export type Event<A, S extends StepBase<A, S>, St extends StoryBase<A, S, St>> =
  // --- what a host calls, and what a presenter reports
  | { kind: 'setStory'; story: St }
  | { kind: 'start'; storyId: string }
  | { kind: 'reached'; name: string }
  | { kind: 'stop' }
  | { kind: 'pressed' }
  | { kind: 'moved' }
  | { kind: 'lost'; step: S }
  | { kind: 'searching'; step: S; yes: boolean }
  // --- the machine carrying on
  /** The `onLeave` calls are done and the report is owed. */
  | {
      kind: 'left'
      story: St
      previous: S | undefined
      into: St | undefined
      after: readonly Effect<A, S, St>[]
    }
  /** The report is done and the story that displaced this one may go up. */
  | { kind: 'startInto'; story: St }
  /** The curtain is up for a story and its own `onEnter` is owed. */
  | { kind: 'openStory'; at: Position<St> }
  | { kind: 'storyEntered'; at: Position<St> }
  /** Enter the step `position` names, leaving whatever the tour was standing on. */
  | { kind: 'entering'; at: Position<St>; leaving: S | undefined; animate: boolean }
  | { kind: 'stepEntered'; at: Position<St>; animate: boolean }
  | { kind: 'entryFailed'; at: Position<St>; reason: unknown }
  /** The step is on screen and the report of the move is owed. */
  | { kind: 'drawn'; at: Position<St> }
  | { kind: 'shown'; at: Position<St>; showing: Promise<void> }
  | { kind: 'settled'; showing: Promise<void> }
  | { kind: 'validated'; at: Position<St> }
  | { kind: 'setError'; attempt: Position<St>; story: St; step: S; anchor: A; message: string }
  | { kind: 'shake'; attempt: Position<St> }

/**
 * What one event does.
 *
 * `next` is the machine's own continuation, dispatched once `effects` have run.
 * It is how a reduction stops at a window instead of spanning it: everything
 * before the call into the application is here, and everything after it is in
 * the event named there.
 */
export interface Outcome<A, S extends StepBase<A, S>, St extends StoryBase<A, S, St>> {
  readonly core: Core<S, St>
  readonly effects: readonly Effect<A, S, St>[]
  readonly next?: Event<A, S, St>
}

/** The two things a reduction needs that are not state. */
export interface Look<A, S extends StepBase<A, S>, St extends StoryBase<A, S, St>> {
  /** What `setStory` has registered, by id. */
  story(id: string): St | undefined
  /** The words on a next control, where a step gets one. */
  readonly nextLabel: string
}

// ------------------------------------------------------------------- reading

const nothing = <A, S extends StepBase<A, S>, St extends StoryBase<A, S, St>>(
  core: Core<S, St>,
): Outcome<A, S, St> => ({ core, effects: [] })

/** Everything the box beside the cutout should be showing for this step. */
const content = <A, S extends StepBase<A, S>, St extends StoryBase<A, S, St>>(
  core: Core<S, St>,
  step: S,
  look: Look<A, S, St>,
): Content => ({
  text: step.message,
  error: core.error,
  // A step that declares a signal never gets a control, and that is the whole
  // rule. Nothing a story can write turns it back on.
  next: step.awaits === undefined ? look.nextLabel : undefined,
})

// ------------------------------------------------------------- the machinery
//
// One per method in `machine.ts`, in the order the calls nest, and each one
// stopping where the machine hands control to the application.

/**
 * `Machine.end`. Empty the machine and take the presenter down, and owe the
 * handlers.
 *
 * `after` is what the caller wants done once the report has gone out. Only two
 * things ever want that: a lost target says so through `onDiagnostic`, and a
 * handler that threw has its reason thrown again on its own.
 */
const ending = <A, S extends StepBase<A, S>, St extends StoryBase<A, S, St>>(
  core: Core<S, St>,
  into: St | undefined,
  after: readonly Effect<A, S, St>[],
): Outcome<A, S, St> => {
  const here = core.position
  // A no-op while idle, so it reports once however many times it is called.
  if (!here) return { core, effects: after }
  const previous = core.announced
  // The step's `onLeave` is owed unless the story's own setup never got as far
  // as entering one.
  const step = core.phase === 'story' ? undefined : stepOf(core)
  const effects: Effect<A, S, St>[] = [{ kind: 'teardown' }]
  // The step's own cleanup, then the story's: innermost first, the mirror of
  // the order they were entered in.
  if (step) effects.push({ kind: 'callStepLeave', step, next: undefined })
  effects.push({ kind: 'callStoryLeave', story: here.story, next: into })
  return {
    core: torn(),
    effects,
    next: { kind: 'left', story: here.story, previous, into, after },
  }
}

/** `Machine.enter`. Enter the step `position` now names. */
const entering = <A, S extends StepBase<A, S>, St extends StoryBase<A, S, St>>(
  core: Core<S, St>,
  at: Position<St>,
  leaving: S | undefined,
  animate: boolean,
): Outcome<A, S, St> => {
  const step = stepOf(core)
  if (!core.position || !step) return ending(core, undefined, [])
  const effects: Effect<A, S, St>[] = [{ kind: 'hold', story: at.story, step }]
  if (leaving) effects.push({ kind: 'callStepLeave', step: leaving, next: step })
  effects.push({ kind: 'callStepEnter', at, step, animate })
  return { core: heldForStep(core), effects }
}

/** The half of `Machine.advance` after the guard. */
const moveOn = <A, S extends StepBase<A, S>, St extends StoryBase<A, S, St>>(
  core: Core<S, St>,
  here: Position<St>,
  step: S,
): Outcome<A, S, St> => {
  if (here.index >= here.story.steps.length - 1) return ending(core, undefined, [])
  const moved = movedTo(core, here.story, here.index + 1)
  return {
    core: moved,
    effects: [],
    next: { kind: 'entering', at: moved.position!, leaving: step, animate: true },
  }
}

/**
 * `Machine.advance`.
 *
 * A step that declares a signal is not guarded. The application has already
 * said the thing happened, and reading the page to check would be a second
 * source of truth for the same question.
 */
const advance = <A, S extends StepBase<A, S>, St extends StoryBase<A, S, St>>(
  core: Core<S, St>,
  step: S,
): Outcome<A, S, St> => {
  const here = core.position
  if (!here) return nothing(core)
  if (step.validate && step.awaits === undefined) {
    return { core, effects: [{ kind: 'validate', at: here, story: here.story, step }] }
  }
  return moveOn(core, here, step)
}

/** The story goes up: the position first, then the curtain. */
const opening = <A, S extends StepBase<A, S>, St extends StoryBase<A, S, St>>(
  core: Core<S, St>,
  story: St,
): Outcome<A, S, St> => {
  const moved = movedTo(core, story, 0)
  return {
    core: moved,
    effects: [{ kind: 'hold', story, step: undefined }],
    next: { kind: 'openStory', at: moved.position! },
  }
}

// ---------------------------------------------------------------- the events

/**
 * What one event does to the machine, and what the machine owes the world
 * because of it.
 *
 * **Pure.** Nothing here calls anything, reads a clock or asks the page. Given
 * the same core and the same event it answers the same way, which is what lets
 * `packages/machine/model/machine.qnt` stand for it and a test drive it with no
 * world at all.
 */
export function reduce<A, S extends StepBase<A, S>, St extends StoryBase<A, S, St>>(
  core: Core<S, St>,
  event: Event<A, S, St>,
  look: Look<A, S, St>,
): Outcome<A, S, St> {
  switch (event.kind) {
    // --- what a host calls

    case 'setStory': {
      if (!accepting(core)) {
        return {
          core,
          effects: [{ kind: 'diagnose', problem: { kind: 'call-refused', call: 'setStory' } }],
        }
      }
      // A call naming the story the tour is on does nothing, so a component
      // re-registering on every render cannot move the ground under a user.
      // Not a diagnostic either: that render is the case the rule is for.
      if (core.position?.story.id === event.story.id) return nothing(core)
      return { core, effects: [{ kind: 'register', story: event.story }] }
    }

    case 'start': {
      if (!accepting(core)) {
        return {
          core,
          effects: [{ kind: 'diagnose', problem: { kind: 'call-refused', call: 'start' } }],
        }
      }
      const story = look.story(event.storyId)
      // Nothing is torn down until the id is known to be good, so a typo cannot
      // end a tour someone is in the middle of.
      if (!story) {
        return {
          core,
          effects: [
            { kind: 'diagnose', problem: { kind: 'story-not-found', storyId: event.storyId } },
          ],
        }
      }
      if (story.steps.length === 0) {
        return {
          core,
          effects: [{ kind: 'diagnose', problem: { kind: 'story-empty', storyId: event.storyId } }],
        }
      }
      // What is ending is told what is starting, so the teardown and the story
      // it rejoins are one operation from out here.
      if (core.position) return ending(core, story, [])
      return opening(core, story)
    }

    case 'reached': {
      const step = stepOf(core)
      // An unmatched signal is free and silent, permanently, because
      // instrumentation has to stay in a build where no tour ever runs.
      if (step?.awaits !== event.name) return nothing(core)
      // Matched, and dropped anyway. A step waiting for a name the application
      // has already reported waits for ever, and this is the only place
      // anything knows that happened.
      if (!accepting(core)) {
        return {
          core,
          effects: [
            { kind: 'diagnose', problem: { kind: 'signal-dropped', name: event.name, step } },
          ],
        }
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
      // Nothing about the tour changed, so the step is placed rather than
      // replayed. Nothing of it has been measured while it is still arriving.
      if (!accepting(core)) return nothing(core)
      const here = core.position
      const step = stepOf(core)
      if (!here || !step) return nothing(core)
      return {
        core,
        effects: [{ kind: 'place', story: here.story, step, content: content(core, step, look) }],
      }
    }

    case 'lost': {
      const here = core.position
      // The step is named rather than read off the position, so a watcher still
      // armed on the step before can be told apart from one reporting the step
      // the tour is on.
      if (!here || stepOf(core) !== event.step) return nothing(core)
      return ending(core, undefined, [
        {
          kind: 'diagnose',
          problem: { kind: 'target-lost', step: event.step, storyId: here.story.id },
        },
      ])
    }

    case 'searching':
      return { core: event.yes ? seeking(core, event.step) : found(core), effects: [] }

    // --- the machine carrying on

    case 'left': {
      // An ending with somewhere to go stays closed through its own report. One
      // with nowhere to go opens first, so a host is free to start a story from
      // it.
      const curtain = event.into ? core : opened(core)
      return {
        core: curtain,
        effects: [
          { kind: 'report', story: event.story, step: undefined, previous: event.previous },
          ...event.after,
        ],
        next: event.into ? { kind: 'startInto', story: event.into } : undefined,
      }
    }

    case 'startInto':
      return opening(core, event.story)

    case 'openStory':
      // Set before `onEnter` is called rather than after, so a handler answering
      // in the turn is inside the window too. No step has been entered yet, and
      // this phase is how `ending` knows the step's `onLeave` is not owed.
      return {
        core: heldForStory(core),
        effects: [{ kind: 'callStoryEnter', at: event.at, story: event.at.story }],
      }

    case 'storyEntered':
      // `stop()` walks out of an arrival, and a story's own `onEnter` is a
      // handler that can make the call. There is no first step to enter then.
      if (!stillAt(core, event.at)) return nothing(core)
      return entering(core, event.at, undefined, false)

    case 'entering':
      return entering(core, event.at, event.leaving, event.animate)

    case 'stepEntered': {
      if (!stillAt(core, event.at)) return nothing(core)
      const step = stepOf(core)
      if (!step) return nothing(core)
      // The arrival is over and what is left is the drawing of it. Opened before
      // the draw rather than after, because a step whose anchor turns out to be
      // missing can end the run from inside it, and the `onStep` that reports
      // that ending has to find a machine a host may call into.
      const ready = opened(core)
      return {
        core: ready,
        effects: [
          {
            kind: 'draw',
            at: event.at,
            story: event.at.story,
            step,
            content: content(ready, step, look),
            animate: event.animate,
          },
        ],
        next: { kind: 'drawn', at: event.at },
      }
    }

    case 'drawn': {
      // The draw can end the run through a lost anchor, and a host holding one
      // is free to start a story of its own instead.
      if (!stillAt(core, event.at)) return nothing(core)
      const step = stepOf(core)
      if (!step) return nothing(core)
      const previous = core.announced
      return {
        core: arrivedAt(core, step),
        effects: [{ kind: 'report', story: event.at.story, step, previous }],
      }
    }

    case 'shown':
      // A presenter that cannot find what it needs says so through `lost`, which
      // can end the run before `show` returns. Calling the step settled after
      // that would put `running` back on a tour that is over.
      if (!stillAt(core, event.at)) return nothing(core)
      return { core: settling(core, event.showing), effects: [] }

    case 'settled':
      // Only the morph nothing has replaced may call the step settled.
      if (core.showing !== event.showing) return nothing(core)
      return { core: settled(core), effects: [] }

    case 'entryFailed': {
      // The reason is thrown again on its own, because a library that quietly
      // eats an application's exception is why the bug takes a day to find.
      const rethrow: Effect<A, S, St>[] = [{ kind: 'rethrow', reason: event.reason }]
      if (!stillAt(core, event.at)) return { core, effects: rethrow }
      return ending(core, undefined, rethrow)
    }

    case 'validated': {
      if (!stillAt(core, event.at)) return nothing(core)
      const step = stepOf(core)
      if (!step) return nothing(core)
      return moveOn(core, event.at, step)
    }

    case 'setError': {
      // The words belong on the attempt they were written about. A handler that
      // looked something up and answered a second later writes nothing.
      if (!stillAt(core, event.attempt)) return nothing(core)
      const said = failing(core, event.message)
      return {
        core: said,
        effects: [
          {
            kind: 'retell',
            story: event.story,
            step: event.step,
            anchor: event.anchor,
            content: content(said, event.step, look),
          },
        ],
      }
    }

    case 'shake':
      if (!stillAt(core, event.attempt)) return nothing(core)
      return { core, effects: [{ kind: 'reject' }] }
  }
}
