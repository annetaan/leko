/**
 * What a layer of the scrim is carried by.
 *
 * A target rides whatever scrolls it, so the chain from an element out to the
 * document is what decides how many layers there are and which coordinate
 * space each one is written in. Everything here reads the page and owns
 * nothing: no element is created, and none is changed. The chain starts at the
 * element and ends at the document, or at the viewport where something on the
 * way is fixed.
 *
 * DESIGN.md argues it under **Scrolling**.
 */

import { type Point, type Rect, shift } from './geometry.js'

/**
 * What carries a layer of the scrim when the page moves.
 *
 * A layer lives inside whatever moves its target, so that a scroll moves the
 * two together and nothing is recomputed: the scroller for a target inside
 * one, the document for a target in the page's own flow, and the viewport for
 * a target that `position: fixed` holds against it. A layer on that last
 * surface is fixed itself, the size of the viewport, and nothing about it
 * moves on scroll — which is the point, since nothing about its target does.
 */
export type Surface =
  | { kind: 'viewport' }
  | { kind: 'document' }
  | { kind: 'scroller'; element: HTMLElement }

export function sameSurface(a: Surface, b: Surface): boolean {
  if (a.kind === 'scroller' && b.kind === 'scroller') return a.element === b.element
  return a.kind === b.kind
}

/**
 * Every surface between `el` and the viewport, innermost first.
 *
 * This matters more than it looks. A layer has to live inside the thing that
 * moves its target, so that a scroll moves the two together and no position
 * math runs per frame. A layer mounted outside the scroller it points into
 * drifts off the target the moment the user scrolls — and so does a document
 * layer under a fixed target, the other way round: the layer scrolls and the
 * target stays.
 *
 * Fixed is asked first, because a fixed element is carried by none of its
 * ancestors — not the scroller it is written inside, not the document. It is
 * carried by the viewport alone, unless an ancestor has taken it back into
 * the flow; see {@link heldBy}.
 */
export function surfaceChain(el: Element): Surface[] {
  return getComputedStyle(el).position === 'fixed' ? heldBy(el) : carriedBy(el.parentElement)
}

/**
 * The surfaces of a fixed element: the viewport, unless an ancestor holds it.
 *
 * An ancestor with a transform, a perspective, a filter, a `will-change` for
 * one of those, `contain: layout` or `paint`, or `content-visibility` becomes
 * the containing block of every fixed descendant, and the element then behaves
 * as an absolutely positioned child of that ancestor: it rides the page with
 * it, and rides its scroll if it scrolls. So what carries the ancestor is what
 * carries the element, the ancestor's own scroll included.
 *
 * **The engine is asked rather than a list kept.** `offsetParent` on a fixed
 * element is `null` while the viewport holds it and names the ancestor
 * otherwise, in every engine — `spike/fixed-under-an-ancestor/` walks the
 * properties that do it and watches all three and Safari agree. That is what the engines
 * do rather than what the specification says, which is `null` for any fixed
 * element; the page is what says it can be relied on. A list would have to be
 * kept up with every property that grows this effect, and `content-visibility`
 * was the last one to.
 *
 * An `<svg>` root can be fixed too and has no `offsetParent`, so it is drawn
 * as the viewport's. A fixed SVG root under a transformed ancestor is a corner
 * this does not turn.
 */
function heldBy(el: Element): Surface[] {
  const block = el instanceof HTMLElement ? el.offsetParent : null
  return block ? carriedBy(block) : [{ kind: 'viewport' }]
}

/**
 * The surfaces of whatever `node` carries: `node`'s own scroll, where it has
 * one, and then whatever carries `node`. Ends at the document, which is what
 * the body and the root stand for here — neither is a scroller of its own, and
 * a `parentElement` of `null` is a shadow root, whose host page is left to be
 * the document too.
 */
function carriedBy(node: Element | null): Surface[] {
  if (!node || node === document.body || node === document.documentElement) {
    return [{ kind: 'document' }]
  }
  const style = getComputedStyle(node)
  const scrolls = /auto|scroll|overlay/.test(style.overflowY + style.overflowX)
  const overflows = node.scrollHeight > node.clientHeight || node.scrollWidth > node.clientWidth
  const own: Surface[] =
    scrolls && overflows && node instanceof HTMLElement ? [{ kind: 'scroller', element: node }] : []
  const rest = style.position === 'fixed' ? heldBy(node) : carriedBy(node.parentElement)
  return [...own, ...rest]
}

