import { ease } from '@annetaan/leko-spotlight'

import type { Hole, Rect } from './geometry.js'
import { maskLayers } from './mask.js'
import { Message } from './message.js'
import type { LekoScrollMessage, LekoScrollSide } from './types.js'

/**
 * How long a morph and a converge take, in milliseconds, unless the caller
 * hands `converge` a duration of its own, which only the intro does —
 * [The line and the switch](../DESIGN.md#the-line-and-the-switch) and
 * [Entering converges, leaving fades](../DESIGN.md#entering-converges-leaving-fades).
 */
export const DURATION = 320

const round = (n: number): number => Math.round(n * 100) / 100

const lerp = (from: Hole, to: Hole, t: number): Hole => ({
  x: round(from.x + (to.x - from.x) * t),
  y: round(from.y + (to.y - from.y) * t),
  width: round(from.width + (to.width - from.width) * t),
  height: round(from.height + (to.height - from.height) * t),
  radius: round(from.radius + (to.radius - from.radius) * t),
})

/**
 * The page-sized layer: the scrim with one hole in it, the halo on that hole
 * and the message beside it, all in page coordinates so the browser carries
 * them with the page — [The scrim rides the page](../DESIGN.md#the-scrim-rides-the-page).
 * Every token is a `var()` fallback written inline —
 * [Styling](../DESIGN.md#styling).
 */
export class Scrim {
  readonly root: HTMLElement
  private readonly scrim: HTMLElement
  private readonly halo: HTMLElement
  private readonly message = new Message()
  private readonly duration: number
  private readonly onArrive: () => void
  private width = 0
  private height = 0
  /** What is on screen now, mid-flight included. */
  private hole: Hole | undefined
  private frame: number | undefined
  /** The halo stays off the hole until a converge arrives — [The halo](../DESIGN.md#the-halo). */
  private converging = false

  constructor(options: { duration?: number; onArrive: () => void }) {
    this.duration = options.duration ?? DURATION
    this.onArrive = options.onArrive

    const root = document.createElement('div')
    root.className = 'leko-scroll'
    root.setAttribute('aria-hidden', 'true')
    Object.assign(root.style, {
      position: 'absolute',
      left: '0',
      top: '0',
      pointerEvents: 'none',
      zIndex: 'var(--leko-scroll-z, 9999)',
      opacity: '0',
      // A message beside a hole at the page's edge would otherwise count as
      // overflow and grow the page — [The message](../DESIGN.md#the-message).
      overflow: 'clip',
    })

    const scrim = document.createElement('div')
    scrim.className = 'leko-scroll-scrim'
    Object.assign(scrim.style, {
      position: 'absolute',
      inset: '0',
      background: 'var(--leko-scroll-scrim-color, rgb(0 0 0 / 0.45))',
      pointerEvents: 'none',
    })

    const halo = document.createElement('div')
    halo.className = 'leko-scroll-halo'
    Object.assign(halo.style, {
      position: 'absolute',
      pointerEvents: 'none',
      outline: 'var(--leko-scroll-halo-outline, none)',
      outlineOffset: 'var(--leko-scroll-halo-offset, 0px)',
      boxShadow: 'var(--leko-scroll-halo-shadow, none)',
      opacity: '0',
    })

    root.append(scrim, halo, this.message.element)
    document.body.append(root)
    this.root = root
    this.scrim = scrim
    this.halo = halo
    this.paint(undefined)
  }

  /**
   * The page's size, and where the root goes from the origin of its containing
   * block so that it sits at the page's top left. The hole on screen is painted
   * again against the size.
   */
  resize(width: number, height: number, left = 0, top = 0): void {
    this.width = width
    this.height = height
    Object.assign(this.root.style, {
      width: `${width}px`,
      height: `${height}px`,
      left: `${left}px`,
      top: `${top}px`,
    })
    this.paint(this.hole)
  }

  /** One write, and the scrim, the halo and the message dim together. */
  opacity(value: number): void {
    this.root.style.opacity = String(value)
  }

