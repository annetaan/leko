/**
 * A generated vocabulary, and the promise that it is complete.
 *
 * This is what `leko-signals` writes by default. The vocabulary came from the
 * `reached()` calls in the project, so a name in `awaits` that is missing from
 * it is a step waiting for a report nothing makes. That one fails to compile.
 * `reached()` is untouched.
 */
import {
  createLeko,
  type LekoKnownSignal,
  type LekoSignal,
  type LekoStep,
  type LekoStory,
} from '@annetaan/leko'

import { assertType, type Equal } from './assert.js'

declare module '@annetaan/leko' {
  interface LekoSignals {
    'order-saved': true
    'report-exported': true
  }
  interface LekoStrict {
    strict: true
  }
}

// The vocabulary and nothing else. No `(string & {})` arm, which is what makes
// the typo below an error.
assertType<Equal<LekoKnownSignal, 'order-saved' | 'report-exported'>>()

// And `reached()` keeps its loose arm, in the same program. This pair is the
// whole design.
assertType<Equal<LekoSignal, 'order-saved' | 'report-exported' | (string & {})>>()

export const declared: LekoStep = {
  id: 'save',
  target: 'button[type="submit"]',
  awaits: 'order-saved',
}

export const typo: LekoStep = {
  id: 'export',
  target: 'button[data-export]',
  // @ts-expect-error nothing in the project reports this name. The build fails
  // here if `LekoStrict` ever stops tightening `awaits`, which is the assertion.
  awaits: 'report-exproted',
}

/**
 * Where a story is checked, now that `start` is handed one rather than a name.
 *
 * A story written as a plain `const` and passed to `start` later widens
 * `awaits` to `string` before anything looks at it, so the typo is still caught
 * but the error lands on the `start` call rather than on the line that has it.
 * `satisfies` is what keeps both: the literal survives, and the check happens
 * here. This is the form the README teaches, so it is the form that is pinned.
 */
export const story = {
  id: 'onboarding',
  steps: [
    {
      id: 'save',
      target: 'button[type="submit"]',
      awaits: 'order-saved',
    },
  ],
} satisfies LekoStory

// The literal survived, which is what a plain annotation would have thrown away.
assertType<Equal<(typeof story)['steps'][0]['awaits'], 'order-saved'>>()

export const mistyped = {
  id: 'onboarding',
  steps: [
    {
      id: 'export',
      target: 'button[data-export]',
      // @ts-expect-error the same typo as above, reported on this line rather
      // than wherever this story is eventually started.
      awaits: 'report-exproted',
    },
  ],
} satisfies LekoStory

const leko = createLeko()
leko.start(story)
leko.reached('report-exported')
// Still free, deliberately, and this is the line a strict `reached()` would
// have deleted from somebody's source.
leko.reached('a-name-no-story-waits-for')
