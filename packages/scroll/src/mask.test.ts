import { expect, test } from 'vitest'

import { maskLayers } from './mask.js'

/** The SVG a hole layer carries, readable again. */
const svgOf = (layer: string) =>
  decodeURIComponent(layer.replace(/^url\("data:image\/svg\+xml;utf8,|"\)$/g, ''))

const surface = { image: 'linear-gradient(black, black)', position: '0 0', composite: 'subtract' }

test('one hole is one image at its clipped place, and no hole is the surface alone', () => {
  // A hole hanging off the top of the page is trimmed to the surface, and the
  // rectangle inside the image keeps its own size at a negative offset.
  const { image, position, composite } = maskLayers(1000, 6000, {
    x: 100,
    y: -8,
    width: 200,
    height: 50,
    radius: 8,
  })
  const [first, hole] = image.split(', url(')
  expect(first).toBe('linear-gradient(black, black)')
  const svg = svgOf(`url(${hole})`)
  expect(svg).toContain('width="200" height="42">')
  expect(svg).toContain('<rect x="0" y="-8" width="200" height="50" rx="8"')
  expect(position).toBe('0 0, 100px 0px')
  expect(composite).toBe('subtract, add')

  expect(maskLayers(1000, 6000, undefined)).toStrictEqual({ ...surface, hole: undefined })
  const flat = { x: 10, y: 10, width: 0, height: 0, radius: 0 }
  expect(maskLayers(1000, 6000, flat)).toEqual({ ...surface, hole: flat })
  const below = { x: 10, y: 7000, width: 100, height: 50, radius: 8 }
  expect(maskLayers(1000, 6000, below)).toEqual({ ...surface, hole: below })
})

test('the hole is cut on whole pixels and handed back as cut, its radius kept', () => {
  const why = maskLayers(1280, 6000, {
    x: 629.265625,
    y: 1206.734375,
    width: 539.921875,
    height: 287.578125,
    radius: 16,
  })
  expect(why.hole).toEqual({ x: 629, y: 1207, width: 540, height: 287, radius: 16 })
  expect(why.position).toBe('0 0, 629px 1207px')
  expect(svgOf(`url(${why.image.split(', url(')[1]}`)).toContain('width="540" height="287">')

  const copy = maskLayers(1280, 6000, {
    x: 110.796875,
    y: 912,
    width: 473.671875,
    height: 294.734375,
    radius: 16,
  })
  expect(copy.hole).toEqual({ x: 111, y: 912, width: 473, height: 295, radius: 16 })

  const whole = { x: 100, y: 500, width: 300, height: 120, radius: 8 }
  expect(maskLayers(1280, 6000, whole).hole).toEqual(whole)
})
