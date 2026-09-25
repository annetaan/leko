import { expect, test, vi } from 'vitest'

import {
  absorbed,
  advance,
  begin,
  box,
  centre,
  clocked,
  closer,
  control,
  drawn,
  frame,
  holding,
  holes,
  instance,
  keep,
  observed,
  pair,
  pause,
  press,
  said,
  scrim,
  shown,
  start,
  until,
  watched,
} from './harness.js'
import { DomPresenter } from '@annetaan/leko-presenter'
import type { Leko } from './leko.js'
import type { LekoProblem, LekoStep, LekoStory } from '@annetaan/leko-types'

// The public API driven through the real `DomPresenter`, in one browser —
// ONBOARDING.md, **Which Vitest project a new test belongs in**. Layout an
// engine could perform differently lives in `leko.test.ts`.

test('a selector matching several elements takes the first', () => {
  const first = box('first', { left: '100px', top: '100px', width: '120px', height: '40px' })
  first.classList.add('pick-me')
  const second = box('second', { left: '100px', top: '300px', width: '120px', height: '40px' })
  second.classList.add('pick-me')

  start([{ id: 'sel', target: { elements: '.pick-me', interactive: true } }])

  expect(centre(first)).toBe(first)
  expect(absorbed(second)).toBe(true)
})

test('nothing draws a next control while idle, so there is nothing to press', () => {
  const target = box('target', { left: '100px', top: '100px', width: '120px', height: '40px' })
  const leko = holding({
    id: 'story',
    steps: [{ id: 'one', target: { elements: () => target, interactive: true } }],
  })

  expect(control()).toBeNull()
  expect(leko.state).toBe('idle')
  expect(scrim()).toBeNull()
})

test('a step does not advance until the application says it succeeded', async () => {
  const first = box('first', { left: '100px', top: '100px', width: '120px', height: '40px' })
  const second = box('second', { left: '100px', top: '300px', width: '120px', height: '40px' })
  let ready = false
  const error = vi.fn((_el: Element) => 'Not saved yet.')

  const leko = start([
    {
      id: 'first',
      target: { elements: () => first, interactive: true },
      validate: () => ready,
      error,
    },
    { id: 'second', target: { elements: () => second, interactive: true } },
  ])

  press()
  expect(leko.step?.id).toBe('first')
  // Asked once, for the attempt that failed, and given the action target the
  // guard was given.
  expect(error).toHaveBeenCalledOnce()
  expect(error.mock.calls[0]?.[0]).toBe(first)

  ready = true
  // A frame first — `harness.ts` says why that is what separates two presses.
  await frame()
  press()
  expect(leko.step?.id).toBe('second')
  expect(centre(second)).toBe(second)
})

test('reached does nothing while idle, so it needs no guard either', () => {
  const target = box('target', { left: '100px', top: '100px', width: '120px', height: '40px' })
  const leko = holding({
    id: 'story',
    steps: [{ id: 'one', target: { elements: () => target, interactive: true }, awaits: 'ready' }],
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
    {
      id: 'a',
      target: [{ elements: [() => target, () => beside], interactive: true }, () => later],
      validate,
    },
    { id: 'b', target: { elements: () => target, interactive: true } },
  ])
  press()

  expect(validate).toHaveBeenCalledWith(target)
})

test('the last step ends the tour', () => {
  const target = box('target', { left: '100px', top: '100px', width: '120px', height: '40px' })
  const leko = start([{ id: 'only', target: { elements: () => target, interactive: true } }])

  press()

  expect(leko.state).toBe('idle')
  expect(scrim()).toBeNull()
})

test('a target that never turns up stops the tour instead of pointing at nothing', async () => {
  const problems: LekoProblem[] = []
  const leko = holding(
    { id: 'story', steps: [{ id: 'ghost', target: { elements: '#not-here', interactive: true } }] },
    { onDiagnostic: (problem) => problems.push(problem) },
  )

  begin(leko, 'story')

  // DESIGN.md, **Nothing is drawn for a retry**. What was on screen a moment
  // ago stays there, and here that is nothing.
  expect(scrim()).toBeNull()
  expect(leko.state).toBe('running')
  expect(leko.step?.id).toBe('ghost')

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
    steps: [{ id: 'a', target: { elements: () => first, interactive: true } }],
  })

  begin(leko, 'onboarding')
  // Two calls, because `start` never ends a tour.
  leko.stop()
  leko.start({
    id: 'returning',
    steps: [{ id: 'b', target: { elements: () => second, interactive: true } }],
  })

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
    steps: [{ id: 'a', target: { elements: () => target, interactive: true } }],
  })

  leko.start({ id: 'nowhere', steps: [] })

  expect(leko.state).toBe('idle')
  expect(leko.story).toBeUndefined()
  expect(scrim()).toBeNull()
})

test('a target replaced after its step was drawn leaves the standing hole where it was', async () => {
  const target = box('target', { left: '100px', top: '100px', width: '120px', height: '40px' })
  target.id = 'anchor'
  const { leko, seen } = watched({
    id: 'story',
    steps: [{ id: 'standing', target: { elements: '#anchor', interactive: true } }],
  })

  begin(leko, 'story')
  seen.length = 0

  // What a framework does when it renders over the step: the old node is
  // disconnected and an identical one takes its place. Nobody notices, and
  // nobody has to — a replacement lands where the node it replaced was, so the
  // hole cut for the old one is still over the new one.
  target.remove()
  const fresh = box('target', { left: '100px', top: '100px', width: '120px', height: '40px' })
  fresh.id = 'anchor'

  // Well past the 100ms a target the step arrived without would have got.
  await pause(300)

  expect(centre(fresh)).toBe(fresh)
  expect(leko.state).toBe('running')
  expect(leko.step?.id).toBe('standing')
  // Nothing was drawn again and the machine was never told anything happened.
  expect(seen).toEqual([])
})

test('a tour stopped while a target is being waited for does not draw itself back', async () => {
  const leko = holding({
    id: 'story',
    steps: [{ id: 'only', target: { elements: '#anchor', interactive: true } }],
  })

  // The story's own first step arrives at a target nothing has rendered, so the
  // hunt and the deadline are both running and nothing is drawn.
  begin(leko, 'story')
  expect(scrim()).toBeNull()

  // Stopped with both of them running. Nothing Leko owns may outlive the tour:
  // a timer that fires or an observer that answers after this would draw the
  // step onto a page with nothing left to take it away again.
  leko.stop()
  const fresh = box('target', { left: '100px', top: '100px', width: '120px', height: '40px' })
  fresh.id = 'anchor'
  await pause(300)

  expect(document.querySelectorAll('[class^=leko-]').length).toBe(0)
  expect(leko.state).toBe('idle')
})

/** The words under the instruction, or `null` where the step is not refusing. */
const reason = () => document.querySelector('.leko-message-error')?.textContent

test('a resize over a refused step keeps the reason on screen', async () => {
  const target = box('target', { left: '100px', top: '100px', width: '160px', height: '48px' })
  target.id = 'anchor'
  const leko = holding({
    id: 'story',
    steps: [
      {
        id: 'one',
        target: { elements: '#anchor', interactive: true },
        message: 'Type your name.',
        validate: () => false,
        error: 'A name, not a number.',
      },
      { id: 'two', target: { elements: '#anchor', interactive: true } },
    ],
  })

  begin(leko, 'story')
  press()

  expect(reason()).toBe('A name, not a number.')

  // A resize is the one thing that redraws while the tour stays where it is.
  // The step is where it was and the reason still applies to it, so the redraw
  // must put it back: the machine holds no copy to ask for, and a refusal that
  // vanished because the window changed size would read as a press that worked.
  window.dispatchEvent(new Event('resize'))
  await frame()

  expect(centre(target)).toBe(target)
  expect(leko.step?.id).toBe('one')
  expect(reason()).toBe('A name, not a number.')
})

