import { afterEach, expect, test } from 'vitest'

import { hasBox, resolveTarget, resolveTargets } from './target.js'

// What makes these worth running in three engines is that the answer comes
// from the engine: whether an element that is not rendered reports no boxes,
// and whether a rendered one of no size still reports one, is layout answering
// rather than Leko deciding.

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

  // DESIGN.md, **An element with no box is not found**. Any hidden ancestor at
  // all comes to this.
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
  // it — DESIGN.md, **An element with no box is not found**.
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
