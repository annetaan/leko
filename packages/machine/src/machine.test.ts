import { afterEach, describe, expect, test, vi } from 'vitest'

import type { Fixture, Options, Step, Story } from './fake.js'
import { Fake } from './fake.js'
import { Machine } from './machine.js'
import type { Problem } from './types.js'

// None of these claims is about layout — ONBOARDING.md, **Which Vitest
// project a new test belongs in**.

const instances: Machine<Fixture>[] = []
const fakes: Fake[] = []
const drawnFor = new WeakMap<Machine<Fixture>, Fake>()

afterEach(() => {
  for (const tour of instances.splice(0)) tour.stop()
  fakes.length = 0
  vi.restoreAllMocks()
})

const drawing = (): Fake => fakes.at(-1)!

const onThePage = (name: string): void => void drawing().page.add(name)

function machine(options: Options = {}) {
  const tour = new Machine<Fixture>(options, (host) => {
    const fake = new Fake(host)
    fakes.push(fake)
    return fake
  })
  instances.push(tour)
  drawnFor.set(tour, fakes.at(-1)!)
  return tour
}

const press = (tour: Machine<Fixture>): void => void drawnFor.get(tour)!.press()

const staged = new WeakMap<Machine<Fixture>, Map<string, Story>>()

function hold(tour: Machine<Fixture>, story: Story): Story {
  staged.set(tour, (staged.get(tour) ?? new Map<string, Story>()).set(story.id, story))
  return story
}

const begin = (tour: Machine<Fixture>, id: string): void => tour.start(staged.get(tour)!.get(id)!)

function staging(story: Story, options: Options = {}) {
  const tour = machine(options)
  hold(tour, story)
  return tour
}

function start(steps: Step[], options: Options = {}) {
  const tour = staging({ id: 'story', steps }, options)
  begin(tour, 'story')
  return tour
}

function watched(story: Story, options: Omit<Options, 'onStep'> = {}) {
  const seen: (string | undefined)[] = []
  const tour = staging(story, { ...options, onStep: (step) => seen.push(step?.id) })
  return { tour, seen }
}

function held(): { promise: Promise<void>; settle: () => void } {
  let settle!: () => void
  const promise = new Promise<void>((resolve) => {
    settle = resolve
  })
  return { promise, settle }
}

const failing = (id: string, target: string, message?: string, error?: Step['error']): Step => ({
  id,
  target,
  message,
  validate: () => false,
  error,
})

const twoSteps = (message: string): Step[] => [
  { id: 'a', target: 'first' },
  { id: 'b', target: 'second', message },
]

// Read as a table — DESIGN.md, **How to write here, and where tests go**.

describe('a signal, and the step waiting for it', () => {
  // DESIGN.md, **Signals and steps**.

  test('a step advances on the signal it declares', () => {
    const tour = start([
      { id: 'first', target: 'first', awaits: 'order-saved' },
      { id: 'second', target: 'second' },
    ])

    tour.reached('order-saved')

    expect(tour.step?.id).toBe('second')
  })

  test('a signal no step is waiting for costs nothing and says nothing', () => {
    const validate = vi.fn(() => true)
    const warn = vi.spyOn(console, 'warn')

    const tour = start([
      { id: 'first', target: 'target', awaits: 'order-saved', validate },
      { id: 'second', target: 'target' },
    ])

    tour.reached('something-else')

    // DESIGN.md, **Safe to call anytime**.
    expect(tour.step?.id).toBe('first')
    expect(validate).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()
  })

  test('a step declaring no signal is not advanced by one', () => {
    const tour = start([
      { id: 'first', target: 'target' },
      { id: 'second', target: 'target' },
    ])

    tour.reached('order-saved')

    expect(tour.step?.id).toBe('first')
  })

  test('a press on a step that declares a signal moves nothing', () => {
    const tour = start([
      { id: 'first', target: 'first', awaits: 'order-saved' },
      { id: 'second', target: 'second' },
    ])

    // No control is derived for this step — DESIGN.md, **The next control**.
    press(tour)

    expect(tour.step?.id).toBe('first')
    expect(tour.state).toBe('running')

    tour.reached('order-saved')

    expect(tour.step?.id).toBe('second')
  })

  test('a signal does not get past validate, because it does not go near it', () => {
    const validate = vi.fn(() => false)

    const tour = start([
      {
        id: 'first',
        target: 'first',
        awaits: 'order-saved',
        // Written on a step that also declares a signal, which is a shape the
        // types allow and the machine ignores. The application has said the
        // order was saved. Reading the page to check would be a second source
        // of truth for the same question.
        validate,
        error: 'Never said, because the guard is never asked.',
      },
      { id: 'second', target: 'second' },
    ])

    tour.reached('order-saved')

    expect(tour.step?.id).toBe('second')
    expect(validate).not.toHaveBeenCalled()
  })

  test('a signal reported before its step is showing is not saved up', () => {
    const tour = start([
      { id: 'first', target: 'first' },
      { id: 'second', target: 'second', awaits: 'order-saved' },
    ])

    tour.reached('order-saved')
    press(tour)

    // DESIGN.md, **Not buffered**.
    expect(tour.step?.id).toBe('second')
  })

  test('a signal reaches the story that is running, and no other', () => {
    const tour = staging({
      id: 'onboarding',
      steps: [
        { id: 'save', target: 'first', awaits: 'order-saved' },
        { id: 'done', target: 'second' },
      ],
    })
    hold(tour, {
      id: 'returning',
      steps: [
        { id: 'save-again', target: 'first', awaits: 'order-saved' },
        { id: 'done', target: 'second' },
      ],
    })

    begin(tour, 'onboarding')
    tour.reached('order-saved')
    expect(tour.step?.id).toBe('done')

    // DESIGN.md, **Matched against the running story only**.
    tour.stop()
    begin(tour, 'returning')
    expect(tour.step?.id).toBe('save-again')
  })
})

