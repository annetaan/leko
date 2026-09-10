import { type Case, html } from '../case.js'

// A target the viewer would have to go and find — DESIGN.md, **Bringing a
// target into view**, is why a step does not go and get it unless asked. So the
// instance here says `scroll: true`, and every step below rides that one
// setting. What the steps prove is what happens around the destination: nothing
// at all where the cutout is already showing, and the two places a target is
// not centred — more than half a scrollport tall, which DESIGN.md argues under
// **A target more than half the port tall leads with its top edge, put at the
// middle**, and against the end of a scrollport where the content runs out
// first.
//
// It is also the case to watch the order on, which DESIGN.md argues under
// **The scroll finishes before the step is drawn, never both at once**;
// `spike/a-smooth-scroll-settling/` has how far off a morph alongside
// a glide lands. This is the case the glide's pace was set by eye on. Scroll
// during it and it stops where you put the page. The panel in the fifth step is
// set rather than glided — DESIGN.md, **The page glides; a nested panel is
// set**.
//
// A step that does not scroll is `message-sides.ts` and not here. Off is the
// default, and the pathology it leaves is the one that opened this issue: the
// hole is cut below the screen and the message rides it there, next control and
// all, so a step like that in this case would be indistinguishable from a tour
// that had stopped working. That the message goes off screen instead of docking,
// whenever no side of the hole has room on screen, is a gap of Leko's own rather
// than something a case should be built around — issue #140.
export const scrollsIntoView: Case = {
  id: 'scrolls-into-view',
  title: 'A step that goes and gets its target',
  proves:
    'A step told to scroll brings its cutout to the middle of every ' +
    'scrollport carrying the target, before anything is measured: the page ' +
    'glides and the step is drawn when it stops, nested panels are set ' +
    'outright, a cutout already showing is left alone, and one that cannot be ' +
    'centred leads with its top edge at the middle — more than half a ' +
    'scrollport tall — or stops where the scrollport runs out of content. A ' +
    'region of several elements is brought in by its hole, not its first ' +
    'element.',

  options: { scroll: true },

  mount(root) {
    const rows = Array.from(
      { length: 40 },
      (_, i) =>
        `<li${i === 31 ? ' data-deep' : ''}${i === 39 ? ' data-last-row' : ''}>Row ${i + 1}${
          i === 31 ? ' — the one the tour points at' : ''
        }${i === 39 ? ' — the last one there is' : ''}</li>`,
    ).join('')
    const page = html(`
      <div class="tall-page scroll-case">
        <div class="panel" data-top>
          <h2>Where the viewer already is</h2>
          <p class="hint">
            The tour starts here, on screen, and the first step moves nothing.
          </p>
        </div>

        <p class="filler">
          Everything from here to the card below is filler, and there is enough
          of it that the card starts well past the fold whatever the screen.
        </p>
        <div class="scroll-room"></div>

        <div class="milestone" data-far>
          <h3>The card past the fold</h3>
          <p class="hint">
            Nothing about this card is special. It is simply not on the screen
            when the step arrives, so the step goes and gets it.
          </p>
        </div>

        <div class="scroll-room"></div>

        <div class="milestone" data-pair-upper>
          <h3>Two cards, one hole</h3>
          <p class="hint">
            This card and the one below are named in one region, so one hole is
            cut around both, gap included.
          </p>
        </div>

        <div class="scroll-gap"></div>

        <div class="milestone" data-pair-lower>
          <h3>The other end of the hole</h3>
          <p class="hint">
            Brought in by the first card alone, this one would sit half the gap
            below where it is — and past the fold, given a wide enough gap.
          </p>
        </div>

        <div class="scroll-room"></div>

        <section class="panel tall-section" data-tall>
          <h2>A section taller than the screen</h2>
          <p class="hint">
            Centring this one would leave the message nowhere to go, so its top
            edge goes to the middle of the screen instead and the message takes
            the half above it. The rest of the section runs off the bottom,
            which is no loss: nobody takes in a section this tall at a glance.
          </p>
        </section>

        <div class="scroll-room"></div>

        <div class="panel">
          <h2>Activity</h2>
          <p class="hint">
            The row the tour wants is a long way down this list, and the list is
            a long way down the page.
          </p>
          <div class="scroller"><ul class="rows">${rows}</ul></div>
        </div>

        <div class="scroll-room"></div>

        <div class="milestone" data-bottom>
          <h3>The last thing on the page</h3>
          <p class="hint">
            Nothing follows this card, which is what the last step is about:
            centring it would mean scrolling past the end of the page, so the
            page goes as far as it goes and the card comes to rest below the
            middle.
          </p>
        </div>
      </div>
    `)
    root.append(page)
    return () => page.remove()
  },

  stories: [
    {
      id: 'scrolls-into-view',
      steps: [
        {
          id: 'already-here',
          target: '[data-top]',
          message:
            'The setting is on for every step of this story, and this step ' +
            'still moved nothing: the cutout was already showing in full, and ' +
            'a page the viewer has settled is not re-centred because a step ' +
            'happens to point at something already on it.',
        },
        {
          id: 'far-below',
          target: '[data-far]',
          message:
            'This card was past the fold, and it is now in the middle of the ' +
            'screen rather than against the edge it came over. The page ' +
            'glided and nothing was drawn until it stopped — watch the ' +
            "previous hole ride the page on the way. The glide is Leko's own " +
            'and grows with the distance, slowly enough to take in what ' +
            'passes: scroll while it runs and it stops where you put the ' +
            'page, and the step is drawn there.',
        },
        {
          id: 'one-hole-two-cards',
          target: { elements: ['[data-pair-upper]', '[data-pair-lower]'] },
          message:
            'One region of two cards, so one hole around both, and it is the ' +
            'hole that is at the middle of the screen: the upper card sits ' +
            'above the middle and the lower one below it by the same amount. ' +
            'The hole is what the step is about, so the hole is what is ' +
            'brought in — not the first card, with the second left to hang ' +
            'wherever the gap puts it.',
        },
        {
          id: 'tall-section',
          target: '[data-tall]',
          message:
            'More than half the screen tall, so this one leads with its top ' +
            'edge rather than being centred: the taller a hole is, the less ' +
            'room there is on either side of it for this box, and a hole ' +
            'taller than the screen leaves none. A top edge at the middle ' +
            'always leaves exactly half a screen for the message, whatever ' +
            'the target does below it.',
        },
        {
          id: 'deep-row',
          target: { elements: '[data-deep]', interactive: true },
          message:
            'Two ports moved: the list, set outright, and the page, glided. ' +
            'Innermost first, because scrolling the list moves the row inside ' +
            'the page too. The list is set rather than glided so that the ' +
            "movement you follow is the page's alone: the list is not on " +
            'screen while it scrolls, so nothing of its own is missed.',
        },
        {
          id: 'the-last-row',
          target: { elements: '[data-last-row]', interactive: true },
          message:
            'The last row, at the bottom of the list rather than the middle ' +
            'of it: centring it would mean scrolling the list past its own ' +
            'end, and where the content runs out is where the row stops. The ' +
            'page did not move at all — the row is still whole on screen, and ' +
            'a port that already holds the cutout is left alone.',
        },
        {
          id: 'at-the-end',
          target: '[data-bottom]',
          message:
            'The same thing again, one port out: this card is the end of the ' +
            'page, so the page has run out of scroll before the card reaches ' +
            'the middle. It stops where the content stops, which is also why ' +
            'the tour ends with nothing left below it.',
        },
      ],
    },
  ],
}
