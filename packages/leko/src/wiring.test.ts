import { expect, test, vi } from 'vitest'

import {
  absorbed,
  box,
  centre,
  closer,
  held,
  pair,
  register,
  scrim,
  start,
  watched,
} from './harness.js'
import type { LekoProblem, LekoState, LekoStep } from './types.js'

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

test('a target that never turns up stops the tour instead of pointing at nothing', async () => {
  const problems: LekoProblem[] = []
  const leko = register(
    { id: 'story', steps: [{ id: 'ghost', target: '#not-here' }] },
    { onDiagnostic: (problem) => problems.push(problem) },
  )

  leko.start('story')

  // Given time to appear first, under a curtain, because a step whose target
  // renders a moment after its onEnter settled is the same situation.
  expect(scrim()).not.toBeNull()
  expect(leko.state).toBe('transitioning')

  await vi.waitUntil(() => leko.state === 'idle', { timeout: 5000 })

  expect(scrim()).toBeNull()
  expect(problems).toEqual([
    { kind: 'target-lost', step: expect.objectContaining({ id: 'ghost' }), storyId: 'story' },
  ])
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

test('a target replaced by an identical one is found again, and nothing ends', async () => {
  const target = box('target', { left: '100px', top: '100px', width: '120px', height: '40px' })
  target.id = 'anchor'
  const { leko, seen } = watched({ id: 'story', steps: [{ id: 'doomed', target: '#anchor' }] })

  leko.start('story')
  seen.length = 0

  // What a framework does when it renders over the step: the old node is
  // disconnected and an identical one takes its place, both in the same batch
  // of mutations. Ending the tour here would be punishing an application for
  // working normally.
  target.remove()
  const fresh = box('target', { left: '100px', top: '100px', width: '120px', height: '40px' })
  fresh.id = 'anchor'

  // Long enough for the loss to be noticed and answered. The replacement is
  // already on the page by then, so it is resolved on the spot: no curtain, and
  // the two-second deadline never starts.
  await new Promise((r) => setTimeout(r, 50))

  expect(centre(fresh)).toBe(fresh)
  expect(leko.state).toBe('running')
  expect(leko.step?.id).toBe('doomed')
  // The machine was never told anything happened, so nothing was reported.
  expect(seen).toEqual([])
})

test('a watcher hears the crossings onStep never mentions', async () => {
  const target = box('target', { left: '100px', top: '100px', width: '120px', height: '40px' })
  target.id = 'anchor'
  const { leko, seen } = watched({ id: 'story', steps: [{ id: 'only', target: '#anchor' }] })
  const states: LekoState[] = []
  const stop = leko.watch((state) => states.push(state))

  leko.start('story')
  await vi.waitUntil(() => states.at(-1) === 'running', { timeout: 2000 })

  // One crossing for the whole arrival. The first draw has nothing to morph
  // from, so it is cut rather than animated, and a watcher is told the answer
  // the turn ended on rather than everything it passed through.
  expect(states).toEqual(['running'])
  expect(seen).toEqual([['only', undefined]])

  target.remove()
  await vi.waitUntil(() => states.at(-1) === 'transitioning', { timeout: 1000 })

  const fresh = box('target', { left: '100px', top: '100px', width: '120px', height: '40px' })
  fresh.id = 'anchor'
  await vi.waitUntil(() => states.at(-1) === 'running', { timeout: 3000 })

  // Two more crossings, and the tour never moved. Nothing in `onStep` could
  // have told a host any of this, which is the whole reason for `watch`.
  expect(states).toEqual(['running', 'transitioning', 'running'])
  expect(seen).toEqual([['only', undefined]])

  stop()
  leko.stop()
  await new Promise((r) => setTimeout(r, 0))

  expect(states).toEqual(['running', 'transitioning', 'running'])
  expect(leko.state).toBe('idle')
})

test('a tour stopped while a curtain is owed does not draw itself back', async () => {
  const target = box('target', { left: '100px', top: '100px', width: '120px', height: '40px' })
  target.id = 'anchor'
  const leko = register({ id: 'story', steps: [{ id: 'only', target: '#anchor' }] })

  leko.start('story')
  target.remove()
  await vi.waitUntil(() => leko.state === 'transitioning', { timeout: 1000 })

  const fresh = box('target', { left: '100px', top: '100px', width: '120px', height: '40px' })
  fresh.id = 'anchor'
  await vi.waitUntil(() => leko.state === 'running', { timeout: 3000 })

  // The target is back and the step is waiting out the rest of the curtain's
  // minimum before it is drawn again. A `stop()` inside that window used to
  // leave the timer running, and the tour rebuilt itself on a page that had
  // nothing left to take it away.
  leko.stop()
  await new Promise((r) => setTimeout(r, 600))

  expect(document.querySelectorAll('[class^=leko-]').length).toBe(0)
  expect(leko.state).toBe('idle')
})

test('a target that comes back late is picked up by the search', async () => {
  const target = box('target', { left: '100px', top: '100px', width: '120px', height: '40px' })
  target.id = 'anchor'
  const { leko, seen } = watched({ id: 'story', steps: [{ id: 'doomed', target: '#anchor' }] })

  leko.start('story')
  seen.length = 0

  target.remove()
  await new Promise((r) => setTimeout(r, 100))

  // Nothing to resolve when the loss was noticed, so this one is a search. The
  // curtain is up rather than a hole standing over the gap the target left, and
  // the tour reads as being between things while it waits.
  expect(scrim()).not.toBeNull()
  expect(leko.state).toBe('transitioning')
  expect(leko.step?.id).toBe('doomed')

  const fresh = box('target', { left: '100px', top: '100px', width: '120px', height: '40px' })
  fresh.id = 'anchor'

  // A later batch, which is what the search's own observer is armed for.
  await vi.waitUntil(() => centre(fresh) === fresh, { timeout: 2000 })

  expect(leko.state).toBe('running')
  expect(seen).toEqual([])
})

test('moving on to a target that has gone waits, then reports the ending', async () => {
  const [first, second] = pair()
  const { leko, seen } = watched({
    id: 'story',
    steps: [
      { id: 'a', target: first },
      { id: 'b', target: second },
    ],
  })

  leko.start('story')
  second.remove()
  seen.length = 0
  leko.nextStep()

  // `b` is where the tour is, under a curtain, while its target is given time
  // to turn up.
  expect(seen).toEqual([['b', 'a']])
  expect(leko.state).toBe('transitioning')

  await vi.waitUntil(() => leko.state === 'idle', { timeout: 5000 })

  expect(seen).toEqual([
    ['b', 'a'],
    [undefined, 'b'],
  ])
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

test('a resize stands back while a step is being built, and lands once it is drawn', async () => {
  const [first, second] = pair()
  const { promise, settle } = held()
  const leko = register({
    id: 'story',
    steps: [
      { id: 'a', target: first },
      { id: 'b', target: second, onEnter: () => promise },
    ],
  })

  leko.start('story')
  leko.nextStep()
  second.style.top = '500px'
  window.dispatchEvent(new Event('resize'))

  // Nothing of `b` has been measured yet, and measuring it here would be
  // reading its anchor early by another route. The hole is still `a`'s.
  expect(centre(first)).toBe(first)

  settle()
  await promise
  second.style.top = '600px'
  window.dispatchEvent(new Event('resize'))

  expect(centre(second)).toBe(second)
})

test('a story started from inside onLeave is refused, and the step that was arriving lands', () => {
  const [first, second] = pair()
  const third = box('third', { left: '100px', top: '500px', width: '120px', height: '40px' })
  const started: boolean[] = []
  const leko = register({
    id: 'story',
    steps: [
      {
        id: 'a',
        target: first,
        onLeave: () => void started.push(leko.start('elsewhere')),
      },
      { id: 'b', target: second },
    ],
  })
  leko.setStory({ id: 'elsewhere', steps: [{ id: 'c', target: third }] })

  leko.start('story')
  leko.nextStep()

  // Leaving is a call into the application, and a story started from inside one
  // would be drawn over by the step this move was already on its way to.
  expect(started).toEqual([false])
  expect(leko.step?.id).toBe('b')
  expect(centre(second)).toBe(second)
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

test('a story waiting on its onEnter does not let a step be moved past either', async () => {
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

  leko.start('story')
  leko.nextStep()

  // Every step of this story is waiting on the same handler, so there is no
  // step here to move away from.
  expect(leko.index).toBe(0)
  expect(leko.state).toBe('transitioning')
  expect(scrim()).toBeNull()
  expect(entered).toEqual([])

  settle()
  await promise

  expect(leko.step?.id).toBe('a')
  expect(centre(first)).toBe(first)
})

test('moving on works again once the story has settled', async () => {
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

  leko.start('story')
  settle()
  await promise
  leko.nextStep()

  expect(leko.step?.id).toBe('b')
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

test('a diagnostic reaches the host, with the step the signal was for', async () => {
  const [first, second] = pair()
  const { promise, settle } = held()
  const problems: LekoProblem[] = []
  const step: LekoStep = { id: 'b', target: second, awaits: 'saved', onEnter: () => promise }
  const leko = register(
    { id: 'story', steps: [{ id: 'a', target: first }, step] },
    { onDiagnostic: (problem) => problems.push(problem) },
  )

  leko.start('story')
  leko.nextStep()
  leko.reached('saved')

  expect(problems).toEqual([{ kind: 'signal-dropped', name: 'saved', step }])
  settle()
  await promise
  expect(leko.step?.id).toBe('b')
})

// The way out of the tour. The scrim blocks the page with rectangles, so a host
// that never thought about an escape hatch has built a trap, and these are
// about the trap not being what you get by default.

test('a tour draws a way out of itself, and using it ends the tour', () => {
  const target = box('target', { left: '100px', top: '300px', width: '120px', height: '40px' })
  const leko = register({ id: 'story', steps: [{ id: 'one', target }] })

  expect(closer()).toBeNull()
  leko.start('story')

  const control = closer()!.querySelector('button')!
  expect(control.textContent).toBe('End tour')
  control.click()

  expect(leko.state).toBe('idle')
  expect(scrim()).toBeNull()
  expect(closer()).toBeNull()
  expect(centre(target)).toBe(target)
})

test('the way out is there while a step is still being built', async () => {
  const [first, second] = pair()
  const { promise, settle } = held()
  const leko = register({
    id: 'story',
    steps: [
      { id: 'a', target: first },
      { id: 'b', target: second, onEnter: () => promise },
    ],
  })

  leko.start('story')
  leko.nextStep()

  // The message went with the step that is over, and the page is still dimmed
  // and still blocked. This is the moment somebody most wants out.
  expect(leko.state).toBe('transitioning')
  expect(closer()).not.toBeNull()

  settle()
  await promise
  expect(closer()).not.toBeNull()
})

test('the way out gives up the corner a cutout wants', () => {
  const corner = box('corner', {
    right: '20px',
    top: '20px',
    left: 'auto',
    width: '160px',
    height: '48px',
  })
  const leko = register({ id: 'story', steps: [{ id: 'one', target: corner }] })

  leko.start('story')

  // A target in the top right is an account menu, which is exactly what sits
  // there on a real page. Leaving the control on top of it would take back the
  // interaction the cutout exists to allow.
  expect(centre(corner)).toBe(corner)
  const at = closer()!.getBoundingClientRect()
  expect(at.left).toBeLessThan(window.innerWidth / 2)
})

test('renderClose fills a root Leko positions, and its teardown runs at the end', () => {
  // The only thing a host may change about the way out other than its words.
  // There is no option that draws none: a corner Leko chose and a host filled
  // is the arrangement where neither half can leave a blocked page with no way
  // off it.
  const target = box('target', { left: '100px', top: '300px', width: '120px', height: '40px' })
  const undone: string[] = []
  const leko = register(
    { id: 'story', steps: [{ id: 'one', target }] },
    {
      renderClose: (root, stop) => {
        const own = document.createElement('button')
        own.className = 'my-skip'
        own.textContent = 'Skip'
        own.addEventListener('click', stop)
        root.append(own)
        return () => undone.push('unmounted')
      },
    },
  )

  leko.start('story')

  const own = closer()!.querySelector<HTMLElement>('.my-skip')!
  expect(closer()!.querySelector('.leko-close-control')).toBeNull()
  // Leko put the box somewhere. What is in it was never Leko's business.
  expect(closer()!.getBoundingClientRect().width).toBe(own.getBoundingClientRect().width)

  own.click()

  expect(leko.state).toBe('idle')
  expect(undone).toEqual(['unmounted'])
})

// The curtain. An arrival is a window where Leko acts on nothing a host calls,
// and the page used to look exactly as it had a moment before: the hole still
// on the step the tour had left, and everything outside it still clickable.

test('an arrival that lasts draws a curtain, and the page goes under it', async () => {
  const [first, second] = pair()
  const { promise, settle } = held()
  const leko = register({
    id: 'story',
    steps: [
      { id: 'a', target: first },
      { id: 'b', target: second, curtain: true, onEnter: () => promise },
    ],
  })

  leko.start('story')
  expect(centre(first)).toBe(first)

  leko.nextStep()

  // `curtain: true` is a step saying it already knows it is slow, so there is
  // no delay to wait out. Nothing is reachable now, including the step the tour
  // has left.
  expect(absorbed(first)).toBe(true)
  expect(absorbed(second)).toBe(true)
  expect(scrim()).not.toBeNull()

  settle()
  await vi.waitUntil(() => centre(second) === second)
  expect(absorbed(first)).toBe(true)
})

test('the curtain leaves the way out reachable', () => {
  const [first, second] = pair()
  const { promise } = held()
  const leko = register({
    id: 'story',
    steps: [
      { id: 'a', target: first },
      { id: 'b', target: second, curtain: true, onEnter: () => promise },
    ],
  })

  leko.start('story')
  leko.nextStep()

  const control = closer()!.querySelector('button')!
  expect(centre(control)).toBe(control)
  control.click()

  expect(leko.state).toBe('idle')
  expect(scrim()).toBeNull()
})

test('a story setting its own scene draws a curtain over a page with no scrim yet', async () => {
  const target = box('target', { left: '100px', top: '100px', width: '120px', height: '40px' })
  const { promise, settle } = held()
  const leko = register({
    id: 'story',
    curtain: true,
    onEnter: () => promise,
    steps: [{ id: 'one', target }],
  })

  expect(scrim()).toBeNull()
  leko.start('story')

  // `start()` on a story with a slow onEnter used to draw nothing at all, so
  // somebody pressed Start, watched nothing happen, and pressed it again.
  expect(scrim()).not.toBeNull()
  expect(absorbed(target)).toBe(true)

  settle()
  await vi.waitUntil(() => centre(target) === target)
})

/** What the curtain is saying, or `null` while it says nothing. */
const said = () => document.querySelector<HTMLElement>('.leko-message-text')?.textContent ?? null

test('a curtain says what a host gave it to say, and docks', () => {
  const [first, second] = pair()
  const { promise } = held()
  const leko = register(
    {
      id: 'story',
      steps: [
        { id: 'a', target: first },
        { id: 'b', target: second, curtain: true, onEnter: () => promise },
      ],
    },
    { curtainLabel: 'Fetching the receipt' },
  )

  leko.start('story')
  leko.nextStep()

  expect(said()).toBe('Fetching the receipt')
  // There is no hole to sit beside, so it goes where a message goes when it
  // cannot be anchored at all.
  const at = document.querySelector<HTMLElement>('.leko-message-text')!.getBoundingClientRect()
  expect(at.top).toBeGreaterThan(window.innerHeight / 2)
})

test('the step arriving says what its own wait is, over anything more general', () => {
  const [first, second] = pair()
  const { promise } = held()
  const leko = register(
    {
      id: 'story',
      curtainLabel: 'Setting the step up…',
      steps: [
        { id: 'a', target: first },
        {
          id: 'b',
          target: second,
          curtain: true,
          curtainLabel: 'Searching every order in the account',
          onEnter: () => promise,
        },
      ],
    },
    { curtainLabel: 'Working…' },
  )

  leko.start('story')
  leko.nextStep()

  // Step, then story, then instance. The step is where the handler being waited
  // for is written, so it is the one that knows what the wait is about.
  expect(said()).toBe('Searching every order in the account')
})

test("a story's own arrival wears the story's words, having no step to ask", async () => {
  const target = box('target', { left: '100px', top: '100px', width: '120px', height: '40px' })
  const { promise, settle } = held()
  const leko = register(
    {
      id: 'story',
      curtain: true,
      curtainLabel: 'Opening the demo account',
      onEnter: () => promise,
      steps: [{ id: 'one', target, curtainLabel: 'Never seen' }],
    },
    { curtainLabel: 'Working…' },
  )

  leko.start('story')

  // `onEnter` on a story runs before any step has been entered, so the first
  // step's words are not about this wait and are not borrowed for it.
  expect(said()).toBe('Opening the demo account')

  settle()
  await vi.waitUntil(() => centre(target) === target)
})

test('a search does not wear the words of the step whose target went missing', async () => {
  const target = box('target', { left: '100px', top: '100px', width: '120px', height: '40px' })
  target.id = 'anchor'
  const leko = register(
    {
      id: 'story',
      steps: [{ id: 'doomed', target: '#anchor', curtainLabel: 'Loading the order' }],
    },
    { curtainLabel: 'Working…' },
  )

  leko.start('story')
  // The step's `onEnter` is long finished: it was drawn, and only then did its
  // target leave. Its words are about a wait that is over, so the curtain the
  // search puts up falls through to the general ones instead.
  target.remove()
  await vi.waitUntil(() => said() === 'Working…', { timeout: 1000 })
})

test('curtain false leaves the window exactly as it was', () => {
  const [first, second] = pair()
  const { promise } = held()
  const leko = register({
    id: 'story',
    steps: [
      { id: 'a', target: first },
      { id: 'b', target: second, curtain: false, onEnter: () => promise },
    ],
  })

  leko.start('story')
  leko.nextStep()

  // The hole is still where the tour was, which is the thing the curtain is
  // there to stop, kept available for a host that wants it.
  expect(centre(first)).toBe(first)
})

test('a curtain that was seen stays for its minimum', async () => {
  const [first, second] = pair()
  const leko = register({
    id: 'story',
    steps: [
      { id: 'a', target: first },
      {
        id: 'b',
        target: second,
        curtain: true,
        // Long enough to be painted, far short of the minimum. Without one this
        // would be a black page for three frames, which reads as a fault.
        onEnter: () => new Promise<void>((settle) => setTimeout(settle, 50)),
      },
    ],
  })

  leko.start('story')
  leko.nextStep()

  await vi.waitUntil(() => absorbed(second), { timeout: 1000 })
  // The handler is long done and the step is still under the curtain.
  await new Promise((r) => setTimeout(r, 150))
  expect(absorbed(second)).toBe(true)

  await vi.waitUntil(() => centre(second) === second, { timeout: 2000 })
})

test('a curtain nobody could have seen owes nothing', async () => {
  const [first, second] = pair()
  const leko = register({
    id: 'story',
    steps: [
      { id: 'a', target: first },
      // Declared slow and answering in the turn, so the curtain is set and
      // replaced inside one task and no frame ever carries it.
      { id: 'b', target: second, curtain: true },
    ],
  })

  leko.start('story')
  leko.nextStep()

  expect(centre(second)).toBe(second)
})
