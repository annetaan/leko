import { describe, expect, test } from 'vitest'

import { type Curtain, covering, DOWN, MINIMUM, owed } from './curtain.js'

// No browser can get any of this wrong: it is a tagged union and two functions
// over it. `wiring.test.ts` is where the curtain meets a page.

const painting: Curtain = { kind: 'painting', frame: 1 }
const up = (since: number): Curtain => ({ kind: 'up', since })

describe('covering', () => {
  test('is the two states where the page is dark, or about to be', () => {
    expect([DOWN, painting, up(0)].map(covering)).toEqual([false, true, true])
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
    // A target that turns up again inside the same task was never missing as far
    // as anybody watching is concerned, so nobody is owed anything.
    expect([DOWN, painting].map((c) => owed(c, 1000))).toEqual([0, 0])
  })
})
