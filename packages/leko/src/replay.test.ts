import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import type { Glide } from '@annetaan/leko-spotlight'
import { afterAll, describe, expect, test } from 'vitest'

import { type Effect, type Event, idle, type Mode, type Pending, pointsAt, reduce } from './plan.js'
import type { LekoStep } from './types.js'

// The corpus, driven event by event into the real `reduce`.
// `machine/src/replay.test.ts` shows the method. What is different here — no
// browser, nothing asynchronous, a real plan over fake effects — is in
// `packages/leko/model/README.md`, and so is every claim asserted below.

// ------------------------------------------------------------------ ITF values
//
// `machine/src/replay.test.ts` shows what the format wraps.

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

// -------------------------------------------------------------- the model's state

/** `Pending` in the model: a step, how it is to be drawn, and its identity. */
interface Wait {
  step: string
  animate: boolean
  token: number
}

const wait = (value: Itf): Wait => {
  const record = value as { step: string; animate: boolean; token: Itf }
  return { step: record.step, animate: record.animate, token: int(record.token) }
}

/** `Picture` in the model, which is `Drawn` in `plan.ts`. */
interface Picture {
  step: string
  error: string | undefined
}

const picture = (value: Itf): Picture => {
  const record = value as { step: string; error: Itf }
  return { step: record.step, error: maybe(record.error, str) }
}

/** The model's `Mode`, flattened into the fields any variant might carry. */
interface Told {
  kind: string
  glide: number | undefined
  pending: Wait | undefined
  unmeasured: boolean | undefined
  error: string | undefined
  standing: Picture | undefined
  step: string | undefined
}

function told(value: Itf): Told {
  const bare = {
    kind: tag(value),
    glide: undefined,
    pending: undefined,
    unmeasured: undefined,
    error: undefined,
    standing: undefined,
    step: undefined,
  }
  if (bare.kind === 'Idle') return bare
  if (bare.kind === 'Drawn') {
    const drawn = picture(payload(value))
    return { ...bare, step: drawn.step, error: drawn.error }
  }
  const inner = payload(value) as {
    glide?: Itf
    pending: Itf
    unmeasured?: Itf
    error: Itf
    standing: Itf
  }
  return {
    ...bare,
    glide: inner.glide === undefined ? undefined : int(inner.glide),
    pending: wait(inner.pending),
    unmeasured: inner.unmeasured === undefined ? undefined : (inner.unmeasured as boolean),
    error: maybe(inner.error, str),
    standing: maybe(inner.standing, picture),
  }
}

/**
 * One effect, in a shape both sides can be written to.
 * `packages/leko/model/README.md` says what that shape keeps and what it drops.
 */
interface Owed {
  kind: string
  step?: string
  error?: string | undefined
  anchor?: boolean
  animate?: boolean
  saying?: boolean
  reason?: string
  glide?: number
}

/** One of the model's `Effect`s, as {@link Owed}. `Reword` is the plan's `retell`. */
function toldEffect(value: Itf): Owed {
  const kind = tag(value)
  const inner = payload(value) as Record<string, Itf>
  switch (kind) {
    case 'Abandon':
      return { kind: 'abandon', glide: int(payload(value)) }
    case 'Hide':
      return { kind: 'hide' }
    case 'Disarm':
      return { kind: 'disarm' }
    case 'Cancel':
      return { kind: 'cancel' }
    case 'Destroy':
      return { kind: 'destroy' }
    case 'Hunt':
      return { kind: 'hunt', step: str(inner['step']) }
    case 'Lost':
      return { kind: 'lost', step: str(inner['step']) }
    case 'Deadline': {
      const pending = wait(payload(value))
      return { kind: 'deadline', step: pending.step, animate: pending.animate }
    }
    case 'Reveal': {
      const drawn = picture(inner['drawn'])
      return {
        kind: 'reveal',
        step: drawn.step,
        error: drawn.error,
        anchor: inner['anchor'] as boolean,
        animate: inner['animate'] as boolean,
      }
    }
    case 'Replace': {
      const drawn = picture(inner['drawn'])
      return {
        kind: 'replace',
        step: drawn.step,
        error: drawn.error,
        saying: inner['saying'] as boolean,
      }
    }
    case 'Say': {
      const drawn = picture(payload(value))
      return { kind: 'say', step: drawn.step, error: drawn.error }
    }
    case 'Reword':
      return { kind: 'retell', step: str(inner['step']), reason: str(inner['reason']) }
    case 'Arrive': {
      const pending = wait(inner['pending'])
      return {
        kind: 'arrive',
        step: pending.step,
        animate: pending.animate,
        error: maybe(inner['error'], str),
      }
    }
    default:
      throw new Error(`the trace owes an effect this cannot read: ${kind}`)
  }
}

