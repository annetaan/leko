import { describe, expect, test } from 'vitest'

import { type Layout, type Rect, tuningOf } from './geometry.js'
import { create, type Effect, type Event, type Outcome, reduce } from './plan.js'

const tuning = tuningOf({ targets: [] })
const at = (top: number): Rect => ({ x: 0, y: top, width: 400, height: 200 })
/**
 * Four targets switching at 1000, 2000, 3000 and 4000, on a viewport 800px
 * tall. The upper band runs from 700 to 1000 and the lower from 4200 to 4500.
 */
const layout = (tops: (number | undefined)[] = [1000, 2000, 3000, 4000]): Layout => ({
  viewportHeight: 800,
  pageHeight: 6000,
  boxes: tops.map((top) => (top === undefined ? undefined : at(top))),
})

/** Every position below is where the line is on the page, not the scroll offset. */
const offset = (lineY: number) => lineY - 400
const scroll = (lineY: number): Event => ({ type: 'scroll', scrollY: offset(lineY) })
const measured = (lineY: number, tops?: (number | undefined)[]): Event => ({
  type: 'measured',
  layout: layout(tops),
  scrollY: offset(lineY),
})
const arrived: Event = { type: 'arrived' }

const created = (lineY: number): Outcome => create(tuning, layout(), offset(lineY))
/** Created with the line at `lineY`, and arrived. */
const lit = (lineY: number): Outcome => reduce(created(lineY).state, arrived)

/** The outcome of each event in turn, starting from `from`. */
const run = (from: Outcome, ...events: Event[]): Outcome[] => {
  const outcomes: Outcome[] = []
  let state = from.state
  for (const event of events) {
    const outcome = reduce(state, event)
    outcomes.push(outcome)
    state = outcome.state
  }
  return outcomes
}
const effects = (outcomes: Outcome[]): Effect[][] => outcomes.map((o) => o.effects)
const notices = (outcomes: Outcome[]) =>
  outcomes.flatMap((o) => o.effects.filter((e) => e.effect === 'notify'))

describe('creating', () => {
  test('created inside the range converges and announces nothing until arrival', () => {
    const outcome = created(2500)
    expect(outcome.state.mode).toEqual({ kind: 'converging', to: 1 })
    expect(outcome.effects).toEqual([
      { effect: 'opacity', value: 1 },
      { effect: 'converge', to: 1 },
    ])
    expect(reduce(outcome.state, arrived).effects).toEqual([
      { effect: 'reveal', on: 1 },
      { effect: 'notify', index: 1 },
    ])
  })

  test('created in a band or outside is out and notifies undefined', () => {
    for (const lineY of [850, 600, 4350, 4600]) {
      const outcome = created(lineY)
      expect(outcome.state.mode).toEqual({ kind: 'out' })
      expect(outcome.state.opacity).toBe(0)
      expect(outcome.effects).toEqual([{ effect: 'notify', index: undefined }])
    }
  })
})

describe('arriving and being overtaken', () => {
  test('arrival announces the index and reveals, even inside a band', () => {
    const [band, arrival] = run(created(4100), scroll(4350), arrived)
    expect(band!.effects).toEqual([{ effect: 'opacity', value: 0.5 }])
    expect(arrival!.state.mode).toEqual({ kind: 'lit', on: 3 })
    expect(arrival!.effects).toEqual([
      { effect: 'reveal', on: 3 },
      { effect: 'notify', index: 3 },
    ])
  })

  test('a converge the fade overtakes is cut off and fires nothing', () => {
    const outcomes = run(created(4100), scroll(4350), scroll(4600), arrived)
    expect(effects(outcomes)).toEqual([
      [{ effect: 'opacity', value: 0.5 }],
      [{ effect: 'out' }],
      [],
    ])
    expect(outcomes.at(-1)!.state.mode).toEqual({ kind: 'out' })
  })

  test('a morph the fade overtakes is cut off and fires undefined', () => {
    const outcomes = run(lit(3500), scroll(4100), scroll(4600), arrived)
    expect(effects(outcomes)).toEqual([
      [{ effect: 'morph', to: 3 }],
      [{ effect: 'out' }, { effect: 'notify', index: undefined }],
      [],
    ])
  })
})

