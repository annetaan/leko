import { type Rect, union } from './geometry.js'
import { MESSAGE_ANCHOR, prefersReducedMotion } from './scrim.js'

/** How long the message takes to fade back in after a morph. */
const FADE = 120

/**
 * Which side of the cutout the message sits on, in preference order: below
 * first, because a message under the thing it describes is the least surprising
 * place for it, and reading order puts it after the target rather than before.
 */
const SIDES = ['bottom', 'top', 'right', 'left'] as const
export type Side = (typeof SIDES)[number]

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

/** Everything the box can be asked to show at once. */
export interface MessageContent {
  /** The step's instruction, where it has one. */
  text: string | undefined
  /** What went wrong on the last attempt, where something did. */
  error: string | undefined
  /** The words on the next control, or `undefined` on a step that has none. */
  next: string | undefined
}

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
 *
 * **What it anchors to is a marker of Leko's own, never the target.** The scrim
 * owns it and puts it on the edge of the cutout; see `Scrim.anchorAt`. An
 * `anchor-name` cannot be read across a shadow boundary, and writing one onto
 * the target would be a mutation of the host page that has to be undone later.
 * DESIGN.md argues both under **A target is a question**.
 */
export class Message {
  readonly element: HTMLElement
  private readonly text = document.createElement('div')
  private readonly error = document.createElement('div')
  private readonly control = document.createElement('button')
  private readonly anchored = canAnchor()
  private open = false
  private shown = false
  private pressed = false

