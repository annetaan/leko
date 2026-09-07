import type { Glide } from '@annetaan/leko-spotlight'
import type { LekoStep, LekoTarget } from './types.js'

// Which mode the presenter is in between calls, and what an event does to it.
// Pure, so `plan.test.ts` drives it in Node one `(mode, event)` pair at a time,
// and `presenter.ts` is the switch over the effects — CLAUDE.md draws that line
// under **Writing code here**. `../model/plan.qnt` is this file written down as
// a state machine a search can walk, and `pnpm model` walks it.

// ---------------------------------------------------------------- reading a step

/** One cutout, in the one shape everything reads: what it unions, and whether it is open. */
export interface Region {
  elements: LekoTarget[]
  interactive: boolean
}

/**
 * The step's regions, as a list of that one shape. Empty where the step named
 * nothing, which is the step that waits.
 *
 * The type already refuses `interactive` anywhere but the first entry; the
 * index is checked all the same, because this is the last line of defence a
 * story written in plain JavaScript ever meets.
 */
export const regionsOf = (target: LekoStep['target']): Region[] => {
  if (target === undefined) return []
  const entries = Array.isArray(target) ? target : [target]
  return entries.map((entry, i) =>
    typeof entry === 'object'
      ? {
          elements: Array.isArray(entry.elements) ? entry.elements : [entry.elements],
          interactive: i === 0 && entry.interactive === true,
        }
      : { elements: [entry], interactive: false },
  )
}

/**
 * The one element the step is about: the first element of its first region.
 *
 * `undefined` where the step named no region at all — which is not a step whose
 * target Leko cannot find, but one that points at nothing on purpose.
 * DESIGN.md, **A step that waits**.
 */
export const actionTarget = (target: LekoStep['target']): LekoTarget | undefined =>
  regionsOf(target)[0]?.elements[0]

/** Whether this step has anything to point at. A step that has not is a wait. */
export const pointsAt = (step: LekoStep): boolean => actionTarget(step.target) !== undefined

// ---------------------------------------------------------------------- the mode

/**
 * What a viewer is looking at: the step whatever draws was last given, and
 * whatever the last attempt at it was told.
 *
 * Held in the mode and nowhere else, so everything that redraws without the
 * tour moving reads this to know what to put back. DESIGN.md, **Nothing here is
 * about what is on screen**.
 */
export interface Drawn {
  readonly step: LekoStep
  readonly error: string | undefined
}

/**
 * A step on its way, and how it is to be drawn when it gets there.
 *
 * One object per wait, made where the wait begins and by nothing else until it
 * ends. **Its identity is the wait**: the deadline set for it names it, and one
 * that fires late is told from the wait running by comparing the two, the way
 * `Position` tells a late callback apart in the machine. That comparison is
 * what makes a late deadline harmless rather than merely unlikely.
 *
 * The timer handle itself is the shell's and the glide is the mode's, which is
 * the rule CLAUDE.md states under **Writing code here**.
 */
export interface Pending {
  readonly step: LekoStep
  readonly animate: boolean
}

/**
 * Where the presenter is, as one value. Four modes, each carrying what belongs
 * to it and nothing else.
 *
 * - `idle` — nothing drawn and nothing armed. Before the first step, and after
 *   a teardown.
 * - `drawn` — a step on screen and nothing armed at all. Past the draw the
 *   page belongs to the application again.
 * - `retrying` — a target that is not on the page, given a moment to turn up:
 *   the deadline running and the watcher hunting. What is on screen is
 *   `standing`, whatever was there, untouched. DESIGN.md, **Nothing is drawn
 *   for a retry**.
 * - `gliding` — the page on its way to a step that has not been drawn yet:
 *   the glide, the step pending behind it, and the watcher disarmed. What is
 *   on screen is `standing`, the step being left. DESIGN.md, **Nothing is
 *   drawn for the gap**.
 *
 * `standing` is on both modes that have a step on its way, and it is the step
 * the screen still shows, reason and all: a resize puts its holes back, and a
 * glide begun from a retry inherits it. It is `undefined` where nothing was on
 * screen when the wait began.
 *
 * The rules the presenter used to state in prose — a glide is the whole of what
 * says a step is pending, nothing but a hunt is ever armed, only one retry ever
 * runs — are the shape of this type. Four nullable fields read together
 * admitted every combination, including the ones those sentences forbade; a
 * union admits these four.
 *
 * `error` is on every mode that has a step: the reason the last attempt was
 * told, held wherever the step is so that a redraw puts it back and a landing
 * draws it with the step it is about. An arrival is a fresh attempt and starts
 * with none.
 */
