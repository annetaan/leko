import { userEvent } from '@vitest/browser/context'
import type { LekoProblem, LekoStep } from '@annetaan/leko-types'
import { expect, test, vi } from 'vitest'

import {
  absorbed,
  advance,
  begin,
  box,
  centre,
  clocked,
  closer,
  frame,
  framed,
  holding,
  holes,
  keep,
  control,
  pause,
  press,
  said,
  scrim,
  shown,
  sideOf,
  start,
  stopped,
  TICK,
  until,
} from './harness.js'

// Claims a browser could answer differently, so every one runs in all three —
// ONBOARDING.md, **Which Vitest project a new test belongs in**. Which step the
// tour is on is `wiring.test.ts`.

test('the target is reachable through the cutout, and the rest of the page is not', async () => {
  const target = box('target', { left: '100px', top: '100px', width: '160px', height: '48px' })
  const other = box('other', { left: '100px', top: '400px', width: '160px', height: '48px' })

  start([{ id: 'one', target: { elements: () => target, interactive: true } }])
  await framed()

  expect(centre(target)).toBe(target)
  expect(absorbed(other)).toBe(true)
})

test('stopping puts the page back', async () => {
  const target = box('target', { left: '100px', top: '100px', width: '160px', height: '48px' })
  const leko = start([{ id: 'one', target: { elements: () => target, interactive: true } }])
  await framed()

  expect(scrim()).not.toBeNull()
  leko.stop()

  expect(scrim()).toBeNull()
  expect(leko.state).toBe('idle')
  expect(centre(target)).toBe(target)
})

test('one region of several targets is one cutout, and what sits between it opens too', async () => {
  const left = box('left', { left: '100px', top: '100px', width: '100px', height: '40px' })
  const right = box('right', { left: '260px', top: '100px', width: '100px', height: '40px' })
  const between = box('between', { left: '210px', top: '105px', width: '40px', height: '30px' })

  start([{ id: 'columns', target: { elements: [() => left, () => right], interactive: true } }])
  await framed()

  expect(centre(left)).toBe(left)
  expect(centre(right)).toBe(right)
  // Documented consequence of a union, not an accident: pass adjacent elements.
  expect(centre(between)).toBe(between)
})

test('two regions get a cutout each rather than being unioned', async () => {
  const target = box('target', { left: '60px', top: '400px', width: '120px', height: '40px' })
  const summary = box('summary', { left: '60px', top: '60px', width: '120px', height: '40px' })
  const between = box('between', { left: '60px', top: '230px', width: '120px', height: '40px' })

  // Two entries of `target`, so two holes. The same two named in one region's
  // `elements` would be the test above, and would open everything between them.
  start([{ id: 'linked', target: [{ elements: () => target, interactive: true }, () => summary] }])
  await framed()

  expect(holes()).toBe(2)
  expect(centre(target)).toBe(target)
  // Shown and not reachable — DESIGN.md, **A hole, and whether it is open**.
  expect(absorbed(summary)).toBe(true)
  expect(absorbed(between)).toBe(true)
})

test('an element with no box is dropped from its region rather than unioned at the corner', async () => {
  const rendered = box('rendered', { left: '300px', top: '300px', width: '120px', height: '40px' })
  // The second element of the region, and not rendered — DESIGN.md, **An
  // element with no box is not found**.
  const hidden = box('hidden', {
    left: '320px',
    top: '360px',
    width: '120px',
    height: '40px',
    display: 'none',
  })
  const corner = box('corner', { left: '0px', top: '0px', width: '40px', height: '20px' })

  start([{ id: 'one', target: { elements: [() => rendered, () => hidden], interactive: true } }])
  await framed()

  expect(holes()).toBe(1)
  expect(centre(rendered)).toBe(rendered)
  // The corner is still blocked, so no hole reached it.
  expect(absorbed(corner)).toBe(true)
})

test('a later region with nothing rendered in it is a hole the step does not cut', async () => {
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
  await framed()

  // The same rule a later region that resolves to nothing already followed.
  expect(holes()).toBe(1)
  expect(centre(target)).toBe(target)
  expect(absorbed(corner)).toBe(true)
})

test('a step whose target has no box draws nothing at all', async () => {
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
  await framed()

  // The other face of the same box — DESIGN.md, **An element with no box is not
  // found when the target is resolved**. Nothing is drawn, nothing is blocked,
  // and the page is as it was for as long as the retry runs.
  expect(scrim()).toBeNull()
  expect(centre(corner)).toBe(corner)
})

// --- which of several matches a step means
//
// DESIGN.md, **Which of several matches a selector means**. `target.test.ts`
// holds the rules; these are about a step asking for one and the hole landing
// on the match it named.

/**
 * Two elements one selector matches, the first faded out. `opacity: 0` rather
 * than `visibility: hidden` because both keep their boxes and only the first is
 * still hit-testable, so a test can say which of the two the hole opened on.
 */
const copies = (): [HTMLElement, HTMLElement] => {
  const inset = { width: '120px', height: '40px', left: '100px' }
  const faded = box('faded', { ...inset, top: '100px', opacity: '0' })
  const seen = box('seen', { ...inset, top: '300px' })
  faded.className = 'copy'
  seen.className = 'copy'
  return [faded, seen]
}

test('a step resolves the visible copy by default', async () => {
  const [faded, seen] = copies()

  start([{ id: 'one', target: { elements: '.copy', interactive: true } }])
  await framed()

  expect(holes()).toBe(1)
  expect(centre(seen)).toBe(seen)
  expect(absorbed(faded)).toBe(true)
})

test('a step resolves the visible copy when it asks for one', async () => {
  const [faded, seen] = copies()

  start([{ id: 'one', target: { elements: '.copy', interactive: true }, resolve: 'visible-first' }])
  await framed()

  expect(holes()).toBe(1)
  expect(centre(seen)).toBe(seen)
  // The first match kept its box, so `first` would have cut the hole here.
  expect(absorbed(faded)).toBe(true)
})

test('the instance setting reaches every step and a step overrides it', async () => {
  const [faded, seen] = copies()

  const leko = holding(
    {
      id: 'copies',
      steps: [
        { id: 'inherits', target: { elements: '.copy', interactive: true } },
        {
          id: 'overrides',
          target: { elements: '.copy', interactive: true },
          resolve: 'visible-first',
        },
      ],
    },
    { resolve: 'first' },
  )
  begin(leko, 'copies')
  await framed()

  // `first` from the instance, which the built-in default would not have given.
  expect(centre(faded)).toBe(faded)

  press()
  await framed()

  expect(centre(seen)).toBe(seen)
  expect(absorbed(faded)).toBe(true)
})

test("the host's own chrome keeps the first match, whatever a step asked for", async () => {
  // Two copies of the host's account menu, the first of them faded out. The
  // instance asks every step for a visible match, and `hostChrome` is not a
  // step's target — DESIGN.md, **Which of several matches a selector means**.
  const faded = box('menu', {
    right: '16px',
    top: '16px',
    left: 'auto',
    width: '180px',
    height: '56px',
    opacity: '0',
  })
  const seen = box('other menu', { left: '16px', top: '16px', width: '180px', height: '56px' })
  faded.className = 'chrome'
  seen.className = 'chrome'
  const target = box('target', { left: '100px', top: '300px', width: '160px', height: '48px' })

  start([{ id: 'one', target: { elements: () => target, interactive: true } }], {
    resolve: 'visible-first',
    hostChrome: '.chrome',
  })
  await framed()

  // So the faded copy at the top right is the box the way out stays off, and
  // the control goes left. The rule would have taken the copy on the left
  // instead and sent it the other way.
  expect(closer()!.getBoundingClientRect().left).toBeLessThan(window.innerWidth / 2)
})

