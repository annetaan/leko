import { expect, test, vi } from 'vitest'

import { begin, box, control, frame, keep, press, start } from './harness.js'

// Where the box beside the hole ends up, and what it has in it. Anchor
// positioning is the feature engines disagree about most here, so these run in
// all three. `start` puts the tour up with a duration of 0: these are about
// where the message lands, not about how long the cutout took to get there.

const message = () => document.querySelector<HTMLElement>('.leko-message')
const words = () => document.querySelector<HTMLElement>('.leko-message-text')?.textContent
const error = () => document.querySelector<HTMLElement>('.leko-message-error')
/**
 * On screen at all, rather than in the DOM: an empty part is `hidden`, and the
 * whole box is transparent while it is away, which the parts inherit.
 */
const on = (el: HTMLElement | null | undefined) =>
  el?.checkVisibility({ visibilityProperty: true, opacityProperty: true }) === true
// Both options are off by default: `checkVisibility()` on its own only reports
// `display: none`, and would call a hidden, fully transparent box visible.
const visible = () =>
  message()?.checkVisibility({ visibilityProperty: true, opacityProperty: true }) === true
const rect = (el: Element) => el.getBoundingClientRect()

const overlaps = (a: DOMRect, b: DOMRect): boolean =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom

/** How far apart two rects are, which is zero where they touch or overlap. */
const gap = (a: DOMRect, b: DOMRect): number =>
  Math.hypot(
    Math.max(0, a.left - b.right, b.left - a.right),
    Math.max(0, a.top - b.bottom, b.top - a.bottom),
  )

/**
 * Wait for the box to actually be on screen.
 *
 * `show()` fades opacity over 120ms, so the box is exactly transparent at the
 * moment the transition starts, and `opacityProperty: true` reports that as
 * invisible. Counting frames does not settle it: a transition begins at the
 * first style recalculation after the change, and on a busy machine the frames
 * run out before that happens. Measured at exactly 0 on a cold browser and
 * between 0.16 and 0.32 on eight warm runs after it, which is a race rather
 * than a number to raise.
 */
const appears = () => vi.waitUntil(visible)

/**
 * Anchor positioning is allowed to be missing — the message docks to the foot of
 * the viewport instead of being beside the cutout. The tests that are about
 * *being beside it* say so rather than failing on a browser that degraded.
 */
const anchors = CSS.supports('anchor-name: --a') && CSS.supports('position-area: bottom center')

test('the step message is on screen, and above the scrim', () => {
  box('target', { left: '100px', top: '100px', width: '160px', height: '48px' })
  start([{ id: 'one', interactive: true, target: 'button', message: 'Press it.' }])

  const el = message()
  expect(words()).toBe('Press it.')

  // The scrim blocks the page on purpose, so the tour's own chrome has to be
  // above it — otherwise the message is dimmed along with what it explains.
  const r = rect(el!)
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
  expect(hit?.closest('.leko-message')).toBe(el)
})

test('a step with nothing to say and a signal to wait for shows nothing', () => {
  box('target', { left: '100px', top: '100px', width: '160px', height: '48px' })
  start([{ id: 'one', interactive: true, target: 'button', awaits: 'order-saved' }])

  expect(visible()).toBe(false)
})

test.runIf(anchors)('the message clears the cutout rather than covering it', () => {
  const target = box('target', { left: '200px', top: '200px', width: '160px', height: '48px' })
  start([{ id: 'one', interactive: true, target: () => target, message: 'Press it.', padding: 12 }])

  const hole = rect(target)
  const note = rect(message()!)
  // Constraint 1 is about the target, and a message on top of it breaks the
  // point of cutting a hole there at all.
  expect(overlaps(note, hole)).toBe(false)
  expect(note.top).toBeGreaterThanOrEqual(hole.bottom + 12)
})

