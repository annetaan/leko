import { afterEach, expect, test, vi } from 'vitest'

import { type Cutout, ease } from './geometry.js'
import { Scrim } from './scrim.js'
import type { Surface } from './surface.js'

// The scrim's own promises, tested through the styles it writes. What the
// mask looks like is geometry.test.ts's business; what is pinned here is that
// the right number of holes is on screen at the moments that matter.

const scrims: Scrim[] = []

afterEach(() => {
  vi.useRealTimers()
  for (const scrim of scrims.splice(0)) scrim.destroy()
  for (const restore of gutters.splice(0)) restore()
  for (const box of panels.splice(0)) box.remove()
})

function mountScrim(surface: Surface = { kind: 'document' }): Scrim {
  const made = new Scrim(surface)
  made.measure()
  made.resize()
  scrims.push(made)
  return made
}

/**
 * Stage a document scrollbar of `width`, which is a `clientWidth` that far
 * short of `innerWidth`. jsdom reports the same number for both, so there is no
 * gutter to be wrong about unless one is put there.
 */
function withGutter(width: number): void {
  Object.defineProperty(document.documentElement, 'clientWidth', {
    configurable: true,
    get: () => window.innerWidth - width,
  })
  Object.defineProperty(document.documentElement, 'clientHeight', {
    configurable: true,
    get: () => window.innerHeight - width,
  })
  gutters.push(() => {
    delete (document.documentElement as unknown as { clientWidth?: number }).clientWidth
    delete (document.documentElement as unknown as { clientHeight?: number }).clientHeight
  })
}

const gutters: (() => void)[] = []

/** How many hole layers the mask carries, read the way `harness.ts` reads it. */
const holes = (scrim: Scrim): number => scrim.element.style.maskImage.split('url(').length - 1

test('an opening cuts one stretched hole per destination hole', () => {
  const scrim = mountScrim()
  scrim.converge(
    [
      { x: 100, y: 100, width: 120, height: 40, radius: 8, interactive: true },
      { x: 100, y: 300, width: 120, height: 40, radius: 8, interactive: false },
    ],
    scrim.seen(),
  )
  expect(holes(scrim)).toBe(2)
})

test('a story that opens onto no holes still converges rather than snapping dark', () => {
  // A first step that waits — no target, only `awaits` — heads for no holes at
  // all. The opening still starts from one stretched cutout, which the morph
  // that follows collapses, so the dark closes in instead of the page going
  // fully dimmed in a single frame.
  const scrim = mountScrim()
  scrim.converge([], scrim.seen())
  expect(holes(scrim)).toBe(1)
})

test('the viewport layer covers the scrollbar gutter rather than the layout viewport', () => {
  // DESIGN.md, **That layer is sized past the layout viewport on purpose, gutter
  // included**, and `spike/the-scrollbar-gutter/` is why that is safe to do.
  withGutter(15)
  const scrim = mountScrim({ kind: 'viewport' })
  expect(document.documentElement.clientWidth).toBe(window.innerWidth - 15)
  expect(scrim.element.style.width).toBe(`${window.innerWidth}px`)
  expect(scrim.element.style.height).toBe(`${window.innerHeight}px`)
})

test('the gutter going mid-step leaves the viewport layer covering everything', () => {
  // The application shortens the page under the tour — a filter empties a list,
  // a panel collapses — and the layer is never told. It is only right because the
  // number it was measured with did not depend on the scrollbar at all.
  withGutter(15)
  const scrim = mountScrim({ kind: 'viewport' })
  const drawn = scrim.element.style.width
  gutters.splice(0).forEach((restore) => restore())
  expect(document.documentElement.clientWidth).toBe(window.innerWidth)
  expect(scrim.element.style.width).toBe(drawn)
  expect(scrim.element.style.width).toBe(`${document.documentElement.clientWidth}px`)
})

