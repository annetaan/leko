import { afterEach, expect, test, vi } from 'vitest'

import { createLeko } from './leko.js'
import type { LekoOptions, LekoStep, LekoStory } from './types.js'

// Duration 0 everywhere: these tests are about what ends up on screen, not about
// how long it took to get there.
const instances: ReturnType<typeof createLeko>[] = []
const mounted: HTMLElement[] = []

afterEach(() => {
  for (const leko of instances.splice(0)) leko.stop()
  for (const el of mounted.splice(0)) el.remove()
  vi.restoreAllMocks()
})

/** One story, registered and started, which is what most of these want. */
function start(steps: LekoStep[], options: LekoOptions = {}) {
  const leko = register({ id: 'story', steps }, options)
  leko.start('story')
  return leko
}

function register(story: LekoStory, options: LekoOptions = {}) {
  const leko = createLeko({ duration: 0, ...options })
  instances.push(leko)
  leko.setStory(story)
  return leko
}

function box(text: string, style: Partial<CSSStyleDeclaration>): HTMLElement {
  const el = document.createElement('button')
  el.textContent = text
  Object.assign(el.style, { position: 'fixed', margin: '0', ...style })
  document.body.append(el)
  mounted.push(el)
  return el
}

const centre = (el: HTMLElement) => {
  const r = el.getBoundingClientRect()
  return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
}

const scrim = () => document.querySelector<HTMLElement>('.leko-scrim')

/**
 * Whether the tour absorbed a hit at the centre of `el`, rather than the page
 * underneath receiving it. Asked this way round because the scrim paints and its
 * rectangles catch, so naming one element would be pinning down the mechanism
 * instead of the promise.
 */
const absorbed = (el: HTMLElement): boolean =>
  (centre(el) as HTMLElement | null)?.closest('.leko-scrim') != null

test('the target is reachable through the cutout, and the rest of the page is not', () => {
  const target = box('target', { left: '100px', top: '100px', width: '160px', height: '48px' })
  const other = box('other', { left: '100px', top: '400px', width: '160px', height: '48px' })

  start([{ id: 'one', target }])

  expect(centre(target)).toBe(target)
  expect(absorbed(other)).toBe(true)
})

test('stopping puts the page back', () => {
  const target = box('target', { left: '100px', top: '100px', width: '160px', height: '48px' })
  const leko = start([{ id: 'one', target }])

  expect(scrim()).not.toBeNull()
  leko.stop()

  expect(scrim()).toBeNull()
  expect(leko.state).toBe('idle')
  expect(centre(target)).toBe(target)
})

test('several targets become one cutout, and what sits between them opens up too', () => {
  const left = box('left', { left: '100px', top: '100px', width: '100px', height: '40px' })
  const right = box('right', { left: '260px', top: '100px', width: '100px', height: '40px' })
  const between = box('between', { left: '210px', top: '105px', width: '40px', height: '30px' })

  start([{ id: 'columns', target: [left, right] }])

  expect(centre(left)).toBe(left)
  expect(centre(right)).toBe(right)
  // Documented consequence of a union, not an accident: pass adjacent elements.
  expect(centre(between)).toBe(between)
})

test('related regions get their own cutouts rather than joining the union', () => {
  const target = box('target', { left: '60px', top: '400px', width: '120px', height: '40px' })
  const summary = box('summary', { left: '60px', top: '60px', width: '120px', height: '40px' })
  const between = box('between', { left: '60px', top: '230px', width: '120px', height: '40px' })

  start([{ id: 'linked', target, related: [summary] }])

  expect(centre(target)).toBe(target)
  expect(centre(summary)).toBe(summary)
  // Two holes, not one big one — otherwise everything in between would open.
  expect(absorbed(between)).toBe(true)
})

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

test('a step advances on the signal it declares', () => {
  const first = box('first', { left: '100px', top: '100px', width: '120px', height: '40px' })
  const second = box('second', { left: '100px', top: '300px', width: '120px', height: '40px' })

  const leko = start([
    { id: 'first', target: first, awaits: 'order-saved' },
    { id: 'second', target: second },
  ])

  leko.reached('order-saved')

  expect(leko.step?.id).toBe('second')
})

test('a signal no step is waiting for costs nothing and says nothing', () => {
  const target = box('target', { left: '100px', top: '100px', width: '120px', height: '40px' })
  const validate = vi.fn(() => true)
  const warn = vi.spyOn(console, 'warn')

  const leko = start([
    { id: 'first', target, awaits: 'order-saved', validate },
    { id: 'second', target },
  ])

  leko.reached('something-else')

  // Instrumentation stays in the source permanently, in applications where this
  // tour never runs. An unmatched call is not a mistake, so it is not reported
  // and does not even ask the step whether it would have been satisfied.
  expect(leko.step?.id).toBe('first')
  expect(validate).not.toHaveBeenCalled()
  expect(warn).not.toHaveBeenCalled()
})

