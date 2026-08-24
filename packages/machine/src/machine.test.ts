import { afterEach, describe, expect, test, vi } from 'vitest'

import { Machine } from './machine.js'
import type { Content, Host, Presenter } from './port.js'
import type { ErrorUtils, MachineOptions, StepBase, StoryBase } from './types.js'

// None of the claims in this file is about layout, so none of them needs a
// browser to be true. They were browser tests until the machine came out of
// `@annetaan/leko`, and each one cost three engines a run to say that a signal
// advanced a step. The ones about where a box ended up stayed behind.

/**
 * An anchor is a name here. The machine does two things with one: hands it to
 * `validate`, and hands it back to the presenter. A string carries as much as
 * an element would.
 */
type Anchor = string

interface Step extends StepBase<Anchor, Step> {
  target: string
  /**
   * Writable here, the way `LekoStep` declares it. `StepBase` has it `readonly`
   * to say the machine never writes it. The application owns the object and is
   * free to edit its own text, and one test below does exactly that.
   */
  message?: string
}

type Story = StoryBase<Anchor, Step, Story>
type Options = MachineOptions<Anchor, Step, Story>

/** The names on the page. A step pointing anywhere else resolves to nothing. */
const PAGE = ['first', 'second', 'third', 'target']

/**
 * Stands in for whatever draws the tour, and keeps a note of what it was asked
 * for.
 *
 * It settles in the turn it was called in, which is what a presenter with
 * nothing to animate does. {@link Fake.slow} makes it wait instead, so the gap
 * between a step arriving and a step settling can be looked at.
 */
class Fake implements Presenter<Anchor, Step, Story> {
  readonly page = new Set(PAGE)
  /** Every step it was asked to draw, in order. */
  readonly shown: string[] = []
  /** What it was last told to say. */
  content: Content | undefined
  /** Every retell, so a test can ask which step got rewritten, and with what. */
  readonly retold: { step: string; anchor: Anchor; content: Content }[] = []
  slow = false
  rejected = 0
  hidden = 0
  torn = 0
  private settle: (() => void) | undefined

  constructor(private readonly host: Host<Step>) {}

  resolve(step: Step): Anchor | null {
    return this.page.has(step.target) ? step.target : null
  }

  show(_story: Story, step: Step, _anchor: Anchor, content: Content): Promise<void> | void {
    this.shown.push(step.id)
    this.content = content
    // Whatever was in flight is interrupted and settles all the same, which is
    // what a real morph does rather than hanging.
    this.settle?.()
    this.settle = undefined
    if (!this.slow) return
    return new Promise<void>((resolve) => {
      this.settle = resolve
    })
  }

  place(_story: Story, step: Step, _anchor: Anchor | null, content: Content): void {
    this.shown.push(`place:${step.id}`)
    this.content = content
  }

  retell(_story: Story, step: Step, anchor: Anchor, content: Content): void {
    this.retold.push({ step: step.id, anchor, content })
    this.content = content
  }

  reject(): void {
    this.rejected += 1
  }

  hide(): void {
    this.hidden += 1
  }

  teardown(): void {
    this.torn += 1
  }

  /** The step's target left the page, the way a MutationObserver would notice. */
  lose(step: Step): void {
    this.page.delete(step.target)
    this.host.lost(step)
  }

  /** The surface moved under the tour, the way a resize would. */
  resize(): void {
    this.host.moved()
  }
}

const instances: Machine<Anchor, Step, Story>[] = []
const fakes: Fake[] = []

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
  const tour = new Machine<Anchor, Step, Story>(options, (host) => {
    const fake = new Fake(host)
    fakes.push(fake)
    return fake
  })
  instances.push(tour)
  return tour
}

function register(story: Story, options: Options = {}) {
  const tour = machine(options)
  tour.setStory(story)
  return tour
}

/** One story, registered and started, which is what most of these want. */
function start(steps: Step[], options: Options = {}) {
  const tour = register({ id: 'story', steps }, options)
  tour.start('story')
  return tour
}

/** Every call, as `[step, previous]` ids, so a whole run reads as one array. */
function watched(story: Omit<Story, 'onStep'>, options: Options = {}) {
  const seen: [string | undefined, string | undefined][] = []
  const tour = register(
    { ...story, onStep: (step, previous) => seen.push([step?.id, previous?.id]) },
    options,
  )
  return { tour, seen }
}

/** A promise the test settles by hand, so the gap can be looked at. */
function held(): { promise: Promise<void>; settle: () => void } {
  let settle!: () => void
  const promise = new Promise<void>((resolve) => {
    settle = resolve
  })
  return { promise, settle }
}

/**
 * A step that fails every attempt, and hands back what the attempt was given.
 * `use()` is what `onValidationError` was called with, so it is only good after
 * a `nextStep()` that the step turned down.
 */
function failing(id: string, target: string, message?: string) {
  let given: ErrorUtils | undefined
  const step: Step = {
    id,
    target,
    message,
    validate: () => false,
    onValidationError: (_anchor, utils) => void (given = utils),
  }
  return { step, use: () => given! }
}

/** The same two steps as fresh objects, the way a re-render hands them back. */
const twoSteps = (message: string): Step[] => [
  { id: 'a', target: 'first' },
  { id: 'b', target: 'second', message },
]

