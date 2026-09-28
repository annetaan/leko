import { afterEach, expect, test, vi } from 'vitest'

import { holeOf } from './geometry.js'
import { maskLayers } from './mask.js'
import { DURATION, Scrim } from './scrim.js'
import { createScroll } from './scroll.js'
import type { LekoScroll, LekoScrollOptions } from './types.js'

// `createScroll` against a real page, in real time: a converge or a morph takes
// the scrim's own duration unless it is an intro given one, and a scroll is
// `scrollTo` and the event after it.
// What the plan decides in each case is plan.test.ts's business; what is
// pinned here is that the page's numbers reach it and its answers reach the
// page.

const instances: LekoScroll[] = []
const mounted: HTMLElement[] = []
const bodyStyle = document.body.style.cssText

afterEach(() => {
  for (const scroll of instances.splice(0)) scroll.destroy()
  for (const el of mounted.splice(0)) el.remove()
  document.body.style.cssText = bodyStyle
  window.scrollTo(0, 0)
  vi.restoreAllMocks()
  vi.useRealTimers()
})

/** Where each test's targets sit, in page coordinates. */
const A = 100
const B = 1200
const C = 1800
const D = 2400

/**
 * A 4000px page with a 200 by 100 target at each of `tops`, `#t0` and on. The
 * last target's lower edge is D + 150, which leaves it a whole fade band above
 * the foot for any viewport shorter than 2300px. The targets end 300px from
 * the page's left, so the page has no horizontal scroll of its own at the
 * 399px a layout scrollbar leaves of a 414px viewport.
 */
function build(tops: readonly number[] = [A, B, C, D]): {
  page: HTMLElement
  targets: HTMLElement[]
} {
  const page = document.createElement('div')
  Object.assign(page.style, {
    position: 'absolute',
    left: '0',
    top: '0',
    width: '100%',
    height: '4000px',
  })
  const targets = tops.map((top, i) => add(page, top, `t${i}`))
  document.body.append(page)
  mounted.push(page)
  return { page, targets }
}

function add(page: HTMLElement, top: number, id: string): HTMLElement {
  const el = document.createElement('div')
  el.id = id
  Object.assign(el.style, {
    position: 'absolute',
    left: '100px',
    top: `${top}px`,
    width: '200px',
    height: '100px',
  })
  page.append(el)
  return el
}

/** An instance, what its `onChange` was called with, and a way to wait for the next call. */
function start(options: Partial<LekoScrollOptions> = {}): {
  scroll: LekoScroll
  changes: (number | undefined)[]
  next: () => Promise<number | undefined>
} {
  const changes: (number | undefined)[] = []
  const waiting: ((index: number | undefined) => void)[] = []
  const scroll = createScroll({
    targets: ['#t0', '#t1', '#t2', '#t3'].map((target) => ({ target })),
    ...options,
    onChange: (index) => {
      changes.push(index)
      for (const resolve of waiting.splice(0)) resolve(index)
    },
  })
  instances.push(scroll)
  return { scroll, changes, next: () => new Promise((resolve) => waiting.push(resolve)) }
}

/** The scroll offset that puts the line, at the default of half the viewport, at `y`. */
const lineAt = (y: number): number => Math.round(y - document.documentElement.clientHeight / 2)

const scrolled = (y: number, x = 0): Promise<void> => {
  if (window.scrollY === y && window.scrollX === x) throw new Error(`already at ${x}, ${y}`)
  return new Promise((done) => {
    window.addEventListener('scroll', () => done(), { once: true })
    window.scrollTo(x, y)
  })
}

const pause = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

function root(): HTMLElement {
  const el = document.querySelector<HTMLElement>('.leko-scroll')
  if (!el) throw new Error('no .leko-scroll')
  return el
}

const mask = (): string =>
  root().querySelector<HTMLElement>('.leko-scroll-scrim')?.style.maskImage ?? ''

function halo(): HTMLElement {
  const el = root().querySelector<HTMLElement>('.leko-scroll-halo')
  if (!el) throw new Error('no .leko-scroll-halo')
  return el
}

/** The mask as the engine serialises it, for a comparison that does not depend on spelling. */
function serialised(...args: Parameters<typeof maskLayers>): string {
  const probe = document.createElement('div')
  probe.style.maskImage = maskLayers(...args).image
  return probe.style.maskImage
}

