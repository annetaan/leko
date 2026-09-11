import { type Corner, cornerRect, freeCorner, type Rect } from './geometry.js'
import { layoutViewport } from './surface.js'

/** How far in from the viewport edges the control sits. */
const GAP = 16

/** What the control reads until an instance says otherwise. */
const LABEL = 'End tour'

/**
 * The one control Leko puts on the page outside the message, and the only one
 * that is there for as long as the tour is drawn.
 *
 * It ends the tour, it is not a back button, and there is no way to turn it
 * off. DESIGN.md argues all three under **The way out**; what this file adds is
 * that ending asks nothing of an arrival, so the control always works.
 */
export class Close {
  readonly element: HTMLElement
  private readonly control = document.createElement('button')
  private teardown: (() => void) | undefined
  private open = false
  private corner: Corner | undefined

  /**
   * `stop` is called when the control is used. `render` replaces what goes
   * inside it, and is handed the same `stop` and a root to fill.
   *
   * A host that renders its own gets a container and nothing else. Leko owns
   * where the box goes, because staying off the cutouts is the part that needs
   * the geometry, and the host owns what is in it.
   */
  constructor(
    private readonly stop: () => void,
    label: string = LABEL,
    render?: (root: HTMLElement, stop: () => void) => (() => void) | void,
  ) {
    const el = document.createElement('div')
    el.className = 'leko-close'
    Object.assign(el.style, {
      position: 'fixed',
      margin: '0',
      width: 'max-content',
      padding: '0',
      border: '0',
      background: 'transparent',
      // Above the message, so a box that lands on top of this still leaves it
      // pressable. The escape hatch wins whatever else is on screen.
      zIndex: 'var(--leko-close-z, 10001)',
      pointerEvents: 'auto',
    })
    el.popover = 'manual'

    if (render) {
      this.teardown = render(el, stop) ?? undefined
    } else {
      this.control.className = 'leko-close-control'
      this.control.type = 'button'
      this.control.textContent = label
      Object.assign(this.control.style, {
        border: '0',
        cursor: 'pointer',
        padding: 'var(--leko-close-padding, 6px 14px)',
        borderRadius: 'var(--leko-close-radius, 6px)',
        background: 'var(--leko-close-bg, #fff)',
        color: 'var(--leko-close-color, #16181d)',
        font: 'var(--leko-close-font, 600 13px/1.5 system-ui, sans-serif)',
        boxShadow: 'var(--leko-close-shadow, 0 6px 24px rgb(0 0 0 / 0.28))',
      })
      this.control.addEventListener('click', this.press)
      el.append(this.control)
    }

    this.element = el
  }

  /**
   * One press ends one tour, and a second press has nothing to end.
   *
   * The guard the message control needs against a doubled press is not needed
   * here: `stop()` is a no-op the second time, so there is nothing for a
   * repeated press to walk past.
   */
  private readonly press = (): void => {
    this.stop()
  }

  /**
   * Put it in a corner that neither a cutout nor the host's own chrome covers.
   *
   * `cutouts` is everything to keep off, in viewport coordinates — the step's
   * holes, and whatever the host named as its chrome. The corner is decided
   * every time this is called, so it follows a step whose hole moved into the
   * corner this was in.
   *
   * Placed against {@link layoutViewport}, which is where the reason for that
   * is written: this box is `position: fixed` and the boxes handed in came from
   * `getBoundingClientRect`, so a gutter's worth of error would put the one
   * control that must always be pressable under the scrollbar. The scrim goes
   * the other way and is sized past that viewport on purpose: DESIGN.md, **That
   * layer is sized past the layout viewport on purpose, gutter included**.
   */
  place(cutouts: readonly Rect[]): void {
    if (!this.element.isConnected) document.body.append(this.element)
    if (!this.open) {
      // Absent where the top layer is not supported; the z-index carries the
      // element in that case.
      this.element.showPopover?.()
      this.open = true
    }
    // Measured rather than assumed, because a host's own control is whatever
    // size it decided to be.
    const size = { width: this.element.offsetWidth, height: this.element.offsetHeight }
    const { width, height } = layoutViewport()
    this.corner = freeCorner(width, height, size, cutouts, GAP)
    const at = cornerRect(width, height, size, this.corner, GAP)
    Object.assign(this.element.style, {
      left: `${at.x}px`,
      top: `${at.y}px`,
      right: 'auto',
      bottom: 'auto',
    })
  }

  /** Which corner it took, for a test to read. `undefined` before it is placed. */
  get at(): Corner | undefined {
    return this.corner
  }

  destroy(): void {
    this.teardown?.()
    this.teardown = undefined
    if (this.open) this.element.hidePopover?.()
    this.open = false
    this.element.remove()
  }
}
