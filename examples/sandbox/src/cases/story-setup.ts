import type { LekoStory } from '@annetaan/leko'

import { at, html, type Case } from '../case.js'

/**
 * Which chapter each step of this story belongs to. A plain table, keyed by
 * step id, living with the page that draws the caption rather than with the
 * steps — which is what having no `meta` on a step is for.
 */
const CHAPTERS: Record<string, string> = {
  loading: 'The draft',
  lines: 'The draft',
  quantity: 'The draft',
  submit: 'Sending it',
}

// What a story assumes throughout, arranged once. The table is empty until the
// tour loads a draft order into it, and every step of this story is written
// against that draft. The load has a matching clear-up, and that is the half
// that decides where it goes — DESIGN.md, **The story's `onLeave` runs when the
// run ends, after the last step's**.
const EMPTY = '<tr><td colspan="2" class="hint">No draft loaded.</td></tr>'
const DRAFT = `
  <tr><td>Enclosure, 2U</td><td>4</td></tr>
  <tr><td>Rail kit</td><td>4</td></tr>
`
let loadDraft: () => Promise<void> = async () => {}

// #region The story
const story = {
  id: 'story-setup',

  // Runs before the first step is entered, and hands nothing back —
  // DESIGN.md, **Whatever a handler hands back is dropped**. A load the
  // first step needs is started by the step that waits for it.
  onEnter: () => {
    at('[data-chapter]').textContent = '—'
  },

  // The matching half, and the reason it is worth having one place for
  // this: the draft outlives every step, so no step could own taking it
  // away. `types.ts` says what `next` is here.
  onLeave: (_story, next) => {
    at('[data-chapter]').textContent = '—'
    if (!next) at('[data-rows]').innerHTML = EMPTY
  },

  steps: [
    {
      // No target, so the page goes under with no hole in it — DESIGN.md,
      // **A step that waits**.
      id: 'loading',
      message: 'Loading the draft order…',
      awaits: 'draft-loaded',
      // DESIGN.md, **The wait starts the work it waits for, and that
      // placement is the rule**.
      onEnter: () => void loadDraft(),
    },
    {
      id: 'lines',
      // Both rows, as one cutout. The sentence below says rows, and a
      // selector matching several takes the first, so naming the two
      // corners is what makes the screen agree with the message.
      target: { elements: ['[data-rows] tr:first-child', '[data-rows] tr:last-child'] },
      message:
        'These rows did not exist when Start was pressed. The step ' +
        'before this one loaded them and waited before anything was ' +
        'measured.',
    },
    {
      id: 'quantity',
      target: 'input[name="quantity"]',
      message: 'Same chapter, worked out from the step id by the page rather than by Leko.',
    },
    {
      id: 'submit',
      target: '[data-submit]',
      message: 'A new chapter. Press Next once more and the draft is cleared.',
    },
  ],
} satisfies LekoStory
// #endregion

export const storySetup: Case = {
  id: 'story-setup',
  title: 'A story that sets its own scene',

  proves:
    'The story onEnter runs before the first step exists, a step with no ' +
    'target holds the page while the load finishes, and onLeave clears up ' +
    'after the last one. Chapters are a table this page keys by step id; Leko ' +
    'has no concept of one.',

  mount(root, leko) {
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

    // #region What the page reports
    // The application's own function — DESIGN.md, **Signals and steps**.
    loadDraft = async () => {
      await new Promise((resolve) => setTimeout(resolve, 600))
      at('[data-rows]').innerHTML = DRAFT
      leko.reached('draft-loaded')
    }
    // #endregion

    return () => panel.remove()
  },

  stories: [story],

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
