/**
 * What the machine needs of the world, and what it may ask of whatever draws
 * the tour. DESIGN.md argues the seam, and why `@annetaan/leko-types` declares
 * the published shapes again rather than importing them, under **The packages,
 * and the seam between them**.
 */

// ---------------------------------------------------------- what a host brings

/**
 * The three types a host brings, as one parameter. Everything else takes
 * `W extends World` and reaches through it.
 */
export interface World {
  anchor: unknown
  step: StepBase<World>
  story: StoryBase<World>
}

/**
 * What the machine needs a step to be. A host adds whatever its presenter draws
 * from and is handed back its own object, never this narrower view of it.
 *
 * The handlers are methods rather than properties, which is what makes a host's
 * narrower step assignable to this one.
 */
export interface StepBase<W extends World> {
  id: string
  /**
   * The signal this step waits for, or nothing where it advances on a control.
   * A name, or `{ url }` for the step that advances on the page's own URL
   * rather than a call — DESIGN.md, **A URL is a signal the page reports**.
   */
  awaits?: string | { url: RegExp }
  /**
   * Build what this step assumes, and hand nothing back. **Leko does not wait
   * for this.** A wait belongs to a step of its own, which declares `awaits`
   * and stands on an accepting machine while the answer comes. DESIGN.md argues
   * it under **A step that waits**.
   */
  onEnter?(step: W['step']): void
  onLeave?(step: W['step'], next: W['step'] | undefined): void
  /** The guard on advancing. **Ignored on a step that declares `awaits`.** */
  validate?(anchor: W['anchor']): boolean
  /**
   * What to say under the instruction when `validate` says no.
   *
   * The function form takes `never` for the same reason the handlers above are
   * methods: a host's own narrower step has to stay assignable to this one, and
   * a function inside a union is checked strictly where a method is not. The
   * host's own type names the argument; `machine.ts` is where it is named again.
   */
  error?: string | ((anchor: never) => string)
}

/** What the machine needs a story to be. */
export interface StoryBase<W extends World> {
  id: string
  steps: W['step'][]
  /**
   * What the tour goes on to once this story runs out of steps. Asked when the
   * last step advances, never stored, and only for a story that ran to the end
   * — DESIGN.md, **Starting a story**.
   *
   * The function form takes nothing. Everything it could be handed is already in
   * the closure that wrote it, and a parameterless function has no argument
   * position to go wrong, so this needs none of what `StepBase.error` needs.
   */
  next?: W['story'] | (() => W['story'] | undefined)
  /** Built and handed back, the same bargain {@link StepBase.onEnter} strikes. */
  onEnter?(story: W['story']): void
  onLeave?(story: W['story'], next: W['story'] | undefined): void
}

export type MachineState = 'idle' | 'running'

/**
 * Something a call meant to do and did not, with no other symptom. DESIGN.md
 * draws the line, and says what is deliberately not here, under **Saying that a
 * call did nothing**.
 */
export type Problem<W extends World> =
  | { kind: 'story-empty'; story: W['story'] }
  | { kind: 'signal-dropped'; name: string; step: W['step'] }
  | { kind: 'call-refused' }
  /** `running` is the story this `start` left alone. */
  | { kind: 'tour-running'; story: W['story']; running: W['story'] }
  | { kind: 'target-lost'; step: W['step']; story: W['story'] }

export interface MachineOptions<W extends World> {
  onStep?(step: W['step'] | undefined, story: W['story']): void
  onDiagnostic?(problem: Problem<W>): void
}

// --------------------------------------------------------- what draws the tour

/**
 * What one document leaves for the next — DESIGN.md, **A page load ends the
 * story, and hands it on**. Plain data, because it crosses a document
 * boundary as text and this package has no `lib.dom` to read a `RegExp` back
 * with: `url` is the pattern's parts, `into` the successor's `id`.
 */
export interface Handoff {
  url: { source: string; flags: string }
  into: string
}

/**
 * What the machine is allowed to ask of whatever draws the tour.
 *
 * DESIGN.md, **The presenter never moves the tour**, and DESIGN.md's **No words
 * cross the seam** for the one string that does cross: why the last attempt was
 * turned down, which a presenter cannot read off a step.
 */
export interface Presenter<W extends World> {
  /**
   * The step's anchor, or `null` where it is not on the page and `null` again
   * where the step names nothing to point at. Which of the two it was is a
   * drawing question, and {@link show} is where it is answered. The `validate`
   * effect asks this too, and does not tell the two apart: the vocabulary
   * refuses a guard on a step with no target, so a `null` there is a target
   * that has gone.
   */
  resolve(step: W['step']): W['anchor'] | null
  /**
   * Draw the step. **Nothing is handed back and nothing waits for this.** The
   * step is on screen as far as the machine is concerned the moment this
   * returns — DESIGN.md, **One gate, and what it refuses**.
   *
   * A `null` anchor is handed over all the same. What a missing target means is
   * a drawing question, so a presenter may give it time and report
   * {@link Host.lost} once it has given up.
   */
  show(step: W['step'], anchor: W['anchor'] | null, animate: boolean): void
  /**
   * The guard said no, and this is what the step gave as the reason. Nothing has
   * moved, so only the words change.
   *
   * The only thing the machine ever says about what is on screen. An arrival
   * takes a reason away, and there is no call for that: a step being drawn again
   * is a fresh attempt at it.
   */
  retell(step: W['step'], reason: string): void
  /** Say no, on a step that would not let the tour past. */
  reject(): void
  /** Everything this presenter put on the page goes. */
  teardown(): void
}

/**
 * What a presenter is allowed to tell the machine. Three things it noticed, and
 * nothing to ask.
 *
 * The machine hands one of these to the factory that builds the presenter
 * rather than handing itself, because every member here would otherwise be part
 * of the machine's own public API and {@link next} is one that must not be.
 */
export interface Host<W extends World> {
  /**
   * The anchor of `step` was not on the page when the step arrived, and never
   * turned up. Named, because the tour may have moved on.
   *
   * The give-up — DESIGN.md, **Every retry belongs to an arrival, so
   * `Host.lost` is only ever about a step that was arriving**.
   */
  lost(step: W['step']): void
  /**
   * The next control was used. The only way anything advances without a signal,
   * and refused on a step that declares `awaits` — DESIGN.md, **The next
   * control**.
   */
  next(): void
  /** The control that ends the tour was used. Means what `stop` means. */
  close(): void
  /**
   * The page's own URL, on a change — never the URL a step was drawn at, even
   * one that already matches. Everything after the origin —
   * `location.pathname + location.search + location.hash` — because the
   * machine holds no `lib.dom` to read it with itself. Matched against a
   * step's `awaits` only where that is `{ url }`; DESIGN.md, **A URL is a
   * signal the page reports**.
   */
  navigated(url: string): void
}
