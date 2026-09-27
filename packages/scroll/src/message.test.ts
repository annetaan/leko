import { afterEach, expect, test } from 'vitest'

import type { Hole } from './geometry.js'
import { Message } from './message.js'

// The box is appended to the body here, whose containing block for an absolute
// element is the page's origin, as the scrim's root is.

const made: Message[] = []

afterEach(() => {
  for (const message of made.splice(0)) message.element.remove()
  document.documentElement.style.removeProperty('--leko-scroll-message-gap')
})

function mount(): Message {
  const message = new Message()
  document.body.append(message.element)
  made.push(message)
  return message
}

/** The box in page coordinates. */
function box(message: Message): { left: number; right: number; top: number; bottom: number } {
  const r = message.element.getBoundingClientRect()
  return {
    left: r.left + window.scrollX,
    right: r.right + window.scrollX,
    top: r.top + window.scrollY,
    bottom: r.bottom + window.scrollY,
  }
}

const near = (actual: number, expected: number): void => {
  expect(Math.abs(actual - expected)).toBeLessThan(1)
}

const content = { title: 'Title', body: 'Body' }
const hole: Hole = { x: 400, y: 1500, width: 200, height: 80, radius: 8 }
const GAP = 12

test('a message sits below the hole by default, in page coordinates', () => {
  const message = mount()
  message.show(content, hole, 'bottom', 1000)
  const b = box(message)
  near(b.top, hole.y + hole.height + GAP)
  near((b.left + b.right) / 2, hole.x + hole.width / 2)
})

test('top, left and right put the box on that side', () => {
  const message = mount()

  message.show(content, hole, 'top', 1000)
  let b = box(message)
  near(b.bottom, hole.y - GAP)
  near((b.left + b.right) / 2, hole.x + hole.width / 2)

  message.show(content, hole, 'left', 1000)
  b = box(message)
  near(b.right, hole.x - GAP)
  near((b.top + b.bottom) / 2, hole.y + hole.height / 2)

  message.show(content, hole, 'right', 1000)
  b = box(message)
  near(b.left, hole.x + hole.width + GAP)
  near((b.top + b.bottom) / 2, hole.y + hole.height / 2)
})

test('a left or right that does not fit the viewport width goes to bottom', () => {
  const message = mount()

  const atLeft: Hole = { ...hole, x: 10 }
  message.show(content, atLeft, 'left', 1000)
  let b = box(message)
  near(b.top, atLeft.y + atLeft.height + GAP)
  near((b.left + b.right) / 2, atLeft.x + atLeft.width / 2)

  const atRight: Hole = { ...hole, x: 780 }
  message.show(content, atRight, 'right', 1000)
  b = box(message)
  near(b.top, atRight.y + atRight.height + GAP)
  near((b.left + b.right) / 2, atRight.x + atRight.width / 2)
})

test('an empty title or body is left out of the layout', () => {
  const message = mount()
  const title = message.element.querySelector<HTMLElement>('.leko-scroll-message-title')
  const body = message.element.querySelector<HTMLElement>('.leko-scroll-message-body')
  if (!title || !body) throw new Error('the box has no title or body part')

  message.show({ body: 'Body' }, hole, 'bottom', 1000)
  expect(title.hidden).toBe(true)
  expect(title.offsetHeight).toBe(0)
  expect(body.offsetHeight).toBeGreaterThan(0)

  message.show({ title: 'Title', body: '' }, hole, 'bottom', 1000)
  expect(body.hidden).toBe(true)
  expect(body.offsetHeight).toBe(0)
  expect(title.offsetHeight).toBeGreaterThan(0)
})

test('the box catches no pointer events', () => {
  const message = mount()
  const onScreen: Hole = { x: 40, y: 40, width: 100, height: 40, radius: 8 }
  message.show(content, onScreen, 'bottom', window.innerWidth)
  const r = message.element.getBoundingClientRect()
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
  expect(getComputedStyle(message.element).visibility).toBe('visible')
  expect(hit).not.toBeNull()
  expect(message.element.contains(hit)).toBe(false)
})

test('show fades in and hide is a cut', () => {
  const message = mount()
  expect(message.visible).toBe(false)

  message.show(content, hole, 'bottom', 1000)
  expect(message.visible).toBe(true)
  expect(message.element.style.transition).toContain('opacity')
  expect(message.element.style.transition).toContain('150ms')
  expect(message.element.style.visibility).toBe('visible')
  expect(message.element.style.opacity).toBe('1')

  message.hide()
  expect(message.visible).toBe(false)
  expect(message.element.style.transition).toBe('')
  expect(getComputedStyle(message.element).visibility).toBe('hidden')
  expect(getComputedStyle(message.element).opacity).toBe('0')
})

test('a gap token set on the page is the clearance used, 0 and other units included', () => {
  const message = mount()
  const page = document.documentElement.style

  page.setProperty('--leko-scroll-message-gap', '0')
  message.show(content, hole, 'bottom', 1000)
  near(box(message).top, hole.y + hole.height)
  message.show(content, hole, 'right', 1000)
  near(box(message).left, hole.x + hole.width)

  page.setProperty('--leko-scroll-message-gap', '2rem')
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize)
  message.show(content, hole, 'bottom', 1000)
  near(box(message).top, hole.y + hole.height + 2 * rem)
})
