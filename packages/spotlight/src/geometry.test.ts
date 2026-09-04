import { afterEach, expect, test } from 'vitest'

import {
  collapse,
  complementRects,
  cornerRect,
  type Cutout,
  freeCorner,
  GLIDE_PACE,
  glideDuration,
  grow,
  clipToSurface,
  hasArea,
  hasBox,
  holeImage,
  lerpCutouts,
  maskLayers,
  outset,
  padCutouts,
  type Rect,
  resolveTarget,
  resolveTargets,
  scrollDelta,
  segmentAt,
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

// --- what a target resolves to
//
// The only tests here that read a page. What sorts them into this file is the
// function they are about, and what makes them worth running in three engines
// is that the answer comes from the engine: whether an element that is not
// rendered reports no boxes, and whether a rendered one of no size still
// reports one, is layout answering rather than Leko deciding.

const mounted: Element[] = []

afterEach(() => {
  for (const el of mounted.splice(0)) el.remove()
})

/** A `div` on the page under `style`, taken away again after the test. */
const planted = (style: string, id = 'planted'): Element => {
  const el = document.createElement('div')
  el.id = id
  el.setAttribute('style', style)
  document.body.append(el)
  mounted.push(el)
  return el
}

/** A child of `parent`, which is how a hidden ancestor is put in the way. */
const within = (parent: Element, style: string, id = 'inner'): Element => {
  const el = document.createElement('div')
  el.id = id
  el.setAttribute('style', style)
  parent.append(el)
  return el
}

test('an element with no box is not found', () => {
  const el = planted('display: none')

  // Its `getBoundingClientRect` is all zeros, which unions at the corner of
  // the viewport and drags a region's hole there with it. There is nothing to
  // point at, so there is nothing to answer with.
  expect(hasBox(el)).toBe(false)
  expect(resolveTarget('#planted')).toBeNull()
  expect(resolveTarget(() => el)).toBeNull()
})

test('an element inside something hidden is not found either', () => {
  const el = within(planted('display: none'), 'width: 40px; height: 20px')

  // The element says nothing about itself: a closed tab, a collapsed panel and
  // a hidden ancestor of any other kind all come to this.
  expect(hasBox(el)).toBe(false)
  expect(resolveTarget('#inner')).toBeNull()
})

test('a wrapper that generates no box of its own is not found', () => {
  const el = planted('display: contents')
  within(el, 'width: 40px; height: 20px')

  // `display: contents` renders its children and nothing of itself, so there is
  // no box to cut a hole at even though everything inside it is on screen. A
  // step wanting that hole names what is inside the wrapper.
  expect(hasBox(el)).toBe(false)
  expect(resolveTarget('#planted')).toBeNull()
})

test('a rendered element of no size is found all the same', () => {
  const el = planted('width: 0; height: 0')

  // The case a rect cannot tell from the one above, and the reason the boxes
  // are counted rather than measured. This one has a place on the page: a hole
  // cut at it is where the viewer is looking, whatever a padding of zero would
  // leave of it.
  expect(hasBox(el)).toBe(true)
  expect(resolveTarget('#planted')).toBe(el)
})

test('an element hidden without losing its box is found', () => {
  const invisible = planted('width: 40px; height: 20px; visibility: hidden')

  // `visibility: hidden` and `opacity: 0` keep the box, so the tour points at
  // it. A hole over nothing a viewer can see is a story pointing somewhere it
  // should not, and that is the story's mistake rather than a target Leko
  // failed to find. Which of several matches a selector means is the question
  // that decides these, and it is asked elsewhere.
  expect(hasBox(invisible)).toBe(true)
  expect(resolveTarget('#planted')).toBe(invisible)
})

test('a node the document has let go of is not found', () => {
  const el = planted('width: 40px; height: 20px')
  el.remove()

  // What a function holding a reference across a re-render hands back.
  expect(resolveTarget(() => el)).toBeNull()
})

test('a region drops the elements with no box and keeps the rest', () => {
  const el = planted('width: 40px; height: 20px')
  planted('display: none', 'hidden')

  // So a region's union is the union of what is on the page. Keeping the
  // second is what dragged the hole to the corner: its rect is all zeros, so
  // the union reached from the origin of the viewport to the far edge of the
  // first.
  expect(resolveTargets(['#planted', '#hidden'])).toEqual([el])
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
  // 120 wide in a 200 port is more than half of it, and there is no message to
  // leave room for beside it — the message is placed above or below first. So
  // this one is centred, and only a box wider than the whole port keeps its
  // near edge.
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
  // Not an image the size of the surface with the hole painted into it. What an
  // engine rasterises is then the size of a target rather than the size of a
  // document, which is what makes a scrim thousands of pixels tall affordable.
  const { image, position } = maskLayers(2000, 12000, [cutout(300, 9000, 120, 60)])
  const [surface, hole] = layersOf(image)
  expect(surface).toBe('linear-gradient(black, black)')
  expect(svgOf(hole!)).toContain('width="120" height="60"')
  expect(position).toBe('0 0, 300px 9000px')
})

test('the holes union rather than alternate', () => {
  // The whole reason the scrim is masked and not clipped. Under even-odd a
  // point inside two cutouts is inside an even number of subpaths and paints
  // dark; `add` between the hole layers makes two overlapping holes one hole.
  const { composite } = maskLayers(800, 600, [cutout(0, 0, 100, 100), cutout(50, 50, 100, 100)])
  expect(composite).toBe('subtract, add, add')
})

test('a cutout with no area contributes no layer', () => {
  // A morph's collapsed leftover is not a hole, and an image with no size is
  // not something every engine has to agree about.
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

test('the browser accepts the mask we generate', () => {
  const { image, position, composite } = maskLayers(800, 600, [
    cutout(40, 40, 120, 60, 12),
    cutout(300, 200, 80, 80, 40),
  ])
  expect(CSS.supports('mask-image', image)).toBe(true)
  expect(CSS.supports('mask-position', position)).toBe(true)
  expect(CSS.supports('mask-composite', composite)).toBe(true)
})

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
const rejected = (frames: Cutout[][]) => {
  const bad: string[] = []
  for (let i = 0; i <= 40; i++) {
    const t = i / 40
    const [from, to] = frames
    const { image, position, composite } = maskLayers(1710, 952, lerpCutouts(from!, to!, t))
    if (
      !CSS.supports('mask-image', image) ||
      !CSS.supports('mask-position', position) ||
      !CSS.supports('mask-composite', composite)
    )
      bad.push(`t=${t.toFixed(2)}  ${position}  ${composite}`)
  }
  return bad
}

test('every frame of the opening morph is a value the browser accepts', () => {
  // Two holes, both starting over the whole surface — so they overlap for most
  // of the flight, which is the case the clip path could not draw at all.
  const m = 1710
  const whole = cut(-m, -m, 1710 + m * 2, 952 + m * 2, 0)
  expect(
    rejected(padCutouts([whole, whole], [cut(311, 145, 650, 42), cut(311, 206, 118, 104)])),
  ).toEqual([])
})

test('every frame between two ordinary cutouts is accepted', () => {
  expect(rejected(padCutouts([cut(311, 145, 650, 42)], [cut(311, 206, 118, 104)]))).toEqual([])
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
