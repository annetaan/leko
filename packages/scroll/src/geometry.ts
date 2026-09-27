import type { LekoScrollLit, LekoScrollOptions } from './types.js'

// Numbers in, numbers out. Everything here is in page coordinates, measured by
// the shell and kept, so a scroll runs none of it against the layout —
// [Measuring](../DESIGN.md#measuring).

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** The hole in the scrim: a target's border box grown by its padding. */
export interface Hole extends Rect {
  radius: number
}

/**
 * What the shell measured. `boxes` is by index in `targets`, `undefined` where
 * a target was not found, and `off` beside it says which entries are markers.
 */
export interface Layout {
  viewportHeight: number
  pageHeight: number
  boxes: readonly (Rect | undefined)[]
  off: readonly boolean[]
}

export interface Tuning {
  line: number
  fade: number
  spacing: number
}

export const DEFAULTS = { line: 0.5, fade: 300, spacing: 150, padding: 8, radius: 8 } as const

export const tuningOf = (options: LekoScrollOptions): Tuning => ({
  line: options.line ?? DEFAULTS.line,
  fade: options.fade ?? DEFAULTS.fade,
  spacing: options.spacing ?? DEFAULTS.spacing,
})

export const paddingOf = (target: LekoScrollLit, options: LekoScrollOptions): number =>
  target.padding ?? options.padding ?? DEFAULTS.padding

export const radiusOf = (target: LekoScrollLit, options: LekoScrollOptions): number =>
  target.radius ?? options.radius ?? DEFAULTS.radius

/** Where the line is on the page at this scroll offset. */
export const lineAt = (scrollY: number, tuning: Tuning, layout: Layout): number =>
  scrollY + tuning.line * layout.viewportHeight

/** The furthest down the page the line can get. */
export const reachOf = (tuning: Tuning, layout: Layout): number =>
  layout.pageHeight - (1 - tuning.line) * layout.viewportHeight

/** A found entry's switch position, an off one's included, named by its index in `targets`. */
export interface Trigger {
  index: number
  at: number
}

/** The switch positions — [The line and the switch](../DESIGN.md#the-line-and-the-switch). */
export function triggers(tuning: Tuning, layout: Layout): Trigger[] {
  const found = layout.boxes.flatMap((box, index) => (box ? [{ index, top: box.y }] : []))
  const reach = reachOf(tuning, layout)
  const n = found.length
  const out: Trigger[] = []
  found.forEach(({ index, top }, i) => {
    const before = out[i - 1]
    const forward = before === undefined ? top : Math.max(top, before.at + tuning.spacing)
    out.push({ index, at: Math.min(forward, reach - (n - 1 - i) * tuning.spacing) })
  })
  return out
}

/** One of the page's two ends, and whether its whole fade band can be scrolled through. */
export interface Edge {
  at: number
  fade: boolean
}

/**
 * The page's two ends, and how deep a band is — [The two
 * edges](../DESIGN.md#the-two-edges). An end an off stretch runs to has no
 * edge, since the light is already off there.
 */
export interface Edges {
  upper: Edge | undefined
  lower: Edge | undefined
  fade: number
}

export function edgesOf(
  tuning: Tuning,
  layout: Layout,
  switches: readonly Trigger[],
): Edges | undefined {
  const first = switches[0]
  const last = switches.at(-1)
  if (first === undefined || last === undefined) return undefined
  const box = layout.boxes[last.index]
  const bottom = box ? box.y + box.height : last.at
  const lower = Math.max(bottom, last.at + tuning.spacing)
  return {
    upper:
      layout.off[first.index] === true
        ? undefined
        : { at: first.at, fade: first.at - tuning.fade >= tuning.line * layout.viewportHeight },
    lower:
      layout.off[last.index] === true
        ? undefined
        : { at: lower, fade: lower + tuning.fade <= reachOf(tuning, layout) },
    fade: tuning.fade,
  }
}

/**
 * The part of the page from one switch position to the next — [A stretch where
 * the light is off](../DESIGN.md#a-stretch-where-the-light-is-off). Every lit
 * entry has one of its own, and a run of off entries shares one.
 */
