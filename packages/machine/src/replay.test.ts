import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { afterAll, afterEach, describe, expect, test, vi } from 'vitest'

import type { Anchor, Fixture, Step, Story } from './fake.js'
import { Fake } from './fake.js'
import { Machine } from './machine.js'
import type { Problem } from './types.js'

// Every trace under `../model/traces/` driven into the real machine, call by
// call, with the model's own state as the oracle at each one.
//
// `../model/machine.qnt` carries two invariants, because those two are the only
// ones on the list in issue #52 that a state predicate can see. The rest are
// claims about what a *transition* did — "nothing moved", "exactly one
// `onLeave`" — and a predicate over one state cannot see a transition at all. Writing them into the
// model as a flag an action sets would make them true by construction. They live
// here instead, where the thing being asked is the real class.
//
// `packages/machine/model/README.md` says how a trace gets here and what to do
// when one of these fails.

// ------------------------------------------------------------------ ITF values
//
// The Informal Trace Format wraps the things JSON has no spelling for. Sum types
// are `{ tag, value }`, sets are `{ "#set": [...] }`, integers are
// `{ "#bigint": "0" }`, and a nullary constructor's payload is the empty tuple.

type Itf = unknown

const int = (value: Itf): number => Number((value as { '#bigint': string })['#bigint'])

const tag = (value: Itf): string => (value as { tag: string }).tag

const payload = (value: Itf): Itf => (value as { value: Itf }).value

const set = (value: Itf): Itf[] => (value as { '#set': Itf[] })['#set']

const map = (value: Itf): [string, Itf][] => (value as { '#map': [string, Itf][] })['#map']

/** `Maybe[a]` as declared in the model. */
const maybe = <T>(value: Itf, read: (inner: Itf) => T): T | undefined =>
  tag(value) === 'Just' ? read(payload(value)) : undefined

const str = (value: Itf): string => value as string

interface Pos {
  story: string
  index: number
}

const pos = (value: Itf): Pos => {
  const record = value as { story: string; index: Itf }
  return { story: record.story, index: int(record.index) }
}

const same = (a: Pos | undefined, b: Pos | undefined): boolean =>
  a === undefined || b === undefined ? a === b : a.story === b.story && a.index === b.index

/** One state of the model, in the terms the machine uses. */
interface Snapshot {
  action: string
  picks: Record<string, Itf | undefined>
  position: Pos | undefined
  phase: string
  hasError: boolean
  drawn: Pos | undefined
  presenterUp: boolean
  /**
   * Every teardown the model has begun and not finished, by token.
   *
   * `machine.ts` runs a whole teardown inside the call that began it, so these
   * never outlive one `dispatch`. What they mark out is the run of trace states
   * that happened *during* that call, which is the whole of why they are here.
   */
  leaving: Set<number>
  /** Which way the action went. See `mark` in the model. */
  mark: string
}

const snapshot = (raw: Record<string, Itf>): Snapshot => {
  const m = raw['m'] as Record<string, Itf>
  const leaving = new Set<number>()
  for (const callback of set(m['inflight'])) {
    if (tag(callback) !== 'Leaving') continue
    leaving.add(int((payload(callback) as { token: Itf }).token))
  }
  const picks = (raw['mbt::nondetPicks'] ?? {}) as Record<string, Itf>
  return {
    action: raw['mbt::actionTaken'] as string,
    picks: Object.fromEntries(
      Object.entries(picks).map(([name, value]) => [
        name,
        tag(value) === 'Some' ? payload(value) : undefined,
      ]),
    ),
    position: maybe(m['position'], pos),
    phase: tag(m['phase']),
    hasError: m['hasError'] as boolean,
    drawn: maybe(m['drawn'], pos),
    presenterUp: m['presenterUp'] as boolean,
    leaving,
    mark: m['mark'] as string,
  }
}

/** `Machine.state`, derived the way the model derives it. */
const stateOf = (s: Snapshot): string => (s.position === undefined ? 'idle' : 'running')

// ------------------------------------------------------------------- the world
//
// Built from the trace rather than written out again here. `world` is a model
// variable so that it lands in every ITF state, which is what lets the fixture
// have one definition instead of two that can drift apart.

