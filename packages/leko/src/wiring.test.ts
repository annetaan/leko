import { expect, test, vi } from 'vitest'

import {
  absorbed,
  begin,
  box,
  centre,
  closer,
  control,
  frame,
  holding,
  holes,
  pair,
  press,
  scrim,
  start,
  watched,
} from './harness.js'
import { DomPresenter } from './presenter.js'
import type { Leko } from './leko.js'
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

  start([{ id: 'sel', interactive: true, target: '.pick-me' }])

  expect(centre(first)).toBe(first)
  expect(absorbed(second)).toBe(true)
})

test('nothing draws a next control while idle, so there is nothing to press', () => {
  const target = box('target', { left: '100px', top: '100px', width: '120px', height: '40px' })
  const leko = holding({
    id: 'story',
    steps: [{ id: 'one', interactive: true, target: () => target }],
  })

  expect(control()).toBeNull()
  expect(leko.state).toBe('idle')
  expect(scrim()).toBeNull()
})

test('a step does not advance until the application says it succeeded', async () => {
  const first = box('first', { left: '100px', top: '100px', width: '120px', height: '40px' })
  const second = box('second', { left: '100px', top: '300px', width: '120px', height: '40px' })
  let ready = false
  const error = vi.fn((_el: HTMLElement) => 'Not saved yet.')

  const leko = start([
    { id: 'first', interactive: true, target: () => first, validate: () => ready, error },
    { id: 'second', interactive: true, target: () => second },
  ])

  press()
  expect(leko.step?.id).toBe('first')
  // Asked once, for the attempt that failed, and given the action target the
  // guard was given.
  expect(error).toHaveBeenCalledOnce()
  expect(error.mock.calls[0]?.[0]).toBe(first)

  ready = true
  // A frame first: everything reaching the control inside one is the same
  // press, and a second real attempt is further away than that.
  await frame()
  press()
  expect(leko.step?.id).toBe('second')
  expect(centre(second)).toBe(second)
})

test('reached does nothing while idle, so it needs no guard either', () => {
  const target = box('target', { left: '100px', top: '100px', width: '120px', height: '40px' })
  const leko = holding({
    id: 'story',
    steps: [{ id: 'one', interactive: true, target: () => target, awaits: 'ready' }],
  })

  expect(() => leko.reached('ready')).not.toThrow()
  expect(leko.state).toBe('idle')
  expect(scrim()).toBeNull()
})

test('validate is handed the first element of the first region, and no other', () => {
  const target = box('target', { left: '100px', top: '100px', width: '120px', height: '40px' })
  const beside = box('beside', { left: '240px', top: '100px', width: '120px', height: '40px' })
  const later = box('later', { left: '100px', top: '300px', width: '120px', height: '40px' })
  const validate = vi.fn(() => true)

  start([
    { id: 'a', interactive: true, target: [[() => target, () => beside], () => later], validate },
    { id: 'b', interactive: true, target: () => target },
  ])
  press()

  expect(validate).toHaveBeenCalledWith(target)
})

test('the last step ends the tour', () => {
  const target = box('target', { left: '100px', top: '100px', width: '120px', height: '40px' })
  const leko = start([{ id: 'only', interactive: true, target: () => target }])

  press()

  expect(leko.state).toBe('idle')
  expect(scrim()).toBeNull()
})

test('a target that never turns up stops the tour instead of pointing at nothing', async () => {
  const problems: LekoProblem[] = []
  const leko = holding(
    { id: 'story', steps: [{ id: 'ghost', interactive: true, target: '#not-here' }] },
    { onDiagnostic: (problem) => problems.push(problem) },
  )

  begin(leko, 'story')

  // Given time to appear first, under a curtain, because a step whose target
  // renders a moment after its onEnter settled is the same situation.
  expect(scrim()).not.toBeNull()
  expect(leko.state).toBe('transitioning')

  await vi.waitUntil(() => leko.state === 'idle', { timeout: 5000 })

  expect(scrim()).toBeNull()
  expect(problems).toEqual([
    {
      kind: 'target-lost',
      step: expect.objectContaining({ id: 'ghost' }),
      story: expect.objectContaining({ id: 'story' }),
    },
  ])
})

