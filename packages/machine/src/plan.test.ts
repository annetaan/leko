import { describe, expect, test } from 'vitest'

import type { Fixture, Step, Story } from './fake.js'
import {
  accepting,
  type Config,
  type Core,
  type Effect,
  type Event,
  idle,
  type Outcome,
  type Phase,
  type Position,
  reduce,
  stateOf,
  stepOf,
} from './plan.js'

// The state, how it is read, and what every event does to it, with no world at
// all. `machine.test.ts` drives a real presenter and asks what happened. This
// asks what was owed.

type C = Core<Fixture>
type E = Effect<Fixture>

const first: Step = { id: 'a', target: 'first', message: 'do the thing' }
const second: Step = { id: 'b', target: 'second' }
const story: Story = { id: 'tour', steps: [first, second] }
const other: Story = { id: 'other', steps: [{ id: 'c', target: 'third' }] }
const empty: Story = { id: 'empty', steps: [] }

const config: Config = { nextLabel: 'Next' }

/** Nothing running. */
const nothing = (): C => idle<Fixture>()

const at = (index: number): Position<Fixture> => ({ story, index })

/** A tour standing on `index`, drawn and settled. */
const running = (index = 0, over: Partial<C> = {}): C => ({
  ...nothing(),
  position: at(index),
  announced: story.steps[index],
  ...over,
})

const put = (core: C, event: Event<Fixture>): Outcome<Fixture> => reduce(core, event, config)

/** Every effect an outcome owes, by kind, in order. */
const owed = (outcome: Outcome<Fixture>): string[] => outcome.effects.map((e) => e.kind)

const PHASES: Phase[] = ['story', 'step', 'ending', 'settling', 'searching', 'ready']

describe('reading the state', () => {
  test('a call is acted on where the step is on screen and nowhere else', () => {
    const answers = Object.fromEntries(
      PHASES.map((phase) => [phase, accepting(running(0, { phase }))]),
    )

    expect(answers).toEqual({
      ready: true,
      settling: true,
      searching: true,
      story: false,
      step: false,
      ending: false,
    })
  })

  test('idle is the position being empty, whatever the phase says', () => {
    for (const phase of PHASES) expect(stateOf({ ...nothing(), phase })).toBe('idle')
  })

  test('running is the one phase where the step arrived and stopped moving', () => {
    const answers = Object.fromEntries(
      PHASES.map((phase) => [phase, stateOf(running(0, { phase }))]),
    )

    // `settling` and `searching` are both a step on screen, and a host standing
    // back while the tour is between things has to hear about them.
    expect(answers).toEqual({
      ready: 'running',
      settling: 'transitioning',
      searching: 'transitioning',
      story: 'transitioning',
      step: 'transitioning',
      ending: 'transitioning',
    })
  })

  test('stepOf reads the step the position names, and nothing past the end', () => {
    expect(stepOf(running(1))).toBe(second)
    expect(stepOf(running(2))).toBeUndefined()
    expect(stepOf(nothing())).toBeUndefined()
  })
})

describe('an ending', () => {
  test('empties the machine before it owes anybody anything', () => {
    const before = running()

    const outcome = put(before, { kind: 'stop' })

    // The state is the first thing in the outcome and the handlers are in the
    // second. Nothing can read `position` from an `onLeave` and find a tour.
    expect(outcome.core.position).toBeUndefined()
    expect(outcome.core.phase).toBe('ending')
    expect(owed(outcome)).toEqual(['teardown', 'callStepLeave', 'callStoryLeave'])
  })

  test('owes the step its cleanup before the story, and the story last of all', () => {
    const outcome = put(running(), { kind: 'stop' })
    const [, step, tale] = outcome.effects

    expect(step).toEqual({ kind: 'callStepLeave', step: first, next: undefined })
    expect(tale).toEqual({ kind: 'callStoryLeave', story, next: undefined })
  })

  test('owes the step nothing where the story never got as far as one', () => {
    // The story's own `onEnter` threw, so no step was ever entered.
    const outcome = put(running(0, { phase: 'story' }), { kind: 'stop' })

    expect(owed(outcome)).toEqual(['teardown', 'callStoryLeave'])
  })

  test('does nothing at all while idle, however many times it is asked', () => {
    const outcome = put(nothing(), { kind: 'stop' })

    expect(outcome.core).toEqual(nothing())
    expect(outcome.effects).toEqual([])
    expect(outcome.next).toBeUndefined()
  })

  test('opens the curtain before its report where nothing follows it', () => {
    const torn = put(running(), { kind: 'stop' })
    const outcome = put(torn.core, torn.next!)

    // A host is free to start a story from that report, and `branching.ts`
    // rejoins that way.
    expect(outcome.core.phase).toBe('ready')
    expect(owed(outcome)).toEqual(['report'])
  })

  test('stays closed through its report where a story is on its way', () => {
    const torn = put(running(), { kind: 'start', story: other })
    const outcome = put(torn.core, torn.next!)

    // A story begun from that report would be overwritten by the one already
    // coming, which is what makes `next` on `onLeave` worth having.
    expect(outcome.core.phase).toBe('ending')
    expect(owed(outcome)).toEqual(['report'])
    expect(outcome.next).toEqual({ kind: 'startInto', story: other })
  })
})

