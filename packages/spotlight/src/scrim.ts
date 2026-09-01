import {
  complementRects,
  type Cutout,
  lerpCutouts,
  lerpPath,
  padCutouts,
  punchedPath,
  type Rect,
  segmentAt,
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
 * The nearest ancestor that scrolls, or `null` when that is the document.
 *
 * This matters more than it looks. The scrim has to live inside the thing that
 * scrolls, so that scrolling moves the scrim and the target together and no
 * position math runs per frame. A scrim mounted outside the scroller it points
 * into drifts off the target the moment the user scrolls.
 */
export function findScrollContainer(el: Element): HTMLElement | null {
  const node = el.parentElement
  if (!node || node === document.body || node === document.documentElement) return null
  const style = getComputedStyle(node)
  const scrolls = /auto|scroll|overlay/.test(style.overflowY + style.overflowX)
  const overflows = node.scrollHeight > node.clientHeight || node.scrollWidth > node.clientWidth
  return scrolls && overflows ? node : findScrollContainer(node)
}

/** An element's box in the coordinate space of the scrim covering `container`. */
export function rectWithin(el: Element, container: HTMLElement | null): Rect {
  const r = el.getBoundingClientRect()
  if (!container) {
    return {
      x: r.left + window.scrollX,
      y: r.top + window.scrollY,
      width: r.width,
      height: r.height,
    }
  }
  const c = container.getBoundingClientRect()
  return {
    x: r.left - c.left - container.clientLeft + container.scrollLeft,
    y: r.top - c.top - container.clientTop + container.scrollTop,
    width: r.width,
    height: r.height,
  }
}

/**
 * The area a nested scroller's own scrim covers: its padding box, since that is
 * where an absolutely positioned child of it begins. An outer scrim cut to the
 * border box instead would leave the scroller's border undimmed — a bright
 * hairline around the panel.
 */
export function paddingBoxWithin(el: HTMLElement, container: HTMLElement | null): Rect {
  const style = getComputedStyle(el)
  const [top, right, bottom, left] = [
    style.borderTopWidth,
    style.borderRightWidth,
    style.borderBottomWidth,
    style.borderLeftWidth,
  ].map((v) => parseFloat(v) || 0) as [number, number, number, number]
  const r = rectWithin(el, container)
  return {
    x: r.x + left,
    y: r.y + top,
    width: r.width - left - right,
    height: r.height - top - bottom,
  }
}

/**
 * The name the message anchors to. Declared here because this is the file that
 * makes the element carrying it, and read in `message.ts`, which is the only
 * thing that ever asks for it.
 */
export const MESSAGE_ANCHOR = '--leko-message-anchor'

export const prefersReducedMotion = (): boolean =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

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
  readonly container: HTMLElement | null
  private readonly restorePosition: string | null
  private cutouts: Cutout[] = []
  /**
   * Where the blocking rectangles live. **Beside the scrim, never inside it.**
   *
   * A `clip-path` clips its descendants out of hit-testing along with itself,
   * so a rectangle inside the scrim and over one of its holes catches nothing —
   * `spike/blocking-a-hole/` is the page. That does not matter while every hole
   * is meant to be reachable, because a rectangle never lands on one. It
   * matters the moment a step shows a hole it does not open, which is a
   * rectangle laid exactly over a hole and asking to be hit.
   *
   * Unclipped, so it blocks what it is told to. It carries no background, so
   * moving the blocking out of the scrim changed nothing about what is painted.
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
  constructor(container: HTMLElement | null, halo?: HaloMode) {
    this.container = container
    this.halo = halo

    // An absolutely positioned child only lands on the content origin if the
    // scroller establishes a containing block. Nudge it if it does not, and put
    // it back on destroy.
    if (container && getComputedStyle(container).position === 'static') {
      this.restorePosition = container.style.position
      container.style.position = 'relative'
    } else {
      this.restorePosition = null
    }

    const el = document.createElement('div')
    el.className = 'leko-scrim'
    el.setAttribute('aria-hidden', 'true')
    Object.assign(el.style, {
      position: 'absolute',
      left: '0',
      top: '0',
      background: 'var(--leko-scrim-color, rgb(0 0 0 / 0.66))',
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
      position: 'absolute',
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
        position: 'absolute',
        left: '0',
        top: '0',
        // With the scrim and after the blocking in the tree, so the paint
        // lands on top of both. Paint is all it is.
        zIndex: 'var(--leko-z, 9999)',
        pointerEvents: 'none',
      })
      this.haloLayer = halos
    }

    ;(container ?? document.body).append(el, blocking, ...(this.haloLayer ? [this.haloLayer] : []))
    this.resize()
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
        position: 'absolute',
        width: '0',
        height: '0',
        pointerEvents: 'none',
      })
      mark.style.setProperty('anchor-name', MESSAGE_ANCHOR)
      this.marker = mark
      ;(this.container ?? document.body).append(mark)
    }
    Object.assign(this.marker.style, { left: `${x}px`, top: `${y}px` })
  }

  /** Cover the whole scrollable area, not just the visible part. */
  resize(): void {
    const [w, h] = this.container
      ? [this.container.scrollWidth, this.container.scrollHeight]
      : [
          Math.max(document.documentElement.scrollWidth, window.innerWidth),
          Math.max(document.documentElement.scrollHeight, window.innerHeight),
        ]
    this.element.style.width = `${w}px`
    this.element.style.height = `${h}px`
    this.blocking.style.width = `${w}px`
    this.blocking.style.height = `${h}px`
    if (this.haloLayer) {
      this.haloLayer.style.width = `${w}px`
      this.haloLayer.style.height = `${h}px`
    }
  }

  private path(cutouts: Cutout[]): string {
    const w = this.element.offsetWidth
    const h = this.element.offsetHeight
    return `path(evenodd, "${punchedPath(w, h, cutouts)}")`
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
   * Walk through a series of paths, writing one per frame.
   *
   * Deliberately on the main thread. Handing `clip-path` to the Web Animations
   * API puts it on the compositor, and Chrome rasterises a composited clip path
   * at the wrong scale on a 2x display: for the length of the animation the
   * scrim covers a quarter of what it should, then snaps right when it ends.
   * Pausing such an animation fixes it, which is what gave the compositor away.
   *
   * The frames cost a string each and read no layout, so no work is forced and
   * nothing here can thrash. Scroll tracking is untouched and still runs no JS
   * at all — the rule this bends is about position math during scrolling, and
   * that rule is intact.
   */
  private run(
    paths: string[],
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
        const last = paths[paths.length - 1]
        if (t >= 1) {
          if (last) this.element.style.clipPath = last
          this.frame = undefined
          this.settle = undefined
          resolve(true)
          return
        }
        const eased = ease(t)
        const { index, local } = segmentAt(paths.length, eased)
        const from = paths[index]
        const to = paths[index + 1]
        if (from && to) this.element.style.clipPath = lerpPath(from, to, local)
        // Whatever rides along is written from the same eased progress, so it
        // cannot drift from the path. Writes only, the same as the path.
        onFrame?.(eased)
        this.frame = requestAnimationFrame(tick)
      }
      this.frame = requestAnimationFrame(tick)
    })
  }

  /** Jump straight to a set of cutouts, with no animation. */
  set(cutouts: Cutout[]): void {
    this.halt()
    this.cutouts = cutouts
    this.element.style.clipPath = this.path(cutouts)
    this.block(cutouts)
    this.placeHalos(cutouts)
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
    const framed = cutouts.filter((c) => c.width > 0 && c.height > 0)
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
   * done with the clipped element itself, however tempting the single-element
   * version is: **a `clip-path` takes an element out of hit-testing but not out
   * of the search for what a wheel should scroll.** An engine answers a wheel
   * over the hole with the scrim and scrolls whatever the scrim sits in, so a
   * scrollable target stops scrolling under the pointer — and `elementFromPoint`
   * reports the hole open throughout, which is why this went unnoticed. Firefox
   * routes such a wheel to the target, Chromium does so only while the scrim's
   * own container has nothing left to scroll, WebKit never does.
   *
   * Rectangles leave nothing to interpret. They also make constraint 1 true by
   * construction rather than by trusting a clip: they are built from the
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
      this.element.offsetWidth,
      this.element.offsetHeight,
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
   * Both paths are built from lists of equal length, so their segments line up
   * and blending them is a matter of walking the numbers.
   */
  morph(to: Cutout[], duration: number): Promise<boolean> | undefined {
    const [from, padded] = padCutouts(this.cutouts, to)

    if (duration <= 0 || prefersReducedMotion()) {
      this.set(to)
      return undefined
    }

    // What is rendered is the padded list, so that is what the next morph has to
    // start from if its segments are to line up.
    const paths = [this.path(from), this.path(padded)]
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
    if (this.haloLayer) {
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
    const arriving = this.run(paths, duration, riding)
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
    const nudged = (dx: number): string =>
      this.path(this.cutouts.map((c) => ({ ...c, x: c.x + dx })))
    const settled = this.path(this.cutouts)
    void this.run([settled, nudged(-6), nudged(5), nudged(-3), settled], 320)
  }

  destroy(): void {
    this.halt()
    this.element.remove()
    this.blocking.remove()
    this.haloLayer?.remove()
    this.marker?.remove()
    if (this.container && this.restorePosition !== null) {
      this.container.style.position = this.restorePosition
    }
  }
}
