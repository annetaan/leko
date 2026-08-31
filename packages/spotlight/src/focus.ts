/**
 * The ring focus cannot leave while a tour is drawn.
 *
 * The scrim blocks the pointer with rectangles, and a rectangle stops a click.
 * It does not stop Tab. Without this, a step that shows a hole it did not open
 * is a step whose target can still be reached, operated and navigated away
 * from, one key at a time.
 *
 * DESIGN.md argues what this is for under **A hole, and whether it is open**
 * and **The ring focus cannot leave**.
 */

/**
 * What counts as a stop for Tab.
 *
 * A hand-written list, because there is no way to ask the platform. It is the
 * usual one, and what it gets wrong it gets wrong in the safe direction: a stop
 * this misses is a stop inside a segment, which Tab reaches anyway because
 * nothing here reorders what is between two ends.
 */
const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'details > summary',
  'audio[controls]',
  'video[controls]',
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

/**
 * A place Tab can land: focusable HTML, or focusable SVG. Both carry `focus()`,
 * and nothing else in the ring is asked of a stop.
 */
type Stop = HTMLElement | SVGElement

/**
 * Whether an element is somewhere Tab would actually land.
 *
 * `checkVisibility` is the honest answer and is not everywhere yet, so an
 * element with no offset parent stands in for it. A `position: fixed` element
 * has no offset parent either and is perfectly visible, which is why that is
 * asked separately. SVG has no offset parents at all, so where
 * `checkVisibility` is missing an SVG stop is taken at its word.
 */
const reachable = (el: Stop): boolean => {
  if (el.checkVisibility) return el.checkVisibility()
  if (!(el instanceof HTMLElement)) return true
  return el.offsetParent !== null || getComputedStyle(el).position === 'fixed'
}

/**
 * Where a redirect lands, as an index into the ring.
 *
 * Pure, and the only decision this file makes. `from` is the segment focus was
 * last in, or `-1` where it was nowhere: a tour that has just been drawn, or a
 * host that moved focus itself. Forward from nowhere is the first segment and
 * backward from nowhere is the last, which is what a ring with no history
 * should do in each direction.
 */
export function neighbour(count: number, from: number, backward: boolean): number {
  if (count <= 0) return -1
  if (from < 0) return backward ? count - 1 : 0
  return (from + (backward ? -1 : 1) + count) % count
}

/**
 * The first and last places Tab would land inside `roots`, or `undefined` where
 * there are none.
 *
 * A root counts as its own first stop when it is focusable, which is the
 * ordinary case: a step whose target is the button.
 */
export function ends(roots: readonly Element[]): { first: Stop; last: Stop } | undefined {
  const stops: Stop[] = []
  for (const root of roots) {
    if (
      (root instanceof HTMLElement || root instanceof SVGElement) &&
      root.matches(FOCUSABLE) &&
      reachable(root)
    ) {
      stops.push(root)
    }
    for (const el of root.querySelectorAll<Stop>(FOCUSABLE)) {
      if (reachable(el)) stops.push(el)
    }
  }
  const first = stops[0]
  const last = stops[stops.length - 1]
  return first && last ? { first, last } : undefined
}

interface Segment {
  readonly roots: readonly Element[]
  readonly first: Stop
  readonly last: Stop
}

/**
 * Where focus really is, across shadow boundaries.
 *
 * `document.activeElement` stops at a shadow host, and a step whose target is
 * inside one would otherwise never look like it was on a segment's edge.
 */
const active = (): Element | null => {
  let el = document.activeElement
  while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement
  return el
}

/**
 * A ring of segments, and a net that puts focus back in it.
 *
 * **Nothing here reorders what Tab does.** The ring is put in document order,
 * which is the order Tab already takes, and then Tab walks it on its own. The
 * step's target sits in the middle of the page and Leko's chrome is appended to
 * the end of the body, so what falls out is target, then the message, then the
 * way out. This catches only the two moments Tab would walk out of the ring.
 *
 * **It is a net rather than a promise.** A positive `tabindex` in the host page,
 * an `iframe` inside a segment, or a host moving focus on its own can all put
 * focus somewhere this did not plan for. What happens then is one bounce back
 * into the ring rather than anything worse, and DESIGN.md lists the ones that
 * are known.
 */
