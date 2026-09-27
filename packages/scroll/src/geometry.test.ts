import { expect, test } from 'vitest'

import {
  edgesOf,
  holeOf,
  type Layout,
  paddingOf,
  positionAt,
  radiusOf,
  rangeOf,
  type Rect,
  reachOf,
  stretchesOf,
  triggers,
  tuningOf,
} from './geometry.js'
import type { LekoScrollTarget } from './types.js'

const tuning = tuningOf({ targets: [] })
const rect = (x: number, y: number, width: number, height: number): Rect => ({
  x,
  y,
  width,
  height,
})
/** A target 200px tall at `top`. */
const at = (top: number, height = 200): Rect => rect(0, top, 400, height)
/** An off entry, found at `box` or not found at all. */
const off = (box: Rect | undefined) => ({ off: box })
type Entry = Rect | undefined | ReturnType<typeof off>
/** A viewport 800px tall on a page 6000px tall: the line starts at 400 and reaches 5600. */
const page = (entries: Entry[]): Layout => ({
  viewportHeight: 800,
  pageHeight: 6000,
  boxes: entries.map((entry) => (entry !== undefined && 'off' in entry ? entry.off : entry)),
  off: entries.map((entry) => entry !== undefined && 'off' in entry),
})
const switches = (entries: Entry[]) =>
  triggers(tuning, page(entries)).map((found) => [found.index, found.at])
const edges = (entries: Entry[]) => {
  const layout = page(entries)
  return edgesOf(tuning, layout, triggers(tuning, layout))
}
const stretches = (entries: Entry[]) => {
  const layout = page(entries)
  return stretchesOf(tuning, layout, triggers(tuning, layout))
}
/** What the position is at each line position in `lineYs`. */
const positions = (entries: Entry[], lineYs: number[]) => {
  const range = rangeOf(tuning, page(entries))
  return lineYs.map((lineY) => positionAt(lineY, range))
}

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

test('an off entry has a switch position and holds spacing like any other', () => {
  expect(switches([at(1000), off(at(1010)), at(1020)])).toEqual([
    [0, 1000],
    [1, 1150],
    [2, 1300],
  ])
  // Counted in `n`, the marker pulls the target before it back.
  expect(switches([at(5400), off(at(5500)), at(5550)])).toEqual([
    [0, 5300],
    [1, 5450],
    [2, 5600],
  ])
})

test('the upper edge is the first switch position and the lower the later of bottom and trigger plus spacing', () => {
  expect(edges([at(1000), at(2000, 500)])).toMatchObject({
    upper: { at: 1000 },
    lower: { at: 2500 },
  })
  expect(edges([at(1000), at(2000, 50)])).toMatchObject({
    upper: { at: 1000 },
    lower: { at: 2150 },
  })
})

test("a band that does not fit above reach or below the line's start is no band", () => {
  // The upper band of a first target at 700 runs from 400 to 700, which is
  // exactly where the line starts; at 699 it would start above that.
  expect(edges([at(700), at(3000)])).toMatchObject({
    upper: { fade: true },
    lower: { fade: true },
  })
  expect(edges([at(699), at(3000)])).toMatchObject({ upper: { fade: false } })
  // The lower edge at 5300 ends its band at 5600, which is reach.
  expect(edges([at(1000), at(5100)])).toMatchObject({ lower: { at: 5300, fade: true } })
  expect(edges([at(1000), at(5101)])).toMatchObject({ lower: { fade: false } })

  // With neither band the range runs to both ends of the page.
  expect(positions([at(600), at(5400)], [400, 5600])).toMatchObject([
    { zone: 'inside', opacity: 1 },
    { zone: 'inside', opacity: 1 },
  ])
})

test('opacity is 1 inside, falls with distance in a band, and is 0 past fade', () => {
  expect(positions([at(1000), at(2000, 500)], [1000, 2500, 850, 2575, 700, 2800, 0])).toMatchObject(
    [
      { zone: 'inside', opacity: 1 },
      { zone: 'inside', opacity: 1 },
      { zone: 'band', opacity: 0.5 },
      { zone: 'band', opacity: 0.75 },
      { zone: 'gone', opacity: 0 },
      { zone: 'gone', opacity: 0 },
      { zone: 'gone', opacity: 0 },
    ],
  )
})

