/**
 * Where the curtain is, and what an arrival may ask of it.
 *
 * The scrim with no hole in it, and the four things the presenter used to hold
 * about it: a delay running, a frame not yet painted, the moment it was first
 * painted, and the minimum still owed. Any two of those set at once was a state
 * nothing had a name for, so they are one value here and the decisions taken
 * off it are functions with a test of their own.
 *
 * DESIGN.md argues what the curtain is for under **The curtain**. This file is
 * only its lifetime.
 */

type Timer = ReturnType<typeof setTimeout>

/**
 * How long the curtain stays once it has been seen, whatever the arrival does.
 *
 * A threshold has a band just above it: cross at 250ms with an arrival that
 * ends at 300ms and the curtain is up for 50ms, which reads as a fault rather
 * than as waiting. An arrival landing inside this waits it out.
 */
export const MINIMUM = 400

/**
 * The handle each state carries is the one that state has running, so which way
 * to stop it is a question the compiler answers.
 */
export type Curtain =
  | { kind: 'down' }
  /** An arrival began, and the delay before the curtain shows is running. */
  | { kind: 'waiting'; timer: Timer }
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

/** What an arrival asks of the curtain. */
export type Onset =
  /** Leave it alone. */
  | { do: 'nothing' }
  /** Run the delay, and paint when it ends. */
  | { do: 'wait'; after: number }
  /** Paint now, without spending a task on `setTimeout(fn, 0)` first. */
  | { do: 'paint' }

/**
 * What an arrival does to the curtain. `after` is what `curtain` said, with
 * `false` for never and `0` for at once.
 *
 * **Already covering stays covering.** Two arrivals in a row are one window as
 * far as somebody watching is concerned, and dropping it between them would be
 * a flash of the page they are not meant to be using yet.
 */
export const onset = (curtain: Curtain, after: number | false): Onset => {
  if (covering(curtain) || after === false) return { do: 'nothing' }
  return after === 0 ? { do: 'paint' } : { do: 'wait', after }
}

/**
 * How much of the minimum a curtain lifted at `now` still owes.
 *
 * Measured from the frame it was first painted in, not from when it was set. A
 * step that declares `curtain: true` and hands back nothing owes nothing: it
 * was set and replaced inside one task, no frame ever carried it, and there is
 * nothing for a minimum to protect anybody from.
 */
export const owed = (curtain: Curtain, now: number): number =>
  curtain.kind === 'up' ? Math.max(0, MINIMUM - (now - curtain.since)) : 0
