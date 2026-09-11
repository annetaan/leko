/**
 * What a layer of the scrim is carried by.
 *
 * A target rides whatever scrolls it, so the chain from an element out to the
 * document is what decides how many layers there are and which coordinate
 * space each one is written in. Everything here reads the page and owns
 * nothing: no element is created, and none is changed. The chain starts at the
 * element and ends at the document, or at the viewport where something on the
 * way is fixed — DESIGN.md, **A `position: fixed` target is carried by the
 * viewport, so its layer is too**.
 */

import { heldAgainst, inset, type Point, type Rect, shift, type StickyInsets } from './geometry.js'

/**
 * What carries a layer of the scrim when the page moves.
 *
 * A layer lives inside whatever moves its target, so that a scroll moves the
 * two together and nothing is recomputed: the scroller for a target inside
 * one, the document for a target in the page's own flow, and the viewport for
 * a target that `position: fixed` holds against it. A layer on that last
 * surface is fixed itself, the size of the viewport, and nothing about it
 * moves on scroll — which is the point, since nothing about its target does.
 *
 * `glued` is the same move one scroller in: what carries a `position: sticky`
 * target that has pinned is the scroller's scrollport rather than its content,
 * so the layer is held there while the content goes by. It is to `scroller`
 * what `viewport` is to `document`, and `position: fixed` cannot say it —
 * DESIGN.md, **A layer glued to a scrollport is what `position: fixed` cannot
 * say**.
 */
export type Surface =
  | { kind: 'viewport' }
  | { kind: 'document' }
  | { kind: 'scroller'; element: HTMLElement }
  | { kind: 'glued'; element: HTMLElement }

export function sameSurface(a: Surface, b: Surface): boolean {
  if (a.kind !== b.kind) return false
  if (a.kind === 'scroller' || a.kind === 'glued') {
    return a.element === (b as { element: HTMLElement }).element
  }
  return true
}

/**
 * Every surface between `el` and the viewport, innermost first, and whether
 * anything inside the innermost of them is `position: sticky`.
 *
 * A layer mounted outside the scroller it points into drifts off the target
 * the moment the user scrolls — and so does a document layer under a fixed
 * target, the other way round: the layer scrolls and the target stays.
 *
 * Fixed is asked first, because a fixed element is carried by none of its
 * ancestors — not the scroller it is written inside, not the document. It is
 * carried by the viewport alone, unless an ancestor has taken it back into
 * the flow; see {@link heldBy}.
 *
 * A sticky element is carried by its ancestors the way anything in the flow
 * is, right up until it pins, and then by the scrollport it is held against;
 * see {@link heldAt}.
 *
 * `sticky` is what says whether the hole has to be followed while the viewer
 * scrolls — DESIGN.md, **A sticky target's hole is corrected on a frame loop,
 * and that is the only exception to the ban**. It is answered by the same walk
 * because the walk already has every computed style it would take to ask
 * again. A sticky ancestor *outside* the innermost surface does not count:
 * what it pins is the panel, and the layer is inside that panel and pins with
 * it.
 */
export interface Carried {
  surfaces: Surface[]
  sticky: boolean
}

export function chainOf(el: Element): Carried {
  return outside(el, getComputedStyle(el))
}

export function surfaceChain(el: Element): Surface[] {
  return chainOf(el).surfaces
}

/**
 * Where a `scroll` that could move this chain's boxes is heard: the element
 * for either kind of scroller, and the window for the two that stand for the
 * page's own scroll.
 *
 * The ports are named rather than one capturing listener on the document,
 * because "a `scroll` does not bubble but is heard in the capture phase" is a
 * claim about a browser and would want a page under `spike/` behind it. The
 * chain is in hand at every draw, so naming them costs nothing and claims
 * nothing.
 */
export function portsOf(chain: readonly Surface[]): EventTarget[] {
  return chain.map((surface) =>
    surface.kind === 'scroller' || surface.kind === 'glued' ? surface.element : window,
  )
}

/**
 * What carries `node` from `node` outwards, its own scroll excepted.
 *
 * Both questions a position asks, in the one place either is asked, so that a
 * target and every ancestor between it and the document get the same answer:
 * a button in a fixed toolbar is the viewport's, and a button in a sticky bar
 * that has pinned is that bar's scrollport's.
 */
function outside(node: Element, style: CSSStyleDeclaration): Carried {
  if (style.position === 'fixed') return { surfaces: heldBy(node), sticky: false }
  const carried = carriedBy(node.parentElement)
  if (style.position !== 'sticky') return carried
  return { surfaces: heldAt(node, carried.surfaces, insetsOf(style)), sticky: true }
}

/**
 * The chain of a sticky element that has pinned: the innermost surface
 * swapped for the scrollport holding it, and everything outside it left alone.
 *
 * DESIGN.md argues the two states under **A sticky target is drawn in the
 * state it is in, and there are two**, and why the answer is read from the
 * inset under **Pinned is read from the inset, never from `offsetTop`**.
 *
 * The outer surfaces stay because a glued layer lives inside its scroller and
 * travels with it: the page scrolling still moves the panel, and the document
 * layer over it is as necessary as it ever was. A chain innermost at the
 * document swaps to the viewport, which is the same layer `position: fixed`
 * already gets, and one already inside a fixed subtree is held twice over and
 * is left as it stands.
 */
function heldAt(el: Element, chain: Surface[], insets: StickyInsets): Surface[] {
  const [innermost, ...outer] = chain
  if (!innermost) return chain
  const port = stickyPortOf(innermost)
  if (!port) return chain
  const r = el.getBoundingClientRect()
  const box = { x: r.left, y: r.top, width: r.width, height: r.height }
  if (!heldAgainst(box, port, insets)) return chain
  if (innermost.kind === 'document') return [{ kind: 'viewport' }]
  if (innermost.kind !== 'scroller') return chain
  return [{ kind: 'glued', element: innermost.element }, ...outer]
}