test('between two switch positions the earlier target is the one the position calls for', () => {
  const targets = positions(
    [at(1000), at(2000), at(3000)],
    [1999, 2000, 2999, 3100, 900, 3300],
  ).map(({ target }) => target)
  // In a band the hole belongs to the target nearest it.
  expect(targets).toEqual([0, 1, 1, 2, 0, 2])
})

test('an off stretch runs from its switch position to the next lit one', () => {
  expect(stretches([at(1000), off(at(2000)), at(3000)])).toEqual([
    { from: 1000, to: 2000, lit: 0, bandAbove: 0, bandBelow: 0 },
    { from: 2000, to: 3000, lit: undefined, bandAbove: 300, bandBelow: 300 },
    { from: 3000, to: Infinity, lit: 2, bandAbove: 0, bandBelow: 0 },
  ])
})

test('consecutive off entries are one stretch', () => {
  expect(stretches([at(1000), off(at(2000)), off(at(2500)), at(3000)])).toEqual([
    { from: 1000, to: 2000, lit: 0, bandAbove: 0, bandBelow: 0 },
    { from: 2000, to: 3000, lit: undefined, bandAbove: 300, bandBelow: 300 },
    { from: 3000, to: Infinity, lit: 3, bandAbove: 0, bandBelow: 0 },
  ])
})

test('the bands inside an off stretch are min(fade, half the stretch) each', () => {
  expect(stretches([at(1000), off(at(2000)), at(2400)])[1]).toMatchObject({
    bandAbove: 200,
    bandBelow: 200,
  })
  expect(stretches([at(1000), off(at(2000)), at(2600)])[1]).toMatchObject({
    bandAbove: 300,
    bandBelow: 300,
  })
  // The two bands meet in the middle and never overlap.
  expect(positions([at(1000), off(at(2000)), at(2400)], [2100, 2150, 2200, 2300])).toEqual([
    { zone: 'band', target: 0, opacity: 0.5 },
    { zone: 'band', target: 0, opacity: 0.25 },
    { zone: 'gone', target: undefined, opacity: 0 },
    { zone: 'band', target: 2, opacity: 0.5 },
  ])
})

test('an off entry that is first leaves the light off to the top, with one band below', () => {
  const entries = [off(at(1000)), at(1200)]
  expect(stretches(entries)).toEqual([
    { from: -Infinity, to: 1200, lit: undefined, bandAbove: 0, bandBelow: 200 },
    { from: 1200, to: Infinity, lit: 1, bandAbove: 0, bandBelow: 0 },
  ])
  expect(edges(entries)).toMatchObject({ upper: undefined })
  expect(positions(entries, [400, 999, 1100, 1200])).toEqual([
    { zone: 'gone', target: undefined, opacity: 0 },
    { zone: 'gone', target: undefined, opacity: 0 },
    { zone: 'band', target: 1, opacity: 0.5 },
    { zone: 'inside', target: 1, opacity: 1 },
  ])
  expect(stretches([off(at(1000)), at(2000)])[0]).toMatchObject({ bandBelow: 300 })
})

test('an off entry that is first near the top keeps its band below where the line can reach', () => {
  // The line gets no higher than 400, so the band runs from there to 500.
  const entries = [off(at(100)), at(500)]
  expect(stretches(entries)[0]).toMatchObject({ bandAbove: 0, bandBelow: 100 })
  expect(positions(entries, [400, 450, 500])).toEqual([
    { zone: 'gone', target: undefined, opacity: 0 },
    { zone: 'band', target: 1, opacity: 0.5 },
    { zone: 'inside', target: 1, opacity: 1 },
  ])
  // With the next switch above the line's start there is no band at all.
  expect(stretches([off(at(100)), at(300)])[0]).toMatchObject({ bandBelow: 0 })
})