describe('the window an ending leaves open', () => {
  // Everything here is a call made from inside `onLeave` or the ending report.
  const tearing = put(running(), { kind: 'stop' }).core

  test('turns down a start and says so', () => {
    const outcome = put(tearing, { kind: 'start', story: other })

    expect(outcome.core).toBe(tearing)
    expect(outcome.effects).toEqual([{ kind: 'diagnose', problem: { kind: 'call-refused' } }])
  })

  test('lets a signal through in silence, because no step is waiting', () => {
    const outcome = put(tearing, { kind: 'reached', name: 'saved' })

    expect(outcome.core).toBe(tearing)
    expect(outcome.effects).toEqual([])
  })

  test('will not run a second teardown for a stop made from inside the first', () => {
    const outcome = put(tearing, { kind: 'stop' })

    expect(outcome.core).toBe(tearing)
    expect(outcome.effects).toEqual([])
  })
})

describe('arriving at a step', () => {
  test('opens the curtain before it hands the step over', () => {
    const arriving: C = { ...running(), phase: 'step' }

    const outcome = put(arriving, { kind: 'stepEntered', at: arriving.position!, animate: true })

    // A missing anchor can end the run from inside the draw, and the `onStep`
    // that reports that ending has to find a machine a host may call into.
    expect(outcome.core.phase).toBe('ready')
    expect(owed(outcome)).toEqual(['draw'])
    expect(outcome.next).toEqual({ kind: 'drawn', at: arriving.position })
  })

  test('draws the words the step carries, and a control where it has no signal', () => {
    const arriving: C = { ...running(), phase: 'step' }

    const [drawn] = put(arriving, {
      kind: 'stepEntered',
      at: arriving.position!,
      animate: true,
    }).effects as [E & { kind: 'draw' }]

    expect(drawn.content).toEqual({ text: 'do the thing', error: undefined, next: 'Next' })
  })

  test('draws no control on a step that declares a signal', () => {
    const waiting: Story = { id: 'tour', steps: [{ ...first, awaits: 'saved' }] }
    const arriving: C = { ...nothing(), position: { story: waiting, index: 0 }, phase: 'step' }

    const [drawn] = put(arriving, {
      kind: 'stepEntered',
      at: arriving.position!,
      animate: false,
    }).effects as [E & { kind: 'draw' }]

    expect(drawn.content.next).toBeUndefined()
  })

  test('says where the tour got to only once the step is on screen', () => {
    const arriving: C = { ...running(1), phase: 'step', announced: first }

    const outcome = put(arriving, { kind: 'drawn', at: arriving.position! })

    expect(outcome.core.announced).toBe(second)
    expect(outcome.effects).toEqual([{ kind: 'report', story, step: second, previous: first }])
  })

  test('says nothing where the run ended inside the draw', () => {
    const gone = nothing()

    expect(put(gone, { kind: 'drawn', at: at(0) }).effects).toEqual([])
  })
})

describe('a failed attempt', () => {
  const guarded: Story = { id: 'tour', steps: [{ ...first, validate: () => false }, second] }
  const attempt: Position<Fixture> = { story: guarded, index: 0 }
  const core: C = { ...nothing(), position: attempt }

  test('asks the page rather than deciding here', () => {
    const outcome = put(core, { kind: 'pressed' })

    expect(owed(outcome)).toEqual(['validate'])
    expect(outcome.core).toBe(core)
  })

  test('says no out loud, and says why where the step gave words for it', () => {
    const outcome = put(core, { kind: 'refused', at: attempt, reason: 'not yet' })

    expect(outcome.core.error).toBe('not yet')
    // The refusal comes first: it is the answer to the press, and the words are
    // what the answer is about.
    expect(owed(outcome)).toEqual(['reject', 'retell'])
    // The story and the step are read off the attempt rather than carried
    // beside it, so they cannot disagree with the position they belong to.
    const [, retold] = outcome.effects as [E, E & { kind: 'retell' }]
    expect(retold.story).toBe(guarded)
    expect(retold.step).toBe(guarded.steps[0])
    expect(retold.content.error).toBe('not yet')
  })

  test('still says no where the step gave no words', () => {
    const outcome = put(core, { kind: 'refused', at: attempt, reason: undefined })

    // A guard with nothing to say must not leave the control doing nothing.
    expect(outcome.effects).toEqual([{ kind: 'reject' }])
    expect(outcome.core.error).toBeUndefined()
  })

  test('says nothing at all where the tour has moved since', () => {
    // `validate` is the application's own code and can have called `stop()`.
    const moved: C = { ...core, position: { story: guarded, index: 1 } }

    const outcome = put(moved, { kind: 'refused', at: attempt, reason: 'not yet' })

    expect(outcome.core).toBe(moved)
    expect(outcome.effects).toEqual([])
  })
})

