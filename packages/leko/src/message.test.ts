import { expect, test, vi } from 'vitest'

import { begin, box, control, frame, keep, press, start } from './harness.js'

// Where the box beside the hole ends up, and what it has in it. Anchor
// positioning is the feature engines disagree about most here, so these run in
// all three.

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
 * Anchor positioning is allowed to be missing — DESIGN.md, **Browser support**.
 * The tests that are about *being beside it* say so rather than failing on a
 * browser that degraded.
 */
const anchors = CSS.supports('anchor-name: --a') && CSS.supports('position-area: bottom center')

test('the step message is on screen, and above the scrim', () => {
  box('target', { left: '100px', top: '100px', width: '160px', height: '48px' })
  start([{ id: 'one', target: { elements: 'button', interactive: true }, message: 'Press it.' }])

  const el = message()
  expect(words()).toBe('Press it.')

  // The scrim blocks the page on purpose, so the tour's own chrome has to be
  // above it — otherwise the message is dimmed along with what it explains.
  const r = rect(el!)
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
  expect(hit?.closest('.leko-message')).toBe(el)
})

test('the box carries no border until a host asks for one', () => {
  box('target', { left: '100px', top: '100px', width: '160px', height: '48px' })
  start([{ id: 'one', target: { elements: 'button', interactive: true }, message: 'Press it.' }])

  // `message.ts` says why the border the UA stylesheet gives every popover has
  // to be taken off.
  expect(getComputedStyle(message()!).borderTopWidth).toBe('0px')
})

test('a step with nothing to say and a signal to wait for shows nothing', () => {
  box('target', { left: '100px', top: '100px', width: '160px', height: '48px' })
  start([{ id: 'one', target: { elements: 'button', interactive: true }, awaits: 'order-saved' }])

  expect(visible()).toBe(false)
})