export type Mode =
  | { readonly kind: 'idle' }
  | { readonly kind: 'drawn'; readonly step: LekoStep; readonly error: string | undefined }
  | {
      readonly kind: 'retrying'
      readonly pending: Pending
      /**
       * Whether a draw that had this target is what began the wait, rather
       * than the target not being on the page.
       *
       * Read by the deadline, and what keeps the bound a bound. Resolution is
       * not what failed for this wait — the anchor resolved in the same task
       * that could not measure it — so the last question DESIGN.md asks under
       * **And once more as the grace period runs out** can only ever answer
       * "found", and an arrival that fails to measure again arms another
       * deadline. Every 100ms, for ever, with nothing drawn and nothing
       * reported.
       *
       * Here rather than on {@link Pending}, which `gliding` carries too and
       * where this would mean nothing.
       */
      readonly unmeasured: boolean
      readonly error: string | undefined
      readonly standing: Drawn | undefined
    }
  | {
      readonly kind: 'gliding'
      readonly glide: Glide
      readonly pending: Pending
      readonly error: string | undefined
      readonly standing: Drawn | undefined
    }

/** Nothing drawn and nothing armed. */
export const idle: Mode = { kind: 'idle' }

// -------------------------------------------------------------------- the events

/**
 * Everything that happens to the presenter, as data. The first three are the
 * calls the machine makes; the rest are the page answering something the shell
 * asked or armed, carried here rather than acted on where they landed —
 * CLAUDE.md, **Writing code here**.
 */
export type Event =
  // --- what the machine calls
  /**
   * An arrival. `glide` is what `bringIntoView` answered, started by the shell
   * before this was dispatched because only the shell can ask; it is set only
   * beside an anchor, on a step that scrolls, where a port had somewhere to go.
   * `error` is what the attempt has already been told: nothing from the
   * machine, and the reason a guard gave while a retry was hunting where the
   * retry found its target.
   */
  | {
      kind: 'show'
      step: LekoStep
      anchor: Element | null
      animate: boolean
      glide: Glide | undefined
      error: string | undefined
    }
  | { kind: 'retell'; step: LekoStep; reason: string }
  | { kind: 'teardown' }
  // --- what the page answers
  /** A glide stopped, and `anchor` is the target resolved again where it stopped. */
  | { kind: 'settled'; glide: Glide; anchor: Element | null }
  /** The morph that drew `step` got to the end. */
  | { kind: 'morphed'; step: LekoStep }
  /**
   * The page changed while a step was waiting for a target that has not turned
   * up yet, and `found` is what resolving the step again turned up.
   */
  | { kind: 'mutated'; step: LekoStep; found: Element | null }
  /**
   * A draw found nothing to measure. Unreachable as far as anyone can tell —
   * the anchor resolved in the same task — and kept as the last line of
   * defence, carrying how the draw was to animate so the retry it becomes
   * draws the step the way it was asked.
   */
  | { kind: 'unmeasured'; step: LekoStep; animate: boolean }
  /**
   * A retry's deadline ran out. `pending` names the wait it was set for, and
   * `found` is what resolving that step one last time turned up.
   */
  | { kind: 'expired'; pending: Pending; found: Element | null }
  | { kind: 'resized' }

// ------------------------------------------------------------------- the effects

/**
 * What the presenter does to the page, as data. The shell is a `switch` over
 * these and nothing in it decides which to make.
 */
