import { expect, test } from 'vitest'

import {
  collapse,
  complementRects,
  cornerRect,
  type Cutout,
  freeCorner,
  grow,
  lerpCutouts,
  lerpPath,
  padCutouts,
  punchedPath,
  type Rect,
  segmentAt,
  union,
} from './geometry.js'

const rect = (x: number, y: number, width: number, height: number) => ({ x, y, width, height })
/** A path with its numbers stripped out — what is left is its segment list. */
const shape = (path: string) => path.replace(/-?[\d.]+/g, '')
// Interactive by default here. Every test in this file is about geometry, and
// `punchedPath` reads the same shape whichever way this goes; the tests that are
// about it say so.
const cutout = (x: number, y: number, w: number, h: number, radius = 8): Cutout => ({
  ...rect(x, y, w, h),
  radius,
  interactive: true,
})

test('union is the bounding box, including the gap between', () => {
  expect(union([rect(10, 10, 40, 20), rect(80, 30, 20, 40)])).toEqual(rect(10, 10, 90, 60))
})

test('union of nothing is nothing', () => {
  expect(union([])).toBeNull()
})

test('grow expands on every side', () => {
  expect(grow(rect(10, 10, 40, 20), 5)).toEqual(rect(5, 5, 50, 30))
})

test('collapse keeps the centre', () => {
  expect(collapse(rect(10, 20, 40, 20))).toEqual(rect(30, 30, 0, 0))
})

test('a radius never exceeds half the shorter side', () => {
  // Asking for a radius bigger than the box would otherwise produce a path the
  // browser refuses to parse.
  const path = punchedPath(100, 100, [cutout(0, 0, 20, 10, 999)])
  expect(path).not.toContain('999')
  expect(path).toContain('A5 5')
})

test('every path has the same segments regardless of the numbers', () => {
  // This is the property the whole animation design rests on: two paths only
  // interpolate when their segment lists match in count and type.
  const a = punchedPath(800, 600, [cutout(10, 10, 100, 40), cutout(200, 300, 50, 50)])
  const b = punchedPath(1024, 768, [cutout(0, 0, 5, 5, 2), cutout(700, 20, 300, 120, 30)])
  expect(shape(a)).toBe(shape(b))
})

test('lerpCutouts blends the geometry and takes the flag from the destination', () => {
  const from = [{ ...rect(0, 0, 100, 100), radius: 0, interactive: true }]
  const to = [{ ...rect(100, 200, 200, 300), radius: 16, interactive: false }]

  expect(lerpCutouts(from, to, 0)).toEqual([
    { ...rect(0, 0, 100, 100), radius: 0, interactive: false },
  ])
  expect(lerpCutouts(from, to, 0.5)).toEqual([
    { ...rect(50, 100, 150, 200), radius: 8, interactive: false },
  ])
  expect(lerpCutouts(from, to, 1)).toEqual(to)
})

test('cutout lists are padded to equal length so their paths still interpolate', () => {
  const [from, to] = padCutouts(
    [cutout(0, 0, 50, 50), cutout(200, 0, 50, 50)],
    [cutout(0, 0, 80, 80)],
  )
  expect(from).toHaveLength(2)
  expect(to).toHaveLength(2)

  // The surplus cutout does not vanish from the path — it shrinks to nothing at
  // its own centre, which is what keeps the segment lists aligned.
  expect(to[1]).toEqual({ x: 225, y: 25, width: 0, height: 0, radius: 0, interactive: false })
  expect(shape(punchedPath(400, 400, from))).toBe(shape(punchedPath(400, 400, to)))
})

test('the browser accepts the paths we generate', () => {
  const path = punchedPath(800, 600, [cutout(40, 40, 120, 60, 12), cutout(300, 200, 80, 80, 40)])
  expect(CSS.supports('clip-path', `path(evenodd, "${path}")`)).toBe(true)
})

const path = (cutouts: Cutout[]) => `path(evenodd, "${punchedPath(1710, 952, cutouts)}")`
const cut = (x: number, y: number, w: number, h: number, r = 8): Cutout => ({
  x,
  y,
  width: w,
  height: h,
  radius: r,
  interactive: true,
})

// A value the browser rejects is not an error — assigning one to style is simply
// ignored, and the element keeps whatever it had. A morph made of rejected
// frames would look like nothing happening at all, so every frame is checked.

test('every frame of the opening morph is a value the browser accepts', () => {
  const m = 1710
  const [from, to] = padCutouts(
    [cut(-m, -m, 1710 + m * 2, 952 + m * 2, 0)],
    [cut(311, 145, 650, 42)],
  )
  const bad: string[] = []
  for (let i = 0; i <= 40; i++) {
    const value = lerpPath(path(from), path(to), i / 40)
    if (!CSS.supports('clip-path', value))
      bad.push(`t=${(i / 40).toFixed(2)}  ${value.slice(0, 160)}`)
  }
  expect(bad).toEqual([])
})

test('every frame between two ordinary cutouts is accepted', () => {
  const bad: string[] = []
  for (let i = 0; i <= 40; i++) {
    const value = lerpPath(path([cut(311, 145, 650, 42)]), path([cut(311, 206, 118, 104)]), i / 40)
    if (!CSS.supports('clip-path', value))
      bad.push(`t=${(i / 40).toFixed(2)}  ${value.slice(0, 160)}`)
  }
  expect(bad).toEqual([])
})

