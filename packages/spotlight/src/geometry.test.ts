import { expect, test } from 'vitest'

import {
  clamp,
  collapse,
  complementRects,
  cornerRect,
  cubicBezier,
  type Cutout,
  ease,
  freeCorner,
  GLIDE_PACE,
  glideDuration,
  grow,
  clipToSurface,
  hasArea,
  holeImage,
  lerpCutouts,
  maskLayers,
  outset,
  padCutouts,
  type Rect,
  scrollDelta,
  scrollStages,
  segmentAt,
  shift,
  union,
} from './geometry.js'

const rect = (x: number, y: number, width: number, height: number) => ({ x, y, width, height })
/** The SVG a hole layer carries, readable again. */
const svgOf = (layer: string) =>
  decodeURIComponent(layer.replace(/^url\("data:image\/svg\+xml;utf8,|"\)$/g, ''))
/** A comma-separated CSS list split at the top level, so `linear-gradient(black, black)` stays whole. */
const layersOf = (value: string) => {
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < value.length; i++) {
    const c = value[i]
    if (c === '(') depth++
    else if (c === ')') depth--
    else if (c === ',' && depth === 0) {
      parts.push(value.slice(start, i).trim())
      start = i + 1
    }
  }
  parts.push(value.slice(start).trim())
  return parts
}
// Interactive by default here. Every test in this file is about geometry, and
// `maskLayers` reads the same hole whichever way this goes; the tests that are
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

test('outset takes a side each, where grow takes one for all four', () => {
  expect(outset(rect(10, 10, 40, 20), { top: 1, right: 2, bottom: 3, left: 4 })).toEqual(
    rect(6, 9, 46, 24),
  )
})

// --- moving a box between two spaces
//
// `geometry.ts` says what the two spaces are and why a translation is all that
// separates them. `originOf` says how far apart they are; this is what does the
// moving, and it is what lets a draw read each box once and have it in both.

test('shift moves a rect and leaves its size alone', () => {
  expect(shift(rect(10, 20, 40, 30), { x: 5, y: -7 })).toEqual(rect(15, 13, 40, 30))
})

test("shift carries a cutout's radius and whether it is open", () => {
  // The reason it is generic. A cutout stripped to a rect on the way between
  // spaces would come out of the second one square and blocked.
  expect(shift(cutout(10, 20, 40, 30, 6), { x: 100, y: 0 })).toEqual(cutout(110, 20, 40, 30, 6))
})

test('shifting by nothing is the rect itself', () => {
  // Which is the viewport's own origin, and the whole of what a draw on a fixed
  // target pays to have its boxes in both spaces.
  expect(shift(rect(10, 20, 40, 30), { x: 0, y: 0 })).toEqual(rect(10, 20, 40, 30))
})

test('a box the port already holds asks for no scroll at all', () => {
  // The refusal a step arriving owes the viewer, and it lives here rather than
  // in a check beside the call.
  expect(scrollDelta(rect(20, 20, 40, 40), rect(0, 0, 200, 200))).toEqual({ x: 0, y: 0 })
})

test('a box past the far edge is brought to the middle, not to the edge', () => {
  // 20px over the bottom of a 200px port. The nearest edge would be 20px of
  // movement; the middle is 100px, and the middle is the point of a step.
  expect(scrollDelta(rect(20, 180, 40, 40), rect(0, 0, 200, 200))).toEqual({ x: 0, y: 100 })
})

test('a box past the near edge is brought to the middle too, from the other side', () => {
  expect(scrollDelta(rect(20, -50, 40, 40), rect(0, 0, 200, 200))).toEqual({ x: 0, y: -130 })
})

test('a port already holding one axis is moved on the other only', () => {
  expect(scrollDelta(rect(240, 40, 40, 40), rect(0, 0, 200, 200))).toEqual({ x: 160, y: 0 })
})

test('a box hanging half off the port is not "already there"', () => {
  // Visible, and not held: the hole is cut around the whole box, overhang and
  // all, so half a hole on screen is a step drawn where it cannot be read.
  expect(scrollDelta(rect(20, 180, 40, 40), rect(0, 0, 200, 200)).y).not.toBe(0)
})

test('a box more than half the port tall leads with its top edge, at the middle', () => {
  // 120 tall in a 200 port, so centring it would leave 40 above and 40 below —
  // nowhere for the message. Its top goes to the middle instead, which always
  // leaves half a port above the hole.
  expect(scrollDelta(rect(20, 300, 40, 120), rect(0, 0, 200, 200))).toEqual({ x: 0, y: 200 })
})

