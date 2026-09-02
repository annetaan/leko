import { afterEach, expect, test } from 'vitest'

import { type Surface, surfaceChain } from './scrim.js'

// Which surfaces carry a target, read the way the presenter reads them. In
// three engines, because what an ancestor does to a fixed element is a claim
// about browsers — `spike/fixed-under-an-ancestor/` is the page, and this is
// the same question asked of the function that has to answer it.

const mounted: Element[] = []

afterEach(() => {
  for (const el of mounted.splice(0)) el.remove()
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
