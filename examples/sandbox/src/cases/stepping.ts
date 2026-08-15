import { type Case, html } from '../case.js'

// Nothing gates these steps, so next and prev can be walked back and forth
// freely. The targets differ in size, shape and position on purpose: a morph
// between two similar boxes hides everything interesting about it.
export const stepping: Case = {
  id: 'stepping',
  title: 'Stepping around a page',
  proves:
    'The plain case, and the one to reach for while working on the morph: five ' +
    'targets of different shapes, no validation in the way.',

  mount(root) {
    const panel = html(`
      <div class="panel">
        <h2 data-step="title">Project overview</h2>
        <p class="hint">Nothing here is gated. Walk next and prev as much as you like.</p>
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
      </div>
    `)
    root.append(panel)
    return () => panel.remove()
  },

  stories: (root) => {
    const at = (name: string): HTMLElement =>
      root.querySelector<HTMLElement>(`[data-step="${name}"]`)!
    return [
      {
        id: 'stepping',
        steps: [
          { id: 'title', target: at('title'), message: 'A short, wide target.' },
          { id: 'wide', target: at('wide'), message: 'A tall card, off to the left.' },
          {
            id: 'small',
            target: at('small'),
            message: 'Something small, so the corners have to hold up.',
          },
          { id: 'row', target: at('row'), message: 'A full-width row, back down the page.' },
          { id: 'button', target: at('button'), message: 'And the button at the end.' },
        ],
      },
    ]
  },
}
