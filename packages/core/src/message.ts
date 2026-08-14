import { type Rect, union } from './geometry.js'
import { prefersReducedMotion } from './scrim.js'

/**
 * The name given to the step's action target while it is being pointed at. The
 * target is the consumer's element, so whatever it already carried is put back
 * when the tour lets go of it.
 */
const ANCHOR_NAME = '--leko-message-anchor'

/** How long the message takes to fade back in after a morph. */
const FADE = 120

/**
 * Which side of the cutout the message sits on, in preference order: below
 * first, because a message under the thing it describes is the least surprising
 * place for it, and reading order puts it after the target rather than before.
 */
const SIDES = ['bottom', 'top', 'right', 'left'] as const
type Side = (typeof SIDES)[number]

/**
 * Physical keywords, not logical ones. The side is chosen from measurements in
 * viewport coordinates, so the value written has to mean the same thing those
 * measurements did, whatever the writing mode.
 */
const AREA: Record<Side, string> = {
  bottom: 'bottom center',
  top: 'top center',
  right: 'right center',
  left: 'left center',
}

const MARGIN = {
  bottom: 'marginTop',
  top: 'marginBottom',
  right: 'marginLeft',
  left: 'marginRight',
} as const

const MARGINS = ['marginTop', 'marginBottom', 'marginLeft', 'marginRight'] as const

/**
 * Anchor positioning is what makes the message follow its target for free. Where
 * it is missing the message still has to appear — see {@link Message.dock}.
 */
const canAnchor = (): boolean =>
  CSS.supports('anchor-name: --a') && CSS.supports('position-area: bottom center')

/**
 * The side with room for the message, given how much of the viewport the cutouts
 * already take up. Falls back to `bottom` when nothing fits, which is when the
 * browser's own fallbacks — where it has them — get their turn.
 */
function chooseSide(box: Rect, width: number, height: number, gap: number): Side {
  const room: Record<Side, number> = {
    bottom: window.innerHeight - (box.y + box.height),
    top: box.y,
    right: window.innerWidth - (box.x + box.width),
    left: box.x,
  }
  const need: Record<Side, number> = {
    bottom: height + gap,
    top: height + gap,
    right: width + gap,
    left: width + gap,
  }
  return SIDES.find((side) => room[side] >= need[side]) ?? 'bottom'
}

/**
 * The step's message, placed beside its cutout.
 *
 * It lives in the top layer, not inside the scrim's container. Both parts of
 * that matter:
 *
 * - **Not inside the scroller.** The scrim has to be, so that scrolling moves it
 *   with the target and no position math runs per frame. A message put there
 *   too would be clipped by the scroller the moment the cutout came near an
 *   edge — and the edge is exactly where a message needs the room.
 * - **The top layer, rather than a large `z-index`.** The scrim blocks the page
 *   on purpose, so the tour's own chrome has to be above it, and a number can
 *   always be outbid by the host page's stacking contexts.
 *
 * Scrolling is still nobody's job here: an anchor-positioned element is offset
 * by the scroll of everything between it and its anchor, by the browser, with no
 * script involved. JS only picks the *side* — once per step, from measurements
 * it already has — and the browser keeps it there.
 */
export class Message {
  readonly element: HTMLElement
  private readonly anchored = canAnchor()
  private anchor: HTMLElement | undefined
  private restore: string | undefined
  private open = false
  private shown = false

  constructor() {
    const el = document.createElement('div')
    el.className = 'leko-message'
    // Announced when it changes, without stealing focus from the target: the
    // user is meant to be acting on the page, not on this.
    el.setAttribute('role', 'status')
    Object.assign(el.style, {
      position: 'fixed',
      margin: '0',
      width: 'max-content',
      maxWidth: 'var(--leko-message-max-width, min(320px, calc(100vw - 32px)))',
      padding: 'var(--leko-message-padding, 12px 16px)',
      borderRadius: 'var(--leko-message-radius, 8px)',
      background: 'var(--leko-message-bg, #fff)',
      color: 'var(--leko-message-color, #16181d)',
      font: 'var(--leko-message-font, 500 14px/1.5 system-ui, sans-serif)',
      boxShadow: 'var(--leko-message-shadow, 0 6px 24px rgb(0 0 0 / 0.28))',
      // Only consulted where the top layer is not available.
      zIndex: 'var(--leko-message-z, 10000)',
      // Hidden with `visibility`, not `display`: the box is still laid out, so
      // it can be measured before it is placed, and it is still out of the
      // accessibility tree while it is away.
      visibility: 'hidden',
      opacity: '0',
      pointerEvents: 'none',
    })
    el.popover = 'manual'
    this.element = el
  }

