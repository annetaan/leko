/**
 * The shape of `target`, held by the compiler.
 *
 * One rule lives in the type rather than in any runtime check: only the first
 * region — the one the step is about — may declare `interactive`. Every entry
 * after it is a {@link LekoShownRegion}, whose `interactive` is `never`, so
 * the flag fails to compile there even when it arrives on an object built
 * somewhere else. This file is that claim, stated as a program.
 */
import type { LekoRegion, LekoStep } from '@annetaan/leko'

export const bare: LekoStep = { id: 'a', target: '#save' }

export const opened: LekoStep = {
  id: 'a',
  target: { elements: '#save', interactive: true },
}

export const unioned: LekoStep = {
  id: 'a',
  target: { elements: ['#quantity-label', '#quantity'] },
}

export const twoHoles: LekoStep = { id: 'a', target: ['#row', '#summary'] }

export const firstOpen: LekoStep = {
  id: 'a',
  target: [{ elements: '#terms', interactive: true }, '#summary'],
}

export const laterShown: LekoStep = {
  id: 'a',
  target: ['#row', { elements: ['#tax', '#total'] }],
}

export const laterOpen: LekoStep = {
  id: 'a',
  // @ts-expect-error — only the first region can be opened.
  target: ['#row', { elements: '#summary', interactive: true }],
}

// Not a fresh literal, so no excess-property check applies: `interactive?:
// never` on the shown region is what refuses this one.
const smuggled: LekoRegion = { elements: '#summary', interactive: true }
export const structurally: LekoStep = {
  id: 'a',
  // @ts-expect-error — an opened region does not become showable by travelling
  // through a variable.
  target: ['#row', smuggled],
}
