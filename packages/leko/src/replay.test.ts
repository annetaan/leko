import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import type { Glide } from '@annetaan/leko-spotlight'
import { afterAll, describe, expect, test } from 'vitest'

import { type Effect, type Event, idle, type Mode, type Pending, pointsAt, reduce } from './plan.js'
import type { LekoStep } from './types.js'

// Every trace under `../model/traces/` driven into the real `reduce`, event by
// event, with the model's own state as the oracle at each one.
//
// The machine's replay is a real `Machine` over a fake presenter. This is that
// arrangement inverted: a real plan over fake effects, because the plan is the
// half that decides and the shell is the half that touches the page. No browser
// is involved and nothing here is asynchronous — `reduce` answers in the turn,
// and the three effects that come back into it do so on the same stack.
//
// `../model/plan.qnt` carries six invariants, and five of them are things a
// state predicate can see. What is left for here is the claims about what a
// *transition* did — "a stale `settled` draws nothing", "an abandoned glide
// never moves the page again" — which a predicate over one state cannot see at
// all. Writing them into the model as a flag an action sets would make them
// true by construction. They live here, where the thing being asked is the real
// `reduce`.
//
// `packages/leko/model/README.md` says how a trace gets here and what to do
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
  error: string | undefined
  standing: Picture | undefined
  step: string | undefined
}

function told(value: Itf): Told {
  const bare = {
    kind: tag(value),
    glide: undefined,
    pending: undefined,
    error: undefined,
    standing: undefined,
    step: undefined,
  }
  if (bare.kind === 'Idle') return bare
  if (bare.kind === 'Drawn') {
    const drawn = picture(payload(value))
    return { ...bare, step: drawn.step, error: drawn.error }
  }
  const inner = payload(value) as { glide?: Itf; pending: Itf; error: Itf; standing: Itf }
  return {
    ...bare,
    glide: inner.glide === undefined ? undefined : int(inner.glide),
    pending: wait(inner.pending),
    error: maybe(inner.error, str),
    standing: maybe(inner.standing, picture),
  }
}

/**
 * One effect, in a shape both sides can be written to.
 *
 * The plan's `Effect` carries nodes and objects; the model's carries names and
 * numbers. This is the two of them reduced to what they have in common, which
 * is everything either side decides: an anchor becomes whether there was one,
 * a `Glide` becomes the token the model numbers it by, and a step becomes its
 * id. Nothing an assertion could want is dropped.
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
    case 'Watch':
      return { kind: 'watch', step: str(inner['step']) }
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

/** One state of the model, in the terms the plan and its shell use. */
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
    // Ascending is mint order: the model takes every token off one counter that
    // only ever goes up. {@link Shell.learn} leans on that.
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
// Built from the trace rather than written out again here. `world` is a model
// variable so that it lands in every ITF state, which is what lets the fixture
// have one definition instead of two that can drift apart.

/**
 * The steps the model's world holds, by the name the model calls them.
 *
 * It sits in the trace's header rather than in each state: `world` is a model
 * variable so that it reaches the trace at all, and it is written once in
 * `init`, so `scripts/model-traces.mjs` writes it once too.
 */
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

/**
 * An anchor is opaque to the plan. It hands one to the shell and never reads
 * it, so anything with an identity will do — the same bargain `plan.test.ts`
 * strikes, and the reason this suite needs no DOM.
 */
const ANCHOR = { id: 'anchor' } as unknown as Element

/** What a guard says when it refuses. Which words is not the question here. */
const REASON = 'no'