test('stopping and starting puts away whatever was running', () => {
  const first = box('first', { left: '100px', top: '100px', width: '120px', height: '40px' })
  const second = box('second', { left: '100px', top: '300px', width: '120px', height: '40px' })

  const leko = holding({
    id: 'onboarding',
    steps: [{ id: 'a', interactive: true, target: () => first }],
  })

  begin(leko, 'onboarding')
  // Two calls, because `start` never ends a tour. What is on the page after
  // them is what one call used to leave.
  leko.stop()
  leko.start({ id: 'returning', steps: [{ id: 'b', interactive: true, target: () => second }] })

  expect(leko.story?.id).toBe('returning')
  expect(leko.step?.id).toBe('b')
  // One scrim, because two would each block with rectangles cut from their own
  // holes, and so would cover each other's target.
  expect(document.querySelectorAll('.leko-scrim').length).toBe(1)
  expect(centre(second)).toBe(second)
  expect(absorbed(first)).toBe(true)
})

test('a story with no steps in it shows nothing', () => {
  const target = box('target', { left: '100px', top: '100px', width: '120px', height: '40px' })
  const leko = holding({
    id: 'onboarding',
    steps: [{ id: 'a', interactive: true, target: () => target }],
  })

  leko.start({ id: 'nowhere', steps: [] })

  expect(leko.state).toBe('idle')
  expect(leko.story).toBeUndefined()
  expect(scrim()).toBeNull()
})

test('a target replaced by an identical one is found again, and nothing ends', async () => {
  const target = box('target', { left: '100px', top: '100px', width: '120px', height: '40px' })
  target.id = 'anchor'
  const { leko, seen } = watched({
    id: 'story',
    steps: [{ id: 'doomed', interactive: true, target: '#anchor' }],
  })

  begin(leko, 'story')
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
  const { leko, seen } = watched({
    id: 'story',
    steps: [{ id: 'only', interactive: true, target: '#anchor' }],
  })
  const states: LekoState[] = []
  const stop = leko.watch((state) => states.push(state))

  begin(leko, 'story')
  await vi.waitUntil(() => states.at(-1) === 'running', { timeout: 2000 })

  // One crossing for the whole arrival. The first draw has nothing to morph
  // from, so it is cut rather than animated, and a watcher is told the answer
  // the turn ended on rather than everything it passed through.
  expect(states).toEqual(['running'])
  expect(seen).toEqual(['only'])

  target.remove()
  await vi.waitUntil(() => states.at(-1) === 'transitioning', { timeout: 1000 })

  const fresh = box('target', { left: '100px', top: '100px', width: '120px', height: '40px' })
  fresh.id = 'anchor'
  await vi.waitUntil(() => states.at(-1) === 'running', { timeout: 3000 })

  // Two more crossings, and the tour never moved. Nothing in `onStep` could
  // have told a host any of this, which is the whole reason for `watch`.
  expect(states).toEqual(['running', 'transitioning', 'running'])
  expect(seen).toEqual(['only'])

  stop()
  leko.stop()
  await new Promise((r) => setTimeout(r, 0))

  expect(states).toEqual(['running', 'transitioning', 'running'])
  expect(leko.state).toBe('idle')
})

test('a tour stopped while a curtain is owed does not draw itself back', async () => {
  const target = box('target', { left: '100px', top: '100px', width: '120px', height: '40px' })
  target.id = 'anchor'
  const leko = holding({
    id: 'story',
    steps: [{ id: 'only', interactive: true, target: '#anchor' }],
  })

  begin(leko, 'story')
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
  const { leko, seen } = watched({
    id: 'story',
    steps: [{ id: 'doomed', interactive: true, target: '#anchor' }],
  })

  begin(leko, 'story')
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
      { id: 'a', interactive: true, target: () => first },
      { id: 'b', interactive: true, target: () => second },
    ],
  })

  begin(leko, 'story')
  second.remove()
  seen.length = 0
  press()

  // `b` is where the tour is, under a curtain, while its target is given time
  // to turn up. The machine drew it, so it is named. Whether the presenter
  // found an anchor for it is the presenter's problem.
  expect(seen).toEqual(['b'])
  expect(leko.state).toBe('transitioning')

  await vi.waitUntil(() => leko.state === 'idle', { timeout: 5000 })

  expect(seen).toEqual(['b', undefined])
})