test.runIf(anchors)('the message clears every cutout, not just the one it is anchored to', () => {
  const target = box('target', { left: '200px', top: '200px', width: '160px', height: '40px' })
  const second = box('second', { left: '200px', top: '260px', width: '160px', height: '40px' })
  start([
    {
      id: 'one',
      interactive: true,
      target: [() => target, () => second],
      message: 'Both of these.',
    },
  ])

  const note = rect(message()!)
  // The anchor is the first region, but the shape to stay clear of is every
  // hole in the scrim: sitting on the second would hide half of what was
  // explained.
  expect(overlaps(note, rect(target))).toBe(false)
  expect(overlaps(note, rect(second))).toBe(false)
})

test.runIf(anchors)('the message sits beside a target inside a shadow root', async () => {
  // No selector reaches in here, and neither does an `anchor-name`: the name is
  // scoped to the tree its element is in, so pointing at this from the document
  // used to be impossible and the box docked instead. What it anchors to now is
  // Leko's own marker, which is in the document because Leko put it there.
  // `spike/anchor-across-shadow/` is the page that settled the boundary.
  const host = document.createElement('div')
  Object.assign(host.style, { position: 'fixed', left: '120px', top: '160px' })
  const root = host.attachShadow({ mode: 'open' })
  const inner = document.createElement('button')
  inner.textContent = 'inside'
  Object.assign(inner.style, { display: 'block', width: '140px', height: '44px' })
  root.append(inner)
  document.body.append(host)
  keep(host)

  start([
    {
      id: 'one',
      interactive: true,
      target: () => inner,
      message: 'Press the one in the shadow root.',
    },
  ])
  await frame()

  const note = rect(message()!)
  const target = rect(inner)
  // Beside it and not over it. The distance is what says this is not the docked
  // box at the foot of the viewport, which is where this landed before and
  // which every other assertion here would have been happy with.
  expect(overlaps(note, target)).toBe(false)
  expect(gap(note, target)).toBeLessThan(40)
})

test('Leko writes no anchor-name into the page it is pointing at', () => {
  // The marker is Leko's own element, so the host's is left exactly as it was.
  // This used to be written and put back, and putting something back is a
  // promise that only holds until somebody forgets.
  const target = box('target', { left: '100px', top: '100px', width: '160px', height: '48px' })
  target.style.setProperty('anchor-name', '--the-page-had-this')

  const leko = start([{ id: 'one', interactive: true, target: () => target, message: 'Press it.' }])

  expect(target.style.getPropertyValue('anchor-name')).toBe('--the-page-had-this')
  leko.stop()
  expect(target.style.getPropertyValue('anchor-name')).toBe('--the-page-had-this')
})

test.runIf(anchors)('the message follows its target when a scroller moves under it', async () => {
  const scroller = document.createElement('div')
  Object.assign(scroller.style, {
    position: 'fixed',
    left: '40px',
    top: '40px',
    width: '320px',
    height: '240px',
    overflow: 'auto',
  })
  const target = document.createElement('button')
  target.textContent = 'deep'
  Object.assign(target.style, { display: 'block', margin: '600px 0' })
  scroller.append(target)
  document.body.append(scroller)
  keep(scroller)

  start([{ id: 'one', interactive: true, target: () => target, message: 'Scroll the list.' }])
  scroller.scrollTop = 400
  await frame()

  const before = { note: rect(message()!).top, target: rect(target).top }
  scroller.scrollTop = 460
  await frame()
  const after = { note: rect(message()!).top, target: rect(target).top }

  // The point of putting the message in the top layer and anchoring it: no
  // script ran between these two reads, and it moved with the target anyway.
  expect(after.target - before.target).toBeCloseTo(-60, 0)
  expect(after.note - before.note).toBeCloseTo(after.target - before.target, 0)
})

test('an error is written into the box that is already there', () => {
  const target = box('target', { left: '100px', top: '100px', width: '160px', height: '48px' })
  start([
    {
      id: 'one',
      interactive: true,
      target: () => target,
      message: 'Type your name.',
      validate: () => false,
      error: 'A name, not a number.',
    },
    { id: 'two', interactive: true, target: () => target },
  ])

  const before = rect(message()!)
  press()

  expect(words()).toBe('Type your name.')
  expect(error()?.textContent).toBe('A name, not a number.')
  // Failing validation does not move the step, so it must not move the message
  // out from under someone reading it. The box grows downwards to fit the
  // reason, and the words already being read stay where they were.
  expect(rect(message()!).top).toBeCloseTo(before.top, 0)
})

