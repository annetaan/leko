import { at, type Case, html } from '../case.js'
import type { LekoStory } from '@annetaan/leko'

// Four short stories rather than one long one with a jump in it. An intro, two
// branches out of it, and a summary both branches hand the tour to. A story is
// atomic — it runs from its first step or it does not run — so the thing the
// paths meet at is a story of its own rather than a step somebody points at.
//
// The footer is half the case: the counter restarts at 1/1 when the summary
// begins, because Leko counts within one story and never across a tour.
// “Step 4 of 6” is the application's arithmetic.
// What a branch assumes: nothing sent yet, and nothing read yet. Both are the
// page's own state rather than a variable this file keeps, which is also what
// the rejoin asks about.
const fresh = (): void => {
  ;(at('[data-checked]') as HTMLInputElement).checked = false
  const status = at('[data-status]')
  status.textContent = 'Nothing sent yet.'
  status.dataset['sent'] = 'no'
}

const intro = {
  id: 'intro',
  steps: [
    {
      id: 'total',
      target: '[data-total]',
      message: 'Where every path starts. Press Next.',
    },
    {
      id: 'choose',
      target: ['[data-careful]', '[data-quick]'],
      message:
        'Two ways on. Each button starts a story of its own, so watch ' +
        'the footer: the switch cuts rather than morphs, because two ' +
        'unrelated stories interpolating into each other would be a ' +
        'strange thing to watch.',
    },
  ],
} satisfies LekoStory

const summary = {
  // Where the paths meet. This used to be the last step of `intro`, and
  // both branches jumped to it by name. A story cannot be entered part
  // way through, so what two branches share is a story rather than a
  // step, and it says what it needs in its own `onEnter`.
  id: 'summary',
  steps: [
    {
      id: 'summary',
      target: '[data-status]',
      message:
        'The rejoin, and a story of its own. Both branches finished by ' +
        'calling start(‘summary’), so neither of them had to know how ' +
        'many steps came before it.',
    },
  ],
} satisfies LekoStory

const careful = {
  id: 'careful',
  onEnter: fresh,
  steps: [
    {
      id: 'lines',
      // The box is the target, because ticking it is the work. The rows
      // it is a claim about get a cutout of their own rather than joining
      // the union, so the space between the two stays dimmed and stays
      // blocked.
      target: '[data-check]',
      related: ['[data-lines]'],
      message:
        'careful 1/2 in the footer. A branch counts from one, because ' +
        'the count belongs to the story that is running.',
      awaits: 'lines-checked',
    },
    {
      id: 'send',
      target: '[data-send]',
      message: 'Send it. That ends this branch, and the page hands the tour back.',
      awaits: 'order-sent',
    },
  ],
} satisfies LekoStory

const quick = {
  id: 'quick',
  onEnter: fresh,
  steps: [
    {
      id: 'send',
      target: '[data-send]',
      message: 'quick 1/1. Same button, same signal, same rejoin, one step to get there.',
      awaits: 'order-sent',
    },
  ],
} satisfies LekoStory

export const branching: Case = {
  id: 'branching',
  title: 'A tour that branches',
  proves:
    'A branch is four short stories. Where the paths meet is a story too, ' +
    'because a story runs from its first step or it does not run.',

  mount(root, leko) {
    const panel = html(`
      <div class="panel">
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

    // Branching is a call the application makes. It knows which button was
    // pressed and which flow that opens, and Leko is told the same way a host
    // starts any story.
    panel.querySelector('[data-careful]')!.addEventListener('click', () => {
      leko.start(careful)
    })
    panel.querySelector('[data-quick]')!.addEventListener('click', () => {
      leko.start(quick)
    })

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

  stories: [intro, summary, careful, quick],

  // The branch is over and the order really went, so the tour starts the story
  // the paths meet at. `stop()` from the footer arrives here as well, which is
  // why the page's own state gets a say.
  //
  // `story` says which branch ended, and both are asked the same question, so
  // it goes unread here. A hook that lived on the story instead would have been
  // written twice — once per branch — and a third branch added later would
  // rejoin nowhere with nothing to say why.
  onStep: (root, leko) => {
    const sent = root.querySelector<HTMLElement>('[data-status]')!
    return (step, previous) => {
      if (step || previous?.id !== 'send' || sent.dataset['sent'] !== 'yes') return
      leko.start(summary)
    }
  },
}
