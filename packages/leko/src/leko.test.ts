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

test('an element with no box is dropped from its region rather than unioned at the corner', () => {
  const rendered = box('rendered', { left: '300px', top: '300px', width: '120px', height: '40px' })
  // The second element of the region, and not rendered. Its rect is all zeros,
  // which reads as a box at the origin of the viewport rather than as no box.
  const hidden = box('hidden', {
    left: '320px',
    top: '360px',
    width: '120px',
    height: '40px',
    display: 'none',
  })
  const corner = box('corner', { left: '0px', top: '0px', width: '40px', height: '20px' })

  start([{ id: 'one', target: { elements: [() => rendered, () => hidden], interactive: true } }])

  expect(holes()).toBe(1)
  expect(centre(rendered)).toBe(rendered)
  // The union that mattered: one zero box at the origin reaches from the corner
  // of the page to the far edge of whatever else the region names, and whatever
  // the host keeps up there is then open. Constraint 1.
  expect(absorbed(corner)).toBe(true)
})

test('a later region with nothing rendered in it is a hole the step does not cut', () => {
  const target = box('target', { left: '100px', top: '100px', width: '120px', height: '40px' })
  const aside = box('aside', {
    left: '100px',
    top: '400px',
    width: '120px',
    height: '40px',
    display: 'none',
  })
  const corner = box('corner', { left: '0px', top: '0px', width: '40px', height: '20px' })

  start([{ id: 'one', target: [{ elements: () => target, interactive: true }, () => aside] }])

  // The same rule a later region that resolves to nothing already followed.
  expect(holes()).toBe(1)
  expect(centre(target)).toBe(target)
  expect(absorbed(corner)).toBe(true)
})

