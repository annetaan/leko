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
 * A rect with `room` taken off each of its sides — {@link outset}'s opposite,
 * and never smaller than nothing.
 */
export function inset(rect: Rect, room: Insets): Rect {
  return {
    x: rect.x + room.left,
    y: rect.y + room.top,
    width: Math.max(0, rect.width - room.left - room.right),
    height: Math.max(0, rect.height - room.top - room.bottom),
  }
}

/**
 * The nearer of two opposite edges and how deep the box reaches from it, or
 * nothing where the box sits exactly between them.
 *
 * Their depths sum to the whole viewport plus the box, so claiming both would
 * leave a room of no height. DESIGN.md argues what that costs, and why saying
 * nothing is the better of the two, under **A host's own chrome is named once,
 * and every reader takes the boxes**.
 */
const nearerEdge = (
  low: keyof Insets,
  lowDepth: number,
  high: keyof Insets,
  highDepth: number,
): readonly [keyof Insets, number] | undefined =>
  lowDepth === highDepth
    ? undefined
    : lowDepth < highDepth
      ? ([low, lowDepth] as const)
      : ([high, highDepth] as const)

/**
 * A viewport of `width` by `height`, and boxes a host said are its own chrome:
 * how deep each edge of the viewport is spoken for.
 *
 * Each box is a band on the edge it is nearest, as deep as the box reaches from
 * that edge, and on two edges where it is as near one as the other — which only
 * ever happens in a corner, per {@link nearerEdge}. Deepest wins where several
 * boxes claim a side. DESIGN.md argues why the bands are wider than the boxes,
 * and why that is the direction to be wrong in, under **A host's own chrome is
 * named once, and every reader takes the boxes**.
 */
export function chromeInsets(width: number, height: number, chrome: readonly Rect[]): Insets {
  return chrome.reduce<Insets>(
    (room, box) => {
      const claims = [
        nearerEdge('top', box.y + box.height, 'bottom', height - box.y),
        nearerEdge('left', box.x + box.width, 'right', width - box.x),
      ].filter((claim) => claim !== undefined)
      const nearest = Math.min(...claims.map(([, depth]) => depth))
      // Nothing to claim, or a box with no part of it on screen.
      if (claims.length === 0 || nearest <= 0) return room
      const claim = (side: keyof Insets): number =>
        claims.some(([edge, depth]) => edge === side && depth === nearest)
          ? Math.max(room[side], nearest)
          : room[side]
      return {
        top: claim('top'),
        right: claim('right'),
        bottom: claim('bottom'),
        left: claim('left'),
      }
    },
    { top: 0, right: 0, bottom: 0, left: 0 },
  )
}

/**
 * Which side of the cutout the message sits on, in preference order: below
 * first, because a message under the thing it describes is the least surprising
 * place for it, and reading order puts it after the target rather than before.
 */
export const SIDES = ['bottom', 'top', 'right', 'left'] as const
export type Side = (typeof SIDES)[number]

/**
 * The side of `box` with room for something of `size`, `gap` clear of it.
 *
 * `room` rather than the viewport — DESIGN.md, **The message**. Falls back to
 * `bottom` when nothing fits, which is when the browser's own fallbacks — where
 * it has them — get their turn.
 */
export function sideWithRoom(
  box: Rect,
  size: { width: number; height: number },
  room: Rect,
  gap: number,
): Side {
  const free: Record<Side, number> = {
    bottom: room.y + room.height - (box.y + box.height),
    top: box.y - room.y,
    right: room.x + room.width - (box.x + box.width),
    left: box.x - room.x,
  }
  const need: Record<Side, number> = {
    bottom: size.height + gap,
    top: size.height + gap,
    right: size.width + gap,
    left: size.width + gap,
  }
  return SIDES.find((side) => free[side] >= need[side]) ?? 'bottom'
}

/**
 * The midpoint of one side of `box`, which is where the message's anchor goes.
 *
 * The edge rather than the middle: the anchor has no area, so `position-area`
 * lays the message out from this point alone, and a point in the middle of the
 * hole would put the message over half of it. DESIGN.md, **The message anchors
 * to a marker, never to the target**.
 */
