import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, test, vi } from 'vitest'

import type { Anchor, Step, Story } from './fake.js'
import { Fake } from './fake.js'
import { Machine } from './machine.js'
import type { Content } from './port.js'
import type { ErrorUtils, Problem } from './types.js'

// Every trace under `../model/traces/` driven into the real machine, call by
// call, with the model's own state as the oracle at each one.
//
// `../model/machine.qnt` carries two invariants, because those two are the only
// ones on the list in issue #52 that a state predicate can see. The rest are
// claims about what a *transition* did — "nothing moved", "exactly one
// `onLeave`", "every `previous` is where the last report arrived" — and a
// predicate over one state cannot see a transition at all. Writing them into the
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
  announced: Pos | undefined
  showing: number | undefined
  drawn: Pos | undefined
  presenterUp: boolean
  /** Every outstanding `onEnter`, by the token the model gave it. */
  entering: Map<number, Pos>
  /** Every `ErrorUtils` a handler has not answered with yet, by its token. */
  holding: Map<number, Pos>
  slow: boolean
  registered: string[]
  /** Which way the action went. See `mark` in the model. */
  mark: string
}

const snapshot = (raw: Record<string, Itf>): Snapshot => {
  const m = raw['m'] as Record<string, Itf>
  const entering = new Map<number, Pos>()
  for (const callback of set(m['inflight'])) {
    if (tag(callback) === 'Morph') continue
    const body = payload(callback) as { token: Itf; at: Itf }
    entering.set(int(body.token), pos(body.at))
  }
  const holding = new Map<number, Pos>()
  for (const utils of set(m['holding'])) {
    const body = utils as { token: Itf; at: Itf }
    holding.set(int(body.token), pos(body.at))
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
    announced: maybe(m['announced'], pos),
    showing: maybe(m['showing'], int),
    drawn: maybe(m['drawn'], pos),
    presenterUp: m['presenterUp'] as boolean,
    entering,
    holding,
    slow: m['slow'] as boolean,
    registered: set(m['registered']).map(str),
    mark: m['mark'] as string,
  }
}

/** `Machine.state`, derived the way the model derives it. */
const stateOf = (s: Snapshot): string =>
  s.position === undefined ? 'idle' : s.phase === 'Ready' ? 'running' : 'transitioning'

// ------------------------------------------------------------------- the world
//
// Built from the trace rather than written out again here. `world` is a model
// variable so that it lands in every ITF state, which is what lets the fixture
// have one definition instead of two that can drift apart.

interface Deferred {
  promise: Promise<void>
  resolve: () => void
  reject: (reason: unknown) => void
}

const defer = (): Deferred => {
  let resolve!: () => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<void>((yes, no) => {
    resolve = yes
    reject = no
  })
  // The rejection is answered by the machine, and a test that let one reach the
  // runtime unhandled would fail for the wrong reason.
  promise.catch(() => {})
  return { promise, resolve, reject }
}

/** What one run of one trace needs to hold on to while it drives the machine. */
interface Run {
  tour: Machine<Anchor, Step, Story>
  fake: Recorder
  stories: Map<string, Story>
  /** Every `onEnter` still in flight, in the order the machine asked for them. */
  made: Deferred[]
  /** Bound to a model token once the trace says which one it got. */
  pending: Map<number, Deferred>
  /** What `validate` answers. */
  guardOk: boolean
  /**
   * Every `ErrorUtils` the machine has handed over and the trace has not said
   * what to do with yet.
   *
   * `onValidationError` returns `void`, so a handler is free to look something
   * up and answer a second later. Holding them here is what lets the trace say
   * `doSetError` several calls after the attempt that made them.
   */
  madeUtils: ErrorUtils[]
  heldUtils: Map<number, ErrorUtils>
  /** Every `onStep`, as the pair it was called with. */
  reports: { step: string | undefined; previous: string | undefined }[]
  /** `onEnter` and `onLeave`, in order, as `story:a` or `step:a1`. */
  handlers: { kind: 'enter' | 'leave'; who: string }[]
  problems: Problem<Step>[]
}

/**
 * `Fake`, and a note of what is on screen.
 *
 * `drawn` and `presenterUp` are things `machine.ts` keeps implicitly — the
 * presenter holds them — so the model has to state them and something here has
 * to answer for them. Overriding the four methods that move them is the only
 * place that answer can come from without `Fake` growing a field the other 76
 * tests have no use for.
 */
class Recorder extends Fake {
  drawn: Step | undefined
  presenterUp = false

  override hold(story: Story, step: Step | undefined): void {
    this.drawn = undefined
    this.presenterUp = true
    super.hold(story, step)
  }

