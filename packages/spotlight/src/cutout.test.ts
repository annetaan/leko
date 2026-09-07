import { afterEach, expect, test } from 'vitest'

// These tests do not exercise Leko at all. They pin down the browser behaviours
// the whole design rests on, so that a browser or a CI image that cannot
// provide them fails here, plainly, instead of surfacing later as an
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

/**
 * A hole, the way `maskLayers` draws one: an image of the hole's own size.
 *
 * A deliberate copy of `holeImage` in `geometry.ts` (minus the clipping),
 * because this file pins browser behaviour and exercises none of Leko — see
 * the note at the top. If the mask format changes there, change it here, or
 * this pins a format nothing ships.
 */
function holeImage(w: number, h: number, r: number): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
    `<rect width="${w}" height="${h}" rx="${r}" fill="black"/></svg>`
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`
}

test('the browser composites mask layers', () => {
  // The one feature the scrim cannot be drawn without — DESIGN.md, **Drawing**,
  // for what a `clip-path` cannot draw and why a story could not open by
  // converging without this.
  expect(CSS.supports('mask-composite: subtract')).toBe(true)
  expect(CSS.supports('mask-image', `linear-gradient(black, black), ${holeImage(10, 10, 2)}`)).toBe(
    true,
  )
})

test('a mask does not remove its holes from hit-testing', () => {
  // DESIGN.md, **Every layer paints and catches nothing. Plain rectangles in the
  // gaps between the open cutouts do the blocking**. A `clip-path` took the
  // element out of hit-testing where it had no geometry, which read as a hole a
  // click fell through — but not a wheel, which is the trap
  // `spike/wheel-through-a-hole/` caught. A mask paints and nothing else, so what
  // the scrim catches is decided in one place: `pointer-events`.
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
  Object.assign(scrim.style, {
    maskImage: `linear-gradient(black, black), ${holeImage(136, 56, 12)}`,
    maskPosition: '0 0, 92px 92px',
    maskComposite: 'subtract, add',
    maskRepeat: 'no-repeat',
  })

  // Nothing was taken out of hit-testing: the scrim answers over its own hole,
  // however transparent it is there.
  expect(document.elementFromPoint(160, 120)).toBe(scrim)

  // And the element under the hole answers once the scrim stops asking to be
  // hit, which is the state Leko's scrim is always in.
  scrim.style.pointerEvents = 'none'
  expect(document.elementFromPoint(160, 120)).toBe(target)
})
