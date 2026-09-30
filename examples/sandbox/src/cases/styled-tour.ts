import type { LekoStory } from '@annetaan/leko'

import { type Case, html } from '../case.js'

// Every pixel Leko draws reads a `--leko-*` token, and the halo exists so the
// hole — an absence of geometry with no element of its own to select — has
// something for a host's CSS to take hold of. This case is a host doing that:
// one stylesheet, no Leko code touched.
const THEME = `
  :root {
    --leko-scrim-color: rgb(3 12 22 / 0.58);

    --leko-message-bg: #071523bb;
    --leko-message-color: #eafcff;
    --leko-message-border: 2px solid #2ee6ff;
    --leko-message-radius: 12px;
    --leko-message-shadow:
      0 0 24px rgb(46 230 255 / 0.55),
      inset 0 0 10px rgb(46 230 255 / 0.35);
    --leko-message-next-bg: #2ee6ff;
    --leko-message-next-color: #06202e;
  }

  /* Everything halo, in one place. */
  .leko-halo {
    --leko-halo-outline: 2px solid #ffd200;
    --leko-halo-offset: 0px;
    /* The inset half spills into the hole — onto this page's own target,
       which is the host's to paint over and nobody else's. */
    --leko-halo-shadow:
      0 0 18px 4px rgb(255 210 0 / 0.55),
      inset 0 0 14px rgb(255 210 0 / 0.4);
  }

  /* The hole the step opened carries data-open, so the ones it only shows
     glow quieter than the one it is asking about. */
  .leko-halo:not([data-open]) {
    --leko-halo-outline: 2px solid rgb(255 210 0 / 0.45);
    --leko-halo-shadow: 0 0 12px 2px rgb(255 210 0 / 0.3);
  }
`

// #region The story
const story = {
  id: 'styled',
  steps: [
    {
      id: 'order',
      // Shown, not opened: the halo on this hole has no data-open, so it
      // gets the quieter glow the stylesheet gives that state.
      target: '[data-order]',
      message: 'This is the order being paid for. The halo marks it without handing it over.',
    },
    {
      id: 'voucher',
      target: { elements: '[data-voucher]', interactive: true },
      message: 'Type a voucher code. This hole is open, and its halo says so at full glow.',
      validate: (el) => (el as HTMLInputElement).value.trim() !== '',
      error: 'Nothing typed yet.',
    },
  ],
} satisfies LekoStory
// #endregion

export const styledTour: Case = {
  id: 'styled-tour',
  title: 'A tour in the host’s clothes',
  proves:
    'The halo around each hole and the message beside it are the host’s to ' +
    'restyle, with CSS custom properties alone. Until a host sets the ' +
    '--leko-halo-* tokens the halo draws nothing, so every other case in this ' +
    'sandbox looks exactly as it did.',

  mount(root) {
    // What an application would put in its own stylesheet, scoped to this
    // case's stay on screen only because a host shows one case at a time.
    const theme = html<HTMLStyleElement>(`<style>${THEME}</style>`)
    document.head.append(theme)

    const panel = html(`
      <div class="panel">
        <h2>Order #4127</h2>

        <div class="summary" data-order>
          <span class="summary-label">3 items, shipping to Osaka</span>
          <strong class="summary-value">128 USD</strong>
        </div>

        <label>
          <span>Voucher code</span>
          <input type="text" data-voucher placeholder="e.g. WELCOME10" />
        </label>

        <p class="hint">
          The yellow halo and the cyan message are one stylesheet in this case,
          shown in full below it. Step 1 shows a hole without opening it, and
          its halo is the quieter <code>.leko-halo:not([data-open])</code>
          variant.
        </p>
        <pre class="hint" style="white-space: pre-wrap"><code>${THEME.trim()}</code></pre>
      </div>
    `)

    root.append(panel)
    return () => {
      panel.remove()
      theme.remove()
    }
  },

  stories: [story],
}