describe('what a failed attempt says', () => {
  // DESIGN.md, **A failed attempt**.

  test('says no out loud even where the step gave no words for it', () => {
    const tour = start([failing('one', 'first'), { id: 'two', target: 'second' }])

    press(tour)

    expect(drawing().rejected).toBe(1)
    expect(tour.step?.id).toBe('one')
    expect(drawing().retold).toEqual([])
  })

  test('says the reason, on the step the attempt was made on', () => {
    const step = failing('one', 'first', 'Type your postcode.', 'That is not a postcode.')
    const tour = start([step, { id: 'two', target: 'second' }])

    press(tour)

    // DESIGN.md, **No words cross the seam**. Where the words go under the
    // instruction is `message.test.ts`.
    expect(drawing().retold).toEqual([{ step: 'one', reason: 'That is not a postcode.' }])
  })

  test('asks the function form once per attempt, on the anchor the guard was given', () => {
    const seen: string[] = []
    let attempts = 0
    const step = failing('one', 'first', 'Type your postcode.', (anchor) => {
      seen.push(anchor)
      attempts += 1
      return `Attempt ${attempts}.`
    })
    const tour = start([step, { id: 'two', target: 'second' }])

    press(tour)
    press(tour)

    expect(drawing().retold.map((told) => told.reason)).toEqual(['Attempt 1.', 'Attempt 2.'])
    expect(seen).toEqual(['first', 'first'])
  })

  test('an error is about the attempt, so entering the step again leaves it behind', () => {
    const step = failing('one', 'first', 'Type your postcode.', 'That is not a postcode.')
    const tour = start([{ id: 'zero', target: 'second' }, step])

    press(tour)
    press(tour)
    expect(drawing().retold).toHaveLength(1)

    // DESIGN.md, **A story is atomic, and stories are short**.
    tour.stop()
    begin(tour, 'story')
    press(tour)

    expect(drawing().shown).toEqual(['zero', 'one', 'zero', 'one'])
    expect(drawing().retold).toHaveLength(1)
  })

  test('a guard that ends the tour from inside itself leaves no complaint behind', () => {
    let tour!: ReturnType<typeof start>
    const step: Step = {
      id: 'one',
      target: 'first',
      validate: () => {
        tour.stop()
        return false
      },
      error: 'Never seen, because there is nothing left to say it to.',
    }
    tour = start([step, { id: 'two', target: 'second' }])

    const fake = drawing()
    fake.retold.length = 0
    press(tour)

    expect(fake.retold).toEqual([])
    expect(fake.rejected).toBe(0)
    expect(tour.state).toBe('idle')
  })
})

describe('a story that says what follows it', () => {
  // DESIGN.md, **Starting a story**.

  const summary: Story = { id: 'summary', steps: [{ id: 'end', target: 'second' }] }

  test('runs the story it named, and reports the join in one turn', () => {
    const { tour, seen } = watched({
      id: 'first',
      next: summary,
      steps: [{ id: 'a', target: 'first' }],
    })

    begin(tour, 'first')
    press(tour)

    expect(seen).toEqual(['a', undefined, 'end'])
    expect(tour.story?.id).toBe('summary')
    expect(tour.state).toBe('running')
  })

  test('tells the story onLeave where the tour is going', () => {
    const seen: (string | undefined)[] = []
    const tour = staging({
      id: 'first',
      next: summary,
      onLeave: (_self, next) => void seen.push(next?.id),
      steps: [{ id: 'a', target: 'first' }],
    })

    begin(tour, 'first')
    press(tour)

    expect(seen).toEqual(['summary'])
  })

  test('asks a function, and asks it again the next time the story runs', () => {
    const asked: string[] = []
    let go: Story | undefined = summary
    const first: Story = {
      id: 'first',
      next: () => {
        asked.push('asked')
        return go
      },
      steps: [{ id: 'a', target: 'first' }],
    }
    const tour = staging(first)
    hold(tour, summary)

    begin(tour, 'first')
    press(tour)
    expect(tour.story?.id).toBe('summary')

    go = undefined
    tour.stop()
    begin(tour, 'first')
    press(tour)

    expect(asked).toHaveLength(2)
    expect(tour.state).toBe('idle')
  })

  test('follows nothing where the tour was stopped rather than finished', () => {
    const tour = staging({
      id: 'first',
      next: summary,
      steps: [{ id: 'a', target: 'first' }],
    })

    begin(tour, 'first')
    tour.stop()

    expect(tour.state).toBe('idle')
    expect(drawing().shown).toEqual(['a'])
  })

  test('follows nothing where the target went and took the run with it', () => {
    const tour = staging({
      id: 'first',
      next: summary,
      steps: [
        { id: 'a', target: 'first' },
        { id: 'gone', target: '#not-here' },
      ],
    })

    begin(tour, 'first')
    press(tour)

    expect(tour.state).toBe('idle')
    expect(drawing().shown).toEqual(['a'])
  })

  test('a next that stops the tour from inside itself is left alone', () => {
    let tour!: Machine<Fixture>
    const first: Story = {
      id: 'first',
      next: () => {
        tour.stop()
        return summary
      },
      steps: [{ id: 'a', target: 'first' }],
    }
    tour = staging(first)
    hold(tour, summary)

    begin(tour, 'first')
    press(tour)

    expect(tour.state).toBe('idle')
    expect(drawing().shown).toEqual(['a'])
  })

  test('the chain is closed through its own report, so a start from there is refused', () => {
    const other: Story = { id: 'other', steps: [{ id: 'o', target: 'first' }] }
    const problems: Problem<Fixture>[] = []
    let tried = false
    const tour = staging(
      { id: 'first', next: summary, steps: [{ id: 'a', target: 'first' }] },
      {
        onStep: (step) => {
          if (step !== undefined || tried) return
          tried = true
          tour.start(other)
        },
        onDiagnostic: (problem) => problems.push(problem),
      },
    )
    hold(tour, other)

    begin(tour, 'first')
    press(tour)

    // DESIGN.md, **Saying where the tour got to**.
    expect(problems.map((problem) => problem.kind)).toEqual(['call-refused'])
    expect(tour.story?.id).toBe('summary')
  })
})