// The groups are the axes the machine is asked about. Reading them as a table
// is the point: a group with two tests in it is a column nobody has crossed
// with the others, and that is where the next bug is.
//
// It has paid for itself twice. `ErrorUtils` had no group here and got one in
// #41. The readout group held two tests and got the two crossings it was
// missing in #42. "A target that is not there" is the one still holding two.

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

  test('a signal still has to get past validate', () => {
    let ready = false
    const onValidationError = vi.fn()

    const tour = start([
      {
        id: 'first',
        target: 'first',
        awaits: 'order-saved',
        validate: () => ready,
        onValidationError,
      },
      { id: 'second', target: 'second' },
    ])

    tour.reached('order-saved')
    expect(tour.step?.id).toBe('first')
    expect(onValidationError).toHaveBeenCalledOnce()

    ready = true
    tour.reached('order-saved')
    expect(tour.step?.id).toBe('second')
  })

  test('a signal reported before its step is showing is not saved up', () => {
    const tour = start([
      { id: 'first', target: 'first' },
      { id: 'second', target: 'second', awaits: 'order-saved' },
    ])

    // The user did the thing early, before the tour asked for it.
    tour.reached('order-saved')
    tour.nextStep()

    // Arriving at the step does not consume that: a buffered signal would advance
    // a step nobody performed while it was showing.
    expect(tour.step?.id).toBe('second')
  })

  test('a signal reaches the story that is running, and no other', () => {
    const tour = register({
      id: 'onboarding',
      steps: [
        { id: 'save', target: 'first', awaits: 'order-saved' },
        { id: 'done', target: 'second' },
      ],
    })
    tour.setStory({
      id: 'returning',
      steps: [
        { id: 'save-again', target: 'first', awaits: 'order-saved' },
        { id: 'done', target: 'second' },
      ],
    })

    tour.start('onboarding')
    tour.reached('order-saved')
    expect(tour.step?.id).toBe('done')

    // The other story was waiting for the same name and did not move: progress
    // recorded while nobody was being shown a step is not evidence of anything.
    tour.start('returning')
    expect(tour.step?.id).toBe('save-again')
  })
})

describe('what a failed attempt can do about itself', () => {
  // `validate` said no, and `onValidationError` is handed three things it can do
  // about that. Nothing in this file called any of them until now, and two bugs
  // were living in the gap.

  test('shake asks the presenter to say no, and moves nothing', () => {
    const { step, use } = failing('one', 'first')
    const tour = start([step, { id: 'two', target: 'second' }])

    tour.nextStep()
    use().shake()

    expect(drawing().rejected).toBe(1)
    expect(tour.step?.id).toBe('one')
  })

  test('setError adds a reason, and leaves the instruction where it was', () => {
    const { step, use } = failing('one', 'first', 'Type your postcode.')
    const tour = start([step, { id: 'two', target: 'second' }])

    tour.nextStep()
    use().setError('That is not a postcode.')

    // Under the instruction rather than over it. Somebody who has just been
    // told they were wrong has to still be able to read what was asked for.
    expect(drawing().content?.text).toBe('Type your postcode.')
    expect(drawing().content?.error).toBe('That is not a postcode.')

    use().setError('Six characters, like SW1A 1AA.')

    expect(drawing().content?.text).toBe('Type your postcode.')
    expect(drawing().content?.error).toBe('Six characters, like SW1A 1AA.')
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
    const { step, use } = failing('one', 'first', 'Type your postcode.')
    const tour = start([{ id: 'zero', target: 'second' }, step])

    tour.nextStep()
    tour.nextStep()
    use().setError('That is not a postcode.')
    expect(drawing().content?.error).toBe('That is not a postcode.')

    tour.prevStep()
    tour.nextStep()

    expect(drawing().content?.error).toBeUndefined()
    expect(drawing().content?.text).toBe('Type your postcode.')
  })

  test('a second attempt at the same step is still holding good utils', () => {
    const { step, use } = failing('one', 'first')
    const tour = start([step, { id: 'two', target: 'second' }])

    tour.nextStep()
    const first = use()
    tour.nextStep()

    // Failing does not move the tour, so nothing has happened to the step these
    // belong to. Only an arrival or a stop ends an attempt.
    first.setError('still no')

    expect(drawing().content?.error).toBe('still no')
  })

  test('utils held past the step they belong to do nothing at all', () => {
    let ready = false
    let kept: ErrorUtils | undefined
    const tour = start([
      {
        id: 'one',
        target: 'first',
        validate: () => ready,
        onValidationError: (_anchor, utils) => void (kept = utils),
      },
      { id: 'two', target: 'second', message: 'The second step.' },
    ])

    tour.nextStep()
    ready = true
    tour.nextStep()
    expect(tour.step?.id).toBe('two')

    const fake = drawing()
    fake.retold.length = 0
    // `onValidationError` returns void, so a handler is free to look something
    // up and call back once the tour has moved on.
    kept?.setError('about the step before')
    kept?.shake()

    // Under `two` this is a complaint about work the user already finished,
    // anchored to an element `two` never named.
    expect(fake.retold).toEqual([])
    expect(fake.rejected).toBe(0)
    expect(fake.content?.text).toBe('The second step.')
    expect(fake.content?.error).toBeUndefined()
  })

  test('utils held past the end of the tour do nothing either', () => {
    const { step, use } = failing('one', 'first')
    const tour = start([step, { id: 'two', target: 'second' }])

    tour.nextStep()
    const kept = use()
    tour.stop()

    const fake = drawing()
    fake.retold.length = 0
    kept.setError('after it was over')
    kept.shake()

    expect(fake.retold).toEqual([])
    expect(fake.rejected).toBe(0)
  })
})

