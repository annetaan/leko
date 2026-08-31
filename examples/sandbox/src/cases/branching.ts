import { at, type Case, html } from '../case.js'
import type { LekoStory } from '@annetaan/leko'

// Four short stories rather than one long one with a jump in it. An intro, two
// branches out of it, and a summary both branches hand the tour to. A story is
// atomic — it runs from its first step or it does not run — so the thing the
// paths meet at is a story of its own rather than a step somebody points at.
//
// Every join here is a `next` on the story that ends. Nothing in this file
// starts a story: the buttons report what the user did and the stories say what
// follows them, which is the same division `awaits` and `reached()` already are.
//
// The footer is half the case: the counter restarts at 1/1 when the summary
// begins, because Leko counts within one story and never across a tour.
// “Step 4 of 6” is the application's arithmetic.
// What a branch assumes: nothing sent yet, and nothing read yet. Both are the
// page's own state rather than a variable this file keeps, which is also where
// the chosen path is kept.
const fresh = (): void => {
  ;(at('[data-checked]') as HTMLInputElement).checked = false
  const status = at('[data-status]')
  status.textContent = 'Nothing sent yet.'
  status.dataset['sent'] = 'no'
}

const intro = {
  id: 'intro',
  // Asked when `choose` advances, and asked again on every run. The page holds
  // which button was pressed, so nothing is written on this object and a second
  // run of the tour cannot inherit the first run's branch.
  next: () => (at('[data-panel]').dataset['path'] === 'quick' ? quick : careful),
  steps: [
    {
      id: 'total',
      target: '[data-total]',
      message: 'Where every path starts. Press Next.',
    },
    {
      id: 'choose',
      target: { elements: ['[data-careful]', '[data-quick]'], interactive: true },
      // A control would be a way past the choice, so this step has none and the
      // buttons report instead. Which story that opens is `next`'s answer.
      awaits: 'path-chosen',
      message:
        'Two ways on. Press either. The page says which was pressed and ' +
        'this story says what follows it, so watch the footer: the switch ' +
        'cuts rather than morphs, because two unrelated stories ' +
        'interpolating into each other would be a strange thing to watch.',
    },
  ],
} satisfies LekoStory

const summary = {
  // Where the paths meet. This used to be the last step of `intro`, and
  // both branches jumped to it by name. A story cannot be entered part
  // way through, so what two branches share is a story rather than a
  // step, and it says what it needs in its own `onEnter`.
  //
  // No `next`. The tour ends here, and running out of steps with nothing after
  // it is how a tour ends.
  id: 'summary',
  steps: [
    {
      id: 'summary',
      target: '[data-status]',
      message:
        'The rejoin, and a story of its own. Both branches name it in ' +
        '‘next’, so neither of them had to know how many steps came ' +
        'before it.',
    },
  ],
} satisfies LekoStory

const careful = {
  id: 'careful',
  next: summary,
  onEnter: fresh,
  steps: [
    {
      id: 'lines',
      // The box is the target, because ticking it is the work. The rows
      // it is a claim about get a cutout of their own rather than joining
      // the union, so the space between the two stays dimmed and stays
      // blocked.
      target: [{ elements: '[data-check]', interactive: true }, '[data-lines]'],
      message:
        'careful 1/2 in the footer. A branch counts from one, because ' +
        'the count belongs to the story that is running.',
      awaits: 'lines-checked',
    },
    {
      id: 'send',
      target: { elements: '[data-send]', interactive: true },
      message: 'Send it. That ends this branch, and the branch says what follows it.',
      awaits: 'order-sent',
    },
  ],
} satisfies LekoStory

const quick = {
  id: 'quick',
  next: summary,
  onEnter: fresh,
  steps: [
    {
      id: 'send',
      target: { elements: '[data-send]', interactive: true },
      message: 'quick 1/1. Same button, same signal, same rejoin, one step to get there.',
      awaits: 'order-sent',
    },
  ],
} satisfies LekoStory

export const branching: Case = {
  id: 'branching',
  title: 'A tour that branches',
  proves:
    'A branch is four short stories joined by ‘next’. Where the paths meet ' +
    'is a story too, because a story runs from its first step or it does not ' +
    'run. Pressing the way out on a branch ends the tour there, because only ' +
    'a story that ran to the end is followed.',

  mount(root, leko) {
    const panel = html(`
      <div class="panel" data-panel>
        <h2>Order review</h2>
        <div class="summary">
          <span class="summary-label">Total</span>
          <strong class="summary-value" data-total>¥2,640</strong>
          <span class="summary-note">Two lines, tax included</span>
        </div>
        <div class="choices">
          <button type="button" data-careful>Check every line</button>
          <button type="button" data-quick>Send it now</button>
        </div>
        <table class="grid" data-lines>
          <thead>
            <tr><th>Item</th><th>Qty</th></tr>
          </thead>
          <tbody>
            <tr><td>Enclosure, 2U</td><td>4</td></tr>
            <tr><td>Rail kit</td><td>4</td></tr>
          </tbody>
        </table>
        <label class="checked" data-check><input type="checkbox" data-checked /> I have read both lines</label>
        <button type="button" data-send>Send the order</button>
        <p class="hint" data-status data-sent="no">Nothing sent yet.</p>
      </div>
    `)
    const checkbox = panel.querySelector<HTMLInputElement>('[data-checked]')!
    const status = panel.querySelector<HTMLElement>('[data-status]')!

    // The page records which way it went and says that the choice was made.
    // Which story that opens is `intro`'s to answer, so neither branch is named
    // here and a third one would be added to `next` rather than to this file's
    // event listeners.
    for (const path of ['careful', 'quick'] as const) {
      panel.querySelector(`[data-${path}]`)!.addEventListener('click', () => {
        panel.dataset['path'] = path
        leko.reached('path-chosen')
      })
    }

    checkbox.addEventListener('change', () => {
      if (checkbox.checked) leko.reached('lines-checked')
    })

    panel.querySelector('[data-send]')!.addEventListener('click', () => {
      status.textContent = 'Order sent.'
      status.dataset['sent'] = 'yes'

      // One call, at the point the order goes. Both branches end on it, and
      // neither of them is named here.
      leko.reached('order-sent')
    })

    root.append(panel)
    return () => panel.remove()
  },

  // No `onStep`. The rejoin used to be written here, and it had to ask the page
  // whether the order really went, because an ending report cannot say whether
  // the tour ran out of steps or somebody pressed the way out. `next` is only
  // asked on the first of those, so the question is gone with the handler.
  stories: [intro, summary, careful, quick],
}
