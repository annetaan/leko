import { cubicBezier } from '@annetaan/leko'

import { type Case, html } from '../case.js'

// The one case where the motion is not Leko's. `easing` is an instance
// setting, the way `duration` is — DESIGN.md, **Settings, and where they are
// read from** — so the curve here is on the whole tour, and the hole and the
// page follow the same one. That is the thing to watch: they are two frame
// loops, and a curve that reached only one of them would show as a hole
// arriving on a different rhythm from the page under it.
//
// `cubic-bezier(0.83, 0, 0.17, 1)` is symmetric and slow at both ends, which
// is what Leko's own curve is deliberately not — DESIGN.md, **The morph**,
// argues why the departure is the half that gets out of the way. Run this case
// beside `scrolls-into-view.ts` and the difference is the first fifth of every
// movement.
//
// It stays inside `[0, 1]` on purpose. A curve that overshoots is fine for a
// morph and wrong for a glide, for the reason `LekoOptions.easing` gives, and
// a sandbox case is not the place to leave that trap lying about.
const HOUSE = cubicBezier(0.83, 0, 0.17, 1)

export const hostEasing: Case = {
  id: 'host-easing',
  title: 'A tour that moves the way the application does',
  proves:
    "The tour follows the application's motion rule rather than its own: one " +
    'curve on the instance eases both the morph that carries the hole and the ' +
    'glide that carries the page, so a step several screens away arrives on ' +
    'the same rhythm the rest of the product moves on. The curve here is slow ' +
    "at both ends, which Leko's own is not, so the difference is visible " +
    'without a stopwatch.',

  options: { scroll: true, easing: HOUSE, duration: 480 },

  mount(root) {
    const page = html(`
      <div class="tall-page">
        <div class="panel" data-first>
          <h2>Where the tour starts</h2>
          <p class="hint">
            Everything below is a screen or more apart, so every step after
            this one is a trip the page has to make.
          </p>
          <button data-lever>The button the tour starts on</button>
        </div>

        <div class="scroll-room"></div>

        <div class="milestone" data-second>
          <h3>One long way down</h3>
          <p class="hint">
            The page glides here and the hole morphs across the screen at the
            same time it does.
          </p>
        </div>

        <div class="scroll-room"></div>
        <div class="scroll-room"></div>

        <div class="milestone" data-third>
          <h3>And a longer one</h3>
          <p class="hint">
            Twice the distance, and the same curve over a longer trip.
          </p>
        </div>

        <div class="scroll-room"></div>
      </div>
    `)
    root.append(page)
    return () => page.remove()
  },

  stories: [
    {
      id: 'house-curve',
      onEnter: () => window.scrollTo({ top: 0, behavior: 'instant' }),
      steps: [
        {
          id: 'the-start',
          target: { elements: '[data-lever]', interactive: true },
          message:
            'Nothing has moved yet. The curve this tour was given is on the ' +
            'instance, so every movement from here follows it — the hole and ' +
            'the page both.',
        },
        {
          id: 'a-screen-away',
          target: '[data-second]',
          message:
            'The page eased away from the top and eased into this card, and ' +
            'the hole crossed the screen on the same curve at the same time. ' +
            "Leko's own curve leaves at once and settles slowly; this one is " +
            'slow at both ends, which is the whole difference and is the ' +
            "application's to decide.",
        },
        {
          id: 'further-still',
          target: '[data-third]',
          message:
            'Further, and the same shape stretched over it: a longer trip ' +
            'takes longer, and the pace it takes is the same rule. Scroll ' +
            'during it and the glide stops where you put the page, exactly as ' +
            'it does on the built-in curve.',
        },
        {
          id: 'and-back',
          target: { elements: '[data-first]' },
          message:
            'All the way back, so the trip is watched in the other direction ' +
            'too. The curve is symmetric, so this looks like the way down ' +
            'played backwards — which is what makes it obviously not the one ' +
            'Leko ships.',
        },
      ],
    },
  ],
}