describe('a call made from inside a report', () => {
  // DESIGN.md, **Saying where the tour got to**.
  test('start from the report of an ending is refused, and two lines after stop work', () => {
    const second: Story = { id: 'second', steps: [{ id: 'b', target: 'second' }] }
    const problems: Problem<Fixture>[] = []
    let tried = false
    const tour = machine({
      onStep: (step) => {
        if (step !== undefined || tried) return
        tried = true
        begin(tour, 'second')
      },
      onDiagnostic: (problem) => problems.push(problem),
    })
    hold(tour, { id: 'first', steps: [{ id: 'a', target: 'first' }] })
    hold(tour, second)
    begin(tour, 'first')

    tour.stop()

    expect(problems.map((problem) => problem.kind)).toEqual(['call-refused'])
    expect(tour.state).toBe('idle')

    begin(tour, 'second')

    expect(tour.story?.id).toBe('second')
    expect(tour.step?.id).toBe('b')
    expect(drawing().shown).toEqual(['a', 'b'])
  })

  test('start from a report naming a step is turned down for the tour it names', () => {
    const problems: Problem<Fixture>[] = []
    const first: Story = { id: 'first', steps: [{ id: 'a', target: 'first' }] }
    const second: Story = { id: 'second', steps: [{ id: 'b', target: 'second' }] }
    const tour = machine({
      onStep: (step) => {
        if (step !== undefined) begin(tour, 'second')
      },
      onDiagnostic: (problem) => problems.push(problem),
    })
    hold(tour, first)
    hold(tour, second)

    begin(tour, 'first')

    expect(problems).toEqual([{ kind: 'tour-running', story: second, running: first }])
    expect(tour.story?.id).toBe('first')
  })

  test('start from the report of a chained ending gives way to the story on its way', () => {
    const summary: Story = { id: 'summary', steps: [{ id: 'c', target: 'third' }] }
    const rescue: Story = { id: 'rescue', steps: [{ id: 'r', target: 'second' }] }
    const problems: Problem<Fixture>[] = []
    const tour = machine({
      onStep: (step) => {
        if (step === undefined) begin(tour, 'rescue')
      },
      onDiagnostic: (problem) => problems.push(problem),
    })
    hold(tour, { id: 'first', next: summary, steps: [{ id: 'a', target: 'first' }] })
    hold(tour, summary)
    hold(tour, rescue)

    begin(tour, 'first')
    press(tour)

    expect(problems.map((problem) => problem.kind)).toEqual(['call-refused'])
    expect(tour.story?.id).toBe('summary')
  })
})

describe('starting a story', () => {
  // DESIGN.md, **Starting a story**.

  test('a story always begins at its first step', () => {
    const tour = staging({
      id: 'onboarding',
      steps: [
        { id: 'a', target: 'first' },
        { id: 'b', target: 'second' },
      ],
    })
    begin(tour, 'onboarding')
    press(tour)
    expect(tour.step?.id).toBe('b')

    // DESIGN.md, **A story is atomic, and stories are short**.
    tour.stop()
    begin(tour, 'onboarding')

    expect(tour.step?.id).toBe('a')
  })

  test('a story with no steps in it does not start', () => {
    const problems: Problem<Fixture>[] = []
    const { tour, seen } = watched(
      { id: 'empty', steps: [] },
      { onDiagnostic: (problem) => problems.push(problem) },
    )

    begin(tour, 'empty')

    // Entering anyway would report a run that began and ended in the same turn.
    expect(problems.map((problem) => problem.kind)).toEqual(['story-empty'])
    expect(tour.state).toBe('idle')
    expect(seen).toEqual([])
    expect(drawing().shown).toEqual([])
  })

  test("a second object under a running story's name is turned down like any other", () => {
    const problems: Problem<Fixture>[] = []
    const { tour, seen } = watched(
      { id: 'onboarding', steps: twoSteps('before') },
      { onDiagnostic: (problem) => problems.push(problem) },
    )
    begin(tour, 'onboarding')
    press(tour)
    seen.length = 0

    tour.start({ id: 'onboarding', steps: twoSteps('after') })

    expect(seen).toEqual([])
    expect(tour.step?.id).toBe('b')
    expect(tour.step?.message).toBe('before')
    expect(problems.map((problem) => problem.kind)).toEqual(['tour-running'])
  })

  test('says which tour it left alone, so a host can tell the two refusals apart', () => {
    const onboarding: Story = { id: 'onboarding', steps: [{ id: 'a', target: 'first' }] }
    const other: Story = { id: 'other', steps: [{ id: 'b', target: 'second' }] }
    const problems: Problem<Fixture>[] = []
    const tour = staging(onboarding, { onDiagnostic: (problem) => problems.push(problem) })
    hold(tour, other)

    begin(tour, 'onboarding')
    begin(tour, 'other')

    // DESIGN.md, **Saying that a call did nothing**.
    expect(problems).toEqual([{ kind: 'tour-running', story: other, running: onboarding }])
  })

  test('an empty story cannot end the story someone is in the middle of', () => {
    const { tour, seen } = watched({
      id: 'story',
      steps: [
        { id: 'a', target: 'first' },
        { id: 'b', target: 'second' },
      ],
    })

    begin(tour, 'story')
    seen.length = 0

    // DESIGN.md, **Saying that a call did nothing**.
    tour.start({ id: 'nothing-to-show', steps: [] })

    expect(seen).toEqual([])
    expect(tour.story?.id).toBe('story')
    expect(tour.step?.id).toBe('a')
  })

  test('a story that shows the same step object twice still counts forwards', () => {
    // One object in two places, which is what a host generating steps from data
    // gets without thinking about it. `steps.indexOf(step)` answers 1 at both.
    const review: Step = { id: 'review', target: 'second' }
    const tour = start([
      { id: 'intro', target: 'first' },
      review,
      { id: 'edit', target: 'first' },
      review,
    ])

    press(tour)
    expect(tour.index).toBe(1)
    press(tour)
    press(tour)
    expect(tour.step).toBe(review)
    expect(tour.index).toBe(3)
  })
})