test('a target that turns up inside the retry is drawn again', async () => {
  const [first] = pair()
  const { leko, seen } = watched({
    id: 'story',
    steps: [
      { id: 'here', target: { elements: () => first, interactive: true } },
      { id: 'late', target: { elements: '#anchor', interactive: true } },
    ],
  })

  begin(leko, 'story')
  press()
  seen.length = 0

  // The step arrived with nothing to resolve, so it waits. What is standing is
  // the step before it, exactly as it was, and the machine is not told a thing.
  expect(holes()).toBe(1)
  expect(centre(first)).toBe(first)
  expect(leko.state).toBe('running')
  expect(leko.step?.id).toBe('late')

  const late = box('late', { left: '100px', top: '500px', width: '120px', height: '40px' })
  late.id = 'anchor'

  // The batch that put it on the page, which is what the hunt is armed for.
  await vi.waitUntil(() => centre(late) === late, { timeout: 2000 })

  expect(leko.state).toBe('running')
  expect(seen).toEqual([])
})

test('moving on to a target that has gone waits, then reports the ending', async () => {
  const [first, second] = pair()
  const { leko, seen } = watched({
    id: 'story',
    steps: [
      { id: 'a', target: { elements: () => first, interactive: true } },
      { id: 'b', target: { elements: () => second, interactive: true } },
    ],
  })

  begin(leko, 'story')
  second.remove()
  seen.length = 0
  press()

  // `b` is where the tour is while its target is given a moment to turn up. The
  // machine drew it, so it is named. Whether the presenter found an anchor for
  // it is the presenter's problem.
  expect(seen).toEqual(['b'])
  expect(leko.state).toBe('running')

  await vi.waitUntil(() => leko.state === 'idle', { timeout: 5000 })

  expect(seen).toEqual(['b', undefined])
})

test('onEnter builds the state the step assumes, before the target is looked for', () => {
  const leko = holding({
    id: 'story',
    steps: [
      {
        id: 'late',
        target: { elements: '.late', interactive: true },
        onEnter: () => {
          box('late', { left: '100px', top: '100px', width: '120px', height: '40px' }).className =
            'late'
        },
      },
    ],
  })

  begin(leko, 'story')

  // DESIGN.md, **The target is resolved after `onEnter` returns**.
  const target = document.querySelector<HTMLElement>('.late')!
  expect(leko.state).toBe('running')
  expect(centre(target)).toBe(target)
})

test('a step that waits is drawn at once, and the signal it names moves the tour', async () => {
  const [first, second] = pair()
  const { leko, seen } = watched({
    id: 'story',
    steps: [
      // No target, so the whole page goes under — DESIGN.md, **A step that
      // waits**.
      { id: 'loading', message: 'Loading…', awaits: 'loaded', onEnter: () => void 0 },
      { id: 'a', target: { elements: () => first, interactive: true } },
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

test('a resize draws what is on screen, and never a step being built', () => {
  const [first, second] = pair()
  const leko = holding({
    id: 'story',
    steps: [
      { id: 'a', target: { elements: () => first, interactive: true } },
      {
        id: 'b',
        target: { elements: () => second, interactive: true },
        onEnter: () => {
          second.style.top = '500px'
          window.dispatchEvent(new Event('resize'))
          // A resize redraws whatever was last drawn, and that is still `a`:
          // nothing of `b` has been handed over yet. Measuring `b` from in here
          // would be reading its anchor early by another route.
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
          target: { elements: () => first, interactive: true },
          onLeave: () =>
            void leko.start({
              id: 'elsewhere',
              steps: [{ id: 'c', target: { elements: () => third, interactive: true } }],
            }),
        },
        { id: 'b', target: { elements: () => second, interactive: true } },
      ],
    },
    { onDiagnostic: (problem) => problems.push(problem) },
  )

  begin(leko, 'story')
  press()

  // DESIGN.md, **One gate, and what it refuses**.
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
      {
        id: 'late',
        target: { elements: '.late', interactive: true },
        onEnter: () => void entered.push('step'),
      },
    ],
  })

  begin(leko, 'story')

  // DESIGN.md, **Entry runs outermost first, and the ending mirrors it,
  // innermost first**.
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
      {
        id: 'a',
        target: { elements: () => first, interactive: true },
        onEnter: () => void entered.push('a'),
      },
      {
        id: 'b',
        target: { elements: () => second, interactive: true },
        onEnter: () => void entered.push('b'),
      },
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
      { id: 'a', target: { elements: () => first, interactive: true } },
      { id: 'b', target: { elements: () => second, interactive: true } },
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
    steps: [{ id: 'one', target: { elements: () => target, interactive: true } }],
  })

  begin(leko, 'story')

  // What a component re-rendering hands back — DESIGN.md, **Starting a
  // story**.
  leko.start({
    id: 'story',
    steps: [{ id: 'one', target: { elements: () => other, interactive: true } }],
  })

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
    target: { elements: () => second, interactive: true },
    awaits: 'saved',
    // The narrow way left to drop a signal: reported from inside the handler
    // building the step that awaits it, with nothing of that step on screen.
    onEnter: () => leko.reached('saved'),
  }
  leko = holding(
    {
      id: 'story',
      steps: [{ id: 'a', target: { elements: () => first, interactive: true } }, step],
    },
    { onDiagnostic: (problem) => problems.push(problem) },
  )

  begin(leko, 'story')
  press()

  expect(problems).toEqual([{ kind: 'signal-dropped', name: 'saved', step }])
  expect(leko.step?.id).toBe('b')
})

// DESIGN.md, **The way out**. These are about the trap not being what you get
// by default.

test('a tour draws a way out of itself, and using it ends the tour', () => {
  const target = box('target', { left: '100px', top: '300px', width: '120px', height: '40px' })
  const leko = holding({
    id: 'story',
    steps: [{ id: 'one', target: { elements: () => target, interactive: true } }],
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
      { id: 'a', target: { elements: () => first, interactive: true } },
      { id: 'waiting', message: 'Saving…', awaits: 'saved' },
    ],
  })

  begin(leko, 'story')
  press()

  // Nothing on the page can be pressed, which is the moment somebody most
  // wants out.
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
    steps: [{ id: 'one', target: { elements: () => corner, interactive: true } }],
  })

  begin(leko, 'story')

  // DESIGN.md, **Is positioned automatically**. What sits in a page's top right
  // corner is usually the thing a viewer reaches for next.
  expect(centre(corner)).toBe(corner)
  const at = closer()!.getBoundingClientRect()
  expect(at.left).toBeLessThan(window.innerWidth / 2)
})

