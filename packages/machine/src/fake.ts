import type { Host, MachineOptions, Presenter, StepBase, StoryBase, World } from './types.js'

// The world both `machine.test.ts` and `replay.test.ts` drive the machine
// against. Shared rather than declared twice: a replay driving a presenter that
// answers differently from the one every other test uses would be checking the
// machine against something nothing else believes.

/**
 * An anchor is a name here. The machine does two things with one: hands it to
 * `validate`, and hands it back to the presenter. A string carries as much as
 * an element would.
 */
export type Anchor = string

export interface Step extends StepBase<Fixture> {
  target: string
  /**
   * **The machine never reads this.** A host's step has words on it and this
   * fixture stands for one, so it is here to be carried through untouched. One
   * test tells two objects with the same `id` apart by it.
   */
  message?: string
}

export type Story = StoryBase<Fixture>

/** The three types, as the one parameter everything in the machine takes. */
export interface Fixture extends World {
  anchor: Anchor
  step: Step
  story: Story
}

export type Options = MachineOptions<Fixture>

/** The names on the page. A step pointing anywhere else resolves to nothing. */
export const PAGE = ['first', 'second', 'third', 'target']

/**
 * Stands in for whatever draws the tour, and keeps a note of what it was asked
 * for.
 *
 * Nothing here is asynchronous, and nothing needs to be. The machine hands a
 * step over and is done with it, so how long a real presenter takes to finish
 * drawing is not something a test of the machine can observe.
 */
export class Fake implements Presenter<Fixture> {
  readonly page = new Set(PAGE)
  /** Every step it was asked to draw, in order. */
  readonly shown: string[] = []
  /**
   * The reason under the instruction, or nothing.
   *
   * Kept here rather than asked for, the way a real presenter keeps it: an
   * arrival takes it away, a refusal writes it, and a resize is handed it again
   * so that what is on screen survives one.
   */
  error: string | undefined
  /** Every retell, so a test can ask which step got rewritten, and with what. */
  readonly retold: { step: string; reason: string }[] = []
  rejected = 0
  torn = 0

  constructor(private readonly host: Host<Fixture>) {}

  resolve(step: Step): Anchor | null {
    return this.page.has(step.target) ? step.target : null
  }

  show(step: Step, anchor: Anchor | null): void {
    // No retrying here. A presenter that gives a missing target time to appear
    // is answering a drawing question, and the machine is not asked about it
    // until the answer is in.
    if (anchor === null) return this.host.lost(step)
    this.shown.push(step.id)
    // An arrival is a fresh attempt at the step, so whatever the last one was
    // told goes with it.
    this.error = undefined
  }

  place(step: Step, _anchor: Anchor | null, error: string | undefined): void {
    this.shown.push(`place:${step.id}`)
    this.error = error
  }

  retell(step: Step, reason: string): void {
    this.retold.push({ step: step.id, reason })
    this.error = reason
  }

  reject(): void {
    this.rejected += 1
  }

  teardown(): void {
    this.torn += 1
  }

  /**
   * The step's target left the page and did not come back. What the real
   * presenter says once its retry has run out, which is the only part of a
   * missing target the machine hears about.
   */
  lose(step: Step): void {
    this.page.delete(step.target)
    this.host.lost(step)
  }

  /** The surface moved under the tour, the way a resize would. */
  resize(): void {
    this.host.moved()
  }

  /**
   * The next control this drew was pressed.
   *
   * The only way anything advances a step without naming a signal, which is why
   * a test has to come through the presenter to do it. The machine has no
   * method for this and deliberately does not: a step that declares `awaits`
   * gets no control, and that rule is worth nothing if a caller can press one
   * that was never drawn.
   */
  press(): void {
    this.host.next()
  }
}