/** What one run of one trace needs to hold on to while it drives the machine. */
/**
 * Every way the model says a call came to nothing because of the gate.
 *
 * `empty-story` is turned down for a reason of its own and not by the gate at
 * all, and belongs here for what it has in common with the other two: nothing
 * moved, and something said so. Each is one diagnostic, which is what the
 * counting below asks for.
 *
 * `signal-dropped` is not here. The window the gate closes is a teardown, and by
 * then the position is empty, so a signal arriving in one is unmatched rather
 * than refused. Reaching that diagnostic takes a `reached()` made from inside an
 * `onEnter`, which `machine.test.ts` has and the model does not describe.
 */
const REFUSALS = ['refused-start', 'empty-story', 'start-running']

/** What a step with `error` on it says, so an assertion can name the words. */
const REASON = 'not yet'

/** One call the trace says arrived while the machine was inside a teardown. */
interface Windowed {
  now: Snapshot
  where: string
}

interface Run {
  tour: Machine<Fixture>
  fake: Recorder
  stories: Map<string, Story>
  /** What `validate` answers. */
  guardOk: boolean
  /** Every `onStep`, as the step id it named. */
  reports: (string | undefined)[]
  /** `onEnter` and `onLeave`, in order, as `story:a` or `step:a1`. */
  handlers: { kind: 'enter' | 'leave'; who: string }[]
  problems: Problem<Fixture>[]
  /**
   * Calls waiting for a handler to make them.
   *
   * `end` runs two `onLeave` calls and a report inside whatever call began it,
   * and never goes back to the event loop in between. So a call the model makes
   * during a teardown has no moment out in the driver where it could be made.
   * These are queued before the call that opens the teardown and made from
   * inside it. See {@link drain}.
   */
  window: Windowed[]
}

/**
 * `Fake`, and a note of what is on screen.
 *
 * `drawn` and `presenterUp` are things `machine.ts` keeps implicitly — the
 * presenter holds them — so the model has to state them and something here has
 * to answer for them. Overriding the two methods that move them is the only
 * place that answer can come from without `Fake` growing a field the other 76
 * tests have no use for.
 */
class Recorder extends Fake {
  drawn: Step | undefined
  presenterUp = false

  override show(step: Step, anchor: Anchor | null): void {
    this.presenterUp = true
    // A missing anchor is `Host.lost` and nothing drawn, which is what the model
    // says too.
    if (anchor !== null) this.drawn = step
    super.show(step, anchor)
  }

  override teardown(): void {
    this.drawn = undefined
    this.presenterUp = false
    super.teardown()
  }
}

/** Turn the `world` the trace carries into the objects the machine takes. */
function build(raw: Record<string, Itf>, run: () => Run): Map<string, Story> {
  const world = map((raw['m'] as Record<string, Itf>)['world'])
  const stories = new Map<string, Story>()
  for (const [, spec] of world) {
    const story = spec as {
      id: string
      steps: Itf[]
      next: Itf
      throwsOnEnter: boolean
    }
    stories.set(story.id, {
      id: story.id,
      onEnter: () => {
        if (story.throwsOnEnter) throw new Error(`story ${story.id} would not open`)
      },
      steps: story.steps.map((entry) => {
        const shape = entry as {
          id: string
          target: string
          awaits: Itf
          hasGuard: boolean
          hasWords: boolean
          throwsOnEnter: boolean
        }
        const step: Step = {
          id: shape.id,
          target: shape.target,
          message: shape.id,
          awaits: maybe(shape.awaits, str),
          onEnter: () => {
            if (shape.throwsOnEnter) throw new Error(`step ${shape.id} would not open`)
          },
        }
        if (shape.hasGuard) step.validate = () => run().guardOk
        // Asked in the turn the guard says no, so there is nothing to hold on
        // to and nothing for the trace to spend later.
        if (shape.hasWords) step.error = REASON
        return step
      }),
    })
  }
  // A second pass, because a story names one that may not be built yet. The
  // model carries an id and the machine takes the object.
  for (const [, spec] of world) {
    const story = spec as { id: string; next: Itf }
    const into = maybe(story.next, str)
    if (into !== undefined) stories.get(story.id)!.next = stories.get(into)!
  }
  return stories
}

// ----------------------------------------------------------------- the driving

