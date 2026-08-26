import { describe, expect, test } from 'vitest'

import { type Core, idle, type Position } from './core.js'
import type { Anchor, Step, Story } from './fake.js'
import { type Effect, type Event, type Look, type Outcome, reduce } from './plan.js'

// The reducer with no world at all. `machine.test.ts` drives a real presenter
// and asks what happened; this asks what was owed, which is the thing that used
// to be a call halfway down a method and is now a value.

type C = Core<Step, Story>
type E = Effect<Anchor, Step, Story>

const first: Step = { id: 'a', target: 'first', message: 'do the thing' }
const second: Step = { id: 'b', target: 'second' }
const story: Story = { id: 'tour', steps: [first, second] }
const other: Story = { id: 'other', steps: [{ id: 'c', target: 'third' }] }
const empty: Story = { id: 'empty', steps: [] }

const look: Look<Anchor, Step, Story> = {
  story: (id) => [story, other, empty].find((one) => one.id === id),
  nextLabel: 'Next',
}

const at = (index: number): Position<Story> => ({ story, index })

/** A tour standing on `index`, drawn and settled. */
const running = (index = 0, over: Partial<C> = {}): C => ({
  ...idle<Step, Story>(),
  position: at(index),
  announced: story.steps[index],
  ...over,
})

const put = (core: C, event: Event<Anchor, Step, Story>): Outcome<Anchor, Step, Story> =>
  reduce(core, event, look)

/** Every effect an outcome owes, by kind, in order. */
const owed = (outcome: Outcome<Anchor, Step, Story>): string[] =>
  outcome.effects.map((effect) => effect.kind)

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
    const outcome = put(idle<Step, Story>(), { kind: 'stop' })

    expect(outcome.core).toEqual(idle<Step, Story>())
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
    const torn = put(running(), { kind: 'start', storyId: 'other' })
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
    const outcome = put(tearing, { kind: 'start', storyId: 'other' })

    expect(outcome.core).toBe(tearing)
    expect(outcome.effects).toEqual([
      { kind: 'diagnose', problem: { kind: 'call-refused', call: 'start' } },
    ])
  })

  test('turns down a setStory and registers nothing', () => {
    const outcome = put(tearing, { kind: 'setStory', story: other })

    expect(outcome.core).toBe(tearing)
    expect(owed(outcome)).toEqual(['diagnose'])
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
    const arriving: C = {
      ...idle<Step, Story>(),
      position: { story: waiting, index: 0 },
      phase: 'step',
    }

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
    const gone = idle<Step, Story>()

    expect(put(gone, { kind: 'drawn', at: at(0) }).effects).toEqual([])
  })
})

describe('a failed attempt', () => {
  const guarded: Story = { id: 'tour', steps: [{ ...first, validate: () => false }, second] }
  const attempt: Position<Story> = { story: guarded, index: 0 }
  const core: C = { ...idle<Step, Story>(), position: attempt }

  test('asks the page rather than deciding here', () => {
    const outcome = put(core, { kind: 'pressed' })

    expect(owed(outcome)).toEqual(['validate'])
    expect(outcome.core).toBe(core)
  })

  test('writes its words on the attempt they were about', () => {
    const outcome = put(core, {
      kind: 'setError',
      attempt,
      story: guarded,
      step: guarded.steps[0]!,
      anchor: 'first',
      message: 'not yet',
    })

    expect(outcome.core.error).toBe('not yet')
    const [retold] = outcome.effects as [E & { kind: 'retell' }]
    expect(retold.content.error).toBe('not yet')
  })

  test('writes nothing where the tour has moved since', () => {
    const moved: C = { ...core, position: { story: guarded, index: 1 } }

    const outcome = put(moved, {
      kind: 'setError',
      attempt,
      story: guarded,
      step: guarded.steps[0]!,
      anchor: 'first',
      message: 'not yet',
    })

    expect(outcome.core).toBe(moved)
    expect(outcome.effects).toEqual([])
  })

  test('shakes nothing where the tour has moved since', () => {
    const moved: C = { ...core, position: { story: guarded, index: 1 } }

    expect(put(moved, { kind: 'shake', attempt }).effects).toEqual([])
    expect(put(core, { kind: 'shake', attempt }).effects).toEqual([{ kind: 'reject' }])
  })
})

describe('starting', () => {
  test('tears nothing down until the id is known to be good', () => {
    const before = running()

    for (const storyId of ['nope', 'empty']) {
      const outcome = put(before, { kind: 'start', storyId })

      expect(outcome.core).toBe(before)
      expect(owed(outcome)).toEqual(['diagnose'])
    }
  })

  test('puts the position up before the curtain, and the curtain before onEnter', () => {
    const outcome = put(idle<Step, Story>(), { kind: 'start', storyId: 'tour' })

    expect(outcome.core.position).toEqual({ story, index: 0 })
    expect(outcome.effects).toEqual([{ kind: 'hold', story, step: undefined }])

    const opened = put(outcome.core, outcome.next!)
    expect(opened.core.phase).toBe('story')
    expect(owed(opened)).toEqual(['callStoryEnter'])
  })

  test('registers a story, and does nothing for the one the tour is on', () => {
    expect(owed(put(idle<Step, Story>(), { kind: 'setStory', story }))).toEqual(['register'])
    expect(put(running(), { kind: 'setStory', story }).effects).toEqual([])
  })
})
