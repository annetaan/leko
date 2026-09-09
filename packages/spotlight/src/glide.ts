/**
 * The half that brings the page to a target before anything is drawn. Nothing
 * here knows what a step is: it is handed the elements a hole will be cut
 * around and says when the page has stopped.
 *
 * DESIGN.md holds every rule this file follows, under **Bringing a target into
 * view**, and CLAUDE.md says why the loop is Leko's own under **Using the
 * browser's smooth scroll for the glide**.
 */

import {
  clamp,
  ease,
  GLIDE_BEAT,
  glideDuration,
  type Insets,
  outset,
  type Point,
  type Rect,
  scrollDelta,
  scrollStages,
  union,
} from './geometry.js'
import { animates } from './motion.js'
import { type Surface, surfaceChain } from './surface.js'

/**
 * A glide in flight: when the page has stopped, and how to stop it.
 *
 * `abandon` cancels the next frame and leaves the page where the last one put
 * it; `settled` then never resolves — the rule DESIGN.md states under **A glide
 * the tour has moved past is cancelled, and the page stops where it is**.
 *
 * One of these however many ports move, so a staged scroll is a glide like any
 * other to whoever waits on it: DESIGN.md,
 * **`scroll: 'staged'` moves one port at a time, outermost first**.
 */
export interface Glide {
  settled: Promise<void>
  abandon(): void
}

/**
 * What a scroll looks like, where the host asked for one.
 *
 * DESIGN.md argues the two under **The page glides; a nested panel is set**,
 * which is `'direct'`, and
 * **`scroll: 'staged'` moves one port at a time, outermost first**.
 */
export type ScrollMode = 'direct' | 'staged'

/**
 * Bring the box around `lit` to the middle of every scrollport that carries
 * it, and say when the page has stopped moving.
 *
 * **Before the draw, and never during it.** `undefined` means there is nothing
 * to wait for and the step is drawn in the same task; a {@link Glide} means the
 * page is moving and whatever draws waits for it. DESIGN.md, **A port that
 * needs no scroll is never waited on**.
 *
 * A `viewport` surface is skipped whichever mode is asked for: DESIGN.md,
 * **A `position: fixed` target is not scrolled**.
 *
 * **The box around every element is what is brought in, and the first element
 * is what is scrolled.** DESIGN.md argues the first half, and what measuring
 * the element instead cost, under **What is brought in is the first region's
 * hole, not its first element**. The first element names the surfaces to
 * scroll, on the assumption that one hole's elements share them — nothing
 * checks it, and a hole spread across scrollers lands wherever scrolling the
 * first element's puts the rest.
 *
 * `room` is the hole's own overhang — the step's `padding` — so what is brought
 * in is the cutout rather than the bare box, and `scroll-margin` on the first
 * element wins over it wherever it asks for more. DESIGN.md,
 * **`scroll-margin` on the target wins over the step's `padding`**.
 */
export function bringIntoView(
  lit: readonly [Element, ...Element[]],
  room: number,
  duration: number,
  mode: ScrollMode,
): Glide | undefined {
  return mode === 'staged' ? staged(lit, room, duration) : direct(lit, room, duration)
}

/**
 * The page glides and every panel inside it is set outright, innermost first.
 *
 * DESIGN.md argues it under **The page glides; a nested panel is set**, and why
 * this walk measures rather than doing {@link scrollStages}' arithmetic: the
 * box is read again for each port, so the document's own delta is measured
 * against panels that have already moved.
 *
 * Where the box ends up is {@link scrollDelta}'s to say, and it does not clamp:
 * DESIGN.md, **Nothing in the geometry clamps; whoever scrolls does**. A panel
 * set outright is clamped by the port; the page's destination is clamped here,
 * once, before the glide starts, and DESIGN.md says why the loop cannot leave
 * that to the port under **The destination is clamped once, before the first
 * frame**. A destination that clamps to where the page already is means there
 * is nothing to glide, so that is drawn in the same task too.
 */
function direct(
  lit: readonly [Element, ...Element[]],
  room: number,
  duration: number,
): Glide | undefined {
  const [anchor] = lit
  const asked = roomAround(anchor, room)
  for (const surface of surfaceChain(anchor)) {
    const port = scrollport(surface)
    if (!port) continue
    const delta = scrollDelta(outset(around(lit), asked), port)
    if (delta.x === 0 && delta.y === 0) continue
    const from = offsetOf(surface)
    if (surface.kind === 'scroller') {
      writeTo(surface, { x: from.x + delta.x, y: from.y + delta.y })
      continue
    }
    // The document, which is the last surface of every chain that has one, so
    // there is nothing after this to measure.
    const limit = limitOf(surface)
    const to = { x: clamp(from.x + delta.x, limit.x), y: clamp(from.y + delta.y, limit.y) }
    if (to.x === from.x && to.y === from.y) return undefined
    if (!animates(duration)) {
      writeTo(surface, to)
      return undefined
    }
    return play([{ surface, from, to }], duration)
  }
  return undefined
}

