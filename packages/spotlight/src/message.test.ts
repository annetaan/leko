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
