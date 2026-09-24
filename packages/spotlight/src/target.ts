/**
 * Ask a target where it is, now.
 *
 * Apart from `geometry.ts` because these three read the page, and everything
 * there is numbers in and numbers out — DESIGN.md, **How to write here, and
 * where tests go**.
 */

import { overlaps } from './geometry.js'
import { layoutViewport } from './surface.js'

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
 * `visibility: hidden` and `opacity: 0` have boxes, so `hasBox` says yes to
 * them; whether the step points at one is `resolve`'s question, and the default
 * passes them over. DESIGN.md argues the rule this answers
 * under **An element with no box is not found**, and when it is asked — a
 * layout read, so only where layout is read already — under **An element with
 * no box is not found when the target is resolved**.
 */
export const hasBox = (el: Element): boolean => el.getClientRects().length > 0

/**
 * Whether an element is one the viewer can see, as far as style goes.
 *
 * Both options on, because `checkVisibility()` with no argument answers only
 * the question {@link hasBox} already answers: `visibility` and `opacity` are
 * off by default, so the bare call reports nothing about either.
 *
 * `true` where the method is missing, which degrades the rule to `'first'`
 * rather than making every match invisible. `focus.ts`'s `reachable` stands the
 * same way off the same method, and DESIGN.md's **Browser support** is why
 * neither declares a floor. An engine whose method predates the two options —
 * Chrome before 121, Firefox before 122 — ignores them and answers the bare
 * question, which degrades the rule the same way. Both are known limits of the
 * default, listed under **Which of several matches a selector means**.
 */
const shows = (el: Element): boolean => {
  if (!el.checkVisibility) return true
  return el.checkVisibility({ visibilityProperty: true, opacityProperty: true })
}

/**
 * Whether any of an element is inside the layout viewport.
 *
 * The box on screen against {@link layoutViewport}, which is the space that box
 * is already in.
 */
const inViewport = (el: Element): boolean => {
  const r = el.getBoundingClientRect()
  return overlaps({ x: r.left, y: r.top, width: r.width, height: r.height }, layoutViewport())
}

/**
 * Which of several matches a step means — DESIGN.md, **Which of several matches
 * a selector means**, which is also where the known limits are.
 */
export type ResolveMode = 'first' | 'visible-first' | 'in-viewport-first'

/** What a mode asks of a candidate on top of its having a box. */
const passes = (el: Element, resolve: ResolveMode): boolean => {
  if (resolve === 'first') return true
  if (!shows(el)) return false
  return resolve === 'visible-first' ? true : inViewport(el)
}

/**
 * Ask a target where it is, now. A selector takes the first match that passes
 * `resolve`; a selector is never read as "all matches", because widening that
 * later would silently change what existing tours highlight.
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
 *
 * `'first'` keeps `querySelector`, which stops at the match it finds rather
 * than building a list of every one. A function is one candidate whatever the
 * mode, so the rule is applied to the element it hands back: candidates are
 * narrowed and the first is taken, which is what makes a selector, a function,
 * one element and a region all mean the same thing.
 */
export function resolveTarget(target: Target, resolve: ResolveMode): Element | null {
  if (typeof target !== 'string') {
    const el = target()
    return el?.isConnected && hasBox(el) && passes(el, resolve) ? el : null
  }
  if (resolve === 'first') {
    const el = document.querySelector(target)
    return el?.isConnected && hasBox(el) ? el : null
  }
  for (const el of document.querySelectorAll(target)) {
    if (el.isConnected && hasBox(el) && passes(el, resolve)) return el
  }
  return null
}

export function resolveTargets(targets: readonly Target[], resolve: ResolveMode): Element[] {
  // Spelled out rather than handed to `map`, which would pass the index along
  // as the mode.
  return targets
    .map((target) => resolveTarget(target, resolve))
    .filter((el): el is Element => el !== null)
}