/**
 * Where this surface's coordinate space begins, seen from the viewport's.
 *
 * The two spaces differ by a translation and nothing else, and this is the
 * translation: the point on screen that the layer calls its own zero. A
 * document scrolled down 200px has its origin 200px above the top of the
 * screen, so this answers `{0, -200}`; a scroller's is inside its border,
 * moved by however far its content has been scrolled. Add it to a rect in this
 * space and the rect is on screen; take it away from one on screen and the
 * rect is in this space. {@link rectWithin} is the second of those, written
 * out.
 *
 * **Read once a draw, not once an element.** A scroller is the only kind that
 * costs anything — one `getBoundingClientRect` on the container — and a step
 * whose region unions four elements inside one used to pay for that four
 * times, because the container was measured again beside every element. The
 * surface is the same for all of them, so the answer is too.
 *
 * `Scrim.seen()` says the same thing about the same surfaces with no read at
 * all, because a layer already sits in the space it is asking about. This is
 * for callers that are outside it and holding boxes read on screen.
 */
export function originOf(surface: Surface): Point {
  if (surface.kind === 'viewport') return { x: 0, y: 0 }
  if (surface.kind === 'document') return { x: -window.scrollX, y: -window.scrollY }
  const container = surface.element
  const c = container.getBoundingClientRect()
  return {
    x: c.left + container.clientLeft - container.scrollLeft,
    y: c.top + container.clientTop - container.scrollTop,
  }
}

/**
 * How far a box read on screen moves to land in the space `surface` carries:
 * {@link originOf} the other way round.
 *
 * **The one place that sign is written.** Everything that comes back off the
 * screen into a layer's own coordinates goes through here, so there is one
 * spelling of what a surface's space is and one of how to get into it. A
 * second of either is a second place for the document's scroll and a
 * scroller's border to be got wrong.
 */
const into = (surface: Surface): Point => {
  const origin = originOf(surface)
  return { x: -origin.x, y: -origin.y }
}

/**
 * Boxes already read on screen, in the coordinate space of the layer on
 * `surface`.
 *
 * A list, because the surface is asked once for all of them: one draw's holes
 * are all in the same space, and a scroller measured again beside each of them
 * is the cost this exists to refuse. What comes back is what went in — a
 * `Cutout` keeps its radius and whether the step opened it — because
 * {@link shift} carries the rest of the shape along.
 *
 * For a caller holding boxes rather than elements. {@link rectWithin} is the
 * same move for a caller holding one element, and goes the same way in.
 */
export function withinSurface<T extends Rect>(surface: Surface, rects: readonly T[]): T[] {
  const by = into(surface)
  return rects.map((rect) => shift(rect, by))
}

/**
 * An element's box in the coordinate space of the layer on `surface`.
 *
 * The box on screen, moved in by {@link into}. Written that way round so that
 * what a surface's space *is* is said in {@link originOf} alone.
 */
export function rectWithin(el: Element, surface: Surface): Rect {
  const r = el.getBoundingClientRect()
  return shift({ x: r.left, y: r.top, width: r.width, height: r.height }, into(surface))
}

/**
 * The area a nested scroller's own layer covers: its padding box, since that is
 * where an absolutely positioned child of it begins. An outer layer cut to the
 * border box instead would leave the scroller's border undimmed — a bright
 * hairline around the panel.
 */
export function paddingBoxWithin(el: HTMLElement, surface: Surface): Rect {
  const style = getComputedStyle(el)
  const [top, right, bottom, left] = [
    style.borderTopWidth,
    style.borderRightWidth,
    style.borderBottomWidth,
    style.borderLeftWidth,
  ].map((v) => parseFloat(v) || 0) as [number, number, number, number]
  const r = rectWithin(el, surface)
  return {
    x: r.x + left,
    y: r.y + top,
    width: r.width - left - right,
    height: r.height - top - bottom,
  }
}
