import { at, type Case, html } from '../case.js'

// The two states a `position: sticky` target has, and the drift between them —
// DESIGN.md, **A sticky target is drawn in the state it is in, and there are
// two**. The filter bar under the hero is the same element in both: riding the
// page while the hero is still above it, held against the top of the screen
// once the page has gone past. The table head in the panel is the second kind
// of pinned, held against a scrollport that is not the viewport, and the case
// is here to be scrolled in both directions afterwards.
//
// The drift is the point of the first step rather than something the case
// hides. A hole cut while the bar rides is left behind at the pin, and the
// first step asks the viewer to scroll down far enough to watch that happen
// before scrolling back and pressing the control.

const rows = Array.from(
  { length: 40 },
  (_, i) => `<tr><td>INV-${2100 + i}</td><td>${(i % 7) + 1} × licence</td><td>Sent</td></tr>`,
).join('')

/** Far enough past the bar's pin that nothing of the hero is left on screen. */
const pastThePin = (): void => {
  const hero = at('.sticky-case .sticky-hero').getBoundingClientRect()
  window.scrollTo({ top: hero.bottom + window.scrollY + 240, behavior: 'instant' })
}

export const stickyHeader: Case = {
  id: 'sticky-header',
  title: 'A bar that pins, and a table head that pins inside a panel',
  proves:
    'A sticky target is drawn in flow while it rides and glued to its ' +
    'scrollport once it pins, so the hole stays under it on the side of the ' +
    'pin the step was drawn on — and drifts on the other, which is named ' +
    'rather than hidden.',

  mount(root) {
    const page = html(`
      <div class="tall-page sticky-case">
        <div class="sticky-hero">
          <h2>Invoices</h2>
          <p class="hint">
            Everything above the bar. Scroll past it and the bar stops at the
            top of the screen; scroll back and it comes with the page again.
          </p>
        </div>

        <div class="sticky-bar" data-bar>
          <button type="button" data-only-mine>Only mine</button>
          <button type="button">Unpaid</button>
          <button type="button">This quarter</button>
          <span class="sticky-count" data-count>40 invoices</span>
        </div>

        <p class="filler">
          The list below is long on purpose. There has to be enough of it that
          the bar spends most of the page pinned, and enough left under the
          panel that the page still scrolls once the panel is reached.
        </p>
        <p class="filler">
          Nothing here is a target. It is what goes past under the bar, which
          is the only way to see whether the hole went past with it.
        </p>

        <div class="panel">
          <h2>The same rows, in a panel that scrolls</h2>
          <p class="hint">
            This panel has been scrolled a little already, so its table head is
            held against the top of the panel rather than riding its rows.
          </p>
          <div class="sticky-panel" data-panel>
            <table class="sticky-table">
              <thead>
                <tr class="sticky-head" data-head>
                  <th>Number</th>
                  <th>Line</th>
                  <th><button type="button" data-sort>Status ↓</button></th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </div>

        <p class="filler">
          Room under the panel, so the page has somewhere left to go while the
          panel's own head stays where it is.
        </p>
        <div class="scroll-room"></div>
      </div>
    `)

    const count = page.querySelector('[data-count]')!
    const onlyMine = page.querySelector('[data-only-mine]')!
    onlyMine.addEventListener('click', () => {
      onlyMine.classList.toggle('on')
      count.textContent = onlyMine.classList.contains('on') ? '9 invoices' : '40 invoices'
    })
    const sort = page.querySelector('[data-sort]')!
    sort.addEventListener('click', () => {
      sort.textContent = sort.textContent?.includes('↓') ? 'Status ↑' : 'Status ↓'
    })

    root.append(page)
    return () => page.remove()
  },

  stories: [
    {
      id: 'sticky-header',
      // The page and the panel both start where the first step needs them,
      // however the last run left them.
      onEnter() {
        window.scrollTo({ top: 0, behavior: 'instant' })
        at('.sticky-case [data-panel]').scrollTo({ top: 0, behavior: 'instant' })
      },
      steps: [
        {
          id: 'riding',
          target: { elements: '[data-only-mine]', interactive: true },
          message:
            'The hero is still above the bar, so the bar is riding the page ' +
            'and this hole is cut in the page. Scroll down until the bar ' +
            'stops at the top of the screen: the hole stays behind at the ' +
            'pin, which is the drift two states leave. Scroll back up and ' +
            'press Only mine.',
        },
        {
          id: 'pinned',
          target: { elements: '[data-only-mine]', interactive: true },
          // The application takes the page past the pin before the step is
          // drawn, and the step is then drawn against where the page ended up
          // — DESIGN.md, **The target is resolved after `onEnter` returns**. A
          // scroll of Leko's own could not do this: it brings a target to the
          // middle of the port, and the middle of the port is never past a
          // pin. DESIGN.md, **"Past the pin" is not a second destination**.
          onEnter: pastThePin,
          message:
            'The same button, drawn with the bar already pinned — so this ' +
            'hole was cut on the viewport, the way a fixed target’s is. ' +
            'Scroll as far as you like: it stays under the bar. Press Only ' +
            'mine again.',
        },
        {
          id: 'in-a-panel',
          target: { elements: '[data-sort]', interactive: true },
          scroll: true,
          onEnter() {
            at('.sticky-case [data-panel]').scrollTo({ top: 260, behavior: 'instant' })
          },
          message:
            'This head is held against the top of the panel, not the screen, ' +
            'so its hole is glued to the panel’s scrollport. Scroll the rows ' +
            'inside the panel and then the page itself — the hole stays on ' +
            'the head through both. Press Status to sort.',
        },
      ],
    },
  ],
}
