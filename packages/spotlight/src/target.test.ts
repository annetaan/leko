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

/**
 * One of several matches: a `div` the same selector finds, in the order it was
 * planted. `position: fixed` so that each is placed where the test says rather
 * than after the last one, which is what lets one of them be off screen.
 */
const copy = (style: string): Element => {
  const el = document.createElement('div')
  el.className = 'copy'
  el.setAttribute('style', `position: fixed; left: 0; width: 40px; height: 20px; ${style}`)
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
  expect(resolveTarget('#planted', 'first')).toBeNull()
  expect(resolveTarget(() => el, 'first')).toBeNull()
})

test('an element inside something hidden is not found either', () => {
  const el = within(planted('display: none'), 'width: 40px; height: 20px')

  // DESIGN.md, **An element with no box is not found**. Any hidden ancestor at
  // all comes to this.
  expect(hasBox(el)).toBe(false)
  expect(resolveTarget('#inner', 'first')).toBeNull()
})

test('a wrapper that generates no box of its own is not found', () => {
  const el = planted('display: contents')
  within(el, 'width: 40px; height: 20px')

  // `display: contents` renders its children and nothing of itself, so there is
  // no box to cut a hole at even though everything inside it is on screen. A
  // step wanting that hole names what is inside the wrapper.
  expect(hasBox(el)).toBe(false)
  expect(resolveTarget('#planted', 'first')).toBeNull()
})

test('a rendered element of no size is found all the same', () => {
  const el = planted('width: 0; height: 0')

  // The case a rect cannot tell from the one above, and the reason the boxes
  // are counted rather than measured. This one has a place on the page: a hole
  // cut at it is where the viewer is looking, whatever a padding of zero would
  // leave of it.
  expect(hasBox(el)).toBe(true)
  expect(resolveTarget('#planted', 'first')).toBe(el)
})

test('an element hidden without losing its box has a box, and first still finds it', () => {
  const invisible = planted('width: 40px; height: 20px; visibility: hidden')

  // `visibility: hidden` and `opacity: 0` keep the box — DESIGN.md, **An
  // element with no box is not found**. Passing over it is the mode's job.
  expect(hasBox(invisible)).toBe(true)
  expect(resolveTarget('#planted', 'first')).toBe(invisible)
})

test('a node the document has let go of is not found', () => {
  const el = planted('width: 40px; height: 20px')
  el.remove()

  // What a function holding a reference across a re-render hands back.
  expect(resolveTarget(() => el, 'first')).toBeNull()
})

test('a region drops the elements with no box and keeps the rest', () => {
  const el = planted('width: 40px; height: 20px')
  planted('display: none', 'hidden')

  // So a region's union is the union of what is on the page. Keeping the
  // second is what dragged the hole to the corner: its rect is all zeros, so
  // the union reached from the origin of the viewport to the far edge of the
  // first.
  expect(resolveTargets(['#planted', '#hidden'], 'first')).toEqual([el])
})

// --- which of several matches a selector means
//
// The engine again: whether an element is one the viewer can see is
// `checkVisibility` answering, and where its box falls is layout. DESIGN.md,
// **Which of several matches a selector means**.

test('a hidden first match is skipped for the next one under visible-first', () => {
  const invisible = copy('top: 10px; visibility: hidden')
  const faded = copy('top: 40px; opacity: 0')
  const seen = copy('top: 70px')

  // Both keep their boxes, so both are matches `hasBox` says yes to — the rule
  // is what passes over them.
  expect(hasBox(invisible)).toBe(true)
  expect(hasBox(faded)).toBe(true)
  expect(resolveTarget('.copy', 'visible-first')).toBe(seen)
})

test('a caller that wants the first match says so', () => {
  const invisible = copy('top: 10px; visibility: hidden')
  copy('top: 40px')

  expect(resolveTarget('.copy', 'first')).toBe(invisible)
})

test('a match outside the viewport is skipped under in-viewport-first', () => {
  const below = copy('top: 4000px')
  const onScreen = copy('top: 40px')

  expect(resolveTarget('.copy', 'in-viewport-first')).toBe(onScreen)
  // Visible is not the same question: the one below the fold passes that one.
  expect(resolveTarget('.copy', 'visible-first')).toBe(below)
})

test("a function's answer is filtered by the same rule", () => {
  const invisible = copy('top: 10px; visibility: hidden')

  // A function is one candidate, so the rule narrows it to none rather than
  // moving on: the host decides which element it hands back.
  expect(resolveTarget(() => invisible, 'first')).toBe(invisible)
  expect(resolveTarget(() => invisible, 'visible-first')).toBeNull()
})

test('a region applies the rule to every element it names', () => {
  const invisible = copy('top: 10px; visibility: hidden')
  const seen = copy('top: 40px')
  const other = planted('width: 40px; height: 20px', 'other')

  // Each element of a region is asked the same question. It is also the
  // regression for handing `resolveTarget` to `map`, which would pass the
  // index along as the mode.
  expect(resolveTargets(['.copy', '#other'], 'visible-first')).toEqual([seen, other])
  expect(resolveTargets(['.copy', '#other'], 'first')).toEqual([invisible, other])
})

test('nothing passing the rule is nothing found', () => {
  copy('top: 10px; visibility: hidden')
  copy('top: 40px; opacity: 0')

  // Which is the ordinary missing target: the caller waits and gives up, the
  // same way it does for a selector that matches nothing at all.
  expect(resolveTarget('.copy', 'visible-first')).toBeNull()
  expect(resolveTarget('.copy', 'in-viewport-first')).toBeNull()
})

test('visible-first passes over only a match with no box where checkVisibility is missing', () => {
  const boxless = copy('top: 0; display: none')
  const invisible = copy('top: 10px; visibility: hidden')
  const seen = copy('top: 40px')
  for (const el of [boxless, invisible, seen]) {
    Object.defineProperty(el, 'checkVisibility', { configurable: true, value: undefined })
  }

  // Every match is taken to show rather than none, the way `focus.ts`'s
  // `reachable` stands off the same method — DESIGN.md, **Browser support**.
  // It is not `first`, which stops at the boxless one.
  expect(resolveTarget('.copy', 'visible-first')).toBe(invisible)
  expect(resolveTarget('.copy', 'first')).toBeNull()
})