/** The mask with a default hole around `el`, where the root now sits, or with none. */
function maskOn(el: HTMLElement | undefined): string {
  const r = root()
  const width = parseFloat(r.style.width)
  const height = parseFloat(r.style.height)
  if (!el) return serialised(width, height, undefined)
  const at = r.getBoundingClientRect()
  const box = el.getBoundingClientRect()
  const hole = holeOf(
    { x: box.left - at.left, y: box.top - at.top, width: box.width, height: box.height },
    8,
    8,
  )
  return serialised(width, height, hole)
}

test('a first target near the top converges at load and fires its index once, on arrival', async () => {
  const { targets } = build()
  const { changes, next } = start()
  expect(changes).toEqual([])
  expect(root().style.opacity).toBe('1')

  expect(await next()).toBe(0)
  expect(mask()).toBe(maskOn(targets[0]))
  await pause(400)
  expect(changes).toEqual([0])
})

test('created with the line in a band or outside fires undefined and draws nothing', async () => {
  build([2000, 2600])
  const outside = start({ targets: [{ target: '#t0' }, { target: '#t1' }] })
  expect(outside.changes).toEqual([undefined])
  expect(root().style.opacity).toBe('0')
  expect(mask()).toBe(maskOn(undefined))
  outside.scroll.destroy()

  await scrolled(lineAt(2000 - 150))
  const band = start({ targets: [{ target: '#t0' }, { target: '#t1' }] })
  expect(band.changes).toEqual([undefined])
  expect(root().style.opacity).toBe('0')
  expect(mask()).toBe(maskOn(undefined))
  await pause(400)
  expect(band.changes).toEqual([undefined])
})

test('crossing the next switch position morphs and fires that index once', async () => {
  const { targets } = build()
  const { changes, next } = start()
  await next()

  await scrolled(lineAt(B + 50))
  expect(changes).toEqual([0])
  expect(await next()).toBe(1)
  expect(mask()).toBe(maskOn(targets[1]))
  await pause(400)
  expect(changes).toEqual([0, 1])
})

test('a fast scroll over several switch positions fires only the last', async () => {
  const { targets } = build()
  const { changes, next } = start()
  await next()

  await scrolled(lineAt(D + 50))
  expect(await next()).toBe(3)
  expect(mask()).toBe(maskOn(targets[3]))
  await pause(400)
  expect(changes).toEqual([0, 3])
})

/**
 * A fake clock for the frame loop, taken before `createScroll` so every frame
 * it asks for is one of the test's, and a wait for the measure
 * `document.fonts.ready` starts, so it cannot restart a converge in the middle
 * of the frames. A real frame has been watched taking seconds on the CI
 * runner, for the reason `TICK` in `packages/leko/src/harness.ts` records;
 * the scroll and the page stay real.
 */
async function clocked(options: Partial<LekoScrollOptions>): Promise<ReturnType<typeof start>> {
  vi.useFakeTimers()
  const started = start(options)
  await document.fonts.ready
  return started
}

/** `ms` of the fake clock, a frame at a time. */
const elapse = (ms: number): void => {
  for (let t = 0; t < ms; t += 16) vi.advanceTimersByTime(16)
}

/** Time enough for an ordinary converge or morph to reach its last frame. */
const USUAL = DURATION + 16

test('intro.duration slows the converge at creation and not the morph after it', async () => {
  const { targets } = build()
  const { changes } = await clocked({ intro: { duration: 1200 } })
  elapse(600)
  expect(changes).toEqual([])
  elapse(1200 + 16 - 600)
  expect(changes).toEqual([0])
  expect(mask()).toBe(maskOn(targets[0]))

  await scrolled(lineAt(B + 50))
  elapse(USUAL)
  expect(changes).toEqual([0, 1])
})

test('created outside the range, the converge a later scroll starts is not the intro', async () => {
  build([2000, 2600])
  const { changes } = await clocked({
    targets: [{ target: '#t0' }, { target: '#t1' }],
    intro: { duration: 1200 },
  })
  expect(changes).toEqual([undefined])

  await scrolled(lineAt(2000 + 50))
  elapse(USUAL)
  expect(changes).toEqual([undefined, 0])
})

test('a switch crossed during the intro goes on at the usual length', async () => {
  const { targets } = build()
  const { changes } = await clocked({ intro: { duration: 1200 } })
  await scrolled(lineAt(B + 50))
  elapse(USUAL)
  expect(changes).toEqual([1])
  expect(mask()).toBe(maskOn(targets[1]))
})

const climbing = (): void => {
  const opacity = Number(halo().style.opacity)
  expect(opacity).toBeGreaterThan(0)
  expect(opacity).toBeLessThan(1)
}