describe('fading and coming back', () => {
  test('a fade fires nothing on its way to zero and undefined at zero', () => {
    const outcomes = run(lit(4100), scroll(4275), scroll(4425), scroll(4500))
    expect(effects(outcomes)).toEqual([
      [{ effect: 'opacity', value: 0.75 }],
      [{ effect: 'opacity', value: 0.25 }],
      [{ effect: 'out' }, { effect: 'notify', index: undefined }],
    ])
    expect(outcomes.at(-1)!.state).toMatchObject({ opacity: 0, mode: { kind: 'out' } })
  })

  test('coming back from a fade to the same target converges nothing and fires nothing', () => {
    const outcomes = run(lit(4100), scroll(4350), scroll(4100))
    expect(effects(outcomes)).toEqual([
      [{ effect: 'opacity', value: 0.5 }],
      [{ effect: 'opacity', value: 1 }],
    ])
    expect(outcomes.at(-1)!.state.mode).toEqual({ kind: 'lit', on: 3 })
  })

  test('coming back from a fade to another target morphs and fires on arrival', () => {
    // An in-page link, from the lower band straight to the second target.
    const outcomes = run(lit(4100), scroll(4350), scroll(2500), arrived)
    expect(effects(outcomes)).toEqual([
      [{ effect: 'opacity', value: 0.5 }],
      [
        { effect: 'opacity', value: 1 },
        { effect: 'morph', to: 1 },
      ],
      [
        { effect: 'reveal', on: 1 },
        { effect: 'notify', index: 1 },
      ],
    ])
  })

  test('out in a band draws nothing', () => {
    const outcomes = run(lit(4100), scroll(4600), scroll(4350))
    expect(outcomes[1]!.effects).toEqual([])
    expect(outcomes[1]!.state).toMatchObject({ opacity: 0, mode: { kind: 'out' } })
    expect(effects(run(created(600), scroll(850)))).toEqual([[]])
  })

  test('out and inside converges again', () => {
    const outcomes = run(lit(4100), scroll(4600), scroll(4350), scroll(4100))
    expect(outcomes[2]!.effects).toEqual([
      { effect: 'opacity', value: 1 },
      { effect: 'converge', to: 3 },
    ])
    // From above, the range begins at the first switch position.
    const above = run(created(600), scroll(850), scroll(1000))
    expect(above[1]!.effects).toEqual([
      { effect: 'opacity', value: 1 },
      { effect: 'converge', to: 0 },
    ])
  })

  test('an arrival while out or lit changes nothing', () => {
    for (const from of [created(600), lit(2500)]) {
      expect(reduce(from.state, arrived)).toEqual({ state: from.state, effects: [] })
    }
  })
})

describe('a fast scroll', () => {
  test('a switch during a morph turns it to the latest target and only that arrival fires', () => {
    const outcomes = run(lit(1500), scroll(2500), scroll(4100), arrived)
    expect(effects(outcomes).slice(0, 2)).toEqual([
      [{ effect: 'morph', to: 1 }],
      [{ effect: 'morph', to: 3 }],
    ])
    expect(outcomes[1]!.state.mode).toEqual({ kind: 'morphing', from: 0, to: 3 })
    expect(notices(outcomes)).toEqual([{ effect: 'notify', index: 3 }])
  })

  test('a switch during a converge keeps it a converge', () => {
    const outcomes = run(created(1500), scroll(2500), arrived)
    expect(outcomes[0]!.effects).toEqual([{ effect: 'converge', to: 1 }])
    expect(outcomes[0]!.state.mode).toEqual({ kind: 'converging', to: 1 })
    expect(notices(outcomes)).toEqual([{ effect: 'notify', index: 1 }])
  })
})

