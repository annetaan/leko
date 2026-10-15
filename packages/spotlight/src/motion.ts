/**
 * Whether the tour is moving things or setting them.
 *
 * One rule, read by the morph, by the scroll that precedes it, by the message
 * and by a refusal, which shakes or dips, so no two of them can disagree about
 * it — which is why it lives apart from all of them. DESIGN.md, **The scroll
 * animates exactly when the morph does**.
 */

export const prefersReducedMotion = (): boolean =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Whether a change of `duration` is animated at all, or applied outright. */
export const animates = (duration: number): boolean => duration > 0 && !prefersReducedMotion()
