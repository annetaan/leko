import { afterEach, expect, test } from 'vitest'

import { Scrim } from './scrim.js'

// The scrim's own promises, tested through the styles it writes. What the
// mask looks like is geometry.test.ts's business; what is pinned here is that
// the right number of holes is on screen at the moments that matter.

const scrims: Scrim[] = []

afterEach(() => {
  for (const scrim of scrims.splice(0)) scrim.destroy()
})

function mountScrim(): Scrim {
  const made = new Scrim({ kind: 'document' })
  scrims.push(made)
  return made
}

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
