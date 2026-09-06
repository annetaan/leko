import { afterEach, expect, test } from 'vitest'

import { originOf, rectWithin, type Surface, surfaceChain } from './surface.js'

// Which surfaces carry a target, read the way the presenter reads them. In
// three engines, because what an ancestor does to a fixed element is a claim
// about browsers — `spike/fixed-under-an-ancestor/` is the page, and this is
// the same question asked of the function that has to answer it.

const mounted: Element[] = []

afterEach(() => {
  for (const el of mounted.splice(0)) el.remove()
  // The tests below scroll the page to ask where a scrolled document's space
  // begins, and the next test is entitled to a page at the top.
  window.scrollTo(0, 0)
})

function make(style: Partial<CSSStyleDeclaration>, parent: Element = document.body): HTMLElement {
  const el = document.createElement('div')
  Object.assign(el.style, { width: '40px', height: '40px', ...style })
  parent.append(el)
  if (parent === document.body) mounted.push(el)
  return el
}

/** A box that scrolls, with more inside it than it shows. */
function scroller(style: Partial<CSSStyleDeclaration> = {}): HTMLElement {
  const box = make({ height: '120px', overflow: 'auto', ...style })
  make({ height: '900px' }, box)
  return box
}

/** A chain as the words a reader would use for it. */
const named = (chain: Surface[]): string[] =>
  chain.map((s) => (s.kind === 'scroller' ? `scroller ${s.element.id}` : s.kind))

test('an element in the flow is carried by the document', () => {
  expect(named(surfaceChain(make({})))).toEqual(['document'])
})

test('a fixed element is carried by the viewport and nothing else', () => {
  expect(named(surfaceChain(make({ position: 'fixed', top: '10px' })))).toEqual(['viewport'])
})

test('a button inside a fixed toolbar is carried by the viewport too', () => {
  const bar = make({ position: 'fixed', top: '0', left: '0', width: '300px' })
  const button = make({}, bar)
  expect(named(surfaceChain(button))).toEqual(['viewport'])
})

test('a scroller a fixed element is written inside does not carry it', () => {
  // The scroller's content moves under it and it stays where it is. The
  // layer has to be the viewport's, not the scroller's.
  const box = scroller()
  const held = make({ position: 'fixed', top: '10px' }, box)
  expect(named(surfaceChain(held))).toEqual(['viewport'])
})

test('a transformed ancestor takes a fixed element back into the flow', () => {
  const wrap = make({ transform: 'translateX(0)' })
  const taken = make({ position: 'fixed', top: '0' }, wrap)
  expect(named(surfaceChain(taken))).toEqual(['document'])
})

test('a target inside a fixed scroller has the scroller, then the viewport', () => {
  const box = scroller({ position: 'fixed', top: '10px', left: '10px' })
  box.id = 'rail'
  const target = make({}, box.firstElementChild!)
  expect(named(surfaceChain(target))).toEqual(['scroller rail', 'viewport'])
})

test('a fixed element under a transformed scroller rides that scroller', () => {
  // The transform makes the scroller its containing block, and it then
  // behaves as an absolutely positioned child: the scroller carries it.
  const box = scroller({ transform: 'translateX(0)' })
  box.id = 'panel'
  const rider = make({ position: 'fixed', top: '10px' }, box)
  expect(named(surfaceChain(rider))).toEqual(['scroller panel', 'document'])
})

// --- where a surface's space begins
//
// The other half of what a surface is. `surfaceChain` says which of them carry
// a target; this says where each one's coordinates start, which is what lets a
// box read once against the viewport stand for the same box in a layer's own
// space.
//
// **Every expectation here comes from the page, never from `originOf` itself.**
// A marker is laid at the origin of the space in question — a box absolutely
// positioned at `0, 0`, which the engine lays out from exactly the point that
// space starts at — and both what the origin is and where a box in that space
// lands are read off it. A round trip would prove nothing: `rectWithin` is
// `shift(screen, -originOf(surface))`, so shifting its answer back by the same
// origin returns the box on screen whatever `originOf` said, and a sign wrong
// in it passes.
//
// In three engines for the same reason as everything above: the answer comes
// from the engine, and a scroller's border and its scroll offset are exactly
// the sort of thing one of them rounds differently.

/**
 * A one-pixel marker at the origin of the space `parent` carries.
 *
 * An absolutely positioned child begins at its containing block's padding box
 * and rides that box's scroll, which is the whole of what a scrim's surface is
 * — so where the engine puts this is where the space starts.
 */
function atOrigin(parent: Element): HTMLElement {
  const el = document.createElement('div')
  Object.assign(el.style, {
    position: 'absolute',
    left: '0',
    top: '0',
    width: '1px',
    height: '1px',
  })
  parent.append(el)
  return el
}