test('a step whose target has no box draws nothing at all', () => {
  const target = box('target', {
    left: '100px',
    top: '100px',
    width: '120px',
    height: '40px',
    display: 'none',
  })
  target.id = 'anchor'
  const corner = box('corner', { left: '0px', top: '0px', width: '40px', height: '20px' })

  start([{ id: 'one', target: { elements: '#anchor', interactive: true } }])

  // The other face of the same box. Drawn, it was a hole of no area at the
  // corner with the message docked beside it and no retry running, because a
  // hidden target was a found one. Now it is a step whose target is not on the
  // page: nothing is drawn, nothing is blocked, and the page is exactly as it
  // was for as long as the retry runs.
  expect(scrim()).toBeNull()
  expect(centre(corner)).toBe(corner)
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

/** The SVG one mask layer carries, readable again. */
const svgOf = (mask: string): string =>
  decodeURIComponent(/url\("?data:image\/svg\+xml;utf8,([^")]*)"?\)/.exec(mask)?.[1] ?? '')

/** Two decimal places, which is what the mask is written to. */
const round = (n: number): number => Math.round(n * 100) / 100

test("a hole in a scroller is cut where the scroller's own coordinates put it", () => {
  // The claim this pins down is that a draw reading each box once and shifting
  // it into the scrim's space puts the hole where measuring it there directly
  // used to. Those two reach the same number by different arithmetic — one
  // subtraction associated the other way round — so the low bits can differ,
  // and whether the rounding the mask is written to absorbs that is a fact
  // about the rects an engine hands back rather than something to reason out.
  // Hence the fractions below, and hence three engines.
  const panel = keep(document.createElement('div'))
  Object.assign(panel.style, {
    position: 'fixed',
    left: '40.5px',
    top: '40.5px',
    width: '300px',
    height: '200px',
    overflow: 'auto',
    border: '3.5px solid black',
    padding: '7.5px',
  })
  const content = document.createElement('div')
  content.style.height = '1400px'
  const target = document.createElement('button')
  Object.assign(target.style, {
    position: 'absolute',
    left: '20.5px',
    top: '400.25px',
    width: '120.5px',
    height: '40.25px',
    margin: '0',
  })
  content.append(target)
  panel.append(content)
  document.body.append(panel)
  panel.scrollTop = 137

  const PADDING = 8
  start([{ id: 'deep', target: { elements: () => target, interactive: true }, padding: PADDING }])

  // Where the hole belongs, worked out here from the page rather than from
  // anything Leko wrote: the target's box on screen, brought inside the panel's
  // border and forward by however far its content has been scrolled, and grown
  // by the step's padding.
  const r = target.getBoundingClientRect()
  const c = panel.getBoundingClientRect()
  const x = r.left - c.left - panel.clientLeft + panel.scrollLeft - PADDING
  const y = r.top - c.top - panel.clientTop + panel.scrollTop - PADDING

  const layer = scrim()!
  // One mask layer for the surface and one per hole, so the hole is the second.
  const placed = layer.style.maskPosition.split(',')[1]!.trim().split(/\s+/).map(parseFloat)
  expect(placed[0]!).toBeCloseTo(round(x), 2)
  expect(placed[1]!).toBeCloseTo(round(y), 2)

  // And the image is the size of the hole, whole: nothing is clipped away here,
  // so the rect inside it rides at the origin.
  const svg = svgOf(layer.style.maskImage)
  expect(svg).toContain(`width="${round(r.width + PADDING * 2)}"`)
  expect(svg).toContain(`height="${round(r.height + PADDING * 2)}"`)
  expect(svg).toContain('<rect x="0" y="0"')
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

/**
 * Two small elements one above the other on a tall page, `gap` apart, for a
 * region that names both. The hole is the union, and the union is what the
 * tests below expect to see brought in.
 */
function twoApart(gap: number): [HTMLElement, HTMLElement] {
  const upper = belowTheFold(2000)
  upper.parentElement!.style.height = '6000px'
  const lower = document.createElement('button')
  lower.textContent = 'lower'
  Object.assign(lower.style, {
    position: 'absolute',
    left: '100px',
    top: `${2000 + gap}px`,
    width: '120px',
    height: '40px',
    margin: '0',
  })
  upper.parentElement!.append(lower)
  return [upper, lower]
}

test('a region of several elements is brought in by its hole, not its first element', () => {
  const [upper, lower] = twoApart(200)

  start([
    {
      id: 'pair',
      target: { elements: [() => upper, () => lower], interactive: true },
      scroll: true,
    },
  ])

  // One hole around both, so it is the hole that lands at the middle: the
  // upper element above it and the lower below it by the same amount. Centred
  // on the first element alone, the hole would sit half the gap low, and a gap
  // wide enough would leave the lower element past the fold.
  const hole = {
    top: upper.getBoundingClientRect().top,
    bottom: lower.getBoundingClientRect().bottom,
  }
  expect((hole.top - 8 + hole.bottom + 8) / 2).toBeCloseTo(port().height / 2, 0)
  expect(offCentre(upper)).toBeCloseTo(-100, 0)
  expect(centre(upper)).toBe(upper)
  expect(centre(lower)).toBe(lower)
  window.scrollTo(0, 0)
})

test('a region whose hole is taller than half the screen leads with its top edge', () => {
  // Two elements each a fraction of the screen, far enough apart that the hole
  // around them is not. It is the hole's height the rule reads, so this one
  // leads like a tall section does and leaves the message its half above.
  const half = document.documentElement.clientHeight / 2
  const [upper, lower] = twoApart(half + 100)

  start([{ id: 'pair', target: { elements: [() => upper, () => lower] }, scroll: true }])

  expect(upper.getBoundingClientRect().top - 8).toBeCloseTo(half, 0)
  window.scrollTo(0, 0)
})

test('a later region is not brought in', () => {
  // The first region is the one the step is about. A later one is shown to be
  // looked at, and a step that wants it on screen puts it in the first.
  const [upper, lower] = twoApart(port().height * 2)

  start([
    {
      id: 'linked',
      target: [{ elements: () => upper, interactive: true }, () => lower],
      scroll: true,
    },
  ])

  expect(offCentre(upper)).toBeCloseTo(0, 0)
  expect(lower.getBoundingClientRect().top).toBeGreaterThan(port().height)
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
 * and a step to be carried to. The far one is not very far — a glide grows
 * with its distance, and these tests wait for it.
 */
function nearAndFar(): [HTMLElement, HTMLElement] {
  const near = belowTheFold(2000)
  near.style.top = '40px'
  const far = document.createElement('button')
  far.textContent = 'far'
  Object.assign(far.style, {
    position: 'absolute',
    left: '100px',
    top: '1200px',
    width: '120px',
    height: '40px',
    margin: '0',
  })
  near.parentElement!.append(far)
  return [near, far]
}

/**
 * Long enough into a glide that the page has moved and short enough that it
 * has not finished: the shortest glide below is `nearAndFar`'s, which its
 * distance puts at over a second. The glide is Leko's own, so the only thing that
 * can stretch it is a machine short of frames, and that makes it later rather
 * than earlier.
 *
 * Only used where a test has to *do* something mid-flight. A test that
 * **looks** at something mid-flight watches every tick instead; see
 * `duringGlide`.
 */
const MID_GLIDE = 100

test('a glide draws nothing until the page has stopped', async () => {
  // The staging, and the reason for it: a hole is placed from where the target
  // is on screen, and a page still moving under a morph is a different screen
  // by the time the morph ends — `spike/a-smooth-scroll-settling/`, question 1.
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
  // **Scroll first, draw second**, in the one form that holds however many
  // frames a machine gives the glide: by the tick the step was drawn the page
  // had already moved, and it did not move again afterwards. A step drawn
  // before the page set off fails the first half; a morph running alongside a
  // glide fails the second, because the page goes on moving under a hole
  // already placed.
  expect(flight[drawn]!.scrollY).toBeGreaterThan(0)
  const after = flight.slice(drawn).map((f) => f.scrollY)
  expect(after).toEqual(after.map(() => after[0]))
  await stopped()
  // And once it stops, the step it was gliding towards, against where the page
  // ended up.
  expect(scrim()!.style.maskPosition).not.toBe(held)
  expect(centre(far)).toBe(far)
  // Within a pixel rather than half of one: Firefox lands a glide's fractional
  // destination on a device pixel and reports the offset back in fractions, and
  // the box measured afterwards is off by the difference.
  expect(Math.abs(offCentre(far))).toBeLessThanOrEqual(1)
  leko.stop()
  window.scrollTo(0, 0)
})

test('a scroll the port cannot make is not glided at all', () => {
  // A target hanging off the left edge of a page already against that edge. The
  // delta asks for a scroll left, and the range the page can reach starts where
  // the page is, so the destination clamps to where the page already is. There
  // is nothing to glide, so nothing is waited for: the step is drawn in the
  // same task the arrival came in on, and the page is left alone.
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

  start([{ id: 'edge', target: { elements: () => target, interactive: true }, scroll: true }], {
    duration: 320,
  })

  // The scrim is made the moment the step is drawn, so a scrim already here is
  // a step that did not wait. A first step has none until then.
  expect(scrim()).not.toBeNull()
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
  // A panel is off screen while the page has yet to reach it, so the movement
  // a viewer follows is the page's, and a panel set first makes the page's own
  // delta exact rather than measured against a scroller still in flight.
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

test('a glide the tour has moved past stops where it is', async () => {
  // The glide is Leko's own loop, so an arrival that replaces it cancels the
  // next frame and the page stays where the last one put it — rather than
  // sliding on to a step the tour has left, under the step that overtook it.
  const [near, far] = nearAndFar()
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
  await pause(MID_GLIDE)
  leko.reached('landed')
  // Wherever the page was when the tour moved on is where it stays. Read here,
  // rather than asserted to be short of the destination, because a machine
  // short of frames can have jumped the whole way in one; what holds on every
  // machine is that nothing moves it after this.
  const left = window.scrollY
  await stopped()

  expect(leko.step?.id).toBe('back')
  expect(window.scrollY).toBe(left)
  window.scrollTo(0, 0)
})

test('a viewer who scrolls during a glide stops it, and the step is drawn where they left the page', async () => {
  // Each frame reads the offset before it writes one, and a page that is not
  // where the last frame left it was moved by somebody else. Their scroll is
  // not Leko's to undo, so the glide stops and the step is drawn against the
  // page as they put it. Somewhere the glide would never have written to, past
  // its own destination, so a frame that happened to land nearby cannot be
  // mistaken for the viewer.
  const [near, far] = nearAndFar()
  far.parentElement!.style.height = '6000px'
  const leko = start(
    [
      { id: 'near', target: { elements: () => near, interactive: true } },
      { id: 'far', target: { elements: () => far, interactive: true }, scroll: true },
    ],
    { duration: 320 },
  )
  await shown()
  const held = scrim()!.style.maskPosition

  press()
  await pause(MID_GLIDE)
  window.scrollTo(0, 4000)
  await stopped()

  expect(leko.step?.id).toBe('far')
  // Within a pixel rather than equal: Firefox reports the offset back in
  // fractions, and how big the fraction is varies — which is the reason the
  // takeover check has a pixel of tolerance in it, and the same pixel is
  // allowed here.
  expect(Math.abs(window.scrollY - 4000)).toBeLessThanOrEqual(1)
  // Drawn, against the page where the viewer left it: the hole is cut, and it is
  // not the one that was standing.
  expect(scrim()!.style.maskPosition).not.toBe(held)
  window.scrollTo(0, 0)
})

test('a step that scrolls, arriving during a glide, lands where it meant to', async () => {
  // The page is mid-flight when the second scroll is asked for. The first glide
  // is cancelled where it is, the box is measured against the page as it stands,
  // and the second glide runs from there to the offset it computed — so it
  // lands where it meant to, which the browser's own glide only did when asked
  // in one of two spellings (`spike/a-smooth-scroll-settling/`, question 5).
  const [near, far] = nearAndFar()
  const spacer = near.parentElement!
  spacer.style.height = '5000px'
  const other = document.createElement('button')
  other.textContent = 'other'
  Object.assign(other.style, {
    position: 'absolute',
    left: '100px',
    top: '2400px',
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
  // Within a pixel, where every other landing here is within half of one: the
  // box was measured against an offset Firefox reports mid-glide in fractions
  // that are not quite the layout's, and the sum inherits the difference.
  expect(Math.abs(offCentre(other))).toBeLessThanOrEqual(1)
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

test('a resize whose task took the target away leaves the standing hole alone', () => {
  // The step is drawn, its target goes, and the page resizes in the same task.
  // No retry begins — nothing watches a drawn step — so the redraw finds the
  // step still on screen and its target not on the page. There is nothing to
  // restack against: rebuilding the layers from the document would take the
  // hole and the blocking rectangles with them and cut nothing in their place,
  // so the page would be dimmed with nothing held back at all.
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
