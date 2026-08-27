import { type Case, html } from '../case.js'

export const nestedScroller: Case = {
  id: 'nested-scroller',
  title: 'A target inside its own scroller',
  proves:
    'The scrim has to live inside the thing that scrolls. Put it outside and the ' +
    'cutout slides off the target the moment the panel moves.',

  mount(root) {
    const rows = Array.from(
      { length: 40 },
      (_, i) =>
        `<li${i === 31 ? ' data-deep' : ''}>Row ${i + 1}${
          i === 31 ? ' — the one the tour points at' : ''
        }</li>`,
    ).join('')
    const panel = html(`
      <div class="panel">
        <h2>Activity</h2>
        <p class="hint">Scroll inside the list, not the page.</p>
        <div class="scroller"><ul class="rows">${rows}</ul></div>
      </div>
    `)
    root.append(panel)
    const deep = panel.querySelector<HTMLElement>('[data-deep]')
    deep?.scrollIntoView({ block: 'center' })
    return () => panel.remove()
  },

  stories: [
    {
      id: 'nested-scroller',
      steps: [
        {
          id: 'deep-row',
          interactive: true,
          target: '[data-deep]',
          message: 'Scroll the list. The cutout should stay on this row.',
        },
      ],
    },
  ],
}
