/**
 * The frame loop that keeps a hole under a target the page moves out from
 * under it — a `position: sticky` target crossing its pin, and nothing else.
 *
 * The one exception to the ban on reading layout while the user scrolls.
 * DESIGN.md argues it under **A sticky target's hole is corrected on a frame
 * loop, and that is the only exception to the ban**, and why the loop measures
 * rather than a scroll-driven animation predicting under
 * **The zero-JS answer is `animation-timeline: scroll()`, and it was not taken**.
 *
 * Like `glide.ts`, this knows nothing about scrims or steps: it is handed a
 * question to ask the page, somewhere to put the answer, and the ports whose
 * scrolling could change it.
 */

import { type Cutout, sameCutouts } from './geometry.js'

/** A follow that is armed: how to take it down. */
export interface Follow {
  /** Cancels the next frame and takes the listeners off. */
  stop(): void
}

/**
 * How many frames of boxes that have not moved end the loop.
 *
 * Two rather than one, because a scroll ends with a frame that still moves
 * things and a single still frame arrives while the viewer is very likely
 * still going. Two rather than more, because every extra one is a frame of
 * layout read for nothing on a page that has stopped. Parking is not stopping:
 * the next `scroll` on any port starts it again inside one frame.
 */
const STILL_FRAMES = 2

/**
 * Correct `write`'s boxes against `read`'s while any of `ports` is scrolling.
 *
 * `from` is what is on screen already, so a first frame that finds the boxes
 * where the draw left them writes nothing.
 *
 * `read()` answering `undefined` means the target has left the page, and the
 * loop stops itself there. What was drawn last stays drawn — the same answer a
 * `refit` gives, for the same reason: a hole standing where the target was is
 * better than the page snapping undimmed.
 *
 * Nothing starts a frame but a `scroll` on one of the ports. On a page nobody
 * is scrolling this costs one passive listener per port and not a frame.
 */
export function follow(
  from: readonly Cutout[],
  read: () => Cutout[] | undefined,
  write: (cutouts: Cutout[]) => void,
  ports: readonly EventTarget[],
): Follow {
  let frame: number | undefined
  let stopped = false
  let last: readonly Cutout[] = from
  let still = 0

  const tick = (): void => {
    frame = undefined
    const now = read()
    if (!now) return stop()
    if (sameCutouts(last, now)) {
      still += 1
    } else {
      still = 0
      last = now
      write(now)
    }
    if (still < STILL_FRAMES) frame = requestAnimationFrame(tick)
  }

  const wake = (): void => {
    if (stopped || frame !== undefined) return
    still = 0
    frame = requestAnimationFrame(tick)
  }

  const stop = (): void => {
    stopped = true
    if (frame !== undefined) cancelAnimationFrame(frame)
    frame = undefined
    for (const port of ports) port.removeEventListener('scroll', wake)
  }

  for (const port of ports) port.addEventListener('scroll', wake, { passive: true })
  return { stop }
}
