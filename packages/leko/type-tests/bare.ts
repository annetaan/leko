/**
 * A project with no vocabulary at all.
 *
 * Nothing here augments anything, which is the state every consumer starts in
 * and the state a consumer who never runs the generator stays in. Nothing may
 * need importing, declaring or configuring for this to hold.
 */
import { createLeko, type LekoKnownSignal, type LekoSignal, type LekoStep } from '@annetaan/leko'

import { assertType, type Equal } from './assert.js'

// So that no editor offers a completion here, and nothing an existing story
// says is narrowed under it.
assertType<Equal<LekoKnownSignal, string>>()
assertType<Equal<LekoSignal, string>>()

export const step: LekoStep = {
  id: 'save',
  target: 'button[type="submit"]',
  awaits: 'order-saved',
}

export const url: LekoStep = {
  id: 'checkout',
  target: '#cart',
  awaits: { url: /^\/checkout/ },
}

export const notAUrl: LekoStep = {
  id: 'checkout',
  target: '#cart',
  // @ts-expect-error `awaits: { url }` takes a `RegExp` and nothing else —
  // DESIGN.md, **A URL is a signal the page reports**.
  awaits: { url: '/checkout' },
}

createLeko().reached('order-saved')