describe('what the tour says it is doing', () => {
  // DESIGN.md, **`state` is derived**. Some of these came out of the model
  // search rather than being written here; `packages/machine/model/README.md`
  // says which.

  test('a target that is not there ends the run, whatever a host would prefer', () => {
    const problems: Problem<Fixture>[] = []
    const tour = staging(
      {
        id: 'story',
        steps: [
          { id: 'a', target: 'first' },
          { id: 'b', target: 'second' },
        ],
      },
      { onDiagnostic: (problem) => problems.push(problem) },
    )
    begin(tour, 'story')
    drawing().page.delete('second')
    press(tour)

    // DESIGN.md, **Every retry belongs to an arrival, so `Host.lost` is only
    // ever about a step that was arriving**.
    expect(tour.state).toBe('idle')
    expect(problems).toEqual([
      {
        kind: 'target-lost',
        step: { id: 'b', target: 'second' },
        story: {
          id: 'story',
          steps: [
            { id: 'a', target: 'first' },
            { id: 'b', target: 'second' },
          ],
        },
      },
    ])
  })

  test('a target lost on a step the tour has left does not end the run', () => {
    const first: Step = { id: 'a', target: 'first' }
    const problems: Problem<Fixture>[] = []
    const tour = staging(
      { id: 'story', steps: [first, { id: 'b', target: 'second' }] },
      { onDiagnostic: (problem) => problems.push(problem) },
    )
    begin(tour, 'story')
    press(tour)

    drawing().lose(first)

    expect(tour.state).toBe('running')
    expect(tour.step?.id).toBe('b')
    expect(problems).toEqual([])
  })

  test('a target taken away by the step that assumed it ends the run', () => {
    const { tour, seen } = watched({
      id: 'story',
      steps: [
        { id: 'a', target: 'first' },
        {
          id: 'b',
          target: 'second',
          // DESIGN.md, **The target is resolved after `onEnter` returns**.
          onEnter: () => void drawing().page.delete('second'),
        },
      ],
    })
    begin(tour, 'story')
    seen.length = 0
    press(tour)

    expect(tour.state).toBe('idle')
    // `b` was never drawn, so it is never named.
    expect(seen).toEqual([undefined])
  })

  test('a handler is told the tour is running, and the gate is shut all the same', () => {
    const seen: string[] = []
    const tour = staging({
      id: 'story',
      onEnter: () => {
        seen.push(`story:${tour.state}`)
      },
      steps: [
        {
          id: 'a',
          target: 'first',
          onLeave: () => {
            seen.push(`onLeave:${tour.state}:${tour.step?.id}`)
          },
        },
        {
          id: 'b',
          target: 'second',
          onEnter: () => {
            seen.push(`onEnter:${tour.state}:${tour.step?.id}`)
          },
        },
      ],
    })
    begin(tour, 'story')
    press(tour)

    // The position already names the step being entered, which is why `a`'s
    // `onLeave` reads `b`.
    expect(seen).toEqual(['story:running', 'onLeave:running:b', 'onEnter:running:b'])
    expect(tour.state).toBe('running')
  })

  test('a tour being torn down says idle from inside its own onLeave', () => {
    const seen: string[] = []
    const tour = staging({
      id: 'story',
      onLeave: () => void seen.push(`story:${tour.state}:${tour.story?.id}`),
      steps: [
        {
          id: 'a',
          target: 'first',
          onLeave: () => void seen.push(`step:${tour.state}:${tour.step?.id}`),
        },
      ],
    })
    begin(tour, 'story')
    tour.stop()

    // DESIGN.md, **A teardown says `idle` while it is still refusing calls**.
    expect(seen).toEqual(['step:idle:undefined', 'story:idle:undefined'])
  })

  test('the index says how far into the story the step sits, and is empty while idle', () => {
    const tour = staging({
      id: 'story',
      steps: [
        { id: 'a', target: 'first' },
        { id: 'b', target: 'second' },
      ],
    })

    expect(tour.index).toBeUndefined()
    begin(tour, 'story')
    expect(tour.index).toBe(0)
    press(tour)
    expect(tour.index).toBe(1)
    tour.stop()
    expect(tour.index).toBeUndefined()
  })
})

