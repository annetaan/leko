/**
 * Ask a target where it is, now.
 *
 * Apart from `geometry.ts` because these three read the page, and everything
 * there is numbers in and numbers out — DESIGN.md, **How to write here, and
 * where tests go**.
 */

/**
 * Anything the spotlight can be pointed at. Declared here rather than imported,
 * because the package this one is drawn for is the package that depends on it.
 * `@annetaan/leko` names the same union `LekoTarget` for its users.
 *
 * **Both members are a question, never an answer.** A selector is one this file
 * runs; a function is one the host runs, and neither is an element — DESIGN.md
 * argues it under **A target is a question**, and why the element type is
 * `Element` under **Resolution & custom functions**.
 */
export type Target = string | (() => Element | null)

/**
 * Whether an element has a box on the page.
 *
 * The list rather than the rect, because a rect cannot tell the two apart:
 * `getBoundingClientRect` answers all zeros both for an element with no box and
 * for a rendered one of zero size, and the second has a place on the page while
 * the first has none. An element with no box answers with an empty list —
 * `display: none` on it or on anything it is inside, `display: contents`, and a
 * subtree a `content-visibility: hidden` is skipping — and a rendered element
 * answers with at least one however small it is.
 *
 * `visibility: hidden` and `opacity: 0` have boxes, so an element hidden either
 * way is one the tour still points at. DESIGN.md argues the rule this answers
 * under **An element with no box is not found**, and when it is asked — a
 * layout read, so only where layout is read already — under **An element with
 * no box is not found when the target is resolved**.
 */
export const hasBox = (el: Element): boolean => el.getClientRects().length > 0

/**
 * Ask a target where it is, now. Selectors take the first match; a selector is
 * never read as "all matches", because widening that later would silently
 * change what existing tours highlight.
 *
 * **Asked again every time anything needs the box** — DESIGN.md, **A target is
 * a question**. A function that hands back a node the document has let go of is
 * treated as no answer at all, which is the same `null` a selector matching
 * nothing gives and the same entrance to the search for a lost target. So is an
 * element with no box, and DESIGN.md argues what that costs either way under
 * **An element with no box is not found**. Nothing after the draw is decided
 * here — DESIGN.md, **The page is measured when a step is drawn, and not
 * again**.
 *
 * `isConnected` is asked first because it is free, and a node a framework has
 * replaced is the commonest no of the two.
 */
export function resolveTarget(target: Target): Element | null {
  const el = typeof target === 'string' ? document.querySelector(target) : target()
  return el?.isConnected && hasBox(el) ? el : null
}

export function resolveTargets(targets: readonly Target[]): Element[] {
  return targets.map(resolveTarget).filter((el): el is Element => el !== null)
}
