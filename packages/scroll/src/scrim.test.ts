import { afterEach, expect, test, vi } from 'vitest'

import type { Hole, Rect } from './geometry.js'
import { maskLayers } from './mask.js'
import { Scrim } from './scrim.js'

// The scrim's promises, read through the styles it writes. What the mask holds
// for a given hole is mask.test.ts's business; what is pinned here is which
// hole is on screen when, and what rides along with it.

const scrims: Scrim[] = []

afterEach(() => {
  for (const scrim of scrims.splice(0)) scrim.destroy()
  vi.useRealTimers()
})

const WIDTH = 1000
const HEIGHT = 3000

/**
 * A scrim sized to a page, and a way to wait for its next arrival. The short
 * duration is for tests that only wait for the end; a test that reads frames
 * in flight asks for a long one, so a slow runner still has frames to read.
 */
function mount(duration = 40): {
  scrim: Scrim
  arrived: () => Promise<void>
  arrivals: () => number
} {
  let count = 0
  const waiting: (() => void)[] = []
  const scrim = new Scrim({
    duration,
    onArrive: () => {
      count += 1
      for (const resolve of waiting.splice(0)) resolve()
    },
  })
  scrim.resize(WIDTH, HEIGHT)
  scrims.push(scrim)
  return {
    scrim,
    arrived: () => new Promise((resolve) => waiting.push(resolve)),
    arrivals: () => count,
  }
}

/** `ms` of a fake clock, a frame at a time. */
const elapse = (ms: number): void => {
  for (let t = 0; t < ms; t += 16) vi.advanceTimersByTime(16)
}

const frame = (): Promise<void> => new Promise((resolve) => requestAnimationFrame(() => resolve()))

const part = (scrim: Scrim, name: string): HTMLElement => {
  const el = scrim.root.querySelector<HTMLElement>(`.leko-scroll-${name}`)
  if (!el) throw new Error(`no .leko-scroll-${name}`)
  return el
}

/** The mask as the engine serialises it, for a comparison that does not depend on spelling. */
function serialised(width: number, height: number, hole: Hole | undefined): string {
  const { image } = maskLayers(width, height, hole)
  const probe = document.createElement('div')
  probe.style.maskImage = image
  return probe.style.maskImage
}

/**
 * The hole the mask holds, read back from its image and its position. Every
 * hole in these tests lies on the surface, so the image is the hole's own box.
 */
