import {
  complementRects,
  type Cutout,
  hasArea,
  type Insets,
  lerpCutouts,
  maskLayers,
  outset,
  padCutouts,
  type Rect,
  scrollDelta,
  segmentAt,
  union,
} from './geometry.js'

/**
 * What the halo does while a hole is on its way somewhere else.
 *
 * The frames ride the morph either way, written along the same numbers the
 * path is built from; the mode decides the paint. `'return'` is the message's
 * answer: they fade out in flight and fade back in with the holes they frame.
 * `'follow'` keeps them on the whole way — for a host that styles every hole
 * alike and wants the glow to travel. A host that lights the open hole apart
 * from the shown ones can still follow; `data-open` flips when the flight
 * starts, because that is the hole the frame is already becoming.
 */
export type HaloMode = 'return' | 'follow'

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

/** An element's box in the coordinate space of the layer on `surface`. */
export function rectWithin(el: Element, surface: Surface): Rect {
  const r = el.getBoundingClientRect()
  if (surface.kind === 'viewport') return { x: r.left, y: r.top, width: r.width, height: r.height }
  if (surface.kind === 'document') {
    return {
      x: r.left + window.scrollX,
      y: r.top + window.scrollY,
      width: r.width,
      height: r.height,
    }
  }
  const container = surface.element
  const c = container.getBoundingClientRect()
  return {
    x: r.left - c.left - container.clientLeft + container.scrollLeft,
    y: r.top - c.top - container.clientTop + container.scrollTop,
    width: r.width,
    height: r.height,
  }
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

export const prefersReducedMotion = (): boolean =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Whether a change of `duration` is animated at all, or applied outright.
 *
 * One rule, read by the morph and by the scroll that precedes it, so the two
 * can never disagree about whether the tour is moving things or setting them.
 * A host that asked for no morph did not ask for a gliding page either.
 */
const animates = (duration: number): boolean => duration > 0 && !prefersReducedMotion()

/**
 * How long a glide is waited for before it is called over regardless.
 *
 * `scrollend` is what ends the wait — it is Baseline 2025 and fires in every
 * engine, including for a scroll an engine chose to apply outright
 * (`spike/a-smooth-scroll-settling/`). This is only the net under it: an event
 * that never comes must not leave a tour with nothing drawn. Generous on
 * purpose, because the failure it guards against is rare and the failure of
 * cutting a glide short is the one this whole staging exists to avoid — the
 * longest scroll measured, 5000px in Chromium, stops at 1160ms and its
 * `scrollend` lands 34ms after that.
 */
const SETTLE = 2500

/**
 * How long a glide is given to have moved the page before it is set outright.
 *
 * Long enough that every engine measured has begun moving — Firefox is the
 * slowest to start and is moving by its second frame — and short enough that a
 * scroll nobody is going to make costs a jump rather than a wait. What it costs
 * is a glide that has not begun in 120ms, which becomes a jump; on a machine
 * that cannot produce a frame in that time, the glide was not going to be
 * seen.
 */
const START = 120

/**
 * A glide in flight: when the page has settled, and how to stop waiting on it.
 *
 * `abandon` ends the wait and nothing else — the timers and the listener go,
 * and `settled` never resolves. It does not stop the scroll, because nothing
 * can: an instant scroll to where the page is leaves Firefox gliding on to the
 * original destination and Chromium a frame further with no `scrollend` to
 * follow (`spike/a-smooth-scroll-settling/`, question 5). What it is for is
 * the check the wait would otherwise still make. A glide the tour has moved
 * past must not set the page outright, a moment later, to somewhere the tour
 * no longer is.
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
 * page is moving, and whatever draws waits for it: at 320ms into a smooth
 * scroll Chromium can still have about half of a 5000px trip to go, and a hole
 * is drawn from where the target is on screen, so a morph running alongside a
 * glide is a hole placed against a page that has since moved
 * (`spike/a-smooth-scroll-settling/`). Scroll tracking still runs no JS: a
 * scroll Leko started is not the viewer scrolling.
 *
 * **The page glides; a nested scroller is set.** Firefox does not animate a
 * programmatic smooth scroll of a scroller well below the fold — it does not
 * scroll it at all, and fires no `scrollend` to say so (question 4 of the same
 * page) — and below the fold is exactly where a panel is while the page has yet
 * to arrive at it. So a panel is put where it belongs outright, which also
 * makes the page's own delta exact rather than measured against a scroller
 * still in flight. The movement a viewer follows is the page's, and a panel's
 * inner scroll is a detail inside a box that is not on screen yet.
 *
 * **An offset is asked for, never a delta**, though a delta is what the
 * geometry hands back. `scrollBy` resolves against where the engine says the
 * port is, and while a glide is in flight WebKit says somewhere `scrollY` does
 * not: a `scrollBy` started 100ms into a glide landed 474px off there, where a
 * `scrollTo` of the same offset landed exactly (question 5 of the same page).
 * The box was measured against the `scrollY` this task can see, so that is
 * the offset the sum is right in — which is what makes a step that arrives
 * mid-glide and scrolls land where it meant to.
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
 * port, or nowhere at all if the port already held it. Nothing here clamps —
 * the port does, so a box near the end of the content lands as near the middle
 * as the content allows.
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
    const to = { x: window.scrollX + delta.x, y: window.scrollY + delta.y }
    if (!animates(duration)) {
      window.scrollTo({ left: to.x, top: to.y, behavior: 'instant' })
      return undefined
    }
    return glide(to)
  }
  return undefined
}

/**
 * Scroll the page smoothly to `to`, settled once it has stopped.
 *
 * `scrollend` is the whole of the answer where it arrives, and it arrives in
 * every engine — up to 183ms after the offset itself stops in Firefox, which is
 * a wait taken rather than a poll started. The deadline under it is a net, not
 * a fallback: see {@link SETTLE}.
 *
 * A `scrollend` the viewer caused settles this too, and that is right — they
 * scrolled during the glide, so the page is where they left it and the step
 * belongs against that. One that arrives while the page is still exactly where
 * it was does not: it belongs to whatever moved the page a moment before, and
 * taking it would draw the step before the glide had begun.
 *
 * **A page that has not moved at all is set outright, and the wait ends.** A
 * glide is started only where there was a delta to cover, so a page still
 * exactly where it was is a scroll that did not happen, and setting it is
 * unambiguous. Two things get here. A delta the port cannot honour — a target
 * hanging off an edge the page is already against — moves nothing, and a
 * scroll that moves nothing has nothing to say it is over. And an engine that
 * drops the scroll in silence, which Firefox does to a scroller below the fold
 * (`spike/a-smooth-scroll-settling/`, question 4). No engine has been seen to
 * do that to the document and nothing here claims one does; the failure has
 * been watched to exist, and guarding against it costs a jump where a glide
 * would have done. Moved but short is left alone: that is a viewer who took
 * over, and their scroll is not Leko's to undo.
 *
 * **On a timer, never on an animation frame.** On the two-core CI runner a
 * single frame has been watched taking more than three seconds while timers
 * went on ticking at 16ms. On such a machine a check that waits for frames
 * lands after {@link SETTLE} has already decided, and the deadline is made of
 * a timer too.
 */
function glide(to: { x: number; y: number }): Glide {
  const from = { x: window.scrollX, y: window.scrollY }
  const unmoved = (): boolean => window.scrollX === from.x && window.scrollY === from.y
  let settle!: () => void
  const settled = new Promise<void>((resolve) => {
    settle = resolve
  })
  let done = false
  /** Stop waiting, and only that. */
  function abandon(): void {
    done = true
    clearTimeout(over)
    clearTimeout(starting)
    window.removeEventListener('scrollend', ended)
  }
  function finish(): void {
    abandon()
    settle()
  }
  /** Where the page has not moved at all, set it outright. Whether it did. */
  function insist(): boolean {
    if (!unmoved()) return false
    window.scrollTo({ left: to.x, top: to.y, behavior: 'instant' })
    return true
  }
  function ended(): void {
    if (!done && !unmoved()) finish()
  }
  const over = setTimeout(() => {
    if (done) return
    insist()
    finish()
  }, SETTLE)
  const starting = setTimeout(() => {
    if (!done && insist()) finish()
  }, START)
  window.addEventListener('scrollend', ended)
  window.scrollTo({ left: to.x, top: to.y, behavior: 'smooth' })
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

/**
 * The name the message anchors to. Declared here because this is the file that
 * makes the element carrying it, and read in `message.ts`, which is the only
 * thing that ever asks for it.
 */
export const MESSAGE_ANCHOR = '--leko-message-anchor'

/** Ease out, so a cutout arrives rather than stops. */
const ease = (t: number): number => 1 - (1 - t) ** 3

/**
 * A single full-size element with the cutouts clipped out of it.
 *
 * Everything structural is set inline, so Leko renders correctly whether or not
 * the consumer imported the stylesheet. `leko.css` only carries the defaults for
 * the `--leko-*` custom properties, which are read here through `var()` with
 * fallbacks and can be overridden from anywhere.
 */
export class Scrim {
  readonly element: HTMLElement
  /**
   * The point a message anchors itself to, in this scrim's coordinate space.
   *
   * A zero-area element of Leko's own rather than the target itself, and it is
   * what lets a message sit beside anything the scrim can cut a hole around.
   * An `anchor-name` is scoped to the tree its element is in, so a target inside
   * a shadow root cannot be named from the document and the browser reports
   * nothing when it fails — `spike/anchor-across-shadow/` is the page. Naming
   * the target also meant writing into the host page's inline style and putting
   * back whatever was there, and this owes nobody that.
   *
   * It sits beside the scrim rather than inside it, so the clip and the
   * blocking rectangles know nothing about it. It follows a scroll for exactly
   * the reason the scrim does: the container moves both, and no script runs.
   */
  private marker: HTMLElement | undefined
  /** What carries this layer; see {@link Surface}. */
  readonly surface: Surface
  /** A scroller's own `position`, where this layer had to give it one; see the constructor. */
  private readonly restorePosition: string | null
  private cutouts: Cutout[] = []
  /**
   * The surface's size, kept from the one measurement {@link resize} makes.
   * It is what {@link paint} and {@link block} build from, so that neither —
   * and above all no frame of a morph — has to read layout to know it.
   */
  private width = 0
  private height = 0
  /**
   * Whether what is on screen is {@link converge}'s stretched cutouts rather
   * than a step's holes.
   *
   * The halos are the only thing that asks. Everything else treats them like
   * any other cutout, because for everything else they are.
   */
  private converging = false
  /**
   * Where the blocking rectangles live. **Beside the scrim, never inside it.**
   *
   * They were moved out because a `clip-path` clips its descendants out of
   * hit-testing along with itself, so a rectangle inside the scrim and over one
   * of its holes caught nothing — `spike/blocking-a-hole/` is the page, and it
   * mattered the moment a step showed a hole it did not open. A mask does no
   * such thing, so that reason is gone and they stay out here for a plainer
   * one: **the scrim paints and catches nothing, this catches and paints
   * nothing**, and keeping them apart makes each one's `pointer-events` a fact
   * about an element rather than something to work out.
   */
  private readonly blocking: HTMLElement
  /** The rectangles themselves; see {@link block}. */
  private blockers: HTMLElement[] = []
  /**
   * Where the halos live, or `undefined` on a scrim that draws none.
   *
   * A halo is a paint-only frame around a cutout, for the host to style — Leko
   * ships every token as `none`, so until a host sets `--leko-halo-*` this
   * layer paints nothing at all. It exists because the hole itself has no
   * element to decorate: the cutout is an absence of geometry, and there is
   * nothing there for a host's CSS to select.
   *
   * The one thing a halo must never do is what constraint 1 forbids: get
   * between the user and an open hole. So it is built the way the scrim is —
   * `pointer-events: none` on everything, catching nothing — and it paints
   * outside the hole by construction: the element sits exactly on the cutout,
   * transparent, and `outline` and an outer `box-shadow` are both painted
   * strictly outside the border box (`spike/halo-outside-the-hole/` watches a
   * browser do it). A host that sets a negative `--leko-halo-offset` or an
   * inset shadow is painting over its own target, and may.
   */
  private readonly haloLayer: HTMLElement | undefined
  /** What the halos do during a morph; `undefined` on a scrim that draws none. */
  private readonly halo: HaloMode | undefined
  /** The frames themselves, one per cutout; see {@link placeHalos}. */
  private halos: HTMLElement[] = []
  private frame: number | undefined
  private settle: ((finished: boolean) => void) | undefined
  /**
   * The morph in flight, or `undefined` between morphs. A shake is never held
   * here: what this exists for is telling a step still arriving apart from one
   * that has arrived, and only {@link morph} is an arrival.
   */
  private arriving: Promise<boolean> | undefined

  /**
   * `halo` says whether this scrim frames its cutouts for the host to style,
   * and what the frames do during a morph — see {@link HaloMode}. Only the
   * layer carrying the step's cutouts should be given one: an outer layer's
   * one hole is the scroller the next layer lives in, which is plumbing rather
   * than anything the step is pointing at.
   */
  constructor(surface: Surface, halo?: HaloMode) {
    this.surface = surface
    this.halo = halo

    // An absolutely positioned child only lands on the content origin if the
    // scroller establishes a containing block. Nudge it if it does not, and put
    // it back on destroy.
    const container = surface.kind === 'scroller' ? surface.element : null
    if (container && getComputedStyle(container).position === 'static') {
      this.restorePosition = container.style.position
      container.style.position = 'relative'
    } else {
      this.restorePosition = null
    }

    // Everything of this layer's is positioned alike, and the surface says
    // how: absolutely, to ride the scroller or the document it is inside, or
    // fixed on the viewport's layer, so that nothing about it moves when the
    // page scrolls under its target.
    const position = this.positioning()
    const el = document.createElement('div')
    el.className = 'leko-scrim'
    el.setAttribute('aria-hidden', 'true')
    Object.assign(el.style, {
      position,
      left: '0',
      top: '0',
      background: 'var(--leko-scrim-color, rgb(0 0 0 / 0.45))',
      zIndex: 'var(--leko-z, 9999)',
      // This element paints and nothing else. The blocking is done beside it,
      // for the reason set out on `blocking`.
      pointerEvents: 'none',
    })
    this.element = el

    const blocking = document.createElement('div')
    blocking.className = 'leko-blocking'
    blocking.setAttribute('aria-hidden', 'true')
    Object.assign(blocking.style, {
      position,
      left: '0',
      top: '0',
      // The same stacking level as the scrim, and after it in the tree, so a
      // rectangle over a hole is above the scrim that has no paint there.
      zIndex: 'var(--leko-z, 9999)',
      // Nothing is caught by the layer itself. Its rectangles ask for it.
      pointerEvents: 'none',
    })
    this.blocking = blocking

    if (halo) {
      const halos = document.createElement('div')
      halos.className = 'leko-halos'
      halos.setAttribute('aria-hidden', 'true')
      Object.assign(halos.style, {
        position,
        left: '0',
        top: '0',
        // With the scrim and after the blocking in the tree, so the paint
        // lands on top of both. Paint is all it is.
        zIndex: 'var(--leko-z, 9999)',
        pointerEvents: 'none',
      })
      this.haloLayer = halos
    }

    this.mount().append(el, blocking, ...(this.haloLayer ? [this.haloLayer] : []))
    this.resize()
  }

  /** Where this layer's elements go: inside the scroller, or on the body for the other two. */
  private mount(): HTMLElement {
    return this.surface.kind === 'scroller' ? this.surface.element : document.body
  }

  /** How everything of this layer's is positioned; see the constructor. */
  private positioning(): 'fixed' | 'absolute' {
    return this.surface.kind === 'viewport' ? 'fixed' : 'absolute'
  }

  /**
   * Put the anchor point where the message asked for it, in this scrim's
   * coordinates. Written once per step rather than per frame, the same as the
   * cutouts, because the container carries both from then on.
   */
  anchorAt(x: number, y: number): void {
    // Made on demand, and only ever by the innermost scrim. Every layer making
    // one would put the same `anchor-name` on several elements at once, and a
    // name that answers to more than one element is a name that answers to the
    // wrong one.
    if (!this.marker) {
      const mark = document.createElement('div')
      mark.className = 'leko-anchor'
      mark.setAttribute('aria-hidden', 'true')
      Object.assign(mark.style, {
        position: this.positioning(),
        width: '0',
        height: '0',
        pointerEvents: 'none',
      })
      mark.style.setProperty('anchor-name', MESSAGE_ANCHOR)
      this.marker = mark
      this.mount().append(mark)
    }
    Object.assign(this.marker.style, { left: `${x}px`, top: `${y}px` })
  }

  /**
   * Cover the whole scrollable area, not just the visible part — or, on the
   * viewport's layer, the viewport itself, which is all there is to cover.
   *
   * That is `innerWidth` and `innerHeight`, the scrollbar's gutter included,
   * and not the layout viewport a fixed box is laid out against. The layout
   * viewport is the tighter, more obviously correct number and it is only
   * correct at the instant it is read: a page that shortens under a tour loses
   * its scrollbar, `clientWidth` grows by the gutter's width, and a layer
   * measured before that is left too narrow — a strip of the application the
   * step did not open, neither painted nor blocked, for the rest of the step. A
   * `resize` event does not fire for it, so nothing here would hear about it.
   * The inner pair does not move when the scrollbar does, so it cannot be
   * caught out that way, and `spike/the-scrollbar-gutter/` measures what it
   * costs: a fixed box past the layout viewport adds no scrollable overflow in
   * any engine, so a scrim covering the gutter cannot grow a scrollbar out of
   * the page it is dimming, and the scrollbar goes on painting over a box that
   * covers its gutter, so covering it shows nothing. Going the other way is
   * harmless: a page that
   * grows a scrollbar mid-step leaves the layer a gutter too wide, and a fixed
   * box is clipped to the viewport, so nothing shows.
   */
  resize(): void {
    const root = document.documentElement
    const [w, h] =
      this.surface.kind === 'scroller'
        ? [this.surface.element.scrollWidth, this.surface.element.scrollHeight]
        : this.surface.kind === 'viewport'
          ? [window.innerWidth, window.innerHeight]
          : [
              Math.max(root.scrollWidth, window.innerWidth),
              Math.max(root.scrollHeight, window.innerHeight),
            ]
    this.width = w
    this.height = h
    this.element.style.width = `${w}px`
    this.element.style.height = `${h}px`
    this.blocking.style.width = `${w}px`
    this.blocking.style.height = `${h}px`
    if (this.haloLayer) {
      this.haloLayer.style.width = `${w}px`
      this.haloLayer.style.height = `${h}px`
    }
  }

  /**
   * Show exactly these holes.
   *
   * A stack of CSS mask layers rather than a `clip-path`, and the reason is
   * that **even-odd cannot draw a union**: a point inside two cutouts is inside
   * an even number of subpaths and paints dark, so under a clip path two holes
   * may never overlap. Holes converging inward from off the surface overlap for
   * most of their flight. `spike/overlapping-holes/` has the two pictures, and
   * DESIGN.md argues it under **The morph**.
   *
   * Writes only, and no layout is read: three strings built from numbers the
   * caller already has, on a surface whose size {@link resize} measured once.
   */
  private paint(cutouts: Cutout[]): void {
    const { image, position, composite } = maskLayers(this.width, this.height, cutouts)
    // Unprefixed only. A `-webkit-mask-image` written beside this would be
    // honoured by an engine too old for `mask-composite`, which would take the
    // holes out of the stack and leave the surface whole — a scrim with no hole
    // in it at all. Better to draw nothing of the sort than to draw that.
    Object.assign(this.element.style, {
      maskImage: image,
      maskPosition: position,
      maskComposite: composite,
      maskRepeat: 'no-repeat',
    })
  }

  /**
   * Stop whatever is running. Anyone waiting on it is released rather than left
   * holding a promise that will never settle.
   */
  private halt(): void {
    if (this.frame !== undefined) cancelAnimationFrame(this.frame)
    this.frame = undefined
    this.settle?.(false)
    this.settle = undefined
  }

  /**
   * Walk through a series of cutout lists, drawing one blend per frame.
   *
   * Deliberately on the main thread. Handing the mask to the Web Animations API
   * would put it on the compositor, and a composited clip path is rasterised by
   * Chrome at the wrong scale on a 2x display — for the length of the animation
   * the scrim covers a quarter of what it should, then snaps right when it
   * ends. Pausing such an animation fixes it, which is what gave the compositor
   * away. Nothing says a mask is safer, and nothing needs it to be.
   *
   * A frame costs a blend of a few numbers and the strings built from them, and
   * reads no layout, so no work is forced and nothing here can thrash. Scroll
   * tracking is untouched and still runs no JS at all — the rule this bends is
   * about position math during scrolling, and that rule is intact.
   *
   * The lists must all be the same length, which is what {@link padCutouts}
   * hands back, so each hole has something to be blended with.
   */
  private run(
    frames: Cutout[][],
    duration: number,
    onFrame?: (eased: number) => void,
  ): Promise<boolean> {
    this.halt()
    const began = performance.now()
    return new Promise((resolve) => {
      this.settle = resolve
      const tick = (now: number): void => {
        // Clamped, and not only at the top: requestAnimationFrame reports the
        // frame's start time, which can predate the moment this loop was
        // scheduled, so the first frame's elapsed time is sometimes negative.
        const t = Math.min(1, Math.max(0, (now - began) / duration))
        const last = frames[frames.length - 1]
        if (t >= 1) {
          if (last) this.paint(last)
          this.frame = undefined
          this.settle = undefined
          resolve(true)
          return
        }
        const eased = ease(t)
        const { index, local } = segmentAt(frames.length, eased)
        const from = frames[index]
        const to = frames[index + 1]
        if (from && to) this.paint(lerpCutouts(from, to, local))
        // Whatever rides along is written from the same eased progress, so it
        // cannot drift from the holes. Writes only, the same as the mask.
        onFrame?.(eased)
        this.frame = requestAnimationFrame(tick)
      }
      this.frame = requestAnimationFrame(tick)
    })
  }

  /** Jump straight to a set of cutouts, with no animation. */
  set(cutouts: Cutout[]): void {
    this.draw(cutouts)
    this.converging = false
    this.placeHalos(cutouts)
  }

  /**
   * Draw the state a story opens from, given the holes its first step is
   * heading for: **every one of them over everything the viewer can see**, so
   * the morph that follows converges each inward from the edges of the screen.
   * Nothing is dimmed at the first frame, and the dark closes in from all four
   * sides at once.
   *
   * Every hole covers every other one at that first frame, and for much of the
   * flight after it. That is only drawable because the mask unions its layers —
   * see {@link paint}. Under the `clip-path` this replaced, the same opening
   * showed each target *darker than the scrim around it*, inverting as the
   * holes passed through one another.
   *
   * **What is seen, and not the surface.** The scrim is as tall as the
   * scrollable area, which on a long page is many screens; a hole starting that
   * size spends the whole morph larger than the window and arrives all at once
   * at the end. Starting from the visible box makes the convergence something a
   * viewer watches from the first frame to the last. It reads layout to find
   * that box, once, at an opening — not per frame, and never while scrolling.
   *
   * Cutouts, and not holes. Nothing is cut yet, and this is what that has to be
   * drawn as — so no frame is laid on them and none rides out of them. A ring
   * around a hole the size of the window is not what a host styling
   * `--leko-halo-*` asked for. The frames arrive with the holes, at the end of
   * the morph.
   */
  converge(to: Cutout[]): void {
    const seen = this.seen()
    // Not interactive, so the page is blocked for the whole of the opening.
    // At least one, even when the first step cuts no holes at all — a step
    // that waits opens the same way, its one stretched cutout shrinking away,
    // rather than the page snapping to fully dimmed in a single frame.
    const stretched = Math.max(1, to.length)
    this.draw(Array.from({ length: stretched }, () => ({ ...seen, radius: 0, interactive: false })))
    // Any frame the story before left is taken away rather than laid on this,
    // so the layer holds nothing at all while the scrim converges.
    this.frames(0)
    this.converging = true
  }

  /** The visible box, in this layer's own coordinates; see {@link converge}. */
  private seen(): Rect {
    const { surface } = this
    if (surface.kind === 'scroller') {
      const { element } = surface
      return {
        x: element.scrollLeft,
        y: element.scrollTop,
        width: element.clientWidth,
        height: element.clientHeight,
      }
    }
    // The viewport's layer is the viewport, so what is seen is the whole of it.
    if (surface.kind === 'viewport') return { x: 0, y: 0, width: this.width, height: this.height }
    return {
      x: window.scrollX,
      y: window.scrollY,
      width: window.innerWidth,
      height: window.innerHeight,
    }
  }

  /** The mask and the blocking, which every way of showing cutouts owes. */
  private draw(cutouts: Cutout[]): void {
    this.halt()
    this.cutouts = cutouts
    this.paint(cutouts)
    this.block(cutouts)
  }

  /**
   * Frame each cutout, for the host's CSS to make something of.
   *
   * One element per hole, sitting exactly on it: transparent, catching
   * nothing, painting only outside its own box — see {@link haloLayer}. The
   * open hole is marked with `data-open`, so a host can light the one the step
   * is about differently from the ones it only shows. A zero-area cutout is a
   * morph's collapsed leftover rather than a hole, so it gets no frame — an
   * outline around nothing still paints a dot.
   */
  private placeHalos(cutouts: Cutout[]): void {
    if (!this.haloLayer) return
    const framed = cutouts.filter(hasArea)
    this.frames(framed.length)
    this.halos.forEach((el, i) => {
      const cutout = framed[i]
      if (!cutout) return
      this.layHalo(el, cutout)
      el.toggleAttribute('data-open', cutout.interactive)
    })
    this.revealHalos()
  }

  /** Exactly `count` frames in the layer. A new one is born transparent, so its first appearance is {@link revealHalos} fading it in. */
  private frames(count: number): void {
    while (this.halos.length < count) {
      const el = document.createElement('div')
      el.className = 'leko-halo'
      Object.assign(el.style, {
        position: 'absolute',
        pointerEvents: 'none',
        outline: 'var(--leko-halo-outline, none)',
        outlineOffset: 'var(--leko-halo-offset, 0px)',
        boxShadow: 'var(--leko-halo-shadow, none)',
        opacity: '0',
        transition: 'opacity var(--leko-halo-fade, 160ms) ease-out',
      })
      this.haloLayer?.append(el)
      this.halos.push(el)
    }
    while (this.halos.length > count) this.halos.pop()?.remove()
  }

  /** One frame's box, which is the cutout's own. */
  private layHalo(el: HTMLElement, cutout: Cutout): void {
    Object.assign(el.style, {
      left: `${cutout.x}px`,
      top: `${cutout.y}px`,
      width: `${cutout.width}px`,
      height: `${cutout.height}px`,
      borderRadius: `${cutout.radius}px`,
    })
  }

  /**
   * Fade in whatever frames are transparent.
   *
   * The one layout read in this file, and it is here on purpose: it commits
   * the transparent style a frame made this task is still carrying, so the
   * transition has something to start from and the frame fades in rather than
   * appearing. Once per placement, never per animation frame, and never while
   * the user scrolls.
   */
  private revealHalos(): void {
    if (!this.haloLayer) return
    void this.haloLayer.offsetWidth
    for (const el of this.halos) el.style.opacity = '1'
  }

  /**
   * Fade the frames out, on a scrim whose halos return rather than follow.
   * They keep riding while they go — {@link slideHalos} moves boxes and this
   * moves paint, so neither waits for the other. The message already answers
   * the flight the same way: it goes, and comes back once the cutout arrived.
   */
  private hideHalos(): void {
    for (const el of this.halos) el.style.opacity = '0'
  }

  /** One frame of a ride: the same blend the path was built from, written as boxes. */
  private slideHalos(cutouts: Cutout[]): void {
    this.halos.forEach((el, i) => {
      const cutout = cutouts[i]
      if (cutout) this.layHalo(el, cutout)
    })
  }

  /**
   * Put the blocking rectangles where the cutouts are not.
   *
   * The scrim paints and catches nothing; these do the catching. It cannot be
   * done with the scrim itself, however tempting the single-element version is.
   * A mask has no effect on hit-testing at all, so a masked scrim asking to be
   * hit is a solid sheet over the page — and the clipped version that came
   * before did not work either: **a `clip-path` takes an element out of
   * hit-testing but not out of the search for what a wheel should scroll.** An
   * engine answered a wheel over the hole with the scrim and scrolled whatever
   * the scrim sat in, so a scrollable target stopped scrolling under the
   * pointer, while `elementFromPoint` reported the hole open throughout — which
   * is why it went unnoticed. Firefox routes such a wheel to the target,
   * Chromium does so only while the scrim's own container has nothing left to
   * scroll, WebKit never does.
   *
   * Rectangles leave nothing to interpret. They also make constraint 1 true by
   * construction rather than by trusting a mask: they are built from the
   * complement of the cutouts the step **opened**, so no element of Leko's can
   * be over a target the step made reachable, even in principle.
   *
   * A cutout that is not interactive is left out of that complement, so the
   * sweep runs straight through it and a rectangle covers it. It is still a
   * hole in the clip and still shows what is under it. That is the whole of
   * what a shown-and-not-reachable hole is.
   */
  private block(cutouts: Cutout[]): void {
    const rects = complementRects(
      this.width,
      this.height,
      cutouts.filter((cutout) => cutout.interactive),
    )

    while (this.blockers.length < rects.length) {
      const el = document.createElement('div')
      el.className = 'leko-block'
      Object.assign(el.style, { position: 'absolute', pointerEvents: 'auto' })
      this.blocking.append(el)
      this.blockers.push(el)
    }
    this.blockers.forEach((el, i) => {
      const rect = rects[i] ?? { x: 0, y: 0, width: 0, height: 0 }
      Object.assign(el.style, {
        left: `${rect.x}px`,
        top: `${rect.y}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
      })
    })
  }

  /**
   * Morph to a new set of cutouts. Resolves with whether it reached the end —
   * `false` means something interrupted it, and whoever was waiting should not
   * treat the step as settled. Returns `undefined` when the change was applied
   * outright instead of animated.
   *
   * The two lists are padded to equal length, so every hole has something to
   * be blended with and blending them is a matter of walking the numbers.
   */
  morph(to: Cutout[], duration: number): Promise<boolean> | undefined {
    const [from, padded] = padCutouts(this.cutouts, to)

    if (!animates(duration)) {
      this.set(to)
      return undefined
    }

    // What is rendered is the padded list, so that is what the next morph has to
    // start from if the holes are to be paired up the same way.
    this.cutouts = padded
    // The blocking goes to where the cutouts are heading rather than following
    // them frame by frame. Chasing them would mean writing four or more boxes
    // every frame for a difference nobody can act on inside 320ms, and the
    // arriving hole is the one the user is about to reach for.
    this.block(padded)
    // Either mode rides: the frames are laid on the departure — one per padded
    // cutout, so a hole on its way out keeps its frame while it shrinks — and
    // written each frame from the same blend the path is built from. What the
    // mode decides is the paint. Following, the frames stay on and wear the
    // destination's flag from the start: a flag has no halfway point, and the
    // flight is toward it. Returning, they fade out in flight as the frames
    // they were — the departure's flag, because a frame saying goodbye is the
    // old hole's — and fade back in with the holes they frame, at
    // `placeHalos(to)` below, only if the morph got there. A frame the flight
    // would need that was not there before is made transparent and, returning,
    // never revealed: a hole that had no frame does not grow one to lose it.
    const follow = this.halo === 'follow'
    // Nothing to ride out of a converging scrim, and nothing that may: see
    // {@link converge}. The frames are made and faded in on arrival.
    const converging = this.converging
    this.converging = false
    if (this.haloLayer && !converging) {
      this.frames(padded.length)
      this.halos.forEach((el, i) => {
        const start = from[i]
        const end = padded[i]
        if (!start || !end) return
        this.layHalo(el, start)
        el.toggleAttribute('data-open', (follow ? end : start).interactive)
      })
      if (follow) this.revealHalos()
      else this.hideHalos()
    }
    const riding = this.haloLayer
      ? (eased: number) => this.slideHalos(lerpCutouts(from, padded, eased))
      : undefined
    const arriving = this.run([from, padded], duration, riding)
    this.arriving = arriving
    void arriving.then((finished) => {
      if (finished) this.placeHalos(to)
      // Only if nothing has replaced it. A morph interrupted by the next one
      // settles after that one has already claimed the field.
      if (this.arriving === arriving) this.arriving = undefined
    })
    return arriving
  }

  /**
   * The built-in reaction to a failed validation.
   *
   * The cutouts move, not the scrim. Translating the element would slide the
   * dimming with it and let the page show along the edge — and, since the scrim
   * is as large as the scrollable area, briefly widen it.
   */
  shake(): void {
    if (prefersReducedMotion() || this.cutouts.length === 0) return
    // A shake is a `run`, and a `run` halts whatever is running. Doing that to
    // a morph would settle it unfinished, and unfinished is how the presenter
    // knows an arrival was interrupted — so it would hold back the message that
    // waits for the cutout to land, and the step would be left with a shaking
    // hole and nothing said. The refusal is worth as much a moment later, so it
    // waits for the arrival it would otherwise have cut short.
    //
    // A morph that ends unfinished was interrupted by another step. The
    // rejection belongs to the step that has been left, so it goes with it.
    const arriving = this.arriving
    if (arriving) {
      void arriving.then((finished) => {
        if (finished) this.nudge()
      })
      return
    }
    this.nudge()
  }

  /** The shake itself, once it is known to be interrupting nothing. */
  private nudge(): void {
    const nudged = (dx: number): Cutout[] => this.cutouts.map((c) => ({ ...c, x: c.x + dx }))
    const settled = this.cutouts
    void this.run([settled, nudged(-6), nudged(5), nudged(-3), settled], 320)
  }

  destroy(): void {
    this.halt()
    this.element.remove()
    this.blocking.remove()
    this.haloLayer?.remove()
    this.marker?.remove()
    if (this.surface.kind === 'scroller' && this.restorePosition !== null) {
      this.surface.element.style.position = this.restorePosition
    }
  }
}