test("halo 'follow' rides the halo on the intro, reaching full strength on the arrival", async () => {
  build()
  const { changes } = await clocked({ halo: 'follow', intro: { duration: 1200 } })
  elapse(600)
  climbing()
  expect(parseFloat(halo().style.width)).toBeGreaterThan(200 + 2 * 8)
  elapse(1200 + 16 - 600)
  expect(changes).toEqual([0])
  expect(halo().style.opacity).toBe('1')
})

test("halo 'follow' rides the halo on the converge a scroll into range starts", async () => {
  build([2000, 2600])
  const { changes } = await clocked({
    targets: [{ target: '#t0' }, { target: '#t1' }],
    halo: 'follow',
  })
  expect(changes).toEqual([undefined])

  await scrolled(lineAt(2000 + 50))
  elapse(DURATION / 2)
  climbing()
  elapse(USUAL)
  expect(changes).toEqual([undefined, 0])
  expect(halo().style.opacity).toBe('1')
})

test("halo 'follow' rides the halo on a converge after the light went out", async () => {
  build([2000, 2600])
  const { changes } = await clocked({
    targets: [{ target: '#t0' }, { target: '#t1' }],
    halo: 'follow',
  })
  await scrolled(lineAt(2000 + 50))
  elapse(USUAL)
  await scrolled(lineAt(1600))
  expect(changes).toEqual([undefined, 0, undefined])
  expect(halo().style.opacity).toBe('0')

  await scrolled(lineAt(2000 + 50))
  elapse(DURATION / 2)
  climbing()
  elapse(USUAL)
  expect(changes).toEqual([undefined, 0, undefined, 0])
  expect(halo().style.opacity).toBe('1')
})

test("halo 'follow' keeps the halo climbing through a switch crossed during a converge", async () => {
  build()
  const { changes } = await clocked({ halo: 'follow', intro: { duration: 1200 } })
  elapse(600)
  const reached = Number(halo().style.opacity)
  await scrolled(lineAt(B + 50))
  elapse(32)
  expect(Number(halo().style.opacity)).toBeGreaterThanOrEqual(reached)
  elapse(USUAL)
  expect(changes).toEqual([1])
  expect(halo().style.opacity).toBe('1')
})

test('with halo left out, the halo stays at 0 through a converge until the arrival', async () => {
  build()
  const { changes } = await clocked({ intro: { duration: 1200 } })
  elapse(600)
  expect(halo().style.opacity).toBe('0')
  elapse(1200 + 16 - 600)
  expect(changes).toEqual([0])
  expect(halo().style.opacity).toBe('1')
})

test('past the lower edge the root dims with the scroll and the mask is not rewritten', async () => {
  build()
  await scrolled(lineAt(D + 50))
  const { next } = start()
  expect(await next()).toBe(3)
  const lit = mask()

  const lower = D + 150
  await scrolled(lineAt(lower + 150))
  expect(Number(root().style.opacity)).toBeCloseTo(0.5, 2)
  await scrolled(lineAt(lower + 75))
  expect(Number(root().style.opacity)).toBeCloseTo(0.75, 2)
  expect(mask()).toBe(lit)
})

test('a fade to zero fires undefined, and coming back converges again', async () => {
  const { targets } = build()
  await scrolled(lineAt(D + 50))
  const { changes, next } = start()
  await next()

  const lower = D + 150
  await scrolled(lineAt(lower + 350))
  expect(changes).toEqual([3, undefined])
  expect(root().style.opacity).toBe('0')
  expect(mask()).toBe(maskOn(undefined))

  await scrolled(lineAt(lower + 150))
  expect(root().style.opacity).toBe('0')
  expect(changes).toEqual([3, undefined])

  await scrolled(lineAt(D + 50))
  expect(root().style.opacity).toBe('1')
  expect(await next()).toBe(3)
  expect(mask()).toBe(maskOn(targets[3]))
})

test('a converge after a sideways scroll starts from the viewport as it is now', async () => {
  const { page } = build()
  page.style.width = '2000px'
  await scrolled(lineAt(D + 50))
  const converge = vi.spyOn(Scrim.prototype, 'converge')
  const { changes, next } = start()
  expect(await next()).toBe(3)

  const lower = D + 150
  await scrolled(lineAt(lower + 350))
  expect(changes).toEqual([3, undefined])
  // No measure after this, so only the scroll offset says where the screen is.
  await scrolled(lineAt(lower + 350), 500)
  expect(window.scrollX).toBeGreaterThan(0)

  converge.mockClear()
  await scrolled(lineAt(D + 50), window.scrollX)
  expect(converge).toHaveBeenCalledOnce()
  const doc = document.documentElement
  expect(converge.mock.calls[0]?.[1]).toEqual({
    x: window.scrollX,
    y: window.scrollY,
    width: doc.clientWidth,
    height: doc.clientHeight,
  })
  expect(await next()).toBe(3)
})

