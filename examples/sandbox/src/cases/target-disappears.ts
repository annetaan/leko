import { type Case, html } from '../case.js'

export const targetDisappears: Case = {
  id: 'target-disappears',
  title: 'The target leaves the page',
  proves:
    'A lost target is given two seconds to come back, under a curtain. Bring ' +
    'it back in time and nothing happened. Leave it and the tour stops.',

  mount(root) {
    const panel = html(`
      <div class="panel">
        <h2>Notifications</h2>
        <div class="notice" data-notice>
          <span>Your export is ready.</span>
          <button type="button" data-dismiss>Dismiss</button>
        </div>
        <p class="hint">
          Dismissing removes the element the current step points at. The tour
          waits two seconds for it before giving up, because a framework
          re-rendering over a step takes its target away for a frame.
        </p>
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

  stories: () => [
    {
      id: 'target-disappears',
      steps: [
        {
          id: 'notice',
          // A selector rather than the element. An element cannot be found
          // again once a framework has replaced it, so this is the shape a step
          // wants wherever a target might be re-rendered.
          target: '[data-notice]',
          message:
            'Here is your export. Dismiss it, then either bring it back within ' +
            'two seconds or watch the tour give up.',
        },
      ],
    },
  ],
}
