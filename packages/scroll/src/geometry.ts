import type { LekoScrollOptions, LekoScrollTarget } from './types.js'

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

/** What the shell measured. `boxes` is by index in `targets`, `undefined` where a target was not found. */
export interface Layout {
  viewportHeight: number
  pageHeight: number
  boxes: readonly (Rect | undefined)[]
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

export const paddingOf = (target: LekoScrollTarget, options: LekoScrollOptions): number =>
  target.padding ?? options.padding ?? DEFAULTS.padding

export const radiusOf = (target: LekoScrollTarget, options: LekoScrollOptions): number =>
  target.radius ?? options.radius ?? DEFAULTS.radius

/** Where the line is on the page at this scroll offset. */
export const lineAt = (scrollY: number, tuning: Tuning, layout: Layout): number =>
  scrollY + tuning.line * layout.viewportHeight

/** The furthest down the page the line can get. */
export const reachOf = (tuning: Tuning, layout: Layout): number =>
  layout.pageHeight - (1 - tuning.line) * layout.viewportHeight

/** A found target's switch position, named by its index in `targets`. */
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

/**
 * The range's two edges, whether each has a fade band, and how deep a band is
 * — [The two edges](../DESIGN.md#the-two-edges).
 */
export interface Edges {
  upper: number
  lower: number
  upperFade: boolean
  lowerFade: boolean
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
  const upper = first.at
  const lower = Math.max(bottom, last.at + tuning.spacing)
  return {
    upper,
    lower,
    upperFade: upper - tuning.fade >= tuning.line * layout.viewportHeight,
    lowerFade: lower + tuning.fade <= reachOf(tuning, layout),
    fade: tuning.fade,
  }
}

/** What a line position calls for: the target the hole belongs on, and how dark. */
export type Position =
  | { zone: 'inside'; target: number; opacity: 1 }
  | { zone: 'band'; target: number; opacity: number }
  | { zone: 'gone'; target: number | undefined; opacity: 0 }

/**
 * Where the line is against the range. Above every switch position the target
 * is the first — [The line and the switch](../DESIGN.md#the-line-and-the-switch)
 * and [Entering converges, leaving fades](../DESIGN.md#entering-converges-leaving-fades).
 */
export function positionAt(
  lineY: number,
  switches: readonly Trigger[],
  edges: Edges | undefined,
): Position {
  const first = switches[0]
  if (first === undefined || edges === undefined) {
    return { zone: 'gone', target: undefined, opacity: 0 }
  }
  let target = first.index
  for (const { index, at } of switches) if (at <= lineY) target = index
  const distance =
    lineY < edges.upper && edges.upperFade
      ? edges.upper - lineY
      : lineY > edges.lower && edges.lowerFade
        ? lineY - edges.lower
        : 0
  if (distance === 0) return { zone: 'inside', target, opacity: 1 }
  if (distance >= edges.fade) return { zone: 'gone', target, opacity: 0 }
  return { zone: 'band', target, opacity: 1 - distance / edges.fade }
}

/** The border box grown by `padding` on every side — [Padding and radius](../DESIGN.md#padding-and-radius). */
export const holeOf = (box: Rect, padding: number, radius: number): Hole => ({
  x: box.x - padding,
  y: box.y - padding,
  width: box.width + 2 * padding,
  height: box.height + 2 * padding,
  radius,
})