/** A panel with more inside it than it shows, cleaned up after the test. */
function panel(): HTMLElement {
  const box = document.createElement('div')
  Object.assign(box.style, {
    position: 'relative',
    width: '200px',
    height: '140px',
    overflow: 'auto',
    border: '7px solid black',
    padding: '11px',
  })
  const content = document.createElement('div')
  Object.assign(content.style, { width: '900px', height: '900px' })
  box.append(content)
  document.body.append(box)
  panels.push(box)
  return box
}

const panels: HTMLElement[] = []

test('a glued layer sits on the scrollport at every offset', () => {
  // DESIGN.md, **A layer glued to a scrollport is what `position: fixed` cannot
  // say**, and `spike/a-sticky-target-pinning/` measured this shape in four
  // engines before it was written here.
  const box = panel()
  const scrim = mountScrim({ kind: 'glued', element: box })
  const port = (): DOMRect => {
    const r = box.getBoundingClientRect()
    return new DOMRect(
      r.left + box.clientLeft,
      r.top + box.clientTop,
      box.clientWidth,
      box.clientHeight,
    )
  }

  for (const [x, y] of [
    [0, 0],
    [180, 240],
    [box.scrollWidth, box.scrollHeight],
  ]) {
    box.scrollTo(x!, y!)
    const on = scrim.element.getBoundingClientRect()
    const want = port()
    expect(on.left).toBeCloseTo(want.left, 1)
    expect(on.top).toBeCloseTo(want.top, 1)
    expect(on.width).toBeCloseTo(want.width, 1)
    expect(on.height).toBeCloseTo(want.height, 1)
  }
})

test('a glued layer does not grow the scroller it is mounted in', () => {
  const box = panel()
  const [w, h] = [box.scrollWidth, box.scrollHeight]
  mountScrim({ kind: 'glued', element: box })
  expect(box.scrollWidth).toBe(w)
  expect(box.scrollHeight).toBe(h)
})

// The handover between the two frame loops this class has running. Which of
// them writes the mask at any moment is the scrim's own business — DESIGN.md,
// **A sticky target's hole is corrected on a frame loop, and that is the only
// exception to the ban** — so it is asked here rather than through the
// presenter. On a clock the test owns, because the claims are about frames.

const hole = (x: number): Cutout => ({
  x,
  y: 0,
  width: 60,
  height: 20,
  radius: 0,
  interactive: true,
})

const tick = async (count = 1): Promise<void> => {
  for (let n = 0; n < count; n++) {
    vi.advanceTimersByTime(16)
    await Promise.resolve()
  }
}

/** Long enough that a scroll during it is unambiguously during it. */
const MORPH = 320
const PAST_MORPH = 40

test('a follow armed during a morph waits for the morph to end', async () => {
  vi.useFakeTimers()
  const scrim = mountScrim()
  scrim.set([hole(0)])
  const port = new EventTarget()
  let asked = 0
  scrim.follow(() => {
    asked += 1
    return { cutouts: [hole(200)], onScreen: [hole(200)] }
  }, [port])

  scrim.morph([hole(100)], MORPH, ease)
  port.dispatchEvent(new Event('scroll'))
  await tick(4)
  // The morph is writing the mask, and two loops writing it would be two
  // answers a frame apart.
  expect(asked).toBe(0)

  await tick(PAST_MORPH)
  port.dispatchEvent(new Event('scroll'))
  await tick()
  expect(asked).toBeGreaterThan(0)
})

test('a shake gives the follow back when it ends', async () => {
  vi.useFakeTimers()
  const scrim = mountScrim()
  const port = new EventTarget()
  let asked = 0
  scrim.follow(() => {
    asked += 1
    return { cutouts: [hole(200)], onScreen: [hole(200)] }
  }, [port])
  scrim.set([hole(0)])

  port.dispatchEvent(new Event('scroll'))
  await tick()
  expect(asked).toBeGreaterThan(0)

  scrim.shake()
  const during = asked
  port.dispatchEvent(new Event('scroll'))
  await tick(4)
  expect(asked).toBe(during)

  // A refusal is not a step ending, so the hole goes on following its target
  // once the shake has finished shaking it.
  await tick(PAST_MORPH)
  port.dispatchEvent(new Event('scroll'))
  await tick()
  expect(asked).toBeGreaterThan(during)
})