/** The three knobs on the page an action turns. `Knobs` in the model. */
interface Knobs {
  somewhere: boolean
  measured: boolean
  outright: boolean
}

const knobs = (value: Itf): Knobs => value as Knobs

/** One trace state, in the terms the plan and its shell use. */
interface Snapshot {
  action: string
  picks: Record<string, Itf | undefined>
  mode: Told
  watcher: { kind: string; step: string | undefined }
  deadline: Wait | undefined
  screen: string | undefined
  messageUp: boolean
  onPage: boolean
  morphing: string | undefined
  moving: number[]
  page: string[]
  /** Which way each `reduce` of the action went, outermost first. See `marks`. */
  marks: string[]
  /** What each of those `reduce` calls owed, in order. See `outcomes`. */
  outcomes: Owed[][]
  /** Every glide ever minted and every wait ever begun, by token, in mint order. */
  glides: number[]
  waits: number[]
  /** Which mode the action found. See `from`. */
  from: string
}

const snapshot = (raw: Record<string, Itf>): Snapshot => {
  const m = raw['m'] as Record<string, Itf>
  const picks = (raw['mbt::nondetPicks'] ?? {}) as Record<string, Itf>
  const watcher = m['watcher']
  return {
    action: raw['mbt::actionTaken'] as string,
    picks: Object.fromEntries(
      Object.entries(picks).map(([name, value]) => [
        name,
        tag(value) === 'Some' ? payload(value) : undefined,
      ]),
    ),
    mode: told(m['mode']),
    watcher: {
      kind: tag(watcher),
      step: tag(watcher) === 'Off' ? undefined : str(payload(watcher)),
    },
    deadline: maybe(m['deadline'], wait),
    screen: maybe(m['screen'], str),
    messageUp: m['messageUp'] as boolean,
    onPage: m['onPage'] as boolean,
    morphing: maybe(m['morphing'], str),
    moving: set(m['moving'])
      .map(int)
      .toSorted((a, b) => a - b),
    page: set(m['page']).map(str).toSorted(),
    marks: (m['marks'] as Itf[]).map(str),
    outcomes: (m['outcomes'] as Itf[][]).map((effects) => effects.map(toldEffect)),
    // Ascending is mint order. See {@link Shell.learn}.
    glides: set(m['glides'])
      .map(int)
      .toSorted((a, b) => a - b),
    waits: set(m['waits'])
      .map(wait)
      .map((w) => w.token)
      .toSorted((a, b) => a - b),
    from: m['from'] as string,
  }
}

// ------------------------------------------------------------------- the world
//
// Out of the trace, not written again here —
// `packages/leko/model/README.md` says why it is a model variable at all.

/** The steps the model's world holds, by the name the model calls them. */
function build(raw: Itf): Map<string, LekoStep> {
  const steps = new Map<string, LekoStep>()
  for (const [name, spec] of map(raw)) {
    const shape = spec as { id: string; target: Itf }
    const target = maybe(shape.target, str)
    // A step that points at nothing has no `target` at all, which is what makes
    // it the step that waits. One that points somewhere names its target by
    // selector, so `pointsAt` and the page below agree about it.
    steps.set(name, target === undefined ? { id: shape.id } : { id: shape.id, target })
  }
  return steps
}

/** The one target name a step is looked up by on the page, where it has one. */
const targetOf = (step: LekoStep): string | undefined =>
  typeof step.target === 'string' ? step.target : undefined

/** Opaque to the plan — `plan.test.ts` strikes the same bargain. */
const ANCHOR = { id: 'anchor' } as unknown as Element

/** What a guard says when it refuses. Which words is not the question here. */
const REASON = 'no'

// -------------------------------------------------------------- the fake shell
//
// `perform` in `plan.qnt`, written in TypeScript —
// `packages/leko/model/README.md` says what it stands in for.

