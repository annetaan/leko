/**
 * Whether the tour is moving things or setting them.
 *
 * One rule, read by the morph and by the scroll that precedes it, so the two
 * can never disagree about it. A host that asked for no morph did not ask for
 * a gliding page either.
 *
 * It lives apart from the scrim and the glide because it belongs to neither:
 * both read it, and so does the message. DESIGN.md states it under **Bringing
 * a target into view**.
 */

export const prefersReducedMotion = (): boolean =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Whether a change of `duration` is animated at all, or applied outright. */
export const animates = (duration: number): boolean => duration > 0 && !prefersReducedMotion()