export function edgeOf(box: Rect, side: Side): Point {
  const midX = box.x + box.width / 2
  const midY = box.y + box.height / 2
  if (side === 'bottom') return { x: midX, y: box.y + box.height }
  if (side === 'top') return { x: midX, y: box.y }
  if (side === 'right') return { x: box.x + box.width, y: midY }
  return { x: box.x, y: midY }
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

/**
 * How long a staged scroll holds still between one port landing and the next
 * one starting, in ms.
 *
 * Beside {@link GLIDE_PACE} because it is the same kind of number, and one
 * constant rather than an option for the same reason: DESIGN.md,
 * **A beat of 300ms between stages, and it is not a setting**.
 */
export const GLIDE_BEAT = 300

/**
 * What a `position: sticky` element asks to be held at, one number per side,
 * with `null` for the `auto` that asks for nothing.
 *
 * The strings `getComputedStyle` hands back are the caller's to turn into
 * these — `surface.ts` is the only one that reads a style, and nothing here
 * touches the DOM.
 */
export interface StickyInsets {
  top: number | null
  right: number | null
  bottom: number | null
  left: number | null
}

/**
 * How much scrolling an axis has left before it pins, and `null` on an axis
 * that asks for nothing.
 *
 * Zero is pinned, positive is the scroll still to come before it pins, and
 * negative is an element the end of its containing block has pushed back off
 * its inset and which is riding again. `spike/a-sticky-target-pinning/` is what
 * says the distance is exactly the scroll left to the pin, and what the three
 * candidate tests scored against each other.
 *
 * An axis given both insets is read against the start edge — `top`, `left` —
 * and nothing else. A sticky element given both is held against whichever the
 * scroll ran it into, so one held at its `bottom` reads here as riding.
 * DESIGN.md names that with the rest of what a reading can get wrong under
 * **What the two states can get wrong is the layer, not where the hole is**.
 */
export function stickySlack(
  box: Rect,
  port: Rect,
  insets: StickyInsets,
): { x: number | null; y: number | null } {
  return {
    x:
      insets.left !== null
        ? box.x - port.x - insets.left
        : insets.right !== null
          ? port.x + port.width - (box.x + box.width) - insets.right
          : null,
    y:
      insets.top !== null
        ? box.y - port.y - insets.top
        : insets.bottom !== null
          ? port.y + port.height - (box.y + box.height) - insets.bottom
          : null,
  }
}

/**
 * How near an inset counts as sitting on it, in px.
 *
 * Half a pixel: the inset test matched the ground truth to within a tenth of
 * one in every state and every engine `spike/a-sticky-target-pinning/`
 * measured, and half a pixel is less than the scroll that separates riding
 * from pinned.
 */
export const STICKY_SLACK = 0.5

/** Whether either axis of a sticky box is being held against its port. */
export function heldAgainst(box: Rect, port: Rect, insets: StickyInsets): boolean {
  const slack = stickySlack(box, port, insets)
  return (
    (slack.x !== null && Math.abs(slack.x) <= STICKY_SLACK) ||
    (slack.y !== null && Math.abs(slack.y) <= STICKY_SLACK)
  )
}

/** A rect collapsed to nothing at its own centre. */
export function collapse(rect: Rect): Rect {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, width: 0, height: 0 }
}

/** Whether a rect is a hole rather than a collapsed leftover. */
export function hasArea(rect: Rect): boolean {
  return rect.width > 0 && rect.height > 0
}

/**
 * Whether two rects share any area. Touching along an edge is not overlapping,
 * the way a rect of no area is not a hole in {@link hasArea}: a match resting
 * exactly on the fold has nothing of itself on screen.
 */
export function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
}

const round = (n: number): number => Math.round(n * 100) / 100

/** `n` held between `0` and `max`. A `max` below zero is no room to move at all. */
export const clamp = (n: number, max: number): number => Math.min(Math.max(0, n), Math.max(0, max))

/**
 * One scrollport of a staged scroll: where it can put a box, where it is, and
 * how far it can go.
 *
 * `port` is the client box in viewport coordinates, the same rect
 * {@link scrollDelta} takes. `from` and `limit` are the port's own scroll
 * offset and the largest one it has — a {@link Point} either way, being two
 * numbers across the same page.
 */
export interface PortScroll {
  port: Rect
  from: Point
  limit: Point
}

/**
 * Where each port of a chain has to end up to bring `box` in, innermost first
 * and one answer per port.
 *
 * Every destination is worked out before anything is written, because an outer
 * port is measured against a box the inner ones have not moved yet: scrolling a
 * port moves the box in the viewport by exactly what the port scrolls, so the
 * next port along is measured against the box {@link shift}ed by that, and
 * DESIGN.md argues the arithmetic under
 * **`scroll: 'staged'` moves one port at a time, outermost first**.
 *
 * **Clamped here, per port, rather than by whoever writes it.** Nothing else in
 * this file clamps — DESIGN.md, **Nothing in the geometry clamps; whoever
 * scrolls does** — but a port asked for more than it has gives only what it
 * has, and an outer port measured against the move that was asked for rather
 * than the one that happened is measured against a box that is not there.
 *
 * **Only the box moves along the chain, never the ports.** A port scrolls its
 * own content and nothing else, so the client box of every port outside it is
 * where it was.
 */