  /**
   * Close in on `to` from the hole on screen, or from `seen` — the part of the
   * page in the viewport — when none is drawn.
   */
  converge(to: Hole, seen: Rect, duration?: number): void {
    this.message.hide()
    this.hideHalo()
    this.converging = true
    this.run(this.hole ?? { ...seen, radius: 0 }, to, duration)
  }

  /** Move the hole from where it is to `to`, the halo riding along. */
  morph(to: Hole): void {
    this.message.hide()
    this.converging = false
    // Nothing to move from: the flight is spent on the destination, so the
    // arrival still comes.
    this.run(this.hole ?? to, to)
  }

  /** Put the hole on `hole` at once, taking a shown message along. */
  place(hole: Hole, viewportWidth: number): void {
    this.halt()
    this.hole = hole
    this.paint(hole)
    this.layHalo(hole)
    if (this.message.visible) this.message.place(hole, this.message.side, viewportWidth)
  }

  /** The hole arrived: the halo fades in, and the message shows where it has something to say. */
  reveal(
    content: LekoScrollMessage | undefined,
    side: LekoScrollSide,
    viewportWidth: number,
  ): void {
    this.halo.style.transition = 'opacity var(--leko-scroll-halo-fade, 160ms) ease-out'
    // Read so the halo's opacity of 0 is computed before 1 is written, and it
    // fades rather than cuts.
    void this.halo.offsetWidth
    this.halo.style.opacity = '1'
    const hole = this.hole
    if (hole && content && (content.title || content.body)) {
      this.message.show(content, hole, side, viewportWidth)
    } else {
      this.message.hide()
    }
  }

  /** Everything off the page, and nothing left running to arrive. */
  out(): void {
    this.halt()
    this.hole = undefined
    this.paint(undefined)
    this.hideHalo()
    this.message.hide()
    this.opacity(0)
  }

  destroy(): void {
    this.halt()
    this.root.remove()
  }

  private halt(): void {
    if (this.frame !== undefined) cancelAnimationFrame(this.frame)
    this.frame = undefined
    this.converging = false
  }

  /** A restart takes the full duration it is given, from wherever the hole has got to. */
  private run(from: Hole, to: Hole, duration = this.duration): void {
    if (this.frame !== undefined) cancelAnimationFrame(this.frame)
    const began = performance.now()
    const tick = (now: number): void => {
      // Clamped at the bottom as well as the top, for the reason `segmentAt`
      // in `packages/spotlight/src/geometry.ts` gives.
      const t = Math.min(1, Math.max(0, (now - began) / duration))
      if (t >= 1) {
        this.hole = to
        this.paint(to)
        this.layHalo(to)
        this.frame = undefined
        this.converging = false
        this.onArrive()
        return
      }
      const hole = lerp(from, to, ease(t))
      this.hole = hole
      this.paint(hole)
      if (!this.converging) this.layHalo(hole)
      this.frame = requestAnimationFrame(tick)
    }
    this.frame = requestAnimationFrame(tick)
  }

  private paint(hole: Hole | undefined): void {
    const { image, position, composite } = maskLayers(this.width, this.height, hole)
    // Unprefixed only, for the reason `Scrim.paint` in
    // `packages/spotlight/src/scrim.ts` gives.
    Object.assign(this.scrim.style, {
      maskImage: image,
      maskPosition: position,
      maskComposite: composite,
      maskRepeat: 'no-repeat',
    })
  }

  /** Gone at once. A fade out would linger on the old target while the next converge closes in. */
  private hideHalo(): void {
    Object.assign(this.halo.style, { transition: '', opacity: '0' })
  }

  private layHalo(hole: Hole): void {
    Object.assign(this.halo.style, {
      left: `${hole.x}px`,
      top: `${hole.y}px`,
      width: `${hole.width}px`,
      height: `${hole.height}px`,
      borderRadius: `${hole.radius}px`,
    })
  }
}