test('onEnter builds the state the step assumes, before the target is looked for', () => {
  const leko = holding({
    id: 'story',
    steps: [
      {
        id: 'late',
        interactive: true,
        target: '.late',
        onEnter: () => {
          box('late', { left: '100px', top: '100px', width: '120px', height: '40px' }).className =
            'late'
        },
      },
    ],
  })

  begin(leko, 'story')

  // The element did not exist when `start()` was called. Resolving the target
  // first would have lost the step before the application could build it.
  const target = document.querySelector<HTMLElement>('.late')!
  expect(leko.state).toBe('running')
  expect(centre(target)).toBe(target)
})

test('a step that waits is drawn at once, and the signal it names moves the tour', async () => {
  const [first, second] = pair()
  const { leko, seen } = watched({
    id: 'story',
    steps: [
      // No target, so the whole page goes under. This is where work that has to
      // finish before anything is measured is waited for, and the wait is a
      // step rather than a promise the machine holds.
      { id: 'loading', message: 'Loading…', awaits: 'loaded', onEnter: () => void 0 },
      { id: 'a', interactive: true, target: () => first },
    ],
  })

  begin(leko, 'story')

  // Drawn and still, rather than between things. Every call a host makes now is
  // acted on, which is the whole reason the wait is written this way.
  expect(leko.state).toBe('running')
  expect(holes()).toBe(0)
  expect(absorbed(first)).toBe(true)
  expect(absorbed(second)).toBe(true)
  expect(seen).toEqual(['loading'])

  leko.reached('loaded')
  await frame()

  expect(leko.step?.id).toBe('a')
  expect(centre(first)).toBe(first)
})

test('a resize stands back while a step is being built, and lands once it is drawn', () => {
  const [first, second] = pair()
  const leko = holding({
    id: 'story',
    steps: [
      { id: 'a', interactive: true, target: () => first },
      {
        id: 'b',
        interactive: true,
        target: () => second,
        onEnter: () => {
          second.style.top = '500px'
          window.dispatchEvent(new Event('resize'))
          // Nothing of `b` has been measured yet, and measuring it from in here
          // would be reading its anchor early by another route. The hole is
          // still `a`'s.
          expect(centre(first)).toBe(first)
        },
      },
    ],
  })

  begin(leko, 'story')
  press()

  second.style.top = '600px'
  window.dispatchEvent(new Event('resize'))

  expect(centre(second)).toBe(second)
})

test('a story started from inside onLeave is refused, and the step that was arriving lands', () => {
  const [first, second] = pair()
  const third = box('third', { left: '100px', top: '500px', width: '120px', height: '40px' })
  const problems: LekoProblem[] = []
  const leko = holding(
    {
      id: 'story',
      steps: [
        {
          id: 'a',
          interactive: true,
          target: () => first,
          onLeave: () =>
            void leko.start({
              id: 'elsewhere',
              steps: [{ id: 'c', interactive: true, target: () => third }],
            }),
        },
        { id: 'b', interactive: true, target: () => second },
      ],
    },
    { onDiagnostic: (problem) => problems.push(problem) },
  )

  begin(leko, 'story')
  press()

  // Leaving is a call into the application, and a story started from inside one
  // would be drawn over by the step this move was already on its way to.
  expect(problems.map((problem) => problem.kind)).toEqual(['call-refused'])
  expect(leko.step?.id).toBe('b')
  expect(centre(second)).toBe(second)
})

