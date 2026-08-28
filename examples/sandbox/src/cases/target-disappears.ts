import { type Case, html } from '../case.js'

export const targetDisappears: Case = {
  id: 'target-disappears',
  title: 'The target leaves the page',
  proves:
    'A lost target is given a moment to come back, and nothing on screen ' +
    'changes while it does. Back in time and nothing happened. Gone for good ' +
    'and the tour stops. A node swapped for an identical one in the same turn ' +
    'is not a loss at all.',

  mount(root) {
    // Every control that has to work during the tour is inside the notice,
    // because the notice is the cutout and the cutout is the only thing a
    // scrim leaves reachable. A button outside it is a button nobody can
    // press.
    const panel = html(`
      <div class="panel">
        <h2>Notifications</h2>
        <div class="notice" data-notice>
          <span>Your export is ready.</span>
          <button type="button" data-dismiss>Dismiss</button>
          <button type="button" data-blink>Dismiss for a moment</button>
          <button type="button" data-rerender>Re-render</button>
        </div>
        <p class="hint">
          Each of these takes away the element the step points at.
          <strong>Dismiss</strong> takes it for good: the tour waits 100ms and
          then stops. <strong>Dismiss for a moment</strong> puts it back inside
          that window, and the tour carries on with nothing reported.
          <strong>Re-render</strong> swaps it for an identical node in one turn,
          which is what a framework really does. The selector still matches, so
          there is no wait at all.
        </p>
        <p class="hint">
          Watch the hole rather than the bar. Nothing is redrawn while the wait
          runs: the hole stands over the gap the notice left, and the tour goes
          on reading as running, because a wait this short is not one a host
          could act on.
        </p>
        <button type="button" data-restore>Put the notice back</button>
        <p class="hint">
          For after the tour has given up. The scrim is gone by then, which is
          why this one is reachable and the three above it are not.
        </p>
      </div>
    `)

    // Which node the notice is changes under a re-render, so the handlers read
    // it rather than close over the one that was there at mount.
    let notice = panel.querySelector<HTMLElement>('[data-notice]')!
    const placeholder = document.createComment('notice')
    const take = () => notice.replaceWith(placeholder)
    const put = () => placeholder.replaceWith(notice)

    const wire = (el: HTMLElement) => {
      el.querySelector('[data-dismiss]')?.addEventListener('click', take)
      el.querySelector('[data-blink]')?.addEventListener('click', () => {
        take()
        // Inside the retry, and only just. The notice is gone for about four
        // frames, which is long enough to see and short enough to survive.
        setTimeout(put, 60)
      })
      el.querySelector('[data-rerender]')?.addEventListener('click', () => {
        const fresh = notice.cloneNode(true) as HTMLElement
        notice.replaceWith(fresh)
        notice = fresh
        wire(fresh)
      })
    }
    wire(notice)
    panel.querySelector('[data-restore]')?.addEventListener('click', put)

    root.append(panel)
    return () => panel.remove()
  },

  stories: [
    {
      id: 'target-disappears',
      steps: [
        {
          id: 'notice',
          interactive: true,
          // A selector, so the question is asked again while the node is gone.
          // A function closing over one node captured up front cannot answer
          // any differently the second time, so this is the shape a step
          // wants wherever a target might be re-rendered.
          target: '[data-notice]',
          message:
            'Here is your export. Take it away with any of the three controls ' +
            'beside it and watch what the tour does about it.',
        },
      ],
    },
  ],
}
