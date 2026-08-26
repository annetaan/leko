import { describe, expect, test } from 'vitest'

import {
  accepting,
  type Core,
  idle,
  type Phase,
  stateOf,
  stepOf,
  stillAt,
  torn,
  withStory,
} from './core.js'

// The state and how it is read. What every move does to it is decided in
// `plan.ts` and asserted there, because a move that nothing decides is a spread
// with a name on it.

interface Step {
  id: string
}
interface Story {
  id: string
  steps: Step[]
}
type C = Core<Step, Story>

const first: Step = { id: 'a' }
const second: Step = { id: 'b' }
const story: Story = { id: 'tour', steps: [first, second] }
const elsewhere: Story = { id: 'other', steps: [{ id: 'c' }] }

const PHASES: Phase[] = ['story', 'step', 'ending', 'settling', 'searching', 'ready']

/** A run standing on `index` of `story`, with everything else filled in. */
const running = (phase: Phase, index = 0): C => ({
  ...idle<Step, Story>(),
  stories: new Map([[story.id, story]]),
  position: { story, index },
  phase,
  error: 'not yet',
  announced: first,
  showing: Promise.resolve(),
})

describe('what a phase answers', () => {
  test('a call is acted on where the step is on screen and nowhere else', () => {
    const answers = Object.fromEntries(PHASES.map((phase) => [phase, accepting(running(phase))]))

    expect(answers).toEqual({
      ready: true,
      settling: true,
      searching: true,
      story: false,
      step: false,
      ending: false,
    })
  })

  test('idle is the position being empty, whatever the phase says', () => {
    for (const phase of PHASES) {
      expect(stateOf({ ...idle<Step, Story>(), phase })).toBe('idle')
    }
  })

  test('running is the one phase where the step has arrived and stopped moving', () => {
    const answers = Object.fromEntries(PHASES.map((phase) => [phase, stateOf(running(phase))]))

    // `settling` and `searching` are both a step on screen, and a host standing
    // back while the tour is between things has to hear about them.
    expect(answers).toEqual({
      ready: 'running',
      settling: 'transitioning',
      searching: 'transitioning',
      story: 'transitioning',
      step: 'transitioning',
      ending: 'transitioning',
    })
  })
})

describe('stepOf', () => {
  test('reads the step the position names', () => {
    expect(stepOf(running('ready', 1))).toBe(second)
  })

  test('answers nothing while idle', () => {
    expect(stepOf(idle<Step, Story>())).toBeUndefined()
  })

  test('answers nothing past the end of the story', () => {
    expect(stepOf(running('ready', 2))).toBeUndefined()
  })
})

describe('stillAt', () => {
  test('is the position object, and not what it holds', () => {
    const core = running('ready')

    expect(stillAt(core, core.position)).toBe(true)
    // The same story at the same index, and a different occurrence of it. Every
    // late callback in the machine is told apart this way.
    expect(stillAt(core, { story, index: 0 })).toBe(false)
  })
})

describe('torn', () => {
  test('keeps the registry and nothing else', () => {
    const before = running('ready')

    expect(torn(before)).toEqual({
      stories: before.stories,
      position: undefined,
      phase: 'ending',
      error: undefined,
      announced: undefined,
      showing: undefined,
    })
  })

  test('is idle with the curtain still down, which is the whole of the difference', () => {
    // `onLeave` runs behind it, and a call made from there has to be refused.
    const before = idle<Step, Story>()

    expect(accepting(torn(before))).toBe(false)
    expect({ ...torn(before), phase: 'ready' }).toEqual(before)
  })
})

describe('withStory', () => {
  test('registers under the id, replacing whatever was there', () => {
    const one = withStory(idle<Step, Story>(), story)
    const two = withStory(one, elsewhere)
    const again = withStory(two, { id: 'tour', steps: [second] })

    expect([...two.stories.keys()]).toEqual(['tour', 'other'])
    expect(again.stories.get('tour')?.steps).toEqual([second])
  })

  test('makes a fresh map every time, which is what says a registration took', () => {
    const before = idle<Step, Story>()
    const after = withStory(before, story)

    expect(after.stories).not.toBe(before.stories)
    expect(before.stories.size).toBe(0)
  })

  test('leaves everything else where it was', () => {
    const before = running('ready')

    expect(withStory(before, elsewhere)).toEqual({ ...before, stories: expect.anything() })
  })
})