describe('saying where the tour got to', () => {
  // DESIGN.md, **Saying where the tour got to**.

  test('a story reports where it went, and says when there is nowhere left', () => {
    const { tour, seen } = watched({
      id: 'story',
      steps: [
        { id: 'a', target: 'first' },
        { id: 'b', target: 'second', awaits: 'saved' },
      ],
    })

    begin(tour, 'story')
    press(tour)
    tour.reached('saved')

    expect(seen).toEqual(['a', 'b', undefined])
  })

  test('the instance has finished moving by the time it says so', () => {
    const seen: (string | undefined)[] = []
    const story: Story = {
      id: 'story',
      steps: [
        { id: 'a', target: 'first' },
        { id: 'b', target: 'second' },
      ],
    }
    const tour = staging(story, { onStep: () => seen.push(tour.step?.id) })

    begin(tour, 'story')
    press(tour)

    expect(seen).toEqual(['a', 'b'])
  })

  test('stopping reports the ending once, however many times it is called', () => {
    const { tour, seen } = watched({ id: 'story', steps: [{ id: 'a', target: 'first' }] })

    begin(tour, 'story')
    seen.length = 0
    tour.stop()
    tour.stop()

    expect(seen).toEqual([undefined])
  })

  test('a step that fails validation reports nothing, because nothing moved', () => {
    const { tour, seen } = watched({
      id: 'story',
      steps: [
        { id: 'a', target: 'first', validate: () => false },
        { id: 'b', target: 'second' },
      ],
    })

    begin(tour, 'story')
    seen.length = 0
    press(tour)

    expect(seen).toEqual([])
  })

  test('the hook hears every story, and is told which one moved', () => {
    const heard: string[] = []

    const tour = staging(
      { id: 'from', steps: [{ id: 'a', target: 'first' }] },
      { onStep: (step, story) => heard.push(`${story.id}:${step?.id ?? '-'}`) },
    )
    hold(tour, { id: 'into', steps: [{ id: 'b', target: 'second' }] })

    begin(tour, 'from')
    tour.stop()
    begin(tour, 'into')

    expect(heard).toEqual([
      'from:a', // started
      'from:-', // ended by the stop
      'into:b',
    ])
  })

  test('the move is reported once the step has arrived, not when the position changed', () => {
    const inEnter: (string | undefined)[][] = []
    const { tour, seen } = watched({
      id: 'story',
      steps: [
        { id: 'a', target: 'first' },
        { id: 'b', target: 'second', onEnter: () => void inEnter.push([...seen]) },
      ],
    })

    begin(tour, 'story')
    seen.length = 0
    press(tour)

    expect(inEnter).toEqual([[]])
    expect(seen).toEqual(['b'])
  })

  test('a run that ends before it draws reports the ending and nothing else', () => {
    const { tour, seen } = watched({
      id: 'story',
      steps: [{ id: 'a', target: 'late' }],
    })

    begin(tour, 'story')

    expect(seen).toEqual([undefined])
  })

  test('a run that ends after a slow story setup says the same', async () => {
    const { promise, settle } = held()
    const { tour, seen } = watched({
      id: 'story',
      onEnter: () => promise,
      steps: [{ id: 'a', target: 'late' }],
    })

    begin(tour, 'story')
    settle()
    await promise

    // A story's own setup runs before anything about its first step does, so
    // this is the widest the window gets between a start and the first thing a
    // host is told.
    expect(seen).toEqual([undefined])
  })

  test('a story arriving is not displaced, because the start is refused', async () => {
    const { promise, settle } = held()
    const { tour, seen } = watched({
      id: 'from',
      steps: [{ id: 'a', target: 'first', onEnter: () => promise }],
    })
    hold(tour, { id: 'into', steps: [{ id: 'b', target: 'second' }] })

    begin(tour, 'from')
    begin(tour, 'into')
    settle()
    await promise

    expect(seen).toEqual(['a'])
    expect(tour.step?.id).toBe('a')
  })

  test('a story whose target is already gone reports its ending, and no start', () => {
    const { tour, seen } = watched({ id: 'story', steps: [{ id: 'ghost', target: '#not-here' }] })

    begin(tour, 'story')

    expect(seen).toEqual([undefined])
    expect(tour.step).toBeUndefined()
  })

  test('losing a target on the way to a step reports the ending and nothing after it', () => {
    const { tour, seen } = watched({
      id: 'story',
      steps: [
        { id: 'a', target: 'first' },
        { id: 'gone', target: '#not-here' },
        { id: 'c', target: 'first' },
      ],
    })

    begin(tour, 'story')
    seen.length = 0
    press(tour)

    expect(seen).toEqual([undefined])
  })
})

