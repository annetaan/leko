import { type Case, html } from '../case.js'

export const hiddenTarget: Case = {
  id: 'hidden-target',
  title: 'A target that is hidden rather than removed',
  proves:
    'An element that is on the page and not rendered is not a target. A region ' +
    'drops it and cuts its hole around what is there, instead of unioning an ' +
    'all-zero rect at the corner of the viewport and opening the corner of the ' +
    'page; and a step arriving at one waits, then ends, the way a step whose ' +
    'target was never there does. It also shows where that stops: hide the row ' +
    'a step is already drawn around and nothing happens, because the page is ' +
    'measured at the draw and is the application’s afterwards.',

  mount(root) {
    // The controls that have to work during a tour are inside the notice,
    // because the notice is the cutout. The one that puts everything back is
    // outside the panel and is reachable once no tour is running.
    const panel = html(`
      <div class="panel" data-panel>
        <h2>Export</h2>
        <div class="notice-rows">
          <div class="notice" data-notice>
            <span>Your export is ready.</span>
            <button type="button" data-reveal>Show the other row</button>
            <button type="button" data-hide>Hide this row</button>
          </div>
          <div class="notice" data-extra style="display: none">
            <span>It went to your inbox as well.</span>
          </div>
        </div>
        <p class="hint">
          <strong>A hole is cut where the region is.</strong>
          <code>start('hidden-half')</code> names both rows in one region, and
          the second row is not rendered. An element with no box reports a rect
          of all zeros, so a region that kept it would cut one hole from the
          corner of the viewport down to the far edge of this one — and open
          whatever the host keeps up there. <strong>Show the other row</strong>
          and then <strong>Next</strong> to see the union the region does cut.
        </p>
        <p class="hint">
          <strong>A step arriving at a hidden target waits, then ends.</strong>
          <code>start('hidden-row')</code> points at the second row alone. Start
          it while that row is hidden and the tour stops with
          <code>target-lost</code>, as it does for a target that was never
          there. Show the row and start it again and the step is drawn. Opening
          the panel a step needs is the step’s <code>onEnter</code>, which runs
          before the target is looked for.
        </p>
        <p class="hint">
          <strong>And that stops at the draw.</strong> With a step already drawn
          around this row, <strong>Hide this row</strong> takes its box away and
          the tour does nothing: the hole stays where it was cut, over the gap
          the row left. The page is measured when a step is drawn and is the
          application’s after that, so a target hidden in place is not a target
          that has gone. End the tour to reach <strong>Put everything
          back</strong>.
        </p>
      </div>
    `)

    const at = <T extends HTMLElement>(selector: string): T => panel.querySelector<T>(selector)!
    const notice = at('[data-notice]')
    const extra = at('[data-extra]')

    at('[data-reveal]').addEventListener('click', () => {
      extra.style.display = ''
    })
    at('[data-hide]').addEventListener('click', () => {
      // A style rather than a node, which is the whole of the boundary: the
      // row stays exactly where it is and stops having a box.
      notice.style.display = 'none'
    })

    const restore = html<HTMLButtonElement>(`
      <button type="button" data-restore>Put everything back</button>
    `)
    restore.addEventListener('click', () => {
      notice.style.display = ''
      extra.style.display = 'none'
    })
    const after = html(`<p class="hint">For once no tour is running.</p>`)

    root.append(panel, restore, after)
    return () => {
      panel.remove()
      restore.remove()
      after.remove()
    }
  },

  stories: [
    {
      id: 'hidden-half',
      steps: [
        {
          id: 'half-a-region',
          // Two elements in one region, so one hole around the two of them.
          // One of them has no box, so the hole is around the other alone.
          target: { elements: ['[data-notice]', '[data-extra]'], interactive: true },
          message:
            'One region, two rows, and only one of them rendered. The hole is ' +
            'cut around the row that is there. Show the other row, then Next.',
        },
        {
          id: 'both-rows',
          // The same region again. What it resolves to is read on an arrival,
          // and this step is one.
          target: { elements: ['[data-notice]', '[data-extra]'], interactive: true },
          message:
            'Both rows have boxes now, so the region unions the two of them ' +
            'and what sits between goes inside the hole with them.',
        },
      ],
    },
    {
      id: 'hidden-row',
      steps: [
        {
          id: 'the-other-row',
          // A selector, so the question is asked again — on every batch the
          // hunt hears while it runs, and once more as the deadline does. It
          // is the second that would find this row: showing it is a style, and
          // no node moves for the hunt to hear.
          target: { elements: '[data-extra]', interactive: true },
          message: 'The second row, which had to be rendered before this step could point at it.',
        },
      ],
    },
  ],
}
