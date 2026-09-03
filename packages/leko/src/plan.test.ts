import type { Glide } from '@annetaan/leko-spotlight'
import { describe, expect, test } from 'vitest'

import {
  type Drawn,
  type Effect,
  type Event,
  idle,
  type Mode,
  type Outcome,
  type Pending,
  pointsAt,
  reduce,
  regionsOf,
} from './plan.js'
import type { LekoStep } from './types.js'

// The mode, and what every event does to it, with no page at all. The browser
// suites in `leko.test.ts` and `wiring.test.ts` drive the real `DomPresenter`
// and ask what ended up on screen. This asks what was owed, one `(mode, event)`
// pair at a time — which is where every recent bug in the presenter has been.

const step: LekoStep = { id: 'a', target: { elements: '#a', interactive: true } }
const other: LekoStep = { id: 'b', target: '#b' }
/** A step that points at nothing: a wait. */
const waiting: LekoStep = { id: 'w', message: 'Hold on.' }

/**
 * An anchor is opaque here. The plan hands one to the shell and never reads it,
 * so anything with an identity will do.
 */
const anchor = { id: 'anchor' } as unknown as Element
const replacement = { id: 'replacement' } as unknown as Element

/** A glide that never lands, which is as much of one as the plan looks at. */
const glide = (): Glide => ({ settled: new Promise(() => {}), abandon: () => {} })

/**
 * Effects that come back into the plan from inside the shell. `Outcome` says
 * each has to be the last of its list, and every outcome below is checked.
 */
const REENTRANT: ReadonlySet<Effect['kind']> = new Set(['reveal', 'arrive', 'lost'])

const put = (mode: Mode, event: Event): Outcome => {
  const outcome = reduce(mode, event)
  const kinds = outcome.effects.map((e) => e.kind)
  const first = kinds.findIndex((kind) => REENTRANT.has(kind))
  if (first !== -1) expect(first).toBe(kinds.length - 1)
  return outcome
}

/** Every effect an outcome owes, by kind, in order. */
const owed = (outcome: Outcome): string[] => outcome.effects.map((e) => e.kind)

/** The one effect of `kind` an outcome owes. Fails where it owes none or two. */
function the<K extends Effect['kind']>(outcome: Outcome, kind: K): Effect & { kind: K } {
  const found = outcome.effects.filter((e): e is Effect & { kind: K } => e.kind === kind)
  expect(found).toHaveLength(1)
  return found[0]!
}

const arrival = (over: Partial<Event & { kind: 'show' }> = {}): Event => ({
  kind: 'show',
  step,
  anchor,
  animate: true,
  glide: undefined,
  error: undefined,
  ...over,
})

type Retrying = Mode & { kind: 'retrying' }
type Gliding = Mode & { kind: 'gliding' }

/** The step on screen while a wait runs, unless a test says otherwise. */
const left: Drawn = { step: other, error: undefined }

/** A step on screen, settled. */
const drawn = (error: string | undefined = undefined): Mode => ({ kind: 'drawn', step, error })

/** A target given a moment to turn up, with `standing` still on screen. */
const retrying = (
  pending: Pending = { step, animate: true },
  standing: Drawn | undefined = left,
): Retrying => ({ kind: 'retrying', pending, error: undefined, standing })

/** The page on its way to `step`, having left `standing`. */
const gliding = (flight: Glide = glide(), standing: Drawn | undefined = left): Gliding => ({
  kind: 'gliding',
  glide: flight,
  pending: { step, animate: true },
  error: undefined,
  standing,
})

const MODES: Record<Mode['kind'], () => Mode> = {
  idle: () => idle,
  drawn: () => drawn(),
  retrying: () => retrying(),
  gliding: () => gliding(),
}