/**
 * One port at a time, outermost first, with a beat between.
 *
 * DESIGN.md argues the order and what it is for under
 * **`scroll: 'staged'` moves one port at a time, outermost first**. The walk is
 * innermost first, the way the chain comes, because that is the order
 * {@link scrollStages}' arithmetic runs in; the play is that list backwards.
 *
 * Every offset is read before anything is written, which is what lets the
 * destinations be arithmetic rather than a second measurement. A port whose
 * destination is where it already stands is not a stage — the delta decides, as
 * it does in {@link direct}, and so does a destination the port has no room to
 * reach.
 */
function staged(
  lit: readonly [Element, ...Element[]],
  room: number,
  duration: number,
): Glide | undefined {
  const [anchor] = lit
  const ports = surfaceChain(anchor).flatMap((surface) => {
    const port = scrollport(surface)
    return port ? [{ surface, port, from: offsetOf(surface), limit: limitOf(surface) }] : []
  })
  const destinations = scrollStages(outset(around(lit), roomAround(anchor, room)), ports)
  const stages = ports
    .map(({ surface, from }, i) => ({ surface, from, to: destinations[i]! }))
    .filter(({ from, to }) => to.x !== from.x || to.y !== from.y)
  if (stages.length === 0) return undefined
  if (!animates(duration)) {
    for (const { surface, to } of stages) writeTo(surface, to)
    return undefined
  }
  return play(stages.toReversed(), duration)
}

/** One port's move: where it is now, and where it is going. */
interface Stage {
  surface: Surface
  from: Point
  to: Point
}

/** What a glide has running: a flight of frames, a beat between two, or nothing. */
type Running =
  | { kind: 'flying'; flight: Flight }
  | { kind: 'waiting'; beat: ReturnType<typeof setTimeout> }
  | { kind: 'over' }

/**
 * Run the stages in order, settled when the last one lands.
 *
 * The beat goes between two stages and neither before the first nor after the
 * last, so a single-stage glide is exactly the trip it always was. Its length
 * is {@link GLIDE_BEAT}, and each stage's is {@link glideDuration} of its own
 * distance.
 *
 * A stage somebody else takes over ends the glide there rather than handing on.
 * Not because the stages after it are wrong — each destination is its own
 * port's offset, and an outer port moving carries the box and the inner ports
 * together — but because their scroll is not Leko's to undo, which DESIGN.md
 * argues under **The viewer taking over**. Each stage reads the port it is
 * moving, so that rule is asked per port.
 *
 * **`over` is written by {@link Glide.abandon}, not only by the end of the
 * play.** A stage can land, resolve, and be abandoned before the resolution is
 * handled, and without it the next stage would start after the tour had moved
 * past the step it belongs to.
 */
function play(stages: readonly Stage[], duration: number): Glide {
  let settle!: () => void
  const settled = new Promise<void>((resolve) => {
    settle = resolve
  })
  let running: Running = { kind: 'over' }
  const over = (): void => {
    running = { kind: 'over' }
    settle()
  }
  const run = (index: number): void => {
    const stage = stages[index]
    if (!stage) return over()
    const { surface, from, to } = stage
    const length = glideDuration(Math.hypot(to.x - from.x, to.y - from.y), duration)
    const flight = frames(surface, from, to, length)
    running = { kind: 'flying', flight }
    void flight.landed.then((landed) => {
      if (running.kind === 'over') return
      if (!landed || index + 1 === stages.length) return over()
      running = { kind: 'waiting', beat: setTimeout(() => run(index + 1), GLIDE_BEAT) }
    })
  }
  run(0)
  return {
    settled,
    abandon: () => {
      if (running.kind === 'flying') running.flight.stop()
      if (running.kind === 'waiting') clearTimeout(running.beat)
      running = { kind: 'over' }
    },
  }
}

/**
 * How far apart two offsets can be and still be the same offset.
 *
 * A pixel: more than any rounding an engine does to what is written to it, and
 * less than any scroll a person makes. DESIGN.md, **The viewer taking over**.
 */
const TOLERANCE = 1

/** One port's frames in flight: whether it arrived, and how to stop it. */
interface Flight {
  /** `true` where it reached the destination, `false` where somebody else took the port. */
  landed: Promise<boolean>
  /** Cancels the next frame. `landed` then never resolves. */
  stop(): void
}