// A negative progress used to index one before the first path, hand `undefined`
// to the interpolation, and throw inside the animation loop — which killed the
// loop silently and left the scrim on whatever it had, looking like a step that
// simply never happened.
test('a progress value from a clock never falls outside the series', () => {
  for (const progress of [-1, -0.2, -0.000001, 0, 0.5, 0.999999, 1, 1.5]) {
    const { index, local } = segmentAt(3, progress)
    expect(index).toBeGreaterThanOrEqual(0)
    expect(index).toBeLessThanOrEqual(1)
    expect(local).toBeGreaterThanOrEqual(0)
    expect(local).toBeLessThanOrEqual(1)
  }
})

test('a two-path morph always sits on its only span', () => {
  expect(segmentAt(2, -5)).toEqual({ index: 0, local: 0 })
  expect(segmentAt(2, 0.25)).toEqual({ index: 0, local: 0.25 })
  expect(segmentAt(2, 1)).toEqual({ index: 0, local: 1 })
})

// What the scrim blocks with. The property that matters is not the shape of the
// answer but that no rectangle ever lands on a hole: that is what keeps a
// scrollable target scrolling, and what makes constraint 1 true by construction
// rather than by trusting a clip.
const overlaps = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

const area = (rects: Rect[]): number =>
  rects.reduce((sum, block) => sum + block.width * block.height, 0)

test('the blocking rectangles never touch a hole, however the holes are placed', () => {
  const surfaces: Rect[][] = [
    [],
    [{ x: 100, y: 100, width: 200, height: 80 }],
    // Two holes side by side, then stacked, then overlapping, then crossing the
    // edges of the surface — the last is the opening frame, which is a hole
    // larger than everything.
    [
      { x: 40, y: 40, width: 100, height: 60 },
      { x: 300, y: 40, width: 100, height: 60 },
    ],
    [
      { x: 40, y: 40, width: 100, height: 60 },
      { x: 40, y: 300, width: 100, height: 60 },
    ],
    [
      { x: 40, y: 40, width: 200, height: 200 },
      { x: 150, y: 150, width: 200, height: 200 },
    ],
    [{ x: -500, y: -500, width: 2000, height: 2000 }],
  ]

  for (const holes of surfaces) {
    const rects = complementRects(600, 500, holes)
    for (const block of rects) {
      for (const hole of holes) {
        expect(overlaps(block, hole)).toBe(false)
      }
      expect(block.width).toBeGreaterThan(0)
      expect(block.height).toBeGreaterThan(0)
    }
  }
})

test('the blocking rectangles cover everything the holes do not', () => {
  const holes = [
    { x: 100, y: 100, width: 200, height: 80 },
    { x: 400, y: 300, width: 100, height: 100 },
  ]
  const covered = area(complementRects(600, 500, holes))
  // The holes are disjoint here, so what is left is the surface minus both.
  expect(covered).toBe(600 * 500 - (200 * 80 + 100 * 100))
})

test('a hole larger than the surface leaves nothing to block with', () => {
  expect(complementRects(600, 500, [{ x: -100, y: -100, width: 900, height: 800 }])).toEqual([])
})

// `freeCorner` is what keeps the close control off a hole. A control on top of
// a cutout takes back the interaction the cutout exists to allow, which is the
// first constraint, so this has to answer with a corner that is clear whenever
// one is.

const SIZE = { width: 120, height: 40 }
const band = (y: number): Rect => ({ x: 0, y, width: 1000, height: 80 })

test('the top right corner is taken when nothing is in the way', () => {
  expect(freeCorner(1000, 800, SIZE, [], 16)).toBe('top-right')
})

test('a hole under the preferred corner sends the box to the next one', () => {
  // An account menu, which is exactly what sits in that corner on a real page.
  const menu = { x: 840, y: 8, width: 150, height: 48 }

  expect(freeCorner(1000, 800, SIZE, [menu], 16)).toBe('top-left')
})

test('the order is top right, top left, bottom right, bottom left', () => {
  expect(freeCorner(1000, 800, SIZE, [band(0)], 16)).toBe('bottom-right')
  expect(
    freeCorner(1000, 800, SIZE, [band(0), { x: 500, y: 720, width: 500, height: 80 }], 16),
  ).toBe('bottom-left')
})

test('a corner is only taken when the box clears the hole, not the corner point', () => {
  // The hole misses the very corner and still covers where the box would go.
  const near = { x: 900, y: 40, width: 60, height: 30 }

  expect(freeCorner(1000, 800, SIZE, [near], 16)).toBe('top-left')
})

test('every corner covered gives the least covered one, and gives it every time', () => {
  // A full-width header and a full-width footer leave no corner clear, and
  // something still has to be pressable.
  const holes = [
    { x: 0, y: 0, width: 1000, height: 60 },
    { x: 0, y: 700, width: 1000, height: 100 },
  ]

  // The header is shallower than the footer, so the top corners are covered
  // less. Ties go to the earlier corner, which makes the answer repeatable.
  expect(freeCorner(1000, 800, SIZE, holes, 16)).toBe('top-right')
  expect(freeCorner(1000, 800, SIZE, holes, 16)).toBe('top-right')
})

test('a corner rect sits inside the viewport, gap in from both edges', () => {
  expect(cornerRect(1000, 800, SIZE, 'top-right', 16)).toEqual({
    x: 1000 - 120 - 16,
    y: 16,
    width: 120,
    height: 40,
  })
  expect(cornerRect(1000, 800, SIZE, 'bottom-left', 16)).toEqual({
    x: 16,
    y: 800 - 40 - 16,
    width: 120,
    height: 40,
  })
})