describe('reading a step', () => {
  test('a bare target is the region of one it reads as, and is never open', () => {
    expect(regionsOf('#a')).toEqual([{ elements: ['#a'], interactive: false }])
  })

  test('only the first region can be open, whatever a step written in JavaScript says', () => {
    const regions = regionsOf([
      { elements: '#a', interactive: true },
      { elements: ['#b', '#c'], interactive: true } as never,
    ])

    expect(regions.map((r) => r.interactive)).toEqual([true, false])
    expect(regions[1]?.elements).toEqual(['#b', '#c'])
  })

  test('a step that names nothing has no regions and points at nothing', () => {
    expect(regionsOf(undefined)).toEqual([])
    expect(pointsAt(waiting)).toBe(false)
    expect(pointsAt(step)).toBe(true)
  })
})

describe('an arrival', () => {
  test('draws a step whose target is on the page, and watches the target', () => {
    const outcome = put(idle, arrival())

    expect(outcome.mode).toEqual({ kind: 'drawn', step, error: undefined })
    // Watched before it is drawn, so a draw that finds nothing to measure hands
    // the hunt a watcher to replace rather than being replaced by one.
    expect(owed(outcome)).toEqual(['watch', 'reveal'])
    expect(the(outcome, 'watch')).toEqual({ kind: 'watch', step, anchor })
    expect(the(outcome, 'reveal')).toEqual({
      kind: 'reveal',
      drawn: { step, error: undefined },
      anchor,
      animate: true,
    })
  })

  test('draws a step that points at nothing on the document, and watches nothing', () => {
    const outcome = put(drawn(), arrival({ step: waiting, anchor: null }))

    expect(outcome.mode).toEqual({ kind: 'drawn', step: waiting, error: undefined })
    // The watcher on the step before goes, or it would report against this one.
    expect(owed(outcome)).toEqual(['disarm', 'reveal'])
    expect(the(outcome, 'reveal').anchor).toBeNull()
  })

  test('gives a target that is not on the page a moment to turn up, and draws nothing', () => {
    const outcome = put(drawn('was told'), arrival({ anchor: null }))

    expect(outcome.mode).toEqual({
      kind: 'retrying',
      pending: { step, animate: true },
      error: undefined,
      // What was on screen stays on screen, reason and all.
      standing: { step, error: 'was told' },
    })
    expect(owed(outcome)).toEqual(['hunt', 'deadline'])
    // The deadline names the wait the mode holds, and no other object: that is
    // what a late one is told apart by.
    expect(the(outcome, 'deadline').pending).toBe((outcome.mode as Retrying).pending)
  })

  test('holds the pending step behind a glide, hides the words and watches nothing', () => {
    const flight = glide()

    const outcome = put(drawn('not yet'), arrival({ glide: flight }))

    expect(outcome.mode).toEqual({
      kind: 'gliding',
      glide: flight,
      pending: { step, animate: true },
      error: undefined,
      // What is on screen, reason and all, so a resize mid-glide can put it back.
      standing: { step, error: 'not yet' },
    })
    expect(owed(outcome)).toEqual(['hide', 'disarm'])
  })

  test('stops a glide the tour has moved past before anything else', () => {
    const flight = glide()

    const outcome = put(gliding(flight), arrival({ step: other }))

    expect(owed(outcome)).toEqual(['abandon', 'watch', 'reveal'])
    expect(the(outcome, 'abandon').glide).toBe(flight)
  })

  test("stops a retry's clock before anything else", () => {
    const outcome = put(retrying(), arrival())

    expect(owed(outcome)).toEqual(['cancel', 'watch', 'reveal'])
  })

  test('a wait begun from a wait keeps what is standing, because nothing was drawn between', () => {
    const standing: Drawn = { step: other, error: 'was told' }

    expect(
      (put(gliding(glide(), standing), arrival({ glide: glide() })).mode as Gliding).standing,
    ).toBe(standing)
    // A glide is long enough for a resize to matter, where the retry's 100ms
    // is not, so the glide has to know what the retry knew.
    expect(
      (put(retrying(undefined, standing), arrival({ glide: glide() })).mode as Gliding).standing,
    ).toBe(standing)
    expect(
      (put(retrying(undefined, standing), arrival({ anchor: null })).mode as Retrying).standing,
    ).toBe(standing)
  })

  test('a wait begun from nothing on screen knows that', () => {
    expect((put(idle, arrival({ anchor: null })).mode as Retrying).standing).toBeUndefined()
    expect((put(idle, arrival({ glide: glide() })).mode as Gliding).standing).toBeUndefined()
  })

  test('is a fresh attempt, unless it comes in with what a wait was already told', () => {
    expect(put(drawn('not yet'), arrival()).mode).toEqual(drawn())

    const carried = put(retrying(), arrival({ error: 'still not' }))
    expect(carried.mode).toEqual(drawn('still not'))
    expect(the(carried, 'reveal').drawn.error).toBe('still not')
  })
})

