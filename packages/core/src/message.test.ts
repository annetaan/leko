import { afterEach, expect, test } from 'vitest'

import { createLeko } from './leko.js'
import type { LekoOptions, LekoStep } from './types.js'

// Duration 0 everywhere: these tests are about where the message ends up, not
// about how long the cutout took to get there.
const instances: ReturnType<typeof createLeko>[] = []
const mounted: HTMLElement[] = []

afterEach(() => {
  for (const leko of instances.splice(0)) leko.stop()
  for (const el of mounted.splice(0)) el.remove()
})

function start(steps: LekoStep[], options: LekoOptions = {}) {
  const leko = createLeko({ duration: 0, ...options })
  instances.push(leko)
  leko.setStory({ id: 'story', steps })
  leko.start('story')
  return leko
}

function box(text: string, style: Partial<CSSStyleDeclaration>): HTMLElement {
  const el = document.createElement('button')
  el.textContent = text
  Object.assign(el.style, { position: 'fixed', margin: '0', ...style })
  document.body.append(el)
  mounted.push(el)
  return el
}

const message = () => document.querySelector<HTMLElement>('.leko-message')
// Both options are off by default: `checkVisibility()` on its own only reports
// `display: none`, and would call a hidden, fully transparent box visible.
const visible = () =>
  message()?.checkVisibility({ visibilityProperty: true, opacityProperty: true }) === true
const rect = (el: Element) => el.getBoundingClientRect()

const overlaps = (a: DOMRect, b: DOMRect): boolean =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom

const frame = (): Promise<void> =>
  new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))

/**
 * Anchor positioning is allowed to be missing — the message docks to the foot of
 * the viewport instead of being beside the cutout. The tests that are about
 * *being beside it* say so rather than failing on a browser that degraded.
 */
const anchors = CSS.supports('anchor-name: --a') && CSS.supports('position-area: bottom center')

test('the step message is on screen, and above the scrim', () => {
  box('target', { left: '100px', top: '100px', width: '160px', height: '48px' })
  start([{ id: 'one', target: 'button', message: 'Press it.' }])

  const el = message()
  expect(el?.textContent).toBe('Press it.')

  // The scrim blocks the page on purpose, so the tour's own chrome has to be
  // above it — otherwise the message is dimmed along with what it explains.
  const r = rect(el!)
  expect(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)).toBe(el)
})

test('a step without a message shows nothing', () => {
  box('target', { left: '100px', top: '100px', width: '160px', height: '48px' })
  start([{ id: 'one', target: 'button' }])

  expect(visible()).toBe(false)
})

test.runIf(anchors)('the message clears the cutout rather than covering it', () => {
  const target = box('target', { left: '200px', top: '200px', width: '160px', height: '48px' })
  start([{ id: 'one', target, message: 'Press it.', padding: 12 }])

  const hole = rect(target)
  const note = rect(message()!)
  // Constraint 1 is about the target, and a message on top of it breaks the
  // point of cutting a hole there at all.
  expect(overlaps(note, hole)).toBe(false)
  expect(note.top).toBeGreaterThanOrEqual(hole.bottom + 12)
})

test.runIf(anchors)('the message clears every cutout, not just the one it is anchored to', () => {
  const target = box('target', { left: '200px', top: '200px', width: '160px', height: '40px' })
  const related = box('related', { left: '200px', top: '260px', width: '160px', height: '40px' })
  start([{ id: 'one', target, related: [related], message: 'Both of these.' }])

  const note = rect(message()!)
  // The anchor is the target, but the shape to stay clear of is every hole in
  // the scrim: sitting on the related one would hide half of what was explained.
  expect(overlaps(note, rect(target))).toBe(false)
  expect(overlaps(note, rect(related))).toBe(false)
})

test.runIf(anchors)('the message follows its target when a scroller moves under it', async () => {
  const scroller = document.createElement('div')
  Object.assign(scroller.style, {
    position: 'fixed',
    left: '40px',
    top: '40px',
    width: '320px',
    height: '240px',
    overflow: 'auto',
  })
  const target = document.createElement('button')
  target.textContent = 'deep'
  Object.assign(target.style, { display: 'block', margin: '600px 0' })
  scroller.append(target)
  document.body.append(scroller)
  mounted.push(scroller)

  start([{ id: 'one', target, message: 'Scroll the list.' }])
  scroller.scrollTop = 400
  await frame()

  const before = { note: rect(message()!).top, target: rect(target).top }
  scroller.scrollTop = 460
  await frame()
  const after = { note: rect(message()!).top, target: rect(target).top }

  // The point of putting the message in the top layer and anchoring it: no
  // script ran between these two reads, and it moved with the target anyway.
  expect(after.target - before.target).toBeCloseTo(-60, 0)
  expect(after.note - before.note).toBeCloseTo(after.target - before.target, 0)
})

test('setMessage replaces the words in place', () => {
  const target = box('target', { left: '100px', top: '100px', width: '160px', height: '48px' })
  const leko = start([
    {
      id: 'one',
      target,
      message: 'Type your name.',
      validate: () => false,
      onValidationError: (_el, utils) => utils.setMessage('A name, not a number.'),
    },
    { id: 'two', target },
  ])

  const before = rect(message()!)
  leko.nextStep()

  expect(message()?.textContent).toBe('A name, not a number.')
  // Failing validation does not move the step, so it must not move the message
  // out from under someone reading it.
  expect(rect(message()!).top).toBeCloseTo(before.top, 0)
})

test('a step that had no message can still be given one', async () => {
  const target = box('target', { left: '100px', top: '100px', width: '160px', height: '48px' })
  const leko = start([
    {
      id: 'one',
      target,
      validate: () => false,
      onValidationError: (_el, utils) => utils.setMessage('Not yet.'),
    },
  ])

  expect(visible()).toBe(false)
  leko.nextStep()
  // It arrives with a fade, so it is exactly transparent for the first frame.
  await frame()

  expect(visible()).toBe(true)
  expect(message()?.textContent).toBe('Not yet.')
})

test('stopping takes the message with it, and gives the target its anchor name back', () => {
  const target = box('target', { left: '100px', top: '100px', width: '160px', height: '48px' })
  target.style.setProperty('anchor-name', '--theirs')

  const leko = start([{ id: 'one', target, message: 'Press it.' }])
  leko.stop()

  expect(message()).toBeNull()
  // The target belongs to the consumer. Leko borrows a name on it and hands it
  // back rather than leaving its own behind.
  expect(target.style.getPropertyValue('anchor-name')).toBe('--theirs')
})

test('the message goes when the target does', async () => {
  const target = box('target', { left: '100px', top: '100px', width: '160px', height: '48px' })
  let lost = false
  start([{ id: 'one', target, message: 'Press it.' }], {
    // Kept running deliberately: without a handler the tour stops and the
    // message would go with it, which would prove nothing.
    onTargetLost: () => {
      lost = true
    },
  })

  target.remove()
  await frame()

  expect(lost).toBe(true)
  // An anchored element whose anchor has left the page falls back to normal
  // positioning, which would drop the message somewhere arbitrary.
  expect(visible()).toBe(false)
})
