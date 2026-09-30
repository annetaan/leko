import { type Rect, type Side, sideWithRoom, union } from './geometry.js'
import { prefersReducedMotion } from './motion.js'
import { MESSAGE_ANCHOR } from './scrim.js'

/** How long the message takes to fade back in after a morph. */
const FADE = 120

/**
 * Physical keywords, not logical ones. The side is chosen from measurements in
 * viewport coordinates, so the value written has to mean the same thing those
 * measurements did, whatever the writing mode.
 */
const INSET = {
  bottom: ['top', 'anchor(bottom)'],
  top: ['bottom', 'anchor(top)'],
  right: ['left', 'anchor(right)'],
  left: ['right', 'anchor(left)'],
} as const

const INSETS = ['top', 'bottom', 'left', 'right'] as const

/** The alignment that centres the box along the edge it is held against. */
const ALONG = {
  bottom: 'justifySelf',
  top: 'justifySelf',
  right: 'alignSelf',
  left: 'alignSelf',
} as const

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
  CSS.supports('anchor-name: --a') &&
  CSS.supports('top: anchor(bottom)') &&
  CSS.supports('justify-self: anchor-center')

/**
 * The step's message, placed beside its cutout.
 *
 * It lives in the top layer rather than inside the scrim's container, and
 * rather than on a large `z-index`. DESIGN.md argues both halves under **The
 * message**.
 *
 * Scrolling is still nobody's job here: an anchor-positioned element is offset
 * by the scroll of everything between it and its anchor, by the browser, with no
 * script involved. JS only picks the *side* — once per step, from measurements
 * it already has — and the browser keeps it there.
 *
 * **What it anchors to is a marker of Leko's own, never the target.** The scrim
 * owns it and puts it on the edge of the cutout; see `Scrim.anchorAt`.
 * DESIGN.md argues it under **The message anchors to a marker, never to the
 * target**.
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
   *
   * `room` is the part of the page the box may go in, in the same coordinates
   * as the cutouts — DESIGN.md, **The message**.
   */
  show(
    content: MessageContent,
    cutouts: Rect[],
    gap: number,
    room: Rect,
    at?: (side: Side) => void,
  ): void {
    this.fill(content)
    this.mount()
    this.place(cutouts, gap, room, at)
    Object.assign(this.element.style, {
      transition: prefersReducedMotion() ? '' : `opacity ${FADE}ms`,
      visibility: 'visible',
      opacity: '1',
      pointerEvents: 'auto',
    })
    this.shown = true
  }

  /**
   * Put the box on the page and into the top layer, still hidden. Does nothing
   * the second time.
   *
   * Separate from {@link show} because the presenter mounts the message before
   * the way out, which is what keeps the way out painting above it — DESIGN.md,
   * **The way out**. Where there is no top layer, `Close.place` says what
   * carries the two instead.
   */
  mount(): void {
    if (!this.element.isConnected) document.body.append(this.element)
    if (!this.open) {
      this.element.showPopover?.()
      this.open = true
    }
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

  private place(
    cutouts: Rect[],
    gap: number,
    room: Rect,
    at: ((side: Side) => void) | undefined,
  ): void {
    const box = union(cutouts)
    // No cutouts, or nowhere to put the anchor, is a step that points at
    // nothing: there is no hole to sit beside, so the box goes where it goes
    // when the browser cannot track one either.
    if (!this.anchored || !box || !at) return this.dock(room)

    // The side is chosen from what is on screen, and the anchor point is then
    // put on that edge of the cutout. **The whole of the clearance is the gap.**
    // What is being anchored to is the edge itself rather than the target
    // inside it, so there is no padding left to make up for here.
    const size = { width: this.element.offsetWidth, height: this.element.offsetHeight }
    const side = sideWithRoom(box, size, room, gap)
    at(side)
    this.hold(side, gap)
  }

  /**
   * Lay the box against the marker on `side`, `gap` away from it, with an inset
   * rather than inside an area, so no engine moves it back across the edge onto
   * the hole — DESIGN.md, **The message**.
   */
  private hold(side: Side, gap: number): void {
    const style = this.element.style
    for (const margin of MARGINS) style[margin] = '0px'
    style[MARGIN[side]] = `${gap}px`
    // `auto`, not cleared: a popover's UA style is `inset: 0`, and a box above
    // its hole is then laid against the top of the viewport, and in WebKit
    // onto the hole. `spike/an-anchored-box-out-of-room/` has the row.
    const [inset, edge] = INSET[side]
    for (const other of INSETS) style[other] = 'auto'
    style[inset] = edge
    style.justifySelf = ''
    style.alignSelf = ''
    style[ALONG[side]] = 'anchor-center'
    style.translate = ''
    style.setProperty('position-anchor', MESSAGE_ANCHOR)

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
  }

  /**
   * Where the browser cannot track an anchor, the message goes to the foot of
   * `room` and stays there.
   *
   * The alternative — placing it beside the cutout from measurements, and
   * leaving it — would be a message that points at the right place until the
   * first scroll and at the wrong one forever after. Anchor positioning is
   * allowed to degrade; being wrong is not the same as being plain.
   *
   * Written as the foot of the room less the dock rather than as `bottom`,
   * which is measured from the foot of the viewport and not from the foot of
   * the room. `translate` carries the box up by its own height, so what lands
   * on that line is its lower edge.
   */
  private dock(room: Rect): void {
    const style = this.element.style
    for (const margin of MARGINS) style[margin] = '0px'
    style.justifySelf = ''
    style.alignSelf = ''
    style.left = `${room.x + room.width / 2}px`
    style.top = `calc(${room.y + room.height}px - var(--leko-message-dock, 24px))`
    style.right = 'auto'
    style.bottom = 'auto'
    style.translate = '-50% -100%'
  }

  destroy(): void {
    if (this.open) this.element.hidePopover?.()
    this.open = false
    this.element.remove()
  }
}
