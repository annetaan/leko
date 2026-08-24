import { expect, test, vi } from 'vitest'

import { absorbed, box, centre, held, pair, register, scrim, start, watched } from './harness.js'

// The public API driven through the real `DomPresenter`, rather than through
// the presenter a test writes. What each of these pins down is which step the
// tour is on and when it says so — the same kind of claim `@annetaan/leko-machine`
// makes against a fake presenter, made again through the wiring that connects
// the two halves.
//
// One browser, not three. These assertions touch the page only enough to show
// the wiring reached it; none of them is about layout an engine could perform
// differently, and `leko.test.ts` is where those live. Running them three times
// bought nothing and cost two thirds of the project's time.

test('a selector matching several elements takes the first', () => {
  const first = box('first', { left: '100px', top: '100px', width: '120px', height: '40px' })
  first.classList.add('pick-me')
  const second = box('second', { left: '100px', top: '300px', width: '120px', height: '40px' })
  second.classList.add('pick-me')

  start([{ id: 'sel', target: '.pick-me' }])

  expect(centre(first)).toBe(first)
  expect(absorbed(second)).toBe(true)
})

test('nextStep does nothing while idle, so callers need no guard', () => {
  const target = box('target', { left: '100px', top: '100px', width: '120px', height: '40px' })
  const leko = register({ id: 'story', steps: [{ id: 'one', target }] })

  expect(() => leko.nextStep()).not.toThrow()
  expect(leko.state).toBe('idle')
  expect(scrim()).toBeNull()
})

test('a step does not advance until the application says it succeeded', () => {
  const first = box('first', { left: '100px', top: '100px', width: '120px', height: '40px' })
  const second = box('second', { left: '100px', top: '300px', width: '120px', height: '40px' })
  let ready = false
  const onValidationError = vi.fn()

  const leko = start([
    { id: 'first', target: first, validate: () => ready, onValidationError },
    { id: 'second', target: second },
  ])

  leko.nextStep()
  expect(leko.step?.id).toBe('first')
  expect(onValidationError).toHaveBeenCalledOnce()
  expect(onValidationError.mock.calls[0]?.[0]).toBe(first)

  ready = true
  leko.nextStep()
  expect(leko.step?.id).toBe('second')
  expect(centre(second)).toBe(second)
})

test('reached does nothing while idle, so it needs no guard either', () => {
  const target = box('target', { left: '100px', top: '100px', width: '120px', height: '40px' })
  const leko = register({ id: 'story', steps: [{ id: 'one', target, awaits: 'ready' }] })

  expect(() => leko.reached('ready')).not.toThrow()
  expect(leko.state).toBe('idle')
  expect(scrim()).toBeNull()
})

test('validate is handed the action target, never a related one', () => {
  const target = box('target', { left: '100px', top: '100px', width: '120px', height: '40px' })
  const related = box('related', { left: '100px', top: '300px', width: '120px', height: '40px' })
  const validate = vi.fn(() => true)

  const leko = start([
    { id: 'a', target: [target], related: [related], validate },
    { id: 'b', target },
  ])
  leko.nextStep()

  expect(validate).toHaveBeenCalledWith(target)
})

test('the last step ends the tour', () => {
  const target = box('target', { left: '100px', top: '100px', width: '120px', height: '40px' })
  const leko = start([{ id: 'only', target }])

  leko.nextStep()

  expect(leko.state).toBe('idle')
  expect(scrim()).toBeNull()
})

test('a target that cannot be found stops the tour instead of pointing at nothing', () => {
  const onTargetLost = vi.fn()
  start([{ id: 'ghost', target: '#not-here' }], { onTargetLost })

  expect(onTargetLost).toHaveBeenCalledOnce()
  // An instance holds every story, so the handler is told which one lost it.
  expect(onTargetLost).toHaveBeenCalledWith(expect.objectContaining({ id: 'ghost' }), 'story')
  expect(scrim()).toBeNull()
})

