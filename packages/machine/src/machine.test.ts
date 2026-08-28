import { afterEach, describe, expect, test, vi } from 'vitest'

import type { Fixture, Options, Step, Story } from './fake.js'
import { Fake } from './fake.js'
import { Machine } from './machine.js'
import type { Problem } from './types.js'

// None of the claims in this file is about layout, so none of them needs a
// browser to be true. They were browser tests until the machine came out of
// `@annetaan/leko`, and each one cost three engines a run to say that a signal
// advanced a step. The ones about where a box ended up stayed behind.

const instances: Machine<Fixture>[] = []
const fakes: Fake[] = []
/** The presenter each instance was built with, so a test can press its control. */
const drawnFor = new WeakMap<Machine<Fixture>, Fake>()

afterEach(() => {
  for (const tour of instances.splice(0)) tour.stop()
  fakes.length = 0
  vi.restoreAllMocks()
})

/** The presenter of the instance made most recently. */
const drawing = (): Fake => fakes.at(-1)!

/** Put a name on the page part-way through, so a step can find it late. */
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

/** Press the next control on whatever `tour` is showing. */
const press = (tour: Machine<Fixture>): void => void drawnFor.get(tour)!.press()

/**
 * The stories a test has to hand, by name.
 *
 * The machine keeps no registry — `start` is handed the story itself — so the
 * map from a name to a story belongs to whatever holds the stories, and in this
 * file that is the test. It sits in a helper rather than being threaded through
 * every case, because what these tests are about is what the machine does once
 * a story is up.
 */
const staged = new WeakMap<Machine<Fixture>, Map<string, Story>>()

function hold(tour: Machine<Fixture>, story: Story): Story {
  staged.set(tour, (staged.get(tour) ?? new Map<string, Story>()).set(story.id, story))
  return story
}

/** Put up the story `tour` was staged with under `id`. */
const begin = (tour: Machine<Fixture>, id: string): void => tour.start(staged.get(tour)!.get(id)!)

function staging(story: Story, options: Options = {}) {
  const tour = machine(options)
  hold(tour, story)
  return tour
}

/** One story, staged and started, which is what most of these want. */
function start(steps: Step[], options: Options = {}) {
  const tour = staging({ id: 'story', steps }, options)
  begin(tour, 'story')
  return tour
}

/** Every call, as the id it named, so a whole run reads as one array. */
function watched(story: Story, options: Omit<Options, 'onStep'> = {}) {
  const seen: (string | undefined)[] = []
  const tour = staging(story, { ...options, onStep: (step) => seen.push(step?.id) })
  return { tour, seen }
}

/**
 * Empty the microtask queue, which is where a watcher is called.
 *
 * Three, because a settling morph takes one to reach the `then` in `draw`, the
 * write in there takes another to reach the microtask `announce` queues, and
 * the third is slack. There is no `setTimeout` in this package: it takes no
 * `lib.dom`, and a test is not a reason to start.
 */
const turn = async (): Promise<void> => {
  for (let i = 0; i < 3; i += 1) await Promise.resolve()
}

/** A promise the test settles by hand, so the gap can be looked at. */
function held(): { promise: Promise<void>; settle: () => void } {
  let settle!: () => void
  const promise = new Promise<void>((resolve) => {
    settle = resolve
  })
  return { promise, settle }
}

/** A step that fails every attempt. */
const failing = (id: string, target: string, message?: string, error?: Step['error']): Step => ({
  id,
  target,
  message,
  validate: () => false,
  error,
})

/** The same two steps as fresh objects, the way a re-render hands them back. */
const twoSteps = (message: string): Step[] => [
  { id: 'a', target: 'first' },
  { id: 'b', target: 'second', message },
]

// The groups are the axes the machine is asked about. Reading them as a table
// is the point: a group with two tests in it is a column nobody has crossed
// with the others, and that is where the next bug is.
//
// It has paid for itself twice. A failed attempt had no group here and got one
// in #41. The readout group held two tests and got the two crossings it was
// missing in #42. "A target that is not there" is the one still holding two.
//
// One group is not an axis. "A call that arrives while the machine is inside
// the application" is the rule every other group is written on top of, asked
// once of every way in, so that no group has to ask it again.