test('a step declaring no signal is not advanced by one', () => {
  const target = box('target', { left: '100px', top: '100px', width: '120px', height: '40px' })
  const leko = start([
    { id: 'first', target },
    { id: 'second', target },
  ])

  leko.reached('order-saved')

  expect(leko.step?.id).toBe('first')
})

test('reached does nothing while idle, so it needs no guard either', () => {
  const target = box('target', { left: '100px', top: '100px', width: '120px', height: '40px' })
  const leko = register({ id: 'story', steps: [{ id: 'one', target, awaits: 'ready' }] })

  expect(() => leko.reached('ready')).not.toThrow()
  expect(leko.state).toBe('idle')
  expect(scrim()).toBeNull()
})

test('a signal still has to get past validate', () => {
  const first = box('first', { left: '100px', top: '100px', width: '120px', height: '40px' })
  const second = box('second', { left: '100px', top: '300px', width: '120px', height: '40px' })
  let ready = false
  const onValidationError = vi.fn()

  const leko = start([
    {
      id: 'first',
      target: first,
      awaits: 'order-saved',
      validate: () => ready,
      onValidationError,
    },
    { id: 'second', target: second },
  ])

  leko.reached('order-saved')
  expect(leko.step?.id).toBe('first')
  expect(onValidationError).toHaveBeenCalledOnce()

  ready = true
  leko.reached('order-saved')
  expect(leko.step?.id).toBe('second')
})

