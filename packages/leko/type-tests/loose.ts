/**
 * A vocabulary nobody promised was complete, which is what
 * `leko-signals --loose` writes and what a hand-maintained list gets.
 * DESIGN.md, **Strict on `awaits`, never on `reached()` — the asymmetry is the
 * design**.
 *
 * The block below is the one a consumer writes, against the package name and
 * not a path inside it, which is the part worth testing: `LekoSignals` is
 * declared in `types.ts` and only re-exported from the entry point.
 */
import { createLeko, type LekoKnownSignal, type LekoSignal, type LekoStep } from '@annetaan/leko'

import { assertType, type Equal } from './assert.js'

declare module '@annetaan/leko' {
  interface LekoSignals {
    'order-saved': true
    'report-exported': true
  }
}

// An editor offers the arms of a union and has nothing to offer for `string`,
// which is what these two are for.
assertType<Equal<LekoKnownSignal, 'order-saved' | 'report-exported' | (string & {})>>()
assertType<Equal<LekoSignal, 'order-saved' | 'report-exported' | (string & {})>>()

export const declared: LekoStep = {
  id: 'save',
  target: 'button[type="submit"]',
  awaits: 'order-saved',
}

// A name outside the vocabulary still compiles here: without `LekoStrict` the
// vocabulary is a suggestion.
export const undeclared: LekoStep = {
  id: 'export',
  target: 'button[data-export]',
  awaits: 'invoice-mailed',
}

const leko = createLeko()
leko.reached('report-exported')
leko.reached('invoice-mailed')
