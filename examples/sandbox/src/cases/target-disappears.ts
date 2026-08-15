import { type Case, html } from '../case.js'

export const targetDisappears: Case = {
  id: 'target-disappears',
  title: 'The target leaves the page',
  proves:
    'What a tour does when its target is gone. Undefined behaviour here is the ' +
    'first thing a real application will hit, so it is a case before it is a bug.',

  mount(root) {
    const panel = html(`
      <div class="panel">
        <h2>Notifications</h2>
        <div class="notice" data-notice>
          <span>Your export is ready.</span>
          <button type="button" data-dismiss>Dismiss</button>
        </div>
        <p class="hint">Dismissing removes the element the current step points at.</p>
        <button type="button" data-restore>Bring it back</button>
      </div>
    `)
    const notice = panel.querySelector<HTMLElement>('[data-notice]')!
    const placeholder = document.createComment('notice')
    panel.querySelector('[data-dismiss]')?.addEventListener('click', () => {
      notice.replaceWith(placeholder)
    })
    panel.querySelector('[data-restore]')?.addEventListener('click', () => {
      placeholder.replaceWith(notice)
    })
    root.append(panel)
    return () => panel.remove()
  },

  stories: (root) => [
    {
      id: 'target-disappears',
      steps: [
        {
          id: 'notice',
          target: root.querySelector<HTMLElement>('[data-notice]')!,
          message: 'Here is your export. Now dismiss it and watch what the tour does.',
        },
      ],
    },
  ],
}