function holeOnScreen(scrim: Scrim): Hole | undefined {
  const style = part(scrim, 'scrim').style
  const svg = /data:image\/svg\+xml;utf8,([^")]+)/.exec(style.maskImage)?.[1]
  if (svg === undefined) return undefined
  const rect = decodeURIComponent(svg).split('<rect')[1] ?? ''
  const attr = (name: string): number => Number(new RegExp(` ${name}="([^"]+)"`).exec(rect)?.[1])
  const at = (style.maskPosition.split(',')[1] ?? '').match(/-?[\d.]+/g)?.map(Number) ?? []
  return {
    x: (at[0] ?? NaN) + attr('x'),
    y: (at[1] ?? NaN) + attr('y'),
    width: attr('width'),
    height: attr('height'),
    radius: attr('rx'),
  }
}

/** Each of `hole`'s numbers lies between `from`'s and `to`'s. */
function between(hole: Hole, from: Hole, to: Hole): void {
  for (const key of ['x', 'y', 'width', 'height', 'radius'] as const) {
    expect(hole[key]).toBeGreaterThanOrEqual(Math.min(from[key], to[key]) - 0.01)
    expect(hole[key]).toBeLessThanOrEqual(Math.max(from[key], to[key]) + 0.01)
  }
}

const px = (value: string): number => parseFloat(value)

const seen: Rect = { x: 0, y: 400, width: 800, height: 600 }
const a: Hole = { x: 100, y: 500, width: 300, height: 120, radius: 8 }
const b: Hole = { x: 450, y: 800, width: 120, height: 60, radius: 12 }

test('the root is absolute at the page origin, aria-hidden, and catches no pointer events', () => {
  const { scrim } = mount()
  scrim.opacity(1)
  const root = scrim.root
  expect(root.parentElement).toBe(document.body)
  expect(getComputedStyle(root).position).toBe('absolute')
  const r = root.getBoundingClientRect()
  expect(r.left + window.scrollX).toBe(0)
  expect(r.top + window.scrollY).toBe(0)
  expect(r.width).toBe(WIDTH)
  expect(r.height).toBe(HEIGHT)
  expect(root.getAttribute('aria-hidden')).toBe('true')
  for (const el of [root, part(scrim, 'scrim'), part(scrim, 'halo'), part(scrim, 'message')]) {
    expect(getComputedStyle(el).pointerEvents).toBe('none')
  }
  const hit = document.elementFromPoint(50, 50)
  expect(hit).not.toBeNull()
  expect(root.contains(hit)).toBe(false)
})

test('a converge starts from the seen box and ends with the mask holding the hole', async () => {
  const { scrim, arrived } = mount(1000)
  scrim.converge(a, seen)
  await frame()
  await frame()
  const first = holeOnScreen(scrim)
  if (!first) throw new Error('no hole in flight')
  between(first, { ...seen, radius: 0 }, a)
  expect(first.width).toBeGreaterThan(a.width)

  await arrived()
  expect(part(scrim, 'scrim').style.maskImage).toBe(serialised(WIDTH, HEIGHT, a))
})

test('a converge issued mid-flight goes on from the hole on screen', async () => {
  const { scrim, arrived, arrivals } = mount(1000)
  scrim.converge(a, seen)
  await frame()
  await frame()
  const mid = holeOnScreen(scrim)
  if (!mid) throw new Error('no hole in flight')

  scrim.converge(b, seen)
  await frame()
  const next = holeOnScreen(scrim)
  if (!next) throw new Error('no hole in flight')
  between(next, mid, b)

  await arrived()
  expect(arrivals()).toBe(1)
  expect(part(scrim, 'scrim').style.maskImage).toBe(serialised(WIDTH, HEIGHT, b))
})

test("a converge takes the duration it is given, and the next one the scrim's own", () => {
  // On a fake clock, because a real frame has been watched taking seconds on
  // the CI runner, for the reason `TICK` in `packages/leko/src/harness.ts`
  // records.
  vi.useFakeTimers()
  const { scrim, arrivals } = mount(40)
  scrim.converge(a, seen, 1000)
  elapse(500)
  expect(arrivals()).toBe(0)
  const mid = holeOnScreen(scrim)
  if (!mid) throw new Error('no hole in flight')
  between(mid, { ...seen, radius: 0 }, a)
  expect(mid.width).toBeGreaterThan(a.width)

  scrim.converge(b, seen)
  elapse(40 + 16)
  expect(arrivals()).toBe(1)
  expect(part(scrim, 'scrim').style.maskImage).toBe(serialised(WIDTH, HEIGHT, b))
})

test('a morph writes a blended hole per frame and arrives on the destination', async () => {
  const { scrim, arrived, arrivals } = mount(300)
  scrim.place(a, WIDTH)
  scrim.morph(b)
  const landed = arrived()
  const seenInFlight: Hole[] = []
  while (arrivals() === 0) {
    await frame()
    const hole = holeOnScreen(scrim)
    if (arrivals() === 0 && hole) seenInFlight.push(hole)
  }
  await landed
  for (const hole of seenInFlight) between(hole, a, b)
  expect(
    seenInFlight.some((hole) => hole.x !== a.x && hole.x !== b.x),
    'no frame between the two holes',
  ).toBe(true)
  expect(arrivals()).toBe(1)
  expect(part(scrim, 'scrim').style.maskImage).toBe(serialised(WIDTH, HEIGHT, b))
})

test('the halo is transparent while converging and shown on reveal', async () => {
  const { scrim, arrived } = mount(300)
  const halo = part(scrim, 'halo')
  scrim.converge(a, seen)
  await frame()
  expect(halo.style.opacity).toBe('0')
  await arrived()
  expect(halo.style.opacity).toBe('0')

  scrim.reveal(undefined, 'bottom', WIDTH)
  expect(halo.style.opacity).toBe('1')
  expect(px(halo.style.left)).toBe(a.x)
  expect(px(halo.style.top)).toBe(a.y)
  expect(px(halo.style.width)).toBe(a.width)
  expect(px(halo.style.height)).toBe(a.height)
  expect(px(halo.style.borderRadius)).toBe(a.radius)
})

test('a halo taken away by out and a converge is gone at once, not faded', async () => {
  const { scrim } = mount(1000)
  const halo = part(scrim, 'halo')
  scrim.opacity(1)
  scrim.place(a, WIDTH)
  scrim.reveal(undefined, 'bottom', WIDTH)
  for (let i = 0; i < 120 && getComputedStyle(halo).opacity !== '1'; i += 1) await frame()
  expect(getComputedStyle(halo).opacity).toBe('1')

  scrim.out()
  scrim.opacity(1)
  scrim.converge(b, seen)
  expect(getComputedStyle(halo).opacity).toBe('0')
})

test('the halo rides a morph', async () => {
  const { scrim, arrived } = mount(1000)
  const halo = part(scrim, 'halo')
  scrim.place(a, WIDTH)
  scrim.reveal(undefined, 'bottom', WIDTH)
  scrim.morph(b)
  await frame()
  await frame()
  const hole = holeOnScreen(scrim)
  if (!hole) throw new Error('no hole in flight')
  expect(halo.style.opacity).toBe('1')
  expect(px(halo.style.left)).toBeCloseTo(hole.x, 1)
  expect(px(halo.style.top)).toBeCloseTo(hole.y, 1)
  expect(px(halo.style.width)).toBeCloseTo(hole.width, 1)
  expect(px(halo.style.height)).toBeCloseTo(hole.height, 1)

  await arrived()
  expect(px(halo.style.left)).toBe(b.x)
  expect(px(halo.style.top)).toBe(b.y)
})

test('place writes the hole at once with no frame running', async () => {
  const { scrim, arrivals } = mount()
  scrim.morph(b)
  scrim.place(a, WIDTH)
  expect(part(scrim, 'scrim').style.maskImage).toBe(serialised(WIDTH, HEIGHT, a))
  expect(px(part(scrim, 'halo').style.left)).toBe(a.x)
  // Longer than the duration, so a loop left running would have arrived.
  for (let i = 0; i < 10; i += 1) await frame()
  expect(arrivals()).toBe(0)
  expect(part(scrim, 'scrim').style.maskImage).toBe(serialised(WIDTH, HEIGHT, a))
})

test('place takes a shown message along, and a side that no longer fits goes to bottom', () => {
  const { scrim } = mount()
  const message = part(scrim, 'message')
  const page = (): DOMRect => {
    const r = message.getBoundingClientRect()
    return new DOMRect(r.x + window.scrollX, r.y + window.scrollY, r.width, r.height)
  }

  scrim.place(a, WIDTH)
  scrim.reveal({ title: 'Title', body: 'Body' }, 'right', WIDTH)
  expect(Math.abs(page().left - (a.x + a.width + 12))).toBeLessThan(1)

  const moved: Hole = { x: 500, y: 900, width: 300, height: 120, radius: 8 }
  scrim.place(moved, 820)
  expect(message.style.visibility).toBe('visible')
  expect(Math.abs(page().top - (moved.y + moved.height + 12))).toBeLessThan(1)
  expect(Math.abs(page().left + page().width / 2 - (moved.x + moved.width / 2))).toBeLessThan(1)
})

test('place leaves a hidden message hidden', () => {
  const { scrim } = mount()
  scrim.place(a, WIDTH)
  expect(getComputedStyle(part(scrim, 'message')).visibility).toBe('hidden')
})

test('what sticks out of the page is clipped rather than growing it', () => {
  const { scrim } = mount()
  scrim.opacity(1)
  const foot: Hole = { x: 900, y: HEIGHT - 100, width: 100, height: 90, radius: 8 }
  scrim.place(foot, WIDTH)
  const width = document.documentElement.scrollWidth
  const height = document.documentElement.scrollHeight

  scrim.reveal({ title: 'Title', body: 'A body long enough to be wide' }, 'bottom', WIDTH)
  const r = part(scrim, 'message').getBoundingClientRect()
  expect(r.right + window.scrollX).toBeGreaterThan(WIDTH)
  expect(r.bottom + window.scrollY).toBeGreaterThan(HEIGHT)
  expect(document.documentElement.scrollWidth).toBe(width)
  expect(document.documentElement.scrollHeight).toBe(height)
})

test('out clears the mask, hides the halo and the message, and cancels the loop so nothing arrives', async () => {
  const { scrim, arrivals } = mount()
  scrim.opacity(1)
  scrim.place(a, WIDTH)
  scrim.reveal({ title: 'Title', body: 'Body' }, 'bottom', WIDTH)
  const message = part(scrim, 'message')
  expect(message.style.visibility).toBe('visible')

  scrim.morph(b)
  scrim.out()
  expect(part(scrim, 'scrim').style.maskImage).toBe(serialised(WIDTH, HEIGHT, undefined))
  expect(part(scrim, 'halo').style.opacity).toBe('0')
  expect(message.style.visibility).toBe('hidden')
  expect(scrim.root.style.opacity).toBe('0')
  for (let i = 0; i < 10; i += 1) await frame()
  expect(arrivals()).toBe(0)
  expect(part(scrim, 'scrim').style.maskImage).toBe(serialised(WIDTH, HEIGHT, undefined))
})

test('opacity is written on the root alone', () => {
  const { scrim } = mount()
  scrim.place(a, WIDTH)
  scrim.reveal({ body: 'Body' }, 'bottom', WIDTH)
  const halo = part(scrim, 'halo').style.opacity
  const message = part(scrim, 'message').style.opacity
  scrim.opacity(0.4)
  expect(scrim.root.style.opacity).toBe('0.4')
  expect(part(scrim, 'scrim').style.opacity).toBe('')
  expect(part(scrim, 'halo').style.opacity).toBe(halo)
  expect(part(scrim, 'message').style.opacity).toBe(message)
})

test('resize repaints the hole against the new size', () => {
  const { scrim } = mount()
  const wide: Hole = { x: 700, y: 500, width: 200, height: 120, radius: 8 }
  scrim.place(wide, WIDTH)
  expect(part(scrim, 'scrim').style.maskImage).toBe(serialised(WIDTH, HEIGHT, wide))
  scrim.resize(750, 2000)
  expect(scrim.root.style.width).toBe('750px')
  expect(scrim.root.style.height).toBe('2000px')
  expect(part(scrim, 'scrim').style.maskImage).toBe(serialised(750, 2000, wide))
  expect(serialised(750, 2000, wide)).not.toBe(serialised(WIDTH, HEIGHT, wide))
})

test('resize moves the root by the offset it is given, and back to the origin without one', () => {
  const { scrim } = mount()
  scrim.resize(WIDTH, HEIGHT, -30, -60)
  expect(scrim.root.style.left).toBe('-30px')
  expect(scrim.root.style.top).toBe('-60px')
  scrim.resize(WIDTH, HEIGHT)
  expect(scrim.root.style.left).toBe('0px')
  expect(scrim.root.style.top).toBe('0px')
})

test('destroy removes the root', () => {
  const { scrim } = mount()
  expect(scrim.root.isConnected).toBe(true)
  scrim.destroy()
  expect(scrim.root.isConnected).toBe(false)
})
