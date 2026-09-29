import type {
  Handoff,
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
   * **The machine never reads this.** A host's step has words on it and this
   * fixture stands for one, so it is here to be carried through untouched. One
   * test tells two objects with the same `id` apart by it.
   */
  message?: string
}

export type Story = StoryBase<Fixture>

export interface Fixture extends World {
  anchor: Anchor
  step: Step
  story: Story
}

export type Options = MachineOptions<Fixture>

export const PAGE = ['first', 'second', 'third', 'target']

/**
 * Nothing here is asynchronous, and nothing needs to be. The machine hands a
 * step over and is done with it, so how long a real presenter takes to finish
 * drawing is not something a test of the machine can observe.
 */
export class Fake implements Presenter<Fixture> {
  readonly page = new Set(PAGE)
  readonly shown: string[] = []
  readonly retold: { step: string; reason: string }[] = []
  rejected = 0
  torn = 0
  /** Where the fixture's document is. Settable by a test. */
  url = '/'
  kept: { handoff: Handoff; from: string } | undefined

  constructor(private readonly host: Host<Fixture>) {}

  resolve(step: Step): Anchor | null {
    return this.page.has(step.target) ? step.target : null
  }

  show(step: Step): void {
    const anchor = this.resolve(step)
    // No retrying here — DESIGN.md, **Every retry belongs to an arrival, so
    // `Host.lost` is only ever about a step that was arriving**.
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

  keep(handoff: Handoff): void {
    this.kept = { handoff, from: this.url }
  }

  take(): { handoff: Handoff; from: string; url: string } | undefined {
    const kept = this.kept
    this.kept = undefined
    return kept && { ...kept, url: this.url }
  }

  /** What the real presenter says once its retry has run out. */
  lose(step: Step): void {
    this.page.delete(step.target)
    this.host.lost(step)
  }

  /**
   * The next control this drew was pressed. A test has to come through the
   * presenter to advance a step that names no signal, because the machine has
   * no method for it — DESIGN.md, **The next control**.
   */
  press(): void {
    this.host.next()
  }

  /**
   * A same-document navigation the presenter would have reported. `press()`'s
   * counterpart for a step awaiting `{ url }`: the machine has no method of its
   * own for either, because both arrive through the presenter.
   */
  navigate(url: string): void {
    this.host.navigated(url)
  }

  /**
   * The `pagehide` the presenter would have reported. `navigate()`'s
   * sibling: the machine has no method of its own for either, because both
   * arrive through the presenter.
   */
  unload(): void {
    this.host.unloading()
  }
}
