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
 * it; `settled` then never resolves — the rule DESIGN.md states for a glide
 * the tour has moved past, under **Bringing a target into view**.
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
 * to wait for and the step is drawn in the same task; a {@link Glide} means the
 * page is moving and whatever draws waits for it. DESIGN.md, **A port that
 * needs no scroll is never waited on**.
 *
 * The page glides and a nested scroller is set, innermost first, and DESIGN.md
 * argues the split — and the arithmetic gliding both together would need —
 * under **The page glides; a nested panel is set**. A `viewport` surface is
 * skipped: DESIGN.md, **A `position: fixed` target is not scrolled**.
 *
 * **The box around every element is what is brought in, and the first element
 * is what is scrolled.** DESIGN.md argues the first half, and what measuring
 * the element instead cost, under **What is brought in is the first region's
 * hole, not its first element**. The box is measured again for each port,
 * because scrolling an inner scroller moves everything inside it. The first
 * element names the surfaces to scroll, on the assumption that one hole's
 * elements share them — nothing checks it, and a hole spread across scrollers
 * lands wherever scrolling the first element's puts the rest.
 *
 * `room` is the hole's own overhang — the step's `padding` — so what is brought
 * in is the cutout rather than the bare box, and `scroll-margin` on the first
 * element wins over it wherever it asks for more. DESIGN.md,
 * **`scroll-margin` on the target wins over the step's `padding`**.
 *
 * Where the box ends up is {@link scrollDelta}'s to say, and it does not clamp:
 * DESIGN.md, **Nothing in the geometry clamps; whoever scrolls does**. A panel
 * set outright is clamped by the port; the page's destination is clamped here,
 * once, before the glide starts, and DESIGN.md says why the loop cannot leave
 * that to the port under **The destination is clamped once, before the first
 * frame**. A destination that clamps to where the page already is means there
 * is nothing to glide, so that is drawn in the same task too.
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
    // Grows with the distance rather than timed by the morph; `glideDuration`
    // says how long that takes and `duration` is the floor.
    return glide(from, to, glideDuration(Math.hypot(to.x - from.x, to.y - from.y), duration))
  }
  return undefined
}

/**
 * How far apart two offsets can be and still be the same offset.
 *
 * A pixel: more than any rounding an engine does to what is written to it, and
 * less than any scroll a person makes. DESIGN.md, **The viewer taking over**.
 */
const TOLERANCE = 1

/**
 * Glide the page from `from` to `to` over `length` ms, settled when it lands.
 *
 * A frame loop on `requestAnimationFrame`, eased with the morph's own curve,
 * writing one instant `scrollTo` per frame from numbers computed before the
 * first, and ending on its own clock with the exact destination written on the
 * last frame. DESIGN.md, **The glide is Leko's own animation, the way the morph
 * is**, and CLAUDE.md's **Using the browser's smooth scroll for the glide** is
 * the shorter version of why.
 *
 * Each frame checks whether somebody else has moved the page — further than
 * {@link TOLERANCE} from where the last frame left it — before it writes, and
 * stops there if they have. DESIGN.md, **The viewer taking over**, which also
 * says why that read is neither layout nor the viewer's scroll. The caller
 * clamped the destination first, and DESIGN.md's
 * **The destination is clamped once, before the first frame** says what a loop
 * writing past the end would read back. What these frames cost on the main
 * thread is DESIGN.md's **What it costs**.
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
    // Clamped at both ends, for the reason `segmentAt` in `geometry.ts` gives.
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
