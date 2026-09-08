/**
 * Anything the spotlight can be pointed at. Declared here rather than imported,
 * because the package this one is drawn for is the package that depends on it.
 * `@annetaan/leko` names the same union `LekoTarget` for its users.
 *
 * **Both members are a question, never an answer.** A selector is one this file
 * runs; a function is one the host runs, and neither is an element — DESIGN.md
 * argues it under **A target is a question**, and why the element type is
 * `Element` under **Resolution & custom functions**.
 */
export type Target = string | (() => Element | null)

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * A place on the page, or a distance across it — the same two numbers either
 * way.
 *
 * It has a name so that `originOf` in `surface.ts` and {@link shift} deal in
 * one type rather than two that happen to be shaped alike: `originOf` says what
 * the pair means.
 */
export interface Point {
  x: number
  y: number
}

/**
 * A hole in the scrim.
 *
 * `interactive` is the one field here that is not geometry. A cutout always
 * shows what is under it; this is whether the page underneath also takes the
 * pointer. It rides on the cutout rather than travelling as a second list
 * because the two can then never be given in different orders or different
 * lengths, and {@link padCutouts} has to carry it either way.
 *
 * Only {@link complementRects} reads it. {@link maskLayers} does not, because
 * what is drawn is the same hole whichever this says.
 */
export interface Cutout extends Rect {
  radius: number
  interactive: boolean
}

/**
 * Whether an element has a box on the page.
 *
 * The list rather than the rect, because a rect cannot tell the two apart:
 * `getBoundingClientRect` answers all zeros both for an element with no box and
 * for a rendered one of zero size, and the second has a place on the page while
 * the first has none. An element with no box answers with an empty list —
 * `display: none` on it or on anything it is inside, `display: contents`, and a
 * subtree a `content-visibility: hidden` is skipping — and a rendered element
 * answers with at least one however small it is.
 *
 * `visibility: hidden` and `opacity: 0` have boxes, so an element hidden either
 * way is one the tour still points at. DESIGN.md argues the rule this answers
 * under **An element with no box is not found**, and when it is asked — a
 * layout read, so only where layout is read already — under **An element with
 * no box is not found when the target is resolved**.
 */
export const hasBox = (el: Element): boolean => el.getClientRects().length > 0

/**
 * Ask a target where it is, now. Selectors take the first match; a selector is
 * never read as "all matches", because widening that later would silently
 * change what existing tours highlight.
 *
 * **Asked again every time anything needs the box** — DESIGN.md, **A target is
 * a question**. A function that hands back a node the document has let go of is
 * treated as no answer at all, which is the same `null` a selector matching
 * nothing gives and the same entrance to the search for a lost target. So is an
 * element with no box, and DESIGN.md argues what that costs either way under
 * **An element with no box is not found**. Nothing after the draw is decided
 * here — DESIGN.md, **The page is measured when a step is drawn, and not
 * again**.
 *
 * `isConnected` is asked first because it is free, and a node a framework has
 * replaced is the commonest no of the two.
 */
export function resolveTarget(target: Target): Element | null {
  const el = typeof target === 'string' ? document.querySelector(target) : target()
  return el?.isConnected && hasBox(el) ? el : null
}

export function resolveTargets(targets: readonly Target[]): Element[] {
  return targets.map(resolveTarget).filter((el): el is Element => el !== null)
}

/**
 * The bounding box of several rects. Note what this does *not* do: it makes no
 * attempt to skip the space between them. That space is part of the cutout, and
 * therefore interactive — which is the reason the public type asks for adjacent
 * elements.
 */
export function union(rects: readonly [Rect, ...Rect[]]): Rect
export function union(rects: readonly Rect[]): Rect | null
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

/**
 * `rect` moved by `by`, the size it was.
 *
 * For two coordinate spaces that differ by a translation and nothing else;
 * `originOf` in `surface.ts` is where that translation comes from and what it
 * saves.
 *
 * Generic, so a {@link Cutout} moved is still a cutout: its radius and whether
 * the step opened it ride along rather than being dropped and put back, which
 * is the flavour {@link clipToSurface} already writes.
 */
export function shift<T extends Rect>(rect: T, by: Point): T {
  return { ...rect, x: rect.x + by.x, y: rect.y + by.y }
}