// --- the next control -----------------------------------------------------

test('a step that declares no signal is given a way out of it', () => {
  const target = box('target', { left: '100px', top: '100px', width: '160px', height: '48px' })
  const leko = start([
    { id: 'one', interactive: true, target: () => target, message: 'Type your name.' },
    { id: 'two', interactive: true, target: () => target, message: 'Now save.' },
  ])

  expect(control()?.textContent).toBe('Next')
  press()

  expect(leko.step?.id).toBe('two')
})

test('a step waiting for a signal has no control to get past it with', async () => {
  const target = box('target', { left: '100px', top: '100px', width: '160px', height: '48px' })
  start([
    {
      id: 'one',
      interactive: true,
      target: () => target,
      message: 'Save the order.',
      awaits: 'order-saved',
    },
    { id: 'two', interactive: true, target: () => target, message: 'Done.' },
  ])
  // The box has to be up before this proves anything: everything in it is
  // transparent while it fades, control included.
  await appears()

  // The step exists to make someone do the thing the application will report.
  // A button beside the instruction is a way past it without doing that.
  expect(on(control())).toBe(false)
})

test('a step with no message still gets the control, and nothing else', async () => {
  const target = box('target', { left: '100px', top: '100px', width: '160px', height: '48px' })
  const leko = start([
    { id: 'one', interactive: true, target: () => target },
    { id: 'two', interactive: true, target: () => target },
  ])
  await appears()

  expect(on(control())).toBe(true)
  // Nothing was said, so nothing is read out: an empty line would be measured
  // along with the rest and push the box off the side that had room for it.
  expect(on(document.querySelector<HTMLElement>('.leko-message-text'))).toBe(false)

  press()
  expect(leko.step?.id).toBe('two')
})

test('the words on the control are the instance’s to choose', () => {
  const target = box('target', { left: '100px', top: '100px', width: '160px', height: '48px' })
  start([{ id: 'one', interactive: true, target: () => target, message: 'Type your name.' }], {
    nextLabel: '次へ',
  })

  expect(control()?.textContent).toBe('次へ')
})

test('one press advances one step, however many events it arrives as', () => {
  const target = box('target', { left: '100px', top: '100px', width: '160px', height: '48px' })
  const leko = start([
    { id: 'one', interactive: true, target: () => target },
    { id: 'two', interactive: true, target: () => target },
    { id: 'three', interactive: true, target: () => target },
  ])

  const button = control()!
  button.click()
  button.click()

  // Two events a frame apart are one press — a touch emulating a click after
  // its own, an ancestor handler firing too. Taking both would walk the user
  // past a step they never saw.
  expect(leko.step?.id).toBe('two')
})

test('a press after the frame is over is a second press', async () => {
  const target = box('target', { left: '100px', top: '100px', width: '160px', height: '48px' })
  const leko = start([
    { id: 'one', interactive: true, target: () => target },
    { id: 'two', interactive: true, target: () => target },
    { id: 'three', interactive: true, target: () => target },
  ])

  press()
  await frame()
  press()

  expect(leko.step?.id).toBe('three')
})

test('the control goes through validate, and a failed press stays where it is', async () => {
  const target = box('target', { left: '100px', top: '100px', width: '160px', height: '48px' })
  let typed = false
  const leko = start([
    {
      id: 'one',
      interactive: true,
      target: () => target,
      message: 'Type 3.',
      validate: () => typed,
      error: 'That is not 3 yet.',
    },
    { id: 'two', interactive: true, target: () => target, message: 'Now place the order.' },
  ])

  press()
  expect(leko.step?.id).toBe('one')
  // The instruction survives the complaint: a second failed attempt must not
  // leave the user with an error and nothing to act on.
  expect(words()).toBe('Type 3.')
  expect(error()?.textContent).toBe('That is not 3 yet.')

  typed = true
  await frame()
  press()

  expect(leko.step?.id).toBe('two')
  expect(words()).toBe('Now place the order.')
  // Nothing had to clear it. It stopped being true when the attempt succeeded.
  expect(on(error())).toBe(false)
})

