import { type Case, html } from '../case.js'

// The step nothing in the application can report. A field reads "Ourselves" now
// and no code anywhere ran to say so — so this step ends with the control, and
// the one after it, which waits for a save, does not have one to end it with.
export const nextControl: Case = {
  id: 'next-control',
  title: 'Typing, and the control that follows it',
  proves:
    'A step with nothing for the application to report gets a control of its ' +
    'own, and validate guards it. The step waiting on a signal has neither.',

  mount(root, leko) {
    const panel = html(`
      <div class="panel">
        <h2>Project settings</h2>
        <label>Name<input name="name" type="text" value="Untitled" /></label>
        <button type="button" data-save>Save</button>
        <p class="hint" data-status>Nothing saved yet.</p>
      </div>
    `)
    const input = panel.querySelector<HTMLInputElement>('input[name="name"]')!
    const button = panel.querySelector<HTMLButtonElement>('[data-save]')!
    const status = panel.querySelector<HTMLElement>('[data-status]')!

    // Nothing is reported while the name is typed, deliberately. Wiring an
    // `input` listener up to the tour is the guessing the library exists to
    // avoid, and it is what leaves the typing step with no way to end.
    button.addEventListener('click', async () => {
      button.disabled = true
      status.textContent = 'Saving…'
      await new Promise((resolve) => setTimeout(resolve, 800))
      status.textContent = `Saved as “${input.value}”.`
      button.disabled = false

      leko.reached('project-renamed')
    })

    root.append(panel)
    return () => panel.remove()
  },

  stories: [
    {
      id: 'next-control',
      steps: [
        {
          id: 'name',
          target: { elements: 'input[name="name"]', interactive: true },
          message: 'Give the project a name of your own, then press Next.',
          // Pressing the control claims the moment has come and claims
          // nothing about the state behind it, which is why a step with a
          // control is the kind of step that can want a guard.
          validate: (el) => {
            const value = (el as HTMLInputElement).value.trim()
            return value !== '' && value !== 'Untitled'
          },
          // Beside the instruction, not instead of it: a second failed
          // attempt must still say what the step is asking for.
          error: 'Still “Untitled”. Type something else first.',
        },
        {
          id: 'save',
          target: { elements: '[data-save]', interactive: true },
          message: 'Now save it. No control on this one, and no guard. The save ends it.',
          awaits: 'project-renamed',
        },
        {
          id: 'saved',
          target: '[data-status]',
          message: 'The request came back, and that is what moved the story on.',
        },
      ],
    },
  ],
}