/**
 * Room asked for around a box, side by side.
 *
 * Four numbers rather than one, because the two things that ask for room here
 * disagree about shape: a step's `padding` is the same all round, and
 * `scroll-margin` is written per side by an application that knows which of
 * its own chrome is in the way.
 */
export interface Insets {
  top: number
  right: number
  bottom: number
  left: number
}

/** A rect with `room` added to each of its sides. {@link grow} where all four agree. */
export function outset(rect: Rect, room: Insets): Rect {
  return {
    x: rect.x - room.left,
    y: rect.y - room.top,
    width: rect.width + room.left + room.right,
    height: rect.height + room.top + room.bottom,
  }
}

/**
 * How far a scrollport has to move to put `box` where a step wants it, and zero
 * on an axis that already holds it.
 *
 * Positive is forward — what `scrollBy` is handed.
 *
 * Three rules, and DESIGN.md argues each of them. DESIGN.md's **The middle of
 * the port, not the nearest edge** for where the box lands, then DESIGN.md's
 * **A port that already holds the cutout is not touched** for the zero, and
 * DESIGN.md's **Nothing in the geometry clamps; whoever scrolls does** for the
 * delta that asks for a scroll past the end.
 *
 * A box more than half the port tall leads with its top edge instead, and a box
 * wider than the port keeps its near edge. Neither has a twin on the other
 * axis, and DESIGN.md argues why under **A target more than half the port tall
 * leads with its top edge, put at the middle**.
 */
export function scrollDelta(box: Rect, port: Rect): { x: number; y: number } {
  const [left, right] = [box.x, box.x + box.width]
  const [portLeft, portRight] = [port.x, port.x + port.width]
  const [top, bottom] = [box.y, box.y + box.height]
  const [portTop, portBottom] = [port.y, port.y + port.height]
  return {
    x: holds(left, right, portLeft, portRight)
      ? 0
      : box.width > port.width
        ? left - portLeft
        : centred(left, right, portLeft, portRight),
    y: holds(top, bottom, portTop, portBottom)
      ? 0
      : box.height > port.height / 2
        ? top - (portTop + portBottom) / 2
        : centred(top, bottom, portTop, portBottom),
  }
}

/** Whether this axis of the port already holds this axis of the box, whole. */
const holds = (near: number, far: number, portNear: number, portFar: number): boolean =>
  near >= portNear && far <= portFar

/** What it takes to put the middle of the box on the middle of the port. */
const centred = (near: number, far: number, portNear: number, portFar: number): number =>
  (near + far) / 2 - (portNear + portFar) / 2

/**
 * How long a glide takes per cube root of a pixel of the way, in ms.
 *
 * 140, set by eye in `scrolls-into-view.ts`. DESIGN.md has the timings that
 * settled it, and why a glide is paced by the cube root of the distance at
 * all, under **A glide grows with the distance, and is much slower than the
 * morph**.
 */
export const GLIDE_PACE = 140

/**
 * How long a glide over `distance` px runs, given `duration`, the morph's.
 *
 * The distance term is the point — see {@link GLIDE_PACE} — and `duration` is
 * only the floor under it. One option and not two, for the reason DESIGN.md
 * gives under **A glide grows with the distance, and is much slower than the
 * morph**.
 */
export const glideDuration = (distance: number, duration: number): number =>
  Math.max(duration, Math.cbrt(distance) * GLIDE_PACE)

/** A rect collapsed to nothing at its own centre. */
export function collapse(rect: Rect): Rect {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, width: 0, height: 0 }
}

/** Whether a rect is a hole rather than a collapsed leftover. */
export function hasArea(rect: Rect): boolean {
  return rect.width > 0 && rect.height > 0
}

const round = (n: number): number => Math.round(n * 100) / 100

/** `n` held between `0` and `max`. A `max` below zero is no room to move at all. */
export const clamp = (n: number, max: number): number => Math.min(Math.max(0, n), Math.max(0, max))

const ascending = <T>(list: readonly T[], by: (item: T) => number): T[] =>
  list.toSorted((a, b) => by(a) - by(b))

/**
 * The corners a box that has to stay out of the way can sit in, in preference
 * order. Top right first, because that is where a control that ends something
 * is looked for, and reading order puts it last.
 */