describe('a signal, and the step waiting for it', () => {
  // The second constraint, tested from both ends. A step declares a name, the
  // application reports one, and the two are matched or nothing happens.

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

    // Instrumentation stays in the source permanently, in applications where this
    // tour never runs. An unmatched call is not a mistake, so it is not reported
    // and does not even ask the step whether it would have been satisfied.
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

  test('a step that declares a signal is offered no control to press', () => {
    const tour = start([
      { id: 'first', target: 'first', awaits: 'order-saved' },
      { id: 'second', target: 'second' },
    ])

    // The whole of what keeps a press off a step waiting for a signal, now that
    // the presenter is the only presser. It presses the control it was given,
    // and on this step it was given none.
    expect(drawing().content?.next).toBeUndefined()

    tour.reached('order-saved')

    expect(drawing().content?.next).toBe('Next')
  })

  test('a signal reported before its step is showing is not saved up', () => {
    const tour = start([
      { id: 'first', target: 'first' },
      { id: 'second', target: 'second', awaits: 'order-saved' },
    ])

    // The user did the thing early, before the tour asked for it.
    tour.reached('order-saved')
    press(tour)

    // Arriving at the step does not consume that: a buffered signal would advance
    // a step nobody performed while it was showing.
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

    // The other story was waiting for the same name and did not move: progress
    // recorded while nobody was being shown a step is not evidence of anything.
    tour.stop()
    begin(tour, 'returning')
    expect(tour.step?.id).toBe('save-again')
  })
})

