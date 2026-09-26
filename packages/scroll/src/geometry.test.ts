import { expect, test } from 'vitest'

import {
  edgesOf,
  holeOf,
  type Layout,
  paddingOf,
  positionAt,
  radiusOf,
  type Rect,
  reachOf,
  triggers,
  tuningOf,
} from './geometry.js'

const tuning = tuningOf({ targets: [] })
const rect = (x: number, y: number, width: number, height: number): Rect => ({
  x,
  y,
  width,
  height,
})
/** A target 200px tall at `top`. */
const at = (top: number, height = 200): Rect => rect(0, top, 400, height)
/** A viewport 800px tall on a page 6000px tall: the line starts at 400 and reaches 5600. */
const page = (boxes: (Rect | undefined)[]): Layout => ({
  viewportHeight: 800,
  pageHeight: 6000,
  boxes,
})
const switches = (boxes: (Rect | undefined)[]) =>
  triggers(tuning, page(boxes)).map((found) => [found.index, found.at])

test('the tuning defaults to a line at half the viewport, a fade of 300 and a spacing of 150', () => {
  expect(tuning).toEqual({ line: 0.5, fade: 300, spacing: 150 })
  expect(tuningOf({ targets: [], line: 0.3, fade: 0, spacing: 40 })).toEqual({
    line: 0.3,
    fade: 0,
    spacing: 40,
  })
})

test('switch positions climb with the array whatever the page order', () => {
  expect(switches([at(2000), at(1500), at(3000)])).toEqual([
    [0, 2000],
    [1, 2150],
    [2, 3000],
  ])
})

test('two targets close on the page are held spacing apart', () => {
  expect(switches([at(1000), at(1010)])).toEqual([
    [0, 1000],
    [1, 1150],
  ])
})

test('the last targets are pulled back so the line can reach every one', () => {
  expect(reachOf(tuning, page([]))).toBe(5600)
  expect(switches([at(1000), at(5500), at(5550), at(5580)])).toEqual([
    [0, 1000],
    [1, 5300],
    [2, 5450],
    [3, 5600],
  ])
})

test('consecutive switch positions are never less than spacing apart', () => {
  // Pages in every order, crowded at the top, crowded at the foot and spread
  // out, on a seeded sequence so a failure reproduces.
  let seed = 7
  const next = () => (seed = (seed * 48271) % 2147483647) / 2147483647
  for (let run = 0; run < 200; run++) {
    const boxes = Array.from({ length: 1 + Math.floor(next() * 12) }, () => at(next() * 6000))
    const found = triggers(tuning, page(boxes))
    for (let i = 1; i < found.length; i++) {
      expect(found[i]!.at - found[i - 1]!.at).toBeGreaterThanOrEqual(tuning.spacing - 1e-9)
    }
  }
})

test('a target that was not found holds no spacing and keeps its index', () => {
  // Counted, the missing target would pull the first back to 5300.
  expect(switches([at(5500), undefined, at(5550)])).toEqual([
    [0, 5450],
    [2, 5600],
  ])
})

test('the upper edge is the first switch position and the lower the later of bottom and trigger plus spacing', () => {
  const tall = page([at(1000), at(2000, 500)])
  expect(edgesOf(tuning, tall, triggers(tuning, tall))).toMatchObject({ upper: 1000, lower: 2500 })
  const short = page([at(1000), at(2000, 50)])
  expect(edgesOf(tuning, short, triggers(tuning, short))).toMatchObject({
    upper: 1000,
    lower: 2150,
  })
})

test("a band that does not fit above reach or below the line's start is no band", () => {
  const edges = (boxes: Rect[]) => {
    const layout = page(boxes)
    return edgesOf(tuning, layout, triggers(tuning, layout))
  }
  // The upper band of a first target at 700 runs from 400 to 700, which is
  // exactly where the line starts; at 699 it would start above that.
  expect(edges([at(700), at(3000)])).toMatchObject({ upperFade: true, lowerFade: true })
  expect(edges([at(699), at(3000)])).toMatchObject({ upperFade: false })
  // The lower edge at 5300 ends its band at 5600, which is reach.
  expect(edges([at(1000), at(5100)])).toMatchObject({ lower: 5300, lowerFade: true })
  expect(edges([at(1000), at(5101)])).toMatchObject({ lowerFade: false })

  // With neither band the range runs to both ends of the page.
  const layout = page([at(600), at(5400)])
  const found = triggers(tuning, layout)
  const none = edgesOf(tuning, layout, found)
  expect(positionAt(400, found, none)).toMatchObject({ zone: 'inside', opacity: 1 })
  expect(positionAt(5600, found, none)).toMatchObject({ zone: 'inside', opacity: 1 })
})

test('opacity is 1 inside, falls with distance in a band, and is 0 past fade', () => {
  const layout = page([at(1000), at(2000, 500)])
  const found = triggers(tuning, layout)
  const edges = edgesOf(tuning, layout, found)
  const opacity = (lineY: number) => positionAt(lineY, found, edges)
  expect(opacity(1000)).toMatchObject({ zone: 'inside', opacity: 1 })
  expect(opacity(2500)).toMatchObject({ zone: 'inside', opacity: 1 })
  expect(opacity(850)).toMatchObject({ zone: 'band', opacity: 0.5 })
  expect(opacity(2575)).toMatchObject({ zone: 'band', opacity: 0.75 })
  expect(opacity(700)).toMatchObject({ zone: 'gone', opacity: 0 })
  expect(opacity(2800)).toMatchObject({ zone: 'gone', opacity: 0 })
  expect(opacity(0)).toMatchObject({ zone: 'gone', opacity: 0 })
})

test('between two switch positions the earlier target is the one the position calls for', () => {
  const layout = page([at(1000), at(2000), at(3000)])
  const found = triggers(tuning, layout)
  const edges = edgesOf(tuning, layout, found)
  const target = (lineY: number) => positionAt(lineY, found, edges).target
  expect(target(1999)).toBe(0)
  expect(target(2000)).toBe(1)
  expect(target(2999)).toBe(1)
  expect(target(3100)).toBe(2)
  // In a band the hole belongs to the target nearest it.
  expect(target(900)).toBe(0)
  expect(target(3300)).toBe(2)
})

test("the hole is the border box grown by padding, the target's own winning", () => {
  expect(holeOf(rect(100, 200, 300, 50), 8, 12)).toEqual({
    x: 92,
    y: 192,
    width: 316,
    height: 66,
    radius: 12,
  })
  const options = { targets: [], padding: 20, radius: 4 }
  expect(paddingOf({ target: '#a', padding: 0 }, options)).toBe(0)
  expect(paddingOf({ target: '#a' }, options)).toBe(20)
  expect(paddingOf({ target: '#a' }, { targets: [] })).toBe(8)
  expect(radiusOf({ target: '#a', radius: 0 }, options)).toBe(0)
  expect(radiusOf({ target: '#a' }, options)).toBe(4)
  expect(radiusOf({ target: '#a' }, { targets: [] })).toBe(8)
})

test('nothing found means no triggers, no edges and no target', () => {
  const layout = page([undefined, undefined])
  const found = triggers(tuning, layout)
  expect(found).toEqual([])
  expect(edgesOf(tuning, layout, found)).toBeUndefined()
  expect(positionAt(1000, found, undefined)).toEqual({
    zone: 'gone',
    target: undefined,
    opacity: 0,
  })
})
