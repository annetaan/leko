import { afterEach, expect, test } from 'vitest'

import type { Cutout } from './geometry.js'
import { type HaloMode, Scrim } from './scrim.js'
import { rectWithin } from './surface.js'

// The halo is paint for the host to style — DESIGN.md, **The halo**. These pin
// down the two things it promises while staying invisible itself: it frames the
// right holes with the right one marked open, and it never gets between the
// user and an open hole, which DESIGN.md argues under **Paint only, and outside
// the hole by construction**.

const scrims: Scrim[] = []
const cleanup: HTMLElement[] = []

afterEach(() => {
  for (const scrim of scrims.splice(0)) scrim.destroy()
  for (const el of cleanup.splice(0)) el.remove()
})

function mountScrim(halo?: HaloMode): Scrim {
  const made = new Scrim({ kind: 'document' }, halo)
  scrims.push(made)
  return made
}

function halos(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('.leko-halo')]
}

const cutout = (x: number, y: number, interactive = false): Cutout => ({
  x,
  y,
  width: 120,
  height: 40,
  radius: 8,
  interactive,
})

test('a haloed scrim frames each cutout, and marks the open one', () => {
  mountScrim('return').set([cutout(100, 100, true), cutout(100, 300)])

  const framed = halos()
  expect(framed.length).toBe(2)
  expect(framed[0]!.style.left).toBe('100px')
  expect(framed[0]!.style.top).toBe('100px')
  expect(framed[0]!.style.width).toBe('120px')
  expect(framed[0]!.style.borderRadius).toBe('8px')
  expect(framed[0]!.hasAttribute('data-open')).toBe(true)
  expect(framed[1]!.hasAttribute('data-open')).toBe(false)
})

test('a scrim that is not haloed frames nothing', () => {
  mountScrim().set([cutout(100, 100, true)])
  expect(halos().length).toBe(0)
})

test('the frame catches nothing over the hole it sits on', () => {
  const target = document.createElement('button')
  Object.assign(target.style, {
    position: 'fixed',
    left: '100px',
    top: '100px',
    width: '120px',
    height: '40px',
  })
  document.body.append(target)
  cleanup.push(target)

  mountScrim('return').set([
    { ...rectWithin(target, { kind: 'document' }), radius: 8, interactive: true },
  ])

  // The frame really is over the point being tested — otherwise the assertion
  // below would pass with the halo anywhere at all.
  const frame = halos()[0]!.getBoundingClientRect()
  expect(frame.left <= 160 && 160 <= frame.right).toBe(true)
  expect(frame.top <= 120 && 120 <= frame.bottom).toBe(true)

  // And the hit goes through it, to the element the step opened.
  expect(document.elementFromPoint(160, 120)).toBe(target)
})

test('returning halos leave for the length of a morph and fade back with the holes', async () => {
  const drawn = mountScrim('return')
  drawn.set([cutout(100, 100, true), cutout(100, 300)])

  const arriving = drawn.morph([cutout(500, 100, true)], 60)
  // DESIGN.md, **What a morph does to the halo is the host's choice, `halo` on
  // the options**, for what each mode paints. `undefined` is
  // `prefers-reduced-motion` applying the change outright, and the halo goes with
  // it: placed already, nothing to wait for.
  if (arriving) {
    // Gone by fading rather than by a cut: transparent, with the transition
    // that carries every appearance and disappearance still on the element.
    expect(halos().every((el) => el.style.opacity === '0')).toBe(true)
    expect(await arriving).toBe(true)
  }

  // One hole now, so one frame — the collapsed leftover of the departing
  // cutout earns none — and it sits on the destination, fading back in.
  const framed = halos()
  expect(framed.length).toBe(1)
  expect(framed[0]!.style.opacity).toBe('1')
  expect(framed[0]!.style.left).toBe('500px')
  expect(framed[0]!.hasAttribute('data-open')).toBe(true)
  expect(getComputedStyle(framed[0]!).transitionProperty).toContain('opacity')
})

test('following halos stay on and ride the morph to the destination', async () => {
  const drawn = mountScrim('follow')
  drawn.set([cutout(100, 100, true), cutout(100, 300)])

  const arriving = drawn.morph([cutout(500, 100, true)], 60)
  if (arriving) {
    // Nothing left for the flight: both frames are on — the departing hole
    // keeps its frame while it shrinks away — and the surviving one already
    // wears the destination's flag.
    const flying = halos()
    expect(flying.length).toBe(2)
    expect(flying.every((el) => el.style.opacity === '1')).toBe(true)
    expect(flying[0]!.hasAttribute('data-open')).toBe(true)
    expect(await arriving).toBe(true)
  }

  // Landed: the collapsed leftover's frame is taken away, and the one that
  // rode sits exactly on the destination.
  const framed = halos()
  expect(framed.length).toBe(1)
  expect(framed[0]!.style.opacity).toBe('1')
  expect(framed[0]!.style.left).toBe('500px')
  expect(framed[0]!.style.width).toBe('120px')
  expect(framed[0]!.hasAttribute('data-open')).toBe(true)
})
