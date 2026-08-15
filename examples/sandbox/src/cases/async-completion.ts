import { type Case, html } from '../case.js'

export const asyncCompletion: Case = {
  id: 'async-completion',
  title: 'Waiting on an async result',
  proves:
    'The step outlives the click. It ends when the request comes back, which is ' +
    'the only moment that means anything.',

  mount(root) {
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
      status.textContent = 'Saved. nextStep() belongs here, not on the click.'
      button.disabled = false
    })
    root.append(panel)
    return () => panel.remove()
  },

  stories: (root) => [
    {
      id: 'async-completion',
      steps: [
        {
          id: 'save',
          target: root.querySelector<HTMLElement>('[data-save]')!,
          message: 'Save your changes. The tour waits for the request, not the click.',
        },
      ],
    },
  ],
}
