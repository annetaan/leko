import { expect, test } from 'vitest'

import { type Cutout, lerpCutouts, maskLayers, padCutouts } from './geometry.js'

// Every mask value Leko writes, put to an engine. What the numbers are is
// `geometry.test.ts`'s business and needs no browser; whether the strings they
// make are strings an engine accepts is only answerable here.

test('the browser accepts the mask we generate', () => {
  const { image, position, composite } = maskLayers(800, 600, [
    cut(40, 40, 120, 60, 12),
    cut(300, 200, 80, 80, 40),
  ])
  expect(CSS.supports('mask-image', image)).toBe(true)
  expect(CSS.supports('mask-position', position)).toBe(true)
  expect(CSS.supports('mask-composite', composite)).toBe(true)
})

const cut = (x: number, y: number, w: number, h: number, r = 8): Cutout => ({
  x,
  y,
  width: w,
  height: h,
  radius: r,
  interactive: true,
})

// A value the browser rejects is not an error — assigning one to style is simply
// ignored, and the element keeps whatever it had. A morph made of rejected
// frames would look like nothing happening at all, so every frame is checked.
const rejected = (frames: Cutout[][]) => {
  const bad: string[] = []
  for (let i = 0; i <= 40; i++) {
    const t = i / 40
    const [from, to] = frames
    const { image, position, composite } = maskLayers(1710, 952, lerpCutouts(from!, to!, t))
    if (
      !CSS.supports('mask-image', image) ||
      !CSS.supports('mask-position', position) ||
      !CSS.supports('mask-composite', composite)
    )
      bad.push(`t=${t.toFixed(2)}  ${position}  ${composite}`)
  }
  return bad
}

test('every frame of the opening morph is a value the browser accepts', () => {
  // Two holes, both starting over the whole surface — so they overlap for most
  // of the flight, which is the case the clip path could not draw at all.
  const m = 1710
  const whole = cut(-m, -m, 1710 + m * 2, 952 + m * 2, 0)
  expect(
    rejected(padCutouts([whole, whole], [cut(311, 145, 650, 42), cut(311, 206, 118, 104)])),
  ).toEqual([])
})

test('every frame between two ordinary cutouts is accepted', () => {
  expect(rejected(padCutouts([cut(311, 145, 650, 42)], [cut(311, 206, 118, 104)]))).toEqual([])
})