test('an error is about the attempt, so leaving the step takes it away', async () => {
  const target = box('target', { left: '100px', top: '100px', width: '160px', height: '48px' })
  const leko = start([
    { id: 'one', interactive: true, target: () => target, message: 'First.' },
    {
      id: 'two',
      interactive: true,
      target: () => target,
      message: 'Second.',
      validate: () => false,
      error: 'Not yet.',
    },
  ])

  press()
  // Two presses inside a frame are one press, and these are two: the first
  // leaves step one, the second is the attempt step two turns down.
  await frame()
  press()
  expect(error()?.textContent).toBe('Not yet.')

  // Running the story again is the only way back to a step, and the complaint
  // belonged to one attempt at the step that is now behind.
  leko.stop()
  begin(leko, 'story')
  expect(on(error())).toBe(false)
  expect(words()).toBe('First.')
})

test('a step with only an error to show gets a box for it', async () => {
  const target = box('target', { left: '100px', top: '100px', width: '160px', height: '48px' })
  start([
    {
      id: 'one',
      interactive: true,
      target: () => target,
      validate: () => false,
      error: 'The total is still zero.',
    },
  ])

  await appears()
  expect(words()).toBe('')
  expect(on(error())).toBe(false)

  press()

  expect(error()?.textContent).toBe('The total is still zero.')
  expect(on(error())).toBe(true)
})

test('a refusal during the opening morph does not take the message with it', async () => {
  const target = box('target', { left: '100px', top: '100px', width: '160px', height: '48px' })
  start(
    [
      {
        id: 'one',
        interactive: true,
        target: () => target,
        message: 'Press it.',
        validate: () => false,
      },
    ],
    // The one test here that wants a morph rather than a cutout already in
    // place: what it is about is the window while the hole is still moving.
    { duration: 200 },
  )

  // The box waits for the cutout to land, because which side of the hole it
  // goes on is a fact about where the hole ends up.
  expect(visible()).toBe(false)
  press()

  // A shake used to halt the morph, and a morph that ends unfinished is how the
  // presenter knows an arrival was interrupted — so the message was never said,
  // and the step was left with a shaken hole and nothing to read beside it.
  await appears()
  expect(words()).toBe('Press it.')
})

test('stopping takes the message with it, and gives the target its anchor name back', () => {
  const target = box('target', { left: '100px', top: '100px', width: '160px', height: '48px' })
  target.style.setProperty('anchor-name', '--theirs')

  const leko = start([{ id: 'one', interactive: true, target: () => target, message: 'Press it.' }])
  leko.stop()

  expect(message()).toBeNull()
  // The target belongs to the consumer. Leko borrows a name on it and hands it
  // back rather than leaving its own behind.
  expect(target.style.getPropertyValue('anchor-name')).toBe('--theirs')
})

test('the message goes when the target does', async () => {
  const target = box('target', { left: '100px', top: '100px', width: '160px', height: '48px' })
  target.id = 'anchor'
  // A selector, so the target is given time to come back and the tour is still
  // standing when this looks. Without one it stops and the message would go
  // with it, which would prove nothing.
  const leko = start([{ id: 'one', interactive: true, target: '#anchor', message: 'Press it.' }])

  target.remove()
  await frame()

  // Still standing, because the target is being given time to come back, and
  // reading as a tour between things while that runs. The presenter began this
  // search on its own and says so, so both searches answer the same way.
  expect(leko.state).toBe('transitioning')
  expect(leko.step?.id).toBe('one')
  // An anchored element whose anchor has left the page falls back to normal
  // positioning, which would drop the message somewhere arbitrary.
  expect(visible()).toBe(false)
})
