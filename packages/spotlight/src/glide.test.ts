import { afterEach, expect, test, vi } from 'vitest'

import { bringIntoView, type Glide } from './glide.js'

// What a staged scroll does that a direct one does not: one port at a time,
// outermost first, a beat between two of them, and one `Glide` over the lot.
// DESIGN.md argues all of it under
// **`scroll: 'staged'` moves one port at a time, outermost first**. The rules
// both modes share — where a port puts a box, what a viewer taking over does,
// what `duration: 0` does — are argued under **Bringing a target into view**
// and are asked of the geometry in `geometry.test.ts`; what is asked here is
// only what having stages adds.
//
// **On a clock the test owns**, the way the glide tests in `leko.test.ts` are.
// A real one cannot tell a starved frame loop from a finished one, and the
// claims below are about which port has moved *by* a given moment, which is
// exactly what a runner short of frames makes unanswerable. It also makes the
// beat a thing the test steps through rather than waits out.

/**
 * How long each stage below runs, in ms, and how many frames of the test's
 * clock that is. `duration` is the floor under a glide and every distance here
 * is short enough that the floor wins, so a stage is exactly this many frames
 * rather than however far `glideDuration` stretches it.
 */
const DURATION = 2000
const STAGE = DURATION / 16

/** One frame past a count, which is where something that takes that many has happened. */
const past = (count: number): number => count + 1

const mounted: Element[] = []

afterEach(() => {
  vi.useRealTimers()
  for (const el of mounted.splice(0)) el.remove()
  window.scrollTo(0, 0)
})

/** One frame, and the reactions to it. */
const advance = async (): Promise<void> => {
  vi.advanceTimersByTime(16)
  // Three turns rather than one: a stage landing resolves a promise whose
  // handler settles a second, and the test's own watcher is a third.
  for (let n = 0; n < 3; n++) await Promise.resolve()
}

const frames = async (count: number): Promise<void> => {
  for (let n = 0; n < count; n++) await advance()
}

/** Frames until `is` holds, and **says so if it never does**. */
async function until(is: () => boolean, count: number, what: string): Promise<void> {
  for (let n = 0; n < count; n++) {
    if (is()) return
    await advance()
  }
  if (!is()) throw new Error(`${what} — not within ${count} frames`)
}

const add = <T extends HTMLElement>(el: T, into: Element = document.body): T => {
  into.append(el)
  if (into === document.body) mounted.push(el)
  return el
}

const spacer = (): HTMLElement => {
  const el = document.createElement('div')
  el.style.height = '1500px'
  return el
}

/**
 * A row twenty deep in a list, in a panel below the fold: two ports, and
 * neither of them holding it.
 */
function nested(): { panel: HTMLElement; row: HTMLElement } {
  add(spacer())
  const panel = add(document.createElement('div'))
  Object.assign(panel.style, { height: '200px', overflow: 'auto', border: 'none' })
  const list = add(document.createElement('div'), panel)
  let row!: HTMLElement
  for (let n = 0; n < 40; n++) {
    const item = document.createElement('div')
    item.style.height = '40px'
    item.textContent = `Row ${n + 1}`
    list.append(item)
    if (n === 20) row = item
  }
  add(spacer())
  return { panel, row }
}

/** Where a box sits on screen, down the page. */
const middleOf = (el: Element): number => {
  const r = el.getBoundingClientRect()
  return r.top + r.height / 2
}

/** A glide with whether it has settled kept beside it, which is what a test asks. */
interface Watched {
  settled: () => boolean
  abandon: () => void
}

function watch(glide: Glide | undefined): Watched {
  if (!glide) throw new Error('nothing to wait for: this scroll should have been a glide')
  let done = false
  void glide.settled.then(() => {
    done = true
  })
  return { settled: () => done, abandon: () => glide.abandon() }
}

test('a staged scroll moves the page first and leaves the panel where it is', async () => {
  vi.useFakeTimers()
  const { panel, row } = nested()

  watch(bringIntoView([row], 0, DURATION, 'staged'))
  await frames(3)

  expect(window.scrollY).toBeGreaterThan(0)
  expect(panel.scrollTop).toBe(0)
})

test('the panel starts only after the page has landed, and after a beat', async () => {
  vi.useFakeTimers()
  const { panel, row } = nested()

  watch(bringIntoView([row], 0, DURATION, 'staged'))
  // The page's stage is over by here, and the beat has not run out.
  await frames(past(STAGE) + 4)
  const landed = window.scrollY
  expect(panel.scrollTop).toBe(0)

  await until(() => panel.scrollTop > 0, 40, 'the panel never took its turn')
  // The page holds still through the beat and through the panel's stage: its
  // own is over, and nothing else writes to it.
  expect(window.scrollY).toBe(landed)
})