export type Effect =
  /** Stop a glide where it is. */
  | { kind: 'abandon'; glide: Glide }
  /** The words of the step being left go. */
  | { kind: 'hide' }
  /** Nothing is watched. */
  | { kind: 'disarm' }
  /** Watch the page for `step`'s target turning up. */
  | { kind: 'hunt'; step: LekoStep }
  /** Start the clock on a wait. */
  | { kind: 'deadline'; pending: Pending }
  /** The clock stops. */
  | { kind: 'cancel' }
  /** Draw `drawn` around `anchor`, morphing where `animate` says. */
  | { kind: 'reveal'; drawn: Drawn; anchor: Element | null; animate: boolean }
  /**
   * Put the holes back where the surface moved under them and place the way
   * out again; `saying` puts the words back beside them too, which a step on
   * its way must not. One effect rather than a `replace` and a `say`, because
   * the shell can find nothing to put back — the target went in the same task
   * — and the words follow only where the holes did.
   */
  | { kind: 'replace'; drawn: Drawn; saying: boolean }
  /** Put the message beside the holes. */
  | { kind: 'say'; drawn: Drawn }
  /** Only the words change. */
  | { kind: 'retell'; step: LekoStep; reason: string }
  /** A hunt found its target: a fresh arrival at `pending`, through `show`. */
  | { kind: 'arrive'; pending: Pending; anchor: Element; error: string | undefined }
  /** `Host.lost`, whose own doc says what it is the only part of. */
  | { kind: 'lost'; step: LekoStep }
  /** Everything on the page goes. */
  | { kind: 'destroy' }

/**
 * The next mode and what is owed for it, in order.
 *
 * **An effect that comes back into the plan goes last.** `reveal` can report
 * `unmeasured` or `morphed` from inside itself, `arrive` is a `show`, and
 * `lost` is a teardown from inside the machine's call; each replaces the mode
 * while the shell is still working through this list, so anything after one of
 * them would run against a mode that is gone. `plan.test.ts` checks every
 * outcome it sees for it.
 */
export interface Outcome {
  readonly mode: Mode
  readonly effects: readonly Effect[]
}

// --------------------------------------------------------------------- the moves
//
// What more than one event does, each written once here rather than given a
// name where it is decided.

const nothing = (mode: Mode): Outcome => ({ mode, effects: [] })

/**
 * Whatever `mode` has running that a fresh arrival or a teardown has to stop.
 *
 * A glide, because one nobody is waiting for must not go on carrying the page
 * to somewhere the tour no longer is, and a retry's deadline, because one left
 * to fire would be a call into the shell for a wait that is over. A retry's
 * watcher is not here: whatever comes next arms one for itself or disarms it.
 */
const leaving = (mode: Mode): Effect[] => {
  if (mode.kind === 'gliding') return [{ kind: 'abandon', glide: mode.glide }]
  if (mode.kind === 'retrying') return [{ kind: 'cancel' }]
  return []
}

/** What is on screen while `mode` stands, where the mode knows. */
const standingIn = (mode: Mode): Drawn | undefined => {
  if (mode.kind === 'idle') return undefined
  if (mode.kind === 'drawn') return { step: mode.step, error: mode.error }
  return mode.standing
}

/**
 * `retry`. A target that is not on the page when its step arrives is given a
 * moment to turn up.
 *
 * Whatever was drawn a moment ago stands exactly as it was, and DESIGN.md
 * argues that trade under **Nothing is drawn for a retry**. A morph already
 * asked for paints to its end, and the `morphed` it reports is ignored because
 * the mode is no longer `drawn`.
 *
 * The hunt hears mutations rather than polling, so the wait stays off the frame
 * budget. Only one of these can be running, and that is the type: a `retrying`
 * mode holds one `pending`, and an arrival replaces the whole mode.
 */
const retrying = (
  pending: Pending,
  error: string | undefined,
  standing: Drawn | undefined,
  before: Effect[],
  unmeasured = false,
): Outcome => ({
  mode: { kind: 'retrying', pending, unmeasured, error, standing },
  effects: [...before, { kind: 'hunt', step: pending.step }, { kind: 'deadline', pending }],
})

