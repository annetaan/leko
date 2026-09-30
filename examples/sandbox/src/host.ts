import {
  createLeko,
  type Leko,
  type LekoOptions,
  type LekoProblem,
  type LekoStep,
  type LekoStory,
  type LekoTarget,
} from '@annetaan/leko'

import type { Case } from './case.js'

/** What a host brings to a case it runs. */
export interface Brings {
  /** The host's own chrome, named in front of whatever the case adds. */
  chrome: LekoTarget[]
  /** Laid over the case's own options, under the hooks `runCase` keeps. */
  options?: Omit<LekoOptions, 'hostChrome' | 'onDiagnostic' | 'onStep'>
  /** Offered in place of the case's own stories, for a host that copies them. */
  stories?: LekoStory[]
  /** Told before each call is made, as the call would be written. */
  onCall?: (text: string) => void
  onStep?: (step: LekoStep | undefined, story: LekoStory) => void
  onProblem?: (text: string, found: LekoProblem) => void
  /** Where the tour is, then the last problem, whenever either may have moved. */
  onStatus?: (line: string) => void
}

/** A case up and running, and what a host may do with it. */
export interface Running {
  leko: Leko
  /** The stories the host offers, in the order it offers them. */
  stories: LekoStory[]
  start(id: string): void
  stop(): void
  /**
   * Once per document, in the same turn that ran `runCase`, before anything can
   * be pressed — `across-a-page-load.ts` tells a picked-up start from a pressed
   * one by that.
   */
  pickUp(): void
  teardown(): void
}

/** What a diagnostic means, in a sentence a person reading the case can act on. */
function explain(found: LekoProblem): string {
  if (found.kind === 'signal-dropped') {
    // `awaits: { url }` has no `reached()` call to name — `found.name` is
    // the pattern itself there (LekoProblem's `signal-dropped`).
    return typeof found.step.awaits === 'object'
      ? `The URL changed to match ${found.name} while “${found.step.id}” was still being built, and was dropped.`
      : `reached('${found.name}') arrived while “${found.step.id}” was still being built, and was dropped.`
  } else if (found.kind === 'target-lost') {
    return `Target for “${found.story.id} / ${found.step.id}” never turned up. The tour stopped rather than point at nothing.`
  } else if (found.kind === 'call-refused') {
    return 'start() arrived while Leko was inside the application, and was not acted on.'
  } else if (found.kind === 'tour-running') {
    return `start() was given “${found.story.id}” while “${found.running.id}” was running. Press stop() first: start() never ends a tour.`
  } else if (found.kind === 'story-unknown') {
    return `A previous page handed on “${found.id}”, and this page's pickUp() was not given that story.`
  }
  return `start() was given “${found.story.id}”, which has no steps in it.`
}

// Reading the instance from in here is the point of the test: if the hook fired
// before Leko had finished moving, this would print the step it just left.
function where(leko: Leko): string {
  const story = leko.story
  const step = leko.step
  // The position comes from the instance. Searching `steps` for `step` would
  // count the wrong one in a story that shows the same step object twice.
  const index = leko.index
  return story && step && index !== undefined
    ? `${story.id} ${index + 1}/${story.steps.length} · “${step.id}” — ${step.message ?? 'no message'}`
    : 'No story running.'
}

/**
 * Mount `kase` into `root` on an instance of its own — CONTRIBUTING.md, **What
 * a case draws with, and what runs it**.
 */
export function runCase(kase: Case, root: HTMLElement, brings: Brings): Running {
  let problem: string | undefined
  let caseStep: ReturnType<NonNullable<Case['onStep']>> | undefined

  const status = (): void => {
    // A diagnostic outlives the step it was reported during, because that step
    // is usually still on screen waiting for the signal that got dropped.
    brings.onStatus?.([where(leko), problem].filter(Boolean).join('  ⟵  '))
  }

  // One instance per case, made before the page is mounted so the page can be
  // given it — an application exports its instance and reports to that, rather
  // than being handed a tour once one starts.
  const leko = createLeko({
    ...kase.options,
    ...brings.options,
    hostChrome: [...brings.chrome, ...[kase.options?.hostChrome ?? []].flat()],
    // Nothing is logged by the library, so this is where a project decides.
    onDiagnostic: (found) => {
      problem = explain(found)
      brings.onProblem?.(problem, found)
      status()
    },
    // The one hook that says where the tour got to, for however many stories a
    // case registers, and it is told which story each time. A host whose
    // stories live in several places writes exactly this and routes it, which
    // is what the last line does.
    onStep: (step, story) => {
      brings.onStep?.(step, story)
      status()
      caseStep?.(step, story)
    },
  })

  const teardownCase = kase.mount(root, leko)
  caseStep = kase.onStep?.(root, leko)

  const stories = brings.stories ?? kase.stories
  status()

  return {
    leko,
    stories,
    start(id) {
      const story = stories.find((one) => one.id === id)
      if (!story) return
      problem = undefined
      // Told before the call rather than after, so the diagnostic a refused
      // start makes comes after the call that made it. `start` returns nothing,
      // and a call that came to nothing is a diagnostic.
      brings.onCall?.(`start('${story.id}')`)
      leko.start(story)
      status()
    },
    stop() {
      brings.onCall?.('stop()')
      leko.stop()
      status()
    },
    pickUp() {
      brings.onCall?.(`pickUp([${stories.map((s) => `'${s.id}'`).join(', ')}])`)
      leko.pickUp(stories)
      status()
    },
    teardown() {
      leko.stop()
      teardownCase()
    },
  }
}