describe('what a failed attempt says', () => {
  // `validate` said no. What happens next is derived from the step rather than
  // handed to a handler: the cutout is shaken, and `error` is asked for words
  // to put under the instruction. Nothing in this file exercised the refusal
  // until #41, and two bugs were living in the gap.

  test('says no out loud even where the step gave no words for it', () => {
    const tour = start([failing('one', 'first'), { id: 'two', target: 'second' }])

    press(tour)

    // Derived, not configured. A guard with nothing to say must not leave the
    // next control as a button that does nothing.
    expect(drawing().rejected).toBe(1)
    expect(tour.step?.id).toBe('one')
    expect(drawing().content?.error).toBeUndefined()
  })

  test('adds its reason, and leaves the instruction where it was', () => {
    const step = failing('one', 'first', 'Type your postcode.', 'That is not a postcode.')
    const tour = start([step, { id: 'two', target: 'second' }])

    press(tour)

    // Under the instruction rather than over it. Somebody who has just been
    // told they were wrong has to still be able to read what was asked for.
    expect(drawing().content?.text).toBe('Type your postcode.')
    expect(drawing().content?.error).toBe('That is not a postcode.')
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
    expect(drawing().content?.error).toBe('Attempt 1.')

    // Unlike `message`, the words are not read again when the step is redrawn:
    // they belong to the attempt they were written about.
    drawing().resize()
    expect(drawing().content?.error).toBe('Attempt 1.')

    press(tour)
    expect(drawing().content?.error).toBe('Attempt 2.')
    // The same element `validate` was handed, resolved once for the attempt.
    expect(seen).toEqual(['first', 'first'])
  })

  test('the step is read for its message every time, so an edit to it is seen', () => {
    const step: Step = { id: 'one', target: 'first', message: 'Type your postcode.' }
    start([step, { id: 'two', target: 'second' }])

    expect(drawing().content?.text).toBe('Type your postcode.')

    // The story belongs to the application, and the machine holds no copy of
    // its text. This is why nothing here writes to `message` either.
    step.message = 'Type the postcode on your bill.'
    drawing().resize()

    expect(drawing().content?.text).toBe('Type the postcode on your bill.')
  })

  test('an error is about the attempt, so entering the step again leaves it behind', () => {
    const step = failing('one', 'first', 'Type your postcode.', 'That is not a postcode.')
    const tour = start([{ id: 'zero', target: 'second' }, step])

    press(tour)
    press(tour)
    expect(drawing().content?.error).toBe('That is not a postcode.')

    // Running the story again is the only way back to a step, and it is a
    // fresh attempt at it.
    tour.stop()
    begin(tour, 'story')
    press(tour)

    expect(drawing().content?.error).toBeUndefined()
    expect(drawing().content?.text).toBe('Type your postcode.')
  })

  test('a guard that ends the tour from inside itself leaves no complaint behind', () => {
    // `validate` is the application's own code, so it is one more way into the
    // machine from inside a machine operation. The refusal that follows is
    // about a step nobody is standing on any more.
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
  // Running out of steps asks the story where the tour goes. The answer is
  // asked for and never stored, so nothing is left on a story between runs.

  const summary: Story = { id: 'summary', steps: [{ id: 'end', target: 'second' }] }

  test('runs the story it named, and reports the join in one turn', () => {
    const { tour, seen } = watched({
      id: 'first',
      next: summary,
      steps: [{ id: 'a', target: 'first' }],
    })

    begin(tour, 'first')
    press(tour)

    // The ending is reported, and then the story that follows it. No call from
    // the application sits between the two.
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

    // A panel two chapters share can stay open across a join and close on a
    // stop, which is the whole reason `onLeave` is given this.
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

    // Nothing was written on the story, so the second run gets the second
    // answer. A slot would have carried the first one over.
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

    // Somebody who left the tour is not carried into the next chapter.
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

    // `lost` ends the run where it stands. A chain is what running out of steps
    // means, and this story never ran out.
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

    // `next` is the application's own code and is one more way in. The answer
    // it gave is about a tour that was already over when it gave it.
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

    // The story already on its way would overwrite anything begun here, so the
    // call is turned down and says so. `branching.ts` used to rejoin this way.
    expect(problems.map((problem) => problem.kind)).toEqual(['call-refused'])
    expect(tour.story?.id).toBe('summary')
  })
})

describe('a call made from inside a report', () => {
  // Three reports and three windows. Only the report of an ending with nowhere
  // to go is one a story can begin in, and the other two say which refusal they
  // are, because a host reading one diagnostic for both would have to read
  // `state` to find out which it was holding.
  //
  // **This is what `dispatch` being re-entrant pays for.** The story is up
  // before the `stop()` that reported the ending has returned. Put a queue in
  // front of `dispatch` and the three lines below run against an idle tour,
  // with `second` arriving a turn later. That is a readout showing a tour that
  // ended, a turn of nothing, and then a tour that began.
  test('start from inside onStep runs there, before stop returns', () => {
    const second: Story = { id: 'second', steps: [{ id: 'b', target: 'second' }] }
    let tried = false
    const tour = machine({
      onStep: (step) => {
        if (step !== undefined || tried) return
        tried = true
        begin(tour, 'second')
      },
    })
    hold(tour, { id: 'first', steps: [{ id: 'a', target: 'first' }] })
    hold(tour, second)
    begin(tour, 'first')

    tour.stop()

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

    // A report that names a step is a tour that is running, and `start` never
    // ends one. Only the report of an ending is a window a story can begin in.
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

    // The ending has somewhere to go, so the phase is still closed through its
    // own report. `rescue` would be overwritten by the story already coming.
    expect(problems.map((problem) => problem.kind)).toEqual(['call-refused'])
    expect(tour.story?.id).toBe('summary')
  })
})

describe('starting a story', () => {
  // What `start` does to a machine that is already running something, and what
  // it refuses to do.

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

    // Running it again puts somebody back at the top, which is the only place
    // a story can be entered and the reason a story should be short.
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

    // The bounds check on `at` used to catch this, because `0 >= 0`. Entering
    // anyway would report a run that began and ended in the same turn.
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

    // The `id` is not read, and a component handing over freshly built steps on
    // every render is a host calling `start` on a tour that is running. It gets
    // a diagnostic rather than a run that restarts under somebody.
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

    // `call-refused` means the gate was shut and the call is worth making again.
    // This one is not: the fix is `stop()`, and naming both stories is what says
    // so without the host having to read `state` to find out.
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

    // The silence `reached()` keeps is for instrumentation left in builds where
    // no tour runs. A host giving an order is told, and it is told without
    // anything being torn down.
    tour.start({ id: 'nothing-to-show', steps: [] })

    expect(seen).toEqual([])
    expect(tour.story?.id).toBe('story')
    expect(tour.step?.id).toBe('a')
  })

  test('a story started from the ending of a stop still wins', () => {
    const tour = staging(
      { id: 'first', steps: [{ id: 'a', target: 'first' }] },
      {
        onStep: (step) => {
          // Nothing follows this report. The tour is idle by the time it goes
          // out, so this is the last word on where it is.
          if (!step) begin(tour, 'third')
        },
      },
    )
    hold(tour, { id: 'third', steps: [{ id: 'c', target: 'third' }] })
    begin(tour, 'first')

    tour.stop()

    expect(tour.story?.id).toBe('third')
    expect(tour.step?.id).toBe('c')
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
  // `state`, `step` and `index`, which are the whole public readout.
  //
  // It held two, and every other group drives the machine through some sequence
  // and then asks which step it landed on, so `state` was asserted all over the
  // file and pinned down almost nowhere. #42 added the two crossings that were
  // missing, both of a target that went away. The last two cross it with the
  // window nobody had asked about: the arrival where every handler answered on
  // the spot, which is most of them.
  //
  // Three of these came from `../model/`, which searches the machine rather than
  // being written against it. All three are a presenter reporting about a step
  // the tour has already walked away from, and every one of them was green here
  // with the rule they are about taken out of `machine.ts`.

  test('interrupting a draw does not mark the next step as already settled', async () => {
    const tour = staging({
      id: 'story',
      steps: [
        { id: 'a', target: 'first' },
        { id: 'b', target: 'second' },
      ],
    })
    drawing().slow = true

    begin(tour, 'story')
    press(tour) // while the first step is still on its way
    await Promise.resolve()

    // The interrupted one settles too, and used to hand 'running' to a step that
    // had not arrived yet.
    expect(tour.state).toBe('transitioning')
  })

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

    // No hook decides otherwise. The presenter has already given the target
    // time to come back by the time the machine hears about it, so there is
    // nothing left to wait for and pointing a spotlight at nothing is worse
    // than not running at all.
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

  test('a target lost after its step was drawn reads as transitioning', () => {
    const only: Step = { id: 'a', target: 'first' }
    const { tour, seen } = watched({ id: 'story', steps: [only] })
    begin(tour, 'story')

    expect(tour.state).toBe('running')

    drawing().hunt(only)

    // The same window as a target missing when the step arrived, which reads
    // this way already. What is on screen is a curtain either way, and a host
    // that cannot see the wait cannot stand back for it.
    expect(tour.state).toBe('transitioning')
    // Nothing moved. The tour is on the step it was on, and no report was made
    // about a wait that may yet come to nothing.
    expect(tour.step?.id).toBe('a')
    expect(seen).toEqual(['a'])

    drawing().found(only)

    expect(tour.state).toBe('running')
    expect(seen).toEqual(['a'])
  })

  test('a signal is still acted on while a lost target is being looked for', () => {
    const first: Step = { id: 'a', target: 'first', awaits: 'saved' }
    const tour = start([first, { id: 'b', target: 'second' }])
    drawing().hunt(first)

    // A search is not a call into the application, so it is not a moment the
    // gate closes for. The application knows what it knows, and the step it was
    // waiting on is the one the user has been through.
    tour.reached('saved')

    expect(tour.step?.id).toBe('b')
    expect(tour.state).toBe('running')
  })

  test('watching state hears every crossing, and only the crossings', async () => {
    const seen: string[] = []
    const tour = staging({
      id: 'story',
      steps: [
        { id: 'a', target: 'first', awaits: 'saved' },
        { id: 'b', target: 'second' },
      ],
    })
    drawing().slow = true
    tour.watch((state) => seen.push(state))

    begin(tour, 'story')
    await turn()

    // One call for a turn that wrote `phase` three times on its way to a step
    // that has not settled. A watcher told about each write would see a flicker
    // that never existed for anybody.
    expect(seen).toEqual(['transitioning'])

    drawing().land()
    await turn()

    expect(seen).toEqual(['transitioning', 'running'])

    // A name nothing waits for moves nothing, so there is nothing to say.
    tour.reached('unrelated')
    await turn()

    expect(seen).toEqual(['transitioning', 'running'])
  })

  test('a run that starts and settles in one turn says running once', async () => {
    const seen: string[] = []
    const tour = staging({ id: 'story', steps: [{ id: 'a', target: 'first' }] })
    tour.watch((state) => seen.push(state))

    begin(tour, 'story')
    await turn()

    expect(tour.state).toBe('running')
    expect(seen).toEqual(['running'])

    tour.stop()
    await turn()

    expect(seen).toEqual(['running', 'idle'])
  })

  test('a watcher hears the wait for a target that left the page', async () => {
    const only: Step = { id: 'a', target: 'first' }
    const seen: string[] = []
    const tour = staging({ id: 'story', steps: [only] })
    begin(tour, 'story')
    tour.watch((state) => seen.push(state))

    drawing().hunt(only)
    await turn()

    expect(seen).toEqual(['transitioning'])

    drawing().found(only)
    await turn()

    expect(seen).toEqual(['transitioning', 'running'])
  })

  test('watching stops when the unsubscribe is called, from inside or outside', async () => {
    const seen: string[] = []
    const tour = staging({
      id: 'story',
      steps: [
        { id: 'a', target: 'first' },
        { id: 'b', target: 'second' },
      ],
    })
    const stop = tour.watch((state) => {
      seen.push(state)
      // From inside itself, which is why the set is copied before it is walked.
      if (state === 'idle') stop()
    })

    begin(tour, 'story')
    await turn()
    tour.stop()
    await turn()

    expect(seen).toEqual(['running', 'idle'])

    begin(tour, 'story')
    await turn()

    expect(seen).toEqual(['running', 'idle'])
  })

  test('a wait the tour has already left leaves nothing behind', () => {
    const first: Step = { id: 'a', target: 'first' }
    const tour = start([first, { id: 'b', target: 'second' }])
    drawing().hunt(first)
    press(tour)

    expect(tour.step?.id).toBe('b')
    expect(tour.state).toBe('running')

    // The presenter drops a search it no longer needs, and says so about the
    // step it was armed on rather than the one showing. Reading it as anything
    // about the current step would strand the tour on `transitioning`.
    drawing().found(first)

    expect(tour.state).toBe('running')
  })

  test('a search armed on a step the tour has left is not a search for this one', () => {
    const first: Step = { id: 'a', target: 'first' }
    const tour = start([first, { id: 'b', target: 'second' }])
    press(tour)

    // The presenter watches the step it was shown, and the tour can move while
    // that observer is still armed. So a report of a target going away arrives
    // for `a` while `b` is showing, and it is about neither the step on screen
    // nor anything a host could act on.
    drawing().hunt(first)

    // A wait started here would be a wait the step it belongs to cannot end,
    // and `b` would read `transitioning` for the rest of the run.
    expect(tour.state).toBe('running')
    expect(tour.step?.id).toBe('b')
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

    // The same observer, giving up rather than waiting. A target the tour walked
    // away from is allowed to go away.
    drawing().lose(first)

    expect(tour.state).toBe('running')
    expect(tour.step?.id).toBe('b')
    expect(problems).toEqual([])
  })

  test('a morph landing under a search does not call the step arrived', async () => {
    const only: Step = { id: 'a', target: 'first' }
    const tour = staging({ id: 'story', steps: [only] })
    drawing().slow = true

    begin(tour, 'story')
    expect(tour.state).toBe('transitioning')

    // Two things wrote the phase. The morph put `settling` on it and the search
    // put `searching` over that, and only the one that wrote it may take its own
    // off again.
    drawing().hunt(only)
    drawing().land()
    await turn()

    // What is on screen is a curtain over a target that is not there. A tour
    // reading `running` through that is one whose host stands back for nothing.
    expect(tour.state).toBe('transitioning')

    drawing().found(only)

    expect(tour.state).toBe('running')
  })

  test('a target taken away by the step that assumed it ends the run', () => {
    const { tour, seen } = watched({
      id: 'story',
      steps: [
        { id: 'a', target: 'first' },
        {
          id: 'b',
          target: 'second',
          // The anchor is resolved after `onEnter` returns, so a handler that
          // takes its own target off the page is the one route to a lost target
          // that arrives from inside the arrival itself.
          onEnter: () => void drawing().page.delete('second'),
        },
      ],
    })
    begin(tour, 'story')
    seen.length = 0
    press(tour)

    expect(tour.state).toBe('idle')
    // `b` was never drawn, so the ending leaves from the step a host was told
    // about rather than from the one it was walking into.
    expect(seen).toEqual([undefined])
  })

  test('a step still arriving says transitioning, whatever its handlers answered', () => {
    const seen: string[] = []
    const tour = staging({
      id: 'story',
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

    // Both are calls into the application, made with `b` not built, not
    // measured and never drawn. Only a handler that returned a promise used to
    // put the machine in `transitioning`, so a tour whose handlers answered on
    // the spot said `running` about a step the presenter had never been given.
    expect(seen).toEqual(['onLeave:transitioning:b', 'onEnter:transitioning:b'])
    expect(tour.state).toBe('running')
  })

  test('a story still arriving says transitioning while its own onEnter runs', () => {
    const seen: string[] = []
    const tour = staging({
      id: 'story',
      steps: [{ id: 'a', target: 'first' }],
      onEnter: () => {
        seen.push(tour.state)
      },
    })
    begin(tour, 'story')

    expect(seen).toEqual(['transitioning'])
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

    // `end` empties the position before it calls anything, so a handler asking
    // where the tour is gets the truth: nowhere. The phase is still closed
    // underneath, and that is what refuses a `start()` made from in here. The
    // two say different things on purpose, and only one of them is public.
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
  // `onStep`, which is the one hook that says so.

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

    // Past the last step there is nowhere to be, which is the trailing
    // `undefined`.
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
    // Reading the instance from inside the hook is how a host writes a progress
    // readout. Firing before the move landed would report the step just left.
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

    // One hook, told which story each time, which is what a handler that cares
    // about only one of them reads. A hook registered on the story instead
    // would have to be registered on every story, and a story added later
    // without one would stop reporting with nothing to say so.
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
        // The position is already on `b` here, and nothing of it has been
        // measured or drawn. A progress readout that heard about `b` from in
        // here would be naming a step the user cannot see yet.
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

    // One call, and it names no step. `a` was never drawn, so `onStep` never
    // named it, and an ending is not a second chance to. A readout hears about
    // a step when it goes up and never otherwise.
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

    // `from` was inside its own first step and nothing had been drawn. Nothing
    // was reported either, so the arrival that lands is the only thing a
    // readout ever hears about.
    expect(seen).toEqual(['a'])
    expect(tour.step?.id).toBe('a')
  })

  test('a story whose target is already gone reports its ending, and no start', () => {
    const { tour, seen } = watched({ id: 'story', steps: [{ id: 'ghost', target: '#not-here' }] })

    begin(tour, 'story')

    // `show` found nothing and stopped the run, which reported the ending. A
    // report naming a step after that would leave a readout pointing at a story
    // that is not running. `ghost` is not named on the way out either, because
    // it was never drawn.
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

    // `gone` was never drawn, so it is never named. Naming it on the way out
    // would be the first a host had heard of it, which is a readout jumping to
    // a step nobody saw and then to nothing.
    expect(seen).toEqual([undefined])
  })
})

describe('what a step assumes', () => {
  // `onEnter` and `onLeave` on a step, and what the machine does to a call that
  // arrives while one of them is still running.

  test('a step being built is not advanced past, and the presses are not saved', () => {
    const { tour, seen } = watched({
      id: 'story',
      steps: [
        { id: 'a', target: 'first' },
        {
          id: 'b',
          target: 'second',
          // `b` has built nothing and has never been on screen, so there is
          // nothing here to advance away from.
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

    // Dropped rather than queued: the arrival lands on `b`, and `c` is still
    // ahead.
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
          // Nothing here is ready: the tour is inside the handler, and `b` has
          // never been on screen.
          onEnter: () => {
            tour.reached('order-saved')
          },
        },
        { id: 'c', target: 'first' },
      ],
    })

    begin(tour, 'story')
    press(tour)

    // `b` arrives and `c` is still ahead.
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

    press(tour) // past the last step, so there is nowhere to be going
    expect(left).toEqual([
      ['a', 'b'],
      ['b', undefined],
    ])
  })

  test('an onEnter that fails stops the tour, and does not swallow the reason', () => {
    const boom = new Error('the panel would not open')
    // Caught rather than let go, because an uncaught error fails the run. What is
    // being asserted is that the machine hands the reason on rather than keeping it.
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
    // The half-built step is still cleaned up: the handler may have registered
    // something before the part that failed.
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
        // The tour is dropped from inside the handler that was building `b`.
        onEnter: () => tour.stop(),
        onLeave: (step, next) => left.push([step.id, next?.id]),
      },
      { id: 'c', target: 'first' },
    ])

    press(tour)

    // The half-built step is owed its `onLeave` all the same.
    expect(left).toEqual([['b', undefined]])
    // And the arrival that was in the middle of it draws nothing.
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

    // Outermost first. A story's setup that ran after the step's would be setting
    // up a world the step has already been built against.
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
        // No step has been entered, so there is none here to move.
        press(tour)
        tour.reached('saved')
      },
      steps: [
        { id: 'a', target: 'late', awaits: 'saved', onEnter: () => void entered.push('a') },
        { id: 'b', target: 'late', onEnter: () => void entered.push('b') },
      ],
    })

    begin(tour, 'story')

    // What the story assumes was built first, and the tour is on the step that
    // was waiting for it rather than one past it.
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

    // Innermost first, the mirror of the order they were entered in.
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
    // The step was never entered, so nothing of it needs undoing; the story's own
    // half-built state does.
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
    // No step was ever entered, so there is no step half-built to undo.
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
  // One rule, asked of every way in. The machine never acts on a call while it
  // is inside a call into the application: an `onEnter` building a step, and an
  // `onLeave` running as a run is torn down.
  //
  // The window is one synchronous call wide, because no handler hands anything
  // back to wait for. So every call below is made from inside the handler
  // itself, which is the only place there is to make one from.
  //
  // The groups above ask what one entry point does about it. This one asks
  // whether any of them is an exception, which is the claim the rest of the
  // file is written on top of.

  /** A tour that makes `calls` from inside the second step's `onEnter`. */
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
    // Three calls and one draw. Nothing was queued and replayed either, which is
    // the other way to get this wrong: a signal saved over is a step advancing
    // on something that happened before it began.
    expect(drawing().shown).toEqual(['a', 'b'])
    // Two of the three calls report, and the gate is what turned the `start`
    // down rather than the tour running, which is the difference `call-refused`
    // and `tour-running` are there to draw. `press` is the silent one: a
    // control nobody can see was not pressed by anybody.
    expect(problems.map((problem) => problem.kind)).toEqual(['signal-dropped', 'call-refused'])
    tour.stop()
    begin(tour, 'other')
    expect(tour.story?.id).toBe('other')
  })

  test('stop is the one call that does not ask, because a tour has to be turnable off', () => {
    const tour = inside((running) => running.stop())

    // A handler that has decided the tour should not go on has nowhere else to
    // go, and finishing the arrival first is not an answer.
    expect(tour.state).toBe('idle')
    expect(drawing().torn).toBe(1)
    // And the arrival it walked out of draws nothing.
    expect(drawing().shown).toEqual(['a'])
  })

  test('a refused signal is still refused when the step is the one awaiting it', () => {
    const tour = inside((running) => running.reached('ready'))

    // `b` declares this name and is the step the tour is on by every internal
    // measure. It had never been on screen when the call was made, so there was
    // no step there to advance away from, and the call was dropped where it
    // stood rather than saved for the moment the step arrived.
    expect(tour.step?.id).toBe('b')
    expect(tour.state).toBe('running')

    // Reported again now that the step is standing, it moves the tour. `b` is
    // the last step, so that is the end of the run.
    tour.reached('ready')
    expect(tour.state).toBe('idle')
  })

  test('a morph is not an arrival, and every call goes through one', () => {
    const tour = staging({
      id: 'story',
      steps: [
        { id: 'a', target: 'first' },
        { id: 'b', target: 'second' },
      ],
    })
    drawing().slow = true
    begin(tour, 'story')

    // Drawn, on screen, and still moving. Dropping a call here would be the
    // library deciding the user did not mean the button they pressed.
    expect(tour.state).toBe('transitioning')
    press(tour)

    expect(tour.step?.id).toBe('b')
    expect(drawing().shown).toEqual(['a', 'b'])
  })
})

