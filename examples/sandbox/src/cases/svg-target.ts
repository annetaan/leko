import { type Case, html } from '../case.js'

export const svgTarget: Case = {
  id: 'svg-target',
  title: 'A shape inside an SVG',
  proves:
    'An element inside an <svg> is a target like any other. The box comes from ' +
    'getBoundingClientRect, so viewBox scaling lands the hole on the shape as drawn, ' +
    'and an open shape takes the click.',

  mount(root, leko) {
    const panel = html(`
      <div class="panel">
        <h2>Order flow</h2>
        <svg viewBox="0 0 420 120" width="100%" style="max-width: 560px; display: block">
          <g font-size="14" text-anchor="middle">
            <rect data-node="cart" x="10" y="40" width="110" height="40" rx="8"
                  fill="#dde6f0" stroke="#5b7797"></rect>
            <text x="65" y="65">Cart</text>
            <line x1="120" y1="60" x2="155" y2="60" stroke="#5b7797"></line>
            <rect data-node="payment" x="155" y="40" width="110" height="40" rx="8"
                  fill="#dde6f0" stroke="#5b7797" tabindex="0" role="button"></rect>
            <text x="210" y="65">Payment</text>
            <line x1="265" y1="60" x2="300" y2="60" stroke="#5b7797"></line>
            <rect data-node="done" x="300" y="40" width="110" height="40" rx="8"
                  fill="#dde6f0" stroke="#5b7797"></rect>
            <text x="355" y="65">Done</text>
          </g>
        </svg>
      </div>
    `)
    root.append(panel)

    const payment = panel.querySelector<SVGRectElement>('[data-node="payment"]')!
    const report = () => leko.reached('diagram-node-chosen')
    payment.addEventListener('click', report)
    payment.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') report()
    })
    return () => panel.remove()
  },

  stories: [
    {
      id: 'svg-target',
      steps: [
        {
          // A selector into the SVG. The shape is drawn through a viewBox, so
          // the hole is only right because the box is measured, not read off
          // the attributes.
          id: 'read',
          target: '[data-node="cart"]',
          message: 'The order starts in the cart. This box is an SVG rect.',
        },
        {
          // The function form: an SVGRectElement, which the type of a target
          // has to allow a host to hand back.
          id: 'choose',
          target: {
            elements: () => document.querySelector('[data-node="payment"]'),
            interactive: true,
          },
          awaits: 'diagram-node-chosen',
          message: 'Click the Payment node — the shape under the hole is the real one.',
        },
      ],
    },
  ],
}
