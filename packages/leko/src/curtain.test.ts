import { describe, expect, test } from 'vitest'

import { type Curtain, covering, DOWN, MINIMUM, onset, owed } from './curtain.js'

// No browser can get any of this wrong: it is a tagged union and three
// functions over it. `wiring.test.ts` is where the curtain meets a page.

const waiting: Curtain = { kind: 'waiting', timer: 0 as unknown as ReturnType<typeof setTimeout> }
const painting: Curtain = { kind: 'painting', frame: 1 }
const up = (since: number): Curtain => ({ kind: 'up', since })

describe('covering', () => {
  test('is the two states where the page is dark, or about to be', () => {
    expect([DOWN, waiting, painting, up(0)].map(covering)).toEqual([false, false, true, true])
  })
})

describe('what an arrival asks of it', () => {
  test('runs the delay a step named', () => {
    expect(onset(DOWN, 250)).toEqual({ do: 'wait', after: 250 })
  })

  test('paints at once where nothing is being waited for', () => {
    // `setTimeout(fn, 0)` is still a task away, and a step that says it is slow
    // should not spend one of those with the page open.
    expect(onset(DOWN, 0)).toEqual({ do: 'paint' })
  })

  test('asks for nothing where the arrival never gets one', () => {
    expect(onset(DOWN, false)).toEqual({ do: 'nothing' })
  })

  test('leaves a curtain already covering alone, whatever this arrival says', () => {
    for (const curtain of [painting, up(0)]) {
      for (const after of [0, 250, false] as const) {
        expect(onset(curtain, after)).toEqual({ do: 'nothing' })
      }
    }
  })

  test('restarts a delay that has not painted yet', () => {
    // Nothing is on screen, so there is nothing to keep. The arrival now
    // beginning is the one whose delay should be running.
    expect(onset(waiting, 100)).toEqual({ do: 'wait', after: 100 })
  })
})

describe('what it still owes when it is lifted', () => {
  test('the rest of the minimum, from the frame it was painted in', () => {
    expect(owed(up(1000), 1000)).toBe(MINIMUM)
    expect(owed(up(1000), 1000 + MINIMUM / 2)).toBe(MINIMUM / 2)
  })

  test('nothing once the minimum is served, and never a negative wait', () => {
    expect(owed(up(1000), 1000 + MINIMUM)).toBe(0)
    expect(owed(up(1000), 9999)).toBe(0)
  })

  test('nothing from a curtain no frame ever carried', () => {
    // A step that declares `curtain: true` and hands back nothing is set and
    // replaced inside one task, so nobody saw it and nobody is owed anything.
    expect([DOWN, waiting, painting].map((c) => owed(c, 1000))).toEqual([0, 0, 0])
  })
})
