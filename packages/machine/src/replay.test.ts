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
// `packages/machine/model/README.md` says which claims live here rather than
// in the model, how a trace gets here, and what to do when one of these fails.

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
  drawn: Pos | undefined
  presenterUp: boolean
  /**
   * Every teardown the model has begun and not finished, by token. What they
   * mark out is the run of trace states that happened during one `dispatch`.
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
// Built from the trace rather than written out again here.
// `packages/machine/model/README.md` says why the model carries the world at
// all, and what a fixture written twice would cost.

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
 * than refused. `packages/machine/model/phases.md` says where it is reached
 * instead.
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
   * Calls waiting for a handler to make them. Queued before the call that opens
   * the teardown and made from inside it, because
   * `packages/machine/model/README.md` says there is no moment out in the
   * driver to make them from. See {@link drain}.
   */
  window: Windowed[]
}

/**
 * `Fake`, and a note of what is on screen.
 *
 * `drawn` and `presenterUp` are things `machine.ts` keeps implicitly — the
 * presenter holds them — so the model has to state them and something here has
 * to answer for them. Overriding the two methods that move them is the only
 * place that answer can come from without `Fake` growing a field no other test
 * has a use for.
 */
class Recorder extends Fake {
  drawn: Step | undefined
  presenterUp = false

  override show(step: Step, anchor: Anchor | null): void {
    this.presenterUp = true
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
function build(raw: Itf, run: () => Run): Map<string, Story> {
  const world = map(raw)
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
        // Asked in the turn the guard says no, so there is nothing for the
        // trace to spend later.
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
 * Empty the microtask queue. Nothing in the machine is asynchronous, so one
 * turn would do; three is slack.
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
    case 'doLose':
      run.fake.lose(stepOf(run, pos(picks['losePick']!)))
      break
    case 'doLeave':
      // Not a call at all: by the time the driver reads this state the machine
      // has long since been through it.
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
 * is faithful enough: every state in the window is the same state.
 */
function drain(run: Run): void {
  // Only from inside a teardown, and `tour.state` is how it knows.
  // `packages/machine/model/README.md` says why that answer tells the two apart.
  if (run.window.length === 0 || run.tour.state !== 'idle') return
  for (const { now, where } of run.window.splice(0)) {
    const seen = observe(run)
    const problems = run.problems.length
    makeCall(run, now)
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

/** Claim 3 of `packages/machine/model/README.md`. */
function balanced(run: Run, where: string): void {
  const open: string[] = []
  for (const { kind, who } of run.handlers) {
    if (kind === 'enter') {
      expect(open, `${where}: ${who} was entered twice without leaving`).not.toContain(who)
      open.push(who)
      continue
    }
    // DESIGN.md, **The story's `onLeave` runs when the run ends, after the last
    // step's**.
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
  /** The model's `world`, written once. See {@link build}. */
  world: Itf
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
  test('is there', () => {
    expect(named.length).toBeGreaterThan(0)
  })

  for (const [name, trace] of named) {
    test(`${name}, which is how the model reaches ${trace.target}`, async () => {
      // `globals.d.ts` says why `failed` rethrows through `queueMicrotask`.
      // Uncaught is what this file is not allowed to have, so they are
      // collected instead.
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
      const stories = build(trace.world, () => run)
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

        // Every trace state from here to the end of the teardown happened
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

        // Claim 6 of `packages/machine/model/README.md`.
        if (REFUSALS.includes(now.mark)) {
          expect(observe(run), `${where}: the gate was open`).toEqual(seenBefore)
          // And said so — DESIGN.md, **Saying that a call did nothing**.
          expect(run.problems.length, `${where}: refused in silence`).toBe(problemsBefore + 1)
        }
        // Claim 5 of `packages/machine/model/README.md`.
        if (now.mark === 'lose-stale') {
          expect(observe(run), `${where}: something the tour had left moved it`).toEqual(seenBefore)
        }
        // DESIGN.md, **Safe to call anytime**.
        if (now.mark === 'unmatched') {
          expect(observe(run), `${where}: a signal nobody awaited did something`).toEqual(
            seenBefore,
          )
          expect(run.problems.length, `${where}: and said something about it`).toBe(problemsBefore)
        }
        // Claim 7 of `packages/machine/model/README.md`.
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
        // Claim 4 of `packages/machine/model/README.md`.
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
      const ended = run.handlers.filter(
        ({ kind, who }) => kind === 'leave' && who.startsWith('story:'),
      ).length
      expect(
        fake.torn,
        'the whole trace: torn down a different number of times than it ended',
      ).toBe(ended)
      for (const throwing of escaped) expect(throwing).toThrow()
    })
  }
})
