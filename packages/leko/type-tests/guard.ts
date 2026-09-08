/**
 * A guard needs a target, held by the compiler. `validate` and `error` are
 * questions about the element a step points at — DESIGN.md, **A failed
 * attempt** — so a step with no `target` is a `LekoUntargetedStep`, where both
 * are `never` and fail to compile even when they arrive on an object built
 * somewhere else.
 */
import type { LekoStep, LekoTargetedStep } from '@annetaan/leko'
import { assertType, type Equal } from './assert.js'

export const guarded: LekoStep = { id: 'a', target: '#email', validate: () => true }

export const worded: LekoStep = {
  id: 'a',
  target: '#email',
  validate: () => false,
  error: 'That does not look like an email address yet.',
}

export const asked: LekoStep = {
  id: 'a',
  target: '#email',
  validate: () => false,
  error: (el) => `${(el as HTMLInputElement).value} is already taken.`,
}

// The two shapes a step with no target takes: a wait — DESIGN.md, **A step
// that waits** — and a note with the next control and nothing to guard.
export const waiting: LekoStep = { id: 'a', message: 'Loading…', awaits: 'draft-loaded' }
export const noted: LekoStep = { id: 'a', message: 'Check the totals before going on.' }

// @ts-expect-error — a guard needs a target.
export const unguardable: LekoStep = {
  id: 'confirm',
  message: 'Check the totals before going on.',
  validate: () => true,
}

// @ts-expect-error — the words for a failed guard need the guard's target.
export const wordless: LekoStep = {
  id: 'confirm',
  message: 'Check the totals before going on.',
  error: 'Not yet.',
}

// Not a fresh literal, so no excess-property check applies: `validate?: never`
// on the untargeted step is what refuses this one.
const smuggled = { id: 'confirm', validate: () => true }
// @ts-expect-error — a guard does not find a target by travelling through a
// variable.
export const structurally: LekoStep = smuggled

// `target` is what tells the two members apart, so a host that has one can
// read the guard off it.
export const narrowed = (step: LekoStep): void => {
  if (step.target !== undefined) {
    assertType<Equal<typeof step.validate, LekoTargetedStep['validate']>>()
  } else {
    assertType<Equal<typeof step.validate, undefined>>()
  }
}
