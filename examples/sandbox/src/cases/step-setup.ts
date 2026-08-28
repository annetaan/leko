import { at, html, type Case } from '../case.js'

// The step's target does not exist when the story starts. The step before it
// opens the section, starts the fetch behind it, and waits for the application
// to report that the fetch came back. Only then does Leko look for the element.
export const stepSetup: Case = {
  id: 'step-setup',
  title: 'A step that sets its own scene',

  proves:
    'A wait is a step of its own: no target, its own words on the covered ' +
    'page, and the signal it declares is what ends it. onLeave puts the panel ' +
    'back on the way out.',

  mount(root, leko) {
    const panel = html(`
      <div class="panel">
        <h2>Delivery</h2>
        <p class="hint">Address is filled in once. The section starts closed.</p>
        <button type="button" data-open>Open delivery details</button>
        <div data-details hidden>
          <label>Postcode<input name="postcode" type="text" value="" /></label>
          <p class="hint" data-loaded>Loaded from the account.</p>
        </div>
        <button type="button" data-confirm>Confirm</button>
      </div>
    `)
    const details = panel.querySelector<HTMLElement>('[data-details]')!
    panel.querySelector<HTMLButtonElement>('[data-open]')!.addEventListener('click', () => {
      details.hidden = !details.hidden
    })
    root.append(panel)

    // The application's own function, written where the application would write
    // it. It reports what happened when it happened, and knows nothing about
    // which step is showing.
    loadAddress = async () => {
      await new Promise((resolve) => setTimeout(resolve, 700))
      at('input[name="postcode"]').setAttribute('value', '150-0001')
      leko.reached('address-loaded')
    }

    return () => panel.remove()
  },

  stories: [
    {
      id: 'step-setup',
      steps: [
        {
          id: 'intro',
          target: '[data-open]',
          message:
            'The postcode field is inside this section, and the section is ' +
            'closed. Press Next and watch who opens it.',
        },
        {
          // A step with nothing to point at. The page goes under with no hole
          // in it, this message is what it says, and `awaits` is what ends it.
          // Leko waits for no handler, so the wait is written here instead.
          id: 'reading',
          message: 'Reading the address off the account…',
          awaits: 'address-loaded',

          // The wait starts the work it waits for. Started anywhere earlier and
          // the report could land before the tour got here, and a signal is
          // never saved for a step that has not arrived.
          onEnter: () => {
            at('[data-details]').hidden = false
            void loadAddress()
          },
        },
        {
          id: 'postcode',
          // A selector, so this is genuinely resolved after the step above
          // rather than captured while the story was being built.
          target: 'input[name="postcode"]',
          message: 'The tour opened the section, waited, and then measured.',

          // The matching half. Without it the section stays open for the rest
          // of the tour, and the user is left with a page the tour rearranged.
          onLeave: () => {
            at('[data-details]').hidden = true
          },
        },
        {
          id: 'confirm',
          target: '[data-confirm]',
          message: 'And the section is closed again, because onLeave closed it.',
        },
      ],
    },
  ],
}

/** Set by {@link stepSetup.mount}, which is where the instance to report to is. */
let loadAddress: () => Promise<void> = async () => {}
