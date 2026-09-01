import { type Case, html } from '../case.js'

// The default halo leaves for the length of a morph and fades back in with the
// hole — the message's answer. A host that styles every hole alike has no
// state for the frame to come back to differently, and for that host the going
// itself is the loss: the glow should travel. `halo: 'follow'` is that choice,
// and this case is a host making it.
const THEME = `
  .leko-halo {
    --leko-halo-outline: 2px solid #7cf5c8;
    --leko-halo-shadow: 0 0 16px 3px rgb(124 245 200 / 0.5);
  }
`

export const haloFollows: Case = {
  id: 'halo-follows',
  title: 'A halo that rides the morph',
  proves:
    'With halo: "follow", the frame around the hole travels with it through ' +
    'every morph instead of fading out and back in. The glow is written each ' +
    'frame from the same blended numbers as the mask, so the two cannot ' +
    'come apart — and it stays paint: nothing about what is blocked changes.',

  // The one option this case exists for. Everything else is the default,
  // including the fade the other cases show: leave this out and the halo goes
  // back to returning.
  options: { halo: 'follow' },

  mount(root) {
    const theme = html<HTMLStyleElement>(`<style>${THEME}</style>`)
    document.head.append(theme)

    const panel = html(`
      <div class="panel">
        <h2>Shipment #88</h2>

        <div class="summary" data-picked>
          <span class="summary-label">Picked</span>
          <strong class="summary-value">14:02</strong>
        </div>
        <div class="summary" data-packed>
          <span class="summary-label">Packed</span>
          <strong class="summary-value">14:31</strong>
        </div>
        <div class="summary" data-shipped>
          <span class="summary-label">Shipped</span>
          <strong class="summary-value">17:45</strong>
        </div>

        <p class="hint">
          Press Next and watch the green frame: it slides and resizes with the
          hole rather than blinking out and back. The whole of what this case
          sets beyond <code>halo: 'follow'</code> is one rule, the same for
          every hole:
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

  stories: [
    {
      id: 'follow',
      steps: [
        {
          id: 'picked',
          target: '[data-picked]',
          message: 'Every stop on this tour wears the same frame.',
        },
        {
          id: 'packed',
          target: '[data-packed]',
          message: 'The frame came here with the hole, not after it.',
        },
        {
          id: 'shipped',
          target: '[data-shipped]',
          message: 'And the same again, one morph later.',
        },
      ],
    },
  ],
}
