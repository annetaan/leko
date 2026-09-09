import { type Case, html } from '../case.js'

// The same target, three ports deep, reached twice: once as one movement and
// once one port at a time. DESIGN.md argues the pair under **The page glides; a
// nested panel is set**, which is the default, and
// **`scroll: 'staged'` moves one port at a time, outermost first**, which is
// the other. Run the two stories in turn and the difference is the whole case:
// a direct scroll has the row already in place by the time its panel arrives,
// and a staged one moves the page, holds still, then moves the panel a viewer
// can watch it move in.
//
// This is where the beat between stages is judged by eye, the way the pace was
// judged in `scrolls-into-view.ts`, and DESIGN.md argues why it is not a
// setting under **A beat of 300ms between stages, and it is not a setting**.
//
// Each story puts the page and both panels back to the top before its first
// step, so the second story run is not starting from a page the first one
// already arranged.
const toTheTop = (): void => {
  window.scrollTo({ top: 0, behavior: 'instant' })
  for (const panel of document.querySelectorAll('.staged-case .scrolls')) {
    panel.scrollTo({ top: 0, behavior: 'instant' })
  }
}

const label = (i: number): string => {
  if (i === 31) return ' — the one the tour points at'
  if (i === 30) return ' — its neighbour, which the last step points at'
  return ''
}

const rows = Array.from(
  { length: 40 },
  (_, i) =>
    `<li${i === 31 ? ' data-deep-row' : ''}${i === 30 ? ' data-near-row' : ''}>Row ${i + 1}${label(
      i,
    )}</li>`,
).join('')

const deepStep = (scroll: 'direct' | 'staged', message: string) => ({
  id: 'the-deep-row',
  target: { elements: '[data-deep-row]', interactive: true },
  scroll,
  message,
})

const START =
  'The page is at the top and both panels are at the top of their own ' +
  'content. The row this story points at is three ports away: down the page, ' +
  'down the outer panel, and down the list inside it.'

export const stagedScroll: Case = {
  id: 'staged-scroll',
  title: 'A nested target, in one move or one port at a time',
  proves:
    'A staged scroll moves the ports one at a time, outermost first, with a ' +
    'beat between them, and the step is drawn when the last one lands; a port ' +
    'already holding the target is no stage at all; a scroll of your own ' +
    'during a stage stops the glide there and the step is drawn where the ' +
    'page is; and reduced motion sets every port outright, whichever mode was ' +
    'asked for. The direct story beside it reaches the same row in one ' +
    'movement, with both panels set before the page starts.',

  mount(root) {
    const page = html(`
      <div class="tall-page staged-case">
        <div class="panel" data-start>
          <h2>Where both stories start</h2>
          <p class="hint">
            Run either story from the footer. Each one puts the page and the
            panels back here first, so the two are watched from the same place.
          </p>
        </div>

        <p class="filler">
          Filler, and enough of it that the panel below starts under the fold
          whatever the screen is. Nothing above this point moves.
        </p>
        <div class="scroll-room"></div>

        <div class="panel" data-panel>
          <h2>Activity</h2>
          <p class="hint">
            This panel scrolls, and the list inside it scrolls too. The row the
            tour wants is a long way down the list, and the list is a long way
            down the panel.
          </p>
          <div class="deep-scroller scrolls">
            <p class="hint">
              The top of the panel's own scroll. The list starts below this.
            </p>
            <div class="scroll-filler"></div>
            <div class="scroller scrolls"><ul class="rows">${rows}</ul></div>
            <div class="scroll-filler"></div>
          </div>
        </div>

        <div class="scroll-room"></div>
      </div>
    `)
    root.append(page)
    return () => page.remove()
  },

  stories: [
    {
      id: 'one-movement',
      onEnter: toTheTop,
      steps: [
        { id: 'at-the-top', target: '[data-start]', message: START },
        deepStep(
          'direct',
          'One movement, and it was the page. Both panels were set outright ' +
            'before it started, so the row was already where it belongs by ' +
            'the time the panel came over the fold — the only scrolling ' +
            'anybody saw was the page going down to a panel that was already ' +
            'arranged. That is the default, and for a target one port deep it ' +
            'is the whole story.',
        ),
      ],
    },
    {
      id: 'one-at-a-time',
      onEnter: toTheTop,
      steps: [
        { id: 'at-the-top', target: '[data-start]', message: START },
        deepStep(
          'staged',
          'Three moves, outermost first, with a beat between them: the page ' +
            'went down to the panel, the panel scrolled to its list, and the ' +
            'list scrolled to this row. Nothing moved before the thing moving ' +
            'it was on screen, which is what a viewer would have to do here on ' +
            'their own. Scroll during any of it and that stage stops where you ' +
            'put it, and the step is drawn there rather than carrying on.',
        ),
        {
          id: 'the-row-next-door',
          target: { elements: '[data-near-row]', interactive: true },
          scroll: 'staged',
          message:
            'Nothing moved at all, and the same setting is on. The row next ' +
            'door is already showing in the list, the list is already showing ' +
            'in the panel and the panel is already on the screen, so all ' +
            'three ports had nothing to do and none of them became a stage. A ' +
            'port that already holds the target is left alone whichever mode ' +
            'is asked for, which is why a staged scroll is worth turning on ' +
            'for a whole story rather than one step.',
        },
      ],
    },
  ],
}