test('a step that reveals its copy in onEnter gets that copy', async () => {
  const [faded, seen] = copies()
  seen.style.display = 'none'

  // The rule is applied after `onEnter` returns — DESIGN.md, **The target is
  // resolved after `onEnter` returns** — so the copy a step opens the panel for
  // is a copy the rule can reach. Without the reveal there is nothing that
  // passes: the faded one is skipped and this one has no box.
  start([
    {
      id: 'one',
      target: { elements: '.copy', interactive: true },
      resolve: 'visible-first',
      onEnter: () => {
        seen.style.display = ''
      },
    },
  ])
  await framed()

  expect(centre(seen)).toBe(seen)
  expect(absorbed(faded)).toBe(true)
})

test('a target that fades in from opacity 0 is found when the grace runs out', async () => {
  const target = box('target', {
    left: '100px',
    top: '100px',
    width: '120px',
    height: '40px',
    opacity: '0',
    transition: 'opacity 50ms',
  })
  target.id = 'anchor'

  start([{ id: 'one', target: { elements: '#anchor', interactive: true } }])
  await framed()
  target.style.opacity = '1'

  // A style change is not a mutation the wait hears, so nothing is drawn until
  // the look on the frame, and once more as the grace runs out — DESIGN.md,
  // **Which of several matches a selector means**.
  expect(scrim()).toBeNull()
  await vi.waitUntil(() => centre(target) === target, { timeout: 2000 })
})

test('a target still at opacity 0 when the grace runs out is lost', async () => {
  const target = box('target', {
    left: '100px',
    top: '100px',
    width: '120px',
    height: '40px',
    opacity: '0',
  })
  target.id = 'anchor'
  const problems: LekoProblem[] = []

  const leko = start([{ id: 'one', target: { elements: '#anchor', interactive: true } }], {
    onDiagnostic: (problem) => problems.push(problem),
  })
  await framed()
  expect(scrim()).toBeNull()

  await vi.waitUntil(() => leko.state === 'idle', { timeout: 5000 })

  expect(scrim()).toBeNull()
  expect(problems).toEqual([expect.objectContaining({ kind: 'target-lost' })])
})

test('a step that says nothing shows its target and does not hand it over', async () => {
  const target = box('target', { left: '100px', top: '100px', width: '160px', height: '48px' })

  start([{ id: 'look', target: () => target }])
  await framed()

  expect(holes()).toBe(1)
  // And the pointer stops at the tour, for the reason README.md gives beside
  // `interactive`.
  expect(absorbed(target)).toBe(true)
})

test('an element inside an svg is a target like any other', async () => {
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
  await framed()

  expect(centre(wanted)).toBe(wanted)
  expect(absorbed(other)).toBe(true)
})

test('what blocks a shown hole sits beside the scrim, never inside it', async () => {
  const target = box('target', { left: '100px', top: '100px', width: '160px', height: '48px' })

  start([{ id: 'look', target: () => target }])
  await framed()

  // DESIGN.md, **The rectangles live beside the scrim, never inside it**, and
  // `spike/blocking-a-hole/` is the page that settled it.
  const caught = centre(target) as HTMLElement
  expect(caught.closest('.leko-scrim')).toBeNull()
  expect(caught.closest('.leko-blocking')).not.toBeNull()
})

test('a step overrides the padding the instance was given', async () => {
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
  await framed()

  // 20px above the target: outside the instance's padding, well inside the
  // step's, so the step is what decided the size of the hole. DESIGN.md, **A
  // story carries no settings**, for why there is no third tier.
  expect(centre(near)).toBe(near)
})

test('the scrim is mounted inside the scroller the target lives in', async () => {
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
  await framed()

  // Inside the scroller, so scrolling moves scrim and target together —
  // DESIGN.md, **Scrolling**.
  expect(scrim()?.parentElement).toBe(scroller)

  scroller.scrollTop = 880
  expect(centre(target)).toBe(target)
})

test('the page outside a scroller is dimmed too, not just the scroller', async () => {
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
  await framed()

  // One scrim inside the scroller so the cutout tracks its content for free,
  // and one outside so the rest of the page is not left bright and clickable.
  expect(centre(target)).toBe(target)
  expect(centre(outside)).not.toBe(outside)
  // Whichever part of the outer layer answers — it paints, and blocks with
  // rectangles that keep clear of the hole — the page underneath does not.
  expect(absorbed(outside)).toBe(true)
})

