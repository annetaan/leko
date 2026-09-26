import { afterEach, expect, test } from 'vitest'

import { boxOf, readPage, resolve } from './page.js'

const mounted: HTMLElement[] = []
const bodyStyle = document.body.style.cssText

afterEach(() => {
  for (const el of mounted.splice(0)) el.remove()
  document.body.style.cssText = bodyStyle
  window.scrollTo(0, 0)
})

function add(
  style: Partial<CSSStyleDeclaration>,
  parent: HTMLElement = document.body,
): HTMLElement {
  const el = document.createElement('div')
  Object.assign(el.style, style)
  parent.append(el)
  if (parent === document.body) mounted.push(el)
  return el
}

const scrolled = (y: number): Promise<void> =>
  new Promise((done) => {
    window.addEventListener('scroll', () => done(), { once: true })
    window.scrollTo(0, y)
  })

/**
 * Within half a pixel. Firefox has been seen to land `scrollTo(0, 500)` at
 * 500.27, and every read here carries the fraction.
 */
function near(actual: number | object, expected: number | Record<string, number>): void {
  if (typeof expected === 'number') {
    expect(actual).toBeCloseTo(expected, 0)
    return
  }
  expect(Object.keys(actual)).toHaveLength(Object.keys(expected).length)
  for (const [key, value] of Object.entries(expected)) {
    expect((actual as Record<string, number>)[key]).toBeCloseTo(value, 0)
  }
}

test('a selector resolves to its first match that has a box', () => {
  const hidden = add({ display: 'none' })
  const shown = add({ height: '10px' })
  const later = add({ height: '10px' })
  for (const el of [hidden, shown, later]) el.className = 'twin'
  expect(resolve('.twin')).toBe(shown)
  expect(resolve('.nothing-is-called-this')).toBeUndefined()
})

test('an element that is not connected or has no box is not found', () => {
  const loose = document.createElement('div')
  loose.style.height = '10px'
  expect(resolve(loose)).toBeUndefined()

  const inside = add({ height: '10px' }, add({ display: 'none' }))
  expect(resolve(inside)).toBeUndefined()

  const empty = add({ height: '0' })
  expect(resolve(empty)).toBe(empty)
})

test('a box is read in page coordinates and the origin is where the root sits', async () => {
  add({ position: 'absolute', left: '0', top: '0', width: '10px', height: '4000px' })
  const target = add({
    position: 'absolute',
    left: '120px',
    top: '1000px',
    width: '200px',
    height: '50px',
  })
  const root = add({ position: 'absolute', left: '0', top: '0' })
  await scrolled(500)

  const page = readPage(root)
  near(page.scrollY, 500)
  near(page.origin, { x: 0, y: 0 })
  expect(page.viewportWidth).toBe(document.documentElement.clientWidth)
  expect(page.viewportHeight).toBe(document.documentElement.clientHeight)
  expect(page.pageHeight).toBeGreaterThanOrEqual(4000)
  near(boxOf(target, page), { x: 120, y: 1000, width: 200, height: 50 })

  // A positioned body is the containing block of everything absolute in it,
  // the root included.
  Object.assign(document.body.style, { position: 'relative', margin: '60px 0 0 30px' })
  const moved = readPage(root)
  near(moved.origin, { x: 30, y: 60 })
  near(boxOf(target, moved), { x: 150, y: 1060, width: 200, height: 50 })
})