/**
 * Move `surface` from `from` to `to` over `length` ms.
 *
 * A frame loop on `requestAnimationFrame`, eased with the morph's own curve,
 * writing one instant scroll per frame from numbers computed before the
 * first, and ending on its own clock with the exact destination written on the
 * last frame. DESIGN.md, **The glide is Leko's own animation, the way the morph
 * is**, and CLAUDE.md's **Using the browser's smooth scroll for the glide** is
 * the shorter version of why.
 *
 * Each frame checks whether somebody else has moved this port — further than
 * {@link TOLERANCE} from where the last frame left it — before it writes, and
 * stops there if they have. DESIGN.md, **The viewer taking over**, which also
 * says why that read is neither layout nor the viewer's scroll. The caller
 * clamped the destination first, and DESIGN.md's
 * **The destination is clamped once, before the first frame** says what a loop
 * writing past the end would read back. What these frames cost on the main
 * thread is DESIGN.md's **What it costs**.
 */
function frames(surface: Surface, from: Point, to: Point, length: number): Flight {
  let land!: (landed: boolean) => void
  const landed = new Promise<boolean>((resolve) => {
    land = resolve
  })
  let frame: number | undefined
  let last = from
  const began = performance.now()
  const stop = (): void => {
    if (frame !== undefined) cancelAnimationFrame(frame)
    frame = undefined
  }
  const taken = (): boolean => {
    const at = offsetOf(surface)
    return Math.abs(at.x - last.x) > TOLERANCE || Math.abs(at.y - last.y) > TOLERANCE
  }
  const tick = (now: number): void => {
    frame = undefined
    if (taken()) return land(false)
    // Clamped at both ends, for the reason `segmentAt` in `geometry.ts` gives.
    const t = Math.min(1, Math.max(0, (now - began) / length))
    const eased = ease(t)
    last =
      t >= 1 ? to : { x: from.x + (to.x - from.x) * eased, y: from.y + (to.y - from.y) * eased }
    writeTo(surface, last)
    if (t >= 1) return land(true)
    frame = requestAnimationFrame(tick)
  }
  frame = requestAnimationFrame(tick)
  return { landed, stop }
}

/** Where a scrollable surface stands, in its own scroll offsets. */
function offsetOf(surface: Surface): Point {
  if (surface.kind === 'scroller') {
    return { x: surface.element.scrollLeft, y: surface.element.scrollTop }
  }
  return { x: window.scrollX, y: window.scrollY }
}

/** The largest offset a scrollable surface has: what its content leaves over its port. */
function limitOf(surface: Surface): Point {
  const el = surface.kind === 'scroller' ? surface.element : document.documentElement
  return { x: el.scrollWidth - el.clientWidth, y: el.scrollHeight - el.clientHeight }
}

/**
 * Put a scrollable surface at `at`.
 *
 * `instant` in so many words, every time it is meant. A host with
 * `scroll-behavior: smooth` on its root would otherwise animate a move Leko is
 * relying on having happened by the next line.
 */
function writeTo(surface: Surface, at: Point): void {
  const how: ScrollToOptions = { left: at.x, top: at.y, behavior: 'instant' }
  if (surface.kind === 'scroller') surface.element.scrollTo(how)
  else window.scrollTo(how)
}

/** The box around every element of `lit`, in viewport coordinates. */
function around(lit: readonly [Element, ...Element[]]): Rect {
  const [first, ...rest] = lit
  return union([bounds(first), ...rest.map(bounds)])
}

/** Where `el` is on screen, as a {@link Rect}. */
function bounds(el: Element): Rect {
  const r = el.getBoundingClientRect()
  return { x: r.left, y: r.top, width: r.width, height: r.height }
}

/** How much room to leave around a target: what the step asks, or what the page asks for more of. */
function roomAround(el: Element, room: number): Insets {
  const style = getComputedStyle(el)
  const side = (value: string): number => Math.max(room, parseFloat(value) || 0)
  return {
    top: side(style.scrollMarginTop),
    right: side(style.scrollMarginRight),
    bottom: side(style.scrollMarginBottom),
    left: side(style.scrollMarginLeft),
  }
}

/**
 * What a surface can be scrolled within, in viewport coordinates, or nothing
 * where it cannot be scrolled at all.
 *
 * The client box rather than the border box, both times: a scrollbar's gutter
 * is not somewhere a target can be brought to, and neither is a border.
 */
function scrollport(surface: Surface): Rect | undefined {
  if (surface.kind === 'viewport') return undefined
  if (surface.kind === 'document') {
    const root = document.documentElement
    return { x: 0, y: 0, width: root.clientWidth, height: root.clientHeight }
  }
  const el = surface.element
  const r = el.getBoundingClientRect()
  return {
    x: r.left + el.clientLeft,
    y: r.top + el.clientTop,
    width: el.clientWidth,
    height: el.clientHeight,
  }
}