test('an off entry puts the light out between two targets and the next converges', async () => {
  const { targets } = build([A, B, D])
  const { changes, next } = start({
    targets: [{ target: '#t0' }, { target: '#t1', off: true }, { target: '#t2' }],
  })
  expect(await next()).toBe(0)
  const lit = mask()

  // The marker at B switches the light off, through a band as deep as fade.
  await scrolled(lineAt(B + 150))
  expect(Number(root().style.opacity)).toBeCloseTo(0.5, 2)
  expect(mask()).toBe(lit)
  await scrolled(lineAt(B + 400))
  expect(changes).toEqual([0, undefined])
  expect(root().style.opacity).toBe('0')
  expect(mask()).toBe(maskOn(undefined))

  await scrolled(lineAt(D + 50))
  expect(root().style.opacity).toBe('1')
  expect(await next()).toBe(2)
  expect(mask()).toBe(maskOn(targets[2]))
  await pause(400)
  expect(changes).toEqual([0, undefined, 2])
})

test('a target that is not found is warned about once and the rest is lit', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const { targets } = build([A, B])
  const { scroll, next } = start({
    targets: [{ target: '#nothing' }, { target: '#t0' }, { target: '#t1' }],
  })
  expect(warn).toHaveBeenCalledOnce()
  expect(String(warn.mock.calls[0]?.[0])).toContain('targets[0]')

  expect(await next()).toBe(1)
  expect(mask()).toBe(maskOn(targets[0]))
  scroll.measure()
  window.dispatchEvent(new Event('resize'))
  expect(warn).toHaveBeenCalledOnce()
})

test("a selector's first match with a box is the one cut around", async () => {
  const { page } = build([B])
  const first = add(page, A, 'first')
  const second = add(page, A + 200, 'second')
  first.style.display = 'none'
  for (const el of [first, second]) el.className = 'twin'
  const { scroll, changes, next } = start({ targets: [{ target: '.twin' }, { target: '#t0' }] })

  expect(await next()).toBe(0)
  expect(mask()).toBe(maskOn(second))

  first.style.display = ''
  second.style.display = 'none'
  scroll.measure()
  expect(mask()).toBe(maskOn(first))
  await pause(400)
  expect(changes).toEqual([0])
})

test('measure() after the lit target moved places the hole without a notice', async () => {
  const { targets } = build()
  const { scroll, changes, next } = start()
  await next()

  targets[0]!.style.top = `${A + 60}px`
  scroll.measure()
  expect(mask()).toBe(maskOn(targets[0]))
  await pause(400)
  expect(mask()).toBe(maskOn(targets[0]))
  expect(changes).toEqual([0])
})

test('measure() finds a target that appeared', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  const { page } = build([B])
  const { scroll, changes, next } = start({ targets: [{ target: '#late' }, { target: '#t0' }] })
  expect(changes).toEqual([undefined])

  const late = add(page, A, 'late')
  scroll.measure()
  expect(await next()).toBe(0)
  expect(mask()).toBe(maskOn(late))
})

test('a measure after the page got shorter sizes the scrim to the page without itself', () => {
  const { page } = build([A, B])
  start()
  expect(root().style.height).toBe('4000px')

  page.style.height = '2000px'
  window.dispatchEvent(new Event('resize'))
  expect(root().style.height).toBe(`${Math.max(2000, document.documentElement.clientHeight)}px`)
})

test('the scroll listener is passive', () => {
  const listen = vi.spyOn(window, 'addEventListener')
  build()
  start()
  const scroll = listen.mock.calls.filter(([type]) => type === 'scroll')
  expect(scroll).toHaveLength(1)
  expect(scroll[0]?.[2]).toEqual({ passive: true })
})

test('a positioned body still puts the hole on the target, and its margin is dimmed', async () => {
  Object.assign(document.body.style, { position: 'relative', margin: '60px 0 0 30px' })
  const { targets } = build()
  const { next } = start()
  // The root covers the page from its top left, so the 30px strip and the
  // 60px band the body's margin leaves are under the scrim with the rest.
  const at = root().getBoundingClientRect()
  const doc = document.documentElement
  expect(at.left + window.scrollX).toBe(0)
  expect(at.top + window.scrollY).toBe(0)
  expect(at.width).toBe(doc.clientWidth)
  expect(at.height).toBe(4060)
  expect(doc.scrollWidth).toBe(doc.clientWidth)

  expect(await next()).toBe(0)
  expect(root().style.opacity).toBe('1')
  expect(mask()).toBe(maskOn(targets[0]))
})

