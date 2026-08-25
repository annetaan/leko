import { type Case, html } from '../case.js'

/**
 * Which chapter each step of this story belongs to. A plain table, keyed by
 * step id, living with the page that draws the caption rather than with the
 * steps — which is what having no `meta` on a step is for.
 */
const CHAPTERS: Record<string, string> = {
  lines: 'The draft',
  quantity: 'The draft',
  submit: 'Sending it',
}

// What a story assumes throughout, arranged once. The table is empty until the
// tour loads a draft order into it, and every step of this story is written
// against that draft. The load has a matching clear-up, and that is the half
// that decides where it goes: a story's `onLeave` runs when the run ends, and
// the first step's runs the moment the tour reaches the second, with the rows
// still in use.
export const storySetup: Case = {
  id: 'story-setup',
  title: 'A story that sets its own scene',

  proves:
    'The story onEnter runs before the first step exists and is waited for, ' +
    'and onLeave clears up after the last one. Chapters are a table this page ' +
    'keys by step id; Leko has no concept of one.',

  mount(root) {
    const panel = html(`
      <div class="panel">
        <h2>Draft order</h2>
        <p class="hint" data-chapter>&mdash;</p>
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
          caption().textContent = '—'
          if (!next) rows().innerHTML = empty
        },

        steps: [
          {
            id: 'lines',
            // Both rows, as one cutout. The sentence below says rows, and a
            // selector matching several takes the first, so naming the two
            // corners is what makes the screen agree with the message.
            target: ['[data-rows] tr:first-child', '[data-rows] tr:last-child'],
            message:
              'These rows did not exist when Start was pressed. The story ' +
              'loaded them and waited before anything was measured.',
          },
          {
            id: 'quantity',
            target: 'input[name="quantity"]',
            message: 'Same chapter, worked out from the step id by the page rather than by Leko.',
          },
          {
            id: 'submit',
            target: at('[data-submit]'),
            message: 'A new chapter. Press Next once more and the draft is cleared.',
          },
        ],
      },
    ]
  },

  // Chapters, entirely in application code: a table from step id to the name of
  // the group it belongs to, read where the caption is drawn. Leko grows no
  // concept for it, which is the whole point — a group with setup of its own
  // would stop being a label and become an object, and `index` would start
  // counting something else.
  //
  // Never blank, because a blank line has no height. This caption is written
  // after the first step has been measured, so growing the line here would push
  // the table down and leave the cutout above the rows it was drawn around.
  onStep: (root) => {
    const caption = root.querySelector<HTMLElement>('[data-chapter]')!
    return (step) => {
      caption.textContent = step ? `Chapter: ${CHAPTERS[step.id] ?? '—'}` : '—'
    }
  },
}