export const CORNERS = ['top-right', 'top-left', 'bottom-right', 'bottom-left'] as const
export type Corner = (typeof CORNERS)[number]

const overlap = (a: Rect, b: Rect): number => {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  return width > 0 && height > 0 ? width * height : 0
}

/** Where a box of `size` would sit if it took `corner`, `gap` in from the edges. */
export function cornerRect(
  width: number,
  height: number,
  size: { width: number; height: number },
  corner: Corner,
  gap: number,
): Rect {
  const [vertical, horizontal] = corner.split('-')
  return {
    x: horizontal === 'left' ? gap : width - size.width - gap,
    y: vertical === 'top' ? gap : height - size.height - gap,
    ...size,
  }
}

/**
 * Which corner of the viewport a box can take without covering a hole.
 *
 * A cutout is a hole because the user has to reach what is under it, so a box
 * put on top of one takes that back. This is the same job {@link Message} does
 * with `chooseSide`, one size down: four candidates rather than four sides, and
 * an answer that is always one of them.
 *
 * **Where every corner is covered the least covered one wins.** A step that
 * cuts a full-width header and a full-width footer leaves no corner free, and
 * something still has to be pressable. Ties go to the earlier corner, so the
 * answer is the same every time it is asked.
 */
export function freeCorner(
  width: number,
  height: number,
  size: { width: number; height: number },
  holes: readonly Rect[],
  gap: number,
): Corner {
  const covered = (corner: Corner): number => {
    const box = cornerRect(width, height, size, corner, gap)
    return holes.reduce((total, hole) => total + overlap(box, hole), 0)
  }
  const free = CORNERS.find((corner) => covered(corner) === 0)
  if (free) return free
  return ascending([...CORNERS], covered)[0] ?? 'top-right'
}

/**
 * A hole, as an image the size of the hole.
 *
 * An SVG in a `data:` URL, opaque inside its rounded rectangle and transparent
 * outside, which makes it an ordinary mask *image* and not a reference to
 * anything in the document. That distinction is the whole reason this is built
 * the way it is, and CLAUDE.md states it under **Reaching an SVG `<mask>`
 * element from CSS with `url(#…)`**.
 *
 * The image is the hole's own size rather than the surface's, and
 * {@link maskLayers} lays it where it belongs — DESIGN.md, **Drawing**.
 *
 * `clip` is the viewport: the on-surface part of the cutout, which is all the
 * image ever needs to be. The rectangle keeps the cutout's own size and radius
 * and rides at a negative offset, so an edge the surface cuts through stays
 * the edge it really is — a hole hanging off the top of the page is open right
 * across at the clip line, not rounded there as if the hole ended.
 */
export function holeImage(cutout: Cutout, clip: Rect = cutout): string {
  const w = round(Math.max(0, cutout.width))
  const h = round(Math.max(0, cutout.height))
  const r = round(clamp(cutout.radius, Math.min(w, h) / 2))
  const width = round(Math.max(0, clip.width))
  const height = round(Math.max(0, clip.height))
  const x = round(cutout.x - clip.x)
  const y = round(cutout.y - clip.y)
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="black"/></svg>`
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`
}

/**
 * The on-surface part of a cutout: where its mask layer sits, and how large an
 * image it needs.
 *
 * Purely a bound on what gets rasterised — the hole itself is drawn whole by
 * {@link holeImage} inside this viewport, so nothing about its shape changes,
 * only how much of it is committed to pixels. What this buys is that no hole
 * image is ever larger than the scrim, however far off the edge a cutout
 * starts — and a story opens with every hole the size of the whole surface.
 */
export function clipToSurface(width: number, height: number, cutout: Cutout): Cutout {
  const x = clamp(cutout.x, width)
  const y = clamp(cutout.y, height)
  return {
    ...cutout,
    x,
    y,
    width: clamp(cutout.x + cutout.width, width) - x,
    height: clamp(cutout.y + cutout.height, height) - y,
  }
}

/** What a scrim writes to show its holes: one CSS value per property. */
export interface MaskLayers {
  image: string
  position: string
  composite: string
}