test.runIf(anchors)('the message clears the cutout rather than covering it', () => {
  const target = box('target', { left: '200px', top: '200px', width: '160px', height: '48px' })
  start([
    {
      id: 'one',
      target: { elements: () => target, interactive: true },
      message: 'Press it.',
      padding: 12,
    },
  ])

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
      target: [{ elements: () => target, interactive: true }, () => second],
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
  // No selector reaches in here, and neither does an `anchor-name` — DESIGN.md,
  // **The message anchors to a marker, never to the target**, and
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
      target: { elements: () => inner, interactive: true },
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

/**
 * A footer of the host's own, sticky above the scrim — the sandbox's, and the
 * page #141 was written against. 200px so the numbers below have room to be
 * unambiguous on whatever viewport the runner brings.
 */
const CHROME = 200
const footer = () =>
  box('footer', { left: '0px', right: '0px', bottom: '0px', top: 'auto', height: `${CHROME}px` })

test('a docked message with no chrome named sits where it always did', () => {
  // The invariant the rewrite of `dock` had to keep: centred on the layout
  // viewport and its foot `--leko-message-dock` above the foot of it, which is
  // what `left: 50%` and `bottom: 24px` resolved to before there was a room to
  // dock into. Measured against `clientWidth`/`clientHeight` rather than
  // `innerWidth`/`innerHeight`, because a fixed box is laid out against the
  // initial containing block and the scrollbar gutter is not in it — DESIGN.md,
  // **That layer is sized past the layout viewport on purpose, gutter
  // included**.
  const root = document.documentElement
  start([{ id: 'one', message: 'Nothing to point at.' }])

  // Within a pixel rather than exactly: the box has a fractional width, so the
  // translate that centres it lands on a half pixel and WebKit rounds it. What
  // this is watching for is the width of a scrollbar gutter, which is fifteen.
  const note = rect(message()!)
  expect(Math.abs(note.left + note.width / 2 - root.clientWidth / 2)).toBeLessThan(1)
  expect(Math.abs(note.bottom - (root.clientHeight - 24))).toBeLessThan(1)
})

test.runIf(anchors)('the message clears chrome the host declared', () => {
  const bar = footer()
  // Just above the footer: room under the target in the viewport, none in what
  // the host left. Without `hostChrome` the box goes below and lands in the bar.
  const target = box('target', {
    left: '200px',
    top: `${window.innerHeight - CHROME - 60}px`,
    width: '160px',
    height: '40px',
  })
  start(
    [
      {
        id: 'one',
        target: { elements: () => target, interactive: true },
        message: 'Press it.',
      },
    ],
    { hostChrome: () => bar },
  )

  expect(overlaps(rect(message()!), rect(bar))).toBe(false)
})

test("the docked message sits above the host's chrome", () => {
  const bar = footer()
  // No target, so there is no hole to sit beside and the box docks — the other
  // reader of the room, and the one that runs on every engine.
  start([{ id: 'one', message: 'Waiting for the import to finish.' }], { hostChrome: () => bar })

  expect(rect(message()!).bottom).toBeLessThanOrEqual(rect(bar).top)
})

test('Leko writes no anchor-name into the page it is pointing at', () => {
  // The marker is Leko's own element, so the host's is left exactly as it was.
  // This used to be written and put back, and putting something back is a
  // promise that only holds until somebody forgets.
  const target = box('target', { left: '100px', top: '100px', width: '160px', height: '48px' })
  target.style.setProperty('anchor-name', '--the-page-had-this')

  const leko = start([
    { id: 'one', target: { elements: () => target, interactive: true }, message: 'Press it.' },
  ])

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

  start([
    {
      id: 'one',
      target: { elements: () => target, interactive: true },
      message: 'Scroll the list.',
    },
  ])
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

test('the step is read for its words every time, so an edit to it is seen', () => {
  const target = box('target', { left: '100px', top: '100px', width: '160px', height: '48px' })
  const step = {
    id: 'one',
    target: { elements: () => target, interactive: true },
    message: 'Type your name.',
  }
  start([step, { id: 'two', target: { elements: () => target, interactive: true } }])

  expect(words()).toBe('Type your name.')

  // The story belongs to the application, and nothing here holds a copy of its
  // text. A resize is the plainest way to make the box be filled again without
  // moving the tour.
  step.message = 'Type the name on your card.'
  window.dispatchEvent(new Event('resize'))

  expect(words()).toBe('Type the name on your card.')
})

test('an error is written into the box that is already there', () => {
  const target = box('target', { left: '100px', top: '100px', width: '160px', height: '48px' })
  start([
    {
      id: 'one',
      target: { elements: () => target, interactive: true },
      message: 'Type your name.',
      validate: () => false,
      error: 'A name, not a number.',
    },
    { id: 'two', target: { elements: () => target, interactive: true } },
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
    {
      id: 'one',
      target: { elements: () => target, interactive: true },
      message: 'Type your name.',
    },
    { id: 'two', target: { elements: () => target, interactive: true }, message: 'Now save.' },
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
      target: { elements: () => target, interactive: true },
      message: 'Save the order.',
      awaits: 'order-saved',
    },
    { id: 'two', target: { elements: () => target, interactive: true }, message: 'Done.' },
  ])
  // The box has to be up before this proves anything: everything in it is
  // transparent while it fades, control included.
  await appears()

  // DESIGN.md, **The next control**.
  expect(on(control())).toBe(false)
})

test('a step with no message still gets the control, and nothing else', async () => {
  const target = box('target', { left: '100px', top: '100px', width: '160px', height: '48px' })
  const leko = start([
    { id: 'one', target: { elements: () => target, interactive: true } },
    { id: 'two', target: { elements: () => target, interactive: true } },
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
  start(
    [
      {
        id: 'one',
        target: { elements: () => target, interactive: true },
        message: 'Type your name.',
      },
    ],
    {
      nextLabel: '次へ',
    },
  )

  expect(control()?.textContent).toBe('次へ')
})

test('one press advances one step, however many events it arrives as', () => {
  const target = box('target', { left: '100px', top: '100px', width: '160px', height: '48px' })
  const leko = start([
    { id: 'one', target: { elements: () => target, interactive: true } },
    { id: 'two', target: { elements: () => target, interactive: true } },
    { id: 'three', target: { elements: () => target, interactive: true } },
  ])

  const button = control()!
  button.click()
  button.click()

  // `message.ts` says why two events a frame apart are one press.
  expect(leko.step?.id).toBe('two')
})

test('a press after the frame is over is a second press', async () => {
  const target = box('target', { left: '100px', top: '100px', width: '160px', height: '48px' })
  const leko = start([
    { id: 'one', target: { elements: () => target, interactive: true } },
    { id: 'two', target: { elements: () => target, interactive: true } },
    { id: 'three', target: { elements: () => target, interactive: true } },
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
      target: { elements: () => target, interactive: true },
      message: 'Type 3.',
      validate: () => typed,
      error: 'That is not 3 yet.',
    },
    {
      id: 'two',
      target: { elements: () => target, interactive: true },
      message: 'Now place the order.',
    },
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
    { id: 'one', target: { elements: () => target, interactive: true }, message: 'First.' },
    {
      id: 'two',
      target: { elements: () => target, interactive: true },
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

  // A story runs from the top — DESIGN.md, **A story is atomic, and stories are
  // short**. The complaint belonged to one attempt at the step that is now
  // behind, which DESIGN.md argues under **A failed attempt**.
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
      target: { elements: () => target, interactive: true },
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
        target: { elements: () => target, interactive: true },
        message: 'Press it.',
        validate: () => false,
      },
    ],
    // The one test here that wants a morph rather than a cutout already in
    // place: what it is about is the window while the hole is still moving.
    { duration: 200 },
  )

  // The box waits for the cutout to land, for the reason the `morphed` case of
  // the presenter's plan gives, in `@annetaan/leko-presenter`.
  expect(visible()).toBe(false)
  press()

  // A shake used to halt the morph, and `scrim.ts` says what an unfinished morph
  // means to the presenter — so the message was never said, and the step was left
  // with a shaken hole and nothing to read beside it.
  await appears()
  expect(words()).toBe('Press it.')
})

test('stopping takes the message with it, and gives the target its anchor name back', () => {
  const target = box('target', { left: '100px', top: '100px', width: '160px', height: '48px' })
  target.style.setProperty('anchor-name', '--theirs')

  const leko = start([
    { id: 'one', target: { elements: () => target, interactive: true }, message: 'Press it.' },
  ])
  leko.stop()

  expect(message()).toBeNull()
  // The target belongs to the consumer. Leko borrows a name on it and hands it
  // back rather than leaving its own behind.
  expect(target.style.getPropertyValue('anchor-name')).toBe('--theirs')
})

test('the message does not move when the target leaves the page', async () => {
  const target = box('target', { left: '100px', top: '100px', width: '160px', height: '48px' })
  target.id = 'anchor'
  const leko = start([
    { id: 'one', target: { elements: '#anchor', interactive: true }, message: 'Press it.' },
  ])
  // Before the target goes, so the fade is not being raced against a deadline.
  await appears()
  const before = rect(message()!)

  target.remove()
  await frame()

  // DESIGN.md, **Whether the target is still there stops being watched once the
  // step is drawn**, and the box hangs off a marker inside the scrim rather than
  // off the target, so the element leaving moves nothing either way.
  expect(leko.state).toBe('running')
  expect(leko.step?.id).toBe('one')
  expect(visible()).toBe(true)
  expect(rect(message()!)).toEqual(before)
})
