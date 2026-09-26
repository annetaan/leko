import type { Hole, Rect } from './geometry.js'

// Copied from `holeImage`, `clipToSurface` and `maskLayers` in
// `packages/spotlight/src/geometry.ts` and cut down to one hole with no
// `interactive` — [The scrim rides the page](../DESIGN.md#the-scrim-rides-the-page)
// and [What comes from the spotlight](../DESIGN.md#what-comes-from-the-spotlight).

const round = (n: number): number => Math.round(n * 100) / 100

const clamp = (n: number, max: number): number => Math.min(Math.max(0, n), Math.max(0, max))

/**
 * The hole as an SVG image the size of `clip`, the on-surface part of it. The
 * rectangle keeps the hole's own size and radius at a negative offset, so an
 * edge the surface cuts through stays straight rather than rounded at the cut.
 */
export function holeImage(hole: Hole, clip: Rect = hole): string {
  const w = round(Math.max(0, hole.width))
  const h = round(Math.max(0, hole.height))
  const r = round(clamp(hole.radius, Math.min(w, h) / 2))
  const width = round(Math.max(0, clip.width))
  const height = round(Math.max(0, clip.height))
  const x = round(hole.x - clip.x)
  const y = round(hole.y - clip.y)
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="black"/></svg>`
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`
}

/**
 * The part of a hole on a `width` by `height` surface. A bound on what is
 * rasterised: a converge starts from a hole as large as the viewport, and no
 * image is ever larger than the scrim.
 */
export function clipToSurface(width: number, height: number, hole: Hole): Hole {
  const x = clamp(hole.x, width)
  const y = clamp(hole.y, height)
  return {
    ...hole,
    x,
    y,
    width: clamp(hole.x + hole.width, width) - x,
    height: clamp(hole.y + hole.height, height) - y,
  }
}

/** What the scrim writes to show its hole: one CSS value per property. */
export interface MaskLayers {
  image: string
  position: string
  composite: string
}

/**
 * The surface, with the hole subtracted from it. CSS lists mask layers top
 * first and composites them bottom up, so the surface is written first. A hole
 * with no area on the surface is no layer, and leaves the surface alone.
 */
export function maskLayers(width: number, height: number, hole: Hole | undefined): MaskLayers {
  const clip = hole && clipToSurface(width, height, hole)
  if (!hole || !clip || clip.width <= 0 || clip.height <= 0) {
    return { image: 'linear-gradient(black, black)', position: '0 0', composite: 'subtract' }
  }
  return {
    image: `linear-gradient(black, black), ${holeImage(hole, clip)}`,
    position: `0 0, ${round(clip.x)}px ${round(clip.y)}px`,
    composite: 'subtract, add',
  }
}