/**
 * Empty the microtask queue. Three, for the same reason `machine.test.ts` uses
 * three: a settling morph takes one to reach the `then` in `draw`, the write in
 * there takes another, and the third is slack.
 */
const turn = async (): Promise<void> => {
  for (let index = 0; index < 3; index += 1) await Promise.resolve()
}

/** Everything about the machine a trace can be held against. */
interface Observed {
  state: string
  story: string | undefined
  index: number | undefined
  step: string | undefined
  drawn: string | undefined
  presenterUp: boolean
  torn: number
  reports: number
}

const observe = (run: Run): Observed => ({
  state: run.tour.state,
  story: run.tour.story?.id,
  index: run.tour.index,
  step: run.tour.step?.id,
  drawn: run.fake.drawn?.id,
  presenterUp: run.fake.presenterUp,
  torn: run.fake.torn,
  reports: run.reports.length,
})

const stepOf = (run: Run, at: Pos): Step => run.stories.get(at.story)!.steps[at.index]!

/** Make the call this state of the trace says was made. */
async function dispatch(run: Run, now: Snapshot): Promise<void> {
  makeCall(run, now)
  await turn()
}

/**
 * The call on its own, with no turn after it.
 *
 * {@link drain} makes calls from inside a handler, where there is no awaiting
 * anything: the machine is part way through one of its own operations and the
 * microtask queue does not run until it is finished.
 */
function makeCall(run: Run, now: Snapshot): void {
  const { picks } = now
  switch (now.action) {
    case 'doStart':
      run.tour.start(run.stories.get(str(picks['startPick']!))!)
      break
    case 'doReached':
      run.tour.reached(str(picks['signalPick']!))
      break
    case 'doStop':
      run.tour.stop()
      break
    case 'doPress':
      run.guardOk = picks['guardOk'] as boolean
      run.fake.press()
      break
    case 'doResize':
      run.fake.resize()
      break
    case 'doLose':
      run.fake.lose(stepOf(run, pos(picks['losePick']!)))
      break
    case 'doLeave':
      // Not a call at all. `end` runs its handlers and its report inside
      // whichever call began it, so by the time the driver reads this state the
      // machine has long since been through it.
      break
    default:
      throw new Error(`no call for ${now.action}`)
  }
}

/**
 * Make every call the trace says arrived while the machine was inside a
 * teardown, from wherever the machine has just handed control back.
 *
 * `onLeave` and the ending `onStep` are the only moments there are, and this
 * runs from all of them. The first one to find the queue full empties it, which
 * is faithful enough: every state in the window is the same state, with the
 * position empty and the phase closed.
 */
function drain(run: Run): void {
  // Only from inside a teardown. `end` empties the position before it calls
  // anything, so a handler asking where the tour is gets `idle`. The `onLeave`
  // of a step the tour is merely walking away from gets `running`, because a
  // story is still on, and it is not this.
  if (run.window.length === 0 || run.tour.state !== 'idle') return
  for (const { now, where } of run.window.splice(0)) {
    const seen = observe(run)
    const problems = run.problems.length
    makeCall(run, now)
    // Every one of them is refused, finds nothing to act on, or is a knob on
    // the world. What has to be true is that not one of them moved anything.
    expect(observe(run), `${where}: a call moved the machine during a teardown`).toEqual(seen)
    if (REFUSALS.includes(now.mark)) {
      expect(run.problems.length, `${where}: refused in silence`).toBe(problems + 1)
    }
  }
}

// ---------------------------------------------------------------- the checking

/** The oracle: the real machine, held against the state the model is in. */
function agrees(run: Run, now: Snapshot, where: string): void {
  const seen = observe(run)
  expect(seen.state, `${where}: state`).toBe(stateOf(now))
  expect(seen.story, `${where}: story`).toBe(now.position?.story)
  expect(seen.index, `${where}: index`).toBe(now.position?.index)
  expect(seen.drawn, `${where}: what is on screen`).toBe(now.drawn && stepOf(run, now.drawn).id)
  expect(seen.presenterUp, `${where}: anything on screen at all`).toBe(now.presenterUp)
}

/** 3. Every `onEnter` is followed by exactly one `onLeave`, for steps and stories. */
function balanced(run: Run, where: string): void {
  const open: string[] = []
  for (const { kind, who } of run.handlers) {
    if (kind === 'enter') {
      expect(open, `${where}: ${who} was entered twice without leaving`).not.toContain(who)
      open.push(who)
      continue
    }
    // A story's own `onLeave` runs after its step's, so the two nest.
    expect(open.at(-1), `${where}: ${who} left without being entered`).toBe(who)
    open.pop()
  }
}

