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
const mounted: Element[] = []

// Registered once per importing file: Vitest gives each test file its own
// module graph, so these arrays never hold another file's leftovers.
afterEach(() => {
  for (const leko of instances.splice(0)) leko.stop()
  for (const el of mounted.splice(0)) el.remove()
  vi.restoreAllMocks()
})

/**
 * Duration 0 unless a test says otherwise. These are about what ends up on
 * screen rather than how long it took to get there, and a morph still running
 * would put a half-drawn hole into assertions that are not about one.
 */
export function instance(options: LekoOptions = {}) {
  const leko = createLeko({ duration: 0, ...options })
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

/**
 * An instance with `story` to hand, which {@link begin} puts up by name.
 *
 * The story is staged as it was written. Nothing here rewrites a step: the
 * object a test builds is the object the machine holds and the object a hook is
 * handed back, and one test in `wiring.test.ts` is about exactly that. A test
 * that wants its hole reachable writes `interactive: true` on the step's
 * region, the same as any other host.
 */
export function holding(story: LekoStory, options: LekoOptions = {}) {
  const leko = instance(options)
  staged.set(leko, new Map([[story.id, story]]))
  return leko
}

/** Put up the story `leko` is holding under `id`. */
export const begin = (leko: Leko, id: string): void => leko.start(staged.get(leko)!.get(id)!)

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
export function keep<T extends Element>(el: T): T {
  mounted.push(el)
  return el
}

export function pair(): [HTMLElement, HTMLElement] {
  return [
    box('first', { left: '100px', top: '100px', width: '120px', height: '40px' }),
    box('second', { left: '100px', top: '300px', width: '120px', height: '40px' }),
  ]
}

export const centre = (el: Element) => {
  const r = el.getBoundingClientRect()
  return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
}

export const scrim = () => document.querySelector<HTMLElement>('.leko-scrim')

/**
 * How many holes the innermost scrim has cut, read off its mask.
 *
 * A hole and a hole somebody can reach are two different things, and this is
 * the first of them. {@link absorbed} is the second. The mask is one layer for
 * the surface and one image per hole, and the surface layer is a gradient, so
 * counting the images counts the cutouts.
 */
export const holes = (): number => (scrim()?.style.maskImage ?? '').split('url(').length - 1

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
 * How often the two watchers below look at the page.
 *
 * A timer rather than an animation frame, deliberately. This suite runs in
 * three browsers at once beside the Node projects, and on the two-core CI
 * runner a single `requestAnimationFrame` has been watched taking more than
 * three seconds while timers went on ticking at this rate — a watcher built on
 * frames then reports one sample for a whole flight, or hangs past the test
 * timeout waiting for the frame that would end it. What is being watched here
 * is where the page is, which a timer can ask just as well.
 */
export const TICK = 16

/** A plain wait, for a test that has to look at something mid-flight. */
export const pause = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Watch the page and the innermost scrim together, tick by tick, from the moment
 * a step that scrolls was asked for until the step has been drawn and the page
 * has stopped.
 *
 * Every tick rather than a sample at a chosen moment: the glide ends on its own
 * clock, but it runs on frames, and on a loaded machine a frame can be a long
 * time coming — so a test that looked once at a fixed time would be a test
 * that passed on one machine.
 *
 * `standing` is the mask the scrim carries now, so a sample carrying a
 * different one is the step having been drawn. The watch ends four still ticks
 * after that, or at `cap` — it has to outlast the page, because what a caller
 * asks of these samples is whether the page moved *after* the step was drawn.
 */
export async function duringGlide(
  standing: string,
  cap = 8000,
): Promise<{ scrollY: number; mask: string }[]> {
  const seen: { scrollY: number; mask: string }[] = []
  const began = performance.now()
  let still = 0
  let last = window.scrollY
  let drawn = false
  for (;;) {
    await pause(TICK)
    const scrollY = window.scrollY
    const mask = scrim()?.style.maskPosition ?? ''
    seen.push({ scrollY, mask })
    if (mask !== standing) drawn = true
    still = scrollY === last ? still + 1 : 0
    last = scrollY
    if ((drawn && still >= 4) || performance.now() - began > cap) break
  }
  return seen
}

/**
 * Wait until the message has its next control, and **say so if it never
 * arrives**.
 *
 * A morph that animates puts the message back only when it arrives, so a test
 * running with a real `duration` has nothing to press until then. Tests with
 * the harness default of `0` never need this.
 *
 * It throws rather than returning quietly, because {@link press} is
 * `control()?.click()` and a press with no control is a no-op: a test that
 * waited a fixed moment and then pressed would go on to measure a tour that
 * never advanced, and pass or fail for reasons that have nothing to do with
 * what it is about. That is exactly what happened on a loaded CI runner, where
 * a 320ms morph took longer than this used to wait.
 */
export async function shown(within = 8000): Promise<void> {
  const began = performance.now()
  while (!control()) {
    if (performance.now() - began > within) {
      throw new Error(`no next control after ${within}ms — the morph never finished`)
    }
    await pause(TICK)
  }
}

/**
 * Wait for a page Leko set gliding to stop, and for the morph after it.
 *
 * Watches the offset, because a test has no handle on the glide: the promise
 * that says it landed is the presenter's. A grace period first, because the
 * offset is still before the first frame too, and six still ticks from a
 * standing start would otherwise be reached before the page had set off.
 */
export async function stopped(cap = 8000): Promise<void> {
  const began = performance.now()
  let last = window.scrollY
  let still = 0
  for (;;) {
    await pause(TICK)
    const y = window.scrollY
    still = y === last ? still + 1 : 0
    last = y
    const waited = performance.now() - began
    if ((waited > 150 && still >= 6) || waited > cap) break
  }
  // And the morph, which starts once the page has stopped.
  await pause(400)
}

/**
 * Let a `MutationObserver` deliver what a test just did to the page.
 *
 * Its callback is a microtask, so one turn of the queue is enough. {@link frame}
 * is two frames, which is far more time than a retry gets: a step arriving at a
 * target the page does not have yet is given 100ms, and a loaded machine can
 * spend longer than that on two frames and end the tour while a test thinks it
 * is watching one wait.
 */
export const observed = (): Promise<void> => Promise.resolve()

/**
 * Whether the tour absorbed a hit at the centre of `el`, rather than the page
 * underneath receiving it.
 *
 * The scrim paints and catches nothing, so the blocking rectangles beside it
 * are the only thing of Leko's that ever catches a hit on the page. That is
 * what this asks about: `.leko-blocking`, the layer they are in.
 *
 * It is true both of the page outside every hole and of a hole the step showed
 * without opening. Those are the same fact: the tour took the hit.
 */
export const absorbed = (el: Element): boolean =>
  (centre(el) as Element | null)?.closest('.leko-blocking') != null

/** Every call, as the id it named, so a whole run reads as one array. */
export function watched(story: LekoStory, options: Omit<LekoOptions, 'onStep'> = {}) {
  const seen: (string | undefined)[] = []
  const leko = holding(story, { ...options, onStep: (step) => seen.push(step?.id) })
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
