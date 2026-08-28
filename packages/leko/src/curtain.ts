/**
 * Where the curtain is, and what lifting it still owes.
 *
 * The scrim with no hole in it, and the three things the presenter used to hold
 * about it: a frame not yet painted, the moment it was first painted, and the
 * minimum still owed. Any two of those set at once was a state nothing had a
 * name for, so they are one value here and the decisions taken off it are
 * functions with a test of their own.
 *
 * DESIGN.md argues what the curtain is for under **The curtain**. This file is
 * only its lifetime.
 */

/**
 * How long the curtain stays once it has been seen, whatever the search does.
 *
 * A target that comes back in the next frame would otherwise leave the page
 * dark for 16ms, which reads as a fault rather than as waiting. A search that
 * ends inside this waits it out.
 */
export const MINIMUM = 400

/**
 * The handle each state carries is the one that state has running, so which way
 * to stop it is a question the compiler answers.
 */
export type Curtain =
  | { kind: 'down' }
  /** The curtain is set, and the frame that paints it has not run. */
  | { kind: 'painting'; frame: number }
  /** Painted at `since`, which is when {@link MINIMUM} starts. */
  | { kind: 'up'; since: number }

export const DOWN: Curtain = { kind: 'down' }

/**
 * Whether the page is covered, or will be in the next frame.
 *
 * A step revealed from under a curtain opens its hole out of the curtain. The
 * other opening, from a hole larger than the page, would flash the whole page
 * clear on the way.
 */
export const covering = (curtain: Curtain): boolean =>
  curtain.kind === 'painting' || curtain.kind === 'up'

/**
 * How much of the minimum a curtain lifted at `now` still owes.
 *
 * Measured from the frame it was first painted in, not from when it was set. A
 * curtain that was set and replaced inside one task owes nothing: no frame ever
 * carried it, and there is nothing for a minimum to protect anybody from.
 */
export const owed = (curtain: Curtain, now: number): number =>
  curtain.kind === 'up' ? Math.max(0, MINIMUM - (now - curtain.since)) : 0