test('a story builds what it assumes before its first step is looked for', () => {
  const entered: string[] = []
  const leko = holding({
    id: 'story',
    onEnter: () => {
      box('late', { left: '100px', top: '100px', width: '120px', height: '40px' }).className =
        'late'
    },
    steps: [
      { id: 'late', interactive: true, target: '.late', onEnter: () => void entered.push('step') },
    ],
  })

  begin(leko, 'story')

  // Outermost first, and all of it inside the call that started the story. The
  // element did not exist when `start()` was called.
  const target = document.querySelector<HTMLElement>('.late')!
  expect(entered).toEqual(['step'])
  expect(leko.state).toBe('running')
  expect(centre(target)).toBe(target)
})

test('a story being opened does not let a step be moved past', () => {
  const [first, second] = pair()
  const entered: string[] = []
  const leko = holding({
    id: 'story',
    onEnter: () => {
      // No step has been entered, so there is none here to move away from and
      // no control anywhere for this to have reached.
      press()
      expect(entered).toEqual([])
    },
    steps: [
      { id: 'a', interactive: true, target: () => first, onEnter: () => void entered.push('a') },
      { id: 'b', interactive: true, target: () => second, onEnter: () => void entered.push('b') },
    ],
  })

  begin(leko, 'story')

  expect(entered).toEqual(['a'])
  expect(leko.step?.id).toBe('a')
  expect(centre(first)).toBe(first)
})

test('moving on works once the story is open', () => {
  const [first, second] = pair()
  const leko = holding({
    id: 'story',
    onEnter: () => {},
    steps: [
      { id: 'a', interactive: true, target: () => first },
      { id: 'b', interactive: true, target: () => second },
    ],
  })

  begin(leko, 'story')
  press()

  expect(leko.step?.id).toBe('b')
  expect(centre(second)).toBe(second)
})

test("a fresh object under the running story's name is turned down", () => {
  const target = box('target', { left: '100px', top: '100px', width: '120px', height: '40px' })
  const other = box('other', { left: '300px', top: '100px', width: '120px', height: '40px' })
  const leko = holding({
    id: 'story',
    steps: [{ id: 'one', interactive: true, target: () => target }],
  })

  begin(leko, 'story')

  // What a component re-rendering hands back. The `id` is not read and the call
  // does not end anything, so the hole stays where somebody is standing rather
  // than jumping to the steps of the newest render.
  leko.start({ id: 'story', steps: [{ id: 'one', interactive: true, target: () => other }] })

  expect(leko.state).toBe('running')
  expect(centre(target)).toBe(target)
  expect(centre(other)).not.toBe(other)
})

test('a diagnostic reaches the host, with the step the signal was for', () => {
  const [first, second] = pair()
  const problems: LekoProblem[] = []
  let leko!: Leko
  const step: LekoStep = {
    id: 'b',
    interactive: true,
    target: () => second,
    awaits: 'saved',
    // The narrow way left to drop a signal: reported from inside the handler
    // building the step that awaits it, with nothing of that step on screen.
    onEnter: () => leko.reached('saved'),
  }
  leko = holding(
    { id: 'story', steps: [{ id: 'a', interactive: true, target: () => first }, step] },
    { onDiagnostic: (problem) => problems.push(problem) },
  )

  begin(leko, 'story')
  press()

  expect(problems).toEqual([{ kind: 'signal-dropped', name: 'saved', step }])
  expect(leko.step?.id).toBe('b')
})

// The way out of the tour. The scrim blocks the page with rectangles, so a host
// that never thought about an escape hatch has built a trap, and these are
// about the trap not being what you get by default.

test('a tour draws a way out of itself, and using it ends the tour', () => {
  const target = box('target', { left: '100px', top: '300px', width: '120px', height: '40px' })
  const leko = holding({
    id: 'story',
    steps: [{ id: 'one', interactive: true, target: () => target }],
  })

  expect(closer()).toBeNull()
  begin(leko, 'story')

  const out = closer()!.querySelector('button')!
  expect(out.textContent).toBe('End tour')
  out.click()

  expect(leko.state).toBe('idle')
  expect(scrim()).toBeNull()
  expect(closer()).toBeNull()
  expect(centre(target)).toBe(target)
})