  /**
   * `next` is called when the control is pressed. The box knows nothing about
   * steps or validation: it reports a press, and what that means is decided
   * where the tour is.
   */
  constructor(private readonly next: () => void) {
    const el = document.createElement('div')
    el.className = 'leko-message'
    Object.assign(el.style, {
      position: 'fixed',
      margin: '0',
      width: 'max-content',
      maxWidth: 'var(--leko-message-max-width, min(320px, calc(100vw - 32px)))',
      padding: 'var(--leko-message-padding, 12px 16px)',
      // Written even though the default is none, because the box is a popover
      // and the UA stylesheet gives every popover `border: solid` in
      // `currentColor` — which is `--leko-message-color`, so the rim only
      // shows once a host makes the text light on dark.
      border: 'var(--leko-message-border, none)',
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

    // Announced when it changes, without stealing focus from the target: the
    // user is meant to be acting on the page, not on this. The role is on the
    // instruction rather than on the box, so that pressing the control does not
    // read the whole thing back.
    this.text.className = 'leko-message-text'
    this.text.setAttribute('role', 'status')

    this.error.className = 'leko-message-error'
    // Assertive, unlike the instruction: it is the answer to something the user
    // just tried, and arrives while their attention is on the attempt.
    this.error.setAttribute('role', 'alert')
    Object.assign(this.error.style, {
      marginTop: 'var(--leko-message-error-gap, 8px)',
      color: 'var(--leko-message-error-color, #b3261e)',
      font: 'var(--leko-message-error-font, 500 13px/1.5 system-ui, sans-serif)',
    })

    this.control.className = 'leko-message-next'
    // Never `submit`: the box is in the top layer and not in anyone's form, but
    // a default that depends on where an element is mounted is worth not having.
    this.control.type = 'button'
    Object.assign(this.control.style, {
      // Pushed to the end of the box, where a control that ends a step belongs,
      // and away from the instruction it is not part of.
      marginTop: 'var(--leko-message-next-gap, 12px)',
      marginInlineStart: 'auto',
      border: '0',
      cursor: 'pointer',
      padding: 'var(--leko-message-next-padding, 6px 14px)',
      borderRadius: 'var(--leko-message-next-radius, 6px)',
      background: 'var(--leko-message-next-bg, #16181d)',
      color: 'var(--leko-message-next-color, #fff)',
      font: 'var(--leko-message-next-font, 600 13px/1.5 system-ui, sans-serif)',
    })
    this.control.addEventListener('click', this.press)

    el.append(this.text, this.error, this.control)
    this.element = el
  }

  /**
   * One press advances one step.
   *
   * A press arrives more than once often enough to plan for — a touch that
   * emulates a click after its own, a host that has put the box inside
   * something with a handler of its own — and two of them a frame apart would
   * take the user past a step they never saw. Everything that reaches the
   * control within the same frame is the same press; a second real one is
   * further away than that, and still counts.
   */
  private readonly press = (): void => {
    if (this.pressed) return
    this.pressed = true
    requestAnimationFrame(() => {
      this.pressed = false
    })
    this.next()
  }

  /** Whether there is currently something on screen to read. */
  get visible(): boolean {
    return this.shown
  }

  /**
   * Show `text` beside `cutouts`, which are in viewport coordinates.
   *
   * `anchor` is the element the browser tracks — the one element the step is
   * about, and `undefined` where there is no step to point at. The cutouts are
   * what the message has to stay clear of, and they are a wider thing than the
   * anchor: every region the step named, each already unioned into a hole. The
   * gap between the two is turned into a margin here, once, and stays right for
   * as long as the two move together — which they do, being cut from the same
   * scrim.
   */
  show(content: MessageContent, cutouts: Rect[], gap: number, at?: (side: Side) => void): void {
    this.fill(content)
    if (!this.element.isConnected) document.body.append(this.element)
    if (!this.open) {
      // Absent where the top layer is not supported; the z-index above carries
      // the element in that case.
      this.element.showPopover?.()
      this.open = true
    }
    this.place(cutouts, gap, at)
    Object.assign(this.element.style, {
      transition: prefersReducedMotion() ? '' : `opacity ${FADE}ms`,
      visibility: 'visible',
      opacity: '1',
      pointerEvents: 'auto',
    })
    this.shown = true
  }

  /**
   * Put the parts in, leaving out whichever the step has nothing for. An empty
   * part is taken out of the layout rather than left as an empty line: the box
   * is measured to choose the side it goes on, so a part with nothing in it
   * would push the message off a target it would otherwise have fitted beside.
   */
  private fill(content: MessageContent): void {
    this.setText(content.text ?? '')
    this.setError(content.error ?? '')
    this.control.textContent = content.next ?? ''
    // On the label being there rather than on it saying anything: a host that
    // passes an empty `nextLabel` gets a blank button, and not a step with no
    // way out of it.
    Message.toggle(this.control, content.next !== undefined, 'block')
  }

  /**
   * `hidden` is a rule in the user-agent stylesheet, and everything this class
   * sets is an inline style, which beats it. So a part is put away with both at
   * once. The attribute alone leaves a button that is still on screen.
   */
  private static toggle(el: HTMLElement, on: boolean, display: string): void {
    el.hidden = !on
    el.style.display = on ? display : 'none'
  }

  /** Replace the instruction without moving anything. */
  setText(text: string): void {
    this.text.textContent = text
    Message.toggle(this.text, text !== '', 'block')
  }

  /** Replace the reason the last attempt failed, without moving anything. */
  setError(error: string): void {
    this.error.textContent = error
    Message.toggle(this.error, error !== '', 'block')
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

  private place(cutouts: Rect[], gap: number, at: ((side: Side) => void) | undefined): void {
    const style = this.element.style
    const box = union(cutouts)
    // No cutouts, or nowhere to put the anchor, is a step that points at
    // nothing: there is no hole to sit beside, so the box goes where it goes
    // when the browser cannot track one either.
    if (!this.anchored || !box || !at) return this.dock()

    for (const margin of MARGINS) style[margin] = '0px'
    for (const inset of ['left', 'top', 'right', 'bottom'] as const) style[inset] = ''
    style.translate = ''

    // The side is chosen from what is on screen, and the anchor point is then
    // put on that edge of the cutout. **The whole of the clearance is the gap.**
    // What is being anchored to is the edge itself rather than the target
    // inside it, so there is no padding left to make up for here.
    const side = chooseSide(box, this.element.offsetWidth, this.element.offsetHeight, gap)
    at(side)
    style.setProperty('position-anchor', MESSAGE_ANCHOR)
    style.setProperty('position-area', AREA[side])
    style[MARGIN[side]] = `${gap}px`

    // Whether a browser may take an anchored box away on its own. The initial
    // value is already this, so an engine that reads the property the way the
    // spec does is unaffected. **Safari is not.** It hides the message outright
    // when the anchor has no area and sits inside something that scrolls, which
    // is every anchor Leko writes: the marker is zero-area, and the scrim it
    // lives beside has to be in the scroller. The box lays out where it should
    // and paints nothing, so nothing on this side reports a problem.
    //
    // The other way out is to give the marker area, and that one is closed. It
    // sits on the edge of the cutout, so area puts an element of Leko's over a
    // hole the step opened. `spike/anchored-paint-in-safari/` has both columns.
    //
    // Unguarded, because a property an engine does not know is a declaration it
    // drops, which is the degradation wanted anyway. No test holds this down:
    // Playwright's WebKit paints the box with or without it.
    style.setProperty('position-visibility', 'always')

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
    if (this.open) this.element.hidePopover?.()
    this.open = false
    this.element.remove()
  }
}
