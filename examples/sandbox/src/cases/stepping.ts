import { type Case, html } from '../case.js'

// Nothing gates these steps. The targets differ in size, shape and position on
// purpose: a morph between two similar boxes hides everything interesting about
// it. The last one sits in the top right, which is where the control that ends
// the tour wants to be, so stepping onto it moves that control somewhere else.
export const stepping: Case = {
  id: 'stepping',
  title: 'Stepping around a page',
  proves:
    'The plain case, and the one to reach for while working on the morph: six ' +
    'targets of different shapes. The last gives the way out its corner back.',

  mount(root) {
    const panel = html(`
      <div class="panel">
        <h2 data-step="title">Project overview</h2>
        <p class="hint">Nothing here is gated. Press Next as much as you like.</p>
        <div class="tiles">
          <div class="tile" data-step="wide">
            <span class="tile-label">This month</span>
            <strong class="tile-value">1,284</strong>
          </div>
          <div class="tile tile-small" data-step="small">＋</div>
        </div>
        <table class="grid">
          <thead><tr><th>Name</th><th>Owner</th><th>Status</th></tr></thead>
          <tbody>
            <tr><td>Onboarding</td><td>Mika</td><td>Live</td></tr>
            <tr data-step="row"><td>Checkout</td><td>Ren</td><td>Draft</td></tr>
            <tr><td>Billing</td><td>Sora</td><td>Live</td></tr>
          </tbody>
        </table>
        <button type="button" data-step="button">Publish</button>
        <button type="button" class="corner" data-step="corner">Account</button>
      </div>
    `)
    root.append(panel)
    return () => panel.remove()
  },

  stories: [
    {
      id: 'stepping',
      steps: [
        { id: 'title', target: '[data-step="title"]', message: 'A short, wide target.' },
        { id: 'wide', target: '[data-step="wide"]', message: 'A tall card, off to the left.' },
        {
          id: 'small',
          target: '[data-step="small"]',
          message: 'Something small, so the corners have to hold up.',
        },
        {
          id: 'row',
          target: '[data-step="row"]',
          message: 'A full-width row, back down the page.',
        },
        { id: 'button', target: '[data-step="button"]', message: 'And the button at the end.' },
        {
          id: 'corner',
          target: '[data-step="corner"]',
          message:
            'An account menu, in the corner the End tour control wants. A ' +
            'control left on top of a cutout takes back the interaction the ' +
            'hole exists to allow, so it gives the corner up.',
        },
      ],
    },
  ],
}
