import type { Rect } from './geometry.js'

// What the shell reads off the page, and nothing it decides. Called from a
// measure and never from a scroll — [Measuring](../DESIGN.md#measuring).

/**
 * Whether an element has a box at all. Copied from `hasBox` in
 * `packages/spotlight/src/target.ts`, which says why the list of client rects
 * is asked rather than the bounding rect, and which the spotlight does not
 * export — [What comes from the spotlight](../DESIGN.md#what-comes-from-the-spotlight).
 */
export const hasBox = (el: Element): boolean => el.getClientRects().length > 0

/** The element a target names, or `undefined` where it is not found — [What a target is](../DESIGN.md#what-a-target-is). */
export function resolve(target: string | Element): Element | undefined {
  if (typeof target !== 'string') return target.isConnected && hasBox(target) ? target : undefined
  for (const el of document.querySelectorAll(target)) if (hasBox(el)) return el
  return undefined
}

/** One reading of the page. `origin` is where the scrim's root sits at `left: 0; top: 0`. */
export interface Page {
  scrollX: number
  scrollY: number
  /** What a message has to fit in. */
  viewportWidth: number
  viewportHeight: number
  pageWidth: number
  pageHeight: number
  origin: { x: number; y: number }
}

/** The viewport is the root element's client area — [Measuring](../DESIGN.md#measuring). */
export function readPage(root: HTMLElement): Page {
  const scrollX = window.scrollX
  const scrollY = window.scrollY
  const doc = document.documentElement
  const at = root.getBoundingClientRect()
  return {
    scrollX,
    scrollY,
    viewportWidth: doc.clientWidth,
    viewportHeight: doc.clientHeight,
    pageWidth: Math.max(doc.scrollWidth, doc.clientWidth),
    pageHeight: Math.max(doc.scrollHeight, doc.clientHeight),
    origin: { x: at.left + scrollX, y: at.top + scrollY },
  }
}

/** An element's border box in page coordinates. */
export function boxOf(el: Element, page: Page): Rect {
  const r = el.getBoundingClientRect()
  return { x: r.left + page.scrollX, y: r.top + page.scrollY, width: r.width, height: r.height }
}