/** Where the surface says its space begins, against where the page put a marker there. */
function beginsAt(surface: Surface, marker: Element): void {
  const origin = originOf(surface)
  const r = marker.getBoundingClientRect()
  expect(origin.x).toBeCloseTo(r.left, 2)
  expect(origin.y).toBeCloseTo(r.top, 2)
}

/**
 * A box measured in the surface's space, against how far the page has put it
 * from a marker at the origin of that space.
 *
 * The expectation goes nowhere near `originOf`, so an origin off by a border or
 * a scroll offset — or one with the sign the wrong way round — lands here.
 */
function placedAt(el: Element, surface: Surface, marker: Element): void {
  const within = rectWithin(el, surface)
  const r = el.getBoundingClientRect()
  const o = marker.getBoundingClientRect()
  expect(within.x).toBeCloseTo(r.left - o.left, 2)
  expect(within.y).toBeCloseTo(r.top - o.top, 2)
  expect(within.width).toBeCloseTo(r.width, 2)
  expect(within.height).toBeCloseTo(r.height, 2)
}

test("the viewport's space begins at the viewport's origin", () => {
  const marker = make({ position: 'fixed', left: '0', top: '0', width: '1px', height: '1px' })
  const fixed = make({ position: 'fixed', left: '30.5px', top: '50.25px' })

  // Bit for bit, which is what makes a fixed target the cheap case: the two
  // spaces are the same one, and moving between them changes nothing.
  expect(originOf({ kind: 'viewport' })).toEqual({ x: 0, y: 0 })
  beginsAt({ kind: 'viewport' }, marker)
  placedAt(fixed, { kind: 'viewport' }, marker)
})

test("a scrolled document's space begins where the scroll left it", () => {
  make({ width: '3000px', height: '3000px' })
  const marker = mounted[mounted.push(atOrigin(document.body)) - 1]!
  const flowing = make({ position: 'absolute', left: '140.5px', top: '620.25px' })
  window.scrollTo(120, 400)

  // An absolutely positioned box at `0, 0` is laid out from the initial
  // containing block, which is the document's own origin — so where the page
  // has put it is where the space starts, whatever the body's margin is.
  beginsAt({ kind: 'document' }, marker)
  placedAt(flowing, { kind: 'document' }, marker)
})

test("a scroller's space begins inside its border, where its scroll left it", () => {
  const panel = make({
    position: 'relative',
    width: '200px',
    height: '120px',
    overflow: 'auto',
    border: '7px solid black',
    padding: '11px',
  })
  make({ width: '900px', height: '900px' }, panel)
  const marker = atOrigin(panel)
  const deep = make({ position: 'absolute', left: '90.5px', top: '410.25px' }, panel)
  panel.scrollLeft = 60
  panel.scrollTop = 90

  // The padding box, because that is where an absolutely positioned child of
  // the scroller begins — and moved by the scroll, because such a child rides
  // the content. Border and padding are odd numbers so that a version reading
  // one for the other could not pass, and the offsets are fractions so that one
  // rounding them could not either.
  beginsAt({ kind: 'scroller', element: panel }, marker)
  placedAt(deep, { kind: 'scroller', element: panel }, marker)
})

test('a scroller inside a scroller has a space of its own, and it begins the same way', () => {
  const outer = make({
    position: 'relative',
    width: '260px',
    height: '180px',
    overflow: 'auto',
    border: '5px solid black',
    padding: '9px',
  })
  const content = make({ position: 'relative', width: '900px', height: '1400px' }, outer)
  const inner = make(
    {
      position: 'absolute',
      left: '120.5px',
      top: '380.25px',
      width: '160px',
      height: '110px',
      overflow: 'auto',
      border: '3px solid black',
      padding: '4px',
    },
    content,
  )
  make({ width: '700px', height: '900px' }, inner)
  const marker = atOrigin(inner)
  const deep = make({ position: 'absolute', left: '60.25px', top: '300.5px' }, inner)
  outer.scrollLeft = 55
  outer.scrollTop = 210
  inner.scrollLeft = 33
  inner.scrollTop = 260

  // The inner panel's own space, with nothing of the outer one in it: a layer
  // mounted inside it is laid out from its padding box however far the panel
  // around it has been scrolled, which is the reason the layers are nested at
  // all. Both scrollers are scrolled here so that a version reaching for the
  // wrong one of them has somewhere to go wrong.
  beginsAt({ kind: 'scroller', element: inner }, marker)
  placedAt(deep, { kind: 'scroller', element: inner }, marker)
})
