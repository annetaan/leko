import { type Case, html } from '../case.js'

// A target no selector can name.
//
// `document.querySelector` does not cross a shadow boundary, so the button
// inside this component cannot be written down as a string at all. A function
// can: the host knows where its own shadow root is and answers with the element
// every time Leko asks.
//
// The rest of the page is a normal panel, so the case also shows that a cutout
// over a shadow root is a cutout like any other. Nothing is placed over the
// target either way, which is why the boundary makes no difference to the hole,
// the blocking, or the wheel.
//
// Watch where the message lands as well. It anchors to a marker of Leko's own
// on the edge of the cutout rather than to the target, so it sits beside this
// button the same as beside any other. An `anchor-name` written onto the button
// itself could not be read from out here at all.
const SEND = 'send-button'

class SendButton extends HTMLElement {
  connectedCallback(): void {
    if (this.shadowRoot) return
    const root = this.attachShadow({ mode: 'open' })
    root.innerHTML = `
      <style>
        button {
          font: inherit;
          padding: 8px 18px;
          border: 1px solid #2f6f4f;
          border-radius: 8px;
          background: #2f6f4f;
          color: #fff;
          cursor: pointer;
        }
      </style>
      <button type="button" part="button">Send the order</button>
    `
  }

  /** The element a target has to name, which lives behind the boundary. */
  get button(): HTMLElement | null {
    return this.shadowRoot?.querySelector('button') ?? null
  }
}

if (!customElements.get(SEND)) customElements.define(SEND, SendButton)

/** The component on the page, or `null` before it is mounted. */
const component = (): SendButton | null => document.querySelector<SendButton>(SEND)

export const insideShadowDom: Case = {
  id: 'inside-shadow-dom',
  title: 'A target inside a shadow root',
  proves:
    'A target is a question, and a function is the form of it the host answers. ' +
    'No selector reaches inside a shadow root, and the cutout does not care: ' +
    'a press through the open hole reaches the button behind the boundary.',

  mount(root) {
    const panel = html(`
      <div class="panel">
        <h2>Order review</h2>
        <div class="summary">
          <span class="summary-label">Total</span>
          <strong class="summary-value" data-total>¥2,640</strong>
          <span class="summary-note">Two lines, tax included</span>
        </div>
        <p class="hint">
          The button below is a custom element. Its markup lives in a shadow
          root, so nothing in this page can select it. The line above it counts
          the presses that reach it.
        </p>
        <p class="hint" data-status></p>
        <send-button></send-button>
      </div>
    `)

    const send = panel.querySelector<HTMLElement>(SEND)!
    const status = panel.querySelector<HTMLElement>('[data-status]')!

    // Counted rather than described, as in look-then-use.ts. The listener sits
    // on the host: a click is composed, so it crosses the shadow boundary and
    // reaches the host without anything reaching into the root.
    let presses = 0
    const report = (): void => {
      status.textContent = `Presses that reached the button: ${presses}.`
    }
    send.addEventListener('click', () => {
      presses += 1
      report()
    })
    report()

    root.append(panel)
    return () => panel.remove()
  },

  stories: [
    {
      id: 'inside-shadow-dom',
      steps: [
        {
          id: 'total',
          target: '[data-total]',
          message: 'An ordinary target, named by a selector. Press Next.',
        },
        {
          id: 'send',
          // The whole case. `document.querySelector('button')` finds nothing
          // here, and neither would any other string: the element is behind a
          // boundary only its host can cross.
          target: { elements: () => component()?.button ?? null, interactive: true },
          message:
            'This button lives inside a shadow root. The step names it with a ' +
            'function, because there is no selector that reaches it. Press it ' +
            'through the hole — the boundary changes nothing about the cutout, ' +
            'and nothing about where this box sits either.',
        },
      ],
    },
  ],
}