describe('a glide landing', () => {
  test('draws the pending step where the page stopped, with the reason it was told meanwhile', () => {
    const flight = glide()
    const told = put(gliding(flight), { kind: 'retell', step, reason: 'not yet' }).mode

    const outcome = put(told, { kind: 'settled', glide: flight, anchor })

    expect(outcome.mode).toEqual(drawn('not yet'))
    expect(owed(outcome)).toEqual(['watch', 'reveal'])
    expect(the(outcome, 'reveal')).toEqual({
      kind: 'reveal',
      drawn: { step, error: 'not yet' },
      anchor,
      animate: true,
    })
  })

  test('retries where the target has gone while the page moved, as the same wait', () => {
    const flight = glide()
    const before = gliding(flight)

    const outcome = put(before, { kind: 'settled', glide: flight, anchor: null })

    expect(outcome.mode).toEqual({
      kind: 'retrying',
      pending: before.pending,
      error: undefined,
      standing: left,
    })
    expect(owed(outcome)).toEqual(['hunt', 'deadline'])
    expect(the(outcome, 'deadline').pending).toBe(before.pending)
  })

  test('is ignored where it is not the glide the mode holds', () => {
    const before = gliding()

    const outcome = put(before, { kind: 'settled', glide: glide(), anchor })

    expect(outcome.mode).toBe(before)
    expect(outcome.effects).toEqual([])
  })

  test('is ignored in every mode that is not gliding', () => {
    for (const kind of ['idle', 'drawn', 'retrying'] as const) {
      const before = MODES[kind]()
      const outcome = put(before, { kind: 'settled', glide: glide(), anchor })
      expect(outcome.mode).toBe(before)
      expect(outcome.effects).toEqual([])
    }
  })
})

describe('the page changing under a step', () => {
  test('a replacement that came with the batch is drawn again, reason and all', () => {
    const outcome = put(drawn('not yet'), { kind: 'mutated', step, found: replacement })

    expect(outcome.mode).toEqual(drawn('not yet'))
    expect(owed(outcome)).toEqual(['watch', 'reveal'])
    expect(the(outcome, 'watch').anchor).toBe(replacement)
    // A re-render costs a morph and nothing else.
    expect(the(outcome, 'reveal')).toEqual({
      kind: 'reveal',
      drawn: { step, error: 'not yet' },
      anchor: replacement,
      animate: true,
    })
  })

  test('a target gone with nothing in its place is given a moment, and the reason waits with it', () => {
    const outcome = put(drawn('not yet'), { kind: 'mutated', step, found: null })

    expect(outcome.mode).toEqual({
      kind: 'retrying',
      pending: { step, animate: true },
      error: 'not yet',
      // The hole stands over the gap, and this is the step it was cut for.
      standing: { step, error: 'not yet' },
    })
    expect(owed(outcome)).toEqual(['hunt', 'deadline'])
  })

  test('a batch about a step that is not the one on screen is ignored', () => {
    const before = drawn()

    const outcome = put(before, { kind: 'mutated', step: other, found: null })

    expect(outcome.mode).toBe(before)
    expect(outcome.effects).toEqual([])
  })

  test('a hunt that found its target is a fresh arrival, carrying what the wait was told', () => {
    const before = put(retrying(), { kind: 'retell', step, reason: 'not yet' }).mode

    const outcome = put(before, { kind: 'mutated', step, found: anchor })

    // The mode is left alone: the arrival this owes decides what comes next,
    // and only the shell can start the scroll it may need.
    expect(outcome.mode).toBe(before)
    expect(outcome.effects).toEqual([
      { kind: 'arrive', pending: { step, animate: true }, anchor, error: 'not yet' },
    ])
    expect(the(outcome, 'arrive').pending).toBe((before as Retrying).pending)
  })

  test('a hunt that found nothing goes on hunting', () => {
    const before = retrying()

    const outcome = put(before, { kind: 'mutated', step, found: null })

    expect(outcome.mode).toBe(before)
    expect(outcome.effects).toEqual([])
  })

  test('nothing is watched while the page glides, so a batch then means nothing', () => {
    const before = gliding()

    const outcome = put(before, { kind: 'mutated', step: other, found: replacement })

    expect(outcome.mode).toBe(before)
    expect(outcome.effects).toEqual([])
  })

  test('nothing is watched while idle either', () => {
    expect(put(idle, { kind: 'mutated', step, found: anchor }).effects).toEqual([])
  })
})

