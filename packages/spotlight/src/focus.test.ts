import { expect, test } from 'vitest'

import { ends, neighbour } from './focus.js'

// `neighbour` is the only decision `focus.ts` makes, and it takes numbers. The
// rest of that file is listeners and `.focus()`, which `wiring.test.ts` drives
// through a real page in a real browser.

test('forward walks the ring and wraps at the end', () => {
  expect(neighbour(3, 0, false)).toBe(1)
  expect(neighbour(3, 1, false)).toBe(2)
  expect(neighbour(3, 2, false)).toBe(0)
})

test('backward walks it the other way and wraps at the start', () => {
  expect(neighbour(3, 2, true)).toBe(1)
  expect(neighbour(3, 1, true)).toBe(0)
  expect(neighbour(3, 0, true)).toBe(2)
})

test('a ring of one sends focus back where it was', () => {
  // A step with no next control and no open region: the way out, alone. Tab
  // has nowhere else to be, which is the truth of that moment.
  expect(neighbour(1, 0, false)).toBe(0)
  expect(neighbour(1, 0, true)).toBe(0)
})

test('from nowhere, each direction lands on the end it was heading for', () => {
  // `focus.ts` says when `from` is `-1`. There is no segment to be the neighbour
  // of, so the ring is entered at the end that direction would have reached.
  expect(neighbour(3, -1, false)).toBe(0)
  expect(neighbour(3, -1, true)).toBe(2)
})

test('an empty ring has nowhere to send anything', () => {
  expect(neighbour(0, -1, false)).toBe(-1)
  expect(neighbour(0, 2, true)).toBe(-1)
})

// `ends` needs a page, so these run in the browser project with the rest.

const mounted: HTMLElement[] = []
const mount = (html: string): HTMLElement => {
  const host = document.createElement('div')
  host.innerHTML = html
  document.body.append(host)
  mounted.push(host)
  return host
}

test('the ends of a segment are the first and last places Tab would land', () => {
  const host = mount('<p>text</p><button id="a">a</button><span>x</span><a href="#" id="b">b</a>')
  const found = ends([host])!
  expect(found.first.id).toBe('a')
  expect(found.last.id).toBe('b')
  for (const el of mounted.splice(0)) el.remove()
})

test('a root that is itself focusable is its own first stop', () => {
  // The ordinary step: the target is the button, and there is nothing inside it.
  const host = mount('<button id="only">only</button>')
  const found = ends([host.firstElementChild!])!
  expect(found.first.id).toBe('only')
  expect(found.last.id).toBe('only')
  for (const el of mounted.splice(0)) el.remove()
})

test('several roots are one segment, in the order they were given', () => {
  const host = mount('<button id="one">1</button><button id="two">2</button>')
  const [one, two] = [...host.children] as HTMLElement[]
  const found = ends([one!, two!])!
  expect(found.first.id).toBe('one')
  expect(found.last.id).toBe('two')
  for (const el of mounted.splice(0)) el.remove()
})

test('a segment with nothing to focus in it has no ends', () => {
  // A message with no next control on it. It is drawn, and it is not a stop.
  const host = mount('<p>just words</p>')
  expect(ends([host])).toBeUndefined()
  for (const el of mounted.splice(0)) el.remove()
})

test('a disabled control is not a stop', () => {
  const host = mount('<button id="a" disabled>a</button><button id="b">b</button>')
  const found = ends([host])!
  expect(found.first.id).toBe('b')
  expect(found.last.id).toBe('b')
  for (const el of mounted.splice(0)) el.remove()
})

test('something display:none is not a stop', () => {
  const host = mount('<button id="a" style="display:none">a</button><button id="b">b</button>')
  const found = ends([host])!
  expect(found.first.id).toBe('b')
  for (const el of mounted.splice(0)) el.remove()
})

test('something inside a visibility:hidden box is not a stop', () => {
  // Inherited rather than set on the button, the way a hidden message hides
  // its control.
  const host = mount(
    '<div style="visibility:hidden"><button id="a">a</button></div><button id="b">b</button>',
  )
  const found = ends([host])!
  expect(found.first.id).toBe('b')
  expect(found.last.id).toBe('b')
  for (const el of mounted.splice(0)) el.remove()
})

test('something at opacity 0 is still a stop', () => {
  const host = mount('<button id="a" style="opacity:0">a</button><button id="b">b</button>')
  const found = ends([host])!
  expect(found.first.id).toBe('a')
  for (const el of mounted.splice(0)) el.remove()
})