/**
 * A `Glide` that never lands on its own, and remembers how it ended.
 *
 * `abandoned` is the shell having called `abandon()` on this object, which is
 * the plan naming it in an `abandon` effect. `landed` is the page having
 * stopped where this glide was carrying it, which is a `settled` the mode was
 * still waiting for. Every glide ends one of the two ways, and nothing here
 * ends both.
 */
class Flight implements Glide {
  readonly settled = new Promise<void>(() => {})
  abandoned = false
  landed = false

  abandon(): void {
    this.abandoned = true
  }
}

class Shell {
  mode: Mode = idle
  watcher: { kind: 'hunting'; step: LekoStep } | undefined
  deadline: Pending | undefined
  screen: LekoStep | undefined
  messageUp = false
  onPage = false
  morphing: LekoStep | undefined
  readonly moving = new Set<Flight>()
  page: Set<string>
  /** What the action running now says the page answers. Set before every call. */
  knobs: Knobs = { somewhere: false, measured: true, outright: true }
  /**
   * The identities the model names by token, as the objects the plan made.
   * Filled by {@link learn} off the two lists below.
   */
  readonly glides = new Map<number, Flight>()
  readonly waits = new Map<number, Pending>()
  /** Every glide this minted, in the order it minted them. */
  readonly flights: Flight[] = []
  /** Every `Pending` the plan committed to a mode, in the order it committed them. */
  readonly begun: Pending[] = []
  /** What each `reduce` of the action running now owed, outermost first. */
  owed: Effect[][] = []

  constructor(
    private readonly steps: Map<string, LekoStep>,
    page: Iterable<string>,
  ) {
    this.page = new Set(page)
  }

  step(name: string): LekoStep {
    const step = this.steps.get(name)
    if (!step) throw new Error(`the trace names a step the world has not got: ${name}`)
    return step
  }

  /** The page after the shell saw a step's target resolve or not. `saw` in the model. */
  private saw(step: LekoStep, present: boolean): void {
    const target = targetOf(step)
    if (target === undefined) return
    if (present) this.page.add(target)
    else this.page.delete(target)
  }

  private mint(): Flight {
    const flight = new Flight()
    this.moving.add(flight)
    this.flights.push(flight)
    return flight
  }

  /**
   * `dispatch` in `presenter.ts`, which says why the mode is written first. The
   * effects run in order against whatever the ones before them left.
   */
  dispatch(event: Event): void {
    const outcome = reduce(this.mode, event)
    this.mode = outcome.mode
    // Every mode this commits, not only the one the action ends in: a `Pending`
    // is minted at whatever depth the plan reached, and an outcome further in
    // can replace the mode that carried it.
    if (outcome.mode.kind === 'retrying' || outcome.mode.kind === 'gliding') {
      if (!this.begun.includes(outcome.mode.pending)) this.begun.push(outcome.mode.pending)
    }
    this.owed.push([...outcome.effects])
    for (const effect of outcome.effects) this.perform(effect)
  }

  private perform(effect: Effect): void {
    switch (effect.kind) {
      case 'abandon':
        effect.glide.abandon()
        this.moving.delete(effect.glide as Flight)
        return
      case 'hide':
        this.messageUp = false
        return
      case 'disarm':
        this.watcher = undefined
        return
      case 'hunt':
        this.watcher = { kind: 'hunting', step: effect.step }
        return
      case 'deadline':
        // `cancel()` then `setTimeout`, so there is never a second one.
        this.deadline = effect.pending
        return
      case 'cancel':
        this.deadline = undefined
        return
      case 'reveal': {
        // `measure` restacks the layers whatever it finds, so something of the
        // tour is on the page from here on either way.
        this.messageUp = false
        this.onPage = true
        if (!this.knobs.measured) {
          this.screen = undefined
          this.morphing = undefined
          this.dispatch({ kind: 'unmeasured', step: effect.drawn.step, animate: effect.animate })
          return
        }
        this.screen = effect.drawn.step
        if (this.knobs.outright) {
          this.morphing = undefined
          this.dispatch({ kind: 'morphed', step: effect.drawn.step })
          return
        }
        this.morphing = effect.drawn.step
        return
      }
      case 'replace': {
        // A step whose target has gone gets the way out and nothing else — no
        // holes, and no words even where `saying` asked. `replace` in
        // `presenter.ts` says why.
        const target = targetOf(effect.drawn.step)
        if (target !== undefined && !this.page.has(target)) return
        // `set`, which halts a morph in flight: it settles unfinished and the
        // shell reports nothing for it.
        this.screen = effect.drawn.step
        this.morphing = undefined
        if (effect.saying) this.messageUp = true
        return
      }
      case 'say':
        this.messageUp = true
        this.onPage = true
        return
      case 'retell':
        this.messageUp = true
        return
      case 'arrive': {
        // The one place a scroll happens, and the hunt's target is resolved, so
        // the `show` always carries an anchor.
        const glide = this.knobs.somewhere ? this.mint() : undefined
        this.dispatch({
          kind: 'show',
          step: effect.pending.step,
          anchor: ANCHOR,
          animate: effect.pending.animate,
          glide,
          error: effect.error,
        })
        return
      }
      case 'lost':
        // `Host.lost`. The machine ends the run and tears this down from inside
        // the call.
        this.dispatch({ kind: 'teardown' })
        return
      case 'destroy':
        this.onPage = false
        this.screen = undefined
        this.messageUp = false
        this.morphing = undefined
        return
    }
  }