test('the glide settles when the last stage lands, with every port where it belongs', async () => {
  vi.useFakeTimers()
  const { panel, row } = nested()

  const glide = watch(bringIntoView([row], 0, DURATION, 'staged'))
  await until(glide.settled, past(STAGE) * 2 + 40, 'the staged glide never settled')

  // The row is at the middle of the panel, and the panel has put it at the
  // middle of the screen: what the arithmetic promised before anything moved.
  const port = panel.getBoundingClientRect()
  expect(middleOf(row)).toBeCloseTo(port.top + port.height / 2, -1)
  expect(middleOf(row)).toBeCloseTo(document.documentElement.clientHeight / 2, -1)
})

test('a scroll of the viewer’s own ends the glide there, and no stage follows it', async () => {
  vi.useFakeTimers()
  const { panel, row } = nested()

  const glide = watch(bringIntoView([row], 0, DURATION, 'staged'))
  await frames(10)
  window.scrollTo(0, 0)

  await until(glide.settled, 10, 'the glide never noticed the page had been taken')
  await frames(past(STAGE) + 40)
  expect(window.scrollY).toBe(0)
  expect(panel.scrollTop).toBe(0)
})

test('a glide abandoned during the beat leaves the page where the stage put it', async () => {
  vi.useFakeTimers()
  const { panel, row } = nested()

  const glide = watch(bringIntoView([row], 0, DURATION, 'staged'))
  await frames(past(STAGE) + 4)
  const landed = window.scrollY
  glide.abandon()

  await frames(past(STAGE) + 40)
  expect(window.scrollY).toBe(landed)
  expect(panel.scrollTop).toBe(0)
  // DESIGN.md, **A glide the tour has moved past is cancelled, and the page
  // stops where it is**: what is dropped is dropped, beat or frame.
  expect(glide.settled()).toBe(false)
})

test('a glide abandoned as a stage lands runs no more stages', async () => {
  vi.useFakeTimers()
  const { panel, row } = nested()

  const glide = watch(bringIntoView([row], 0, DURATION, 'staged'))
  // The window `play` guards with `over`: a stage has landed and settled its
  // own promise, and the arrival that abandons the glide lands before the
  // handler that would start the next one. Nothing but the guard stands
  // between the two, so this is the only test that fails without it — an
  // abandon a frame either side of here is stopped by a frame or by a beat
  // instead.
  //
  // Raw ticks with no microtask turn let through, so the window stays open:
  // a flight schedules its next frame from inside the last one and the beat is
  // armed only by a handler, so the tick that leaves the clock with nothing
  // pending is the tick the stage landed on. Where the page has stopped is no
  // use for finding it — the tail of the easing is sub-pixel for several
  // frames, which is what `leko.test.ts` records `stopped()` breaking on.
  for (let n = 0; n < past(STAGE) && vi.getTimerCount() > 0; n++) vi.advanceTimersByTime(16)
  expect(vi.getTimerCount()).toBe(0)
  expect(window.scrollY).toBeGreaterThan(0)
  glide.abandon()

  await frames(past(STAGE) + 40)
  expect(panel.scrollTop).toBe(0)
  expect(glide.settled()).toBe(false)
})

test('a staged scroll with duration 0 sets every port outright and glides nothing', async () => {
  vi.useFakeTimers()
  const { panel, row } = nested()

  expect(bringIntoView([row], 0, 0, 'staged')).toBeUndefined()
  expect(panel.scrollTop).toBeGreaterThan(0)
  expect(window.scrollY).toBeGreaterThan(0)
  const port = panel.getBoundingClientRect()
  expect(middleOf(row)).toBeCloseTo(port.top + port.height / 2, -1)
})

test('a staged scroll of one port is the trip a direct one is, with no beat after it', async () => {
  vi.useFakeTimers()
  add(spacer())
  const card = add(document.createElement('div'))
  Object.assign(card.style, { height: '40px' })
  add(spacer())

  const glide = watch(bringIntoView([card], 0, DURATION, 'staged'))
  await frames(past(STAGE))
  // The page's own stage is the whole glide, so it settles on the frame that
  // lands rather than a beat later.
  expect(glide.settled()).toBe(true)
  expect(middleOf(card)).toBeCloseTo(document.documentElement.clientHeight / 2, -1)
})
