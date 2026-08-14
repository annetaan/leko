import type { LekoTarget } from './types.js'

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface Cutout extends Rect {
  radius: number
}

/**
 * Resolve a target to an element. Selectors take the first match; a selector is
 * never read as "all matches", because widening that later would silently
 * change what existing tours highlight.
 */
export function resolveTarget(
  target: LekoTarget,
  scope: ParentNode = document,
): HTMLElement | null {
  if (typeof target !== 'string') return target.isConnected ? target : null
  return scope.querySelector<HTMLElement>(target)
}

export function resolveTargets(targets: readonly LekoTarget[], scope?: ParentNode): HTMLElement[] {
  return targets
    .map((target) => resolveTarget(target, scope))
    .filter((el): el is HTMLElement => el !== null)
}

/**
 * The bounding box of several rects. Note what this does *not* do: it makes no
 * attempt to skip the space between them. That space is part of the cutout, and
 * therefore interactive — which is the reason the public type asks for adjacent
 * elements.
 */
export function union(rects: readonly Rect[]): Rect | null {
  if (rects.length === 0) return null
  const left = Math.min(...rects.map((r) => r.x))
  const top = Math.min(...rects.map((r) => r.y))
  const right = Math.max(...rects.map((r) => r.x + r.width))
  const bottom = Math.max(...rects.map((r) => r.y + r.height))
  return { x: left, y: top, width: right - left, height: bottom - top }
}

export function grow(rect: Rect, by: number): Rect {
  return {
    x: rect.x - by,
    y: rect.y - by,
    width: rect.width + by * 2,
    height: rect.height + by * 2,
  }
}

/** A rect collapsed to nothing at its own centre. */
export function collapse(rect: Rect): Rect {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, width: 0, height: 0 }
}

const round = (n: number): number => Math.round(n * 100) / 100

const clamp = (value: number, max: number): number => Math.min(max, Math.max(0, value))

const ascending = <T>(list: readonly T[], by: (item: T) => number): T[] =>
  list.toSorted((a, b) => by(a) - by(b))

export function roundedRectPath(cutout: Cutout): string {
  const { x, y, width: w, height: h } = cutout
  const r = round(Math.max(0, Math.min(cutout.radius, w / 2, h / 2)))
  const [x0, y0, x1, y1] = [round(x), round(y), round(x + w), round(y + h)]
  return (
    `M${x0 + r} ${y0} L${x1 - r} ${y0} A${r} ${r} 0 0 1 ${x1} ${y0 + r}` +
    ` L${x1} ${y1 - r} A${r} ${r} 0 0 1 ${x1 - r} ${y1}` +
    ` L${x0 + r} ${y1} A${r} ${r} 0 0 1 ${x0} ${y1 - r}` +
    ` L${x0} ${y0 + r} A${r} ${r} 0 0 1 ${x0 + r} ${y0} Z`
  )
}

/**
 * An outer rectangle with the cutouts punched out of it.
 *
 * Two of these interpolate only when their segment lists match in count and
 * type, so the shape is kept rigid: always the same outer rectangle followed by
 * one rounded rectangle per cutout, always the same commands in the same order.
 * A step that needs fewer cutouts than the one before collapses the surplus to
 * zero area rather than dropping subpaths — see `padCutouts`.
 *
 * The even-odd rule makes each inner subpath a hole regardless of its winding
 * direction, so nothing here has to be drawn backwards.
 */
export function punchedPath(width: number, height: number, cutouts: Cutout[]): string {
  const outer = `M0 0 L${round(width)} 0 L${round(width)} ${round(height)} L0 ${round(height)} Z`
  return [outer, ...cutouts.map(roundedRectPath)].join(' ')
}

/**
 * Make two cutout lists the same length so the paths built from them can be
 * interpolated. Surplus cutouts on either side collapse to zero area at their
 * own centre, which reads as shrinking away rather than blinking out.
 */
export function padCutouts(from: Cutout[], to: Cutout[]): [Cutout[], Cutout[]] {
  const length = Math.max(from.length, to.length)
  const pad = (list: Cutout[], other: Cutout[]): Cutout[] =>
    Array.from({ length }, (_, i) => {
      const own = list[i]
      if (own) return own
      const counterpart = other[i]
      return counterpart
        ? { ...collapse(counterpart), radius: 0 }
        : { x: 0, y: 0, width: 0, height: 0, radius: 0 }
    })
  return [pad(from, to), pad(to, from)]
}

