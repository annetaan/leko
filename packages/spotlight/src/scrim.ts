import {
  complementRects,
  type Cutout,
  lerpPath,
  padCutouts,
  punchedPath,
  type Rect,
  segmentAt,
} from './geometry.js'

/**
 * The nearest ancestor that scrolls, or `null` when that is the document.
 *
 * This matters more than it looks. The scrim has to live inside the thing that
 * scrolls, so that scrolling moves the scrim and the target together and no
 * position math runs per frame. A scrim mounted outside the scroller it points
 * into drifts off the target the moment the user scrolls.
 */
export function findScrollContainer(el: HTMLElement): HTMLElement | null {
  const node = el.parentElement
  if (!node || node === document.body || node === document.documentElement) return null
  const style = getComputedStyle(node)
  const scrolls = /auto|scroll|overlay/.test(style.overflowY + style.overflowX)
  const overflows = node.scrollHeight > node.clientHeight || node.scrollWidth > node.clientWidth
  return scrolls && overflows ? node : findScrollContainer(node)
}

/** An element's box in the coordinate space of the scrim covering `container`. */
export function rectWithin(el: HTMLElement, container: HTMLElement | null): Rect {
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
  readonly container: HTMLElement | null
  private readonly restorePosition: string | null
  private cutouts: Cutout[] = []
  /** The rectangles that do the blocking; see {@link block}. */
  private blockers: HTMLElement[] = []
  private frame: number | undefined
  private settle: ((finished: boolean) => void) | undefined
  /**
   * The morph in flight, or `undefined` between morphs. A shake is never held
   * here: what this exists for is telling a step still arriving apart from one
   * that has arrived, and only {@link morph} is an arrival.
   */
  private arriving: Promise<boolean> | undefined

  constructor(container: HTMLElement | null) {
    this.container = container

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
      // This element paints and nothing else. Its children do the blocking, for
      // the reason set out on `block`.
      pointerEvents: 'none',
    })
    this.element = el
    ;(container ?? document.body).append(el)
    this.resize()
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
  private run(paths: string[], duration: number): Promise<boolean> {
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
        const { index, local } = segmentAt(paths.length, ease(t))
        const from = paths[index]
        const to = paths[index + 1]
        if (from && to) this.element.style.clipPath = lerpPath(from, to, local)
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
   * complement of the cutouts, so no element of Leko's can be over a target
   * even in principle.
   */
  private block(cutouts: Cutout[]): void {
    const rects = complementRects(this.element.offsetWidth, this.element.offsetHeight, cutouts)

    while (this.blockers.length < rects.length) {
      const el = document.createElement('div')
      el.className = 'leko-block'
      Object.assign(el.style, { position: 'absolute', pointerEvents: 'auto' })
      this.element.append(el)
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
    const arriving = this.run(paths, duration)
    this.arriving = arriving
    void arriving.then(() => {
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
    if (this.container && this.restorePosition !== null) {
      this.container.style.position = this.restorePosition
    }
  }
}
