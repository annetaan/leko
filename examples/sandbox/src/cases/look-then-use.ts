import { type Case, html } from '../case.js'

// Both halves of what a cutout means, one after the other. A hole always shows
// what is under it. Whether the pointer and Tab get there is the step's to say,
// and the answer is no unless it says so.
export const lookThenUse: Case = {
  id: 'look-then-use',
  title: 'A hole to read, then a hole to use',
  proves:
    'A cutout shows what is under it. Handing it over is a second thing, and a ' +
    'step that only explains something should not. Both counters below stay at ' +
    'zero for the whole of step 1 however hard the buttons are pressed.',

  mount(root) {
    const panel = html(`
      <div class="panel">
        <h2>Your plan</h2>

        <div class="summary" data-plan>
          <span class="summary-label">Team, billed yearly</span>
          <strong class="summary-value">1,200 USD</strong>
          <span class="summary-note">
            <button type="button" data-change>Change plan</button>
          </span>
        </div>

        <label>
          <span>Name on the invoice</span>
          <input type="text" data-name placeholder="Your name" />
        </label>

        <p class="hint" data-counts></p>
        <p class="hint">
          Step 1 points at the card and does not open it. Press <em>Change
          plan</em> as often as you like and the counter stays at zero: the tour
          is what takes the click. Tab is held to the same answer, so the ring
          is the message and the way out and nothing else.
        </p>
        <p class="hint">
          Step 2 declares <code>interactive</code>, and the field is yours.
          Type into it, and Tab round from it to see the ring open up.
        </p>
      </div>
    `)

    const counts = panel.querySelector<HTMLElement>('[data-counts]')!
    const change = panel.querySelector<HTMLElement>('[data-change]')!
    const name = panel.querySelector<HTMLInputElement>('[data-name]')!

    // Counted rather than described. A number that stays at zero while somebody
    // hammers the button is the whole of the claim, and it is the one thing a
    // screenshot of a dimmed page cannot show.
    let clicks = 0
    let keys = 0
    const report = (): void => {
      counts.textContent = `Clicks that reached the card: ${clicks}. Keystrokes that reached the field: ${keys}.`
    }
    change.addEventListener('click', () => {
      clicks += 1
      report()
    })
    name.addEventListener('input', () => {
      keys += 1
      report()
    })
    report()

    root.append(panel)
    return () => panel.remove()
  },

  stories: [
    {
      id: 'look-then-use',
      steps: [
        {
          id: 'plan',
          // No `interactive`, which is the default and the point. The card is
          // lit because the sentence is about it, and a click on it now would
          // change the very thing being explained.
          target: '[data-plan]',
          message:
            'This is what you are paying. Try pressing Change plan — the ' +
            'counter below stays at zero, because this step is explaining ' +
            'rather than asking.',
        },
        {
          id: 'name',
          target: '[data-name]',
          // The other half. The step wants something done to the page, so it
          // says so, and the field takes the typing.
          interactive: true,
          message: 'Now type a name. This step opened its hole, so the field is yours.',
          validate: (el) => (el as HTMLInputElement).value.trim() !== '',
          error: 'Nothing typed yet.',
        },
      ],
    },
  ],
}