describe('starting', () => {
  test('tears nothing down until the story is known to be runnable', () => {
    const before = running()

    const outcome = put(before, { kind: 'start', story: empty })

    expect(outcome.core).toBe(before)
    expect(owed(outcome)).toEqual(['diagnose'])
  })

  test('puts the position up before the curtain, and the curtain before onEnter', () => {
    const outcome = put(nothing(), { kind: 'start', story })

    expect(outcome.core.position).toEqual({ story, index: 0 })
    expect(outcome.effects).toEqual([{ kind: 'hold', story, step: undefined }])

    const opened = put(outcome.core, outcome.next!)
    expect(opened.core.phase).toBe('story')
    expect(owed(opened)).toEqual(['callStoryEnter'])
  })

  test("a fresh object under the running story's name is a new run, not a swap", () => {
    const fresh: Story = { ...story, steps: [second] }

    const started = put(running(), { kind: 'start', story: fresh })

    // A teardown that carries the new one with it, the same as any other
    // displacement. There is no case here for "the story the tour is on", so
    // the steps never move under the position somebody is standing on.
    expect(started.next).toEqual({ kind: 'left', story, previous: first, into: fresh, after: [] })
  })
})

describe('a position is the occurrence, not the place', () => {
  test('two arrivals at the same step are two objects', () => {
    // The identity is what every late callback in the machine compares against,
    // so the same story at the same index twice has to be two of them.
    const once = put(nothing(), { kind: 'start', story }).core.position
    const twice = put(nothing(), { kind: 'start', story }).core.position

    expect(twice).toEqual(once)
    expect(twice).not.toBe(once)
  })

  test('the next step is a fresh one, and everything else stays where it was', () => {
    const before = running()

    const outcome = put(before, { kind: 'pressed' })

    expect(outcome.core).toEqual({ ...before, position: { story, index: 1 } })
    expect(outcome.next).toEqual({
      kind: 'entering',
      at: outcome.core.position,
      leaving: first,
      animate: true,
    })
  })
})

describe('an arrival throws away what belonged to the step being left', () => {
  test('drops the attempt and the morph, and keeps the report', () => {
    const before = running(0, { error: 'not yet', showing: Promise.resolve() })

    const outcome = put(before, { kind: 'entering', at: at(0), leaving: undefined, animate: true })

    expect(outcome.core).toEqual({
      ...before,
      phase: 'step',
      error: undefined,
      showing: undefined,
    })
    // A morph settling after this reads a promise nothing is holding any more.
    expect(outcome.core.announced).toBe(first)
  })

  test("a story's own arrival has no step, so there is neither to throw away", () => {
    const outcome = put(nothing(), { kind: 'start', story })
    const opened = put(outcome.core, outcome.next!)

    expect(opened.core).toEqual({ ...outcome.core, phase: 'story' })
  })
})

describe('a morph landing', () => {
  const morph = Promise.resolve()

  test('takes off the phase it put on', () => {
    const arrived = running(0, { phase: 'step' })
    const shown = put(arrived, { kind: 'shown', at: arrived.position!, showing: morph })
    expect(shown.core.phase).toBe('settling')

    const outcome = put(shown.core, { kind: 'settled', showing: morph })

    expect(outcome.core).toEqual({ ...shown.core, phase: 'ready', showing: undefined })
  })

  test('leaves a search alone, because the search wrote the phase over it', () => {
    // Both wrote the phase, and only the one that wrote it may take it off. The
    // wait ends when the presenter says it does.
    const before = running(0, { phase: 'searching', showing: morph })

    expect(put(before, { kind: 'settled', showing: morph }).core).toEqual({
      ...before,
      showing: undefined,
    })
  })

  test('lets go of nothing where another arrival has already replaced it', () => {
    const before = running(0, { phase: 'settling', showing: Promise.resolve() })

    expect(put(before, { kind: 'settled', showing: morph }).core).toBe(before)
  })
})

describe('the presenter looking for an anchor', () => {
  const seek = (core: C, step: Step = first) => put(core, { kind: 'searching', step, yes: true })

  test('starts a wait over a step that is on screen', () => {
    for (const phase of ['ready', 'settling'] as const) {
      expect(seek(running(0, { phase })).core.phase).toBe('searching')
    }
  })

  test('starts nothing over an arrival, an ending, or a wait already running', () => {
    for (const phase of ['story', 'step', 'ending', 'searching'] as const) {
      const before = running(0, { phase })

      // The same object, so nothing downstream of a commit has to look twice.
      expect(seek(before).core).toBe(before)
    }
  })

  test('starts nothing for a step the tour has already left', () => {
    // A presenter can notice a loss after the tour has moved on, and that
    // notice is about a step nobody is showing.
    const before = running()

    expect(seek(before, second).core).toBe(before)
  })

  test('ends a wait without asking where the tour is', () => {
    const before = running(0, { phase: 'searching' })

    const outcome = put(before, { kind: 'searching', step: second, yes: false })

    expect(outcome.core).toEqual({ ...before, phase: 'ready' })
  })

  test('ends nothing where the wait was written over in the meantime', () => {
    for (const phase of ['ready', 'settling', 'story', 'step', 'ending'] as const) {
      const before = running(0, { phase })

      expect(put(before, { kind: 'searching', step: first, yes: false }).core).toBe(before)
    }
  })
})
