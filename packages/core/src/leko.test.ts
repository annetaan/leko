import { afterEach, expect, test, vi } from 'vitest'

import { createLeko } from './leko.js'
import type { LekoOptions, LekoStep, LekoStory } from './types.js'

// Duration 0 everywhere: these tests are about what ends up on screen, not about
// how long it took to get there.
const tours: ReturnType<typeof createLeko>[] = []
const mounted: HTMLElement[] = []

afterEach(() => {
  for (const tour of tours.splice(0)) tour.stop()
  for (const el of mounted.splice(0)) el.remove()
  vi.restoreAllMocks()
})

/** One story, registered and started, which is what most of these want. */
function start(steps: LekoStep[], options: LekoOptions = {}) {
  const tour = register({ id: 'story', steps }, options)
  tour.start('story')
  return tour
}

function register(story: LekoStory, options: LekoOptions = {}) {
  const tour = createLeko({ duration: 0, ...options })
  tours.push(tour)
  tour.setStory(story)
  return tour
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
  const tour = start([{ id: 'one', target }])

  expect(scrim()).not.toBeNull()
  tour.stop()

  expect(scrim()).toBeNull()
  expect(tour.state).toBe('idle')
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
  const tour = register({ id: 'story', steps: [{ id: 'one', target }] })

  expect(() => tour.nextStep()).not.toThrow()
  expect(tour.state).toBe('idle')
  expect(scrim()).toBeNull()
})

test('a step does not advance until the application says it succeeded', () => {
  const first = box('first', { left: '100px', top: '100px', width: '120px', height: '40px' })
  const second = box('second', { left: '100px', top: '300px', width: '120px', height: '40px' })
  let ready = false
  const onValidationError = vi.fn()

  const tour = start([
    { id: 'first', target: first, validate: () => ready, onValidationError },
    { id: 'second', target: second },
  ])

  tour.nextStep()
  expect(tour.step?.id).toBe('first')
  expect(onValidationError).toHaveBeenCalledOnce()
  expect(onValidationError.mock.calls[0]?.[0]).toBe(first)

  ready = true
  tour.nextStep()
  expect(tour.step?.id).toBe('second')
  expect(centre(second)).toBe(second)
})

test('a step advances on the signal it declares', () => {
  const first = box('first', { left: '100px', top: '100px', width: '120px', height: '40px' })
  const second = box('second', { left: '100px', top: '300px', width: '120px', height: '40px' })

  const tour = start([
    { id: 'first', target: first, awaits: 'order-saved' },
    { id: 'second', target: second },
  ])

  tour.reached('order-saved')

  expect(tour.step?.id).toBe('second')
})