describe('saying that a call did nothing', () => {
  // The line is whether a caller doing everything right can end up here. If it
  // can, silence. If it cannot, the call was a mistake every time and has no
  // other symptom, which is a bad afternoon.

  /** A tour with a diagnostic wired up, and the list it writes into. */
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

    // `start` is the host giving an order, and an order that did nothing has no
    // other symptom. The story itself is handed over rather than its name, so a
    // handler can say which object it was.
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

    // The narrow way left to reach this. The step is the one that awaits the
    // name and has never been on screen, so the call is dropped and the step
    // goes on waiting for a report that has already been made.
    expect(heardIt.problems).toEqual([{ kind: 'signal-dropped', name: 'ready', step }])
    expect(tour.step?.id).toBe('b')
  })

  test('a name nothing is waiting for stays silent, whatever the machine is doing', () => {
    let tour!: Machine<Fixture>
    const heardIt = heard({
      id: 'story',
      steps: [
        { id: 'a', target: 'first' },
        // Reported from inside the arrival, which is the one moment the gate is
        // closed. A name nobody awaits is silent there too.
        { id: 'b', target: 'second', awaits: 'ready', onEnter: () => tour.reached('anything') },
      ],
    })
    tour = heardIt.tour

    tour.reached('anything') // idle
    begin(tour, 'story')
    tour.reached('anything') // running, and no step waits for it
    press(tour)

    // Instrumentation is meant to stay in the source permanently, including in
    // builds where no tour runs, so something free to leave in cannot complain
    // about being left in.
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

    // `stop` is not among them. It is the one call that asks nothing, so there
    // is never anything to report about it. Nor is the press: the control is
    // not a call a host made, and the presenter takes it off the screen for the
    // whole of an arrival anyway. So `start` is the only call that lands here,
    // which is why the problem has nothing on it to read.
    expect(heardIt.problems).toEqual([{ kind: 'call-refused' }])
  })
})

