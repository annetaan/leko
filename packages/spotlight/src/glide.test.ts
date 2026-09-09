import { afterEach, expect, test, vi } from 'vitest'

import { ease } from './geometry.js'
import { bringIntoView, type Glide } from './glide.js'

// What `glide.ts` does that the geometry cannot be asked. The line is purity
// rather than mode: which offset puts a box in the middle of a port, how long
// a trip over a distance takes and how a curve is shaped are `scrollDelta`,
// `scrollStages`, `glideDuration`, `ease` and `clamp`, asked of the numbers in
// `geometry.test.ts`. What is asked here is the half that reads the page to
// decide where the box goes — the walk along the surface chain, the client box
// of a port, a computed `scroll-margin`, the limit a destination is clamped to
// — and the frame loop that takes it there. DESIGN.md argues all of it under
// **Bringing a target into view**.
//
// **On a clock the test owns**, the way the glide tests in `leko.test.ts` are.
// A real one cannot tell a starved frame loop from a finished one, and the
// claims below are about which port has moved *by* a given moment, which is
// exactly what a runner short of frames makes unanswerable. It also makes the
// beat a thing the test steps through rather than waits out.
//
// **In three engines**, because the reads are the part they can answer
// differently: `clientLeft` and `clientTop` on a bordered panel, the value a
// `scroll-margin` computes to, and what an engine rounds a written offset back
// to. ONBOARDING.md, **Which Vitest project a new test belongs in**.

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

/** A block of the page's own flow, `height` px tall. */
const block = (height: number): HTMLElement => {
  const el = document.createElement('div')
  el.style.height = `${height}px`
  return el
}

const spacer = (): HTMLElement => block(1500)

/**
 * A row twenty deep in a list, in a panel below the fold: two ports, and
 * neither of them holding it.
 *
 * `style` is the panel's, so a test about what a port's client box is can put a
 * border on it.
 */
