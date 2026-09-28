import { type Case, html } from '../case.js'

// Where the message meets the way out. The card sits right of centre, so the
// message beside it reaches into the top right corner the way out prefers. Start
// the tour, then scroll the card slowly up to the top: the box rides up with it,
// on whichever side it took, and passes under "End tour", which stays on top
// and still ends the tour. Why the corner does not dodge the box is DESIGN.md,
// **The way out**.
export const wayOutOnTop: Case = {
  id: 'way-out-on-top',
  title: 'The way out stays on top',

  proves:
    'Where the message meets the control that ends the tour, the control ' +
    'paints on top and stays pressable, including when a scroll carries the ' +
    'message into its corner.',

  mount(root) {
    const page = html(`
      <div class="way-out-case">
        <div class="panel">
          <h2>Quarterly report</h2>
          <p class="hint">
            The card below sits towards the right edge, so the message beside it
            is wide enough to reach the corner the way out is drawn in.
          </p>
        </div>
        <p class="filler">
          Revenue held level through the summer. The card is here so there is
          something to point at.
        </p>
        <div class="way-out-card" data-card>
          <h3>Q3 at a glance</h3>
          <p class="hint">Level with Q2.</p>
        </div>
        <p class="filler">
          The rest of the page is room to scroll. Take the card up to the top
          of the screen and watch the message go with it.
        </p>
      </div>
    `)

    root.append(page)
    return () => page.remove()
  },

  stories: [
    {
      id: 'way-out-on-top',
      steps: [
        {
          id: 'card',
          target: '[data-card]',
          message:
            'This box is anchored to the card, and the browser carries it on ' +
            'every scroll. Scroll the card slowly up to the top of the ' +
            'screen: on the way, this box passes under "End tour" in the ' +
            'corner, which stays on top of it and still ends the tour when ' +
            'pressed.',
        },
      ],
    },
  ],
}