  // ------------------------------------------------------------------ the calls
  //
  // One per action in the model, doing what that action does before it
  // dispatches: the page written from what the shell saw, and a glide minted
  // where `bringIntoView` had somewhere to go.

  show(name: string, resolved: boolean, animate: boolean): void {
    const step = this.step(name)
    this.saw(step, resolved)
    const anchor = resolved && pointsAt(step)
    const glide = anchor && this.knobs.somewhere ? this.mint() : undefined
    this.dispatch({
      kind: 'show',
      step,
      anchor: anchor ? ANCHOR : null,
      animate,
      glide,
      error: undefined,
    })
  }

  settled(token: number, landed: boolean): void {
    const flight = this.glides.get(token)
    if (!flight) throw new Error(`the trace settles a glide nothing minted: ${token}`)
    if (this.mode.kind === 'gliding' && this.mode.glide === flight) {
      this.saw(this.mode.pending.step, landed)
      this.moving.delete(flight)
      flight.landed = true
    }
    this.dispatch({ kind: 'settled', glide: flight, anchor: landed ? ANCHOR : null })
  }

  morphed(): void {
    const step = this.morphing
    if (!step) throw new Error('the trace lands a morph that was not in flight')
    this.morphing = undefined
    this.dispatch({ kind: 'morphed', step })
  }

  mutated(name: string, found: boolean): void {
    const step = this.step(name)
    this.saw(step, found)
    this.dispatch({ kind: 'mutated', step, found: found && pointsAt(step) ? ANCHOR : null })
  }

  expired(token: number, found: boolean): void {
    const pending = this.waits.get(token)
    if (!pending) throw new Error(`the trace expires a wait nothing began: ${token}`)
    if (this.deadline === pending) {
      this.saw(pending.step, found)
      this.deadline = undefined
    }
    this.dispatch({
      kind: 'expired',
      pending,
      found: found && pointsAt(pending.step) ? ANCHOR : null,
    })
  }

  /**
   * Tie the model's tokens to the objects the plan and this made, by order —
   * `packages/leko/model/README.md` says why order rather than the mode an
   * action ended in, and what a length that disagrees means.
   *
   * Reading that mode would be right only while no branch that mints an
   * identity also owes a re-entrant effect: true today, unstated, and silent
   * if it stopped being true.
   */
  learn(now: Snapshot, where: string): void {
    const tie = <T>(tokens: number[], made: T[], what: string, into: Map<number, T>): void => {
      if (tokens.length !== made.length) {
        throw new Error(
          `${where}: the model counts ${tokens.length} ${what} and this made ${made.length}. ` +
            'The plan mints them somewhere this no longer follows.',
        )
      }
      tokens.forEach((token, index) => into.set(token, made[index]!))
    }
    tie(now.glides, this.flights, 'glides', this.glides)
    tie(now.waits, this.begun, 'waits', this.waits)
  }

  /** The token the model numbers a glide by, for an effect that names one. */
  tokenOf(glide: Glide): number {
    for (const [token, flight] of this.glides) if (flight === glide) return token
    return -1
  }

