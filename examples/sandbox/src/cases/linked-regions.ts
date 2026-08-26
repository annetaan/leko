import { type Case, html } from '../case.js'

export const linkedRegions: Case = {
  id: 'linked-regions',
  title: 'A summary and the row behind it',
  proves:
    'Two separated regions can be lit at once when one explains the other. Their ' +
    'bounding box would be the whole page, so they stay two cutouts.',

  mount(root) {
    const panel = html(`
      <div class="panel">
        <div class="summary" data-summary>
          <span class="summary-label">Winning amount</span>
          <strong class="summary-value">97,800 USD</strong>
          <span class="summary-note">300 pieces</span>
        </div>
        <table class="grid">
          <thead><tr><th>Model</th><th>Qty</th><th>Price</th><th>Amount</th></tr></thead>
          <tbody>
            <tr data-row><td>iPhone 12</td><td>300</td><td>326</td><td>97,800</td></tr>
            <tr><td>iPhone SE</td><td>0</td><td>20</td><td>0</td></tr>
          </tbody>
        </table>
      </div>
    `)
    root.append(panel)
    return () => panel.remove()
  },

  stories: [
    {
      id: 'linked-regions',
      steps: [
        {
          id: 'winning-amount',
          target: '[data-row]',
          related: ['[data-summary]'],
          message: 'This row is where the figure above comes from.',
        },
      ],
    },
  ],
}