  /** Whether there is currently something on screen to read. */
  get visible(): boolean {
    return this.shown
  }

  /**
   * Show `text` beside `cutouts`, which are in viewport coordinates.
   *
   * `anchor` is the element the browser tracks — the step's action target. The
   * cutouts are what the message has to stay clear of, and they are a wider
   * thing than the anchor: a union of several targets, plus any `related` holes.
   * The gap between the two is turned into a margin here, once, and stays right
   * for as long as the two move together — which they do, being cut from the
   * same scrim.
   */
  show(text: string, anchor: HTMLElement, cutouts: Rect[], gap: number): void {
    this.element.textContent = text
    if (!this.element.isConnected) document.body.append(this.element)
    if (!this.open) {
      // Absent where the top layer is not supported; the z-index above carries
      // the element in that case.
      this.element.showPopover?.()
      this.open = true
    }
    this.hold(anchor)
    this.place(anchor, cutouts, gap)
    Object.assign(this.element.style, {
      transition: prefersReducedMotion() ? '' : `opacity ${FADE}ms`,
      visibility: 'visible',
      opacity: '1',
      pointerEvents: 'auto',
    })
    this.shown = true
  }

  /** Replace the text without moving anything. */
  setText(text: string): void {
    this.element.textContent = text
  }

  /**
   * Take the message away.
   *
   * Used while the cutout morphs: a message cannot be interpolated along a path
   * the way a hole can, and dragging it across the screen would only draw the
   * eye away from the thing that is moving. It goes, and comes back once the
   * cutout has arrived.
   */
  hide(): void {
    Object.assign(this.element.style, {
      transition: '',
      visibility: 'hidden',
      opacity: '0',
      pointerEvents: 'none',
    })
    this.shown = false
  }

  private hold(el: HTMLElement): void {
    if (!this.anchored || this.anchor === el) return
    this.release()
    this.restore = el.style.getPropertyValue('anchor-name')
    el.style.setProperty('anchor-name', ANCHOR_NAME)
    this.anchor = el
    this.element.style.setProperty('position-anchor', ANCHOR_NAME)
  }

  private release(): void {
    if (!this.anchor) return
    if (this.restore) this.anchor.style.setProperty('anchor-name', this.restore)
    else this.anchor.style.removeProperty('anchor-name')
    this.anchor = undefined
    this.restore = undefined
  }

  private place(anchor: HTMLElement, cutouts: Rect[], gap: number): void {
    const style = this.element.style
    const box = union(cutouts)
    if (!this.anchored || !box) return this.dock()

    for (const margin of MARGINS) style[margin] = '0px'
    for (const inset of ['left', 'top', 'right', 'bottom'] as const) style[inset] = ''
    style.translate = ''

    const side = chooseSide(box, this.element.offsetWidth, this.element.offsetHeight, gap)
    const a = anchor.getBoundingClientRect()
    const clearance: Record<Side, number> = {
      bottom: box.y + box.height - a.bottom + gap,
      top: a.top - box.y + gap,
      right: box.x + box.width - a.right + gap,
      left: a.left - box.x + gap,
    }
    style.setProperty('position-area', AREA[side])
    style[MARGIN[side]] = `${Math.max(gap, clearance[side])}px`

    // An enhancement, not the mechanism: `@position-try` and this property need
    // Safari 26, and the side picked above is already the one with room. Where
    // it exists it covers what the measurement could not — a target scrolled
    // towards the edge after the step began. A flip swaps the margins with the
    // area, so the clearance written above survives it.
    if (CSS.supports('position-try-fallbacks: flip-block')) {
      style.setProperty('position-try-fallbacks', 'flip-block, flip-inline')
    }
  }

  /**
   * Where the browser cannot track an anchor, the message goes to the foot of
   * the viewport and stays there.
   *
   * The alternative — placing it beside the cutout from measurements, and
   * leaving it — would be a message that points at the right place until the
   * first scroll and at the wrong one forever after. Anchor positioning is
   * allowed to degrade; being wrong is not the same as being plain.
   */
  private dock(): void {
    const style = this.element.style
    style.removeProperty('position-area')
    for (const margin of MARGINS) style[margin] = '0px'
    style.left = '50%'
    style.top = 'auto'
    style.bottom = 'var(--leko-message-dock, 24px)'
    style.translate = '-50% 0'
  }

  destroy(): void {
    this.release()
    if (this.open) this.element.hidePopover?.()
    this.open = false
    this.element.remove()
  }
}
