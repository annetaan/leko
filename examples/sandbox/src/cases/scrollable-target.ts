import { type Case, html } from '../case.js'

// The case that made the scrim stop blocking with its own element — DESIGN.md,
// **Do not go back to blocking with the scrim itself**. This box used to sit
// still under the wheel while `elementFromPoint` insisted the hole was open.
export const scrollableTarget: Case = {
  id: 'scrollable-target',
  title: 'The target is the thing that scrolls',
  proves:
    'A cutout has to hand over the wheel as well as clicks and keys. Scrolling is ' +
    'the one interaction a hole does not open on its own — the blocking has to be ' +
    'shaped so that nothing is over the target at all.',

  mount(root) {
    const clauses = Array.from(
      { length: 12 },
      (_, i) =>
        `<p>${i + 1}. ${
          i === 11
            ? 'You have reached the end. This is the line the step is waiting for.'
            : 'Nothing in this clause matters; it is here to make the box longer than it is tall.'
        }</p>`,
    ).join('')

    const panel = html(`
      <div class="panel">
        <h2>Before you continue</h2>
        <p class="hint">The step advances once this box is scrolled to the bottom.</p>
        <div class="scroller" tabindex="0" data-terms>${clauses}</div>
        <p class="hint" data-progress></p>
        <p class="hint">
          Start the tour and scroll this box with the wheel, and with the arrow
          keys after clicking it. Both reach it, on every engine, and the page
          behind stays put. Try it with the window short enough for the page
          itself to scroll as well — that is the arrangement that used to send
          the wheel to the page instead.
        </p>
      </div>
    `)
    const terms = panel.querySelector<HTMLElement>('[data-terms]')!
    const progress = panel.querySelector<HTMLElement>('[data-progress]')!

    const report = (): void => {
      const left = Math.max(0, terms.scrollHeight - terms.clientHeight - terms.scrollTop)
      progress.textContent = left > 2 ? `${Math.round(left)}px still to scroll.` : 'At the bottom.'
    }
    terms.addEventListener('scroll', report)

    root.append(panel)
    // After it is in the document, or there is no layout to measure and the box
    // reports itself already read.
    report()
    return () => panel.remove()
  },

  stories: [
    {
      id: 'scrollable-target',
      steps: [
        {
          id: 'read-the-terms',
          target: { elements: '[data-terms]', interactive: true },
          message: 'Read to the end of the box. Scroll it however you like.',
          // The application's own verdict again: not "did they scroll" but "are they
          // at the bottom", which is what was actually asked of them.
          validate: (el) => el.scrollTop + el.clientHeight >= el.scrollHeight - 2,
          error: 'Not at the bottom yet.',
        },
      ],
    },
  ],
}
