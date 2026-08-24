/**
 * What the machine needs a step to be. A host adds whatever its presenter draws
 * from, and hands the wider type in as `S`.
 *
 * `S` is the step type itself, so that a handler is given back the object the
 * host wrote rather than this narrower view of it.
 */
export interface StepBase<A, S> {
  id: string
  /**
   * Read every time the machine draws, and never written. The step object
   * belongs to the application, so an application that edits its own message
   * sees the edit and the machine never holds a copy that can go stale.
   */
  readonly message?: string
  /** The signal this step waits for, or nothing where it advances on a control. */
  awaits?: string
  meta?: Record<string, unknown>
  onEnter?: (step: S) => void | Promise<void>
  onLeave?: (step: S, next: S | undefined) => void
  /**
   * The guard on advancing, given whatever the presenter resolved the step's
   * anchor to. `A` is an element in `@annetaan/leko` and anything at all in a
   * test.
   *
   * **Ignored on a step that declares `awaits`.** Such a step advances because
   * the application said the thing happened, and reading the page to check is a
   * second source of truth for the same question.
   */
  validate?: (anchor: A) => boolean
  onValidationError?: (anchor: A, utils: ErrorUtils) => void
}

/** What the machine needs a story to be. */
export interface StoryBase<A, S extends StepBase<A, S>, St> {
  id: string
  steps: S[]
  onEnter?: (story: St) => void | Promise<void>
  onLeave?: (story: St, next: St | undefined) => void
  onStep?: (step: S | undefined, previous: S | undefined) => void
}

/**
 * What a failed attempt can do about itself.
 *
 * `@annetaan/leko` declares this shape again for its users rather than
 * re-exporting it. The two are structurally the same, and the published `.d.ts`
 * has to stand on its own while this package is unpublished.
 */
export interface ErrorUtils {
  shake(): void
  setError(message: string): void
}

export type MachineState = 'idle' | 'running' | 'transitioning'

export interface MachineOptions<A, S extends StepBase<A, S>, St extends StoryBase<A, S, St>> {
  /** The words on the next control, where a step gets one. */
  nextLabel?: string
  onTargetLost?: (step: S, storyId: string) => void
  onStep?: (step: S | undefined, previous: S | undefined, story: St) => void
}