// -------------------------------------------------------------------- the runs

const instances: Machine<Fixture>[] = []

afterEach(() => {
  for (const tour of instances.splice(0)) tour.stop()
  vi.restoreAllMocks()
})

interface Trace {
  target: string
  seed: string
  states: Record<string, Itf>[]
}

// Read off disk rather than imported one by one, so that a trace added by
// `pnpm model:traces` is replayed without anybody having to remember to say so
// here. What keeps that from quietly meaning nothing is the first test below.
const corpus = fileURLToPath(new URL('../model/traces/', import.meta.url))

/**
 * What the corpus as a whole got to. `drain` is a lot of machinery to have
 * standing idle, and a corpus that stopped putting calls inside a teardown
 * would leave every assertion in it green about nothing.
 */
const exercised = { teardownCalls: 0 }

// And the alarm itself. Counting without reading the count is the same silence
// with an extra step in it.
afterAll(() => {
  expect(exercised.teardownCalls, 'no trace put a call inside a teardown').toBeGreaterThan(0)
})

const named = readdirSync(corpus)
  .filter((file) => file.endsWith('.itf.json'))
  .toSorted()
  .map(
    (file) =>
      [
        file.replace('.itf.json', ''),
        JSON.parse(readFileSync(corpus + file, 'utf8')) as Trace,
      ] as const,
  )

