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
  keep,
  observed,
  pair,
  pause,
  press,
  scrim,
  shown,
  start,
  watched,
} from './harness.js'
import { DomPresenter } from '@annetaan/leko-presenter'
import type { Leko } from './leko.js'
import type { LekoProblem, LekoStep } from '@annetaan/leko-types'

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
    // surface still moved — `DomPresenter.restack` in `@annetaan/leko-presenter`
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
  expect(words.style.bottom).not.toContain('leko-message-dock')
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
// **Two stages, never one: the page glides, and the step is drawn when it
// stops**. Two things redraw without the tour moving, a reason the guard gave
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
  const presenter = new DomPresenter(
    { duration: 0, ...options },
    {
      lost: (step) => void lost.push(step.id),
      next: () => {},
      close: () => {},
    },
  )
  return { presenter, lost }
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
