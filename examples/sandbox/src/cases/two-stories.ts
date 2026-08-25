import { type Case, html } from '../case.js'

// The reason a call site names what happened rather than asking for the next
// step. One button, one line of instrumentation, two stories that pass through
// this screen — and the signal moves whichever of them was waiting for it.
export const twoStories: Case = {
  id: 'two-stories',
  title: 'Two stories, one screen',
  proves:
    'One reached call, at the point the order goes through. It advances the ' +
    'story that declared that name and does nothing to the story that did not.',

  mount(root, leko) {
    const panel = html(`
      <div class="panel">
        <h2>Order</h2>
        <div class="summary">
          <span class="summary-label">Tax</span>
          <strong class="summary-value" data-tax>¥240</strong>
          <span class="summary-note" data-total>¥2,640 including tax</span>
        </div>
        <label>Quantity<input name="quantity" type="number" value="1" min="1" /></label>
        <button type="button" data-place>Place the order</button>
        <p class="hint" data-status>Nothing ordered yet.</p>
      </div>
    `)
    const button = panel.querySelector<HTMLButtonElement>('[data-place]')!
    const status = panel.querySelector<HTMLElement>('[data-status]')!

    button.addEventListener('click', async () => {
      button.disabled = true
      status.textContent = 'Placing…'
      await new Promise((resolve) => setTimeout(resolve, 800))
      status.textContent = 'Order placed.'
      button.disabled = false

      // Written once, where the thing actually happened, and never edited again
      // as stories are added or their steps reordered. Whether anybody is
      // listening is not this function's business.
      leko.reached('order-placed')
    })

    root.append(panel)
    return () => panel.remove()
  },

  stories: (root) => {
    const at = (selector: string): HTMLElement => root.querySelector<HTMLElement>(selector)!
    return [
      {
        id: 'first-order',
        steps: [
          {
            id: 'quantity',
            target: at('input[name="quantity"]'),
            message: 'How many you want. Change it if you like, then press Next.',
          },
          {
            id: 'place',
            target: at('[data-place]'),
            message: 'Place the order. This step is waiting for “order-placed”.',
            awaits: 'order-placed',
          },
          {
            id: 'receipt',
            target: at('[data-status]'),
            message: 'And the order went through. That is what ended the last step.',
          },
        ],
      },
      {
        id: 'what-you-pay',
        steps: [
          {
            id: 'tax',
            target: at('[data-tax]'),
            related: [at('[data-total]')],
            message:
              'Tax, worked out from the quantity. Press the button — this story ' +
              'declares no signal, so “order-placed” does nothing here.',
          },
          {
            id: 'total',
            target: at('[data-total]'),
            message: 'And this is what you actually pay.',
          },
        ],
      },
    ]
  },
}
