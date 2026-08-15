import { type Case, html } from '../case.js'

const ROWS = [
  ['iPhone 12', '128GB', '500', '100', '150'],
  ['iPhone SE', '128GB', '300', '100', '20'],
  ['iPhone XR', '128GB', '400', '100', '80'],
]

export const adjacentColumns: Case = {
  id: 'adjacent-columns',
  title: 'Two adjacent columns, one cutout',
  proves:
    'Several elements can be one target. The cutout is their bounding box, which ' +
    'is the shape a person would have drawn anyway.',

  mount(root) {
    const panel = html(`
      <div class="panel">
        <h2>Inventory</h2>
        <table class="grid">
          <thead>
            <tr><th>Model</th><th>Capacity</th><th data-col="qty">Total qty</th>
                <th data-col="per">Qty per pallet</th><th>Price</th></tr>
          </thead>
          <tbody>
            ${ROWS.map(
              (r) =>
                `<tr>${r
                  .map(
                    (cell, i) =>
                      `<td${i === 2 ? ' data-col-end="qty"' : ''}${
                        i === 3 ? ' data-col-end="per"' : ''
                      }>${cell}</td>`,
                  )
                  .join('')}</tr>`,
            ).join('')}
          </tbody>
        </table>
      </div>
    `)
    root.append(panel)
    return () => panel.remove()
  },

  stories: (root) => [
    {
      id: 'adjacent-columns',
      steps: [
        {
          // Two corners are enough: the union of the first column's header and the
          // second column's last cell is exactly the block a person would draw.
          id: 'quantities',
          target: [
            root.querySelector<HTMLElement>('[data-col="qty"]')!,
            [...root.querySelectorAll<HTMLElement>('[data-col-end="per"]')].at(-1)!,
          ],
          message: 'These two columns tell you the total and how it is packed.',
          padding: 2,
        },
      ],
    },
  ],
}