/**
 * The cutouts as a stack of CSS mask layers.
 *
 * **The holes are a union here, not a parity.** One opaque layer for the whole
 * surface, one image per hole underneath it, `add` between the holes and
 * `subtract` on the surface layer. Two holes may therefore overlap, and
 * DESIGN.md argues under **The morph** why that is load-bearing rather than
 * incidental.
 *
 * The layer order is what makes it work: CSS lists mask layers top first and
 * composites them bottom up, so the surface is written first and the holes
 * after it.
 *
 * A cutout with no area contributes no layer. It is a morph's collapsed
 * leftover rather than a hole, and an image with no size is not something every
 * engine has to agree about.
 */
export function maskLayers(width: number, height: number, cutouts: readonly Cutout[]): MaskLayers {
  const holes = cutouts
    .map((cutout) => ({ cutout, clip: clipToSurface(width, height, cutout) }))
    .filter(({ clip }) => hasArea(clip))
  return {
    image: [
      'linear-gradient(black, black)',
      ...holes.map(({ cutout, clip }) => holeImage(cutout, clip)),
    ].join(', '),
    position: ['0 0', ...holes.map(({ clip }) => `${round(clip.x)}px ${round(clip.y)}px`)].join(
      ', ',
    ),
    composite: ['subtract', ...holes.map(() => 'add')].join(', '),
  }
}

/**
 * Make two cutout lists the same length, so each hole has something to be
 * blended with. Surplus cutouts on either side collapse to zero area at their
 * own centre, which reads as shrinking away rather than blinking out.
 *
 * **An animation nicety and no longer a correctness rule**, which is what it
 * was while the scrim was one `clip-path`. DESIGN.md, **The morph**.
 */
export function padCutouts(from: Cutout[], to: Cutout[]): [Cutout[], Cutout[]] {
  const length = Math.max(from.length, to.length)
  const pad = (list: Cutout[], other: Cutout[]): Cutout[] =>
    Array.from({ length }, (_, i) => {
      const own = list[i]
      if (own) return own
      const counterpart = other[i]
      // Zero area either way, so nothing is blocked by it and nothing reaches
      // through it. `false` is what a cutout with no area should say.
      return counterpart
        ? { ...collapse(counterpart), radius: 0, interactive: false }
        : { x: 0, y: 0, width: 0, height: 0, radius: 0, interactive: false }
    })
  return [pad(from, to), pad(to, from)]
}

/**
 * Where the cutouts are, `t` of the way from one list to the other.
 *
 * The lists must already be the same length, which is what {@link padCutouts}
 * hands back. Geometry is blended; `interactive` is taken from the
 * destination, because a flag has no halfway point and the flight is toward
 * it. This is what lets a halo ride a morph: the path the scrim interpolates
 * is built from these same numbers, so a frame written from both cannot
 * disagree with itself.
 */
export function lerpCutouts(from: Cutout[], to: Cutout[], t: number): Cutout[] {
  const blend = (a: number, b: number): number => round(a + (b - a) * t)
  return to.map((end, i) => {
    const start = from[i] ?? end
    return {
      x: blend(start.x, end.x),
      y: blend(start.y, end.y),
      width: blend(start.width, end.width),
      height: blend(start.height, end.height),
      radius: blend(start.radius, end.radius),
      interactive: end.interactive,
    }
  })
}

/**
 * What is left of a `width` by `height` surface once the holes are taken out of
 * it, as rectangles.
 *
 * This is what a scrim blocks with, and it cannot be the scrim itself:
 * DESIGN.md, **Do not go back to blocking with the scrim itself**.
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
 * Clamps, because the caller's progress is derived from a clock, and
 * `requestAnimationFrame` reports the frame's start time, which can predate the
 * moment the loop was scheduled — so the first frame's elapsed time is
 * sometimes negative. Every frame loop here clamps for that reason.
 */
export function segmentAt(count: number, progress: number): { index: number; local: number } {
  const spans = Math.max(1, count - 1)
  const p = Math.min(1, Math.max(0, progress))
  const index = Math.min(Math.floor(p * spans), spans - 1)
  return { index, local: p * spans - index }
}

/** Ease out, so a cutout arrives rather than stops. */
export const ease = (t: number): number => 1 - (1 - t) ** 3
