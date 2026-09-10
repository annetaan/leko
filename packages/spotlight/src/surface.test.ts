import { afterEach, expect, test } from 'vitest'

import { originOf, rectWithin, sameSurface, type Surface, surfaceChain } from './surface.js'

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
  chain.map((s) =>
    s.kind === 'scroller' || s.kind === 'glued' ? `${s.kind} ${s.element.id}` : s.kind,
  )

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

  // The padding box, and moved by the scroll, for the reason {@link atOrigin}
  // gives. Border and padding are odd numbers so that a version reading one for
  // the other could not pass, and the offsets are fractions so that one rounding
  // them could not either.
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

// --- which state a sticky target is in
//
// The two a sticky element has, read at the draw — DESIGN.md, **A sticky
// target is drawn in the state it is in, and there are two**. In three engines
// because the used inset and the box are both the engine's answer, and
// `spike/a-sticky-target-pinning/` is the page that settled which reading to
// take.

/**
 * A sticky bar in the page, with `above` px of its containing block over it and
 * `below` under it, and enough after the block that the page can scroll past
 * the end of it.
 */
function stickyInPage(above: number, below: number): HTMLElement {
  const block = make({ position: 'relative', height: 'auto' })
  make({ height: `${above}px` }, block)
  const bar = make({ position: 'sticky', top: '0', height: '40px' }, block)
  make({ height: `${below}px` }, block)
  make({ height: '2000px' })
  return bar
}

/** Where the page has to stand for `bar` to be sitting on its `top: 0`. */
const pinsAt = (bar: Element): number => bar.getBoundingClientRect().top + window.scrollY

test('a sticky target riding the page is carried by the document', () => {
  const bar = stickyInPage(600, 1200)
  expect(named(surfaceChain(bar))).toEqual(['document'])
})

test('a sticky target pinned to the page is carried by the viewport', () => {
  const bar = stickyInPage(600, 1200)
  window.scrollTo(0, pinsAt(bar) + 200)
  // The document's scrollport is the viewport, so pinned in the page is the
  // layer a fixed target already gets.
  expect(named(surfaceChain(bar))).toEqual(['viewport'])
})

test('a control inside a pinned bar is carried by the viewport too', () => {
  // The question is asked of every ancestor, the way it is for a fixed
  // toolbar: what a step points at is a button in the bar, not the bar.
  const bar = stickyInPage(600, 1200)
  const button = make({}, bar)
  window.scrollTo(0, pinsAt(bar) + 200)
  expect(named(surfaceChain(button))).toEqual(['viewport'])
})

test('a sticky target past the end of its containing block rides again', () => {
  // Displaced by the whole block and moving with the page — the state the
  // `position: static` probe answers as pinned, in every engine.
  const bar = stickyInPage(600, 200)
  window.scrollTo(0, pinsAt(bar) + 400)
  expect(bar.getBoundingClientRect().top).toBeLessThan(0)
  expect(named(surfaceChain(bar))).toEqual(['document'])
})

/** A sticky head in a panel, with `above` px of its containing block over it and `below` under it. */
function stickyInPanel(above: number, below: number): HTMLElement {
  const panel = make({ height: '200px', overflow: 'auto', position: 'relative' })
  panel.id = 'panel'
  const block = make({ position: 'relative', height: 'auto' }, panel)
  make({ height: `${above}px` }, block)
  const head = make({ position: 'sticky', top: '0', height: '30px' }, block)
  make({ height: `${below}px` }, block)
  make({ height: '1000px' }, panel)
  return head
}

test('a sticky target riding inside a scroller has the scroller, then the document', () => {
  const head = stickyInPanel(300, 800)
  expect(named(surfaceChain(head))).toEqual(['scroller panel', 'document'])
})

test('a sticky target pinned inside a scroller is glued to its scrollport', () => {
  const head = stickyInPanel(300, 800)
  const panel = head.parentElement!.parentElement!
  panel.scrollTop = 500
  // The document stays: a glued layer lives in the panel, and the page
  // scrolling still carries the panel.
  expect(named(surfaceChain(head))).toEqual(['glued panel', 'document'])
})

test('a sticky target past the end of its block inside a scroller rides again', () => {
  const head = stickyInPanel(300, 100)
  const panel = head.parentElement!.parentElement!
  panel.scrollTop = 600
  expect(named(surfaceChain(head))).toEqual(['scroller panel', 'document'])
})

test('a glued surface begins at the scrollport, whatever the scroller is scrolled to', () => {
  const panel = make({
    position: 'relative',
    width: '200px',
    height: '120px',
    overflow: 'auto',
    border: '7px solid black',
    padding: '11px',
  })
  make({ width: '900px', height: '900px' }, panel)
  const glued: Surface = { kind: 'glued', element: panel }
  const port = (): { x: number; y: number } => {
    const r = panel.getBoundingClientRect()
    return { x: r.left + panel.clientLeft, y: r.top + panel.clientTop }
  }

  // The padding box on screen, and no part of the scroll — which is the whole
  // of what separates a glued layer from one riding the scroller's content.
  expect(originOf(glued)).toEqual(originOf({ kind: 'scroller', element: panel }))
  panel.scrollLeft = 60
  panel.scrollTop = 90
  const origin = originOf(glued)
  expect(origin.x).toBeCloseTo(port().x, 2)
  expect(origin.y).toBeCloseTo(port().y, 2)
})

test('two glued surfaces are the same one only when they name the same scroller', () => {
  // What tells `stack` in `presenter.ts` to build the layers again. Comparing
  // the kind alone would let a step pinned in one panel keep the layer mounted
  // in another, and the hole would stay in the first panel's scrollport.
  const one = make({})
  const two = make({})
  expect(sameSurface({ kind: 'glued', element: one }, { kind: 'glued', element: one })).toBe(true)
  expect(sameSurface({ kind: 'glued', element: one }, { kind: 'glued', element: two })).toBe(false)
  // And the two kinds a scroller can carry are not each other: the same panel
  // riding its content and held against its port are different layers.
  expect(sameSurface({ kind: 'glued', element: one }, { kind: 'scroller', element: one })).toBe(
    false,
  )
  expect(sameSurface({ kind: 'viewport' }, { kind: 'document' })).toBe(false)
  expect(sameSurface({ kind: 'viewport' }, { kind: 'viewport' })).toBe(true)
})