test('renderClose fills a root Leko positions, and its teardown runs at the end', () => {
  // The only thing a host may change about the way out other than its words —
  // DESIGN.md, **Cannot be disabled**.
  const target = box('target', { left: '100px', top: '300px', width: '120px', height: '40px' })
  const undone: string[] = []
  const leko = holding(
    { id: 'story', steps: [{ id: 'one', target: { elements: () => target, interactive: true } }] },
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

// The retry, and it has one entrance: a step arriving at a target the page does
// not have yet, because the application is still rendering it. DESIGN.md,
// **Nothing is drawn for a retry**. A target that goes after its step was drawn
// is not a retry and not anything, because a drawn step arms nothing.

test('a step arriving at a target that has gone leaves the step before it standing, then ends', async () => {
  const [first, second] = pair()
  second.id = 'anchor'
  const bystander = box('bystander', {
    left: '100px',
    top: '500px',
    width: '120px',
    height: '40px',
  })
  const leko = holding({
    id: 'story',
    steps: [
      { id: 'here', target: { elements: () => first, interactive: true } },
      { id: 'gone', target: { elements: '#anchor', interactive: true } },
    ],
  })

  begin(leko, 'story')
  expect(centre(first)).toBe(first)

  // The step arrives at a target the page no longer has, which is the same
  // situation as one whose target has not been rendered yet.
  second.remove()
  press()

  // The hole of the step before stands where it was until the retry runs out.
  // Everything else is where it was too: the page outside the hole is still
  // blocked, and the way out is still reachable.
  expect(holes()).toBe(1)
  expect(centre(first)).toBe(first)
  expect(absorbed(bystander)).toBe(true)
  const out = closer()!.querySelector('button')!
  expect(centre(out)).toBe(out)

  // And then it runs out. The tour ends the way it always did.
  await vi.waitUntil(() => leko.state === 'idle', { timeout: 2000 })
  expect(scrim()).toBeNull()
})

test('a target hidden or removed after its step was drawn leaves the tour alone', async () => {
  // Hidden where it stands and taken out of the document altogether: the same
  // kind of fact about the page, and a drawn step arms nothing for either.
  // DESIGN.md draws the line under **What Leko does not do**, and this is here so
  // that watching a drawn step cannot come back by accident on either half.
  for (const take of ['hide', 'remove'] as const) {
    const target = box('target', { left: '100px', top: '100px', width: '120px', height: '40px' })
    target.id = 'anchor'
    const { leko, seen } = watched({
      id: 'story',
      steps: [{ id: 'standing', target: { elements: '#anchor', interactive: true } }],
    })

    begin(leko, 'story')
    seen.length = 0

    if (take === 'hide') target.style.display = 'none'
    else target.remove()
    await observed()

    // Well past the 100ms a target that had not turned up yet would have got.
    await pause(300)

    expect(leko.state, take).toBe('running')
    expect(holes(), take).toBe(1)
    expect(seen, take).toEqual([])

    leko.stop()
    target.remove()
  }
})

test('a target given its box back inside the retry is drawn, though no node moved', async () => {
  const problems: LekoProblem[] = []
  const target = box('target', {
    left: '100px',
    top: '100px',
    width: '120px',
    height: '40px',
    display: 'none',
  })
  target.id = 'anchor'
  const leko = holding(
    { id: 'story', steps: [{ id: 'late', target: { elements: '#anchor', interactive: true } }] },
    { onDiagnostic: (problem) => problems.push(problem) },
  )

  begin(leko, 'story')

  // On the page and not rendered, so not found, so the hunt is running and
  // nothing is drawn.
  expect(scrim()).toBeNull()
  expect(leko.state).toBe('running')

  // Given its box back by a style, which is what a framework does a tick after
  // `onEnter` returned. No node moved, so the hunt's observer hears nothing at
  // all — DESIGN.md, **And once more as the grace period runs out**.
  await pause(20)
  target.style.display = ''

  await vi.waitUntil(() => scrim() !== null, { timeout: 2000 })

  expect(leko.state).toBe('running')
  expect(problems).toEqual([])
  expect(centre(target)).toBe(target)
})

test('a guarded step whose target has gone ends on the press, not before it', async () => {
  // Both halves of gone, because this is why DESIGN.md cannot say that a loss
  // past the draw goes unnoticed. Nothing watches a drawn step — and `validate`
  // is the one moment past the draw where the page is asked anything at all.
  for (const take of ['hide', 'remove'] as const) {
    const problems: LekoProblem[] = []
    const target = box('target', { left: '100px', top: '100px', width: '120px', height: '40px' })
    target.id = 'anchor'
    const leko = holding(
      {
        id: 'story',
        steps: [
          {
            id: 'guarded',
            target: { elements: '#anchor', interactive: true },
            message: 'Here.',
            // The guard is handed the element, so it needs one: the parameter is
            // `(el: Element) => boolean` and not nullable.
            validate: () => true,
          },
          { id: 'after', target: { elements: '#anchor', interactive: true } },
        ],
      },
      { onDiagnostic: (problem) => problems.push(problem) },
    )

    begin(leko, 'story')
    await shown()

    // The step stands as it was, whichever way the target went. The press
    // resolves it afresh to find the guard its anchor; neither a hidden element
    // nor one that has left the document is one, and there is nothing to hand a
    // guard that must be handed an element. So the press ends the tour rather
    // than advancing — and it gets no moment to turn up, because a press is not
    // a mid-render instant.
    if (take === 'hide') target.style.display = 'none'
    else target.remove()
    press()

    expect(leko.state, take).toBe('idle')
    expect(problems, take).toEqual([
      {
        kind: 'target-lost',
        step: expect.objectContaining({ id: 'guarded' }),
        story: expect.objectContaining({ id: 'story' }),
      },
    ])

    leko.stop()
    target.remove()
  }
})

test('a resize while the target is hidden or removed takes the standing layers with it', () => {
  // Both halves of gone, and the same answer for each: the step stays drawn for
  // the rest of its length, so this is the whole of what keeps the layers
  // honest while it does.
  for (const take of ['hide', 'remove'] as const) {
    // Absolute rather than the harness default of fixed, so the document
    // carries the layer and its size is the document's rather than the
    // viewport's.
    const target = box('target', {
      position: 'absolute',
      left: '100px',
      top: '100px',
      width: '120px',
      height: '40px',
    })
    target.id = 'anchor'
    const spacer = keep(document.createElement('div'))
    document.body.append(spacer)
    const leko = holding({
      id: 'story',
      steps: [{ id: 'standing', target: { elements: '#anchor', interactive: true } }],
    })

    begin(leko, 'story')
    const layer = scrim()!

    // Nothing reports either and nothing ends it.
    if (take === 'hide') target.style.display = 'none'
    else target.remove()
    spacer.style.height = '4000px'
    window.dispatchEvent(new Event('resize'))

    // There is nothing to restack against and nothing new to cut, but the
    // surface still moved — `DomPresenter.measure` in `@annetaan/leko-presenter`
    // says what a layer left at its old height would leave uncovered.
    expect(leko.state, take).toBe('running')
    expect(layer.getBoundingClientRect().height, take).toBeGreaterThan(3000)
    expect(holes(), take).toBe(1)

    leko.stop()
    target.remove()
    spacer.remove()
  }
})

test('a resize while the target is hidden does not cut the morph short', async () => {
  const target = box('target', {
    position: 'absolute',
    left: '100px',
    top: '100px',
    width: '120px',
    height: '40px',
  })
  target.id = 'anchor'
  const leko = holding(
    {
      id: 'story',
      steps: [
        { id: 'standing', target: { elements: '#anchor', interactive: true }, message: 'Here.' },
      ],
    },
    // A real duration, so there is a morph in flight to interrupt. The rest of
    // this suite runs at 0, where a step is drawn and said in one task.
    { duration: 320 },
  )

  begin(leko, 'story')

  // Nothing has been said yet: the words come back with the hole they belong
  // beside, and the hole is still on its way.
  expect(control()).toBeNull()

  // Hidden inside the morph, which the tour is left alone for, so the step
  // stays drawn — and then a resize, which is the one thing that redraws
  // without the tour moving.
  target.style.display = 'none'
  window.dispatchEvent(new Event('resize'))

  // Whether the morph reached its end is how the presenter tells an arrival
  // from one something interrupted, and only an arrival is said. A resize that
  // halted the morph would leave this step with its hole, no message and no
  // way on for the rest of the step.
  await shown()

  expect(leko.state).toBe('running')
  expect(holes()).toBe(1)
})

test('a target that is not there yet leaves the page alone until it is', async () => {
  const leko = holding({
    id: 'story',
    steps: [{ id: 'late', target: { elements: '.late', interactive: true } }],
  })

  expect(scrim()).toBeNull()
  begin(leko, 'story')

  // Nothing is drawn and nothing is blocked. The window is a few frames long,
  // which is the trade for never showing a covered page over a fault the viewer
  // never saw.
  expect(scrim()).toBeNull()

  const target = box('late', { left: '100px', top: '100px', width: '120px', height: '40px' })
  target.className = 'late'
  await vi.waitUntil(() => centre(target) === target, { timeout: 1000 })

  // A turn later than the hole, because what the machine is holding is the
  // promise the retry handed back and a promise settles in a microtask.
  await vi.waitUntil(() => leko.state === 'running', { timeout: 1000 })
})

// A resize that lands while a retry runs is not acted on then — DESIGN.md,
// **Nothing is drawn for a retry** — and the layers are remade against the
// surface the step is finally drawn onto. Without that, the part the page grew
// by is left uncovered until the next resize. The retry has one entrance, so
// there is one test of it.

/** A box in the document rather than against the viewport, so the document layer is the one measured. */
const inFlow = (top: string): Partial<CSSStyleDeclaration> => ({
  position: 'absolute',
  left: '100px',
  top,
  width: '120px',
  height: '40px',
})

/**
 * Grow the page by a screenful or three and say so, the way a window growing
 * would. Answers with an element in the part that grew.
 */
function grown(): HTMLElement {
  const spacer = keep(document.createElement('div'))
  spacer.style.height = '3000px'
  document.body.append(spacer)
  const far = box('far', inFlow('2800px'))
  window.dispatchEvent(new Event('resize'))
  return far
}

/** Whether the tour blocks `el`, looked at with `el` on screen. */
function blockedWhenSeen(el: HTMLElement): boolean {
  window.scrollTo(0, el.offsetTop - 200)
  const blocked = absorbed(el)
  window.scrollTo(0, 0)
  return blocked
}

test('a resize whose task took the target away leaves the words where they were', () => {
  const target = box('target', inFlow('100px'))
  target.id = 'anchor'
  start([{ id: 'one', target: { elements: '#anchor', interactive: true }, message: 'Press it.' }])
  const words = document.querySelector<HTMLElement>('.leko-message')!
  expect(getComputedStyle(words).visibility).toBe('visible')

  // A responsive breakpoint: the application's own resize listener renders
  // over the step and takes the target with it, in the same task as the
  // resize. The step is still drawn — a drawn step arms nothing, so nothing is
  // ever going to report this — and there is nothing to put back.
  target.remove()
  window.dispatchEvent(new Event('resize'))

  // The words stay beside the hole standing over the gap rather than jumping
  // to the foot of the screen with no hole to sit beside. The way out is placed
  // regardless.
  expect(getComputedStyle(words).visibility).toBe('visible')
  // Read off `top`, which is where `Message.dock` writes the custom property:
  // the box docks by pinning its foot to the room's, so `bottom` says `auto`
  // whichever way this went and asking it proves nothing.
  expect(words.style.top).not.toContain('leko-message-dock')
  expect(closer()).not.toBeNull()
})

test('a resize while a target is not there yet is measured when the step is drawn', async () => {
  const first = box('first', inFlow('100px'))
  const leko = holding({
    id: 'story',
    steps: [
      { id: 'a', target: { elements: () => first, interactive: true } },
      { id: 'b', target: { elements: '#late', interactive: true } },
    ],
  })
  begin(leko, 'story')

  // `b` arrives with its target still rendering, and the page grows inside
  // the moment it is given.
  press()
  const far = grown()
  const late = box('late', inFlow('300px'))
  late.id = 'late'
  await vi.waitUntil(() => centre(late) === late, { timeout: 1000 })

  expect(leko.step?.id).toBe('b')
  expect(blockedWhenSeen(far)).toBe(true)
})

// A draw resolves the step's regions once and measures them in as many spaces
// as it needs. The counts below are what "once" means: a resize fires in bursts
// while a window is dragged, and every extra `querySelector` and every extra
// `getBoundingClientRect` in that path is paid once per event.

/** A target function that answers with `el` and counts having been asked. */
const asked = (el: Element) => vi.fn(() => el)

test("a resize asks each of the step's targets once, and reads each box once", () => {
  const [first, second] = pair()
  const later = box('later', { left: '100px', top: '500px', width: '120px', height: '40px' })
  const elements = [first, second, later]
  const targets = elements.map(asked)
  const rects = elements.map((el) => vi.spyOn(el, 'getBoundingClientRect'))
  const laid = elements.map((el) => vi.spyOn(el, 'getClientRects'))

  start([
    {
      id: 'one',
      target: [
        { elements: [targets[0]!, targets[1]!], interactive: true },
        { elements: targets[2]! },
      ],
      message: 'Here.',
    },
  ])

  for (const target of targets) target.mockClear()
  for (const rect of rects) rect.mockClear()
  for (const boxes of laid) boxes.mockClear()
  window.dispatchEvent(new Event('resize'))

  // Once each. Whether an element is the one the step opened, another in its
  // region or one of a region the step only shows makes no difference: the draw
  // asks the page where its targets are, and then it has them.
  for (const target of targets) expect(target).toHaveBeenCalledTimes(1)
  for (const boxes of laid) expect(boxes).toHaveBeenCalledTimes(1)

  // Once each, and no more. Two spaces still want these boxes — the scrim's own
  // coordinates, which is where the holes are cut, and the viewport, which is
  // what decides the side the message has room on — but the two differ by a
  // translation, so the second is arithmetic on the first rather than another
  // question put to the page. These boxes are `position: fixed`, so that
  // translation is nothing at all and no container is measured beside them; the
  // test below is the same count where there is one.
  for (const rect of rects) expect(rect).toHaveBeenCalledTimes(1)
})

test("a resize reads a scroller's own box once for the surface, not once per element", () => {
  const panel = keep(document.createElement('div'))
  Object.assign(panel.style, {
    position: 'fixed',
    left: '40px',
    top: '40px',
    width: '300px',
    height: '200px',
    overflow: 'auto',
    border: '4px solid black',
  })
  const content = document.createElement('div')
  content.style.height = '1200px'
  const inside = (top: number): HTMLElement => {
    const el = document.createElement('button')
    Object.assign(el.style, {
      position: 'absolute',
      left: '20px',
      top: `${top}px`,
      width: '120px',
      height: '40px',
      margin: '0',
    })
    content.append(el)
    return el
  }
  const targets = [inside(20), inside(80), inside(400)].map(asked)
  panel.append(content)
  document.body.append(panel)

  const container = vi.spyOn(panel, 'getBoundingClientRect')

  start([
    {
      id: 'one',
      target: [
        { elements: [targets[0]!, targets[1]!], interactive: true },
        { elements: targets[2]! },
      ],
      message: 'Here.',
    },
  ])

  container.mockClear()
  window.dispatchEvent(new Event('resize'))

  // Twice, whatever is inside it. The scroller is one surface however many of
  // the step's elements ride it, so its box answers where that surface's
  // coordinates begin once for the whole draw — and the layer outside it is cut
  // to the scroller's own shape, which is the other. It used to be four: one
  // for each of the three elements, because each was measured against a
  // container measured again beside it, and the outer layer's on top of those.
  // Counting the elements' own boxes in, this resize reads five where it read
  // ten.
  expect(container).toHaveBeenCalledTimes(2)
})

test('a resize whose target has gone asks for it once', () => {
  const target = box('target', inFlow('100px'))
  let there: Element | null = target
  const asks = vi.fn(() => there)

  start([{ id: 'one', target: { elements: asks, interactive: true }, message: 'Press it.' }])
  const before = drawn()

  // Gone with nothing reporting it, the way a re-render over a drawn step
  // takes one away.
  there = null
  asks.mockClear()
  window.dispatchEvent(new Event('resize'))

  // Once. The resize asks where the step is to decide what it owes, and the
  // decision it reaches — the layers refitted, no holes cut — is handed that
  // answer rather than putting the same question to the page again.
  expect(asks).toHaveBeenCalledTimes(1)
  // The hole standing over the gap stays, and nothing beside it moved or was
  // said again: the page is as tall as it was, so a refit writes back what was
  // already there.
  expect(holes()).toBe(1)
  expect(drawn()).toBe(before)
})

const scroller = (style: Partial<CSSStyleDeclaration>): HTMLElement => {
  const el = document.createElement('div')
  Object.assign(el.style, { overflow: 'auto', margin: '0', ...style })
  return el
}
const tall = (height: string): HTMLElement => {
  const el = document.createElement('div')
  el.style.height = height
  return el
}
const button = (style: Partial<CSSStyleDeclaration>): HTMLElement => {
  const el = document.createElement('button')
  el.textContent = 'target'
  Object.assign(el.style, { margin: '0', ...style })
  return el
}

/**
 * Three scrollers inside one another, the outer two `static` so that the first
 * draw's mounting gives each a `position`. Fractional borders, paddings and
 * positions, so that every number the draw writes has low bits to be wrong in.
 * Two regions and three elements, one of them absolutely positioned with an
 * inset inside a scroller that was static, so that its containing block is a
 * thing the mounting changes.
 */
function nested(): { targets: Element[] } {
  const outer = keep(
    scroller({
      marginLeft: '30.5px',
      marginTop: '20.25px',
      width: '420.5px',
      height: '320.75px',
      border: '2.5px solid black',
      padding: '5.25px',
    }),
  )
  const middle = scroller({
    marginLeft: '10.75px',
    marginTop: '8.5px',
    width: '340.25px',
    height: '240.5px',
    border: '1.5px solid black',
    padding: '3.75px',
  })
  const inner = scroller({
    position: 'relative',
    marginLeft: '6.25px',
    marginTop: '4.75px',
    width: '260.5px',
    height: '160.25px',
    border: '3.5px solid black',
    padding: '7.5px',
  })
  const first = button({
    position: 'absolute',
    left: '20.5px',
    top: '400.25px',
    width: '120.5px',
    height: '40.25px',
  })
  const beside = button({
    position: 'absolute',
    left: '160.75px',
    top: '410.5px',
    width: '60.25px',
    height: '30.75px',
  })
  const later = button({
    position: 'absolute',
    left: '200.25px',
    top: '100.5px',
    width: '80.5px',
    height: '24.25px',
  })
  const innerContent = tall('1400px')
  innerContent.append(first, beside)
  inner.append(innerContent)
  const middleContent = tall('900px')
  middleContent.append(inner, later)
  middle.append(middleContent)
  outer.append(middle, tall('700px'))
  document.body.append(outer)
  inner.scrollTop = 137
  middle.scrollTop = 19
  outer.scrollTop = 7
  return { targets: [first, beside, later] }
}

test('a first draw and the resize after it write the same values', () => {
  const [first, beside, later] = nested().targets

  start([
    {
      id: 'deep',
      target: [{ elements: [() => first!, () => beside!], interactive: true }, () => later!],
      message: 'Here.',
    },
  ])
  const opened = drawn()
  expect(opened).toContain('scrim 3:')

  window.dispatchEvent(new Event('resize'))

  // Nothing on the page moved between the two, so a value that differs is one
  // the draws read in different orders — the first draw against the page as
  // it was before its layers were mounted, the resize against the page after.
  // What this cannot see is a write among the reads, the layers' own writes
  // moving nothing on the page: `every box a draw reads is read before it
  // writes a layer` is the test for that.
  expect(drawn()).toBe(opened)
})

/** The engine's own accessor for `key`, wherever on the chain it is declared. */
function getter(el: Element, key: string): () => unknown {
  for (let proto = Object.getPrototypeOf(el); proto; proto = Object.getPrototypeOf(proto)) {
    const found = Object.getOwnPropertyDescriptor(proto, key)?.get
    if (found) return found
  }
  throw new Error(`no getter for ${key}`)
}

test('every box a draw reads is read before it writes a layer', () => {
  // The order itself, and nothing about what it costs. A read is one of the
  // three questions a draw puts to the page — a target's box, a surface's
  // scrollable size, the visible box of the innermost layer — and a write is
  // the first `style` a layer element receives. The claim is that none of those
  // three comes after a write: DESIGN.md, **A draw mounts its layers, then
  // reads, then writes**. `revealHalos` reads `offsetWidth` after `set` on this
  // path as on every other, deliberately and outside this count — its own doc
  // says why, and #176 left it where it is.
  //
  // The writes are read off a `MutationObserver` rather than spied on a
  // setter, because `style.width = …` reaches no property this engine lets a
  // test wrap. A mutation record is queued synchronously and delivered later,
  // so draining the queue inside each read spy puts the writes that had already
  // happened into the same log, in order.
  const { targets } = nested()
  const scrollers = [...document.querySelectorAll<HTMLElement>('div')].filter(
    (el) => getComputedStyle(el).overflow === 'auto',
  )
  expect(scrollers.length).toBe(3)

  const log: string[] = []
  // Only the layer elements. The `position` a mount writes onto a static
  // scroller is a write the order allows — it is what the reads are waiting
  // for — and the message and the way out are placed after the draw.
  const LAYERS = '.leko-scrim, .leko-blocking, .leko-halos'
  const writes = new MutationObserver(() => {})
  const drain = (): void => {
    for (const record of writes.takeRecords()) {
      const el = record.target as Element
      if (el.matches?.(LAYERS)) log.push(`write ${el.className}`)
    }
  }
  const read = (what: string): void => {
    drain()
    log.push(`read ${what}`)
  }

  start([
    {
      id: 'deep',
      target: [
        { elements: [() => targets[0]!, () => targets[1]!], interactive: true },
        () => targets[2]!,
      ],
      message: 'Here.',
    },
  ])

  writes.observe(document.body, { attributes: true, attributeFilter: ['style'], subtree: true })
  for (const [i, el] of targets.entries()) {
    const rect = el.getBoundingClientRect.bind(el)
    vi.spyOn(el, 'getBoundingClientRect').mockImplementation(() => {
      read(`target ${i}`)
      return rect()
    })
  }
  for (const [i, el] of scrollers.entries()) {
    for (const side of ['scrollWidth', 'scrollHeight', 'clientWidth'] as const) {
      const own = getter(el, side)
      vi.spyOn(el, side, 'get').mockImplementation(() => {
        read(`${side} ${i}`)
        return own.call(el) as number
      })
    }
  }

  // Every surface grows, so that the sizes the draw writes differ from the ones
  // standing: a `style.width` set to the value it already had changes no
  // attribute, and the observer would have nothing to report. Appended rather
  // than resized, so the growth itself writes no `style` for the log.
  for (const el of scrollers) el.append(tall('600px'))

  // A resize rather than the first draw, so the stack is the one standing and
  // every read is about a page nothing of Leko's has touched this task.
  window.dispatchEvent(new Event('resize'))
  drain()

  const reads = log.filter((entry) => entry.startsWith('read'))
  const first = log.findIndex((entry) => entry.startsWith('write'))
  expect(reads.length).toBeGreaterThan(0)
  expect(first).toBeGreaterThan(0)
  // Every read is before the first write, counted rather than described: a
  // read after one would be missing from this slice. Put a layer's sizing back
  // among the reads and this is the assertion that says so.
  expect(log.slice(0, first).length).toBe(reads.length)

  writes.disconnect()
})

test('the opening starts from the box the draw read, not one read after it wrote', () => {
  // A story's first step converges from what the viewer can see of the inner
  // surface — DESIGN.md, **A story opens by converging, from every hole
  // stretched over the whole surface** — and that box is read in the draw's
  // read pass with everything else, then handed to `Scrim.converge`, which
  // writes only. With the clock held, the morph has not painted a frame, so
  // what is on the mask is the opening itself.
  clocked()
  const [first, beside, later] = nested().targets
  const inner = first!.parentElement!.parentElement!

  start(
    [
      {
        id: 'deep',
        target: [{ elements: [() => first!, () => beside!], interactive: true }, () => later!],
        message: 'Here.',
      },
    ],
    { duration: 320 },
  )

  // Two stretched cutouts, one per destination hole, each the size of the
  // scroller's visible box and sitting on its scroll offset.
  const layer = scrim()!
  expect(holes()).toBe(2)
  const positions = layer.style.maskPosition.split(',').slice(1)
  for (const position of positions) {
    const [x, y] = position.trim().split(/\s+/).map(parseFloat)
    expect(x).toBe(inner.scrollLeft)
    expect(y).toBe(inner.scrollTop)
  }
  const svg = decodeURIComponent(layer.style.maskImage)
  expect(svg).toContain(`width="${inner.clientWidth}" height="${inner.clientHeight}"`)
})

test('the words after a morph are placed from the holes read then, not the ones the draw left with', async () => {
  const target = box('target', { left: '100px', top: '100px', width: '120px', height: '40px' })
  const asks = asked(target)
  const leko = holding(
    { id: 'story', steps: [{ id: 'one', target: { elements: asks, interactive: true } }] },
    // A real duration, so the words come back a task later than the draw.
    { duration: 320 },
  )

  begin(leko, 'story')
  asks.mockClear()

  await shown()

  // The morph took the hole somewhere, and where the words go is a fact about
  // where it ended up. So this one is measured again on purpose, and the sharing
  // the counts above are about is between a measurement and the words said in
  // the same task as it.
  expect(asks).toHaveBeenCalled()
})

// --- what a glide leaves standing
//
// A step told to `scroll` is drawn only once the page has stopped — DESIGN.md,
// **The scroll finishes before the step is drawn, never both at once**. Two
// things redraw without the tour moving, a reason the guard gave
// and a resize, and each of them reads a record here. A batch of mutations is
// not a third: a glide arms nothing.
//
// The glide is `duration` long, so "mid-glide" is a look taken on a timer
// somewhere inside that.

/**
 * Two targets far apart on a tall page, so a step that scrolls to the second
 * has a glide long enough to look at while it runs.
 */
function farApart(): [HTMLElement, HTMLElement] {
  const page = keep(document.createElement('div'))
  page.style.height = '4000px'
  document.body.append(page)
  const at = (top: number, id: string): HTMLElement => {
    const el = document.createElement('button')
    el.textContent = id
    el.id = id
    Object.assign(el.style, {
      position: 'absolute',
      left: '100px',
      top: `${top}px`,
      width: '120px',
      height: '40px',
      margin: '0',
    })
    page.append(el)
    return el
  }
  return [at(100, 'near'), at(2600, 'far')]
}

/** A story that walks from the near target to the far one, which scrolls. */
const goingFar = (steps: Partial<LekoStep> = {}) => ({
  id: 'story',
  steps: [
    { id: 'near', target: { elements: '#near', interactive: true } },
    { id: 'far', target: { elements: '#far', interactive: true }, scroll: true, ...steps },
  ],
})

/** Whether the box holding the instruction is on screen. */
const saying = (): boolean => {
  const el = document.querySelector<HTMLElement>('.leko-message')
  return el !== null && getComputedStyle(el).visibility === 'visible'
}

test('a replacement that lands while the page glides draws nothing', async () => {
  const [near, far] = farApart()
  const leko = holding(goingFar(), { duration: 320 })

  begin(leko, 'story')
  await shown()
  press()
  // The scrim's mask is written in the content's own coordinates, so a page
  // gliding under it does not touch this. Anything that moves it is something
  // having been drawn.
  const standing = scrim()!.style.maskPosition

  // A framework rendering over the step the tour has just left, while the page
  // is still travelling to the next one. Watched, the hole would morph back to
  // a step the tour has left, mid-glide, with its message coming after it if
  // the morph got there first.
  await pause(40)
  const fresh = keep(document.createElement('button'))
  fresh.id = 'near'
  Object.assign(fresh.style, {
    position: 'absolute',
    left: '100px',
    top: '700px',
    width: '120px',
    height: '40px',
    margin: '0',
  })
  near.replaceWith(fresh)
  await observed()
  await frame()

  // Nothing moved — DESIGN.md, **Nothing is drawn for the gap** — and nothing
  // was said, which DESIGN.md argues under **Nothing is armed for it either, and
  // a reason waits with the step**.
  expect(scrim()!.style.maskPosition).toBe(standing)
  expect(saying()).toBe(false)

  await vi.waitUntil(() => centre(far) === far, { timeout: 5000 })
  expect(leko.step?.id).toBe('far')

  window.scrollTo(0, 0)
})

test('an easing given on the options is the curve the morph and the glide both follow', async () => {
  // On a clock the test owns, so every frame of both loops is sampled.
  clocked()
  const [near, far] = farApart()

  // A curve that answers "nowhere yet" until the frame each loop writes its
  // own destination on. Nothing about that shape is the claim — it is a shape
  // no host would write — but it is one no Leko curve is, so a page and a hole
  // that hold still are proof the option reached both loops.
  const leko = start(
    [
      { id: 'near', target: { elements: () => near, interactive: true } },
      { id: 'far', target: { elements: () => far, interactive: true }, scroll: true },
    ],
    { duration: 320, easing: () => 0 },
  )
  await until(said, 30, 'the first step never said its words')

  press()
  // The glide is `glideDuration` of some 2300px — about 116 frames — and the
  // morph after it is twenty more; 300 is room.
  const flight: { scrollY: number; mask: string }[] = []
  await until(
    () => {
      flight.push({ scrollY: window.scrollY, mask: scrim()!.style.maskPosition })
      return said()
    },
    300,
    'the far step never said its words',
  )

  // Two offsets and no others: where the page started, and where the last
  // frame put it. The default curve gives a different one nearly every frame,
  // which is what `leko.test.ts` asks for under **a glide draws nothing until
  // the page has stopped**.
  expect(new Set(flight.map((f) => f.scrollY)).size).toBe(2)
  expect(flight[flight.length - 1]!.scrollY).toBeGreaterThan(0)

  // And the morph the same: the mask settles rather than travels. Two changes
  // rather than one because the blend starts from a departure padded to the
  // arrival's length. A morph on the default curve moves it every frame.
  const masks = flight.map((f) => f.mask)
  expect(masks.filter((mask, i) => i > 0 && mask !== masks[i - 1]!).length).toBeLessThanOrEqual(2)

  expect(centre(far)).toBe(far)
  leko.stop()
  window.scrollTo(0, 0)
})

test("a step's easing is the curve the morph and the glide into it both follow", async () => {
  clocked()
  const [near, far] = farApart()

  // The curve of the test above, on the far step alone. The instance names a
  // duration, because the harness would otherwise snap, and no curve.
  const leko = start(
    [
      { id: 'near', target: { elements: () => near, interactive: true } },
      {
        id: 'far',
        target: { elements: () => far, interactive: true },
        scroll: true,
        easing: () => 0,
      },
    ],
    { duration: 320 },
  )
  await until(said, 30, 'the first step never said its words')

  press()
  const flight: { scrollY: number; mask: string }[] = []
  await until(
    () => {
      flight.push({ scrollY: window.scrollY, mask: scrim()!.style.maskPosition })
      return said()
    },
    300,
    'the far step never said its words',
  )

  expect(new Set(flight.map((f) => f.scrollY)).size).toBe(2)
  expect(flight[flight.length - 1]!.scrollY).toBeGreaterThan(0)
  const masks = flight.map((f) => f.mask)
  expect(masks.filter((mask, i) => i > 0 && mask !== masks[i - 1]!).length).toBeLessThanOrEqual(2)

  expect(centre(far)).toBe(far)
  leko.stop()
  window.scrollTo(0, 0)
})

test("a step's duration of 0 snaps where the instance animates", async () => {
  clocked()
  const [first, second] = pair()
  const leko = start(
    [
      { id: 'first', target: { elements: () => first, interactive: true } },
      { id: 'second', target: { elements: () => second, interactive: true }, duration: 0 },
    ],
    { duration: 320 },
  )
  await until(said, 30, 'the first step never said its words')

  press()
  await Promise.resolve()

  // No frame has run, and the step is already up: its message is back, which
  // it is only once the morph has arrived.
  expect(leko.step?.id).toBe('second')
  expect(said()).toBe(true)
  // And the mask is where it ends up: frames from here on move nothing.
  const mask = scrim()!.style.maskPosition
  for (let n = 0; n < 30; n++) await advance()
  expect(scrim()!.style.maskPosition).toBe(mask)
  expect(centre(second)).toBe(second)
})

test("a refused step shakes on Leko's own curve, whatever the host asked for", async () => {
  clocked()
  const target = box('target', { left: '100px', top: '100px', width: '120px', height: '40px' })
  const leko = start(
    [{ id: 'one', target: { elements: () => target, interactive: true }, validate: () => false }],
    // The same curve that holds the morph and the glide still in the test
    // above. A shake that followed it would never leave the settled cutouts,
    // and the mask below would not move at all.
    { duration: 320, easing: () => 0 },
  )
  await until(said, 30, 'the step never said its words')
  const settled = scrim()!.style.maskPosition

  press()
  // `scrim.ts` says why the shake keeps the built-in curve and the built-in
  // length: it is a gesture of refusal rather than an arrival.
  await until(
    () => scrim()!.style.maskPosition !== settled,
    30,
    'the refused step never shook the hole',
  )

  expect(leko.step?.id).toBe('one')
})

test('a reason told while the page glides is drawn when it lands', async () => {
  const [, far] = farApart()
  const leko = holding(
    goingFar({ message: 'Fill it in.', validate: () => false, error: 'not yet' }),
    { duration: 320 },
  )

  begin(leko, 'story')
  await shown()
  press()

  // The control goes with the message for the length of the glide, so a press
  // here is one only a script can make. What it asks for is real all the same:
  // the guard refuses, and the words it gave have to reach the step they are
  // about rather than the step being left.
  await frame()
  press()
  await pause(40)

  expect(saying()).toBe(false)

  await vi.waitUntil(() => reason() === 'not yet', { timeout: 5000 })
  expect(centre(far)).toBe(far)

  window.scrollTo(0, 0)
})

test('a resize while the page glides puts the holes back and says nothing', async () => {
  const [, far] = farApart()
  const leko = holding(goingFar(), { duration: 320 })

  begin(leko, 'story')
  await shown()
  press()

  await pause(40)
  window.dispatchEvent(new Event('resize'))
  await frame()

  // The layers are remade against the surface as it is now and the standing
  // hole is put back in them. The message is not: it belongs to the step being
  // left, and the landing has its own to draw. The way out is placed regardless,
  // for the reason the `resized` case of the presenter's plan gives, in
  // `@annetaan/leko-presenter`.
  expect(holes()).toBe(1)
  expect(saying()).toBe(false)
  const out = closer()!.querySelector('button')!
  expect(centre(out)).toBe(out)

  await vi.waitUntil(() => saying(), { timeout: 5000 })
  expect(centre(far)).toBe(far)
  expect(leko.step?.id).toBe('far')

  window.scrollTo(0, 0)
})

// --- what the presenter reports on its own account
//
// Driven one layer below the rest of this file, because what the machine is
// told about a retry is the whole claim, and a `Leko` in front of it answers
// the same either way.

/** A `DomPresenter` with a `Host` that records rather than a machine. */
function watching(options = {}) {
  const lost: string[] = []
  const navigated: string[] = []
  const presenter = new DomPresenter(
    { duration: 0, ...options },
    {
      lost: (step) => void lost.push(step.id),
      next: () => {},
      close: () => {},
      navigated: (url) => void navigated.push(url),
      unloading: () => {},
    },
  )
  return { presenter, lost, navigated }
}

test('a target missing on arrival hands the machine nothing, and says nothing yet', () => {
  const { presenter, lost } = watching()
  const step: LekoStep = { id: 'late', target: { elements: '#not-here-yet', interactive: true } }

  const nothing = presenter.show(step, null, false)

  // The step is drawn as far as the machine is concerned, and what is on screen
  // is whatever was there a moment ago. Only giving up is worth a call.
  expect(nothing).toBeUndefined()
  expect(lost).toEqual([])

  presenter.teardown()
})

test('a target lost after the step was drawn is not a wait at all', async () => {
  const target = box('target', { left: '100px', top: '100px', width: '120px', height: '40px' })
  target.id = 'anchor'
  const { presenter, lost } = watching()
  const step: LekoStep = { id: 'only', target: { elements: '#anchor', interactive: true } }

  presenter.show(step, target, false)

  target.remove()
  await observed()

  // DESIGN.md, **Every retry belongs to an arrival, so `Host.lost` is only ever
  // about a step that was arriving**, and this step arrived at a target that was
  // there. Three hundred milliseconds is three times the moment an arrival would
  // have got.
  await pause(300)
  expect(lost).toEqual([])

  presenter.teardown()
})

// --- a step that waits for a URL
//
// DESIGN.md, **A URL is a signal the page reports**. Chromium only: every
// engine this suite reaches has the Navigation API, per
// spike/a-same-document-navigation/, so what a fallback engine hears is not a
// claim this file can make.

test('a route pushed while the step shows advances it', () => {
  const target = box('target', { left: '100px', top: '100px', width: '120px', height: '40px' })
  const leko = start([
    { id: 'first', target: () => target, awaits: { url: /^\/checkout(?:[/?#]|$)/ } },
    { id: 'second', target: () => target },
  ])

  history.pushState({}, '', '/checkout')

  expect(leko.step?.id).toBe('second')
})

test('a route pushed while the first step is still retrying for its target advances it', () => {
  // Arming has to survive a step that never reaches `reveal`: this one's
  // target is not there yet, so the presenter goes into `retrying` and hunts
  // for it rather than drawing. Arming on `reveal` left this window deaf —
  // the bug this test is against.
  let late: HTMLElement | null = null
  const leko = start([
    { id: 'first', target: () => late, awaits: { url: /^\/checkout/ } },
    { id: 'second', target: () => document.body },
  ])

  history.pushState({}, '', '/checkout')

  expect(leko.step?.id).toBe('second')
})

test('the pattern sees the query and the hash, so a step may wait for either', () => {
  const target = box('target', { left: '100px', top: '100px', width: '120px', height: '40px' })
  const leko = start([
    { id: 'query', target: () => target, awaits: { url: /[?&]promo=1(?:&|$)/ } },
    { id: 'hash', target: () => target, awaits: { url: /#summary$/ } },
    { id: 'done', target: () => target },
  ])

  history.pushState({}, '', '/?promo=1')
  expect(leko.step?.id).toBe('hash')

  history.pushState({}, '', '/?promo=1#summary')
  expect(leko.step?.id).toBe('done')
})

/** The Navigation API, cast rather than declared global — the same reason `presenter.ts` casts. */
interface NavigationApi {
  addEventListener(type: 'currententrychange', listener: () => void): void
  removeEventListener(type: 'currententrychange', listener: () => void): void
}

test('the listener goes with the tour, so a route pushed after stop moves nothing', () => {
  const target = box('target', { left: '100px', top: '100px', width: '120px', height: '40px' })
  const navigation = (window as unknown as { navigation: NavigationApi }).navigation
  const added = vi.spyOn(navigation, 'addEventListener')
  const removed = vi.spyOn(navigation, 'removeEventListener')
  const leko = start([{ id: 'first', target: () => target, awaits: { url: /^\/checkout/ } }])

  leko.stop()

  // Not just "removed with some function": the one `add` armed, so a mismatched
  // pair — the listener that stayed on is a different one from the one that
  // came off — would not pass this.
  expect(removed).toHaveBeenCalledWith('currententrychange', added.mock.calls[0]![1])

  history.pushState({}, '', '/checkout')
  expect(leko.step).toBeUndefined()
})

test('the fallback popstate and hashchange from one hash change report a URL once', async () => {
  // This suite's Chromium has the Navigation API (`test.skipIf` above), so the
  // fallback branch is forced by hiding it, the way spike/a-same-document-navigation/
  // could not exercise it either. That table is also why this waits before
  // asserting: `location.hash =` fires popstate synchronously and hashchange
  // as a later task, so the duplicate this guards against has not landed by
  // the time the assignment below returns — `frame()` gives it that later
  // task. Asserting right away would pass whether or not the two were
  // deduplicated, having only ever seen the synchronous one.
  const original = Object.getOwnPropertyDescriptor(window, 'navigation')
  Object.defineProperty(window, 'navigation', { value: undefined, configurable: true })
  try {
    const target = box('target', { left: '100px', top: '100px', width: '120px', height: '40px' })
    target.id = 'anchor'
    const { presenter, navigated } = watching()

    presenter.show(
      { id: 'first', target: { elements: '#anchor', interactive: true } },
      target,
      false,
    )
    location.hash = 'summary'
    await frame()

    expect(navigated).toEqual([location.pathname + location.search + '#summary'])

    presenter.teardown()
  } finally {
    location.hash = ''
    if (original) Object.defineProperty(window, 'navigation', original)
  }
})

// --- a story that hands on across a page load
//
// DESIGN.md, **A page load ends the story, and hands it on**. **No test
// here leaves the document.** Every `pagehide` and `pageshow` below is
// `window.dispatchEvent(new PageTransitionEvent(type, { persisted }))`, a
// synthetic event on the same window the presenter armed, so what is held up
// is the wiring from listener to storage to a second instance — that the
// real events fire, in that order, and that the write outlives the document,
// is `spike/a-cross-document-navigation/`'s claim and only its; that a
// restore preserves the document is the specification's, as DESIGN.md says.
// Every boundary test runs the real write path on one instance and the real
// read path on another; nothing seeds storage by hand.

/**
 * The `checkout` story's target, mounted fresh by every {@link leaving} call
 * rather than once here: the harness's `afterEach` removes whatever `box()`
 * put on the page after every test in this file, so an element `box()` made
 * at module scope would be gone long before this group runs.
 */
let checkoutTarget: HTMLElement

/** A story of one step over the target {@link leaving} mounts, the successor `next` hands on to. */
const checkout: LekoStory = {
  id: 'checkout',
  steps: [{ id: 'confirm', target: () => checkoutTarget }],
}

/** A tour standing on a URL-awaiting last step, whose story names {@link checkout} as `next`. */
function leaving(): Leko {
  const target = box('go', { left: '100px', top: '100px', width: '120px', height: '40px' })
  checkoutTarget = box('confirm', { left: '100px', top: '100px', width: '120px', height: '40px' })
  const leko = holding({
    id: 'storefront',
    steps: [{ id: 'go', target: () => target, awaits: { url: /^\/checkout(?:[/?#]|$)/ } }],
    next: checkout,
  })
  begin(leko, 'storefront')
  return leko
}

const hide = (): boolean =>
  window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false }))
const restore = (): boolean =>
  window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
const arriveAt = (url: string): void => void history.replaceState(null, '', url)

test('a pagehide while the tour stands on a URL-awaiting last step keeps the note, and a fresh instance at a matching URL picks the successor up', () => {
  const first = leaving()
  hide()
  // The old document's tour is left standing — DESIGN.md's bullet of that
  // name. `pagehide` ran no teardown. Checked here, before the URL changes:
  // this one window plays both documents, so `first`'s own still-armed
  // listener would otherwise hear the very change `arriveAt` below makes for
  // `second` and advance `first` too, same-document — a same-window artifact
  // a real navigation's document teardown does not let happen.
  expect(first.state).toBe('running')
  expect(first.step?.id).toBe('go')

  arriveAt('/checkout')
  const second = instance()
  second.pickUp([checkout])

  expect(second.story).toBe(checkout)
  expect(second.step?.id).toBe(checkout.steps[0]!.id)
  // Not just the machine's position: the successor's step is actually drawn,
  // with a hole cut for the target it names.
  expect(holes()).toBe(1)
})

test('pickUp naming no story with the kept id reports story-unknown, with that id', () => {
  leaving()
  hide()
  arriveAt('/checkout')

  const problems: LekoProblem[] = []
  const second = instance({ onDiagnostic: (problem) => problems.push(problem) })
  second.pickUp([])

  expect(problems).toEqual([{ kind: 'story-unknown', id: 'checkout' }])
  expect(second.state).toBe('idle')
})

test('a fresh instance at the URL the note was kept at picks nothing up, and the note is gone', () => {
  // The note is kept at a URL that already matches the pattern, so only the
  // `from` check — not the pattern — can be what rules this document out.
  // The tour has not started yet when this runs, so no URL listener is armed
  // to hear it.
  arriveAt('/checkout')
  leaving()
  hide()

  const same = instance()
  same.pickUp([checkout])
  expect(same.state).toBe('idle')

  // The note was consumed by that call regardless of whether it matched, so
  // a later arrival at a URL that would otherwise match finds nothing
  // either. Asserted behaviourally, through a third instance, rather than by
  // reading the key.
  arriveAt('/checkout/confirm')
  const after = instance()
  after.pickUp([checkout])
  expect(after.state).toBe('idle')
})

test('the pagehide listener goes with the tour, so a pagehide after stop keeps nothing', () => {
  const added = vi.spyOn(window, 'addEventListener')
  const removed = vi.spyOn(window, 'removeEventListener')

  const first = leaving()
  first.stop()
  hide()
  arriveAt('/checkout')

  const second = instance()
  second.pickUp([checkout])
  expect(second.state).toBe('idle')

  // The removal pair: not just "removed with some function", but the very
  // one `addEventListener` was given for `'pagehide'` — the `currententrychange`
  // removal test's pattern.
  const armed = added.mock.calls.find(([type]) => type === 'pagehide')
  expect(armed).toBeDefined()
  expect(removed).toHaveBeenCalledWith('pagehide', armed![1])
})

test('a storage that throws leaves the tour as it was', () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('blocked', 'SecurityError')
  })

  const first = leaving()
  expect(() => hide()).not.toThrow()
  expect(first.state).toBe('running')
  expect(first.step?.id).toBe('go')

  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new DOMException('blocked', 'SecurityError')
  })
  arriveAt('/checkout')

  const problems: LekoProblem[] = []
  const second = instance({ onDiagnostic: (problem) => problems.push(problem) })
  expect(() => second.pickUp([checkout])).not.toThrow()
  expect(second.state).toBe('idle')
  expect(problems).toEqual([])
})

test('a restore forgets the note it kept', () => {
  // `pageshow` with `persisted: true` is dispatched by hand: neither the
  // spike nor Playwright produced a real restore in any engine it reached.
  // What this proves is that the armed listener reaches `forget()` and the
  // second instance finds nothing — not that the event happens this way.
  const first = leaving()
  hide()
  restore()
  // Checked here, before the URL changes, for the reason the first test in
  // this group gives: one window plays both documents.
  expect(first.state).toBe('running')

  arriveAt('/checkout')
  const second = instance()
  second.pickUp([checkout])
  expect(second.state).toBe('idle')
})

test('a pageshow after stop does not forget it', () => {
  const first = leaving()
  hide()
  first.stop()
  restore()
  arriveAt('/checkout')

  // The listener went with the tour, so a restore the tour is no longer part
  // of touches nothing it kept.
  const second = instance()
  second.pickUp([checkout])
  expect(second.story).toBe(checkout)
  expect(second.step?.id).toBe(checkout.steps[0]!.id)
  expect(holes()).toBe(1)
})
