import { userEvent } from '@vitest/browser/context'
import { expect, test, vi } from 'vitest'

import {
  absorbed,
  begin,
  box,
  centre,
  duringGlide,
  holding,
  holes,
  keep,
  control,
  pause,
  press,
  scrim,
  shown,
  start,
  stopped,
  TICK,
} from './harness.js'

// Claims about layout the browser actually performed: where a hole ended up,
// what hit-testing returns at a point, which element a scrim was mounted in.
// Engines disagree about masking and about anchor positioning — Safari cuts no
// hole at all from a mask written one of the ways Chrome accepts — so every one
// of these runs in all three.
//
// Claims about which step the tour is on live in `wiring.test.ts` and run in
// one browser, because no engine has an opinion about those.

test('the target is reachable through the cutout, and the rest of the page is not', () => {
  const target = box('target', { left: '100px', top: '100px', width: '160px', height: '48px' })
  const other = box('other', { left: '100px', top: '400px', width: '160px', height: '48px' })

  start([{ id: 'one', target: { elements: () => target, interactive: true } }])

  expect(centre(target)).toBe(target)
  expect(absorbed(other)).toBe(true)
})

test('stopping puts the page back', () => {
  const target = box('target', { left: '100px', top: '100px', width: '160px', height: '48px' })
  const leko = start([{ id: 'one', target: { elements: () => target, interactive: true } }])

  expect(scrim()).not.toBeNull()
  leko.stop()

  expect(scrim()).toBeNull()
  expect(leko.state).toBe('idle')
  expect(centre(target)).toBe(target)
})

test('one region of several targets is one cutout, and what sits between it opens too', () => {
  const left = box('left', { left: '100px', top: '100px', width: '100px', height: '40px' })
  const right = box('right', { left: '260px', top: '100px', width: '100px', height: '40px' })
  const between = box('between', { left: '210px', top: '105px', width: '40px', height: '30px' })

  // One region naming two elements, so the two are unioned into one hole.
  start([{ id: 'columns', target: { elements: [() => left, () => right], interactive: true } }])

  expect(centre(left)).toBe(left)
  expect(centre(right)).toBe(right)
  // Documented consequence of a union, not an accident: pass adjacent elements.
  expect(centre(between)).toBe(between)
})

test('two regions get a cutout each rather than being unioned', () => {
  const target = box('target', { left: '60px', top: '400px', width: '120px', height: '40px' })
  const summary = box('summary', { left: '60px', top: '60px', width: '120px', height: '40px' })
  const between = box('between', { left: '60px', top: '230px', width: '120px', height: '40px' })

  // Two entries of `target`, so two holes. The same two named in one region's
  // `elements` would be the test above, and would open everything between them.
  start([{ id: 'linked', target: [{ elements: () => target, interactive: true }, () => summary] }])

  // Two holes, not one big one — otherwise everything in between would be lit.
  expect(holes()).toBe(2)
  expect(centre(target)).toBe(target)
  // Shown and not reachable. Only the first region can declare `interactive`
  // — the type refuses it later — because a later one is there to explain
  // rather than to be used.
  expect(absorbed(summary)).toBe(true)
  expect(absorbed(between)).toBe(true)
})

test('a step that says nothing shows its target and does not hand it over', () => {
  const target = box('target', { left: '100px', top: '100px', width: '160px', height: '48px' })

  start([{ id: 'look', target: () => target }])

  // The hole is cut, so the scrim paints nothing over the target and the user
  // can read it.
  expect(holes()).toBe(1)
  // And the pointer stops at the tour. Most steps of most tours explain what is
  // already on screen, and a click on one of those can navigate away from the
  // target the next step points at.
  expect(absorbed(target)).toBe(true)
})

test('an element inside an svg is a target like any other', () => {
  // Drawn at 2x through the viewBox, so the hole is only right if the box came
  // from `getBoundingClientRect` rather than from the shape's own attributes.
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 200 100')
  svg.setAttribute('width', '400')
  svg.setAttribute('height', '200')
  Object.assign(svg.style, { position: 'fixed', left: '60px', top: '60px' })
  const shape = (x: number, y: number) => {
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    rect.setAttribute('x', String(x))
    rect.setAttribute('y', String(y))
    rect.setAttribute('width', '70')
    rect.setAttribute('height', '30')
    svg.append(rect)
    return rect
  }
  const other = shape(10, 10)
  const wanted = shape(110, 55)
  document.body.append(keep(svg))

  // The function form, deliberately: an SVG shape is not an HTMLElement, so
  // this line is also the claim that the type lets a host hand one back.
  start([{ id: 'svg', target: { elements: () => wanted, interactive: true } }])

  expect(centre(wanted)).toBe(wanted)
  expect(absorbed(other)).toBe(true)
})