test('a box taller than the whole port leads with its top edge too', () => {
  // The case where centring leaves no room at all: the hole covers the port and
  // the message has nowhere on screen to be.
  expect(scrollDelta(rect(20, 300, 40, 400), rect(0, 0, 200, 200))).toEqual({ x: 0, y: 200 })
})

test('a box exactly half the port tall is still centred', () => {
  // The threshold is where being centred stops leaving a quarter of the port on
  // each side, and at the threshold it still does.
  expect(scrollDelta(rect(20, 300, 40, 100), rect(0, 0, 200, 200))).toEqual({ x: 0, y: 250 })
})

test('a tall box the port already holds is left alone all the same', () => {
  // Leading with the top edge is for a box that has to be moved. One that is
  // already showing in full is not moved, tall or not: the refusal wins.
  expect(scrollDelta(rect(20, 30, 40, 120), rect(0, 0, 200, 200))).toEqual({ x: 0, y: 0 })
})

test('leading with the near edge is vertical only', () => {
  // 120 wide in a 200 port is more than half of it, and is centred all the same —
  // DESIGN.md, **A target more than half the port tall leads with its top edge,
  // put at the middle**, is vertical only.
  expect(scrollDelta(rect(300, 20, 120, 40), rect(0, 0, 200, 200))).toEqual({ x: 260, y: 0 })
  expect(scrollDelta(rect(300, 20, 400, 40), rect(0, 0, 200, 200))).toEqual({ x: 300, y: 0 })
})

test('a scrollport of its own offset is measured in the same space as the box', () => {
  // A nested scroller's port is not at the origin. Both rects are in viewport
  // coordinates, so the delta is worked out between them and nothing else.
  expect(scrollDelta(rect(100, 100, 40, 40), rect(0, 120, 200, 200))).toEqual({ x: 0, y: -100 })
})

test('nothing here clamps, so the port is what stops at the end of the content', () => {
  // A box near the end of the content asks for a scroll past the end. That is
  // the honest delta: the scrollport clamps it and the box lands as near the
  // middle as the content allows.
  expect(scrollDelta(rect(20, 300, 40, 40), rect(0, 0, 200, 200))).toEqual({ x: 0, y: 220 })
})

// `scrollStages`: every destination of a staged scroll, worked out before any
// of them is written. DESIGN.md,
// **`scroll: 'staged'` moves one port at a time, outermost first**.

/** A port with room to spare on both axes, for a test that is not about running out. */
const roomy = (port: Rect, from = { x: 0, y: 0 }) => ({ port, from, limit: { x: 2000, y: 2000 } })

test('one port is asked for its own destination, clamped to its own end', () => {
  // The delta is 220 and the port has 150 left, so 150 is the answer: the port
  // would clamp it anyway, and the arithmetic for the port outside it has to
  // know which of the two happened.
  expect(
    scrollStages(rect(20, 300, 40, 40), [
      { port: rect(0, 0, 200, 200), from: { x: 0, y: 0 }, limit: { x: 0, y: 150 } },
    ]),
  ).toEqual([{ x: 0, y: 150 }])
})

test('an outer port is measured against the box the inner one moved', () => {
  // The row is 400 down the screen and the panel brings it to 130 by scrolling
  // 270. Measured where it started, the page would move 320 to centre it; the
  // page it is now on already holds it, so the page does not move at all.
  expect(
    scrollStages(rect(20, 400, 40, 40), [
      roomy(rect(0, 100, 100, 100)),
      roomy(rect(0, 0, 200, 200)),
    ]),
  ).toEqual([
    { x: 0, y: 270 },
    { x: 0, y: 0 },
  ])
})

test('a clamped inner port moves the outer one by what happened, not what was asked', () => {
  // The panel is asked for 270 and has 100 left. The page is then measured
  // against a box that came up 100, not 270 — 220 rather than nothing.
  expect(
    scrollStages(rect(20, 400, 40, 40), [
      { port: rect(0, 100, 100, 100), from: { x: 0, y: 0 }, limit: { x: 0, y: 100 } },
      roomy(rect(0, 0, 200, 200)),
    ]),
  ).toEqual([
    { x: 0, y: 100 },
    { x: 0, y: 220 },
  ])
})

test('a port that already holds the box stays where it is and moves nothing along', () => {
  // Both answers are where the ports already stand — the refusal `scrollDelta`
  // makes, carried through the fold rather than special-cased here.
  expect(
    scrollStages(rect(20, 120, 40, 40), [
      roomy(rect(0, 100, 100, 100), { x: 0, y: 50 }),
      roomy(rect(0, 0, 200, 200), { x: 0, y: 30 }),
    ]),
  ).toEqual([
    { x: 0, y: 50 },
    { x: 0, y: 30 },
  ])
})

