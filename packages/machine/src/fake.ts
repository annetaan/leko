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
   * Every retell, so a test can ask which step was told what, and how often.
   *
   * The only thing the machine ever says about what is on screen. What becomes
   * of the words is a presenter's business and `message.test.ts` asks about
   * that; here the calls are the whole of it.
   */
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
  }

  retell(step: Step, reason: string): void {
    this.retold.push({ step: step.id, reason })
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
