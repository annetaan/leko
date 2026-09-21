import { describe, expect, test } from 'vitest'

import type { Fixture, Step, Story } from './fake.js'
import {
  accepting,
  arrivedAt,
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

// No world at all: `machine.test.ts` drives a real presenter and asks what
// happened, and this asks what was owed. DESIGN.md, **Where a class has to
// wait on more than one thing, its mode is one union and a pure function says
// what an event does to it**.

type C = Core<Fixture>
type E = Effect<Fixture>

const first: Step = { id: 'a', target: 'first' }
const second: Step = { id: 'b', target: 'second' }
const story: Story = { id: 'tour', steps: [first, second] }
const other: Story = { id: 'other', steps: [{ id: 'c', target: 'third' }] }
const empty: Story = { id: 'empty', steps: [] }

const nothing = (): C => idle<Fixture>()

const at = (index: number): Position<Fixture> => ({ story, index })

/** A tour standing on `index`, drawn and settled. */
const running = (index = 0, over: Partial<C> = {}): C => ({
  ...nothing(),
  position: at(index),
  ...over,
})

const put = (core: C, event: Event<Fixture>): Outcome<Fixture> => reduce(core, event)

const owed = (outcome: Outcome<Fixture>): string[] => outcome.effects.map((e) => e.kind)

const PHASES: Phase[] = ['story', 'step', 'ending', 'ready']

describe('reading the state', () => {
  test('a call is acted on where the step is on screen and nowhere else', () => {
    const answers = Object.fromEntries(
      PHASES.map((phase) => [phase, accepting(running(0, { phase }))]),
    )

    expect(answers).toEqual({
      ready: true,
      story: false,
      step: false,
      ending: false,
    })
  })

  test('idle is the position being empty, whatever the phase says', () => {
    for (const phase of PHASES) expect(stateOf({ ...nothing(), phase })).toBe('idle')
  })

  test('running is a story being on, whatever the machine is in the middle of', () => {
    const answers = Object.fromEntries(
      PHASES.map((phase) => [phase, stateOf(running(0, { phase }))]),
    )

    // DESIGN.md, **`state` is derived**.
    expect(answers).toEqual({
      ready: 'running',
      story: 'running',
      step: 'running',
      ending: 'running',
    })
  })

  test('stepOf reads the step the position names, and nothing past the end', () => {
    expect(stepOf(running(1))).toBe(second)
    expect(stepOf(running(2))).toBeUndefined()
    expect(stepOf(nothing())).toBeUndefined()
  })
})

describe('arrivedAt', () => {
  // DESIGN.md, **A URL is a signal the page reports**.

  test('a pattern written with g or y is tested without state, so the second arrival is seen too', () => {
    for (const pattern of [/^\/checkout/g, /^\/checkout/y]) {
      expect(arrivedAt(pattern, '/checkout')).toBe(true)
      // A stateful `.test()` would have moved `lastIndex` past the first match
      // here, so a naive second call would answer `false` — `y` more sharply
      // than `g`, since a fixed start from a moved `lastIndex` changes what
      // even that first call matches.
      expect(arrivedAt(pattern, '/checkout')).toBe(true)
    }
  })

  test("testing leaves the host's pattern untouched", () => {
    for (const pattern of [/^\/checkout/g, /^\/checkout/y]) {
      arrivedAt(pattern, '/checkout')

      expect(pattern.lastIndex).toBe(0)
    }
  })
})

describe('an ending', () => {
  test('empties the machine before it owes anybody anything', () => {
    const before = running()

    const outcome = put(before, { kind: 'stop' })

    // DESIGN.md, **A teardown says `idle` while it is still refusing calls**.
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

  test('stays closed through its report, and opens once the report is done', () => {
    const torn = put(running(), { kind: 'stop' })
    const outcome = put(torn.core, torn.next!)

    // DESIGN.md, **Saying where the tour got to**.
    expect(outcome.core.phase).toBe('ending')
    expect(owed(outcome)).toEqual(['report'])
    expect(outcome.next).toEqual({ kind: 'reported' })

    const opened = put(outcome.core, outcome.next!)
    expect(opened.core.phase).toBe('ready')
    expect(opened.effects).toEqual([])
  })

  test('stays closed through its report where a story is on its way', () => {
    // Only a chain gets here: a story on its way is one the story that just
    // ran out named in `next`.
    const core = running()
    const torn = put(core, { kind: 'chained', at: core.position!, into: other })
    const outcome = put(torn.core, torn.next!)

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

    // `packages/machine/model/phases.md` says why the phase opens first.
    expect(outcome.core.phase).toBe('ready')
    expect(owed(outcome)).toEqual(['draw'])
    expect(outcome.next).toEqual({ kind: 'drawn', at: arriving.position })
  })

  test('hands the step over and says nothing about what it says', () => {
    const arriving: C = { ...running(), phase: 'step' }

    const [drawn] = put(arriving, {
      kind: 'stepEntered',
      at: arriving.position!,
      animate: true,
    }).effects as [E & { kind: 'draw' }]

    // DESIGN.md, **No words cross the seam**.
    expect(drawn).toEqual({ kind: 'draw', step: first, animate: true })
  })

  test('says where the tour got to only once the step is on screen', () => {
    const arriving: C = { ...running(1), phase: 'step' }

    const outcome = put(arriving, { kind: 'drawn', at: arriving.position! })

    // DESIGN.md, **Everything the machine keeps is two fields**.
    expect(outcome.core).toBe(arriving)
    expect(outcome.effects).toEqual([{ kind: 'report', story, step: second }])
  })

  test('says nothing where the run ended inside the draw', () => {
    const gone = nothing()

    expect(put(gone, { kind: 'drawn', at: at(0) }).effects).toEqual([])
  })
})

describe('a failed attempt', () => {
  // DESIGN.md, **A failed attempt**.
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

    expect(outcome.core).toBe(core)
    // The refusal comes first: it is the answer to the press, and the words are
    // what the answer is about.
    expect(owed(outcome)).toEqual(['reject', 'retell'])
    // The step is read off the attempt rather than carried beside it, so it
    // cannot disagree with the position it belongs to.
    const [, retold] = outcome.effects as [E, E & { kind: 'retell' }]
    expect(retold.step).toBe(guarded.steps[0])
    expect(retold.reason).toBe('not yet')
  })

  test('still says no where the step gave no words', () => {
    const outcome = put(core, { kind: 'refused', at: attempt, reason: undefined })

    expect(outcome.effects).toEqual([{ kind: 'reject' }])
    expect(outcome.core).toBe(core)
  })

  test('says nothing at all where the tour has moved since', () => {
    // `packages/machine/model/phases.md` says why `refused` asks all the same.
    const moved: C = { ...core, position: { story: guarded, index: 1 } }

    const outcome = put(moved, { kind: 'refused', at: attempt, reason: 'not yet' })

    expect(outcome.core).toBe(moved)
    expect(outcome.effects).toEqual([])
  })
})

describe('starting', () => {
  // DESIGN.md, **Starting a story**.

  test('is turned down while a tour is running, and says which one it left alone', () => {
    const before = running()

    const outcome = put(before, { kind: 'start', story: other })

    expect(outcome.core).toBe(before)
    expect(outcome.effects).toEqual([
      { kind: 'diagnose', problem: { kind: 'tour-running', story: other, running: story } },
    ])
  })

  test('is turned down where the story has nothing in it', () => {
    const outcome = put(nothing(), { kind: 'start', story: empty })

    expect(outcome.core.position).toBeUndefined()
    expect(owed(outcome)).toEqual(['diagnose'])
  })

  test('puts the position up before the story is asked to open, and draws nothing for it', () => {
    const outcome = put(nothing(), { kind: 'start', story })

    expect(outcome.core.position).toEqual({ story, index: 0 })
    expect(outcome.effects).toEqual([])

    const opened = put(outcome.core, outcome.next!)
    expect(opened.core.phase).toBe('story')
    expect(owed(opened)).toEqual(['callStoryEnter'])
  })

  test("a fresh object under the running story's name is turned down like any other", () => {
    const fresh: Story = { ...story, steps: [second] }

    const started = put(running(), { kind: 'start', story: fresh })

    expect(started.core).toEqual(running())
    expect(started.next).toBeUndefined()
    expect(owed(started)).toEqual(['diagnose'])
  })
})

describe('a position is the occurrence, not the place', () => {
  test('two arrivals at the same step are two objects', () => {
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

describe('an arrival is a fresh position and nothing else', () => {
  test('writes the phase and moves nothing it was not asked to', () => {
    const before = running()

    const outcome = put(before, { kind: 'entering', at: at(0), leaving: undefined, animate: true })

    expect(outcome.core).toEqual({ ...before, phase: 'step' })
  })

  test("a story's own arrival has no step, so there is nothing to throw away", () => {
    const outcome = put(nothing(), { kind: 'start', story })
    const opened = put(outcome.core, outcome.next!)

    expect(opened.core).toEqual({ ...outcome.core, phase: 'story' })
  })
})