test('the way out is there on a step with nothing to point at', () => {
  const [first] = pair()
  const leko = holding({
    id: 'story',
    steps: [
      { id: 'a', interactive: true, target: () => first },
      { id: 'waiting', message: 'Saving…', awaits: 'saved' },
    ],
  })

  begin(leko, 'story')
  press()

  // The page is covered with no hole in it, so nothing on it can be pressed.
  // This is the moment somebody most wants out.
  expect(leko.state).toBe('running')
  expect(holes()).toBe(0)
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
  const leko = holding({
    id: 'story',
    steps: [{ id: 'one', interactive: true, target: () => corner }],
  })

  begin(leko, 'story')

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
  const leko = holding(
    { id: 'story', steps: [{ id: 'one', interactive: true, target: () => target }] },
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

  begin(leko, 'story')

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

// The curtain: the scrim with no hole in it. The one window Leko covers the page
// for on its own is a search, which is a target that is not on the page when its
// step is drawn or has left since. A step that points at nothing reaches the
// same covered page by being drawn, and is not this.

/** What the curtain is saying, or `null` while it says nothing. */
const said = () => document.querySelector<HTMLElement>('.leko-message-text')?.textContent ?? null

test('a target that goes missing puts the page under a curtain', async () => {
  const [first, second] = pair()
  second.id = 'anchor'
  const leko = holding({
    id: 'story',
    steps: [{ id: 'doomed', interactive: true, target: '#anchor' }],
  })

  begin(leko, 'story')
  expect(centre(second)).toBe(second)

  // A hole standing over nothing for two seconds is what this exists to avoid
  // showing anybody, so nothing is reachable while the search runs.
  second.remove()
  await vi.waitUntil(() => holes() === 0, { timeout: 1000 })
  expect(absorbed(first)).toBe(true)
  expect(leko.state).toBe('transitioning')
})

test('the curtain leaves the way out reachable', async () => {
  const target = box('target', { left: '100px', top: '100px', width: '120px', height: '40px' })
  target.id = 'anchor'
  const leko = holding({
    id: 'story',
    steps: [{ id: 'doomed', interactive: true, target: '#anchor' }],
  })

  begin(leko, 'story')
  target.remove()
  await vi.waitUntil(() => holes() === 0, { timeout: 1000 })

  const out = closer()!.querySelector('button')!
  expect(centre(out)).toBe(out)
  out.click()

  expect(leko.state).toBe('idle')
  expect(scrim()).toBeNull()
})

test('a target that is not there yet draws a curtain over a page with no scrim yet', async () => {
  const leko = holding({
    id: 'story',
    steps: [{ id: 'late', interactive: true, target: '.late' }],
  })

  expect(scrim()).toBeNull()
  begin(leko, 'story')

  // `start()` on a story whose first target has not rendered used to draw
  // nothing at all, so somebody pressed Start, watched nothing happen, and
  // pressed it again.
  expect(scrim()).not.toBeNull()
  expect(holes()).toBe(0)

  const target = box('late', { left: '100px', top: '100px', width: '120px', height: '40px' })
  target.className = 'late'
  await vi.waitUntil(() => centre(target) === target, { timeout: 1000 })
})

test('a curtain says what a host gave it to say, and docks', async () => {
  const target = box('target', { left: '100px', top: '100px', width: '120px', height: '40px' })
  target.id = 'anchor'
  const leko = holding(
    { id: 'story', steps: [{ id: 'doomed', interactive: true, target: '#anchor' }] },
    // The instance and nowhere else. Nothing here knows what the application is
    // doing, and neither does the step: it was drawn, and only then did its
    // target leave. A wait the application knows about is a step of its own,
    // and that one says what it is doing in its own `message`.
    { curtainLabel: 'Looking for it' },
  )

  begin(leko, 'story')
  target.remove()
  await vi.waitUntil(() => said() === 'Looking for it', { timeout: 1000 })

  // There is no hole to sit beside, so it goes where a message goes when it
  // cannot be anchored at all.
  const at = document.querySelector<HTMLElement>('.leko-message-text')!.getBoundingClientRect()
  expect(at.top).toBeGreaterThan(window.innerHeight / 2)
})

test('a curtain that was seen stays for its minimum', async () => {
  const target = box('target', { left: '100px', top: '100px', width: '120px', height: '40px' })
  target.id = 'anchor'
  const leko = holding({
    id: 'story',
    steps: [{ id: 'doomed', interactive: true, target: '#anchor' }],
  })

  begin(leko, 'story')
  target.remove()
  await vi.waitUntil(() => holes() === 0, { timeout: 1000 })

  // Painted, and then found again far short of the minimum. Without one this
  // would be a covered page for three frames, which reads as a fault rather
  // than as waiting.
  document.body.append(target)
  await new Promise((r) => setTimeout(r, 150))
  expect(holes()).toBe(0)

  await vi.waitUntil(() => centre(target) === target, { timeout: 2000 })
  expect(leko.state).toBe('running')
})

test('a curtain nobody could have seen owes nothing', async () => {
  const target = box('target', { left: '100px', top: '100px', width: '120px', height: '40px' })
  target.id = 'anchor'
  const leko = holding({
    id: 'story',
    steps: [{ id: 'doomed', interactive: true, target: '#anchor' }],
  })

  begin(leko, 'story')

  // Taken off and put back inside one task, so the curtain the search set is
  // replaced before any frame carries it and there is nothing for a minimum to
  // protect anybody from.
  target.remove()
  document.body.append(target)

  await vi.waitUntil(() => centre(target) === target, { timeout: 500 })
  expect(leko.state).toBe('running')
})

// --- what the presenter reports on its own account
//
// Driven one layer below the rest of this file, because the two waits below are
// the same three letters to a host — `state` says `transitioning` for both — and
// which of them reaches `Host.searching` is the whole claim.

/** A `DomPresenter` with a `Host` that records rather than a machine. */
function watching(options = {}) {
  const reported: [string, boolean][] = []
  const lost: string[] = []
  const presenter = new DomPresenter(
    { duration: 0, ...options },
    {
      lost: (step) => void lost.push(step.id),
      moved: () => {},
      next: () => {},
      close: () => {},
      searching: (step, yes) => void reported.push([step.id, yes]),
    },
  )
  return { presenter, reported, lost }
}

const CONTENT = { text: undefined, error: undefined, next: undefined }

test('a target missing on arrival is a wait the machine hears about through the promise', () => {
  const { presenter, reported } = watching()
  const step: LekoStep = { id: 'late', interactive: true, target: '#not-here-yet' }

  const waiting = presenter.show(step, null, CONTENT, false)

  // Handed back, and the machine reads that as a step still arriving: it writes
  // `settling`, which is the phase `Host.searching` would have written. Saying
  // both put a phase on and took it off again in the same turn.
  expect(typeof (waiting as Promise<void>)?.then).toBe('function')
  expect(reported).toEqual([])

  presenter.teardown()
})

test('a target lost after the step was drawn is the wait nobody asked for', async () => {
  const target = box('target', { left: '100px', top: '100px', width: '120px', height: '40px' })
  target.id = 'anchor'
  const { presenter, reported } = watching()
  const step: LekoStep = { id: 'only', interactive: true, target: '#anchor' }

  presenter.show(step, target, CONTENT, false)
  expect(reported).toEqual([])

  target.remove()
  await vi.waitUntil(() => reported.length > 0, { timeout: 1000 })

  // Nobody is holding a promise for this one, so the call is the only way the
  // machine can see it at all. DESIGN.md argues it under **`state` is derived**.
  expect(reported).toEqual([['only', true]])

  presenter.teardown()
})