test('nothing that catches a pointer overlaps the hole cut for a scroller', async () => {
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
  await framed()

  // Geometry rather than hit-testing — DESIGN.md, **Do not go back to blocking
  // with the scrim itself**, for why no assertion about hit-testing can see
  // this. Nothing outside the scroller may have any geometry over the hole that
  // asks to be hit.
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

test("a hole in a scroller is cut where the scroller's own coordinates put it", async () => {
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
  await framed()

  // Where the hole belongs, worked out here from the page rather than from
  // anything Leko wrote: the target's box on screen, brought inside the panel's
  // border, forward by the content's scroll offset, and grown by the step's
  // padding.
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

test("a target the scrim's own mounting moved is drawn where it ended up", async () => {
  // The panel is `static`, so the first layer mounted in it gives it a
  // `position`, and the target — absolutely positioned with an inset, its
  // containing block until then outside the panel — moves into the panel's
  // padding box and onto its scroll. DESIGN.md, **A draw mounts its layers,
  // then reads, then writes**: the hole is cut where the target ends up, which
  // is where it stays for the rest of the step, and not where it stood before
  // Leko touched the page.
  const panel = keep(document.createElement('div'))
  Object.assign(panel.style, {
    marginLeft: '40px',
    marginTop: '40px',
    width: '300px',
    height: '200px',
    overflow: 'auto',
    border: '3px solid black',
  })
  const content = document.createElement('div')
  content.style.height = '1200px'
  const target = document.createElement('button')
  Object.assign(target.style, {
    position: 'absolute',
    left: '20px',
    top: '60px',
    width: '120px',
    height: '40px',
    margin: '0',
  })
  content.append(target)
  panel.append(content)
  document.body.append(panel)
  panel.scrollTop = 30
  expect(getComputedStyle(panel).position).toBe('static')
  const before = target.getBoundingClientRect()

  const PADDING = 8
  start([{ id: 'moved', target: { elements: () => target, interactive: true }, padding: PADDING }])
  await framed()

  // The mounting did move it, or this test is about nothing.
  const after = target.getBoundingClientRect()
  expect(getComputedStyle(panel).position).toBe('relative')
  expect(after.top).not.toBe(before.top)

  expect(centre(target)).toBe(target)
  const c = panel.getBoundingClientRect()
  const x = after.left - c.left - panel.clientLeft + panel.scrollLeft - PADDING
  const y = after.top - c.top - panel.clientTop + panel.scrollTop - PADDING
  const placed = scrim()!.style.maskPosition.split(',')[1]!.trim().split(/\s+/).map(parseFloat)
  expect(placed[0]!).toBeCloseTo(round(x), 2)
  expect(placed[1]!).toBeCloseTo(round(y), 2)
})

test('a fixed target keeps its hole while the page scrolls under it', async () => {
  // Tall enough to scroll, so there is a scroll for the hole to be carried
  // off by. The document's scrim would be: it lives in the document and rides
  // it, while a fixed target stays where it is.
  const spacer = keep(document.createElement('div'))
  spacer.style.height = '3000px'
  document.body.append(spacer)
  const target = box('pinned', { left: '100px', top: '100px', width: '120px', height: '40px' })

  start([{ id: 'one', target: { elements: () => target, interactive: true } }])
  await framed()

  // DESIGN.md, **A `position: fixed` target is carried by the viewport, so its
  // layer is too**.
  expect(getComputedStyle(scrim()!).position).toBe('fixed')
  window.scrollTo(0, 400)
  expect(centre(target)).toBe(target)
  window.scrollTo(0, 0)
})

test('a pinned sticky target keeps its hole while the page scrolls under it', async () => {
  // The second of a sticky target's two states — DESIGN.md, **A sticky target
  // is drawn in the state it is in, and there are two**. The page is taken past
  // the pin before the story starts, so the bar is held against the top of the
  // screen when the step is drawn, and the layer is the viewport's.
  const block = keep(document.createElement('div'))
  block.style.position = 'relative'
  const lead = document.createElement('div')
  lead.style.height = '900px'
  const bar = document.createElement('button')
  bar.textContent = 'filters'
  Object.assign(bar.style, { position: 'sticky', top: '0', display: 'block', height: '40px' })
  const tail = document.createElement('div')
  tail.style.height = '2400px'
  block.append(lead, bar, tail)
  document.body.append(block)
  window.scrollTo(0, bar.getBoundingClientRect().top + window.scrollY + 300)

  start([{ id: 'one', target: { elements: () => bar, interactive: true } }])
  await framed()

  expect(getComputedStyle(scrim()!).position).toBe('fixed')
  window.scrollTo(0, window.scrollY + 500)
  expect(centre(bar)).toBe(bar)
  window.scrollTo(0, 0)
})

test('a sticky target pinned inside a panel keeps its hole while the panel scrolls', async () => {
  // The other kind of pinned: held against a scrollport that is not the
  // viewport, which `position: fixed` cannot express — DESIGN.md, **A layer
  // glued to a scrollport is what `position: fixed` cannot say**.
  const panel = keep(document.createElement('div'))
  Object.assign(panel.style, {
    position: 'relative',
    width: '300px',
    height: '200px',
    overflow: 'auto',
    padding: '8px',
  })
  const block = document.createElement('div')
  block.style.position = 'relative'
  const lead = document.createElement('div')
  lead.style.height = '300px'
  const head = document.createElement('button')
  head.textContent = 'status'
  Object.assign(head.style, { position: 'sticky', top: '0', display: 'block', height: '30px' })
  const rows = document.createElement('div')
  rows.style.height = '1200px'
  block.append(lead, head, rows)
  panel.append(block)
  document.body.append(panel)
  panel.scrollTop = 500

  start([{ id: 'one', target: { elements: () => head, interactive: true } }])
  await framed()

  panel.scrollTop = 900
  expect(centre(head)).toBe(head)
})

// A sticky target's hole is corrected on a frame loop, so that it stays under
// the target on both sides of the pin — DESIGN.md, **A sticky target's hole is
// corrected on a frame loop, and that is the only exception to the ban**. Every
// claim below is `centre()`, which is `elementFromPoint`, so it is about the
// mask and the blocking rectangles at once.

/** A bar that pins against the top of the page, with room either side of the pin. */
function stickyBar(): HTMLElement {
  const block = keep(document.createElement('div'))
  block.style.position = 'relative'
  const lead = document.createElement('div')
  lead.style.height = '200px'
  const bar = document.createElement('button')
  bar.textContent = 'filters'
  Object.assign(bar.style, { position: 'sticky', top: '0', display: 'block', height: '40px' })
  const tail = document.createElement('div')
  tail.style.height = '3000px'
  block.append(lead, bar, tail)
  document.body.append(block)
  return bar
}

/**
 * A bar 60px from the foot of the screen at the draw, so the message goes above
 * it, with a long page under it to scroll.
 */
function footBar(position: 'sticky' | 'static'): { bar: HTMLElement; lead: number } {
  const block = keep(document.createElement('div'))
  const lead = document.createElement('div')
  const height = innerHeight - 60
  lead.style.height = `${height}px`
  const bar = document.createElement('button')
  bar.textContent = 'filters'
  Object.assign(bar.style, { position, top: '0', display: 'block', height: '40px' })
  const tail = document.createElement('div')
  tail.style.height = '3000px'
  block.append(lead, bar, tail)
  document.body.append(block)
  return { bar, lead: height }
}

const marker = (): HTMLElement => document.querySelector<HTMLElement>('.leko-anchor')!
const messageBox = (): HTMLElement => document.querySelector<HTMLElement>('.leko-message')!

/**
 * Frames until `is` holds, on the page's own clock, and **says so if it never
 * does**.
 *
 * Real frames rather than {@link clocked}: what is being waited for begins with
 * a `scroll` event, which an engine fires while it updates the rendering rather
 * than when the offset is written, and a fake clock does not run that. The cap
 * is frames rather than time for the reason `until` in `harness.ts` gives.
 */
async function within(is: () => boolean, count: number, what: string): Promise<void> {
  for (let n = 0; n < count; n++) {
    if (is()) return
    await frame()
  }
  if (!is()) throw new Error(`${what} — not within ${count} frames`)
}

test('a sticky target drawn while it rides keeps its hole once it pins', async () => {
  const bar = stickyBar()
  window.scrollTo(0, 0)

  start([{ id: 'one', target: { elements: () => bar, interactive: true } }])
  await framed()

  // Riding, so it is an in-flow element and the layer is the document's.
  expect(getComputedStyle(scrim()!).position).toBe('absolute')
  window.scrollTo(0, 900)
  await within(() => centre(bar) === bar, 30, 'the hole never caught the pinned bar')
  expect(centre(bar)).toBe(bar)
  window.scrollTo(0, 0)
})

test('a sticky target drawn while it is pinned keeps its hole once it rides again', async () => {
  const bar = stickyBar()
  window.scrollTo(0, 900)

  start([{ id: 'one', target: { elements: () => bar, interactive: true } }])
  await framed()

  // Pinned, so the layer is the viewport's — the one a fixed target gets.
  expect(getComputedStyle(scrim()!).position).toBe('fixed')
  window.scrollTo(0, 0)
  await within(() => centre(bar) === bar, 30, 'the hole never came back down with the bar')
  expect(centre(bar)).toBe(bar)
})

test('a sticky head in a panel keeps its hole on both sides of its pin', async () => {
  const panel = keep(document.createElement('div'))
  Object.assign(panel.style, {
    position: 'relative',
    width: '300px',
    height: '200px',
    overflow: 'auto',
    padding: '8px',
  })
  const block = document.createElement('div')
  block.style.position = 'relative'
  const lead = document.createElement('div')
  lead.style.height = '120px'
  const head = document.createElement('button')
  head.textContent = 'status'
  Object.assign(head.style, { position: 'sticky', top: '0', display: 'block', height: '30px' })
  const rows = document.createElement('div')
  rows.style.height = '1200px'
  block.append(lead, head, rows)
  panel.append(block)
  document.body.append(panel)
  panel.scrollTop = 400

  start([{ id: 'one', target: { elements: () => head, interactive: true } }])
  await framed()

  panel.scrollTop = 900
  await within(() => centre(head) === head, 30, 'the hole left the head further down the panel')
  // Back above the pin, where the head rides its own rows again. The layer is
  // still the one glued to the panel — which of the two states a step is drawn
  // in is read once — and the loop is what puts the hole where the head is.
  panel.scrollTop = 40
  await within(() => centre(head) === head, 30, 'the hole never came back down with the head')
  expect(centre(head)).toBe(head)
})

test('the message keeps its side across the pin while that side still has room', async () => {
  const bar = stickyBar()
  window.scrollTo(0, 0)

  start([
    { id: 'one', target: { elements: () => bar, interactive: true }, message: 'Pick a filter' },
  ])
  await framed()

  const before = marker().style.top
  const side = sideOf(messageBox())

  window.scrollTo(0, 900)
  await within(() => marker().style.top !== before, 30, 'the anchor never moved with the hole')
  // The side is kept while it still has room — DESIGN.md, the sticky follow
  // under **A sticky target's hole is corrected on a frame loop, and that is
  // the only exception to the ban** — so what follows the hole is the point
  // the message hangs off, not the decision about where to hang it.
  expect(sideOf(messageBox())).toBe(side)
  window.scrollTo(0, 0)
})

test('the message never covers a sticky target it opened once the target pins', async () => {
  // Near the foot of the screen at the draw, so the message goes above the bar;
  // past the pin, the loop writes the marker and the box is laid out again.
  // Held inside an area, Chromium and Firefox then slide it onto the bar —
  // DESIGN.md, **The message**.
  const { bar, lead: height } = footBar('sticky')
  window.scrollTo(0, 0)

  start([
    { id: 'one', target: { elements: () => bar, interactive: true }, message: 'Pick a filter' },
  ])
  await framed()
  await within(() => messageBox()?.style.visibility === 'visible', 30, 'the message never showed')
  expect(sideOf(messageBox())).toBe('top')

  const before = marker().style.top
  window.scrollTo(0, height + 600)
  await within(() => marker().style.top !== before, 30, 'the anchor never moved with the hole')
  await frame()

  const note = messageBox().getBoundingClientRect()
  const hole = bar.getBoundingClientRect()
  const covers =
    note.left < hole.right &&
    hole.left < note.right &&
    note.top < hole.bottom &&
    hole.top < note.bottom
  expect(covers).toBe(false)
  window.scrollTo(0, 0)
})

test("a pinned target's message moves to a side with room", async () => {
  // Above the bar at the draw, and past the pin the bar is at the top of the
  // screen with nothing above it: a side kept there would be off the screen.
  const { bar, lead } = footBar('sticky')
  window.scrollTo(0, 0)

  start([
    { id: 'one', target: { elements: () => bar, interactive: true }, message: 'Pick a filter' },
  ])
  await framed()
  await within(() => messageBox()?.style.visibility === 'visible', 30, 'the message never showed')
  expect(sideOf(messageBox())).toBe('top')

  window.scrollTo(0, lead + 600)
  await within(() => sideOf(messageBox()) === 'bottom', 30, 'the message never moved below')
  await frame()

  const note = messageBox().getBoundingClientRect()
  const hole = bar.getBoundingClientRect()
  expect(note.top).toBeGreaterThanOrEqual(hole.bottom)
  expect(note.top).toBeGreaterThanOrEqual(0)
  expect(note.bottom).toBeLessThanOrEqual(innerHeight)
  window.scrollTo(0, 0)
})

test("an in-flow target's message keeps its side on a scroll", async () => {
  // Nobody moves the marker of an in-flow target but the browser, so nobody
  // chooses the side again: the message leaves with the hole.
  const { bar, lead } = footBar('static')
  window.scrollTo(0, 0)

  start([
    { id: 'one', target: { elements: () => bar, interactive: true }, message: 'Pick a filter' },
  ])
  await framed()
  await within(() => messageBox()?.style.visibility === 'visible', 30, 'the message never showed')
  expect(sideOf(messageBox())).toBe('top')

  window.scrollTo(0, lead - 20)
  for (let n = 0; n < 6; n++) await frame()
  expect(sideOf(messageBox())).toBe('top')
  window.scrollTo(0, 0)
})

test('an in-flow target rewrites nothing on a scroll', async () => {
  // The loop is armed for a sticky target and for nothing else: the scrim of an
  // in-flow target rides the scroll with it, so a frame spent reading layout
  // for it would break the ban for nothing — DESIGN.md, **A sticky target's
  // hole is corrected on a frame loop, and that is the only exception to the
  // ban**.
  const block = keep(document.createElement('div'))
  const lead = document.createElement('div')
  lead.style.height = '200px'
  const target = document.createElement('button')
  Object.assign(target.style, { display: 'block', height: '40px' })
  const tail = document.createElement('div')
  tail.style.height = '3000px'
  block.append(lead, target, tail)
  document.body.append(block)
  window.scrollTo(0, 0)

  start([{ id: 'one', target: { elements: () => target, interactive: true } }])
  await framed()

  const held = scrim()!.style.maskPosition
  window.scrollTo(0, 400)
  for (let n = 0; n < 6; n++) await frame()
  expect(scrim()!.style.maskPosition).toBe(held)
  window.scrollTo(0, 0)
})

test('a fixed target rewrites nothing on a scroll', async () => {
  const spacer = keep(document.createElement('div'))
  spacer.style.height = '3000px'
  document.body.append(spacer)
  const target = box('pinned', { left: '100px', top: '100px', width: '120px', height: '40px' })
  window.scrollTo(0, 0)

  start([{ id: 'one', target: { elements: () => target, interactive: true } }])
  await framed()

  const held = scrim()!.style.maskPosition
  window.scrollTo(0, 400)
  for (let n = 0; n < 6; n++) await frame()
  expect(scrim()!.style.maskPosition).toBe(held)
  window.scrollTo(0, 0)
})

test('a sticky hole stops following when its target leaves the page', async () => {
  // The same answer a `refit` gives — what was drawn last stays drawn, rather
  // than the page snapping undimmed under somebody.
  const bar = stickyBar()
  window.scrollTo(0, 900)

  start([{ id: 'one', target: { elements: () => bar, interactive: true } }])
  await framed()

  const held = scrim()!.style.maskPosition
  bar.remove()
  window.scrollTo(0, 1400)
  for (let n = 0; n < 6; n++) await frame()
  expect(scrim()!.style.maskPosition).toBe(held)
  window.scrollTo(0, 0)
})

test('a fixed element an ancestor has taken back into the flow rides the page', async () => {
  // A transform on the card makes it the containing block, so the "fixed" badge
  // inside scrolls with the page. DESIGN.md, **Whether the viewport still holds
  // a fixed element is the engine's to say, not a list's**.
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
  await framed()

  expect(getComputedStyle(scrim()!).position).toBe('absolute')
  window.scrollTo(0, 200)
  expect(centre(badge)).toBe(badge)
  window.scrollTo(0, 0)
})

/**
 * A target the page has to be scrolled to reach: a tall document, and a button
 * in its flow far below the fold.
 *
 * Absolute rather than fixed: DESIGN.md,
 * **A `position: fixed` target is not scrolled**.
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
 * hole overhangs the element by the step's `padding`, which every step below
 * leaves at the default of 8.
 */
const offCentre = (el: Element): number => {
  const r = el.getBoundingClientRect()
  return (r.top - 8 + (r.bottom + 8)) / 2 - port().height / 2
}

test('a step told to scroll brings its target into view before drawing it', async () => {
  const target = belowTheFold(2000)

  start([{ id: 'far', target: { elements: () => target, interactive: true }, scroll: true }])
  await framed()

  // On screen and reachable, which together are the whole point: without the
  // scroll the hole is cut in a scrim nobody can see.
  expect(centre(target)).toBe(target)
  // DESIGN.md, **The middle of the port, not the nearest edge**.
  expect(offCentre(target)).toBeCloseTo(0, 0)
  window.scrollTo(0, 0)
})

test('a step that says nothing about scrolling leaves the page where it was', async () => {
  // The default, and it is off — DESIGN.md, **Bringing a target into view**.
  const target = belowTheFold(2000)

  start([{ id: 'far', target: { elements: () => target, interactive: true } }])
  await framed()

  expect(window.scrollY).toBe(0)
  window.scrollTo(0, 0)
})

/** A footer of the host's, fixed along the bottom 150px of the screen. */
const footer = (): HTMLElement =>
  box('footer', { left: '0', bottom: '0', width: '100%', height: '150px' })

test("a step that scrolls brings its target clear of the host's chrome", async () => {
  // On screen at a standing start, and under the footer: the whole viewport
  // would hold it, and only the room the footer leaves does not. DESIGN.md,
  // **The page's port is what the host's chrome leaves of the viewport**.
  const chrome = footer()
  const target = belowTheFold(port().height - 100)

  start([{ id: 'under', target: { elements: () => target, interactive: true }, scroll: true }], {
    hostChrome: () => chrome,
  })
  await framed()

  const r = target.getBoundingClientRect()
  expect(r.bottom).toBeLessThan(chrome.getBoundingClientRect().top)
  expect((r.top + r.bottom) / 2).toBeCloseTo((port().height - 150) / 2, -1)
  window.scrollTo(0, 0)
})

test("a target under the host's chrome is drawn where it is when nothing asked for a scroll", async () => {
  const chrome = footer()
  const target = belowTheFold(port().height - 100)

  start([{ id: 'under', target: { elements: () => target, interactive: true } }], {
    hostChrome: () => chrome,
  })
  await framed()

  expect(window.scrollY).toBe(0)
  window.scrollTo(0, 0)
})

test("the step's padding is part of the box the page is brought to", async () => {
  // Which box leads with its top edge, and where that edge goes, is arithmetic
  // `geometry.test.ts` asks of `scrollDelta` — this is the wiring: that the
  // `padding` the step is read for reaches the room `bringIntoView` is given.
  // A tall target is the only shape that shows it, symmetric room cancelling
  // out of a box that gets centred. DESIGN.md, **A target more than half the
  // port tall leads with its top edge, put at the middle**, and
  // **`scroll-margin` on the target wins over the step's `padding`**.
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
  await framed()

  // The cutout's top edge at the middle of the screen, which is 8px above where
  // the element's own would be. Room of nothing lands the second of these.
  expect(tall.getBoundingClientRect().top - 8).toBeCloseTo(port().height / 2, 0)
  expect(tall.getBoundingClientRect().top).not.toBeCloseTo(port().height / 2, 0)
  window.scrollTo(0, 0)
})

test('the instance can ask for it, and a step can say no', async () => {
  const target = belowTheFold(2000)

  start([{ id: 'far', target: { elements: () => target, interactive: true }, scroll: false }], {
    scroll: true,
  })
  await framed()

  // DESIGN.md, **Settings, and where they are read from**.
  expect(window.scrollY).toBe(0)

  start([{ id: 'far', target: { elements: () => target, interactive: true } }], { scroll: true })
  await framed()
  expect(window.scrollY).toBeGreaterThan(0)
  window.scrollTo(0, 0)
})

/**
 * Two small elements one above the other on a tall page, `gap` apart: one
 * region that names both, or two regions of one each.
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

test('a region the page was brought to is reachable through its hole, every element of it', async () => {
  const [upper, lower] = twoApart(200)

  start([
    {
      id: 'pair',
      target: { elements: [() => upper, () => lower], interactive: true },
      scroll: true,
    },
  ])
  await framed()

  // Which box a region is brought in by is
  // `the box brought in is the one around every element, not the first` in
  // `glide.test.ts`; what is asked here is that the hole is cut against where
  // the page ended up, for the whole region rather than the element the scroll
  // was measured from. DESIGN.md, **What is brought in is the first region's
  // hole, not its first element**.
  expect(centre(upper)).toBe(upper)
  expect(centre(lower)).toBe(lower)
  window.scrollTo(0, 0)
})

test('a later region is not brought in', async () => {
  // Later regions stay where they are — DESIGN.md, **Bringing a target into
  // view**.
  const [upper, lower] = twoApart(port().height * 2)

  start([
    {
      id: 'linked',
      target: [{ elements: () => upper, interactive: true }, () => lower],
      scroll: true,
    },
  ])
  await framed()

  expect(offCentre(upper)).toBeCloseTo(0, 0)
  expect(lower.getBoundingClientRect().top).toBeGreaterThan(port().height)
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
 * **looks** at something mid-flight takes the clock and watches every frame
 * instead; see `a glide draws nothing until the page has stopped`.
 */
const MID_GLIDE = 100

test('a glide draws nothing until the page has stopped', async () => {
  // The staging, and the reason for it: a hole is placed from where the target
  // is on screen, and a page still moving under a morph is a different screen
  // by the time the morph ends — `spike/a-smooth-scroll-settling/`, question 1.
  //
  // On a clock the test owns, so every frame of the flight is sampled whatever
  // the runner is doing. This is the first test in the file to wait on a frame,
  // and it used to pay whatever WebKit's frame interval was at that moment.
  clocked()
  const [near, far] = nearAndFar()

  const leko = start(
    [
      { id: 'near', target: { elements: () => near, interactive: true } },
      { id: 'far', target: { elements: () => far, interactive: true }, scroll: true },
    ],
    // A real morph, because the glide is armed by the same number.
    { duration: 320 },
  )
  // The hand-over's two frames and the opening morph: 320ms is twenty frames,
  // and the words come back on the frame it ends.
  await until(said, 32, 'the first step never said its words')
  const held = scrim()!.style.maskPosition
  expect(held).not.toBe('')

  press()
  // Every frame until the far step has been drawn and its words are back. The
  // hand-over is two frames, the glide is `glideDuration` of the distance —
  // 772px here, so 140 · ∛772 ≈ 1284ms, 81 frames — and the morph after it is
  // twenty more; 202 is room.
  const flight: { scrollY: number; mask: string }[] = []
  await until(
    () => {
      flight.push({ scrollY: window.scrollY, mask: scrim()!.style.maskPosition })
      return said()
    },
    202,
    'the far step never said its words',
  )

  const drawn = flight.findIndex((f) => f.mask !== held)
  expect(drawn).toBeGreaterThan(0)
  // DESIGN.md, **The scroll finishes before the step is drawn, never both at
  // once**: the page had moved by the frame the step was drawn on, had
  // already stopped the frame before, and did not move again afterwards. A step
  // drawn before the page set off fails the first; a morph running alongside a
  // glide fails the last two.
  expect(flight[drawn]!.scrollY).toBeGreaterThan(0)
  expect(flight[drawn - 1]!.scrollY).toBe(flight[drawn]!.scrollY)
  const after = flight.slice(drawn).map((f) => f.scrollY)
  expect(after).toEqual(after.map(() => after[0]))
  // And it glided rather than jumped: more offsets than a start and an end.
  expect(new Set(flight.map((f) => f.scrollY)).size).toBeGreaterThan(2)
  // Once it stops, the step it was gliding towards, against where the page
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

test('a visitor who asked for reduced motion has the page set outright, as the morph is', async () => {
  // `motion.ts` is the one predicate the morph and the scroll before it both
  // read. Mocked at `matchMedia`, which is the one place it looks.
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
  await framed()

  // The same task as the arrival: nothing glided, nothing morphed, and the step
  // is already drawn against where the page was put.
  expect(centre(target)).toBe(target)
  expect(offCentre(target)).toBeCloseTo(0, 0)
  window.scrollTo(0, 0)
})

/** A target two ports deep: a panel well below the fold, and a long list in it. */
function deepInAPanel(): { scroller: HTMLElement; target: HTMLElement } {
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
  return { scroller, target }
}

test('a step that asks for staged leaves its panel until the page has landed', async () => {
  // The seam from the word a host writes to the mode the glide takes:
  // `scrolls()` in `presenter.ts` reads `scroll` off the step and the instance
  // and normalises it, and every other test here says `true`, so nothing but
  // this would notice `'staged'` arriving as a direct scroll. What staged then
  // does with the ports is `glide.test.ts`'s to say; what is asked here is that
  // the word got through — the panel stays where it is while the page moves,
  // which is the answer a direct scroll gives reversed.
  //
  // On a clock the test owns, because `stopped()` cannot tell a starved frame
  // loop from a finished one — `harness.ts`'s {@link stopped} says what that
  // measured.
  clocked()
  const { scroller, target } = deepInAPanel()
  start([{ id: 'deep', target: { elements: () => target, interactive: true }, scroll: 'staged' }], {
    duration: 320,
  })

  expect(scroller.scrollTop).toBe(0)
  // The hand-over's two frames, and then frames enough for the page to be
  // plainly on its way, and nowhere near the end of its stage.
  for (let n = 0; n < 12; n++) await advance()
  expect(window.scrollY).toBeGreaterThan(0)
  expect(scroller.scrollTop).toBe(0)

  // The page's stage, the beat, the panel's stage, the draw and the morph.
  await until(said, 402, 'the staged step never said its words')
  expect(scroller.scrollTop).toBeGreaterThan(0)
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
  await framed()
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
  // DESIGN.md, **A glide the tour has moved past is cancelled, and the page
  // stops where it is**.
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
  await framed()
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
  // DESIGN.md, **The viewer taking over**. Scrolled somewhere the glide would
  // never have written to, past its own destination, so a frame that happened to
  // land nearby cannot be mistaken for the viewer.
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
  await framed()
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
  //
  // **On a clock the test owns**, the way `a glide draws nothing until the page
  // has stopped` is. What has to happen here is two glides and the morph after
  // them — a little over two seconds on this page — and `stopped()` guesses at
  // the last part of that: it waits out the page and then gives the morph a
  // fixed tail. Measured on this page, that tail leaves the morph about 170ms
  // of room, which a loaded machine short of frames spends without trying.
  // Watching frames instead makes the wait the thing the test is about.
  clocked()
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
  await until(said, 32, 'the first step never said its words')

  press()
  // The hand-over's two frames, then six into a glide of 772px over
  // 140 · ∛772 ≈ 1284ms: the page has set off and is nowhere near the step it
  // is heading for, on any curve.
  for (let n = 0; n < 8; n++) await advance()
  expect(window.scrollY).toBeGreaterThan(0)
  expect(window.scrollY).toBeLessThan(700)
  // And nothing has been drawn, so what arrives next arrives mid-glide rather
  // than after one.
  expect(said()).toBe(false)

  leko.reached('landed')
  // The hand-over's two frames, the glide that replaces it — some 1900px,
  // 140 · ∛1900 ≈ 1740ms, 109 frames — and the morph after it, twenty more;
  // 202 is room.
  await until(said, 202, 'the step that arrived mid-glide never said its words')

  expect(leko.step?.id).toBe('other')
  expect(centre(other)).toBe(other)
  // Within a pixel, where every other landing here is within half of one: the
  // box was measured against an offset Firefox reports mid-glide in fractions
  // that are not quite the layout's, and the sum inherits the difference.
  expect(Math.abs(offCentre(other))).toBeLessThanOrEqual(1)
  window.scrollTo(0, 0)
})

test('a resize redraws the step without scrolling it again', async () => {
  const target = belowTheFold(2000)

  start([{ id: 'far', target: { elements: () => target, interactive: true }, scroll: true }])
  await framed()
  // The viewer has read the step and moved on, on purpose.
  window.scrollTo(0, 300)

  window.dispatchEvent(new Event('resize'))

  // A redraw puts the step back where the page is now — DESIGN.md, **Only an
  // arrival scrolls**.
  expect(window.scrollY).toBeCloseTo(300, 0)
  window.scrollTo(0, 0)
})

test('a resize that pins the target puts the layers back under it', async () => {
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
  await framed()
  expect(getComputedStyle(scrim()!).position).toBe('absolute')

  target.style.position = 'fixed'
  window.dispatchEvent(new Event('resize'))

  expect(getComputedStyle(scrim()!).position).toBe('fixed')
  window.scrollTo(0, 400)
  expect(centre(target)).toBe(target)
  window.scrollTo(0, 0)
})

test('a resize whose task took the target away leaves the standing hole alone', async () => {
  // The step is drawn, its target goes, and the page resizes in the same task.
  // No retry begins — DESIGN.md, **Whether the target is still there stops being
  // watched once the step is drawn** — so the redraw finds the step still on
  // screen and its target not on the page. Rebuilding the layers from the
  // document would take the hole and the blocking rectangles with them and cut
  // nothing in their place, so the page would be dimmed with nothing held back
  // at all.
  const target = box('target', { left: '100px', top: '100px', width: '120px', height: '40px' })
  target.id = 'anchor'
  const far = box('far', { left: '100px', top: '400px', width: '120px', height: '40px' })
  start([{ id: 'one', target: { elements: '#anchor', interactive: true } }])
  await framed()

  target.remove()
  window.dispatchEvent(new Event('resize'))

  expect(holes()).toBe(1)
  expect(absorbed(far)).toBe(true)
})

test('shaking moves the cutouts, not the scrim', async () => {
  const target = box('target', { left: '100px', top: '100px', width: '120px', height: '40px' })
  start([
    { id: 'one', target: { elements: () => target, interactive: true }, validate: () => false },
  ])
  await framed()

  press()
  await framed()

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
  await framed()
  await new Promise((r) => setTimeout(r, 300))

  window.dispatchEvent(new Event('resize'))

  // Replaying the opening would blow the cutout up to cover the page, leaving
  // almost nothing dimmed for a few hundred milliseconds.
  expect(absorbed(far)).toBe(true)
  expect(centre(target)).toBe(target)
})

// DESIGN.md, **The ring focus cannot leave**. Engines disagree about focus, so
// these run in all three rather than in `wiring.test.ts`.

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
  await framed()

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
  await framed()

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
  await framed()

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
  await framed()

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
  await framed()

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

test('Tab during a morph goes round the target and the way out, never the hidden message', async () => {
  clocked()
  const first = box('first', { left: '100px', top: '100px', width: '160px', height: '48px' })
  const second = box('second', { left: '100px', top: '500px', width: '160px', height: '48px' })

  start(
    [
      { id: 'one', target: { elements: () => first, interactive: true }, message: 'First.' },
      { id: 'two', target: { elements: () => second, interactive: true }, message: 'Second.' },
    ],
    { duration: 320 },
  )
  await until(said, 62, 'the first step never said its words')
  press()
  // The hand-over's two frames and two into the morph to the second step: the
  // message is hidden by `visibility` and still in the tree, its next control
  // with it.
  for (let n = 0; n < 4; n++) await advance()
  expect(said()).toBe(false)

  second.focus()
  expect(await tabbing(3)).toEqual(['the way out', 'second', 'the way out'])
})

test('Tab reaches the message before the way out', async () => {
  const target = box('target', { left: '100px', top: '100px', width: '160px', height: '48px' })

  start([
    { id: 'use', target: { elements: () => target, interactive: true }, message: 'Press it.' },
  ])
  await framed()

  target.focus()
  expect(await tabbing(2)).toEqual(['the message', 'the way out'])
})

test("the way out avoids the corner the host's chrome owns", async () => {
  // An account menu of the host's, in the corner the way out prefers. It is not
  // a cutout, and until a host could say so nothing kept the two apart —
  // DESIGN.md, **A host's own chrome is named once, and every reader takes the
  // boxes**.
  const menu = box('menu', {
    right: '16px',
    top: '16px',
    left: 'auto',
    width: '180px',
    height: '56px',
  })
  const target = box('target', { left: '100px', top: '300px', width: '160px', height: '48px' })

  start([{ id: 'one', target: { elements: () => target, interactive: true } }], {
    hostChrome: () => menu,
  })
  await framed()

  expect(closer()!.getBoundingClientRect().left).toBeLessThan(window.innerWidth / 2)
})

// How far in from the right the way out sits, against the viewport it is placed
// in: `clientWidth` rather than `innerWidth`, which `message.test.ts` says why.
const inset = (): number =>
  document.documentElement.clientWidth - closer()!.getBoundingClientRect().right

// Wait until the way out is `width` wide and 16px in from the right. Real time
// rather than frames or a taken clock: a fake clock does not drive a
// ResizeObserver, and a frame can stall for the reason `TICK` records.
async function placedAt(width: number, what: string, cap = 8000): Promise<void> {
  const began = performance.now()
  while (closer()!.offsetWidth !== width || Math.abs(inset() - 16) > 1) {
    if (performance.now() - began > cap) {
      throw new Error(`${what} — ${closer()!.offsetWidth}px wide, ${inset()}px in, after ${cap}ms`)
    }
    await pause(TICK)
  }
}

test('the way out is placed at the size it has now when renderClose fills its root after returning', async () => {
  const target = box('target', { left: '100px', top: '300px', width: '160px', height: '48px' })
  const own = document.createElement('button')
  own.textContent = 'Leave'
  own.style.width = '200px'

  start([{ id: 'one', target: { elements: () => target, interactive: true } }], {
    renderClose: (root, stop) => {
      own.addEventListener('click', stop)
      queueMicrotask(() => root.append(own))
      return () => own.remove()
    },
  })
  await framed()

  await placedAt(200, 'never placed at the width it was filled to')
  const at = closer()!.getBoundingClientRect()
  expect(at.top).toBeCloseTo(16, 0)
  expect(at.left).toBeGreaterThanOrEqual(0)
})

test('the way out is placed again when what renderClose drew changes size', async () => {
  const target = box('target', { left: '100px', top: '300px', width: '160px', height: '48px' })
  const own = document.createElement('button')
  own.textContent = 'Leave'
  own.style.width = '200px'

  start([{ id: 'one', target: { elements: () => target, interactive: true } }], {
    renderClose: (root, stop) => {
      own.addEventListener('click', stop)
      root.append(own)
      return () => own.remove()
    },
  })
  await framed()

  await placedAt(200, 'not placed at the width it was drawn at')
  own.style.width = '120px'
  await placedAt(120, 'not placed again when it narrowed')
})

// Long enough to reach the message's widest on any viewport the suite runs in,
// so its right edge meets the corner the way out takes.
const LONG =
  'This is where your account settings live, along with billing and the team you belong to.'

/** Where the way out and the message overlap, or `undefined` where they do not. */
function overlap(): { x: number; y: number } | undefined {
  const a = closer()!.getBoundingClientRect()
  const b = document.querySelector('.leko-message')!.getBoundingClientRect()
  const left = Math.max(a.left, b.left)
  const right = Math.min(a.right, b.right)
  const top = Math.max(a.top, b.top)
  const bottom = Math.min(a.bottom, b.bottom)
  return right > left && bottom > top ? { x: (left + right) / 2, y: (top + bottom) / 2 } : undefined
}

/** What paints at the middle of the overlap. A test with no overlap proves nothing, so it fails. */
function onTop(): Element | null {
  const at = overlap()
  if (!at) throw new Error('the way out and the message do not meet')
  return document.elementFromPoint(at.x, at.y)
}

// DESIGN.md, **The way out**: in the top layer the one shown later paints on
// top, whatever `z-index` says.
test('the way out paints above a message that lands on its corner', async () => {
  const target = box('target', { top: '0px', right: '160px', width: '120px', height: '20px' })

  start([{ id: 'one', target: () => target, message: LONG }])
  await framed()

  expect(onTop()?.closest('.leko-close')).not.toBeNull()
})

// Every morph hides the message, so this is the one that holds `hide()` to
// leaving it in the top layer.
test('the way out stays above the message a later step lands on its corner', async () => {
  const first = box('first', { left: '100px', top: '300px', width: '160px', height: '48px' })
  const second = box('second', { top: '0px', right: '160px', width: '120px', height: '20px' })

  start([
    { id: 'one', target: () => first },
    { id: 'two', target: () => second, message: LONG },
  ])
  await framed()
  press()
  await framed()
  await shown()

  expect(onTop()?.closest('.leko-close')).not.toBeNull()
})

test('the way out stays above a message a scroll carries under it', async () => {
  const spacer = keep(document.createElement('div'))
  spacer.style.height = '3000px'
  document.body.append(spacer)
  const target = keep(document.createElement('button'))
  target.textContent = 'target'
  Object.assign(target.style, {
    position: 'absolute',
    left: '180px',
    top: '500px',
    width: '120px',
    height: '30px',
    margin: '0',
  })
  document.body.append(target)

  start([{ id: 'one', target: () => target, message: LONG }])
  await framed()
  // Clear of each other where it was drawn; the anchored message rides the
  // scroll up into the corner.
  window.scrollTo(0, 515)
  await within(() => overlap() !== undefined, 60, 'the scroll never carried the message under it')

  expect(onTop()?.closest('.leko-close')).not.toBeNull()
  window.scrollTo(0, 0)
})

// --- a step that waits for a URL
//
// DESIGN.md, **A URL is a signal the page reports**. Which pattern a change is
// tested against, and whether a route pushed from `onEnter` is caught by the
// gate, is `machine.test.ts`; `wiring.test.ts` covers a pushed route with the
// Navigation API always present, being chromium only. What belongs here is a
// claim an engine could answer differently: whether back/forward — later in
// every engine tested, spike/a-same-document-navigation/ — still reach a step
// waiting for one.

test('going back to a URL the step waits for advances it', async () => {
  const target = box('target', { left: '100px', top: '100px', width: '120px', height: '40px' })
  history.pushState({}, '', '/checkout')
  history.pushState({}, '', '/other')

  const leko = start([
    { id: 'first', target: () => target, awaits: { url: /^\/checkout(?:[/?#]|$)/ } },
    { id: 'second', target: () => target },
  ])

  history.back()

  await within(() => leko.step?.id === 'second', 60, 'back() never reached the waiting step')
})

test.skipIf(!('navigation' in window))(
  'a route pushed advances the step where the engine has a Navigation API',
  () => {
    const target = box('target', { left: '100px', top: '100px', width: '120px', height: '40px' })
    const leko = start([
      { id: 'first', target: () => target, awaits: { url: /^\/checkout(?:[/?#]|$)/ } },
      { id: 'second', target: () => target },
    ])

    history.pushState({}, '', '/checkout')

    expect(leko.step?.id).toBe('second')
  },
)

// --- a step drawn on the frame after the call that moved the tour
//
// DESIGN.md, **A step is drawn on the next frame, not inside the call that
// moved the tour**. Each handler here moves or makes the next step's target the
// way a framework applies an update: in a microtask of the handler, or in a
// task of its own posted from it, as `spike/a-render-before-the-frame/` has
// them.

/** A step standing on `first`, which the signal `moved` takes to `then`. */
function moving(first: HTMLElement, then: LekoStep['target'], rest: LekoStep[] = []) {
  return start([
    { id: 'first', target: { elements: () => first, interactive: true }, awaits: 'moved' },
    { id: 'then', target: then },
    ...rest,
  ])
}

const at = (top: string): Partial<CSSStyleDeclaration> => ({
  left: '100px',
  top,
  width: '120px',
  height: '40px',
})

test('a step after reached() is cut where the update its handler made put the target', async () => {
  const first = box('first', at('100px'))
  const target = box('target', at('200px'))
  const leko = moving(first, { elements: () => target, interactive: true })
  await framed()

  queueMicrotask(() => {
    target.style.top = '500px'
  })
  leko.reached('moved')
  await framed()

  expect(leko.step?.id).toBe('then')
  expect(centre(target)).toBe(target)
})

test('a step is cut where the update put its target when the handler reports before it updates', async () => {
  const first = box('first', at('100px'))
  const target = box('target', at('200px'))
  const leko = moving(first, { elements: () => target, interactive: true })
  await framed()

  leko.reached('moved')
  queueMicrotask(() => {
    target.style.top = '500px'
  })
  await framed()

  expect(centre(target)).toBe(target)
})

test('a step is cut where an update rendered as a task of its own put its target', async () => {
  const first = box('first', at('100px'))
  const target = box('target', at('200px'))
  const leko = moving(first, { elements: () => target, interactive: true })
  await framed()

  // The way a scheduler outside a framework's own handlers renders: a message
  // posted from the handler, which can land after the first frame.
  const channel = new MessageChannel()
  channel.port1.addEventListener('message', () => {
    target.style.top = '500px'
  })
  channel.port1.start()
  channel.port2.postMessage(null)
  leko.reached('moved')
  await framed()

  expect(centre(target)).toBe(target)
  channel.port1.close()
})

test('a step drawn after an update that grew the page dims and blocks it to its new foot', async () => {
  // On the document, so the layer is the document's and sized to it.
  const first = box('first', { ...at('100px'), position: 'absolute' })
  const target = box('target', { ...at('200px'), position: 'absolute' })
  const leko = moving(first, { elements: () => target, interactive: true })
  await framed()

  let far: HTMLElement | undefined
  queueMicrotask(() => {
    const spacer = keep(document.createElement('div'))
    spacer.style.height = '3000px'
    document.body.append(spacer)
    far = box('far', { ...at('2800px'), position: 'absolute' })
  })
  leko.reached('moved')
  await framed()

  // No resize fires for a page that grew, so only the draw can have seen it.
  window.scrollTo(0, far!.offsetTop - 200)
  expect(absorbed(far!)).toBe(true)
  window.scrollTo(0, 0)
})

test('a target the same update gives a box is drawn on the frame, with no wait', async () => {
  // On a clock the test owns, so "no wait" is a count of frames: two, with the
  // retry's 100ms nowhere near run out.
  clocked()
  const first = box('first', at('100px'))
  const given = box('given', { ...at('400px'), display: 'none' })
  given.id = 'given'
  const leko = moving(first, { elements: '#given', interactive: true })
  await advance()
  await advance()

  // A style, not a node: no mutation the hunt could hear, so only a look can
  // find it, and the one before the grace ends is the frame's.
  queueMicrotask(() => {
    given.style.display = ''
  })
  leko.reached('moved')
  await advance()
  await advance()

  expect(leko.step?.id).toBe('then')
  expect(centre(given)).toBe(given)
})

test('a target not on the page at the frame is given its grace from the frame', async () => {
  clocked()
  const first = box('first', at('100px'))
  const leko = moving(first, { elements: '#never', interactive: true })
  await advance()
  await advance()
  expect(leko.step?.id).toBe('first')

  leko.reached('moved')
  await advance()
  await advance()

  // Past the grace counted from the call, and short of it counted from the
  // frame: the tour is still waiting, with the step before standing.
  vi.advanceTimersByTime(90)
  await Promise.resolve()
  expect(leko.state).toBe('running')
  expect(leko.step?.id).toBe('then')
  expect(holes()).toBe(1)

  vi.advanceTimersByTime(20)
  await Promise.resolve()
  expect(leko.state).toBe('idle')
})

test('a press on the step being left, before the frame, does not reach the step it moved to', async () => {
  const one = box('one', at('100px'))
  const two = box('two', at('200px'))
  const three = box('three', at('300px'))
  const leko = start([
    { id: 'one', target: () => one, message: 'One.' },
    { id: 'two', target: () => two, message: 'Two.' },
    { id: 'three', target: () => three, message: 'Three.' },
  ])
  await framed()

  press()
  // One frame: the press guard has let go, and the step pressed to is still
  // waiting for the frame it is drawn in.
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  expect(said()).toBe(false)

  // The words of the step being left went with the call, so what a pointer
  // finds where its control was is the tour's blocking, not the control.
  const where = centre(control()!) as HTMLElement | null
  expect(where?.closest('.leko-message')).toBeNull()
  where?.click()
  await framed()

  expect(leko.step?.id).toBe('two')
})

test('a step overtaken before its frame is never drawn', async () => {
  const first = box('first', at('100px'))
  const skipped = box('skipped', at('200px'))
  const last = box('last', at('300px'))
  const asked = vi.fn(() => skipped)
  const leko = start([
    { id: 'first', target: { elements: () => first, interactive: true }, awaits: 'moved' },
    { id: 'skipped', target: { elements: asked, interactive: true }, awaits: 'again' },
    { id: 'last', target: { elements: () => last, interactive: true } },
  ])
  await framed()

  leko.reached('moved')
  leko.reached('again')
  await framed()

  // Never looked for, so never measured and never drawn.
  expect(asked).not.toHaveBeenCalled()
  expect(leko.step?.id).toBe('last')
  expect(centre(last)).toBe(last)
})

test('a stop before the frame leaves nothing on the page', async () => {
  const first = box('first', at('100px'))
  const target = box('target', at('200px'))
  const leko = moving(first, { elements: () => target, interactive: true })
  await framed()

  leko.reached('moved')
  leko.stop()
  await framed()

  expect(document.querySelectorAll('[class^=leko-]').length).toBe(0)
  expect(centre(target)).toBe(target)

  // And a tour stopped before its first frame never draws at all.
  const again = start([{ id: 'only', target: () => target }])
  again.stop()
  await framed()
  expect(document.querySelectorAll('[class^=leko-]').length).toBe(0)
})