/**
 * The rectangle a sticky element is held within: the scrollport less the
 * scroller's own padding.
 *
 * Not {@link scrollportOf}, which is the padding box. An element asking for
 * `top: 0` comes to rest on the content box rather than the padding box, so a
 * scroller with padding would read as riding by exactly that padding —
 * DESIGN.md, **A layer glued to a scrollport is what `position: fixed` cannot
 * say**, which is the same fact the glued layer's own insets take back off.
 */
function stickyPortOf(surface: Surface): Rect | undefined {
  const port = scrollportOf(surface)
  if (!port) return undefined
  const el = surface.kind === 'scroller' ? surface.element : document.documentElement
  const style = getComputedStyle(el)
  return inset(port, {
    top: px(style.paddingTop),
    right: px(style.paddingRight),
    bottom: px(style.paddingBottom),
    left: px(style.paddingLeft),
  })
}

/** The four sticky insets as numbers, `auto` as `null`. */
function insetsOf(style: CSSStyleDeclaration): StickyInsets {
  return {
    top: asked(style.top),
    right: asked(style.right),
    bottom: asked(style.bottom),
    left: asked(style.left),
  }
}

/** A length in px, or `0` where there is none. */
const px = (value: string): number => parseFloat(value) || 0

/** A used inset in px, or `null` for the `auto` that asks for nothing. */
const asked = (value: string): number | null => {
  const n = parseFloat(value)
  return Number.isNaN(n) ? null : n
}

/**
 * The layout viewport, in the space `getBoundingClientRect` answers in.
 *
 * **`clientWidth` and `clientHeight` on the root, not `innerWidth` and
 * `innerHeight`.** The initial containing block has the scrollbar gutter taken
 * off it, and a box read off the page is in that same space, so a comparison
 * against `innerWidth` puts everything a gutter too far out. `close.ts` and
 * `presenter.ts` both place chrome from this, and `in-viewport-first` asks
 * whether a match is in it — DESIGN.md, **Which of several matches a selector
 * means**. Pinch zoom is no part of it: `visualViewport` is a different space
 * from the boxes this is compared with.
 */
export function layoutViewport(): Rect {
  const root = document.documentElement
  return { x: 0, y: 0, width: root.clientWidth, height: root.clientHeight }
}

/**
 * What a surface can be scrolled within, in viewport coordinates, or nothing
 * where it cannot be scrolled at all.
 *
 * The client box rather than the border box, both times: a scrollbar's gutter
 * is not somewhere a target can be brought to, and neither is a border. It is
 * also the box a sticky descendant is held against, which is why this is here
 * rather than in `glide.ts`, which was where it started.
 */
export function scrollportOf(surface: Surface): Rect | undefined {
  if (surface.kind === 'viewport' || surface.kind === 'glued') return undefined
  if (surface.kind === 'document') return layoutViewport()
  const el = surface.element
  const r = el.getBoundingClientRect()
  return {
    x: r.left + el.clientLeft,
    y: r.top + el.clientTop,
    width: el.clientWidth,
    height: el.clientHeight,
  }
}

/**
 * The surfaces of a fixed element: the viewport, unless an ancestor holds it.
 *
 * Several properties on an ancestor make it the containing block of every
 * fixed descendant, and the element then rides that ancestor rather than the
 * viewport, its scroll included. So what carries the ancestor is what carries
 * the element. DESIGN.md argues that under **Whether the viewport still holds
 * a fixed element is the engine's to say, not a list's**, with the properties
 * and the page that watched them.
 *
 * An `<svg>` root can be fixed too and has no `offsetParent`, so it is drawn
 * as the viewport's. A fixed SVG root under a transformed ancestor is a corner
 * this does not turn.
 */
function heldBy(el: Element): Surface[] {
  const block = el instanceof HTMLElement ? el.offsetParent : null
  return block ? carriedBy(block).surfaces : [{ kind: 'viewport' }]
}

/**
 * The surfaces of whatever `node` carries: `node`'s own scroll, where it has
 * one, and then whatever carries `node`. Ends at the document, which is what
 * the body and the root stand for here — neither is a scroller of its own, and
 * a `parentElement` of `null` is a shadow root, whose host page is left to be
 * the document too.
 */
function carriedBy(node: Element | null): Carried {
  if (!node || node === document.body || node === document.documentElement) {
    return { surfaces: [{ kind: 'document' }], sticky: false }
  }
  const style = getComputedStyle(node)
  const scrolls = /auto|scroll|overlay/.test(style.overflowY + style.overflowX)
  const overflows = node.scrollHeight > node.clientHeight || node.scrollWidth > node.clientWidth
  // `node`'s own scroll is inside whatever holds `node`, so a pin outside it
  // leaves it alone: what is glued is the surface `node` sits in, not `node`'s
  // own. That is also where the walk stops asking about sticky: everything
  // from here out is outside the innermost surface.
  if (scrolls && overflows && node instanceof HTMLElement) {
    return {
      surfaces: [{ kind: 'scroller', element: node }, ...outside(node, style).surfaces],
      sticky: false,
    }
  }
  return outside(node, style)
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
  // A glued layer is held on the padding box and the scroll goes by underneath
  // it, so its space begins there and the offsets are no part of it. That is
  // the whole of the difference between the two kinds.
  const scrolled = surface.kind === 'scroller'
  return {
    x: c.left + container.clientLeft - (scrolled ? container.scrollLeft : 0),
    y: c.top + container.clientTop - (scrolled ? container.scrollTop : 0),
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