describe('a draw that found nothing to measure', () => {
  test('becomes a retry that draws the step the way the draw was asked to', () => {
    // The story's first draw does not animate, and neither should the retry
    // that stands in for it.
    const outcome = put(drawn('not yet'), { kind: 'unmeasured', step, animate: false })

    expect(outcome.mode).toEqual({
      kind: 'retrying',
      pending: { step, animate: false },
      error: 'not yet',
      // Nothing was drawn, and the stack may have been rebuilt on the way to
      // finding nothing, so nothing is known to be standing.
      standing: undefined,
    })
    expect(owed(outcome)).toEqual(['hunt', 'deadline'])
  })

  test('is ignored where it is not about the step on screen', () => {
    expect(put(drawn(), { kind: 'unmeasured', step: other, animate: true }).effects).toEqual([])
    for (const kind of ['idle', 'retrying', 'gliding'] as const) {
      expect(put(MODES[kind](), { kind: 'unmeasured', step, animate: true }).effects).toEqual([])
    }
  })
})

describe('a deadline running out', () => {
  test('gives the step up, and is over before the machine is told', () => {
    const before = retrying()

    const outcome = put(before, { kind: 'expired', pending: before.pending })

    // `lost` ends the run, and the teardown that arrives from inside the call
    // finds nothing pending.
    expect(outcome.mode).toBe(idle)
    expect(outcome.effects).toEqual([{ kind: 'disarm' }, { kind: 'lost', step }])
  })

  test('a deadline set for an earlier wait at the same step is ignored', () => {
    // Lost, found, and lost again inside 100ms: the first deadline runs out
    // while the second wait has most of its time left.
    const before = retrying({ step, animate: true })

    const outcome = put(before, { kind: 'expired', pending: { step, animate: true } })

    expect(outcome.mode).toBe(before)
    expect(outcome.effects).toEqual([])
  })

  test('is ignored in every mode that is not retrying', () => {
    for (const kind of ['idle', 'drawn', 'gliding'] as const) {
      const before = MODES[kind]()
      const outcome = put(before, { kind: 'expired', pending: { step, animate: true } })
      expect(outcome.mode).toBe(before)
      expect(outcome.effects).toEqual([])
    }
  })
})

describe('a resize', () => {
  test('puts the step on screen back and says it again, reason and all, as one effect', () => {
    const before = drawn('not yet')

    const outcome = put(before, { kind: 'resized' })

    expect(outcome.mode).toBe(before)
    // One effect rather than two, because the shell can find nothing to put
    // back — the target went in the same task — and the words follow only
    // where the holes did.
    expect(outcome.effects).toEqual([
      { kind: 'replace', drawn: { step, error: 'not yet' }, saying: true },
    ])
  })

  test('puts the standing holes back while a step is on its way, and says nothing', () => {
    const standing: Drawn = { step: other, error: 'was told' }

    for (const before of [gliding(glide(), standing), retrying(undefined, standing)]) {
      const outcome = put(before, { kind: 'resized' })
      expect(outcome.mode).toBe(before)
      // The step being left, not the one pending: nothing is drawn for the gap.
      expect(outcome.effects).toEqual([{ kind: 'replace', drawn: standing, saying: false }])
    }
  })

  test('does nothing while a step is on its way from nothing on screen', () => {
    // Nothing was on screen when the wait began, so there is nothing to put back.
    const glidingFromNothing: Mode = { ...gliding(), standing: undefined }
    const retryingFromNothing: Mode = { ...retrying(), standing: undefined }

    expect(put(glidingFromNothing, { kind: 'resized' }).effects).toEqual([])
    expect(put(retryingFromNothing, { kind: 'resized' }).effects).toEqual([])
  })

  test('does nothing while idle', () => {
    expect(put(idle, { kind: 'resized' }).effects).toEqual([])
  })
})