test('three ports compose, each measured against every move inside it', () => {
  // A row 1500 down the page, in a list clipped by the panel that holds it. The
  // list comes up 420 and the panel 250, so the page is measured against a row
  // 670 higher than the one it was handed: 550 rather than 1220.
  expect(
    scrollStages(rect(20, 1500, 200, 40), [
      roomy(rect(0, 900, 300, 400)),
      roomy(rect(0, 700, 300, 300)),
      { port: rect(0, 0, 400, 600), from: { x: 0, y: 0 }, limit: { x: 0, y: 3000 } },
    ]),
  ).toEqual([
    { x: 0, y: 420 },
    { x: 0, y: 250 },
    { x: 0, y: 550 },
  ])
})

test('a glide takes longer the further it goes, by the cube root of the way', () => {
  // A person is meant to take in the page while it moves, so the way counts;
  // but eight times the distance is twice the glide, not eight times it.
  expect(glideDuration(1000, 320)).toBe(10 * GLIDE_PACE)
  expect(glideDuration(8000, 320)).toBe(20 * GLIDE_PACE)
})

test('a short glide still runs for as long as the morph', () => {
  // The morph's length is the floor, so a small move glides rather than snaps,
  // and a host that asked for a slower morph gets a glide no quicker than it.
  // At the default morph the root is over the floor within a few pixels, so
  // the floor is mostly the slow host's.
  expect(glideDuration(8, 320)).toBe(320)
  expect(glideDuration(1000, 5000)).toBe(5000)
})

test('collapse keeps the centre', () => {
  expect(collapse(rect(10, 20, 40, 20))).toEqual(rect(30, 30, 0, 0))
})

test('a radius never exceeds half the shorter side', () => {
  // Asking for a radius bigger than the box would otherwise produce an image
  // the browser draws differently from the halo laid over the same hole.
  expect(svgOf(holeImage(cutout(0, 0, 20, 10, 999)))).toContain('rx="5"')
})

test('a hole is drawn at its own size and laid where it belongs', () => {
  // Not an image the size of the surface with the hole painted into it —
  // DESIGN.md, **Drawing**, for what that would cost an engine on a scrim
  // thousands of pixels tall.
  const { image, position } = maskLayers(2000, 12000, [cutout(300, 9000, 120, 60)])
  const [surface, hole] = layersOf(image)
  expect(surface).toBe('linear-gradient(black, black)')
  expect(svgOf(hole!)).toContain('width="120" height="60"')
  expect(position).toBe('0 0, 300px 9000px')
})

test('the holes union rather than alternate', () => {
  // The whole reason the scrim is masked and not clipped — DESIGN.md,
  // **Drawing**. `add` between the hole layers makes two overlapping holes one
  // hole.
  const { composite } = maskLayers(800, 600, [cutout(0, 0, 100, 100), cutout(50, 50, 100, 100)])
  expect(composite).toBe('subtract, add, add')
})

test('a cutout with no area contributes no layer', () => {
  // `geometry.ts` says why a morph's collapsed leftover is dropped rather than
  // drawn at no size.
  const { image, position, composite } = maskLayers(800, 600, [
    cutout(10, 10, 100, 40),
    { ...rect(200, 200, 0, 0), radius: 0, interactive: false },
  ])
  expect(layersOf(image)).toHaveLength(2)
  expect(position).toBe('0 0, 10px 10px')
  expect(composite).toBe('subtract, add')
})

test('a cutout hanging off the surface is trimmed to it', () => {
  // Only a bound on what is drawn: the part taken off is off the scrim, where
  // nothing is painted either way. It is what keeps the opening's holes — each
  // one larger than the whole surface — from being drawn at that size.
  expect(clipToSurface(800, 600, cutout(-2000, -2000, 5000, 5000))).toMatchObject(
    rect(0, 0, 800, 600),
  )
})

test('a trimmed hole keeps its shape: the rect rides whole at a negative offset', () => {
  // A target flush with the top of the page, grown by its padding, hangs off
  // the surface. The image is clipped to what is on the surface, but the hole
  // inside it is not reshaped: rounding a corner at the clip line would paint
  // dark wedges over the target's own corners, where the true hole runs
  // straight across — and would part company with the halo, which is laid
  // from the same unclipped cutout.
  const { image, position } = maskLayers(1000, 800, [cutout(100, -8, 200, 50)])
  const hole = svgOf(layersOf(image)[1]!)
  expect(hole).toContain('width="200" height="42">')
  expect(hole).toContain('<rect x="0" y="-8" width="200" height="50" rx="8"')
  expect(position).toBe('0 0, 100px 0px')
})

