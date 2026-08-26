import { afterEach, vi } from 'vitest'

import { createLeko, type Leko } from './leko.js'
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
 * Duration 0 and no curtain unless a test says otherwise. These are about what
 * ends up on screen rather than how long it took to get there, and a curtain
 * that came down because a machine was busy for 250ms would put a scrim into
 * assertions that are not about one.
 */
export function instance(options: LekoOptions = {}) {
  const leko = createLeko({ duration: 0, curtain: false, ...options })
  instances.push(leko)
  return leko
}

/**
 * The stories a test has to hand, by name.
 *
 * Leko keeps no registry — `start` is handed the story itself — so the map from
 * a name to a story belongs to whatever holds the stories, and in these files
 * that is the test. None of them is about that map, which is why it lives here
 * rather than in each of them.
 */
const staged = new WeakMap<Leko, Map<string, LekoStory>>()

/** An instance with `story` to hand, which {@link begin} puts up by name. */
export function holding(story: LekoStory, options: LekoOptions = {}) {
  const leko = instance(options)
  staged.set(leko, new Map([[story.id, story]]))
  return leko
}

/** Put up the story `leko` is holding under `id`. */
export const begin = (leko: Leko, id: string): boolean => leko.start(staged.get(leko)!.get(id)!)

/** One story, started, which is what most of these want. */
export function start(steps: LekoStep[], options: LekoOptions = {}) {
  const leko = holding({ id: 'story', steps }, options)
  begin(leko, 'story')
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
 * The next control on the message, or `null` where the step showing has none.
 *
 * A step that declares `awaits` never gets one, which is the whole of what
 * keeps a press off a step waiting for a signal now that pressing this is the
 * only way to advance one without naming a signal.
 */
export const control = () => document.querySelector<HTMLButtonElement>('.leko-message-next')

/** Press the next control. Nothing happens where the step showing has none. */
export const press = (): void => control()?.click()

/**
 * Let a frame go by, which is what separates two presses.
 *
 * Everything reaching the control inside one frame is the same press, so a test
 * advancing twice in a row waits here in between.
 */
export const frame = (): Promise<void> =>
  new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))

/**
 * Whether the tour absorbed a hit at the centre of `el`, rather than the page
 * underneath receiving it. Asked this way round because the scrim paints and its
 * rectangles catch, so naming one element would be pinning down the mechanism
 * instead of the promise.
 */
export const absorbed = (el: HTMLElement): boolean =>
  (centre(el) as HTMLElement | null)?.closest('.leko-scrim') != null

/** Every call, as `[step, previous]` ids, so a whole run reads as one array. */
export function watched(story: LekoStory, options: Omit<LekoOptions, 'onStep'> = {}) {
  const seen: [string | undefined, string | undefined][] = []
  const leko = holding(story, {
    ...options,
    onStep: (step, previous) => seen.push([step?.id, previous?.id]),
  })
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