function nested(style: Partial<CSSStyleDeclaration> = {}): {
  panel: HTMLElement
  row: HTMLElement
} {
  add(spacer())
  const panel = add(document.createElement('div'))
  Object.assign(panel.style, { height: '200px', overflow: 'auto', border: 'none' }, style)
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

test('a nested panel is set in the same task, and only the page glides', async () => {
  vi.useFakeTimers()
  const { panel, row } = nested()

  const glide = watch(bringIntoView([row], 0, DURATION, 'direct', ease))

  // Before a single frame has run: the panel is where it belongs already and
  // the page has not set off. DESIGN.md, **The page glides; a nested panel is
  // set**.
  expect(panel.scrollTop).toBeGreaterThan(0)
  expect(window.scrollY).toBe(0)

  await until(glide.settled, past(STAGE) + 40, 'the direct glide never settled')
  // Which is what makes the page's own delta exact — it was measured against a
  // panel that had already moved — so the row lands at the middle of both.
  const port = panel.getBoundingClientRect()
  expect(middleOf(row)).toBeCloseTo(port.top + port.height / 2, -1)
  expect(middleOf(row)).toBeCloseTo(document.documentElement.clientHeight / 2, -1)
})

test('the curve the caller brought is the one the frames follow', async () => {
  vi.useFakeTimers()
  add(spacer())
  const card = add(block(40))
  add(spacer())

  // A curve that answers "nowhere yet" for the whole trip. Not a claim about
  // any shape — `geometry.test.ts` asks those — but about the wiring: what the
  // frames follow is what the caller handed in, and the last frame writes the
  // destination itself whatever the curve said.
  const glide = watch(bringIntoView([card], 0, DURATION, 'direct', () => 0))
  await frames(STAGE - 1)
  expect(window.scrollY).toBe(0)
  expect(glide.settled()).toBe(false)

  await until(glide.settled, 10, 'the glide never landed')
  expect(middleOf(card)).toBeCloseTo(document.documentElement.clientHeight / 2, -1)
})

test('a destination past the end of the content is clamped to it, before the first frame', async () => {
  vi.useFakeTimers()
  add(spacer())
  // Nothing after the card, so the content ends just under it and the middle
  // of the screen is a scroll the page has no room to make.
  const card = add(block(40))

  const glide = watch(bringIntoView([card], 0, DURATION, 'direct', ease))
  // Still flying, which is the whole of what clamping before the first frame
  // buys and the only thing that tells this apart from a loop that did not.
  // Aimed past the end, every write comes back clamped, the loop reads that as
  // the viewer and stops — at the limit, and settling, so where the page ended
  // up says nothing on its own and only a count says it.
  //
  // Frame 35, and all three engines agree: measured against a build with the
  // clamp taken out of `direct`, which also settles at the limit, so the page's
  // resting place really is the same either way. What the room this count
  // leaves depends on is the runner's viewport rather than the engine — the
  // destination is `1520 - H/2` against a limit of `1540 - H` for a port `H`
  // tall, the tester page resetting `html` and `body` to no margin of their own
  // rather than carrying the 8px a reader would assume — so a shorter port
  // stops later: frame 50 at 600px against frame 35 at the 896px Vitest's
  // browser mode gives by default, and under about 430px the stop is past 60
  // and this assertion stops telling the two apart.
  await frames(60)
  expect(glide.settled()).toBe(false)

  await until(glide.settled, past(STAGE) + 40, 'the clamped glide never settled')
  // DESIGN.md, **The destination is clamped once, before the first frame**: as
  // near the middle as the content allows, and against the far edge in the
  // limit. Within a pixel, because a written offset does not come back as
  // written: WebKit truncates one to an integer, Chromium rounds it, and
  // Firefox answers in app units of its own, where a written 10.4 comes back as
  // 9.95. Over a sweep of quarter-pixel destinations the widest gap measured
  // was three quarters of a pixel, in WebKit — wider than the half a pixel
  // `toBeCloseTo(_, 0)` allows.
  const root = document.documentElement
  const end = root.scrollHeight - root.clientHeight
  expect(Math.abs(window.scrollY - end)).toBeLessThanOrEqual(1)
  expect(middleOf(card)).toBeGreaterThan(root.clientHeight / 2)
})

test('a scroll the page has no room to make is not a glide at all', () => {
  vi.useFakeTimers()
  const edge = add(document.createElement('div'))
  Object.assign(edge.style, {
    position: 'absolute',
    left: '-60px',
    top: '100px',
    width: '120px',
    height: '40px',
  })

  // Half off the left edge of a page already against that edge, so the
  // destination clamps to where the page stands and there is nothing to glide
  // to. DESIGN.md, **A port that needs no scroll is never waited on**.
  expect(bringIntoView([edge], 0, DURATION, 'direct', ease)).toBeUndefined()
  expect(window.scrollX).toBe(0)
  expect(window.scrollY).toBe(0)
})

test('a port that already holds the cutout is not scrolled', () => {
  vi.useFakeTimers()
  add(spacer())
  const card = add(block(40))
  add(spacer())
  // Somewhere a viewer has settled: the whole card inside the screen, and
  // nowhere near the middle of it.
  window.scrollTo(0, card.getBoundingClientRect().top - 120)
  const settled = { x: window.scrollX, y: window.scrollY }

  // The delta answers zero and nothing else is asked. DESIGN.md, **A port that
  // already holds the cutout is not touched**.
  expect(bringIntoView([card], 0, DURATION, 'direct', ease)).toBeUndefined()
  expect(window.scrollX).toBe(settled.x)
  expect(window.scrollY).toBe(settled.y)
})

test('a fixed target has no port to be scrolled in', () => {
  vi.useFakeTimers()
  add(spacer())
  const pinned = add(document.createElement('div'))
  Object.assign(pinned.style, {
    position: 'fixed',
    left: '100px',
    top: '100px',
    width: '120px',
    height: '40px',
  })
  window.scrollTo(0, 600)
  const settled = window.scrollY

  // Its chain is the viewport alone, and a viewport is skipped whichever mode
  // asked. DESIGN.md, **A `position: fixed` target is not scrolled**.
  expect(bringIntoView([pinned], 0, DURATION, 'direct', ease)).toBeUndefined()
  expect(window.scrollX).toBe(0)
  expect(window.scrollY).toBe(settled)
})

test('a page moved by two pixels is the viewer, and the glide stops there', async () => {
  vi.useFakeTimers()
  add(spacer())
  const card = add(block(40))
  add(spacer())

  const glide = watch(bringIntoView([card], 0, DURATION, 'direct', ease))
  // Two pixels, between the walk and the first frame — the one moment nothing
  // has been written and the loop is still comparing against where the page
  // was, so no easing fraction is in the comparison. That is what puts a
  // number on the far side of the pixel `TOLERANCE` allows.
  //
  // Two rather than one because one is not a number a test can write here:
  // from a standing start Firefox reports `scrollTo(0, 1)` back as 1.25, every
  // time and in a panel's `scrollTop` too, so a nudge of a pixel lands on the
  // far side of the pixel in that engine. Not flakily — decidedly, so there is
  // nothing here for a retry to rescue. The near side is asked all the same, by
  // every glide above that lands: Firefox reports a written 10.4 back as 9.95,
  // and a `TOLERANCE` of zero would stop all of them on their first frame.
  window.scrollTo(0, 2)
  const left = window.scrollY

  // DESIGN.md, **The viewer taking over**: the loop stops and the step is drawn
  // where the page is, so this settles rather than being abandoned, and the
  // destination is never written.
  await until(glide.settled, 10, 'the glide never noticed the page had been taken')
  await frames(past(STAGE) + 40)
  expect(window.scrollY).toBe(left)
  expect(middleOf(card)).toBeGreaterThan(document.documentElement.clientHeight)
})

test('the box brought in is the one around every element, not the first', () => {
  vi.useFakeTimers()
  add(spacer())
  const upper = add(block(40))
  add(block(100))
  const lower = add(block(40))
  add(spacer())

  expect(bringIntoView([upper, lower], 0, 0, 'direct', ease)).toBeUndefined()

  // DESIGN.md, **What is brought in is the first region's hole, not its first
  // element**: the union of the two is what the port centres, so the first
  // element sits half the union above the middle rather than on it.
  const half = document.documentElement.clientHeight / 2
  expect((middleOf(upper) - 20 + middleOf(lower) + 20) / 2).toBeCloseTo(half, -1)
  expect(middleOf(upper)).toBeCloseTo(half - 70, -1)
})

test('scroll-margin on the first element wins over the room asked for', () => {
  vi.useFakeTimers()
  add(spacer())
  const upper = add(block(40))
  upper.style.scrollMarginBottom = '120px'
  add(block(40))
  const lower = add(block(40))
  // Read at all, this would take the box past half the port and tip it into
  // leading with its top edge.
  lower.style.scrollMarginBottom = '400px'
  add(spacer())
  const top = upper.getBoundingClientRect().top

  expect(bringIntoView([upper, lower], 8, 0, 'direct', ease)).toBeUndefined()

  // DESIGN.md, **`scroll-margin` on the target wins over the step's
  // `padding`**: 8px of room above, 120px below, and the box the margin asks
  // for is what gets centred.
  // Within a pixel, for the reason `a destination past the end of the content
  // is clamped to it, before the first frame` gives.
  const half = document.documentElement.clientHeight / 2
  const centred = (top - 8 + top + 120 + 120) / 2 - half
  expect(Math.abs(window.scrollY - centred)).toBeLessThanOrEqual(1)
  expect(middleOf(lower) + 20 + 120).toBeLessThanOrEqual(document.documentElement.clientHeight)
  // `roomAround` reads the anchor and nothing else: read off the lower element
  // instead, the box would be over half the port tall and this would be its top
  // edge at the middle, 124px further up.
  expect(Math.abs(window.scrollY - (top - 8 - half))).toBeGreaterThan(1)
})

test('a panel’s border is not somewhere a target can be brought', () => {
  vi.useFakeTimers()
  const { panel, row } = nested({ borderTop: '40px solid' })

  expect(bringIntoView([row], 0, 0, 'direct', ease)).toBeUndefined()

  // The client box both times, so 40px of border above the content moves the
  // middle of the port 20px down from the middle of the border box. The one
  // claim here an engine could answer differently, and it answers it in
  // `clientTop`.
  const border = panel.getBoundingClientRect()
  expect(middleOf(row)).toBeCloseTo(border.top + panel.clientTop + panel.clientHeight / 2, -1)
  expect(middleOf(row)).not.toBeCloseTo(border.top + border.height / 2, -1)
})

// What having stages adds, over and above the walk above: one port at a time,
// outermost first, a beat between two of them, and one `Glide` over the lot.
// DESIGN.md, **`scroll: 'staged'` moves one port at a time, outermost first**.

test('a staged scroll moves the page first and leaves the panel where it is', async () => {
  vi.useFakeTimers()
  const { panel, row } = nested()

  watch(bringIntoView([row], 0, DURATION, 'staged', ease))
  await frames(3)

  expect(window.scrollY).toBeGreaterThan(0)
  expect(panel.scrollTop).toBe(0)
})

test('the panel starts only after the page has landed, and after a beat', async () => {
  vi.useFakeTimers()
  const { panel, row } = nested()

  watch(bringIntoView([row], 0, DURATION, 'staged', ease))
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

  const glide = watch(bringIntoView([row], 0, DURATION, 'staged', ease))
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

  const glide = watch(bringIntoView([row], 0, DURATION, 'staged', ease))
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

  const glide = watch(bringIntoView([row], 0, DURATION, 'staged', ease))
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

  const glide = watch(bringIntoView([row], 0, DURATION, 'staged', ease))
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

  expect(bringIntoView([row], 0, 0, 'staged', ease)).toBeUndefined()
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

  const glide = watch(bringIntoView([card], 0, DURATION, 'staged', ease))
  await frames(past(STAGE))
  // The page's own stage is the whole glide, so it settles on the frame that
  // lands rather than a beat later.
  expect(glide.settled()).toBe(true)
  expect(middleOf(card)).toBeCloseTo(document.documentElement.clientHeight / 2, -1)
})