describe('a reason the guard gave', () => {
  test('is written onto the step on screen and said', () => {
    const outcome = put(drawn(), { kind: 'retell', step, reason: 'not yet' })

    expect(outcome.mode).toEqual(drawn('not yet'))
    expect(outcome.effects).toEqual([{ kind: 'retell', step, reason: 'not yet' }])
  })

  test('waits with a step on its way, and nothing is said', () => {
    for (const kind of ['retrying', 'gliding'] as const) {
      const before = MODES[kind]()
      const outcome = put(before, { kind: 'retell', step, reason: 'not yet' })
      expect(outcome.mode).toEqual({ ...before, error: 'not yet' })
      expect(outcome.effects).toEqual([])
    }
  })

  test('replaces the words, not the wait', () => {
    const before = retrying()

    const told = put(before, { kind: 'retell', step, reason: 'not yet' }).mode

    // The deadline set for this wait still names it.
    expect((told as Retrying).pending).toBe(before.pending)
  })

  test('has nowhere to go while idle', () => {
    const outcome = put(idle, { kind: 'retell', step, reason: 'not yet' })

    expect(outcome.mode).toBe(idle)
    expect(outcome.effects).toEqual([])
  })
})

describe('the morph ending', () => {
  test('brings the message back with what the step has been told by now', () => {
    const told = put(drawn(), { kind: 'retell', step, reason: 'not yet' }).mode

    const outcome = put(told, { kind: 'morphed', step })

    expect(outcome.mode).toBe(told)
    expect(outcome.effects).toEqual([{ kind: 'say', drawn: { step, error: 'not yet' } }])
  })

  test('says nothing for a morph of a step that is no longer the one on screen', () => {
    expect(put(drawn(), { kind: 'morphed', step: other }).effects).toEqual([])
  })

  test('says nothing in any mode without a step on screen', () => {
    for (const kind of ['idle', 'retrying', 'gliding'] as const) {
      expect(put(MODES[kind](), { kind: 'morphed', step }).effects).toEqual([])
    }
  })
})

describe('a teardown', () => {
  test('stops the glide, disarms the watcher and takes everything down', () => {
    const flight = glide()

    const outcome = put(gliding(flight), { kind: 'teardown' })

    expect(outcome.mode).toBe(idle)
    expect(outcome.effects).toEqual([
      { kind: 'abandon', glide: flight },
      { kind: 'disarm' },
      { kind: 'destroy' },
    ])
  })

  test("stops a retry's clock, so a tour that was stopped cannot give a step up later", () => {
    const outcome = put(retrying(), { kind: 'teardown' })

    expect(outcome.mode).toBe(idle)
    expect(outcome.effects).toEqual([{ kind: 'cancel' }, { kind: 'disarm' }, { kind: 'destroy' }])
  })

  test('has nothing to stop in any other mode, and takes the rest down all the same', () => {
    for (const kind of ['idle', 'drawn'] as const) {
      const outcome = put(MODES[kind](), { kind: 'teardown' })
      expect(outcome.mode).toBe(idle)
      expect(outcome.effects).toEqual([{ kind: 'disarm' }, { kind: 'destroy' }])
    }
  })
})

describe('a pending step is the wait, not the step', () => {
  test('two waits at the same step are two objects', () => {
    const once = put(idle, arrival({ anchor: null })).mode as Retrying
    const twice = put(idle, arrival({ anchor: null })).mode as Retrying

    expect(twice.pending).toEqual(once.pending)
    expect(twice.pending).not.toBe(once.pending)
  })
})