/**
 * `reveal`. Draw what a viewer is to be looking at, and remember it.
 *
 * `drawn` rather than a step, because a redraw that the tour did not ask for
 * has to put back what was there, reason and all. `anchor` is `null` on a step
 * that points at nothing: there is no surface to find for one of those, so the
 * shell draws it on the document and cuts no hole.
 *
 * **A step on screen arms nothing.** A hunt left over from the step before
 * goes here, because one still running would report against this step; past
 * that, DESIGN.md, **The page is measured when a step is drawn, and not
 * again**.
 *
 * Disarmed before `reveal` rather than after. A draw that finds nothing to
 * measure — the last line of defence, and it reports `unmeasured` from inside
 * itself — arms a hunt, and a `disarm` behind it would take that hunt off the
 * moment it went on. The rule on {@link Outcome} that an effect coming back
 * into the plan goes last forces the same order.
 */
const revealing = (
  drawn: Drawn,
  anchor: Element | null,
  animate: boolean,
  before: Effect[],
): Outcome => ({
  mode: { kind: 'drawn', step: drawn.step, error: drawn.error },
  effects: [...before, { kind: 'disarm' }, { kind: 'reveal', drawn, anchor, animate }],
})

// -------------------------------------------------------------------- the events

/** What one event does to the presenter, and what the presenter owes the page for it. */
export function reduce(mode: Mode, event: Event): Outcome {
  switch (event.kind) {
    // --- what the machine calls

    case 'show': {
      const { step, anchor, animate, glide, error } = event
      // Whatever was being waited for, the tour is somewhere else now. A glide
      // is stopped where it is rather than left to run, so a page on its way
      // to a step the tour has left does not carry on under this one; a target
      // that turns up late for a retry finds nobody hunting.
      const before = leaving(mode)
      const pending: Pending = { step, animate }
      // Named a target and it is not on the page yet. A step that named nothing
      // is not looked for. DESIGN.md, **A target that is not on the page when
      // its step arrives gets a 100ms grace period**.
      if (!anchor && pointsAt(step)) return retrying(pending, error, standingIn(mode), before)
      // The page is moving, so the words go and nothing is armed: DESIGN.md,
      // **Nothing is drawn for the gap**, and DESIGN.md's **Nothing is armed
      // for it either, and a reason waits with the step**, which is the hunt a
      // glide entered over a retry would otherwise leave running.
      if (glide) {
        return {
          mode: { kind: 'gliding', glide, pending, error, standing: standingIn(mode) },
          effects: [...before, { kind: 'hide' }, { kind: 'disarm' }],
        }
      }
      return revealing({ step, error }, anchor, animate, before)
    }

    case 'retell': {
      // Held wherever the step is, because everything that redraws without the
      // tour moving reads it. Without this a re-render over the step would take
      // the reason off the page while leaving the step it belongs to standing.
      if (mode.kind === 'idle') return nothing(mode)
      const told: Mode = { ...mode, error: event.reason }
      // A step on its way is told, and nothing is said: the reason arrives with
      // the step, which is DESIGN.md's **Nothing is armed for it either, and a
      // reason waits with the step**. A retry never hears one from the machine
      // as it stands — a press on a step whose target is not on the page is
      // `lost`, not a refusal — so this is the rule for a retell that has
      // nowhere to be said.
      if (mode.kind !== 'drawn') return nothing(told)
      return { mode: told, effects: [{ kind: 'retell', step: event.step, reason: event.reason }] }
    }

    case 'teardown':
      // The glide goes with everything else, and so does whatever is watching.
      // A deadline still running fires into `idle` and is answered with
      // nothing, so a tour that has been stopped cannot draw itself back onto
      // the page 100ms later.
      return { mode: idle, effects: [...leaving(mode), { kind: 'disarm' }, { kind: 'destroy' }] }

    // --- what the page answers

    case 'settled': {
      // Another arrival has been and gone, and it is drawing its own step. The
      // glide is what is compared, not the record: a reason told mid-glide
      // replaced the record and left this same wait running.
      if (mode.kind !== 'gliding' || mode.glide !== event.glide) return nothing(mode)
      const { pending, error } = mode
      // Asked again rather than trusted, for the reason DESIGN.md gives under
      // **A step with no `target` scrolls nothing**. A glide only ever starts
      // from a target that was there, so a step that landed without one is a
      // retry and never a wait.
      if (!event.anchor) return retrying(pending, error, mode.standing, [])
      // The reason the mode holds rather than the one the arrival came with: a
      // guard that refused while the page was moving wrote its words here, and
      // this is where they arrive.
      return revealing({ step: pending.step, error }, event.anchor, pending.animate, [])
    }

    case 'morphed':
      // The message comes back with the hole it belongs beside, and says what
      // the step has been told by now rather than what it had been told when
      // the morph began. A morph another arrival cut short is not here at all:
      // that arrival is drawing its own step.
      if (mode.kind !== 'drawn' || mode.step !== event.step) return nothing(mode)
      return { mode, effects: [{ kind: 'say', drawn: { step: mode.step, error: mode.error } }] }

    case 'mutated': {
      // A hunt is the only thing ever armed, and only `retrying` arms one, so a
      // batch landing on any other mode came from an observer already
      // disconnected. Kept as the same last line of defence the stale guard on
      // `unmeasured` is, and unreachable in the same way.
      if (mode.kind !== 'retrying') return nothing(mode)
      // Named rather than read off the mode, so a batch about the step before
      // is told apart from one about the step being waited for.
      if (mode.pending.step !== event.step || !event.found) return nothing(mode)
      // Found, and a fresh arrival: it goes through `show`, because the scroll
      // happens on the attempt that finds the target and only the shell can
      // start one. What the wait was told goes with it.
      return {
        mode,
        effects: [
          { kind: 'arrive', pending: mode.pending, anchor: event.found, error: mode.error },
        ],
      }
    }

    case 'unmeasured':
      // Nothing was drawn, so nothing is standing that this knows of: the
      // stack may have been rebuilt on the way to finding nothing.
      if (mode.kind !== 'drawn' || mode.step !== event.step) return nothing(mode)
      // The one wait a resolve cannot end, and the last argument says so.
      return retrying({ step: mode.step, animate: event.animate }, mode.error, undefined, [], true)

    case 'expired': {
      // The one it was set for, and no other: a deadline left over from a wait
      // that ended is answered with nothing, however long ago it was set.
      if (mode.kind !== 'retrying' || mode.pending !== event.pending) return nothing(mode)
      // **Asked once more before giving up** — DESIGN.md, **And once more as
      // the grace period runs out**. Found, it is the fresh arrival a hunt's
      // own find is, through `show` for the reason that one goes through it.
      // Except for the one wait resolving cannot end, which is given up however
      // it answers: `unmeasured` on the mode says why.
      if (event.found && !mode.unmeasured) {
        return {
          mode,
          effects: [
            { kind: 'arrive', pending: mode.pending, anchor: event.found, error: mode.error },
          ],
        }
      }
      // Over before the call is made. `lost` ends the run, and the teardown it
      // brings arrives from inside the call and finds nothing pending.
      return {
        mode: idle,
        effects: [{ kind: 'disarm' }, { kind: 'lost', step: mode.pending.step }],
      }
    }

    case 'resized': {
      // The surface moved under the tour rather than the tour moving, so this
      // draws what it was already given again, and the machine is not asked.
      // The message needs no help to follow a scroll, but a resize can leave
      // the side it was put on without room, so that choice is made again.
      if (mode.kind === 'drawn') {
        const drawn: Drawn = { step: mode.step, error: mode.error }
        return { mode, effects: [{ kind: 'replace', drawn, saying: true }] }
      }
      // A step is on its way, so the words stay away, and the standing holes go
      // back with the way out all the same — a resize can take away the corner
      // that control is standing in, and a page blocked with no way out of it
      // is what it exists to prevent. Putting back what was drawn is not
      // drawing. Both waits reach here: DESIGN.md, **Nothing is armed for it
      // either, and a reason waits with the step** for a glide, and DESIGN.md's
      // **Nothing is drawn for a retry** for a retry.
      if (mode.kind === 'idle' || !mode.standing) return nothing(mode)
      return { mode, effects: [{ kind: 'replace', drawn: mode.standing, saying: false }] }
    }
  }
}
