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

const PHASES: Phase[] = ['before', 'step', 'ending', 'ready']

describe('reading the state', () => {
  test('a call is acted on where the step is on screen and nowhere else', () => {
    const answers = Object.fromEntries(
      PHASES.map((phase) => [phase, accepting(running(0, { phase }))]),
    )

    expect(answers).toEqual({
      ready: true,
      before: false,
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
      before: 'running',
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

    expect(step).toEqual({ kind: 'callStepLeave', step: first })
    expect(tale).toEqual({ kind: 'callStoryLeave', story, next: undefined })
  })

  test('owes the step nothing where its onEnter was never called, whichever way the tour came to it', () => {
    // The story's own `onEnter`, or the `onLeave` of the step a move walked
    // away from, ended the tour before the step ahead was entered.
    const outcome = put(running(0, { phase: 'before' }), { kind: 'stop' })

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
  const worded: Story = {
    id: 'tour',
    steps: [{ ...first, validate: () => false, error: 'not yet' }, second],
  }
  const wordedAttempt: Position<Fixture> = { story: worded, index: 0 }
  const wordedCore: C = { ...nothing(), position: wordedAttempt }
  const asked: Story = {
    id: 'tour',
    steps: [{ ...first, validate: () => false, error: () => 'not yet' }, second],
  }
  const askedAttempt: Position<Fixture> = { story: asked, index: 0 }
  const askedCore: C = { ...nothing(), position: askedAttempt }

  test('asks the page rather than deciding here', () => {
    const outcome = put(core, { kind: 'pressed' })

    expect(owed(outcome)).toEqual(['validate'])
    expect(outcome.core).toBe(core)
  })

  test('says no out loud, and says why where the step gave words for it', () => {
    const outcome = put(wordedCore, { kind: 'refused', at: wordedAttempt, anchor: 'first' })

    expect(outcome.core).toBe(wordedCore)
    // The refusal comes first: it is the answer to the press, and the words are
    // what the answer is about.
    expect(owed(outcome)).toEqual(['reject', 'retell'])
    // The step is read off the attempt rather than carried beside it, so it
    // cannot disagree with the position it belongs to.
    const [, retold] = outcome.effects as [E, E & { kind: 'retell' }]
    expect(retold.step).toBe(worded.steps[0])
    expect(retold.reason).toBe('not yet')
  })

  test('still says no where the step gave no words', () => {
    const outcome = put(core, { kind: 'refused', at: attempt, anchor: 'first' })

    expect(outcome.effects).toEqual([{ kind: 'reject' }])
    expect(outcome.core).toBe(core)
  })

  test('says nothing at all where the tour has moved since', () => {
    // `packages/machine/model/phases.md` says why `refused` asks all the same.
    const moved: C = { ...core, position: { story: guarded, index: 1 } }

    const outcome = put(moved, { kind: 'refused', at: attempt, anchor: 'first' })

    expect(outcome.core).toBe(moved)
    expect(outcome.effects).toEqual([])
  })

  test('asks a step whose words are a function only through explain', () => {
    const outcome = put(askedCore, { kind: 'refused', at: askedAttempt, anchor: 'first' })

    expect(outcome.core).toBe(askedCore)
    expect(outcome.effects).toEqual([
      { kind: 'explain', at: askedAttempt, anchor: 'first', error: asked.steps[0]!.error },
    ])
  })

  test('says no and says why once the words are back', () => {
    const outcome = put(askedCore, { kind: 'explained', at: askedAttempt, reason: 'not yet' })

    expect(outcome.core).toBe(askedCore)
    expect(owed(outcome)).toEqual(['reject', 'retell'])
    const [, retold] = outcome.effects as [E, E & { kind: 'retell' }]
    expect(retold.step).toBe(asked.steps[0])
    expect(retold.reason).toBe('not yet')
  })

  test('says nothing once the words are back where the tour has moved since', () => {
    const moved: C = { ...askedCore, position: { story: asked, index: 1 } }

    const outcome = put(moved, { kind: 'explained', at: askedAttempt, reason: 'not yet' })

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

  test('puts the position up and listens before the story is asked to open, and draws nothing for it', () => {
    const outcome = put(nothing(), { kind: 'start', story })

    expect(outcome.core.position).toEqual({ story, index: 0 })
    expect(outcome.effects).toEqual([{ kind: 'listen' }])

    const opened = put(outcome.core, outcome.next!)
    expect(opened.core.phase).toBe('before')
    expect(owed(opened)).toEqual(['callStoryEnter'])
  })

  test('a story next hands the tour to listens again, once the ending before it has reported', () => {
    const outcome = put({ ...nothing(), phase: 'ending' }, { kind: 'startInto', story: other })

    expect(outcome.effects).toEqual([{ kind: 'listen' }])
    expect(outcome.next?.kind).toBe('openStory')
  })

  test("a fresh object under the running story's name is turned down like any other", () => {
    const fresh: Story = { ...story, steps: [second] }

    const started = put(running(), { kind: 'start', story: fresh })

    expect(started.core).toEqual(running())
    expect(started.next).toBeUndefined()
    expect(owed(started)).toEqual(['diagnose'])
  })
})

describe('a URL, and the step waiting for it', () => {
  // DESIGN.md, **A URL is a signal the page reports**.

  const pattern = /^\/checkout/
  const waiting: Step = { id: 'w', target: 'first', awaits: { url: pattern } }
  const checkout: Story = { id: 'checkout', steps: [waiting, second] }

  test('navigated matching the first step owes signal-dropped from before and step, and moves on only from ready', () => {
    const answers = Object.fromEntries(
      (['before', 'step', 'ready'] as const).map((phase) => {
        const before: C = { ...nothing(), position: { story: checkout, index: 0 }, phase }
        const outcome = put(before, { kind: 'navigated', url: '/checkout' })
        return [
          phase,
          {
            effects: outcome.effects,
            index: outcome.core.position?.index,
            next: outcome.next?.kind,
          },
        ]
      }),
    )

    const dropped = [
      {
        kind: 'diagnose',
        problem: { kind: 'signal-dropped', name: String(pattern), step: waiting },
      },
    ]
    expect(answers).toEqual({
      before: { effects: dropped, index: 0, next: undefined },
      step: { effects: dropped, index: 0, next: undefined },
      ready: {
        effects: [
          {
            kind: 'callStepLeaveOnMove',
            at: { story: checkout, index: 1 },
            step: waiting,
            next: second,
            animate: true,
          },
        ],
        index: 1,
        next: undefined,
      },
    })
  })
})

describe('a position is the occurrence, not the place', () => {
  test('two arrivals at the same step are two objects', () => {
    const once = put(nothing(), { kind: 'start', story }).core.position
    const twice = put(nothing(), { kind: 'start', story }).core.position

    expect(twice).toEqual(once)
    expect(twice).not.toBe(once)
  })

  test('the next step is a fresh one, and the step behind is left before it is entered', () => {
    const outcome = put(running(), { kind: 'pressed' })

    expect(outcome.core).toEqual({ position: { story, index: 1 }, phase: 'before' })
    expect(outcome.effects).toEqual([
      {
        kind: 'callStepLeaveOnMove',
        at: outcome.core.position,
        step: first,
        next: second,
        animate: true,
      },
    ])
    expect(outcome.next).toBeUndefined()
  })
})

describe('an arrival is a fresh position and nothing else', () => {
  test('writes the phase and moves nothing it was not asked to', () => {
    const before = running()

    const outcome = put(before, { kind: 'entering', at: before.position!, animate: true })

    expect(outcome.core).toEqual({ ...before, phase: 'step' })
  })

  test("a story's own arrival has no step, so there is nothing to throw away", () => {
    const outcome = put(nothing(), { kind: 'start', story })
    const opened = put(outcome.core, outcome.next!)

    expect(opened.core).toEqual({ ...outcome.core, phase: 'before' })
  })

  test('leaves the step behind with the gate shut before the next is entered', () => {
    const outcome = put(running(), { kind: 'pressed' })

    expect(accepting(outcome.core)).toBe(false)
    expect(stepOf(outcome.core)).toBe(second)
    expect(owed(outcome)).toEqual(['callStepLeaveOnMove'])
  })

  test('enters nothing where the handler before the step stopped the tour', () => {
    const gone = nothing()

    const outcome = put(gone, { kind: 'entering', at: at(1), animate: true })

    expect(outcome.core).toBe(gone)
    expect(outcome.effects).toEqual([])
    expect(outcome.next).toBeUndefined()
  })

  test('enters the step once the handler before it returned', () => {
    const before = running(1, { phase: 'before' })

    const outcome = put(before, { kind: 'entering', at: before.position!, animate: true })

    expect(outcome.core.phase).toBe('step')
    expect(outcome.effects).toEqual([
      { kind: 'callStepEnter', at: before.position, step: second, animate: true },
    ])
  })
})

describe('a page load, and the story it hands on', () => {
  // DESIGN.md, **A page load ends the story, and hands it on**.

  const urlPattern = /^\/next/
  const successor: Story = { id: 'successor', steps: [{ id: 's', target: 'first' }] }
  const handing: Story = {
    id: 'handing',
    next: successor,
    steps: [first, { id: 'leave', target: 'second', awaits: { url: urlPattern } }],
  }
  const at2: Position<Fixture> = { story: handing, index: 1 }
  const standing = (over: Partial<C> = {}): C => ({ ...nothing(), position: at2, ...over })

  test('unloading owes handOn only from ready, on the last step of a story with next and { url }', () => {
    const answers = Object.fromEntries(
      PHASES.map((phase) => [phase, owed(put(standing({ phase }), { kind: 'unloading' }))]),
    )

    expect(answers).toEqual({
      ready: ['handOn'],
      before: [],
      step: [],
      ending: [],
    })
  })

  test('unloading owes nothing where the story names no next, even from its last, URL-awaiting step', () => {
    // `handingOn` would answer the same `into: undefined` either way, but
    // this is the guard that keeps `handOn` — and the call it makes into
    // `story.next` — from being owed in the first place.
    const noNext: Story = {
      id: 'no-next',
      steps: [{ id: 'a', target: 'first', awaits: { url: urlPattern } }],
    }
    const core: C = { ...nothing(), position: { story: noNext, index: 0 } }

    const outcome = put(core, { kind: 'unloading' })

    expect(outcome.effects).toEqual([])
  })

  test('handingOn owes nothing where next answered nothing', () => {
    const outcome = put(standing(), {
      kind: 'handingOn',
      at: at2,
      url: urlPattern,
      into: undefined,
    })

    expect(outcome.effects).toEqual([])
  })

  test('handingOn owes nothing where the tour has moved on since', () => {
    const moved: C = { ...standing(), position: { story: handing, index: 0 } }

    const outcome = put(moved, { kind: 'handingOn', at: at2, url: urlPattern, into: successor })

    expect(outcome.effects).toEqual([])
  })

  test('handingOn owes keep, stamped with the pattern and the successor id, while the tour still stands where it was', () => {
    const outcome = put(standing(), {
      kind: 'handingOn',
      at: at2,
      url: urlPattern,
      into: successor,
    })

    expect(outcome.effects).toEqual([
      {
        kind: 'keep',
        handoff: { url: { source: urlPattern.source, flags: urlPattern.flags }, into: 'successor' },
      },
    ])
  })

  test('taken owes nothing where the url equals the one the note was kept at', () => {
    const found = {
      handoff: { url: { source: urlPattern.source, flags: urlPattern.flags }, into: 'successor' },
      from: '/next',
      url: '/next',
    }

    const outcome = put(nothing(), { kind: 'taken', stories: [successor], found })

    expect(outcome.effects).toEqual([])
    expect(outcome.next).toBeUndefined()
  })

  test('taken owes nothing where the pattern does not match', () => {
    const found = {
      handoff: { url: { source: urlPattern.source, flags: urlPattern.flags }, into: 'successor' },
      from: '/from',
      url: '/elsewhere',
    }

    const outcome = put(nothing(), { kind: 'taken', stories: [successor], found })

    expect(outcome.effects).toEqual([])
    expect(outcome.next).toBeUndefined()
  })

  test('taken names the id no held story answers to', () => {
    const found = {
      handoff: { url: { source: urlPattern.source, flags: urlPattern.flags }, into: 'successor' },
      from: '/from',
      url: '/next',
    }

    const outcome = put(nothing(), { kind: 'taken', stories: [], found })

    expect(outcome.effects).toEqual([
      { kind: 'diagnose', problem: { kind: 'story-unknown', id: 'successor' } },
    ])
  })

  test('taken that matches continues into a start of the successor', () => {
    const found = {
      handoff: { url: { source: urlPattern.source, flags: urlPattern.flags }, into: 'successor' },
      from: '/from',
      url: '/next',
    }

    const outcome = put(nothing(), { kind: 'taken', stories: [successor], found })

    expect(outcome.effects).toEqual([])
    expect(outcome.next).toEqual({ kind: 'start', story: successor })
  })

  test('pickUp from a closed phase owes diagnose and no take', () => {
    const closed = standing({ phase: 'step' })

    const outcome = put(closed, { kind: 'pickUp', stories: [successor] })

    expect(owed(outcome)).toEqual(['diagnose'])
  })
})
