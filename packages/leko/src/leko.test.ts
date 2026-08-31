import { userEvent } from '@vitest/browser/context'
import { expect, test } from 'vitest'

import {
  absorbed,
  begin,
  box,
  centre,
  holding,
  holes,
  keep,
  control,
  press,
  scrim,
  start,
} from './harness.js'

// Claims about layout the browser actually performed: where a hole ended up,
// what hit-testing returns at a point, which element a scrim was mounted in.
// Engines disagree about `clip-path: path()` and about anchor positioning, so
// every one of these runs in all three.
//
// Claims about which step the tour is on live in `wiring.test.ts` and run in
// one browser, because no engine has an opinion about those.

test('the target is reachable through the cutout, and the rest of the page is not', () => {
  const target = box('target', { left: '100px', top: '100px', width: '160px', height: '48px' })
  const other = box('other', { left: '100px', top: '400px', width: '160px', height: '48px' })

  start([{ id: 'one', interactive: true, target: () => target }])

  expect(centre(target)).toBe(target)
  expect(absorbed(other)).toBe(true)
})

test('stopping puts the page back', () => {
  const target = box('target', { left: '100px', top: '100px', width: '160px', height: '48px' })
  const leko = start([{ id: 'one', interactive: true, target: () => target }])

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

  // One element of `target`, written as a list, so the two are unioned.
  start([{ id: 'columns', interactive: true, target: [[() => left, () => right]] }])

  expect(centre(left)).toBe(left)
  expect(centre(right)).toBe(right)
  // Documented consequence of a union, not an accident: pass adjacent elements.
  expect(centre(between)).toBe(between)
})

test('two regions get a cutout each rather than being unioned', () => {
  const target = box('target', { left: '60px', top: '400px', width: '120px', height: '40px' })
  const summary = box('summary', { left: '60px', top: '60px', width: '120px', height: '40px' })
  const between = box('between', { left: '60px', top: '230px', width: '120px', height: '40px' })

  // Two elements of `target`, so two holes. The same two written inside one
  // element would be the test above, and would open everything between them.
  start([{ id: 'linked', interactive: true, target: [() => target, () => summary] }])

  // Two holes, not one big one — otherwise everything in between would be lit.
  expect(holes()).toBe(2)
  expect(centre(target)).toBe(target)
  // Shown and not reachable. `interactive` opens the first region and no other,
  // because a later one is there to explain rather than to be used.
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
  start([{ id: 'svg', interactive: true, target: () => wanted }])

  expect(centre(wanted)).toBe(wanted)
  expect(absorbed(other)).toBe(true)
})

test('what blocks a shown hole sits beside the scrim, never inside it', () => {
  const target = box('target', { left: '100px', top: '100px', width: '160px', height: '48px' })

  start([{ id: 'look', target: () => target }])

  // A `clip-path` clips its descendants out of hit-testing along with itself,
  // so a rectangle inside the scrim and over one of its holes catches nothing.
  // `spike/blocking-a-hole/` is the page that settled it, in all three engines.
  const caught = centre(target) as HTMLElement
  expect(caught.closest('.leko-scrim')).toBeNull()
  expect(caught.closest('.leko-blocking')).not.toBeNull()
})

test('a step overrides the padding the instance was given', () => {
  const target = box('target', { left: '100px', top: '200px', width: '120px', height: '40px' })
  const near = box('near', { left: '120px', top: '170px', width: '20px', height: '20px' })

  const leko = holding(
    { id: 'roomy', steps: [{ id: 'a', interactive: true, target: () => target, padding: 40 }] },
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

  start([{ id: 'deep', interactive: true, target: () => target }])

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

  start([{ id: 'deep', interactive: true, target: () => target }])

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

  start([{ id: 'deep', interactive: true, target: () => target }])

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
  start([{ id: 'one', interactive: true, target: () => target, validate: () => false }])

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
    { id: 'story', steps: [{ id: 'one', interactive: true, target: () => target }] },
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

  start([{ id: 'use', target: () => target, interactive: true, message: 'Press it.' }])

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

  start([{ id: 'use', target: () => target, interactive: true, message: 'Press it.' }])

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

  start([{ id: 'use', target: () => target, interactive: true, message: 'Press it.' }])

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