describe('moving from one story to another', () => {
  // `start` never ends a tour, so moving is two calls: `stop()` and then
  // `start`. What this group asks is that the two read as one move to a host,
  // and that the call which used to do it in one is turned down wherever it is
  // made from.

  test('switching stories ends one and starts the other, and says which is which', () => {
    const from: (string | undefined)[] = []
    const into: (string | undefined)[] = []

    const tour = staging(
      { id: 'from', steps: [{ id: 'a', target: 'first' }] },
      {
        // Which story moved is the third argument, so one handler sorts the two
        // runs apart without either story carrying a hook.
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

    // Told that it ended, rather than left half-finished.
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

    // A step's `onLeave` is only ever told about a step, and the tour ended
    // before the second call was made.
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

    // Nothing at all happened, and the diagnostic is the only trace. The story
    // showing keeps its step, no `onLeave` ran, and no report went out, so a
    // readout watching this hears nothing to redraw for a call that came to
    // nothing.
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
          // Reacting to the ending by sending the user somewhere else, which is
          // an ordinary thing for a host to do and is not one it can do from
          // the report of an ending that already has a story on its way.
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

    // `from` was told `into` is next and skipped whatever the two share. A
    // `rescue` starting from that report would make `next` a lie, and would run
    // on state that was left behind for a story that never came.
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

    // `rescue` starting here would be torn down by the lines that run after
    // this handler, and would leave `from` without the `onLeave` it is owed.
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
        // A check that sends the user somewhere else, answered in the same turn
        // because the answer was known already. It is inside this story's own
        // setup, which is as early as a call can be made.
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

    // Once the tour is over, the same call takes. Both refusals are reported,
    // and a host reading them knows which fix it needs.
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

    // The teardown a chapter and the one after it both need is teardown this
    // argument lets a handler skip.
    expect(leaving).toEqual(['branch'])
    expect(tour.story?.id).toBe('branch')
  })
})
