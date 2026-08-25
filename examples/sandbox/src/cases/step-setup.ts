import { type Case, html } from '../case.js'

// The step's target does not exist when the story starts. `onEnter` opens the
// section that holds it and waits for the fetch behind it, and only then does
// Leko look for the element. Resolving first would find nothing and lose the
// step before the application had a chance to build it.
export const stepSetup: Case = {
  id: 'step-setup',
  title: 'A step that sets its own scene',

  proves:
    'onEnter builds the state the step assumes and the target is resolved ' +
    'after it settles. The curtain over that wait wears the step’s own ' +
    'words rather than the instance’s. onLeave puts the panel back on the ' +
    'way out.',

  mount(root) {
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
    return () => panel.remove()
  },

  stories: (root) => {
    const at = (selector: string): HTMLElement => root.querySelector<HTMLElement>(selector)!
    const details = () => at('[data-details]')

    return [
      {
        id: 'step-setup',
        steps: [
          {
            id: 'intro',
            target: at('[data-open]'),
            message:
              'The postcode field is inside this section, and the section is ' +
              'closed. Press Next and watch who opens it.',
          },
          {
            id: 'postcode',
            // A selector, so this is genuinely resolved after `onEnter` rather
            // than captured while the story was being built.
            target: 'input[name="postcode"]',
            message: 'The tour opened the section, waited, and then measured.',

            // The instance sets a general “Setting the step up…”, which is all a
            // host can say about a wait it does not recognise. This step knows,
            // because the handler being waited for is written right below it,
            // and what it says beats the general one.
            curtainLabel: 'Reading the address off the account…',

            // Everything a step assumes, arranged in one place. The 700ms is
            // whatever the application actually does here — a request, an
            // animation — and the step waits for it.
            onEnter: async () => {
              details().hidden = false
              await new Promise((resolve) => setTimeout(resolve, 700))
              at('input[name="postcode"]').setAttribute('value', '150-0001')
            },

            // The matching half. Without it the section stays open for the rest
            // of the tour, and the user is left with a page the tour rearranged.
            onLeave: () => {
              details().hidden = true
            },
          },
          {
            id: 'confirm',
            target: at('[data-confirm]'),
            message: 'And the section is closed again, because onLeave closed it.',
          },
        ],
      },
    ]
  },
}
