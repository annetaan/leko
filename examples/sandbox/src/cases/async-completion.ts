import { type Case, html } from '../case.js'

// The second constraint, in the smallest case that shows it. The step does not
// advance because the button was clicked. It advances because the request the
// click started came back, and the application said so.
export const asyncCompletion: Case = {
  id: 'async-completion',
  title: 'Waiting on an async result',
  proves:
    'The step outlives the click. It ends when the request comes back, which is ' +
    'the only moment that means anything.',

  mount(root, leko) {
    const panel = html(`
      <div class="panel">
        <h2>Publish</h2>
        <p>Saving takes a moment on purpose.</p>
        <button type="button" data-save>Save changes</button>
        <p class="hint" data-status>Not saved.</p>
      </div>
    `)
    const button = panel.querySelector<HTMLButtonElement>('[data-save]')!
    const status = panel.querySelector<HTMLElement>('[data-status]')!
    button.addEventListener('click', async () => {
      button.disabled = true
      status.textContent = 'Saving…'
      await new Promise((resolve) => setTimeout(resolve, 1200))
      status.textContent = 'Saved.'
      button.disabled = false
      // Here rather than at the top of the handler. The click is somebody
      // trying; this is the thing having happened. The call names what
      // happened and never which step should move.
      leko.reached('changes-saved')
    })
    root.append(panel)
    return () => panel.remove()
  },

  stories: [
    {
      id: 'async-completion',
      steps: [
        {
          id: 'save',
          target: { elements: '[data-save]', interactive: true },
          message: 'Save your changes. The tour waits for the request, not the click.',
          // So there is no next control on this step, and no way past the work
          // it exists to make somebody do. Which steps get one is derived from
          // this and cannot be configured.
          awaits: 'changes-saved',
        },
        {
          id: 'saved',
          target: '[data-status]',
          message:
            'The hole moved when the request came back, 1200ms after the ' +
            'press. Nothing was listening to the click.',
        },
      ],
    },
  ],
}