test('a signal reported before its step is showing is not saved up', () => {
  const first = box('first', { left: '100px', top: '100px', width: '120px', height: '40px' })
  const second = box('second', { left: '100px', top: '300px', width: '120px', height: '40px' })

  const leko = start([
    { id: 'first', target: first },
    { id: 'second', target: second, awaits: 'order-saved' },
  ])

  // The user did the thing early, before the tour asked for it.
  leko.reached('order-saved')
  leko.nextStep()

  // Arriving at the step does not consume that: a buffered signal would advance
  // a step nobody performed while it was showing.
  expect(leko.step?.id).toBe('second')
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

test('a signal reaches the story that is running, and no other', () => {
  const first = box('first', { left: '100px', top: '100px', width: '120px', height: '40px' })
  const second = box('second', { left: '100px', top: '300px', width: '120px', height: '40px' })

  const leko = register({
    id: 'onboarding',
    steps: [
      { id: 'save', target: first, awaits: 'order-saved' },
      { id: 'done', target: second },
    ],
  })
  leko.setStory({
    id: 'returning',
    steps: [
      { id: 'save-again', target: first, awaits: 'order-saved' },
      { id: 'done', target: second },
    ],
  })

  leko.start('onboarding')
  leko.reached('order-saved')
  expect(leko.step?.id).toBe('done')

  // The other story was waiting for the same name and did not move: progress
  // recorded while nobody was being shown a step is not evidence of anything.
  leko.start('returning')
  expect(leko.step?.id).toBe('save-again')
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

test('a story can be started part-way through', () => {
  const first = box('first', { left: '100px', top: '100px', width: '120px', height: '40px' })
  const second = box('second', { left: '100px', top: '300px', width: '120px', height: '40px' })

  const leko = register({
    id: 'onboarding',
    steps: [
      { id: 'a', target: first },
      { id: 'b', target: second },
    ],
  })
  leko.start('onboarding', 'b')

  expect(leko.step?.id).toBe('b')
})

test('an unknown story id shows nothing', () => {
  const target = box('target', { left: '100px', top: '100px', width: '120px', height: '40px' })
  const leko = register({ id: 'onboarding', steps: [{ id: 'a', target }] })

  leko.start('nowhere')

  expect(leko.state).toBe('idle')
  expect(leko.story).toBeUndefined()
  expect(scrim()).toBeNull()
})

test('re-registering the story that is running does not restart it', () => {
  const first = box('first', { left: '100px', top: '100px', width: '120px', height: '40px' })
  const second = box('second', { left: '100px', top: '300px', width: '120px', height: '40px' })
  const steps = (message: string) => [
    { id: 'a', target: first },
    { id: 'b', target: second, message },
  ]

  const leko = register({ id: 'onboarding', steps: steps('before') })
  leko.start('onboarding')
  leko.nextStep()

  // A component that registers on every render hands the same story back with
  // fresh objects in it, and must not throw the user back to the first step.
  leko.setStory({ id: 'onboarding', steps: steps('after') })

  expect(leko.step?.id).toBe('b')
  expect(leko.step?.message).toBe('after')
})

test('a story overrides the padding the instance was given', () => {
  const target = box('target', { left: '100px', top: '200px', width: '120px', height: '40px' })
  const near = box('near', { left: '120px', top: '170px', width: '20px', height: '20px' })

  const leko = register({ id: 'roomy', steps: [{ id: 'a', target }], padding: 40 }, { padding: 4 })
  leko.start('roomy')

  // 20px above the target: outside the instance's padding, well inside the
  // story's, so the story is what decided the size of the hole.
  expect(centre(near)).toBe(near)
})

test('the scrim is mounted inside the scroller the target lives in', () => {
  const scroller = document.createElement('div')
  Object.assign(scroller.style, {
    position: 'fixed',
    left: '40px',
    top: '40px',
    width: '300px',
    height: '200px',
    overflow: 'auto',
  })
  const content = document.createElement('div')
  content.style.height = '1200px'
  const target = document.createElement('button')
  Object.assign(target.style, {
    position: 'absolute',
    left: '20px',
    top: '900px',
    width: '120px',
    height: '40px',
  })
  content.append(target)
  scroller.append(content)
  document.body.append(scroller)
  mounted.push(scroller)

  start([{ id: 'deep', target }])

  // Inside the scroller, so scrolling moves scrim and target together and no
  // position math has to run per frame.
  expect(scrim()?.parentElement).toBe(scroller)

  scroller.scrollTop = 880
  expect(centre(target)).toBe(target)
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

test('the page outside a scroller is dimmed too, not just the scroller', () => {
  const scroller = document.createElement('div')
  Object.assign(scroller.style, {
    position: 'fixed',
    left: '200px',
    top: '200px',
    width: '260px',
    height: '160px',
    overflow: 'auto',
  })
  const content = document.createElement('div')
  content.style.height = '900px'
  const target = document.createElement('button')
  Object.assign(target.style, {
    position: 'absolute',
    left: '20px',
    top: '40px',
    width: '120px',
    height: '40px',
  })
  content.append(target)
  scroller.append(content)
  document.body.append(scroller)
  mounted.push(scroller)

  const outside = box('outside', { left: '20px', top: '20px', width: '100px', height: '40px' })

  start([{ id: 'deep', target }])

  // One scrim inside the scroller so the cutout tracks its content for free,
  // and one outside so the rest of the page is not left bright and clickable.
  expect(centre(target)).toBe(target)
  expect(centre(outside)).not.toBe(outside)
  // Whichever part of the outer layer answers — it paints, and blocks with
  // rectangles that keep clear of the hole — the page underneath does not.
  expect((centre(outside) as HTMLElement).closest('.leko-scrim')).not.toBeNull()
})

test('nothing that catches a pointer overlaps the hole cut for a scroller', () => {
  const scroller = document.createElement('div')
  Object.assign(scroller.style, {
    position: 'fixed',
    left: '200px',
    top: '200px',
    width: '260px',
    height: '160px',
    overflow: 'auto',
  })
  const content = document.createElement('div')
  content.style.height = '900px'
  const target = document.createElement('button')
  Object.assign(target.style, {
    position: 'absolute',
    left: '20px',
    top: '40px',
    width: '120px',
    height: '40px',
  })
  content.append(target)
  scroller.append(content)
  document.body.append(scroller)
  mounted.push(scroller)

  start([{ id: 'deep', target }])

  // The reason this is checked by geometry rather than by hit-testing: a
  // clip-path already takes the outer layer out of `elementFromPoint`, and an
  // engine still uses it to decide what a wheel scrolls. The panel then stops
  // scrolling under the pointer, and no assertion about hit-testing can see it.
  // Nothing outside the scroller may have any geometry over it, clipped or not.
  const hole = scroller.getBoundingClientRect()
  for (const el of document.querySelectorAll<HTMLElement>('.leko-scrim, .leko-block')) {
    if (scroller.contains(el)) continue
    if (getComputedStyle(el).pointerEvents === 'none') continue
    const r = el.getBoundingClientRect()
    const overlaps =
      r.left < hole.right && hole.left < r.right && r.top < hole.bottom && hole.top < r.bottom
    expect(`${el.className} overlaps: ${overlaps}`).toBe(`${el.className} overlaps: false`)
  }
})

test('shaking moves the cutouts, not the scrim', () => {
  const target = box('target', { left: '100px', top: '100px', width: '120px', height: '40px' })
  let utils: import('./types.js').ErrorUtils | undefined
  const leko = start([
    {
      id: 'one',
      target,
      validate: () => false,
      onValidationError: (_el, u) => {
        utils = u
      },
    },
  ])

  leko.nextStep()
  utils?.shake()

  // Translating the scrim would slide the dimming off the edge of the page.
  const scrimEl = document.querySelector<HTMLElement>('.leko-scrim')!
  expect(getComputedStyle(scrimEl).transform).toBe('none')
})

test('a resize re-places the cutout instead of replaying the opening', async () => {
  const target = box('target', { left: '100px', top: '100px', width: '120px', height: '40px' })
  const far = box('far', { left: '100px', top: '400px', width: '120px', height: '40px' })
  // A real duration, because the bug this pins down was only visible while an
  // animation was running.
  const leko = register({ id: 'story', steps: [{ id: 'one', target }] }, { duration: 200 })
  leko.start('story')
  await new Promise((r) => setTimeout(r, 300))

  window.dispatchEvent(new Event('resize'))

  // Replaying the opening would blow the cutout up to cover the page, leaving
  // almost nothing dimmed for a few hundred milliseconds.
  expect(absorbed(far)).toBe(true)
  expect(centre(target)).toBe(target)
})

test('interrupting a morph does not mark the next step as already settled', async () => {
  const first = box('first', { left: '100px', top: '100px', width: '120px', height: '40px' })
  const second = box('second', { left: '100px', top: '300px', width: '120px', height: '40px' })
  const leko = register(
    {
      id: 'story',
      steps: [
        { id: 'a', target: first },
        { id: 'b', target: second },
      ],
    },
    { duration: 200 },
  )

  leko.start('story')
  leko.nextStep() // while the opening morph is still running
  await Promise.resolve()

  // The interrupted morph resolves too, and used to hand 'running' to a step
  // that had not moved yet.
  expect(leko.state).toBe('transitioning')
})

// --- onStep ---------------------------------------------------------------

/** Every call, as `[step, previous]` ids, so a whole run reads as one array. */
function watched(story: Omit<LekoStory, 'onStep'>, options: LekoOptions = {}) {
  const seen: [string | undefined, string | undefined][] = []
  const leko = register(
    { ...story, onStep: (step, previous) => seen.push([step?.id, previous?.id]) },
    options,
  )
  return { leko, seen }
}

function pair(): [HTMLElement, HTMLElement] {
  return [
    box('first', { left: '100px', top: '100px', width: '120px', height: '40px' }),
    box('second', { left: '100px', top: '300px', width: '120px', height: '40px' }),
  ]
}

test('a story reports where it went, and what it came from', () => {
  const [first, second] = pair()
  const { leko, seen } = watched({
    id: 'story',
    steps: [
      { id: 'a', target: first },
      { id: 'b', target: second, awaits: 'saved' },
    ],
  })

  leko.start('story')
  leko.nextStep()
  leko.reached('saved')

  expect(seen).toEqual([
    ['a', undefined], // nothing came before the first step of a run
    ['b', 'a'],
    [undefined, 'b'], // past the last step there is nowhere to be
  ])
})

test('the instance has finished moving by the time it says so', () => {
  const [first, second] = pair()
  const seen: (string | undefined)[] = []
  const story: LekoStory = {
    id: 'story',
    steps: [
      { id: 'a', target: first },
      { id: 'b', target: second },
    ],
    // Reading the instance from inside the hook is how a host writes a progress
    // readout. Firing before the move landed would report the step just left.
    onStep: () => seen.push(leko.step?.id),
  }
  const leko = register(story)

  leko.start('story')
  leko.nextStep()

  expect(seen).toEqual(['a', 'b'])
})

test('going back reports too, because the hook says where the story is', () => {
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
  seen.length = 0
  leko.prevStep()

  expect(seen).toEqual([['a', 'b']])
})

test('stopping reports the ending once, however many times it is called', () => {
  const [first] = pair()
  const { leko, seen } = watched({ id: 'story', steps: [{ id: 'a', target: first }] })

  leko.start('story')
  seen.length = 0
  leko.stop()
  leko.stop()

  expect(seen).toEqual([[undefined, 'a']])
})

test('a step that fails validation reports nothing, because nothing moved', () => {
  const [first, second] = pair()
  const { leko, seen } = watched({
    id: 'story',
    steps: [
      { id: 'a', target: first, validate: () => false },
      { id: 'b', target: second },
    ],
  })

  leko.start('story')
  seen.length = 0
  leko.nextStep()

  expect(seen).toEqual([])
})

test('a story whose target is already gone reports its ending, and no start', () => {
  const { leko, seen } = watched({ id: 'story', steps: [{ id: 'ghost', target: '#not-here' }] })

  leko.start('story')

  // `show` found nothing and stopped the run, which reported the ending. A
  // start announced after that would leave a readout pointing at a story that
  // is not running — the frozen footer again, one call later. `ghost` is not
  // named on the way out either: it was never drawn, so it was never announced.
  expect(seen).toEqual([[undefined, undefined]])
  expect(leko.step).toBeUndefined()
})

test('losing a target on the way to a step reports the ending and nothing after it', () => {
  const [first] = pair()
  const { leko, seen } = watched({
    id: 'story',
    steps: [
      { id: 'a', target: first },
      { id: 'gone', target: '#not-here' },
      { id: 'c', target: first },
    ],
  })

  leko.start('story')
  seen.length = 0
  leko.nextStep()

  // The ending leaves from `a`, which is the step a readout is still showing.
  // `gone` was never drawn and so was never announced, and naming it would be
  // the first a host had heard of it.
  expect(seen).toEqual([[undefined, 'a']])
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

test('switching stories ends one and starts the other, and each hears only itself', () => {
  const [first, second] = pair()
  const from: [string | undefined, string | undefined][] = []
  const into: [string | undefined, string | undefined][] = []

  const leko = register({
    id: 'from',
    steps: [{ id: 'a', target: first }],
    onStep: (step, previous) => from.push([step?.id, previous?.id]),
  })
  leko.setStory({
    id: 'into',
    steps: [{ id: 'b', target: second }],
    onStep: (step, previous) => into.push([step?.id, previous?.id]),
  })

  leko.start('from')
  leko.start('into')

  expect(from).toEqual([
    ['a', undefined],
    [undefined, 'a'], // told that it ended, rather than left half-finished
  ])
  // `previous` does not chain across: within the new story nothing came first.
  expect(into).toEqual([['b', undefined]])
})

test('a typo cannot end the story someone is in the middle of', () => {
  const [first, second] = pair()
  const { leko, seen } = watched({
    id: 'story',
    steps: [
      { id: 'a', target: first },
      { id: 'b', target: second },
    ],
  })

  leko.start('story')
  seen.length = 0
  leko.start('nowhere')
  leko.start('story', 'no-such-step')
  // In range and still not a step, because `steps[0.5]` is nowhere.
  leko.start('story', 0.5)

  expect(seen).toEqual([])
  expect(leko.story?.id).toBe('story')
  expect(leko.step?.id).toBe('a')
})

test('the story hook and the instance hook both fire, story first', () => {
  const [first, second] = pair()
  const order: string[] = []
  const told: (string | undefined)[] = []

  const leko = register(
    {
      id: 'story',
      steps: [
        { id: 'a', target: first },
        { id: 'b', target: second },
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

  leko.start('story')
  leko.nextStep()

  expect(order).toEqual(['story', 'instance', 'story', 'instance'])
  expect(told).toEqual(['story', 'story'])
})

test('the instance hook hears every story, and each story hears only itself', () => {
  const [first, second] = pair()
  const heard: string[] = []

  const leko = register(
    { id: 'from', steps: [{ id: 'a', target: first }], onStep: () => heard.push('from-hook') },
    { onStep: (_step, _previous, story) => heard.push(`instance:${story.id}`) },
  )
  leko.setStory({ id: 'into', steps: [{ id: 'b', target: second }] })

  leko.start('from')
  leko.start('into')

  expect(heard).toEqual([
    'from-hook',
    'instance:from', // started
    'from-hook',
    'instance:from', // ended, because starting another stops this one
    'instance:into', // the new story registered no hook of its own
  ])
})

test('the index says how far into the story the step sits, and is empty while idle', () => {
  const [first, second] = pair()
  const leko = register({
    id: 'story',
    steps: [
      { id: 'a', target: first },
      { id: 'b', target: second },
    ],
  })

  expect(leko.index).toBeUndefined()
  leko.start('story')
  expect(leko.index).toBe(0)
  leko.nextStep()
  expect(leko.index).toBe(1)
  leko.prevStep()
  expect(leko.index).toBe(0)
  leko.stop()
  expect(leko.index).toBeUndefined()
})

// --- onEnter and onLeave --------------------------------------------------

/** A promise the test settles by hand, so the gap can be looked at. */
function held(): { promise: Promise<void>; settle: () => void } {
  let settle!: () => void
  const promise = new Promise<void>((resolve) => {
    settle = resolve
  })
  return { promise, settle }
}

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

test('a step waiting on its onEnter is not advanced past, and the call is not saved', async () => {
  const [first, second] = pair()
  const { promise, settle } = held()
  const { leko, seen } = watched({
    id: 'story',
    steps: [
      { id: 'a', target: first },
      { id: 'b', target: second, onEnter: () => promise },
      { id: 'c', target: first },
    ],
  })

  leko.start('story')
  leko.nextStep()
  expect(leko.state).toBe('transitioning')

  // `b` has built nothing and has never been on screen, so there is nothing
  // here to advance away from.
  leko.nextStep()
  leko.nextStep()

  settle()
  await promise

  // Dropped rather than queued: settling lands on `b`, and `c` is still ahead.
  expect(leko.step?.id).toBe('b')
  expect(seen).toEqual([
    ['a', undefined],
    ['b', 'a'],
  ])
})

test('going back out of a step in flight leaves the tour able to advance', async () => {
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
  expect(leko.state).toBe('transitioning')
  leko.prevStep()

  // `b`'s handler finds the counter has moved and returns, which is right, and
  // the flag saying a step is still being built is one of the things it does not
  // get to. Leaving it standing left a tour that looked fine on `a` and dropped
  // every call from there on.
  expect(leko.step?.id).toBe('a')
  leko.nextStep()
  expect(leko.step?.id).toBe('b')

  settle()
  await promise
  expect(leko.state).toBe('running')
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

test('the move is reported once the step has arrived, not when the position changed', async () => {
  const [first, second] = pair()
  const { promise, settle } = held()
  const { leko, seen } = watched({
    id: 'story',
    steps: [
      { id: 'a', target: first },
      { id: 'b', target: second, onEnter: () => promise },
    ],
  })

  leko.start('story')
  seen.length = 0
  leko.nextStep()

  // A progress readout that heard about `b` here would be naming a step the
  // user cannot see yet.
  expect(seen).toEqual([])

  settle()
  await promise

  expect(seen).toEqual([['b', 'a']])
})

test('onLeave says where the tour is going, and says nothing where it is ending', () => {
  const [first, second] = pair()
  const left: [string, string | undefined][] = []
  const onLeave = (step: LekoStep, next: LekoStep | undefined) => left.push([step.id, next?.id])
  const leko = start([
    { id: 'a', target: first, onLeave },
    { id: 'b', target: second, onLeave },
  ])

  leko.nextStep()
  expect(left).toEqual([['a', 'b']])

  leko.nextStep() // past the last step, so there is nowhere to be going
  expect(left).toEqual([
    ['a', 'b'],
    ['b', undefined],
  ])
})

test('going back enters the step again, because it assumes the same state as before', () => {
  const [first, second] = pair()
  const entered: string[] = []
  const left: [string, string | undefined][] = []
  const steps: LekoStep[] = [
    { id: 'a', target: first },
    { id: 'b', target: second },
  ].map((step) => ({
    ...step,
    onEnter: (s: LekoStep) => void entered.push(s.id),
    onLeave: (s: LekoStep, next: LekoStep | undefined) => left.push([s.id, next?.id]),
  }))
  const leko = start(steps)

  leko.nextStep()
  leko.prevStep()

  expect(entered).toEqual(['a', 'b', 'a'])
  // `next` is where the tour is going, which going back is as much as anything.
  expect(left).toEqual([
    ['a', 'b'],
    ['b', 'a'],
  ])
})

test('starting another story ends this one, and says so with nowhere to go', () => {
  const [first, second] = pair()
  const left: [string, string | undefined][] = []
  const leko = register({
    id: 'from',
    steps: [
      {
        id: 'a',
        target: first,
        onLeave: (step, next) => left.push([step.id, next?.id]),
      },
    ],
  })
  leko.setStory({ id: 'into', steps: [{ id: 'b', target: second }] })

  leko.start('from')
  leko.start('into')

  // The step it lands on belongs to a story this one knows nothing about, and
  // this story is over either way.
  expect(left).toEqual([['a', undefined]])
})

test('an onEnter that fails stops the tour, and does not swallow the reason', async () => {
  const [first, second] = pair()
  const boom = new Error('the panel would not open')
  // Caught rather than let go, because an uncaught error fails the run. What is
  // being asserted is that Leko hands the reason on rather than keeping it.
  const escaped: (() => void)[] = []
  vi.spyOn(globalThis, 'queueMicrotask').mockImplementation((fn) => void escaped.push(fn))

  const left: (string | undefined)[] = []
  const leko = start([
    { id: 'a', target: first },
    {
      id: 'b',
      target: second,
      onEnter: () => Promise.reject(boom),
      onLeave: (_step, next) => left.push(next?.id),
    },
  ])

  leko.nextStep()
  await Promise.resolve()
  await Promise.resolve()

  expect(leko.state).toBe('idle')
  // The half-built step is still cleaned up: the handler may have registered
  // something before the part that failed.
  expect(left).toEqual([undefined])
  expect(escaped).toHaveLength(1)
  expect(() => escaped[0]!()).toThrow(boom)
})

test('a step abandoned while its onEnter is in flight is still left properly', async () => {
  const [first, second] = pair()
  const { promise, settle } = held()
  const left: [string, string | undefined][] = []
  const leko = start([
    { id: 'a', target: first },
    {
      id: 'b',
      target: second,
      awaits: 'moved-on',
      onEnter: () => promise,
      onLeave: (step, next) => left.push([step.id, next?.id]),
    },
    { id: 'c', target: first },
  ])

  leko.nextStep()
  leko.stop() // the tour is dropped while `b` is still entering
  settle()
  await promise
  await Promise.resolve()

  expect(left).toEqual([['b', undefined]])
  // The handler settling afterwards does not draw a step the tour has left.
  expect(leko.step).toBeUndefined()
  expect(leko.state).toBe('idle')
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

test('a run stopped before it draws says it came from nowhere', async () => {
  const { promise, settle } = held()
  const { leko, seen } = watched({
    id: 'story',
    steps: [{ id: 'a', target: '.late', onEnter: () => promise }],
  })

  leko.start('story')
  leko.stop()
  settle()
  await promise

  // The arrival at `a` was never announced, because `a` was never drawn. An
  // ending naming it would tell a readout the tour left a step it was never
  // told the tour reached.
  expect(seen).toEqual([[undefined, undefined]])
})

test('a run stopped while the story is still setting up says the same', async () => {
  const { promise, settle } = held()
  const { leko, seen } = watched({
    id: 'story',
    onEnter: () => promise,
    steps: [{ id: 'a', target: '.late' }],
  })

  leko.start('story')
  leko.stop()
  settle()
  await promise

  // A story's own setup runs before anything about its first step does, so this
  // is the widest the window gets.
  expect(seen).toEqual([[undefined, undefined]])
})

test('a story displaced before it drew leaves from nowhere as well', async () => {
  const [first, second] = pair()
  const { promise, settle } = held()
  const { leko, seen } = watched({
    id: 'from',
    steps: [{ id: 'a', target: first, onEnter: () => promise }],
  })
  leko.setStory({ id: 'into', steps: [{ id: 'b', target: second }] })

  leko.start('from')
  leko.start('into')
  settle()
  await promise

  expect(seen).toEqual([[undefined, undefined]])
  expect(leko.step?.id).toBe('b')
})

test('an ending names the step showing, not the one the tour was walking into', async () => {
  const [first, second] = pair()
  const { promise, settle } = held()
  const { leko, seen } = watched({
    id: 'story',
    steps: [
      { id: 'a', target: first },
      { id: 'b', target: second, onEnter: () => promise },
    ],
  })

  leko.start('story')
  leko.nextStep()
  seen.length = 0
  leko.stop()
  settle()
  await promise

  // The tour was on `b` by every internal measure and a readout was still
  // showing `a`, which is the one the ending is about.
  expect(seen).toEqual([[undefined, 'a']])
})

test('a story started from inside an ending report is not overwritten by the start that caused it', () => {
  const [first, second] = pair()
  const third = box('third', { left: '100px', top: '500px', width: '120px', height: '40px' })
  const heard: string[] = []
  const leko = register(
    {
      id: 'from',
      steps: [{ id: 'a', target: first }],
      // Reacting to the ending by sending the user somewhere else, which is an
      // ordinary thing for a host to do.
      onStep: (step) => {
        if (step === undefined) leko.start('rescue')
      },
    },
    { onStep: (step, _previous, story) => heard.push(`${story.id}:${step?.id}`) },
  )
  leko.setStory({ id: 'rescue', steps: [{ id: 'b', target: second }] })
  leko.setStory({ id: 'into', steps: [{ id: 'c', target: third }] })

  leko.start('from')
  heard.length = 0
  leko.start('into')

  // `into` gives way. Carrying on would have overwritten `rescue`, and that
  // story would have ended without ever saying so.
  expect(leko.story?.id).toBe('rescue')
  expect(leko.step?.id).toBe('b')
  expect(heard).toEqual(['rescue:b', 'from:undefined'])
})

test('a story started from inside a step onLeave still leaves the story that was ending', () => {
  const [first, second] = pair()
  const left: string[] = []
  const leko = register({
    id: 'from',
    onLeave: (story, next) => left.push(`${story.id}->${next?.id ?? 'end'}`),
    steps: [{ id: 'a', target: first, onLeave: () => leko.start('rescue') }],
  })
  leko.setStory({
    id: 'rescue',
    onLeave: (story, next) => left.push(`${story.id}->${next?.id ?? 'end'}`),
    steps: [{ id: 'b', target: second }],
  })

  leko.start('from')
  leko.stop()

  // `rescue` is on screen and owes an `onLeave` later. Firing it here would
  // tell a story that just began that its tour is over, and would leave `from`
  // without the one it is owed.
  expect(left).toEqual(['from->end'])
  expect(leko.story?.id).toBe('rescue')

  leko.stop()

  expect(left).toEqual(['from->end', 'rescue->end'])
})

test('a story whose onEnter starts another story synchronously does not enter over it', () => {
  const [first, second] = pair()
  const log: string[] = []
  const leko = register({
    id: 'gate',
    // A check that sends the user somewhere else, answered in the same turn
    // because the answer was known already.
    onEnter: () => {
      leko.start('elsewhere')
    },
    steps: [{ id: 'a', target: first }],
  })
  leko.setStory({
    id: 'elsewhere',
    steps: [
      {
        id: 'b',
        target: second,
        onEnter: () => void log.push('enter b'),
        onLeave: () => void log.push('leave b'),
      },
    ],
  })

  leko.start('gate')

  expect(leko.story?.id).toBe('elsewhere')
  expect(leko.step?.id).toBe('b')
  // `gate` carrying on would leave and re-enter a step nobody moved off.
  expect(log).toEqual(['enter b'])
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

test('a story that shows the same step object twice still counts forwards', () => {
  const [first, second] = pair()
  // One object in two places, which is what a host generating steps from data
  // gets without thinking about it. `steps.indexOf(step)` answers 1 at both.
  const review: LekoStep = { id: 'review', target: second }
  const leko = start([
    { id: 'intro', target: first },
    review,
    { id: 'edit', target: first },
    review,
  ])

  leko.nextStep()
  expect(leko.index).toBe(1)
  leko.nextStep()
  leko.nextStep()
  expect(leko.step).toBe(review)
  expect(leko.index).toBe(3)
})

test('a story builds what it assumes before its first step builds what it assumes', () => {
  const [first] = pair()
  const order: string[] = []
  const leko = register({
    id: 'story',
    onEnter: () => void order.push('story'),
    steps: [{ id: 'a', target: first, onEnter: () => void order.push('step') }],
  })

  leko.start('story')

  // Outermost first. A story's setup that ran after the step's would be setting
  // up a world the step has already been built against.
  expect(order).toEqual(['story', 'step'])
  expect(leko.state).toBe('running')
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

test('a story waiting on its onEnter does not let a step advance underneath it', async () => {
  const { promise, settle } = held()
  const entered: string[] = []
  const leko = register({
    id: 'story',
    onEnter: () => promise,
    steps: [
      { id: 'a', target: '.late', awaits: 'saved', onEnter: () => void entered.push('a') },
      { id: 'b', target: '.late', onEnter: () => void entered.push('b') },
    ],
  })

  leko.start('story')
  leko.nextStep()
  leko.reached('saved')

  expect(leko.state).toBe('transitioning')
  expect(entered).toEqual([])

  const target = box('late', { left: '100px', top: '100px', width: '120px', height: '40px' })
  target.className = 'late'
  settle()
  await promise

  // What the story assumes was built first, and the tour is on the step that
  // was waiting for it rather than one past it.
  expect(entered).toEqual(['a'])
  expect(leko.step?.id).toBe('a')
  expect(leko.state).toBe('running')
})

test('a story is left after its step is, and told nothing where the tour is over', () => {
  const [first, second] = pair()
  const order: string[] = []
  const leaving: (string | undefined)[] = []
  const leko = register({
    id: 'story',
    onEnter: () => {},
    onLeave: (_story, next) => {
      order.push('story')
      leaving.push(next?.id)
    },
    steps: [
      { id: 'a', target: first, onLeave: () => void order.push('step') },
      { id: 'b', target: second },
    ],
  })

  leko.start('story')
  leko.stop()

  // Innermost first, the mirror of the order they were entered in.
  expect(order).toEqual(['step', 'story'])
  expect(leaving).toEqual([undefined])
})

test('running past the last step leaves the story too', () => {
  const [first] = pair()
  const leaving: (string | undefined)[] = []
  const leko = register({
    id: 'story',
    onLeave: (_story, next) => void leaving.push(next?.id),
    steps: [{ id: 'only', target: first }],
  })

  leko.start('story')
  leko.nextStep()

  expect(leaving).toEqual([undefined])
  expect(leko.state).toBe('idle')
})

test('a story displaced by another is told which one is starting', () => {
  const [first, second] = pair()
  const leaving: (string | undefined)[] = []
  const leko = createLeko({ duration: 0 })
  instances.push(leko)
  leko.setStory({
    id: 'shared',
    onLeave: (_story, next) => void leaving.push(next?.id),
    steps: [{ id: 'a', target: first }],
  })
  leko.setStory({ id: 'branch', steps: [{ id: 'b', target: second }] })

  leko.start('shared')
  leko.start('branch')

  // The teardown a branch and the story it rejoins both need is teardown this
  // argument lets a handler skip.
  expect(leaving).toEqual(['branch'])
  expect(leko.story?.id).toBe('branch')
})

test('a story onEnter that fails stops the tour, and is still left properly', async () => {
  const [first] = pair()
  const boom = new Error('the fixtures would not load')
  const escaped: (() => void)[] = []
  vi.spyOn(globalThis, 'queueMicrotask').mockImplementation((fn) => void escaped.push(fn))

  const left: (string | undefined)[] = []
  const entered: string[] = []
  const leko = register({
    id: 'story',
    onEnter: () => Promise.reject(boom),
    onLeave: (_story, next) => void left.push(next?.id),
    steps: [{ id: 'a', target: first, onEnter: () => void entered.push('step') }],
  })

  leko.start('story')
  await Promise.resolve()
  await Promise.resolve()

  expect(leko.state).toBe('idle')
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
  const leko = register({
    id: 'story',
    onEnter: () => promise,
    onLeave: (_story, next) => void left.push(next?.id),
    steps: [{ id: 'a', target: '.never', onEnter: () => void entered.push('step') }],
  })

  leko.start('story')
  leko.stop()
  settle()
  await promise
  await Promise.resolve()

  expect(left).toEqual([undefined])
  // The handler settling afterwards does not enter a story the tour has left.
  expect(entered).toEqual([])
  expect(leko.state).toBe('idle')
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