/**
 * Blend two paths by walking their numbers in step.
 *
 * Sound only because every path here is built to the same shape — same segments,
 * same commands, same order — so the nth number in one means the same thing as
 * the nth number in the other. {@link padCutouts} is what keeps that true when
 * the number of cutouts changes.
 */
export function lerpPath(from: string, to: string, t: number): string {
  const NUMBER = /-?[\d.]+/g
  const ends = (to.match(NUMBER) ?? []).map(Number)
  const blended = (from.match(NUMBER) ?? []).map((match, i) => {
    const a = Number(match)
    const b = ends[i] ?? a
    return String(round(a + (b - a) * t))
  })
  // The commands are what `split` leaves behind, one more of them than there are
  // numbers, so zipping the two back together rebuilds the path exactly.
  return from
    .split(NUMBER)
    .map((command, i) => command + (blended[i] ?? ''))
    .join('')
}

/**
 * What is left of a `width` by `height` surface once the holes are taken out of
 * it, as rectangles.
 *
 * This is what a scrim blocks with. It cannot block with the clipped element
 * itself: a `clip-path` takes an element out of hit-testing but **not** out of
 * the search for what a wheel should scroll, so a scrollable element under a
 * hole would stop scrolling under the pointer. Rectangles have no such
 * ambiguity — there is simply nothing there.
 *
 * Cut the surface into horizontal bands at every hole edge, and each band is
 * then split by whichever holes span it, which by construction span it wholly.
 * A hole's *bounding box* is what comes out, so the corners of a rounded hole
 * end up outside the blocking rather than inside it. That is the safe
 * direction: a few pixels of padding around the target go unblocked, and
 * nothing is ever placed over the target itself.
 */
export function complementRects(width: number, height: number, holes: readonly Rect[]): Rect[] {
  const edges = ascending(
    [
      ...new Set([
        0,
        height,
        ...holes.flatMap((h) => [clamp(h.y, height), clamp(h.y + h.height, height)]),
      ]),
    ],
    (edge) => edge,
  )
  const bands = edges.slice(0, -1).map((top, i) => [top, edges[i + 1]!] as const)

  return bands
    .filter(([top, bottom]) => bottom > top)
    .flatMap(([top, bottom]) => {
      // Every hole that reaches into this band spans it completely: the band's
      // own edges came from the holes' edges, so none can begin or end inside it.
      const spans = ascending(
        holes
          .filter((hole) => hole.y <= top && hole.y + hole.height >= bottom)
          .map((hole) => [clamp(hole.x, width), clamp(hole.x + hole.width, width)] as const),
        ([left]) => left,
      )

      // Sweep left to right. `reached` is how far across the band the holes have
      // accounted for so far, which is what makes overlapping holes fall out for
      // free: a hole ending left of where we already are contributes nothing.
      const swept = spans.reduce(
        ({ reached, rects }, [left, right]) => ({
          reached: Math.max(reached, right),
          rects:
            left > reached
              ? [...rects, { x: reached, y: top, width: left - reached, height: bottom - top }]
              : rects,
        }),
        { reached: 0, rects: [] as Rect[] },
      )

      return swept.reached < width
        ? [
            ...swept.rects,
            { x: swept.reached, y: top, width: width - swept.reached, height: bottom - top },
          ]
        : swept.rects
    })
}

/**
 * Which pair in a series a progress value falls between, and how far along that
 * pair it sits.
 *
 * Clamps, because the caller's progress is derived from a clock. `requestAnimationFrame`
 * reports the frame's start time, which can predate the moment the loop was
 * scheduled, so the first frame's elapsed time is sometimes negative.
 */
export function segmentAt(count: number, progress: number): { index: number; local: number } {
  const spans = Math.max(1, count - 1)
  const p = Math.min(1, Math.max(0, progress))
  const index = Math.min(Math.floor(p * spans), spans - 1)
  return { index, local: p * spans - index }
}