test('starting a story puts away whatever was running', () => {
  const first = box('first', { left: '100px', top: '100px', width: '120px', height: '40px' })
  const second = box('second', { left: '100px', top: '300px', width: '120px', height: '40px' })

  const leko = register({ id: 'onboarding', steps: [{ id: 'a', target: first }] })
  leko.setStory({ id: 'returning', steps: [{ id: 'b', target: second }] })

  leko.start('onboarding')
  leko.start('returning')

  expect(leko.story?.id).toBe('returning')
  expect(leko.step?.id).toBe('b')
  // One scrim, because two would each block with rectangles cut from their own
  // holes, and so would cover each other's target.
  expect(document.querySelectorAll('.leko-scrim').length).toBe(1)
  expect(centre(second)).toBe(second)
  expect(absorbed(first)).toBe(true)
})

test('an unknown story id shows nothing', () => {
  const target = box('target', { left: '100px', top: '100px', width: '120px', height: '40px' })
  const leko = register({ id: 'onboarding', steps: [{ id: 'a', target }] })

  leko.start('nowhere')

  expect(leko.state).toBe('idle')
  expect(leko.story).toBeUndefined()
  expect(scrim()).toBeNull()
})

test('a target that leaves the page while its step is showing does not go unnoticed', async () => {
  const target = box('target', { left: '100px', top: '100px', width: '120px', height: '40px' })
  const onTargetLost = vi.fn()
  start([{ id: 'doomed', target }], { onTargetLost })

  target.remove()
  // Mutation records are delivered on a microtask.
  await Promise.resolve()

  expect(onTargetLost).toHaveBeenCalledOnce()
  expect(onTargetLost.mock.calls[0]?.[0]?.id).toBe('doomed')
})

test('going back to a target that has gone reports the ending and nothing after it', () => {
  const [first, second] = pair()
  const { leko, seen } = watched({
    id: 'story',
    steps: [
      { id: 'a', target: first },
      { id: 'b', target: second },
    ],
  })

  leko.start('story')
  leko.nextStep()
  first.remove()
  seen.length = 0
  leko.prevStep()

  // `b` is where the tour was and `a` is where it never arrived.
  expect(seen).toEqual([[undefined, 'b']])
})

test('onEnter builds the state the step assumes, before the target is looked for', () => {
  const leko = register({
    id: 'story',
    steps: [
      {
        id: 'late',
        target: '.late',
        onEnter: () => {
          box('late', { left: '100px', top: '100px', width: '120px', height: '40px' }).className =
            'late'
        },
      },
    ],
  })

  leko.start('story')

  // The element did not exist when `start()` was called. Resolving the target
  // first would have lost the step before the application could build it.
  const target = document.querySelector<HTMLElement>('.late')!
  expect(leko.state).toBe('running')
  expect(centre(target)).toBe(target)
})

test('a promise from onEnter is waited for, and nothing is drawn until it settles', async () => {
  const { promise, settle } = held()
  const leko = register({
    id: 'story',
    steps: [{ id: 'late', target: '.late', onEnter: () => promise }],
  })

  leko.start('story')

  expect(leko.state).toBe('transitioning')
  expect(scrim()).toBeNull()

  const target = box('late', { left: '100px', top: '100px', width: '120px', height: '40px' })
  target.className = 'late'
  settle()
  await promise

  expect(leko.state).toBe('running')
  expect(centre(target)).toBe(target)
})

test('going back out of a step in flight leaves a resize placing the cutout', () => {
  const [first, second] = pair()
  const { promise } = held()
  const leko = register({
    id: 'story',
    steps: [
      { id: 'a', target: first },
      { id: 'b', target: second, onEnter: () => promise },
    ],
  })

  leko.start('story')
  leko.nextStep()
  leko.prevStep()
  first.style.top = '500px'
  window.dispatchEvent(new Event('resize'))

  // `place` stands back while a step is being built, because nothing of it has
  // been measured. `a` was measured, and the target it is cut to has moved.
  expect(centre(first)).toBe(first)
})

test('a handler that only logs a lost target is left holding a tour that never stopped', async () => {
  const target = box('target', { left: '100px', top: '100px', width: '120px', height: '40px' })
  const { leko, seen } = watched(
    { id: 'story', steps: [{ id: 'ghost', target }] },
    {
      onTargetLost: () => {},
    },
  )

  leko.start('story')
  target.remove()
  await Promise.resolve()

  // Registering a handler is taking the tour over. Leko goes on holding it
  // where it was, which is what a handler that logs and returns is signing up
  // for without meaning to.
  expect(leko.state).toBe('running')
  expect(leko.step?.id).toBe('ghost')
  expect(seen).toEqual([['ghost', undefined]])
})

