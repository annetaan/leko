import { cubicBezier } from '@annetaan/leko'

import { type Case, html } from '../case.js'

// The counterpart of `host-easing.ts`. There the instance's `duration` and
// `easing` are the house rule; here the instance says nothing, and a step says
// its own for the movement into it — DESIGN.md, **Settings, and where they are
// read from**.
//
// Slow at both ends and inside `[0, 1]`, for the reason `LekoOptions.easing`
// gives a glide.
const BOTH_ENDS = cubicBezier(0.83, 0, 0.17, 1)

export const stepMotion: Case = {
  id: 'step-motion',
  title: 'A step that says how it moves',
  proves:
    'A step may say how long the movement into it takes and how it moves: ' +
    'the opening can be slow while the rest of the tour keeps the house rule, ' +
    'a far step can bring its own curve to both the glide and the morph, and ' +
    '0 on a step snaps where the instance animates.',

  options: { scroll: true },

  mount(root) {
    const page = html(`
      <div class="tall-page">
        <div class="panel">
          <h2 data-first>Where the tour opens</h2>
          <p class="hint" data-second>
            The first step darkens the page slowly, and the second moves the
            hole here at the instance's own pace.
          </p>
        </div>

        <div class="scroll-room"></div>
        <div class="scroll-room"></div>

        <div class="milestone" data-far>
          <h3>Two screens down</h3>
          <p class="hint">
            The step that points here brings its own curve, and the page and the
            hole both follow it.
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
      id: 'own-motion',
      onEnter: () => window.scrollTo({ top: 0, behavior: 'instant' }),
      steps: [
        {
          id: 'slow-opening',
          target: '[data-first]',
          duration: 2400,
          message:
            'The darkening closed in slowly because this step said so. ' +
            'Nothing else in the tour is slowed by it.',
        },
        {
          id: 'house-rule',
          target: '[data-second]',
          message:
            'This step said nothing, so the morph ran for as long as the ' +
            "instance says. A step's value is that step's alone.",
        },
        {
          id: 'far-and-eased',
          target: '[data-far]',
          duration: 1200,
          easing: BOTH_ENDS,
          message:
            "The curve is this step's, and the page and the hole both followed " +
            "it: slow to leave and slow to arrive, which Leko's own curve is " +
            "not. This step's duration is how long the morph ran, and only " +
            'the least the glide runs for: the glide took that or what the ' +
            'distance asked, whichever was longer.',
        },
        {
          id: 'snap-back',
          target: '[data-first]',
          duration: 0,
          message:
            'The tour jumped: the page was set back to the top outright and ' +
            'the hole cut with no morph, because 0 on a step beats the ' +
            "instance's number. No pace in the footer makes this step move " +
            'either.',
        },
      ],
    },
  ],
}
