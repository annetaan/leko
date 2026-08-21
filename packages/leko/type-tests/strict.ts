/**
 * A generated vocabulary, and the promise that it is complete.
 *
 * This is what `leko-signals` writes by default. The vocabulary came from the
 * `reached()` calls in the project, so a name in `awaits` that is missing from
 * it is a step waiting for a report nothing makes. That one fails to compile.
 * `reached()` is untouched.
 */
import { createLeko, type LekoKnownSignal, type LekoSignal, type LekoStep } from '@annetaan/leko'

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

const leko = createLeko()
leko.reached('report-exported')
// Still free, deliberately, and this is the line a strict `reached()` would
// have deleted from somebody's source.
leko.reached('a-name-no-story-waits-for')
