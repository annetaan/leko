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

  expect(maskLayers(1000, 6000, undefined)).toEqual(surface)
  expect(maskLayers(1000, 6000, { x: 10, y: 10, width: 0, height: 0, radius: 0 })).toEqual(surface)
  expect(maskLayers(1000, 6000, { x: 10, y: 7000, width: 100, height: 50, radius: 8 })).toEqual(
    surface,
  )
})