  override show(
    story: Story,
    step: Step,
    anchor: Anchor | null,
    content: Content,
  ): Promise<void> | void {
    this.presenterUp = true
    // A missing anchor is `Host.lost` and nothing drawn, which is what the model
    // says too.
    if (anchor !== null) this.drawn = step
    return super.show(story, step, anchor, content)
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
    const story = spec as { id: string; steps: Itf[]; slowEnter: boolean; throwsOnEnter: boolean }
    stories.set(story.id, {
      id: story.id,
      onEnter: () => {
        if (story.throwsOnEnter) throw new Error(`story ${story.id} would not open`)
        if (!story.slowEnter) return
        const deferred = defer()
        run().made.push(deferred)
        return deferred.promise
      },
      steps: story.steps.map((entry) => {
        const shape = entry as {
          id: string
          target: string
          awaits: Itf
          hasGuard: boolean
          slowEnter: boolean
          throwsOnEnter: boolean
        }
        const step: Step = {
          id: shape.id,
          target: shape.target,
          message: shape.id,
          awaits: maybe(shape.awaits, str),
          onEnter: () => {
            if (shape.throwsOnEnter) throw new Error(`step ${shape.id} would not open`)
            if (!shape.slowEnter) return
            const deferred = defer()
            run().made.push(deferred)
            return deferred.promise
          },
        }
        if (shape.hasGuard) {
          step.validate = () => run().guardOk
          // Kept rather than answered. What the handler does with these, and
          // when, is an action of its own in the model.
          step.onValidationError = (_anchor, utils) => void run().madeUtils.push(utils)
        }
        return step
      }),
    })
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
async function dispatch(run: Run, now: Snapshot, before: Snapshot): Promise<void> {
  const { picks } = now
  switch (now.action) {
    case 'doSetStory':
      run.tour.setStory(run.stories.get(str(picks['storyPick']!))!)
      break
    case 'doStart':
      run.tour.start(str(picks['startPick']!))
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
    case 'doSetError':
      answer(run, picks['errorPick']!).setError('not yet')
      break
    case 'doShake':
      answer(run, picks['shakePick']!).shake()
      break
    case 'doResize':
      run.fake.resize()
      break
    case 'doLose':
      run.fake.lose(stepOf(run, pos(picks['losePick']!)))
      break
    case 'doHunt':
      run.fake.hunt(stepOf(run, pos(picks['huntPick']!)))
      break
    case 'doFound':
      run.fake.found(stepOf(run, pos(picks['foundPick']!)))
      break
    case 'doSetSlow':
      run.fake.slow = picks['slowPick'] as boolean
      break
    case 'doSettle':
      settle(run, picks['settlePick']!, before, false)
      break
    case 'doFail':
      settle(run, picks['failPick']!, before, true)
      break
    default:
      throw new Error(`no call for ${now.action}`)
  }
  await turn()
}

/**
 * The `ErrorUtils` the trace's pick names, taken out of the run as it is spent.
 *
 * The machine hands these to `onValidationError` and never mentions them again,
 * so the token the model gave one is the only way back to it.
 */
function answer(run: Run, pick: Itf): ErrorUtils {
  const token = int((pick as { token: Itf }).token)
  const utils = run.heldUtils.get(token)
  expect(utils, `no ErrorUtils is held for token ${token}`).toBeDefined()
  run.heldUtils.delete(token)
  return utils!
}

function settle(run: Run, callback: Itf, before: Snapshot, fails: boolean): void {
  const kind = tag(callback)
  const body = payload(callback) as { token: Itf }
  const token = int(body.token)
  if (kind === 'Morph') {
    // The model keeps a morph outstanding until something settles it. `Fake`
    // resolves the one it is holding the moment the next `show` starts, so by
    // here a stale token has already landed and done nothing. Landing the
    // current morph would then be landing the wrong one.
    if (before.showing === token) run.fake.land()
    return
  }
  const deferred = run.pending.get(token)
  expect(deferred, `no onEnter is in flight for token ${token}`).toBeDefined()
  run.pending.delete(token)
  if (fails) deferred!.reject(new Error(`onEnter ${token} gave up`))
  else deferred!.resolve()
}

/**
 * Bind the `onEnter` the machine just asked for to the token the model gave it.
 *
 * The model allocates a token in `park` and the machine builds a promise at the
 * same point, but nothing carries one to the other. Rather than counting along
 * in parallel and hoping, this reads which token the model added and hands it
 * whatever the machine made in the same turn — and checks the two came out even,
 * which is a divergence worth hearing about on its own.
 */
function bind(run: Run, before: Snapshot, now: Snapshot): void {
  const fresh = [...now.entering.keys()].filter((token) => !before.entering.has(token))
  expect(run.made.length, `the model parked ${fresh.length} onEnter calls`).toBe(fresh.length)
  for (const [index, token] of fresh.entries()) run.pending.set(token, run.made[index]!)
  run.made.length = 0
  for (const token of before.entering.keys()) {
    if (!now.entering.has(token)) run.pending.delete(token)
  }

  const handed = [...now.holding.keys()].filter((token) => !before.holding.has(token))
  expect(run.madeUtils.length, `the model handed over ${handed.length} ErrorUtils`).toBe(
    handed.length,
  )
  for (const [index, token] of handed.entries()) run.heldUtils.set(token, run.madeUtils[index]!)
  run.madeUtils.length = 0
  for (const token of before.holding.keys()) {
    if (!now.holding.has(token)) run.heldUtils.delete(token)
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
  // 4. `onStep` chains: every `previous` is the step the last report arrived at.
  const last = run.reports.at(-1)
  expect(last?.step, `${where}: the step onStep last named`).toBe(
    now.announced && stepOf(run, now.announced).id,
  )
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

/** 4. Every `previous` is the step the report before it arrived at. */
function chains(run: Run, where: string): void {
  let arrived: string | undefined
  for (const { step, previous } of run.reports) {
    expect(previous, `${where}: onStep left from somewhere it never arrived at`).toBe(arrived)
    arrived = step
  }
}

// -------------------------------------------------------------------- the runs

const instances: Machine<Anchor, Step, Story>[] = []

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
      const problems: Problem<Step>[] = []
      let fake!: Recorder
      const stories = build(trace.states[0]!, () => run)
      const tour = new Machine<Anchor, Step, Story>(
        {
          onStep: (step, previous) => void reports.push({ step: step?.id, previous: previous?.id }),
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
        made: [],
        pending: new Map(),
        guardOk: true,
        madeUtils: [],
        heldUtils: new Map(),
        reports,
        handlers: [],
        problems,
      }
      for (const story of stories.values()) {
        const entered = story.onEnter!
        story.onEnter = (self) => {
          run.handlers.push({ kind: 'enter', who: `story:${self.id}` })
          return entered(self)
        }
        story.onLeave = (self) => void run.handlers.push({ kind: 'leave', who: `story:${self.id}` })
        for (const step of story.steps) {
          const opened = step.onEnter!
          step.onEnter = (self) => {
            run.handlers.push({ kind: 'enter', who: `step:${self.id}` })
            return opened(self)
          }
          step.onLeave = (self) => void run.handlers.push({ kind: 'leave', who: `step:${self.id}` })
        }
      }

      // A trace harvested from `initRunning` opens with a story already running,
      // because the deep search starts there rather than spending its steps
      // getting there. Registering and starting is the whole of that action, and
      // `agrees` below is what says so.
      for (const id of first.registered) run.tour.setStory(stories.get(id)!)
      if (first.position) run.tour.start(first.position.story)
      await turn()

      agrees(run, first, 'state 0')

      let before = first
      for (const [index, raw] of trace.states.slice(1).entries()) {
        const now = snapshot(raw)
        const where = `state ${index + 1}, after ${now.action} (${now.mark})`
        const seenBefore = observe(run)
        const problemsBefore = run.problems.length
        const retoldBefore = run.fake.retold.length
        const rejectedBefore = run.fake.rejected
        const wasAt = before.position

        await dispatch(run, now, before)
        bind(run, before, now)
        agrees(run, now, where)

        // 7. While the phase is closed, no call from the application changes
        //    anything, and `stop()` is the one exception. The model says which
        //    calls the gate turned down; what has to be checked here is that the
        //    real one did nothing about them.
        if (now.mark === 'refused') {
          expect(observe(run), `${where}: the gate was open`).toEqual(seenBefore)
          // And said so. A refusal has no other symptom: the tour simply does
          // not move, and without this nothing anywhere says why.
          expect(run.problems.length, `${where}: refused in silence`).toBe(problemsBefore + 1)
        }
        // 6. A callback settling for a position the tour has already left
        //    changes nothing. `position` is replaced on every move and on
        //    nothing else, so holding the object is holding the step occurrence.
        if (['morph-stale', 'settle-stale', 'lose-stale', 'hunt-stale'].includes(now.mark)) {
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
        // 8. A failed attempt writes its words on the attempt they were about.
        //    `errorUtils` closes over the position, so a handler that looked
        //    something up and answered a second later writes nothing anywhere.
        if (now.mark === 'set-error') {
          expect(run.fake.retold.length, `${where}: the message never reached the presenter`).toBe(
            retoldBefore + 1,
          )
          expect(
            run.fake.retold.at(-1)?.content.error,
            `${where}: and it went without the words`,
          ).toBe('not yet')
        }
        if (now.mark === 'set-error-stale') {
          expect(
            run.fake.retold.length,
            `${where}: a late answer rewrote a step the tour had left`,
          ).toBe(retoldBefore)
          expect(observe(run), `${where}: a late answer moved the tour`).toEqual(seenBefore)
        }
        if (now.mark === 'shake') {
          expect(run.fake.rejected, `${where}: the presenter was never told to reject`).toBe(
            rejectedBefore + 1,
          )
        }
        if (now.mark === 'shake-stale') {
          expect(
            run.fake.rejected,
            `${where}: a late shake rejected a step the tour had left`,
          ).toBe(rejectedBefore)
        }
        // 5. No signal advances a step the presenter has not been given.
        if (['doReached', 'doPress'].includes(now.action) && !same(wasAt, now.position)) {
          expect(seenBefore.drawn, `${where}: advanced a step nothing had drawn`).toBe(
            wasAt && stepOf(run, wasAt).id,
          )
        }

        before = now
      }

      balanced(run, 'the whole trace')
      chains(run, 'the whole trace')
      // The tour is torn down as many times as it ended, and the recorder saw
      // every one of them.
      expect(fake.torn).toBeGreaterThanOrEqual(0)
      for (const throwing of escaped) expect(throwing).toThrow()
    })
  }
})