describe('what a step assumes', () => {
  // DESIGN.md, **What a step and a story assume**.

  test('a step being built is not advanced past, and the presses are not saved', () => {
    const { tour, seen } = watched({
      id: 'story',
      steps: [
        { id: 'a', target: 'first' },
        {
          id: 'b',
          target: 'second',
          onEnter: () => {
            press(tour)
            press(tour)
          },
        },
        { id: 'c', target: 'first' },
      ],
    })

    begin(tour, 'story')
    press(tour)

    expect(tour.step?.id).toBe('b')
    expect(seen).toEqual(['a', 'b'])
  })

  test('a signal reported from inside onEnter is dropped, and the step still arrives', () => {
    const { tour, seen } = watched({
      id: 'story',
      steps: [
        { id: 'a', target: 'first' },
        {
          id: 'b',
          target: 'second',
          awaits: 'order-saved',
          onEnter: () => {
            tour.reached('order-saved')
          },
        },
        { id: 'c', target: 'first' },
      ],
    })

    begin(tour, 'story')
    press(tour)

    expect(tour.step?.id).toBe('b')
    expect(seen).toEqual(['a', 'b'])
  })

  test('onLeave says where the tour is going, and says nothing where it is ending', () => {
    const left: [string, string | undefined][] = []
    const onLeave = (step: Step, next: Step | undefined) => left.push([step.id, next?.id])
    const tour = start([
      { id: 'a', target: 'first', onLeave },
      { id: 'b', target: 'second', onLeave },
    ])

    press(tour)
    expect(left).toEqual([['a', 'b']])

    press(tour)
    expect(left).toEqual([
      ['a', 'b'],
      ['b', undefined],
    ])
  })

  test('an onEnter that fails stops the tour, and does not swallow the reason', () => {
    const boom = new Error('the panel would not open')
    // `queueMicrotask` is mocked because an uncaught error fails the run.
    const escaped: (() => void)[] = []
    vi.spyOn(globalThis, 'queueMicrotask').mockImplementation((fn) => void escaped.push(fn))

    const left: (string | undefined)[] = []
    const tour = start([
      { id: 'a', target: 'first' },
      {
        id: 'b',
        target: 'second',
        onEnter: () => {
          throw boom
        },
        onLeave: (_step, next) => left.push(next?.id),
      },
    ])

    press(tour)

    expect(tour.state).toBe('idle')
    expect(left).toEqual([undefined])
    expect(escaped).toHaveLength(1)
    expect(() => escaped[0]!()).toThrow(boom)
  })

  test('a step abandoned from inside its own onEnter is still left properly', () => {
    const left: [string, string | undefined][] = []
    let tour!: Machine<Fixture>
    tour = start([
      { id: 'a', target: 'first' },
      {
        id: 'b',
        target: 'second',
        awaits: 'moved-on',
        onEnter: () => tour.stop(),
        onLeave: (step, next) => left.push([step.id, next?.id]),
      },
      { id: 'c', target: 'first' },
    ])

    press(tour)

    expect(left).toEqual([['b', undefined]])
    expect(drawing().shown).toEqual(['a'])
    expect(tour.step).toBeUndefined()
    expect(tour.state).toBe('idle')
  })

  test('a story builds what it assumes before its first step builds what it assumes', () => {
    const order: string[] = []
    const tour = staging({
      id: 'story',
      onEnter: () => void order.push('story'),
      steps: [{ id: 'a', target: 'first', onEnter: () => void order.push('step') }],
    })

    begin(tour, 'story')

    expect(order).toEqual(['story', 'step'])
    expect(tour.state).toBe('running')
  })

  test('a story being opened does not let a step advance underneath it', () => {
    const entered: string[] = []
    let tour!: Machine<Fixture>
    tour = staging({
      id: 'story',
      onEnter: () => {
        onThePage('late')
        press(tour)
        tour.reached('saved')
      },
      steps: [
        { id: 'a', target: 'late', awaits: 'saved', onEnter: () => void entered.push('a') },
        { id: 'b', target: 'late', onEnter: () => void entered.push('b') },
      ],
    })

    begin(tour, 'story')

    expect(entered).toEqual(['a'])
    expect(tour.step?.id).toBe('a')
    expect(tour.state).toBe('running')
  })

  test('a story is left after its step is, and told nothing where the tour is over', () => {
    const order: string[] = []
    const leaving: (string | undefined)[] = []
    const tour = staging({
      id: 'story',
      onEnter: () => {},
      onLeave: (_story, next) => {
        order.push('story')
        leaving.push(next?.id)
      },
      steps: [
        { id: 'a', target: 'first', onLeave: () => void order.push('step') },
        { id: 'b', target: 'second' },
      ],
    })

    begin(tour, 'story')
    tour.stop()

    expect(order).toEqual(['step', 'story'])
    expect(leaving).toEqual([undefined])
  })

  test('running past the last step leaves the story too', () => {
    const leaving: (string | undefined)[] = []
    const tour = staging({
      id: 'story',
      onLeave: (_story, next) => void leaving.push(next?.id),
      steps: [{ id: 'only', target: 'first' }],
    })

    begin(tour, 'story')
    press(tour)

    expect(leaving).toEqual([undefined])
    expect(tour.state).toBe('idle')
  })

  test('a story onEnter that fails stops the tour, and is still left properly', () => {
    const boom = new Error('the fixtures would not load')
    const escaped: (() => void)[] = []
    vi.spyOn(globalThis, 'queueMicrotask').mockImplementation((fn) => void escaped.push(fn))

    const left: (string | undefined)[] = []
    const entered: string[] = []
    const tour = staging({
      id: 'story',
      onEnter: () => {
        throw boom
      },
      onLeave: (_story, next) => void left.push(next?.id),
      steps: [{ id: 'a', target: 'first', onEnter: () => void entered.push('step') }],
    })

    begin(tour, 'story')

    expect(tour.state).toBe('idle')
    expect(entered).toEqual([])
    expect(left).toEqual([undefined])
    expect(escaped).toHaveLength(1)
    expect(() => escaped[0]!()).toThrow(boom)
  })

  test('a story stopped from inside its own onEnter is still left properly', () => {
    const left: (string | undefined)[] = []
    const entered: string[] = []
    let tour!: Machine<Fixture>
    tour = staging({
      id: 'story',
      onEnter: () => tour.stop(),
      onLeave: (_story, next) => void left.push(next?.id),
      steps: [{ id: 'a', target: 'never', onEnter: () => void entered.push('step') }],
    })

    begin(tour, 'story')

    expect(left).toEqual([undefined])
    expect(entered).toEqual([])
    expect(tour.state).toBe('idle')
  })

  test('the first step is entered and drawn inside the call that started the story', () => {
    const entered: string[] = []
    const inside: { index: number | undefined; shown: number }[] = []
    let tour!: Machine<Fixture>
    tour = staging({
      id: 'story',
      onEnter: () => void inside.push({ index: tour.index, shown: drawing().shown.length }),
      steps: [
        { id: 'a', target: 'first', onEnter: () => void entered.push('a') },
        { id: 'b', target: 'second', onEnter: () => void entered.push('b') },
      ],
    })

    begin(tour, 'story')

    // The position is already on the first step while the story's own handler
    // runs, and nothing of it has been drawn.
    expect(inside).toEqual([{ index: 0, shown: 0 }])
    expect(entered).toEqual(['a'])
    expect(drawing().shown).toEqual(['a'])
  })

  test('moving on works once the story is open', () => {
    const tour = staging({
      id: 'story',
      onEnter: () => {},
      steps: [
        { id: 'a', target: 'first' },
        { id: 'b', target: 'second' },
      ],
    })

    begin(tour, 'story')
    press(tour)

    expect(tour.step?.id).toBe('b')
    expect(drawing().shown).toEqual(['a', 'b'])
  })
})