test('what blocks a shown hole sits beside the scrim, never inside it', () => {
  const target = box('target', { left: '100px', top: '100px', width: '160px', height: '48px' })

  start([{ id: 'look', target: () => target }])

  // The scrim paints and catches nothing, so what caught this is a blocking
  // rectangle beside it rather than the scrim itself. The rectangles were moved
  // out of the scrim when it was clipped rather than masked — a clip took them
  // out of hit-testing with it — and `spike/blocking-a-hole/` is that page.
  const caught = centre(target) as HTMLElement
  expect(caught.closest('.leko-scrim')).toBeNull()
  expect(caught.closest('.leko-blocking')).not.toBeNull()
})

test('a step overrides the padding the instance was given', () => {
  const target = box('target', { left: '100px', top: '200px', width: '120px', height: '40px' })
  const near = box('near', { left: '120px', top: '170px', width: '20px', height: '20px' })

  const leko = holding(
    {
      id: 'roomy',
      steps: [{ id: 'a', target: { elements: () => target, interactive: true }, padding: 40 }],
    },
    { padding: 4 },
  )
  begin(leko, 'roomy')

  // 20px above the target: outside the instance's padding, well inside the
  // step's, so the step is what decided the size of the hole. There are two
  // tiers and no third — a story that wants this for all of its steps writes it
  // on all of its steps, which is a `.map()` rather than a tier.
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
  keep(scroller)

  start([{ id: 'deep', target: { elements: () => target, interactive: true } }])

  // Inside the scroller, so scrolling moves scrim and target together and no
  // position math has to run per frame.
  expect(scrim()?.parentElement).toBe(scroller)

  scroller.scrollTop = 880
  expect(centre(target)).toBe(target)
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
  keep(scroller)

  const outside = box('outside', { left: '20px', top: '20px', width: '100px', height: '40px' })

  start([{ id: 'deep', target: { elements: () => target, interactive: true } }])

  // One scrim inside the scroller so the cutout tracks its content for free,
  // and one outside so the rest of the page is not left bright and clickable.
  expect(centre(target)).toBe(target)
  expect(centre(outside)).not.toBe(outside)
  // Whichever part of the outer layer answers — it paints, and blocks with
  // rectangles that keep clear of the hole — the page underneath does not.
  expect(absorbed(outside)).toBe(true)
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
  keep(scroller)

  start([{ id: 'deep', target: { elements: () => target, interactive: true } }])

  // The reason this is checked by geometry rather than by hit-testing: an
  // engine can leave a layer out of `elementFromPoint` and still use it to
  // decide what a wheel scrolls. The panel then stops scrolling under the
  // pointer, and no assertion about hit-testing can see it. Nothing outside the
  // scroller may have any geometry over it that asks to be hit.
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

test('a fixed target keeps its hole while the page scrolls under it', () => {
  // Tall enough to scroll, so there is a scroll for the hole to be carried
  // off by. The document's scrim would be: it lives in the document and rides
  // it, while a fixed target stays where it is.
  const spacer = keep(document.createElement('div'))
  spacer.style.height = '3000px'
  document.body.append(spacer)
  const target = box('pinned', { left: '100px', top: '100px', width: '120px', height: '40px' })

  start([{ id: 'one', target: { elements: () => target, interactive: true } }])

  // The layer is fixed too, so neither moves. Nothing here runs on scroll.
  expect(getComputedStyle(scrim()!).position).toBe('fixed')
  window.scrollTo(0, 400)
  expect(centre(target)).toBe(target)
  window.scrollTo(0, 0)
})

test('a fixed element an ancestor has taken back into the flow rides the page', () => {
  // A transform on the card makes it the containing block, and the "fixed"
  // badge inside is then an absolutely positioned child of it and scrolls with
  // the page. The engine says which, and the hole has to ride with it.
  const spacer = keep(document.createElement('div'))
  spacer.style.height = '3000px'
  document.body.append(spacer)
  const card = keep(document.createElement('div'))
  Object.assign(card.style, {
    position: 'absolute',
    left: '100px',
    top: '300px',
    width: '200px',
    height: '100px',
    transform: 'translateX(0)',
  })
  const badge = document.createElement('button')
  badge.textContent = 'badge'
  Object.assign(badge.style, {
    position: 'fixed',
    left: '10px',
    top: '10px',
    width: '120px',
    height: '40px',
  })
  card.append(badge)
  document.body.append(card)

  start([{ id: 'one', target: { elements: () => badge, interactive: true } }])

  expect(getComputedStyle(scrim()!).position).toBe('absolute')
  window.scrollTo(0, 200)
  expect(centre(badge)).toBe(badge)
  window.scrollTo(0, 0)
})

/**
 * A target the page has to be scrolled to reach: a tall document, and a button
 * in its flow far below the fold.
 *
 * Absolute rather than fixed, because a fixed target is carried by the viewport
 * and there is nothing to scroll it to — which is one of the tests below.
 */
function belowTheFold(top: number): HTMLElement {
  const spacer = keep(document.createElement('div'))
  spacer.style.height = `${top + 1000}px`
  document.body.append(spacer)
  const target = document.createElement('button')
  target.textContent = 'far'
  Object.assign(target.style, {
    position: 'absolute',
    left: '100px',
    top: `${top}px`,
    width: '120px',
    height: '40px',
    margin: '0',
  })
  spacer.append(target)
  return target
}

/** The viewport, in the coordinates a target's own box is reported in. */
const port = () => ({
  height: document.documentElement.clientHeight,
  width: document.documentElement.clientWidth,
})

/**
 * How far the middle of `el`'s cutout is from the middle of the screen.
 *
 * The cutout rather than the element, because that is what is brought in: the
 * hole overhangs the element by the step's `padding`, and an asked-for
 * `scroll-margin` leans the box further. `room` is what to add to each side,
 * top first.
 */
const offCentre = (el: Element, room: [number, number] = [8, 8]): number => {
  const r = el.getBoundingClientRect()
  return (r.top - room[0] + (r.bottom + room[1])) / 2 - port().height / 2
}

test('a step told to scroll brings its target into view before drawing it', () => {
  const target = belowTheFold(2000)

  start([{ id: 'far', target: { elements: () => target, interactive: true }, scroll: true }])

  // On screen and reachable, which together are the whole point: without the
  // scroll the hole is cut in a scrim nobody can see.
  expect(centre(target)).toBe(target)
  // The middle of the screen, not the edge it was past: a step exists to draw
  // attention, and the cutout — the element plus the step's padding — is what
  // gets centred.
  expect(offCentre(target)).toBeCloseTo(0, 0)
  window.scrollTo(0, 0)
})

test('a step that says nothing about scrolling leaves the page where it was', () => {
  // The default, and it is off. Where the page is scrolled to is the
  // application's own state, so a tour is not handed it.
  const target = belowTheFold(2000)

  start([{ id: 'far', target: { elements: () => target, interactive: true } }])

  expect(window.scrollY).toBe(0)
  window.scrollTo(0, 0)
})

test('a target at the end of the content lands as near the middle as it can', () => {
  // The case that has to be accepted rather than solved: centring this would
  // need a scroll past the end of the page. Nothing in the geometry clamps —
  // the scrollport does — so the target ends up low on the screen and whole.
  const spacer = keep(document.createElement('div'))
  spacer.style.height = '2100px'
  document.body.append(spacer)
  const target = document.createElement('button')
  target.textContent = 'last'
  Object.assign(target.style, {
    position: 'absolute',
    left: '100px',
    top: '2000px',
    width: '120px',
    height: '40px',
    margin: '0',
  })
  spacer.append(target)

  start([{ id: 'last', target: { elements: () => target, interactive: true }, scroll: true }])

  expect(centre(target)).toBe(target)
  // Below the middle, and at the foot of the scroll range rather than short of
  // it: as far as the content goes.
  expect(offCentre(target)).toBeGreaterThan(0)
  const end = document.documentElement.scrollHeight - port().height
  expect(window.scrollY).toBeCloseTo(end, 0)
  window.scrollTo(0, 0)
})

test('a target taller than half the screen leads with its top edge, at the middle', () => {
  // Centring a hole this tall is what leaves the message nowhere to go. Its top
  // edge at the middle always leaves half a screen above the hole, which is a
  // place a message fits, and gives up only the bottom of a target nobody
  // could take in at a glance anyway.
  const spacer = keep(document.createElement('div'))
  spacer.style.height = '4000px'
  document.body.append(spacer)
  const tall = document.createElement('section')
  tall.textContent = 'a long section'
  Object.assign(tall.style, {
    position: 'absolute',
    left: '100px',
    top: '1500px',
    width: '200px',
    height: `${document.documentElement.clientHeight + 400}px`,
    margin: '0',
  })
  spacer.append(tall)

  start([{ id: 'tall', target: { elements: () => tall, interactive: true }, scroll: true }])

  // The cutout's top edge at the middle of the screen, padding included.
  expect(tall.getBoundingClientRect().top - 8).toBeCloseTo(port().height / 2, 0)
  // Which is what leaves the message its half. Nothing here places one, so this
  // is the room rather than the box: half the screen, above the hole.
  expect(tall.getBoundingClientRect().top - 8).toBeGreaterThan(200)
  window.scrollTo(0, 0)
})

test('a target a little over half the screen leads too, and one under it is centred', () => {
  const spacer = keep(document.createElement('div'))
  spacer.style.height = '4000px'
  document.body.append(spacer)
  const half = document.documentElement.clientHeight / 2
  const make = (top: number, height: number): HTMLElement => {
    const el = document.createElement('section')
    Object.assign(el.style, {
      position: 'absolute',
      left: '100px',
      top: `${top}px`,
      width: '200px',
      height: `${height}px`,
      margin: '0',
    })
    spacer.append(el)
    return el
  }
  // Either side of the threshold, the padded box being what is measured.
  const over = make(1500, half + 40)
  const under = make(2600, half - 40)

  start([{ id: 'over', target: () => over, scroll: true }])
  expect(over.getBoundingClientRect().top - 8).toBeCloseTo(half, 0)

  const leko = start([{ id: 'under', target: () => under, scroll: true }])
  const cutout = under.getBoundingClientRect()
  expect((cutout.top - 8 + cutout.bottom + 8) / 2).toBeCloseTo(half, 0)
  leko.stop()
  window.scrollTo(0, 0)
})

test('the instance can ask for it, and a step can say no', () => {
  const target = belowTheFold(2000)

  start([{ id: 'far', target: { elements: () => target, interactive: true }, scroll: false }], {
    scroll: true,
  })

  // Step, then instance: the nearer tier that says anything wins, the same way
  // `padding` and `radius` are read.
  expect(window.scrollY).toBe(0)

  start([{ id: 'far', target: { elements: () => target, interactive: true } }], { scroll: true })
  expect(window.scrollY).toBeGreaterThan(0)
  window.scrollTo(0, 0)
})

test('a target already in view is left exactly where it is', () => {
  const target = belowTheFold(2000)
  // Somewhere the viewer has settled, with the target well inside the screen.
  window.scrollTo(0, 2000 - port().height / 2)
  const settled = window.scrollY

  start([{ id: 'near', target: { elements: () => target, interactive: true }, scroll: true }])

  // A step arriving does not nudge a page somebody has already put where they
  // wanted it.
  expect(window.scrollY).toBe(settled)
  window.scrollTo(0, 0)
})

test('scroll-margin on the target is honoured over the step padding', () => {
  const target = belowTheFold(2000)
  // What an application says about its own sticky chrome. Leko cannot guess it,
  // so where it is written it wins.
  target.style.scrollMarginBottom = '120px'

  start([{ id: 'far', target: { elements: () => target, interactive: true }, scroll: true }])

  // The box that gets centred is the one the margin asked for, so a margin on
  // one side alone leans the target away from that side — off centre by half of
  // what it asked for, and clear of whatever it was asked for on account of.
  expect(offCentre(target, [8, 120])).toBeCloseTo(0, 0)
  expect(target.getBoundingClientRect().bottom + 120).toBeLessThanOrEqual(port().height)
  window.scrollTo(0, 0)
})

test('every scrollport carrying the target is scrolled, innermost first', () => {
  const spacer = keep(document.createElement('div'))
  spacer.style.height = '3000px'
  document.body.append(spacer)
  const scroller = keep(document.createElement('div'))
  Object.assign(scroller.style, {
    position: 'absolute',
    left: '40px',
    top: '1600px',
    width: '300px',
    height: '200px',
    overflow: 'auto',
  })
  const content = document.createElement('div')
  content.style.height = '1200px'
  const target = document.createElement('button')
  target.textContent = 'deep'
  Object.assign(target.style, {
    position: 'absolute',
    left: '20px',
    top: '900px',
    width: '120px',
    height: '40px',
    margin: '0',
  })
  content.append(target)
  scroller.append(content)
  spacer.append(scroller)

  start([{ id: 'deep', target: { elements: () => target, interactive: true }, scroll: true }])

  // Both ports moved: the panel to bring the row into itself, and the page to
  // bring the panel onto the screen. A viewer who does not know there is a
  // scroller at all could not have found this row.
  expect(scroller.scrollTop).toBeGreaterThan(0)
  expect(window.scrollY).toBeGreaterThan(0)
  expect(centre(target)).toBe(target)
  window.scrollTo(0, 0)
})

test('a fixed target is not scrolled to, having nowhere to be scrolled', () => {
  const spacer = keep(document.createElement('div'))
  spacer.style.height = '3000px'
  document.body.append(spacer)
  const pinned = box('pinned', { left: '100px', top: '100px', width: '120px', height: '40px' })
  window.scrollTo(0, 600)
  const settled = window.scrollY

  start([{ id: 'one', target: { elements: () => pinned, interactive: true }, scroll: true }])

  // Its chain is the viewport alone, and the viewport does not scroll. Moving
  // the page under it would move everything except the target.
  expect(window.scrollY).toBe(settled)
  expect(centre(pinned)).toBe(pinned)
  window.scrollTo(0, 0)
})

/**
 * A near target at the top of a tall page and a far one below the fold, both in
 * the flow. The pair every test about a glide needs: a step to be standing on,
 * and a step to be carried to.
 */
function nearAndFar(): [HTMLElement, HTMLElement] {
  const near = belowTheFold(2000)
  near.style.top = '40px'
  const far = document.createElement('button')
  far.textContent = 'far'
  Object.assign(far.style, {
    position: 'absolute',
    left: '100px',
    top: '2000px',
    width: '120px',
    height: '40px',
    margin: '0',
  })
  near.parentElement!.append(far)
  return [near, far]
}

/**
 * Long enough into a glide that the page has moved and short enough that no
 * engine has finished. The fastest measured is WebKit at about 190ms, and
 * Firefox is moving by its second frame — `spike/a-smooth-scroll-settling/`.
 *
 * Only used where a test has to *do* something mid-flight. A test that
 * **looks** at something mid-flight watches every frame instead; see
 * `duringGlide`.
 */
const MID_GLIDE = 100

test('a glide draws nothing until the page has stopped', async () => {
  // The staging, and the reason for it: at 320ms into a smooth scroll Chromium
  // can still have most of the trip to go, and a hole is placed from where the
  // target is on screen.
  const [near, far] = nearAndFar()

  const leko = start(
    [
      { id: 'near', target: { elements: () => near, interactive: true } },
      { id: 'far', target: { elements: () => far, interactive: true }, scroll: true },
    ],
    // A real morph, because the glide is armed by the same number.
    { duration: 320 },
  )
  await shown()
  const held = scrim()!.style.maskPosition
  expect(held).not.toBe('')

  press()
  const flight = await duringGlide(held)

  const drawn = flight.findIndex((f) => f.mask !== held)
  expect(drawn).toBeGreaterThanOrEqual(0)
  // **Scroll first, draw second**, in the one form that holds whatever an engine
  // does with a smooth scroll: by the tick the step was drawn the page had
  // already moved, and it did not move again afterwards. A step drawn before
  // the page set off fails the first half; a morph running alongside a glide
  // fails the second, because the page goes on moving under a hole already
  // placed.
  expect(flight[drawn]!.scrollY).toBeGreaterThan(0)
  const after = flight.slice(drawn).map((f) => f.scrollY)
  expect(after).toEqual(after.map(() => after[0]))
  await stopped()
  // And once it stops, the step it was gliding towards, against where the page
  // ended up.
  expect(scrim()!.style.maskPosition).not.toBe(held)
  expect(centre(far)).toBe(far)
  expect(offCentre(far)).toBeCloseTo(0, 0)
  leko.stop()
  window.scrollTo(0, 0)
})

test('an engine that drops a smooth scroll is asked again outright', async () => {
  // Firefox drops a smooth scroll aimed at a scroller well below the fold: the
  // offset never moves and no `scrollend` ever comes
  // (`spike/a-smooth-scroll-settling/`, question 4). Panels are set outright
  // for that reason, so the glide never meets it there, and no engine has been
  // seen to do it to the document. The guard is kept all the same — a smooth
  // scroll can be dropped in silence, and a tour that only asked nicely would
  // wait out its deadline and then draw a step whose target is still off
  // screen. Mocked, because no engine this suite runs in does it to the page.
  const [, far] = nearAndFar()
  const scrollTo = window.scrollTo.bind(window)
  vi.spyOn(window, 'scrollTo').mockImplementation((...args: unknown[]) => {
    const options = args[0]
    // Dropped in silence, the way an engine drops it: no movement, no event.
    if (typeof options === 'object' && (options as ScrollToOptions).behavior === 'smooth') return
    ;(scrollTo as (...a: unknown[]) => void)(...args)
  })

  start([{ id: 'far', target: { elements: () => far, interactive: true }, scroll: true }], {
    duration: 320,
  })
  await stopped()

  // Set outright instead, and the step drawn against where that landed.
  expect(offCentre(far)).toBeCloseTo(0, 0)
  expect(centre(far)).toBe(far)
  window.scrollTo(0, 0)
})

test('a scroll the port cannot make is not waited out to the deadline', async () => {
  // A target hanging off the left edge of a page already against that edge. The
  // delta asks for a scroll left and the port has nowhere to go, so nothing
  // moves — and a scroll that moves nothing has nothing to say it is over. A
  // tour that only waited on `scrollend` would stand dimmed with no step on it
  // for the whole of the deadline; this one is set outright, to no effect, and
  // drawn.
  const target = keep(document.createElement('button'))
  target.textContent = 'edge'
  Object.assign(target.style, {
    position: 'absolute',
    left: '-60px',
    top: '100px',
    width: '120px',
    height: '40px',
    margin: '0',
  })
  document.body.append(target)
  const began = performance.now()

  start([{ id: 'edge', target: { elements: () => target, interactive: true }, scroll: true }], {
    duration: 320,
  })

  // Nothing yet: the arrival is waiting on a glide, and a first step has no
  // scrim until it is drawn.
  expect(scrim()).toBeNull()
  // Drawn well inside the deadline, which is 2.5s. Waited for on the scrim
  // rather than the message, because the scrim is made the moment the step is
  // drawn and the message only once a morph has run.
  while (!scrim()) {
    if (performance.now() - began > 2000) throw new Error('drawn only when the deadline ran out')
    await pause(TICK)
  }
  expect(window.scrollX).toBe(0)
  window.scrollTo(0, 0)
})

test('a visitor who asked for reduced motion has the page set outright, as the morph is', () => {
  // One predicate, read by the morph and by the scroll before it, so the two
  // cannot disagree about whether the tour is moving things or setting them.
  // Mocked at `matchMedia`, which is the one place the preference is read.
  const target = belowTheFold(2000)
  const matchMedia = window.matchMedia.bind(window)
  vi.spyOn(window, 'matchMedia').mockImplementation((query: string) =>
    query.includes('prefers-reduced-motion')
      ? ({ matches: true, media: query } as MediaQueryList)
      : matchMedia(query),
  )

  start([{ id: 'far', target: { elements: () => target, interactive: true }, scroll: true }], {
    duration: 320,
  })

  // The same task as the arrival: nothing glided, nothing morphed, and the step
  // is already drawn against where the page was put.
  expect(centre(target)).toBe(target)
  expect(offCentre(target)).toBeCloseTo(0, 0)
  window.scrollTo(0, 0)
})

test('a nested panel is set rather than glided, so the page delta is exact', async () => {
  // Firefox does not scroll an off-screen scroller smoothly at all — it does
  // not scroll it — and off screen is where a panel is while the page has yet
  // to reach it. So a panel is put where it belongs outright.
  const spacer = keep(document.createElement('div'))
  spacer.style.height = '3000px'
  document.body.append(spacer)
  const scroller = keep(document.createElement('div'))
  Object.assign(scroller.style, {
    position: 'absolute',
    left: '40px',
    top: '1600px',
    width: '300px',
    height: '200px',
    overflow: 'auto',
  })
  const content = document.createElement('div')
  content.style.height = '1200px'
  const target = document.createElement('button')
  target.textContent = 'deep'
  Object.assign(target.style, {
    position: 'absolute',
    left: '20px',
    top: '900px',
    width: '120px',
    height: '40px',
    margin: '0',
  })
  content.append(target)
  scroller.append(content)
  spacer.append(scroller)

  start([{ id: 'deep', target: { elements: () => target, interactive: true }, scroll: true }], {
    duration: 320,
  })

  // The panel is already where it belongs, in the same task the step arrived
  // in, while the page is still on its way.
  expect(scroller.scrollTop).toBeGreaterThan(0)

  await stopped()
  expect(centre(target)).toBe(target)
  window.scrollTo(0, 0)
})

test('a step arriving during a glide draws its own step, not the one gliding', async () => {
  const [near, far] = nearAndFar()

  // The gliding step waits for a signal, which is how an arrival lands in the
  // middle of a glide at all: the message is away while the page moves, so
  // there is no control to press, and the application reporting something is
  // the one thing that can still move the tour.
  const leko = start(
    [
      { id: 'near', target: { elements: () => near, interactive: true } },
      {
        id: 'far',
        target: { elements: () => far, interactive: true },
        scroll: true,
        awaits: 'landed',
      },
      { id: 'back', target: { elements: () => near, interactive: true } },
    ],
    { duration: 320 },
  )
  await shown()
  const onNear = scrim()!.style.maskPosition

  press()
  await pause(MID_GLIDE)
  leko.reached('landed')
  await stopped()

  expect(leko.step?.id).toBe('back')
  // The hole is back around `near`, which is what the step that arrived points
  // at. A glide resolving after the tour has moved past it draws nothing.
  expect(scrim()!.style.maskPosition).toBe(onNear)
  window.scrollTo(0, 0)
})

test('a glide the tour has moved past cannot set the page a moment later', async () => {
  // The guard that sets an unmoved page outright belongs to the wait it is part
  // of, and goes when an arrival replaces that wait — or a step the tour has
  // already left would move the page out from under the one being shown, 120ms
  // after nobody asked. Mocked as a dropped scroll, because that is the one
  // case in which the page has not moved by the time the guard looks.
  const [near, far] = nearAndFar()
  const scrollTo = window.scrollTo.bind(window)
  vi.spyOn(window, 'scrollTo').mockImplementation((...args: unknown[]) => {
    const options = args[0]
    if (typeof options === 'object' && (options as ScrollToOptions).behavior === 'smooth') return
    ;(scrollTo as (...a: unknown[]) => void)(...args)
  })
  const leko = start(
    [
      { id: 'near', target: { elements: () => near, interactive: true } },
      {
        id: 'far',
        target: { elements: () => far, interactive: true },
        scroll: true,
        awaits: 'landed',
      },
      { id: 'back', target: { elements: () => near, interactive: true } },
    ],
    { duration: 320 },
  )
  await shown()

  press()
  // Inside the 120ms the wait gives a glide to have begun.
  await pause(40)
  leko.reached('landed')
  // Well past it, and short of the deadline, which is 2.5s.
  await pause(400)

  expect(leko.step?.id).toBe('back')
  expect(window.scrollY).toBe(0)
  window.scrollTo(0, 0)
})

test('a step that scrolls, arriving during a glide, lands where it meant to', async () => {
  // The page is mid-flight when the second scroll is asked for, and the box was
  // measured against the `scrollY` this task can see. Asked for as an offset it
  // lands; asked for as a `scrollBy` it landed 474px off in WebKit, which
  // resolves a delta against where its glide has got to rather than where
  // `scrollY` says (`spike/a-smooth-scroll-settling/`, question 5).
  const [near, far] = nearAndFar()
  const spacer = near.parentElement!
  spacer.style.height = '5000px'
  const other = document.createElement('button')
  other.textContent = 'other'
  Object.assign(other.style, {
    position: 'absolute',
    left: '100px',
    top: '4000px',
    width: '120px',
    height: '40px',
    margin: '0',
  })
  spacer.append(other)

  const leko = start(
    [
      { id: 'near', target: { elements: () => near, interactive: true } },
      {
        id: 'far',
        target: { elements: () => far, interactive: true },
        scroll: true,
        awaits: 'landed',
      },
      { id: 'other', target: { elements: () => other, interactive: true }, scroll: true },
    ],
    { duration: 320 },
  )
  await shown()

  press()
  await pause(MID_GLIDE)
  leko.reached('landed')
  await stopped()

  expect(leko.step?.id).toBe('other')
  expect(centre(other)).toBe(other)
  expect(offCentre(other)).toBeCloseTo(0, 0)
  window.scrollTo(0, 0)
})

test('a resize redraws the step without scrolling it again', () => {
  const target = belowTheFold(2000)

  start([{ id: 'far', target: { elements: () => target, interactive: true }, scroll: true }])
  // The viewer has read the step and moved on, on purpose.
  window.scrollTo(0, 300)

  window.dispatchEvent(new Event('resize'))

  // A redraw puts the step back where the page is now. Only an arrival scrolls.
  expect(window.scrollY).toBeCloseTo(300, 0)
  window.scrollTo(0, 0)
})

test('a resize that pins the target puts the layers back under it', () => {
  // A breakpoint that pins a header is the tour standing still while the
  // surface under it changes: the target leaves the document for the viewport
  // without the machine hearing anything. A document layer left under it rides
  // the page, so the hole would be carried off by the next scroll while the
  // header stayed — and the blocking rectangles left over the hole would cover
  // the element the step opened.
  const spacer = keep(document.createElement('div'))
  spacer.style.height = '3000px'
  document.body.append(spacer)
  const target = box('header', {
    position: 'absolute',
    left: '100px',
    top: '100px',
    width: '120px',
    height: '40px',
  })

  start([{ id: 'one', target: { elements: () => target, interactive: true } }])
  expect(getComputedStyle(scrim()!).position).toBe('absolute')

  target.style.position = 'fixed'
  window.dispatchEvent(new Event('resize'))

  expect(getComputedStyle(scrim()!).position).toBe('fixed')
  window.scrollTo(0, 400)
  expect(centre(target)).toBe(target)
  window.scrollTo(0, 0)
})

test('a resize while a retry waits leaves the standing hole alone', () => {
  // The step is drawn, its target is gone for a moment, and the page resizes
  // inside that window. There is nothing to restack against: rebuilding the
  // layers from the document would take the hole and the blocking rectangles
  // with them and cut nothing in their place, so the page would be dimmed with
  // nothing held back at all.
  const target = box('target', { left: '100px', top: '100px', width: '120px', height: '40px' })
  target.id = 'anchor'
  const far = box('far', { left: '100px', top: '400px', width: '120px', height: '40px' })
  start([{ id: 'one', target: { elements: '#anchor', interactive: true } }])

  target.remove()
  window.dispatchEvent(new Event('resize'))

  expect(holes()).toBe(1)
  expect(absorbed(far)).toBe(true)
})

test('shaking moves the cutouts, not the scrim', () => {
  const target = box('target', { left: '100px', top: '100px', width: '120px', height: '40px' })
  start([
    { id: 'one', target: { elements: () => target, interactive: true }, validate: () => false },
  ])

  press()

  // Translating the scrim would slide the dimming off the edge of the page.
  const scrimEl = document.querySelector<HTMLElement>('.leko-scrim')!
  expect(getComputedStyle(scrimEl).transform).toBe('none')
})

test('a resize re-places the cutout instead of replaying the opening', async () => {
  const target = box('target', { left: '100px', top: '100px', width: '120px', height: '40px' })
  const far = box('far', { left: '100px', top: '400px', width: '120px', height: '40px' })
  // A real duration, because the bug this pins down was only visible while an
  // animation was running.
  const leko = holding(
    { id: 'story', steps: [{ id: 'one', target: { elements: () => target, interactive: true } }] },
    { duration: 200 },
  )
  begin(leko, 'story')
  await new Promise((r) => setTimeout(r, 300))

  window.dispatchEvent(new Event('resize'))

  // Replaying the opening would blow the cutout up to cover the page, leaving
  // almost nothing dimmed for a few hundred milliseconds.
  expect(absorbed(far)).toBe(true)
  expect(centre(target)).toBe(target)
})

// The ring focus cannot leave. The blocking rectangles stop a click on a hole
// the step did not open, and they do nothing at all about Tab, so without this
// the same element is one key away. Engines disagree about focus, so these run
// in all three rather than in `wiring.test.ts`.

/** Where focus is, named the way a reader would name it. */
const focused = (): string => {
  const el = document.activeElement as HTMLElement | null
  if (!el || el === document.body) return 'nowhere'
  if (el.closest('.leko-message')) return 'the message'
  if (el.closest('.leko-close')) return 'the way out'
  return el.textContent?.trim() ?? el.tagName.toLowerCase()
}

/** Tab `times`, and every place focus landed on the way. */
async function tabbing(times: number): Promise<string[]> {
  const seen: string[] = []
  for (let i = 0; i < times; i += 1) {
    await userEvent.tab()
    seen.push(focused())
  }
  return seen
}

test('a closed step keeps Tab on the message and the way out', async () => {
  const target = box('target', { left: '100px', top: '100px', width: '160px', height: '48px' })
  box('elsewhere', { left: '100px', top: '400px', width: '160px', height: '48px' })

  start([{ id: 'look', target: () => target, message: 'Read this.' }])

  control()!.focus()
  const seen = await tabbing(4)

  // Nothing of the page, however many times it is asked for. The target is
  // shown through the hole and the tour is what answers for it.
  expect(seen).not.toContain('target')
  expect(seen).not.toContain('elsewhere')
  expect(new Set(seen)).toEqual(new Set(['the message', 'the way out']))
})

test('an open step puts its target in the ring and comes back to it', async () => {
  const target = box('target', { left: '100px', top: '100px', width: '160px', height: '48px' })
  box('elsewhere', { left: '100px', top: '400px', width: '160px', height: '48px' })

  start([
    { id: 'use', target: { elements: () => target, interactive: true }, message: 'Press it.' },
  ])

  target.focus()
  const seen = await tabbing(4)

  // Round the ring and back. The step opened its region, so the real button is
  // a stop, and the page around it still is not.
  expect(seen).toContain('target')
  expect(seen).not.toContain('elsewhere')
})

test('shift-tab out of the ring lands on the end it was heading for', async () => {
  const target = box('target', { left: '100px', top: '100px', width: '160px', height: '48px' })
  box('elsewhere', { left: '100px', top: '400px', width: '160px', height: '48px' })

  start([
    { id: 'use', target: { elements: () => target, interactive: true }, message: 'Press it.' },
  ])

  // The first stop in the ring. Backwards out of it is the far end of the ring
  // rather than the page behind, which is the half a forward-only net misses.
  target.focus()
  await userEvent.tab({ shift: true })

  expect(focused()).not.toBe('elsewhere')
  expect(['the message', 'the way out']).toContain(focused())
})

test('a step with nothing to point at covers the page, and the way out is the only stop', async () => {
  const elsewhere = box('elsewhere', {
    left: '100px',
    top: '100px',
    width: '160px',
    height: '48px',
  })

  start([{ id: 'loading', message: 'Loading the draft order…', awaits: 'draft-loaded' }])

  // No region named, so no hole is cut and the page is blocked everywhere.
  expect(holes()).toBe(0)
  expect(absorbed(elsewhere)).toBe(true)

  // Nothing is open, and a step that declares `awaits` has no next control, so
  // the ring is one stop. Tab has nowhere else to be, and where it is, is the
  // way out.
  await userEvent.tab()
  expect(focused()).toBe('the way out')
})

test('focus never lands on the page on its way round the ring', async () => {
  const target = box('target', { left: '100px', top: '100px', width: '160px', height: '48px' })
  // Straight after the target in the tab order, so a ring that let go at the
  // edge of its first segment would put focus here before taking it back.
  const after = box('after', { left: '100px', top: '400px', width: '160px', height: '48px' })

  start([
    { id: 'use', target: { elements: () => target, interactive: true }, message: 'Press it.' },
  ])

  const touched: string[] = []
  const watch = (event: FocusEvent): void => {
    touched.push((event.target as HTMLElement).textContent?.trim() ?? '')
  }
  after.addEventListener('focusin', watch)

  target.focus()
  await tabbing(6)
  after.removeEventListener('focusin', watch)

  // Not once, not even for the turn a net would take to put it back. Tab at the
  // edge of a segment is stepped over before the browser acts on it.
  expect(touched).toEqual([])
})