// -------------------------------------------------------------- the fake shell
//
// `perform` in `presenter.ts`, as what each effect does to the state the model
// says the shell keeps. It is `perform` in `plan.qnt` written in TypeScript,
// and holding the two against each other after every event is what says the
// real `reduce` owed what the model's `reduce` owed.

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
  watcher: { kind: 'watching' | 'hunting'; step: LekoStep } | undefined
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
   *
   * Filled by {@link learn} off the two lists below rather than off whatever
   * mode the action happened to end in. Both sides mint from one counter that
   * only ever goes up, so the nth thing this made is the nth token the model
   * added, whatever depth of re-entry either was reached at.
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
   * `dispatch` in `presenter.ts`: the mode is written before any effect runs,
   * and the effects run in order against whatever the ones before them left.
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
      case 'watch':
        this.watcher = { kind: 'watching', step: effect.step }
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
        // The words of the step being left go, and `measure` restacks the
        // layers whatever it finds, so something of the tour is on the page
        // from here on either way.
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
        // A target that is not on the page this instant is one a mutation batch
        // is about to report, and `replace` places the way out and nothing
        // else: no holes, and no words even where `saying` asked.
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

  expired(token: number): void {
    const pending = this.waits.get(token)
    if (!pending) throw new Error(`the trace expires a wait nothing began: ${token}`)
    if (this.deadline === pending) this.deadline = undefined
    this.dispatch({ kind: 'expired', pending })
  }

  /**
   * Tie the model's tokens to the objects the plan and this made.
   *
   * By order rather than by reading the terminal mode. The model takes every
   * token off one counter that only goes up, so its `glides` and `waits` sorted
   * ascending are in mint order, and the lists above are in the same order.
   * Reading the mode the action ended in would be right only while no branch
   * that mints an identity also owes a re-entrant effect — true today, unstated,
   * and silent if it stopped being true.
   *
   * A length that disagrees says the harness has stopped following the plan,
   * which is a different thing from a corpus that is wrong, so it says so.
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
      case 'watch':
        return { kind: 'watch', step: effect.step.id }
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
   * token the model numbers them with.
   *
   * Identities rather than a count. A `show` over a glide abandons one and
   * mints another, and a mode left holding the abandoned one owes the same
   * effects and runs the same number of glides — so a count agrees, and the
   * page never draws the step it has just scrolled to.
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
    standing: standing && { step: standing.step.id, error: standing.error },
  }
}

/** The same reading, off the model. The two are compared field for field. */
const expected = (now: Snapshot): Observed => ({
  kind: now.mode.kind.toLowerCase(),
  step: now.mode.kind === 'Drawn' ? now.mode.step : undefined,
  error: now.mode.error,
  pending: now.mode.pending && { step: now.mode.pending.step, animate: now.mode.pending.animate },
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

/** Effects that come back into the plan. `Outcome` says each is the last of its list. */
const REENTRANT: ReadonlySet<Effect['kind']> = new Set(['reveal', 'arrive', 'lost'])

// -------------------------------------------------------------------- the runs

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
 * What the corpus as a whole got to. Each of these is a claim below whose
 * machinery would stand idle if no trace reached it, leaving the assertion
 * green about nothing.
 */
const exercised = {
  staleSettled: 0,
  staleExpired: 0,
  settledAbandoned: 0,
  resizedMidGlide: 0,
  glideOverGlide: 0,
}

// And the alarm itself. Counting without reading the count is the same silence
// with an extra step in it.
afterAll(() => {
  expect(exercised.staleSettled, 'no trace landed a stale glide').toBeGreaterThan(0)
  expect(
    exercised.staleExpired,
    'no trace fired a deadline for a wait that had ended',
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
  // A corpus that quietly emptied would leave this file green and testing
  // nothing, which is the one way a harness like this fails silently.
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
            shell.expired(wait(picks['waitPick']!).token)
            break
          case 'doResized':
            shell.dispatch({ kind: 'resized' })
            break
          default:
            throw new Error(`no call for ${now.action}`)
        }

        shell.learn(now, where)

        // The oracle, in two halves. What each `reduce` owed, and the state
        // performing it left behind. The effects first, because two of them can
        // leave the same footprint and only this tells those apart: a `say`
        // where a `retell` was owed re-places the message box instead of
        // swapping its words, and both end with the message showing.
        expect(
          shell.owed.map((effects) => effects.map((effect) => shell.render(effect))),
          `${where}: the effects owed`,
        ).toEqual(now.outcomes)
        expect(observe(shell), where).toEqual(expected(now))

        // An effect that comes back into the plan goes last, on the real
        // outcomes rather than the model's. `plan.test.ts` asks this of the
        // pairs somebody wrote an example for; the model's `reentrantIsLast`
        // asks it of its own `reduce`; this asks it of the real one, over every
        // outcome any trace reaches.
        for (const effects of shell.owed) {
          const kinds = effects.map((effect) => effect.kind)
          const back = kinds.findIndex((kind) => REENTRANT.has(kind))
          if (back !== -1) {
            expect(back, `${where}: a re-entrant effect was not last`).toBe(kinds.length - 1)
          }
        }

        const flat = shell.owed.flat()

        // 1. A stale `settled` draws nothing. The glide is what is compared,
        //    not the record: a reason told mid-glide replaced the record and
        //    left the same wait running.
        if (now.marks.includes('settled-stale')) {
          exercised.staleSettled += 1
          expect(flat, `${where}: a stale landing was acted on`).toEqual([])
          expect(observe(shell), `${where}: a stale landing moved the page`).toEqual(before)
        }

        // 2. An abandoned glide never moves the page again. `abandon` is a call
        //    on the real object, so this asks the object rather than the model's
        //    set: a glide the plan gave up on was told to stop, and anything it
        //    reports afterwards is answered with nothing.
        if (now.action === 'doSettled') {
          const flight = shell.glides.get(int(picks['glidePick']!))!
          if (flight.abandoned) {
            exercised.settledAbandoned += 1
            expect(flat, `${where}: an abandoned glide drew something`).toEqual([])
          }
        }
        // A `show` that glides, made while the page was already gliding, is the
        // one state where two glides are alive at once and the loop below is
        // asking something. `glideOverGlide` in `plan.qnt` spelled in
        // TypeScript, and no wider: anything else arriving mid-glide leaves
        // `moving` holding exactly the glide the mode holds, where the loop is
        // trivially true. Counted, because until `glide-over-glide` was
        // harvested no trace reached it and the loop was true of nothing.
        if (now.from === 'gliding' && now.marks[0] === 'show-glide') {
          exercised.glideOverGlide += 1
        }

        // And nothing else is still carrying the page. A glide the plan walked
        // away from without owing an `abandon` would go on scrolling towards a
        // step the tour has left, and it is the one still running rather than
        // the one already stopped that says so.
        for (const flight of shell.moving) {
          expect(
            shell.mode.kind === 'gliding' && shell.mode.glide === flight,
            `${where}: a glide is still carrying the page for a mode that has moved on`,
          ).toBe(true)
        }

        // 3. An `expired` for a wait that ended is answered with nothing,
        //    however long ago it was set.
        if (now.marks.includes('expired-stale')) {
          exercised.staleExpired += 1
          expect(flat, `${where}: a deadline for a wait that had ended was acted on`).toEqual([])
          expect(observe(shell), `${where}: and it moved the page`).toEqual(before)
        }

        // 4. A `resized` mid-glide puts the standing holes back and says
        //    nothing. The words would go beside a hole the page is carrying
        //    off, in words the landing is about to replace.
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