export interface Stretch {
  /** This stretch's switch position, and `-Infinity` for an off stretch that is first. */
  from: number
  /** The next stretch's switch position, and `Infinity` for the last. */
  to: number
  /** The lit entry's index, and `undefined` for an off stretch. */
  lit: number | undefined
  /** An off stretch's band just below `from`, the lit target above's; 0 where there is none. */
  bandAbove: number
  /** An off stretch's band just above `to`, the lit target below's; 0 where there is none. */
  bandBelow: number
}

export function stretchesOf(
  tuning: Tuning,
  layout: Layout,
  switches: readonly Trigger[],
): Stretch[] {
  const starts: { at: number; lit: number | undefined }[] = []
  for (const { index, at } of switches) {
    const lit = layout.off[index] === true ? undefined : index
    if (lit === undefined && starts.length > 0 && starts.at(-1)!.lit === undefined) continue
    starts.push({ at, lit })
  }
  const reach = reachOf(tuning, layout)
  return starts.map(({ at, lit }, i) => {
    const next = starts[i + 1]
    const to = next === undefined ? Infinity : next.at
    if (lit !== undefined) return { from: at, to, lit, bandAbove: 0, bandBelow: 0 }
    const above = i > 0
    const below = next !== undefined
    const start = Math.max(at, tuning.line * layout.viewportHeight)
    const room = above && below ? (to - at) / 2 : below ? to - start : reach - at
    const band = Math.max(0, Math.min(tuning.fade, room))
    return {
      from: above ? at : -Infinity,
      to,
      lit,
      bandAbove: above ? band : 0,
      bandBelow: below ? band : 0,
    }
  })
}

/** Everything a line position is read against. */
export interface Range {
  stretches: readonly Stretch[]
  edges: Edges
}

/** `undefined` where no lit entry was found, which leaves nothing to light. */
export function rangeOf(tuning: Tuning, layout: Layout): Range | undefined {
  const switches = triggers(tuning, layout)
  const edges = edgesOf(tuning, layout, switches)
  if (edges === undefined || switches.every(({ index }) => layout.off[index] === true)) {
    return undefined
  }
  return { stretches: stretchesOf(tuning, layout, switches), edges }
}

/** What a line position calls for: the target the hole belongs on, and how dark. */
export type Position =
  | { zone: 'inside'; target: number; opacity: 1 }
  | { zone: 'band'; target: number; opacity: number }
  | { zone: 'gone'; target: number | undefined; opacity: 0 }

const GONE: Position = { zone: 'gone', target: undefined, opacity: 0 }

/**
 * Where the line is against the range. Above every switch position the target
 * is the first — [The line and the switch](../DESIGN.md#the-line-and-the-switch),
 * [Entering converges, leaving fades](../DESIGN.md#entering-converges-leaving-fades)
 * and [A stretch where the light is off](../DESIGN.md#a-stretch-where-the-light-is-off).
 */
export function positionAt(lineY: number, range: Range | undefined): Position {
  if (range === undefined) return GONE
  const { stretches, edges } = range
  let k = 0
  stretches.forEach(({ from }, i) => {
    if (from <= lineY) k = i
  })
  const here = stretches[k]!

  if (here.lit !== undefined) {
    const { upper, lower } = edges
    const distance =
      lineY < here.from && upper?.fade
        ? upper.at - lineY
        : k === stretches.length - 1 && lower?.fade && lineY > lower.at
          ? lineY - lower.at
          : 0
    if (distance === 0) return { zone: 'inside', target: here.lit, opacity: 1 }
    if (distance >= edges.fade) return { zone: 'gone', target: here.lit, opacity: 0 }
    return { zone: 'band', target: here.lit, opacity: 1 - distance / edges.fade }
  }

  const above = stretches[k - 1]?.lit
  const into = lineY - here.from
  if (above !== undefined && into < here.bandAbove) {
    return { zone: 'band', target: above, opacity: 1 - into / here.bandAbove }
  }
  const below = stretches[k + 1]?.lit
  const left = here.to - lineY
  if (below !== undefined && left < here.bandBelow) {
    return { zone: 'band', target: below, opacity: 1 - left / here.bandBelow }
  }
  return GONE
}

/** The border box grown by `padding` on every side — [Padding and radius](../DESIGN.md#padding-and-radius). */
export const holeOf = (box: Rect, padding: number, radius: number): Hole => ({
  x: box.x - padding,
  y: box.y - padding,
  width: box.width + 2 * padding,
  height: box.height + 2 * padding,
  radius,
})