describe('a call that arrives while the machine is inside the application', () => {
  // DESIGN.md, **One gate, and what it refuses**.
  //
  // Not an axis like the groups above. They ask what one entry point does about
  // the gate; this one asks whether any of them is an exception, which is the
  // claim the rest of the file is written on top of.

  function inside(calls: (tour: Machine<Fixture>) => void, options: Options = {}) {
    let tour!: Machine<Fixture>
    tour = staging(
      {
        id: 'story',
        steps: [
          { id: 'a', target: 'first' },
          { id: 'b', target: 'second', awaits: 'ready', onEnter: () => calls(tour) },
        ],
      },
      options,
    )
    hold(tour, { id: 'other', steps: [{ id: 'x', target: 'third' }] })
    begin(tour, 'story')
    press(tour)
    return tour
  }

  test('every way in is refused, and the arrival lands untouched', () => {
    const problems: Problem<Fixture>[] = []
    const tour = inside(
      (running) => {
        running.reached('ready')
        press(running)
        begin(running, 'other')
      },
      { onDiagnostic: (problem) => problems.push(problem) },
    )

    expect(tour.state).toBe('running')
    expect(tour.step?.id).toBe('b')
    expect(drawing().shown).toEqual(['a', 'b'])
    // Two of the three calls report. `press` is the silent one: a control
    // nobody can see was not pressed by anybody.
    expect(problems.map((problem) => problem.kind)).toEqual(['signal-dropped', 'call-refused'])
    tour.stop()
    begin(tour, 'other')
    expect(tour.story?.id).toBe('other')
  })

  test('stop is the one call that does not ask, because a tour has to be turnable off', () => {
    const tour = inside((running) => running.stop())

    expect(tour.state).toBe('idle')
    expect(drawing().torn).toBe(1)
    expect(drawing().shown).toEqual(['a'])
  })

  test('a refused signal is still refused when the step is the one awaiting it', () => {
    const tour = inside((running) => running.reached('ready'))

    expect(tour.step?.id).toBe('b')
    expect(tour.state).toBe('running')

    // `b` is the last step, so a report that moves the tour ends the run.
    tour.reached('ready')
    expect(tour.state).toBe('idle')
  })
})

describe('saying that a call did nothing', () => {
  // DESIGN.md, **Saying that a call did nothing**.

  function heard(story: Story) {
    const problems: Problem<Fixture>[] = []
    const tour = staging(story, { onDiagnostic: (problem) => problems.push(problem) })
    return { tour, problems }
  }

  test('a story with nothing in it', () => {
    const empty: Story = { id: 'nothing-to-show', steps: [] }
    const { tour, problems } = heard({
      id: 'onboarding',
      steps: [{ id: 'a', target: 'first' }],
    })

    tour.start(empty)

    expect(problems).toEqual([{ kind: 'story-empty', story: empty }])
  })

  test('a signal the step was waiting for, reported from inside its own onEnter', () => {
    let tour!: Machine<Fixture>
    const step: Step = {
      id: 'b',
      target: 'second',
      awaits: 'ready',
      onEnter: () => tour.reached('ready'),
    }
    const heardIt = heard({ id: 'story', steps: [{ id: 'a', target: 'first' }, step] })
    tour = heardIt.tour

    begin(tour, 'story')
    press(tour)

    expect(heardIt.problems).toEqual([{ kind: 'signal-dropped', name: 'ready', step }])
    expect(tour.step?.id).toBe('b')
  })

  test('a name nothing is waiting for stays silent, whatever the machine is doing', () => {
    let tour!: Machine<Fixture>
    const heardIt = heard({
      id: 'story',
      steps: [
        { id: 'a', target: 'first' },
        { id: 'b', target: 'second', awaits: 'ready', onEnter: () => tour.reached('anything') },
      ],
    })
    tour = heardIt.tour

    tour.reached('anything') // idle
    begin(tour, 'story')
    tour.reached('anything') // running, and no step waits for it
    press(tour)

    // DESIGN.md, **Safe to call anytime**.
    expect(heardIt.problems).toEqual([])
  })

  test('a start refused inside an arrival is reported once per call', () => {
    let tour!: Machine<Fixture>
    const heardIt = heard({
      id: 'story',
      steps: [
        { id: 'a', target: 'first' },
        {
          id: 'b',
          target: 'second',
          onEnter: () => {
            press(tour)
            begin(tour, 'other')
            tour.stop()
          },
        },
      ],
    })
    tour = heardIt.tour
    hold(tour, { id: 'other', steps: [{ id: 'x', target: 'third' }] })

    begin(tour, 'story')
    press(tour)

    // Three calls in the handler, and one problem.
    expect(heardIt.problems).toEqual([{ kind: 'call-refused' }])
  })
})

