import { describe, expect, test } from 'vitest'

import {
  accepting,
  arrivedAt,
  type Core,
  failing,
  found,
  heldForStep,
  heldForStory,
  idle,
  movedTo,
  opened,
  type Phase,
  seeking,
  settled,
  settling,
  stateOf,
  stepOf,
  torn,
} from './core.js'

// `core.ts` asks nothing of a step but that a story holds a list of them, so the
// fixtures here are as small as that.
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

const morph = Promise.resolve()

/** A run standing on `index` of `story`, with everything else filled in. */
const running = (phase: Phase, index = 0): C => ({
  position: { story, index },
  phase,
  error: 'not yet',
  announced: first,
  showing: morph,
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

describe('torn', () => {
  test('keeps nothing', () => {
    expect(torn<Step, Story>()).toEqual({
      position: undefined,
      phase: 'ending',
      error: undefined,
      announced: undefined,
      showing: undefined,
    })
  })

  test('is idle with the curtain still down, which is the whole of the difference', () => {
    // `onLeave` runs behind it, and a call made from there has to be refused.
    expect(accepting(torn<Step, Story>())).toBe(false)
    expect({ ...torn<Step, Story>(), phase: 'ready' }).toEqual(idle<Step, Story>())
  })
})

describe('a move leaves alone what it does not name', () => {
  test('opened writes the phase and nothing else', () => {
    const before = running('settling')

    expect(opened(before)).toEqual({ ...before, phase: 'ready' })
  })

  test('heldForStory writes the phase and nothing else', () => {
    // The story's own arrival. No step has been entered, so there is no attempt
    // and no morph belonging to this run to throw away.
    const before = running('ready')

    expect(heldForStory(before)).toEqual({ ...before, phase: 'story' })
  })

  test('heldForStep throws away the attempt and the morph, and keeps the report', () => {
    const before = running('ready')

    expect(heldForStep(before)).toEqual({
      ...before,
      phase: 'step',
      error: undefined,
      showing: undefined,
    })
  })

  test('failing writes the message and nothing else', () => {
    const before = running('ready')

    expect(failing(before, 'try again')).toEqual({ ...before, error: 'try again' })
  })

  test('arrivedAt writes what onStep was told and nothing else', () => {
    const before = running('ready')

    expect(arrivedAt(before, second)).toEqual({ ...before, announced: second })
  })
})

describe('movedTo', () => {
  test('makes a fresh position every time', () => {
    // The object identity is the step occurrence every late callback compares
    // against, so the same story at the same index twice is two occurrences.
    const once = movedTo(idle<Step, Story>(), story, 0)
    const twice = movedTo(once, story, 0)

    expect(twice.position).toEqual(once.position)
    expect(twice.position).not.toBe(once.position)
  })

  test('leaves everything else where it was', () => {
    const before = running('ready')
    const after = movedTo(before, elsewhere, 0)

    expect(after).toEqual({ ...before, position: { story: elsewhere, index: 0 } })
  })
})

describe('a morph landing', () => {
  test('takes off the phase it put on', () => {
    const before = settling(running('ready'), morph)

    expect(before.phase).toBe('settling')
    expect(settled(before)).toEqual({ ...before, phase: 'ready', showing: undefined })
  })

  test('leaves a search alone, because the search wrote the phase over it', () => {
    // Both wrote the phase, and only the one that wrote it may take it off. The
    // wait ends when the presenter says it does.
    const searching = { ...running('searching'), showing: morph }

    expect(settled(searching)).toEqual({ ...searching, showing: undefined })
  })

  test('lets go of the promise from any phase at all', () => {
    for (const phase of PHASES) {
      expect(settled({ ...running(phase), showing: morph }).showing).toBeUndefined()
    }
  })
})

describe('the presenter looking for an anchor', () => {
  test('starts a wait over a step that is on screen', () => {
    for (const phase of ['ready', 'settling'] as const) {
      expect(seeking(running(phase), first).phase).toBe('searching')
    }
  })

  test('starts nothing over an arrival, an ending, or a wait already running', () => {
    for (const phase of ['story', 'step', 'ending', 'searching'] as const) {
      const before = running(phase)

      // The same object, so nothing downstream of a commit has to look twice.
      expect(seeking(before, first)).toBe(before)
    }
  })

  test('starts nothing for a step the tour has already left', () => {
    // A presenter can notice a loss after the tour has moved on, and that
    // notice is about a step nobody is showing.
    const before = running('ready')

    expect(seeking(before, second)).toBe(before)
  })

  test('ends a wait without asking where the tour is', () => {
    const before = running('searching')

    expect(found(before)).toEqual({ ...before, phase: 'ready' })
  })

  test('ends nothing where the wait was written over in the meantime', () => {
    for (const phase of ['ready', 'settling', 'story', 'step', 'ending'] as const) {
      const before = running(phase)

      expect(found(before)).toBe(before)
    }
  })
})
