/**
 * The half that brings the page to a target before anything is drawn.
 *
 * Leko's own frame loop, the way the morph is, and never the browser's
 * `behavior: 'smooth'`: an animation Leko did not run has to be watched from
 * the outside, and every engine wanted a rule of its own for that. Nothing
 * here knows what a step is; it is handed the elements a hole will be cut
 * around and says when the page has stopped.
 *
 * DESIGN.md argues it under **Bringing a target into view**.
 */

import {
  clamp,
  ease,
  glideDuration,
  type Insets,
  outset,
  type Rect,
  scrollDelta,
  union,
} from './geometry.js'
import { animates } from './motion.js'
import { type Surface, surfaceChain } from './surface.js'

/**
 * A glide in flight: when the page has stopped, and how to stop it.
 *
 * `abandon` cancels the next frame and leaves the page where the last one put
 * it; `settled` then never resolves. The glide is Leko's own loop, so stopping
 * it is a `cancelAnimationFrame` and nothing has to be inferred about an
 * animation somebody else is running. A glide the tour has moved past stops
 * where it is rather than sliding on to a step the tour has left.
 */
export interface Glide {
  settled: Promise<void>
  abandon(): void
}

/**
 * Bring the box around `lit` to the middle of every scrollport that carries
 * it, and say when the page has stopped moving.
 *
 * **Before the draw, and never during it.** `undefined` means there is nothing
 * to wait for — every port already held the cutout, or the move was applied
 * outright — and the step is drawn in the same task. A {@link Glide} means the
 * page is moving, and whatever draws waits for it: a hole is drawn from where
 * the target is on screen, so a morph running alongside a glide is a hole
 * placed against a page that has since moved
 * (`spike/a-smooth-scroll-settling/`, question 1). Scroll tracking still runs
 * no JS: a scroll Leko started is not the viewer scrolling.
 *
 * **The page glides; a nested scroller is set.** The movement a viewer follows
 * is the page's, and a panel's inner scroll is a detail inside a box that is
 * not on screen yet. Setting it first also makes the page's own delta exact
 * rather than measured against a scroller still in flight. Gliding every port
 * together would need the document's destination worked out from the panel's
 * without re-measuring — the target moves in the viewport by exactly what the
 * panel scrolls, which is arithmetic — and is a second step if wanted.
 *
 * **The box around every element is what is brought in, and the first
 * element is what is scrolled.** A hole is not an element: a region of several
 * elements cuts one hole around all of them, and the hole is what the step is
 * about, so the hole is what has to end up in the port. Measured against the
 * first element alone, a hole around two elements sat half their gap low, and
 * one taller than half the port was centred as if it were small — which is the
 * case the top-edge rule in {@link scrollDelta} exists for. The box is measured
 * again for each port, because scrolling an inner scroller moves everything
 * inside it. The first element names the surfaces to scroll, on the
 * assumption that one hole's elements share them — nothing checks it, and a
 * hole spread across scrollers lands wherever scrolling the first element's
 * puts the rest, the same bargain a later region strikes. It is also the
 * element `scroll-margin` is read off, because that is the application's word
 * about the element it wrote it on.
 *
 * `room` is the hole's own overhang — the step's `padding` — so what is brought
 * in is the cutout rather than the bare box. `scroll-margin` on the first
 * element is honoured over it wherever it asks for more: a guess about how much
 * room a sticky header needs is exactly the thing an application already knows
 * and Leko does not.
 *
 * Where the box ends up is {@link scrollDelta}'s to say: the middle of the
 * port, or nowhere at all if the port already held it. The geometry does not
 * clamp, so a box near the end of the content asks for a scroll past the end.
 * A panel set outright is clamped by the port, as any scroll is. The page's
 * destination is clamped here, once, before the glide starts — see
 * {@link glide} for why the loop cannot leave that to the port — and a
 * destination that clamps to where the page already is means there is nothing
 * to glide, so that is drawn in the same task too.
 *
 * Innermost first. A `viewport` surface is skipped: what it carries is
 * `position: fixed` and has nowhere to be scrolled to.
 */