describe('measuring', () => {
  test('a measure that moves the same lit target places the hole without notice', () => {
    const [outcome] = run(lit(2500), measured(2500, [1100, 2100, 3100, 4100]))
    expect(outcome!.effects).toEqual([{ effect: 'place', on: 1 }])
    expect(outcome!.state.mode).toEqual({ kind: 'lit', on: 1 })
  })

  test('a measure that changes the lit target morphs as a scroll would', () => {
    const tops = [1000, 2000, 2400, 4000]
    const [outcome] = run(lit(2500), measured(2500, tops))
    expect(outcome!.effects).toEqual([{ effect: 'morph', to: 2 }])
    expect(outcome!.state.mode).toEqual({ kind: 'morphing', from: 1, to: 2 })
    const already = { ...lit(2500).state, layout: layout(tops) }
    expect(reduce(already, scroll(2500))).toEqual(outcome)
  })

  test('a measure that leaves the lit target in a band places its hole there and dims it', () => {
    // Content opened above moves every target down, so the line is now 150px
    // into the upper band, where the position calls for the first target. The
    // light stays on the one it was on, as a scroll into the band would leave it.
    const [outcome] = run(lit(4150), measured(4150, [4300, 4400, 4500, 4600]))
    expect(outcome!.effects).toEqual([
      { effect: 'opacity', value: 0.5 },
      { effect: 'place', on: 3 },
    ])
    expect(outcome!.state.mode).toEqual({ kind: 'lit', on: 3 })
  })

  test('a lit target that is no longer found while in a band goes out and fires undefined', () => {
    // The first three targets moved down, putting the line in the upper band,
    // and the fourth, the lit one, is no longer found.
    const lost = run(lit(4150), measured(4150, [4300, 4400, 4500, undefined]))
    expect(lost[0]!.effects).toEqual([{ effect: 'out' }, { effect: 'notify', index: undefined }])
    expect(lost[0]!.state).toMatchObject({ opacity: 0, mode: { kind: 'out' } })
    const none = run(lit(4150), measured(4150, [undefined, undefined, undefined, undefined]))
    expect(none[0]!.effects).toEqual([{ effect: 'out' }, { effect: 'notify', index: undefined }])
  })

  test('a measure during a converge with the same target converges again toward the new box', () => {
    const [outcome] = run(created(2500), measured(2500, [1100, 2100, 3100, 4100]))
    expect(outcome!.effects).toEqual([{ effect: 'converge', to: 1 }])
    expect(outcome!.state.mode).toEqual({ kind: 'converging', to: 1 })
  })

  test('a measure during a morph with the same target morphs again toward the new box', () => {
    const [, outcome] = run(lit(1500), scroll(2500), measured(2500, [1100, 2100, 3100, 4100]))
    expect(outcome!.effects).toEqual([{ effect: 'morph', to: 1 }])
    expect(outcome!.state.mode).toEqual({ kind: 'morphing', from: 0, to: 1 })
  })

  test('a scroll inside the range with nothing changed has no effects', () => {
    const [outcome] = run(lit(2500), scroll(2600))
    expect(outcome!.effects).toEqual([])
    expect(outcome!.state.mode).toEqual({ kind: 'lit', on: 1 })
  })
})

test('notify is the last effect of every outcome that has one', () => {
  const outcomes = [
    created(850),
    ...run(
      created(2500),
      arrived,
      scroll(3100),
      arrived,
      scroll(4350),
      scroll(4600),
      scroll(3500),
      arrived,
      scroll(3100),
      scroll(4600),
      scroll(3500),
      measured(3500, [1000, 2000, undefined, 4000]),
      arrived,
      measured(4350, [1000, 2000, 3000, undefined]),
    ),
  ]
  const notifying = outcomes.filter((o) => o.effects.some((e) => e.effect === 'notify'))
  expect(notifying.length).toBeGreaterThanOrEqual(5)
  for (const outcome of notifying) expect(outcome.effects.at(-1)?.effect).toBe('notify')
})