test('no hole image is ever larger than the surface', () => {
  const m = 1710
  const { image } = maskLayers(1710, 952, [cutout(-m, -m, 1710 + m * 2, 952 + m * 2, 0)])
  expect(svgOf(layersOf(image)[1]!)).toContain('width="1710" height="952"')
})

test('hasArea tells a hole from a leftover', () => {
  expect(hasArea(rect(0, 0, 10, 10))).toBe(true)
  expect(hasArea(rect(5, 5, 0, 10))).toBe(false)
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

test('cutout lists are padded to equal length so every hole has a counterpart', () => {
  const [from, to] = padCutouts(
    [cutout(0, 0, 50, 50), cutout(200, 0, 50, 50)],
    [cutout(0, 0, 80, 80)],
  )
  expect(from).toHaveLength(2)
  expect(to).toHaveLength(2)

  // The surplus cutout does not vanish — it shrinks to nothing at its own
  // centre, which reads as leaving rather than blinking out.
  expect(to[1]).toEqual({ x: 225, y: 25, width: 0, height: 0, radius: 0, interactive: false })
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

// --- the curve, and the range a scroll is held in

test('the ease starts at nothing and ends at everything', () => {
  expect(ease(0)).toBe(0)
  expect(ease(1)).toBe(1)
})

test('the ease is out: half the time has covered most of the way', () => {
  expect(ease(0.5)).toBeCloseTo(0.878, 3)
})

test('the ease leaves from rest, where the ease-out shoved', () => {
  // Issue #154. The curve before this one was `1 - (1 - t) ** 3`, which is at
  // full speed on its first frame and answers 0.0297 here — three per cent of
  // the way in one per cent of the time, and on a glide that is the whole
  // viewport jumping. DESIGN.md, **The morph**.
  expect(ease(0.01)).toBeLessThan(0.01)
})

test('half the way is covered in the first fifth of the time', () => {
  // The other half of the shape, which DESIGN.md, **The morph**, argues:
  // nothing was traded away for the soft start.
  expect(ease(0.2)).toBeCloseTo(0.5, 2)
})

test('cubicBezier(0, 0, 1, 1) is the line', () => {
  const linear = cubicBezier(0, 0, 1, 1)
  for (const t of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) expect(linear(t)).toBeCloseTo(t, 6)
})

test('cubicBezier solves x for t rather than reading t as x', () => {
  // What the parameter search is for: the control points are not the curve's
  // own parameter. Evaluating the vertical Bézier at `t` directly answers
  // 0.104 here, which is a different curve that also runs from 0 to 1.
  expect(cubicBezier(0.2, 0, 0, 1)(0.2)).toBeCloseTo(0.5, 2)
})

test('a control point outside the range still runs from 0 to 1', () => {
  // The horizontal control points are held inside the range, because outside
  // it the search has no single answer to find. A host that writes one anyway
  // gets a curve rather than a hole in the animation.
  //
  // `x1` past `x2` rather than either one merely out of range: unclamped, this
  // pair turns back on 28 of the samples below, where `(-2, 0, 3, 1)` is
  // monotonic by luck and holds nothing.
  const wild = cubicBezier(2, 0, -1, 1)
  expect(wild(0)).toBe(0)
  expect(wild(1)).toBe(1)
  let last = 0
  for (let t = 0; t <= 1.0000001; t += 0.01) {
    const now = wild(t)
    expect(Number.isFinite(now)).toBe(true)
    expect(now).toBeGreaterThanOrEqual(last - 1e-9)
    last = now
  }
})

test('the ease never turns back', () => {
  let last = ease(0)
  for (let t = 0; t <= 1.0000001; t += 0.01) {
    const now = ease(t)
    expect(now).toBeGreaterThanOrEqual(last)
    last = now
  }
})

test('a cutout arrives rather than stops', () => {
  // What the curve is for: the last tenth of the time covers far less ground
  // than the first, so a hole slows into place instead of halting on arrival.
  const first = ease(0.1) - ease(0)
  const final = ease(1) - ease(0.9)
  expect(final).toBeLessThan(first)
})

test('clamp holds a value inside the range', () => {
  expect(clamp(40, 100)).toBe(40)
})

test('a value past the end is the end, and one before the start is the start', () => {
  expect(clamp(140, 100)).toBe(100)
  expect(clamp(-40, 100)).toBe(0)
})

test('a range with no room at all clamps to zero', () => {
  // A page shorter than its viewport has a negative scroll range, and the only
  // offset it can reach is `0`. A clamp that took the negative end for a
  // maximum would answer with it.
  expect(clamp(40, -100)).toBe(0)
  expect(clamp(-40, -100)).toBe(0)
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
  // No corner is left clear here, and something still has to be pressable.
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