/**
 * Scrollbars that take room, 15px of it. WebKit gives the page those from this
 * rule. Headless Chromium and Firefox have been seen to show none with it, so a
 * test that needs one skips there.
 */
function layoutScrollbars(): void {
  const style = document.createElement('style')
  style.textContent = '::-webkit-scrollbar { width: 15px; height: 15px; }'
  document.head.append(style)
  mounted.push(style)
  // WebKit reads the rule when it makes the page's scrollbar and not after, so
  // a scrollbar an earlier test left is taken away and made again.
  const doc = document.documentElement
  doc.style.overflow = 'hidden'
  void doc.clientWidth
  doc.style.overflow = ''
}

test('a layout scrollbar is not covered by the root, so no horizontal scroll is added', async (ctx) => {
  layoutScrollbars()
  const doc = document.documentElement
  const { targets } = build()
  if (window.innerWidth === doc.clientWidth) ctx.skip('this engine shows no layout scrollbar')
  const before = doc.scrollWidth
  expect(before).toBe(doc.clientWidth)

  const { scroll, next } = start({
    targets: [{ target: '#t0', message: { title: 'Title' }, side: 'right' }, { target: '#t1' }],
  })
  expect(root().style.width).toBe(`${doc.clientWidth}px`)
  expect(doc.scrollWidth).toBe(before)
  expect(await next()).toBe(0)
  scroll.measure()
  expect(doc.scrollWidth).toBe(before)
  expect(mask()).toBe(maskOn(targets[0]))
})

test('under a horizontal scrollbar the last switch still falls at the bottom of the page', async (ctx) => {
  layoutScrollbars()
  const doc = document.documentElement
  const { page } = build([A])
  page.style.width = '2000px'
  const foot = add(page, 3900, 'foot')
  if (window.innerHeight === doc.clientHeight) ctx.skip('this engine shows no layout scrollbar')
  // Pulled back to `reach`, which the line gets to only at the bottom.
  const { changes, next } = start({ targets: [{ target: '#t0' }, { target: '#foot' }] })
  expect(await next()).toBe(0)

  const bottom = doc.scrollHeight - doc.clientHeight
  await scrolled(bottom - 5)
  await pause(400)
  expect(changes).toEqual([0])
  await scrolled(bottom)
  expect(await next()).toBe(1)
  expect(mask()).toBe(maskOn(foot))
})

test('an onChange that measures on arrival still shows the message and the halo', async () => {
  build([A, B])
  let scroll: LekoScroll | undefined
  const measured = new Promise<void>((resolve) => {
    scroll = createScroll({
      targets: [{ target: '#t0', message: { title: 'Title' } }, { target: '#t1' }],
      onChange: (index) => {
        if (index !== 0) return
        scroll?.measure()
        resolve()
      },
    })
  })
  instances.push(scroll!)
  await measured
  const part = (name: string) => root().querySelector<HTMLElement>(`.leko-scroll-${name}`)
  expect(part('halo')?.style.opacity).toBe('1')
  expect(part('message')?.style.visibility).toBe('visible')
})

test('reduced motion returns a handle that does nothing and logs info', async () => {
  const info = vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query) => ({ matches: query.includes('reduce'), media: query }) as MediaQueryList,
  )
  build()
  const { scroll, changes } = start()
  expect(info).toHaveBeenCalledOnce()
  expect(document.querySelector('.leko-scroll')).toBeNull()

  scroll.measure()
  await scrolled(lineAt(B + 50))
  await pause(400)
  scroll.destroy()
  expect(changes).toEqual([])
  expect(document.querySelector('.leko-scroll')).toBeNull()
})

test('destroy removes the layer, stops listening, and fires nothing', async () => {
  build()
  const { scroll, changes } = start()
  expect(root().isConnected).toBe(true)

  scroll.destroy()
  expect(document.querySelector('.leko-scroll')).toBeNull()
  await pause(400)
  await scrolled(lineAt(B + 50))
  window.dispatchEvent(new Event('resize'))
  scroll.measure()
  await pause(400)
  expect(changes).toEqual([])
  expect(document.querySelector('.leko-scroll')).toBeNull()
})