  /** One of the plan's effects, as {@link Owed}. */
  render(effect: Effect): Owed {
    switch (effect.kind) {
      case 'abandon':
        return { kind: 'abandon', glide: this.tokenOf(effect.glide) }
      case 'hunt':
        return { kind: 'hunt', step: effect.step.id }
      case 'lost':
        return { kind: 'lost', step: effect.step.id }
      case 'deadline':
        return {
          kind: 'deadline',
          step: effect.pending.step.id,
          animate: effect.pending.animate,
        }
      case 'reveal':
        return {
          kind: 'reveal',
          step: effect.drawn.step.id,
          error: effect.drawn.error,
          anchor: effect.anchor !== null,
          animate: effect.animate,
        }
      case 'replace':
        return {
          kind: 'replace',
          step: effect.drawn.step.id,
          error: effect.drawn.error,
          saying: effect.saying,
        }
      case 'say':
        return { kind: 'say', step: effect.drawn.step.id, error: effect.drawn.error }
      case 'retell':
        return { kind: 'retell', step: effect.step.id, reason: effect.reason }
      case 'arrive':
        return {
          kind: 'arrive',
          step: effect.pending.step.id,
          animate: effect.pending.animate,
          error: effect.error,
        }
      case 'hide':
      case 'disarm':
      case 'cancel':
      case 'destroy':
        // The four that carry nothing.
        return { kind: effect.kind }
      default: {
        // Listed above rather than defaulted, so a new kind of `Effect` leaves
        // nothing for this to be and fails to compile. What it does not catch
        // is a payload added to one of the four: this would go on rendering
        // `{ kind: 'hide' }` and so would `toldEffect`, and the two would
        // compare equal. That silence is symmetric rather than a hole, and it
        // is the limit of what rendering to a common shape can say.
        throw new Error(
          `the plan owes an effect this cannot render: ${JSON.stringify(effect satisfies never)}`,
        )
      }
    }
  }
}

// ---------------------------------------------------------------- the checking

/** Everything about the shell a trace state can be held against. */
interface Observed {
  kind: string
  step: string | undefined
  error: string | undefined
  pending: { step: string; animate: boolean } | undefined
  /** Whether a draw began the wait, which is what a deadline's answer turns on. */
  unmeasured: boolean | undefined
  standing: { step: string; error: string | undefined } | undefined
  watcher: string
  watching: string | undefined
  deadline: string | undefined
  screen: string | undefined
  messageUp: boolean
  onPage: boolean
  morphing: string | undefined
  /**
   * Which glide the mode holds, and which are still carrying the page, by the
   * token the model numbers them with. Identities rather than a count, for the
   * reason `packages/leko/model/README.md` gives.
   */
  glide: number | undefined
  moving: number[]
  page: string[]
}

const observe = (shell: Shell): Observed => {
  const { mode } = shell
  const bare = {
    watcher: shell.watcher?.kind ?? 'off',
    watching: shell.watcher?.step.id,
    deadline: shell.deadline?.step.id,
    screen: shell.screen?.id,
    messageUp: shell.messageUp,
    onPage: shell.onPage,
    morphing: shell.morphing?.id,
    moving: [...shell.moving].map((flight) => shell.tokenOf(flight)).toSorted((a, b) => a - b),
    page: [...shell.page].toSorted(),
  }
  const standing = mode.kind === 'retrying' || mode.kind === 'gliding' ? mode.standing : undefined
  return {
    ...bare,
    kind: mode.kind,
    glide: mode.kind === 'gliding' ? shell.tokenOf(mode.glide) : undefined,
    step: mode.kind === 'drawn' ? mode.step.id : undefined,
    error: mode.kind === 'idle' ? undefined : mode.error,
    pending:
      mode.kind === 'retrying' || mode.kind === 'gliding'
        ? { step: mode.pending.step.id, animate: mode.pending.animate }
        : undefined,
    unmeasured: mode.kind === 'retrying' ? mode.unmeasured : undefined,
    standing: standing && { step: standing.step.id, error: standing.error },
  }
}

/** The same reading, off the model. The two are compared field for field. */
const expected = (now: Snapshot): Observed => ({
  kind: now.mode.kind.toLowerCase(),
  step: now.mode.kind === 'Drawn' ? now.mode.step : undefined,
  error: now.mode.error,
  pending: now.mode.pending && { step: now.mode.pending.step, animate: now.mode.pending.animate },
  unmeasured: now.mode.unmeasured,
  standing: now.mode.standing && { step: now.mode.standing.step, error: now.mode.standing.error },
  watcher: now.watcher.kind.toLowerCase(),
  watching: now.watcher.step,
  deadline: now.deadline?.step,
  screen: now.screen,
  messageUp: now.messageUp,
  onPage: now.onPage,
  morphing: now.morphing,
  glide: now.mode.glide,
  moving: now.moving,
  page: now.page,
})

