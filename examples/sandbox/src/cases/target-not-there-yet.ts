import type { LekoStory } from '@annetaan/leko'

import { type Case, html } from '../case.js'

// #region The story
const arrivesLate = {
  id: 'arrives-late',
  steps: [
    {
      id: 'notice',
      /**
       * Take the row away and put it back inside the window the arrival
       * gets. This runs before the target is looked for, so the step
       * arrives at a page that does not have its target — the same
       * situation as a step whose target a framework is rendering right
       * now, and staged the same way every time.
       *
       * The row is read here rather than closed over, because a case is
       * mounted and unmounted while the story object stays the same. It
       * has been dismissed if it is not there, and then this step is the
       * one below with a different selector: nothing is drawn, and the
       * tour stops when the 100ms is up.
       */
      onEnter: () => {
        const row = document.querySelector('[data-notice]')
        if (!row) return
        const gap = document.createComment('rendering')
        row.replaceWith(gap)
        setTimeout(() => gap.replaceWith(row), 60)
      },
      // A selector, so the question is asked again on every batch the hunt
      // hears while the row is away. A function handing back a node
      // captured when the story was written cannot answer any differently
      // the second time, and a target that may not be there yet is exactly
      // where that matters.
      target: { elements: '[data-notice]', interactive: true },
      message:
        'The row was not on the page when this step arrived, and the tour ' +
        'waited for it rather than giving up. Press Dismiss to see where ' +
        'that stops.',
    },
  ],
} satisfies LekoStory

const neverArrives = {
  id: 'never-arrives',
  steps: [
    {
      id: 'nothing-renders-this',
      // Nothing on this page matches, and nothing is going to.
      target: { elements: '[data-never-rendered]', interactive: true },
      message: 'You will not see this: nothing is drawn while the target is looked for.',
    },
  ],
} satisfies LekoStory
// #endregion

export const targetNotThereYet: Case = {
  id: 'target-not-there-yet',
  title: 'A target that has not turned up yet',
  proves:
    'A step arriving at a target the page does not have yet is given 100ms, ' +
    'and nothing at all is drawn while it waits. Rendered inside that window ' +
    'and the step is drawn as though nothing had happened; never rendered and ' +
    'the tour stops with target-lost. And that is the whole of it: once the ' +
    'step is drawn, taking the target away again does nothing.',

  mount(root) {
    // The one control that has to work during the tour is inside the notice,
    // because the notice is the cutout and the cutout is the only thing a
    // scrim leaves reachable. The one that puts the row back is outside the
    // panel, for once no tour is running.
    const panel = html(`
      <div class="panel">
        <h2>Notifications</h2>
        <div class="notice" data-notice>
          <span>Your export is ready.</span>
          <button type="button" data-dismiss>Dismiss</button>
        </div>
        <p class="hint">
          <strong>Nothing is drawn while the wait runs.</strong>
          <code>start('arrives-late')</code>, and the step’s own
          <code>onEnter</code> takes this row away and puts it back 60ms later.
          <code>onEnter</code> runs before the target is looked for, so that is
          exactly what an application still rendering looks like from here. For
          those first frames the page is not dimmed and nothing is blocked: the
          tour has drawn nothing, so there is nothing for a stray click to
          interrupt.
        </p>
        <p class="hint">
          <strong>Sixty milliseconds is inside the hundred</strong>, so the row
          is found and the step is drawn as though nothing had happened.
          Nothing is reported either — a wait this short is not one a host
          could act on, and the footer stays quiet.
        </p>
        <p class="hint">
          <strong>And it stops at the draw.</strong> Press
          <strong>Dismiss</strong> once the hole is cut and the tour does
          nothing at all: the hole stands over the gap the row left, the page
          stays blocked, and the step goes on. A drawn step watches nothing, so
          a row taken out of the page and a row hidden where it stands are the
          same thing here — <code>hidden-target</code> is the other half of the
          same rule. Dismiss goes with the row, so end the tour to reach
          <strong>Put the notice back</strong>.
        </p>
        <p class="hint">
          <strong>And when it never turns up.</strong>
          <code>start('never-arrives')</code> points at a selector nothing on
          this page matches. Nothing is drawn, 100ms goes by, and the footer
          says its target never turned up.
        </p>
      </div>
    `)

    const notice = panel.querySelector<HTMLElement>('[data-notice]')!
    // Where the row goes back to. A comment rather than an empty element, so
    // the gap the hole stands over is a real gap.
    const slot = document.createComment('notice')

    notice.querySelector('[data-dismiss]')?.addEventListener('click', () => {
      notice.replaceWith(slot)
    })

    const restore = html<HTMLButtonElement>(`
      <button type="button" data-restore>Put the notice back</button>
    `)
    restore.addEventListener('click', () => {
      if (slot.isConnected) slot.replaceWith(notice)
    })
    const after = html(`<p class="hint">For once no tour is running.</p>`)

    root.append(panel, restore, after)
    return () => {
      panel.remove()
      restore.remove()
      after.remove()
    }
  },

  stories: [arrivesLate, neverArrives],
}
