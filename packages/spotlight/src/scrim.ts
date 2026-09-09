import {
  complementRects,
  type Cutout,
  ease,
  type Easing,
  hasArea,
  lerpCutouts,
  maskLayers,
  padCutouts,
  type Rect,
  segmentAt,
} from './geometry.js'
import { animates, prefersReducedMotion } from './motion.js'
import type { Surface } from './surface.js'

/**
 * The name the message anchors to. Declared here because this is the file that
 * makes the element carrying it, and read in `message.ts`, which is the only
 * thing that ever asks for it.
 */
export const MESSAGE_ANCHOR = '--leko-message-anchor'

/**
 * What the halo does while a hole is on its way somewhere else. The frames ride
 * the morph either way and the mode decides the paint — DESIGN.md argues both
 * modes under **The halo**.
 */
export type HaloMode = 'return' | 'follow'

/**
 * A single full-size element with the cutouts clipped out of it.
 *
 * Everything structural is set inline, so Leko renders correctly whether or not
 * the consumer imported the stylesheet. `leko.css` only carries the defaults for
 * the `--leko-*` custom properties, which are read here through `var()` with
 * fallbacks and can be overridden from anywhere.
 */
export class Scrim {
  // -------------------------------------------------------------------- the layer

  readonly element: HTMLElement
  /**
   * The point a message anchors itself to, in this scrim's coordinate space.
   *
   * A zero-area element of Leko's own rather than the target itself, which is
   * what lets a message sit beside anything the scrim can cut a hole around.
   * DESIGN.md argues why it is not the target under **The message anchors to a
   * marker, never to the target**.
   *
   * It sits beside the scrim rather than inside it, so the mask and the
   * blocking rectangles know nothing about it.
   */
  private marker: HTMLElement | undefined
  /** What carries this layer; see {@link Surface}. */
  readonly surface: Surface
  /** A scroller's own `position`, where this layer had to give it one; see the constructor. */
  private readonly restorePosition: string | null
  private cutouts: Cutout[] = []
  /**
   * The surface's size, kept from the one measurement {@link measure} makes.
   * It is what {@link resize}, {@link paint} and {@link block} build from, so
   * that none of them — and above all no frame of a morph — has to read layout
   * to know it.
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
   * Where the blocking rectangles live. **Beside the scrim, never inside it** —
   * DESIGN.md, **The rectangles live beside the scrim, never inside it**.
   *
   * What keeps them out here now is the plainest of the reasons given there:
   * the scrim paints and catches nothing, this catches and paints nothing, so
   * each one's `pointer-events` is a fact about an element rather than
   * something to work out.
   */
  private readonly blocking: HTMLElement
  /** The rectangles themselves; see {@link block}. */
  private blockers: HTMLElement[] = []
  /**
   * Where the halos live, or `undefined` on a scrim that draws none.
   *
   * A paint-only frame around a cutout, for the host to style. Leko ships every
   * token as `none`, so until a host sets `--leko-halo-*` this layer paints
   * nothing at all. DESIGN.md argues why the hole needs one under **The halo**,
   * and that it cannot get between the user and an open hole under **Paint
   * only, and outside the hole by construction**.
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
   * and what the frames do during a morph — see {@link HaloMode}. DESIGN.md,
   * **Only the innermost scrim is haloed**.
   */
  constructor(surface: Surface, halo?: HaloMode) {
    this.surface = surface
    this.halo = halo

    // DESIGN.md, **A draw mounts its layers, then reads, then writes**.
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
   * Read the surface's size. The whole scrollable area, not just the visible
   * part — or, on the viewport's layer, the viewport itself, which is all there
   * is to cover.
   *
   * That is `innerWidth` and `innerHeight`, the scrollbar's gutter included,
   * and deliberately not the layout viewport a fixed box is laid out against,
   * which is the tighter and more obviously correct number. DESIGN.md argues
   * that under **That layer is sized past the layout viewport on purpose,
   * gutter included**, with what `spike/the-scrollbar-gutter/` measured for it.
   *
   * A read and nothing else: {@link resize}, {@link set} and {@link converge}
   * write from the numbers this took. Called after the layer is mounted and
   * before the first write to any layer, so that a stack of several reads
   * every surface before it sizes any — DESIGN.md, **A draw mounts its layers,
   * then reads, then writes**. The order is a promise the types cannot spell.
   */
  measure(): void {
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
  }

  /**
   * Size the layer to what {@link measure} read, and redraw what was drawn
   * *from* the size. Writes only.
   */
  resize(): void {
    const w = `${this.width}px`
    const h = `${this.height}px`
    this.element.style.width = w
    this.element.style.height = h
    this.blocking.style.width = w
    this.blocking.style.height = h
    if (this.haloLayer) {
      this.haloLayer.style.width = w
      this.haloLayer.style.height = h
    }
    // The rectangles are the complement of the holes within the size. Not
    // through `draw`, which halts whatever is running: a morph cut short here
    // settles unfinished, and unfinished is how the presenter knows an arrival
    // was interrupted — the step would keep its hole and never be given its
    // words. A morph's own frames are written from cutouts in a space a resize
    // does not move, so it can go on running, and the next of them paints
    // against the new size.
    if (this.frame === undefined) this.paint(this.cutouts)
    // Either way, because a morph blocks where its holes are heading rather
    // than following them, so this is that same destination against the new
    // size rather than anything mid-flight.
    this.block(this.cutouts)
  }

  // ---------------------------------------------------------------- what is drawn

  /**
   * Show exactly these holes.
   *
   * A stack of CSS mask layers rather than a `clip-path`, because **even-odd
   * cannot draw a union** and holes converging inward from off the surface
   * overlap for most of their flight. DESIGN.md argues it under **The morph**.
   *
   * Writes only, and no layout is read: three strings built from numbers the
   * caller already has, on a surface whose size {@link measure} read once.
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
   * Put the blocking rectangles where the cutouts are not.
   *
   * The scrim paints and catches nothing; these do the catching, and it cannot
   * be done with the scrim itself however tempting the single-element version
   * is. DESIGN.md, **Do not go back to blocking with the scrim itself**, and
   * ONBOARDING.md walks the arrangement under **The three constraints, and the
   * line that keeps each**.
   *
   * A cutout that is not interactive is left out of the complement, so the
   * sweep runs straight through it and a rectangle covers it. That is the whole
   * of what a shown-and-not-reachable hole is.
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
   * DESIGN.md argues it under **A story opens by converging, from every hole
   * stretched over the whole surface**, along with what the `clip-path` this
   * replaced did to the opening.
   *
   * **What is seen, and not the surface.** The scrim is as tall as the
   * scrollable area, which on a long page is many screens; a hole starting that
   * size spends the whole morph larger than the window and arrives all at once
   * at the end. Starting from the visible box makes the convergence something a
   * viewer watches from the first frame to the last. The box is the caller's,
   * read with {@link seen} in the same pass as every other box the draw needs;
   * this writes only, the same as {@link set}.
   *
   * Cutouts, and not holes. Nothing is cut yet, and this is what that has to be
   * drawn as — so no frame is laid on them and none rides out of them. A ring
   * around a hole the size of the window is not what a host styling
   * `--leko-halo-*` asked for. The frames arrive with the holes, at the end of
   * the morph.
   */
  converge(to: Cutout[], seen: Rect): void {
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

  /**
   * The visible box, in this layer's own coordinates — what {@link converge}
   * starts from. A read, for the caller's read pass, and after {@link measure}:
   * the viewport's layer answers from the size that took.
   */
  seen(): Rect {
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

  // -------------------------------------------------------------------- the halos

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
   * The one read here that is no part of a draw's read pass, and it is here on
   * purpose: it commits the transparent style a frame made this task is still
   * carrying, so the transition has something to start from and the frame fades
   * in rather than appearing. Once per placement, never per animation frame,
   * and never while the user scrolls.
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

  // -------------------------------------------------------------------- the morph

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
   * Deliberately on the main thread — DESIGN.md, **The blend is written frame
   * by frame from the main thread**, and pausing such an animation is what gave
   * the compositor away. A frame costs a blend of a few numbers and the strings
   * built from them and reads no layout, which is why DESIGN.md's **Any change
   * that reintroduces per-frame JS position math is a regression** is not about
   * this.
   *
   * The lists must all be the same length, which is what {@link padCutouts}
   * hands back, so each hole has something to be blended with.
   */
  private run(
    frames: Cutout[][],
    duration: number,
    easing: Easing,
    onFrame?: (eased: number) => void,
  ): Promise<boolean> {
    this.halt()
    const began = performance.now()
    return new Promise((resolve) => {
      this.settle = resolve
      const tick = (now: number): void => {
        // Clamped at the bottom as well as the top, for the reason `segmentAt`
        // in `geometry.ts` gives.
        const t = Math.min(1, Math.max(0, (now - began) / duration))
        const last = frames[frames.length - 1]
        if (t >= 1) {
          if (last) this.paint(last)
          this.frame = undefined
          this.settle = undefined
          resolve(true)
          return
        }
        const eased = easing(t)
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

  /**
   * Morph to a new set of cutouts. Resolves with whether it reached the end —
   * `false` means something interrupted it, and whoever was waiting should not
   * treat the step as settled. Returns `undefined` when the change was applied
   * outright instead of animated.
   *
   * The two lists are padded to equal length, so every hole has something to
   * be blended with and blending them is a matter of walking the numbers.
   */
  morph(to: Cutout[], duration: number, easing: Easing): Promise<boolean> | undefined {
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
    // Either mode rides, and DESIGN.md's **The halo** says what each does. The
    // frames are laid on the departure — one per padded cutout, so a hole on
    // its way out keeps its frame while it shrinks. Following, they wear the
    // destination's flag from the start; returning, the departure's, because a
    // frame saying goodbye is the old hole's. A frame the flight would need
    // that was not there before is made transparent and, returning, never
    // revealed: a hole that had no frame does not grow one to lose it.
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
    const arriving = this.run([from, padded], duration, easing, riding)
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
    // Leko's own curve, never the host's, and the length beside it is fixed for
    // the same reason: a shake is a refusal rather than an arrival, and a curve
    // that overshoots would make nonsense of four segments that already do.
    void this.run([settled, nudged(-6), nudged(5), nudged(-3), settled], 320, ease)
  }

  // ------------------------------------------------------------------ taking down

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
