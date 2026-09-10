import { afterEach, expect, test, vi } from 'vitest'

import { follow } from './follow.js'
import type { Cutout } from './geometry.js'

// The loop on its own, with the page's part of it faked: a plain `EventTarget`
// for a port and a function for the boxes. What is pinned here is when it runs
// and when it does not, which is the whole of what makes it an exception worth
// having — DESIGN.md, **A sticky target's hole is corrected on a frame loop,
// and that is the only exception to the ban**. That it lands on a real sticky
// target is `leko.test.ts`'s.
//
// **On a clock the test owns**, the way the glide's tests are, because the
// claims are counts of frames.

afterEach(() => {
  vi.useRealTimers()
})

const hole = (x: number): Cutout => ({
  x,
  y: 0,
  width: 60,
  height: 20,
  radius: 0,
  interactive: true,
})

/** One frame, and the reaction to it. */
const tick = async (count = 1): Promise<void> => {
  for (let n = 0; n < count; n++) {
    vi.advanceTimersByTime(16)
    await Promise.resolve()
  }
}

test('a scroll starts it, and it parks once the boxes stop moving', async () => {
  vi.useFakeTimers()
  const port = new EventTarget()
  let boxes = [hole(0)]
  const written: Cutout[][] = []
  follow(
    [hole(0)],
    () => boxes,
    (cutouts) => written.push(cutouts),
    [port],
  )

  // Nothing has scrolled, so there is no frame to spend.
  await tick(4)
  expect(written).toHaveLength(0)

  boxes = [hole(10)]
  port.dispatchEvent(new Event('scroll'))
  await tick()
  expect(written).toHaveLength(1)

  // Still going: the loop keeps asking of its own accord while the answer keeps
  // changing, because a scroll fires far less often than a frame.
  boxes = [hole(20)]
  await tick()
  expect(written).toHaveLength(2)

  // Two still frames park it, and a third proves it parked: the boxes move and
  // nothing follows them, because no frame is asked for.
  await tick(2)
  boxes = [hole(30)]
  await tick(4)
  expect(written).toHaveLength(2)

  // Parking is not stopping.
  port.dispatchEvent(new Event('scroll'))
  await tick()
  expect(written).toHaveLength(3)
})

test('it writes nothing while the boxes are still', async () => {
  vi.useFakeTimers()
  const port = new EventTarget()
  const written: Cutout[][] = []
  follow(
    [hole(0)],
    () => [hole(0)],
    (cutouts) => written.push(cutouts),
    [port],
  )

  // A scroll that leaves the target where the draw found it — a port scrolled
  // back to where it was, or one carrying a pinned target — costs the frames
  // and nothing else.
  port.dispatchEvent(new Event('scroll'))
  await tick(6)
  expect(written).toHaveLength(0)
})

test('stop() takes the listeners off', async () => {
  vi.useFakeTimers()
  const port = new EventTarget()
  let boxes = [hole(0)]
  const written: Cutout[][] = []
  const following = follow(
    [hole(0)],
    () => boxes,
    (cutouts) => written.push(cutouts),
    [port],
  )

  following.stop()
  boxes = [hole(40)]
  port.dispatchEvent(new Event('scroll'))
  await tick(4)
  expect(written).toHaveLength(0)
})

test('a target that has left the page stops it, and what was drawn stays drawn', async () => {
  vi.useFakeTimers()
  const port = new EventTarget()
  let boxes: Cutout[] | undefined = [hole(10)]
  const written: Cutout[][] = []
  follow(
    [hole(0)],
    () => boxes,
    (cutouts) => written.push(cutouts),
    [port],
  )

  boxes = undefined
  port.dispatchEvent(new Event('scroll'))
  await tick(4)
  expect(written).toHaveLength(0)

  // Stopped, not parked: the target came back and nothing starts again.
  boxes = [hole(60)]
  port.dispatchEvent(new Event('scroll'))
  await tick(4)
  expect(written).toHaveLength(0)
})
