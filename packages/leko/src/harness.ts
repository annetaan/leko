import { afterEach, vi } from 'vitest'

import { createLeko } from './leko.js'
import type { LekoOptions, LekoStep, LekoStory } from './types.js'

/*
 * What every browser test here needs to put a tour on a page and clean it up
 * again. Shared because the tests are split across three files by the kind of
 * claim they make, not by what they need to set up.
 *
 * Not a `.test.ts`, so no project's `include` picks it up as a suite of its
 * own. Nothing imports it from `src/index.ts` either, so it is not in what the
 * package builds.
 */

const instances: ReturnType<typeof createLeko>[] = []
const mounted: HTMLElement[] = []

// Registered once per importing file: Vitest gives each test file its own
// module graph, so these arrays never hold another file's leftovers.
afterEach(() => {
  for (const leko of instances.splice(0)) leko.stop()
  for (const el of mounted.splice(0)) el.remove()
  vi.restoreAllMocks()
})

/**
 * Duration 0 unless a test says otherwise: these are about what ends up on
 * screen, not about how long it took to get there.
 */
export function register(story: LekoStory, options: LekoOptions = {}) {
  const leko = createLeko({ duration: 0, ...options })
  instances.push(leko)
  leko.setStory(story)
  return leko
}

/** One story, registered and started, which is what most of these want. */
export function start(steps: LekoStep[], options: LekoOptions = {}) {
  const leko = register({ id: 'story', steps }, options)
  leko.start('story')
  return leko
}

export function box(text: string, style: Partial<CSSStyleDeclaration>): HTMLElement {
  const el = document.createElement('button')
  el.textContent = text
  Object.assign(el.style, { position: 'fixed', margin: '0', ...style })
  document.body.append(el)
  mounted.push(el)
  return el
}

/** Anything a test builds by hand still has to be taken away afterwards. */
export function keep<T extends HTMLElement>(el: T): T {
  mounted.push(el)
  return el
}

export function pair(): [HTMLElement, HTMLElement] {
  return [
    box('first', { left: '100px', top: '100px', width: '120px', height: '40px' }),
    box('second', { left: '100px', top: '300px', width: '120px', height: '40px' }),
  ]
}

export const centre = (el: HTMLElement) => {
  const r = el.getBoundingClientRect()
  return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
}

export const scrim = () => document.querySelector<HTMLElement>('.leko-scrim')

/** The box holding the way out of the tour, or `null` while none is drawn. */
export const closer = () => document.querySelector<HTMLElement>('.leko-close')

/**
 * Whether the tour absorbed a hit at the centre of `el`, rather than the page
 * underneath receiving it. Asked this way round because the scrim paints and its
 * rectangles catch, so naming one element would be pinning down the mechanism
 * instead of the promise.
 */
export const absorbed = (el: HTMLElement): boolean =>
  (centre(el) as HTMLElement | null)?.closest('.leko-scrim') != null

/** Every call, as `[step, previous]` ids, so a whole run reads as one array. */
export function watched(story: Omit<LekoStory, 'onStep'>, options: LekoOptions = {}) {
  const seen: [string | undefined, string | undefined][] = []
  const leko = register(
    { ...story, onStep: (step, previous) => seen.push([step?.id, previous?.id]) },
    options,
  )
  return { leko, seen }
}

/** A promise the test settles by hand, so the gap can be looked at. */
export function held(): { promise: Promise<void>; settle: () => void } {
  let settle!: () => void
  const promise = new Promise<void>((resolve) => {
    settle = resolve
  })
  return { promise, settle }
}