describe('registering a story, and starting one', () => {
  // What `setStory` and `start` do to a machine that is already running
  // something, and what they refuse to do.

  test('a story can be started part-way through', () => {
    const tour = register({
      id: 'onboarding',
      steps: [
        { id: 'a', target: 'first' },
        { id: 'b', target: 'second' },
      ],
    })
    tour.start('onboarding', 'b')

    expect(tour.step?.id).toBe('b')
  })

  test('re-registering the story that is running does not restart it', () => {
    const tour = register({ id: 'onboarding', steps: twoSteps('before') })
    tour.start('onboarding')
    tour.nextStep()

    // A component that registers on every render hands the same story back with
    // fresh objects in it, and must not throw the user back to the first step.
    tour.setStory({ id: 'onboarding', steps: twoSteps('after') })

    expect(tour.step?.id).toBe('b')
    expect(tour.step?.message).toBe('after')
  })

  test('a typo cannot end the story someone is in the middle of', () => {
    const { tour, seen } = watched({
      id: 'story',
      steps: [
        { id: 'a', target: 'first' },
        { id: 'b', target: 'second' },
      ],
    })

    tour.start('story')
    seen.length = 0
    tour.start('nowhere')
    tour.start('story', 'no-such-step')
    // In range and still not a step, because `steps[0.5]` is nowhere.
    tour.start('story', 0.5)

    expect(seen).toEqual([])
    expect(tour.story?.id).toBe('story')
    expect(tour.step?.id).toBe('a')
  })

  test('start says whether the story it named is the one now running', () => {
    const tour = register({ id: 'onboarding', steps: [{ id: 'a', target: 'first' }] })

    expect(tour.start('onboarding')).toBe(true)
    expect(tour.step?.id).toBe('a')
  })

  test('start says no to an id nothing is registered under, and to a step that is not there', () => {
    const tour = register({
      id: 'onboarding',
      steps: [
        { id: 'a', target: 'first' },
        { id: 'b', target: 'second' },
      ],
    })
    tour.start('onboarding')

    // The silence `reached()` keeps is for instrumentation left in builds where
    // no tour runs. A host giving an order and naming the wrong story has no
    // other symptom to go on.
    expect(tour.start('onbaording')).toBe(false)
    expect(tour.start('onboarding', 'c')).toBe(false)
    expect(tour.start('onboarding', 1.5)).toBe(false)
    expect(tour.start('onboarding', 2)).toBe(false)
    expect(tour.start('onboarding', -1)).toBe(false)

    // And none of them ended the tour that was already running.
    expect(tour.step?.id).toBe('a')
  })

  test('start says no where a handler took the tour somewhere else instead', () => {
    const tour = register({
      id: 'first',
      steps: [{ id: 'a', target: 'first' }],
      onStep: (step) => {
        // The ending of `first` is where the application takes over.
        if (!step) tour.start('third')
      },
    })
    tour.setStory({ id: 'second', steps: [{ id: 'b', target: 'second' }] })
    tour.setStory({ id: 'third', steps: [{ id: 'c', target: 'third' }] })
    tour.start('first')

    const started = tour.start('second')

    // The arguments were good. The tour is somewhere else all the same, and
    // that is what a caller can act on.
    expect(started).toBe(false)
    expect(tour.story?.id).toBe('third')
  })

  test('a story that comes back shorter than the tour has gone ends the tour', () => {
    const { tour, seen } = watched({
      id: 'onboarding',
      steps: [
        { id: 'a', target: 'first' },
        { id: 'b', target: 'second' },
        { id: 'c', target: 'first' },
      ],
    })
    tour.start('onboarding', 'c')
    seen.length = 0

    tour.setStory({ id: 'onboarding', steps: [{ id: 'a', target: 'first' }] })

    // Nothing stands where the user was standing. Holding the position anyway
    // left a tour reading `running` with no step to show, on which `nextStep()`
    // and every signal after it landed on nothing.
    expect(tour.state).toBe('idle')
    expect(tour.step).toBeUndefined()
    expect(seen).toEqual([[undefined, 'c']])
    expect(drawing().torn).toBe(1)
  })

  test('a story that still has a step where the tour is standing is swapped in place', () => {
    const { tour, seen } = watched({
      id: 'onboarding',
      steps: [...twoSteps('before'), { id: 'c', target: 'first' }],
    })
    tour.start('onboarding')
    tour.nextStep()
    seen.length = 0

    // Shorter than it was, and still long enough to hold the step someone is
    // on. Losing a step further along is the story's business, not the tour's.
    tour.setStory({ id: 'onboarding', steps: twoSteps('after') })

    expect(seen).toEqual([])
    expect(tour.step?.message).toBe('after')
  })

  test('a story taken back stays taken back, whatever a handler does about it', () => {
    const tour = register({
      id: 'onboarding',
      steps: [{ id: 'a', target: 'first' }],
      // Stopping is where the application gets to react, and the id is still
      // one it knows. Starting it again from here is the thing that used to
      // beat the delete.
      onLeave: (story) => void tour.start(story.id),
    })
    tour.start('onboarding')

    expect(tour.deleteStory('onboarding')).toBe(true)

    // Taken out of the map after the stop, this left the tour running a story
    // that `deleteStory` had reported gone and `start` could no longer reach.
    expect(tour.state).toBe('idle')
    expect(tour.story).toBeUndefined()
    expect(tour.start('onboarding')).toBe(false)
  })

  test('a story taken back is out of reach of start', () => {
    const tour = register({ id: 'onboarding', steps: [{ id: 'a', target: 'first' }] })

    expect(tour.deleteStory('onboarding')).toBe(true)
    expect(tour.start('onboarding')).toBe(false)
    expect(tour.state).toBe('idle')
  })

  test('deleteStory says whether there was one to take back', () => {
    const tour = register({ id: 'onboarding', steps: [{ id: 'a', target: 'first' }] })

    expect(tour.deleteStory('nothing-here')).toBe(false)
    expect(tour.deleteStory('onboarding')).toBe(true)
    expect(tour.deleteStory('onboarding')).toBe(false)
  })

  test('taking back the story that is running ends the tour, and reports it', () => {
    const { tour, seen } = watched({ id: 'story', steps: [{ id: 'a', target: 'first' }] })
    tour.start('story')
    seen.length = 0

    tour.deleteStory('story')

    // The application has said this story no longer exists. Going on showing it
    // would point the user at steps nobody stands behind any more.
    expect(tour.state).toBe('idle')
    expect(tour.story).toBeUndefined()
    expect(seen).toEqual([[undefined, 'a']])
    expect(drawing().torn).toBe(1)
  })

  test('taking back a story the tour is not on leaves it alone', () => {
    const tour = register({ id: 'running', steps: [{ id: 'a', target: 'first' }] })
    tour.setStory({ id: 'other', steps: [{ id: 'b', target: 'second' }] })
    tour.start('running')

    expect(tour.deleteStory('other')).toBe(true)

    expect(tour.state).toBe('running')
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

    tour.nextStep()
    expect(tour.index).toBe(1)
    tour.nextStep()
    tour.nextStep()
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

  test('interrupting a draw does not mark the next step as already settled', async () => {
    const tour = register({
      id: 'story',
      steps: [
        { id: 'a', target: 'first' },
        { id: 'b', target: 'second' },
      ],
    })
    drawing().slow = true

    tour.start('story')
    tour.nextStep() // while the first step is still on its way
    await Promise.resolve()

    // The interrupted one settles too, and used to hand 'running' to a step that
    // had not arrived yet.
    expect(tour.state).toBe('transitioning')
  })

  test('a handler that holds a lost target leaves the tour running', () => {
    const tour = register(
      {
        id: 'story',
        steps: [
          { id: 'a', target: 'first' },
          { id: 'b', target: 'second' },
        ],
      },
      { onTargetLost: () => {} },
    )
    tour.start('story')
    drawing().page.delete('second')
    tour.nextStep()

    // Registering a handler is taking the tour over, and the machine goes on
    // holding it exactly where it was.
    expect(tour.state).toBe('running')
    expect(tour.step?.id).toBe('b')
  })

  test('a target lost while its step was still being built leaves it running too', async () => {
    const { promise, settle } = held()
    const tour = register(
      {
        id: 'story',
        steps: [
          { id: 'a', target: 'first' },
          { id: 'b', target: 'second', onEnter: () => promise },
        ],
      },
      { onTargetLost: () => {} },
    )
    tour.start('story')
    tour.nextStep()
    // Waiting on `onEnter`, which is what `transitioning` says here.
    expect(tour.state).toBe('transitioning')

    drawing().page.delete('second')
    settle()
    await promise

    // The anchor is resolved after `onEnter` settles, so this is the one route
    // to a lost target that arrives with the machine already saying
    // `transitioning`. Nothing is settling any more and nothing is going to,
    // and a tour reading `transitioning` for ever is a tour whose host cannot
    // tell a slow step from a stuck one.
    expect(tour.state).toBe('running')
    expect(tour.step?.id).toBe('b')
  })

  test('a step still arriving says transitioning, whatever its handlers answered', () => {
    const seen: string[] = []
    const tour = register({
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
    tour.start('story')
    tour.nextStep()

    // Both are calls into the application, made with `b` not built, not
    // measured and never drawn. Only a handler that returned a promise used to
    // put the machine in `transitioning`, so a tour whose handlers answered on
    // the spot said `running` about a step the presenter had never been given.
    expect(seen).toEqual(['onLeave:transitioning:b', 'onEnter:transitioning:b'])
    expect(tour.state).toBe('running')
  })

  test('a story still arriving says transitioning while its own onEnter runs', () => {
    const seen: string[] = []
    const tour = register({
      id: 'story',
      steps: [{ id: 'a', target: 'first' }],
      onEnter: () => {
        seen.push(tour.state)
      },
    })
    tour.start('story')

    expect(seen).toEqual(['transitioning'])
    expect(tour.state).toBe('running')
  })

  test('the index says how far into the story the step sits, and is empty while idle', () => {
    const tour = register({
      id: 'story',
      steps: [
        { id: 'a', target: 'first' },
        { id: 'b', target: 'second' },
      ],
    })

    expect(tour.index).toBeUndefined()
    tour.start('story')
    expect(tour.index).toBe(0)
    tour.nextStep()
    expect(tour.index).toBe(1)
    tour.prevStep()
    expect(tour.index).toBe(0)
    tour.stop()
    expect(tour.index).toBeUndefined()
  })
})

describe('saying where the tour got to', () => {
  // `onStep` on the story and on the instance. The largest group in the file,
  // because `previous` was got wrong twice and each fix arrived with the run
  // that produced it.

  test('a story reports where it went, and what it came from', () => {
    const { tour, seen } = watched({
      id: 'story',
      steps: [
        { id: 'a', target: 'first' },
        { id: 'b', target: 'second', awaits: 'saved' },
      ],
    })

    tour.start('story')
    tour.nextStep()
    tour.reached('saved')

    expect(seen).toEqual([
      ['a', undefined], // nothing came before the first step of a run
      ['b', 'a'],
      [undefined, 'b'], // past the last step there is nowhere to be
    ])
  })

  test('the instance has finished moving by the time it says so', () => {
    const seen: (string | undefined)[] = []
    const story: Story = {
      id: 'story',
      steps: [
        { id: 'a', target: 'first' },
        { id: 'b', target: 'second' },
      ],
      // Reading the instance from inside the hook is how a host writes a progress
      // readout. Firing before the move landed would report the step just left.
      onStep: () => seen.push(tour.step?.id),
    }
    const tour = register(story)

    tour.start('story')
    tour.nextStep()

    expect(seen).toEqual(['a', 'b'])
  })

  test('going back reports too, because the hook says where the story is', () => {
    const { tour, seen } = watched({
      id: 'story',
      steps: [
        { id: 'a', target: 'first' },
        { id: 'b', target: 'second' },
      ],
    })

    tour.start('story')
    tour.nextStep()
    seen.length = 0
    tour.prevStep()

    expect(seen).toEqual([['a', 'b']])
  })

  test('stopping reports the ending once, however many times it is called', () => {
    const { tour, seen } = watched({ id: 'story', steps: [{ id: 'a', target: 'first' }] })

    tour.start('story')
    seen.length = 0
    tour.stop()
    tour.stop()

    expect(seen).toEqual([[undefined, 'a']])
  })

  test('a step that fails validation reports nothing, because nothing moved', () => {
    const { tour, seen } = watched({
      id: 'story',
      steps: [
        { id: 'a', target: 'first', validate: () => false },
        { id: 'b', target: 'second' },
      ],
    })

    tour.start('story')
    seen.length = 0
    tour.nextStep()

    expect(seen).toEqual([])
  })

  test('the story hook and the instance hook both fire, story first', () => {
    const order: string[] = []
    const told: (string | undefined)[] = []

    const tour = register(
      {
        id: 'story',
        steps: [
          { id: 'a', target: 'first' },
          { id: 'b', target: 'second' },
        ],
        onStep: () => order.push('story'),
      },
      {
        onStep: (_step, _previous, story) => {
          order.push('instance')
          // Told which story, because this one hears all of them.
          told.push(story.id)
        },
      },
    )

    tour.start('story')
    tour.nextStep()

    expect(order).toEqual(['story', 'instance', 'story', 'instance'])
    expect(told).toEqual(['story', 'story'])
  })

  test('the instance hook hears every story, and each story hears only itself', () => {
    const heard: string[] = []

    const tour = register(
      { id: 'from', steps: [{ id: 'a', target: 'first' }], onStep: () => heard.push('from-hook') },
      { onStep: (_step, _previous, story) => heard.push(`instance:${story.id}`) },
    )
    tour.setStory({ id: 'into', steps: [{ id: 'b', target: 'second' }] })

    tour.start('from')
    tour.start('into')

    expect(heard).toEqual([
      'from-hook',
      'instance:from', // started
      'from-hook',
      'instance:from', // ended, because starting another stops this one
      'instance:into', // the new story registered no hook of its own
    ])
  })

  test('the move is reported once the step has arrived, not when the position changed', async () => {
    const { promise, settle } = held()
    const { tour, seen } = watched({
      id: 'story',
      steps: [
        { id: 'a', target: 'first' },
        { id: 'b', target: 'second', onEnter: () => promise },
      ],
    })

    tour.start('story')
    seen.length = 0
    tour.nextStep()

    // A progress readout that heard about `b` here would be naming a step the
    // user cannot see yet.
    expect(seen).toEqual([])

    settle()
    await promise

    expect(seen).toEqual([['b', 'a']])
  })

  test('a run stopped before it draws says it came from nowhere', async () => {
    const { promise, settle } = held()
    const { tour, seen } = watched({
      id: 'story',
      steps: [{ id: 'a', target: 'late', onEnter: () => promise }],
    })

    tour.start('story')
    tour.stop()
    settle()
    await promise

    // The arrival at `a` was never announced, because `a` was never drawn. An
    // ending naming it would tell a readout the tour left a step it was never
    // told the tour reached.
    expect(seen).toEqual([[undefined, undefined]])
  })

  test('a run stopped while the story is still setting up says the same', async () => {
    const { promise, settle } = held()
    const { tour, seen } = watched({
      id: 'story',
      onEnter: () => promise,
      steps: [{ id: 'a', target: 'late' }],
    })

    tour.start('story')
    tour.stop()
    settle()
    await promise

    // A story's own setup runs before anything about its first step does, so this
    // is the widest the window gets.
    expect(seen).toEqual([[undefined, undefined]])
  })

  test('a story displaced before it drew leaves from nowhere as well', async () => {
    const { promise, settle } = held()
    const { tour, seen } = watched({
      id: 'from',
      steps: [{ id: 'a', target: 'first', onEnter: () => promise }],
    })
    tour.setStory({ id: 'into', steps: [{ id: 'b', target: 'second' }] })

    tour.start('from')
    tour.start('into')
    settle()
    await promise

    expect(seen).toEqual([[undefined, undefined]])
    expect(tour.step?.id).toBe('b')
  })

  test('an ending names the step showing, not the one the tour was walking into', async () => {
    const { promise, settle } = held()
    const { tour, seen } = watched({
      id: 'story',
      steps: [
        { id: 'a', target: 'first' },
        { id: 'b', target: 'second', onEnter: () => promise },
      ],
    })

    tour.start('story')
    tour.nextStep()
    seen.length = 0
    tour.stop()
    settle()
    await promise

    // The tour was on `b` by every internal measure and a readout was still
    // showing `a`, which is the one the ending is about.
    expect(seen).toEqual([[undefined, 'a']])
  })
})

describe('a target that is not there', () => {
  // Two tests, both of a tour that finds the target missing the moment it looks.
  //
  // Neither crosses this with a handler in flight, and that is the gap worth
  // naming: a step whose `onEnter` returned a promise has already put the
  // machine into `transitioning` by the time the anchor is resolved. #42
  // covered that crossing from the readout group, which asks what `state` reads
  // afterwards. Nothing here asks what the tour does about the target itself.

  test('a story whose target is already gone reports its ending, and no start', () => {
    const { tour, seen } = watched({ id: 'story', steps: [{ id: 'ghost', target: '#not-here' }] })

    tour.start('story')

    // `show` found nothing and stopped the run, which reported the ending. A
    // start announced after that would leave a readout pointing at a story that
    // is not running — the frozen footer again, one call later. `ghost` is not
    // named on the way out either: it was never drawn, so it was never announced.
    expect(seen).toEqual([[undefined, undefined]])
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

    tour.start('story')
    seen.length = 0
    tour.nextStep()

    // The ending leaves from `a`, which is the step a readout is still showing.
    // `gone` was never drawn and so was never announced, and naming it would be
    // the first a host had heard of it.
    expect(seen).toEqual([[undefined, 'a']])
  })
})

describe('what a step assumes', () => {
  // `onEnter` and `onLeave` on a step, and what the machine does to a call that
  // arrives while one of them is still running.

  test('a step waiting on its onEnter is not advanced past, and the call is not saved', async () => {
    const { promise, settle } = held()
    const { tour, seen } = watched({
      id: 'story',
      steps: [
        { id: 'a', target: 'first' },
        { id: 'b', target: 'second', onEnter: () => promise },
        { id: 'c', target: 'first' },
      ],
    })

    tour.start('story')
    tour.nextStep()
    expect(tour.state).toBe('transitioning')

    // `b` has built nothing and has never been on screen, so there is nothing
    // here to advance away from.
    tour.nextStep()
    tour.nextStep()

    settle()
    await promise

    // Dropped rather than queued: settling lands on `b`, and `c` is still ahead.
    expect(tour.step?.id).toBe('b')
    expect(seen).toEqual([
      ['a', undefined],
      ['b', 'a'],
    ])
  })

  test('a signal reported from inside onEnter is dropped, promise or no promise', () => {
    const { tour, seen } = watched({
      id: 'story',
      steps: [
        { id: 'a', target: 'first' },
        {
          id: 'b',
          target: 'second',
          awaits: 'order-saved',
          // Nothing here waits, and nothing here is ready either: the tour is
          // inside the handler, and `b` has never been on screen.
          onEnter: () => {
            tour.reached('order-saved')
          },
        },
        { id: 'c', target: 'first' },
      ],
    })

    tour.start('story')
    tour.nextStep()

    // The same call from inside an `async` handler was dropped and this one
    // advanced, so which step a signal moved depended on how the handler above
    // it happened to be written. `b` arrives and `c` is still ahead.
    expect(tour.step?.id).toBe('b')
    expect(seen).toEqual([
      ['a', undefined],
      ['b', 'a'],
    ])
  })

  test('going back out of a step in flight leaves the tour able to advance', async () => {
    const { promise, settle } = held()
    const tour = register({
      id: 'story',
      steps: [
        { id: 'a', target: 'first' },
        { id: 'b', target: 'second', onEnter: () => promise },
      ],
    })

    tour.start('story')
    tour.nextStep()
    expect(tour.state).toBe('transitioning')
    tour.prevStep()

    // `b`'s handler finds the counter has moved and returns, which is right, and
    // the flag saying a step is still being built is one of the things it does not
    // get to. Leaving it standing left a tour that looked fine on `a` and dropped
    // every call from there on.
    expect(tour.step?.id).toBe('a')
    tour.nextStep()
    expect(tour.step?.id).toBe('b')

    settle()
    await promise
    expect(tour.state).toBe('running')
  })

  test('onLeave says where the tour is going, and says nothing where it is ending', () => {
    const left: [string, string | undefined][] = []
    const onLeave = (step: Step, next: Step | undefined) => left.push([step.id, next?.id])
    const tour = start([
      { id: 'a', target: 'first', onLeave },
      { id: 'b', target: 'second', onLeave },
    ])

    tour.nextStep()
    expect(left).toEqual([['a', 'b']])

    tour.nextStep() // past the last step, so there is nowhere to be going
    expect(left).toEqual([
      ['a', 'b'],
      ['b', undefined],
    ])
  })

  test('going back enters the step again, because it assumes the same state as before', () => {
    const entered: string[] = []
    const left: [string, string | undefined][] = []
    const steps: Step[] = [
      { id: 'a', target: 'first' },
      { id: 'b', target: 'second' },
    ].map((step) => ({
      ...step,
      onEnter: (s: Step) => void entered.push(s.id),
      onLeave: (s: Step, next: Step | undefined) => left.push([s.id, next?.id]),
    }))
    const tour = start(steps)

    tour.nextStep()
    tour.prevStep()

    expect(entered).toEqual(['a', 'b', 'a'])
    // `next` is where the tour is going, which going back is as much as anything.
    expect(left).toEqual([
      ['a', 'b'],
      ['b', 'a'],
    ])
  })

  test('an onEnter that fails stops the tour, and does not swallow the reason', async () => {
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
        onEnter: () => Promise.reject(boom),
        onLeave: (_step, next) => left.push(next?.id),
      },
    ])

    tour.nextStep()
    await Promise.resolve()
    await Promise.resolve()

    expect(tour.state).toBe('idle')
    // The half-built step is still cleaned up: the handler may have registered
    // something before the part that failed.
    expect(left).toEqual([undefined])
    expect(escaped).toHaveLength(1)
    expect(() => escaped[0]!()).toThrow(boom)
  })

  test('a step abandoned while its onEnter is in flight is still left properly', async () => {
    const { promise, settle } = held()
    const left: [string, string | undefined][] = []
    const tour = start([
      { id: 'a', target: 'first' },
      {
        id: 'b',
        target: 'second',
        awaits: 'moved-on',
        onEnter: () => promise,
        onLeave: (step, next) => left.push([step.id, next?.id]),
      },
      { id: 'c', target: 'first' },
    ])

    tour.nextStep()
    tour.stop() // the tour is dropped while `b` is still entering
    settle()
    await promise
    await Promise.resolve()

    expect(left).toEqual([['b', undefined]])
    // The handler settling afterwards does not draw a step the tour has left.
    expect(tour.step).toBeUndefined()
    expect(tour.state).toBe('idle')
  })
})

describe('what a story assumes', () => {
  // The same pair one layer out. A story's `onEnter` holds up every step it has,
  // which is the difference that made `preparing` an enum rather than a boolean.

  test('a story builds what it assumes before its first step builds what it assumes', () => {
    const order: string[] = []
    const tour = register({
      id: 'story',
      onEnter: () => void order.push('story'),
      steps: [{ id: 'a', target: 'first', onEnter: () => void order.push('step') }],
    })

    tour.start('story')

    // Outermost first. A story's setup that ran after the step's would be setting
    // up a world the step has already been built against.
    expect(order).toEqual(['story', 'step'])
    expect(tour.state).toBe('running')
  })

  test('a story waiting on its onEnter does not let a step advance underneath it', async () => {
    const { promise, settle } = held()
    const entered: string[] = []
    const tour = register({
      id: 'story',
      onEnter: () => promise,
      steps: [
        { id: 'a', target: 'late', awaits: 'saved', onEnter: () => void entered.push('a') },
        { id: 'b', target: 'late', onEnter: () => void entered.push('b') },
      ],
    })

    tour.start('story')
    tour.nextStep()
    tour.reached('saved')

    expect(tour.state).toBe('transitioning')
    expect(entered).toEqual([])

    onThePage('late')
    settle()
    await promise

    // What the story assumes was built first, and the tour is on the step that
    // was waiting for it rather than one past it.
    expect(entered).toEqual(['a'])
    expect(tour.step?.id).toBe('a')
    expect(tour.state).toBe('running')
  })

  test('a story is left after its step is, and told nothing where the tour is over', () => {
    const order: string[] = []
    const leaving: (string | undefined)[] = []
    const tour = register({
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

    tour.start('story')
    tour.stop()

    // Innermost first, the mirror of the order they were entered in.
    expect(order).toEqual(['step', 'story'])
    expect(leaving).toEqual([undefined])
  })

  test('running past the last step leaves the story too', () => {
    const leaving: (string | undefined)[] = []
    const tour = register({
      id: 'story',
      onLeave: (_story, next) => void leaving.push(next?.id),
      steps: [{ id: 'only', target: 'first' }],
    })

    tour.start('story')
    tour.nextStep()

    expect(leaving).toEqual([undefined])
    expect(tour.state).toBe('idle')
  })

  test('a story onEnter that fails stops the tour, and is still left properly', async () => {
    const boom = new Error('the fixtures would not load')
    const escaped: (() => void)[] = []
    vi.spyOn(globalThis, 'queueMicrotask').mockImplementation((fn) => void escaped.push(fn))

    const left: (string | undefined)[] = []
    const entered: string[] = []
    const tour = register({
      id: 'story',
      onEnter: () => Promise.reject(boom),
      onLeave: (_story, next) => void left.push(next?.id),
      steps: [{ id: 'a', target: 'first', onEnter: () => void entered.push('step') }],
    })

    tour.start('story')
    await Promise.resolve()
    await Promise.resolve()

    expect(tour.state).toBe('idle')
    // The step was never entered, so nothing of it needs undoing; the story's own
    // half-built state does.
    expect(entered).toEqual([])
    expect(left).toEqual([undefined])
    expect(escaped).toHaveLength(1)
    expect(() => escaped[0]!()).toThrow(boom)
  })

  test('a story stopped while its onEnter is in flight is still left properly', async () => {
    const { promise, settle } = held()
    const left: (string | undefined)[] = []
    const entered: string[] = []
    const tour = register({
      id: 'story',
      onEnter: () => promise,
      onLeave: (_story, next) => void left.push(next?.id),
      steps: [{ id: 'a', target: 'never', onEnter: () => void entered.push('step') }],
    })

    tour.start('story')
    tour.stop()
    settle()
    await promise
    await Promise.resolve()

    expect(left).toEqual([undefined])
    // The handler settling afterwards does not enter a story the tour has left.
    expect(entered).toEqual([])
    expect(tour.state).toBe('idle')
  })

  test('a story waiting on its onEnter does not let a step be gone back to either', async () => {
    const { promise, settle } = held()
    const entered: string[] = []
    const tour = register({
      id: 'story',
      onEnter: () => promise,
      steps: [
        { id: 'a', target: 'first', onEnter: () => void entered.push('a') },
        { id: 'b', target: 'second', onEnter: () => void entered.push('b') },
      ],
    })

    tour.start('story', 1)
    tour.prevStep()

    // Walking out of a step in flight is a step's own business. Every step of
    // this story is waiting on the same handler, so `a` is no readier than `b`.
    expect(tour.index).toBe(1)
    expect(tour.state).toBe('transitioning')
    expect(drawing().shown).toEqual([])
    expect(entered).toEqual([])

    settle()
    await promise

    expect(tour.step?.id).toBe('b')
    expect(drawing().shown).toEqual(['b'])
  })

  test('going back works again once the story has settled', async () => {
    const { promise, settle } = held()
    const tour = register({
      id: 'story',
      onEnter: () => promise,
      steps: [
        { id: 'a', target: 'first' },
        { id: 'b', target: 'second' },
      ],
    })

    tour.start('story', 1)
    settle()
    await promise

    tour.prevStep()

    // The guard is about the handler being in flight and nothing else.
    expect(tour.step?.id).toBe('a')
    expect(drawing().shown).toEqual(['b', 'a'])
  })
})

describe('moving from one story to another', () => {
  // One story displacing another, including the case where the application does
  // the displacing from inside a handler the machine is in the middle of calling.

  test('switching stories ends one and starts the other, and each hears only itself', () => {
    const from: [string | undefined, string | undefined][] = []
    const into: [string | undefined, string | undefined][] = []

    const tour = register({
      id: 'from',
      steps: [{ id: 'a', target: 'first' }],
      onStep: (step, previous) => from.push([step?.id, previous?.id]),
    })
    tour.setStory({
      id: 'into',
      steps: [{ id: 'b', target: 'second' }],
      onStep: (step, previous) => into.push([step?.id, previous?.id]),
    })

    tour.start('from')
    tour.start('into')

    expect(from).toEqual([
      ['a', undefined],
      [undefined, 'a'], // told that it ended, rather than left half-finished
    ])
    // `previous` does not chain across: within the new story nothing came first.
    expect(into).toEqual([['b', undefined]])
  })

  test('starting another story ends this one, and says so with nowhere to go', () => {
    const left: [string, string | undefined][] = []
    const tour = register({
      id: 'from',
      steps: [
        {
          id: 'a',
          target: 'first',
          onLeave: (step, next) => left.push([step.id, next?.id]),
        },
      ],
    })
    tour.setStory({ id: 'into', steps: [{ id: 'b', target: 'second' }] })

    tour.start('from')
    tour.start('into')

    // The step it lands on belongs to a story this one knows nothing about, and
    // this story is over either way.
    expect(left).toEqual([['a', undefined]])
  })

  test('a story started from inside an ending report is not overwritten by the start that caused it', () => {
    const heard: string[] = []
    const tour = register(
      {
        id: 'from',
        steps: [{ id: 'a', target: 'first' }],
        // Reacting to the ending by sending the user somewhere else, which is an
        // ordinary thing for a host to do.
        onStep: (step) => {
          if (step === undefined) tour.start('rescue')
        },
      },
      { onStep: (step, _previous, story) => heard.push(`${story.id}:${step?.id}`) },
    )
    tour.setStory({ id: 'rescue', steps: [{ id: 'b', target: 'second' }] })
    tour.setStory({ id: 'into', steps: [{ id: 'c', target: 'third' }] })

    tour.start('from')
    heard.length = 0
    tour.start('into')

    // `into` gives way. Carrying on would have overwritten `rescue`, and that
    // story would have ended without ever saying so.
    expect(tour.story?.id).toBe('rescue')
    expect(tour.step?.id).toBe('b')
    expect(heard).toEqual(['rescue:b', 'from:undefined'])
  })

  test('a story started from inside a step onLeave still leaves the story that was ending', () => {
    const left: string[] = []
    const tour = register({
      id: 'from',
      onLeave: (story, next) => left.push(`${story.id}->${next?.id ?? 'end'}`),
      steps: [{ id: 'a', target: 'first', onLeave: () => tour.start('rescue') }],
    })
    tour.setStory({
      id: 'rescue',
      onLeave: (story, next) => left.push(`${story.id}->${next?.id ?? 'end'}`),
      steps: [{ id: 'b', target: 'second' }],
    })

    tour.start('from')
    tour.stop()

    // `rescue` is on screen and owes an `onLeave` later. Firing it here would
    // tell a story that just began that its tour is over, and would leave `from`
    // without the one it is owed.
    expect(left).toEqual(['from->end'])
    expect(tour.story?.id).toBe('rescue')

    tour.stop()

    expect(left).toEqual(['from->end', 'rescue->end'])
  })

  test('a story whose onEnter starts another story synchronously does not enter over it', () => {
    const log: string[] = []
    const tour = register({
      id: 'gate',
      // A check that sends the user somewhere else, answered in the same turn
      // because the answer was known already.
      onEnter: () => {
        tour.start('elsewhere')
      },
      steps: [{ id: 'a', target: 'first' }],
    })
    tour.setStory({
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

    tour.start('gate')

    expect(tour.story?.id).toBe('elsewhere')
    expect(tour.step?.id).toBe('b')
    // `gate` carrying on would leave and re-enter a step nobody moved off.
    expect(log).toEqual(['enter b'])
  })

  test('a story displaced by another is told which one is starting', () => {
    const leaving: (string | undefined)[] = []
    const tour = machine()
    tour.setStory({
      id: 'shared',
      onLeave: (_story, next) => void leaving.push(next?.id),
      steps: [{ id: 'a', target: 'first' }],
    })
    tour.setStory({ id: 'branch', steps: [{ id: 'b', target: 'second' }] })

    tour.start('shared')
    tour.start('branch')

    // The teardown a branch and the story it rejoins both need is teardown this
    // argument lets a handler skip.
    expect(leaving).toEqual(['branch'])
    expect(tour.story?.id).toBe('branch')
  })
})