export function bringIntoView(
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
    // `instant` in so many words, every time it is meant. A host with
    // `scroll-behavior: smooth` on its root would otherwise animate a move this
    // is relying on having happened by the next line.
    if (surface.kind === 'scroller') {
      const panel = surface.element
      panel.scrollTo({
        left: panel.scrollLeft + delta.x,
        top: panel.scrollTop + delta.y,
        behavior: 'instant',
      })
      continue
    }
    // The document, which is the last surface of every chain that has one, so
    // there is nothing after this to measure.
    const from = { x: window.scrollX, y: window.scrollY }
    const root = document.documentElement
    const to = {
      x: clamp(from.x + delta.x, root.scrollWidth - root.clientWidth),
      y: clamp(from.y + delta.y, root.scrollHeight - root.clientHeight),
    }
    if (to.x === from.x && to.y === from.y) return undefined
    if (!animates(duration)) {
      window.scrollTo({ left: to.x, top: to.y, behavior: 'instant' })
      return undefined
    }
    // Grows with the distance rather than timed by the morph: what passes while
    // the page glides is part of what a viewer is there to see, and
    // `glideDuration` says how long that takes. `duration` is the floor.
    return glide(from, to, glideDuration(Math.hypot(to.x - from.x, to.y - from.y), duration))
  }
  return undefined
}

/**
 * How far apart two offsets can be and still be the same offset.
 *
 * An engine rounds what is written to it, and some report the offset back in
 * fractions, so a frame that reads back exactly what it wrote is not something
 * to rely on. A pixel is more than any rounding and less than any scroll a
 * person makes.
 */
const TOLERANCE = 1

/**
 * Glide the page from `from` to `to` over `length` ms, settled when it lands.
 *
 * **Leko's own animation, the way the morph is**, rather than the browser's
 * `behavior: 'smooth'`. A frame loop on `requestAnimationFrame`, eased with
 * the morph's own curve, writing one instant `scrollTo` per frame from numbers
 * it computed before the first one, and ending on its own clock with the exact
 * destination written on the last frame. Nothing then has to be inferred about
 * when an animation somebody else is running has ended, and nothing has to
 * stop it but Leko. The browser's glide had to be watched from the outside — a
 * `scrollend` listener, a check that the page had begun to move, a deadline
 * under both, and a heuristic telling a `scrollend` of this scroll from one
 * that was not — and each engine wanted a rule of its own besides
 * (`spike/a-smooth-scroll-settling/`, questions 2, 4 and 5, which are the
 * record of why it was given up).
 *
 * **The viewer taking over.** Each frame reads the page's offset before it
 * writes one, and where the page is not within {@link TOLERANCE} of where the
 * last frame left it, somebody else moved it: the loop stops and the page is
 * left where they put it, so the step is drawn against that. That read is of a
 * scroll offset, during a scroll Leko started; it is not layout and it is not
 * the viewer's scroll, so the rule that scroll tracking runs no JS is intact.
 *
 * **The destination is clamped before the first frame**, by the caller, to the
 * range the page can reach. A loop that wrote offsets past the end would read
 * them back clamped and take that for the viewer, so the range is read once,
 * up front, where reading layout is already allowed.
 *
 * On the main thread, as the morph is, and with the same cost: under load
 * these frames stutter where an engine's off-thread scroll would not, and on a
 * machine producing no frames the page jumps to the end on the next one. A
 * frame reads one offset and writes one, and reads no layout.
 */
function glide(
  from: { x: number; y: number },
  to: { x: number; y: number },
  length: number,
): Glide {
  let settle!: () => void
  const settled = new Promise<void>((resolve) => {
    settle = resolve
  })
  let frame: number | undefined
  let last = from
  const began = performance.now()
  const abandon = (): void => {
    if (frame !== undefined) cancelAnimationFrame(frame)
    frame = undefined
  }
  const taken = (): boolean =>
    Math.abs(window.scrollX - last.x) > TOLERANCE || Math.abs(window.scrollY - last.y) > TOLERANCE
  const tick = (now: number): void => {
    frame = undefined
    if (taken()) return settle()
    // Clamped at both ends: the frame's start time can predate the moment this
    // loop was scheduled, so the first frame's elapsed time is sometimes
    // negative.
    const t = Math.min(1, Math.max(0, (now - began) / length))
    const eased = ease(t)
    last =
      t >= 1 ? to : { x: from.x + (to.x - from.x) * eased, y: from.y + (to.y - from.y) * eased }
    window.scrollTo({ left: last.x, top: last.y, behavior: 'instant' })
    if (t >= 1) return settle()
    frame = requestAnimationFrame(tick)
  }
  frame = requestAnimationFrame(tick)
  return { settled, abandon }
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