test('a story started from inside onLeave is not overwritten by the step that was arriving', () => {
  const [first, second] = pair()
  const third = box('third', { left: '100px', top: '500px', width: '120px', height: '40px' })
  const leko = register({
    id: 'story',
    steps: [
      {
        id: 'a',
        target: first,
        onLeave: () => leko.start('elsewhere'),
      },
      { id: 'b', target: second },
    ],
  })
  leko.setStory({ id: 'elsewhere', steps: [{ id: 'c', target: third }] })

  leko.start('story')
  leko.nextStep()

  // Leaving is a call into the application, and the step that was arriving does
  // not get drawn over the top of what the application did with it.
  expect(leko.story?.id).toBe('elsewhere')
  expect(leko.step?.id).toBe('c')
  expect(centre(third)).toBe(third)
})

test('a promise from a story onEnter holds back the first step entirely', async () => {
  const { promise, settle } = held()
  const entered: string[] = []
  const leko = register({
    id: 'story',
    onEnter: () => promise,
    steps: [{ id: 'late', target: '.late', onEnter: () => void entered.push('step') }],
  })

  leko.start('story')

  // Not just undrawn: the step's own handler has not run either.
  expect(leko.state).toBe('transitioning')
  expect(entered).toEqual([])
  expect(scrim()).toBeNull()

  const target = box('late', { left: '100px', top: '100px', width: '120px', height: '40px' })
  target.className = 'late'
  settle()
  await promise

  expect(entered).toEqual(['step'])
  expect(leko.state).toBe('running')
  expect(centre(target)).toBe(target)
})

test('a story waiting on its onEnter does not let a step be gone back to either', async () => {
  const [first, second] = pair()
  const { promise, settle } = held()
  const entered: string[] = []
  const leko = register({
    id: 'story',
    onEnter: () => promise,
    steps: [
      { id: 'a', target: first, onEnter: () => void entered.push('a') },
      { id: 'b', target: second, onEnter: () => void entered.push('b') },
    ],
  })

  leko.start('story', 1)
  leko.prevStep()

  // Walking out of a step in flight is a step's own business. Every step of
  // this story is waiting on the same handler, so `a` is no readier than `b`.
  expect(leko.index).toBe(1)
  expect(leko.state).toBe('transitioning')
  expect(scrim()).toBeNull()
  expect(entered).toEqual([])

  settle()
  await promise

  expect(leko.step?.id).toBe('b')
  expect(centre(second)).toBe(second)
})

test('going back works again once the story has settled', async () => {
  const [first, second] = pair()
  const { promise, settle } = held()
  const leko = register({
    id: 'story',
    onEnter: () => promise,
    steps: [
      { id: 'a', target: first },
      { id: 'b', target: second },
    ],
  })

  leko.start('story', 1)
  settle()
  await promise
  leko.prevStep()

  expect(leko.step?.id).toBe('a')
  expect(centre(first)).toBe(first)
})

test('meta is carried and never read', () => {
  const [first, second] = pair()
  const { leko } = watched({
    id: 'story',
    steps: [
      { id: 'a', target: first, meta: { chapter: 'setup' } },
      { id: 'b', target: second, meta: { chapter: 'ordering' } },
    ],
  })

  leko.start('story')
  expect(leko.step?.meta).toEqual({ chapter: 'setup' })

  leko.nextStep()

  // A step carrying it behaves exactly as one without: nothing here branches on
  // it, which is the whole promise.
  expect(leko.step?.meta).toEqual({ chapter: 'ordering' })
  expect(leko.state).toBe('running')
  expect(centre(second)).toBe(second)
})

test('re-registering the story that is running leaves the page alone', () => {
  const target = box('target', { left: '100px', top: '100px', width: '120px', height: '40px' })
  const other = box('other', { left: '300px', top: '100px', width: '120px', height: '40px' })
  const leko = register({ id: 'story', steps: [{ id: 'one', target }] })

  leko.start('story')
  const drawn = scrim()

  // What a component re-rendering hands back. The tour is walking through this
  // story, so nothing about it moves.
  expect(leko.setStory({ id: 'story', steps: [{ id: 'one', target: other }] })).toBe(false)

  expect(leko.state).toBe('running')
  expect(scrim()).toBe(drawn)
  expect(centre(target)).toBe(target)
  expect(centre(other)).not.toBe(other)
})