export class FocusRing {
  /**
   * The two ends of the document, made focusable so that leaving is something
   * this hears about.
   *
   * A `focusin` fires for focus landing somewhere. Tab off the end of the last
   * element in the document lands nowhere: focus goes to the browser's own
   * chrome, and the page is told nothing.
   *
   * A backstop rather than the usual path. {@link onKeyDown} steps over the gap
   * between two segments before the browser acts, so an ordinary Tab never
   * reaches either of these. What reaches them is a page whose tab order is not
   * what this assumed, and then the ring closes a key later instead of never.
   *
   * Zero-area, and focus never rests on either.
   */
  private readonly before = FocusRing.sentinel()
  private readonly after = FocusRing.sentinel()
  private segments: Segment[] = []
  /** Which segment focus was last seen in, or `-1` for nowhere. */
  private at = -1
  /** Which way the last Tab went, so a redirect lands on the right end. */
  private backward = false
  /**
   * One bounce per turn.
   *
   * A redirect focuses something, which fires another `focusin`. That one is
   * inside the ring and stops here. A host that moves focus back out again in
   * the same turn would otherwise be answered for ever.
   */
  private bouncing = false

  constructor() {
    document.addEventListener('keydown', this.onKeyDown, true)
    document.addEventListener('focusin', this.onFocusIn, true)
  }

  private static sentinel(): HTMLElement {
    const el = document.createElement('div')
    el.className = 'leko-edge'
    el.tabIndex = 0
    el.setAttribute('aria-hidden', 'true')
    Object.assign(el.style, { position: 'fixed', width: '0', height: '0', outline: 'none' })
    return el
  }

  /**
   * The ring, in whatever order it is handed over.
   *
   * Segments with nothing to focus in them drop out here rather than at every
   * redirect: a step with no next control on its message is a message that is
   * not a stop at all.
   *
   * **The rest are sorted into document order**, which is the order Tab takes
   * them. The top layer changes what paints over what and nothing about
   * sequential focus navigation, so a popover is still reached where it sits in
   * the tree (`spike/tab-order-in-the-top-layer/`). A ring that disagreed with
   * the browser would answer a step out of it by sending focus to a segment
   * Tab had just come from, and the two would trade the same pair for ever.
   */
  set(ring: readonly (readonly Element[])[]): void {
    this.segments = ring.flatMap((roots) => {
      const found = ends(roots)
      return found ? [{ roots, ...found }] : []
    })
    this.segments.sort((a, b) =>
      a.first.compareDocumentPosition(b.first) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
    )
    // The tour moved, so where focus was last is about a ring that is gone.
    this.at = -1
    if (this.segments.length === 0) {
      this.before.remove()
      this.after.remove()
      return
    }
    // Moved rather than inserted once. Leko's own chrome is appended to the end
    // of the body as it is made, so a sentinel put there before the message
    // existed would no longer be the last thing in the document.
    document.body.prepend(this.before)
    document.body.append(this.after)
  }

  /**
   * Step over the gap between two segments, so focus never lands in it.
   *
   * The net below is a net: it hears about focus that has already arrived
   * somewhere, and moving it on from there means it arrived. A blocked field
   * would be focused for the length of a turn and announced for it. Tab from
   * the edge of a segment is the one case where the whole answer is known
   * before the browser acts, so it is taken here instead.
   *
   * **Only at an edge.** Inside a segment this does nothing at all, and the
   * browser walks the stops it always walked. That is what keeps this file from
   * having to know the tab order of anything.
   */
  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Tab') return
    this.backward = event.shiftKey
    const el = active()
    if (!el || this.segments.length === 0) return
    const here = this.segments.findIndex((s) => s.first === el || s.last === el)
    const segment = this.segments[here]
    if (!segment) return
    // A segment of one is both its own edges, and leaves in either direction.
    if (!(this.backward ? segment.first === el : segment.last === el)) return
    const to = this.segments[neighbour(this.segments.length, here, this.backward)]
    if (!to) return
    event.preventDefault()
    ;(this.backward ? to.last : to.first).focus()
  }

  /**
   * `composedPath` rather than `event.target`, because `focusin` retargets at a
   * shadow boundary and a target inside a shadow root arrives as its host. The
   * path is the composed ancestor chain, so a segment root anywhere above the
   * focused node is in it whichever side of a boundary each of them is on.
   */
  private readonly onFocusIn = (event: FocusEvent): void => {
    if (this.segments.length === 0) return
    const path = event.composedPath()
    const here = this.segments.findIndex((segment) => segment.roots.some((r) => path.includes(r)))
    if (here !== -1) {
      this.at = here
      return
    }
    if (this.bouncing) return
    this.bouncing = true
    queueMicrotask(() => {
      this.bouncing = false
    })
    const to = this.segments[neighbour(this.segments.length, this.at, this.backward)]
    if (!to) return
    // The end focus was heading towards. Going forward it is the start of the
    // next segment, and going backward it is the end of the one before.
    ;(this.backward ? to.last : to.first).focus()
  }

  destroy(): void {
    document.removeEventListener('keydown', this.onKeyDown, true)
    document.removeEventListener('focusin', this.onFocusIn, true)
    this.before.remove()
    this.after.remove()
    this.segments = []
    this.at = -1
  }
}
