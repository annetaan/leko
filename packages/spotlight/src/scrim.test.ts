import { afterEach, expect, test } from 'vitest'

import { Scrim } from './scrim.js'
import type { Surface } from './surface.js'

// The scrim's own promises, tested through the styles it writes. What the
// mask looks like is geometry.test.ts's business; what is pinned here is that
// the right number of holes is on screen at the moments that matter.

const scrims: Scrim[] = []

afterEach(() => {
  for (const scrim of scrims.splice(0)) scrim.destroy()
  for (const restore of gutters.splice(0)) restore()
})

function mountScrim(surface: Surface = { kind: 'document' }): Scrim {
  const made = new Scrim(surface)
  scrims.push(made)
  return made
}

/**
 * Stage a document scrollbar of `width`, which is a `clientWidth` that far
 * short of `innerWidth`. jsdom reports the same number for both, so there is no
 * gutter to be wrong about unless one is put there.
 */
function withGutter(width: number): void {
  Object.defineProperty(document.documentElement, 'clientWidth', {
    configurable: true,
    get: () => window.innerWidth - width,
  })
  Object.defineProperty(document.documentElement, 'clientHeight', {
    configurable: true,
    get: () => window.innerHeight - width,
  })
  gutters.push(() => {
    delete (document.documentElement as unknown as { clientWidth?: number }).clientWidth
    delete (document.documentElement as unknown as { clientHeight?: number }).clientHeight
  })
}

const gutters: (() => void)[] = []

/** How many hole layers the mask carries, read the way `harness.ts` reads it. */
const holes = (scrim: Scrim): number => scrim.element.style.maskImage.split('url(').length - 1

test('an opening cuts one stretched hole per destination hole', () => {
  const scrim = mountScrim()
  scrim.converge([
    { x: 100, y: 100, width: 120, height: 40, radius: 8, interactive: true },
    { x: 100, y: 300, width: 120, height: 40, radius: 8, interactive: false },
  ])
  expect(holes(scrim)).toBe(2)
})

test('a story that opens onto no holes still converges rather than snapping dark', () => {
  // A first step that waits — no target, only `awaits` — heads for no holes at
  // all. The opening still starts from one stretched cutout, which the morph
  // that follows collapses, so the dark closes in instead of the page going
  // fully dimmed in a single frame.
  const scrim = mountScrim()
  scrim.converge([])
  expect(holes(scrim)).toBe(1)
})

test('the viewport layer covers the scrollbar gutter rather than the layout viewport', () => {
  // The layout viewport is where a fixed box is laid out, and it is the wrong
  // number to size this layer by: it moves when the scrollbar comes and goes,
  // and nothing tells the layer when that happens. Sized past it, the layer
  // covers the gutter at every scrollbar state it might be measured in, and
  // `spike/the-scrollbar-gutter/` is why that is safe to do.
  withGutter(15)
  const scrim = mountScrim({ kind: 'viewport' })
  expect(document.documentElement.clientWidth).toBe(window.innerWidth - 15)
  expect(scrim.element.style.width).toBe(`${window.innerWidth}px`)
  expect(scrim.element.style.height).toBe(`${window.innerHeight}px`)
})

test('the gutter going mid-step leaves the viewport layer covering everything', () => {
  // The application shortens the page under the tour — a filter empties a list,
  // a panel collapses — so the document scrollbar goes and the layout viewport
  // grows by its width. No `resize` event fires for that, so the layer is never
  // told; it is only right because the number it was measured with did not
  // depend on the scrollbar in the first place.
  withGutter(15)
  const scrim = mountScrim({ kind: 'viewport' })
  const drawn = scrim.element.style.width
  gutters.splice(0).forEach((restore) => restore())
  expect(document.documentElement.clientWidth).toBe(window.innerWidth)
  expect(scrim.element.style.width).toBe(drawn)
  expect(scrim.element.style.width).toBe(`${document.documentElement.clientWidth}px`)
})