/** The re-entrant effects, which `Outcome` says each list ends with. */
const REENTRANT: ReadonlySet<Effect['kind']> = new Set(['reveal', 'arrive', 'lost'])

// -------------------------------------------------------------------- the runs

interface Trace {
  target: string
  seed: string
  /** The model's `world`. See {@link build}. */
  world: Itf
  states: Record<string, Itf>[]
}

// Read off disk — `machine/src/replay.test.ts` says why, and the first test
// below is what keeps it from quietly meaning nothing.
const corpus = fileURLToPath(new URL('../model/traces/', import.meta.url))

/**
 * Which claims the corpus actually reached, one counter each —
 * `machine/src/replay.test.ts` says why the alarm is here.
 */
const exercised = {
  staleSettled: 0,
  staleExpired: 0,
  expiredArrival: 0,
  expiredUnmeasured: 0,
  settledAbandoned: 0,
  resizedMidGlide: 0,
  glideOverGlide: 0,
}

afterAll(() => {
  expect(exercised.staleSettled, 'no trace landed a stale glide').toBeGreaterThan(0)
  expect(
    exercised.staleExpired,
    'no trace fired a deadline for a wait that had ended',
  ).toBeGreaterThan(0)
  expect(
    exercised.expiredArrival,
    'no trace ran a deadline out onto a target that had turned up',
  ).toBeGreaterThan(0)
  expect(
    exercised.expiredUnmeasured,
    'no trace ran out a deadline that a draw had begun onto a target that was there',
  ).toBeGreaterThan(0)
  expect(
    exercised.settledAbandoned,
    'no trace settled a glide that had been abandoned',
  ).toBeGreaterThan(0)
  expect(exercised.resizedMidGlide, 'no trace resized the window mid-glide').toBeGreaterThan(0)
  expect(
    exercised.glideOverGlide,
    'no trace showed a gliding step over a glide, so nothing exercised the loop below claim 2',
  ).toBeGreaterThan(0)
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
    test(`${name}, which is how the model reaches ${trace.target}`, () => {
      const states = trace.states.map((raw) => snapshot(raw))
      const first = states[0]!
      const shell = new Shell(build(trace.world), first.page)

      const nameOf = (at: number): string =>
        `state ${at}, after ${states[at]!.action} (${states[at]!.marks.join(' → ')})`

      expect(observe(shell), 'state 0').toEqual(expected(first))

      for (let index = 1; index < states.length; index += 1) {
        const now = states[index]!
        const where = nameOf(index)
        const { picks } = now
        const before = observe(shell)
        shell.owed = []

        switch (now.action) {
          case 'doShow':
            shell.knobs = knobs(picks['showKnobs']!)
            shell.show(
              str(picks['showStep']!),
              picks['resolved'] as boolean,
              picks['animate'] as boolean,
            )
            break
          case 'doRetell':
            shell.dispatch({
              kind: 'retell',
              step: shell.step(str(picks['retellStep']!)),
              reason: REASON,
            })
            break
          case 'doTeardown':
            shell.dispatch({ kind: 'teardown' })
            break
          case 'doSettled':
            shell.knobs = knobs(picks['settleKnobs']!)
            shell.settled(int(picks['glidePick']!), picks['landedOn'] as boolean)
            break
          case 'doMorphed':
            shell.morphed()
            break
          case 'doMutated':
            shell.knobs = knobs(picks['mutateKnobs']!)
            shell.mutated(str(picks['mutatedStep']!), picks['found'] as boolean)
            break
          case 'doExpired':
            // Knobs here too: a deadline that finds its target arrives, and an
            // arrival is where a glide begins.
            shell.knobs = knobs(picks['expireKnobs']!)
            shell.expired(wait(picks['waitPick']!).token, picks['expiredFound'] as boolean)
            break
          case 'doResized':
            shell.dispatch({ kind: 'resized' })
            break
          default:
            throw new Error(`no call for ${now.action}`)
        }

        shell.learn(now, where)

        // The oracle, in two halves — `packages/leko/model/README.md` says why
        // both of them, and why the effects first.
        expect(
          shell.owed.map((effects) => effects.map((effect) => shell.render(effect))),
          `${where}: the effects owed`,
        ).toEqual(now.outcomes)
        expect(observe(shell), where).toEqual(expected(now))

        // Claim 5 of `packages/leko/model/README.md`.
        for (const effects of shell.owed) {
          const kinds = effects.map((effect) => effect.kind)
          const back = kinds.findIndex((kind) => REENTRANT.has(kind))
          if (back !== -1) {
            expect(back, `${where}: a re-entrant effect was not last`).toBe(kinds.length - 1)
          }
        }

        const flat = shell.owed.flat()

        // Claim 1 of `packages/leko/model/README.md`.
        if (now.marks.includes('settled-stale')) {
          exercised.staleSettled += 1
          expect(flat, `${where}: a stale landing was acted on`).toEqual([])
          expect(observe(shell), `${where}: a stale landing moved the page`).toEqual(before)
        }

        // Claim 2 of `packages/leko/model/README.md`. `abandon` is a call on
        // the real object, so this asks the object rather than the model's set.
        if (now.action === 'doSettled') {
          const flight = shell.glides.get(int(picks['glidePick']!))!
          if (flight.abandoned) {
            exercised.settledAbandoned += 1
            expect(flat, `${where}: an abandoned glide drew something`).toEqual([])
          }
        }
        // `glideOverGlide` in `plan.qnt` spelled in TypeScript, and no wider:
        // anything else arriving mid-glide leaves `moving` holding exactly the
        // glide the mode holds, where the loop is trivially true. Counted
        // because until `glide-over-glide` was harvested no trace reached it,
        // and `packages/leko/model/README.md` says how that went unnoticed.
        if (now.from === 'gliding' && now.marks[0] === 'show-glide') {
          exercised.glideOverGlide += 1
        }

        // And nothing else is still carrying the page, which is the rest of
        // claim 2.
        for (const flight of shell.moving) {
          expect(
            shell.mode.kind === 'gliding' && shell.mode.glide === flight,
            `${where}: a glide is still carrying the page for a mode that has moved on`,
          ).toBe(true)
        }

        // Claim 3 of `packages/leko/model/README.md`.
        if (now.marks.includes('expired-stale')) {
          exercised.staleExpired += 1
          expect(flat, `${where}: a deadline for a wait that had ended was acted on`).toEqual([])
          expect(observe(shell), `${where}: and it moved the page`).toEqual(before)
        }

        // Claim 3b of `packages/leko/model/README.md`.
        if (now.marks.includes('expired-arrive')) {
          exercised.expiredArrival += 1
          expect(
            flat.map((effect) => effect.kind),
            `${where}: a deadline gave up on a target that was there`,
          ).not.toContain('lost')
          expect(
            flat.some((effect) => effect.kind === 'arrive'),
            `${where}: a deadline found its target and did not arrive at it`,
          ).toBe(true)
        }

        // 3c, which the README has no row for. `Mode.retrying.unmeasured` in
        // `plan.ts` says which wait this is and why the bound stops being a
        // bound otherwise.
        if (now.marks.includes('expired-unmeasured')) {
          exercised.expiredUnmeasured += 1
          expect(
            flat.map((effect) => effect.kind),
            `${where}: a deadline a draw began arrived instead of giving up`,
          ).not.toContain('arrive')
          expect(
            flat.some((effect) => effect.kind === 'lost'),
            `${where}: a deadline a draw began neither arrived nor ended the run`,
          ).toBe(true)
        }

        // Claim 4 of `packages/leko/model/README.md`. The words would go beside
        // a hole the page is carrying off, in words the landing is about to
        // replace.
        if (now.action === 'doResized' && now.from === 'gliding') {
          exercised.resizedMidGlide += 1
          expect(
            flat.filter((effect) => effect.kind === 'say' || effect.kind === 'retell'),
            `${where}: the page said something while it was still moving`,
          ).toEqual([])
          for (const effect of flat) {
            if (effect.kind !== 'replace') continue
            expect(effect.saying, `${where}: a replace mid-glide put the words back`).toBe(false)
          }
          expect(shell.messageUp, `${where}: the message came back mid-glide`).toBe(false)
        }
      }
    })
  }
})
