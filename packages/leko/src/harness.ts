import { afterEach, vi } from 'vitest'

import { createLeko, type Leko } from './leko.js'
import type { LekoOptions, LekoStep, LekoStory } from '@annetaan/leko-types'

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

// Read once, before any test in the importing file has run — the URL to put
// back, for a step that waits on one.
const startUrl = location.pathname + location.search + location.hash

// Registered once per importing file: Vitest gives each test file its own
// module graph, so these arrays never hold another file's leftovers.
afterEach(() => {
  for (const leko of instances.splice(0)) leko.stop()
  for (const el of mounted.splice(0)) el.remove()
  vi.restoreAllMocks()
  // A test that took the clock — {@link clocked} — hands it back even where it
  // threw before it could, so the next test's timers are the page's own.
  vi.useRealTimers()
  // A test that routed the page, the same way. `replaceState` rather than
  // `back()`: nothing here should fire another navigation for the next test to
  // catch.
  history.replaceState(null, '', startUrl)
  // A note a test kept must not reach the next test, and reaching
  // `sessionStorage` at all can throw where site data is blocked — the same
  // reason `keep`, `take` and `forget` in `presenter.ts` are wrapped.
  try {
    sessionStorage.clear()
  } catch {}
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

export const begin = (leko: Leko, id: string): void => leko.start(staged.get(leko)!.get(id)!)

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
 * A hole and a hole somebody can reach are two different things — DESIGN.md,
 * **A hole, and whether it is open** — and this is the first of them;
 * {@link absorbed} is the second. Counting the mask's images counts the
 * cutouts, because the only other layer it carries is the surface gradient.
 */
export const holes = (): number => (scrim()?.style.maskImage ?? '').split('url(').length - 1

/** The box holding the way out of the tour, or `null` while none is drawn. */
export const closer = () => document.querySelector<HTMLElement>('.leko-close')

const all = (selector: string) => [...document.querySelectorAll<HTMLElement>(selector)]
const at = (el: HTMLElement | null, ...keys: string[]): string =>
  el ? keys.map((key) => `${key}=${el.style.getPropertyValue(key)}`).join(' ') : 'none'

/**
 * Everything a draw wrote, as one string: every scrim's size and mask, every
 * blocking rectangle, every halo, the anchor marker, and where the message and
 * the way out were put. Two draws that wrote the same page dump the same
 * string, so a test compares two of these where it would otherwise have to
 * name each value the draw owes — and a diff against another branch is the
 * same string dumped there.
 */
export function drawn(): string {
  const inset = ['left', 'top', 'width', 'height']
  return [
    ...all('.leko-scrim').map(
      (el, i) => `scrim ${i}: ${at(el, 'width', 'height', 'mask-position', 'mask-image')}`,
    ),
    ...all('.leko-block').map((el, i) => `block ${i}: ${at(el, ...inset)}`),
    ...all('.leko-halo').map(
      (el, i) =>
        `halo ${i}: ${at(el, ...inset, 'border-radius')} open=${el.hasAttribute('data-open')}`,
    ),
    `anchor: ${at(document.querySelector<HTMLElement>('.leko-anchor'), 'left', 'top')}`,
    `message: ${at(
      document.querySelector<HTMLElement>('.leko-message'),
      'left',
      'top',
      'bottom',
      'right',
      'justify-self',
      'align-self',
      'margin-top',
      'margin-right',
      'margin-bottom',
      'margin-left',
    )}`,
    `close: ${at(closer(), 'left', 'top')}`,
  ].join('\n')
}

/** The side of its hole a message is held on, read from the inset that carries `anchor()`. */
export function sideOf(el: HTMLElement): 'bottom' | 'top' | 'right' | 'left' | undefined {
  const opposite = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' } as const
  const inset = (['top', 'bottom', 'left', 'right'] as const).find((name) =>
    el.style.getPropertyValue(name).startsWith('anchor('),
  )
  return inset && opposite[inset]
}

/**
 * The next control on the message, or `null` where the step showing has none —
 * DESIGN.md, **The next control**.
 */
export const control = () => document.querySelector<HTMLButtonElement>('.leko-message-next')

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
 * What a test waits for after a call that hands the tour a step, before it
 * reads the page or changes it: the two frames a hand-over is drawn in —
 * DESIGN.md, **A step is drawn on the next frame, not inside the call that
 * moved the tour**.
 *
 * Two, not one, because a render the host's handler left behind can land after
 * the first frame and not after the second — `spike/a-render-before-the-frame/`.
 * Requested after the call, so each of these frames is registered after the
 * tour's own, and the second runs after the draw. That is exactly enough, and
 * no fewer frames will do.
 */
export const framed = (): Promise<void> => frame()

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

/**
 * How long a wait on the page in real time goes on before it calls the page
 * stuck, in the suite that runs the tour in all three browsers.
 *
 * Long, because a frame on the two-core CI runner can stall for seconds, for
 * the reason {@link TICK} records. And because a first draw costs more than
 * that suggests: in Playwright's WebKit on Linux, the first frame that paints a
 * document-tall scrim compiles Mesa's shaders, about 600ms on an idle two-core
 * machine with an empty shader cache, and CI always starts with an empty one.
 * On a loaded runner that first frame alone takes more than a second.
 */
export const PATIENCE = 8000

/** A plain wait, for a test that has to look at something mid-flight. */
export const pause = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Put the test in charge of the clock.
 *
 * The morph and the glide are frame loops reading `requestAnimationFrame` and
 * `performance.now()`, and Vitest's default set of fakes covers both, so a
 * 320ms morph is twenty frames of {@link advance} whatever the runner is doing
 * — where a real one has been watched taking eight seconds on the two-core CI
 * runner, for the reason {@link TICK} records. The page itself is still real:
 * `scrollTo`, `scrollY` and every layout read are synchronous, so what the
 * frames write is what the page shows. The harness's `afterEach` hands the
 * clock back.
 */
export const clocked = (): void => {
  vi.useFakeTimers()
}

/**
 * One frame of a clock a test took with {@link clocked}.
 *
 * The frame is run synchronously and one microtask turn is let go by after it:
 * a frame that ends a morph or a glide settles a promise, and everything on the
 * far side of it — the `settled` and `morphed` the presenter dispatches — runs
 * in the first reaction and arms the next frame from there, so it has to have
 * run before that frame is asked for. Not `advanceTimersByTimeAsync`, which
 * yields to a real `setTimeout` after every timer it fires and costs a
 * hundred-frame flight a second or two in every engine.
 */
export const advance = async (): Promise<void> => {
  vi.advanceTimersByTime(16)
  await Promise.resolve()
}

/**
 * Whether the message is on screen, read off the style `show()` and `hide()`
 * write. Not `checkVisibility`: the fade `show()` starts is a CSS transition
 * on the browser's own clock, which a fake one does not drive, so it would
 * answer from how much real time a frame happened to take. {@link control} is
 * no use here either — a hidden message keeps its control in the DOM.
 */
export const said = (): boolean =>
  document.querySelector<HTMLElement>('.leko-message')?.style.visibility === 'visible'

/**
 * Advance the clock a frame at a time until `is` holds, and **say so if it
 * never does**. The cap is a count of frames rather than a time, so a runner
 * short of frames cannot stretch it and the number keeps meaning what it says.
 */
export async function until(is: () => boolean, frames: number, what: string): Promise<void> {
  for (let n = 0; n < frames; n++) {
    if (is()) return
    await advance()
  }
  if (!is()) throw new Error(`${what} — not within ${frames} frames`)
}

/**
 * Wait until the message is showing its next control, and **say so if it
 * never arrives**. Showing, and not only there: the message is on the page,
 * hidden, from the first draw — DESIGN.md, **The way out**.
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
export async function shown(within = PATIENCE): Promise<void> {
  const began = performance.now()
  while (!said() || !control()) {
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
 *
 * **It cannot tell a starved frame loop from a finished one, and it breaks
 * before the end of every flight.** Six still samples is 96ms, and the tail of
 * a glide's easing is sub-pixel for longer than that: instrumented against the
 * nested panel in `leko.test.ts`, on a machine with frames to spare, this broke
 * at about 1500ms with the page 1px short of its destination, in every run of
 * nine across the three engines. What covers that last pixel is the 400ms of
 * real time below. So a flight is only waited out while the frames the rest of
 * it needs arrive inside those 400ms — and where a frame interval stretches
 * past 96ms, as WebKit's does under load for the reason {@link TICK} records,
 * this breaks earlier in the curve, the distance left needs frames rather than
 * time, and what a test reads afterwards is a page still on its way. A test
 * that cannot afford that takes the clock — {@link clocked} — and waits on
 * what the flight ends with rather than on the offset holding still, the way
 * `a step that asks for staged leaves its panel until the page has landed`
 * does.
 */
export async function stopped(cap = PATIENCE): Promise<void> {
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
  await pause(400)
}

/**
 * Let a `MutationObserver` deliver what a test just did to the page.
 *
 * Its callback is a microtask, so one turn of the queue is enough. {@link frame}
 * is two frames, which is far more time than a retry gets — DESIGN.md, **A
 * target that is not on the page when its step arrives gets a 100ms grace
 * period** — and a loaded machine can spend longer than that on two frames and
 * end the tour while a test thinks it is watching one wait.
 */
export const observed = (): Promise<void> => Promise.resolve()

/**
 * Whether the tour absorbed a hit at the centre of `el`, rather than the page
 * underneath receiving it.
 *
 * DESIGN.md, **Every layer paints and catches nothing. Plain rectangles in the
 * gaps between the open cutouts do the blocking**, so `.leko-blocking` is the
 * layer this asks about.
 *
 * It is true both of the page outside every hole and of a hole the step showed
 * without opening. Those are the same fact: the tour took the hit.
 */
export const absorbed = (el: Element): boolean =>
  (centre(el) as Element | null)?.closest('.leko-blocking') != null

export function watched(story: LekoStory, options: Omit<LekoOptions, 'onStep'> = {}) {
  const seen: (string | undefined)[] = []
  const leko = holding(story, { ...options, onStep: (step) => seen.push(step?.id) })
  return { leko, seen }
}

export function held(): { promise: Promise<void>; settle: () => void } {
  let settle!: () => void
  const promise = new Promise<void>((resolve) => {
    settle = resolve
  })
  return { promise, settle }
}
