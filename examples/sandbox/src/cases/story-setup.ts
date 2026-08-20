import { type Case, html } from '../case.js'

// What a story assumes throughout, arranged once. The table is empty until the
// tour loads a draft order into it, and every step of this story is written
// against that draft. Putting the load on the first step would say it belongs
// to that step, and `start('story-setup', 'quantity')` would then skip it and
// point at rows that are not there.
export const storySetup: Case = {
  id: 'story-setup',
  title: 'A story that sets its own scene',

  proves:
    'The story onEnter runs before the first step exists and is waited for, ' +
    'and onLeave clears up after the last one. Chapters are step meta the ' +
    'sandbox reads back; Leko never looks at it.',

  mount(root) {
    const panel = html(`
      <div class="panel">
        <h2>Draft order</h2>
        <p class="hint" data-chapter></p>
        <table data-lines>
          <thead>
            <tr><th>Item</th><th>Qty</th></tr>
          </thead>
          <tbody data-rows>
            <tr><td colspan="2" class="hint">No draft loaded.</td></tr>
          </tbody>
        </table>
        <label>Quantity<input name="quantity" type="number" value="1" min="1" /></label>
        <button type="button" data-submit>Submit the draft</button>
      </div>
    `)
    root.append(panel)
    return () => panel.remove()
  },

  stories: (root) => {
    const at = (selector: string): HTMLElement => root.querySelector<HTMLElement>(selector)!
    const rows = () => at('[data-rows]')
    const caption = () => at('[data-chapter]')

    const empty = '<tr><td colspan="2" class="hint">No draft loaded.</td></tr>'
    const draft = `
      <tr><td>Enclosure, 2U</td><td>4</td></tr>
      <tr><td>Rail kit</td><td>4</td></tr>
    `

    return [
      {
        id: 'story-setup',

        // Nothing below runs until this settles — not the first step's own
        // onEnter, and not resolving its target. The 600ms is whatever the
        // application really does: a fetch, a seed, a session.
        onEnter: async () => {
          await new Promise((resolve) => setTimeout(resolve, 600))
          rows().innerHTML = draft
        },

        // The matching half, and the reason it is worth having one place for
        // this: the draft outlives every step, so no step could own taking it
        // away. `next` is the story about to start, and undefined when the
        // tour is simply over — teardown a following story needs is teardown
        // a handler can skip on.
        onLeave: (_story, next) => {
          caption().textContent = ''
          if (!next) rows().innerHTML = empty
        },

        // Chapters, entirely in application code. Leko carries `meta` and never
        // reads it, so grouping steps costs the library no concept at all.
        onStep: (step) => {
          caption().textContent = step ? `Chapter: ${String(step.meta?.chapter ?? '—')}` : ''
        },

        steps: [
          {
            id: 'lines',
            target: '[data-rows] tr',
            meta: { chapter: 'The draft' },
            message:
              'These rows did not exist when Start was pressed. The story ' +
              'loaded them and waited before anything was measured.',
          },
          {
            id: 'quantity',
            target: 'input[name="quantity"]',
            meta: { chapter: 'The draft' },
            message: 'Same chapter, read off step.meta by the page rather than by Leko.',
          },
          {
            id: 'submit',
            target: at('[data-submit]'),
            meta: { chapter: 'Sending it' },
            message: 'A new chapter. Press Next once more and the draft is cleared.',
          },
        ],
      },
    ]
  },
}
