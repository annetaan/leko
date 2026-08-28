import type {
  Content,
  Host,
  MachineOptions,
  Presenter,
  StepBase,
  StoryBase,
  World,
} from './types.js'

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
   * Writable here, the way `LekoStep` declares it. `StepBase` has it `readonly`
   * to say the machine never writes it. The application owns the object and is
   * free to edit its own text, and one test below does exactly that.
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
 * It settles in the turn it was called in, which is what a presenter with
 * nothing to animate does. {@link Fake.slow} makes it wait instead, so the gap
 * between a step arriving and a step settling can be looked at.
 */
export class Fake implements Presenter<Fixture> {
  readonly page = new Set(PAGE)
  /** Every step it was asked to draw, in order. */
  readonly shown: string[] = []
  /** What it was last told to say. */
  content: Content | undefined
  /** Every retell, so a test can ask which step got rewritten, and with what. */
  readonly retold: { step: string; content: Content }[] = []
  slow = false
  rejected = 0
  torn = 0
  private settle: (() => void) | undefined

  constructor(private readonly host: Host<Fixture>) {}

  resolve(step: Step): Anchor | null {
    return this.page.has(step.target) ? step.target : null
  }

  show(step: Step, anchor: Anchor | null, content: Content): Promise<void> | void {
    // No searching here. A presenter that gives a missing target time to appear
    // is answering a drawing question, and the machine is not asked about it
    // until the answer is in.
    if (anchor === null) return this.host.lost(step)
    this.shown.push(step.id)
    this.content = content
    // Whatever was in flight is interrupted and settles all the same, which is
    // what a real morph does rather than hanging.
    this.settle?.()
    this.settle = undefined
    if (!this.slow) return
    return new Promise<void>((resolve) => {
      this.settle = resolve
    })
  }

  place(step: Step, _anchor: Anchor | null, content: Content): void {
    this.shown.push(`place:${step.id}`)
    this.content = content
  }

  retell(step: Step, content: Content): void {
    this.retold.push({ step: step.id, content })
    this.content = content
  }

  reject(): void {
    this.rejected += 1
  }

  teardown(): void {
    this.torn += 1
  }

  /** The morph reached the end, the way a real one does after 320ms. */
  land(): void {
    this.settle?.()
    this.settle = undefined
  }

  /** The step's target left the page, the way a MutationObserver would notice. */
  lose(step: Step): void {
    this.page.delete(step.target)
    this.host.lost(step)
  }

  /**
   * The target left the page and this is looking for it, which is the half of
   * the real presenter that nobody asked for. `lose` is what it says two
   * seconds later, if it comes to that.
   */
  hunt(step: Step): void {
    this.page.delete(step.target)
    this.host.searching(step, true)
  }

  /** It came back, and the step is drawn again without the machine moving. */
  found(step: Step): void {
    this.page.add(step.target)
    this.host.searching(step, false)
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