test('an off entry that is last puts the light out to the foot, with one band above', () => {
  const entries = [at(1000), off(at(5500))]
  expect(stretches(entries)).toEqual([
    { from: 1000, to: 5500, lit: 0, bandAbove: 0, bandBelow: 0 },
    // Only 100px of the page is left below the marker for the line to reach.
    { from: 5500, to: Infinity, lit: undefined, bandAbove: 100, bandBelow: 0 },
  ])
  expect(edges(entries)).toMatchObject({ lower: undefined })
  // The target's bottom is no edge: it stays lit down to the marker.
  expect(positions(entries, [5000, 5550, 5600])).toEqual([
    { zone: 'inside', target: 0, opacity: 1 },
    { zone: 'band', target: 0, opacity: 0.5 },
    { zone: 'gone', target: undefined, opacity: 0 },
  ])
  expect(stretches([at(1000), off(at(3000))])[1]).toMatchObject({ bandAbove: 300 })
})

test('an off marker not found is skipped and the earlier target runs on to the next switch', () => {
  const entries = [at(1000), off(undefined), at(3000)]
  expect(stretches(entries).map(({ lit }) => lit)).toEqual([0, 2])
  expect(positions(entries, [2500, 3000])).toMatchObject([
    { zone: 'inside', target: 0 },
    { zone: 'inside', target: 2 },
  ])
})

test("inside an off stretch the position is the neighbour's band, then gone", () => {
  expect(
    positions(
      [at(1000), off(at(2000)), at(3000)],
      [1999, 2000, 2150, 2300, 2500, 2700, 2850, 3000],
    ),
  ).toEqual([
    { zone: 'inside', target: 0, opacity: 1 },
    { zone: 'band', target: 0, opacity: 1 },
    { zone: 'band', target: 0, opacity: 0.5 },
    { zone: 'gone', target: undefined, opacity: 0 },
    { zone: 'gone', target: undefined, opacity: 0 },
    { zone: 'gone', target: undefined, opacity: 0 },
    { zone: 'band', target: 2, opacity: 0.5 },
    { zone: 'inside', target: 2, opacity: 1 },
  ])
})

test("the page's two ends keep their rule when the outer stretches are lit", () => {
  const entries = [at(1000), off(at(2000)), at(3000)]
  expect(edges(entries)).toMatchObject({
    upper: { at: 1000, fade: true },
    lower: { at: 3200, fade: true },
  })
  expect(positions(entries, [850, 3350, 3500])).toEqual([
    { zone: 'band', target: 0, opacity: 0.5 },
    { zone: 'band', target: 2, opacity: 0.5 },
    { zone: 'gone', target: 2, opacity: 0 },
  ])
  // With neither band the range still runs to both ends of the page.
  expect(positions([at(600), off(at(2000)), at(5400)], [400, 5600])).toMatchObject([
    { zone: 'inside', target: 0 },
    { zone: 'inside', target: 2 },
  ])
})

test('all entries off is no range', () => {
  expect(rangeOf(tuning, page([off(at(1000)), off(at(2000))]))).toBeUndefined()
  // Off entries found and the lit one not is the same.
  expect(rangeOf(tuning, page([undefined, off(at(2000))]))).toBeUndefined()
  expect(positionAt(1500, undefined)).toEqual({ zone: 'gone', target: undefined, opacity: 0 })
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

test('an off entry is refused what only a lit one draws', () => {
  // The type is the whole of this test: an off entry is never lit, so a
  // message, a side, a padding or a radius on it would be drawn nowhere.
  const entries: LekoScrollTarget[] = [
    { target: '#a', off: true },
    { target: '#a', off: false, message: { title: 'Title' } },
    // @ts-expect-error
    { target: '#a', off: true, message: { title: 'Title' } },
    // @ts-expect-error
    { target: '#a', off: true, side: 'top' },
    // @ts-expect-error
    { target: '#a', off: true, padding: 0 },
    // @ts-expect-error
    { target: '#a', off: true, radius: 0 },
  ]
  expect(entries).toHaveLength(6)
})

test('nothing found means no triggers, no edges and no target', () => {
  const layout = page([undefined, undefined])
  const found = triggers(tuning, layout)
  expect(found).toEqual([])
  expect(edgesOf(tuning, layout, found)).toBeUndefined()
  expect(rangeOf(tuning, layout)).toBeUndefined()
  expect(positionAt(1000, undefined)).toEqual({
    zone: 'gone',
    target: undefined,
    opacity: 0,
  })
})
