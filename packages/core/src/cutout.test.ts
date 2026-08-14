import { afterEach, expect, test } from 'vitest'

// These tests do not exercise Leko at all. They pin down the two browser
// behaviours the whole design rests on, so that a browser or a CI image that
// cannot provide them fails here, plainly, instead of surfacing later as an
// inexplicable rendering bug.

const cleanup: HTMLElement[] = []

afterEach(() => {
  for (const el of cleanup.splice(0)) el.remove()
})

function mount<T extends HTMLElement>(el: T, style: Partial<CSSStyleDeclaration>): T {
  Object.assign(el.style, style)
  document.body.append(el)
  cleanup.push(el)
  return el
}

function roundedRect(x: number, y: number, w: number, h: number, r: number): string {
  return (
    `M${x + r} ${y} H${x + w - r} A${r} ${r} 0 0 1 ${x + w} ${y + r}` +
    ` V${y + h - r} A${r} ${r} 0 0 1 ${x + w - r} ${y + h}` +
    ` H${x + r} A${r} ${r} 0 0 1 ${x} ${y + h - r}` +
    ` V${y + r} A${r} ${r} 0 0 1 ${x + r} ${y} Z`
  )
}

test('the browser supports an even-odd path clip', () => {
  expect(CSS.supports('clip-path: path(evenodd, "M0 0 H10 V10 Z")')).toBe(true)
})

test('an even-odd cutout removes its region from hit-testing', () => {
  const target = mount(document.createElement('button'), {
    position: 'fixed',
    left: '100px',
    top: '100px',
    width: '120px',
    height: '40px',
  })

  const scrim = mount(document.createElement('div'), {
    position: 'fixed',
    inset: '0',
    background: 'rgba(0, 0, 0, 0.7)',
  })
  const { innerWidth: w, innerHeight: h } = window
  scrim.style.clipPath = `path(evenodd, "M0 0 H${w} V${h} H0 Z ${roundedRect(92, 92, 136, 56, 12)}")`

  // Inside the cutout the scrim is not merely transparent — no geometry exists
  // there — so the target receives the hit.
  expect(document.elementFromPoint(160, 120)).toBe(target)

  // Everywhere else the scrim still absorbs it, which is what keeps a tour from
  // being clicked past.
  expect(document.elementFromPoint(400, 400)).toBe(scrim)
})