describe('moving from one story to another', () => {
  // DESIGN.md, **Starting a story**.

  test('switching stories ends one and starts the other, and says which is which', () => {
    const from: (string | undefined)[] = []
    const into: (string | undefined)[] = []

    const tour = staging(
      { id: 'from', steps: [{ id: 'a', target: 'first' }] },
      {
        onStep: (step, story) => {
          const seen = story.id === 'from' ? from : into
          seen.push(step?.id)
        },
      },
    )
    hold(tour, { id: 'into', steps: [{ id: 'b', target: 'second' }] })

    begin(tour, 'from')
    tour.stop()
    begin(tour, 'into')

    expect(from).toEqual(['a', undefined])
    expect(into).toEqual(['b'])
  })

  test('the step of the story being left is told there is nowhere to go', () => {
    const left: [string, string | undefined][] = []
    const tour = staging({
      id: 'from',
      steps: [
        {
          id: 'a',
          target: 'first',
          onLeave: (step, next) => left.push([step.id, next?.id]),
        },
      ],
    })
    hold(tour, { id: 'into', steps: [{ id: 'b', target: 'second' }] })

    begin(tour, 'from')
    tour.stop()
    begin(tour, 'into')

    expect(left).toEqual([['a', undefined]])
  })

  test('a start made while a tour runs moves nothing and takes nothing down', () => {
    const heard: string[] = []
    const left: string[] = []
    const problems: Problem<Fixture>[] = []
    const tour = staging(
      {
        id: 'from',
        onLeave: (story, next) => left.push(`${story.id}->${next?.id ?? 'end'}`),
        steps: [{ id: 'a', target: 'first' }],
      },
      {
        onStep: (step, story) => heard.push(`${story.id}:${step?.id}`),
        onDiagnostic: (problem) => problems.push(problem),
      },
    )
    hold(tour, { id: 'into', steps: [{ id: 'c', target: 'third' }] })

    begin(tour, 'from')
    heard.length = 0

    begin(tour, 'into')

    expect(problems.map((problem) => problem.kind)).toEqual(['tour-running'])
    expect(left).toEqual([])
    expect(heard).toEqual([])
    expect(tour.story?.id).toBe('from')
    expect(tour.step?.id).toBe('a')
  })

  test('a story handing the tour on is still one operation, so onLeave is told the truth', () => {
    const heard: string[] = []
    const left: string[] = []
    const problems: Problem<Fixture>[] = []
    const into: Story = { id: 'into', steps: [{ id: 'c', target: 'third' }] }
    const tour = staging(
      {
        id: 'from',
        next: into,
        onLeave: (story, next) => left.push(`${story.id}->${next?.id ?? 'end'}`),
        steps: [{ id: 'a', target: 'first' }],
      },
      {
        onStep: (step, story) => {
          heard.push(`${story.id}:${step?.id}`)
          if (story.id === 'from' && step === undefined) begin(tour, 'rescue')
        },
        onDiagnostic: (problem) => problems.push(problem),
      },
    )
    hold(tour, { id: 'rescue', steps: [{ id: 'b', target: 'second' }] })
    hold(tour, into)

    begin(tour, 'from')
    heard.length = 0
    press(tour)

    expect(problems.map((problem) => problem.kind)).toEqual(['call-refused'])
    expect(left).toEqual(['from->into'])
    expect(tour.story?.id).toBe('into')
    expect(heard).toEqual(['from:undefined', 'into:c'])
  })

  test('a story started from inside a step onLeave is refused, and the ending finishes', () => {
    const left: string[] = []
    const problems: Problem<Fixture>[] = []
    const tour = staging(
      {
        id: 'from',
        onLeave: (story, next) => left.push(`${story.id}->${next?.id ?? 'end'}`),
        steps: [{ id: 'a', target: 'first', onLeave: () => begin(tour, 'rescue') }],
      },
      { onDiagnostic: (problem) => problems.push(problem) },
    )
    hold(tour, {
      id: 'rescue',
      onLeave: (story, next) => left.push(`${story.id}->${next?.id ?? 'end'}`),
      steps: [{ id: 'b', target: 'second' }],
    })

    begin(tour, 'from')
    tour.stop()

    expect(problems.map((problem) => problem.kind)).toEqual(['call-refused'])
    expect(left).toEqual(['from->end'])
    expect(tour.state).toBe('idle')
  })

  test('a story whose onEnter starts another story is refused, and carries on', () => {
    const log: string[] = []
    const problems: Problem<Fixture>[] = []
    const tour = staging(
      {
        id: 'gate',
        // Inside the story's own setup, which is as early as a call can be made.
        onEnter: () => void begin(tour, 'elsewhere'),
        steps: [{ id: 'a', target: 'first' }],
      },
      { onDiagnostic: (problem) => problems.push(problem) },
    )
    hold(tour, {
      id: 'elsewhere',
      steps: [
        {
          id: 'b',
          target: 'second',
          onEnter: () => void log.push('enter b'),
          onLeave: () => void log.push('leave b'),
        },
      ],
    })

    begin(tour, 'gate')

    expect(problems.map((problem) => problem.kind)).toEqual(['call-refused'])
    expect(tour.story?.id).toBe('gate')
    expect(tour.step?.id).toBe('a')
    expect(log).toEqual([])

    // Once the tour is over, the same call takes.
    tour.stop()
    begin(tour, 'elsewhere')
    expect(log).toEqual(['enter b'])
  })

  test('a story handing the tour on is told which one is starting', () => {
    const leaving: (string | undefined)[] = []
    const tour = machine()
    const branch: Story = { id: 'branch', steps: [{ id: 'b', target: 'second' }] }
    hold(tour, {
      id: 'shared',
      next: branch,
      onLeave: (_story, next) => void leaving.push(next?.id),
      steps: [{ id: 'a', target: 'first' }],
    })
    hold(tour, branch)

    begin(tour, 'shared')
    press(tour)

    expect(leaving).toEqual(['branch'])
    expect(tour.story?.id).toBe('branch')
  })
})
