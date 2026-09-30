import { afterEach, expect, test } from 'vitest'

import { Message } from './message.js'
import { MESSAGE_ANCHOR } from './scrim.js'

// The box on its own, where a test needs something the tour never arranges on
// purpose: a marker still on the page when the box is docked.

const made: { remove(): void }[] = []

afterEach(() => {
  for (const el of made.splice(0)) el.remove()
  document.documentElement.dir = ''
})

const anchors =
  CSS.supports('anchor-name: --a') &&
  CSS.supports('top: anchor(bottom)') &&
  CSS.supports('justify-self: anchor-center')

const content = { text: 'Nothing to point at.', error: undefined, next: undefined }

test.runIf(anchors)('a docked box keeps nothing of the side it was held on', () => {
  // Right to left, where `right` wins over `left` for a box with both: an inset
  // the held side left behind would take the docked box off the screen.
  const root = document.documentElement
  root.dir = 'rtl'
  const room = { x: 0, y: 0, width: root.clientWidth, height: root.clientHeight }

  const marker = document.createElement('div')
  Object.assign(marker.style, { position: 'fixed', width: '0', height: '0' })
  marker.style.setProperty('anchor-name', MESSAGE_ANCHOR)
  document.body.append(marker)
  made.push(marker)

  const message = new Message(() => {})
  made.push({ remove: () => message.destroy() })

  // Against the right edge and nearly the room's height, so the only side with
  // room is the left, which is held with `right: anchor(left)`.
  const hole = { x: room.width - 120, y: 20, width: 100, height: room.height - 40 }
  message.show(content, [hole], 8, room, () => {
    Object.assign(marker.style, { left: `${hole.x}px`, top: `${hole.y + hole.height / 2}px` })
  })
  expect(message.element.style.right).toBe('anchor(left)')

  message.show(content, [], 8, room)

  const note = message.element.getBoundingClientRect()
  expect(Math.abs(note.left + note.width / 2 - room.width / 2)).toBeLessThan(1)
  expect(Math.abs(note.bottom - (room.height - 24))).toBeLessThan(1)
})

// `keep`, on its own: the side judged again from boxes it is handed, with the
// size the words last left and the room the draw read.

const tall = { x: 0, y: 0, width: 400, height: 800 }
const GAP = 8

/**
 * A box the tour would make, with the sides `at` was told kept for the test to
 * read.
 */
const keeper = () => {
  const message = new Message(() => {})
  made.push({ remove: () => message.destroy() })
  const told: string[] = []
  const at = (side: string) => {
    told.push(side)
  }
  return { message, told, at }
}

const row = (y: number) => ({ x: 100, y, width: 200, height: 40 })

test.runIf(anchors)('keep moves the box to the first side with room once its own has none', () => {
  const { message, told, at } = keeper()
  message.show(content, [row(100)], GAP, tall, at)
  expect(told).toEqual(['bottom'])

  message.keep([row(tall.height - 40)])
  expect(message.element.style.bottom).toBe('anchor(top)')
  expect(message.element.style.top).toBe('auto')
  expect(told).toEqual(['bottom', 'top'])
})

test.runIf(anchors)('keep leaves a side that still has room', () => {
  const { message, told, at } = keeper()
  // 40px under the row, so the draw puts it on top.
  message.show(content, [row(tall.height - 80)], GAP, tall, at)
  expect(told).toEqual(['top'])

  // Now both sides fit, and bottom comes first in the default order: the side
  // it has is kept anyway.
  message.keep([row(tall.height / 2)])
  expect(message.element.style.bottom).toBe('anchor(top)')
  expect(told).toEqual(['top'])
})

test.runIf(anchors)('keep judges room at the height the words have now', () => {
  const { message, told, at } = keeper()
  message.show(content, [row(100)], GAP, tall, at)
  const oneLine = message.element.offsetHeight

  // Exactly enough under the row for the box as it is.
  const hole = row(tall.height - oneLine - GAP - 40)
  message.show(content, [hole], GAP, tall, at)
  expect(told.at(-1)).toBe('bottom')

  // Several lines of error on the next attempt, with the hole where it was.
  message.setError('That did not work. Check the fields marked in red, then try once more.')
  expect(message.element.offsetHeight).toBeGreaterThan(oneLine)

  message.keep([hole])
  expect(told.at(-1)).toBe('top')
})

test.runIf(anchors)('keep does nothing for a docked or hidden box', () => {
  const { message, told, at } = keeper()
  message.show(content, [], GAP, tall, at)
  const docked = message.element.style.cssText
  message.keep([row(tall.height - 40)])
  expect(message.element.style.cssText).toBe(docked)
  expect(told).toEqual([])

  message.show(content, [row(100)], GAP, tall, at)
  message.hide()
  const hidden = message.element.style.cssText
  message.keep([row(tall.height - 40)])
  expect(message.element.style.cssText).toBe(hidden)
  expect(told).toEqual(['bottom'])
})

// The box is measured before the new side is written, under the one the last
// step held. `width: max-content` is what keeps that from mattering: without
// it, a held `left: anchor(right)` shrinks the box to the space beside the old
// marker, and every engine here then chooses `top`.
test.runIf(anchors)('a box is measured free of the side the last step held', () => {
  const root = document.documentElement
  const room = { x: 0, y: 0, width: root.clientWidth, height: root.clientHeight }

  const marker = document.createElement('div')
  Object.assign(marker.style, { position: 'fixed', width: '0', height: '0' })
  marker.style.setProperty('anchor-name', MESSAGE_ANCHOR)
  document.body.append(marker)
  made.push(marker)
  let hole = row(100)
  const told: string[] = []
  const at = (side: string) => {
    told.push(side)
    const x = side === 'right' ? hole.x + hole.width : hole.x + hole.width / 2
    const y = side === 'bottom' ? hole.y + hole.height : hole.y + hole.height / 2
    Object.assign(marker.style, { left: `${x}px`, top: `${y}px` })
  }

  const message = new Message(() => {})
  made.push({ remove: () => message.destroy() })
  const long = {
    text: 'Press the button to save the order, then wait for it to be confirmed.',
    error: undefined,
    next: undefined,
  }
  message.show(long, [hole], GAP, room, at)
  const free = message.element.offsetHeight

  // Nearly the room's height and 200px short of its right edge: the short
  // words fit only on the right, and the marker is left 200px from the edge.
  hole = { x: 0, y: 20, width: room.width - 200, height: room.height - 40 }
  message.show(content, [hole], GAP, room, at)
  expect(told.at(-1)).toBe('right')

  // Exactly enough under the row for the long words at their own width, and
  // not for them squeezed into the 200px the last step's side leaves.
  hole = row(room.height - free - GAP - 40)
  message.show(long, [hole], GAP, room, at)
  expect(told.at(-1)).toBe('bottom')
})