test('a signal no step is waiting for costs nothing and says nothing', () => {
  const target = box('target', { left: '100px', top: '100px', width: '120px', height: '40px' })
  const validate = vi.fn(() => true)
  const warn = vi.spyOn(console, 'warn')

  const tour = start([
    { id: 'first', target, awaits: 'order-saved', validate },
    { id: 'second', target },
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
  const target = box('target', { left: '100px', top: '100px', width: '120px', height: '40px' })
  const tour = start([
    { id: 'first', target },
    { id: 'second', target },
  ])

  tour.reached('order-saved')

  expect(tour.step?.id).toBe('first')
})

test('reached does nothing while idle, so it needs no guard either', () => {
  const target = box('target', { left: '100px', top: '100px', width: '120px', height: '40px' })
  const tour = register({ id: 'story', steps: [{ id: 'one', target, awaits: 'ready' }] })

  expect(() => tour.reached('ready')).not.toThrow()
  expect(tour.state).toBe('idle')
  expect(scrim()).toBeNull()
})

test('a signal still has to get past validate', () => {
  const first = box('first', { left: '100px', top: '100px', width: '120px', height: '40px' })
  const second = box('second', { left: '100px', top: '300px', width: '120px', height: '40px' })
  let ready = false
  const onValidationError = vi.fn()

  const tour = start([
    {
      id: 'first',
      target: first,
      awaits: 'order-saved',
      validate: () => ready,
      onValidationError,
    },
    { id: 'second', target: second },
  ])

  tour.reached('order-saved')
  expect(tour.step?.id).toBe('first')
  expect(onValidationError).toHaveBeenCalledOnce()

  ready = true
  tour.reached('order-saved')
  expect(tour.step?.id).toBe('second')
})

test('a signal reported before its step is showing is not saved up', () => {
  const first = box('first', { left: '100px', top: '100px', width: '120px', height: '40px' })
  const second = box('second', { left: '100px', top: '300px', width: '120px', height: '40px' })

  const tour = start([
    { id: 'first', target: first },
    { id: 'second', target: second, awaits: 'order-saved' },
  ])

  // The user did the thing early, before the tour asked for it.
  tour.reached('order-saved')
  tour.nextStep()

  // Arriving at the step does not consume that: a buffered signal would advance
  // a step nobody performed while it was showing.
  expect(tour.step?.id).toBe('second')
})

test('validate is handed the action target, never a related one', () => {
  const target = box('target', { left: '100px', top: '100px', width: '120px', height: '40px' })
  const related = box('related', { left: '100px', top: '300px', width: '120px', height: '40px' })
  const validate = vi.fn(() => true)

  const tour = start([
    { id: 'a', target: [target], related: [related], validate },
    { id: 'b', target },
  ])
  tour.nextStep()

  expect(validate).toHaveBeenCalledWith(target)
})

test('the last step ends the tour', () => {
  const target = box('target', { left: '100px', top: '100px', width: '120px', height: '40px' })
  const tour = start([{ id: 'only', target }])

  tour.nextStep()

  expect(tour.state).toBe('idle')
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

  const tour = register({
    id: 'onboarding',
    steps: [
      { id: 'save', target: first, awaits: 'order-saved' },
      { id: 'done', target: second },
    ],
  })
  tour.setStory({
    id: 'returning',
    steps: [
      { id: 'save-again', target: first, awaits: 'order-saved' },
      { id: 'done', target: second },
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

test('starting a story puts away whatever was running', () => {
  const first = box('first', { left: '100px', top: '100px', width: '120px', height: '40px' })
  const second = box('second', { left: '100px', top: '300px', width: '120px', height: '40px' })

  const tour = register({ id: 'onboarding', steps: [{ id: 'a', target: first }] })
  tour.setStory({ id: 'returning', steps: [{ id: 'b', target: second }] })

  tour.start('onboarding')
  tour.start('returning')

  expect(tour.story).toBe('returning')
  expect(tour.step?.id).toBe('b')
  // One scrim, because two would each block with rectangles cut from their own
  // holes, and so would cover each other's target.
  expect(document.querySelectorAll('.leko-scrim').length).toBe(1)
  expect(centre(second)).toBe(second)
  expect(absorbed(first)).toBe(true)
})

test('a story can be started part-way through', () => {
  const first = box('first', { left: '100px', top: '100px', width: '120px', height: '40px' })
  const second = box('second', { left: '100px', top: '300px', width: '120px', height: '40px' })

  const tour = register({
    id: 'onboarding',
    steps: [
      { id: 'a', target: first },
      { id: 'b', target: second },
    ],
  })
  tour.start('onboarding', 'b')

  expect(tour.step?.id).toBe('b')
})

test('an unknown story id shows nothing', () => {
  const target = box('target', { left: '100px', top: '100px', width: '120px', height: '40px' })
  const tour = register({ id: 'onboarding', steps: [{ id: 'a', target }] })

  tour.start('nowhere')

  expect(tour.state).toBe('idle')
  expect(tour.story).toBeUndefined()
  expect(scrim()).toBeNull()
})

test('re-registering the story that is running does not restart it', () => {
  const first = box('first', { left: '100px', top: '100px', width: '120px', height: '40px' })
  const second = box('second', { left: '100px', top: '300px', width: '120px', height: '40px' })
  const steps = (message: string) => [
    { id: 'a', target: first },
    { id: 'b', target: second, message },
  ]

  const tour = register({ id: 'onboarding', steps: steps('before') })
  tour.start('onboarding')
  tour.nextStep()

  // A component that registers on every render hands the same story back with
  // fresh objects in it, and must not throw the user back to the first step.
  tour.setStory({ id: 'onboarding', steps: steps('after') })

  expect(tour.step?.id).toBe('b')
  expect(tour.step?.message).toBe('after')
})

test('a story overrides the padding the instance was given', () => {
  const target = box('target', { left: '100px', top: '200px', width: '120px', height: '40px' })
  const near = box('near', { left: '120px', top: '170px', width: '20px', height: '20px' })

  const tour = register({ id: 'roomy', steps: [{ id: 'a', target }], padding: 40 }, { padding: 4 })
  tour.start('roomy')

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
  const tour = start([
    {
      id: 'one',
      target,
      validate: () => false,
      onValidationError: (_el, u) => {
        utils = u
      },
    },
  ])

  tour.nextStep()
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
  const tour = register({ id: 'story', steps: [{ id: 'one', target }] }, { duration: 200 })
  tour.start('story')
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
  const tour = register(
    {
      id: 'story',
      steps: [
        { id: 'a', target: first },
        { id: 'b', target: second },
      ],
    },
    { duration: 200 },
  )

  tour.start('story')
  tour.nextStep() // while the opening morph is still running
  await Promise.resolve()

  // The interrupted morph resolves too, and used to hand 'running' to a step
  // that had not moved yet.
  expect(tour.state).toBe('transitioning')
})