describe('every trace the model found', () => {
  // A corpus that quietly emptied would leave this file green and testing
  // nothing, which is the one way a harness like this fails silently.
  test('is there', () => {
    expect(named.length).toBeGreaterThan(0)
  })

  for (const [name, trace] of named) {
    test(`${name}, which is how the model reaches ${trace.target}`, async () => {
      // `failed` rethrows through `queueMicrotask` so an application's exception
      // lands uncaught rather than as an unhandled rejection. Uncaught is what
      // this file is not allowed to have, so they are collected instead.
      const escaped: (() => void)[] = []
      vi.spyOn(globalThis, 'queueMicrotask').mockImplementation((fn) => void escaped.push(fn))

      const first = snapshot(trace.states[0]!)
      // The story objects, the presenter and the machine each need the other
      // two, so they are closed over rather than handed round. `run` is the one
      // thing every closure reaches for, and it is whole before any of them is
      // called.
      let run!: Run
      const reports: Run['reports'] = []
      const problems: Problem<Fixture>[] = []
      let fake!: Recorder
      const stories = build(trace.states[0]!, () => run)
      const tour = new Machine<Fixture>(
        {
          onStep: (step) => {
            reports.push(step?.id)
            drain(run)
          },
          onDiagnostic: (problem) => void problems.push(problem),
        },
        (host) => {
          fake = new Recorder(host)
          return fake
        },
      )
      instances.push(tour)
      run = {
        tour,
        fake,
        stories,
        guardOk: true,
        reports,
        handlers: [],
        problems,
        window: [],
      }
      for (const story of stories.values()) {
        const entered = story.onEnter!
        story.onEnter = (self) => {
          run.handlers.push({ kind: 'enter', who: `story:${self.id}` })
          return entered(self)
        }
        story.onLeave = (self) => {
          run.handlers.push({ kind: 'leave', who: `story:${self.id}` })
          drain(run)
        }
        for (const step of story.steps) {
          const opened = step.onEnter!
          step.onEnter = (self) => {
            run.handlers.push({ kind: 'enter', who: `step:${self.id}` })
            return opened(self)
          }
          step.onLeave = (self) => {
            run.handlers.push({ kind: 'leave', who: `step:${self.id}` })
            drain(run)
          }
        }
      }

      // A trace harvested from `initRunning` opens with a story already running,
      // because the deep search starts there rather than spending its steps
      // getting there. Starting it is the whole of that action, and `agrees`
      // below is what says so.
      if (first.position) run.tour.start(stories.get(first.position.story)!)
      await turn()

      agrees(run, first, 'state 0')

      const states = trace.states.map((raw) => snapshot(raw))
      const nameOf = (at: number): string =>
        `state ${at}, after ${states[at]!.action} (${states[at]!.mark})`

      let before = first
      let index = 1
      while (index < states.length) {
        const opening = states[index]!
        const seenBefore = observe(run)
        const problemsBefore = run.problems.length
        const retoldBefore = run.fake.retold.length
        const rejectedBefore = run.fake.rejected
        const wasAt = before.position

        // A teardown runs its handlers and its report inside the call that
        // began it, so every trace state from here to the end of it happened
        // during the one call about to be made. The calls among them go to the
        // handlers; `doLeave` is the machine carrying on and is not a call.
        let last = index
        if (opening.leaving.size > 0 && before.leaving.size === 0) {
          while (last + 1 < states.length && states[last]!.leaving.size > 0) {
            last += 1
            const inner = states[last]!
            if (inner.action === 'doLeave') continue
            run.window.push({ now: inner, where: nameOf(last) })
          }
        }
        const queued = run.window.length

        await dispatch(run, opening)

        expect(run.window, `${nameOf(index)}: the teardown ran no handler`).toHaveLength(0)
        if (queued > 0) exercised.teardownCalls += queued

        // A trace that stops part way through a teardown leaves nothing out
        // here to hold the machine against: the real one finished the ending
        // inside the call above, and the model is still in the middle of it.
        // What those states claimed was checked in `drain`, as they were made.
        const now = states[last]!
        if (now.leaving.size > 0) break
        const where = nameOf(last)
        agrees(run, now, where)

        // 6. While the phase is closed, no call from the application changes
        //    anything, and `stop()` is the one exception. The model says which
        //    calls the gate turned down; what has to be checked here is that the
        //    real one did nothing about them.
        if (REFUSALS.includes(now.mark)) {
          expect(observe(run), `${where}: the gate was open`).toEqual(seenBefore)
          // And said so. A refusal has no other symptom: the tour simply does
          // not move, and without this nothing anywhere says why.
          expect(run.problems.length, `${where}: refused in silence`).toBe(problemsBefore + 1)
        }
        // 5. A morph settling for a position the tour has already left changes
        //    nothing, and neither does a report about a step it has walked away
        //    from. `position` is replaced on every move and on nothing else, so
        //    holding the object is holding the step occurrence.
        if (now.mark === 'lose-stale') {
          expect(observe(run), `${where}: something the tour had left moved it`).toEqual(seenBefore)
        }
        // An unmatched `reached()` is free and silent, permanently, because
        // instrumentation has to be able to stay in a build where no tour runs.
        if (now.mark === 'unmatched') {
          expect(observe(run), `${where}: a signal nobody awaited did something`).toEqual(
            seenBefore,
          )
          expect(run.problems.length, `${where}: and said something about it`).toBe(problemsBefore)
        }
        // 7. A refusal is never silent, and it says why only where the step
        //    gave words for it. Both halves are read off the step, so neither
        //    is a choice anything makes at the moment of the refusal.
        if (['refuse-said', 'refuse-mute'].includes(now.mark)) {
          expect(run.fake.rejected, `${where}: the presenter was never told to reject`).toBe(
            rejectedBefore + 1,
          )
        }
        if (now.mark === 'refuse-said') {
          expect(run.fake.retold.length, `${where}: the words never reached the presenter`).toBe(
            retoldBefore + 1,
          )
          expect(run.fake.retold.at(-1)?.reason, `${where}: and they went without the words`).toBe(
            REASON,
          )
        }
        if (now.mark === 'refuse-mute') {
          expect(
            run.fake.retold.length,
            `${where}: a step with nothing to say said something`,
          ).toBe(retoldBefore)
        }
        // 4. No signal advances a step the presenter has not been given.
        if (['doReached', 'doPress'].includes(now.action) && !same(wasAt, now.position)) {
          expect(seenBefore.drawn, `${where}: advanced a step nothing had drawn`).toBe(
            wasAt && stepOf(run, wasAt).id,
          )
        }

        before = now
        index = last + 1
      }

      balanced(run, 'the whole trace')
      // The tour is torn down as many times as it ended, and the recorder saw
      // every one of them.
      expect(fake.torn).toBeGreaterThanOrEqual(0)
      for (const throwing of escaped) expect(throwing).toThrow()
    })
  }
})
