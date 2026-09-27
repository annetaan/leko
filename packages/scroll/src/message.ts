import type { Hole } from './geometry.js'
import type { LekoScrollMessage, LekoScrollSide } from './types.js'

/**
 * The box beside a lit hole, placed in page coordinates inside the scrim's
 * root so it scrolls with the page and dims with it —
 * [The message](../DESIGN.md#the-message).
 */
export class Message {
  readonly element: HTMLElement
  private readonly title = document.createElement('div')
  private readonly body = document.createElement('div')
  private shown = false
  private asked: LekoScrollSide = 'bottom'

  constructor() {
    const el = document.createElement('div')
    el.className = 'leko-scroll-message'
    Object.assign(el.style, {
      position: 'absolute',
      left: '0',
      top: '0',
      margin: '0',
      width: 'max-content',
      maxWidth: 'var(--leko-scroll-message-max-width, min(320px, calc(100vw - 32px)))',
      padding: 'var(--leko-scroll-message-padding, 12px 16px)',
      border: 'var(--leko-scroll-message-border, none)',
      borderRadius: 'var(--leko-scroll-message-radius, 8px)',
      background: 'var(--leko-scroll-message-bg, #fff)',
      color: 'var(--leko-scroll-message-color, #16181d)',
      font: 'var(--leko-scroll-message-font, 500 14px/1.5 system-ui, sans-serif)',
      boxShadow: 'var(--leko-scroll-message-shadow, 0 6px 24px rgb(0 0 0 / 0.28))',
      // Hidden with `visibility` rather than `display`, so the box is still
      // laid out and its width can be read to choose a side before it shows.
      visibility: 'hidden',
      opacity: '0',
      pointerEvents: 'none',
      // A length property the box has no other use for, so the gap token is
      // resolved to px by the engine, whatever unit the page wrote it in.
      scrollMarginTop: 'var(--leko-scroll-message-gap, 12px)',
    })

    this.title.className = 'leko-scroll-message-title'
    this.title.style.font =
      'var(--leko-scroll-message-title-font, 600 15px/1.4 system-ui, sans-serif)'
    this.body.className = 'leko-scroll-message-body'

    el.append(this.title, this.body)
    this.element = el
  }

  get visible(): boolean {
    return this.shown
  }

  /** The side last asked for, so a hole put back where its target now is can take the box along. */
  get side(): LekoScrollSide {
    return this.asked
  }

  /** Fill the box, put it beside `hole` and fade it in. */
  show(content: LekoScrollMessage, hole: Hole, side: LekoScrollSide, viewportWidth: number): void {
    Message.part(this.title, content.title ?? '')
    Message.part(this.body, content.body ?? '')
    this.place(hole, side, viewportWidth)
    // Read so the opacity of 0 is computed before the transition is written.
    // Otherwise a hide and a show in the same frame is no change at all, and
    // nothing fades.
    void this.element.offsetWidth
    Object.assign(this.element.style, {
      transition: 'opacity 150ms',
      visibility: 'visible',
      opacity: '1',
    })
    this.shown = true
  }

  /** Gone at once, with no fade. */
  hide(): void {
    Object.assign(this.element.style, { transition: '', visibility: 'hidden', opacity: '0' })
    this.shown = false
  }

  /**
   * Put the box on `side` of `hole`, or on the bottom where a `left` or a
   * `right` does not fit `viewportWidth`. The box's width and the gap are read
   * here, which runs on an arrival or a measure and never on a scroll.
   */
  place(hole: Hole, side: LekoScrollSide, viewportWidth: number): void {
    this.asked = side
    const style = this.element.style
    const gap = parseFloat(getComputedStyle(this.element).scrollMarginTop)
    const width = this.element.offsetWidth
    const taken =
      side === 'left' && hole.x - gap - width < 0
        ? 'bottom'
        : side === 'right' && hole.x + hole.width + gap + width > viewportWidth
          ? 'bottom'
          : side
    const middleX = hole.x + hole.width / 2
    const middleY = hole.y + hole.height / 2
    const [left, top, translate] =
      taken === 'bottom'
        ? [middleX, hole.y + hole.height + gap, '-50% 0']
        : taken === 'top'
          ? [middleX, hole.y - gap, '-50% -100%']
          : taken === 'right'
            ? [hole.x + hole.width + gap, middleY, '0 -50%']
            : [hole.x - gap, middleY, '-100% -50%']
    Object.assign(style, { left: `${left}px`, top: `${top}px`, translate })
  }

  /**
   * An empty part is taken out of the layout rather than left as an empty
   * line. `hidden` is a rule in the user-agent stylesheet, which any author
   * rule on the part beats, so `display` is written beside it.
   */
  private static part(el: HTMLElement, text: string): void {
    el.textContent = text
    el.hidden = text === ''
    el.style.display = text === '' ? 'none' : 'block'
  }
}