export function scrollStages(box: Rect, ports: readonly PortScroll[]): Point[] {
  return ports.reduce<{ box: Rect; stages: Point[] }>(
    ({ box: moved, stages }, { port, from, limit }) => {
      const delta = scrollDelta(moved, port)
      const to = { x: clamp(from.x + delta.x, limit.x), y: clamp(from.y + delta.y, limit.y) }
      return {
        box: shift(moved, { x: from.x - to.x, y: from.y - to.y }),
        stages: [...stages, to],
      }
    },
    { box, stages: [] },
  ).stages
}

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
 * put on top of one takes that back. This is the same job {@link sideWithRoom}
 * does, one size down: four candidates rather than four sides, and an answer
 * that is always one of them.
 *
 * `holes` is not only the step's cutouts. Whatever a host named as its own
 * chrome is in the list too, so the way out dodges that the same way — nothing
 * here has to tell the two apart, and DESIGN.md argues why the boxes rather
 * than an inset arrive under **A host's own chrome is named once, and every
 * reader takes the boxes**.
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
 * Whether two lists of cutouts would draw the same thing.
 *
 * Exact equality, and not a tolerance: what these are compared for is whether a
 * frame of the follow has anything to write, and a box read twice without the
 * page moving answers with the same numbers. A tolerance would instead decide
 * how far the hole may lag its target, which is not a judgement this has any
 * grounds to make.
 */
export function sameCutouts(a: readonly Cutout[], b: readonly Cutout[]): boolean {
  return (
    a.length === b.length &&
    a.every((one, i) => {
      const other = b[i]!
      return (
        one.x === other.x &&
        one.y === other.y &&
        one.width === other.width &&
        one.height === other.height &&
        one.radius === other.radius &&
        one.interactive === other.interactive
      )
    })
  )
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

/**
 * A curve from a fraction of the time to a fraction of the way.
 *
 * `LekoOptions.easing` in `packages/types` writes this shape out again rather
 * than importing it, the way `Target` and `MachineState` are written twice:
 * DESIGN.md, **The packages, and the seam between them**.
 */
export type Easing = (t: number) => number

/**
 * The curve two control points describe, read the way CSS reads one: solve the
 * horizontal Bézier for the parameter at `t`, then evaluate the vertical one
 * there. Reading `t` as the parameter directly is a different curve — for the
 * default below it answers 0.104 where this answers 0.5.
 *
 * Only `x1` and `x2` are held to `[0, 1]`, and not to keep a host's curve
 * tame: outside that range the horizontal Bézier stops being monotonic, so
 * there is no single parameter at `t` to find. CSS constrains its own the same
 * way, and leaves `y1` and `y2` free.
 *
 * No lookup table. A table is state, and what it saves is a few dozen
 * arithmetic operations on a curve evaluated a handful of times a frame.
 */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): Easing {
  const ax = clamp(x1, 1)
  const bx = clamp(x2, 1)
  // The ends are exact, so a caller can rely on the first frame writing where
  // it started and the last one writing the destination.
  return (t) => (t <= 0 || t >= 1 ? t : along(y1, y2, parameterAt(ax, bx, t)))
}

/** One axis of a cubic Bézier from 0 to 1, at parameter `s`. */
function along(a: number, b: number, s: number): number {
  const u = 1 - s
  return 3 * u * u * s * a + 3 * u * s * s * b + s * s * s
}

/** That axis' rate of change at `s`, which is what Newton needs. */
function rate(a: number, b: number, s: number): number {
  const u = 1 - s
  return 3 * u * u * a + 6 * u * s * (b - a) + 3 * s * s * (1 - b)
}

/**
 * The parameter at which the horizontal Bézier reaches `x`.
 *
 * Newton-Raphson from `s = x`, which is where the default curve ends up for
 * seven values of `t` in eight, within six iterations. The eighth is `t`
 * between 0.375 and 0.5, where `s = x` is far enough under the answer that the
 * first step lands just past 1 — the rate there is 0.4, so nothing is flat
 * about it — and bisection finishes those. The rate guard is the other way
 * out, and belongs to a curve with a control point at 0, where a step divided
 * by it would leave the interval as well.
 */
function parameterAt(x1: number, x2: number, x: number): number {
  let s = x
  for (let i = 0; i < 8; i++) {
    const error = along(x1, x2, s) - x
    if (Math.abs(error) < 1e-7) return s
    const d = rate(x1, x2, s)
    if (Math.abs(d) < 1e-6) break
    s -= error / d
    if (s < 0 || s > 1) break
  }
  let low = 0
  let high = 1
  for (let i = 0; i < 32; i++) {
    const mid = (low + high) / 2
    if (along(x1, x2, mid) < x) low = mid
    else high = mid
  }
  return (low + high) / 2
}

/**
 * The default curve: Material 3's standard easing, and what a hole and a page
 * follow where the host brings nothing of its own.
 *
 * DESIGN.md argues the shape, and what the ease-out before it did at the first
 * frame, under **The morph**.
 */
export const ease: Easing = cubicBezier(0.2, 0, 0, 1)
